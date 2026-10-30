import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { parseTrialAuthorityState } from "@/api/trial-api";
import type { TrialAuthorityState } from "@/api/trial-api";
import { ApiError } from "@/api/errors";
import { createApiClient } from "@/api/api-client";
import { createSessionVault } from "@/api/session-vault";
import { createTrialApi } from "@/api/trial-api";
import type { PaymentPasswordAuthorization } from "@/api/payment-password-api";

const authorization: PaymentPasswordAuthorization = { paymentPassword: "039417", credentialVersion: 1, attemptNo: "fixture-attempt" };

const remote = vi.hoisted(() => ({
  eligibility: vi.fn(),
  start: vi.fn(),
  state: vi.fn(),
  cancel: vi.fn(),
  convert: vi.fn(),
  command: vi.fn(),
}));

vi.mock("@/api/runtime", () => ({
  fundsServerEnabled: true,
  remoteApiEnabled: true,
  developmentFundsEnabled: false,
  trialApi: remote,
  apiClient: { request: remote.command },
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
  paymentRail: "UVEL_USDT_WALLET",
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

  it("retires a known full-capacity refusal after a read proves no claim was created", async () => {
    remote.eligibility.mockResolvedValue(authority(true));
    remote.state.mockResolvedValue(authority(false, "capacity-full"));
    remote.start.mockRejectedValue(new ApiError({ kind: "business", message: "TRIAL_CAPACITY_FULL", code: 409 }));
    const store = useFreeTrial();
    expect(await store.start()).toEqual({ ok: false, reason: "capacity-full" });
    const refusedKey = remote.start.mock.calls[0]![0];
    remote.state.mockResolvedValue(authority(true));
    await store.start();
    expect(remote.start.mock.calls[1]![0]).not.toBe(refusedKey);
  });

  it.each([
    ["USER_ONBOARDING_REQUIRED", "onboarding-required"],
    ["LEGAL_TERMS_ACK_REQUIRED", "terms-required"],
  ])("classifies the exact write-gate refusal %s without replay or false activation", async (message, reason) => {
    remote.eligibility.mockResolvedValue(authority(true));
    remote.state.mockResolvedValue(authority(true));
    const vault = createSessionVault();
    vault.save({ accessToken: "fixture", refreshToken: "fixture", tokenType: "Bearer",
      user: { userId: 7, countryCode: "+86", phone: "13800000007", nickname: "Fixture", onboardingComplete: false } });
    const request = vi.fn().mockResolvedValue({ status: 428, headers: {},
      data: { code: 428, message, data: null } });
    const api = createTrialApi(createApiClient({ baseUrl: "https://example.test", vault, transport: { request } }));
    remote.start.mockImplementation(api.start);
    const store = useFreeTrial(); store.bindAccount("fixture-a"); await store.refreshRemote();
    const reads = remote.state.mock.calls.length;
    // A concurrent state read must not turn this refused command into success.
    remote.state.mockResolvedValue(activeAuthority());
    expect(await store.start()).toEqual({ ok: false, reason });
    expect(request).toHaveBeenCalledOnce(); expect(remote.state).toHaveBeenCalledTimes(reads);
    expect(store.authorityServerState).toBe("ELIGIBLE"); expect(store.authorityVersion).toBe(0);
    expect(store.authorityClaimNo).toBeNull(); expect(store.status).toBe("none");
  });

  it.each([
    new ApiError({ kind: "http", status: 503, code: 428, message: "USER_ONBOARDING_REQUIRED" }),
    new ApiError({ kind: "http", status: 428, code: 999, message: "USER_ONBOARDING_REQUIRED" }),
    new ApiError({ kind: "network", message: "USER_ONBOARDING_REQUIRED" }),
  ])("retains unknown-result recovery for an unqualified prerequisite response (%s)", async error => {
    remote.eligibility.mockResolvedValue(authority(true)); remote.state.mockResolvedValue(authority(true));
    remote.start.mockRejectedValue(error);
    const store = useFreeTrial(); store.bindAccount("fixture-a");
    expect(await store.start()).toEqual({ ok: false, reason: "unknown" });
    expect(await store.start()).toEqual({ ok: false, reason: "unknown" });
    expect(remote.start).toHaveBeenCalledTimes(2);
    expect(remote.start.mock.calls[1]).toEqual(remote.start.mock.calls[0]);
  });

  it("does not expose a late prerequisite refusal to a rebound account", async () => {
    remote.eligibility.mockResolvedValue(authority(true)); remote.state.mockResolvedValue(authority(true));
    const pending = deferred<TrialAuthorityState>(); remote.start.mockReturnValue(pending.promise);
    const store = useFreeTrial(); store.bindAccount("fixture-a");
    const command = store.start();
    while (!remote.start.mock.calls.length) await Promise.resolve();
    store.bindAccount("fixture-b"); await store.refreshRemote();
    const reads = remote.state.mock.calls.length;
    pending.reject(new ApiError({ kind: "http", status: 428, code: 428, message: "USER_ONBOARDING_REQUIRED" }));
    expect(await command).toEqual({ ok: false, reason: "unknown" });
    expect(store.authorityError).toBeNull(); expect(remote.state).toHaveBeenCalledTimes(reads);
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

describe("remote trial conversion refusal and original-intent recovery", () => {
  let storage: Map<string, unknown>;
  const converted = () => ({ ...activeAuthority(), serverState: "REDEEMED" as const,
    status: "converted" as const, eligibilityReason: "converted" as const, version: 6 });
  const receipt = { orderNo: "TRC-ORIGINAL", productNo: "stellarbox-s1", amountUsdt: 1247.73, discountUsdt: 51.27,
    paymentStatus: "PAID", orderStatus: "PAID", source: "nx_trial_claim + nx_order + nx_order_item", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
    provenance: { source: "nx_trial_claim + nx_order + nx_order_item", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" } };
  const commandResult = (path: string, status = "PROCESSING", canResumeSameKey = false) => ({ kind: "trial-convert", commandKey: decodeURIComponent(path.split("/").at(-1)!), status, canResumeSameKey, ...(status === "SUCCEEDED" ? { receipt } : {}) });
  beforeEach(() => {
    setActivePinia(createPinia()); remote.state.mockReset(); remote.convert.mockReset();
    remote.command.mockReset(); remote.command.mockImplementation(async ({ path }: { path: string }) => commandResult(path));
    storage = new Map();
    vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, structuredClone(value)) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("requires a newly entered payment PIN and never submits without authorization", async () => {
    const store = useFreeTrial(); await bindActive(store);
    expect(await store.convert("stellarbox-s1", 1247.73)).toEqual({ ok: false, reason: "payment-required" });
    expect(remote.convert).not.toHaveBeenCalled(); expect(store.hasPendingConversion()).toBe(false);
    expect(remote.command).not.toHaveBeenCalled();
    remote.command.mockImplementation(async ({ path }: { path: string }) => commandResult(path, "NOT_SEEN", true));
    remote.convert.mockImplementation(async () => { remote.state.mockResolvedValue(converted()); return receipt; });
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: true, orderNo: receipt.orderNo });
    expect(remote.convert).toHaveBeenCalledOnce(); expect(remote.convert.mock.calls[0][4]).toEqual(authorization);
  });
  it('a cancelled PIN precheck cannot freeze an unsubmitted old amount/version',async()=>{
    const store=useFreeTrial();await bindActive(store);
    expect((await store.convert('stellarbox-s1',1247.73,'old-quote')).reason).toBe('payment-required');
    expect(store.hasPendingConversion()).toBe(false);
    remote.convert.mockImplementationOnce(async()=>{remote.state.mockResolvedValue(converted());return {...receipt,amountUsdt:1200};});
    expect(await store.convert('stellarbox-s1',1200,'new-quote',authorization)).toEqual({ok:true,orderNo:receipt.orderNo});
    expect(remote.command).not.toHaveBeenCalled();expect(remote.convert.mock.calls[0].slice(0,3)).toEqual(['stellarbox-s1',1200,'new-quote']);
  });

  it("propagates a rejected PIN for checkout re-entry and reuses the same business key with a fresh attempt", async () => {
    const store = useFreeTrial(); await bindActive(store);
    const denied = new ApiError({ kind: "business", status: 422, message: "PAYMENT_PASSWORD_INCORRECT" });
    remote.convert.mockRejectedValueOnce(denied);
    await expect(store.convert("stellarbox-s1", 1247.73, null, authorization)).rejects.toBe(denied);
    expect(remote.convert).toHaveBeenCalledOnce(); expect(remote.command).not.toHaveBeenCalled();
    const originalKey = remote.convert.mock.calls[0][3];
    remote.command.mockImplementation(async ({ path }: { path: string }) => commandResult(path, "NOT_SEEN", true));
    remote.convert.mockImplementationOnce(async () => { remote.state.mockResolvedValue(converted()); return receipt; });
    const nextAuthorization = { ...authorization, paymentPassword: "493017", attemptNo: "fixture-next-attempt" };
    expect(await store.convert("stellarbox-s1", 1247.73, null, nextAuthorization)).toEqual({ ok: true, orderNo: receipt.orderNo });
    expect(remote.convert.mock.calls[1][3]).toBe(originalKey); expect(remote.convert.mock.calls[1][4]).toEqual(nextAuthorization);
  });

  it("does not resume a missing command until the server allows the original key", async () => {
    const store = useFreeTrial(); await bindActive(store);
    remote.convert.mockRejectedValueOnce(new ApiError({kind:'network',message:'REQUEST_TIMEOUT'}));
    await store.convert("stellarbox-s1",1247.73,null,authorization);remote.convert.mockClear();
    remote.command.mockImplementation(async ({ path }: { path: string }) => commandResult(path, "NOT_SEEN", false));
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "unknown" });
    expect(remote.convert).not.toHaveBeenCalled(); expect(store.hasPendingConversion()).toBe(true);
  });

  it("refuses a changed amount when safely resuming an original intent", async () => {
    const store = useFreeTrial(); await bindActive(store);
    remote.convert.mockRejectedValueOnce(new ApiError({kind:'network',message:'REQUEST_TIMEOUT'}));
    await store.convert("stellarbox-s1",1247.73,null,authorization);remote.convert.mockClear();
    remote.command.mockImplementation(async ({ path }: { path: string }) => commandResult(path, "NOT_SEEN", true));
    expect(await store.convert("stellarbox-s1", 1200, null, authorization)).toEqual({ ok: false, reason: "quote-changed" });
    expect(remote.convert).not.toHaveBeenCalled(); expect(store.hasPendingConversion()).toBe(true);
  });

  it("retires a definitive rejection returned by the original command query", async () => {
    const store = useFreeTrial(); await bindActive(store);
    remote.convert.mockRejectedValueOnce(new ApiError({kind:'network',message:'REQUEST_TIMEOUT'}));
    await store.convert("stellarbox-s1",1247.73,null,authorization);remote.convert.mockClear();
    remote.command.mockImplementation(async ({ path }: { path: string }) => commandResult(path, "REJECTED"));
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "rejected" });
    expect(remote.convert).not.toHaveBeenCalled(); expect(store.hasPendingConversion()).toBe(false);
  });

  it.each([200, 409])("sends one POST for an explicit balance refusal (HTTP %s), preserving ACTIVE v0", async (status) => {
    const state = { ...activeAuthority(), version: 0 };
    const store = useFreeTrial(); remote.state.mockResolvedValue(state);
    store.bindAccount("fixture-a"); await store.refreshRemote();
    const vault = createSessionVault();
    vault.save({ accessToken: "fixture", refreshToken: "fixture", tokenType: "Bearer",
      user: { userId: 7, countryCode: "+86", phone: "13800000007", nickname: "Fixture", onboardingComplete: true } });
    const request = vi.fn().mockResolvedValue({ status,
      data: { code: 409, message: "TRIAL_WALLET_INSUFFICIENT", data: null }, headers: {} });
    const api = createTrialApi(createApiClient({ baseUrl: "http://127.0.0.1:8110", vault, transport: { request } }));
    remote.convert.mockImplementation(api.convert);
    const reads = remote.state.mock.calls.length;
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "insufficient-funds" });
    expect(request).toHaveBeenCalledOnce(); expect(remote.state).toHaveBeenCalledTimes(reads);
    expect(store.status).toBe("active"); expect(store.authorityClaimNo).toBe("FIXTURE-A");
    expect(store.authorityVersion).toBe(0); expect(store.authoritativeShadowUSD).toBe(state.shadowUSD);
    expect(store.hasPendingConversion()).toBe(false);
  });

  it("uses a fresh key after a cached refusal, so a user retry after top-up can succeed", async () => {
    const store = useFreeTrial(); await bindActive(store);
    remote.convert.mockRejectedValueOnce(new ApiError({ kind: "http", status: 409, code: 409, message: "TRIAL_WALLET_INSUFFICIENT" }))
      .mockImplementationOnce(async () => { remote.state.mockResolvedValue(converted()); return receipt; });
    expect((await store.convert("stellarbox-s1", 1247.73, null, authorization)).reason).toBe("insufficient-funds");
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: true, orderNo: receipt.orderNo });
    expect(remote.convert).toHaveBeenCalledTimes(2);
    // Arguments: productNo, expectedAmountUsdt, quoteVersion, idempotencyKey.
    expect(remote.convert.mock.calls[0][3]).not.toBe(remote.convert.mock.calls[1][3]);
  });

  it.each(["TRIAL_AMOUNT_MISMATCH", "TRIAL_AMOUNT_INVALID"])("returns the genuine quote refusal without replay: %s", async (message) => {
    const store = useFreeTrial(); await bindActive(store);
    remote.convert.mockRejectedValue(new ApiError({ kind: "http", status: 409, code: 409, message }));
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "quote-changed" });
    expect(remote.convert).toHaveBeenCalledOnce(); expect(store.hasPendingConversion()).toBe(false);
  });

  it.each([
    new ApiError({ kind: "network", message: "REQUEST_TIMEOUT" }),
    new ApiError({ kind: "protocol", message: "TRIAL_RESPONSE_INVALID" }),
    new ApiError({ kind: "http", status: 504, message: "HTTP_504" }),
    new ApiError({ kind: "business", status: 200, code: 409, message: "IDEMPOTENCY_RESULT_UNKNOWN" }),
  ])("recovers a lost result through a read-only command receipt with authoritative readback (%s)", async (error) => {
    const store = useFreeTrial(); await bindActive(store);
    remote.convert.mockRejectedValueOnce(error);
    remote.command.mockImplementation(async ({ path }: { path: string }) => {
      remote.state.mockResolvedValue(converted()); return commandResult(path, "SUCCEEDED");
    });
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: true, orderNo: receipt.orderNo });
    expect(remote.convert).toHaveBeenCalledOnce();
    expect(remote.command.mock.calls[0][0].path).toBe(`/api/app/payment-commands/trial-convert/${encodeURIComponent(remote.convert.mock.calls[0][3])}`);
    expect(store.status).toBe("converted"); expect(store.hasPendingConversion()).toBe(false);
  });

  it("retains the quote/key across restart and a changed quote after unresolved readback", async () => {
    let store = useFreeTrial(); await bindActive(store);
    remote.convert.mockRejectedValue(new ApiError({ kind: "network", message: "REQUEST_TIMEOUT" }));
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "unknown" });
    const original = remote.convert.mock.calls[0]; expect(store.hasPendingConversion()).toBe(true);
    setActivePinia(createPinia()); store = useFreeTrial(); await bindActive(store);
    remote.command.mockImplementation(async ({ path }: { path: string }) => { remote.state.mockResolvedValue(converted()); return commandResult(path, "SUCCEEDED"); });
    expect(await store.convert("stellarbox-s1", 1200, null, authorization)).toEqual({ ok: true, orderNo: receipt.orderNo });
    expect(remote.convert).toHaveBeenCalledOnce(); expect(remote.command.mock.lastCall![0].path).toContain(encodeURIComponent(original[3]));
  });

  it("keeps the original intent when terminal readback lacks the original order receipt", async () => {
    const store = useFreeTrial(); await bindActive(store);
    remote.convert.mockRejectedValue(new ApiError({ kind: "network", message: "REQUEST_TIMEOUT" }));
    remote.state.mockResolvedValue(converted());
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "unknown" });
    await store.refreshRemote(true);
    expect(store.status).toBe("converted"); expect(store.hasPendingConversion()).toBe(true);
    const original = remote.convert.mock.calls[0]; remote.command.mockImplementation(async ({ path }: { path: string }) => commandResult(path, "SUCCEEDED"));
    expect(await store.convert("stellarbox-s1", 1200, null, authorization)).toEqual({ ok: true, orderNo: receipt.orderNo });
    expect(remote.convert).toHaveBeenCalledOnce(); expect(remote.command.mock.lastCall![0].path).toContain(encodeURIComponent(original[3]));
  });

  it("keeps the restored unknown intent while the original command remains indeterminate", async () => {
    let store = useFreeTrial(); await bindActive(store);
    remote.convert.mockRejectedValue(new ApiError({ kind: "network", message: "REQUEST_TIMEOUT" }));
    remote.state.mockResolvedValue(converted());
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "unknown" });
    const original = remote.convert.mock.calls[0];
    const originalPending = structuredClone(storage.get("nexgrid-trial-convert-accounts-v1"));
    setActivePinia(createPinia()); store = useFreeTrial();
    store.bindAccount("fixture-a"); await store.refreshRemote();
    expect(store.status).toBe("converted"); expect(store.hasPendingConversion()).toBe(true);
    remote.command.mockImplementation(async ({ path }: { path: string }) => commandResult(path, "INDETERMINATE"));
    for (let retry = 0; retry < 2; retry++) {
      expect(await store.convert("stellarbox-s1", 1200, null, authorization)).toEqual({ ok: false, reason: "unknown" });
      expect(remote.convert.mock.lastCall).toEqual(original);
      expect(remote.convert).toHaveBeenCalledOnce();
      expect(store.hasPendingConversion()).toBe(true); expect(store.status).toBe("converted");
      expect(storage.get("nexgrid-trial-convert-accounts-v1")).toEqual(originalPending);
    }
  });

  it("does not automatically execute a second POST after the first request's unknown outcome", async () => {
    const store = useFreeTrial(); await bindActive(store);
    remote.convert.mockRejectedValueOnce(new ApiError({ kind: "network", message: "REQUEST_TIMEOUT" }));
    remote.state.mockResolvedValue(converted());
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "unknown" });
    expect(remote.convert).toHaveBeenCalledOnce(); expect(remote.command).toHaveBeenCalledOnce();
    expect(store.hasPendingConversion()).toBe(true);
  });

  it("retains a contradictory 5xx response instead of treating its body as a definitive refusal", async () => {
    const store = useFreeTrial(); await bindActive(store);
    remote.convert.mockRejectedValue(new ApiError({ kind: "http", status: 504, code: 409, message: "TRIAL_WALLET_INSUFFICIENT" }));
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "unknown" });
    expect(remote.convert).toHaveBeenCalledOnce(); expect(remote.command).toHaveBeenCalledOnce(); expect(store.hasPendingConversion()).toBe(true);
  });

  it.each([
    new ApiError({ kind: "auth", status: 401, code: 401, message: "SESSION_CHANGED_DURING_REQUEST" }),
    new ApiError({ kind: "business", code: 403, message: "UNRECOGNIZED_REFUSAL" }),
    new ApiError({ kind: "http", status: 400, code: 400, message: "HTTP_400" }),
  ])("does not retire or immediately replay an unqualified/auth refusal (%s)", async (error) => {
    const store = useFreeTrial(); await bindActive(store); remote.convert.mockRejectedValue(error);
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "unknown" });
    expect(remote.convert).toHaveBeenCalledOnce(); expect(store.hasPendingConversion()).toBe(true);
  });

  it("will not create a second SKU intent while an original conversion is unknown", async () => {
    const store = useFreeTrial(); await bindActive(store);
    remote.convert.mockRejectedValue(new ApiError({ kind: "network", message: "REQUEST_TIMEOUT" }));
    await store.convert("stellarbox-s1", 1247.73, null, authorization); const count = remote.convert.mock.calls.length;
    expect(await store.convert("other-sku", 999, null, authorization)).toEqual({ ok: false, reason: "unknown" });
    expect(remote.convert).toHaveBeenCalledTimes(count);
  });

  it.each(rebindings)("ignores a late rejection without replay/retiring or clearing a newer binding %j", async ({ keys }) => {
    const store = useFreeTrial(); await bindActive(store);
    const pending = deferred<typeof receipt>(); remote.convert.mockReturnValue(pending.promise);
    const command = store.convert("stellarbox-s1", 1247.73, null, authorization); await rebindActive(store, keys);
    const reads = remote.state.mock.calls.length;
    pending.reject(new ApiError({ kind: "http", status: 409, code: 409, message: "TRIAL_WALLET_INSUFFICIENT" }));
    expect(await command).toEqual({ ok: false, reason: "unknown" });
    expectNewAuthority(store); expect(remote.convert).toHaveBeenCalledOnce(); expect(remote.state).toHaveBeenCalledTimes(reads);
    expect(storage.get("nexgrid-trial-convert-accounts-v1")).toHaveProperty("fixture-a.commands");
  });

  it.each(rebindings)("ignores a late success/readback without wiping a newer binding %j", async ({ keys }) => {
    const store = useFreeTrial(); await bindActive(store);
    const readback = deferred<TrialAuthorityState>();
    remote.convert.mockResolvedValue(receipt); remote.state.mockReturnValueOnce(readback.promise);
    const command = store.convert("stellarbox-s1", 1247.73, null, authorization); await Promise.resolve();
    await rebindActive(store, keys); readback.resolve(converted());
    expect(await command).toEqual({ ok: false, reason: "unknown" }); expectNewAuthority(store);
  });

  it("does not submit on a binding change during the initial authority refresh", async () => {
    const store = useFreeTrial(); const pending = deferred<TrialAuthorityState>();
    remote.state.mockReturnValueOnce(pending.promise); const command = store.convert("stellarbox-s1", 1247.73, null, authorization);
    await rebindActive(store, ["fixture-b"]); pending.resolve(activeAuthority());
    expect(await command).toEqual({ ok: false, reason: "unknown" });
    expect(remote.convert).not.toHaveBeenCalled(); expectNewAuthority(store);
  });

  it("fails closed before POST if the persisted original intent cannot be read", async () => {
    const store = useFreeTrial(); await bindActive(store);
    vi.stubGlobal("uni", { getStorageSync: () => { throw new Error("disk failure"); } });
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "storage-unavailable" });
    expect(remote.convert).not.toHaveBeenCalled(); expect(store.hasPendingConversion()).toBe(true);
  });

  it("does not replace a corrupted pending key or submit before a new key is durably stored", async () => {
    const store = useFreeTrial(); await bindActive(store);
    storage.set("nexgrid-trial-convert-accounts-v1", { "fixture-a": { commands: {
      '["FIXTURE-A","stellarbox-s1",1247.73]': "",
    } } });
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "unknown" });
    expect(remote.convert).not.toHaveBeenCalled();
    storage.clear();
    vi.stubGlobal("uni", { getStorageSync: (key: string) => storage.get(key),
      setStorageSync: () => { throw new Error("disk full"); } });
    expect(await store.convert("stellarbox-s1", 1247.73, null, authorization)).toEqual({ ok: false, reason: "storage-unavailable" });
    expect(remote.convert).not.toHaveBeenCalled();
  });
});
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
