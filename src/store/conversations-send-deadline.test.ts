import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/errors';
import { createSupportApi, type SupportCommandResult } from '@/api/support-api';
import type { Conversation } from '@/domain/support';
import { isConversationDeliveryAmbiguous } from '@/lib/conversation-delivery-policy';
import { installSupportStorage } from '@/test/storage-setup';

const api = vi.hoisted(() => ({ authorityRevision: vi.fn(), commandResult: vi.fn(),
  conversation: vi.fn(), conversations: vi.fn(), conversationDismissals: vi.fn(),
  conversationCategories: vi.fn(), replyConversation: vi.fn(), startConversation: vi.fn() }));
vi.mock('@/api/runtime', () => ({ supportApi: api, remoteApiEnabled: true }));
const { useConversations } = await import('./conversations');

installSupportStorage();
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks(); setActivePinia(createPinia());
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  api.authorityRevision.mockResolvedValue('deadline-run');
  api.commandResult.mockResolvedValue(null);
  api.conversation.mockResolvedValue(snapshot());
  api.conversations.mockResolvedValue({ items: [] });
  api.conversationDismissals.mockResolvedValue([]);
  api.conversationCategories.mockResolvedValue({ advisor: true, support: true, ai: false });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

const original = 'Original request';
function snapshot(delivered = false): Conversation {
  return { id: 'CV-deadline', type: 'support', status: 'open', version: delivered ? 2 : 1,
    agentName: 'Agent', roleKey: 'roleSupport', avatarTint: 'blue', unread: 0, sessionStatus: 'active',
    lastMessage: delivered ? original : '', lastTs: delivered ? 2 : 1,
    messages: delivered ? [{ id: '101', sender: 'user', text: original, ts: 2, status: 'sent' }] : [] };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function observe(promise: Promise<unknown>) {
  const settled = vi.fn();
  const done = promise.then(value => settled({ value }), cause => settled({ cause }));
  return { settled, done };
}
async function setup(mode: 'reply' | 'opening') {
  const store = useConversations(); store.bindAccount('user:1');
  await store.refreshCategories(); await store.open('CV-deadline');
  api.commandResult.mockClear(); api.conversation.mockClear();
  const action = mode === 'reply' ? api.replyConversation : api.startConversation;
  const composerKey = mode === 'reply' ? 'conversation:CV-deadline' : 'start:support';
  const intent = { text: original, attachmentId: 'ATT-1', kind: 'unknown' as const, settled: false, retryable: true, attempts: 1 };
  const send = (onKey?: (key: string) => void) => mode === 'reply' ? store.sendUser('CV-deadline', original, 'ATT-1', onKey) : store.startConversation('support', original, 'ATT-1', onKey);
  const isPending = () => store.hasPendingHumanSend(composerKey, intent);
  return { store, action, send, isPending, composerKey, intent };
}

async function pendingEcho(mode: 'reply' | 'opening') {
  const h = await setup(mode), unknown = new ApiError({ kind: 'network', message: 'lost ACK' });
  h.action.mockRejectedValueOnce(unknown); await expect(h.send()).rejects.toBe(unknown);
  await vi.advanceTimersByTimeAsync(0);
  h.store.saveComposer(h.composerKey, { text: 'Next private draft', imageDraft: null, failedSend: h.intent }, true);
  return { ...h, key: h.action.mock.calls[0][2] as string };
}

// Exercise the real parser as well as store.replace: dropping the optional wire
// field is enough to leave a canonical message and its unknown bubble together.
async function parsedEcho(clientMessageId: string | undefined, id = 'CV-deadline') {
  const response = { conversation: { conversationNo: id, conversationType: 'support', status: 'OPEN', version: 2,
    ownerAgentName: 'Agent', unreadCount: 0, lastMessage: original, lastMessageAt: 1760000001000 },
    messages: [{ id: 101, senderType: 'user', kind: 'IMAGE', attachmentId: 'ATT-1', content: original,
      receiptStatus: 'sent', createdAt: 1760000001000, ...(clientMessageId === undefined ? {} : { clientMessageId }) }],
    historyTruncated: false, nextCursor: null };
  return createSupportApi({ request: async () => response } as never).conversation(id);
}

describe('canonical echoes retire only the exact original command', () => {
  it.each(['reply', 'opening'] as const)('retires a %s key and saved unknown once when the parsed canonical echo arrives before commandResult', async mode => {
    const h = await pendingEcho(mode), canonical = await parsedEcho(h.key);
    expect(canonical.messages[0].clientMessageId).toBe(h.key);
    api.conversations.mockResolvedValue({ items: [canonical] });
    await h.store.refresh();
    expect(api.commandResult).toHaveBeenLastCalledWith(h.key);
    expect(await h.isPending()).toBe(false);
    expect(h.store.composer(h.composerKey)).toMatchObject({ text: 'Next private draft', failedSend: null });
    expect(h.store.get('CV-deadline')!.messages).toHaveLength(1);
    if (mode === 'opening') {
      expect(h.store.composer(h.composerKey).recoveredId).toBe('CV-deadline');
      expect(h.store.composer('conversation:CV-deadline')).toMatchObject({ text: 'Next private draft', failedSend: null });
    }
    api.commandResult.mockClear(); await h.store.refresh();
    expect(api.commandResult).not.toHaveBeenCalled(); expect(h.action).toHaveBeenCalledOnce();
    expect(h.store.get('CV-deadline')!.messages).toHaveLength(1);
  });

  it.each([
    ['reply', 'different-key'], ['reply', 'no-echo'], ['opening', 'different-key'], ['opening', 'no-echo'],
  ] as const)('preserves the %s unknown when identical canonical text has %s', async (mode, echo) => {
    const h = await pendingEcho(mode);
    const canonical = await parsedEcho(echo === 'different-key' ? h.key + '-other-command' : undefined);
    expect(canonical.messages[0].text).toBe(h.intent.text);
    api.conversations.mockResolvedValue({ items: [canonical] }); await h.store.refresh();
    expect(await h.isPending()).toBe(true);
    expect(h.store.composer(h.composerKey)).toMatchObject({ text: 'Next private draft', failedSend: h.intent });
    expect(h.store.composer(h.composerKey).recoveredId).toBeUndefined();
    expect(h.store.get('CV-deadline')!.messages).toHaveLength(1);
    h.action.mockResolvedValueOnce(canonical); await h.send();
    expect(h.action.mock.calls[1][2]).toBe(h.key);
  });

  it('never retires a reply in another conversation even when its body and echoed key match', async () => {
    const h = await pendingEcho('reply'), foreign = await parsedEcho(h.key, 'CV-other');
    api.conversations.mockResolvedValue({ items: [foreign] }); await h.store.refresh();
    expect(await h.isPending()).toBe(true);
    expect(h.store.composer(h.composerKey).failedSend).toEqual(h.intent);
    expect(h.store.get('CV-deadline')!.messages).toHaveLength(0);
    expect(h.store.get('CV-other')!.messages[0].clientMessageId).toBe(h.key);
    api.conversations.mockResolvedValue({ items: [await parsedEcho(h.key)] }); await h.store.refresh();
    expect(await h.isPending()).toBe(false); expect(h.store.composer(h.composerKey).failedSend).toBeNull();
  });

  it('does not let an agent echo retire a user command', async () => {
    const h = await pendingEcho('reply'), canonical = await parsedEcho(h.key);
    canonical.messages[0].sender = 'agent';
    api.conversations.mockResolvedValue({ items: [canonical] }); await h.store.refresh();
    expect(await h.isPending()).toBe(true); expect(h.store.composer(h.composerKey).failedSend).toEqual(h.intent);
  });
});

describe.each(['reply', 'opening'] as const)('bounded human %s dispatch', mode => {
  it.each(['ack', 'readback-timeout', 'readback-null'] as const)('accepts an exact echo received during %s instead of rebuilding unknown', async phase => {
    const h = await setup(mode), readback = deferred<SupportCommandResult | null>();
    h.action.mockReturnValue(new Promise(() => {})); api.commandResult.mockReturnValueOnce(readback.promise);
    const work = observe(h.send()); await vi.advanceTimersByTimeAsync(0);
    const key = h.action.mock.calls[0][2];
    h.store.saveComposer(h.composerKey, { text: 'Next private draft', imageDraft: null, failedSend: h.intent }, true);
    await vi.advanceTimersByTimeAsync(phase === 'ack' ? 8_000 : 13_000);
    const canonical = await parsedEcho(key); api.conversation.mockResolvedValue(canonical);
    await h.store.open(canonical.id);
    expect(await h.isPending()).toBe(false); expect(h.store.composer(h.composerKey).failedSend).toBeNull();
    if (phase === 'readback-null') readback.resolve(null);
    else await vi.advanceTimersByTimeAsync(phase === 'ack' ? 4_000 : 2_000);
    await work.done;
    expect(work.settled).toHaveBeenCalledExactlyOnceWith({ value: mode === 'reply' ? true : canonical.id });
    expect(h.store.mutating).toBe(false); expect(h.action).toHaveBeenCalledOnce();
    expect(h.store.composer(h.composerKey)).toMatchObject({ text: 'Next private draft', failedSend: null });
    expect(h.store.get(canonical.id)!.messages).toHaveLength(1);
  });

  it('does not accept a matching key from a different conversation or creation type during the ACK wait', async () => {
    const h = await setup(mode);
    h.action.mockReturnValue(new Promise(() => {}));
    const work = observe(h.send()); await vi.advanceTimersByTimeAsync(0);
    const key = h.action.mock.calls[0][2];
    h.store.saveComposer(h.composerKey, { text: 'Next private draft', imageDraft: null, failedSend: h.intent }, true);
    const foreign = await parsedEcho(key, 'CV-other');
    if (mode === 'opening') foreign.type = 'advisor';
    api.conversation.mockResolvedValueOnce(foreign); await h.store.open(foreign.id);
    expect(await h.isPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(12_000); await work.done;
    expect(isConversationDeliveryAmbiguous(work.settled.mock.calls[0][0].cause)).toBe(true);
    expect(h.store.composer(h.composerKey).failedSend).toEqual(h.intent);
    expect(await h.isPending()).toBe(true);
  });

  it('waits 12s for ACK plus at most 3s for readback, releasing the caller even if reconciliation never returns', async () => {
    const h = await setup(mode), ack = deferred<Conversation>(), readback = deferred<SupportCommandResult | null>();
    h.action.mockReturnValueOnce(ack.promise); api.commandResult.mockReturnValueOnce(readback.promise);
    // Extra best-effort reconciliation must not extend the UI's deadline.
    api.conversation.mockReturnValue(new Promise(() => {})); api.conversations.mockReturnValue(new Promise(() => {}));
    const first = observe(h.send()); await vi.advanceTimersByTimeAsync(0);
    expect(h.action).toHaveBeenCalledOnce(); expect(h.store.mutating).toBe(true);
    const key = h.action.mock.calls[0][2];
    await vi.advanceTimersByTimeAsync(11_999);
    expect(first.settled).not.toHaveBeenCalled(); expect(api.commandResult).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.commandResult).toHaveBeenCalledExactlyOnceWith(key); expect(first.settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(first.settled).not.toHaveBeenCalled(); expect(h.store.mutating).toBe(true);
    await vi.advanceTimersByTimeAsync(1); await first.done;
    expect(first.settled).toHaveBeenCalledOnce();
    expect(first.settled.mock.calls[0][0].cause).toMatchObject({ kind: 'network', retryable: true });
    expect(isConversationDeliveryAmbiguous(first.settled.mock.calls[0][0].cause)).toBe(true);
    expect(h.store.mutating).toBe(false); expect(await h.isPending()).toBe(true);
    expect(mode === 'reply' ? api.conversation : api.conversations).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);

    h.action.mockResolvedValueOnce(snapshot(true));
    await h.send();
    expect(h.action.mock.calls[1].slice(1)).toEqual([original, key, 'ATT-1']);
    expect(await h.isPending()).toBe(false);
    expect(h.store.get('CV-deadline')!.messages.map(message => message.id)).toEqual(['101']);
    // A timed-out old ACK/readback cannot roll back the recovered snapshot.
    ack.resolve(snapshot()); readback.resolve({ kind: 'conversation', conversation: snapshot() });
    await vi.advanceTimersByTimeAsync(0);
    expect(first.settled).toHaveBeenCalledOnce(); expect(h.action).toHaveBeenCalledTimes(2);
    expect(h.store.get('CV-deadline')!.version).toBe(2);
    expect(h.store.get('CV-deadline')!.messages).toHaveLength(1);
    expect(await h.isPending()).toBe(false);
  });

  it('starts the timeout at actual dispatch after a delayed authority preflight', async () => {
    const h = await setup(mode), authority = deferred<string>();
    api.authorityRevision.mockReturnValue(authority.promise);
    h.action.mockReturnValue(new Promise(() => {})); api.commandResult.mockReturnValue(new Promise(() => {}));
    const work = observe(h.send()); await vi.advanceTimersByTimeAsync(30_000);
    expect(h.action).not.toHaveBeenCalled(); expect(work.settled).not.toHaveBeenCalled();
    authority.resolve('deadline-run'); await vi.advanceTimersByTimeAsync(0);
    expect(h.action).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(14_999); expect(work.settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await work.done;
    expect(work.settled).toHaveBeenCalledOnce(); expect(await h.isPending()).toBe(true);
  });

  it('keeps a timed-out write unknown when the readback endpoint itself refuses access', async () => {
    const h = await setup(mode);
    h.action.mockReturnValue(new Promise(() => {}));
    api.commandResult.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 403, message: 'readback forbidden' }));
    const work = observe(h.send()); await vi.advanceTimersByTimeAsync(12_000); await work.done;
    // A refusal to GET the command is not proof that the earlier write failed.
    expect(await h.isPending()).toBe(true); expect(h.store.mutating).toBe(false);
    expect(work.settled.mock.calls[0][0].cause).toMatchObject({ kind: 'network', message: 'CONVERSATION_DELIVERY_UNKNOWN' });
    expect(isConversationDeliveryAmbiguous(work.settled.mock.calls[0][0].cause)).toBe(true);
    const key = h.action.mock.calls[0][2]; h.action.mockResolvedValueOnce(snapshot(true)); await h.send();
    expect(h.action.mock.calls[1].slice(1)).toEqual([original, key, 'ATT-1']); expect(await h.isPending()).toBe(false);
  });

  it.each(['auth', 'network'] as const)('preserves the original ambiguous ACK error when readback fails with %s', async kind => {
    const h = await setup(mode), ackError = new ApiError({ kind: 'http', status: 504, message: 'original ACK timeout' });
    h.action.mockRejectedValueOnce(ackError);
    api.commandResult.mockRejectedValueOnce(new ApiError({ kind, status: kind === 'auth' ? 401 : undefined, message: 'readback unavailable' }));
    await expect(h.send()).rejects.toBe(ackError);
    expect(await h.isPending()).toBe(true); expect(h.store.mutating).toBe(false);
  });

  it('adopts authoritative readback inside the final 3s and ignores a later ACK', async () => {
    const h = await setup(mode), ack = deferred<Conversation>(), readback = deferred<SupportCommandResult | null>();
    h.action.mockReturnValueOnce(ack.promise); api.commandResult.mockReturnValueOnce(readback.promise);
    const work = observe(h.send()); await vi.advanceTimersByTimeAsync(14_999);
    expect(work.settled).not.toHaveBeenCalled();
    readback.resolve({ kind: 'conversation', conversation: snapshot(true) }); await work.done;
    expect(work.settled).toHaveBeenCalledExactlyOnceWith({ value: mode === 'reply' ? true : 'CV-deadline' });
    expect(await h.isPending()).toBe(false); expect(h.store.mutating).toBe(false);
    ack.resolve({ ...snapshot(), version: 99 }); await vi.advanceTimersByTimeAsync(1);
    expect(h.store.get('CV-deadline')!.version).toBe(2); expect(vi.getTimerCount()).toBe(0);
  });

  it('shares one dispatch and one bounded readback between concurrent attempts of the same intent', async () => {
    const h = await setup(mode);
    h.action.mockReturnValue(new Promise(() => {})); api.commandResult.mockReturnValue(new Promise(() => {}));
    const firstKey = vi.fn(), secondKey = vi.fn();
    const first = observe(h.send(firstKey)), second = observe(h.send(secondKey)); await vi.advanceTimersByTimeAsync(0);
    expect(h.action).toHaveBeenCalledOnce();
    const key = h.action.mock.calls[0][2];
    expect(firstKey).toHaveBeenCalledExactlyOnceWith(key);
    expect(secondKey).toHaveBeenCalledExactlyOnceWith(key);
    await vi.advanceTimersByTimeAsync(15_000); await Promise.all([first.done, second.done]);
    expect(api.commandResult).toHaveBeenCalledOnce();
    expect(first.settled.mock.calls[0][0].cause).toBe(second.settled.mock.calls[0][0].cause);
    expect(await h.isPending()).toBe(true); expect(h.store.mutating).toBe(false);
  });

  it('retains an unknown key after a late ACK and retires it once through idempotent background recovery', async () => {
    const h = await setup(mode), ack = deferred<Conversation>(), readback = deferred<SupportCommandResult | null>();
    h.action.mockReturnValueOnce(ack.promise); api.commandResult.mockReturnValueOnce(readback.promise);
    const work = observe(h.send()); await vi.advanceTimersByTimeAsync(15_000); await work.done;
    const key = h.action.mock.calls[0][2];
    h.store.saveComposer(h.composerKey, { text: 'Next draft', imageDraft: null, failedSend: h.intent }, true);
    ack.resolve(snapshot(true)); readback.resolve({ kind: 'conversation', conversation: snapshot(true) });
    await vi.advanceTimersByTimeAsync(0);
    expect(await h.isPending()).toBe(true); expect(h.store.get('CV-deadline')!.messages).toHaveLength(0);
    api.commandResult.mockResolvedValue({ kind: 'conversation', conversation: snapshot(true) });
    await h.store.refresh(); await h.store.refresh();
    expect(api.commandResult.mock.calls).toEqual([[key], [key]]);
    expect(h.action).toHaveBeenCalledOnce(); expect(await h.isPending()).toBe(false);
    expect(h.store.get('CV-deadline')!.messages.map(message => message.id)).toEqual(['101']);
    expect(h.store.composer(h.composerKey)).toMatchObject({ text: 'Next draft', failedSend: null });
    if (mode === 'opening') expect(h.store.composer(h.composerKey).recoveredId).toBe('CV-deadline');
  });

  it.each([408, 409, 425, 429, 503])('keeps the original key when a WebSocket ACK has ambiguous code %i', async code => {
    const h = await setup(mode), unknown = new ApiError({ kind: 'business', code, message: 'ack uncertain' });
    h.action.mockRejectedValueOnce(unknown).mockResolvedValueOnce(snapshot(true));
    await expect(h.send()).rejects.toBe(unknown);
    const key = h.action.mock.calls[0][2];
    expect(api.commandResult).toHaveBeenCalledExactlyOnceWith(key); expect(await h.isPending()).toBe(true);
    await h.send();
    expect(h.action.mock.calls[1].slice(1)).toEqual([original, key, 'ATT-1']); expect(await h.isPending()).toBe(false);
  });

  it.each([403, 10001])('releases explicit refusal %i immediately, without readback or retained unknown key', async code => {
    const h = await setup(mode), refusal = new ApiError({ kind: 'business', code, message: 'refused' });
    h.action.mockRejectedValueOnce(refusal).mockResolvedValueOnce(snapshot(true));
    await expect(h.send()).rejects.toBe(refusal);
    expect(api.commandResult).not.toHaveBeenCalled(); expect(await h.isPending()).toBe(false);
    expect(h.store.mutating).toBe(false); expect(vi.getTimerCount()).toBe(0);
    const key = h.action.mock.calls[0][2]; await vi.advanceTimersByTimeAsync(1); await h.send();
    expect(h.action.mock.calls[1][1]).toBe(original); expect(h.action.mock.calls[1][3]).toBe('ATT-1');
    expect(h.action.mock.calls[1][2]).not.toBe(key);
  });

  it('does not adopt readback from an account that changed while the ACK was pending', async () => {
    const h = await setup(mode), readback = deferred<SupportCommandResult | null>();
    h.action.mockReturnValue(new Promise(() => {})); api.commandResult.mockReturnValueOnce(readback.promise);
    const work = observe(h.send()); await vi.advanceTimersByTimeAsync(12_000);
    h.store.bindAccount('user:2');
    readback.resolve({ kind: 'conversation', conversation: snapshot(true) }); await work.done;
    expect(work.settled.mock.calls[0][0].cause).toBeInstanceOf(Error);
    expect(h.store.conversations).toEqual([]); expect(h.store.humanComposers).toEqual({});
    expect(h.store.mutating).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
});
