import type { ApiClient } from './api-client';
import type { Conversation } from '@/domain/support';
import { ApiError } from './errors';

/** Account-side visibility only. Staff history and original message IDs remain intact. */
export interface ConversationUserClear {
  scope: 'USER_VIEW';
  userScopeCleared: true;
  peerKey: string;
  throughMessageId: number;
  conversationNos: string[];
}
export interface ConversationManagement {
  clearUserHistory: boolean;
  clearedPeers: ConversationUserClear[];
}
export function parseConversationUserClear(data: unknown): ConversationUserClear {
  const value = data as ConversationUserClear | null;
  if (!value || value.scope !== 'USER_VIEW' || value.userScopeCleared !== true
      || typeof value.peerKey !== 'string' || !value.peerKey
      || !Number.isSafeInteger(value.throughMessageId) || value.throughMessageId < 0
      || !Array.isArray(value.conversationNos) || !value.conversationNos.length
      || value.conversationNos.some(id => typeof id !== 'string' || !id.trim())
      || new Set(value.conversationNos).size !== value.conversationNos.length)
    throw new ApiError({ kind: 'protocol', message: 'SUPPORT_USER_CLEAR_RESPONSE_INVALID' });
  return value;
}

/** Negotiate account-side clearing; older deployments may not expose this capability yet. */
export function createConversationManagement(client: ApiClient) {
  return {
    async conversationManagement(): Promise<ConversationManagement> {
      let data: unknown;
      try { data = await client.request({ method: 'GET', path: '/api/app/support/conversation-management' }); }
      catch (cause) {
        if (cause instanceof ApiError && cause.status === 404) return { clearUserHistory: false, clearedPeers: [] };
        throw cause;
      }
      const value = data as ConversationManagement | null;
      if (!value || typeof value.clearUserHistory !== 'boolean' || !Array.isArray(value.clearedPeers))
        throw new ApiError({ kind: 'protocol', message: 'SUPPORT_MANAGEMENT_RESPONSE_INVALID' });
      return { clearUserHistory: value.clearUserHistory, clearedPeers: value.clearedPeers.map(parseConversationUserClear) };
    },
    async deleteConversation(id: string, peerKey: string, members: Conversation[], key: string): Promise<ConversationUserClear> {
      const conversationIds = members.map(row => row.id).sort();
      const data = parseConversationUserClear(await client.request({ method: 'DELETE',
        path: `/api/app/support/conversations/${encodeURIComponent(id)}`, idempotencyKey: key,
        body: { scope: 'USER_VIEW', peerKey, conversationIds, expectedVersions: Object.fromEntries(members.map(row => [row.id, row.version])) } }));
      if (data.peerKey !== peerKey
          || conversationIds.some(id => !data.conversationNos.includes(id))
          || members.some(row => (row.lastPublicMessageId ?? 0) > data.throughMessageId))
        throw new ApiError({ kind: 'protocol', message: 'SUPPORT_USER_CLEAR_RESPONSE_INVALID' });
      return data;
    },
  };
}
