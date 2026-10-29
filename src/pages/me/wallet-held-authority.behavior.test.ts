import { formatAmount } from "@/lib/amount-display";
import { formatFinanceAmount } from "@/lib/finance-amount-display";
import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt, dateLocale } from "@/i18n/format";
import { formatDisplayDateTime } from "@/lib/display-date";
import type { EarningsReleaseStatus } from "@/api/earnings-release-api";
import { resolveWalletTodayEarnings } from "@/lib/wallet-today-earnings";
import source from "../../components/me/wallet-overview.vue?raw";

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
const pageCode = compile(source, "wallet.vue");
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
async function mount(remoteApiEnabled = true, messages = en) {
  const visibility = Vue.reactive({ hidden: false, mask: (value: string | number) => visibility.hidden ? "••••" : String(value) });
  const app = Vue.reactive({
    remoteFleetHasSnapshot: true, remoteFleetStatus: "ready", remoteWalletReceiptHasSnapshot: false,
    user: { usdtBalance: 42.25, nexBalance: 3, pendingEarnings: 0,
      earningBuckets: { pendingReviewUsdt: 0, bonusLockedUsdt: 0 } },
    earnings: { today: 2, total: 10 }, homeTruthStatus: "ready", homeTruthTransientFailure: false, homeTruthError: null as string | null,
    homeTruth: { earnings: { today: { usdt: 2 }, all: { usdt: 10 as number | null } } }, primaryWithdrawal: null,
    refreshRemoteFleet: vi.fn(async () => {}), refreshHomeTruth: vi.fn(async () => {}),
  });
  const commission = Vue.reactive({ eventsStatus: "ready", eventsTransientFailure: false, eventsReadFailed: false, eventsLifetimeDisplayUSDT: null as number | null,
    eventsEvidence: { aggregate: { totalUSDT: 5 } } as { aggregate: { totalUSDT: number } } | null,
    totalUSDTLifetime: () => 5, refreshCanonicalEvents: vi.fn(async () => {}),
  });
  const earningsReleaseSnapshot = Vue.shallowRef<EarningsReleaseStatus | null>(null);
  const earningsReleaseHasSnapshot = Vue.ref(false);
  const earningsReleaseStatus = Vue.ref("idle");
  const refreshEarningsReleaseStatus = vi.fn(async () => {});
  const shown: Array<() => void> = [];
  const chassis = { setup: (_props: unknown, { slots }: { slots: Vue.Slots }) => () => Vue.h("view", slots.default?.()) };
  const modules: Record<string, unknown> = {
    "@/lib/passive-tab-read": { invalidatePassiveTabRead: vi.fn() },
    "@/store/data-visibility": { useDataVisibility: () => visibility },
    "@/lib/amount-display": { formatAmount },
    "@/lib/finance-amount-display": { formatFinanceAmount },
    "@/api/order-api": { subscribeRuntimeRevision: () => () => {} },
    vue: Vue, "@dcloudio/uni-app": { onShow: (callback: () => void) => shown.push(callback), onHide: () => {} },
    "@/components/app-chassis.vue": { default: chassis },
    "@/components/liquid-glass.vue": { default: { render: () => null } },
    "@/components/sub-page-header.vue": { default: { render: () => null } },
    "@/lib/route": { navTo: vi.fn() }, "@/i18n/use-t": { useT: () => Vue.ref(messages) },
    "@/i18n/format": { fmt, dateLocale }, "@/lib/display-date": { formatDisplayDateTime }, "@/store/app": { useApp: () => app },
    "@/store/commission": { useCommission: () => commission },
    "@/store/cards": { useCards: () => ({ cards: [] }) }, "@/store/config": { useConfig: () => ({ syncFailed: false, isEnabled: () => true, load: vi.fn(async () => {}) }) },
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
  const root = node(), component = renderer.createApp(load(pageCode));
  component.mount(root); unmounts.push(() => component.unmount());
  await Vue.nextTick();
  const labelNode = (label: string) => {
    const found = descendants(root).find(item => item.tag === "text" && textContent(item) === label);
    if (!found) throw new Error(`Missing wallet label: ${label}`);
    return found;
  };
  const amountIn = (container: Host, className: string) => {
    const amount = descendants(container).find(item => String(item.props.class ?? "").split(" ").includes(className));
    if (!amount) throw new Error(`Missing wallet amount: ${className}`);
    return textContent(amount);
  };
  const value = (label: string) => amountIn(labelNode(label).parent!, "wallet-metric-amount");
  const held = () => [value(messages.wallet.reviewingEarnings), value(messages.wallet.lockedRewards)];
  const breakdown = () => descendants(labelNode(messages.wallet.allTimeEarnings).parent!)
    .find(item => item.props.role === "group")!;
  const confirmRelease = (review = 0, locked = 0) => {
    earningsReleaseSnapshot.value = receipt(review, locked);
    earningsReleaseHasSnapshot.value = true; earningsReleaseStatus.value = "ready";
  };
  const clickRetry = () => {
    const click = labelNode(messages.ui.retry).parent!.props.onClick as () => void;
    click();
  };
  return { app, visibility, commission, earningsReleaseSnapshot, earningsReleaseHasSnapshot, earningsReleaseStatus,
    refreshEarningsReleaseStatus, shown, held, confirmRelease, clickRetry, value, root, breakdown,
    allTimeSublabel: () => String(breakdown().props["aria-label"]),
    breakdownValues: () => descendants(breakdown()).filter(item => String(item.props.class ?? "").split(" ").includes("wallet-metric-breakdown__amount")).map(textContent),
    retryEarnings: () => { (labelNode(messages.ui.retry).parent!.props.onClick as () => void)(); },
    text: () => textContent(root) };
}
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.restoreAllMocks(); });

