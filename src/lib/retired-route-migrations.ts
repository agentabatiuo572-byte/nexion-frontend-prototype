const RETIRED_ROUTE_DESTINATIONS: Readonly<Record<string, string>> = {
  "pages/me/kyc": "/pages/me/security?from=retired-flow",
};

/**
 * Removed capabilities keep only a one-way, explanation-bearing route into the
 * current product. No retired state or operation is restored here.
 */
export function resolveRetiredRoute(route?: string | null): string | null {
  return RETIRED_ROUTE_DESTINATIONS[String(route ?? "").trim()] ?? null;
}
