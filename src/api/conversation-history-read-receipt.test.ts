import { expect, it, vi } from 'vitest';
import { catchUpConversation } from './conversation-history';
import type { Conversation } from '../domain/support';

it('refreshes read receipts in previously loaded history outside the latest 100 messages', async () => {
  const page = (first: number, last: number, status: 'sent' | 'read'): Conversation => ({
    id: 'CV-receipts', version: 1,
    messages: Array.from({ length: last - first + 1 }, (_, index) => ({
      id: String(first + index), sender: 'user', text: 'fixture', ts: first + index, status,
    })),
    historyTruncated: first > 1, historyNextCursor: first > 1 ? first : null,
  } as Conversation);
  const fetchPage = vi.fn(async () => page(1, 100, 'read'));
  const result = await catchUpConversation(page(101, 200, 'read'), page(1, 200, 'sent'), fetchPage, () => true);
  expect(result.messages).toHaveLength(200);
  expect(result.messages.filter(message => message.status !== 'read')).toHaveLength(0);
  expect(fetchPage).toHaveBeenCalledTimes(1);
});

it('does not infer older receipts from the latest page and skips already confirmed history', async () => {
  const page = (first: number, last: number, status: 'sent' | 'read'): Conversation => ({
    id: 'CV-receipts', version: 1,
    messages: Array.from({ length: last - first + 1 }, (_, index) => ({
      id: String(first + index), sender: 'user', text: 'fixture', ts: first + index, status,
    })), historyTruncated: first > 1, historyNextCursor: first > 1 ? first : null,
  } as Conversation);
  const fetchPage = vi.fn(async () => page(1, 100, 'sent'));
  const result = await catchUpConversation(page(101, 200, 'read'), page(1, 200, 'sent'), fetchPage, () => true);
  expect(result.messages.filter(message => message.status === 'sent')).toHaveLength(100);
  fetchPage.mockClear();
  await catchUpConversation(page(101, 200, 'read'), page(1, 200, 'read'), fetchPage, () => true);
  expect(fetchPage).not.toHaveBeenCalled();
});
