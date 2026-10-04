import type { ComputeShareEnrollmentStatus } from "@/api/compute-share-api";

export interface EnrollmentStatusMessages {
  pairingPendingLabel: string;
  pairingConnectedLabel: string;
  pairingExpiredLabel: string;
}

export function enrollmentStatusLabel(
  status: ComputeShareEnrollmentStatus,
  messages: EnrollmentStatusMessages,
): string {
  if (status === "CONNECTED") return messages.pairingConnectedLabel;
  if (status === "EXPIRED") return messages.pairingExpiredLabel;
  return messages.pairingPendingLabel;
}
