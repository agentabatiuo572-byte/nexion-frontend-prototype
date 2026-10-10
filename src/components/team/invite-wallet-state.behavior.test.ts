import * as Vue from "vue";
import type { Component } from "vue";
import { compileScript, compileStyle, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import inviteSource from "./invite-earn-card.vue?raw";
import walletSource from "../me/wallet-card.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt, openSlotsTemplate } from "@/i18n/format";
import { remoteAuthorityStatus } from "@/lib/remote-authority-display";
import type { ReferralRewardSnapshot } from "@/api/referral-reward-api";

// Run the production SFC scripts and templates. These isolated read states
// supplement the device acceptance; they are not evidence of a live backend.
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
const hasClass = (target: Host, name: string) => Vue.normalizeClass(target.props.class).split(" ").includes(name);
const find = (root: Host, name: string) => all(root).find(target => hasClass(target, name))!;
const unmounts: Array<() => void> = [];

async function mount(source: string, dependencies: Record<string, unknown>) {
  const { descriptor } = parse(source);
  const script = compileScript(descriptor, { id: "invite-wallet-state", inlineTemplate: true,
    // The in-memory host has no HTML parser for Vue's static SVG cache.
    templateOptions: { compilerOptions: { hoistStatic: false } } });
  const code = ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (id === "vue") return Vue;
    if (id in dependencies) return dependencies[id];
    if (id.endsWith(".vue")) return { default: { render: () => Vue.h("view") } };
    throw new Error(`Unexpected component import: ${id}`);
  }, exports);
  const root = node("root");
  const app = renderer.createApp(exports.default);
  app.mount(root); unmounts.push(() => app.unmount());
  await Vue.nextTick();
  return root;
}

function snapshot(rewardEnabled = false): ReferralRewardSnapshot {
  return { referralCode: "INVITE123", rewardEnabled, inviterRewardNex: rewardEnabled ? 12 : 0,
    invitedCount: 2, pendingCount: 1, settledCount: 1, lifetimeInviterNex: 7, walletNexAvailable: 7,
    recentRewards: [], limit: 5, source: "ledger", sourceEnvironment: "PRODUCTION", runId: null,
    factSources: ["nx_referral_reward_settlement", "nx_wallet_ledger", "nx_earnings_release_entry", "nx_user_wallet"],
    refreshedAt: "2026-10-01T00:00:00Z" };
}

async function invitation(copy = en) {
  const rewards = Vue.reactive({ snapshot: snapshot() as ReferralRewardSnapshot | null,
    error: "", loading: false, refresh: vi.fn(async () => true) });
  const copyText = vi.fn(async () => true);
  const recordShareEvent = vi.fn();
  const notifyUnavailableShareLink = vi.fn();
  const toast = { info: vi.fn(), success: vi.fn() };
  const root = await mount(inviteSource, {
    "@/i18n/use-t": { useT: () => Vue.ref(copy) }, "@/i18n/format": { fmt },
    "@/store/app": { useApp: () => ({ user: { referralCode: "STALE_LOCAL_CODE" } }) },
    "@/store/referral-reward": { useReferralReward: () => rewards },
    "@/api/runtime": { remoteApiEnabled: true },
    "@/store/ui": { toast },
    "@/lib/share": { copyText, recordShareEvent, notifyUnavailableShareLink,
      buildShareLink: (code: string) => code ? `https://invite.example/?ref=${code}` : "" },
  });
  return { root, rewards, copyText, recordShareEvent, notifyUnavailableShareLink, toast };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.useRealTimers(); });

