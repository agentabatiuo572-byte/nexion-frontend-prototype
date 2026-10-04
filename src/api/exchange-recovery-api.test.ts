import { describe, expect, it, vi } from "vitest";
import { createExchangeApi } from "./exchange-api";
import type { ApiClient } from "./api-client";

const order = { exchangeNo: "EX-original-12345678", fromAsset: "NEX", toAsset: "USDT", fromAmount: 10,
  toAmount: 1, rate: 0.1, status: "CANCELLED" };
const payload = { status: "SUCCEEDED", order, sourceEnvironment: "PRODUCTION", runId: "" };
function setup(response: unknown) {
  const request = vi.fn().mockResolvedValue(response);
  return { request, api: createExchangeApi({ request } as unknown as ApiClient) };
}
describe("exact exchange recovery API", () => {
  it("queries the original command using GET and a header, with no user or run override", async () => {
    const s = setup(payload);
    await expect(s.api.recover("NEX_TO_USDT", 10, true, "original-key")).resolves.toMatchObject(payload);
    expect(s.request).toHaveBeenCalledExactlyOnceWith({ method: "GET",
      path: "/api/exchange/recovery?direction=NEX_TO_USDT&fromAmount=10&queueIfCapped=true", idempotencyKey: "original-key" });
  });
  it.each(["FAILED", "PROCESSING", "UNKNOWN", "NOT_FOUND", "MISMATCH"])("accepts %s without an order", async status => {
    await expect(setup({ status, sourceEnvironment: "PRODUCTION", runId: "" }).api.recover("NEX_TO_USDT", 10, true, "key"))
      .resolves.toMatchObject({ status, order: undefined });
  });
  it.each([
    { ...payload, sourceEnvironment: "SANDBOX", runId: "other-run" }, { ...payload, runId: "other-run" },
    { ...payload, sourceEnvironment: undefined }, { ...payload, status: "NEW_STATUS" },
    { ...payload, status: "MISMATCH" }, { ...payload, order: undefined },
    { ...payload, order: { ...order, exchangeNo: "wrong" } },
  ])("rejects invalid provenance, state or order %#", async response => {
    await expect(setup(response).api.recover("NEX_TO_USDT", 10, true, "key")).rejects.toMatchObject({ kind: "protocol" });
  });
});
