import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { build } from 'esbuild';
import { createPrototypeMessages } from './lib/prototype-message-demo.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
let server,base,client;
before(async()=>{
  // Compile the actual client and API parsers without editing src or the shared build.
  const compiled=await build({stdin:{contents:`export {ConversationRealtime} from './src/api/conversation-realtime.ts';
    export {withConversationRealtime,setAppConversationRealtime} from './src/api/app-conversation-realtime.ts';
    export {createSupportApi} from './src/api/support-api.ts';
    export {ApiError,isSettledRejection} from './src/api/errors.ts';`,resolveDir:root},
    bundle:true,write:false,platform:'node',format:'esm',alias:{'@':root+'src'}});
  client=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  server=spawn(process.execPath,['scripts/prototype-preview-server.mjs'],{cwd:root,env:{...process.env,DEMO_PORT:'0'},stdio:['ignore','pipe','pipe']});
  base=await new Promise((resolve,reject)=>{
    let output='';const timeout=setTimeout(()=>reject(new Error('Preview startup timed out: '+output)),8000);
    server.once('exit',code=>{clearTimeout(timeout);reject(new Error('Preview exited '+code+': '+output));});
    server.stderr.on('data',bytes=>{output+=bytes;});
    server.stdout.on('data',bytes=>{output+=bytes;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});
  });
});
after(async()=>{if(server&&server.exitCode===null){server.kill();await once(server,'exit');}});
async function http(path,body,headers={}) {
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,...await response.json()};
}
const state=update=>http('/__demo/state',update);
const detail=()=>http('/api/app/support/conversations/DEMO-SUPPORT-1');
const reply=(key,text='demo message')=>({body:text,clientMessageId:key,expectedStatus:'OPEN',expectedVersion:2});
beforeEach(()=>state({reset:true}));

async function socket(t,{ticket,auth=true}={}) {
  const ws=new WebSocket(base.replace('http:','ws:')+'/ws/conversations');
  const frames=[],waiting=[];
  ws.on('message',bytes=>{
    const frame=JSON.parse(String(bytes)),index=waiting.findIndex(item=>item.match(frame));
    if(index<0)frames.push(frame);else {const item=waiting.splice(index,1)[0];clearTimeout(item.timer);item.resolve(frame);}
  });
  ws.on('error',()=>{});
  const closed=once(ws,'close');
  t.after(()=>{ws.terminate();for(const item of waiting)clearTimeout(item.timer);});
  const next=(type,match=()=>true)=>new Promise((resolve,reject)=>{
    const predicate=frame=>frame.type===type&&match(frame),index=frames.findIndex(predicate);
    if(index>=0){resolve(frames.splice(index,1)[0]);return;}
    const item={match:predicate,resolve,timer:setTimeout(()=>{waiting.splice(waiting.indexOf(item),1);reject(new Error('Missing frame '+type));},3500)};waiting.push(item);
  });
  await once(ws,'open');
  const send=frame=>ws.send(JSON.stringify(frame));
  if(auth){send({type:'auth',ticket:ticket??(await http('/api/app/support/realtime-ticket',{})).data.ticket});await next('ready');}
  return {ws,send,next,closed};
}

test('POST ticket, single-use auth, ready, watch, ping and live presence use the real socket',async t=>{
  const ticket=await http('/api/app/support/realtime-ticket',{});
  assert.equal(ticket.status,200);assert.equal(ticket.code,0);
  const peer=await socket(t,{ticket:ticket.data.ticket});
  peer.send({type:'watch',conversationNo:'DEMO-SUPPORT-1'});
  assert.equal((await peer.next('presence')).online,true);
  peer.send({type:'ping'});await peer.next('pong');
  await state({realtimeState:'offline'});assert.equal((await peer.next('presence')).online,false);
  await state({realtimeState:'online'});assert.equal((await peer.next('presence')).online,true);
  const reused=await socket(t,{auth:false});reused.send({type:'auth',ticket:ticket.data.ticket});
  assert.equal((await reused.next('error')).code,401);assert.equal((await reused.closed)[0],1008);
  const unauth=await socket(t,{auth:false});unauth.send({type:'command',requestId:'x',operation:'create'});
  assert.equal((await unauth.next('error')).code,401);
  await state({realtimeState:'reconnecting'});assert.equal((await peer.closed)[0],1012);
  const blocked=await socket(t,{auth:false});blocked.send({type:'auth',ticket:(await http('/api/app/support/realtime-ticket',{})).data.ticket});
  assert.equal((await blocked.closed)[0],1012);
  await state({realtimeState:'online'});await socket(t);
});