test.each([en, zh, vietnamese])("disabled invitation rewards keep sharing without reward or cooldown promises", async copy => {
  const card = await invitation(copy);
  expect(card.rewards.refresh).toHaveBeenCalledOnce();
  const status = text(find(card.root, "invite-card__reward"));
  expect(text(find(card.root, "invite-card__header"))).toContain(copy.team.referralRewardsDisabled);
  expect(status).toContain(copy.team.sharingStillAvailable);
  expect(status).toContain("+7 NEX"); // Historical settled earnings remain facts.
  expect(status).not.toContain(copy.team.serverRewardPerSettlement);
  expect(status).not.toContain(copy.team.perFriendCooldown);
  expect(status).not.toContain("0 NEX");
  expect(text(find(card.root, "nx-team-share-now"))).toBe(copy.team.shareInvite);
  expect(text(find(card.root, "invite-card__header"))).not.toContain(copy.team.earnForEachFriend);
  expect(text(card.root)).not.toContain(copy.team.rewardRules);
  expect(all(card.root).some(target => target.props.role === "link")).toBe(false);
  for (const name of ["nx-team-share-poster", "nx-team-copy-code", "nx-team-copy-link", "nx-team-share-now"]) {
    expect(find(card.root, name).props["aria-disabled"]).toBe(false);
  }
  await find(card.root, "nx-team-copy-code").props.onClick();
  await find(card.root, "nx-team-copy-link").props.onClick();
  expect(card.copyText.mock.calls).toEqual([["INVITE123"], ["https://invite.example/?ref=INVITE123"]]);
  expect(card.recordShareEvent).not.toHaveBeenCalled();
});

test("the same invitation card follows server enablement, unavailable reads and the retry action", async () => {
  const card = await invitation();
  card.rewards.snapshot = snapshot(true); await Vue.nextTick();
  let status = text(find(card.root, "invite-card__reward"));
  expect(status).toContain("12 NEX");
  expect(status).toContain(en.team.perFriendCooldown);
  expect(text(find(card.root, "invite-card__header"))).toContain(fmt(en.team.settlementStatus, { settled: 1, pending: 1 }));
  card.rewards.error = "read failed"; await Vue.nextTick();
  status = text(find(card.root, "invite-card__reward"));
  expect(status).toBe("-");
  expect(status).not.toContain("12 NEX");
  const retry = find(card.root, "invite-card__retry");
  expect(retry.props.role).toBe("button");
  card.rewards.refresh.mockClear();
  let resolveRead!: () => void;
  const pendingRead = new Promise<void>(resolve => { resolveRead = resolve; });
  card.rewards.refresh.mockImplementationOnce(async () => {
    card.rewards.loading = true;
    await pendingRead;
    card.rewards.snapshot = snapshot(true);
    card.rewards.error = "";
    card.rewards.loading = false;
    return true;
  });
  const refresh = retry.props.onClick(); await Vue.nextTick();
  expect(card.rewards.refresh).toHaveBeenCalledOnce();
  expect(find(card.root, "invite-card__retry").props["aria-busy"]).toBe(true);
  expect(text(find(card.root, "invite-card__reward"))).toBe("-");
  resolveRead(); await refresh; await Vue.nextTick();
  expect(find(card.root, "invite-card__retry")).toBeUndefined();
  expect(text(find(card.root, "invite-card__reward"))).toContain("12 NEX");
  expect(text(find(card.root, "invite-card__reward"))).toContain(en.team.perFriendCooldown);
  card.rewards.error = ""; card.rewards.snapshot = null; card.rewards.loading = true; await Vue.nextTick();
  expect(text(find(card.root, "invite-card__reward"))).toBe("-");
  expect(find(card.root, "nx-team-share-now").props["aria-disabled"]).toBe(true);
});

test.each([en, zh, vietnamese])("H5 share emphasis only names a reward after a successful enabled server read", async copy => {
  const card = await invitation(copy);
  card.rewards.snapshot = snapshot(true); await Vue.nextTick();
  expect(text(find(card.root, "nx-team-share-now"))).toBe(fmt(copy.team.shareAndEarn, { n: "12 NEX" }));
  expect(text(find(card.root, "invite-card__header"))).toContain(copy.team.earnForEachFriend);
  card.rewards.loading = true; await Vue.nextTick();
  expect(text(find(card.root, "invite-card__reward"))).toBe("-");
  expect(text(find(card.root, "nx-team-share-now"))).toBe(copy.team.shareInvite);
  expect(text(card.root)).not.toContain("12 NEX");
  expect(text(card.root)).not.toContain("+7 NEX");
  expect(text(card.root)).not.toContain(copy.team.perFriendCooldown);
  card.rewards.loading = false; card.rewards.error = "unavailable"; await Vue.nextTick();
  expect(text(find(card.root, "nx-team-share-now"))).toBe(copy.team.shareInvite);
  expect(text(find(card.root, "invite-card__header"))).toContain(copy.team.settlementUnavailable);
  expect(text(card.root)).not.toContain("12 NEX");
});

