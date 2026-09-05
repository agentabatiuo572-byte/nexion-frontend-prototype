/**
 * Safe-return-to helper — prevents open redirect via user-controlled URL
 * params like `?returnTo=https://evil.com` or `?return=//evil.com`.
 *
 * Use whenever a page accepts a returnTo / return / next / redirect URL param
 * and feeds it to `router.push()`. Validates the param is a relative path
 * before allowing navigation, otherwise returns the safe fallback.
 *
 * ⚠️ MOCK NOTE: in production with real auth, this also pairs with
 * server-side allowlist of return destinations per user role.
 */

export function safeReturnTo(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  // Reject absolute URLs (http://evil.com, https://evil.com)
  if (raw.startsWith("http://") || raw.startsWith("https://")) return fallback;
  // Reject protocol-relative URLs (//evil.com)
  if (raw.startsWith("//")) return fallback;
  // Reject javascript: / data: / vbscript: schemes
  if (/^[a-z]+:/i.test(raw)) return fallback;
  // Must be a relative path starting with `/`
  if (!raw.startsWith("/")) return fallback;
  return raw;
}
