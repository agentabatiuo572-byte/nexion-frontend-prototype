import { describe,it,expect,vi,afterEach } from 'vitest';
import { ConversationRealtime, type RealtimeSocket } from './conversation-realtime';
class Socket implements RealtimeSocket {
  onopen:(()=>void)|null=null;onmessage:((e:{data:string})=>void)|null=null;
  onclose:((e:{code:number})=>void)|null=null;onerror:(()=>void)|null=null;
  sent:string[]=[];send(s:string){this.sent.push(s)} close(){};
  frame(value:unknown){this.onmessage?.({data:JSON.stringify(value)})}
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('conversation realtime recovery',()=>{
  it('starts and stops once when App Plus has no AbortController',async()=>{
    vi.stubGlobal('AbortController',undefined);
    vi.useFakeTimers();
    let requestSignal:AbortSignal|undefined;
    const ticket=vi.fn(async(signal:AbortSignal)=>{requestSignal=signal;return {ticket:'ready'}});
    const client=new ConversationRealtime({ticket,socket:()=>new Socket(),url:'ws://local',reconcile:async()=>{}});
    client.start();await vi.advanceTimersByTimeAsync(0);
    expect(ticket).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(false);
    client.stop();
    expect(requestSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(ticket).toHaveBeenCalledTimes(1);
  });
  it('keeps terminal authorization failure visible without polling or retrying the socket',async()=>{
    vi.useFakeTimers();
    const state=vi.fn();const reconcile=vi.fn();const socket=vi.fn();
    const ticket=vi.fn().mockRejectedValue({status:403});
    const client=new ConversationRealtime({ticket,socket,url:'ws://local',reconcile,state});
    client.start();await vi.advanceTimersByTimeAsync(10000);
    expect(state).toHaveBeenCalledWith(false,true,true);
    expect(ticket).toHaveBeenCalledTimes(1);
    expect(socket).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    client.stop();
  });
  it('keeps polling and retries the ticket after a temporary 428',async()=>{
    vi.useFakeTimers();
    const reconcile=vi.fn().mockResolvedValue(undefined);
    const ticket=vi.fn().mockRejectedValueOnce({status:428}).mockResolvedValue({ticket:'ready'});
    const client=new ConversationRealtime({ticket,socket:()=>new Socket(),url:'ws://local',reconcile});
    client.start();await vi.advanceTimersByTimeAsync(5000);
    expect(reconcile).toHaveBeenCalled();
    expect(ticket).toHaveBeenCalledTimes(2);
    client.stop();
  });
  it('reports a renewal timeout and a socket failure until catch-up actually recovers',async()=>{
    vi.useFakeTimers();
    const state=vi.fn();const sockets:Socket[]=[];
    const ticket=vi.fn().mockResolvedValueOnce({ticket:'first'}).mockImplementationOnce(()=>new Promise(()=>{})).mockResolvedValue({ticket:'retry'});
    const client=new ConversationRealtime({ticket,socket:()=>{const socket=new Socket();sockets.push(socket);return socket;},url:'ws://local',reconcile:async()=>{},state});
    client.start();await vi.advanceTimersByTimeAsync(0);sockets[0].frame({type:'ready'});await vi.advanceTimersByTimeAsync(0);
    client.renewCredentials();
    expect(state).toHaveBeenLastCalledWith(false,false,false);
    await vi.advanceTimersByTimeAsync(14999);
    expect(state).toHaveBeenLastCalledWith(false,false,false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state).toHaveBeenLastCalledWith(false,false,true);
    await vi.advanceTimersByTimeAsync(1200);
    expect(state).toHaveBeenLastCalledWith(false,false,true);
    sockets[1].frame({type:'ready'});await vi.advanceTimersByTimeAsync(0);
    expect(state).toHaveBeenLastCalledWith(true,false,false);
    sockets[1].onerror?.();
    expect(state).toHaveBeenLastCalledWith(false,false,true);
    client.stop();
  });
  it('preserves a real failure through credential renewal until catch-up completes',async()=>{
    vi.useFakeTimers();
    const state=vi.fn();const sockets:Socket[]=[];let finishCatchUp!:()=>void;
    const reconcile=vi.fn().mockResolvedValueOnce(undefined).mockImplementationOnce(()=>new Promise<void>(resolve=>{finishCatchUp=resolve;}));
    const client=new ConversationRealtime({ticket:async()=>({ticket:'fresh'}),socket:()=>{const socket=new Socket();sockets.push(socket);return socket;},url:'ws://local',reconcile,state});
    client.start();await vi.advanceTimersByTimeAsync(0);sockets[0].frame({type:'ready'});await vi.advanceTimersByTimeAsync(0);
    sockets[0].onerror?.();
    expect(state).toHaveBeenLastCalledWith(false,false,true);
    state.mockClear();client.renewCredentials();await vi.advanceTimersByTimeAsync(0);
    expect(state).toHaveBeenLastCalledWith(false,false,true);
    sockets[1].frame({type:'ready'});await vi.advanceTimersByTimeAsync(0);
    expect(client.ready).toBe(false);
    expect(state).not.toHaveBeenCalledWith(false,false,false);
    finishCatchUp();await vi.advanceTimersByTimeAsync(0);
    expect(state).toHaveBeenLastCalledWith(true,false,false);
    sockets[1].onerror?.();client.stop();
    expect(state).toHaveBeenLastCalledWith(false,false,false);
  });
  it('resumes fallback after hide/show while the new ticket is still pending',async()=>{
    vi.useFakeTimers();
    const reconcile=vi.fn().mockResolvedValue(undefined);
    const client=new ConversationRealtime({ticket:()=>new Promise(()=>{}),socket:()=>new Socket(),url:'ws://local',reconcile});
    client.start();client.stop();client.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(reconcile).toHaveBeenCalledTimes(1);
    client.stop();
  });
  it('does not revive an old polling loop when its request completes after restart',async()=>{
    vi.useFakeTimers();let release!:()=>void;
    const reconcile=vi.fn().mockImplementationOnce(()=>new Promise<void>(r=>release=r)).mockResolvedValue(undefined);
    const client=new ConversationRealtime({ticket:()=>new Promise(()=>{}),socket:()=>new Socket(),url:'ws://local',reconcile});
    client.start();await vi.advanceTimersByTimeAsync(5000);
    client.stop();client.start();release();await vi.advanceTimersByTimeAsync(5000);
    expect(reconcile).toHaveBeenCalledTimes(2);
    client.stop();
  });
  it('holds readiness until catch-up, drains changes during catch-up and polls only disconnected',async()=>{
    vi.useFakeTimers();const sockets:Socket[]=[];let release!:()=>void;
    const sync=vi.fn().mockImplementationOnce(()=>new Promise<void>(r=>release=r)).mockResolvedValue(undefined);
    const client=new ConversationRealtime({ticket:async()=>({ticket:'once'}),socket:()=>{const s=new Socket();sockets.push(s);return s},url:'ws://local',reconcile:sync});
    client.start();await vi.advanceTimersByTimeAsync(0);const socket=sockets[0];socket.onopen?.();socket.frame({type:'ready'});
    expect(client.ready).toBe(false);socket.frame({type:'event',eventId:'a',conversationNo:'CV-1'});release();await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(2);expect(client.ready).toBe(true);
    socket.frame({type:'event',eventId:'a',conversationNo:'CV-1'});await vi.advanceTimersByTimeAsync(6000);
    expect(sync).toHaveBeenCalledTimes(2);
    socket.onclose?.({code:1006});await vi.advanceTimersByTimeAsync(5100);expect(sync.mock.calls.length).toBeGreaterThan(2);client.stop();
  });
  it('never resends an unacknowledged command under a fresh key and ignores late connections after stop',async()=>{
    vi.useFakeTimers();const socket=new Socket();const client=new ConversationRealtime({ticket:async()=>({ticket:'once'}),socket:()=>socket,url:'ws://local',reconcile:async()=>{}});
    client.start();await vi.advanceTimersByTimeAsync(0);socket.onopen?.();socket.frame({type:'ready'});await vi.advanceTimersByTimeAsync(0);
    const command=client.command('reply','CV-1',{body:'hello'},'same-key')!;
    const rejected=expect(command).rejects.toThrow('CONVERSATION_DELIVERY_UNKNOWN');socket.onclose?.({code:1006});await rejected;
    expect(socket.sent.filter(s=>JSON.parse(s).type==='command')).toHaveLength(1);
    client.stop();socket.frame({type:'ready'});await vi.advanceTimersByTimeAsync(1000);expect(client.ready).toBe(false);
  });
  it('accepts only a valid assignment scope invalidation',async()=>{
    vi.useFakeTimers();const socket=new Socket();const scopeInvalidated=vi.fn();
    const client=new ConversationRealtime({ticket:async()=>({ticket:'once'}),socket:()=>socket,url:'ws://local',reconcile:async()=>{},scopeInvalidated});
    client.start();await vi.advanceTimersByTimeAsync(0);socket.onopen?.();
    socket.frame({type:'scope-invalidated',reason:'ASSIGNMENT_CHANGED',customerId:42});
    socket.frame({type:'scope-invalidated',reason:'ASSIGNMENT_CHANGED',customerId:'42'});
    socket.frame({type:'scope-invalidated',reason:'OTHER',customerId:42});
    expect(scopeInvalidated).toHaveBeenCalledTimes(1);expect(scopeInvalidated).toHaveBeenCalledWith(42);
    client.stop();
  });
});
