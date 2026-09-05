import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type CanonicalEventKind =
  | "discount"
  | "referral"
  | "wheel"
  | "regional"
  | "boost"
  | "seasonal"
  | "holding"
  | "onboarding";
export type CanonicalEventState = "ongoing" | "upcoming" | "ended";
export type CanonicalEventUserStatus = "AVAILABLE" | "JOINED" | "CLAIMABLE" | "CLAIMED";

export interface CanonicalEvent {
  eventCode: string;
  kind: CanonicalEventKind;
  state: CanonicalEventState;
  title: string;
  subtitle: string;
  rewardName: string;
  rewardType: string;
  rewardAmount: number;
  featured: boolean;
  trackable: boolean;
  targetValue: number;
  progressValue: number;
  userStatus: CanonicalEventUserStatus;
  geo: string;
  href: string;
  startsAt: string | null;
  endsAt: string | null;
}

export interface EventSnapshot {
  events: CanonicalEvent[];
  serverTimeUtc: string;
  source: string;
}

export interface EventJoinResult {
  eventId: string;
  status: "JOINED";
}

export interface EventClaimResult {
  eventId: string;
  rewardType: string;
  rewardAmount: number;
  badgeCode: string | null;
}

export interface EventSpinResult {
  spinId: string;
  eventId: string;
  spinDate: string;
  sourceType: "DAILY" | "BONUS";
  tierId: string;
  rewardType: string;
  rewardAmount: number;
  rewardName: string;
  downgraded: boolean;
  downgradeReason: string;
}

export interface EventSpinSegment {
  tierId: string;
  rewardType: string;
  rewardAmount: number;
  rewardName: string;
  realOutflow: boolean;
  displayOrder: number;
}

export interface EventSpinHistory {
  spinId: string;
  spinDate: string;
  sourceType: "DAILY" | "BONUS";
  tierId: string;
  rewardType: string;
  rewardAmount: number;
  rewardName: string;
  downgraded: boolean;
  downgradeReason: string;
  awardedAt: string;
}

export interface EventSpinState {
  eventCode: string;
  eventId: string;
  serverDate: string;
  nextResetAtUtc: string;
  freeAvailable: boolean;
  bonusTickets: number;
  availableSpins: number;
  segments: EventSpinSegment[];
  history: EventSpinHistory[];
  source: string;
}

export interface EventsApi {
  state(): Promise<EventSnapshot>;
  spinState(eventCode: string): Promise<EventSpinState>;
  join(eventCode: string, idempotencyKey: string): Promise<EventJoinResult>;
  claim(eventCode: string, idempotencyKey: string): Promise<EventClaimResult>;
  spin(eventCode: string, idempotencyKey: string): Promise<EventSpinResult>;
}

const EVENT_KINDS: CanonicalEventKind[] = [
  "discount", "referral", "wheel", "regional", "boost", "seasonal", "holding", "onboarding",
];
const EVENT_STATES: CanonicalEventState[] = ["ongoing", "upcoming", "ended"];
const USER_STATUSES: CanonicalEventUserStatus[] = ["AVAILABLE", "JOINED", "CLAIMABLE", "CLAIMED"];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalText(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : text(value);
}

function number(value: unknown, min = 0): number | null {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return null;
}

function invalid(message = "EVENT_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function required(value: string, error: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ApiError({ kind: "protocol", message: error });
  return normalized;
}

