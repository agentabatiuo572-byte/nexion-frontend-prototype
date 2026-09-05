import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { Conversation, ConvMessage, SupportFaq, Ticket, TicketCategory, TicketMessage, TicketPriority, TicketStatus } from "@/domain/support";

interface Page<T> { items: T[]; total: number }
interface TicketInput { category: TicketCategory; subject: string; body: string }
interface ConversationTicketResult { conversation: Conversation; ticket: Ticket }
export type SupportCommandResult =
  | { kind: "ticket"; ticket: Ticket }
  | { kind: "conversation"; conversation: Conversation }
  | { kind: "conversation-ticket"; conversation: Conversation; ticket: Ticket };
export interface SupportApi {
  acceptanceRunId(): Promise<string>;
  tickets(): Promise<Page<Ticket>>;
  ticket(id: string): Promise<Ticket>;
  createTicket(input: TicketInput, key: string): Promise<Ticket>;
  replyTicket(ticket: Ticket, body: string, key: string): Promise<Ticket>;
  closeTicket(ticket: Ticket, key: string): Promise<Ticket>;
  conversations(): Promise<Page<Conversation>>;
  conversation(id: string): Promise<Conversation>;
  markConversationRead(conversation: Conversation, lastSeenMessageId: number): Promise<Conversation>;
  startConversation(type: Exclude<Conversation["type"], "ai">, openingText: string, key: string): Promise<Conversation>;
  replyConversation(conversation: Conversation, body: string, key: string): Promise<Conversation>;
  convertConversationToTicket(conversation: Conversation, category: TicketCategory, title: string, key: string): Promise<ConversationTicketResult>;
  commandResult(key: string): Promise<SupportCommandResult | null>;
  faqs(language: string, category?: string): Promise<SupportFaq[]>;
}

