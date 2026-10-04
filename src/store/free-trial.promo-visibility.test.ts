import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed, nextTick } from "vue";
import ts from "typescript";
import type { TrialAuthorityState } from "@/api/trial-api";

const remote = vi.hoisted(() => ({ state: vi.fn(), eligibility: vi.fn(), start: vi.fn() }));
vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true, fundsServerEnabled: true,
  developmentFundsEnabled: false, trialApi: remote, orderApi: {}, accountApi: {}, walletApi: {}, voucherApi: {} }));
const { useFreeTrial } = await import("./free-trial");
const pages = import.meta.glob(["../pages/me/me.vue", "../components/trial-promo-banner.vue"], { query: "?raw", import: "default", eager: true });

function pageGate(source: string, name: string, trial: ReturnType<typeof useFreeTrial>, activeName: string) {
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1];
  const ast = ts.createSourceFile("page.ts", script, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.filter(ts.isVariableStatement).flatMap(s => [...s.declarationList.declarations])
    .find(d => d.name.getText(ast) === name)!;
  const code = ts.transpileModule("return " + declaration.initializer!.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function("computed", "trial", activeName, code)(computed, trial,
    computed(() => trial.status === "active" || trial.status === "grace"));
}
function rendered(trial: ReturnType<typeof useFreeTrial>) {
  const me = pageGate(pages["../pages/me/me.vue"] as string, "trialIsHero", trial, "trialIsActive");
  const banner = pageGate(pages["../components/trial-promo-banner.vue"] as string, "visible", trial, "isActive");
  return computed(() => me.value && banner.value);
}
function refreshFromMe(trial: ReturnType<typeof useFreeTrial>): Promise<void> {
  const script = (pages["../pages/me/me.vue"] as string).match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1];
  const ast = ts.createSourceFile("me.ts", script, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === "refreshRemoteTrial")!;
  const code = ts.transpileModule(fn.getText(ast) + ";return refreshRemoteTrial();", {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function("trial", code)(trial);
}
function bannerActions(trial: ReturnType<typeof useFreeTrial>, show: () => void) {
  const script = (pages["../components/trial-promo-banner.vue"] as string).match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1];
  const ast = ts.createSourceFile("banner.ts", script, ts.ScriptTarget.Latest, true);
  const declarations = ast.statements.filter(ts.isVariableStatement)
    .flatMap(s => [...s.declarationList.declarations]);
  const read = (name: string) => ts.transpileModule(
    "return " + declarations.find(d => d.name.getText(ast) === name)!.initializer!.getText(ast) + ";",
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  const actions = ast.statements.filter(s => ts.isFunctionDeclaration(s) && ["openClaim", "retryEligibility"].includes(s.name?.text ?? ""));
  const code = ts.transpileModule(actions.map(s => s.getText(ast)).join("\n") + ";return {openClaim,retryEligibility};", {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  // The component's OWN gate, not a test-local re-derivation of it: BUG 173 changed
  // which snapshots may open the sheet, so the assertion has to follow the banner.
  const canClaim = new Function("computed", "trial", read("canClaim"))(computed, trial);
  return new Function("trial", "canClaim", "claimSheet", code)(trial, canClaim, { show });
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function authority(canStart = true, status: TrialAuthorityState["status"] = "none"): TrialAuthorityState {
  return { authoritative: true, serverCanonical: true, serverState: status === "active" ? "ACTIVE" : "ELIGIBLE", status, canStart,
    eligibilityReason: canStart ? undefined : "used", serverNow: 1_725_000_000_000, version: 1,
    claimNo: status === "active" ? "TRIAL-FIXTURE" : null, startedAt: null, expiresAt: null, graceEndsAt: null,
    finishedAt: null, cooldownUntil: null, shadowUSD: 0, shadowNEX: 0, source: "nx_trial_claim",
    sourceEnvironment: "PRODUCTION", runId: "", provenance: {source:"nx_trial_claim",serverCanonical:true,sourceEnvironment:"PRODUCTION",runId:""},
    paymentRail: "NEXION_USDT_WALLET", config: {trialDays:"3",graceDays:"7",discountRate:"0.15",discountCapUSD:"20",
      trialOffsetCapUSD:"50",trialProductId:"stellarbox-s1",trialProductName:"NexGridBox S1",trialPriceUSD:"1299",
      shadowDailyUSD:"38.52",shadowDailyNEX:"65",seatsLeftToday:"1",phaseOpen:true,autoPushEnabled:true,
      autoPushDelayMs:"1500",autoPushCooldownHours:"24",autoPushMaxPerSession:"1"} };
}
beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks(); });

describe("Earn hero display remains separate from claim authority", () => {
  it.each([true, false])("retains an eligible or product-unavailable hero during polling: eligible=%s", async eligible => {
    const trial = useFreeTrial();
    const state = { ...authority(eligible), eligibilityReason: eligible ? undefined : "product-unavailable" as const };
    expect(trial.showHeroPromo()).toBe(false);
    remote.state.mockResolvedValueOnce(state); await trial.refreshRemote();
    expect(trial.showHeroPromo()).toBe(true); expect(trial.showPromo()).toBe(eligible);
    const pending = deferred<TrialAuthorityState>(); remote.state.mockReturnValueOnce(pending.promise);
    const poll = trial.poll(Date.now());
    expect(trial.showHeroPromo()).toBe(true); expect(trial.canStart()).toBe(false);
    pending.reject(Error("offline")); await poll;
    expect(trial.showHeroPromo()).toBe(true); expect(trial.canStart()).toBe(false);
    remote.eligibility.mockResolvedValueOnce(authority(false)); await trial.refreshEligibilityRemote();
    expect(trial.showHeroPromo()).toBe(false); expect(remote.start).not.toHaveBeenCalled();
  });
  it("clears retained hero on same-key rebind and cannot inherit old account responses", async () => {
    const trial = useFreeTrial(); remote.state.mockResolvedValueOnce(authority());
    trial.bindAccount("account-a"); await trial.refreshRemote(); expect(trial.showHeroPromo()).toBe(true);
    const old = deferred<TrialAuthorityState>(), fresh = deferred<TrialAuthorityState>();
    remote.state.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const oldRead = trial.refreshRemote(true); trial.bindAccount("account-a");
    expect(trial.showHeroPromo()).toBe(false);
    old.resolve(authority()); await oldRead; expect(trial.showHeroPromo()).toBe(false);
    fresh.resolve(authority(false)); await vi.waitFor(() => expect(trial.authorityStatus).toBe("ready"));
    expect(trial.showHeroPromo()).toBe(false);
  });
});

describe("Me trial promotion display vs claim authority", () => {
  it("opens the sheet from a confirmed claimable snapshot but never from an unconfirmed one", async () => {
    const trial = useFreeTrial(), show = vi.fn(), actions = bannerActions(trial, show);
    // First frame: nothing confirmed yet — the entry stays closed.
    actions.openClaim(); expect(show).not.toHaveBeenCalled();
    remote.state.mockResolvedValueOnce(authority()); await trial.refreshRemote();
    actions.openClaim(); expect(show).toHaveBeenCalledOnce(); show.mockClear();
    // BUG 173: a confirmed claimable snapshot keeps the entry usable while the
    // background re-read is in flight (the card must not be briefly disabled).
    // The claim command itself still re-reads authority and stays fail-closed.
    const read = deferred<TrialAuthorityState>(); remote.state.mockReturnValueOnce(read.promise);
    const request = trial.refreshRemote(true); actions.openClaim(); expect(show).toHaveBeenCalledOnce();
    // A failed re-read drops back to "error" — the entry closes again.
    read.reject(Error("offline")); await request; show.mockClear();
    actions.openClaim(); expect(show).not.toHaveBeenCalled();
    expect(remote.start).not.toHaveBeenCalled();
  });
  it("retries only a failed read, without opening a sheet or issuing a claim", async () => {
    const trial = useFreeTrial(), show = vi.fn(), actions = bannerActions(trial, show);
    actions.retryEligibility(); expect(remote.eligibility).not.toHaveBeenCalled();
    remote.state.mockResolvedValueOnce(authority()).mockRejectedValueOnce(Error("offline"));
    await trial.refreshRemote(); await trial.refreshRemote(true);
    const read = deferred<TrialAuthorityState>(); remote.eligibility.mockReturnValueOnce(read.promise);
    actions.retryEligibility(); actions.retryEligibility();
    expect(remote.eligibility).toHaveBeenCalledOnce(); expect(trial.canStart()).toBe(false);
    read.resolve(authority()); await vi.waitFor(() => expect(trial.canStart()).toBe(true));
    expect(show).not.toHaveBeenCalled(); expect(remote.start).not.toHaveBeenCalled();
  });
  it("settles a confirmed card from the single state read, without a second eligibility round trip", async () => {
    const trial = useFreeTrial(), shown = rendered(trial);
    const state = deferred<TrialAuthorityState>();
    remote.state.mockResolvedValueOnce(authority()).mockReturnValueOnce(state.promise);
    expect(shown.value).toBe(false);
    await trial.refreshRemote(); expect(shown.value).toBe(true);
    const refresh = refreshFromMe(trial);
    expect(trial.canStart()).toBe(false); expect(shown.value).toBe(true);
    state.resolve(authority()); await refresh;
    // BUG 173: GET /api/trial/state already carries canStart/eligibilityReason, so the
    // page must not spend a second serial RTT (and a second disabled window) on
    // /api/trial/eligibility. That read is now only a state-read recovery path.
    expect(remote.eligibility).not.toHaveBeenCalled();
    expect(shown.value).toBe(true); expect(trial.canStart()).toBe(true);
    expect(remote.start).not.toHaveBeenCalled();
  });
  it("keeps a confirmed card disabled on read failure and permits a successful read-only retry", async () => {
    const trial = useFreeTrial(), shown = rendered(trial);
    remote.state.mockResolvedValueOnce(authority()).mockRejectedValueOnce(Error("offline"));
    await trial.refreshRemote(); await trial.refreshRemote(true);
    expect(trial.authorityStatus).toBe("error"); expect(trial.canStart()).toBe(false); expect(shown.value).toBe(true);
    remote.eligibility.mockResolvedValueOnce(authority()); await trial.refreshEligibilityRemote();
    expect(shown.value).toBe(true); expect(trial.canStart()).toBe(true); expect(remote.start).not.toHaveBeenCalled();
  });
  it("does not invent a promotion for an initial unknown or failing account", async () => {
    const trial = useFreeTrial(), shown = rendered(trial), state = deferred<TrialAuthorityState>();
    remote.state.mockReturnValueOnce(state.promise); const request = trial.refreshRemote();
    expect(shown.value).toBe(false); state.reject(Error("offline")); await request;
    expect(shown.value).toBe(false); expect(trial.canStart()).toBe(false);
  });
  it.each([false, true])("clears promotion at every account bind including same-account=%s and rejects old responses", async same => {
    const trial = useFreeTrial(), shown = rendered(trial);
    remote.state.mockResolvedValueOnce(authority()); trial.bindAccount("account-a"); await trial.refreshRemote();
    expect(shown.value).toBe(true);
    const old = deferred<TrialAuthorityState>(), fresh = deferred<TrialAuthorityState>();
    remote.state.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const oldRead = trial.refreshRemote(true);
    trial.bindAccount(same ? "account-a" : "account-b");
    expect(shown.value).toBe(false); expect(trial.canStart()).toBe(false);
    expect(remote.state).toHaveBeenCalledTimes(3);
    old.resolve(authority()); await oldRead; await nextTick(); expect(shown.value).toBe(false);
    fresh.resolve(authority(false)); await vi.waitFor(() => expect(trial.authorityStatus).toBe("ready"));
    expect(shown.value).toBe(false); expect(trial.canStart()).toBe(false);
  });
  it("keeps an A-B-A rebind on the newest generation without an extra manual refresh", async () => {
    const trial = useFreeTrial(), shown = rendered(trial);
    remote.state.mockResolvedValueOnce(authority()); trial.bindAccount("account-a"); await trial.refreshRemote();
    const oldA = deferred<TrialAuthorityState>(), oldB = deferred<TrialAuthorityState>(), newA = deferred<TrialAuthorityState>();
    remote.state.mockReturnValueOnce(oldA.promise).mockReturnValueOnce(oldB.promise).mockReturnValueOnce(newA.promise);
    const oldRead = trial.refreshRemote(true); trial.bindAccount("account-b"); trial.bindAccount("account-a");
    expect(shown.value).toBe(false); expect(remote.state).toHaveBeenCalledTimes(4);
    newA.resolve(authority(false)); await vi.waitFor(() => expect(trial.authorityStatus).toBe("ready"));
    oldA.resolve(authority()); oldB.resolve(authority()); await oldRead; await nextTick();
    expect(shown.value).toBe(false); expect(trial.canStart()).toBe(false); expect(trial.authorityStatus).toBe("ready");
  });
  it.each(["none", "active", "ended", "converted"] as const)("replaces the old promo when the server confirms ineligible %s", async status => {
    const trial = useFreeTrial(), shown = rendered(trial);
    remote.state.mockResolvedValueOnce(authority()).mockResolvedValueOnce(authority(false, status));
    await trial.refreshRemote(); expect(shown.value).toBe(true);
    await trial.refreshRemote(true); expect(shown.value).toBe(false); expect(trial.canStart()).toBe(false);
  });
});
