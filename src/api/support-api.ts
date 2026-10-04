import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import { parseTicketCreationPolicy, requireTicketCreationResult, ticketCreationDenials, type TicketCreationPolicy } from './support-ticket-policy';
import { parseServerTimestamp } from "./server-time";
import type { Conversation, ConversationCategoryAvailability, ConvMessage, SupportFaq, SupportSlaTarget, Ticket, TicketCategory, TicketMessage, TicketPriority, TicketStatus } from "@/domain/support";

interface Page<T> { items: T[]; total: number }
interface CursorPage<T> extends Page<T> { nextCursor: number | null }
export interface SupportFaqPage extends Page<SupportFaq> { pageNum: number; pageSize: number }
interface TicketInput { category: TicketCategory; subject: string; body: string }
interface ConversationTicketResult { conversation: Conversation; ticket: Ticket }
export interface ConversationDismissal { conversationNo: string; throughMessageId: number }
export interface SupportAttachmentPolicy { available: boolean; allowedMimeTypes: string[]; maxBytes: number | null; maxPixels: number | null; ttlSeconds: number | null; unavailableReason?: string | null }
export interface SupportAttachment { id: string; mime: string; bytes: number; width: number; height: number; state: "READY" | "ATTACHED" | "REJECTED" | "EXPIRED"; expiresAt?: string | null }
export function isSupportAttachmentNotReady(cause: unknown): boolean {
  return cause instanceof ApiError && cause.message === "ATTACHMENT_NOT_READY" && (cause.status === 409 || cause.code === 409);
}
export interface CurrentAdvisor {
  assignmentId: number | null;
  currentAdvisorId: number | null;
  currentAdvisorName: string | null;
  assignmentState: "UNBOUND" | "ASSIGNED" | "ADVISOR_DISABLED";
  availability: "UNBOUND" | "DISABLED" | "BUSY" | "UNKNOWN";
}
export type SupportCommandResult =
  | { kind: "ticket"; ticket: Ticket }
  | { kind: "conversation"; conversation: Conversation }
  | { kind: "conversation-ticket"; conversation: Conversation; ticket: Ticket };
export interface SupportApi {
  authorityRevision(): Promise<string>;
  advisor(): Promise<CurrentAdvisor>;
  tickets(): Promise<Page<Ticket>>;
  ticketCreationPolicy(): Promise<TicketCreationPolicy>;
  ticket(id: string, beforeMessageId?: number): Promise<Ticket>;
  markTicketRead(ticket: Ticket): Promise<Ticket>;
  createTicket(input: TicketInput, key: string): Promise<Ticket>;
  replyTicket(ticket: Ticket, body: string, key: string): Promise<Ticket>;
  closeTicket(ticket: Ticket, key: string): Promise<Ticket>;
  conversations(): Promise<Page<Conversation>>;
  /** null means the backend has not installed this optional inbox capability yet. */
  conversationDismissals(): Promise<ConversationDismissal[] | null>;
  dismissConversation(id: string, throughMessageId: number): Promise<ConversationDismissal>;
  conversationCategories(): Promise<ConversationCategoryAvailability>;
  conversation(id: string, beforeMessageId?: number): Promise<Conversation>;
  markConversationRead(conversation: Conversation, lastSeenMessageId: number): Promise<Conversation>;
  startConversation(type: Exclude<Conversation["type"], "ai">, openingText: string, key: string, attachmentId?: string): Promise<Conversation>;
  replyConversation(conversation: Conversation, body: string, key: string, attachmentId?: string): Promise<Conversation>;
  attachmentPolicy(): Promise<SupportAttachmentPolicy>;
  uploadAttachment(filePath: string, clientUploadId: string, key: string): Promise<SupportAttachment>;
  attachmentContent(id: string, signal?: AbortSignal): Promise<string>;
  cancelAttachment(id: string, key: string): Promise<void>;
  convertConversationToTicket(conversation: Conversation, category: TicketCategory, title: string, key: string): Promise<ConversationTicketResult>;
  commandResult(key: string): Promise<SupportCommandResult | null>;
  slaTargets(): Promise<SupportSlaTarget[]>;
  faqPage(language: string, category?: string, surface?: "Help Center" | "Ticket Create", pageNum?: number, pageSize?: number): Promise<SupportFaqPage>;
  faqs(language: string, category?: string, surface?: "Help Center" | "Ticket Create"): Promise<SupportFaq[]>;
}

