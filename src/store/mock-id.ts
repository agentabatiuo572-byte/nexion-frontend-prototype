/**
 * Mock ID generator — single replacement point for client-side IDs.
 *
 * In production, all IDs are server-issued in the response of the relevant
 * POST endpoint (bill / order / swap / staking / withdrawal). Client never
 * mints money-event IDs.
 *
 * This helper centralises the mock generation pattern so:
 *   1. Format is consistent (`{PREFIX}-{base36 timestamp}-{4-digit random}`)
 *   2. Single line change at production cutover (replace body with `throw`
 *      or remove uses entirely once server returns the ids).
 *
 * ⚠️ MOCK-ONLY: never used in production code path.
 */

/**
 * Generates a human-readable mock id with prefix. Format:
 *   `{prefix}-{4-char base36 of now}-{4-digit zero-padded random}`
 *
 * Examples:
 *   mockServerId("BL")  → "BL-K8X3-4218"
 *   mockServerId("ORD") → "ORD-K8X3-7901"
 *   mockServerId("SW")  → "SW-K8X3-0044"
 *
 * Collision risk in mock: ~1/10000 within the same ms; acceptable for demo.
 * Production: server returns canonical id (UUID or backend-issued format).
 */
export function mockServerId(prefix: string): string {
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `${prefix}-${ts}-${rand}`;
}

/**
 * Generates a UUID for internal-only ids (commission events, achievement
 * tokens, etc.) where format readability doesn't matter.
 *
 * Production: server-issued UUID returned in response.
 */
export function mockServerUuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for SSR / very old browsers
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
