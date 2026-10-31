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

  it.each(["CREGIS_DEPOSIT_ACCOUNT_NOT_OPEN", "CREGIS_DEPOSIT_PAUSED", "UNKNOWN_REASON"])("preserves unavailable reason %s", async reason => {
    const response = { enabled: false, network: "BEP20", reason };
    const api = createCregisDepositApi({ request: vi.fn().mockResolvedValue(response) } as unknown as ApiClient);
    await expect(api.address()).resolves.toEqual(response);
  });

  it.each([null, false, 1])("rejects malformed unavailable reason %s", async reason => {
    const api = createCregisDepositApi({ request: vi.fn().mockResolvedValue({ enabled: false, network: "BEP20", reason }) } as unknown as ApiClient);
    await expect(api.address()).rejects.toThrow("CREGIS_ADDRESS_INVALID");
  });

  it("accepts all current states together and preserves historical credit", async () => {
    const statuses: CregisDeposit["status"][] = ["CONFIRMING", "CREDITED", "DUST_HOLD", "REVIEW_HOLD",
      "REORG_INVESTIGATING", "PROVIDER_CONFLICT_HOLD", "REFUNDED", "REORG_REVERSED"];
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


it.each([15, 20, null, undefined])("accepts per-deposit confirmation requirement %s", async requiredConfirmations => {
  const row = { ...deposit, status: "CONFIRMING", requiredConfirmations };
  const api = createCregisDepositApi({ request: vi.fn().mockResolvedValue([row]) } as unknown as ApiClient);
  await expect(api.list()).resolves.toEqual([row]);
});

it.each([14, 15.5, -1, "15", true])("rejects invalid per-deposit confirmation requirement %s", async requiredConfirmations => {
  const api = createCregisDepositApi({ request: vi.fn().mockResolvedValue([{ ...deposit, status: "CONFIRMING", requiredConfirmations }]) } as unknown as ApiClient);
  await expect(api.list()).rejects.toThrow("CREGIS_DEPOSITS_INVALID");
});


it("retains precise string amounts and rejects malformed exact fields", async () => {
  const request = vi.fn().mockResolvedValue({ ...address, feeUsdt: 999999999999, feeUsdtExact: "999999999999.000001", minDepositUsdtExact: "0.000001" });
  const api = createCregisDepositApi({ request } as unknown as ApiClient);
  await expect(api.address()).resolves.toMatchObject({ feeUsdtExact: "999999999999.000001", minDepositUsdtExact: "0.000001" });
  request.mockResolvedValueOnce([{ ...deposit, status: "CREDITED", grossAmountUsdtExact: "999999999999.000001", creditedUsdtExact: "0.004999" }]);
  await expect(api.list()).resolves.toMatchObject([{ grossAmountUsdtExact: "999999999999.000001", creditedUsdtExact: "0.004999" }]);
  request.mockResolvedValueOnce([{ ...deposit, status: "CREDITED", creditedUsdtExact: "1.0000001" }]);
  await expect(api.list()).rejects.toThrow("CREGIS_DEPOSITS_INVALID");
});


it("requests ERC20 explicitly and rejects a BEP20 response instead of reusing its EVM address", async () => {
  const request = vi.fn().mockResolvedValueOnce({ ...address, network: "ERC20" }).mockResolvedValueOnce(address);
  const api = createCregisDepositApi({ request } as unknown as ApiClient);
  await expect(api.address("ERC20")).resolves.toMatchObject({ network: "ERC20" });
  expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/deposits/address?network=ERC20" });
  await expect(api.address("ERC20")).rejects.toThrow("CREGIS_ADDRESS_INVALID");
  request.mockResolvedValueOnce([{ ...deposit, network: "ERC20", status: "CREDITED" }]);
  await expect(api.list()).resolves.toMatchObject([{ network: "ERC20" }]);
  request.mockResolvedValueOnce([{ ...deposit, network: "TRC20", status: "CREDITED" }]);
  await expect(api.list()).rejects.toThrow("CREGIS_DEPOSITS_INVALID");
});


it.each([{ txHash: [deposit.txHash] }, { address: [deposit.address] }, { status: ["CREDITED"] }])("rejects JSON array coercion in a deposit record %j", patch => {
  const api = createCregisDepositApi({ request: vi.fn().mockResolvedValue([{ ...deposit, status: "CREDITED", ...patch }]) } as unknown as ApiClient);
  return expect(api.list()).rejects.toThrow("CREGIS_DEPOSITS_INVALID");
});