test('only modeled commands ACK; create/reply/read use shared HTTP fixtures and idempotency',async t=>{
  const peer=await socket(t);
  const command=async(requestId,operation,conversationNo,body,idempotencyKey)=>{
    peer.send({type:'command',requestId,operation,conversationNo,body,idempotencyKey});
    return (await peer.next('ack',frame=>frame.requestId===requestId)).result;
  };
  const before=await detail();
  assert.equal((await command('unsupported','ticket','DEMO-SUPPORT-1',{},'bad')).code,422);
  assert.equal((await command('missing','reply','DEMO-SUPPORT-999',reply('missing'),'missing')).code,404);
  assert.equal((await command('attachment','reply','DEMO-SUPPORT-1',{...reply('image'),kind:'IMAGE',attachmentId:'x'},'image')).code,422);
  const written=await command('reply','reply','DEMO-SUPPORT-1',reply('reply-key'),'reply-key');
  assert.equal(written.code,0);assert.equal(written.data.messages.length,before.data.messages.length+1);
  const replay=await http('/api/app/support/conversations/DEMO-SUPPORT-1/replies',reply('reply-key'),{'Idempotency-Key':'reply-key'});
  assert.equal(replay.code,0);assert.equal(replay.data.messages.length,written.data.messages.length);
  assert.equal((await command('conflict','reply','DEMO-SUPPORT-1',reply('reply-key','changed'),'reply-key')).code,409);
  assert.equal((await command('read','read','DEMO-SUPPORT-1',{lastSeenMessageId:1})).data.conversation.unreadCount,0);
  // One account and one advisor keep one conversation: a new opening continues DEMO-SUPPORT-1.
  const created=await command('create','create',undefined,{conversationType:'SUPPORT',openingText:'new chat',clientMessageId:'create-key'},'create-key');
  assert.equal(created.code,0);assert.equal(created.data.conversation.conversationNo,'DEMO-SUPPORT-1');
  assert.equal(created.data.messages.length,written.data.messages.length+1);assert.equal(created.data.messages.at(-1).content,'new chat');
  const recovered=await http('/api/app/support/commands/create-key');
  assert.equal(recovered.data.resultType,'CONVERSATION');assert.deepEqual(recovered.data.result,created.data);
  assert.equal((await http('/api/app/support/commands/not-sent')).data,null);
  assert.equal((await http('/api/app/support/conversations/DEMO-SUPPORT-1/ticket',{})).status,409);
  assert.equal((await detail()).data.messages.length,created.data.messages.length);
});

test('incoming scenario broadcasts a unique event after mutation; reads do not append it twice',async t=>{
  const peer=await socket(t),before=await detail();
  await state({messageState:'incoming'});const event=await peer.next('event');
  assert.ok(event.eventId);
  const after=await detail();assert.equal(after.data.messages.length,before.data.messages.length+1);
  assert.equal(after.data.messages.at(-1).senderType,'agent');
  assert.equal((await detail()).data.messages.length,after.data.messages.length);
});

test('HTTP delayed/failed/unknown scenarios have real statuses and original-request recovery',async()=>{
  await state({messageSendState:'delayed'});const started=Date.now();
  const send=()=>http('/api/app/support/conversations/DEMO-SUPPORT-1/replies',reply('delayed'),{'Idempotency-Key':'delayed'});
  const responses=await Promise.all([send(),send()]);
  assert.ok(Date.now()-started>=1900);assert.deepEqual(responses[0],responses[1]);
  assert.equal(responses[0].data.messages.filter(row=>row.clientMessageId==='delayed').length,1);
  await state({messageSendState:'failed'});const before=await detail();
  const failed=await http('/api/app/support/conversations/DEMO-SUPPORT-1/replies',reply('failed'),{'Idempotency-Key':'failed'});
  assert.equal(failed.status,422);assert.equal((await detail()).data.messages.length,before.data.messages.length);
  await state({messageSendState:'unknown'});
  const uncertain=await http('/api/app/support/conversations/DEMO-SUPPORT-1/replies',reply('unknown'),{'Idempotency-Key':'unknown'});
  assert.equal(uncertain.status,504);assert.equal((await http('/api/app/support/commands/unknown')).data,null);
  const retried=await http('/api/app/support/conversations/DEMO-SUPPORT-1/replies',reply('unknown'),{'Idempotency-Key':'unknown'});
  assert.equal(retried.status,200);assert.equal(retried.data.messages.filter(row=>row.clientMessageId==='unknown').length,1);
  assert.equal((await http('/api/app/support/commands/unknown')).data.resultType,'CONVERSATION');
});

