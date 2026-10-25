import { asApiError, isAmbiguousEnvelopeOutcome, type ApiErrorKind } from "@/api/errors";

const rejectedSpinCodes = new Set([
  "WHEEL_PAYOUT_MUTEX_UNAVAILABLE", "WHEEL_COMFORT_TIER_MISSING", "WHEEL_EVENT_NOT_OPEN",
  "WHEEL_DAILY_LIMIT_REACHED", "WHEEL_SPIN_TICKET_CONFLICT",
]);
export interface SpinFailure {
  kind: ApiErrorKind;
  status?: number;
  code?: number;
  businessCode?: string;
  ambiguous: boolean;
  messageKey: "spinUnavailable" | "spinClosed" | "spinLimit" | "spinSession" | "spinUnknown" | "spinReview";
}
export function spinFailure(cause: unknown): SpinFailure {
  const error = asApiError(cause);
  const businessCode = /^[A-Z][A-Z0-9_]{1,95}$/.test(error.message) ? error.message : undefined;
  const status = error.kind === "business" ? error.code : error.status;
  const rejected = (error.kind === "business" || error.kind === "http") && status !== undefined
    && status >= 400 && status < 500 && rejectedSpinCodes.has(businessCode ?? "");
  const ambiguous = !rejected && isAmbiguousEnvelopeOutcome(error);
  const messageKey = ambiguous ? "spinUnknown" : error.kind === "auth" ? "spinSession"
    : businessCode === "WHEEL_EVENT_NOT_OPEN" ? "spinClosed"
    : businessCode === "WHEEL_DAILY_LIMIT_REACHED" || businessCode === "WHEEL_SPIN_TICKET_CONFLICT" ? "spinLimit" : "spinUnavailable";
  return { kind: error.kind, status: error.status, code: error.code, businessCode, ambiguous, messageKey };
}
