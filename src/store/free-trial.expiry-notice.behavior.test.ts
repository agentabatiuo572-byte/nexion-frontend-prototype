import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import ts from "typescript";
import appSource from "../App.vue?raw";
import { parseTrialAuthorityState, type TrialAuthorityState } from "@/api/trial-api";
import { ApiError } from "@/api/errors";

const remote = vi.hoisted(() => ({ state: vi.fn(), eligibility: vi.fn(), start: vi.fn(), cancel: vi.fn(), convert: vi.fn() }));
vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true, fundsServerEnabled: true, developmentFundsEnabled: false,
  trialApi: remote, accountApi: {}, orderApi: {}, walletApi: {}, voucherApi: {} }));
const { useFreeTrial } = await import("./free-trial");

const start = 1_792_000_000_000, expires = start + 3 * 86_400_000, deadline = expires + 7 * 86_400_000;
function authority(state = "ACTIVE", patch: Record<string, unknown> = {}): TrialAuthorityState {
  const live = ["ACTIVE", "GRACE", "EXTENDED"].includes(state);
  return parseTrialAuthorityState({ authoritative: true, state, canStart: false,
    eligibilityReason: live ? "in-progress" : state === "REDEEMED" ? "converted" : "used",
    claimNo: "TRIAL-A", version: live ? 5 : 6, serverNowEpochMs: state === "GRACE" ? expires + 1000 : live ? expires - 1000 : deadline,
    claimedAtEpochMs: start, expiresAtEpochMs: state === "EXTENDED" ? deadline : expires,
    graceEndsAtEpochMs: live && state !== "EXTENDED" ? deadline : null,
    extendedEndsAtEpochMs: state === "EXTENDED" ? deadline : null,
    endReason: live || state === "REDEEMED" ? null : "cancelled",
    finishedAtEpochMs: live || state === "REDEEMED" ? null : deadline,
    shadowUsdt: live ? 10 : 0, shadowNex: live ? 20 : 0,
    source: "nx_trial_claim", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
    provenance: { source: "nx_trial_claim", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" },
    paymentRail: "UVEL_USDT_WALLET", config: { trialDays: "3", graceDays: "7", discountRate: "0.15", discountCapUSD: "20",
      trialOffsetCapUSD: "50", trialProductId: "stellarbox-s1", trialProductName: "UVELBox S1", trialPriceUSD: "1299",
      shadowDailyUSD: "38.52", shadowDailyNEX: "65", seatsLeftToday: "1", phaseOpen: true,
      autoPushEnabled: true, autoPushDelayMs: "1500", autoPushCooldownHours: "24", autoPushMaxPerSession: "1" }, ...patch });
}
const expired = (patch: Record<string, unknown> = {}) => authority("CANCELLED", { endReason: "expired", ...patch });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Execute the actual App poll against the real store, including its toast consumer.
function harness() {
  const trial = useFreeTrial(), info = vi.fn();
  let allowed = true;
  const ast = ts.createSourceFile("App.ts", appSource.split('<script setup lang="ts">')[1].split("</script>")[0], ts.ScriptTarget.Latest, true);
  const poll = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "pollTrial")!;
  const compiled = ts.transpileModule(poll.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = { useFreeTrial: () => trial, remoteApiEnabled: true, ensureBusinessLoopsAllowed: () => allowed,
    useT: () => ({ value: { trial: { endedToast: "expired", graceStartToast: "grace" } } }), toast: { info, warn: vi.fn() },
    formatTrialDateTime: () => "date", dateLocale: () => "en", fmt: (text: string) => text,
    remainingMs: () => 0, liveShadowUSD: () => 0, formatAmount: String, useTrialConfig: () => ({ config: {} }) };
  const run = new Function("deps", `const { ${Object.keys(deps).join(",")} } = deps;
    let trialPollRunning = false; const urgencyFired = { active24h: false, grace24h: false, grace1h: false };
    const URGENCY_24H_MS = 86400000, URGENCY_1H_MS = 3600000;
    ${compiled}; return pollTrial;`)(deps) as () => Promise<void>;
  return { trial, run, info, ended: () => info.mock.calls.filter(([text]) => text === "expired").length,
    allow: (value: boolean) => { allowed = value; } };
}
const failure = (kind: string) => kind === "503"
  ? new ApiError({ kind: "http", status: 503, message: "HTTP_503" })
  : new ApiError({ kind: "network", message: "REQUEST_TIMEOUT" });
async function read(h: ReturnType<typeof harness>, state: TrialAuthorityState) {
  remote.state.mockResolvedValueOnce(state); await h.run();
}
beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks(); });

