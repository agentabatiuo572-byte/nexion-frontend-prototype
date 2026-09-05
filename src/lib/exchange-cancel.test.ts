import { describe, expect, it } from "vitest";
import {
  acquireExchangeCancelCommand,
  exchangeOrderCanCancel,
  isCurrentExchangeCancelScope,
  visibleQueuedExchangeOrders,
  type ExchangeCancelStorage,
} from "./exchange-cancel";

function storage(): ExchangeCancelStorage {
  let value: unknown;
  return {
    read: () => value,
    write: (next) => { value = next; },
  };
}

describe("exchange cancellation contract", () => {
  it("keeps queued orders visible for a row-level cancellation action", () => {
    const rows = visibleQueuedExchangeOrders([
      { exchangeNo: "EX-QUEUED", status: "QUEUED" },
      { exchangeNo: "EX-DONE", status: "COMPLETED" },
    ]);
    expect(rows.map((row) => row.exchangeNo)).toEqual(["EX-QUEUED"]);
  });

  it("only exposes cancellation for a visible queued order", () => {
    expect(exchangeOrderCanCancel({ status: "QUEUED" })).toBe(true);
    expect(exchangeOrderCanCancel({ status: "COMPLETED" })).toBe(false);
    expect(exchangeOrderCanCancel({ status: "CANCELLED" })).toBe(false);
    expect(exchangeOrderCanCancel({ status: "PROCESSING" })).toBe(false);
  });

  it("reuses one account-scoped command key across repeated clicks", () => {
    const store = storage();
    const first = acquireExchangeCancelCommand(store, "User-A", "EX-12345678", () => "fixed-key");
    const second = acquireExchangeCancelCommand(store, "user-a", "EX-12345678", () => "different-key");
    expect(first).toBe("fixed-key");
    expect(second).toBe(first);
  });

  it("does not accept a late response after account generation changes", () => {
    const scope = { accountKey: "user-a", epoch: 4 };
    expect(isCurrentExchangeCancelScope(scope, { accountKey: "user-a", epoch: 4 })).toBe(true);
    expect(isCurrentExchangeCancelScope(scope, { accountKey: "user-a", epoch: 5 })).toBe(false);
    expect(isCurrentExchangeCancelScope(scope, { accountKey: "user-b", epoch: 4 })).toBe(false);
  });
});
