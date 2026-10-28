import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/messages/en";
import { fmt } from "@/i18n/format";
import type { ShareChannelDef } from "@/store/config-types";
import type { ReferralRewardSnapshot } from "@/api/referral-reward-api";
import { createSessionVault } from "@/api/session-vault";
import { remoteAccountScope } from "./remote-account-epoch";

const runtime = vi.hoisted(() => ({
  remoteApiEnabled: true, apiRuntimeConfig: { environment: "dev", baseUrl: "https://test.invalid" }, fundsServerEnabled: true, expectedApiEnvironment: "dev",
  sessionVault: { read: vi.fn() }, withdrawalApi: { list: vi.fn() },
  referralRewardApi: { snapshot: vi.fn() }, shareEventApi: { record: vi.fn() },
  purchaseEligibilityApi: { snapshot: vi.fn() },
}));
const feedback = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn() }));
vi.mock("@/api/runtime", () => runtime);
vi.mock("@/store/ui", () => ({ toast: feedback }));
vi.mock("@/i18n/use-t", () => ({ useT: () => ref(en) }));
const { useApp } = await import("@/store/app");
const { useConfig } = await import("@/store/config");
const { useReferralReward } = await import("@/store/referral-reward");
const { useQuest } = await import("@/store/quest");
const { activateChannel, buildShareLink } = await import("./share");

const system: ShareChannelDef = { key: "system", enabled: true, intentType: "system" };
const channels: Record<string, ShareChannelDef> = {
  copy: { key: "copy", enabled: true, intentType: "copy" },
  scheme: { key: "zalo", enabled: true, intentType: "scheme" },
  webFallback: { key: "telegram", enabled: true, intentType: "web", urlTemplate: "https://t.example/?url={link}" },
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function snapshot(): ReferralRewardSnapshot {
  // Deliberately keep the same code across accounts. A string comparison alone
  // must not make another account, or a return to A, accept an earlier result.
  return { referralCode: "SAME-CODE", rewardEnabled: false, inviterRewardNex: 0,
    invitedCount: 0, pendingCount: 0, settledCount: 0, lifetimeInviterNex: 0, walletNexAvailable: 0,
    recentRewards: [], limit: 10, source: "ledger", sourceEnvironment: "PRODUCTION", runId: null,
    factSources: [], refreshedAt: "2026-10-25T00:00:00Z" };
}
let vault: ReturnType<typeof createSessionVault>;
let refresh: ReturnType<typeof vi.spyOn>;
let receipts: Array<{ userId: number | undefined; epoch: number }>;
async function bind(userId: number) {
  vault.save({ accessToken: `access-${userId}`, refreshToken: `refresh-${userId}`, tokenType: "Bearer",
    user: { userId, countryCode: "+86", phone: "10000000000", nickname: `User ${userId}`, onboardingComplete: true } });
  const key = `user:${userId}`;
  // The real session vault, App binding, process-wide account epoch and referral
  // store are used; no boolean isCurrent mock stands in for an account switch.
  useApp().bindAccount(key);
  remoteAccountScope.bind(key);
  useReferralReward().bindAccount(key);
  await flush();
  expect(useReferralReward().snapshot?.referralCode).toBe("SAME-CODE");
}
const switches = [
  { name: "A→B", initial: 1001, path: [2002] },
  { name: "B→A", initial: 2002, path: [1001] },
  { name: "A→B→A", initial: 1001, path: [2002, 1001] },
  { name: "A→A rebind", initial: 1001, path: [1001] },
];
function expectNoEffect() {
  expect(runtime.shareEventApi.record).not.toHaveBeenCalled();
  expect(receipts).toEqual([]);
  expect(refresh).not.toHaveBeenCalled();
  expect(feedback.info).not.toHaveBeenCalled();
  expect(feedback.success).not.toHaveBeenCalled();
}
beforeEach(async () => {
  vi.clearAllMocks(); setActivePinia(createPinia());
  const storage = new Map<string, unknown>();
  vi.stubGlobal("uni", {
    getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key), setClipboardData: vi.fn(),
  });
  vi.stubGlobal("navigator", { share: vi.fn() });
  vi.stubGlobal("window", { open: vi.fn(() => null) });
  vault = createSessionVault(); runtime.sessionVault.read.mockImplementation(vault.read);
  runtime.withdrawalApi.list.mockResolvedValue([]);
  runtime.referralRewardApi.snapshot.mockImplementation(async () => snapshot());
  receipts = [];
  runtime.shareEventApi.record.mockImplementation(async () => {
    receipts.push({ userId: vault.read()?.user.userId, epoch: remoteAccountScope.snapshot().epoch });
  });
  refresh = vi.spyOn(useQuest(), "refreshRemote").mockResolvedValue(true);
  const config = useConfig(); config.configStatus = "ready"; config.config.share.baseUrl = "https://share.example/ref/";
  await bind(1001);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setActivePinia(undefined); });

