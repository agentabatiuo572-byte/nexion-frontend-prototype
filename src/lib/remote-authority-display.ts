export type RemoteAuthorityStatus = "ready" | "loading" | "unavailable";

/**
 * A remote source is authoritative only after its snapshot has arrived.  A
 * genuine zero inside an accepted snapshot remains a value; a missing snapshot
 * must not be formatted as one.
 */
export function remoteAuthorityStatus({
  remoteApiEnabled,
  hasSnapshot,
  hasError,
}: {
  remoteApiEnabled: boolean;
  hasSnapshot: boolean;
  hasError: boolean;
}): RemoteAuthorityStatus {
  if (!remoteApiEnabled || hasSnapshot) return "ready";
  return hasError ? "unavailable" : "loading";
}
