import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createCregisDepositApi, type CregisDeposit } from "./cregis-deposit-api";

const address = {
  enabled: true, network: "BEP20", address: "0x" + "a".repeat(40),
  confirmations: 15, feeUsdt: 1, minDepositUsdt: 10,
};
const deposit = {
  depositId: "CR-1", txHash: "0x" + "b".repeat(64), address: address.address,
  grossAmountUsdt: 10, creditedUsdt: 9, confirmations: 15,
  createdAt: 1_759_536_000_000, creditedAt: 1_759_536_060_000,
};

describe("Cregis deposit API", () => {
  it("accepts only a server-issued BEP20 address", async () => {
    const request = vi.fn().mockResolvedValue(address);
    const api = createCregisDepositApi({ request } as unknown as ApiClient);
    await expect(api.address()).resolves.toMatchObject({ address: "0x" + "a".repeat(40) });
    request.mockResolvedValueOnce({ enabled: true, network: "BEP20", address: "fake" });
    await expect(api.address()).rejects.toThrow("CREGIS_ADDRESS_INVALID");
    expect(request).toHaveBeenCalledWith({
      method: "GET", path: "/api/deposits/address?network=BEP20",
    });
  });

  it.each([true, false, undefined])("accepts credit capability %s, including old deployments", async (creditEnabled) => {
    const response = creditEnabled === undefined ? address : { ...address, creditEnabled };
    const api = createCregisDepositApi({ request: vi.fn().mockResolvedValue(response) } as unknown as ApiClient);
    await expect(api.address()).resolves.toEqual(response);
  });

  it.each(["false", null, 0])("rejects an invalid credit capability %s", async (creditEnabled) => {
    const api = createCregisDepositApi({ request: vi.fn().mockResolvedValue({ ...address, creditEnabled }) } as unknown as ApiClient);
    await expect(api.address()).rejects.toThrow("CREGIS_ADDRESS_INVALID");
  });

  it("accepts a disabled address without payment details", async () => {
    const response = { enabled: false, creditEnabled: false, network: "BEP20" };
    const api = createCregisDepositApi({ request: vi.fn().mockResolvedValue(response) } as unknown as ApiClient);
    await expect(api.address()).resolves.toEqual(response);
  });

  it("accepts all six existing states together and preserves historical credit", async () => {
    const statuses: CregisDeposit["status"][] = ["CONFIRMING", "CREDITED", "DUST_HOLD", "REVIEW_HOLD",
      "REORG_INVESTIGATING", "PROVIDER_CONFLICT_HOLD"];
    const rows = statuses.map((status, index) => ({ ...deposit, depositId: `CR-${index + 1}`, status,
      creditedUsdt: ["CREDITED", "REORG_INVESTIGATING", "PROVIDER_CONFLICT_HOLD"].includes(status) ? 9 : 0 }));
    const request = vi.fn().mockResolvedValue(rows);
    const api = createCregisDepositApi({ request } as unknown as ApiClient);
    await expect(api.list()).resolves.toEqual(rows);
    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/deposits" });
  });

  it("still rejects an unknown status in a mixed list", async () => {
    const api = createCregisDepositApi({ request: vi.fn().mockResolvedValue([
      { ...deposit, status: "CREDITED" }, { ...deposit, depositId: "CR-2", status: "UNKNOWN" },
    ]) } as unknown as ApiClient);
    await expect(api.list()).rejects.toThrow("CREGIS_DEPOSITS_INVALID");
  });
});
