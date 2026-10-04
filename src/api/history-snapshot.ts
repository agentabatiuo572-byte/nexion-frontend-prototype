import { ApiError } from "./errors";

/** Optional for rolling upgrades; IDs remain strings to preserve BIGINT precision. */
export function parseHistorySnapshotId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(value)
      || (value.length === 19 && value > "9223372036854775807")) {
    throw new ApiError({ kind: "protocol", message: "HISTORY_SNAPSHOT_INVALID" });
  }
  return value;
}

export function historySnapshotQuery(snapshotId?: string): string {
  return snapshotId === undefined ? "" : `&snapshotId=${encodeURIComponent(snapshotId)}`;
}
