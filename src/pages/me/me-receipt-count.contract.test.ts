import { describe, expect, it } from "vitest";
import mePageSource from "./me.vue?raw";

describe("Me receipts entry", () => {
  it("keeps the entry point without issuing a receipt-list request solely to render a badge", () => {
    expect(mePageSource).toContain('href: "/me/receipts"');
    expect(mePageSource).not.toContain("taskAssignmentApi.receipts(");
    expect(mePageSource).not.toContain("remoteComputeReceiptTotal");
    expect(mePageSource).not.toContain('["receipts",');
  });

  it("does not present a preview or unavailable value as a receipt total", () => {
    expect(mePageSource).not.toContain("receiptCountMeta");
    expect(mePageSource).not.toContain("countRemoteComputeReceipts(app.visibleDevices)");
  });
});