function invalid(message: string): never { throw new ApiError({ kind: "protocol", message }); }
function parseDismissal(value: unknown): ConversationDismissal {
  const v = row(value); const conversationNo = text(v?.conversationNo); const throughMessageId = integer(v?.throughMessageId, 1);
  if (!conversationNo || throughMessageId === null) invalid("SUPPORT_DISMISSAL_RESPONSE_INVALID");
  return { conversationNo, throughMessageId };
}
function row(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function text(value: unknown, empty = false): string | null { if (typeof value !== "string") return null; const v = value.trim(); return v || empty ? v : null; }
function integer(value: unknown, min = 0): number | null { const v = typeof value === "number" ? value : Number(value); return Number.isSafeInteger(v) && v >= min ? v : null; }
function time(value: unknown): number | null { const v = typeof value === "number" ? value : parseServerTimestamp(value); return v !== null && Number.isFinite(v) && v > 0 ? v : null; }
function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null { const v = text(value)?.toLowerCase() as T; return allowed.includes(v) ? v : null; }
function requiredKey(key: string): string { const v = key.trim(); return v.length >= 8 && v.length <= 128 ? v : invalid("SUPPORT_IDEMPOTENCY_KEY_INVALID"); }
function pathId(id: string): string { const v = id.trim(); return v ? encodeURIComponent(v) : invalid("SUPPORT_RESOURCE_ID_INVALID"); }
function cursor(value: unknown): number | null { return value === null || value === undefined ? null : integer(value, 1); }
function pathCursor(beforeMessageId?: number): string {
  if (beforeMessageId === undefined) return "";
  return Number.isSafeInteger(beforeMessageId) && beforeMessageId > 0
    ? `?beforeMessageId=${beforeMessageId}` : invalid("SUPPORT_HISTORY_CURSOR_INVALID");
}

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
  return { id, subject, category, status, priority, version, createdAt, updatedAt, lastReplyAt, messageCount, unread, owner: owner || "Unassigned", messages: [], historyTruncated: false, historyNextCursor: null };
}
function parseTicketMessage(value: unknown): TicketMessage {
  const v = row(value); const id = integer(v?.id, 1); const ts = time(v?.createdAt); const body = text(v?.content);
  const senderType = text(v?.senderType)?.toLowerCase(); const author = senderType === "user" ? "user" : senderType === "agent" ? "agent" : null;
  const agentName = author === "agent" ? text(v?.senderName, true) ?? undefined : undefined;
  if (!v || id === null || ts === null || !body || !author) invalid("SUPPORT_TICKET_RESPONSE_INVALID");
  return { id: String(id), ts, body, author, agentName };
}
function parseTicketDetail(value: unknown): Ticket {
  const v = row(value); const nextCursor = cursor(v?.nextCursor); if (!v || !Array.isArray(v.messages) || typeof v.historyTruncated !== "boolean" || (v.nextCursor !== null && v.nextCursor !== undefined && nextCursor === null)) invalid("SUPPORT_TICKET_RESPONSE_INVALID");
  const ticket = parseTicketHeader(v.ticket); const messages = v.messages.map(parseTicketMessage);
  if (messages.length > ticket.messageCount) invalid("SUPPORT_TICKET_RESPONSE_INVALID");
  return { ...ticket, messages, historyTruncated: v.historyTruncated, historyNextCursor: nextCursor };
}
function parseTicketPage(value: unknown): CursorPage<Ticket> {
  const v = row(value); const total = integer(v?.total); const pageSize = integer(v?.pageSize, 1);
  if (!v || !Array.isArray(v.records) || total === null || pageSize === null || pageSize > 100 || v.records.length > pageSize) invalid("SUPPORT_TICKET_RESPONSE_INVALID");
  const databaseIds = v.records.map(item => integer(row(item)?.id, 1));
  if (databaseIds.some(id => id === null) || new Set(databaseIds).size !== databaseIds.length) invalid("SUPPORT_TICKET_RESPONSE_INVALID");
  const items = v.records.map(parseTicketHeader); if (new Set(items.map(i => i.id)).size !== items.length) invalid("SUPPORT_TICKET_RESPONSE_INVALID");
  return { items, total, nextCursor: items.length === pageSize ? databaseIds[databaseIds.length-1]! : null };
}