describe("actual wallet held authority", () => {
  it.each(["idle", "loading", "error", "null amount"])("keeps missing mining lifetime unknown rather than a partial total: %s", async status => {
    const s = await mount();
    if (status === "null amount") s.app.homeTruth.earnings.all.usdt = null;
    else s.app.homeTruthStatus = status;
    if (status === "loading") s.app.homeTruth.earnings.all.usdt = null;
    await Vue.nextTick();
    expect(s.value(en.wallet.allTimeEarnings)).toBe("-");
    expect(s.allTimeSublabel()).toContain("Compute: - · Team: $5.00");
    if (status === "idle" || status === "loading") expect(s.text()).not.toContain(en.wallet.earningsUnavailable);
    else expect(s.text()).toContain(en.wallet.earningsUnavailable);
  });

  it.each(["idle", "loading", "error", "missing aggregate"])("keeps missing team lifetime unknown rather than a partial total: %s", async status => {
    const s = await mount();
    if (status === "missing aggregate") s.commission.eventsEvidence = null;
    else s.commission.eventsStatus = status;
    if (status === "loading") s.commission.eventsEvidence = null;
    await Vue.nextTick();
    expect(s.value(en.wallet.allTimeEarnings)).toBe("-");
    expect(s.allTimeSublabel()).toContain("Compute: $10.00 · Team: -");
  });

  it("keeps confirmed cumulative values through the actual warm onShow reads and replaces each fresh result", async () => {
    const s = await mount();
    s.confirmRelease();
    let mining!: () => void, team!: () => void;
    s.app.refreshHomeTruth.mockImplementation(async () => {
      s.app.homeTruthStatus = "loading";
      await new Promise<void>(resolve => { mining = resolve; });
      s.app.homeTruth.earnings.all.usdt = 12;
      s.app.homeTruthStatus = "ready";
    });
    s.commission.refreshCanonicalEvents.mockImplementation(async () => {
      s.commission.eventsStatus = "loading";
      await new Promise<void>(resolve => { team = resolve; });
      s.commission.eventsEvidence = { aggregate: { totalUSDT: 6 } };
      s.commission.eventsStatus = "ready";
    });
    void s.app.refreshHomeTruth(); void s.commission.refreshCanonicalEvents(); await Vue.nextTick();
    expect(s.value(en.wallet.allTimeEarnings)).toBe("$15.00");
    expect(s.allTimeSublabel()).toContain("Compute: $10.00 · Team: $5.00");
    expect(s.text()).not.toContain(en.wallet.earningsUnavailable);
    // Today's amount and all funds/held authority keep their separate rules.
    expect(s.text()).not.toContain("+$2.00");
    expect(s.held()).toEqual(["$0.00", "$0.00"]);
    mining(); await Promise.resolve(); await Vue.nextTick();
    expect(s.value(en.wallet.allTimeEarnings)).toBe("$17.00");
    team(); await Promise.resolve(); await Vue.nextTick();
    expect(s.value(en.wallet.allTimeEarnings)).toBe("$18.00");
  });

  it("does not recover stale cumulative values on error or after scope snapshots are cleared", async () => {
    const s = await mount();
    s.app.homeTruthStatus = "loading"; s.commission.eventsStatus = "loading";
    await Vue.nextTick(); expect(s.value(en.wallet.allTimeEarnings)).toBe("$15.00");
    s.app.homeTruthStatus = "error"; s.commission.eventsStatus = "error";
    await Vue.nextTick(); expect(s.value(en.wallet.allTimeEarnings)).toBe("-");
    expect(s.allTimeSublabel()).toContain("Compute: - · Team: -");
    expect(s.text()).toContain(en.wallet.earningsUnavailable);
    s.app.homeTruth.earnings.all.usdt = null; s.commission.eventsEvidence = null;
    s.app.homeTruthStatus = "loading"; s.commission.eventsStatus = "loading";
    await Vue.nextTick(); expect(s.value(en.wallet.allTimeEarnings)).toBe("-");
    expect(s.allTimeSublabel()).toContain("Compute: - · Team: -");
  });

  it("retains confirmed display through warm runtime and transient retries while real feedback stays visible", async () => {
    const s = await mount();
    s.commission.eventsLifetimeDisplayUSDT = 5; s.commission.eventsEvidence = null;
    s.commission.eventsStatus = "idle";
    await Vue.nextTick(); expect(s.value(en.wallet.allTimeEarnings)).toBe("$15.00");
    s.commission.eventsStatus = "error"; s.commission.eventsTransientFailure = true; s.commission.eventsReadFailed = true;
    s.app.homeTruthStatus = "error"; s.app.homeTruthTransientFailure = true; s.app.homeTruthError = "offline";
    await Vue.nextTick(); expect(s.value(en.wallet.allTimeEarnings)).toBe("$15.00");
    expect(s.text()).toContain(en.wallet.earningsUnavailable);
    s.app.homeTruthStatus = "loading"; s.commission.eventsStatus = "loading";
    await Vue.nextTick(); expect(s.value(en.wallet.allTimeEarnings)).toBe("$15.00");
    expect(s.text()).toContain(en.wallet.earningsUnavailable);
    s.app.homeTruthStatus = "ready"; s.app.homeTruthError = null;
    s.commission.eventsStatus = "ready"; s.commission.eventsReadFailed = false;
    s.commission.eventsEvidence = { aggregate: { totalUSDT: 0 } };
    await Vue.nextTick(); expect(s.value(en.wallet.allTimeEarnings)).toBe("$10.00");
    expect(s.text()).not.toContain(en.wallet.earningsUnavailable);
  });

  it("keeps a confirmed zero through loading but never fills a missing Home snapshot with zero", async () => {
    const s = await mount();
    s.app.homeTruth.earnings.all.usdt = 0;
    s.commission.eventsEvidence!.aggregate.totalUSDT = 0;
    s.app.homeTruthStatus = "loading"; s.commission.eventsStatus = "loading";
    await Vue.nextTick(); expect(s.value(en.wallet.allTimeEarnings)).toBe("$0.00");
    Object.assign(s.app, { homeTruth: null });
    await Vue.nextTick(); expect(s.value(en.wallet.allTimeEarnings)).toBe("-");
    expect(s.allTimeSublabel()).toContain("Compute: - · Team: $0.00");
  });

  it("preserves real lifetime zero and refreshes both missing sources through the actual retry", async () => {
    const s = await mount();
    s.app.homeTruthStatus = "error"; s.app.homeTruth.earnings.all.usdt = null;
    s.commission.eventsStatus = "error"; s.commission.eventsEvidence = null;
    s.commission.eventsReadFailed = true;
    let mining!: () => void, team!: () => void;
    s.app.refreshHomeTruth.mockImplementation(async () => {
      s.app.homeTruthStatus = "loading";
      await new Promise<void>(resolve => { mining = resolve; });
      s.app.homeTruth.earnings.all.usdt = 0; s.app.homeTruthStatus = "ready";
    });
    s.commission.refreshCanonicalEvents.mockImplementation(async () => {
      s.commission.eventsStatus = "loading";
      await new Promise<void>(resolve => { team = resolve; });
      s.commission.eventsEvidence = { aggregate: { totalUSDT: 0 } }; s.commission.eventsStatus = "ready";
      s.commission.eventsReadFailed = false;
    });
    await Vue.nextTick();
    expect(s.value(en.wallet.allTimeEarnings)).toBe("-");
    expect(s.allTimeSublabel()).toContain("Compute: - · Team: -");
    s.retryEarnings(); s.retryEarnings(); await Vue.nextTick();
    expect(s.app.refreshHomeTruth).toHaveBeenCalledOnce(); expect(s.commission.refreshCanonicalEvents).toHaveBeenCalledOnce();
    expect(s.app.refreshRemoteFleet).not.toHaveBeenCalled();
    expect(s.text()).toContain(en.wallet.earningsUnavailable);
    mining(); await Promise.resolve(); await Vue.nextTick();
    expect(s.value(en.wallet.allTimeEarnings)).toBe("-");
    expect(s.text()).toContain(en.wallet.earningsUnavailable);
    team(); await Promise.resolve(); await Vue.nextTick();
    expect(s.value(en.wallet.allTimeEarnings)).toBe("$0.00");
    expect(s.allTimeSublabel()).toContain("Compute: $0.00 · Team: $0.00");
    expect(s.text()).not.toContain(en.wallet.earningsUnavailable);
    s.app.homeTruth.earnings.all.usdt = 12.25; s.commission.eventsEvidence!.aggregate.totalUSDT = 4.5;
    await Vue.nextTick(); expect(s.value(en.wallet.allTimeEarnings)).toBe("$16.75");
  });
  it.each([[1.005, "$1.01"], [2.675, "$2.68"], [0.145, "$0.15"], [999.995, "$1,000.00"]] as const)(
    "rounds held displays at the decimal half without changing the source: %s", async (amount, expected) => {
      const s = await mount();
      s.app.user.usdtBalance = amount;
      s.confirmRelease(amount, amount);
      await Vue.nextTick();

      expect(s.held()).toEqual([expected, expected]);
      expect(s.app.user.usdtBalance).toBe(amount);
      expect(s.earningsReleaseSnapshot.value!.buckets.pending_review).toBe(amount);
      expect(s.earningsReleaseSnapshot.value!.buckets.bonus_locked).toBe(amount);
    });

  it.each(["idle", "loading", "error"])("keeps fleet-confirmed held buckets unknown when release is %s without a snapshot", async status => {
    const s = await mount(); s.earningsReleaseStatus.value = status; await Vue.nextTick();
    expect(s.held()).toEqual(["—", "—"]);
    expect(s.app.user.earningBuckets).toEqual({ pendingReviewUsdt: 0, bonusLockedUsdt: 0 });
  });

  it.each([[0, 0], [4.5, 7]])("renders confirmed same-currency held values %s/%s, including genuine zero", async (review, locked) => {
    const s = await mount(); s.confirmRelease(review, locked); await Vue.nextTick();
    expect(s.held()).toEqual([`$${review.toFixed(2)}`, `$${locked.toFixed(2)}`]);
    expect(s.text()).toContain("+$2.00"); expect(s.text()).toContain("$15.00");
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

  it("keeps explicit read recovery and existing local fixture buckets", async () => {
    const s = await mount(); s.earningsReleaseStatus.value = "error"; await Vue.nextTick(); s.clickRetry();
    expect(s.refreshEarningsReleaseStatus).toHaveBeenCalledTimes(1);
    const local = await mount(false); local.app.user.earningBuckets.pendingReviewUsdt = 4.5;
    local.app.user.earningBuckets.bonusLockedUsdt = 7; await Vue.nextTick();
    expect(local.held()).toEqual(["$4.50", "$7.00"]);
  });
});


it("masks wallet earnings and breakdowns reactively without mutating financial values", async () => {
  const s = await mount();
  s.confirmRelease(4.5, 7);
  expect(s.value(en.wallet.allTimeEarnings)).toBe("$15.00");
  s.visibility.hidden = true;
  await Vue.nextTick();
  for (const label of [en.wallet.todayLabel, en.wallet.allTimeEarnings, en.wallet.reviewingEarnings, en.wallet.lockedRewards]) {
    expect(s.value(label)).toBe("••••");
  }
  expect(s.allTimeSublabel()).toContain("Compute: •••• · Team: ••••");
  expect(s.text()).not.toContain("$4.50");
  expect(s.app.user.usdtBalance).toBe(42.25);
  s.visibility.hidden = false;
  await Vue.nextTick();
  expect(s.held()).toEqual(["$4.50", "$7.00"]);
  expect(s.value(en.wallet.allTimeEarnings)).toBe("$15.00");
});

describe.each([["zh", zh], ["en", en], ["vi", vietnamese]] as const)("wallet detail icons in %s", (_language, messages) => {
  it("keeps both long amounts and localized accessible names through hide and show", async () => {
    const s = await mount(true, messages);
    s.app.homeTruth.earnings.all.usdt = 123456789.12;
    s.commission.eventsEvidence!.aggregate.totalUSDT = 9876543210.98;
    s.confirmRelease(4.5, 7);
    await Vue.nextTick();

    const amounts = ["$123,456,789.12", "$9,876,543,210.98"];
    expect(s.breakdownValues()).toEqual(amounts);
    expect(textContent(s.breakdown())).toBe(amounts.join(""));
    expect(s.allTimeSublabel()).toBe(fmt(messages.wallet.allTimeSublabel, { c: amounts[0], tm: amounts[1] }));
    expect(s.breakdown().props.tabindex).toBe("0");
    const icons = descendants(s.breakdown()).filter(item => item.tag === "svg");
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon.props["aria-hidden"]).toBe("true");
      expect(icon.parent!.props["aria-hidden"]).toBe("true");
    }
    expect(s.text()).toContain(messages.wallet.reviewingEarningsSub);
    expect(s.text()).toContain(messages.wallet.lockedRewardsSub);

    s.visibility.hidden = true;
    await Vue.nextTick();
    expect(s.breakdownValues()).toEqual(["••••", "••••"]);
    expect(s.allTimeSublabel()).toBe(fmt(messages.wallet.allTimeSublabel, { c: "••••", tm: "••••" }));
    const hiddenDisplay = JSON.stringify(descendants(s.root).map(item => ({ text: item.text, props: item.props })));
    expect(hiddenDisplay).not.toContain("$");
    expect(s.app.homeTruth.earnings.all.usdt).toBe(123456789.12);
    expect(s.commission.eventsEvidence!.aggregate.totalUSDT).toBe(9876543210.98);
    expect(s.earningsReleaseSnapshot.value!.buckets).toEqual(receipt(4.5, 7).buckets);

    s.visibility.hidden = false;
    await Vue.nextTick();
    expect(s.breakdownValues()).toEqual(amounts);
    expect(s.allTimeSublabel()).toBe(fmt(messages.wallet.allTimeSublabel, { c: amounts[0], tm: amounts[1] }));
    expect(s.held()).toEqual(["$4.50", "$7.00"]);
  });

  it("distinguishes unknown and zero when either source changes while hidden", async () => {
    const s = await mount(true, messages);
    s.visibility.hidden = true;
    s.app.homeTruthStatus = "error";
    s.commission.eventsEvidence!.aggregate.totalUSDT = 0;
    await Vue.nextTick();
    expect(s.breakdownValues()).toEqual(["••••", "••••"]);
    expect(s.allTimeSublabel()).toBe(fmt(messages.wallet.allTimeSublabel, { c: "••••", tm: "••••" }));
    s.visibility.hidden = false;
    await Vue.nextTick();
    expect(s.breakdownValues()).toEqual(["-", "$0.00"]);
    expect(s.allTimeSublabel()).toBe(fmt(messages.wallet.allTimeSublabel, { c: "-", tm: "$0.00" }));
    expect(s.value(messages.wallet.allTimeEarnings)).toBe("-");

    s.visibility.hidden = true;
    s.app.homeTruthStatus = "ready";
    s.app.homeTruth.earnings.all.usdt = 0;
    s.commission.eventsStatus = "error";
    await Vue.nextTick();
    expect(s.breakdownValues()).toEqual(["••••", "••••"]);
    expect(s.allTimeSublabel()).toBe(fmt(messages.wallet.allTimeSublabel, { c: "••••", tm: "••••" }));
    s.visibility.hidden = false;
    await Vue.nextTick();
    expect(s.breakdownValues()).toEqual(["$0.00", "-"]);
    expect(s.allTimeSublabel()).toBe(fmt(messages.wallet.allTimeSublabel, { c: "$0.00", tm: "-" }));
    expect(s.value(messages.wallet.allTimeEarnings)).toBe("-");
  });
});
