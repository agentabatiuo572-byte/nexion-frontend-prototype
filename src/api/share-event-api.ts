import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";

export type ShareEventChannel = "telegram" | "zalo" | "whatsapp" | "messenger" | "sms" | "x" | "copy" | "poster" | "system" | "code" | "link";
export type ShareEventSurface = "team_hero" | "poster_sheet" | "share_sheet" | "proof";

export interface ShareEventRequest {
  eventId: string;
  channel: ShareEventChannel;
  surface: ShareEventSurface;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

export interface ShareEventResult {
  eventId: string;
  questCode: string;
  status: "COMPLETED" | "CLAIMABLE" | "CLAIMED";
  replay: boolean;
  serverCanonical: true;
  source: string;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

function invalid(message = "SHARE_EVENT_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parse(value: unknown, mode: ApiEnvironment, expectedEventId: string): ShareEventResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Partial<ShareEventResult>;
  const eventId = text(row.eventId);
  const questCode = text(row.questCode);
  const status = text(row.status)?.toUpperCase() as ShareEventResult["status"];
  const source = text(row.source);
  const sourceEnvironment = text(row.sourceEnvironment)?.toUpperCase() as ShareEventResult["sourceEnvironment"];
  const runId = typeof row.runId === "string" ? row.runId : "";
  if (!eventId || eventId !== expectedEventId || !questCode || !source
      || row.serverCanonical !== true || typeof row.replay !== "boolean"
      || !["COMPLETED", "CLAIMABLE", "CLAIMED"].includes(status)
      || !["dev", "prod"].includes(mode)
      || sourceEnvironment !== "PRODUCTION" || runId !== "") return invalid();
  return { eventId, questCode, status, replay: row.replay, serverCanonical: true,
    source, sourceEnvironment, runId };
}

function required(value: string, message: string): string {
  if (!value || !value.trim()) throw new ApiError({ kind: "protocol", message });
  return value.trim();
}

export interface ShareEventApi {
  record(request: ShareEventRequest, idempotencyKey: string): Promise<ShareEventResult>;
}

export function createShareEventApi(client: ApiClient, mode: ApiEnvironment = "prod"): ShareEventApi {
  return {
    record: async (request, idempotencyKey) => {
      const eventId = required(request.eventId, "SHARE_EVENT_ID_REQUIRED");
      const response = await client.request({
        method: "POST", path: "/api/share/event", body: request,
        idempotencyKey: required(idempotencyKey, "SHARE_IDEMPOTENCY_KEY_REQUIRED"),
      });
      return parse(response, mode, eventId);
    },
  };
}