function parseConversationHeader(value: unknown): Conversation {
  const v = row(value); const id = text(v?.conversationNo); const type = enumValue(v?.conversationType, ["advisor", "support"] as const);
  const status = enumValue(v?.status, ["open", "transferred", "resolved", "closed"] as const); const version = integer(v?.version);
  const lastTs = time(v?.lastMessageAt) ?? time(v?.updatedAt); const unread = integer(v?.unreadCount); const agentName = text(v?.ownerAgentName, true);
  const lastMessage = text(v?.lastMessage, true);
  const lastPublicMessageId = v?.lastPublicMessageId == null ? 0 : integer(v.lastPublicMessageId);
  const lastMessageKind = v?.lastMessageKind === "IDLE_TIMEOUT_CLOSE" ? "IDLE_TIMEOUT_CLOSE" : null;
  if (!v || !id || !type || !status || version === null || lastTs === null || unread === null || agentName === null || lastMessage === null) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  if (lastPublicMessageId === null) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  return { id, type, status, version, agentName: agentName || "Unassigned", roleKey: type === "advisor" ? "roleAdvisor" : "roleSupport", avatarTint: type === "advisor" ? "var(--v5-brand)" : "var(--v5-tech-cyan)", messages: [], unread, lastTs, lastMessage, lastPublicMessageId, lastMessageKind, sessionStatus: status === "open" || status === "resolved" ? "active" : "closed", historyTruncated: false, historyNextCursor: null };
}
function parseConversationMessage(value: unknown): ConvMessage {
  const v = row(value); const id = integer(v?.id, 1); const ts = time(v?.createdAt);
  const raw = text(v?.senderType)?.toLowerCase(); const sender = raw === "user" ? "user" : raw === "agent" ? "agent" : raw === "system" ? "system" : null;
  const receipt = v?.receiptStatus == null ? null : text(v.receiptStatus)?.toLowerCase(); const status = receipt === "read" ? "read" : receipt === "sent" ? "sent" : undefined;
  const kind = v?.kind == null ? "TEXT" : text(v.kind)?.toUpperCase();
  const body = kind === "IMAGE" && v?.content == null ? "" : text(v?.content, true);
  const attachmentId = kind === "IMAGE" ? text(v?.attachmentId) : null;
  if (!v || id === null || ts === null || body === null || !sender || (kind !== "TEXT" && kind !== "IMAGE") || (kind === "TEXT" && !body) || (kind === "IMAGE" && !attachmentId) || (receipt !== null && receipt !== "sent" && receipt !== "read") || (sender === "system" && receipt !== null)) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  return { id: String(id), sender, text: body, ts, kind, attachmentId: attachmentId ?? undefined, authorName: text(v.senderName) ?? undefined, status: sender === "system" ? undefined : status };
}
function parseConversationDetail(value: unknown): Conversation {
  const v = row(value); const nextCursor = cursor(v?.nextCursor); if (!v || !Array.isArray(v.messages) || typeof v.historyTruncated !== "boolean" || (v.nextCursor !== null && v.nextCursor !== undefined && nextCursor === null)) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  return { ...parseConversationHeader(v.conversation), messages: v.messages.map(parseConversationMessage), historyTruncated: v.historyTruncated, historyNextCursor: nextCursor };
}
function parseConversationPage(value: unknown): CursorPage<Conversation> {
  const v = row(value); const total = integer(v?.total); const pageSize = integer(v?.pageSize, 1);
  if (!v || !Array.isArray(v.records) || total === null || pageSize === null || pageSize > 100 || v.records.length > pageSize) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  const databaseIds = v.records.map(item => integer(row(item)?.id, 1));
  if (databaseIds.some(id => id === null) || new Set(databaseIds).size !== databaseIds.length) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  const items = v.records.map(parseConversationHeader); if (new Set(items.map(i => i.id)).size !== items.length) invalid("SUPPORT_CONVERSATION_RESPONSE_INVALID");
  return { items, total, nextCursor: items.length === pageSize ? databaseIds[databaseIds.length-1]! : null };
}
function parseConversationCategories(value: unknown): ConversationCategoryAvailability {
  if (!Array.isArray(value) || value.length !== 3) invalid("SUPPORT_CATEGORY_RESPONSE_INVALID");
  const result = { advisor: false, support: false, ai: false };
  const seen = new Set<string>();
  for (const item of value) {
    const v = row(item);
    const type = enumValue(v?.type, ["advisor", "support", "ai"] as const);
    if (!v || !type || typeof v.enabled !== "boolean" || seen.has(type)) invalid("SUPPORT_CATEGORY_RESPONSE_INVALID");
    seen.add(type);
    result[type] = v.enabled;
  }
  if (seen.size !== 3) invalid("SUPPORT_CATEGORY_RESPONSE_INVALID");
  return result;
}
function parseAttachment(value: unknown): SupportAttachment {
  const v = row(value); const id = text(v?.id); const mime = text(v?.mime);
  const bytes = integer(v?.bytes, 1); const width = integer(v?.width, 1); const height = integer(v?.height, 1);
  const state = text(v?.state)?.toUpperCase();
  if (!v || !id || !mime || bytes === null || width === null || height === null || !["READY", "ATTACHED", "REJECTED", "EXPIRED"].includes(String(state))) invalid("SUPPORT_ATTACHMENT_RESPONSE_INVALID");
  return { id, mime, bytes, width, height, state: state as SupportAttachment["state"], expiresAt: text(v.expiresAt, true) };
}
function parseAttachmentPolicy(value: unknown): SupportAttachmentPolicy {
  const v = row(value);
  if (!v || typeof v.available !== "boolean" || !Array.isArray(v.allowedMimeTypes)
      || v.allowedMimeTypes.some(mime => typeof mime !== "string")) invalid("SUPPORT_ATTACHMENT_POLICY_INVALID");
  const maxBytes = v.maxBytes == null ? null : integer(v.maxBytes, 1);
  const maxPixels = v.maxPixels == null ? null : integer(v.maxPixels, 1);
  const ttlSeconds = v.ttlSeconds == null ? null : integer(v.ttlSeconds, 1);
  if (v.available && (maxBytes === null || maxPixels === null || ttlSeconds === null || !v.allowedMimeTypes.length)) invalid("SUPPORT_ATTACHMENT_POLICY_INVALID");
  return { available: v.available, allowedMimeTypes: v.allowedMimeTypes as string[], maxBytes, maxPixels, ttlSeconds,
    unavailableReason: text(v.unavailableReason, true) };
}
function parseCurrentAdvisor(value: unknown): CurrentAdvisor {
  const v = row(value);
  const assignmentId = v?.assignmentId == null ? null : integer(v.assignmentId, 1);
  const currentAdvisorId = v?.currentAdvisorId == null ? null : integer(v.currentAdvisorId, 1);
  const currentAdvisorName = v?.currentAdvisorName == null ? null : text(v.currentAdvisorName);
  const assignmentState = v?.assignmentState;
  const availability = v?.availability;
  if (!v || (v.assignmentId != null && assignmentId === null) || (v.currentAdvisorId != null && currentAdvisorId === null)
      || !["UNBOUND", "ASSIGNED", "ADVISOR_DISABLED"].includes(String(assignmentState))
      || !["UNBOUND", "DISABLED", "BUSY", "UNKNOWN"].includes(String(availability))
      || (assignmentState === "UNBOUND" && (assignmentId !== null || currentAdvisorId !== null || currentAdvisorName !== null || availability !== "UNBOUND"))
      || (assignmentState !== "UNBOUND" && (!assignmentId || !currentAdvisorId || !currentAdvisorName))) invalid("SUPPORT_ADVISOR_RESPONSE_INVALID");
  return { assignmentId, currentAdvisorId, currentAdvisorName,
    assignmentState: assignmentState as CurrentAdvisor["assignmentState"], availability: availability as CurrentAdvisor["availability"] };
}
  function parseFaq(value: unknown): SupportFaq {
  const v = row(value); const id = text(v?.id); const category = text(v?.category); const question = text(v?.question); const answer = text(v?.answer);
  const language = text(v?.language); const sortOrder = integer(v?.sortOrder); const version = integer(v?.version); const updatedAt = time(v?.updatedAt);
  if (!v || !id || !category || !question || !answer || !language || sortOrder === null || version === null || updatedAt === null) invalid("SUPPORT_FAQ_RESPONSE_INVALID");
    return { id, category, question, answer, language, sortOrder, version, updatedAt };
  }
  function parseSlaTarget(value: unknown): SupportSlaTarget {
    const v = row(value); const category = enumValue(v?.category, ticketCategories);
    const firstResponseMins = integer(v?.firstResponseMins, 1); const resolutionHours = integer(v?.resolutionHours, 1);
    if (!v || !category || firstResponseMins === null || resolutionHours === null || v.statisticsAvailable !== false) invalid("SUPPORT_SLA_TARGET_RESPONSE_INVALID");
    return { category, firstResponseMins, resolutionHours, statisticsAvailable: false };
  }

  function parseFaqPage(value: unknown): SupportFaqPage {
    const v = row(value); const total = integer(v?.total); const pageNum = integer(v?.pageNum, 1); const pageSize = integer(v?.pageSize, 1);
    if (!v || !Array.isArray(v.records) || total === null || pageNum === null || pageSize === null || pageSize > 50 || v.records.length > pageSize) invalid("SUPPORT_FAQ_RESPONSE_INVALID");
    const items = v.records.map(parseFaq);
    if (new Set(items.map(item => item.id)).size !== items.length) invalid("SUPPORT_FAQ_RESPONSE_INVALID");
    return { items, total, pageNum, pageSize };
  }

