import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createCregisDepositApi } from "./cregis-deposit-api";

describe("Cregis deposit API", () => {
  it("accepts only a server-issued BEP20 address", async () => {
    const request = vi.fn().mockResolvedValue({
      enabled: true, network: "BEP20", address: "0x" + "a".repeat(40),
      confirmations: 15, feeUsdt: 1, minDepositUsdt: 10,
    });
    const api = createCregisDepositApi({ request } as unknown as ApiClient);
    await expect(api.address()).resolves.toMatchObject({ address: "0x" + "a".repeat(40) });
    request.mockResolvedValueOnce({ enabled: true, network: "BEP20", address: "fake" });
    await expect(api.address()).rejects.toThrow("CREGIS_ADDRESS_INVALID");
    expect(request).toHaveBeenCalledWith({
      method: "GET", path: "/api/deposits/address?network=BEP20",
    });
  });
});
