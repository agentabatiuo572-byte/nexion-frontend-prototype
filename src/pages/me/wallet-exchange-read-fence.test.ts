import { computed, ref, type Ref } from "vue";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { createRemoteAuthorityCoordinator } from "@/lib/remote-authority-coordinator";
import page from "./wallet-exchange.vue?raw";

type Snapshot = {
  caps: { swapEnabled: boolean };
  wallet: { usdtAvailable: number };
  ordersPage: { pageNum: number; pageSize: number; total: number; snapshotId: string };
  orders: Array<{ exchangeNo: string }>;
};
type Reads = {
  syncRemoteState(): Promise<boolean>;
  loadMoreHistory(): Promise<void>;
  commitRemoteSnapshot(snapshot: Snapshot | null): void;
  beginRemoteMutation(accountKey: string): { finish(): void };
  invalidateRemoteReads(): void;
};
const start = page.indexOf("let remoteReadGeneration =");
const end = page.indexOf("\nasync function cancelRemoteOrder", start);
if (start < 0 || end < start) throw new Error("Actual exchange authority read functions are required");
const code = ts.transpileModule(
  page.slice(start, end) + ";return { syncRemoteState, loadMoreHistory, commitRemoteSnapshot, beginRemoteMutation, invalidateRemoteReads };",
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function snapshot(pageNum = 1, paused = false, balance = 100): Snapshot {
  return {
    caps: { swapEnabled: !paused }, wallet: { usdtAvailable: balance },
    ordersPage: { pageNum, pageSize: 20, total: 21, snapshotId: "21" },
    orders: pageNum === 1 ? Array.from({ length: 20 }, (_, i) => ({ exchangeNo: String(i + 1) })) : [{ exchangeNo: "21" }],
  };
}
function setup() {
  const pending: Array<ReturnType<typeof deferred<Snapshot>>> = [];
  const calls: unknown[][] = [], notices: string[] = [];
  const scope = { current: true };
  const remoteState: Ref<Snapshot | null> = ref(snapshot());
  const dependencies = {
    ref, computed, remoteApiEnabled: true, remoteState, remoteError: ref<string | null>(null),
    remoteSnapshotReceivedAt: ref(0), historyLoadingMore: ref(false),
    remoteScopeCurrent: () => scope.current,
    captureExchangeScope: () => ({ accountKey: "synthetic" }), captureRuntimeRevision: () => ({ epoch: 1 }),
    remoteAuthority: createRemoteAuthorityCoordinator(),
    exchangeApi: { fetchState: (...args: unknown[]) => {
      calls.push(args);
      const response = pending.shift();
      if (!response) throw new Error("Unexpected authority request");
      return response.promise;
    } },
    toast: { error: (message: string) => notices.push(message) },
    t: ref({ exchange: { remoteUnavailableToast: "unavailable" } }),
  };
  const reads = new Function(...Object.keys(dependencies), code)(...Object.values(dependencies)) as Reads;
  return { reads, ...dependencies, scope, calls, notices, enqueue: () => {
    const response = deferred<Snapshot>(); pending.push(response); return response;
  } };
}

describe("wallet exchange authority read ordering", () => {
  it("accepts a valid anchored page and preserves all history entries", async () => {
    const s = setup(), response = s.enqueue(), request = s.reads.loadMoreHistory();
    response.resolve(snapshot(2)); await request;
    expect(s.remoteState.value?.orders).toHaveLength(21);
    expect(s.calls).toEqual([[2, 20, "21"]]);
    expect(s.historyLoadingMore.value).toBe(false);
  });

  it("does not let older pagination restore pre-mutation balance or swap capability", async () => {
    const s = setup(), response = s.enqueue(), request = s.reads.loadMoreHistory();
    s.reads.commitRemoteSnapshot(snapshot(1, true, 70));
    response.resolve(snapshot(2)); await request;
    expect(s.remoteState.value?.caps.swapEnabled).toBe(false);
    expect(s.remoteState.value?.wallet.usdtAvailable).toBe(70);
    expect(s.remoteState.value?.orders).toHaveLength(20);
  });

  it.each(["success", "failure"])("discards an older first-page %s after a newer snapshot", async result => {
    const s = setup(), old = s.enqueue(), fresh = s.enqueue();
    const first = s.reads.syncRemoteState(), second = s.reads.syncRemoteState();
    fresh.resolve(snapshot(1, true, 70)); expect(await second).toBe(true);
    if (result === "failure") old.reject(new Error("old read")); else old.resolve(snapshot());
    expect(await first).toBe(false);
    expect(s.remoteState.value?.wallet.usdtAvailable).toBe(70);
    expect(s.remoteState.value?.caps.swapEnabled).toBe(false);
    expect(s.remoteError.value).toBeNull();
  });

  it("keeps the newer page pending when an older page finally completes", async () => {
    const s = setup(), old = s.enqueue(), first = s.reads.loadMoreHistory();
    const fresh = s.enqueue(), refresh = s.reads.syncRemoteState();
    fresh.resolve(snapshot(1, true, 70)); await refresh;
    const next = s.enqueue(), second = s.reads.loadMoreHistory();
    old.reject(new Error("old page")); await first;
    expect(s.historyLoadingMore.value).toBe(true); expect(s.notices).toEqual([]);
    next.resolve(snapshot(2, true, 70)); await second;
    expect(s.historyLoadingMore.value).toBe(false);
  });

  it("drops a pre-mutation authority rejection without erasing the snapshot", async () => {
    const s = setup(), response = s.enqueue(), request = s.reads.syncRemoteState();
    const mutation = s.reads.beginRemoteMutation("synthetic");
    response.reject(new Error("old read")); expect(await request).toBe(false);
    expect(s.remoteState.value).not.toBeNull(); expect(s.remoteError.value).toBeNull(); mutation.finish();
  });

  it("waits for an in-flight mutation before starting pagination transport", async () => {
    const s = setup(), mutation = s.reads.beginRemoteMutation("synthetic"), response = s.enqueue();
    const request = s.reads.loadMoreHistory(); expect(s.calls).toHaveLength(0);
    mutation.finish(); await Promise.resolve(); expect(s.calls).toHaveLength(1);
    response.resolve(snapshot(2)); await request; expect(s.remoteState.value?.orders).toHaveLength(21);
  });

  it.each(["snapshot", "duplicate", "total", "page", "empty"])("rejects current malformed pagination: %s", async defect => {
    const s = setup(), response = s.enqueue(), request = s.reads.loadMoreHistory(), malformed = snapshot(2);
    if (defect === "snapshot") malformed.ordersPage.snapshotId = "22";
    if (defect === "duplicate") malformed.orders[0].exchangeNo = "1";
    if (defect === "total") malformed.ordersPage.total = 22;
    if (defect === "page") malformed.ordersPage.pageNum = 3;
    if (defect === "empty") malformed.orders = [];
    response.resolve(malformed); await request;
    expect(s.notices).toEqual(["unavailable"]); expect(s.remoteState.value?.orders).toHaveLength(20);
    expect(s.historyLoadingMore.value).toBe(false);
  });

  it.each(["success", "failure"])("keeps first-page %s authoritative when pagination is attempted during refresh", async result => {
    const s = setup(), response = s.enqueue(), request = s.reads.syncRemoteState().catch(() => false);
    await s.reads.loadMoreHistory(); expect(s.calls).toHaveLength(1);
    if (result === "failure") response.reject(new Error("current authority unavailable")); else response.resolve(snapshot(1, true, 70));
    await request;
    if (result === "failure") {
      expect(s.remoteState.value).toBeNull(); expect(s.remoteError.value).toBe("G2_REMOTE_AUTHORITY_UNAVAILABLE");
    } else expect(s.remoteState.value?.wallet.usdtAvailable).toBe(70);
  });

  it("discards pagination after its account or runtime scope has ended", async () => {
    const s = setup(), response = s.enqueue(), request = s.reads.loadMoreHistory();
    s.scope.current = false; response.resolve(snapshot(2)); await request;
    expect(s.remoteState.value?.orders).toHaveLength(20); expect(s.notices).toEqual([]);
  });
});
