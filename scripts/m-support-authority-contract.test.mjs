import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sha256 as nativeSha256 } from "js-sha256/build/sha256.min.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("pure JS SHA-256 matches UTF-8 digest across Unicode and block boundaries", () => {
  for (const value of ["support-create", "测试 🧪 hỗ trợ", "a".repeat(55), "b".repeat(64), "c".repeat(129), "bad:\ufffd"]) {
    assert.equal(nativeSha256(value), createHash("sha256").update(value, "utf8").digest("hex"));
  }
});

test("M App support production paths use the server API and never local support mocks", async () => {
  const [runtime, tickets, conversations, ticketPage, messagesPage, chatPage, helpPage] = await Promise.all([
    read("src/api/runtime.ts"),
    read("src/store/tickets.ts"),
    read("src/store/conversations.ts"),
    read("src/pages/me/support-tickets.vue"),
    read("src/pages/support/messages.vue"),
    read("src/pages/support/chat.vue"),
    read("src/pages/me/help.vue"),
  ]);
  assert.match(runtime, /supportApi/);
  for (const source of [tickets, conversations, ticketPage, messagesPage, chatPage, helpPage]) {
    assert.doesNotMatch(source, /@\/mock\/(tickets|conversations|faq)/);
  }
  for (const source of [tickets, conversations]) assert.match(source, /restoreSupportPending/);
  assert.match(tickets, /supportApi\.(tickets|createTicket|replyTicket|closeTicket)/);
  assert.match(conversations, /supportApi\.(conversations|conversation|startConversation|replyConversation|convertConversationToTicket)/);
  assert.match(conversations, /markConversationRead/);
  assert.match(helpPage, /supportApi\.faqPage/);
});

test("support API parser is strict and every mutation carries idempotency plus CAS", async () => {
  const api = await read("src/api/support-api.ts");
  assert.match(api, /SUPPORT_(TICKET|CONVERSATION|FAQ)_RESPONSE_INVALID/);
  assert.match(api, /idempotencyKey:/);
  assert.match(api, /expectedStatus/);
  assert.match(api, /expectedVersion/);
  assert.doesNotMatch(api, /fallbackTransfer/);
  assert.match(api, /do \{[\s\S]*?beforeId = page\.nextCursor;[\s\S]*?\} while \(beforeId !== null\)/);
  assert.match(api, /markConversationRead/);
});

test("support mutations are single-flight and retain one key across unknown-result retries", async () => {
  const [tickets, conversations] = await Promise.all([
    read("src/store/tickets.ts"), read("src/store/conversations.ts"),
  ]);
  for (const source of [tickets, conversations]) {
    assert.match(source, /pendingKeys/);
    assert.match(source, /inFlight/);
    assert.match(source, /opaqueSupportIntentSlot\(intent\)/);
    assert.match(source, /scope\.pending\.get\(fingerprint\) \?\? mutationKey/);
    assert.match(source, /scope\.pending\.delete\(fingerprint\)/);
  }
});

test("support mutations reconcile an uncertain server result before allowing another command", async () => {
  const [tickets, conversations] = await Promise.all([
    read("src/store/tickets.ts"), read("src/store/conversations.ts"),
  ]);
  for (const source of [tickets, conversations]) {
    assert.match(source, /function mustReadBack\(cause: unknown\)/);
    assert.match(source, /catch \(cause\)[\s\S]*?mustReadBack\(cause\)/);
    assert.match(source, /await reconcile/);
  }
  assert.match(tickets, /supportApi\.ticket\(id\)/);
  assert.match(conversations, /supportApi\.conversation\(id\)/);
  assert.match(conversations, /markConversationRead[\s\S]*?mustReadBack\(cause\)[\s\S]*?supportApi\.conversation\(id\)/);
});

