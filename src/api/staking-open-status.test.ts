import { describe, expect, it, vi } from "vitest";
import { createStakingApi } from "./staking-api";

describe("G1 original open status GET", () => {
  it.each(["SUCCEEDED", "FAILED", "PROCESSING", "UNKNOWN", "NOT_FOUND", "MISMATCH"])("reads %s using the original key/payload only", async (status) => {
    const request = vi.fn().mockResolvedValue({ status, stakingCommandProtocol: 1, sourceEnvironment: "PRODUCTION", runId: "" });
    const api = createStakingApi({ request } as never);
    expect(await api.openStatus("usdt30d", 20, "private-original-key")).toBe(status);
    expect(request).toHaveBeenCalledExactlyOnceWith({ method: "GET", path: "/api/stakes/open-status?tierKey=usdt30d&amountUsdt=20",
      idempotencyKey: "private-original-key", timeoutMs: 30_000 });
  });
  it.each([null, {}, { status: "FAILED" }, { status: ["FAILED"], stakingCommandProtocol: 1, sourceEnvironment: "PRODUCTION", runId: "" },
    { status: "INVALID", stakingCommandProtocol: 1, sourceEnvironment: "PRODUCTION", runId: "" },
    { status: "FAILED", stakingCommandProtocol: 1, sourceEnvironment: "SANDBOX", runId: "" },
    { status: "FAILED", stakingCommandProtocol: 1, sourceEnvironment: "PRODUCTION", runId: "acceptance" }])("rejects unqualified status responses", async (response) => {
    const request = vi.fn().mockResolvedValue(response);
    await expect(createStakingApi({ request } as never).openStatus("usdt30d", 20, "key")).rejects.toThrow("STAKING_OPEN_STATUS_INVALID");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
