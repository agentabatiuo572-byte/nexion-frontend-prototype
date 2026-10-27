import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { compile, baseParse as parseTemplate } from "@vue/compiler-dom";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import tokenSource from "@/components/genesis/my-token-card.vue?raw";
import rosterSource from "@/components/team/team-roster-section.vue?raw";
import achievementsSource from "@/pages/me/achievements.vue?raw";
import securitySource from "@/pages/me/security.vue?raw";
import * as dates from "@/lib/display-date";
import * as prices from "@/lib/genesis-marketplace-presentation";
import { displayGenesisHoldingId } from "@/lib/genesis-holding-id";
import { genesisMarketFloor } from "@/lib/genesis-market-floor";
import { formatCommandAmount } from "@/lib/command-amount";
import { parseGenesisListingPrice } from "@/lib/genesis-listing-price";
import { canExecuteGenesisListingConfirmation } from "@/lib/genesis-listing-confirmation";
import { displayNickname } from "@/lib/brand-copy";
import { formatAmount, formatGroupedAmount } from "@/lib/amount-display";
import { formatComputePoints } from "@/i18n/compute-points";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { rankLabel } from "@/lib/v-rank-copy";
import { fmt } from "@/i18n/format";
import { ACHIEVEMENTS } from "@/mock/achievements";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
const dictionaries = { zh, en, vi: vietnamese }, scopes: Vue.EffectScope[] = [];
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const js = (s: string) => ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const empty = { render: () => null }, slot = { setup: (_p: unknown, c: Vue.SetupContext) => () => Vue.h("view", c.slots.default?.()) };
function screen(kind: "token" | "roster" | "achievements" | "security", timestamp: unknown, remote = true) {
  const locale = Vue.reactive({ code: "zh" as keyof typeof dictionaries }), t = Vue.computed(() => dictionaries[locale.code]), io = vi.fn();
  const scope = Vue.effectScope(); scopes.push(scope);
  if (kind === "security") {
    const script = parse(securitySource).descriptor.scriptSetup!.content, ast = ts.createSourceFile("security.ts", script, ts.ScriptTarget.Latest, true);
    const picked = ast.statements.filter(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ["passwordHintLine", "rowStyle", "rowLabelStyle", "rowSubStyle", "passwordHintStyle", "chevronStyle"].includes(d.name.getText(ast)))
      || ts.isFunctionDeclaration(n) && ["relativeWhen", "lastActiveLabel", "iconBox"].includes(n.name?.text ?? "")).map(n => n.getText(ast)).join("\n");
    const remoteSecurity = Vue.ref({ passwordChangedAt: timestamp }), security = { passwordChangedAt: timestamp };
    const deps = { computed: Vue.computed, t, remoteApiEnabled: remote, remoteSecurity, security, formatDisplayDateTime: dates.formatDisplayDateTime, dateLocale: () => locale.code, fmt };
    const state = scope.run(() => new Function(...Object.keys(deps), js(picked + "\nreturn {passwordHintLine,lastActiveLabel,iconBox,rowStyle,rowLabelStyle,rowSubStyle,chevronStyle,passwordHintStyle:typeof passwordHintStyle==='undefined'?undefined:passwordHintStyle};"))(...Object.values(deps)))!;
    const nodes = (node: any): any[] => [node, ...(node.children ?? []).flatMap(nodes)];
    const line = nodes(parseTemplate(parse(securitySource).descriptor.template!.content)).find(node => node.tag === "view" && node.props?.some((p: any) => p.exp?.content === "editingPwd = !editingPwd"))!.loc.source;
    const render = new Function("Vue", js(compile(line, { mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag) }).code))(Vue);
    return { locale, state, io, raw: { remoteSecurity: remoteSecurity.value, security }, html: () => renderToString(Vue.createSSRApp({ render: () => render(Vue.proxyRefs({ ...state, t, editingPwd: Vue.ref(false) }), []) })) };
  }
  const raw = kind === "token" ? tokenSource : kind === "roster" ? rosterSource : achievementsSource;
  const props = kind === "token" ? { tokenId: "holding-history", pageScope: { visible: true, epoch: 1 } } : kind === "roster" ? {
    color: "var(--v5-brand)", title: "Historical members", subtitle: "", accentBg: "transparent", accentText: "var(--v5-ink)", badge: "", members: [{ id: "member-history", name: "Historical Member", vRank: 2, layer: 1, status: "active", joinedAt: timestamp, monthComputePoints: 1234, lifetimeComputePoints: 5678, monthVolumeUSD: 12, city: "City" }], isOpen: true, emptyLabel: "", kind: "direct", showContribution: false,
  } : { embedded: true };
  const genesis = { myListings: [{ tokenId: "holding-history", askPriceUSDT: 12.123456, listedAt: timestamp }], remoteMarketStats: { floorUsdt: 10 }, remoteRoyaltyPct: 2.5, listNode: io, cancelListing: io };
  const records = [{ id: "first_contribution", unlockedAt: timestamp, claimed: true }], ach = { records, isUnlocked: () => true, isClaimed: () => true, claim: io, unlock: io };
  const modules: Record<string, unknown> = { vue: { ...Vue, onMounted: vi.fn(), onUnmounted: vi.fn(), getCurrentInstance: () => ({ uid: 1 }) },
    "@/lib/display-date": dates, "@/lib/genesis-marketplace-presentation": prices, "@/lib/genesis-holding-id": { displayGenesisHoldingId },
    "@/lib/genesis-market-floor": { genesisMarketFloor }, "@/lib/command-amount": { formatCommandAmount }, "@/lib/genesis-listing-price": { parseGenesisListingPrice },
    "@/lib/genesis-listing-confirmation": { canExecuteGenesisListingConfirmation }, "@/lib/account-scope": { captureAccountScope: io, isCurrentAccountScope: () => true },
    "@/lib/brand-copy": { displayNickname }, "@/lib/amount-display": { formatAmount, formatGroupedAmount }, "@/i18n/compute-points": { formatComputePoints },
    "@/i18n/network-reaudit": { networkReauditCopy }, "@/lib/v-rank-copy": { rankLabel }, "@/store/locale": { useLocaleStore: () => locale }, "@/store/commission": { UNILEVEL_USDT: {} },
    "@/i18n/use-t": { useT: () => t }, "@/i18n/format": { fmt, dateLocale: () => locale.code }, "@/store/genesis": { useGenesis: () => genesis },
    "@/store/genesis-config": { useGenesisConfig: () => ({ config: { marketStats: { floor: 10 } } }) }, "@/composables/use-genesis-sale-gate": { useGenesisSaleGate: () => ({ secondaryBlock: Vue.ref(null), blockText: Vue.ref(null) }) },
    "@/api/runtime": { remoteApiEnabled: kind !== "achievements", sessionVault: { read: () => null }, pointsApi: {} }, "@/store/ui": { toast: { success: io, error: io, info: io }, confirm: io, useUI: () => ({ clearConfirmsBy: io }) },
    "@/store/app": { useApp: () => ({ accountKey: "fixture", accountBindingEpoch: 1, visibleDevices: [], earnings: { total: 0 } }) }, "@/store/achievements": { useAchievements: () => ach },
    "@/lib/money-receipt": { postMoneyBillsOnce: io }, "@/store/device-types": { isPurchasedHardwareKind: () => false }, "@/mock/achievements": { ACHIEVEMENTS },
    "@/pages/daily/daily-reward-view": { dailyMilestoneRewardText: () => "", dailyRewardLabels: () => ({}) }, "@dcloudio/uni-app": { onShow: vi.fn(), onHide: vi.fn() },
    "./achievements-remote-read": { readAchievementsForCurrentSession: io } };
  const descriptor = parse(raw).descriptor, exports = {} as { default: { setup: (p: unknown, c: unknown) => Record<string, any> } };
  new Function("require", "exports", js(compileScript(descriptor, { id: "history-" + kind }).content))((id: string) => id.endsWith(".vue") ? { default: empty } : modules[id], exports);
  const state = scope.run(() => exports.default.setup(props, { expose: vi.fn(), emit: io }))!;
  if (kind === "roster") state.toggleMember("member-history");
  const render = new Function("Vue", js(compile(descriptor.template!.content, { mode: "function", prefixIdentifiers: true, isTS: true, expressionPlugins: ["typescript"], isCustomElement: tag => ["view", "text", "input"].includes(tag) }).code))(Vue);
  const component = { components: { GenesisArtwork: empty, TeamRankEmblem: empty, NxPageContent: slot, SubPageHeader: empty }, render: () => render(Vue.proxyRefs({ ...props, ...state, $slots: {} }), []) };
  return { locale, state, io, raw: { genesis, ach, props }, html: () => renderToString(Vue.createSSRApp(component)) };
}
it.each(["token", "roster", "achievements", "security"] as const)("renders actual %s historical consumer across local years in three languages", async kind => {
  for (const [zone, offset, expected] of [["Asia/Tokyo", -540, ["2026/01/01 01:05", "Jan 1, 2026 01:05", "01/01/2026 01:05"]], ["America/Los_Angeles", 480, ["2025/12/31 08:05", "Dec 31, 2025 08:05", "31/12/2025 08:05"]]] as const) {
    vi.stubEnv("TZ", zone); expect(new Date("2025-12-31T16:05:06Z").getTimezoneOffset()).toBe(offset); vi.stubGlobal("Intl", undefined);
    const s = screen(kind, kind === "security" ? "2025-12-31T16:05:06Z" : Date.parse("2025-12-31T16:05:06Z")), before = JSON.stringify(s.raw);
    for (const [i, language] of ["zh", "en", "vi"].entries()) { s.locale.code = language as keyof typeof dictionaries; expect(await s.html()).toContain(expected[i]); }
    expect(JSON.stringify(s.raw)).toBe(before); expect(s.io).not.toHaveBeenCalled();
    if (kind === "token") expect(await s.html()).toContain("$12.123456");
    if (kind === "roster") expect(await s.html()).toContain("Historical Member");
    if (kind === "achievements") expect(await s.html()).toContain("UVT");
  }
});
it.each(["token", "roster", "achievements", "security"] as const)("keeps invalid %s timestamps unknown in three languages", async kind => {
  for (const value of [0, -1, NaN, Infinity, null, undefined]) { const s = screen(kind, value); for (const language of ["zh", "en", "vi"] as const) { s.locale.code = language; const html = await s.html(); expect(html).toContain("—"); expect(html).not.toContain("NaN"); expect(html).not.toContain("1970"); } }
});
it("uses existing Java+08 parsing for password events and preserves pure calendar dates", async () => {
  vi.stubEnv("TZ", "America/Los_Angeles"); expect(new Date("2025-12-31T16:05:06Z").getTimezoneOffset()).toBe(480);
  const s = screen("security", "2026-01-01T00:05:06"); expect(await s.html()).toContain("2025/12/31 08:05");
  const calendar = screen("security", "2026-09-24"); expect(await calendar.html()).toContain("2026/09/24"); expect(await calendar.html()).not.toContain("2026/09/23");
});
it("keeps numeric mock password date support and online session activity relative", async () => {
  vi.stubEnv("TZ", "Asia/Tokyo"); const s = screen("security", Date.parse("2025-12-31T16:05:06Z"), false); expect(await s.html()).toContain("2026/01/01 01:05");
  expect(s.state.lastActiveLabel(Date.now())).toBe(zh.security.timeJustNow); expect(s.state.lastActiveLabel(Date.now() - 360000)).toBe(fmt(zh.security.timeMinutesAgo, { n: 6 }));
});