export function createSupportApi(client: ApiClient): SupportApi {
  const supportRoot = "/api/app/support";
  async function supportPath(path: string): Promise<string> { return `${supportRoot}${path}`; }
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
    const items: Ticket[] = []; const seen = new Set<string>(); let beforeId: number | null = null;
    do {
      const suffix = beforeId === null ? "" : `&beforeId=${beforeId}`;
      const page = parseTicketPage(await client.request({ method: "GET", path: `${await supportPath("/tickets/cursor")}?pageSize=100${suffix}` }));
      if (page.items.some(item => seen.has(item.id))) invalid("SUPPORT_TICKET_PAGE_INCOMPLETE");
      page.items.forEach(item => seen.add(item.id));
      items.push(...page.items);
      if (page.nextCursor !== null && beforeId !== null && page.nextCursor >= beforeId) invalid("SUPPORT_TICKET_PAGE_INCOMPLETE");
      beforeId = page.nextCursor;
    } while (beforeId !== null);
    return { items, total: items.length };
  }
  async function allConversations(): Promise<Page<Conversation>> {
    const items: Conversation[] = []; const seen = new Set<string>(); let beforeId: number | null = null;
    do {
      const suffix = beforeId === null ? "" : `&beforeId=${beforeId}`;
      const page = parseConversationPage(await client.request({ method: "GET", path: `${await supportPath("/conversations/cursor")}?pageSize=100${suffix}` }));
      if (page.items.some(item => seen.has(item.id))) invalid("SUPPORT_CONVERSATION_PAGE_INCOMPLETE");
      page.items.forEach(item => seen.add(item.id));
      items.push(...page.items);
      if (page.nextCursor !== null && beforeId !== null && page.nextCursor >= beforeId) invalid("SUPPORT_CONVERSATION_PAGE_INCOMPLETE");
      beforeId = page.nextCursor;
    } while (beforeId !== null);
    return { items, total: items.length };
  }
  async function faqPage(language: string, category?: string, surface: "Help Center" | "Ticket Create" = "Help Center", pageNum = 1, pageSize = 20): Promise<SupportFaqPage> {
    if (!Number.isSafeInteger(pageNum) || pageNum < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) invalid("SUPPORT_FAQ_PAGE_INVALID");
    const params = new URLSearchParams({ language: language.trim() || "en-US", surface });
    if (category?.trim()) params.set("category", category.trim());
    params.set("pageNum", String(pageNum));
    params.set("pageSize", String(pageSize));
    const page = parseFaqPage(await client.request({ method: "GET", path: `/api/app/support/faqs/page?${params.toString()}` }));
    if (page.pageNum !== pageNum || page.pageSize !== pageSize) invalid("SUPPORT_FAQ_RESPONSE_INVALID");
    return page;
  }
  return {
    authorityRevision: async () => "canonical-v1",
    advisor: async () => parseCurrentAdvisor(await client.request({ method: "GET", path: `${supportRoot}/advisor` })),
    tickets: allTickets,
    ticketCreationPolicy: async () => parseTicketCreationPolicy(await client.request({ method: 'GET', path: await supportPath('/tickets/creation-policy') })),
    ticket: async (id, beforeMessageId) => parseTicketDetail(await client.request({ method: "GET", path: `${await supportPath(`/tickets/${pathId(id)}`)}${pathCursor(beforeMessageId)}` })),
    markTicketRead: async ticket => parseTicketDetail(await client.request({ method: "POST", path: await supportPath(`/tickets/${pathId(ticket.id)}/read`), body: { expectedStatus: ticket.status.toUpperCase(), expectedVersion: ticket.version } })),
    createTicket: async (input, key) => parseTicketDetail(requireTicketCreationResult(await client.request({ method: "POST", path: await supportPath("/tickets"), idempotencyKey: requiredKey(key), body: { category: input.category, title: input.subject.trim(), body: input.body.trim(), clientMessageId: key }, acceptedResponses: ticketCreationDenials }))),
    replyTicket: async (ticket, body, key) => parseTicketDetail(await client.request({ method: "POST", path: await supportPath(`/tickets/${pathId(ticket.id)}/replies`), idempotencyKey: requiredKey(key), body: { body: body.trim(), expectedStatus: ticket.status.toUpperCase(), expectedVersion: ticket.version, clientMessageId: key } })),
    closeTicket: async (ticket, key) => parseTicketDetail(await client.request({ method: "POST", path: await supportPath(`/tickets/${pathId(ticket.id)}/close`), idempotencyKey: requiredKey(key), body: { expectedStatus: ticket.status.toUpperCase(), expectedVersion: ticket.version, clientMessageId: key } })),
    conversations: allConversations,
    conversationDismissals: async () => {
      let value: unknown;
      try { value = await client.request({ method: "GET", path: await supportPath("/conversation-dismissals") }); }
      catch (cause) {
        // Rolling upgrades must not break the existing conversation list. Other
        // failures remain failures; they cannot reset known personal markers.
        if (cause instanceof ApiError && cause.status === 404) return null;
        throw cause;
      }
      if (!Array.isArray(value)) invalid("SUPPORT_DISMISSAL_RESPONSE_INVALID");
      return value.map(parseDismissal);
    },
    dismissConversation: async (id, throughMessageId) => {
      if (!Number.isSafeInteger(throughMessageId) || throughMessageId <= 0) invalid("SUPPORT_DISMISSAL_BOUNDARY_INVALID");
      const result = parseDismissal(await client.request({ method: "POST", path: `${supportRoot}/conversations/${pathId(id)}/dismiss`, body: { throughMessageId } }));
      if (result.conversationNo !== id || result.throughMessageId < throughMessageId) invalid("SUPPORT_DISMISSAL_RESPONSE_INVALID");
      return result;
    },
    conversationCategories: async () => parseConversationCategories(await client.request({
      method: "GET", path: `${supportRoot}/conversation-categories`,
    })),
    conversation: async (id, beforeMessageId) => parseConversationDetail(await client.request({ method: "GET", path: `${await supportPath(`/conversations/${pathId(id)}`)}${pathCursor(beforeMessageId)}` })),
    markConversationRead: async (conversation, lastSeenMessageId) => parseConversationDetail(await client.request({
      method: "POST", path: await supportPath(`/conversations/${pathId(conversation.id)}/read`),
      body: { lastSeenMessageId, expectedStatus: conversation.status.toUpperCase(), expectedVersion: conversation.version },
    })),
    startConversation: async (conversationType, openingText, key, attachmentId) => parseConversationDetail(await client.request({ method: "POST", path: await supportPath("/conversations"), idempotencyKey: requiredKey(key), body: { conversationType: conversationType.toUpperCase(), openingText: openingText.trim(), clientMessageId: key, ...(attachmentId ? { kind: "IMAGE", attachmentId } : {}) } })),
    replyConversation: async (conversation, body, key, attachmentId) => parseConversationDetail(await client.request({ method: "POST", path: await supportPath(`/conversations/${pathId(conversation.id)}/replies`), idempotencyKey: requiredKey(key), body: { body: body.trim(), expectedStatus: conversation.status.toUpperCase(), expectedVersion: conversation.version, clientMessageId: key, ...(attachmentId ? { kind: "IMAGE", attachmentId } : {}) } })),
    attachmentPolicy: async () => parseAttachmentPolicy(await client.request({ path: `${supportRoot}/attachments/policy` })),
    uploadAttachment: async (filePath, clientUploadId, key) => parseAttachment(await client.upload({
      path: `${supportRoot}/attachments`, filePath, name: "file", idempotencyKey: requiredKey(key),
      formData: { clientUploadId: requiredKey(clientUploadId) },
    })),
    attachmentContent: async (id, signal) => {
      if (!client.download) invalid("SUPPORT_PRIVATE_DOWNLOAD_UNAVAILABLE");
      return client.download({ path: `${supportRoot}/attachments/${pathId(id)}/content`, signal });
    },
    cancelAttachment: async (id, key) => { parseAttachment(await client.request({ method: "DELETE", path: `${supportRoot}/attachments/${pathId(id)}`, idempotencyKey: requiredKey(key) })); },
    convertConversationToTicket: async (conversation, category, title, key) => {
      const v = row(requireTicketCreationResult(await client.request({ method: "POST", path: await supportPath(`/conversations/${pathId(conversation.id)}/ticket`), idempotencyKey: requiredKey(key), body: { category, title: title.trim(), expectedStatus: conversation.status.toUpperCase(), expectedVersion: conversation.version, clientMessageId: key }, acceptedResponses: ticketCreationDenials })));
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
    slaTargets: async () => {
      const value = await client.request({ method: "GET", path: await supportPath("/sla-targets") });
      if (!Array.isArray(value)) invalid("SUPPORT_SLA_TARGET_RESPONSE_INVALID");
      return value.map(parseSlaTarget);
    },
    faqPage,
    faqs: async (language, category, surface = "Help Center") => (await faqPage(language, category, surface, 1, 50)).items,
  };
}
