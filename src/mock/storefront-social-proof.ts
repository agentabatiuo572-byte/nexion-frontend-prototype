/**
 * Named, deterministic sandbox fixture for the non-authoritative storefront
 * social-proof animation. Production never reads this fixture.
 */
export const MOCK_STOREFRONT_SOCIAL_PROOF_FIXTURE_ID = "storefront-social-proof-fixture-v1";

export function fixtureSocialProofValue(base: number, tick: number, period: number, amplitude: number): number {
  if (!Number.isSafeInteger(base) || base < 0 || !Number.isSafeInteger(tick) || tick < 0) return 0;
  if (!Number.isSafeInteger(period) || period < 1 || !Number.isSafeInteger(amplitude) || amplitude < 0) return base;
  const offset = (tick % period) - Math.floor(period / 2);
  return Math.max(0, base + offset * amplitude);
}
