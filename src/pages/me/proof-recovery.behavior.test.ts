import * as displayDate from "@/lib/display-date";
import * as Vue from "vue";
import qrcode from "qrcode-generator";
import { afterEach, expect, it, vi } from "vitest";
import { flush, mountEntry, slot, text } from "@/lib/entry-review.test-support";
import { parseProofSnapshot, type ProofSnapshot } from "@/api/proof-api";
import { formatAmount } from "@/lib/amount-display";
import { proofStreakFacts } from "@/lib/proof-streak";
import { proofPosterText } from "@/lib/proof-poster-values";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { proofRecoveryCopyFor } from "./proof-recovery-copy";
import source from "./proof.vue?raw";

// Isolated unit-test responses pass the real parser; they are never used by the app.
function snapshot() {
  return parseProofSnapshot({ source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true,
    generatedAt: "2026-10-25T08:00:00Z", serverTime: "2026-10-25T08:00:00Z", asOf: "2026-10-25", joinedAt: "2026-01-01T00:00:00Z",
    provenance: { source: "server", environment: "PRODUCTION", runId: "", timeZone: "Asia/Ho_Chi_Minh", streakRule: "test", percentileRule: "test" },
    activeDays: 100, onlineDevices: 2, currentStreak: 3, longestStreak: 7, topPercentile: 7, earningsTotalUsdt: 123.45,
    referralCode: "TESTCODE", referral: { invitedCount: 4, lifetimeInviterNex: 50 }, team: { totalMembers: 9, activeMembers: 6 }, availability: { status: "READY" } });
}
type Actions = {
  refreshRemoteProof(): Promise<void>; copyLink(): Promise<void>; copyShareText(name: string): Promise<void>;
  nativeShare(): void; downloadPng(): Promise<void>; variant: Vue.Ref<string>;
};
afterEach(() => vi.unstubAllGlobals());

function setup(language = "zh") {
  const locale = Vue.reactive({ code: language });
  const app = Vue.reactive({ accountKey: "account-A", accountBindingEpoch: 1 });
  let run = 1;
  const revisions = new Set<() => void>(), shown: Array<() => void> = [];
  const linkBase = Vue.ref("https://example.invalid/ref/");
  const config = { load: vi.fn(async () => {}) };
  const api = { snapshot: vi.fn<() => Promise<ProofSnapshot>>().mockRejectedValue(new Error("HTTP 503")) };
  const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
  let clipboard = "AUDIT_SENTINEL";
  const copyText = vi.fn(async (value: string) => { clipboard = value; return true; });
  const ctx = { setFillStyle: vi.fn(), fillRect: vi.fn(), setFontSize: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(), draw: vi.fn((_reserve: boolean, done: () => void) => done()) };
  const uni = {
    getImageInfo: vi.fn((options: { success(value: { path: string }): void }) => options.success({ path: "/local/official-logo.png" })),
    share: vi.fn(), createCanvasContext: vi.fn(() => ctx),
    canvasToTempFilePath: vi.fn((options: { success(value: { tempFilePath: string }): void }) => options.success({ tempFilePath: "test-poster.png" })),
    saveImageToPhotosAlbum: vi.fn((options: { success(): void }) => options.success()),
  };
  vi.stubGlobal("uni", uni);
  let actions!: Actions;
  const copy = language === "zh" ? zh : language === "vi" ? vietnamese : en;
  const dependencies = {
    "test:probe": { capture: (value: Actions) => { actions = value; } },
    "@/lib/amount-display": { formatAmount }, "@dcloudio/uni-app": { onShow: (cb: () => void) => shown.push(cb), onUnload: vi.fn() },
    "qrcode-generator": { default: qrcode }, "@/components/app-chassis.vue": slot,
    "@/components/brand-lockup.vue": { default: { render: () => null } }, "@/components/sub-page-header.vue": { default: { render: () => null } },
    "@/components/team/v-badge.vue": { default: { render: () => null } }, "@/components/glass-segments.vue": { default: { render: () => null } },
    "@/i18n/use-t": { useT: () => Vue.ref(copy) }, "@/lib/display-date": displayDate, "@/i18n/format": { fmt, dateLocale: () => "en-US" },
    "@/store/ui": { toast }, "@/store/app": { useApp: () => app }, "@/store/profile": { useProfile: () => ({ displayName: "Test Reader" }) },
    "@/lib/share": { buildShareLink: (code: string) => linkBase.value && code.trim() ? linkBase.value + code.trim() : "", copyText },
    "@/lib/brand-copy": { displayNickname: (value: string) => value }, "@/lib/hashpower": { isDeviceOnline: vi.fn() },
    "@/store/v-rank": { useVRank: () => ({ remoteReady: false, refreshCanonicalVRank: vi.fn() }) }, "@/lib/v-rank-copy": { rankTitle: vi.fn() },
    "@/store/locale": { useLocaleStore: () => locale }, "@/store/config": { useConfig: () => config }, "./proof-recovery-copy": { proofRecoveryCopyFor },
    "@/store/network": { useNetwork: () => ({}) }, "@/store/nex-faucet": { useNexFaucet: () => ({ signInStreak: 99, longestStreak: 99 }) },
    "@/api/runtime": { proofApi: api, remoteApiEnabled: true }, "@/lib/proof-streak": { proofStreakFacts }, "@/lib/proof-poster-values": { proofPosterText },
    "@/lib/account-scope": { captureAccountScope: () => `${app.accountKey}:${app.accountBindingEpoch}`, isCurrentAccountScope: (value: string) => value === `${app.accountKey}:${app.accountBindingEpoch}` },
    "@/api/order-api": { captureRuntimeRevision: () => run, isCurrentRuntimeRevision: (value: number) => value === run,
      subscribeRuntimeRevision: (callback: () => void) => { revisions.add(callback); return () => revisions.delete(callback); } },
  };
  const page = mountEntry(source.replace("</script>", 'import { capture } from "test:probe"; capture({ refreshRemoteProof, copyLink, copyShareText, nativeShare, downloadPng, variant });\n</script>'), dependencies);
  const blockedActions = async () => { await actions.copyLink(); await actions.copyShareText("test"); actions.nativeShare(); await actions.downloadPng(); };
  return { page, actions, app, api, toast, copy, config, linkBase, copyText, uni, ctx, shown, blockedActions, clipboard: () => clipboard,
    revise: () => { run += 1; revisions.forEach(cb => cb()); } };
}