test("all support snapshots are account-epoch guarded and a visible human thread uses the realtime lifecycle", async () => {
  const [tickets, conversations, chat, realtimePage, realtimePageTest, scope, api] = await Promise.all([
    read("src/store/tickets.ts"),
    read("src/store/conversations.ts"),
    read("src/pages/support/chat.vue"),
    read("src/pages/support/conversation-realtime-page.ts"),
    read("src/pages/support/conversation-realtime-page.test.ts"),
    read("src/lib/account-scope.ts"),
    read("src/api/support-api.ts"),
  ]);
  for (const source of [tickets, conversations]) {
    assert.match(source, /const epoch = accountEpoch;/);
    assert.match(source, /if \(epoch === accountEpoch\) replace/);
    assert.match(source, /if \(epoch === accountEpoch(?: && requestGeneration === listRequestGeneration)?\) loading\.value = false;/);
  }
  assert.match(scope, /useConversations\(\)\.bindAccount\(accountKey\)/);
  assert.match(chat, /createHumanThreadRealtimeLifecycle/);
  assert.match(chat, /const humanRealtime = createHumanThreadRealtimeLifecycle/);
  assert.match(realtimePage, /function stop\(\): void \{\s*hooks\.setTyping\(false\);\s*hooks\.watch\(null\);\s*visible = false;\s*epoch \+= 1;/);
  assert.match(realtimePageTest, /does not let a hidden or replaced conversation revive its realtime watch/);
  assert.match(realtimePageTest, /expect\(calls\)\.toEqual\(\[\["watch", "CV-1"\], \["typing", false\], \["watch", null\]\]\)/);
  assert.match(chat, /onHide\(\(\) => \{[\s\S]*?stopHumanThreadPolling\(\);/);
  assert.match(api, /lastSeenMessageId, expectedStatus: conversation\.status\.toUpperCase\(\), expectedVersion: conversation\.version/);
});

test("human realtime and open snapshots cannot write after hide or regress a newer conversation version", async () => {
  const [conversations, chat, realtimePage, realtimePageTest] = await Promise.all([
    read("src/store/conversations.ts"), read("src/pages/support/chat.vue"),
    read("src/pages/support/conversation-realtime-page.ts"), read("src/pages/support/conversation-realtime-page.test.ts"),
  ]);
  assert.match(conversations, /const openGeneration = new Map<string, number>\(\)/);
  assert.match(conversations, /openGeneration\.get\(id\) !== requestGeneration \|\| !active\(\)/);
  assert.match(conversations, /conversation\.version < prior\.version/);
  assert.match(conversations, /conversation\.version === prior\.version && conversation\.lastTs < prior\.lastTs/);
  assert.match(chat, /await convStore\.open\(id, current\)/);
  assert.match(chat, /humanOpenRequest === request && request\.binding === app\.accountBindingEpoch/);
  assert.match(chat, /humanRealtime\.isCurrent\(request\.epoch, request\.id\)/);
  assert.match(chat, /if \(current\(\)\) startHumanThreadPolling\(epoch, id\)/);
  assert.match(realtimePage, /return openEpoch === epoch && isVisibleFor\(openId\);/);
  assert.match(realtimePageTest, /const oldHistoryScope = lifecycle\.capture\("CV-1"\);[\s\S]*?lifecycle\.stop\(\);[\s\S]*?lifecycle\.watchIfCurrent\(firstEpoch, "CV-1"\);/);
});

test("a late full-list read merges monotonically instead of restoring an older v0 snapshot", async () => {
  const [tickets, conversations] = await Promise.all([read("src/store/tickets.ts"), read("src/store/conversations.ts")]);
  assert.match(tickets, /let listRequestGeneration = 0/);
  assert.match(tickets, /const ticketRequestGeneration = new Map<string, number>\(\)/);
  assert.match(tickets, /ticket\.version < prior\.version/);
  assert.match(tickets, /ticket\.version === prior\.version && ticket\.updatedAt < prior\.updatedAt/);
  assert.match(tickets, /function mergeTickets\(items: Ticket\[\]\) \{[\s\S]*?for \(const ticket of items\)[\s\S]*?replace\(prior \? \{ \.\.\.ticket, messages: prior\.messages/);
  assert.match(tickets, /const current = \(\) => epoch === accountEpoch && requestGeneration === listRequestGeneration && active\(\)/);
  assert.match(tickets, /snapshotIsCurrent\(scope\) && current\(\)\) mergeTickets\(items\)/);
  assert.doesNotMatch(tickets, /tickets\.value = items/);
  assert.match(conversations, /let listRequestGeneration = 0/);
  assert.match(conversations, /function mergeConversations\(items: Conversation\[\]\) \{ for \(const conversation of items\) replace\(conversation\); \}/);
  assert.match(conversations, /requestGeneration === listRequestGeneration\) \{\s*mergeConversations\(page.items\); mergeDismissals\(dismissals\)/);
  assert.doesNotMatch(conversations, /conversations\.value = items/);
  for (const source of [tickets, conversations]) {
    assert.match(source, /type SnapshotScope = \{ accountKey: string; epoch: number; runId: string \}/);
    assert.match(source, /function snapshotIsCurrent\(scope: SnapshotScope\)/);
  }
});

test("canonical support uses the development authority and late lifecycle work cannot restart realtime watch", async () => {
  const [api, chat, realtimePage, realtimePageTest] = await Promise.all([
    read("src/api/support-api.ts"),
    read("src/pages/support/chat.vue"),
    read("src/pages/support/conversation-realtime-page.ts"),
    read("src/pages/support/conversation-realtime-page.test.ts"),
  ]);
  assert.match(api, /const supportRoot = "\/api\/app\/support"/);
  assert.match(api, /authorityRevision: async \(\) => "canonical-v1"/);
  assert.doesNotMatch(api, /support\/acceptance|sourceEnvironment !== "SANDBOX"/);
  assert.match(api, /supportPath\(`\/commands\//);
  assert.match(chat, /async function activateHumanPage\(\) \{\s*if \(!novaPageVisible \|\| isAi\.value \|\| !supportSessionReady\.value\) return;\s*stopHumanThreadPolling\(\);\s*const epoch = humanRealtime\.show\(\)/);
  assert.match(chat, /humanOpenRequest === request && request\.binding === app\.accountBindingEpoch/);
  assert.match(chat, /humanRealtime\.isCurrent\(request\.epoch, request\.id\)/);
  assert.match(chat, /if \(current\(\)\) startHumanThreadPolling\(epoch, id\);/);
  assert.match(chat, /if \(current\(\)\) navBack\("\/pages\/support\/messages"\)/);
  assert.match(realtimePage, /function watchIfCurrent\(openEpoch: number, openId: string\): void \{\s*if \(isCurrent\(openEpoch, openId\)\) hooks\.watch\(openId\);\s*\}/);
  assert.match(realtimePageTest, /activates a newly-created human thread only while its page is current/);
});

test("unknown 409, network, protocol, and 5xx support commands read back a stable command key", async () => {
  const [tickets, conversations] = await Promise.all([
    read("src/store/tickets.ts"),
    read("src/store/conversations.ts"),
  ]);
  for (const source of [tickets, conversations]) {
    assert.match(source, /supportApi\.commandResult\(key\)/);
    assert.match(source, /scope\.pending\.delete\(fingerprint\)/);
  }
  assert.match(tickets, /\(error\.status \?\? 0\) >= 500/);
  assert.match(conversations, /error\.status === 409/);
  assert.match(conversations, /!isSupportAttachmentNotReady\(cause\)/);
});

test("ticket list projects the authoritative message count and opens its detail before rendering a timeline", async () => {
  const [api, domain, row, page] = await Promise.all([
    read("src/api/support-api.ts"),
    read("src/domain/support.ts"),
    read("src/components/me/ticket-row.vue"),
    read("src/pages/me/support-tickets.vue"),
  ]);
  assert.match(api, /messageCount/);
  assert.match(domain, /messageCount:\s*number/);
  assert.match(row, /tk\.messageCount/);
  assert.match(page, /@open="openTicket\(tk\.id\)"/);
  assert.match(page, /async function openTicket\(id: string\)[\s\S]*ticketsStore\.load\(id\)/);
});

test("an empty human conversation lane gives the user an authoritative start path instead of a local fallback", async () => {
  const [messages, chat, conversations] = await Promise.all([
    read("src/pages/support/messages.vue"),
    read("src/pages/support/chat.vue"),
    read("src/store/conversations.ts"),
  ]);
  assert.match(messages, /v-if="canStartConversation"/);
  assert.match(messages, /@click="onStartConversation\(\)"/);
  assert.match(messages, /navTo\("\/pages\/support\/chat\?start="/);
  assert.match(chat, /q\?\.start/);
  assert.match(chat, /convStore\.startConversation\(/);
  assert.match(conversations, /async function startConversation\(type: Exclude<ConversationType, "ai">, openingText: string, attachmentId\?: string\)/);
});

test("ticket list and detail render refreshed server metadata through the active locale", async () => {
  const [row, page, message, en, zh, vi] = await Promise.all([
    read("src/components/me/ticket-row.vue"),
    read("src/pages/me/support-tickets.vue"),
    read("src/components/me/ticket-message.vue"),
    read("src/i18n/messages/en.ts"),
    read("src/i18n/messages/zh.ts"),
    read("src/i18n/messages/vi.ts"),
  ]);
  assert.match(row, /t\.value\.tickets\.status\[props\.tk\.status\]/);
  assert.match(row, /t\.value\.tickets\.category\[props\.tk\.category\]/);
  assert.match(row, /t\.value\.tickets\.timeJustNow/);
  assert.match(row, /t\.value\.tickets\.messagesCount/);
  assert.match(page, /await ticketsStore\.refresh\(\)/);
  assert.match(page, /t\.value\.tickets\.status\[s\]/);
  assert.match(page, /t\.value\.tickets\.category\[c\]/);
  assert.match(page, /<TicketMessageRecord\b[^>]*:message="m"/);
  assert.match(message, /t\.value\.tickets\.detail\.agentFallback/);
  assert.match(message, /t\.value\.tickets\.detail\.youLabel/);
  assert.match(message, /props\.message\.agentName\?\.trim\(\)/);
  assert.match(page, /t\.value\.tickets\.timeJustNow/);
  for (const source of [row, page, message]) {
    assert.doesNotMatch(source, /CATEGORY_LABEL|STATUS_LABEL/);
    assert.doesNotMatch(source, /return "just now"|`\$\{Math\.floor\([^`]+\}\)(?:m|h|d) ago`/);
  }
  assert.match(en, /messagesCount:\s*"\{n\} messages"/);
  assert.match(en, /unassignedAgent:\s*"Unassigned"/);
  assert.match(zh, /status:[\s\S]*open:\s*"进行中"/);
  assert.match(zh, /category:[\s\S]*other:\s*"其他"/);
  assert.match(zh, /messagesCount:\s*"\{n\} 条消息"/);
  // 🔴 语言面三语齐点(门的门 ① 判据):只点两种时,第三种可以随意漂移而本门全绿。
  // 实测过的失败形态:语言豁免表不带语言维 → vi 真丢了占位符照样绿。
  // 英/中钉原文,越南文钉**键存在 + 占位符在位**(占位符丢了才是真会坏页面的那一种)。
  for (const key of ["messagesCount", "unassignedAgent", "timeJustNow"]) {
    assert.match(vi, new RegExp(`${key}:`), `vi.ts 缺 ${key}`);
  }
  assert.match(vi, /messagesCount:\s*"[^"]*\{n\}[^"]*"/, "vi.ts 的 messagesCount 丢了 {n} 占位符");
  assert.match(zh, /timeJustNow:\s*"刚刚"/);
});

test("conversation list and detail localize an unassigned server owner after refresh", async () => {
  const [messages, chat, en, zh] = await Promise.all([
    read("src/pages/support/messages.vue"),
    read("src/pages/support/chat.vue"),
    read("src/i18n/messages/en.ts"),
    read("src/i18n/messages/zh.ts"),
  ]);
  assert.match(messages, /convStore\.refresh\(\)/);
  assert.match(messages, /displayAgentName\(c\.agentName, c\.status\)/);
  assert.match(messages, /t\.value\.conversations\.unassignedAgent/);
  assert.match(chat, /displayAgentName\(conv\.value\.agentName\)/);
  assert.match(chat, /t\.value\.conversations\.unassignedAgent/);
  assert.match(en, /unassignedAgent:\s*"Unassigned"/);
  assert.match(zh, /unassignedAgent:\s*"待分配客服"/);
});

test("unknown support commands persist opaque account-scoped slots and reconcile them after reload", async () => {
  const [tickets, conversations, scope, intentSlot, pendingStorage] = await Promise.all([read("src/store/tickets.ts"), read("src/store/conversations.ts"), read("src/lib/account-scope.ts"), read("src/lib/support-intent-slot.ts"), read("src/lib/support-pending-storage.ts")]);
  for (const source of [tickets, conversations]) {
    assert.match(source, /persistSupportPending/);
    assert.match(source, /bindAccount\(accountKey: string\)/);
    assert.match(source, /authorityRevision\(\)/);
    assert.match(source, /opaqueSupportIntentSlot/);
    assert.match(source, /async function reconcilePending/);
    assert.match(source, /supportApi\.commandResult\(key\)/);
    assert.match(source, /scope\.pending\.delete\(fingerprint\)/);
    assert.doesNotMatch(source, /token|bearer/i);
    assert.doesNotMatch(source, /Object\.fromEntries\(pendingKeys\)/);
  }
  assert.match(intentSlot, /sha256\(wellFormed\)/);
  assert.match(pendingStorage, /support-pending-commands/);
  assert.match(pendingStorage, /:\$\{runId\}:/);
  assert.match(pendingStorage, /uni\.getStorageSync/);
  assert.match(pendingStorage, /uni\.setStorageSync/);
  assert.match(pendingStorage, /stored !== value/);
  const retirementStart = pendingStorage.indexOf("export function clearSupportPending");
  assert.ok(retirementStart >= 0, "explicit account retirement must remain separately bounded");
  assert.doesNotMatch(pendingStorage.slice(0, retirementStart), /removeItem|removeStorageSync|clearSupportPending/);
  assert.match(scope, /useTickets\(\)\.bindAccount\(accountKey\)/);
  assert.match(scope, /useConversations\(\)\.bindAccount\(accountKey\)/);
});

test("account switches retain opaque unknown commands for the original account and probe failures can retry", async () => {
  const [tickets, conversations, api] = await Promise.all([read("src/store/tickets.ts"), read("src/store/conversations.ts"), read("src/api/support-api.ts")]);
  assert.match(tickets, /pendingKeys = new Map\(\);[\s\S]*?preparePendingRun\(\)\.then\(\(\) => reconcilePending\(\)\)/);
  assert.match(conversations, /pendingKeys = new Map\(\);[\s\S]*?preparePendingRun\(\)\.then\(reconcilePending\)/);
  assert.match(api, /const supportRoot = "\/api\/app\/support";/);
  assert.doesNotMatch(api, /support\/acceptance/);
});

test("a deferred authority revision cannot send an old account command with the new account token", async () => {
  const [tickets, conversations] = await Promise.all([read("src/store/tickets.ts"), read("src/store/conversations.ts")]);
  for (const source of [tickets, conversations]) {
    assert.match(source, /const accountKey = accountKeyValue;\s*const epoch = accountEpoch;\s*const startingRunId = pendingRunId;/);
    assert.match(source, /const runId = await supportApi\.authorityRevision\(\);/);
    assert.match(source, /startingRunId !== pendingRunId[\s\S]*?throw new Error\("SUPPORT_ACCOUNT_SCOPE_CHANGED"\)/);
    assert.match(source, /const scope = await commandScope\(\);[\s\S]*?if \(!scopeIsCurrent\(scope\)\) throw new Error\("SUPPORT_ACCOUNT_SCOPE_CHANGED"\);[\s\S]*?const (?:promise =|result = await) action\(key\);/);
    assert.match(source, /persistPending\(scope\.accountKey, scope\.runId, scope\.pending\)/);
    assert.match(source, /scope\.pending === pendingKeys && scope\.inFlight === inFlight/);
  }
  assert.match(conversations, /const promise = Promise\.resolve\(\)\.then\(async \(\) => \{\s*try \{\s*if \(!scopeIsCurrent\(scope\)\) throw new Error\("SUPPORT_ACCOUNT_SCOPE_CHANGED"\);\s*const result = await action\(key\);/);
  assert.match(conversations, /const adopted = await recover\(key\);\s*if \(!scopeIsCurrent\(scope\)\) throw new Error\("SUPPORT_ACCOUNT_SCOPE_CHANGED"\);/);
  assert.match(conversations, /scope\.inFlight\.set\(fingerprint, promise\);[\s\S]*?return promise;/);
});
