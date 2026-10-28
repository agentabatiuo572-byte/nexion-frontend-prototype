import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface CregisAddress {
  enabled: boolean;
  creditEnabled?: boolean;
  reason?: string;
  network: "BEP20";
  address?: string;
  confirmations?: number;
  feeUsdt?: number;
  feeUsdtExact?: string;
  minDepositUsdt?: number;
  minDepositUsdtExact?: string;
}

export interface CregisDeposit {
  depositId: string;
  txHash: string;
  address: string;
  grossAmountUsdt: number;
  grossAmountUsdtExact?: string;
  creditedUsdt: number;
  creditedUsdtExact?: string;
  confirmations: number;
  requiredConfirmations?: number | null;
  status: "CONFIRMING" | "CREDITED" | "DUST_HOLD" | "REVIEW_HOLD"
    | "REORG_INVESTIGATING" | "PROVIDER_CONFLICT_HOLD" | "REFUNDED" | "REORG_REVERSED";
  createdAt: number;
  creditedAt?: number | null;
}

export function exactDepositAmount(value: number, exact?: string): string | null {
  if (exact !== undefined) return typeof exact === "string" && /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(exact) ? exact : null;
  return Number.isFinite(value) && value >= 0 && value < 2 ** 32 && Number(value.toFixed(6)) === value ? String(value) : null;
}

export function createCregisDepositApi(client: ApiClient) {
  return {
    async address(): Promise<CregisAddress> {
      const value = await client.request<CregisAddress>({
        method: "GET", path: "/api/deposits/address?network=BEP20",
      });
      if (!value || value.network !== "BEP20" || typeof value.enabled !== "boolean"
          || (value.creditEnabled !== undefined && typeof value.creditEnabled !== "boolean")
          || (value.reason !== undefined && typeof value.reason !== "string")
          || (value.enabled && (typeof value.address !== "string"
              || !/^0x[0-9a-f]{40}$/i.test(value.address)
              || typeof value.confirmations !== "number"
              || !Number.isInteger(value.confirmations) || value.confirmations < 15
              || typeof value.feeUsdt !== "number" || !Number.isFinite(value.feeUsdt) || value.feeUsdt < 0
              || (value.feeUsdtExact !== undefined && exactDepositAmount(value.feeUsdt, value.feeUsdtExact) === null)
              || typeof value.minDepositUsdt !== "number" || !Number.isFinite(value.minDepositUsdt) || value.minDepositUsdt <= 0
              || (value.minDepositUsdtExact !== undefined && (exactDepositAmount(value.minDepositUsdt, value.minDepositUsdtExact) === null || Number(value.minDepositUsdtExact) <= 0))))) {
        throw new ApiError({ kind: "protocol", message: "CREGIS_ADDRESS_INVALID" });
      }
      return value;
    },
    async list(): Promise<CregisDeposit[]> {
      const rows = await client.request<unknown>({ method: "GET", path: "/api/deposits" });
      if (!Array.isArray(rows) || rows.some((row) => !row || typeof row !== "object"
          || typeof row.depositId !== "string" || !/^CR-[0-9]+$/.test(row.depositId)
          || !/^0x[0-9a-f]{64}$/i.test(String(row.txHash))
          || !/^0x[0-9a-f]{40}$/i.test(String(row.address))
          || typeof row.grossAmountUsdt !== "number" || !Number.isFinite(row.grossAmountUsdt) || row.grossAmountUsdt <= 0
          || (row.grossAmountUsdtExact !== undefined && (exactDepositAmount(row.grossAmountUsdt, row.grossAmountUsdtExact) === null || Number(row.grossAmountUsdtExact) <= 0))
          || typeof row.creditedUsdt !== "number" || !Number.isFinite(row.creditedUsdt) || row.creditedUsdt < 0
          || (row.creditedUsdtExact !== undefined && exactDepositAmount(row.creditedUsdt, row.creditedUsdtExact) === null)
          || !Number.isInteger(row.confirmations) || row.confirmations < 0
          || (row.requiredConfirmations != null && (!Number.isSafeInteger(row.requiredConfirmations) || row.requiredConfirmations < 15))
          || typeof row.createdAt !== "number" || !Number.isFinite(row.createdAt)
          || !["CONFIRMING", "CREDITED", "DUST_HOLD", "REVIEW_HOLD",
            "REORG_INVESTIGATING", "PROVIDER_CONFLICT_HOLD", "REFUNDED", "REORG_REVERSED"].includes(String(row.status)))) {
        throw new ApiError({ kind: "protocol", message: "CREGIS_DEPOSITS_INVALID" });
      }
      return rows as CregisDeposit[];
    },
  };
}
