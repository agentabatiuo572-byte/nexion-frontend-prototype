import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed, reactive, ref } from "vue";
import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import source from "./daily.vue?raw";
import { resolveWalletBillMemo } from "@/lib/wallet-bill-display";
import { dailyCheckInSuccessCopy } from "./daily-success-copy";
import { fmt } from "@/i18n/format";
import { formatTrialDateTime } from "@/lib/trial-date";
import { en } from "@/i18n/messages/en";
import { createPointsApi } from "@/api/points-api";
import { advanceRuntimeRevision, captureRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { createScopedReadCoalescer } from "@/lib/binary-read-coalescer";
import type { CanonicalE3Fleet } from "@/api/device-e3-api";
import * as rewardView from "./daily-reward-view";

const remote = vi.hoisted(() => ({
  fundsServerEnabled: true, remoteApiEnabled: true, expectedApiEnvironment: "dev",
  walletBillsApi: { list: vi.fn(), summary: vi.fn() }, sessionVault: { read: vi.fn() },
  pointsApi: { state: vi.fn(), checkIn: vi.fn(), claimMilestone: vi.fn(), useSaver: vi.fn() },
  deviceE3Api: { fleet: vi.fn() }, taskAssignmentApi: { state: vi.fn() },
  appHomeApi: { fetch: vi.fn() }, withdrawalApi: { submit: vi.fn(), list: vi.fn(), get: vi.fn() },
}));
vi.mock("@/api/runtime", () => remote);
const { useBills } = await import("@/store/bills");
const { useApp } = await import("@/store/app");
const { useNexFaucet } = await import("@/store/nex-faucet");

function summary(earned: number | null = 199, spent: number | null = 18) {
  return { source: "server", sourceEnvironment: "PRODUCTION", asOf: 2000, timeZone: "UTC",
    rewardsUsdt: 0, rewardsNex: 499, latestRewardAt: 1000, todayNexEarn: 0, pendingNex: 300,
    monthBillCount: 10, recentNexBills: [], settledRewardsNex: earned, withdrawalOffsetNexSpent: spent };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function mount(bills: ReturnType<typeof useBills>) {
  const start = source.indexOf("const lifetimeEarned =");
  const end = source.indexOf("function daysLeftText", start);
  if (start < 0 || end < start) throw new Error("Daily ledger projection missing");
  const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const faucet = reactive({ history: [{ delta: 999, ts: 1, reason: "cached reward" }, { delta: -50, ts: 2, reason: "cached swap" }] });
  return new Function("computed", "remoteApiEnabled", "bills", "faucet", "t", "resolveWalletBillMemo",
    `${code}\nreturn { lifetimeEarned, lifetimeSpent, historyRows };`,
  )(computed, true, bills, faucet, ref({ bills: { memo: {} }, wallet: { pending: "Pending" } }), resolveWalletBillMemo);
}

function commands(bills: ReturnType<typeof useBills>, accepted: boolean) {
  const script = source.slice(source.indexOf('<script setup lang="ts">') + '<script setup lang="ts">'.length, source.indexOf('</script>'));
  const parsed = ts.createSourceFile('daily.ts', script, ts.ScriptTarget.Latest, true);
  const names = ['refreshLedger', 'handleCheckIn', 'handleClaimMilestone'];
  const functions = parsed.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
  if (functions.length !== names.length) throw new Error('Daily command handlers missing');
  const code = ts.transpileModule(functions.map((node) => node.getText(parsed)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const deps = {
    bills, remoteApiEnabled: true, pageActive: true, remoteSessionReady: ref(true),
    refreshBalance: vi.fn(),
    app: { accountKey: "user:607", accountBindingEpoch: 1 },
    dailyFactsReady: ref(true), checkInStateConfirmed: ref(true),
    lastSignedToday: ref(false), remoteRefreshing: ref(false), checkInSubmitting: ref(false),
    faucet: { checkInRemote: vi.fn().mockResolvedValue({ ok: accepted, gained: 5, streak: 3 }),
      claimMilestoneRemote: vi.fn().mockResolvedValue(accepted) },
    toast: { success: vi.fn(), error: vi.fn() }, t: ref(en), dailyCheckInSuccessCopy, fmt,
    isMilestoneClaimed: () => false, isMilestoneUnlocked: () => true,
  };
  const handlers = new Function(...Object.keys(deps), `${code}\nreturn { handleCheckIn, handleClaimMilestone };`)(...Object.values(deps));
  return { ...deps, ...handlers };
}

beforeEach(() => {
  setActivePinia(createPinia());
  remote.walletBillsApi.summary.mockReset().mockResolvedValue(summary());
});

// Local host adapter for the real SFC; no browser/network or client reward arithmetic.
type RenderNode = { kind: string; value: string; props: Record<string, any>; parent: RenderNode | null; children: RenderNode[] };
const renderNode = (kind: string, value = ""): RenderNode => ({ kind, value, props: {}, parent: null, children: [] });
const pageRenderer = Vue.createRenderer<RenderNode, RenderNode>({
  createElement: kind => renderNode(kind), createText: value => renderNode("text", value), createComment: () => renderNode("comment"),
  setText: (el, value) => { el.value = value; }, setElementText: (el, value) => { el.value = value; el.children = []; },
  patchProp: (el, key, _old, value) => { el.props[key] = value; }, parentNode: el => el.parent,
  nextSibling: el => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
  insert: (el, parent, anchor) => {
    if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1);
    el.parent = parent; const at = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(at < 0 ? parent.children.length : at, 0, el);
  },
  remove: el => { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1); },
});
const renderText = (el: RenderNode): string => el.value + el.children.map(renderText).join("");
const renderNodes = (el: RenderNode): RenderNode[] => [el, ...el.children.flatMap(renderNodes)];
const pageButtons = (root: RenderNode) => renderNodes(root).filter(el => el.props.role === "button");
const primary = (root: RenderNode) => pageButtons(root).find(el =>
  [en.daily.checkedInToday, en.daily.checkInUnconfirmed, fmt(en.daily.checkInBase, { n: 2 })].includes(renderText(el)))!;
const stat = (root: RenderNode, label: string) => renderText(renderNodes(root).find(el => el.children.some(child => renderText(child) === label))!.children[1]);
async function settlePage() { for (let n = 0; n < 20; n++) await Promise.resolve(); await Vue.nextTick(); }
function pointsState(signed = false) {
  return { rewardAsset: "NEX", serverDate: "2026-10-01", nextResetAtUtc: "2026-10-01T17:00:00Z",
    streak: { currentStreak: 1, longestStreak: 1, streakSavers: 1, lastCheckInDate: signed ? "2026-10-01" : null, checkedInToday: signed },
    dailyMilestones: [], earningMilestones: [], badgeAchievements: [], powerUps: [], topStreakers: [],
    rules: [{ key: "baseline", value: "2" }], source: "nx_user_streak + nx_daily_check_in",
    serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" };
}
function walletFleet(walletNex: number): CanonicalE3Fleet {
  return { dailyUsdt: 0, dailyNex: 0, realizedTodayUsdt: 0, realizedTodayNex: 0, walletUsdt: 110.1, walletNex,
    userJoinedAt: 1, serverNow: 1, timezone: "UTC", slotCap: 1, devices: [],
    capacitySchedule: { stageEarlyEnd: "3", stageMidEnd: "8", capacityFloorPct: "22", capacitySubsidyDays: "30",
      capacityBand1DeltaPct: "-4", capacityBand2DeltaPct: "-6", capacityBand3DeltaPct: "-23.7",
      capacityApplyToPhone: "false", capacityApplyToCloudShare: "false", capacityApplyToPcGpu: "false",
      capacityApplyToS1: "true", capacityApplyToPro: "true", capacityApplyToProV2: "true", capacityApplyToRackP1: "true", capacityApplyToRackP2: "true" },
    source: "nx_user_device + nx_compute_receipt + nx_compute_e3_config", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" };
}
const closes: Array<() => void> = [];
afterEach(() => { closes.splice(0).forEach(close => close()); vi.useRealTimers(); });
async function mountedDaily() {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T16:20:00Z"));
  remote.sessionVault.read.mockReturnValue({ user: { userId: 607 } });
  const pointReads: Array<ReturnType<typeof deferred<unknown>>> = [], writes: Array<ReturnType<typeof deferred<unknown>>> = [];
  const request = vi.fn((input: { method: string; path: string }) => {
    const read = deferred<unknown>();
    if (input.method === "GET" && input.path === "/api/points/state") pointReads.push(read);
    else if (input.method === "POST" && input.path === "/api/points/sign-in") writes.push(read);
    else throw new Error("Unexpected mutation");
    return read.promise;
  });
  const points = createPointsApi({ request } as never);
  for (const name of ["state", "checkIn", "claimMilestone", "useSaver"] as const) remote.pointsApi[name].mockReset().mockImplementation(points[name]);
  const wallets: Array<ReturnType<typeof deferred<CanonicalE3Fleet>>> = [];
  remote.deviceE3Api.fleet.mockReset().mockImplementation(() => { const read = deferred<CanonicalE3Fleet>(); wallets.push(read); return read.promise; });
  remote.taskAssignmentApi.state.mockReset().mockResolvedValue({ serverNow: 1, devices: [], source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true });
  remote.walletBillsApi.summary.mockReset().mockResolvedValue(summary(134, 0));
  const app = useApp(), faucet = useNexFaucet(), bills = useBills();
  const auth = Vue.reactive({ isAuthenticated: true, accountId: "user:607" });
  const bind = (userId: number) => {
    remote.sessionVault.read.mockReturnValue({ user: { userId } }); auth.accountId = `user:${userId}`;
    app.bindAccount(auth.accountId); bills.bindAccount(auth.accountId);
    advanceRuntimeRevision("account catalog preparation"); faucet.bindAccount(auth.accountId);
  };
  bind(607);
  const toast = { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }, shows: Array<() => void> = [];
  const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h("view", slots.default?.()) };
  const deps: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onShow: (fn: () => void) => shows.push(fn) },
    "@/api/runtime": remote, "@/store/app": { useApp: () => app }, "@/store/nex-faucet": { useNexFaucet: () => faucet },
    "@/store/bills": { useBills: () => bills }, "@/store/auth": { useAuth: () => auth }, "@/store/lucky-spin": { useLuckySpin: () => ({}) },
    "@/store/ui": { toast }, "@/i18n/use-t": { useT: () => ref(en) }, "@/i18n/format": { fmt, dateLocale: () => "en-US" },
    "@/lib/trial-date": { formatTrialDateTime },
    "@/lib/binary-session-ready": { binarySessionReady }, "@/lib/binary-read-coalescer": { createScopedReadCoalescer },
    "@/api/order-api": { captureRuntimeRevision, subscribeRuntimeRevision }, "@/lib/route": { navTo: vi.fn() },
    "@/lib/wallet-bill-display": { resolveWalletBillMemo }, "@/api/geo-policy-error": { geoPolicyUserMessage: () => null },
    "@/lib/money-receipt": { postMoneyBillsOnce: () => { throw new Error("Unexpected local credit"); } },
    "./daily-reward-view": rewardView, "./daily-success-copy": { dailyCheckInSuccessCopy },
    ...Object.fromEntries(["app-chassis", "empty-state", "card-stagger", "sub-page-header", "daily/streak-power-ups"].map(name => [`@/components/${name}.vue`, { default: slot }])),
  };
  const { descriptor } = parse(source), compiled = compileScript(descriptor, { id: "daily-reward-balance", inlineTemplate: true });
  const js = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = { default: {} as Vue.Component };
  new Function("require", "exports", js)((id: string) => { if (!(id in deps)) throw new Error(`Unexpected import ${id}`); return deps[id]; }, exports);
  const root = renderNode("root"), mounted = pageRenderer.createApp(exports.default); mounted.mount(root);
  const close = () => mounted.unmount(); closes.push(close); await settlePage();
  pointReads[0].resolve(pointsState()); wallets[0].resolve(walletFleet(134)); await settlePage();
  expect(primary(root).props["aria-disabled"]).toBe("false"); expect(stat(root, en.daily.balance)).toBe("134");
  const success = async () => {
    const completion = primary(root).props.onClick(); await settlePage();
    pointReads.at(-1)!.resolve(pointsState()); await settlePage(); // Actual write-before-fresh-state gate.
    expect(writes).toHaveLength(1);
    writes[0].resolve({ checkInDate: "2026-10-01", baseNex: 2, rewardNex: 2, streakBonusNex: 0, multiplier: 1,
      streakDays: 1, serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" });
    await settlePage(); pointReads.at(-1)!.resolve(pointsState(true));
    await completion; await settlePage();
    expect(faucet.remoteCheckedInToday).toBe(true); expect(primary(root).props["aria-disabled"]).toBe("true");
    expect(toast.success).toHaveBeenCalledOnce();
  };
  return { root, app, faucet, bills, auth, pointReads, writes, wallets, request, toast, bind, close, success, show: () => shows.forEach(fn => fn()) };
}

describe("Daily actual SFC post-reward balance", () => {
  it("updates the wallet from a fresh server projection after a successful check-in", async () => {
    const p = await mountedDaily(); remote.walletBillsApi.summary.mockResolvedValue(summary(136, 0));
    await p.success(); expect(stat(p.root, en.daily.lifetime)).toBe("136");
    console.info("post-success before wallet readback", { balance: stat(p.root, en.daily.balance), lifetime: stat(p.root, en.daily.lifetime),
      signed: p.faucet.remoteCheckedInToday, walletReads: p.wallets.length, signInWrites: p.writes.length });
    expect(p.wallets).toHaveLength(2); expect(stat(p.root, en.daily.balance)).toBe("134");
    p.wallets[1].resolve(walletFleet(136)); await settlePage();
    expect(stat(p.root, en.daily.balance)).toBe("136"); expect(p.app.user.usdtBalance).toBe(110.1);
    await primary(p.root).props.onClick(); expect(p.writes).toHaveLength(1);
    expect(p.toast.error).not.toHaveBeenCalled();
  });

  it("reads past a pending pre-write lifecycle projection and rejects its later stale completion", async () => {
    const p = await mountedDaily(); p.show(); await settlePage();
    expect(p.wallets).toHaveLength(2);
    p.pointReads[1].resolve(pointsState()); await settlePage();
    await p.success(); expect(p.wallets).toHaveLength(3);
    expect(stat(p.root, en.daily.balance)).toBe("134"); // No reward arithmetic while the authoritative read is pending.
    p.wallets[2].resolve(walletFleet(141)); await settlePage(); // Server wallet may include another independent change.
    expect(stat(p.root, en.daily.balance)).toBe("141");
    p.wallets[1].resolve(walletFleet(134)); await settlePage();
    expect(stat(p.root, en.daily.balance)).toBe("141"); expect(p.writes).toHaveLength(1);
  });

  it("keeps a committed reward signed when wallet readback fails, and Retry only rereads the wallet", async () => {
    const p = await mountedDaily(); await p.success(); expect(p.wallets).toHaveLength(2);
    p.wallets[1].reject(new Error("wallet temporarily unavailable")); await settlePage();
    expect(p.app.remoteFleetStatus).toBe("error"); expect(stat(p.root, en.daily.balance)).toBe("134");
    expect(renderText(p.root)).toContain(en.wallet.fundsStaleBody);
    expect(renderText(primary(p.root))).toBe(en.daily.checkedInToday); expect(primary(p.root).props["aria-disabled"]).toBe("true");
    await primary(p.root).props.onClick(); expect(p.writes).toHaveLength(1);
    expect(p.toast.success).toHaveBeenCalledOnce(); expect(p.toast.error).not.toHaveBeenCalled();
    pageButtons(p.root).find(el => renderText(el) === en.wallet.retryFunds)!.props.onClick(); await settlePage();
    expect(p.wallets).toHaveLength(3); p.wallets[2].resolve(walletFleet(136)); await settlePage();
    expect(stat(p.root, en.daily.balance)).toBe("136"); expect(p.writes).toHaveLength(1);
    expect(p.faucet.remoteCheckedInToday).toBe(true);
  });

  it.each(["success", "failure"])("keeps a late wallet %s out of a newly bound account", async outcome => {
    const p = await mountedDaily(); await p.success(); expect(p.wallets).toHaveLength(2);
    p.bind(608); await settlePage(); expect(p.app.remoteFleetHasSnapshot).toBe(false);
    p.pointReads.at(-1)!.resolve(pointsState()); p.wallets[2].resolve(walletFleet(401)); await settlePage();
    expect(p.app.accountKey).toBe("user:608"); expect(stat(p.root, en.daily.balance)).toBe("401");
    if (outcome === "success") p.wallets[1].resolve(walletFleet(999)); else p.wallets[1].reject(new Error("old account wallet offline"));
    await settlePage(); expect(stat(p.root, en.daily.balance)).toBe("401"); expect(p.app.remoteFleetStatus).toBe("ready");
    expect(p.writes).toHaveLength(1);
  });

  it("does not initiate wallet or ledger readback after the page unmounts during the committed command's points follow-up", async () => {
    const p = await mountedDaily(), summaryReads = remote.walletBillsApi.summary.mock.calls.length;
    const command = primary(p.root).props.onClick(); await settlePage();
    p.pointReads[1].resolve(pointsState()); await settlePage();
    p.writes[0].resolve({ checkInDate: "2026-10-01", baseNex: 2, rewardNex: 2, streakBonusNex: 0, multiplier: 1,
      streakDays: 1, serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" });
    await settlePage(); p.close(); p.pointReads[2].resolve(pointsState(true)); await command; await settlePage();
    expect(p.wallets).toHaveLength(1); expect(remote.walletBillsApi.summary).toHaveBeenCalledTimes(summaryReads);
    expect(p.faucet.remoteCheckedInToday).toBe(true); expect(p.writes).toHaveLength(1);
    expect(p.toast.error).not.toHaveBeenCalled();
  });

  it("keeps write-before-fresh-state and duplicate-submit guards; a refused command starts no wallet readback", async () => {
    const p = await mountedDaily(), summaryReads = remote.walletBillsApi.summary.mock.calls.length;
    const button = primary(p.root), command = button.props.onClick(); await settlePage();
    expect(p.writes).toHaveLength(0); await button.props.onClick(); expect(p.writes).toHaveLength(0);
    p.pointReads[1].resolve(pointsState()); await settlePage(); expect(p.writes).toHaveLength(1);
    await button.props.onClick(); expect(p.writes).toHaveLength(1);
    p.writes[0].reject(new Error("isolated refused command")); await command; await settlePage();
    expect(p.toast.success).not.toHaveBeenCalled(); expect(p.toast.error).toHaveBeenCalledOnce();
    expect(p.wallets).toHaveLength(1); expect(remote.walletBillsApi.summary).toHaveBeenCalledTimes(summaryReads);
  });

  async function committedWithPendingPoints() {
    const p = await mountedDaily(), command = primary(p.root).props.onClick(); await settlePage();
    p.pointReads[1].resolve(pointsState()); await settlePage();
    p.writes[0].resolve({ checkInDate: "2026-10-01", baseNex: 2, rewardNex: 2, streakBonusNex: 0, multiplier: 1,
      streakDays: 1, serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" });
    await settlePage();
    return { ...p, command, originalFollowup: p.pointReads[2] };
  }

  it.each(["account switch", "same-account rebind"])("suppresses old committed-command wallet read after %s during points follow-up", async kind => {
    const p = await committedWithPendingPoints(), currentUser = kind === "account switch" ? 608 : 607;
    const currentBalance = kind === "account switch" ? 401 : 501;
    p.bind(currentUser); await settlePage();
    p.pointReads.at(-1)!.resolve(pointsState()); p.wallets[1].resolve(walletFleet(currentBalance)); await settlePage();
    const before = p.wallets.length; expect(before).toBe(2); expect(p.app.remoteFleetStatus).toBe("ready");
    p.originalFollowup.resolve(pointsState(true)); await p.command; await settlePage();
    // Make the concrete R01 failure observable, rather than accepting a harmless-looking extra read.
    p.wallets[before]?.reject(new Error("extra current-account wallet read failed")); await settlePage();
    console.info("old committed command released", { kind, account: p.app.accountKey, before, after: p.wallets.length,
      wallet: p.app.user.nexBalance, status: p.app.remoteFleetStatus, signedCurrent: p.faucet.remoteCheckedInToday, writes: p.writes.length });
    expect(p.wallets).toHaveLength(before); expect(p.app.remoteFleetStatus).toBe("ready");
    expect(stat(p.root, en.daily.balance)).toBe(String(currentBalance)); expect(p.faucet.remoteCheckedInToday).toBe(false);
    expect(p.writes).toHaveLength(1);
  });

  it("switching accounts during the pre-write fresh-state read starts no old POST or extra current wallet read", async () => {
    const p = await mountedDaily(), command = primary(p.root).props.onClick(); await settlePage();
    const originalRead = p.pointReads[1]; p.bind(608); await settlePage();
    p.pointReads.at(-1)!.resolve(pointsState()); p.wallets[1].resolve(walletFleet(401)); await settlePage();
    originalRead.resolve(pointsState()); await command; await settlePage();
    expect(p.writes).toHaveLength(0); expect(p.wallets).toHaveLength(2);
    expect(p.app.remoteFleetStatus).toBe("ready"); expect(stat(p.root, en.daily.balance)).toBe("401");
  });

  it("switching accounts while the POST is pending starts no post-command wallet read for the new account", async () => {
    const p = await mountedDaily(), command = primary(p.root).props.onClick(); await settlePage();
    p.pointReads[1].resolve(pointsState()); await settlePage(); expect(p.writes).toHaveLength(1);
    p.bind(608); await settlePage(); p.pointReads.at(-1)!.resolve(pointsState()); p.wallets[1].resolve(walletFleet(401)); await settlePage();
    p.writes[0].resolve({ checkInDate: "2026-10-01", baseNex: 2, rewardNex: 2, streakBonusNex: 0, multiplier: 1,
      streakDays: 1, serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" });
    await command; await settlePage();
    expect(p.wallets).toHaveLength(2); expect(p.app.remoteFleetStatus).toBe("ready");
    expect(stat(p.root, en.daily.balance)).toBe("401"); expect(p.faucet.remoteCheckedInToday).toBe(false);
  });

  it.each(["logout", "mismatched session"])("the existing session guard suppresses wallet readback after %s during points follow-up", async kind => {
    const p = await committedWithPendingPoints();
    if (kind === "logout") { remote.sessionVault.read.mockReturnValue(null); p.auth.isAuthenticated = false; }
    else { remote.sessionVault.read.mockReturnValue({ user: { userId: 608 } }); p.auth.accountId = "user:608"; }
    await settlePage(); p.originalFollowup.resolve(pointsState(true)); await p.command; await settlePage();
    expect(p.wallets).toHaveLength(1); expect(p.writes).toHaveLength(1); expect(p.app.user.nexBalance).toBe(134);
  });
});

describe("Daily wallet ledger authority", () => {
  it.each(['refreshBalance(false)', 'refreshLedger()'])('makes %s retry available to pointer and keyboard users', (handler) => {
    const controls = source.match(/<view\b[^>]*>/g) ?? [];
    const control = controls.find((tag) => tag.includes(`@click="${handler}"`));
    expect(control).toBeDefined();
    expect(control).toContain('role="button"');
    expect(control).toContain('tabindex="0"');
    expect(control).toContain(`@keydown.enter.prevent="${handler}"`);
    expect(control).toContain(`@keydown.space.prevent="${handler}"`);
  });

  it("uses settled rewards and net withdrawal fee offsets independently of cached daily deltas", async () => {
    const bills = useBills();
    bills.bindAccount("A");
    const view = mount(bills);
    await bills.refreshSummary();
    expect(view.lifetimeEarned.value).toBe("199");
    expect(view.lifetimeSpent.value).toBe("18");
    expect(view.historyRows.value).toEqual([]);
  });

  it("keeps loading, errors and unsupported optional totals unknown", async () => {
    const pending = deferred<ReturnType<typeof summary>>();
    remote.walletBillsApi.summary.mockReturnValueOnce(pending.promise);
    const bills = useBills();
    bills.bindAccount("A");
    const view = mount(bills);
    const read = bills.refreshSummary();
    expect(view.lifetimeEarned.value).toBe("—");
    expect(view.lifetimeSpent.value).toBe("—");
    pending.reject(new Error("summary unavailable"));
    await expect(read).rejects.toThrow("summary unavailable");
    expect(view.lifetimeEarned.value).toBe("—");
    expect(view.lifetimeSpent.value).toBe("—");
    remote.walletBillsApi.summary.mockResolvedValueOnce(summary(null, null));
    await bills.refreshSummary();
    expect(view.lifetimeEarned.value).toBe("—");
    expect(view.lifetimeSpent.value).toBe("—");
  });

  it.each(["success", "failure"])("does not expose an old account's delayed %s after rebinding", async (outcome) => {
    const previous = deferred<ReturnType<typeof summary>>();
    remote.walletBillsApi.summary.mockReturnValueOnce(previous.promise).mockResolvedValueOnce(summary(20, 3));
    const bills = useBills();
    bills.bindAccount("A");
    const view = mount(bills);
    const oldRead = bills.refreshSummary();
    bills.bindAccount("B");
    expect(view.lifetimeEarned.value).toBe("—");
    await bills.refreshSummary();
    if (outcome === "success") previous.resolve(summary(999, 888));
    else previous.reject(new Error("previous account unavailable"));
    await expect(oldRead).rejects.toThrow(outcome === "success"
      ? "WALLET_SUMMARY_REQUEST_SUPERSEDED" : "previous account unavailable");
    expect(view.lifetimeEarned.value).toBe("20");
    expect(view.lifetimeSpent.value).toBe("3");
    remote.walletBillsApi.summary.mockRejectedValueOnce(new Error("B unavailable"));
    await expect(bills.refreshSummary()).rejects.toThrow("B unavailable");
    expect(view.lifetimeEarned.value).toBe("—");
    expect(view.lifetimeSpent.value).toBe("—");
  });

  it("preserves the current account's error when an old account succeeds afterwards", async () => {
    const previous = deferred<ReturnType<typeof summary>>();
    remote.walletBillsApi.summary.mockReturnValueOnce(previous.promise).mockRejectedValueOnce(new Error('B unavailable'));
    const bills = useBills(); bills.bindAccount('A');
    const view = mount(bills);
    const oldRead = bills.refreshSummary();
    bills.bindAccount('B');
    await expect(bills.refreshSummary()).rejects.toThrow('B unavailable');
    previous.resolve(summary(999, 888));
    await expect(oldRead).rejects.toThrow('WALLET_SUMMARY_REQUEST_SUPERSEDED');
    expect(bills.summaryStatus).toBe('error');
    expect(view.lifetimeEarned.value).toBe('—');
    expect(view.lifetimeSpent.value).toBe('—');
  });

  it.each(['check-in', 'milestone'])("forces a ledger reread only after a confirmed %s command", async (action) => {
    const bills = useBills(); bills.bindAccount('A');
    const view = mount(bills);
    await bills.refreshSummary();
    const refresh = vi.spyOn(bills, 'refreshSummary');
    const run = (h: ReturnType<typeof commands>) => action === 'check-in' ? h.handleCheckIn()
      : h.handleClaimMilestone({ day: 3, rewardText: '5 NEX', reward: { type: 'nex', amount: 5 } });
    const refused = commands(bills, false);
    await run(refused);
    expect(refresh).not.toHaveBeenCalled();
    expect(view.lifetimeEarned.value).toBe('199');
    remote.walletBillsApi.summary.mockResolvedValueOnce(summary(204, 18));
    const accepted = commands(bills, true);
    await run(accepted);
    expect(refresh).toHaveBeenCalledExactlyOnceWith({ force: true });
    await vi.waitFor(() => expect(view.lifetimeEarned.value).toBe('204'));
  });

  it.each(['check-in', 'milestone'])("keeps totals unknown when the post-%s ledger read fails", async (action) => {
    const bills = useBills(); bills.bindAccount('A');
    const view = mount(bills);
    await bills.refreshSummary();
    remote.walletBillsApi.summary.mockRejectedValueOnce(new Error('ledger unavailable'));
    const accepted = commands(bills, true);
    if (action === 'check-in') await accepted.handleCheckIn();
    else await accepted.handleClaimMilestone({ day: 3, rewardText: '5 NEX', reward: { type: 'nex', amount: 5 } });
    await vi.waitFor(() => expect(bills.summaryStatus).toBe('error'));
    expect(view.lifetimeEarned.value).toBe('—');
    expect(view.lifetimeSpent.value).toBe('—');
    expect(accepted.toast.success).toHaveBeenCalledOnce();
    expect(accepted.toast.error).not.toHaveBeenCalled();
  });

  // #154: "today's check-in state" is only ever proven by a successful read.
  // A failed read leaves remoteCheckedInToday at false, so without this gate the
  // page offers an enabled check-in whose precondition it cannot verify.
  it("refuses the check-in write while today's account state is unconfirmed", async () => {
    const bills = useBills(); bills.bindAccount('A');
    const handler = commands(bills, true);
    handler.checkInStateConfirmed.value = false;
    await handler.handleCheckIn();
    expect(handler.faucet.checkInRemote).not.toHaveBeenCalled();
    expect(handler.toast.error).toHaveBeenCalledOnce();
    expect(handler.toast.success).not.toHaveBeenCalled();
    // The button reports the same gate to assistive tech and names why it is inert.
    const button = (source.match(/<view\b[^>]*>/g) ?? []).find((tag) => tag.includes('@click="handleCheckIn"'));
    expect(button).toContain("!checkInStateConfirmed ? 'true' : 'false'");
    expect(source).toContain("t.daily.checkInUnconfirmed");
  });
});
