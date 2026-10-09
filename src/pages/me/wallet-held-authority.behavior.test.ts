import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/messages/en";
import { fmt } from "@/i18n/format";
import type { EarningsReleaseStatus } from "@/api/earnings-release-api";
import { resolveWalletTodayEarnings } from "@/lib/wallet-today-earnings";
import source from "./wallet.vue?raw";
import rowSource from "@/components/me/wallet-list-row.vue?raw";

// Reuse the wallet-nex test's native host; mount the actual page and value slots.
function compile(source: string, filename: string) {
  const { descriptor } = parse(source, { filename });
  const script = compileScript(descriptor, {
    id: filename, inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => tag === "view" || tag === "text" } },
  });
  return ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
const pageCode = compile(source, "wallet.vue"), rowCode = compile(rowSource, "wallet-list-row.vue");
type Host = { tag: string; text: string; props: Record<string, unknown>; parent: Host | null; children: Host[] };
const node = (tag = "", text = ""): Host => ({ tag, text, props: {}, parent: null, children: [] });
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
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
  },
  remove: child => {
    if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
    child.parent = null;
  },
});
const textContent = (root: Host): string => root.text + root.children.map(textContent).join("");
const descendants = (root: Host): Host[] => [root, ...root.children.flatMap(descendants)];
const unmounts: Array<() => void> = [];
const receipt = (review = 0, locked = 0): EarningsReleaseStatus => ({
  buckets: { withdrawable: 42.25, pending_review: review, bonus_locked: locked }, assets: {},
  releaseMode: "attest_or_manual", attestedOnlineSeconds: 0, requiredAttestationSeconds: 7200,
  clusterRestricted: false, serverCanonical: true,
});
async function mount(remoteApiEnabled = true) {
  const app = Vue.reactive({
    remoteFleetHasSnapshot: true, remoteFleetStatus: "ready", remoteWalletReceiptHasSnapshot: false,
    user: { usdtBalance: 42.25, nexBalance: 3, pendingEarnings: 0,
      earningBuckets: { pendingReviewUsdt: 0, bonusLockedUsdt: 0 } },
    earnings: { today: 2, total: 10 }, homeTruthStatus: "ready",
    homeTruth: { earnings: { today: { usdt: 2 } } }, primaryWithdrawal: null,
    refreshRemoteFleet: vi.fn(async () => {}),
  });
  const earningsReleaseSnapshot = Vue.shallowRef<EarningsReleaseStatus | null>(null);
  const earningsReleaseHasSnapshot = Vue.ref(false);
  const earningsReleaseStatus = Vue.ref("idle");
  const refreshEarningsReleaseStatus = vi.fn(async () => {});
  const shown: Array<() => void> = [];
  const chassis = { setup: (_props: unknown, { slots }: { slots: Vue.Slots }) => () => Vue.h("view", slots.default?.()) };
  const modules: Record<string, unknown> = {
    vue: Vue, "@dcloudio/uni-app": { onShow: (callback: () => void) => shown.push(callback) },
    "@/components/app-chassis.vue": { default: chassis },
    "@/components/sub-page-header.vue": { default: { render: () => null } },
    "@/lib/route": { navTo: vi.fn() }, "@/i18n/use-t": { useT: () => Vue.ref(en) },
    "@/i18n/format": { fmt }, "@/store/app": { useApp: () => app },
    "@/store/commission": { useCommission: () => ({ totalUSDTLifetime: () => 5 }) },
    "@/store/cards": { useCards: () => ({ cards: [] }) }, "@/store/config": { useConfig: () => ({ syncFailed: false }) },
    "@/store/ui": { confirm: vi.fn() }, "@/api/runtime": { remoteApiEnabled, developmentPaymentEnabled: false },
    "@/lib/wallet-today-earnings": { resolveWalletTodayEarnings },
    "@/store/earning-release": { earningsReleaseSnapshot, earningsReleaseHasSnapshot, earningsReleaseStatus, refreshEarningsReleaseStatus },
  };
  function load(code: string): Component {
    const exports = { default: {} as Component };
    new Function("require", "exports", code)((id: string) => {
      if (!(id in modules)) throw new Error(`Unexpected wallet import: ${id}`);
      return modules[id];
    }, exports);
    return exports.default;
  }
  modules["@/components/me/wallet-list-row.vue"] = { default: load(rowCode) };
  const root = node(), component = renderer.createApp(load(pageCode));
  component.mount(root); unmounts.push(() => component.unmount());
  await Vue.nextTick();
  const labelNode = (label: string) => {
    const found = descendants(root).find(item => item.tag === "text" && textContent(item) === label);
    if (!found) throw new Error(`Missing wallet label: ${label}`);
    return found;
  };
  const value = (label: string) => textContent(labelNode(label).parent!.parent!.children[2]);
  const held = () => [value(en.wallet.reviewingEarnings), value(en.wallet.lockedRewards)];
  const confirmRelease = (review = 0, locked = 0) => {
    earningsReleaseSnapshot.value = receipt(review, locked);
    earningsReleaseHasSnapshot.value = true; earningsReleaseStatus.value = "ready";
  };
  const clickRetry = () => {
    const click = labelNode(en.wallet.retryFunds).parent!.props.onClick as () => void;
    click();
  };
  return { app, earningsReleaseSnapshot, earningsReleaseHasSnapshot, earningsReleaseStatus,
    refreshEarningsReleaseStatus, shown, held, confirmRelease, clickRetry, text: () => textContent(root) };
}
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.restoreAllMocks(); });

