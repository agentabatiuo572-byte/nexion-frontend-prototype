// Loopback preview transport. Authentication/ready/ping remain owned by the probe protocol.
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

export function createPrototypeRealtime({state,messages,fixtureFor}) {
  const wss=new WebSocketServer({noServer:true,maxPayload:64*1024});
  const peers=new Set();
  let route;
  const send=(socket,frame)=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(frame));};
  const presence=peer=>{if(peer.ready&&peer.watched)send(peer.socket,{type:'presence',conversationNo:peer.watched,online:state.realtimeState!=='offline',typing:false,expiresIn:5000});};
  const changed=()=>{
    const event={type:'event',eventId:'demo-'+randomUUID()};
    for(const peer of peers)if(peer.ready)send(peer.socket,event);
  };
  return {
    routeWebSocket:async(matcher,handler)=>{route={matcher,handler};},
    attach(server) {
      server.on('upgrade',(request,socket,head)=>{
        const url=new URL(request.url,'http://'+request.headers.host);
        // No external origins or unrelated sockets can use the authenticated local preview.
        if(!route?.matcher(url)||request.headers.origin&&request.headers.origin!==url.origin) {
          socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
        }
        wss.handleUpgrade(request,socket,head,ws=>{
          const peer={socket:ws,ready:false,watched:null};peers.add(peer);
          let onMessage;
          route.handler({
            onMessage:handler=>{onMessage=handler;},
            close:({code,reason})=>ws.close(code,reason),
            send:message=>{
              if(JSON.parse(message).type==='ready') {
                if(state.realtimeState==='reconnecting'){ws.close(1012,'DEMO_RECONNECTING');return;}
                peer.ready=true;
              }
              if(ws.readyState===WebSocket.OPEN)ws.send(message);
            },
          });
          ws.on('close',()=>peers.delete(peer));
          ws.on('error',()=>{});
          ws.on('message',async bytes=>{
            // The existing probe checks the first auth frame and consumes a single-use ticket.
            if(!peer.ready){onMessage(bytes);return;}
            let frame;
            try{frame=JSON.parse(String(bytes));}catch{ws.close(1008,'INVALID_FRAME');return;}
            if(frame?.type==='watch') {peer.watched=typeof frame.conversationNo==='string'?frame.conversationNo:null;presence(peer);return;}
            if(frame?.type==='typing')return; // User typing never impersonates the demo agent.
            if(frame?.type!=='command'){onMessage(bytes);return;}
            if(typeof frame.requestId!=='string'||!frame.requestId){ws.close(1008,'INVALID_COMMAND');return;}
            const suffix=frame.operation==='create'&&!frame.conversationNo?'':
              /^(DEMO-SUPPORT-\d+)$/.test(frame.conversationNo)&&['reply','read'].includes(frame.operation)?`/${frame.conversationNo}/${frame.operation==='reply'?'replies':'read'}`:null;
            if(suffix===null){send(ws,{type:'ack',requestId:frame.requestId,result:{code:422,message:'该演示操作尚未配置',data:null}});return;}
            try {
              const result=await messages.request(new URL('/api/app/support/conversations'+suffix,url),{
                method:()=> 'POST',postDataJSON:()=>frame.body,headers:()=>({'idempotency-key':frame.idempotencyKey}),
              });
              if(result.deliveryUnknown){ws.close(1011,'DEMO_DELIVERY_UNKNOWN');return;}
              send(ws,{type:'ack',requestId:frame.requestId,result:result.body});
            } catch {send(ws,{type:'ack',requestId:frame.requestId,result:{code:500,message:'演示请求失败',data:null}});}
          });
        });
      });
      server.on('close',()=>{for(const peer of peers)peer.socket.terminate();wss.close();});
    },
    stateChanged(update) {
      if(update.reset)messages.reset();
      if(update.messageState||update.reset) {
        // Scenario application was lazy; materialize before the event so reconcile reads it.
        fixtureFor(new URL('http://127.0.0.1/api/app/support/conversations/cursor'),{method:()=> 'GET'});
        changed();
      }
      for(const peer of peers) {
        if(state.realtimeState==='reconnecting')peer.socket.close(1012,'DEMO_RECONNECTING');
        else presence(peer);
      }
    },
  };
}
