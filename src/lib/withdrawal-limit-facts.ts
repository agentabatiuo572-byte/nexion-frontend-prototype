// Keep the page-facing import path stable while the derivation lives beside
// the single canonical daily counter used by withdrawal eligibility.
export {
  withdrawalLimitFacts,
  type WithdrawalLimitFacts,
  type WithdrawalLimitFactsInput,
} from "@/store/withdrawal-eligibility-core";
