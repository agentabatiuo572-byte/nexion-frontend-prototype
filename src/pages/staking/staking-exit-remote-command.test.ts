import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref, reactive, watch } from "vue";
import ts from "typescript";
import source from "@/pages/staking/staking.vue?raw";
import { useUI, confirm } from "@/store/ui";
import { RemoteIntentKeyRegistry, type RemoteIntentStorage } from "@/lib/g-remote-intent";
import { resolvePositionPenalty } from "@/lib/staking-canonical";
import type { StakingSnapshot } from "@/api/staking-api";

// Only the API transport boundary is controlled. Production page functions,
// staking store, confirmation queue, account epoch and intent registry execute.
const remote = vi.hoisted(() => ({
  remoteApiEnabled: true,
  apiRuntimeConfig: { environment: "prod", mode: "prod" },
  stakingApi: {
    fetchStakingPools: vi.fn(), fetchStakingPositions: vi.fn(),
    openStakingPosition: vi.fn(), claimStakingPosition: vi.fn(),
    earlyWithdrawStakingPosition: vi.fn(),
  },
}));
vi.mock("@/api/runtime", () => remote);
const { useStaking, STAKING_PENALTY } = await import("@/store/staking");

const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error("REAL_SFC_SCRIPT_MISSING");
const ast = ts.createSourceFile("staking.vue.ts", script, ts.ScriptTarget.Latest, true);
function declaration(name: string) {
  const statement = ast.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === name);
  if (!statement) throw new Error(`REAL_SFC_FUNCTION_MISSING:${name}`);
  return statement.getText(ast);
}
function variable(name: string) {
  const statement = ast.statements.find((s) => ts.isVariableStatement(s)
    && s.declarationList.declarations.some((d) => d.name.getText(ast) === name));
  if (!statement) throw new Error(`REAL_SFC_STATE_MISSING:${name}`);
  return statement.getText(ast);
}
const lifecycle = ast.statements.filter((s) => ts.isExpressionStatement(s)
  && ts.isCallExpression(s.expression)
  && ["watch", "onShow", "onHide", "onUnmounted"].includes(s.expression.expression.getText(ast)))
  .map((s) => s.getText(ast));
