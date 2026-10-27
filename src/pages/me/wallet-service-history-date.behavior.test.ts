import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import walletSource from "../../components/me/wallet-overview.vue?raw";
import serviceSource from "@/components/support/service-message-list.vue?raw";
import rowSource from "@/components/me/wallet-list-row.vue?raw";
import swipeSource from "@/components/support/conversation-swipe-row.vue?raw";
import deleteSource from "@/composables/use-conversation-delete.ts?raw";
import { groupConversationThreads } from "@/api/conversation-threads";
import type { Conversation } from "@/domain/support";
import { conversationActionsCopy } from "@/i18n/conversation-actions";
import { formatDisplayDateTime } from "@/lib/display-date";
import { formatFinanceAmount } from "@/lib/finance-amount-display";
import { resolveWalletTodayEarnings } from "@/lib/wallet-today-earnings";
import { localizedIdleClose } from "@/lib/support-idle-message";
import { formatUnreadBadge } from "@/lib/unread-badge";
import { fmt } from "@/i18n/format";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
const dictionaries = { en, zh, vi: vietnamese };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function compile(raw: string, modules: Record<string, unknown>) {
  const script = compileScript(parse(raw).descriptor, { id: "activity-date", inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text"].includes(tag) } } });
  const js = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {} as { default: Vue.Component };
  new Function("require", "exports", js)((id: string) => { if (!(id in modules)) throw new Error(`Unexpected import ${id}`); return modules[id]; }, exports);
  return exports.default;
}
function screen(remote = true) {
  const locale = Vue.reactive({ code: "en" as keyof typeof dictionaries });
  const withdrawal = { id: "WD-trusted", amount: 25, network: "BANK-VND", status: "sent", submittedAt: Date.parse("2026-10-27T00:00:00Z"), displaySubmittedAt: Date.parse("2025-12-31T16:05:06Z") };
  const app = Vue.reactive({ remoteFleetHasSnapshot: true, remoteFleetStatus: "ready", remoteWalletReceiptHasSnapshot: false,
    user: { usdtBalance: 42, nexBalance: 3, pendingEarnings: 0, earningBuckets: { pendingReviewUsdt: 0, bonusLockedUsdt: 0 } },
    earnings: { today: 2, total: 10 }, homeTruthStatus: "ready", homeTruth: { earnings: { today: { usdt: 2 }, all: { usdt: 10 } } },
    primaryWithdrawal: withdrawal as typeof withdrawal | null, refreshRemoteFleet: vi.fn(), refreshHomeTruth: vi.fn() });
  const rows = Vue.reactive([
    { id: "updated-only", lastTs: Date.parse("2026-01-02T16:05:06Z"), lastMessage: "activity preview", messages: [], unread: 2, roleKey: "typeAdvisor" },
    { id: "loaded-message", lastTs: Date.parse("2025-12-31T16:05:06Z"), lastMessage: "old", messages: [{ ts: Date.parse("2026-01-01T16:05:06Z"), text: "loaded preview", sender: "agent" }], unread: 0, roleKey: "typeAdvisor" },
  ]);
  const conversations = Vue.reactive({ loading: false, error: null as string | null, categoryLoading: false, categoryAvailabilityStatus: "ready", realtimeFallback: false, typingIds: {},
    deletionAvailable: false, deletingIds: {}, categoryEnabled: () => true,
    get humanThreads() { return groupConversationThreads(rows as unknown as Conversation[]); } });
  const navTo = vi.fn(), refresh = vi.fn();
  const pass = { setup: (_: unknown, { slots }: { slots: Vue.Slots }) => () => Vue.h("view", slots.default?.()) };
  const empty = { render: () => null };
  const modules: Record<string, unknown> = { vue: Vue, "@/i18n/use-t": { useT: () => Vue.computed(() => dictionaries[locale.code]) },
    "@/i18n/format": { fmt, dateLocale: () => locale.code }, "@/lib/display-date": { formatDisplayDateTime },
    "@/lib/finance-amount-display": { formatFinanceAmount }, "@/lib/route": { navTo },
    "@/lib/support-idle-message": { localizedIdleClose }, "@/lib/unread-badge": { formatUnreadBadge },
    "@dcloudio/uni-app": { onShow: vi.fn(), onHide: vi.fn() }, "@/api/order-api": { subscribeRuntimeRevision: () => () => {} },
    "@/api/runtime": { remoteApiEnabled: remote, developmentPaymentEnabled: false }, "@/store/app": { useApp: () => app },
    "@/store/commission": { useCommission: () => ({ eventsStatus: "ready", eventsEvidence: { aggregate: { totalUSDT: 5 } }, totalUSDTLifetime: () => 5 }) },
    "@/store/cards": { useCards: () => ({ cards: [] }) }, "@/store/config": { useConfig: () => ({ syncFailed: false, isEnabled: () => false }) },
    "@/store/ui": { confirm: vi.fn(), toast: { error: vi.fn() }, useUI: () => ({ clearConfirmsBy: vi.fn() }) },
    "@/store/locale": { useLocaleStore: () => locale }, "@/i18n/conversation-actions": { conversationActionsCopy },
    "@/lib/wallet-today-earnings": { resolveWalletTodayEarnings },
    "@/store/earning-release": { earningsReleaseSnapshot: Vue.ref(null), earningsReleaseHasSnapshot: Vue.ref(false), earningsReleaseStatus: Vue.ref("idle"), refreshEarningsReleaseStatus: vi.fn() },
    "@/components/app-chassis.vue": { default: pass }, "@/components/sub-page-header.vue": { default: empty },
    "@/components/glass-segments.vue": { default: empty }, "@/components/liquid-glass.vue": { default: empty },
    "@/store/conversations": { useConversations: () => conversations }, "@/store/message-drawer": { useMessageDrawer: () => ({ refresh }) } };
  modules["@/components/me/wallet-list-row.vue"] = { default: compile(rowSource, modules) };
  modules["./conversation-swipe-row.vue"] = { default: compile(swipeSource, modules) };
  const deleteJs = ts.transpileModule(deleteSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  modules["@/composables/use-conversation-delete"] = new Function("require", "exports", deleteJs + ";return exports;")(
    (id: string) => { if (!(id in modules)) throw new Error(`Unexpected delete import ${id}`); return modules[id]; }, {});
  const wallet = compile(walletSource, modules);
  const service = compile(serviceSource, modules);
  return { app, locale, rows, conversations, navTo, refresh,
    wallet: () => renderToString(Vue.createSSRApp(wallet)), service: () => renderToString(Vue.createSSRApp(service, { hideFilters: true })) };
}
it.each([
  ["Asia/Tokyo", -540, ["2026/01/01 01:05", "Jan 1, 2026 01:05", "01/01/2026 01:05"]],
  ["America/Los_Angeles", 480, ["2025/12/31 08:05", "Dec 31, 2025 08:05", "31/12/2025 08:05"]],
] as const)("keeps chain wallet events and service activity local in %s", async (zone, offset, expected) => {
  vi.stubEnv("TZ", zone); expect(new Date("2025-12-31T16:05:06Z").getTimezoneOffset()).toBe(offset); vi.stubGlobal("Intl", undefined);
  const s = screen();
  for (const [index, language] of ["zh", "en", "vi"].entries()) {
    s.locale.code = language as keyof typeof dictionaries;
    for (const network of ["USDT-TRC20", "USDT-BEP20", "USDT-ERC20"]) {
      s.app.primaryWithdrawal!.network = network;
      const before = JSON.stringify(s.app.primaryWithdrawal), html = await s.wallet();
      expect(html).toContain(expected[index]); expect(html).toContain("-$25.00");
      expect(html).toContain(dictionaries[s.locale.code].wallet.sent); expect(html).not.toContain("UTC+7");
      expect(html).toContain("wallet-withdrawal-activity"); expect(html).not.toContain("2026/10/27");
      expect(JSON.stringify(s.app.primaryWithdrawal)).toBe(before);
    }
    s.rows[0].lastTs = Date.parse("2025-12-31T16:05:06Z"); s.rows[1].messages = [];
    const service = await s.service(); expect(service).toContain(expected[index]); expect(service).toContain("activity preview");
    expect(service.indexOf('class="service-preview"')).toBeGreaterThan(-1);
    expect(service.indexOf('class="service-time"')).toBeGreaterThan(service.indexOf('class="service-preview"'));
  }
  expect(s.navTo).not.toHaveBeenCalled(); expect(s.refresh).not.toHaveBeenCalled();
});
it.each(["Asia/Tokyo", "America/Los_Angeles"])("keeps bank wallet submission in UTC+7 across the year boundary in %s", async zone => {
  vi.stubEnv("TZ", zone); vi.stubGlobal("Intl", undefined);
  const s = screen();
  const expected = ["2025/12/31 23:05 UTC+7", "Dec 31, 2025 23:05 UTC+7", "31/12/2025 23:05 UTC+7"];
  for (const [index, language] of ["zh", "en", "vi"].entries()) {
    s.locale.code = language as keyof typeof dictionaries;
    for (const [status, label] of [["sent", dictionaries[s.locale.code].bankWithdrawal.processing],
      ["tx-failed", dictionaries[s.locale.code].wallet.statusTxFailed], ["refunded", dictionaries[s.locale.code].wallet.statusRefunded]]) {
      s.app.primaryWithdrawal!.status = status;
      const before = JSON.stringify(s.app.primaryWithdrawal), html = await s.wallet();
      expect(html).toContain(expected[index]); expect(html).toContain(`${label} · `); expect(html).toContain("-$25.00");
      expect(html).not.toContain("2026/10/27"); expect(JSON.stringify(s.app.primaryWithdrawal)).toBe(before);
    }
  }
  expect(s.navTo).not.toHaveBeenCalled(); expect(s.app.refreshRemoteFleet).not.toHaveBeenCalled();
});
it.each(["BANK-VND", "USDT-BEP20"].flatMap(network => [undefined, null, 0, -1, NaN, Infinity, Number.MAX_VALUE].map(invalid => [network, invalid] as const)))("%s remote wallet never reuses legacy business time for unknown display evidence %s", async (network, invalid) => {
  const s = screen(); Object.assign(s.app.primaryWithdrawal!, { network, displaySubmittedAt: invalid });
  const html = await s.wallet(); expect(html).toContain(" · —"); expect(html).not.toContain("UTC+7");
  expect(html).not.toContain("1970"); expect(html).not.toContain("NaN"); expect(html).toContain("-$25.00");
});
it.each(["BANK-VND", "USDT-BEP20"])("keeps %s mock submission display explicit and clears removed account rows", async network => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  const s = screen(false); Object.assign(s.app.primaryWithdrawal!, { network, submittedAt: s.app.primaryWithdrawal!.displaySubmittedAt });
  expect(await s.wallet()).toContain(network === "BANK-VND" ? "Dec 31, 2025 23:05 UTC+7" : "Jan 1, 2026 01:05");
  s.app.primaryWithdrawal = null; expect(await s.wallet()).not.toContain("wallet-withdrawal-activity");
});
it("keeps recent-activity ordering, loaded previews, unavailable errors and unread ownership", async () => {
  const s = screen(); const before = JSON.stringify(s.rows);
  let html = await s.service(); expect(html.indexOf("activity preview")).toBeLessThan(html.indexOf("loaded preview"));
  expect(html).toContain(formatDisplayDateTime(s.rows[0].lastTs, "en")); expect(html).toContain(formatDisplayDateTime(s.rows[1].messages[0].ts, "en"));
  expect(html).toContain('class="service-unread"');
  s.conversations.error = "controlled"; html = await s.service(); expect(html).toContain('role="alert"'); expect(html).toContain(en.ui.retry);
  expect(html).toContain("activity preview"); expect(JSON.stringify(s.rows)).toBe(before);
  s.rows.splice(0); expect(await s.service()).not.toContain('class="service-time"');
});
it.each([0, NaN, Infinity])("invalid activity watermarks %s stay unknown without a current-time substitute", async value => {
  const s = screen(); s.rows.splice(1); s.rows[0].lastTs = value;
  const html = await s.service(); expect(html).toMatch(/class="service-time"[^>]*>—<\/text>/); expect(html).not.toContain("NaN");
});