function parseEvent(value: unknown): CanonicalEvent {
  const row = record(value);
  const eventCode = text(row?.eventCode);
  const kind = text(row?.kind)?.toLowerCase() as CanonicalEventKind;
  const state = text(row?.state)?.toLowerCase() as CanonicalEventState;
  const title = text(row?.title);
  const subtitle = typeof row?.subtitle === "string" ? row.subtitle : null;
  const rewardName = text(row?.rewardName);
  const rewardType = text(row?.rewardType)?.toUpperCase();
  const rewardAmount = number(row?.rewardAmount);
  const featured = bool(row?.featured);
  const trackable = bool(row?.trackable);
  const targetValue = number(row?.targetValue);
  const progressValue = number(row?.progressValue);
  const userStatus = text(row?.userStatus)?.toUpperCase() as CanonicalEventUserStatus;
  const geo = typeof row?.geo === "string" ? row.geo : null;
  const href = typeof row?.href === "string" ? row.href : null;
  if (!row || !eventCode || !EVENT_KINDS.includes(kind) || !EVENT_STATES.includes(state)
      || !title || subtitle === null || !rewardName || !rewardType || rewardAmount === null
      || featured === null || trackable === null || targetValue === null || progressValue === null
      || !USER_STATUSES.includes(userStatus) || geo === null || href === null
      || (href !== "" && !/^\/pages\/[A-Za-z0-9_./-]+$/.test(href))) {
    return invalid();
  }
  return {
    eventCode,
    kind,
    state,
    title,
    subtitle,
    rewardName,
    rewardType,
    rewardAmount,
    featured,
    trackable,
    targetValue,
    progressValue,
    userStatus,
    geo,
    href,
    startsAt: optionalText(row.startsAt),
    endsAt: optionalText(row.endsAt),
  };
}

function parseSnapshot(value: unknown): EventSnapshot {
  const row = record(value);
  const serverTimeUtc = text(row?.serverTimeUtc);
  const source = text(row?.source);
  if (!row || !Array.isArray(row.events) || !serverTimeUtc || !source
      || Number.isNaN(Date.parse(serverTimeUtc))) {
    return invalid();
  }
  const events = row.events.map(parseEvent);
  const codes = new Set(events.map((event) => event.eventCode));
  if (codes.size !== events.length) return invalid("EVENT_CODE_DUPLICATED");
  if (events.filter((event) => event.featured && event.state === "ongoing").length > 1) {
    return invalid("EVENT_FEATURED_DUPLICATED");
  }
  return { events, serverTimeUtc, source };
}

function parseJoin(value: unknown): EventJoinResult {
  const row = record(value);
  const eventId = text(row?.eventId);
  if (!row || !eventId || row.status !== "JOINED") return invalid("EVENT_JOIN_RESPONSE_INVALID");
  return { eventId, status: "JOINED" };
}

function parseClaim(value: unknown): EventClaimResult {
  const row = record(value);
  const eventId = text(row?.eventId);
  const rewardType = text(row?.rewardType)?.toUpperCase();
  const rewardAmount = number(row?.rewardAmount);
  if (!row || !eventId || !rewardType || rewardAmount === null) {
    return invalid("EVENT_CLAIM_RESPONSE_INVALID");
  }
  return { eventId, rewardType, rewardAmount, badgeCode: optionalText(row.badgeCode) };
}

function parseSpin(value: unknown): EventSpinResult {
  const row = record(value);
  const spinId = text(row?.spinId);
  const eventId = text(row?.eventId);
  const spinDate = text(row?.spinDate);
  const sourceType = text(row?.sourceType)?.toUpperCase() as "DAILY" | "BONUS";
  const tierId = text(row?.tierId);
  const rewardType = text(row?.rewardType)?.toUpperCase();
  const rewardAmount = number(row?.rewardAmount);
  const rewardName = text(row?.rewardName);
  const downgraded = bool(row?.downgraded);
  const downgradeReason = text(row?.downgradeReason);
  if (!row || !spinId || !eventId || !spinDate || !["DAILY", "BONUS"].includes(sourceType)
      || !tierId || !rewardType || rewardAmount === null || !rewardName
      || downgraded === null || !downgradeReason) {
    return invalid("EVENT_SPIN_RESPONSE_INVALID");
  }
  return {
    spinId,
    eventId,
    spinDate,
    sourceType,
    tierId,
    rewardType,
    rewardAmount,
    rewardName,
    downgraded,
    downgradeReason,
  };
}

