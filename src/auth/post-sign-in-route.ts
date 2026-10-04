import { safeReturnTo } from "@/routing/safe-return-to";

const HOME = "/pages/index/index";
const BLOCKED_POST_LOGIN_PREFIXES = [
  "/pages/onboarding/",
  "/pages/login/",
  "/pages/register/",
  "/pages/session/",
] as const;

export interface PostSignInRouteOptions {
  /** Server activation fact. It is deliberately not a login-access gate. */
  onboardingComplete: boolean;
  /** Informational device state; explicit device actions own recalibration UI. */
  requiresRecalibration: boolean;
  returnTo?: string | null;
  /** Registration owns its success/onboarding navigation explicitly. */
  deferNavigation?: boolean;
}

/**
 * Login and registration are separate journeys. An existing account may have
 * no phone calibration yet, but that must never turn a successful login into
 * the registration onboarding flow.
 */
export function resolvePostSignInRoute(options: PostSignInRouteOptions): string | null {
  if (options.deferNavigation) return null;
  const candidate = safeReturnTo(options.returnTo ?? null, HOME);
  const rawPath = candidate.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  let decodedPath = rawPath;
  try {
    // Decode twice so a nested encoded auth-flow path cannot bypass the gate.
    decodedPath = decodeURIComponent(decodeURIComponent(rawPath));
  } catch {
    return HOME;
  }
  const segments = decodedPath.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return HOME;
  const normalizedPath = decodedPath.replace(/\/{2,}/g, "/").toLowerCase();
  if (BLOCKED_POST_LOGIN_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) return HOME;
  return candidate;
}
