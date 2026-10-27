import { expect, it, vi } from 'vitest';
import { ApiError } from './errors';
import { createSupportApi } from './support-api';

it('keeps only a missing optional deletion capability unavailable; authorization and service failures remain errors', async () => {
  for (const status of [404, 403, 500]) {
    const error = new ApiError({ kind: 'http', status, message: 'unavailable' });
    const api = createSupportApi({ request: vi.fn().mockRejectedValue(error) } as never);
    if (status === 404) await expect(api.conversationManagement()).resolves.toEqual({ clearUserHistory: false, clearedPeers: [] });
    else await expect(api.conversationManagement()).rejects.toBe(error);
  }
});
it('never accepts physical deletion, dismissal or a partial/foreign receipt as account-side clearing', async () => {
  for (const result of [{ conversationNo: 'A', throughMessageId: 9 }, { peerKey: 'agent:1', historyCleared: true, deletedConversationNos: ['A'] },
    { scope: 'USER_VIEW', userScopeCleared: true, peerKey: 'agent:1', throughMessageId: 9, conversationNos: ['A'] },
    { scope: 'USER_VIEW', userScopeCleared: true, peerKey: 'agent:2', throughMessageId: 9, conversationNos: ['A', 'B'] }]) {
    const api = createSupportApi({ request: async () => result } as never);
    await expect(api.deleteConversation('A', 'agent:1', [{ id: 'A', version: 1 }, { id: 'B', version: 2 }] as never, 'delete-key')).rejects.toThrow('SUPPORT_USER_CLEAR_RESPONSE_INVALID');
  }
});
it('sends one versioned delete with the original key and accepts its command readback', async () => {
  const clearance = { scope: 'USER_VIEW', userScopeCleared: true, peerKey: 'agent:1', throughMessageId: 9, conversationNos: ['A', 'B'] };
  const request = vi.fn().mockResolvedValueOnce(clearance).mockResolvedValueOnce({ resultType: 'CONVERSATION_USER_CLEAR', result: clearance });
  const api = createSupportApi({ request } as never);
  await api.deleteConversation('A', 'agent:1', [{ id: 'A', version: 1 }, { id: 'B', version: 2 }] as never, 'delete-key');
  expect(request).toHaveBeenCalledWith({ method: 'DELETE', path: '/api/app/support/conversations/A', idempotencyKey: 'delete-key',
    body: { scope: 'USER_VIEW', peerKey: 'agent:1', conversationIds: ['A', 'B'], expectedVersions: { A: 1, B: 2 } } });
  await expect(api.commandResult('delete-key')).resolves.toEqual({ kind: 'conversation-user-clear', clearance });
});

it('validates capability markers and never treats the old deleteHistory flag as a user-view capability', async () => {
  for (const result of [{ deleteHistory: true }, { clearUserHistory: true, clearedPeers: [{}] }]) {
    const api = createSupportApi({ request: async () => result } as never);
    await expect(api.conversationManagement()).rejects.toBeInstanceOf(ApiError);
  }
});
