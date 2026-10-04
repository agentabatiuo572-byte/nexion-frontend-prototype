import type { AmbassadorApplication, AmbassadorApplicationInput } from "@/api/ambassador-application-api";

export interface TeamP31718Request {
  accountKey: string;
  accountEpoch: number;
  generation: number;
}

export interface CurrentTeamP31718Request extends TeamP31718Request {
  mounted: boolean;
}

export interface AmbassadorApplicationDraft {
  eventDate: string;
  city: string;
  budgetText: string;
  bucket: unknown;
}

export interface AmbassadorAgentFormState {
  date: string;
  city: string;
  budgetText: string;
  bucketId: "";
  bucketTitle: string;
}

const BUCKETS = new Set<AmbassadorApplicationInput["bucket"]>(["venue", "kol", "print", "dev"]);
const ISO_CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const DECIMAL = /^\d+(?:\.\d{1,6})?$/;

function javaTrim(value: string): string {
  return value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, "");
}

function dateParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day
    ? { year, month, day } : null;
}

function dateKey(parts: { year: number; month: number; day: number }): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function shanghaiToday(now: Date): { year: number; month: number; day: number } {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function plusOneYear(parts: { year: number; month: number; day: number }): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(parts.year + 1, parts.month - 1, parts.day));
  if (date.getUTCMonth() !== parts.month - 1) date.setUTCDate(0);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Matches the Java application's civil-date, text, decimal, and bucket gate before POST. */
export function parseAmbassadorApplicationDraft(
  draft: AmbassadorApplicationDraft,
  now = new Date(),
): AmbassadorApplicationInput | null {
  const eventDate = dateParts(draft.eventDate) ? draft.eventDate : null;
  const today = shanghaiToday(now);
  if (!eventDate || eventDate < dateKey(today) || eventDate > dateKey(plusOneYear(today))) return null;

  const city = javaTrim(draft.city);
  if (city.length < 2 || city.length > 64 || ISO_CONTROL.test(city)) return null;

  const budgetText = javaTrim(draft.budgetText);
  if (!DECIMAL.test(budgetText)) return null;
  const budgetUsdt = Number(budgetText);
  if (!Number.isFinite(budgetUsdt) || budgetUsdt < 100 || budgetUsdt > 10000) return null;

  if (!BUCKETS.has(draft.bucket as AmbassadorApplicationInput["bucket"])) return null;
  return { eventDate, city, budgetUsdt, bucket: draft.bucket as AmbassadorApplicationInput["bucket"] };
}

/** A successful POST clears only the draft; the returned server receipt remains renderable. */
export function successfulAmbassadorApplicationState(receipt: AmbassadorApplication): {
  receipt: AmbassadorApplication;
  form: AmbassadorAgentFormState;
} {
  return { receipt, form: { date: "", city: "", budgetText: "3000", bucketId: "", bucketTitle: "" } };
}

/**
 * A latest read has no idempotency correlation. After an unknown POST outcome,
 * it may be shown as account fact but can never settle this command as success.
 */
export function ambassadorSubmitErrorRecovery(settledRejection: boolean): {
  finishCommand: boolean;
  refreshLatestForDisplay: true;
  toastSubmitSuccess: false;
} {
  return {
    finishCommand: settledRejection,
    refreshLatestForDisplay: true,
    toastSubmitSuccess: false,
  };
}

/** Team account data is fenced by account binding and page lifetime, not unrelated catalogue refreshes. */
export function isCurrentTeamP31718Request(
  request: TeamP31718Request,
  current: CurrentTeamP31718Request,
): boolean {
  return current.mounted
    && request.accountKey === current.accountKey
    && request.accountEpoch === current.accountEpoch
    && request.generation === current.generation;
}