function invalid(message: string): never { throw new ApiError({ kind: "protocol", message }); }
function row(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function text(value: unknown, empty = false): string | null { if (typeof value !== "string") return null; const v = value.trim(); return v || empty ? v : null; }
function integer(value: unknown, min = 0): number | null { const v = typeof value === "number" ? value : Number(value); return Number.isSafeInteger(v) && v >= min ? v : null; }
function time(value: unknown): number | null { if (typeof value !== "string" && typeof value !== "number") return null; const v = typeof value === "number" ? value : Date.parse(value); return Number.isFinite(v) && v > 0 ? v : null; }
function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null { const v = text(value)?.toLowerCase() as T; return allowed.includes(v) ? v : null; }
function requiredKey(key: string): string { const v = key.trim(); return v.length >= 8 && v.length <= 128 ? v : invalid("SUPPORT_IDEMPOTENCY_KEY_INVALID"); }
function pathId(id: string): string { const v = id.trim(); return v ? encodeURIComponent(v) : invalid("SUPPORT_RESOURCE_ID_INVALID"); }

const ticketStatuses = ["open", "in_progress", "pending_user", "resolved", "closed"] as const;
const ticketPriorities = ["low", "normal", "high", "urgent"] as const;
const ticketCategories = ["account", "withdrawal", "deposit", "hardware", "earnings", "genesis", "technical", "other"] as const;

function parseTicketHeader(value: unknown): Ticket {
  const v = row(value); const id = text(v?.ticketNo); const subject = text(v?.title);
  const category = enumValue(v?.category, ticketCategories); const status = enumValue(v?.status, ticketStatuses);
  const priority = enumValue(v?.priority, ticketPriorities) as TicketPriority | null; const version = integer(v?.version);
  const createdAt = time(v?.createdAt); const updatedAt = time(v?.updatedAt); const lastReplyAt = time(v?.lastMessageAt);
  const messageCount = integer(v?.messageCount); const unread = integer(v?.userUnreadCount); const owner = text(v?.assignedAdminName, true);
  if (!v || !id || !subject || !category || !status || !priority || version === null || createdAt === null || updatedAt === null || lastReplyAt === null || messageCount === null || unread === null || owner === null) invalid("SUPPORT_TICKET_RESPONSE_INVALID");
  return { id, subject, category, status, priority, version, createdAt, updatedAt, lastReplyAt, messageCount, unread, owner: owner || "Unassigned", messages: [] };
}
function parseTicketMessage(value: unknown): TicketMessage {
  const v = row(value); const id = integer(v?.id, 1); const ts = time(v?.createdAt); const body = text(v?.content);
  const senderType = text(v?.senderType)?.toLowerCase(); const author = senderType === "user" ? "user" : senderType === "agent" ? "agent" : null;
  const agentName = author === "agent" ? text(v?.senderName, true) ?? undefined : undefined;
  if (!v || id === null || ts === null || !body || !author) invalid("SUPPORT_TICKET_RESPONSE_INVALID");
  return { id: String(id), ts, body, author, agentName };
}
function parseTicketDetail(value: unknown): Ticket {
  const v = row(value); if (!v || !Array.isArray(v.messages)) invalid("SUPPORT_TICKET_RESPONSE_INVALID");
  const ticket = parseTicketHeader(v.ticket); const messages = v.messages.map(parseTicketMessage);
  if (messages.length > ticket.messageCount) invalid("SUPPORT_TICKET_RESPONSE_INVALID");
  return { ...ticket, messages };
}
function parseTicketPage(value: unknown): Page<Ticket> {
  const v = row(value); const total = integer(v?.total); if (!v || !Array.isArray(v.records) || total === null) invalid("SUPPORT_TICKET_RESPONSE_INVALID");
  const items = v.records.map(parseTicketHeader); if (new Set(items.map(i => i.id)).size !== items.length) invalid("SUPPORT_TICKET_RESPONSE_INVALID"); return { items, total };
}

function parseConversationHeader(value: unknown): Conversation {
  const v = row(value); const id = text(v?.conversationNo); const type = enumValue(v?.conversationType, ["advisor", "support"] as const);
  const status = enumValue(v?.status, ["open", "transferred", "resolved", "closed"] as const); const version = integer(v?.version);
  const lastTs = time(v?.lastMessageAt) ?? time(v?.updatedAt); const unread = integer(v?.unreadCount); const agentName = text(v?.ownerAgentName, true);
  const lastMessage = text(v?.lastMessage, true);
  if (!v || !id || !type || !status || version === null || lastTs === null || unread === null || agentName === null || lastMessage === null) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  return { id, type, status, version, agentName: agentName || "Unassigned", roleKey: type === "advisor" ? "roleAdvisor" : "roleSupport", avatarTint: type === "advisor" ? "var(--v5-brand)" : "var(--v5-tech-cyan)", messages: [], unread, lastTs, lastMessage, sessionStatus: status === "closed" ? "closed" : "active" };
}
function parseConversationMessage(value: unknown): ConvMessage {
  const v = row(value); const id = integer(v?.id, 1); const ts = time(v?.createdAt); const body = text(v?.content);
  const raw = text(v?.senderType)?.toLowerCase(); const sender = raw === "user" ? "user" : raw === "agent" ? "agent" : null;
  const receipt = text(v?.receiptStatus)?.toLowerCase(); const status = receipt === "read" ? "read" : receipt === "sent" ? "sent" : undefined;
  if (!v || id === null || ts === null || !body || !sender) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  return { id: String(id), sender, text: body, ts, status };
}
function parseConversationDetail(value: unknown): Conversation {
  const v = row(value); if (!v || !Array.isArray(v.messages)) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  return { ...parseConversationHeader(v.conversation), messages: v.messages.map(parseConversationMessage) };
}
function parseConversationPage(value: unknown): Page<Conversation> {
  const v = row(value); const total = integer(v?.total); if (!v || !Array.isArray(v.records) || total === null) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  const items = v.records.map(parseConversationHeader); if (new Set(items.map(i => i.id)).size !== items.length) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID"); return { items, total };
}
function parseFaq(value: unknown): SupportFaq {
  const v = row(value); const id = text(v?.id); const category = text(v?.category); const question = text(v?.question); const answer = text(v?.answer);
  const language = text(v?.language); const sortOrder = integer(v?.sortOrder); const version = integer(v?.version); const updatedAt = time(v?.updatedAt);
  if (!v || !id || !category || !question || !answer || !language || sortOrder === null || version === null || updatedAt === null) invalid("SUPPORT_FAQ_RESPONSE_INVALID");
  return { id, category, question, answer, language, sortOrder, version, updatedAt };
}

export function createSupportApi(client: ApiClient): SupportApi {
  let supportRoot: Promise<{ path: string; runId: string }> | undefined;
  async function rootPath(): Promise<{ path: string; runId: string }> {
    if (!supportRoot) supportRoot = client.request({ method: "GET", path: "/api/app/support/acceptance/projection" })
      .then((proof) => {
        const v = row(proof);
        if (!v || v.source !== "mock" || v.sourceEnvironment !== "SANDBOX" || v.strictProfile !== true || typeof v.runId !== "string" || !v.runId.trim()) {
          invalid("SUPPORT_ACCEPTANCE_PROOF_INVALID");
        }
        return { path: "/api/app/support/acceptance", runId: v.runId.trim() };
      })
      .catch((cause: unknown) => {
        const error = cause instanceof ApiError ? cause : null;
        // A missing acceptance-only controller is the sole production fallback.
        if (error?.status === 404) return { path: "/api/app/support", runId: "production" };
        supportRoot = undefined;
        throw cause;
      });
    return supportRoot;
  }
  async function supportPath(path: string): Promise<string> { return `${(await rootPath()).path}${path}`; }
  function parseCommandResult(value: unknown): SupportCommandResult | null {
    if (value == null) return null;
    const v = row(value); const type = text(v?.resultType)?.toLowerCase();
    if (!v || !type) invalid("SUPPORT_COMMAND_RESULT_INVALID");
    if (type === "ticket") return { kind: "ticket", ticket: parseTicketDetail(v.result) };
    if (type === "conversation") return { kind: "conversation", conversation: parseConversationDetail(v.result) };
    if (type === "conversation-ticket") {
      const result = row(v.result); if (!result) invalid("SUPPORT_COMMAND_RESULT_INVALID");
      return { kind: "conversation-ticket", conversation: parseConversationHeader(result.conversation), ticket: parseTicketDetail(result.ticket) };
    }
    invalid("SUPPORT_COMMAND_RESULT_INVALID");
  }
  async function allTickets(): Promise<Page<Ticket>> {
    const items: Ticket[] = []; let pageNum = 1; let total = 0;
    do {
      const page = parseTicketPage(await client.request({ method: "GET", path: `${await supportPath("/tickets")}?pageNum=${pageNum}&pageSize=100` }));
      if (pageNum === 1) total = page.total;
      if (page.items.length === 0 && items.length < total) invalid("SUPPORT_TICKET_PAGE_INCOMPLETE");
      items.push(...page.items); pageNum += 1;
    } while (items.length < total);
    if (items.length !== total || new Set(items.map(item => item.id)).size !== items.length) invalid("SUPPORT_TICKET_PAGE_INCOMPLETE");
    return { items, total };
  }
  async function allConversations(): Promise<Page<Conversation>> {
    const items: Conversation[] = []; let pageNum = 1; let total = 0;
    do {
      const page = parseConversationPage(await client.request({ method: "GET", path: `${await supportPath("/conversations")}?pageNum=${pageNum}&pageSize=100` }));
      if (pageNum === 1) total = page.total;
      if (page.items.length === 0 && items.length < total) invalid("SUPPORT_CONVERSATION_PAGE_INCOMPLETE");
      items.push(...page.items); pageNum += 1;
    } while (items.length < total);
    if (items.length !== total || new Set(items.map(item => item.id)).size !== items.length) invalid("SUPPORT_CONVERSATION_PAGE_INCOMPLETE");
    return { items, total };
  }
  return {
    acceptanceRunId: async () => (await rootPath()).runId,
    tickets: allTickets,
    ticket: async id => parseTicketDetail(await client.request({ method: "GET", path: await supportPath(`/tickets/${pathId(id)}`) })),
    createTicket: async (input, key) => parseTicketDetail(await client.request({ method: "POST", path: await supportPath("/tickets"), idempotencyKey: requiredKey(key), body: { category: input.category, title: input.subject.trim(), body: input.body.trim(), clientMessageId: key } })),
    replyTicket: async (ticket, body, key) => parseTicketDetail(await client.request({ method: "POST", path: await supportPath(`/tickets/${pathId(ticket.id)}/replies`), idempotencyKey: requiredKey(key), body: { body: body.trim(), expectedStatus: ticket.status.toUpperCase(), expectedVersion: ticket.version, clientMessageId: key } })),
    closeTicket: async (ticket, key) => parseTicketDetail(await client.request({ method: "POST", path: await supportPath(`/tickets/${pathId(ticket.id)}/close`), idempotencyKey: requiredKey(key), body: { expectedStatus: ticket.status.toUpperCase(), expectedVersion: ticket.version, clientMessageId: key } })),
    conversations: allConversations,
    conversation: async id => parseConversationDetail(await client.request({ method: "GET", path: await supportPath(`/conversations/${pathId(id)}`) })),
    markConversationRead: async (conversation, lastSeenMessageId) => parseConversationDetail(await client.request({
      method: "POST", path: await supportPath(`/conversations/${pathId(conversation.id)}/read`),
      body: { lastSeenMessageId, expectedStatus: conversation.status.toUpperCase(), expectedVersion: conversation.version },
    })),
    startConversation: async (conversationType, openingText, key) => parseConversationDetail(await client.request({ method: "POST", path: await supportPath("/conversations"), idempotencyKey: requiredKey(key), body: { conversationType: conversationType.toUpperCase(), openingText: openingText.trim(), clientMessageId: key } })),
    replyConversation: async (conversation, body, key) => parseConversationDetail(await client.request({ method: "POST", path: await supportPath(`/conversations/${pathId(conversation.id)}/replies`), idempotencyKey: requiredKey(key), body: { body: body.trim(), expectedStatus: conversation.status.toUpperCase(), expectedVersion: conversation.version, clientMessageId: key } })),
    convertConversationToTicket: async (conversation, category, title, key) => {
      const v = row(await client.request({ method: "POST", path: await supportPath(`/conversations/${pathId(conversation.id)}/ticket`), idempotencyKey: requiredKey(key), body: { category, title: title.trim(), expectedStatus: conversation.status.toUpperCase(), expectedVersion: conversation.version, clientMessageId: key } }));
      if (!v) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID"); return { conversation: parseConversationHeader(v.conversation), ticket: parseTicketDetail(v.ticket) };
    },
    commandResult: async key => {
      try {
        return parseCommandResult(await client.request({ method: "GET", path: await supportPath(`/commands/${pathId(requiredKey(key))}`) }));
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 404) return null;
        throw cause;
      }
    },
    faqs: async (language, category) => {
      const params = new URLSearchParams({ language: language.trim() || "en-US" }); if (category?.trim()) params.set("category", category.trim());
      const value = await client.request({ method: "GET", path: `/api/app/support/faqs?${params.toString()}` }); if (!Array.isArray(value)) invalid("SUPPORT_FAQ_RESPONSE_INVALID"); return value.map(parseFaq);
    },
  };
}