test("restored sharing tools retain clipboard failure feedback and all empty-code guards", async () => {
  const card = await invitation();
  card.copyText.mockResolvedValue(false);
  await find(card.root, "nx-team-copy-code").props.onClick();
  await find(card.root, "nx-team-copy-link").props.onClick();
  await Vue.nextTick();
  expect(card.toast.info.mock.calls).toEqual([[en.share.copyFailed], [en.share.copyFailed]]);
  expect(card.toast.success).not.toHaveBeenCalled();
  expect(text(find(card.root, "nx-team-copy-code"))).not.toContain(en.team.copied);
  expect(text(find(card.root, "nx-team-copy-link"))).not.toContain(en.team.copied);
  expect(card.recordShareEvent).not.toHaveBeenCalled();
  card.rewards.snapshot!.referralCode = ""; await Vue.nextTick();
  card.copyText.mockClear(); card.toast.info.mockClear();
  for (const name of ["nx-team-share-poster", "nx-team-copy-code", "nx-team-copy-link", "nx-team-share-now"]) {
    const tool = find(card.root, name);
    expect(tool.props.role).toBe("button");
    expect(tool.props.tabindex).toBe("0");
    expect(tool.props["aria-disabled"]).toBe(true);
    await tool.props.onClick();
  }
  expect(card.copyText).not.toHaveBeenCalled();
  expect(card.toast.info).toHaveBeenCalledExactlyOnceWith(en.share.noCodeYet);
  expect(card.notifyUnavailableShareLink).toHaveBeenCalledTimes(3);
  expect(card.recordShareEvent).not.toHaveBeenCalled();
});

async function wallet(copy = en, initialBalance = 11, confirmed = true) {
  const market = Vue.reactive({ isMockMode: false, remoteReady: true, nexPriceUSDT: 0.124,
    change24hAvailable: false, change24hPct: 0 });
  const navTo = vi.fn();
  const navReset = vi.fn();
  const app = Vue.reactive({ user: { usdtBalance: initialBalance, nexBalance: 124,
    earningBuckets: { pendingReviewUsdt: 0, bonusLockedUsdt: 0 } }, activeSlotCount: 0, slotCap: 0,
    remoteFleetHasSnapshot: confirmed, remoteFleetStatus: confirmed ? "ready" : "idle",
    remoteWalletReceiptHasSnapshot: false });
  const trial = Vue.reactive({ authorityStatus: confirmed ? "ready" : "unknown",
    authorityServerState: confirmed ? "ELIGIBLE" as string | null : null });
  const release = {
    earningsReleaseHasSnapshot: Vue.ref(confirmed),
    earningsReleaseStatus: Vue.ref(confirmed ? "ready" : "idle"),
    earningsReleaseSnapshot: Vue.ref<{ serverCanonical: boolean; buckets: { pending_review: number; bonus_locked: number } } | null>(
      confirmed ? { serverCanonical: true, buckets: { pending_review: 0, bonus_locked: 0 } } : null),
  };
  const root = await mount(walletSource, {
    "@/i18n/use-t": { useT: () => Vue.ref(copy) }, "@/i18n/format": { fmt, openSlotsTemplate },
    "@/store/app": { useApp: () => app },
    "@/store/earning-release": release,
    "@/lib/remote-authority-display": { remoteAuthorityStatus },
    "@/store/bills": { useBills: () => ({ summaryStatus: "ready", summary: { monthBillCount: 0 } }) },
    "@/store/market": { useMarket: () => market }, "@/api/runtime": { fundsServerEnabled: true, remoteApiEnabled: true },
    "@/store/free-trial": { trialReservesSlotNow: () => false, useFreeTrial: () => trial },
    "@/store/slot-action-sheet": { useSlotActionSheet: () => ({}) },
    "@/lib/route": { navTo, navReset },
  });
  return { root, app, market, trial, release, navTo, navReset };
}

const balanceDisplays = [
  [92.18022, "92.18"],
  [0, "0.00"],
  [11, "11.00"],
  [0.045005, "0.05"],
  [0.000001, "0.00"],
  [999.995001, "1,000.00"],
  [1234567.123456, "1,234,567.12"],
  [1.005, "1.00"],
  [2.675, "2.67"],
] as const;

