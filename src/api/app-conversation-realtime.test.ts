import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api-client';
import { ConversationRealtime, type RealtimeSocket } from './conversation-realtime';
import { realtimeWebSocketOrigin, setAppConversationRealtime, withConversationRealtime } from './app-conversation-realtime';
class Socket implements RealtimeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: {data:string}) => void) | null = null;
  onclose: ((event: {code:number}) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  send(data:string) { this.sent.push(data); }
  close() {}
}
let realtime: ConversationRealtime;
afterEach(() => { realtime?.stop(); setAppConversationRealtime(null); vi.useRealTimers(); });
it('uses the public API origin for a native WebSocket handshake',()=>{
  expect(realtimeWebSocketOrigin('wss://18.142.169.24/ws/conversations')).toBe('https://18.142.169.24');
  expect(realtimeWebSocketOrigin('ws://127.0.0.1:8110/ws/conversations')).toBeNull();
  expect(realtimeWebSocketOrigin('not-a-websocket-url')).toBeNull();
});
async function setup() {
  vi.useFakeTimers();
  const socket = new Socket();
  realtime = new ConversationRealtime({url:'ws://fixture',ticket:async()=>({ticket:'fixture'}),socket:()=>socket,reconcile:async()=>{}});
  realtime.start(); await vi.advanceTimersByTimeAsync(0);
  socket.onopen?.(); socket.onmessage?.({data:JSON.stringify({type:'ready'})});
  await vi.advanceTimersByTimeAsync(0); expect(realtime.ready).toBe(true);
  setAppConversationRealtime(realtime);
  const request = vi.fn();
  const client = withConversationRealtime({request, upload:vi.fn(), refreshSession:vi.fn()} as ApiClient);
  return {socket,request,client};
}
describe('App realtime request cancellation',()=>{
  it('does not transmit a command whose caller already aborted',async()=>{
    const {socket,request,client}=await setup(); const controller=new AbortController(); controller.abort();
    const result=client.request({method:'POST',path:'/api/app/support/conversations/CV-1/read',signal:controller.signal,body:{lastReadMessageId:1},idempotencyKey:'same-key'});
    const rejected=expect(result).rejects.toThrow('CONVERSATION_DELIVERY_UNKNOWN');
    await vi.advanceTimersByTimeAsync(12001); await rejected;
    expect(socket.sent.map(s=>JSON.parse(s)).filter(f=>f.type==='command')).toHaveLength(0);
    expect(request).not.toHaveBeenCalled();
  });
  it('settles cancellation immediately after transmission without HTTP resend',async()=>{
    const {socket,request,client}=await setup(); const controller=new AbortController();
    let settled=false;
    const result=client.request({method:'POST',path:'/api/app/support/conversations/CV-1/read',signal:controller.signal,idempotencyKey:'same-key'});
    const rejected=result.catch(e=>{settled=true; return e;});
    controller.abort(); await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true); expect(await rejected).toMatchObject({message:'CONVERSATION_DELIVERY_UNKNOWN'});
    expect(socket.sent.map(s=>JSON.parse(s)).filter(f=>f.type==='command')).toHaveLength(1);
    expect(request).not.toHaveBeenCalled();
  });
});
