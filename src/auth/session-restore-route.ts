import { isPublicAuthRoute } from '@/lib/auth-route-visibility';
import { normalizeRoute } from '@/lib/static-review-routes';

/** Reading a public business page is independent of entering the sign-in flow. */
export function preserveRouteDuringSessionRestore(route: string): boolean {
  const path = normalizeRoute(route);
  return !!path && (!isPublicAuthRoute(path) || path === 'pages/onboarding/privacy');
}
