import { normalizeRefCode } from "@/store/sponsorship";

const REMOTE_SPONSOR_CODE_RE = /^[A-Z0-9]{4,32}$/;

/**
 * The remote backend owns the canonical referral-code format. The older
 * NEXGRID-XXXX rule belongs only to the local mock sponsorship store.
 */
export function normalizeRegistrationSponsorCode(
  raw: string | null | undefined,
  remote: boolean,
): string | null {
  if (!remote) return normalizeRefCode(raw);
  const canonical = (raw ?? "").trim().replace(/-/g, "").toUpperCase();
  return REMOTE_SPONSOR_CODE_RE.test(canonical) ? canonical : null;
}
