import * as Vue from "vue";
import type { Component } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import source from "./daily.vue?raw";
import { createPointsApi } from "@/api/points-api";
import { advanceRuntimeRevision, captureRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { createScopedReadCoalescer } from "@/lib/binary-read-coalescer";
import { en } from "@/i18n/messages/en";
import { fmt } from "@/i18n/format";
import { formatTrialDateTime } from "@/lib/trial-date";
import * as rewards from "./daily-reward-view";
import { dailyCheckInSuccessCopy } from "./daily-success-copy";

const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  userId: null as number | null,
  sessionVault: { read: (): { user: { userId: number } } | null => remote.userId === null ? null : { user: { userId: remote.userId } } },
  pointsApi: { state: vi.fn(), checkIn: vi.fn(), claimMilestone: vi.fn(), useSaver: vi.fn() },
}));
vi.mock("@/api/runtime", () => remote);
const { useNexFaucet } = await import("@/store/nex-faucet");

// Mount the actual Daily script/template and real Pinia store/points decoder.
// Only transport and unrelated page dependencies are isolated; these are test facts, not live business evidence.
type Host = { tag: string; text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (tag: string, text = ""): Host => ({ tag, text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: tag => node(tag), createText: text => node("#text", text), createComment: () => node("#comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
    child.parent = parent;
    const at = anchor ? parent.children.indexOf(anchor) : -1;
    if (at < 0) parent.children.push(child); else parent.children.splice(at, 0, child);
  },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); },
});
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const text = (root: Host): string => root.text + root.children.map(text).join("");
const buttons = (root: Host) => all(root).filter(item => item.props.role === "button");
const checkInButton = (root: Host) => buttons(root).find(item =>
  [en.daily.checkInUnconfirmed, fmt(en.daily.checkInBase, { n: 2 }), en.daily.checkedInToday].includes(text(item)));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 16; i++) await Promise.resolve(); await Vue.nextTick(); }
function snapshot(streak = 1, checkedInToday = false) {
  return {
    rewardAsset: "NEX", serverDate: "2026-10-01", nextResetAtUtc: "2026-10-01T17:00:00Z",
    streak: { currentStreak: streak, longestStreak: streak, streakSavers: 1, lastCheckInDate: "2026-09-26", checkedInToday },
    dailyMilestones: [{ milestoneId: 21, milestoneDay: 3, rewardType: "NEX", rewardAmount: 5, status: "LOCKED" }],
    earningMilestones: [], badgeAchievements: [], powerUps: [], topStreakers: [], rules: [{ key: "baseline", value: "2" }],
    source: "nx_user_streak + nx_daily_check_in", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
  };
}
const unmounts: Array<() => void> = [];
beforeEach(() => {
  setActivePinia(createPinia()); remote.userId = null;
  Object.values(remote.pointsApi).forEach(mock => mock.mockReset());
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T15:00:00Z"));
});
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.useRealTimers(); });

