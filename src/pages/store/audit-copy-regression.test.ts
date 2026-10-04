import { describe, expect, it } from "vitest";
import detail from "./detail.vue?raw";
import checkout from "./checkout.vue?raw";
import tasks from "@/components/earn/task-center.vue?raw";
import receipts from "@/pages/me/receipts.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";

describe("audit copy semantics", () => {
  it.each([en, zh, vi])("separates read failures from settlement and labels calculator quantity", (messages) => {
    const wallet = messages.wallet as any;
    const store = messages.store as any;
    for (const key of ["assignmentsUnavailableTitle", "assignmentsUnavailableBody", "receiptsUnavailableTitle", "receiptsUnavailableBody"]) {
      expect(wallet[key]).toBeTruthy();
      expect(wallet[key]).not.toBe(wallet.syncFailedBody);
    }
    expect(store.detQuantityHint).toBeTruthy();
  });
  it("uses context-specific copy without removing the ROI calculator or changing single-item orders", () => {
    expect(tasks).toContain("t.wallet.assignmentsUnavailableBody");
    expect(tasks).not.toContain("wallet.syncFailed");
    expect(receipts).toContain("wallet.receiptsUnavailableBody");
    expect(receipts).not.toContain("wallet.syncFailed");
    expect(detail).toContain("t.store.detQuantityHint");
    expect(detail).toContain("qty.value");
    expect(checkout).toContain("quantity: 1");
  });
});
