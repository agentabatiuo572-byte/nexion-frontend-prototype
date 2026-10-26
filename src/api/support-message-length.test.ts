import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Conversation, Ticket } from '@/domain/support';
import { MessageTextValidationError } from '@/lib/message-length-policy';
import { isConversationDeliveryAmbiguous } from '@/lib/conversation-delivery-policy';
import { ApiError } from './errors';
import { createSupportApi, type SupportApi } from './support-api';
import { setAppConversationRealtime, withConversationRealtime } from './app-conversation-realtime';
import type { ConversationRealtime } from './conversation-realtime';

const key = 'original-message-key';
const conversation = { id: 'CV-1', status: 'open', version: 7 } as Conversation;
const ticket = { id: 'TK-1', status: 'pending_user', version: 9 } as Ticket;
const conversationDetail = {
  conversation: { conversationNo: 'CV-1', conversationType: 'advisor', status: 'OPEN', version: 8,
    ownerAgentName: 'Agent', unreadCount: 0, lastMessage: 'Message', lastMessageAt: 1_777_000_000_000 },
  messages: [], historyTruncated: false, nextCursor: null,
};
const ticketDetail = {
  ticket: { ticketNo: 'TK-1', title: 'Subject', category: 'technical', status: 'OPEN', priority: 'NORMAL', version: 10,
    createdAt: 1_777_000_000_000, updatedAt: 1_777_000_000_001, lastMessageAt: 1_777_000_000_001,
    messageCount: 0, userUnreadCount: 0, assignedAdminName: 'Agent' },
  messages: [], historyTruncated: false, nextCursor: null,
};
type Entry = {
  name: string;
  path: string;
  field: 'openingText' | 'body';
  response: typeof conversationDetail | typeof ticketDetail;
  send(api: SupportApi, text: string, attachmentId?: string): Promise<unknown>;
};
const conversationEntries: Entry[] = [
  { name: 'conversation create', path: '/api/app/support/conversations', field: 'openingText', response: conversationDetail,
    send: (api, text, attachmentId) => api.startConversation('advisor', text, key, attachmentId) },
  { name: 'conversation reply', path: '/api/app/support/conversations/CV-1/replies', field: 'body', response: conversationDetail,
    send: (api, text, attachmentId) => api.replyConversation(conversation, text, key, attachmentId) },
];
const entries: Entry[] = [...conversationEntries,
  { name: 'ticket create', path: '/api/app/support/tickets', field: 'body', response: ticketDetail,
    send: (api, text) => api.createTicket({ category: 'technical', subject: 'Subject', body: text }, key) },
  { name: 'ticket reply', path: '/api/app/support/tickets/TK-1/replies', field: 'body', response: ticketDetail,
    send: (api, text) => api.replyTicket(ticket, text, key) },
];

afterEach(() => { setAppConversationRealtime(null); });

describe.each(entries)('$name direct API text validation', entry => {
  it('sends the full 2000-unit normalized multiline body with the original request identity', async () => {
    const text = `${'a\n'.repeat(999)}中文`;
    const request = vi.fn().mockResolvedValue(entry.response);
    const api = createSupportApi({ request } as never);
    await expect(entry.send(api, ` \r\n${text}\n\t `)).resolves.toBeDefined();
    expect(request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ method: 'POST', path: entry.path,
      idempotencyKey: key, body: expect.objectContaining({ [entry.field]: text, clientMessageId: key }) }));
    if (entry.name.startsWith('conversation')) expect(request.mock.calls[0][0].timeoutMs).toBe(12_000);
    if (entry.name.endsWith('reply')) expect(request.mock.calls[0][0].body).toMatchObject({
      expectedStatus: entry.name.startsWith('conversation') ? 'OPEN' : 'PENDING_USER',
      expectedVersion: entry.name.startsWith('conversation') ? 7 : 9,
    });
  });

  it.each([
    { label: 'empty text', text: ' \n\t\u3000', reason: 'required', message: 'MESSAGE_TEXT_REQUIRED' },
    { label: '2001 ASCII units', text: 'x'.repeat(2001), reason: 'too_long', message: 'MESSAGE_TEXT_TOO_LONG' },
    { label: '1000 emoji plus one unit', text: `${'😀'.repeat(1000)}x`, reason: 'too_long', message: 'MESSAGE_TEXT_TOO_LONG' },
    { label: 'non-string runtime input', text: null, reason: 'invalid_type', message: 'MESSAGE_TEXT_INVALID' },
  ])('rejects $label before dispatch as a stable explicit refusal', async ({ text, reason, message }) => {
    const request = vi.fn().mockResolvedValue(entry.response);
    const api = createSupportApi({ request } as never);
    const cause = await entry.send(api, text as unknown as string).catch(error => error);
    expect(cause).toBeInstanceOf(MessageTextValidationError);
    expect(cause).toMatchObject({ reason, message, kind: 'business', code: 422, retryable: false });
    expect(isConversationDeliveryAmbiguous(cause)).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});

describe.each(conversationEntries)('$name image captions and transport boundary', entry => {
  it.each(['', ' \n\t', '😀'.repeat(1000)])('accepts empty or full-length image captions without altering attachment identity %#', async text => {
    const request = vi.fn().mockResolvedValue(entry.response);
    await entry.send(createSupportApi({ request } as never), text, 'private-original-image');
    expect(request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ idempotencyKey: key, timeoutMs: 12_000,
      body: expect.objectContaining({ [entry.field]: text.trim(), kind: 'IMAGE', attachmentId: 'private-original-image', clientMessageId: key }) }));
  });

  it('does not let an attachment bypass the 2000-unit caption limit', async () => {
    const request = vi.fn();
    await expect(entry.send(createSupportApi({ request } as never), 'x'.repeat(2001), 'private-original-image'))
      .rejects.toMatchObject({ message: 'MESSAGE_TEXT_TOO_LONG' });
    expect(request).not.toHaveBeenCalled();
  });

  it('blocks invalid text before either WebSocket or HTTP transport can dispatch', async () => {
    const command = vi.fn();
    const request = vi.fn();
    setAppConversationRealtime({ command } as unknown as ConversationRealtime);
    const api = createSupportApi(withConversationRealtime({ request } as never));
    await expect(entry.send(api, 'x'.repeat(2001))).rejects.toBeInstanceOf(MessageTextValidationError);
    expect(command).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    new ApiError({ kind: 'http', status: 403, message: 'explicit refusal' }),
    new ApiError({ kind: 'network', message: 'lost acknowledgement', retryable: true }),
  ])('preserves an actual transport error and the caller key %#', async cause => {
    const request = vi.fn().mockRejectedValue(cause);
    await expect(entry.send(createSupportApi({ request } as never), ' Original text ')).rejects.toBe(cause);
    expect(request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ idempotencyKey: key, timeoutMs: 12_000,
      body: expect.objectContaining({ [entry.field]: 'Original text', clientMessageId: key }) }));
  });
});

it('keeps the input limit separate from historical canonical message parsing', async () => {
  const text = 'Historical text '.repeat(150);
  const request = vi.fn().mockResolvedValue({ ...conversationDetail, messages: [
    { id: 1, senderType: 'user', content: text, createdAt: 1_777_000_000_000, clientMessageId: key },
  ] });
  const result = await createSupportApi({ request } as never).conversation('CV-1');
  expect(result.messages[0]).toMatchObject({ text: text.trim(), clientMessageId: key });
});
