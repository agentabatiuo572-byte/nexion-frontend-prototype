/**
 * Resolve checkout preflight without coupling the optional trade-in suggestion
 * to the mandatory server capacity decision.
 */
export async function resolveTradeinCheckoutPreflight<TEligibility, TCapacity>(
  eligibilityPromise: Promise<TEligibility>,
  capacityPromise: Promise<TCapacity>,
): Promise<{ eligibility: TEligibility | null; capacity: TCapacity }> {
  const [eligibilityResult, capacityResult] = await Promise.allSettled([
    eligibilityPromise,
    capacityPromise,
  ]);

  if (capacityResult.status !== "fulfilled") throw capacityResult.reason;

  return {
    eligibility: eligibilityResult.status === "fulfilled" ? eligibilityResult.value : null,
    capacity: capacityResult.value,
  };
}
