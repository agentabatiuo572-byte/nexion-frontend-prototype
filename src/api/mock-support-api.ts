import type { SupportApi, SupportCommandResult } from "./support-api";
import type { Conversation, ConvMessage } from "@/domain/support";
import { readPrototypeStorage, writePrototypeAccountRow } from '@/lib/prototype-storage';
import { normalizeAccountKey } from "@/store/account-cloud";
import { seedConversations } from "@/mock/conversations";
import { getT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";

const TABLE = "nexgrid-support-accounts-v1";
export interface SupportSnapshot {
  schema: 1;
  rows: Conversation[];
  dismissed: Record<string, number>;
  drafts: Record<string, string>;
  commands: Record<string, SupportCommandResult>;
  nextId: number;
}
type Options = {
  read?: (account: string) => SupportSnapshot | null;
  write?: (account: string, value: SupportSnapshot) => boolean;
  seed?: () => Conversation[];
  now?: () => number;
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function readStoredSnapshot(account: string): SupportSnapshot | null {
  const table = readPrototypeStorage(TABLE);
  if (table === undefined) return null;
  if (!record(table)) throw new Error('SUPPORT_STORAGE_UNAVAILABLE');
  const value = table[normalizeAccountKey(account)];
  return value === undefined ? null : value as SupportSnapshot;
}

function seed(): Conversation[] {
  const copy = getT().conversations;
  let id = 1;
  return seedConversations().map(row => {
    const messages: ConvMessage[] = row.messages.map(message => ({
      id: String(id++), sender: message.sender, status: message.status,
      text: message.textKey ? fmt(copy.seed[message.textKey], { name: row.agentName, ...message.textArgs }) : message.text ?? "",
      ts: message.ts, kind: "TEXT", authorName: message.sender === "agent" ? row.agentName : undefined,
      authorConfidence: message.sender === "agent" ? "VERIFIED" : undefined,
    }));
    return { ...row, messages, status: row.type === "support" ? "closed" : "open", version: 1,
      sessionStatus: row.type === "support" ? "closed" : "active", lastMessage: messages[messages.length - 1]?.text ?? "",
      lastPublicMessageId: Number(messages[messages.length - 1]?.id ?? 0) };
  });
}

/** Local service boundary: mutations persist before their successful result is exposed. */
export function createMockSupportApi(options: Options = {}) {
  const read = options.read ?? readStoredSnapshot;
  const write = options.write ?? ((account: string, row: SupportSnapshot) => { writePrototypeAccountRow(TABLE, normalizeAccountKey(account), row); return true; });
  const now = options.now ?? Date.now;
  let account = "default";
  function commit(data: SupportSnapshot) {
    if (!write(account, clone(data))) throw new Error("SUPPORT_STORAGE_UNAVAILABLE");
  }
  function snapshot(): SupportSnapshot {
    const stored = read(account);
    if (stored !== null) {
      if (!record(stored) || stored.schema !== 1 || !Array.isArray(stored.rows)
        || !stored.rows.every(row => record(row) && Array.isArray(row.messages))
        || !record(stored.dismissed) || !record(stored.drafts) || !record(stored.commands)
        || !Number.isSafeInteger(stored.nextId) || stored.nextId < 1) throw new Error('SUPPORT_STORAGE_UNAVAILABLE');
      return clone(stored);
    }
    const rows = (options.seed ?? seed)();
    const data: SupportSnapshot = { schema: 1, rows, dismissed: {}, drafts: {}, commands: {},
      nextId: Math.max(0, ...rows.flatMap(row => row.messages.map(message => Number(message.id) || 0))) + 1 };
    commit(data);
    return data;
  }
  function find(data: SupportSnapshot, id: string) {
    const row = data.rows.find(item => item.id === id);
    if (!row) throw new Error("SUPPORT_CONVERSATION_NOT_FOUND");
    return row;
  }
  function detail(row: Conversation, before?: number): Conversation {
    const messages = row.messages.filter(message => before === undefined || Number(message.id) < before);
    const selected = messages.slice(-100);
    return clone({ ...row, messages: selected, historyTruncated: selected.length < messages.length,
      historyNextCursor: selected.length < messages.length ? Number(selected[0].id) : null });
  }
  function mutate(key: string, action: (data: SupportSnapshot) => Conversation): Conversation {
    if (!key.trim()) throw new Error("SUPPORT_COMMAND_KEY_REQUIRED");
    const data = snapshot(), previous = data.commands[key];
    if (previous?.kind === "conversation") return clone(previous.conversation);
    const row = action(data);
    const result = detail(row);
    data.commands[key] = { kind: "conversation", conversation: result };
    commit(data);
    return clone(result);
  }
  function append(data: SupportSnapshot, row: Conversation, message: Omit<ConvMessage, "id" | "ts">) {
    const item = { ...message, id: String(data.nextId++), ts: now() };
    row.messages.push(item);
    row.lastMessage = item.text; row.lastTs = item.ts; row.lastPublicMessageId = Number(item.id); row.version++;
    delete data.dismissed[row.id];
  }
  function text(value: string) {
    const clean = value.trim();
    if (!clean || clean.length > 4000) throw new Error("SUPPORT_MESSAGE_INVALID");
    return clean;
  }
  const retired = async (): Promise<never> => { throw new Error("SUPPORT_TICKETS_RETIRED"); };
  const api: SupportApi = {
    acceptanceRunId: async () => "mock",
    tickets: async () => ({ items: [], total: 0 }), ticket: retired, createTicket: retired,
    replyTicket: retired, closeTicket: retired, convertConversationToTicket: retired,
    conversations: async () => { const data = snapshot(); const items = data.rows.filter(row => row.type !== "ai" &&
      (data.dismissed[row.id] === undefined || (row.lastPublicMessageId ?? 0) > data.dismissed[row.id]))
      .sort((a, b) => b.lastTs - a.lastTs).map(row => ({ ...detail(row), messages: [] })); return { items, total: items.length }; },
    conversation: async id => detail(find(snapshot(), id)),
    markConversationRead: async (conversation, lastSeen) => {
      const data = snapshot(), row = find(data, conversation.id);
      row.unread = row.messages.filter(message => message.sender === "agent" && Number(message.id) > lastSeen).length;
      row.version++; commit(data); return detail(row);
    },
    startConversation: async (_type, openingText, key) => mutate(key, data => {
      const body = text(openingText);
      let row = [...data.rows].sort((a, b) => b.lastTs - a.lastTs).find(item => item.type !== "ai" && item.status !== "transferred");
      if (!row) {
        row = { id: `cv-${data.nextId++}`, type: "advisor", status: "open", version: 0, agentName: "Mia",
          roleKey: "roleAdvisor", avatarTint: "var(--v5-brand)", messages: [], unread: 0, lastTs: now(), lastMessage: "", sessionStatus: "active" };
        data.rows.push(row);
      }
      row.status = "open"; row.sessionStatus = "active";
      append(data, row, { sender: "user", text: body, kind: "TEXT", status: "sent" });
      return row;
    }),
    replyConversation: async (conversation, body, key) => mutate(key, data => {
      const row = find(data, conversation.id);
      if (row.status === "transferred") throw new Error("SUPPORT_CONVERSATION_TRANSFERRED");
      row.status = "open"; row.sessionStatus = "active";
      append(data, row, { sender: "user", text: text(body), kind: "TEXT", status: "sent" });
      return row;
    }),
    commandResult: async key => clone(snapshot().commands[key] ?? null),
    faqs: async () => [],
  };
  return Object.assign(api, {
    bindAccount(value: string) { account = normalizeAccountKey(value); },
    async history() { return snapshot().rows.filter(row => row.type !== "ai").map(row => detail(row)); },
    async earlier(id: string, before: number) { return detail(find(snapshot(), id), before); },
    async dismissConversation(id: string) {
      const data = snapshot(), row = find(data, id); data.dismissed[id] = row.lastPublicMessageId ?? 0; commit(data);
    },
    readDraft(id: string): string { return snapshot().drafts[id] ?? ""; },
    saveDraft(id: string, value: string) { const data = snapshot(); data.drafts[id] = value.slice(0, 4000); commit(data); },
    /** Used by the local service simulator and contract tests; never accepts arbitrary links. */
    async receiveMessage(id: string, message: Omit<ConvMessage, "id" | "ts" | "sender">) {
      if (message.kind === "LINK" && (!message.linkTarget || !["HOME", "WALLET", "SUPPORT"].includes(message.linkTarget.type)
        || Object.keys(message.linkTarget.params).length)) throw new Error("SUPPORT_LINK_INVALID");
      const data = snapshot(), row = find(data, id);
      row.messages.forEach(item => { if (item.sender === "user") item.status = "read"; });
      append(data, row, { ...message, sender: "agent", authorName: message.authorName ?? row.agentName, authorConfidence: "VERIFIED" });
      row.unread++; commit(data); return detail(row);
    },
  });
}