function parseSpinState(value: unknown): EventSpinState {
  const row = record(value);
  const eventCode = text(row?.eventCode);
  const eventId = text(row?.eventId);
  const serverDate = text(row?.serverDate);
  const nextResetAtUtc = text(row?.nextResetAtUtc);
  const freeAvailable = bool(row?.freeAvailable);
  const bonusTickets = number(row?.bonusTickets);
  const availableSpins = number(row?.availableSpins);
  const source = text(row?.source);
  if (!row || !eventCode || !eventId || !serverDate || !nextResetAtUtc
      || freeAvailable === null || bonusTickets === null || availableSpins === null
      || !source || !Array.isArray(row.segments) || !Array.isArray(row.history)) {
    return invalid("EVENT_SPIN_STATE_RESPONSE_INVALID");
  }
  const segments = row.segments.map((value) => {
    const segment = record(value);
    const tierId = text(segment?.tierId);
    const rewardType = text(segment?.rewardType)?.toUpperCase();
    const rewardAmount = number(segment?.rewardAmount);
    const rewardName = text(segment?.rewardName);
    const realOutflow = bool(segment?.realOutflow);
    const displayOrder = number(segment?.displayOrder);
    if (!segment || !tierId || !rewardType || rewardAmount === null || !rewardName
        || realOutflow === null || displayOrder === null) {
      return invalid("EVENT_SPIN_SEGMENT_INVALID");
    }
    return { tierId, rewardType, rewardAmount, rewardName, realOutflow, displayOrder };
  });
  const history = row.history.map((value) => {
    const item = record(value);
    const spinId = text(item?.spinId);
    const spinDate = text(item?.spinDate);
    const sourceType = text(item?.sourceType)?.toUpperCase() as "DAILY" | "BONUS";
    const tierId = text(item?.tierId);
    const rewardType = text(item?.rewardType)?.toUpperCase();
    const rewardAmount = number(item?.rewardAmount);
    const rewardName = text(item?.rewardName);
    const downgraded = bool(item?.downgraded);
    const downgradeReason = text(item?.downgradeReason);
    const awardedAt = text(item?.awardedAt);
    if (!item || !spinId || !spinDate || !["DAILY", "BONUS"].includes(sourceType)
        || !tierId || !rewardType || rewardAmount === null || !rewardName
        || downgraded === null || !downgradeReason || !awardedAt) {
      return invalid("EVENT_SPIN_HISTORY_INVALID");
    }
    return {
      spinId, spinDate, sourceType, tierId, rewardType, rewardAmount,
      rewardName, downgraded, downgradeReason, awardedAt,
    };
  });
  return {
    eventCode, eventId, serverDate, nextResetAtUtc, freeAvailable,
    bonusTickets, availableSpins, segments, history, source,
  };
}

export function createEventsApi(client: ApiClient): EventsApi {
  const code = (value: string) => encodeURIComponent(required(value, "EVENT_CODE_REQUIRED"));
  const key = (value: string) => required(value, "EVENT_IDEMPOTENCY_KEY_REQUIRED");
  return {
    state: async () => parseSnapshot(await client.request({ method: "GET", path: "/api/events" })),
    spinState: async (eventCode) => parseSpinState(await client.request({
      method: "GET",
      path: `/api/events/${code(eventCode)}/spin/state`,
    })),
    join: async (eventCode, idempotencyKey) => parseJoin(await client.request({
      method: "POST",
      path: `/api/events/${code(eventCode)}/join`,
      idempotencyKey: key(idempotencyKey),
    })),
    claim: async (eventCode, idempotencyKey) => parseClaim(await client.request({
      method: "POST",
      path: `/api/events/${code(eventCode)}/claim`,
      idempotencyKey: key(idempotencyKey),
    })),
    spin: async (eventCode, idempotencyKey) => parseSpin(await client.request({
      method: "POST",
      path: `/api/events/${code(eventCode)}/spin`,
      idempotencyKey: key(idempotencyKey),
    })),
  };
}
