import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type CanonicalNotificationPriority = "critical" | "high" | "normal" | "low";

export interface CanonicalNotification {
  id: number;
  kind: string;
  priority: CanonicalNotificationPriority;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  createdAt: number;
  readAt: number | null;
}

export interface CanonicalNotificationPage {
  items: CanonicalNotification[];
  nextCursor: string | null;
  unread: number;
}

export interface NotificationActionResult {
  notificationId: number;
  action: "cta" | "swipe_conversion";
  route: string;
  recorded: boolean;
}

export interface NotificationApi {
  page(cursor?: string, limit?: number): Promise<CanonicalNotificationPage>;
  markRead(notificationId: number): Promise<void>;
  markAllRead(): Promise<number>;
  clearRead(): Promise<number>;
  recordAction(
    notificationId: number,
    action: "cta" | "swipe_conversion",
    idempotencyKey: string,
  ): Promise<NotificationActionResult>;
}

function invalid(message = "NOTIFICATION_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, allowEmpty = false): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || allowEmpty ? normalized : null;
}

function integer(value: unknown, min = 0): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min ? parsed : null;
}

function timestamp(value: unknown, nullable = false): number | null {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNotification(value: unknown): CanonicalNotification {
  const row = record(value);
  const id = integer(row?.id, 1);
  const kind = text(row?.kind);
  const priority = text(row?.priority)?.toLowerCase() as CanonicalNotificationPriority;
  const title = text(row?.title);
  const body = text(row?.body, true);
  const ctaLabel = text(row?.ctaLabel, true);
  const ctaHref = text(row?.ctaHref, true);
  const createdAt = timestamp(row?.createdAt);
  const readAt = timestamp(row?.readAt, true);
  if (!row || id === null || !kind || !["critical", "high", "normal", "low"].includes(priority)
      || !title || body === null || ctaLabel === null || ctaHref === null
      || createdAt === null || (row.readAt != null && readAt === null)) {
    return invalid();
  }
  return { id, kind: kind.toLowerCase(), priority, title, body, ctaLabel, ctaHref, createdAt, readAt };
}

function parsePage(value: unknown): CanonicalNotificationPage {
  const row = record(value);
  const unread = integer(row?.unread);
  const nextCursor = row?.nextCursor == null ? null : text(row.nextCursor);
  if (!row || !Array.isArray(row.items) || unread === null
      || (row.nextCursor != null && nextCursor === null)) {
    return invalid();
  }
  const items = row.items.map(parseNotification);
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) {
    return invalid("NOTIFICATION_PAGE_INCONSISTENT");
  }
  return { items, nextCursor, unread };
}

function parseCount(value: unknown): number {
  return integer(value) ?? invalid("NOTIFICATION_COUNT_INVALID");
}

function parseAction(value: unknown): NotificationActionResult {
  const row = record(value);
  const notificationId = integer(row?.notificationId, 1);
  const action = text(row?.action) as NotificationActionResult["action"];
  const route = text(row?.route);
  if (!row || notificationId === null || !["cta", "swipe_conversion"].includes(action)
      || !route || typeof row.recorded !== "boolean") {
    return invalid("NOTIFICATION_ACTION_RESPONSE_INVALID");
  }
  return { notificationId, action, route, recorded: row.recorded };
}

function requiredId(value: number): number {
  return integer(value, 1) ?? invalid("NOTIFICATION_ID_INVALID");
}

function requiredKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128) {
    return invalid("NOTIFICATION_IDEMPOTENCY_KEY_INVALID");
  }
  return normalized;
}

export function createNotificationApi(client: ApiClient): NotificationApi {
  return {
    page: async (cursor, limit = 100) => {
      const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(limit, 100))) });
      const normalizedCursor = cursor?.trim() || "";
      if (normalizedCursor) params.set("cursor", normalizedCursor);
      const page = parsePage(await client.request({
        method: "GET",
        path: `/api/notifications?${params.toString()}`,
      }));
      if (!normalizedCursor && page.nextCursor === null
          && page.unread > page.items.filter((item) => item.readAt === null).length) {
        return invalid("NOTIFICATION_PAGE_INCONSISTENT");
      }
      return page;
    },
    markRead: async (notificationId) => {
      await client.request({
        method: "POST",
        path: `/api/notifications/${requiredId(notificationId)}/read`,
      });
    },
    markAllRead: async () => parseCount(await client.request({
      method: "POST",
      path: "/api/notifications/read-all",
    })),
    clearRead: async () => parseCount(await client.request({
      method: "DELETE",
      path: "/api/notifications/read",
    })),
    recordAction: async (notificationId, action, idempotencyKey) => {
      const expectedId = requiredId(notificationId);
      const result = parseAction(await client.request({
        method: "POST",
        path: `/api/notifications/${expectedId}/actions`,
        idempotencyKey: requiredKey(idempotencyKey),
        body: { action },
      }));
      if (result.notificationId !== expectedId || result.action !== action) {
        return invalid("NOTIFICATION_ACTION_RESPONSE_MISMATCH");
      }
      return result;
    },
  };
}
