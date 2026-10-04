import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import {
  createExchangePendingMutationStore, executeExchangeSwap, ExchangeOutcomeUnknownError,
  type PersistedExchangePending, type ExchangeSwapIntent,
} from "@/lib/exchange-pending-mutation";

const intent: ExchangeSwapIntent = { direction: "NEX_TO_USDT", fromAmount: 10, queueIfCapped: true };
function setup() {
  let stored: PersistedExchangePending | null = null;
  let serial = 0;
  const pending = createExchangePendingMutationStore({
    read: () => stored,
    write: value => { stored = structuredClone(value); },
  }, () => `synthetic-key-${++serial}`);
  return { pending };
}

describe("exchange pending command outcome classification", () => {
  it.each([408, 409, 425, 429, 500, 504])("retains the original key after an unresolved HTTP %s and reuses it on retry", async status => {
    const s = setup(), keys: string[] = [];
    let reads = 0;
    const run = () => executeExchangeSwap({
      isCurrent: () => true, recover: async () => { reads++; return { status: "UNKNOWN" }; },
      pending: s.pending, accountKey: "synthetic", intent, baseline: { orders: [] },
      swap: async key => { keys.push(key); throw new ApiError({ kind: "http", message: "GATEWAY_RESPONSE", status }); },
      fetchState: async () => { throw new Error("An unknown receipt cannot resolve from history"); },
    });
    await expect(run()).rejects.toBeInstanceOf(ExchangeOutcomeUnknownError);
    expect(s.pending.peek("synthetic", intent)?.key).toBe("synthetic-key-1");
    await expect(run()).rejects.toBeInstanceOf(ExchangeOutcomeUnknownError);
    expect(keys).toEqual(["synthetic-key-1"]);
    expect(reads).toBe(2);
  });

  it.each(["IDEMPOTENCY_REQUEST_IN_PROGRESS", "IDEMPOTENCY_RESULT_UNKNOWN", "SESSION_CHANGED_DURING_REQUEST"])("retains existing special business ambiguity: %s", async message => {
    const s = setup();
    await expect(executeExchangeSwap({
      isCurrent: () => true, recover: async () => ({ status: "UNKNOWN" }),
      pending: s.pending, accountKey: "synthetic", intent, baseline: { orders: [] },
      swap: async () => { throw new ApiError({ kind: "business", message }); },
      fetchState: async () => ({ orders: [] }),
    })).rejects.toBeInstanceOf(ExchangeOutcomeUnknownError);
    expect(s.pending.peek("synthetic", intent)?.key).toBe("synthetic-key-1");
  });

  it("treats a configuration error as ambiguous under the shared rule", async () => {
    const s = setup();
    await expect(executeExchangeSwap({
      isCurrent: () => true, recover: async () => ({ status: "UNKNOWN" }),
      pending: s.pending, accountKey: "synthetic", intent, baseline: { orders: [] },
      swap: async () => { throw new ApiError({ kind: "configuration", message: "CONFIG_UNKNOWN" }); },
      fetchState: async () => ({ orders: [] }),
    })).rejects.toBeInstanceOf(ExchangeOutcomeUnknownError);
    expect(s.pending.peek("synthetic", intent)?.key).toBe("synthetic-key-1");
  });

  it("still forgets a command explicitly rejected by the server", async () => {
    const s = setup(), rejected = new ApiError({ kind: "business", message: "MINIMUM_NOT_MET" });
    await expect(executeExchangeSwap({
      isCurrent: () => true, recover: async () => ({ status: "UNKNOWN" }),
      pending: s.pending, accountKey: "synthetic", intent, baseline: { orders: [] },
      swap: async () => { throw rejected; },
      fetchState: async () => { throw new Error("Must not query after a definite rejection"); },
    })).rejects.toBe(rejected);
    expect(s.pending.peek("synthetic", intent)).toBeNull();
  });

  it("recovers the exact receipt after an ambiguous response without another swap", async () => {
    const s = setup();
    let swaps = 0;
    const order = { exchangeNo: "synthetic-order", fromAsset: "NEX" as const, toAsset: "USDT" as const, fromAmount: 10, status: "COMPLETED" };
    const result = await executeExchangeSwap({
      isCurrent: () => true, recover: async () => ({ status: "SUCCEEDED", order }),
      pending: s.pending, accountKey: "synthetic", intent, baseline: { orders: [] },
      swap: async () => { swaps++; throw new ApiError({ kind: "http", status: 408, message: "GATEWAY_RESPONSE" }); },
      fetchState: async () => ({ orders: [order] }),
    });
    expect(result.order).toEqual(order); expect(result.recovered).toBe(true); expect(swaps).toBe(1);
    expect(s.pending.peek("synthetic", intent)).toBeNull();
  });
});
