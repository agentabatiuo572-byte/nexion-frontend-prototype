import type { Conversation } from '@/domain/support';

export interface ConversationThread extends Conversation {
  peerKey: string;
  conversationIds: string[];
}

export function conversationPeerKey(conversation: Conversation): string {
  return conversation.ownerAgentId ? `agent:${conversation.ownerAgentId}` : `conversation:${conversation.id}`;
}

/** Keep original conversation rows for their CAS versions, receipts and cursors. */
export function groupConversationThreads(rows: Conversation[]): ConversationThread[] {
  const groups = new Map<string, Conversation[]>();
  for (const row of rows) {
    if (row.type === 'ai') continue;
    const key = conversationPeerKey(row);
    const group = groups.get(key) ?? [];
    group.push(row); groups.set(key, group);
  }
  return [...groups].map(([peerKey, members]) => {
    const recent = [...members].sort((a, b) => b.lastTs - a.lastTs || a.id.localeCompare(b.id));
    const current = recent.find(row => row.status === 'open' || row.status === 'resolved') ?? recent[0];
    const messages = new Map(recent.flatMap(row => row.messages).map(message => [message.id, message]));
    const cursors = recent.map(row => row.historyNextCursor).filter((value): value is number => value != null);
    return { ...current, peerKey, conversationIds: recent.map(row => row.id),
      unread: recent.reduce((sum, row) => sum + row.unread, 0), lastTs: recent[0].lastTs, lastMessage: recent[0].lastMessage,
      messages: [...messages.values()].sort((a, b) => a.ts - b.ts || Number(a.id) - Number(b.id)),
      historyTruncated: recent.some(row => row.historyTruncated), historyNextCursor: cursors.length ? Math.max(...cursors) : null };
  }).sort((a, b) => b.lastTs - a.lastTs);
}