it.each(["zh", "en", "vi"])("keeps the clipboard sentinel and hides sharing on cold 503, then recovers and handles warm 503 in %s", async language => {
  const p = setup(language), copy = proofRecoveryCopyFor(language);
  expect(text(p.page.root)).toContain(copy.loading);
  await p.blockedActions(); expect(p.clipboard()).toBe("AUDIT_SENTINEL");
  await p.actions.refreshRemoteProof(); await flush();
  expect(text(p.page.root)).toContain(copy.unavailable);
  expect(text(p.page.root)).not.toContain(p.copy.network.projectionErrorTitle);
  expect(text(p.page.root)).not.toMatch(/hash|哈希/i);
  expect(p.page.control(p.copy.proof.shareDestinations.copy)).toBeUndefined();
  await p.blockedActions();
  expect(p.copyText).not.toHaveBeenCalled(); expect(p.uni.share).not.toHaveBeenCalled(); expect(p.uni.createCanvasContext).not.toHaveBeenCalled();
  expect(p.toast.success).not.toHaveBeenCalled(); expect(p.clipboard()).toBe("AUDIT_SENTINEL");
  p.api.snapshot.mockResolvedValue(snapshot());
  await p.page.control(p.copy.ui.retry)!.props.onClick(); await flush();
  expect(p.config.load).toHaveBeenCalledTimes(2);
  expect(text(p.page.root)).toContain("123.45");
  await p.actions.copyLink(); expect(p.clipboard()).toBe("https://example.invalid/ref/TESTCODE");
  expect(p.toast.success).toHaveBeenCalledWith(p.copy.proof.copiedToast, "");
  for (const [variant, fact] of [["earnings", "123.45"], ["streak", "7"], ["network", "9"]]) {
    p.actions.variant.value = variant;
    await p.actions.copyShareText("Telegram");
    expect(p.clipboard()).toContain(fact);
    expect(p.clipboard()).toContain("https://example.invalid/ref/TESTCODE");
    expect(p.clipboard()).not.toMatch(/\{\w+\}|passive UVT/);
    p.actions.nativeShare();
    expect(p.uni.share.mock.lastCall?.[0]).toMatchObject({ title: p.copy.proof.shareTitle, summary: p.clipboard() });
  }
  p.actions.variant.value = "earnings";
  await p.actions.copyLink();
  await p.actions.downloadPng();
  expect(p.ctx.fillText).toHaveBeenCalledWith("123.45", 124, 580);
  expect(p.ctx.drawImage).toHaveBeenCalledWith("/local/official-logo.png", 72, 40, 356, 123);
  expect(p.ctx.fillText).toHaveBeenCalledWith(p.clipboard(), 124, 986);
  expect(p.uni.saveImageToPhotosAlbum).toHaveBeenCalledOnce();
  p.copyText.mockClear(); p.toast.success.mockClear(); p.uni.createCanvasContext.mockClear();
  p.api.snapshot.mockRejectedValue(new Error("HTTP 503"));
  await p.actions.refreshRemoteProof(); await flush(); await p.blockedActions();
  expect(text(p.page.root)).toContain(copy.unavailable);
  expect(p.copyText).not.toHaveBeenCalled(); expect(p.toast.success).not.toHaveBeenCalled(); expect(p.uni.createCanvasContext).not.toHaveBeenCalled();
  p.api.snapshot.mockResolvedValue(snapshot()); await p.page.control(p.copy.ui.retry)!.props.onClick(); await flush();
  expect(p.page.control(p.copy.proof.shareDestinations.copy)).toBeDefined();
  p.page.unmount();
});