describe("actual wallet held authority", () => {
  it.each(["idle", "loading", "error"])("keeps fleet-confirmed held buckets unknown when release is %s without a snapshot", async status => {
    const s = await mount(); s.earningsReleaseStatus.value = status; await Vue.nextTick();
    expect(s.held()).toEqual(["—", "—"]);
    expect(s.text()).toContain("$42.25"); expect(s.app.user.earningBuckets).toEqual({ pendingReviewUsdt: 0, bonusLockedUsdt: 0 });
  });

  it.each([[0, 0], [4.5, 7]])("renders confirmed same-currency held values %s/%s, including genuine zero", async (review, locked) => {
    const s = await mount(); s.confirmRelease(review, locked); await Vue.nextTick();
    expect(s.held()).toEqual([`$${review.toFixed(2)}`, `$${locked.toFixed(2)}`]);
    expect(s.text()).toContain("$42.25"); expect(s.text()).toContain("+$2.00"); expect(s.text()).toContain("$15.00");
  });

  it("retains same-account confirmed values while loading and clears them after failure or account reset", async () => {
    const s = await mount(); s.confirmRelease(4.5, 7); s.earningsReleaseStatus.value = "loading"; await Vue.nextTick();
    expect(s.held()).toEqual(["$4.50", "$7.00"]);
    s.earningsReleaseSnapshot.value = null; s.earningsReleaseHasSnapshot.value = false; s.earningsReleaseStatus.value = "error";
    await Vue.nextTick(); expect(s.held()).toEqual(["—", "—"]);
    s.earningsReleaseStatus.value = "idle"; await Vue.nextTick(); expect(s.held()).toEqual(["—", "—"]);
  });

  it.each(["missing flag", "noncanonical", "failed status"])("rejects incomplete release authority: %s", async variant => {
    const s = await mount(); s.confirmRelease(4.5, 7);
    if (variant === "missing flag") s.earningsReleaseHasSnapshot.value = false;
    if (variant === "noncanonical") s.earningsReleaseSnapshot.value = { ...receipt(4.5, 7), serverCanonical: false } as unknown as EarningsReleaseStatus;
    if (variant === "failed status") s.earningsReleaseStatus.value = "error";
    await Vue.nextTick(); expect(s.held()).toEqual(["—", "—"]);
  });

  it("retries failed release independently of ready fleet and waits for its confirmed result", async () => {
    const s = await mount(); s.earningsReleaseStatus.value = "error";
    let resolve!: () => void;
    s.refreshEarningsReleaseStatus.mockImplementation(async () => {
      s.earningsReleaseStatus.value = "loading";
      await new Promise<void>(done => { resolve = done; });
      s.confirmRelease(4.5, 7);
    });
    await Vue.nextTick(); expect(s.text()).toContain(en.wallet.releaseDetailsUnavailable);
    s.clickRetry(); s.clickRetry(); await Vue.nextTick();
    expect(s.refreshEarningsReleaseStatus).toHaveBeenCalledTimes(1); expect(s.app.refreshRemoteFleet).not.toHaveBeenCalled();
    expect(s.held()).toEqual(["—", "—"]);
    resolve(); await Promise.resolve(); await Vue.nextTick(); expect(s.held()).toEqual(["$4.50", "$7.00"]);
  });

  it("keeps failed retry unknown and handles its rejected read", async () => {
    const s = await mount(); s.earningsReleaseStatus.value = "error";
    s.refreshEarningsReleaseStatus.mockRejectedValue(new Error("release unavailable"));
    await Vue.nextTick(); s.clickRetry(); await Promise.resolve(); await Vue.nextTick();
    expect(s.held()).toEqual(["—", "—"]); expect(s.text()).toContain(en.wallet.releaseDetailsUnavailable);
  });

  it("keeps onShow read recovery and existing local fixture buckets", async () => {
    const s = await mount(); s.shown.forEach(show => show());
    expect(s.refreshEarningsReleaseStatus).toHaveBeenCalledTimes(1); expect(s.app.refreshRemoteFleet).toHaveBeenCalledTimes(1);
    const local = await mount(false); local.app.user.earningBuckets.pendingReviewUsdt = 4.5;
    local.app.user.earningBuckets.bonusLockedUsdt = 7; await Vue.nextTick();
    expect(local.held()).toEqual(["$4.50", "$7.00"]);
  });
});
