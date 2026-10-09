import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { parseTrialAuthorityState } from "@/api/trial-api";
import type { TrialAuthorityState } from "@/api/trial-api";
import { ApiError } from "@/api/errors";

const remote = vi.hoisted(() => ({
  eligibility: vi.fn(),
  start: vi.fn(),
  state: vi.fn(),
  cancel: vi.fn(),
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
    remote.cancel.mockReset();
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

function activeAuthority(claimNo = "FIXTURE-A", version = 5): TrialAuthorityState {
  return { ...authority(false, "in-progress"), serverState: "ACTIVE", status: "active", claimNo, version,
    startedAt: 1_725_000_000_000, expiresAt: 1_725_259_200_000, graceEndsAt: 1_725_864_000_000,
    shadowUSD: 14, shadowNEX: 7 };
}
function cancelledAuthority(): TrialAuthorityState {
  return { ...activeAuthority("FIXTURE-A", 6), serverState: "CANCELLED", status: "ended", eligibilityReason: "used" };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const rebindings = [{ keys: ["fixture-b"] }, { keys: ["fixture-a"] }, { keys: ["fixture-b", "fixture-a"] }];
function parsedAuthority(next: TrialAuthorityState): TrialAuthorityState {
  return parseTrialAuthorityState({
    ...next, state: next.serverState, serverNowEpochMs: next.serverNow,
    claimedAtEpochMs: next.startedAt, expiresAtEpochMs: next.expiresAt,
    graceEndsAtEpochMs: next.graceEndsAt, finishedAtEpochMs: next.finishedAt,
    cooldownUntilEpochMs: next.cooldownUntil, shadowUsdt: next.shadowUSD, shadowNex: next.shadowNEX,
  });
}
async function bindActive(store: ReturnType<typeof useFreeTrial>, claim = "FIXTURE-A") {
  remote.state.mockResolvedValue(activeAuthority(claim)); store.bindAccount("fixture-a"); await store.refreshRemote();
}
async function rebindActive(store: ReturnType<typeof useFreeTrial>, keys: readonly string[]) {
  remote.state.mockResolvedValue(activeAuthority("FIXTURE-NEW", 9));
  for (const key of keys) store.bindAccount(key);
  await store.refreshRemote();
}
function expectNewAuthority(store: ReturnType<typeof useFreeTrial>) {
  expect(store.authorityStatus).toBe("ready"); expect(store.status).toBe("active");
  expect(store.authorityClaimNo).toBe("FIXTURE-NEW"); expect(store.authorityVersion).toBe(9);
  expect(store.authoritativeShadowUSD).toBe(14); expect(store.canStart()).toBe(false);
}

describe("remote trial command binding and canonical version authority", () => {
  beforeEach(() => {
    setActivePinia(createPinia()); remote.eligibility.mockReset(); remote.start.mockReset();
    remote.state.mockReset(); remote.cancel.mockReset();
  });
  it("keeps normal same-account cancel and server restart eligibility", async () => {
    const store = useFreeTrial(); await bindActive(store);
    remote.cancel.mockResolvedValue(cancelledAuthority()); remote.state.mockResolvedValue(cancelledAuthority());
    expect(await store.cancel()).toEqual({ ok: true }); expect(store.status).toBe("ended"); expect(store.canStart()).toBe(false);
    remote.state.mockResolvedValue({ ...cancelledAuthority(), canStart: true, eligibilityReason: undefined, version: 7 });
    await store.refreshRemote(); expect(store.canStart()).toBe(true);
  });
  it.each(rebindings)("does not let an old cancel clear a newer binding %j", async ({ keys }) => {
    const store = useFreeTrial(); await bindActive(store); const pending = deferred<TrialAuthorityState>();
    remote.cancel.mockReturnValue(pending.promise); const command = store.cancel();
    await rebindActive(store, keys); const reads = remote.state.mock.calls.length;
    pending.resolve(cancelledAuthority()); expect(await command).toEqual({ ok: false, reason: "unknown" });
    expectNewAuthority(store); expect(remote.state).toHaveBeenCalledTimes(reads);
  });
  it("does not let a cancel follow-up read clear facts after rebinding", async () => {
    const store = useFreeTrial(); await bindActive(store); const followUp = deferred<TrialAuthorityState>();
    remote.cancel.mockResolvedValue(cancelledAuthority()); remote.state.mockReturnValueOnce(followUp.promise);
    const command = store.cancel(); await Promise.resolve(); await Promise.resolve();
    await rebindActive(store, ["fixture-b"]); followUp.resolve(cancelledAuthority());
    expect(await command).toEqual({ ok: false, reason: "unknown" }); expectNewAuthority(store);
  });
  it("ignores a late cancel failure without refreshing or writing the newer binding", async () => {
    const store = useFreeTrial(); await bindActive(store); const pending = deferred<TrialAuthorityState>();
    remote.cancel.mockReturnValue(pending.promise); const command = store.cancel(); await rebindActive(store, ["fixture-b"]);
    const reads = remote.state.mock.calls.length; pending.reject(new Error("FIXTURE_OLD_CANCEL_FAILURE"));
    expect(await command).toEqual({ ok: false, reason: "unknown" }); expectNewAuthority(store);
    expect(store.authorityError).toBeNull(); expect(remote.state).toHaveBeenCalledTimes(reads);
  });
  it("keeps a normal start confirmed by the same claim state", async () => {
    const store = useFreeTrial(); remote.eligibility.mockResolvedValue(authority(true));
    remote.start.mockResolvedValue(activeAuthority()); remote.state.mockResolvedValue(activeAuthority());
    expect(await store.start()).toEqual({ ok: true }); expect(store.authorityClaimNo).toBe("FIXTURE-A"); expect(store.status).toBe("active");
  });
  it.each(rebindings)("does not let an old start clear a newer binding %j", async ({ keys }) => {
    const store = useFreeTrial(); await bindActive(store); remote.eligibility.mockResolvedValue(authority(true));
    const pending = deferred<TrialAuthorityState>(); remote.start.mockReturnValue(pending.promise); const command = store.start();
    await Promise.resolve(); await Promise.resolve(); expect(remote.start).toHaveBeenCalledTimes(1);
    await rebindActive(store, keys); const reads = remote.state.mock.calls.length;
    pending.resolve(activeAuthority()); expect(await command).toEqual({ ok: false, reason: "unknown" });
    expectNewAuthority(store); expect(remote.state).toHaveBeenCalledTimes(reads);
  });
  it("does not turn an old eligibility response into a start on a new binding", async () => {
    const store = useFreeTrial(); const pending = deferred<TrialAuthorityState>(); remote.eligibility.mockReturnValue(pending.promise);
    const command = store.start(); await rebindActive(store, ["fixture-a"]); pending.resolve(authority(true));
    expect(await command).toEqual({ ok: false, reason: "unknown" }); expectNewAuthority(store); expect(remote.start).not.toHaveBeenCalled();
  });
  it("retains the newest same-claim version during loading and still accepts a newer version", async () => {
    const store = useFreeTrial(); remote.state.mockResolvedValue(activeAuthority()); await store.refreshRemote();
    const pending = deferred<TrialAuthorityState>(); remote.state.mockReturnValueOnce(pending.promise); const read = store.refreshRemote(true);
    expect(store.authorityStatus).toBe("loading"); pending.resolve({ ...activeAuthority("FIXTURE-A", 4), shadowUSD: 1 }); await read;
    expect(store.authorityStatus).toBe("ready"); expect(store.authorityVersion).toBe(5); expect(store.authoritativeShadowUSD).toBe(14);
    remote.state.mockResolvedValue({ ...activeAuthority("FIXTURE-A", 6), shadowUSD: 15 }); await store.refreshRemote(true);
    expect(store.authorityVersion).toBe(6); expect(store.authoritativeShadowUSD).toBe(15);
  });
  it("keeps a canonical cancel receipt when its readback has an older same-claim version", async () => {
    const store = useFreeTrial(); await bindActive(store); remote.cancel.mockResolvedValue(cancelledAuthority());
    remote.state.mockResolvedValue(activeAuthority()); expect(await store.cancel()).toEqual({ ok: true });
    expect(store.status).toBe("ended"); expect(store.authorityVersion).toBe(6); expect(store.canStart()).toBe(false);
  });
});

describe("canonical command receipt priority within one binding and known claim", () => {
  beforeEach(() => {
    setActivePinia(createPinia()); remote.eligibility.mockReset(); remote.start.mockReset();
    remote.state.mockReset(); remote.cancel.mockReset();
  });
  const drain = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

  it("accepts a newer cancel receipt after a concurrent lower-version read finished first", async () => {
    const store = useFreeTrial(); await bindActive(store);
    const receipt = deferred<TrialAuthorityState>();
    remote.cancel.mockReturnValueOnce(receipt.promise); const command = store.cancel();
    remote.state.mockResolvedValueOnce(parsedAuthority({ ...activeAuthority("FIXTURE-A", 4), shadowUSD: 1 }));
    await store.refreshRemote(true);
    expect(store.authorityVersion).toBe(5); expect(store.authoritativeShadowUSD).toBe(14);
    remote.state.mockResolvedValue(parsedAuthority(activeAuthority()));
    receipt.resolve(parsedAuthority(cancelledAuthority())); const result = await command;
    expect(result).toEqual({ ok: true }); expect(store.status).toBe("ended");
    expect(store.authorityVersion).toBe(6); expect(store.authorityClaimNo).toBe("FIXTURE-A");
  });
  it("retains a newer start receipt when its same claim became known from a later read", async () => {
    const store = useFreeTrial(); remote.eligibility.mockResolvedValue(parsedAuthority(authority(true)));
    const receipt = deferred<TrialAuthorityState>(); remote.start.mockReturnValueOnce(receipt.promise);
    const command = store.start(); await drain(); expect(remote.start).toHaveBeenCalledTimes(1);
    remote.state.mockResolvedValue(parsedAuthority(activeAuthority())); await store.refreshRemote(true);
    receipt.resolve(parsedAuthority({ ...activeAuthority("FIXTURE-A", 6), shadowUSD: 15 }));
    expect(await command).toEqual({ ok: true }); expect(store.status).toBe("active");
    expect(store.authorityVersion).toBe(6); expect(store.authoritativeShadowUSD).toBe(15);
  });
  it("keeps request ordering for a delayed higher-version read", async () => {
    const store = useFreeTrial(); await bindActive(store); const pending = deferred<TrialAuthorityState>();
    remote.state.mockReturnValueOnce(pending.promise); const oldRead = store.refreshRemote(true);
    remote.state.mockResolvedValueOnce(parsedAuthority(activeAuthority())); await store.refreshRemote(true);
    pending.resolve(parsedAuthority(activeAuthority("FIXTURE-A", 9)));
    expect(await oldRead).toBe(false); expect(store.authorityVersion).toBe(5);
  });
  it.each([{ version: 4 }, { version: 5 }])("rejects a delayed cancel receipt at equal or lower version $version", async ({ version }) => {
    const store = useFreeTrial(); await bindActive(store); const receipt = deferred<TrialAuthorityState>();
    remote.cancel.mockReturnValueOnce(receipt.promise); const command = store.cancel();
    remote.state.mockResolvedValueOnce(parsedAuthority(activeAuthority())); await store.refreshRemote(true);
    const readback = deferred<TrialAuthorityState>(); remote.state.mockReturnValueOnce(readback.promise);
    receipt.resolve(parsedAuthority({ ...cancelledAuthority(), version })); await drain();
    expect(store.status).toBe("active"); expect(store.authorityVersion).toBe(5);
    readback.resolve(parsedAuthority(activeAuthority())); expect(await command).toEqual({ ok: false, reason: "unknown" });
  });
  it.each([{ claim: "FIXTURE-OTHER" }, { claim: null }])("rejects a newer receipt when the current claim differs or is unknown $claim", async ({ claim }) => {
    const store = useFreeTrial(); await bindActive(store); const receipt = deferred<TrialAuthorityState>();
    remote.cancel.mockReturnValueOnce(receipt.promise); const command = store.cancel();
    const current = parsedAuthority(claim ? activeAuthority(claim, 8) : { ...authority(true), version: 8 });
    remote.state.mockResolvedValueOnce(current); await store.refreshRemote(true);
    const readback = deferred<TrialAuthorityState>(); remote.state.mockReturnValueOnce(readback.promise);
    receipt.resolve(parsedAuthority({ ...cancelledAuthority(), version: 9 })); await drain();
    expect(store.authorityClaimNo).toBe(claim); expect(store.authorityVersion).toBe(8);
    readback.resolve(current); expect(await command).toEqual({ ok: false, reason: "unknown" });
  });
  it("rejects a null-claim receipt despite its higher version", async () => {
    const store = useFreeTrial(); await bindActive(store); const receipt = deferred<TrialAuthorityState>();
    remote.cancel.mockReturnValueOnce(receipt.promise); const command = store.cancel();
    remote.state.mockResolvedValueOnce(parsedAuthority(activeAuthority())); await store.refreshRemote(true);
    const readback = deferred<TrialAuthorityState>(); remote.state.mockReturnValueOnce(readback.promise);
    receipt.resolve(parsedAuthority({ ...authority(true), version: 9 })); await drain();
    expect(store.authorityClaimNo).toBe("FIXTURE-A"); expect(store.authorityVersion).toBe(5);
    readback.resolve(parsedAuthority(activeAuthority())); expect(await command).toEqual({ ok: false, reason: "unknown" });
  });
  it("rejects a higher same-claim receipt from a previous same-key binding", async () => {
    const store = useFreeTrial(); await bindActive(store); const receipt = deferred<TrialAuthorityState>();
    remote.cancel.mockReturnValueOnce(receipt.promise); const command = store.cancel();
    remote.state.mockResolvedValue(parsedAuthority(activeAuthority("FIXTURE-A", 6)));
    store.bindAccount("fixture-a"); await store.refreshRemote(); const reads = remote.state.mock.calls.length;
    receipt.resolve(parsedAuthority({ ...cancelledAuthority(), version: 100 }));
    expect(await command).toEqual({ ok: false, reason: "unknown" }); expect(remote.state).toHaveBeenCalledTimes(reads);
    expect(store.authorityClaimNo).toBe("FIXTURE-A"); expect(store.authorityVersion).toBe(6); expect(store.status).toBe("active");
  });
});
