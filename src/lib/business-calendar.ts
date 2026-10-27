/**
 * D-16: business days follow the server's business calendar (back office A3).
 * Two tracks: LEGACY (every module except growth/team) and GROWTH_TEAM.
 * Until the calendar is read, and whenever it cannot be read, the seed below
 * applies; it matches the server seed, so cuts are right before the first read.
 * Only numeric offsets are used: native runtimes may ignore Intl timeZone.
 */
export type BusinessTrack = "LEGACY" | "GROWTH_TEAM";

export interface BusinessTrackVersion {
  zoneId: string;
  offsetMinutes: number;
  /** Epoch milliseconds from which this version cuts days. */
  effectiveAt: number;
}

export type BusinessCalendarTracks = Record<BusinessTrack, BusinessTrackVersion[]>;

const EPOCH_BEIJING = Date.UTC(1969, 11, 31, 16);
const FIRST_VIETNAM_DAY = Date.UTC(2026, 9, 18, 16);
const SEED: BusinessCalendarTracks = {
  LEGACY: [{ zoneId: "Asia/Shanghai", offsetMinutes: 480, effectiveAt: EPOCH_BEIJING }],
  GROWTH_TEAM: [
    { zoneId: "Asia/Shanghai", offsetMinutes: 480, effectiveAt: EPOCH_BEIJING },
    { zoneId: "Asia/Ho_Chi_Minh", offsetMinutes: 420, effectiveAt: FIRST_VIETNAM_DAY },
  ],
};
const MINUTE_MS = 60_000;

let tracks: BusinessCalendarTracks = SEED;

export function businessCalendarTracks(): BusinessCalendarTracks { return tracks; }

/** Replaces the calendar; null restores the seed. */
export function setBusinessCalendar(next: BusinessCalendarTracks | null): void { tracks = next ?? SEED; }

function versionAt(track: BusinessTrack, at: number): BusinessTrackVersion {
  const versions = tracks[track];
  let current = versions[0];
  for (const version of versions) if (version.effectiveAt <= at) current = version;
  return current;
}

export function businessOffsetMinutes(track: BusinessTrack, at: number): number {
  return versionAt(track, at).offsetMinutes;
}

/** Business calendar date for an instant: shifted UTC fields of the returned Date are the business wall clock. */
export function businessWallClock(track: BusinessTrack, at: number): Date {
  return new Date(at + businessOffsetMinutes(track, at) * MINUTE_MS);
}

/** "YYYY-MM-DD" business date, or "" for an invalid instant. */
export function businessDayKey(track: BusinessTrack, at: number): string {
  if (!Number.isFinite(at)) return "";
  return businessWallClock(track, at).toISOString().slice(0, 10);
}

/** "UTC+8" / "UTC+5:30" / "UTC" for the version in effect at the instant. */
export function businessOffsetLabel(track: BusinessTrack, at = Date.now()): string {
  const minutes = businessOffsetMinutes(track, at);
  if (minutes === 0) return "UTC";
  const absolute = Math.abs(minutes);
  const rest = absolute % 60;
  return `UTC${minutes < 0 ? "-" : "+"}${Math.floor(absolute / 60)}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

function parseVersions(value: unknown): BusinessTrackVersion[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const versions: BusinessTrackVersion[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const { zoneId, offsetMinutes, effectiveAt } = row as Record<string, unknown>;
    const at = typeof effectiveAt === "string" ? Date.parse(effectiveAt) : NaN;
    if (typeof zoneId !== "string" || !zoneId.trim() || typeof offsetMinutes !== "number"
        || !Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60 || !Number.isFinite(at)) return null;
    versions.push({ zoneId: zoneId.trim(), offsetMinutes, effectiveAt: at });
  }
  versions.sort((left, right) => left.effectiveAt - right.effectiveAt);
  return versions;
}

/** `GET /api/config/business-calendar` payload; null when it is not a complete calendar. */
export function parseBusinessCalendar(value: unknown): BusinessCalendarTracks | null {
  const raw = value && typeof value === "object" ? (value as { tracks?: unknown }).tracks : null;
  if (!raw || typeof raw !== "object") return null;
  const legacy = parseVersions((raw as Record<string, unknown>).LEGACY);
  const growthTeam = parseVersions((raw as Record<string, unknown>).GROWTH_TEAM);
  return legacy && growthTeam ? { LEGACY: legacy, GROWTH_TEAM: growthTeam } : null;
}
