import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Conversation } from '@/domain/support';
import { createSupportApi } from '@/api/support-api';
import { ApiError } from '@/api/errors';
import { installSupportStorage } from '@/test/storage-setup';

installSupportStorage();

const api = vi.hoisted(() => ({ authorityRevision: vi.fn(async () => 'run-1'), commandResult: vi.fn(async () => null),
  conversations: vi.fn(), conversationDismissals: vi.fn(async () => []), dismissConversation: vi.fn() }));
vi.mock('@/api/runtime', () => ({ remoteApiEnabled: true, supportApi: api }));
const { useConversations } = await import('./conversations');
const row = (ids = [11], version = 1): Conversation => ({ id: 'CV-1', type: 'advisor', status: 'open', sessionStatus: 'active',
  version, lastTs: version, unread: 1, messages: ids.map(id => ({ id: String(id), sender: 'agent', ts: id, text: 'hello' })) } as Conversation);
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; };
beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); api.conversationDismissals.mockResolvedValue([]); });

describe('inbox dismissal API boundaries', () => {
  it('reads only the personal marker endpoint and validates the returned watermarks', async () => {
    const request = vi.fn(async () => [{ conversationNo: 'CV-1', throughMessageId: 11 }]);
    const remote = createSupportApi({ request } as never);
    await expect(remote.conversationDismissals()).resolves.toEqual([{ conversationNo: 'CV-1', throughMessageId: 11 }]);
    expect(request).toHaveBeenCalledExactlyOnceWith({ method: 'GET', path: '/api/app/support/conversation-dismissals' });
  });
  it('treats only the missing optional endpoint as unavailable during rollout', async () => {
    const request = vi.fn().mockRejectedValue(new ApiError({ kind: 'http', status: 404, message: 'not installed' }));
    await expect(createSupportApi({ request } as never).conversationDismissals()).resolves.toBeNull();
  });
  it.each([403, 500])('does not turn %s into an empty personal inbox snapshot', async status => {
    const cause = new ApiError({ kind: 'http', status, message: 'fixture rejection' });
    const request = vi.fn().mockRejectedValue(cause);
    await expect(createSupportApi({ request } as never).conversationDismissals()).rejects.toBe(cause);
  });
  it.each([{}, [{ conversationNo: '', throughMessageId: 11 }], [{ conversationNo: 'CV-1', throughMessageId: 0 }]])('rejects a malformed marker response', async value => {
    const request = vi.fn(async () => value);
    await expect(createSupportApi({ request } as never).conversationDismissals()).rejects.toThrow('SUPPORT_DISMISSAL_RESPONSE_INVALID');
  });
  it.each([
    { conversationNo: 'CV-other', throughMessageId: 11 },
    { conversationNo: 'CV-1', throughMessageId: 10 },
  ])('rejects a mismatched dismissal acknowledgment', async value => {
    const request = vi.fn(async () => value);
    await expect(createSupportApi({ request } as never).dismissConversation('CV-1', 11)).rejects.toThrow('SUPPORT_DISMISSAL_RESPONSE_INVALID');
  });
  it('allows a monotonically newer acknowledgment without changing read state', async () => {
    const request = vi.fn(async () => ({ conversationNo: 'CV-1', throughMessageId: 12 }));
    await expect(createSupportApi({ request } as never).dismissConversation('CV-1', 11)).resolves.toEqual({ conversationNo: 'CV-1', throughMessageId: 12 });
    expect(request).toHaveBeenCalledExactlyOnceWith({ method: 'POST', path: '/api/app/support/conversations/CV-1/dismiss', body: { throughMessageId: 11 } });
  });
  it('refuses an invalid requested boundary before sending a command', async () => {
    const request = vi.fn();
    await expect(createSupportApi({ request } as never).dismissConversation('CV-1', 0)).rejects.toThrow('SUPPORT_DISMISSAL_BOUNDARY_INVALID');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('personal inbox dismissal', () => {
  it('keeps list reads available during backend rollout without forgetting known removals', async () => {
    const store = useConversations(); api.conversations.mockResolvedValue({ items: [row()] });
    api.conversationDismissals.mockResolvedValue(null as never); await store.refresh();
    expect(store.byType('advisor')).toHaveLength(1); expect(store.dismissalAvailable).toBe(false);
    api.conversationDismissals.mockResolvedValue([{ conversationNo: 'CV-1', throughMessageId: 11 }] as never); await store.refresh();
    expect(store.byType('advisor')).toHaveLength(0); expect(store.dismissalAvailable).toBe(true);
    api.conversationDismissals.mockResolvedValue(null as never); await store.refresh();
    expect(store.byType('advisor')).toHaveLength(0); expect(store.dismissalAvailable).toBe(false);
  });
  it('removes an actual list-only API row and reappears from the next header without fetching a transcript', async () => {
    let latest = 11;
    const request = vi.fn(async () => ({ total: 1, pageSize: 100, records: [{ id: 1, conversationNo: 'CV-1', conversationType: 'advisor', status: 'OPEN',
      version: latest, lastMessageAt: '2026-09-09T10:00:00Z', unreadCount: 1, ownerAgentName: 'Advisor', lastMessage: 'hello', lastPublicMessageId: latest }] }));
    const realApi = createSupportApi({ request } as never);
    api.conversations.mockImplementation(() => realApi.conversations());
    const store = useConversations(); await store.refresh();
    expect(store.get('CV-1')?.messages).toEqual([]);
    api.dismissConversation.mockResolvedValue({ conversationNo: 'CV-1', throughMessageId: 11 });
    await store.dismissConversation('CV-1'); expect(store.byType('advisor')).toHaveLength(0);
    latest = 12; await store.refresh(); expect(store.byType('advisor')).toHaveLength(1);
    expect(request.mock.calls).toHaveLength(2);
  });
  it('hides only the inbox row and badge, retaining the transcript; a later message restores both', async () => {
    const store = useConversations(); store.conversations.push(row());
    api.dismissConversation.mockResolvedValue({ conversationNo: 'CV-1', throughMessageId: 11 });
    await store.dismissConversation('CV-1');
    expect(store.byType('advisor')).toEqual([]); expect(store.totalUnread).toBe(0);
    expect(store.get('CV-1')?.messages).toHaveLength(1);
    api.conversations.mockResolvedValue({ items: [row([11, 12], 2)] });
    await store.refresh();
    expect(store.byType('advisor')).toHaveLength(1); expect(store.totalUnread).toBe(1);
  });
  it('does not hide a message arriving while removal is in flight', async () => {
    const pending = deferred<any>(); api.dismissConversation.mockReturnValue(pending.promise);
    const store = useConversations(); store.conversations.push(row());
    const removal = store.dismissConversation('CV-1');
    store.conversations.splice(0, 1, row([11, 12], 2));
    pending.resolve({ conversationNo: 'CV-1', throughMessageId: 11 }); await removal;
    expect(api.dismissConversation).toHaveBeenCalledWith('CV-1', 11);
    expect(store.byType('advisor')).toHaveLength(1);
  });
  it('keeps the row on a failed removal', async () => {
    api.dismissConversation.mockRejectedValue(new Error('offline'));
    const store = useConversations(); store.conversations.push(row());
    await expect(store.dismissConversation('CV-1')).rejects.toThrow('offline');
    expect(store.byType('advisor')).toHaveLength(1);
  });
  it('restores server dismissal after reload without marking messages read', async () => {
    api.conversationDismissals.mockResolvedValue([{ conversationNo: 'CV-1', throughMessageId: 11 }] as never);
    api.conversations.mockResolvedValue({ items: [row()] });
    const store = useConversations(); await store.refresh();
    expect(store.byType('advisor')).toEqual([]); expect(store.get('CV-1')?.unread).toBe(1);
  });
  it('cannot apply a late removal to a different account', async () => {
    const pending = deferred<any>(); api.dismissConversation.mockReturnValue(pending.promise);
    const store = useConversations(); store.conversations.push(row());
    const removal = store.dismissConversation('CV-1'); store.bindAccount('user:2'); store.conversations.push(row());
    pending.resolve({ conversationNo: 'CV-1', throughMessageId: 11 });
    await expect(removal).rejects.toThrow('SUPPORT_ACCOUNT_SCOPE_CHANGED');
    expect(store.byType('advisor')).toHaveLength(1);
  });
});
