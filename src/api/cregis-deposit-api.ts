import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface CregisAddress {
  enabled: boolean;
  creditEnabled?: boolean;
  network: "BEP20";
  address?: string;
  confirmations?: number;
  feeUsdt?: number;
  minDepositUsdt?: number;
}

export interface CregisDeposit {
  depositId: string;
  txHash: string;
  address: string;
  grossAmountUsdt: number;
  creditedUsdt: number;
  confirmations: number;
  status: "CONFIRMING" | "CREDITED" | "DUST_HOLD" | "REVIEW_HOLD"
    | "REORG_INVESTIGATING" | "PROVIDER_CONFLICT_HOLD";
  createdAt: number;
  creditedAt?: number | null;
}

export function createCregisDepositApi(client: ApiClient) {
  return {
    async address(): Promise<CregisAddress> {
      const value = await client.request<CregisAddress>({
        method: "GET", path: "/api/deposits/address?network=BEP20",
      });
      if (!value || value.network !== "BEP20" || typeof value.enabled !== "boolean"
          || (value.creditEnabled !== undefined && typeof value.creditEnabled !== "boolean")
          || (value.enabled && (typeof value.address !== "string"
              || !/^0x[0-9a-f]{40}$/i.test(value.address)
              || typeof value.confirmations !== "number"
              || !Number.isInteger(value.confirmations) || value.confirmations < 15
              || typeof value.feeUsdt !== "number" || value.feeUsdt < 0
              || typeof value.minDepositUsdt !== "number" || value.minDepositUsdt <= 0))) {
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
          || typeof row.grossAmountUsdt !== "number" || row.grossAmountUsdt <= 0
          || typeof row.creditedUsdt !== "number" || row.creditedUsdt < 0
          || !Number.isInteger(row.confirmations) || row.confirmations < 0
          || typeof row.createdAt !== "number" || !Number.isFinite(row.createdAt)
          || !["CONFIRMING", "CREDITED", "DUST_HOLD", "REVIEW_HOLD",
            "REORG_INVESTIGATING", "PROVIDER_CONFLICT_HOLD"].includes(String(row.status)))) {
        throw new ApiError({ kind: "protocol", message: "CREGIS_DEPOSITS_INVALID" });
      }
      return rows as CregisDeposit[];
    },
  };
}
