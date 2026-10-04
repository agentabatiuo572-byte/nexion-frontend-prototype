export type SearchResultBody = "loading" | "recoverable-error" | "empty" | "results";
export type SearchRemoteStatus = "idle" | "loading" | "ready" | "error";

export interface SearchResultStateInput {
  hasQuery: boolean;
  remoteCatalogueStatus: SearchRemoteStatus;
  remoteNetworkStatus: SearchRemoteStatus;
  remoteFleetStatus: SearchRemoteStatus;
  remoteFaqStatus?: SearchRemoteStatus;
  /** A confirmed current-account fleet snapshot may stay searchable during refresh. */
  remoteFleetHasSnapshot?: boolean;
  resultCount: number;
}

export interface SearchResultState {
  body: SearchResultBody;
  showSourceError: boolean;
}

/**
 * A remote source is never treated as an empty source until its current account
 * read has completed. Ready hits from independent sources remain searchable
 * while another source recovers.
 */
export function resolveSearchResultState(input: SearchResultStateInput): SearchResultState {
  if (!input.hasQuery) return { body: "empty", showSourceError: false };
  const rawStatuses = [
    input.remoteCatalogueStatus,
    input.remoteNetworkStatus,
    input.remoteFleetStatus,
    input.remoteFaqStatus ?? "ready",
  ];
  const hasSourceError = rawStatuses.includes("error");
  // The snapshot is reset on account binding. It is readable during this
  // account's next refresh, but the raw status still controls retry feedback.
  const fleetAvailability = input.remoteFleetHasSnapshot === true ? "ready" : input.remoteFleetStatus;
  const statuses = [
    input.remoteCatalogueStatus,
    input.remoteNetworkStatus,
    fleetAvailability,
    input.remoteFaqStatus ?? "ready",
  ];
  if (input.resultCount > 0) {
    return {
      body: "results",
      showSourceError: hasSourceError,
    };
  }
  if (hasSourceError) return { body: "recoverable-error", showSourceError: false };
  if (statuses.includes("idle") || statuses.includes("loading")) return { body: "loading", showSourceError: false };
  return { body: "empty", showSourceError: false };
}
