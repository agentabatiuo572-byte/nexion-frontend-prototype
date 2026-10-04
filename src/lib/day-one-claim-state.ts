import type { CanonicalQuest, DayOneSnapshotStatus } from "@/api/quest-api";

export function dayOneClaimState(
  rows: readonly CanonicalQuest[],
  requiredTaskCount: number | null,
  snapshotStatus: DayOneSnapshotStatus,
  now: number,
) {
  const dayOne = rows.filter((row) => row.layer === "DAY_ONE");
  const completedCodes = dayOne.filter((row) => ["COMPLETED", "CLAIMABLE", "CLAIMED"].includes(row.status))
    .map((row) => row.questCode);
  const active = dayOne.filter((row) => row.eligible);
  const claimedRows = dayOne.filter(row => row.status === "CLAIMED");
  const empty = snapshotStatus === "EMPTY" && requiredTaskCount === 0 && dayOne.length === 0;
  const verifiable = snapshotStatus === "SNAPSHOT"
    && Number.isInteger(requiredTaskCount) && (requiredTaskCount ?? 0) > 0;
  // The server freezes the member count at entry. A missing legacy header or
  // EMPTY instance stays readable but can never be promoted into a group claim.
  const claimable = verifiable && active.length === requiredTaskCount
    && new Set(active.map((row) => row.questCode)).size === requiredTaskCount
    && new Set(active.map((row) => row.instanceKey)).size === 1
    && active.every((row) => row.instanceKey && ["COMPLETED", "CLAIMABLE"].includes(row.status)
      && Date.parse(row.eligibleFrom) <= now && now < Date.parse(row.eligibleUntil));
  return {
    completedCodes,
    empty,
    verifiable,
    unverified: snapshotStatus === "LEGACY_UNVERIFIED",
    claimed: verifiable && claimedRows.length === requiredTaskCount
      && new Set(claimedRows.map(row => row.questCode)).size === requiredTaskCount
      && new Set(claimedRows.map(row => row.instanceKey)).size === 1
      && Boolean(claimedRows[0]?.instanceKey)
      && (active.length === 0 || active.every(row => row.instanceKey === claimedRows[0]?.instanceKey
        && row.status === "CLAIMED")),
    claimCode: claimable ? active[0].questCode : null,
  };
}
