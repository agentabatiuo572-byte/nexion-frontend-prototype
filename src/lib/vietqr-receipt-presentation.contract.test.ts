import { describe, expect, it } from "vitest";
import receiptsPageSource from "../pages/me/receipts.vue?raw";

describe("VietQR receipt presentation integration", () => {
  it("renders server status through the fail-closed presenter", () => {
    expect(receiptsPageSource).toContain('from "@/lib/vietqr-receipt-presentation"');
    expect(receiptsPageSource).toContain("remoteReceiptStatus(r)");
    expect(receiptsPageSource).toContain("remoteReceiptAmount(r)");
  });

  it("does not render every remote receipt as a positive wallet credit", () => {
    expect(receiptsPageSource).not.toContain("+${{ r.creditedUsdt.toFixed(2) }}");
  });
});