it("distinguishes a missing published link from a proof read failure and reloads its source", async () => {
  const p = setup(); p.api.snapshot.mockResolvedValue(snapshot()); p.linkBase.value = "";
  await p.actions.refreshRemoteProof(); await flush();
  expect(text(p.page.root)).toContain(proofRecoveryCopyFor("zh").linkUnavailable);
  expect(text(p.page.root)).not.toContain(proofRecoveryCopyFor("zh").unavailable);
  await p.blockedActions(); expect(p.clipboard()).toBe("AUDIT_SENTINEL"); expect(p.toast.success).not.toHaveBeenCalled();
  p.config.load.mockImplementationOnce(async () => { p.linkBase.value = "https://example.invalid/ref/"; });
  await p.page.control(zh.ui.retry)!.props.onClick(); await flush(); await p.actions.copyLink();
  expect(p.clipboard()).toBe("https://example.invalid/ref/TESTCODE");
  p.page.unmount();
});

it.each(["account", "rebind", "run", "unmount"])("rejects a late read after %s invalidation", async change => {
  const p = setup(); let finish!: (value: ProofSnapshot) => void;
  p.api.snapshot.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const reading = p.actions.refreshRemoteProof();
  if (change === "account") p.app.accountKey = "account-B";
  if (change === "rebind") p.app.accountBindingEpoch += 1;
  if (change === "run") p.revise();
  if (change === "unmount") p.page.unmount();
  finish(snapshot()); await reading; await flush(); await p.blockedActions();
  expect(p.clipboard()).toBe("AUDIT_SENTINEL"); expect(p.toast.success).not.toHaveBeenCalled();
  if (change !== "unmount") { expect(text(p.page.root)).not.toContain("123.45"); p.page.unmount(); }
});

it("does not run a native-share fallback or save an export after an account rebind", async () => {
  const p = setup(); p.api.snapshot.mockResolvedValue(snapshot()); await p.actions.refreshRemoteProof(); await flush();
  p.actions.nativeShare();
  const shareOptions = p.uni.share.mock.calls[0][0] as { fail(): void };
  let finishDraw!: () => void;
  p.ctx.draw.mockImplementationOnce((_reserve, done) => { finishDraw = done; });
  const exporting = p.actions.downloadPng();
  await flush();
  p.app.accountBindingEpoch += 1; shareOptions.fail(); finishDraw(); await exporting; await flush();
  expect(p.copyText).not.toHaveBeenCalled(); expect(p.uni.canvasToTempFilePath).not.toHaveBeenCalled(); expect(p.toast.success).not.toHaveBeenCalled();
  p.page.unmount();
});
