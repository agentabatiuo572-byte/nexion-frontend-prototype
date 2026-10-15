import { describe, expect, it, vi } from "vitest";
import { createRepurchaseApi } from "./repurchase-api";
import type { ApiClient } from "./api-client";

const response = (status: unknown) => ({ status, repurchaseCommandProtocol: 1, sourceEnvironment: "PRODUCTION", runId: "" });

describe("repurchase status read", () => {
  it.each(["SUCCEEDED", "FAILED", "PROCESSING", "UNKNOWN", "NOT_FOUND", "MISMATCH"])("reads %s using only authenticated GET and an existing key header", async (status) => {
    const request = vi.fn().mockResolvedValue(response(status));
    await expect(createRepurchaseApi({ request } as unknown as ApiClient).openStatus(100, "original-key")).resolves.toBe(status);
    expect(request).toHaveBeenCalledExactlyOnceWith({ method: "GET", authenticated: true,
      path: "/api/repurchase/orders/open-status?amountUsdt=100", idempotencyKey: "original-key" });
  });

  it.each([{}, response("PENDING"), response({ toString: () => "FAILED" }),
    { ...response("FAILED"), repurchaseCommandProtocol: 2 },
    { ...response("FAILED"), sourceEnvironment: "SANDBOX" },
    { ...response("SUCCEEDED"), runId: "other-run" }])("rejects an invalid or foreign projection", async (value) => {
    const request = vi.fn().mockResolvedValue(value);
    await expect(createRepurchaseApi({ request } as unknown as ApiClient).openStatus(100, "original-key")).rejects.toThrow("REPURCHASE_RESPONSE_INVALID");
  });

  it.each([100000000000.1, 999999999999.9, 0.000001, 100.0000001])("keeps status amount %s identical to the original POST JSON number", async (amountUsdt) => {
    const request = vi.fn().mockRejectedValueOnce(new Error("capture-only")).mockResolvedValue(response("FAILED"));
    const api = createRepurchaseApi({ request } as unknown as ApiClient);
    await expect(api.open(amountUsdt, "original-key")).rejects.toThrow("capture-only");
    await expect(api.openStatus(amountUsdt, "original-key")).resolves.toBe("FAILED");
    const [post, query] = request.mock.calls.map(([options]) => options);
    expect(post).toMatchObject({ method: "POST", body: { amountUsdt }, idempotencyKey: "original-key" });
    expect(query).toMatchObject({ method: "GET", authenticated: true, idempotencyKey: "original-key" });
    expect(new URLSearchParams(query.path.split("?")[1]).get("amountUsdt")).toBe(JSON.stringify(post.body.amountUsdt));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("preserves a read failure and never dispatches malformed amount/key", async () => {
    const request = vi.fn().mockRejectedValue(new Error("offline"));
    const api = createRepurchaseApi({ request } as unknown as ApiClient);
    await expect(api.openStatus(100, "original-key")).rejects.toThrow("offline");
    request.mockClear();
    for (const amount of [NaN, Infinity, 0, -1]) await expect(api.openStatus(amount, "original-key")).rejects.toThrow();
    await expect(api.openStatus(100, "")).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