describe("trial expiry is a confirmed lifecycle event, not status restoration", () => {
  it.each(["FAILED", "CANCELLED"])("does not announce historical %s on first load or outage recovery", async state => {
    const h = harness();
    await read(h, authority(state)); expect(h.ended()).toBe(0);
    for (const kind of ["network", "503"]) {
      remote.state.mockRejectedValueOnce(failure(kind)); await h.run();
      expect(h.trial.authorityStatus).toBe("error"); expect(h.trial.canStart()).toBe(false);
      await read(h, authority(state)); expect(h.ended()).toBe(0);
    }
  });
  it("does not announce an explicitly expired historical claim on first load", async () => {
    const h = harness(); await read(h, expired()); expect(h.ended()).toBe(0);
  });
  it.each(["ACTIVE", "GRACE", "EXTENDED"])("announces one server-confirmed final expiry from %s", async state => {
    const h = harness(); await read(h, authority(state));
    await read(h, expired()); expect(h.ended()).toBe(1);
    await read(h, expired());
    remote.state.mockRejectedValueOnce(failure("network")); await h.run();
    await read(h, expired()); expect(h.ended()).toBe(1);
  });
  it.each(["network", "503"])("retains expiry evidence through %s while transaction authority stays closed", async kind => {
    const h = harness(); await read(h, authority());
    remote.state.mockRejectedValueOnce(failure(kind)); await h.run();
    expect(h.trial.authorityStatus).toBe("error"); expect(h.trial.authorityClaimNo).toBeNull();
    expect(h.trial.authoritativeQuote).toBeNull(); expect(h.trial.canStart()).toBe(false);
    await read(h, expired()); expect(h.ended()).toBe(1);
  });
  it.each(["ACTIVE", "GRACE", "EXTENDED"])("does not announce %s restored before its final deadline", async state => {
    const h = harness(); await read(h, authority(state));
    remote.state.mockRejectedValueOnce(failure("network")); await h.run();
    await read(h, authority(state)); expect(h.ended()).toBe(0);
  });
  it.each([
    { state: "CANCELLED", endReason: "cancelled" }, { state: "CANCELLED", endReason: null },
    { state: "FAILED", endReason: null }, { state: "REDEEMED", endReason: null },
  ])("requires an explicit server expiry cause: %j", async ({ state, ...patch }) => {
    const h = harness(); await read(h, authority()); await read(h, authority(state, patch)); expect(h.ended()).toBe(0);
  });
  it("accepts explicit server expiry without inventing a legacy grace deadline", async () => {
    const h = harness(); await read(h, authority("ACTIVE", { graceEndsAtEpochMs: null }));
    await read(h, expired()); expect(h.ended()).toBe(1);
  });
  it("keeps older responses without expiry classification silent", async () => {
    const h = harness(); await read(h, authority());
    await read(h, authority("CANCELLED", { endReason: undefined })); expect(h.ended()).toBe(0);
  });
  it("does not use the device clock or ACTIVE to GRACE as final expiry confirmation", async () => {
    const h = harness(); await read(h, authority());
    await read(h, authority("GRACE", { serverNowEpochMs: deadline + 1000 })); expect(h.ended()).toBe(0);
  });
  it("waits for server expiry after an extension instead of using the previous grace deadline", async () => {
    const h = harness(); await read(h, authority("GRACE"));
    const extended = deadline + 86_400_000;
    await read(h, authority("EXTENDED", { version: 6, expiresAtEpochMs: extended, extendedEndsAtEpochMs: extended,
      serverNowEpochMs: deadline })); expect(h.ended()).toBe(0);
    await read(h, expired({ version: 7, expiresAtEpochMs: extended,
      serverNowEpochMs: extended, finishedAtEpochMs: extended })); expect(h.ended()).toBe(1);
  });
  it("accepts explicit server expiry across concurrent read or server clock differences", async () => {
    const h = harness(); await read(h, authority());
    await read(h, expired({ finishedAtEpochMs: deadline + 1 }));
    expect(h.ended()).toBe(1);
  });
  it("never inherits another claim's lifecycle", async () => {
    const h = harness(); await read(h, authority()); await read(h, expired({ claimNo: "TRIAL-B" })); expect(h.ended()).toBe(0);
  });
  it.each([4, 5])("does not announce a stale or non-advancing terminal version %s after an outage", async version => {
    const h = harness(); await read(h, authority());
    remote.state.mockRejectedValueOnce(failure("network")); await h.run();
    await read(h, expired({ version })); expect(h.ended()).toBe(0);
    await read(h, expired()); expect(h.ended()).toBe(1);
  });
  it.each([{ keys: ["account-b"] }, { keys: ["account-a"] }, { keys: ["account-b", "account-a"] }])
    ("clears evidence and late responses on binding changes $keys", async ({ keys }) => {
    const h = harness(); remote.state.mockResolvedValueOnce(authority());
    h.trial.bindAccount("account-a"); await h.trial.refreshRemote();
    const old = deferred<TrialAuthorityState>(); remote.state.mockReturnValueOnce(old.promise);
    const poll = h.run();
    for (const key of keys) {
      remote.state.mockResolvedValueOnce(expired()); h.trial.bindAccount(key); await h.trial.refreshRemote();
    }
    old.resolve(expired({ version: 99 })); await poll; expect(h.ended()).toBe(0);
  });
  it("does not consume a new binding's pending expiry from an older binding's poll", async () => {
    const h = harness(); await read(h, authority());
    const old = deferred<TrialAuthorityState>(); remote.state.mockReturnValueOnce(old.promise); const poll = h.run();
    remote.state.mockResolvedValueOnce(authority("ACTIVE", { claimNo: "TRIAL-B" }));
    h.trial.bindAccount("account-b"); await h.trial.refreshRemote();
    remote.state.mockResolvedValueOnce(expired({ claimNo: "TRIAL-B" })); await h.trial.refreshRemote();
    old.resolve(expired()); await poll; expect(h.ended()).toBe(0);
    await read(h, expired({ claimNo: "TRIAL-B" })); expect(h.ended()).toBe(1);
  });
  it("ignores a delayed higher-version read after a more recent read", async () => {
    const h = harness(); await read(h, authority());
    const old = deferred<TrialAuthorityState>(); remote.state.mockReturnValueOnce(old.promise); const poll = h.run();
    remote.state.mockResolvedValueOnce(authority()); await h.trial.refreshRemote(true);
    old.resolve(expired({ version: 99 })); await poll; expect(h.ended()).toBe(0);
    await read(h, expired()); expect(h.ended()).toBe(1);
  });
  it("does not let a successful old poll consume an expiry created after the await boundary rebind", async () => {
    const h = harness(); await read(h, authority());
    const originalPoll = h.trial.poll.bind(h.trial);
    vi.spyOn(h.trial, "poll").mockImplementationOnce(async now => {
      const result = await originalPoll(now);
      remote.state.mockResolvedValueOnce(authority("ACTIVE", { claimNo: "TRIAL-B" }));
      h.trial.bindAccount("account-b"); await h.trial.refreshRemote();
      remote.state.mockResolvedValueOnce(expired({ claimNo: "TRIAL-B" })); await h.trial.refreshRemote();
      return result;
    });
    await read(h, expired()); expect(h.ended()).toBe(0);
    await read(h, expired({ claimNo: "TRIAL-B" })); expect(h.ended()).toBe(1);
  });
  it("keeps live permissions closed when only an older version is available after a failure", async () => {
    const h = harness(); await read(h, authority());
    remote.state.mockRejectedValueOnce(failure("network")); await h.run();
    await read(h, authority("ACTIVE", { version: 4 }));
    expect(h.trial.authorityStatus).toBe("error"); expect(h.trial.authorityClaimNo).toBeNull();
    expect(h.trial.canStart()).toBe(false); expect(h.ended()).toBe(0);
    await read(h, expired()); expect(h.ended()).toBe(1);
  });
  it("defers the toast while hidden and does not create a concurrent poll", async () => {
    const h = harness(); await read(h, authority()); const pending = deferred<TrialAuthorityState>();
    remote.state.mockReturnValueOnce(pending.promise); const poll = h.run(); await h.run();
    expect(remote.state).toHaveBeenCalledTimes(2);
    h.allow(false); pending.resolve(expired()); await poll; expect(h.ended()).toBe(0);
    h.allow(true); await read(h, expired()); expect(h.ended()).toBe(1);
  });
});
