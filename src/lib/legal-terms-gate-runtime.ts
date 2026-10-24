import { sessionVault } from "@/api/runtime";
import type { LegalTermsCurrent } from "@/api/legal-terms-api";

/**
 * Consent belongs to registration. These exports remain compatible with the
 * Terms reader and existing callers, but never read or enforce a new version.
 */
export function hasPendingLegalTermsRequirement(): boolean { return false; }
export function enforcePendingLegalTermsGate(_returnTo: string): boolean { return false; }
export function scheduleLegalTermsGate(_returnTo = "/pages/index/index"): Promise<void> { return Promise.resolve(); }
export function recordLegalTermsAcknowledged(_snapshot: LegalTermsCurrent, _locale?: string): void {}

/** Resume login work without a Terms round trip; a later session cannot inherit it. */
export function afterLegalTermsAcknowledged(run: () => Promise<boolean | void>): void {
  const session = sessionVault.read();
  if (!session) return;
  const revision = sessionVault.revision();
  void Promise.resolve().then(async () => {
    const current = sessionVault.read();
    if (!current || current.user.userId !== session.user.userId
        || !(sessionVault.revision() === revision || sessionVault.isRefreshContinuation(revision))) return;
    await run();
  }).catch(() => { /* Each business read retains its own recovery UI. */ });
}
