import type { RegistrationReceipt } from "@/api/contracts";

let staged: { identity: string | null; receipt: RegistrationReceipt } | null = null;

export function stageRemoteRegistrationReceipt(
  receipt: RegistrationReceipt | null | undefined,
  identity: string | null = null,
): void {
  staged = receipt ? { identity, receipt } : null;
}

export function consumeRemoteRegistrationReceipt(expectedIdentity?: string | null): RegistrationReceipt | null {
  const candidate = staged;
  staged = null;
  if (!candidate || (expectedIdentity !== undefined
      && candidate.identity !== null && candidate.identity !== expectedIdentity)) return null;
  return candidate.receipt;
}

export function clearRemoteRegistrationReceipt(): void {
  staged = null;
}
