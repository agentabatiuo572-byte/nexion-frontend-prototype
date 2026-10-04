export interface VietQrTransferStepCopy {
  scan: string;
  manual: (accountNumber: string, amountText: string) => string;
  amount: string;
  complete: string;
}

export function buildVietQrTransferSteps(
  qrPayload: string | undefined,
  accountNumber: string,
  amountText: string,
  copy: VietQrTransferStepCopy,
): string[] {
  const first = typeof qrPayload === "string" && qrPayload.trim().length > 0
    ? copy.scan
    : copy.manual(accountNumber, amountText);
  return [first, copy.amount, copy.complete];
}

export function remoteGenerationMatches(
  expectedAccountKey: string,
  expectedGeneration: number,
  currentAccountKey: string,
  currentGeneration: number,
): boolean {
  return expectedAccountKey === currentAccountKey && expectedGeneration === currentGeneration;
}

export function isPayableVietQrCreateStatus(status: string): boolean {
  return status === "awaiting_payment";
}

export function appendVietQrReceipts<T extends { receiptNo: string }>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] {
  const seen = new Set(existing.map((item) => item.receiptNo));
  const appended = incoming.filter((item) => {
    if (seen.has(item.receiptNo)) return false;
    seen.add(item.receiptNo);
    return true;
  });
  return [...existing, ...appended];
}
