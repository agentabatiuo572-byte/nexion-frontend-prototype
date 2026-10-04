import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import ts from "typescript";
import { parse } from "@vue/compiler-sfc";
import page from "./wallet-exchange.vue?raw";
import { createExchangePendingMutationStore, recoverExchangeSwap, type ExchangePendingStorage } from "@/lib/exchange-pending-mutation";
import { createRemoteAuthorityCoordinator } from "@/lib/remote-authority-coordinator";
import { acquireExchangeCancelCommand, exchangeOrderCanCancel, finishExchangeCancelCommand,
  isCurrentExchangeCancelScope, type ExchangeCancelStorage } from "@/lib/exchange-cancel";

const source = ts.createSourceFile("exchange.ts", parse(page).descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
function actualFunctions(names: string[]) {
  const functions = names.map(name => {
    const fn = source.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === name);
    if (!fn) throw new Error(`Missing actual function ${name}`);
    return fn.getText(source);
  }).join("\n");
  return ts.transpileModule(`${functions}; return { ${names.join(",")} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise };
}
const order = { exchangeNo: "EX-original-12345678", fromAsset: "NEX" as const, toAsset: "USDT" as const, fromAmount: 10, status: "QUEUED" };
function setup() {
  let pendingData: unknown, cancelData: unknown;
  const pendingStorage: ExchangePendingStorage = { read: () => pendingData, write: v => { pendingData = structuredClone(v); } };
  const exchangeCancelStorage: ExchangeCancelStorage = { read: () => cancelData, write: v => { cancelData = structuredClone(v); } };
  const pending = createExchangePendingMutationStore(pendingStorage, () => "original-swap-key");
  const remoteAuthority = createRemoteAuthorityCoordinator();
  const scope = { accountKey: "synthetic", epoch: 1, pageEpoch: 1 }, runtime = { epoch: 1 };
  const deps = {
    remoteApiEnabled: true, recoveringExchange: ref(false), submitting: ref(false), cancellingOrderNo: ref<string | null>(null),
    captureExchangeScope: () => ({ ...scope }), captureRuntimeRevision: () => ({ ...runtime }),
    remoteScopeCurrent: (saved: typeof scope, run: typeof runtime) => saved.accountKey === scope.accountKey
      && saved.epoch === scope.epoch && saved.pageEpoch === scope.pageEpoch && run.epoch === runtime.epoch,
    pendingExchangeMutations: pending, recoverExchangeSwap, exchangeCancelStorage,
    acquireExchangeCancelCommand, exchangeOrderCanCancel, finishExchangeCancelCommand, isCurrentExchangeCancelScope,
    remoteState: ref<unknown>({ caps: { swapEnabled: false }, orders: [order] }),
    remoteError: ref<string | null>(null), remoteSnapshotReceivedAt: ref(0), pendingExchangeRevision: ref(0),
    remoteAuthority, beginRemoteMutation: vi.fn((accountKey: string) => remoteAuthority.beginMutation(accountKey)),
    commitRemoteSnapshot: vi.fn((state: unknown) => { deps.remoteState.value = state; }),
    refreshCommittedExchangeWalletProjection: vi.fn(), notifyRemoteSwapResult: vi.fn(),
    toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
    toastIfRemoteScopeCurrent: (saved: typeof scope, run: typeof runtime, show: () => void) => { if (deps.remoteScopeCurrent(saved, run)) show(); },
    t: ref({ exchange: { pendingRecoveryHint: "pending", cancelNotAllowed: "not allowed", cancelDone: "done", cancelUnknownTitle: "unknown" } }),
    exchangeApi: {
      recover: vi.fn(async (): Promise<{ status: string; order?: typeof order }> => ({ status: "SUCCEEDED", order })),
      fetchState: vi.fn(async () => ({ caps: { swapEnabled: false }, orders: [{ ...order, status: "CANCELLED" }] })),
      cancel: vi.fn(async (_no: string, _key: string) => ({ caps: { swapEnabled: false }, orders: [{ ...order, status: "CANCELLED" }] })),
      swap: vi.fn(),
    },
  };
  const functions = new Function(...Object.keys(deps), "let pendingRecoveryGeneration=0;\n" + actualFunctions([
    "recoverPendingExchange", "cancelRemoteOrder", "handleCancelQueued",
  ]))(...Object.values(deps)) as {
    recoverPendingExchange(): Promise<void>; cancelRemoteOrder(no: string): Promise<string>; handleCancelQueued(no: string): void;
  };
  return { ...deps, functions, pending, scope, runtime, cancelData: () => cancelData };
}

describe("actual exchange recovery and cancellation controls", () => {
  it("recovers an existing command while paused and with no form input, never posting a swap", async () => {
    const s = setup(); s.pending.acquire("synthetic", { direction: "NEX_TO_USDT", fromAmount: 10, queueIfCapped: true }, []);
    await s.functions.recoverPendingExchange();
    expect(s.exchangeApi.recover).toHaveBeenCalledExactlyOnceWith("NEX_TO_USDT",10,true,"original-swap-key");
    expect(s.exchangeApi.swap).not.toHaveBeenCalled(); expect(s.pending.list("synthetic")).toEqual([]);
    expect(s.notifyRemoteSwapResult).toHaveBeenCalledOnce();
  });
  it("ignores duplicate recovery clicks and suppresses late results after a page boundary", async () => {
    const s = setup(); s.pending.acquire("synthetic", { direction: "NEX_TO_USDT", fromAmount: 10, queueIfCapped: true }, []);
    const read = deferred<{ status: string; order: typeof order }>(); s.exchangeApi.recover.mockReturnValue(read.promise);
    const first = s.functions.recoverPendingExchange(); await s.functions.recoverPendingExchange();
    expect(s.exchangeApi.recover).toHaveBeenCalledOnce(); s.scope.pageEpoch++;
    read.resolve({ status: "SUCCEEDED", order }); await first;
    expect(s.commitRemoteSnapshot).not.toHaveBeenCalled(); expect(s.notifyRemoteSwapResult).not.toHaveBeenCalled();
    expect(s.pending.list("synthetic")).toHaveLength(1);
  });
  it("releases a show-time read after the hidden recovery request finishes without clearing its key", async () => {
    const s = setup(); s.pending.acquire("synthetic", { direction: "NEX_TO_USDT", fromAmount: 10, queueIfCapped: true }, []);
    const receipt = deferred<{ status: string; order: typeof order }>(); s.exchangeApi.recover.mockReturnValue(receipt.promise);
    const recovery = s.functions.recoverPendingExchange(); s.scope.pageEpoch++;
    const fresh = s.remoteAuthority.guardedRead(s.scope.accountKey, () => s.exchangeApi.fetchState());
    await Promise.resolve(); expect(s.exchangeApi.fetchState).not.toHaveBeenCalled();
    receipt.resolve({ status: "SUCCEEDED", order }); await recovery;
    await expect(fresh).resolves.toMatchObject({ caps: { swapEnabled: false } });
    expect(s.exchangeApi.fetchState).toHaveBeenCalledOnce(); expect(s.pending.list("synthetic")).toHaveLength(1);
    expect(s.notifyRemoteSwapResult).not.toHaveBeenCalled();
  });
  it.each(["account", "runtime", "page"])("drops cancellation recovery read after %s changes", async boundary => {
    const s = setup(); s.exchangeApi.cancel.mockRejectedValue(new Error("timeout"));
    const read = deferred<{ caps: { swapEnabled: boolean }; orders: typeof order[] }>(); s.exchangeApi.fetchState.mockReturnValue(read.promise);
    const cancel = s.functions.cancelRemoteOrder(order.exchangeNo); await Promise.resolve();
    if (boundary === "account") s.scope.epoch++; else if (boundary === "runtime") s.runtime.epoch++; else s.scope.pageEpoch++;
    read.resolve({ caps: { swapEnabled: false }, orders: [{ ...order, status: "CANCELLED" }] });
    expect(await cancel).toBe("stale"); expect(s.commitRemoteSnapshot).not.toHaveBeenCalled();
    expect(s.toast.success).not.toHaveBeenCalled(); expect(s.cancelData()).toMatchObject({ records: [expect.objectContaining({ exchangeNo: order.exchangeNo })] });
  });
  it("resolves a terminal non-cancelled order without claiming cancellation succeeded", async () => {
    const s = setup(); s.exchangeApi.cancel.mockRejectedValue(new Error("timeout"));
    s.exchangeApi.fetchState.mockResolvedValue({ caps: { swapEnabled: false }, orders: [{ ...order, status: "COMPLETED" }] });
    expect(await s.functions.cancelRemoteOrder(order.exchangeNo)).toBe("not-cancellable");
    expect(s.toast.success).not.toHaveBeenCalled(); expect(s.cancelData()).toMatchObject({ records: [] });
  });
  it("keeps the cancellation key when both transport and authority parsing fail", async () => {
    const s = setup(); s.exchangeApi.cancel.mockRejectedValue(new Error("timeout"));
    s.exchangeApi.fetchState.mockRejectedValue(new Error("EXCHANGE_STATE_RESPONSE_INVALID"));
    expect(await s.functions.cancelRemoteOrder(order.exchangeNo)).toBe("unknown");
    expect(s.remoteState.value).toBeNull(); expect(s.cancelData()).toMatchObject({ records: [expect.anything()] });
    expect(s.toast.success).not.toHaveBeenCalled();
  });
  it("ignores repeated UI cancellation clicks during the same request", async () => {
    const s = setup(); const response = deferred<{ caps: { swapEnabled: boolean }; orders: typeof order[] }>();
    s.exchangeApi.cancel.mockReturnValue(response.promise);
    s.functions.handleCancelQueued(order.exchangeNo); s.functions.handleCancelQueued(order.exchangeNo);
    expect(s.exchangeApi.cancel).toHaveBeenCalledOnce();
    response.resolve({ caps: { swapEnabled: false }, orders: [{ ...order, status: "CANCELLED" }] });
    await Promise.resolve(); await Promise.resolve(); expect(s.cancellingOrderNo.value).toBeNull();
  });
});
