import { hasVerifiedBankIdentity, type BankBeneficiary, type BankConfig, type BankOrder } from "@/api/bank-withdrawal-api";
import { parseServerTimestamp } from "@/api/server-time";

export function bankBeneficiaryReady(beneficiary: BankBeneficiary | null | undefined): boolean {
  return !!beneficiary && beneficiary.canWithdraw === true && hasVerifiedBankIdentity(beneficiary);
}

export function bankCanQuote(config: BankConfig | null): boolean {
  return config?.enabled === true && config.unresolvedIntent === null && bankBeneficiaryReady(config.beneficiary);
}

/** Display capacity never substitutes the D7 single-transaction limit with a wallet balance. */
export function bankMaximumAmount(config: BankConfig | null): number {
  const { policy, capacity } = config ?? {};
  if (!policy || !capacity || !capacity.withdrawalEnabled || capacity.dailyRemainingCount === 0) return 0;
  return Math.min(policy.maxAmountUsd, capacity.maxWithdrawableUsdt);
}

export type BankAmountError = "format" | "range" | "balance" | "daily" | "unavailable";
export function bankAmountError(value: string, config: BankConfig | null): BankAmountError | null {
  const { policy, capacity } = config ?? {};
  if (!policy || !capacity || !capacity.withdrawalEnabled) return "unavailable";
  if (capacity.dailyRemainingCount === 0) return "daily";
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized) || !Number.isFinite(Number(normalized)) || Number(normalized) <= 0) return "format";
  const amount = Number(normalized);
  if (amount < policy.minAmountUsd || amount > policy.maxAmountUsd) return "range";
  if (amount > capacity.maxWithdrawableUsdt) return "balance";
  return null;
}

export type BankAccountNotice = "ready" | "unavailable" | "unverified";
export function bankAccountNotice(beneficiary: BankBeneficiary): BankAccountNotice {
  if (!hasVerifiedBankIdentity(beneficiary)) return "unverified";
  return bankBeneficiaryReady(beneficiary) ? "ready" : "unavailable";
}

export function bankOrderOutcome(order: BankOrder): "paid" | "refunded" | "review" | "processing" | "held" {
  const e = order.settlementEvidence;
  if (order.providerState === "MANUAL_REVIEW" || e?.status === "review_required") return "held";
  const proven = !!e?.evidenceRef && parseServerTimestamp(e.checkedAt) != null
    && e.amountUsdt != null && e.amountUsdt > 0 && e.amountUsdt === order.bank.amountUsdt;
  if (proven && e?.status === "paid" && e.providerOrderId && e.providerStatus === 3
    && order.status === "CONFIRMED" && order.providerState === "PAID") return "paid";
  if (proven && e?.status === "refunded" && ["FAILED", "REFUNDED", "REVIEW_REJECTED"].includes(order.status)
    && order.providerState !== "PAID") return "refunded";
  if (["CONFIRMED", "FAILED", "REFUNDED", "REVIEW_REJECTED", "FROZEN", "TX_ORPHANED"].includes(order.status)
    || order.providerState === "PAID" || order.providerState === "FAILED") return "held";
  return ["PROCESSING", "SENT"].includes(order.status) ? "processing" : "review";
}
