import { describe, expect, it } from "vitest";
import { presentVietQrReceipt } from "./vietqr-receipt-presentation";

describe("presentVietQrReceipt", () => {
  it("shows a positive amount only for an authoritative credited receipt", () => {
    expect(presentVietQrReceipt("CREDITED", 25)).toEqual({
      statusKey: "credited",
      amountText: "+$25.00",
      credited: true,
    });
  });

  it.each([
    ["OPEN", "review"],
    ["RETURN_PENDING", "returnPending"],
    ["RETURNED", "returned"],
    ["CANCELLED", "cancelled"],
    ["unexpected_server_status", "unknown"],
  ] as const)("does not claim funds were credited for %s", (status, statusKey) => {
    expect(presentVietQrReceipt(status, 25)).toEqual({
      statusKey,
      amountText: "—",
      credited: false,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])("fails closed for malformed credited amount %s", (amount) => {
    expect(presentVietQrReceipt("CREDITED", amount)).toEqual({
      statusKey: "unknown",
      amountText: "—",
      credited: false,
    });
  });

  it("preserves the server status for a historical zero-amount credited row", () => {
    expect(presentVietQrReceipt("CREDITED", 0)).toEqual({
      statusKey: "credited", amountText: "+$0.00", credited: true,
    });
  });

  it("keeps the existing two-decimal UI format without changing the source amount", () => {
    const amount = 10.123456;
    expect(presentVietQrReceipt("CREDITED", amount).amountText).toBe("+$10.12");
    expect(amount).toBe(10.123456);
  });
});