const executable = ts.transpileModule([
  ...["confirmationOwner", "pageVisible", "pageGeneration"].map(variable),
  ...["mutationScope", "isCurrentMutationBinding", "isCurrentMutationPage", "invalidateConfirmations", "hidePage",
    "runRemoteMutation", "handleEarlyWithdraw", "handleClaim"].map(declaration),
  ...lifecycle,
  "return { handleEarlyWithdraw, handleClaim };",
].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function snapshot(account: string, status = "active"): StakingSnapshot {
  const now = Date.now();
  return {
    positions: [{ id: `${account}-position`, tierKey: "usdt30d", productCode: "pool",
      productName: "pool", amountUSDT: 100, termDays: 30, apy: 0.12, penalty: 0.05,
      startTs: now - 1000, unlockTs: now + 100000, estimatedInterestUsdt: 1, status: status as "active" }],
    positionsPage: { total: 1, pageNum: 1, pageSize: 50 }, walletBalanceUsdt: 1000,
    serverTime: now, sourceEnvironment: "PRODUCTION", runId: "",
  };
}
const pools = [{ poolId: 1, tierKey: "usdt30d", currency: "USDT", termDays: 30, apy: 0.12,
  penalty: 0.05, minAmountUsdt: 20, enabled: true, killed: false, status: "ACTIVE",
  sourceEnvironment: "PRODUCTION", runId: "" }];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function harness(storage?: RemoteIntentStorage) {
  const staking = useStaking();
  const app = reactive({ accountKey: "A", accountBindingEpoch: 1 });
  const events: unknown[] = [];
  remote.stakingApi.fetchStakingPools.mockResolvedValue(pools);
  remote.stakingApi.fetchStakingPositions.mockImplementation(async () => {
    events.push({ boundary: "GET-snapshot", account: app.accountKey });
    return snapshot(app.accountKey);
  });
  staking.bindAccount("A");
  await staking.syncRemote();
  const originalPosition = staking.positions[0];
  if (!originalPosition) throw new Error("REAL_STORE_SEED_MISSING");
  remote.stakingApi.earlyWithdrawStakingPosition.mockImplementation(async (id, key) => {
    events.push({ boundary: "early-command", account: app.accountKey, positionNo: id, key });
    return { ...snapshot(app.accountKey), positions: [] };
  });
  let saved: unknown;
  const persistent = storage ?? { read: () => saved, write: (value: unknown) => { saved = structuredClone(value); } };
  const ui = useUI();
  const hooks: Record<string, () => void> = {};
  const dependencies = {
    app, staking, ui, uiConfirm: confirm, resolvePositionPenalty, STAKING_PENALTY,
    pendingRemoteMutations: ref(new Set<string>()),
    remoteMutationGate: new RemoteIntentKeyRegistry("G1", persistent),
    t: { value: { staking: { remoteUnavailableClosed: "unavailable" }, stakingV3: { toast: {
      earlyConfirmTitle: "early", earlyConfirmMessage: "fee", earlyConfirmCta: "confirm",
      earlyDoneTitle: "done", staleTitle: "unknown", claimedTitle: "claimed",
    } } } },
    fmt: (s: string) => s,
    formatStakingPercentage: (n: number) => String(n * 100),
    toast: { warn: vi.fn(), success: vi.fn() }, reportStakingFailure: vi.fn(),
    postMoneyBill: vi.fn(() => { throw new Error("MOCK_MONEY_BRANCH_FORBIDDEN"); }),
    reportStuckFunds: vi.fn(() => { throw new Error("MOCK_MONEY_BRANCH_FORBIDDEN"); }),
    timer: null, clearInterval: vi.fn(), watch,
    getCurrentInstance: () => ({ uid: 1 }),
    onShow: (callback: () => void) => { hooks.show = callback; },
    onHide: (callback: () => void) => { hooks.hide = callback; },
    onUnmounted: (callback: () => void) => { hooks.dispose = callback; },
  };
  const component = new Function(...Object.keys(dependencies), executable)(...Object.values(dependencies));
  function resolve(ok: boolean) {
    const item = ui.confirmQueue.at(-1);
    if (!item) throw new Error("REAL_CONFIRM_MISSING");
    ui.resolveConfirm(item.id, ok);
  }
  async function switchBinding(account: string) {
    app.accountKey = account; app.accountBindingEpoch += 1;
    // The real staking store's binding/epoch boundary executes, not a mock store.
    if (account === "A") { staking.bindAccount(""); staking.bindAccount("A"); }
    else staking.bindAccount(account);
    await staking.syncRemote();
  }
  return { ...dependencies, ...component, ui, originalPosition, resolve, switchBinding, events, storage: persistent,
    show: () => hooks.show(), hide: () => hooks.hide(), dispose: () => hooks.dispose() };
}

beforeEach(() => {
  setActivePinia(createPinia());
  Object.values(remote.stakingApi).forEach((f) => f.mockReset());
});

describe("staking exit remote confirmation boundaries", () => {
  it("ordinary cancel never dispatches or creates a durable command", async () => {
    const h = await harness();
    const pending = h.handleEarlyWithdraw(h.originalPosition);
    h.resolve(false); await pending;
    expect(remote.stakingApi.earlyWithdrawStakingPosition).not.toHaveBeenCalled();
    expect(h.remoteMutationGate.unresolved("A", "early")).toEqual([]);
  });
  it("same binding confirmation dispatches once and retires its acknowledged intent", async () => {
    const h = await harness();
    const pending = h.handleEarlyWithdraw(h.originalPosition);
    h.resolve(true); await pending;
    expect(remote.stakingApi.earlyWithdrawStakingPosition).toHaveBeenCalledTimes(1);
    expect(remote.stakingApi.earlyWithdrawStakingPosition).toHaveBeenCalledWith("A-position", expect.any(String));
    expect(h.remoteMutationGate.unresolved("A", "early")).toEqual([]);
  });
  it.each(["B", "A"])("late old confirmation cannot dispatch after binding changes to %s", async (next) => {
    const h = await harness();
    const pending = h.handleEarlyWithdraw(h.originalPosition);
    const oldDialog = h.ui.confirmQueue.at(-1)!;
    await h.switchBinding(next);
    expect(h.ui.confirmQueue).toEqual([]);
    oldDialog.resolve(true); await pending;
    console.log("ACTUAL_SOURCE_TRACE", JSON.stringify({ scenario: `confirm-after-binding-${next}`,
      events: h.events, currentPosition: h.staking.positions[0]?.id ?? null,
      unresolved: h.remoteMutationGate.unresolved(next, "early") }));
    expect(remote.stakingApi.earlyWithdrawStakingPosition).not.toHaveBeenCalled();
  });
  it("disposed page cannot dispatch from its old outstanding confirmation", async () => {
    const h = await harness();
    const pending = h.handleEarlyWithdraw(h.originalPosition);
    const oldDialog = h.ui.confirmQueue.at(-1)!;
    h.dispose();
    const oldDialogSurvived = h.ui.confirmQueue.length === 1;
    expect(oldDialogSurvived).toBe(false);
    oldDialog.resolve(true); await pending;
    console.log("ACTUAL_SOURCE_TRACE", JSON.stringify({ scenario: "unmount-before-confirm",
      oldDialogSurvived, events: h.events }));
    expect(remote.stakingApi.earlyWithdrawStakingPosition).not.toHaveBeenCalled();
  });
  it("an unknown dispatched exit reads state and retries using exactly its original key", async () => {
    const h = await harness();
    remote.stakingApi.earlyWithdrawStakingPosition.mockRejectedValueOnce(new Error("controlled transport timeout"));
    let pending = h.handleEarlyWithdraw(h.originalPosition);
    h.resolve(true); await pending;
    const firstKey = remote.stakingApi.earlyWithdrawStakingPosition.mock.calls[0][1];
    expect(h.remoteMutationGate.unresolved("A", "early")).toEqual([{ positionNo: "A-position" }]);
    expect(h.staking.remoteReady).toBe(true);
    pending = h.handleEarlyWithdraw(h.staking.positions[0]);
    h.resolve(true); await pending;
    expect(remote.stakingApi.earlyWithdrawStakingPosition.mock.calls[1][1]).toBe(firstKey);
    expect(h.remoteMutationGate.unresolved("A", "early")).toEqual([]);
    console.log("ACTUAL_SOURCE_TRACE", JSON.stringify({ scenario: "unknown-read-retry", events: h.events,
      firstKey, retryKey: remote.stakingApi.earlyWithdrawStakingPosition.mock.calls[1][1] }));
  });

  it("hiding cancels only this page's outstanding confirmation", async () => {
    const h = await harness();
    const ownPending = h.handleEarlyWithdraw(h.originalPosition);
    const foreignPending = h.ui.confirm({ title: "other draft", owner: "another-page" });
    const foreign = h.ui.confirmQueue.at(-1)!;
    h.hide(); await ownPending;
    expect(h.ui.confirmQueue.map((item: { owner?: string }) => item.owner)).toEqual(["another-page"]);
    expect(remote.stakingApi.earlyWithdrawStakingPosition).not.toHaveBeenCalled();
    h.ui.resolveConfirm(foreign.id, false);
    expect(await foreignPending).toBe(false);
  });

  it.each(["hide-show", "unmount", "rebind"])("rejects an already-resolved confirmation before its continuation after %s", async (kind) => {
    const h = await harness();
    const pending = h.handleEarlyWithdraw(h.originalPosition);
    h.resolve(true);
    if (kind === "hide-show") { h.hide(); h.show(); }
    else if (kind === "unmount") h.dispose();
    else await h.switchBinding("A");
    await pending;
    expect(remote.stakingApi.earlyWithdrawStakingPosition).not.toHaveBeenCalled();
    expect(h.remoteMutationGate.unresolved("A", "early")).toEqual([]);
  });

  it.each(["early", "claim"])("settles an already-issued %s ACK without notifying the new page generation", async (kind) => {
    const h = await harness();
    const command = deferred<StakingSnapshot>();
    const api = kind === "early" ? remote.stakingApi.earlyWithdrawStakingPosition : remote.stakingApi.claimStakingPosition;
    api.mockReturnValueOnce(command.promise);
    const pending = kind === "early" ? h.handleEarlyWithdraw(h.originalPosition) : h.handleClaim(h.originalPosition);
    if (kind === "early") h.resolve(true);
    await flush();
    expect(api).toHaveBeenCalledTimes(1);
    h.hide(); h.show();
    command.resolve({ ...snapshot("A"), positions: [] }); await pending;
    expect(h.remoteMutationGate.unresolved("A", kind)).toEqual([]);
    expect(h.toast.warn).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.reportStakingFailure).not.toHaveBeenCalled();
  });

  it("retains and queries an already-issued unknown exit while suppressing obsolete page feedback", async () => {
    const h = await harness();
    const command = deferred<StakingSnapshot>();
    remote.stakingApi.earlyWithdrawStakingPosition.mockReturnValueOnce(command.promise);
    const pending = h.handleEarlyWithdraw(h.originalPosition);
    h.resolve(true); await flush();
    const key = remote.stakingApi.earlyWithdrawStakingPosition.mock.calls[0][1];
    const reads = remote.stakingApi.fetchStakingPositions.mock.calls.length;
    h.hide(); h.show();
    command.reject(new Error("controlled transport timeout")); await pending;
    expect(remote.stakingApi.fetchStakingPositions.mock.calls.length).toBeGreaterThan(reads);
    expect(h.remoteMutationGate.unresolved("A", "early")).toEqual([{ positionNo: "A-position" }]);
    expect(h.staking.positions[0]?.id).toBe("A-position");
    expect(h.reportStakingFailure).not.toHaveBeenCalled();
    const retry = h.handleEarlyWithdraw(h.staking.positions[0]);
    h.resolve(true); await retry;
    expect(remote.stakingApi.earlyWithdrawStakingPosition.mock.calls[1][1]).toBe(key);
  });

  it("keeps the old account's unknown key without issuing a recovery query or feedback for the new account", async () => {
    const h = await harness();
    const command = deferred<StakingSnapshot>();
    remote.stakingApi.earlyWithdrawStakingPosition.mockReturnValueOnce(command.promise);
    const pending = h.handleEarlyWithdraw(h.originalPosition);
    h.resolve(true); await flush();
    await h.switchBinding("B");
    const reads = remote.stakingApi.fetchStakingPositions.mock.calls.length;
    command.reject(new Error("controlled late transport timeout")); await pending;
    expect(remote.stakingApi.fetchStakingPositions.mock.calls.length).toBe(reads);
    expect(h.staking.positions[0]?.id).toBe("B-position");
    expect(h.remoteMutationGate.unresolved("A", "early")).toEqual([{ positionNo: "A-position" }]);
    expect(h.remoteMutationGate.unresolved("B", "early")).toEqual([]);
    expect(h.reportStakingFailure).not.toHaveBeenCalled();
  });

  it("a hidden page cannot open a new exit confirmation or claim command", async () => {
    const h = await harness();
    h.hide();
    await h.handleEarlyWithdraw(h.originalPosition);
    await h.handleClaim(h.originalPosition);
    expect(h.ui.confirmQueue).toEqual([]);
    expect(remote.stakingApi.earlyWithdrawStakingPosition).not.toHaveBeenCalled();
    expect(remote.stakingApi.claimStakingPosition).not.toHaveBeenCalled();
  });

  it("two confirmations cannot dispatch a duplicate while the same intent is in flight", async () => {
    const h = await harness();
    const command = deferred<StakingSnapshot>();
    remote.stakingApi.earlyWithdrawStakingPosition.mockReturnValueOnce(command.promise);
    const first = h.handleEarlyWithdraw(h.originalPosition);
    const second = h.handleEarlyWithdraw(h.originalPosition);
    h.resolve(true); await flush();
    h.resolve(true); await flush();
    expect(remote.stakingApi.earlyWithdrawStakingPosition).toHaveBeenCalledTimes(1);
    command.resolve({ ...snapshot("A"), positions: [] });
    await Promise.all([first, second]);
    expect(h.remoteMutationGate.unresolved("A", "early")).toEqual([]);
  });
});
