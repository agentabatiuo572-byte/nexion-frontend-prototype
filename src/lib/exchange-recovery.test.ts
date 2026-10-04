import { describe, expect, it, vi } from "vitest";
import { createExchangePendingMutationStore, executeExchangeSwap, recoverExchangeSwap, ExchangeOutcomeUnknownError,
  type PersistedExchangePending, type ExchangeSwapIntent, type ExchangeOrderLike, type ExchangePendingLease } from "./exchange-pending-mutation";

const intent: ExchangeSwapIntent = { direction: "NEX_TO_USDT", fromAmount: 10, queueIfCapped: true };
const order: ExchangeOrderLike = { exchangeNo: "EX-original-order", fromAsset: "NEX", toAsset: "USDT", fromAmount: 10, status: "COMPLETED" };
function setup() {
  let stored: PersistedExchangePending | null = null;
  let serial = 0;
  const storage = { read: () => stored, write: (value: PersistedExchangePending) => { stored = structuredClone(value); } };
  const pending = createExchangePendingMutationStore(storage, () => `key-${++serial}`);
  const recover = vi.fn(async (_lease: ExchangePendingLease): Promise<{ status: string; order?: ExchangeOrderLike }> => ({ status: "UNKNOWN" }));
  const fetchState = vi.fn(async () => ({ orders: [] as ExchangeOrderLike[] }));
  const isCurrent = vi.fn(() => true);
  const swap = vi.fn(async (_key: string) => ({ orders: [order], order }));
  const options = { pending, accountKey: "synthetic", intent, baseline: { orders: [] }, recover, fetchState, isCurrent, swap };
  return { ...options, options, storage };
}

describe("exchange recovery ownership and persistence", () => {
  it.each(["FAILED", "PROCESSING", "UNKNOWN", "NOT_FOUND", "MISMATCH"])("%s never permits a new key or amount-based attribution", async status => {
    const s = setup(); s.pending.acquire("synthetic", intent, []);
    s.recover.mockResolvedValue({ status }); s.fetchState.mockResolvedValue({ orders: [order] });
    await expect(executeExchangeSwap(s.options)).rejects.toBeInstanceOf(ExchangeOutcomeUnknownError);
    expect(s.swap).not.toHaveBeenCalled(); expect(s.fetchState).not.toHaveBeenCalled();
    expect(s.pending.list("synthetic")).toHaveLength(1);
  });

  it("recovers the exact order outside the first history page without substituting equal amounts", async () => {
    const s = setup(); s.pending.acquire("synthetic", intent, []);
    s.recover.mockResolvedValue({ status: "SUCCEEDED", order });
    s.fetchState.mockResolvedValue({ orders: [{ ...order, exchangeNo: "EX-other-same-amount" }] });
    const result = await executeExchangeSwap(s.options);
    expect(result.order.exchangeNo).toBe("EX-original-order");
    expect(result.snapshot.orders[0].exchangeNo).toBe("EX-other-same-amount");
    expect(s.swap).not.toHaveBeenCalled(); expect(s.pending.list("synthetic")).toEqual([]);
  });

  it("finds persisted leases after reload with empty input, isolated by account", async () => {
    const s = setup(); s.pending.acquire(" Synthetic ", intent, []); s.pending.acquire("another-user", intent, []);
    const reloaded = createExchangePendingMutationStore(s.storage, () => { throw new Error("Recovery must not create a key"); });
    const leases = reloaded.list("synthetic"); expect(leases).toHaveLength(1);
    s.recover.mockResolvedValue({ status: "SUCCEEDED", order });
    await recoverExchangeSwap({ ...s.options, pending: reloaded, lease: leases[0] });
    expect(s.swap).not.toHaveBeenCalled(); expect(reloaded.list("synthetic")).toEqual([]);
    expect(reloaded.list("another-user")).toHaveLength(1);
  });

  it("retains the key when account, runtime or page scope changes during receipt read", async () => {
    const s = setup(); const lease = s.pending.acquire("synthetic", intent, []);
    s.recover.mockImplementation(async () => { s.isCurrent.mockReturnValue(false); return { status: "SUCCEEDED", order }; });
    await expect(recoverExchangeSwap({ ...s.options, lease })).rejects.toBeInstanceOf(ExchangeOutcomeUnknownError);
    expect(s.fetchState).not.toHaveBeenCalled(); expect(s.pending.list("synthetic")).toHaveLength(1);
  });

  it("retains the key when scope changes during the following wallet read", async () => {
    const s = setup(); const lease = s.pending.acquire("synthetic", intent, []);
    s.recover.mockResolvedValue({ status: "SUCCEEDED", order });
    s.fetchState.mockImplementation(async () => { s.isCurrent.mockReturnValue(false); return { orders: [] }; });
    await expect(recoverExchangeSwap({ ...s.options, lease })).rejects.toBeInstanceOf(ExchangeOutcomeUnknownError);
    expect(s.pending.list("synthetic")).toHaveLength(1);
  });

  it.each(["receipt", "wallet"])("retains original key when %s read fails", async stage => {
    const s = setup(); const lease = s.pending.acquire("synthetic", intent, []);
    s.recover.mockResolvedValue({ status: "SUCCEEDED", order });
    if (stage === "receipt") s.recover.mockRejectedValue(new Error("offline"));
    else s.fetchState.mockRejectedValue(new Error("offline"));
    await expect(recoverExchangeSwap({ ...s.options, lease })).rejects.toBeInstanceOf(ExchangeOutcomeUnknownError);
    expect(s.pending.list("synthetic")).toHaveLength(1);
  });

  it("rejects an incompatible receipt and leaves its lease intact", async () => {
    const s = setup(); s.recover.mockResolvedValue({ status: "SUCCEEDED", order: { ...order, fromAmount: 11 } });
    await expect(executeExchangeSwap(s.options)).rejects.toBeInstanceOf(ExchangeOutcomeUnknownError);
    expect(s.pending.list("synthetic")).toHaveLength(1);
  });
});
