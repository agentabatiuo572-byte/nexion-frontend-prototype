import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { TrialAuthorityState } from "@/api/trial-api";
import { ApiError } from "@/api/errors";

const remote = vi.hoisted(() => ({
  eligibility: vi.fn(),
  start: vi.fn(),
  state: vi.fn(),
}));

vi.mock("@/api/runtime", () => ({
  fundsServerEnabled: true,
  remoteApiEnabled: true,
  developmentFundsEnabled: false,
  trialApi: remote,
  orderApi: {},
  accountApi: {},
  walletApi: {},
  voucherApi: {},
}));

const authority = (canStart: boolean, reason?: TrialAuthorityState["eligibilityReason"]): TrialAuthorityState => ({
  authoritative: true,
  serverState: "ELIGIBLE",
  status: "none",
  canStart,
  ...(reason ? { eligibilityReason: reason } : {}),
  serverNow: 1_725_000_000_000,
  version: 0,
  claimNo: null,
  startedAt: null,
  expiresAt: null,
  graceEndsAt: null,
  finishedAt: null,
  cooldownUntil: null,
  shadowUSD: 0,
  shadowNEX: 0,
  source: "nx_trial_claim",
  serverCanonical: true,
  sourceEnvironment: "PRODUCTION",
  runId: "",
  provenance: {
    source: "nx_trial_claim",
    serverCanonical: true,
    sourceEnvironment: "PRODUCTION",
    runId: "",
  },
  paymentRail: "NEXION_USDT_WALLET",
  config: {
    trialDays: "3",
    graceDays: "7",
    discountRate: "0.15",
    discountCapUSD: "20",
    trialOffsetCapUSD: "50",
    trialProductId: "stellarbox-s1",
    trialProductName: "NexGridBox S1",
    trialPriceUSD: "1299",
    shadowDailyUSD: "38.52",
    shadowDailyNEX: "65",
    seatsLeftToday: canStart ? "1" : "0",
    phaseOpen: true,
    autoPushEnabled: true,
    autoPushDelayMs: "1500",
    autoPushCooldownHours: "24",
    autoPushMaxPerSession: "1",
  },
});

const { useFreeTrial, remainingMs, trialProducesNow } = await import("./free-trial");

describe("useFreeTrial remote command errors", () => {
  it("uses the extension deadline but keeps shadow frozen and the trial offline", async () => {
    const deadline = 1_726_000_000_000;
    remote.state.mockResolvedValue({ ...authority(false, "in-progress"), serverState: "EXTENDED", status: "grace",
      claimNo: "TRIAL-EXTENDED", startedAt: 1_724_000_000_000, expiresAt: deadline,
      extendedEndsAt: deadline, graceEndsAt: null, shadowUSD: 50, shadowNEX: 15 });
    const store = useFreeTrial();
    await store.refreshRemote();
    expect(store.authorityServerState).toBe("EXTENDED");
    expect(store.graceEndsAt).toBe(deadline);
    expect(remainingMs(deadline - 1000)).toBe(1000);
    expect(store.authoritativeShadowUSD).toBe(50);
    expect(trialProducesNow()).toBe(false);
    store.bindAccount("other-account");
    expect(store.authorityServerState).toBeNull();
  });
  beforeEach(() => {
    setActivePinia(createPinia());
    remote.eligibility.mockReset();
    remote.start.mockReset();
    remote.state.mockReset();
  });

  it("maps an atomic quota race to the dedicated quota-exhausted reason", async () => {
    remote.eligibility.mockResolvedValue(authority(true));
    remote.start.mockRejectedValue(new ApiError({
      kind: "business",
      message: "TRIAL_QUOTA_EXHAUSTED",
      status: 409,
    }));
    remote.state.mockResolvedValue(authority(false, "quota-exhausted"));

    await expect(useFreeTrial().start()).resolves.toEqual({ ok: false, reason: "quota-exhausted" });
  });
});