describe("system share completion remains bound to its originating account", () => {
  it.each(switches)("discards late success and failure after $name even with an identical link", async change => {
    for (const rejected of [false, true]) {
      await bind(change.initial);
      const before = remoteAccountScope.snapshot(), link = buildShareLink();
      const share = deferred<void>(); vi.mocked(navigator.share).mockReturnValueOnce(share.promise);
      const action = activateChannel(system, "share_sheet", "More");
      for (const account of change.path) await bind(account);
      expect(remoteAccountScope.snapshot().epoch).toBeGreaterThan(before.epoch);
      expect(buildShareLink()).toBe(link);
      if (rejected) share.reject(new Error("late share failure")); else share.resolve();
      await action; expectNoEffect();
    }
  });

  it("records a current system share once for A and retains canonical quest readback", async () => {
    const share = deferred<void>(); vi.mocked(navigator.share).mockReturnValueOnce(share.promise);
    const action = activateChannel(system, "share_sheet", "More");
    expect(runtime.shareEventApi.record).not.toHaveBeenCalled();
    share.resolve(); await action;
    expect(receipts).toEqual([{ userId: 1001, epoch: remoteAccountScope.snapshot().epoch }]);
    expect(runtime.shareEventApi.record).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ channel: "system", surface: "share_sheet" }), expect.any(String));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps cancellation silent and reports a current failure without recording a share", async () => {
    vi.mocked(navigator.share).mockRejectedValueOnce({ name: "AbortError" });
    await activateChannel(system, "share_sheet", "More"); expectNoEffect();
    vi.mocked(navigator.share).mockRejectedValueOnce(new Error("device failure"));
    await activateChannel(system, "share_sheet", "More");
    expect(feedback.info).toHaveBeenCalledExactlyOnceWith(en.share.actionFailed);
    expect(runtime.shareEventApi.record).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
  });
});

describe.each(Object.keys(channels))("%s clipboard completion", kind => {
  it.each(switches)("drops late success and failure after $name", async change => {
    for (const success of [true, false]) {
      await bind(change.initial);
      let callback!: { success: () => void; fail: () => void };
      vi.mocked(uni.setClipboardData).mockImplementationOnce((options: any) => { callback = options; });
      const action = activateChannel(channels[kind], "poster_sheet", "Channel");
      expect(callback).toBeDefined();
      for (const account of change.path) await bind(account);
      if (success) callback.success(); else callback.fail();
      await action; expectNoEffect();
    }
  });

  it("retains current success/failure feedback and never creates a share reward", async () => {
    vi.mocked(uni.setClipboardData).mockImplementationOnce(({ success }: any) => success());
    await activateChannel(channels[kind], "poster_sheet", "Channel");
    if (kind === "copy") expect(feedback.success).toHaveBeenCalledExactlyOnceWith(en.team.inviteLinkCopied);
    else expect(feedback.info).toHaveBeenCalledExactlyOnceWith(fmt(kind === "scheme" ? en.share.schemeCopied : en.share.openFailedCopied, { channel: "Channel" }));
    feedback.info.mockClear(); feedback.success.mockClear();
    vi.mocked(uni.setClipboardData).mockImplementationOnce(({ fail }: any) => fail());
    await activateChannel(channels[kind], "poster_sheet", "Channel");
    expect(feedback.info).toHaveBeenCalledExactlyOnceWith(en.share.copyFailed);
    expect(feedback.success).not.toHaveBeenCalled();
    expect(runtime.shareEventApi.record).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
  });
});

describe("confirmed invitation identity and existing web event guard", () => {
  it.each(["code", "base", "authority"])("rejects a pending system share and clipboard result when %s changes within the same account", async change => {
    const share = deferred<void>(); vi.mocked(navigator.share).mockReturnValueOnce(share.promise);
    let clipboard!: () => void;
    vi.mocked(uni.setClipboardData).mockImplementationOnce(({ success }: any) => { clipboard = success; });
    const pending = [activateChannel(system, "share_sheet", "More"), activateChannel(channels.copy, "share_sheet", "Copy")];
    if (change === "code") useReferralReward().snapshot!.referralCode = "NEW-CODE";
    if (change === "base") useConfig().config.share.baseUrl = "https://new.example/ref/";
    if (change === "authority") useConfig().configStatus = "failed";
    share.resolve(); clipboard(); await Promise.all(pending); expectNoEffect();
  });

  it("records an already opened web share for A, then suppresses its late failed receipt after B binds", async () => {
    vi.mocked(window.open).mockReturnValueOnce({} as Window);
    const receipt = deferred<void>();
    runtime.shareEventApi.record.mockImplementationOnce(async () => {
      receipts.push({ userId: vault.read()?.user.userId, epoch: remoteAccountScope.snapshot().epoch });
      await receipt.promise;
    });
    const epoch = remoteAccountScope.snapshot().epoch;
    const action = activateChannel(channels.webFallback, "share_sheet", "Telegram");
    expect(receipts).toEqual([{ userId: 1001, epoch }]);
    await bind(2002); receipt.reject(new Error("late server failure")); await action;
    expect(runtime.shareEventApi.record).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled(); expect(feedback.info).not.toHaveBeenCalled();
  });
});
