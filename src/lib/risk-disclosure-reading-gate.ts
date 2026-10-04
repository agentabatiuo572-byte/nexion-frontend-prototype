import type { RiskDisclosureCurrent } from "@/api/risk-disclosure-api";

export interface RiskDisclosureReadingState {
  scrolledToBottom: boolean;
  checked: boolean;
  selectedBlock: number | null;
}

export const EMPTY_RISK_DISCLOSURE_READING_STATE: RiskDisclosureReadingState = Object.freeze({
  scrolledToBottom: false,
  checked: false,
  selectedBlock: null,
});

/** A token is scoped to the exact server-issued document-reading context. */
export function riskDisclosureDocumentIdentity(disclosure: RiskDisclosureCurrent | null): string | null {
  if (!disclosure) return null;
  return JSON.stringify([
    disclosure.jurisdiction,
    disclosure.version,
    disclosure.acknowledgmentToken,
  ]);
}

export function updateRiskDisclosureReadingState(
  previousIdentity: string | null,
  nextIdentity: string | null,
  current: RiskDisclosureReadingState,
): RiskDisclosureReadingState {
  return previousIdentity === nextIdentity ? current : EMPTY_RISK_DISCLOSURE_READING_STATE;
}

/** Native scroll events carry no document id, so arm them only after render. */
export function canCompleteRiskDisclosureReadingFromScrollEvent(
  scrollEventIdentity: string | null,
  documentIdentity: string | null,
  readingIdentity: string | null,
): boolean {
  return Boolean(
    scrollEventIdentity
      && scrollEventIdentity === documentIdentity
      && readingIdentity === documentIdentity,
  );
}

export function canAcknowledgeRiskDisclosure(input: {
  disclosure: RiskDisclosureCurrent | null;
  documentIdentity: string | null;
  readingIdentity: string | null;
  reading: RiskDisclosureReadingState;
  accepted: boolean;
  loading: boolean;
}): boolean {
  return Boolean(
    input.disclosure
      && input.disclosure.acknowledgmentToken
      && input.documentIdentity
      && input.readingIdentity === input.documentIdentity
      && input.reading.scrolledToBottom
      && input.reading.checked
      && !input.accepted
      && !input.loading,
  );
}
