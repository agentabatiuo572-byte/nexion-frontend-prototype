/** Only the exact URL produced by the current invitation-link configuration is accepted. */
export function scannedInvitationCode(result: unknown, baseUrl: string): string | null {
  if (typeof result !== "string" || !/^https:\/\//i.test(baseUrl) || !result.trim().startsWith(baseUrl)) return null;
  const code = result.trim().slice(baseUrl.length);
  return /^[A-Z0-9]{4,32}$/.test(code) ? code : null;
}
