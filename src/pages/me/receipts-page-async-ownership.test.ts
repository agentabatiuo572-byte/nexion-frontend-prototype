import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./receipts.vue?raw";
import { createReceiptsPageRequestFence } from "./receipts-page-request-fence";
import { canLoadRemoteComputeMore } from "./receipts-page-pagination";

const implementation = source.slice(source.indexOf("let receiptPageRequestEpoch = 0;"), source.indexOf("\nwatch(", source.indexOf("async function openRemoteComputeReceipt")))
  + source.slice(source.indexOf("function invalidateRemoteReceiptsPage()"), source.indexOf("onLoad((options)"));
const compiled = ts.transpileModule(implementation + "\nreturn { loadSelectedMoreRemoteReceipts, loadSelectedRemoteReceipts, retryRemoteReceipts, selectRemoteReceiptKind, openRemoteComputeReceipt, invalidateRemoteReceiptsPage };", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const page = (receiptNo = "current", nextCursor: string | null = "next") => ({
  items: [{ receiptNo }], nextOffset: nextCursor ? 20 : null, nextCursor,
});

function harness() {
  const app = { accountKey: "user-a", accountBindingEpoch: 1 };
  const receiptsPageFence = createReceiptsPageRequestFence(() => app.accountKey, () => app.accountBindingEpoch);
  receiptsPageFence.show();
  const kind = ref<"compute" | "deposit">("compute");
  const computeMore = ref(false);
  const depositMore = ref(false);
  const deps = {
    app, receiptsPageFence, remoteReceiptsMode: true, remoteReceiptKind: kind,
    remoteMoreLoading: computed(() => kind.value === "compute" ? computeMore.value : depositMore.value),
    remoteComputeMoreLoading: computeMore, remoteDepositMoreLoading: depositMore,
    remoteComputeInitialLoading: ref(false), remoteComputeReceiptLoading: ref(false),
    remoteComputeReceiptStatus: ref("ready"), failedComputeReceiptRequest: ref(null),
    remoteComputeReceiptItems: ref([{ receiptNo: "first" }]),
    remoteComputeReceiptNextOffset: ref<number | null>(20), remoteComputeReceiptNextCursor: ref<string | null>("next"),
    canLoadRemoteComputeMore, taskAssignmentApi: { receipts: vi.fn().mockResolvedValue(page()), receipt: vi.fn() },
    depositsStore: { remoteReceiptNextOffset: 20, remoteReceiptInitialStatus: "ready", remoteReceiptMoreStatus: "ready",
      loadMoreRemoteVietQrReceipts: vi.fn().mockResolvedValue(undefined), refreshRemoteVietQrDeposits: vi.fn().mockResolvedValue(undefined), invalidateRemoteVietQrReceiptReads: vi.fn() },
    toast: { error: vi.fn() }, t: ref({ wallet: { receiptsUnavailableTitle: "Unavailable", receiptsUnavailableBody: "Retry" } }),
    receiptRequestEpoch: 0, open: ref(null),
  };
  const handlers = new Function(...Object.keys(deps), compiled)(...Object.values(deps)) as {
    loadSelectedMoreRemoteReceipts(): Promise<void>; loadSelectedRemoteReceipts(): void; retryRemoteReceipts(): void;
    selectRemoteReceiptKind(kind: "compute" | "deposit"): void; openRemoteComputeReceipt(task: { receiptNo: string }): Promise<void>;
    invalidateRemoteReceiptsPage(): void;
  };
  return { ...deps, ...handlers };
}

describe("receipt page actual async handlers", () => {
  it.each(["resolve", "reject"] as const)("keeps the new page busy when a hidden page's old more request ends with %s", async (settle) => {
    const h = harness();
    const old = deferred<ReturnType<typeof page>>();
    const fresh = deferred<ReturnType<typeof page>>();
    h.taskAssignmentApi.receipts.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page("new-first", "new-next")).mockReturnValueOnce(fresh.promise);
    const oldMore = h.loadSelectedMoreRemoteReceipts();
    h.receiptsPageFence.hide(); h.invalidateRemoteReceiptsPage();
    h.app.accountBindingEpoch += 1;
    h.receiptsPageFence.show(); h.loadSelectedRemoteReceipts();
    await Promise.resolve(); await Promise.resolve();
    const newMore = h.loadSelectedMoreRemoteReceipts();
    expect(h.remoteComputeMoreLoading.value).toBe(true);
    if (settle === "resolve") old.resolve(page("stale", "old-next")); else old.reject(new Error("stale failure"));
    await oldMore;
    const busyWhileNewPending = h.remoteComputeMoreLoading.value;
    await h.loadSelectedMoreRemoteReceipts();
    fresh.resolve(page("new-second", null)); await newMore;
    expect(busyWhileNewPending).toBe(true);
    expect(h.taskAssignmentApi.receipts).toHaveBeenCalledTimes(3);
    expect(h.remoteComputeReceiptItems.value.map((row) => row.receiptNo)).toEqual(["new-first", "new-second"]);
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.remoteComputeMoreLoading.value).toBe(false);
  });

  it("makes retry and the load-more button share one in-flight request", async () => {
    const h = harness();
    h.taskAssignmentApi.receipts.mockRejectedValueOnce(new Error("temporary"));
    await h.loadSelectedMoreRemoteReceipts();
    const retry = deferred<ReturnType<typeof page>>();
    h.taskAssignmentApi.receipts.mockReturnValueOnce(retry.promise);
    h.retryRemoteReceipts();
    const retryBusy = h.remoteComputeMoreLoading.value;
    await h.loadSelectedMoreRemoteReceipts();
    retry.resolve(page("recovered", null));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(retryBusy).toBe(true);
    expect(h.taskAssignmentApi.receipts).toHaveBeenCalledTimes(2);
    expect(h.remoteComputeReceiptItems.value.map((row) => row.receiptNo)).toEqual(["first", "recovered"]);
  });

  it("does not show a compute error after selecting deposit receipts", async () => {
    const h = harness();
    const pending = deferred<ReturnType<typeof page>>();
    h.taskAssignmentApi.receipts.mockReturnValueOnce(pending.promise);
    const more = h.loadSelectedMoreRemoteReceipts();
    h.selectRemoteReceiptKind("deposit");
    pending.reject(new Error("late compute failure")); await more;
    expect(h.toast.error).not.toHaveBeenCalled();
    expect(h.depositsStore.refreshRemoteVietQrDeposits).toHaveBeenCalledOnce();
  });

  it("does not open a late compute detail over the selected deposit tab", async () => {
    const h = harness();
    const pending = deferred<{ receiptNo: string }>();
    h.taskAssignmentApi.receipt.mockReturnValueOnce(pending.promise);
    const detail = h.openRemoteComputeReceipt({ receiptNo: "old" });
    h.selectRemoteReceiptKind("deposit");
    pending.resolve({ receiptNo: "old" }); await detail;
    expect(h.open.value).toBeNull();
  });
});