async function checkWalletBalance(copy: typeof en) {
  const card = await wallet(copy, 92.18022);
  for (const [balance, expected] of balanceDisplays) {
    card.app.user.usdtBalance = balance; await Vue.nextTick();
    expect(text(find(card.root, "nx-wallet-amount"))).toBe(expected);
    expect(find(card.root, "nx-wallet-total").props["aria-label"]).toBe(`${copy.me.usdtBalance}: $${expected}`);
    expect(card.app.user.usdtBalance).toBe(balance); // Display rounding must not change the source balance.
  }
  card.app.user = { usdtBalance: 0, nexBalance: 0,
    earningBuckets: { pendingReviewUsdt: 0, bonusLockedUsdt: 0 } };
  await Vue.nextTick();
  expect(text(find(card.root, "nx-wallet-amount"))).toBe("0.00");
  expect(find(card.root, "nx-wallet-total").props["aria-label"]).toBe(`${copy.me.usdtBalance}: $0.00`);
}

test.each([en, zh, vietnamese])("wallet balance uses detail-page rounding, two decimals and comma grouping", async copy => {
  await checkWalletBalance(copy);
});

test.each([en, zh, vietnamese])("wallet fixtures keep unknown reads separate from confirmed zero and refresh snapshots", async copy => {
  const { root, app, trial, release } = await wallet(copy, 0, false);
  app.user.nexBalance = 0; app.slotCap = 6;
  await Vue.nextTick();
  const pending = (review: string, locked: string) => fmt(copy.me.walletBucketsHint, { review, locked });
  const assertUnknown = () => {
    expect(text(find(root, "nx-wallet-amount"))).toBe("—");
    expect(text(find(root, "nx-wallet-nex"))).toContain("— NEX");
    expect(text(find(root, "nx-wallet-pending"))).toBe(pending("—", "—"));
    expect(find(root, "nx-wallet-slot-block")).toBeUndefined();
  };
  assertUnknown();
  app.remoteFleetStatus = "error";
  await Vue.nextTick(); assertUnknown();

  app.remoteWalletReceiptHasSnapshot = true;
  await Vue.nextTick();
  expect(text(find(root, "nx-wallet-amount"))).toBe("0.00");
  expect(text(find(root, "nx-wallet-nex"))).toContain("— NEX");
  expect(text(find(root, "nx-wallet-pending"))).toBe(pending("—", "—"));
  expect(find(root, "nx-wallet-slot-block")).toBeUndefined();

  app.remoteFleetHasSnapshot = true; app.remoteFleetStatus = "ready";
  await Vue.nextTick();
  expect(text(find(root, "nx-wallet-nex"))).toContain("0 NEX");
  expect(find(root, "nx-wallet-slot-block")).toBeUndefined();
  for (const status of ["idle", "loading", "error"]) {
    release.earningsReleaseStatus.value = status;
    await Vue.nextTick();
    expect(text(find(root, "nx-wallet-pending"))).toBe(pending("—", "—"));
  }
  trial.authorityStatus = "ready"; trial.authorityServerState = "ELIGIBLE";
  release.earningsReleaseHasSnapshot.value = true;
  release.earningsReleaseSnapshot.value = { serverCanonical: true, buckets: { pending_review: 0, bonus_locked: 0 } };
  release.earningsReleaseStatus.value = "ready";
  await Vue.nextTick();
  expect(text(find(root, "nx-wallet-pending"))).toBe(pending("0.00", "0.00"));
  expect(find(root, "nx-wallet-slot-block")).toBeDefined();
  app.remoteFleetStatus = "loading"; trial.authorityStatus = "loading";
  release.earningsReleaseStatus.value = "loading";
  await Vue.nextTick();
  expect(text(find(root, "nx-wallet-amount"))).toBe("0.00");
  expect(text(find(root, "nx-wallet-pending"))).toBe(pending("0.00", "0.00"));
  expect(find(root, "nx-wallet-slot-block")).toBeDefined();

  app.remoteFleetHasSnapshot = false; app.remoteWalletReceiptHasSnapshot = false;
  trial.authorityStatus = "unknown"; trial.authorityServerState = null;
  release.earningsReleaseHasSnapshot.value = false; release.earningsReleaseSnapshot.value = null;
  release.earningsReleaseStatus.value = "idle";
  await Vue.nextTick(); assertUnknown();
});

