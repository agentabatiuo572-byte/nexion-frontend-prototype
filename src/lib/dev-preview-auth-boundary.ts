const DEVELOPMENT_OAUTH_PREFIX = "/auth/users/oauth/development/";
const OAUTH_EXCHANGE_PATH = "/auth/users/oauth/exchange";

export function isLoopbackPreviewClient(remoteAddress: string | undefined): boolean {
  const address = remoteAddress?.trim().toLowerCase();
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function normalizedPath(rawUrl: string | undefined): string {
  const pathname = new URL(rawUrl || "/", "http://preview.invalid").pathname;
  try {
    return decodeURIComponent(pathname).replace(/;[^/]*/g, "").replace(/\/{2,}/g, "/");
  } catch {
    return pathname.replace(/;[^/]*/g, "").replace(/\/{2,}/g, "/");
  }
}

/**
 * The development passkey flow trusts a direct loopback TCP peer. A LAN client
 * reaching it through Vite would otherwise inherit Vite's loopback peer address.
 * Keep normal auth proxying available, but never proxy development OAuth
 * challenge/exchange endpoints for a non-loopback preview client.
 */
export function mustBlockDevelopmentOAuthProxy(
  rawUrl: string | undefined,
  remoteAddress: string | undefined,
): boolean {
  if (isLoopbackPreviewClient(remoteAddress)) return false;
  const path = normalizedPath(rawUrl);
  return path.startsWith(DEVELOPMENT_OAUTH_PREFIX) || path === OAUTH_EXCHANGE_PATH;
}
