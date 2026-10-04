import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type BehaviorDevice = "APP" | "H5" | "MP";
export type BehaviorZone = "TOP" | "MAIN_CTA" | "CONTENT" | "BOTTOM";

type BehaviorCommon = {
  clientEventId: string;
  sessionId: string;
  route: string;
  clientTs: number;
  deviceType: BehaviorDevice;
  locale: string;
};

export type BehaviorEvent =
  | (BehaviorCommon & {
      eventName: "app.page_viewed";
      dwellMs: number;
      xNorm?: never;
      yNorm?: never;
      zone?: never;
      elementId?: never;
    })
  | (BehaviorCommon & {
      eventName: "app.element_clicked";
      dwellMs?: never;
      xNorm: number;
      yNorm: number;
      zone: BehaviorZone;
      elementId?: string;
    })
  | (BehaviorCommon & {
      eventName: "store.viewed";
      dwellMs?: never;
      xNorm?: never;
      yNorm?: never;
      zone?: never;
      elementId?: never;
    });

export type BehaviorReceipt = {
  accepted: boolean;
  duplicate: boolean;
  backfilled?: boolean;
  sampledIn?: boolean;
  eventId?: string;
};

export interface BehaviorAnalyticsApi {
  ingest(event: BehaviorEvent): Promise<BehaviorReceipt>;
}

const HEX_32 = /^[a-f0-9]{32}$/;
const ROUTE = /^\/pages\/[a-z0-9-]+\/[a-z0-9-]+$/;
const ELEMENT = /^[a-z][a-z0-9_-]{0,63}$/;
const LOCALE = /^(?:und|[a-z]{2}(?:-[A-Z]{2})?)$/;
const ZONES = new Set<BehaviorZone>(["TOP", "MAIN_CTA", "CONTENT", "BOTTOM"]);
const PAGE_EVENT_FIELDS = new Set(["clientEventId", "eventName", "sessionId", "route", "dwellMs", "clientTs", "deviceType", "locale"]);
const CLICK_EVENT_FIELDS = new Set(["clientEventId", "eventName", "sessionId", "route", "xNorm", "yNorm", "zone", "elementId", "clientTs", "deviceType", "locale"]);
const STORE_EVENT_FIELDS = new Set(["clientEventId", "eventName", "sessionId", "route", "clientTs", "deviceType", "locale"]);

function invalid(message: string): never {
  throw new ApiError({ kind: "protocol", message });
}

function hasOnlyFields(event: BehaviorEvent, allowed: Set<string>): boolean {
  return Object.keys(event).every((key) => allowed.has(key));
}

function validEvent(event: BehaviorEvent): boolean {
  if (
    !HEX_32.test(event.clientEventId)
    || !HEX_32.test(event.sessionId)
    || !ROUTE.test(event.route)
    || !Number.isSafeInteger(event.clientTs)
    || !["APP", "H5", "MP"].includes(event.deviceType)
    || !LOCALE.test(event.locale)
  ) return false;
  if (event.eventName === "app.page_viewed") {
    return hasOnlyFields(event, PAGE_EVENT_FIELDS)
      && Number.isSafeInteger(event.dwellMs) && event.dwellMs >= 0 && event.dwellMs <= 86_400_000;
  }
  if (event.eventName === "store.viewed") {
    return event.route === "/pages/store/store" && hasOnlyFields(event, STORE_EVENT_FIELDS);
  }
  if (event.eventName !== "app.element_clicked") return false;
  return hasOnlyFields(event, CLICK_EVENT_FIELDS)
    && Number.isFinite(event.xNorm) && event.xNorm >= 0 && event.xNorm <= 1
    && Number.isFinite(event.yNorm) && event.yNorm >= 0 && event.yNorm <= 1
    && ZONES.has(event.zone)
    && (event.elementId === undefined || ELEMENT.test(event.elementId));
}

function receipt(value: unknown): BehaviorReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid("L6_INGEST_RESPONSE_INVALID");
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.accepted !== "boolean"
    || typeof row.duplicate !== "boolean"
    || (row.backfilled !== undefined && typeof row.backfilled !== "boolean")
    || (row.sampledIn !== undefined && typeof row.sampledIn !== "boolean")
    || (row.eventId !== undefined && (typeof row.eventId !== "string" || !row.eventId))
    || (row.accepted && (row.duplicate || (row.sampledIn !== false && typeof row.eventId !== "string")))
    || (!row.accepted && !row.duplicate)
    || row.source !== undefined || row.sourceEnvironment !== undefined
    || row.runId !== undefined || row.observationToken !== undefined
  ) return invalid("L6_INGEST_RESPONSE_INVALID");
  return {
    accepted: row.accepted,
    duplicate: row.duplicate,
    ...(row.backfilled === undefined ? {} : { backfilled: row.backfilled }),
    ...(row.sampledIn === undefined ? {} : { sampledIn: row.sampledIn }),
    ...(row.eventId === undefined ? {} : { eventId: row.eventId }),
  };
}

export function createBehaviorAnalyticsApi(client: ApiClient): BehaviorAnalyticsApi {
  return {
    async ingest(event) {
      if (!validEvent(event)) return invalid("L6_EVENT_PAYLOAD_INVALID");
      return receipt(await client.request<unknown>({
        method: "POST",
        path: "/api/app/analytics/events",
        body: event,
      }));
    },
  };
}