async function page() {
  const reads: Array<ReturnType<typeof deferred<unknown>>> = [];
  const request = vi.fn((input: { method: string; path: string }) => {
    if (input.method !== "GET" || input.path !== "/api/points/state") throw new Error("Unexpected points write");
    const read = deferred<unknown>(); reads.push(read); return read.promise;
  });
  const api = createPointsApi({ request } as never);
  for (const name of ["state", "checkIn", "claimMilestone", "useSaver"] as const) remote.pointsApi[name].mockImplementation(api[name]);
  const faucet = useNexFaucet();
  const memberRead = deferred<boolean>();
  const app = Vue.reactive({
    accountKey: "default", accountBindingEpoch: 1, user: { nexBalance: 124 },
    remoteFleetStatus: "ready", remoteFleetHasSnapshot: true, refreshRemoteFleet: vi.fn(() => memberRead.promise),
  });
  const auth = Vue.reactive({ isAuthenticated: false, accountId: "default" });
  const bills = Vue.reactive({
    summaryStatus: "ready", summary: { settledRewardsNex: 0, withdrawalOffsetNexSpent: 0, recentNexBills: [] },
    refreshSummary: vi.fn().mockResolvedValue(undefined),
  });
  const toast = { error: vi.fn(), success: vi.fn(), warn: vi.fn(), info: vi.fn() };
  const slot = { setup: (_props: unknown, { slots }: any) => () => Vue.h("view", slots.default?.()) };
  const shows: Array<() => void> = [];
  const dependencies: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onShow: (callback: () => void) => shows.push(callback) },
    "@/lib/route": { navTo: vi.fn() }, "@/i18n/use-t": { useT: () => Vue.ref(en) },
    "@/i18n/format": { fmt, dateLocale: () => "en-US" }, "@/store/nex-faucet": { useNexFaucet: () => faucet },
    "@/lib/trial-date": { formatTrialDateTime },
    "@/store/app": { useApp: () => app }, "@/store/auth": { useAuth: () => auth },
    "@/store/bills": { useBills: () => bills }, "@/store/lucky-spin": { useLuckySpin: () => ({}) },
    "@/store/ui": { toast }, "@/api/runtime": remote,
    "@/lib/binary-session-ready": { binarySessionReady }, "@/lib/binary-read-coalescer": { createScopedReadCoalescer },
    "@/api/order-api": { captureRuntimeRevision, subscribeRuntimeRevision },
    "@/lib/wallet-bill-display": { resolveWalletBillMemo: () => "" }, "@/api/geo-policy-error": { geoPolicyUserMessage: () => null },
    "@/lib/money-receipt": { postMoneyBillsOnce: vi.fn(() => { throw new Error("Unexpected credit"); }) },
    "./daily-reward-view": rewards, "./daily-success-copy": { dailyCheckInSuccessCopy },
    ...Object.fromEntries(["app-chassis", "empty-state", "card-stagger", "sub-page-header", "daily/streak-power-ups"].map(name => [
      `@/components/${name}.vue`, { default: slot },
    ])),
  };
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "daily-cold-scope", inlineTemplate: true });
  const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected Daily import: ${id}`);
    return dependencies[id];
  }, exports);
  const root = node("root"), mounted = renderer.createApp(exports.default); mounted.mount(root);
  const close = () => mounted.unmount(); unmounts.push(close); await flush();
  const bind = (userId = 607) => {
    remote.userId = userId; auth.isAuthenticated = true; auth.accountId = `user:${userId}`;
    app.accountKey = auth.accountId; app.accountBindingEpoch++;
    // Actual cold restore order: prepareProductCatalog synchronously publishes a revision before faucet.bindAccount.
    advanceRuntimeRevision("cold account catalog preparation");
    faucet.bindAccount(app.accountKey);
  };
  return { root, faucet, app, auth, toast, request, reads, bind, memberRead, close, show: () => shows.forEach(callback => callback()) };
}

test("cold catalog revision waits for faucet binding; a current decoded success enables Check in without another retry", async () => {
  const p = await page();
  expect(p.faucet.remoteReadState).toBe("idle"); expect(p.reads).toHaveLength(0);
  p.bind(); await flush();
  expect(p.faucet.remoteReadState).toBe("loading"); expect(p.reads).toHaveLength(1);
  // A normal member read may finish after the points read. It must not leave an earlier unbound read latched as failure.
  p.reads[0].resolve(snapshot()); await flush(); p.memberRead.resolve(true); await flush();
  await expect(remote.pointsApi.state.mock.results[0].value).resolves.toMatchObject({ serverDate: "2026-10-01", serverCanonical: true });
  expect(p.faucet.remoteReadState).toBe("ready");
  expect(p.faucet.signInStreak).toBe(1); expect(p.faucet.remoteCheckedInToday).toBe(false);
  console.info("current decoded scope", { state: p.faucet.remoteReadState, streak: p.faucet.signInStreak,
    checkedInToday: p.faucet.remoteCheckedInToday, disabled: checkInButton(p.root)?.props["aria-disabled"],
    errorVisible: text(p.root).includes(en.authOtp.errorServiceUnavailable), readCount: p.reads.length });
  expect(checkInButton(p.root)?.props["aria-disabled"]).toBe("false");
  expect(text(p.root)).not.toContain(en.authOtp.errorServiceUnavailable);
  expect(text(p.root)).not.toContain(en.daily.checkInUnconfirmed);
  expect(p.request).toHaveBeenCalledExactlyOnceWith({ method: "GET", path: "/api/points/state" });
  expect(remote.pointsApi.checkIn).not.toHaveBeenCalled(); expect(p.app.user.nexBalance).toBe(124);
});

test("cold or pending state never exposes an enabled Check in", async () => {
  const p = await page(); p.show(); await flush();
  expect(p.reads).toHaveLength(0); expect(checkInButton(p.root)).toBeUndefined();
  expect(text(p.root)).toContain(en.daily.loading);
  p.bind(); await flush();
  expect(p.faucet.remoteReadState).toBe("loading"); expect(checkInButton(p.root)).toBeUndefined();
  p.memberRead.resolve(true); await flush();
  expect(checkInButton(p.root)).toBeUndefined(); expect(remote.pointsApi.checkIn).not.toHaveBeenCalled();
});

test("failed refresh retains the 154 latch even if a background store read later succeeds; explicit Retry recovers", async () => {
  const p = await page(); p.bind(); await flush();
  p.reads[0].resolve(snapshot()); p.memberRead.resolve(true); await flush();
  const previousButton = checkInButton(p.root)!;
  p.show(); await flush(); expect(p.reads).toHaveLength(2);
  expect(p.faucet.remoteReadState).toBe("loading"); expect(checkInButton(p.root)).toBeUndefined();
  await previousButton.props.onClick();
  expect(remote.pointsApi.checkIn).not.toHaveBeenCalled();
  p.reads[1].reject(new Error("current read failed")); await flush();
  expect(p.faucet.remoteReadState).toBe("error"); expect(text(p.root)).toContain(en.authOtp.errorServiceUnavailable);
  const background = p.faucet.ensureRemote(); p.reads[2].resolve(snapshot()); await background; await flush();
  expect(p.faucet.remoteReadState).toBe("ready"); expect(checkInButton(p.root)?.props["aria-disabled"]).toBe("true");
  expect(text(p.root)).toContain(en.daily.checkInUnconfirmed);
  await checkInButton(p.root)!.props.onClick(); expect(p.toast.error).toHaveBeenCalledWith(en.authOtp.errorServiceUnavailable);
  expect(remote.pointsApi.checkIn).not.toHaveBeenCalled();
  const retry = buttons(p.root).find(item => text(item) === en.store.catalogRetry)!;
  expect(retry.props["aria-disabled"]).toBe("false"); retry.props.onClick(); await flush();
  expect(checkInButton(p.root)).toBeUndefined(); p.reads[3].resolve(snapshot()); await flush();
  expect(checkInButton(p.root)?.props["aria-disabled"]).toBe("false");
  expect(text(p.root)).not.toContain(en.authOtp.errorServiceUnavailable); expect(p.app.user.nexBalance).toBe(124);
});

test.each(["missing date", "wrong provenance"])("decoder rejects %s without enabling a write", async kind => {
  const p = await page(); p.bind(); await flush();
  const malformed = { ...snapshot(), ...(kind === "missing date" ? { serverDate: "" } : { serverCanonical: false }) };
  p.reads[0].resolve(malformed); p.memberRead.resolve(true); await flush();
  expect(p.faucet.remoteReadState).toBe("error"); expect(checkInButton(p.root)).toBeUndefined();
  expect(text(p.root)).toContain(en.authOtp.errorServiceUnavailable); expect(remote.pointsApi.checkIn).not.toHaveBeenCalled();
  const retry = buttons(p.root).find(item => text(item) === en.store.catalogRetry)!;
  retry.props.onClick(); await flush(); p.reads[1].resolve(snapshot()); await flush();
  expect(checkInButton(p.root)?.props["aria-disabled"]).toBe("false");
});

test.each(["success", "failure"] as const)("same-account rebind ignores an old epoch %s while the current read is pending", async outcome => {
  const p = await page(); p.bind(); await flush();
  p.bind(); await flush(); expect(p.reads).toHaveLength(2);
  if (outcome === "success") p.reads[0].resolve(snapshot(99)); else p.reads[0].reject(new Error("old epoch failure"));
  await flush(); expect(p.faucet.remoteReadState).toBe("loading"); expect(p.faucet.signInStreak).toBe(0);
  expect(checkInButton(p.root)).toBeUndefined(); expect(remote.pointsApi.checkIn).not.toHaveBeenCalled();
  p.reads[1].resolve(snapshot(2)); p.memberRead.resolve(true); await flush();
  expect(p.faucet.signInStreak).toBe(2); expect(checkInButton(p.root)?.props["aria-disabled"]).toBe("false");
  expect(text(p.root)).not.toContain(en.authOtp.errorServiceUnavailable);
});

test("account switch rejects the prior account response; mismatched session cannot write from a confirmed snapshot", async () => {
  const p = await page(); p.bind(); await flush(); p.bind(608); await flush();
  p.reads[0].resolve(snapshot(99)); await flush();
  expect(p.faucet.remoteReadState).toBe("loading"); expect(checkInButton(p.root)).toBeUndefined();
  p.reads[1].resolve(snapshot(2)); p.memberRead.resolve(true); await flush();
  expect(p.faucet.signInStreak).toBe(2); expect(checkInButton(p.root)?.props["aria-disabled"]).toBe("false");
  remote.userId = 607; p.auth.accountId = "user:607"; await flush();
  expect(checkInButton(p.root)?.props["aria-disabled"]).toBe("true");
  await checkInButton(p.root)!.props.onClick(); expect(remote.pointsApi.checkIn).not.toHaveBeenCalled();
  expect(p.toast.error).toHaveBeenCalledWith(en.authOtp.errorServiceUnavailable);
});

test("canonical already-checked state remains disabled", async () => {
  const p = await page(); p.bind(); await flush();
  p.reads[0].resolve(snapshot(1, true)); p.memberRead.resolve(true); await flush();
  expect(checkInButton(p.root)?.props["aria-disabled"]).toBe("true");
  expect(text(checkInButton(p.root)!)).toBe(en.daily.checkedInToday);
  await checkInButton(p.root)!.props.onClick(); expect(remote.pointsApi.checkIn).not.toHaveBeenCalled();
});

test("a queued runtime notification cannot start a page read after unmount", async () => {
  const p = await page(); p.bind(); await flush();
  p.reads[0].resolve(snapshot()); p.memberRead.resolve(true); await flush();
  advanceRuntimeRevision("catalog changed"); p.close();
  const readsAtUnmount = p.reads.length; await flush();
  advanceRuntimeRevision("after unmount"); await flush();
  expect(p.reads).toHaveLength(readsAtUnmount); expect(remote.pointsApi.checkIn).not.toHaveBeenCalled();
});