test.each([en, zh, vietnamese].flatMap(copy => [false, true].map(withoutIntl => ({ copy, withoutIntl }))))(
  "wallet balance survives ignored native locale options (Intl absent: $withoutIntl)", async ({ copy, withoutIntl }) => {
    const nativeNumber = vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (this: number) {
      return String(this.valueOf());
    });
    if (withoutIntl) vi.stubGlobal("Intl", undefined);
    try {
      await checkWalletBalance(copy);
    } finally {
      nativeNumber.mockRestore(); vi.unstubAllGlobals();
    }
  },
);

test("wallet keeps the original lower-right arc and adds only five decorative dots", async () => {
  const { root } = await wallet();
  const summary = find(root, "nx-wallet-summary");
  expect(all(summary).filter(target => hasClass(target, "nx-wallet-arc"))).toHaveLength(1);
  expect(find(summary, "nx-wallet-arc").props["aria-hidden"]).toBe("true");
  expect(find(summary, "nx-wallet-grid")).toBeUndefined();
  expect(find(summary, "nx-wallet-aurora")).toBeUndefined();
  const particles = find(summary, "nx-wallet-particles");
  expect(particles.props["aria-hidden"]).toBe("true");
  const dots = all(particles).filter(target => hasClass(target, "nx-wallet-particle"));
  expect(dots).toHaveLength(5);
  for (const dot of dots) {
    expect(dot.props.style).toEqual(expect.objectContaining({ width: "3px", height: "3px",
      animation: "v5-dot-drift 8s linear infinite" }));
    expect(dot.props).toHaveProperty("data-wallet-particle");
    expect(dot.props).not.toHaveProperty("onClick");
  }
  const { descriptor } = parse(walletSource);
  const css = compileStyle({ source: descriptor.styles[0].content, filename: "wallet-card.vue", id: "data-v-wallet", scoped: true });
  expect(css.errors).toEqual([]);
  expect(css.code).toMatch(/\.nx-wallet-particles\[data-v-wallet\][^{]*\{[^}]*pointer-events: none;[^}]*z-index: 0;/);
  expect(css.code).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.nx-wallet-arc\[data-v-wallet\]\s*\{\s*animation: none;/);
  expect(css.code).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.nx-wallet-particle\[data-v-wallet\]\s*\{\s*animation: none !important;\s*transform: none;\s*\}\s*\.nx-wallet-particle\[data-v-wallet\]\s*\{\s*opacity: .5 !important;/);
});

test("wallet valuation names USDT for both values and preserves the remote unavailable state", async () => {
  const { root, app, market, navTo, navReset } = await wallet();
  expect(text(find(root, "nx-wallet-valuation"))).toContain("≈ 15.38 USDT · 1 NEX = 0.124 USDT");
  market.remoteReady = false; await Vue.nextTick();
  expect(text(find(root, "nx-wallet-valuation"))).toContain("≈ — USDT · 1 NEX = — USDT");
  expect(text(find(root, "nx-wallet-valuation"))).not.toContain("0.124");
  find(root, "nx-wallet-heading").props.onClick();
  expect(navTo).toHaveBeenCalledExactlyOnceWith("/pages/me/wallet-bills");
  expect(find(root, "nx-wallet-slot-block")).toBeUndefined();
  app.slotCap = 1; await Vue.nextTick();
  const slot = find(root, "nx-wallet-slot-block");
  expect(slot).toBeDefined();
  expect(slot.props.style).not.toHaveProperty("gridTemplateColumns");
  find(root, "wallet-add-device").props.onClick();
  expect(navReset).toHaveBeenCalledOnce();
  expect(navReset.mock.calls[0][0].url).toBe("/pages/store/store");
  const icon = find(root, "nx-wallet-symbol");
  expect(icon.tag).toBe("view");
  expect(icon.children[0].props.stroke).toBe("currentColor");
  const { descriptor } = parse(walletSource);
  const css = compileStyle({ source: descriptor.styles[0].content, filename: "wallet-card.vue", id: "data-v-wallet", scoped: true });
  expect(css.errors).toEqual([]);
  expect(css.code).toMatch(/\.nx-wallet-symbol\[data-v-wallet\][^{]*\{[^}]*color: var\(--v5-nex\)/);
  expect(css.code).toMatch(/@media \(max-width: 350px\)\s*\{\s*\.nx-wallet-slot-block\[data-v-wallet\]\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/);
});
