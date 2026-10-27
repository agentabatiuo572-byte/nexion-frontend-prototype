import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Conversation } from '@/domain/support';
import { ApiError } from '@/api/errors';
import type { ConversationUserClear } from '@/api/conversation-management';
const api = vi.hoisted(() => ({ authorityRevision: vi.fn(), commandResult: vi.fn(), conversations: vi.fn(),
  conversationDismissals: vi.fn(), conversationManagement: vi.fn(), deleteConversation: vi.fn(), advisor: vi.fn(),
  conversationCategories: vi.fn(), conversation: vi.fn(), markConversationRead: vi.fn(), startConversation: vi.fn(), replyConversation: vi.fn() }));
vi.mock('@/api/runtime', () => ({ remoteApiEnabled: true, supportApi: api }));
const { useConversations } = await import('./conversations');
function storage() {
  const rows = new Map<string, string>();
  return { get length() { return rows.size; }, key: (i: number) => [...rows.keys()][i] ?? null,
    getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => rows.set(key, value), removeItem: (key: string) => rows.delete(key) };
}
const row = (id: string, ownerAgentId: string | null = '7', lastTs = 100): Conversation => ({ id, ownerAgentId,
  type: 'advisor', status: 'open', version: 1, agentName: 'Same display name', roleKey: 'roleAdvisor', avatarTint: 'blue',
  messages: [], unread: 2, lastTs, lastMessage: id, sessionStatus: 'active', historyTruncated: false, historyNextCursor: null });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const cleared = (conversationNos: string[], throughMessageId = 20): ConversationUserClear => ({ scope: 'USER_VIEW', userScopeCleared: true,
  peerKey: 'agent:7', throughMessageId, conversationNos });
beforeEach(() => {
  vi.resetAllMocks(); setActivePinia(createPinia()); vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage());
  api.authorityRevision.mockResolvedValue('canonical-v1'); api.commandResult.mockResolvedValue(null);
  api.conversationDismissals.mockResolvedValue([]); api.conversationManagement.mockResolvedValue({ clearUserHistory: true, clearedPeers: [] });
  api.conversations.mockResolvedValue({ items: [] }); api.advisor.mockResolvedValue({ currentAdvisorId: 7 });
  api.conversationCategories.mockResolvedValue({ advisor: true, support: true, ai: false });
});
afterEach(() => vi.unstubAllGlobals());

it('groups only stable staff identities, sums unread and retains old cids across a fresh store', async () => {
  api.conversations.mockResolvedValue({ items: [row('old', '7', 90), row('new'), row('other', '8'), row('unknown-a', null), row('unknown-b', null)] });
  for (let load = 0; load < 2; load++) {
    setActivePinia(createPinia()); const store = useConversations(); await store.refresh();
    expect(store.humanThreads).toHaveLength(4);
    expect(store.getThread('old')).toMatchObject({ id: 'new', peerKey: 'agent:7', conversationIds: ['new', 'old'], unread: 4 });
    expect(store.getThread('other')?.conversationIds).toEqual(['other']);
  }
});

it('opens each old cid with its own receipt and continues the largest remaining history cursor', async () => {
  const old = { ...row('old', '7', 90), messages: [{ id: '10', sender: 'agent' as const, text: 'older', ts: 10 }], historyNextCursor: 10, historyTruncated: true };
  const recent = { ...row('new'), messages: [{ id: '20', sender: 'agent' as const, text: 'recent', ts: 20 }], historyNextCursor: 20, historyTruncated: true };
  api.conversations.mockResolvedValue({ items: [old, recent, row('other', '8')] });
  api.conversation.mockImplementation(async (id, before) => before ? { ...recent, messages: [{ id: '19', sender: 'agent', text: 'page', ts: 19 }], historyNextCursor: null, historyTruncated: false } : id === 'old' ? old : recent);
  api.markConversationRead.mockImplementation(async item => ({ ...item, unread: 0 }));
  const store = useConversations(); await store.refresh(); await store.openThread('old');
  expect(api.markConversationRead.mock.calls.map(call => call[0].id).sort()).toEqual(['new', 'old']);
  expect(store.getThread('new')?.unread).toBe(0);
  await store.loadEarlierThread('old');
  expect(api.conversation).toHaveBeenLastCalledWith('new', 20);
  expect(store.getThread('old')?.messages.map(message => message.id)).toEqual(['10', '19', '20']);
  expect(store.getThread('old')?.historyNextCursor).toBe(10);
});