test('actual realtime client/API reaches ready, reconciles events and recovers unknown sends promptly',{timeout:10000},async t=>{
  let notifyReady,notifyEvent,ready=false,reconciliations=0,presence;
  const readyPromise=new Promise(resolve=>{notifyReady=resolve;});
  const eventPromise=new Promise(resolve=>{notifyEvent=resolve;});
  const realtime=new client.ConversationRealtime({url:base.replace('http:','ws:')+'/ws/conversations',
    ticket:async()=> (await http('/api/app/support/realtime-ticket',{})).data,
    socket:url=>new WebSocket(url),reconcile:async()=>{await detail();if(++reconciliations>1)notifyEvent();},
    state:value=>{ready=value;if(value)notifyReady();},presence:value=>{presence=value;}});
  t.after(()=>{realtime.stop();client.setAppConversationRealtime(null);});
  client.setAppConversationRealtime(realtime);realtime.watch('DEMO-SUPPORT-1');realtime.start();
  await readyPromise;assert.equal(ready,true);assert.equal(presence.online,true);
  const api=client.createSupportApi(client.withConversationRealtime({request:async input=>{
    const response=await http(input.path,input.method==='POST'?input.body:undefined,input.idempotencyKey?{'Idempotency-Key':input.idempotencyKey}:{});
    if(response.code!==0)throw new client.ApiError({kind:'http',status:response.status,code:response.code,message:response.message});
    return response.data;
  }}));
  const conversation=await api.conversation('DEMO-SUPPORT-1');
  await state({messageState:'incoming'});await eventPromise;
  await state({messageSendState:'delayed'});const started=Date.now();
  await api.replyConversation(conversation,'delayed via WS','client-delay');assert.ok(Date.now()-started>=1900);
  await state({messageSendState:'failed'});
  await assert.rejects(api.replyConversation(conversation,'reject via WS','client-failed'),error=>error.status===422&&client.isSettledRejection(error));
  await state({messageSendState:'unknown'});const uncertainAt=Date.now();
  await assert.rejects(api.replyConversation(conversation,'unknown via WS','client-unknown'),error=>!client.isSettledRejection(error));
  assert.ok(Date.now()-uncertainAt<2000,'must not wait for the 12-second command timeout');
  assert.equal(await api.commandResult('client-unknown'),null);
  const recovered=await api.replyConversation(conversation,'unknown via WS','client-unknown');
  assert.equal(recovered.messages.filter(row=>row.text==='unknown via WS').length,1);
  assert.equal((await api.commandResult('client-unknown')).kind,'conversation');
});

test('unknown create across HTTP and WS retains one conversation and rejects changed-content replay',async t=>{
  await state({messageSendState:'unknown'});
  const before=(await detail()).data.messages.length;
  const body={conversationType:'SUPPORT',openingText:'uncertain opening',clientMessageId:'unknown-create'};
  assert.equal((await http('/api/app/support/conversations',body,{'Idempotency-Key':'unknown-create'})).status,504);
  assert.equal((await http('/api/app/support/commands/unknown-create')).data,null);
  const peer=await socket(t);
  peer.send({type:'command',requestId:'changed',operation:'create',body:{...body,openingText:'different'},idempotencyKey:'unknown-create'});
  assert.equal((await peer.next('ack')).result.code,409);
  peer.send({type:'command',requestId:'retry',operation:'create',body,idempotencyKey:'unknown-create'});
  assert.equal((await peer.next('ack')).result.code,0);
  // The same advisor's conversation is continued once, never duplicated.
  assert.equal((await http('/api/app/support/conversations/cursor')).data.total,1);
  assert.equal((await http('/api/app/support/commands/unknown-create')).data.result.conversation.conversationNo,'DEMO-SUPPORT-1');
  const after=(await detail()).data.messages;
  assert.equal(after.length,before+1);assert.equal(after.filter(row=>row.content==='uncertain opening').length,1);
});

test('unrelated upgrade paths, external origins and malformed frames fail closed',async t=>{
  for(const [path,origin] of [['/ws/other',base],['/ws/conversations','https://example.invalid']]) {
    const ws=new WebSocket(base.replace('http:','ws:')+path,{origin});
    ws.on('error',()=>{});t.after(()=>ws.terminate());
    const status=await new Promise(resolve=>ws.on('unexpected-response',(_request,response)=>{response.resume();resolve(response.statusCode);}));
    assert.equal(status,403);
  }
  const malformed=await socket(t);malformed.ws.send('{');assert.equal((await malformed.closed)[0],1008);
  const badAuth=await socket(t,{auth:false});badAuth.send({type:'auth',ticket:'not-issued'});
  assert.equal((await badAuth.next('error')).code,401);
});

test('reset during a delayed command cannot mutate the replacement scenario',async()=>{
  let mutations=0;
  const messages=createPrototypeMessages({state:{messageSendState:'delayed'},fixtureFor:()=>{mutations++;}});
  const pending=messages.request(new URL('http://127.0.0.1/api/app/support/conversations/DEMO-SUPPORT-1/replies'),{
    method:()=> 'POST',postDataJSON:()=>reply('reset-race'),headers:()=>({'idempotency-key':'reset-race'}),
  });
  messages.reset();
  assert.equal((await pending).status,503);
  assert.equal(mutations,0);
});
