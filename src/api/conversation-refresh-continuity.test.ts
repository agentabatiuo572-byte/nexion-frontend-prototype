import { afterEach, expect, it, vi } from 'vitest';
import { createRuntimeApiClient } from './runtime-client';
import { createSessionVault, type SessionSnapshot } from './session-vault';
import { ConversationRealtime, type RealtimeSocket } from './conversation-realtime';
import * as bridge from './app-conversation-realtime';

class Socket implements RealtimeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  close = vi.fn();
  send(data: string) { this.sent.push(data); }
  frame(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
const session = (accessToken = 'fixture-old', userId = 1): SessionSnapshot => ({
  accessToken, refreshToken: 'fixture-refresh', tokenType: 'Bearer',
  user: { userId, countryCode: '+86', phone: '13800000001', nickname: 'Fixture', onboardingComplete: true },
});
const response = (accessToken = 'fixture-new', status = 200) => ({
  status, headers: {}, data: { code: status === 200 ? 0 : status,
    message: status === 200 ? 'success' : 'USER_REFRESH_TOKEN_INVALID', data: status === 200 ? session(accessToken) : null },
});
const carriers: ConversationRealtime[] = [];
function harness(firstTicket?: Promise<{ ticket: string }>) {
  vi.useFakeTimers();
  const vault = createSessionVault(); vault.save(session());
  const sockets: Socket[] = [], bearers: string[] = [];
  const state = vi.fn(), reconcile = vi.fn(async () => {});
  const ticket = vi.fn(async () => {
    bearers.push(vault.read()!.accessToken);
    if (bearers.length === 1 && firstTicket) return firstTicket;
    return { ticket: `fixture-${bearers.length}` };
  });
  const realtime = new ConversationRealtime({ url: 'ws://fixture', state, reconcile,
    ticket,
    socket: () => { const socket = new Socket(); sockets.push(socket); return socket; },
  });
  const request = vi.fn(async () => response());
  const onSessionRefreshed = vi.fn(() =>
    (bridge as unknown as { renewAppConversationRealtime(): void }).renewAppConversationRealtime());
  const api = createRuntimeApiClient({ config: { environment: 'dev', baseUrl: 'http://127.0.0.1:8110' }, development: true, vault,
    transport: { request }, onSessionRefreshed });
  carriers.push(realtime); bridge.setAppConversationRealtime(realtime); realtime.start();
  return { vault, sockets, bearers, state, reconcile, realtime, ticket, request, onSessionRefreshed, api };
}
async function ready(socket: Socket) {
  socket.onopen?.(); socket.frame({ type: 'ready' }); await vi.advanceTimersByTimeAsync(0);
}
afterEach(() => { carriers.splice(0).forEach(carrier => carrier.stop()); bridge.setAppConversationRealtime(null); vi.useRealTimers(); });

it('replaces the old grant after accepted renewal, restores watch, and never replays an uncertain command', async () => {
  const h = harness(); await vi.advanceTimersByTimeAsync(0); await ready(h.sockets[0]);
  h.realtime.watch('CV-fixture');
  const pending = h.realtime.command('reply', 'CV-fixture', { body: 'fixture' }, 'fixture-key')!;
  const rejected = expect(pending).rejects.toThrow('CONVERSATION_DELIVERY_UNKNOWN');
  await h.api.refreshSession();
  expect(h.onSessionRefreshed).toHaveBeenCalledOnce();
  await rejected; await vi.advanceTimersByTimeAsync(0);
  expect(h.bearers).toEqual(['fixture-old', 'fixture-new']);
  expect(h.sockets[0].close).toHaveBeenCalledOnce();
  h.sockets[0].onopen?.(); h.sockets[0].frame({ type: 'ready' });
  h.sockets[0].frame({ type: 'error', code: 403 }); h.sockets[0].onclose?.({ code: 4401 });
  expect(h.sockets[1].sent).toHaveLength(0);
  await ready(h.sockets[1]);
  expect(h.realtime.ready).toBe(true); expect(h.reconcile).toHaveBeenCalledTimes(2);
  expect(h.sockets[1].sent.map(value => JSON.parse(value))).toEqual([
    { type: 'auth', ticket: 'fixture-2' }, { type: 'watch', conversationNo: 'CV-fixture' },
  ]);
  expect(h.sockets.flatMap(socket => socket.sent).filter(value => JSON.parse(value).type === 'command')).toHaveLength(1);
  h.realtime.stop();
});

it('keeps a wire 401 terminal until a successful current-session renewal supplies a new bearer', async () => {
  const h = harness(); await vi.advanceTimersByTimeAsync(0); await ready(h.sockets[0]);
  h.sockets[0].frame({ type: 'error', code: 401 });
  await vi.advanceTimersByTimeAsync(20000);
  expect(h.bearers).toHaveLength(1); expect(h.state).toHaveBeenCalledWith(false, true);
  await h.api.refreshSession(); await vi.advanceTimersByTimeAsync(0); await ready(h.sockets[1]);
  expect(h.bearers).toEqual(['fixture-old', 'fixture-new']); expect(h.realtime.ready).toBe(true);
  h.realtime.stop();
});

it.each([401, 403])('never retries the socket after renewal is rejected with %s', async status => {
  const h = harness(); await vi.advanceTimersByTimeAsync(0); await ready(h.sockets[0]);
  h.sockets[0].frame({ type: 'error', code: 401 }); h.request.mockResolvedValue(response('fixture-new', status));
  await expect(h.api.refreshSession()).rejects.toThrow(); await vi.advanceTimersByTimeAsync(60000);
  expect(h.onSessionRefreshed).not.toHaveBeenCalled(); expect(h.bearers).toHaveLength(1);
  expect(h.vault.read()).toBeNull(); expect(h.realtime.ready).toBe(false); h.realtime.stop();
});

it.each([401, 403])('keeps a fresh ticket denial %s terminal even after successful bearer renewal', async status => {
  const h = harness(); await vi.advanceTimersByTimeAsync(0); await ready(h.sockets[0]);
  h.ticket.mockRejectedValueOnce({ status });
  await h.api.refreshSession(); await vi.advanceTimersByTimeAsync(60000);
  expect(h.ticket).toHaveBeenCalledTimes(2); expect(h.sockets).toHaveLength(1);
  expect(h.state).toHaveBeenLastCalledWith(false, true); expect(h.realtime.ready).toBe(false);
});

it('ignores a late old ticket after renewal has started a fresh connection', async () => {
  let release!: (ticket: { ticket: string }) => void;
  const h = harness(new Promise(resolve => { release = resolve; }));
  await h.api.refreshSession(); await vi.advanceTimersByTimeAsync(0);
  expect(h.sockets).toHaveLength(1); await ready(h.sockets[0]);
  release({ ticket: 'fixture-stale' }); await vi.advanceTimersByTimeAsync(0);
  expect(h.sockets).toHaveLength(1); expect(h.realtime.ready).toBe(true);
  expect(JSON.parse(h.sockets[0].sent[0])).toEqual({ type: 'auth', ticket: 'fixture-2' });
});

it('does not rebuild a connection when an accepted refresh returns the same bearer', async () => {
  const h = harness(); await vi.advanceTimersByTimeAsync(0); await ready(h.sockets[0]);
  h.request.mockResolvedValue(response('fixture-old')); await h.api.refreshSession();
  expect(h.onSessionRefreshed).not.toHaveBeenCalled(); expect(h.sockets).toHaveLength(1);
  expect(h.realtime.ready).toBe(true); h.realtime.stop();
});

it('accepts peer continuation without rebuilding or interrupting a command when the committed bearer is unchanged', async () => {
  const h = harness(); await vi.advanceTimersByTimeAsync(0); await ready(h.sockets[0]);
  const pendingCommand = h.realtime.command('reply', 'CV-fixture', { body: 'fixture' }, 'fixture-key')!;
  const commandFailure = vi.fn(); void pendingCommand.catch(commandFailure);
  const command = JSON.parse(h.sockets[0].sent.find(value => JSON.parse(value).type === 'command')!);
  let release!: (value: ReturnType<typeof response>) => void;
  h.request.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const pendingRefresh = h.api.refreshSession();
  expect(h.vault.refreshIfUnchanged(session('fixture-new'), h.vault.revision())).toBe(true);
  release(response('fixture-new'));
  await expect(pendingRefresh).resolves.toMatchObject({ accessToken: 'fixture-new' });
  await vi.advanceTimersByTimeAsync(0);
  expect(h.vault.revision()).toBe(3); expect(h.vault.read()?.accessToken).toBe('fixture-new');
  expect(h.onSessionRefreshed).not.toHaveBeenCalled(); expect(commandFailure).not.toHaveBeenCalled();
  expect(h.sockets[0].close).not.toHaveBeenCalled(); expect(h.sockets).toHaveLength(1);
  h.sockets[0].frame({ type: 'ack', requestId: command.requestId, result: { code: 0, data: 'fixture-result' } });
  await expect(pendingCommand).resolves.toEqual({ code: 0, data: 'fixture-result' });
});

it.each(['logout', 'switch'])('does not revive a stale refresh after %s changes the vault identity', async action => {
  const h = harness(); await vi.advanceTimersByTimeAsync(0); await ready(h.sockets[0]);
  let release!: (value: ReturnType<typeof response>) => void;
  h.request.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const pending = h.api.refreshSession();
  if (action === 'logout') h.vault.clear(); else h.vault.save(session('fixture-other', 2));
  release(response()); await expect(pending).rejects.toThrow('SESSION_CHANGED_DURING_REFRESH');
  expect(h.onSessionRefreshed).not.toHaveBeenCalled(); expect(h.sockets).toHaveLength(1); h.realtime.stop();
});

it('does not revive an explicitly stopped carrier after a successful renewal', async () => {
  const h = harness(); await vi.advanceTimersByTimeAsync(0); h.realtime.stop();
  await h.api.refreshSession(); await vi.advanceTimersByTimeAsync(20000);
  expect(h.onSessionRefreshed).toHaveBeenCalledOnce(); expect(h.bearers).toHaveLength(1);
});

it('keeps an accepted renewal committed when its observer throws', async () => {
  const h = harness(); h.onSessionRefreshed.mockImplementation(() => { throw new Error('observer unavailable'); });
  await expect(h.api.refreshSession()).resolves.toMatchObject({ accessToken: 'fixture-new' });
  expect(h.onSessionRefreshed).toHaveBeenCalledOnce(); expect(h.vault.read()?.accessToken).toBe('fixture-new');
  h.realtime.stop();
});