it('retains a whole thread until user clearing is acknowledged, then rejects old data but admits the same cid after its boundary', async () => {
  const rows = [row('old'), row('new'), row('other', '8')], pending = deferred<any>();
  api.conversations.mockResolvedValue({ items: rows }); api.deleteConversation.mockReturnValue(pending.promise);
  const store = useConversations(); await store.refresh(); const deleting = store.deleteConversation('new');
  store.saveComposer('conversation:old', { text: 'draft', imageDraft: null, failedSend: null });
  await Promise.resolve(); await Promise.resolve();
  expect(store.deletingIds.new).toBe(true); expect(store.get('new')).toBeDefined();
  pending.resolve(cleared(['old', 'new'])); await deleting;
  expect(store.humanThreads.map(item => item.id)).toEqual(['other']);
  expect(store.composer('conversation:old').text).toBe('');
  await store.refresh(); expect(store.get('new')).toBeUndefined(); expect(store.get('old')).toBeUndefined();
  expect(store.deletingIds).toEqual({});
  const revived = { ...row('new'), lastPublicMessageId: 21, messages: [
    { id: '10', sender: 'agent' as const, text: 'cleared', ts: 10 },
    { id: '21', sender: 'agent' as const, text: 'new message', ts: 21 }], historyNextCursor: 10, historyTruncated: true };
  api.conversations.mockResolvedValue({ items: [revived] }); await store.refresh();
  expect(store.get('new')?.messages.map(item => item.id)).toEqual(['21']);
  expect(store.get('new')?.historyNextCursor).toBe(null);
  api.deleteConversation.mockResolvedValue(cleared(['old', 'new'], 21));
  await store.deleteConversation('new'); expect(store.get('new')).toBeUndefined();
});

it('does not expose deletion without the capability or turn a refusal into local removal', async () => {
  api.conversations.mockResolvedValue({ items: [row('one')] }); api.conversationManagement.mockResolvedValue({ clearUserHistory: false, clearedPeers: [] });
  const store = useConversations(); await store.refresh();
  await expect(store.deleteConversation('one')).rejects.toThrow('SUPPORT_HISTORY_DELETION_UNAVAILABLE');
  expect(api.deleteConversation).not.toHaveBeenCalled();
  api.conversationManagement.mockResolvedValue({ clearUserHistory: true, clearedPeers: [] }); await store.refresh();
  api.deleteConversation.mockRejectedValue(new ApiError({ kind: 'http', status: 409, message: 'changed' }));
  await expect(store.deleteConversation('one')).rejects.toThrow('changed'); expect(store.get('one')).toBeDefined();
});

it('recovers an uncertain deletion from its original command receipt', async () => {
  api.conversations.mockResolvedValue({ items: [row('one')] });
  const store = useConversations(); await store.refresh();
  api.deleteConversation.mockRejectedValue(new ApiError({ kind: 'network', message: 'lost response' }));
  api.commandResult.mockResolvedValue({ kind: 'conversation-user-clear', clearance: cleared(['one']) });
  await store.deleteConversation('one');
  expect(api.commandResult).toHaveBeenLastCalledWith(api.deleteConversation.mock.calls[0][3]);
  expect(store.get('one')).toBeUndefined();
});

it('an old account deletion cannot erase the next account snapshot', async () => {
  const pending = deferred<any>(); api.deleteConversation.mockReturnValue(pending.promise);
  api.conversations.mockResolvedValue({ items: [row('one')] });
  const store = useConversations(); await store.refresh(); const result = store.deleteConversation('one');
  await Promise.resolve(); await Promise.resolve(); store.bindAccount('user:other');
  await store.refresh(); pending.resolve(cleared(['one']));
  await expect(result).rejects.toThrow('SUPPORT_ACCOUNT_SCOPE_CHANGED'); expect(store.get('one')).toBeDefined();
});

it('a server clear on another device removes cached history and drafts without requiring browser storage', async () => {
  api.conversations.mockResolvedValue({ items: [row('one')] });
  const store = useConversations(); await store.refresh();
  store.saveComposer('conversation:one', { text: 'old draft', imageDraft: null, failedSend: null });
  api.conversationManagement.mockResolvedValue({ clearUserHistory: true, clearedPeers: [cleared(['one'])] });
  api.conversations.mockResolvedValue({ items: [] }); await store.refresh();
  expect(store.humanThreads).toEqual([]); expect(store.composer('conversation:one').text).toBe('');
  setActivePinia(createPinia()); vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage());
  const fresh = useConversations(); await fresh.refresh(); expect(fresh.humanThreads).toEqual([]);
});

it('a detail read applies the server visibility boundary before merging loaded history', async () => {
  const old = { ...row('one'), unread: 0, messages: [{ id: '10', sender: 'user' as const, text: 'old', ts: 10 }] };
  api.conversations.mockResolvedValue({ items: [old] });
  const store = useConversations(); await store.refresh();
  api.conversation.mockResolvedValue({ ...old, userClearedThroughMessageId: 20, lastPublicMessageId: 21,
    messages: [{ id: '21', sender: 'user', text: 'new', ts: 21 }] });
  await store.open('one'); expect(store.get('one')?.messages.map(item => item.id)).toEqual(['21']);
});

