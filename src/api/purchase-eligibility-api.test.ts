import { expect, test } from "vitest";
import { createPurchaseEligibilityApi } from "./purchase-eligibility-api";

test("reads authenticated server eligibility for the exact product", async () => {
  let request: any;
  const api = createPurchaseEligibilityApi({ request: async (value: any) => {
    request = value;
    return {
      productNo: "stellarbox-pro-v2", eligible: false, decisionCode: "PURCHASE_GATE_NOT_MET",
      evaluatedAt: 1786856400000, source: "nx_admin_device_sku.purchase_gate_json + nx_user",
    };
  }} as never);

  await expect(api.get("stellarbox-pro-v2")).resolves.toMatchObject({ eligible: false });
  expect(request.path).toBe("/api/store/purchase-eligibility?productNo=stellarbox-pro-v2");
});

test("fails closed on a mismatched or untrusted eligibility response", async () => {
  const api = createPurchaseEligibilityApi({ request: async () => ({
    productNo: "other", eligible: true, decisionCode: "ELIGIBLE", evaluatedAt: Date.now(), source: "client",
  }) } as never);
  await expect(api.get("stellarbox-pro-v2")).rejects.toThrow("PURCHASE_ELIGIBILITY_RESPONSE_INVALID");
});
