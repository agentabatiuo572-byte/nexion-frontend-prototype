export type VietQrReceiptStatusKey =
  | "credited"
  | "review"
  | "returnPending"
  | "returned"
  | "cancelled"
  | "unknown";

export interface VietQrReceiptPresentation {
  statusKey: VietQrReceiptStatusKey;
  amountText: string;
  credited: boolean;
}

/** Only an explicit server CREDITED state may be rendered as wallet credit. */
export function presentVietQrReceipt(status: string, creditedUsdt: number): VietQrReceiptPresentation {
  const normalized = status.trim().toUpperCase();
  if (normalized === "CREDITED" && Number.isFinite(creditedUsdt) && creditedUsdt >= 0) {
    return { statusKey: "credited", amountText: `+$${creditedUsdt.toFixed(2)}`, credited: true };
  }
  const statusKey: VietQrReceiptStatusKey = normalized === "OPEN"
    ? "review"
    : normalized === "RETURN_PENDING"
      ? "returnPending"
      : normalized === "RETURNED"
        ? "returned"
        : normalized === "CANCELLED"
          ? "cancelled"
          : "unknown";
  return { statusKey, amountText: "—", credited: false };
}