it('a cold store settles an unknown clear from its original receipt before applying the new list', async () => {
  api.conversations.mockResolvedValue({ items: [row('one')] });
  let store = useConversations(); await store.refresh();
  api.deleteConversation.mockRejectedValue(new ApiError({ kind: 'network', message: 'lost clear' }));
  await expect(store.deleteConversation('one')).rejects.toThrow('lost clear');
  const key = api.deleteConversation.mock.calls[0][3];
  setActivePinia(createPinia()); store = useConversations();
  api.commandResult.mockResolvedValue({ kind: 'conversation-user-clear', clearance: cleared(['one']) });
  await store.refresh(); expect(api.commandResult).toHaveBeenLastCalledWith(key);
  expect(store.get('one')).toBeUndefined(); expect(api.deleteConversation).toHaveBeenCalledTimes(1);
});

it('clears the recovered start draft alias together with the original cid', async () => {
  api.conversations.mockResolvedValue({ items: [row('one')] });
  const store = useConversations(); store.bindAccount('user:1'); await store.refresh();
  store.saveComposer('start:advisor', { text: 'old draft', recoveredId: 'one', imageDraft: null, failedSend: null });
  api.deleteConversation.mockResolvedValue(cleared(['one'])); await store.deleteConversation('one');
  expect(store.composer('start:advisor').text).toBe(''); expect(store.composer('conversation:one').text).toBe('');
});

it('does not discard an UNKNOWN created after a clear when the same server marker is read after login', async () => {
  const renewed = { ...row('one'), lastPublicMessageId: 21, userClearedThroughMessageId: 20 };
  api.conversations.mockResolvedValue({ items: [renewed] });
  api.conversationManagement.mockResolvedValue({ clearUserHistory: true, clearedPeers: [cleared(['one'])] });
  let store = useConversations(); store.bindAccount('user:1'); await store.refresh();
  const failedSend = { text: 'later message', kind: 'unknown' as const, settled: false, retryable: true, attempts: 1 };
  store.saveComposer('conversation:one', { text: 'later message', imageDraft: null, failedSend }, true);
  setActivePinia(createPinia()); store = useConversations(); store.bindAccount('user:1'); await store.refresh();
  expect(store.composer('conversation:one').failedSend).toEqual(failedSend);
});

it('an unassigned conversation clears only its own boundary, never another unassigned row', async () => {
  api.conversations.mockResolvedValue({ items: [row('one', null), row('two', null)] });
  const store = useConversations(); await store.refresh();
  api.deleteConversation.mockResolvedValue({ ...cleared(['one']), peerKey: 'conversation:one' });
  await store.deleteConversation('one');
  expect(store.get('one')).toBeUndefined(); expect(store.get('two')).toBeDefined();
});

it('a new start reuses only the assigned staff id and preserves its reply target/key after reload', async () => {
  api.conversations.mockResolvedValue({ items: [row('old-staff', '8', 200), row('current', '7')] });
  api.conversation.mockResolvedValue(row('current'));
  api.replyConversation.mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'lost response' }));
  let store = useConversations(); await store.refreshCategories();
  await expect(store.startConversation('support', 'original')).rejects.toThrow('lost response');
  const first = api.replyConversation.mock.calls[0]; expect(first[0].id).toBe('current');
  expect(api.startConversation).not.toHaveBeenCalled();
  setActivePinia(createPinia()); store = useConversations(); await store.refreshCategories();
  api.advisor.mockResolvedValue({ currentAdvisorId: 8 });
  api.replyConversation.mockResolvedValue(row('current'));
  await expect(store.startConversation('support', 'original')).resolves.toBe('current');
  expect(api.replyConversation.mock.calls[1][2]).toBe(first[2]);
  expect(api.replyConversation.mock.calls[1][0].id).toBe('current');
});

it('an original unknown create never changes operation when another same-staff thread appears', async () => {
  let store = useConversations(); await store.refreshCategories();
  api.startConversation.mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'unknown create' }));
  await expect(store.startConversation('support', 'opening')).rejects.toThrow('unknown create');
  const firstKey = api.startConversation.mock.calls[0][2];
  setActivePinia(createPinia()); store = useConversations(); await store.refreshCategories();
  api.conversations.mockResolvedValue({ items: [row('another')] }); api.startConversation.mockResolvedValue(row('original'));
  await expect(store.startConversation('support', 'opening')).resolves.toBe('original');
  expect(api.startConversation.mock.calls[1][2]).toBe(firstKey); expect(api.replyConversation).not.toHaveBeenCalled();
});
