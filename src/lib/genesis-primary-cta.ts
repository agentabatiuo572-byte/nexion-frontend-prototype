import type { GenesisPurchaseBlock } from "@/store/genesis-config";

export interface GenesisPrimaryCtaInput {
  block: GenesisPurchaseBlock;
  blockedText: string | null;
  soldOut: string;
  comingSoon: string;
  reserve: string;
}

/**
 * The primary-sale dock advertises the sale action, not the account's current
 * qualification state. Qualification remains enforced when the user clicks:
 * an ineligible account is routed to the qualification sheet and the backend
 * still authorizes the purchase. This keeps the 5173 copy aligned with 5174
 * without weakening the purchase gate.
 */
export function resolveGenesisPrimaryCta(input: GenesisPrimaryCtaInput): string {
  if (input.blockedText !== null) return input.blockedText;
  if (input.block === "soldOut") return input.soldOut;
  if (input.block === "preSale") return input.comingSoon;
  return input.reserve;
}

export function showGenesisPrimaryPrice(block: GenesisPurchaseBlock): boolean {
  return block === null;
}

export interface GenesisEligibilityCardCopy {
  policyRejected: string;
  policyManaged: string;
  serviceUnavailable: string;
  policyUnavailable: string;
}

/** Keep transport/isolation failures distinct from a genuine policy rejection. */
export function resolveGenesisEligibilityCardCopy(
  reasons: readonly string[],
  copy: GenesisEligibilityCardCopy,
): { line: string; meta: string } {
  if (reasons.includes("GENESIS_ELIGIBILITY_UNAVAILABLE")) {
    return { line: copy.serviceUnavailable, meta: "" };
  }
  if (reasons.includes("SALE_POLICY_UNAVAILABLE")) {
    return { line: copy.policyUnavailable, meta: "" };
  }
  return { line: copy.policyRejected, meta: copy.policyManaged };
}
