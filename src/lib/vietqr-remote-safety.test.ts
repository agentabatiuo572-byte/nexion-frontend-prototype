import { describe, expect, it } from "vitest";
import type { VietQrReceiptSnapshot } from "@/api/payment-api";
import depositsCoreSource from "../store/deposits-core.ts?raw";
import {
  appendVietQrReceipts,
  buildVietQrTransferSteps,
  isPayableVietQrCreateStatus,
  remoteGenerationMatches,
} from "./vietqr-remote-safety";

const copy = {
  scan: "scan server QR",
  manual: (account: string, amount: string) => `transfer ${amount} to ${account}`,
  amount: "check amount and memo",
  complete: "finish transfer and wait",
};

describe("VietQR remote safety helpers", () => {
  it("uses an executable account-and-amount step when server QR payload is absent", () => {
    expect(buildVietQrTransferSteps(undefined, "9700", "659,750 VND", copy)).toEqual([
      "transfer 659,750 VND to 9700",
      "check amount and memo",
      "finish transfer and wait",
    ]);
    expect(buildVietQrTransferSteps("   ", "9700", "659,750 VND", copy)[0]).toContain("transfer");
  });

  it("keeps scan copy only for a non-empty server QR payload", () => {
    expect(buildVietQrTransferSteps("data:image/png;base64,server", "9700", "659,750 VND", copy)[0])
      .toBe("scan server QR");
  });

  it("requires both account key and generation for stale remote results", () => {
    expect(remoteGenerationMatches("user-a", 4, "user-a", 4)).toBe(true);
    expect(remoteGenerationMatches("user-a", 4, "user-a", 5)).toBe(false);
    expect(remoteGenerationMatches("user-a", 4, "user-b", 4)).toBe(false);
  });

  it("appends remote receipt pages without duplicating receipt numbers", () => {
    const receipt = (receiptNo: string): VietQrReceiptSnapshot => ({
      receiptNo,
      intentNo: `intent-${receiptNo}`,
      viewType: "MATCHED",
      status: "CREDITED",
      lockedFxRate: 26390,
      creditedUsdt: 25,
      createdAt: "2026-08-15T00:00:00Z",
    });
    expect(appendVietQrReceipts([receipt("r-1")], [receipt("r-1"), receipt("r-2")])
      .map((item) => item.receiptNo)).toEqual(["r-1", "r-2"]);
  });

  it("treats only an awaiting-payment create replay as a usable new bank order", () => {
    expect(isPayableVietQrCreateStatus("awaiting_payment")).toBe(true);
    for (const status of [
      "credited", "expired", "cancelled", "receipt_review", "mismatch_review",
      "late_review", "return_pending", "returned",
    ] as const) {
      expect(isPayableVietQrCreateStatus(status)).toBe(false);
    }
  });

  it("does not expose the removed fake QR generator to remote code", () => {
    expect(depositsCoreSource).not.toContain("qrDotMatrix");
  });
});
