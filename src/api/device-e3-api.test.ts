import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createDeviceE3Api } from "./device-e3-api";

function client(payload: unknown): ApiClient {
  return {
    request: vi.fn().mockResolvedValue(payload),
    upload: vi.fn(),
    refreshSession: vi.fn(),
  } as unknown as ApiClient;
}

describe("device E3 eligibility API", () => {
  it("requests server eligibility and accepts only a complete server source projection", async () => {
    const request = vi.fn().mockResolvedValue({
      enabled: true,
      eligible: true,
      decisionCode: "ELIGIBLE",
      targetProductId: 22,
      targetProductNo: "stellarbox-pro-v2",
      targetProductName: "NexionBox Pro v2",
      targetPriceUsdt: 1500,
      requireHigherPrice: true,
      maxDevicesPerOrder: 3,
      sources: [{ sourceDeviceId: 11, sourceProductName: "Old", eligible: true, reasonCode: "OK" }],
      decisionSource: "server",
    });

    const api = createDeviceE3Api({ request } as unknown as ApiClient);
    await expect(api.eligibility("stellarbox-pro-v2")).resolves.toMatchObject({
      eligible: true,
      decisionCode: "ELIGIBLE",
      sources: [{ sourceDeviceId: 11, eligible: true, reasonCode: "OK" }],
    });
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/app/trade-in/eligibility",
      body: { targetProductNo: "stellarbox-pro-v2" },
    });
  });

  it("rejects local or incomplete eligibility projections", async () => {
    const api = createDeviceE3Api(client({
      enabled: true,
      eligible: true,
      decisionCode: "ELIGIBLE",
      targetProductId: 22,
      targetProductNo: "stellarbox-pro-v2",
      targetProductName: "NexionBox Pro v2",
      targetPriceUsdt: 1500,
      requireHigherPrice: true,
      maxDevicesPerOrder: 3,
      sources: [{ sourceDeviceId: 11, sourceProductName: "Old", eligible: true, reasonCode: "OK" }],
      decisionSource: "local",
    }));

    await expect(api.eligibility("stellarbox-pro-v2")).rejects.toMatchObject({
      message: "TRADEIN_ELIGIBILITY_RESPONSE_INVALID",
    });
  });

  it("rejects an eligible response containing an ineligible source", async () => {
    const api = createDeviceE3Api(client({
      enabled: true,
      eligible: true,
      decisionCode: "ELIGIBLE",
      targetProductId: 22,
      targetProductNo: "stellarbox-pro-v2",
      targetProductName: "NexionBox Pro v2",
      targetPriceUsdt: 1500,
      requireHigherPrice: true,
      maxDevicesPerOrder: 3,
      sources: [{ sourceDeviceId: 11, sourceProductName: "Old", eligible: false, reasonCode: "OK" }],
      decisionSource: "server",
    }));

    await expect(api.eligibility("stellarbox-pro-v2")).rejects.toMatchObject({
      message: "TRADEIN_ELIGIBILITY_RESPONSE_INVALID",
    });
  });

  it("rejects an unknown source reason code", async () => {
    const api = createDeviceE3Api(client({
      enabled: true,
      eligible: false,
      decisionCode: "NO_ELIGIBLE_SOURCE",
      targetProductId: 22,
      targetProductNo: "stellarbox-pro-v2",
      targetProductName: "NexionBox Pro v2",
      targetPriceUsdt: 1500,
      requireHigherPrice: true,
      maxDevicesPerOrder: 3,
      sources: [{ sourceDeviceId: 11, sourceProductName: "Old", eligible: false, reasonCode: "CLIENT_GUESSED" }],
      decisionSource: "server",
    }));

    await expect(api.eligibility("stellarbox-pro-v2")).rejects.toMatchObject({
      message: "TRADEIN_ELIGIBILITY_RESPONSE_INVALID",
    });
  });
});
