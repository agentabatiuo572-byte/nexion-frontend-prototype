import type { DeveloperAccessReceipt, DeveloperAccessStatus } from "@/api/developer-access-api";
import { ApiError } from "@/api/errors";

/** Only the explicit server prerequisite is an approval state; other 403s stay failures. */
export function isDeveloperApprovalRequired(error: unknown): boolean {
  return error instanceof ApiError && error.kind === "http" && error.status === 403 && error.code === 403
    && error.message === "DEVELOPER_ACCESS_APPROVAL_REQUIRED";
}

/**
 * The server's published-docs endpoint answers 503 while no documentation is
 * published. That is a product state (the portal is not released yet), not a
 * network/service failure, and must not be rendered as a load error with a
 * retry the user can never satisfy.
 */
export function isDeveloperDocsNotReleased(error: unknown): boolean {
  return error instanceof ApiError && error.message === "DEVELOPER_DOCS_UNAVAILABLE";
}

/**
 * Developer resources answer 503 while the capability itself is not deployable
 * (no published docs, no acceptance run, unsupported profile). Those are
 * product states, not transport failures: they must render a stable
 * "not released yet" explanation instead of a retryable load error, and must
 * never appear alongside the not-released copy as a conflicting second state.
 */
export function isDeveloperCapabilityUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.kind === "http" && error.status === 503
    && /^DEVELOPER_/.test(error.message);
}

type DeveloperAccessStatusCopyKey =
  | "requestStatusPending"
  | "requestStatusApproved"
  | "requestStatusRejected"
  | "requestStatusRevoked"
  | "requestStatusExpired"
  | "requestStatusPendingDetail"
  | "requestStatusApprovedDetail"
  | "requestStatusRejectedDetail"
  | "requestStatusRevokedDetail"
  | "requestStatusExpiredDetail";

export type DeveloperAccessCopyKey = DeveloperAccessStatusCopyKey
  | "reviewReasonIdentityVerificationRequired"
  | "reviewReasonBusinessInformationInsufficient"
  | "reviewReasonPolicyRequirementsNotMet"
  | "reviewReasonAccessRevokedByPolicy";

export interface DeveloperAccessState {
  label: Extract<DeveloperAccessStatusCopyKey, `requestStatus${string}`>;
  detail: Extract<DeveloperAccessStatusCopyKey, `requestStatus${string}Detail`>;
  canReapply: boolean;
}

const STATE: Record<DeveloperAccessStatus, DeveloperAccessState> = {
  PENDING: { label: "requestStatusPending", detail: "requestStatusPendingDetail", canReapply: false },
  APPROVED: { label: "requestStatusApproved", detail: "requestStatusApprovedDetail", canReapply: false },
  REJECTED: { label: "requestStatusRejected", detail: "requestStatusRejectedDetail", canReapply: true },
  REVOKED: { label: "requestStatusRevoked", detail: "requestStatusRevokedDetail", canReapply: true },
  // This is a legacy read-model value. The App never derives it from time or
  // changes a request into EXPIRED locally.
  EXPIRED: { label: "requestStatusExpired", detail: "requestStatusExpiredDetail", canReapply: true },
};

export function developerAccessState(receipt: DeveloperAccessReceipt | null): DeveloperAccessState | null {
  return receipt ? STATE[receipt.status] : null;
}

export function developerAccessReviewReasonKey(receipt: DeveloperAccessReceipt | null):
  | "reviewReasonIdentityVerificationRequired"
  | "reviewReasonBusinessInformationInsufficient"
  | "reviewReasonPolicyRequirementsNotMet"
  | "reviewReasonAccessRevokedByPolicy"
  | null {
  switch (receipt?.reviewReason) {
    case "IDENTITY_VERIFICATION_REQUIRED": return "reviewReasonIdentityVerificationRequired";
    case "BUSINESS_INFORMATION_INSUFFICIENT": return "reviewReasonBusinessInformationInsufficient";
    case "POLICY_REQUIREMENTS_NOT_MET": return "reviewReasonPolicyRequirementsNotMet";
    case "ACCESS_REVOKED_BY_POLICY": return "reviewReasonAccessRevokedByPolicy";
    default: return null;
  }
}
