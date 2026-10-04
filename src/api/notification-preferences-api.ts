import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type NotificationPreferenceKey = "commission" | "team" | "staking" | "market" | "genesis" | "system";
export type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;
export type NotificationPreferencesPatch = Partial<NotificationPreferences>;

export interface NotificationPreferencesApi {
  get(): Promise<NotificationPreferences>;
  patch(value: NotificationPreferencesPatch): Promise<NotificationPreferences>;
}

const KEYS: NotificationPreferenceKey[] = ["commission", "team", "staking", "market", "genesis", "system"];

function parse(value: unknown): NotificationPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError({ kind: "protocol", message: "NOTIFICATION_PREFERENCES_RESPONSE_INVALID" });
  }
  const row = value as Record<string, unknown>;
  if (KEYS.some((key) => typeof row[key] !== "boolean")) {
    throw new ApiError({ kind: "protocol", message: "NOTIFICATION_PREFERENCES_RESPONSE_INVALID" });
  }
  return Object.fromEntries(KEYS.map((key) => [key, row[key]])) as NotificationPreferences;
}

function patchBody(value: NotificationPreferencesPatch): NotificationPreferencesPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError({ kind: "protocol", message: "NOTIFICATION_PREFERENCES_PATCH_INVALID" });
  }
  const keys = Object.keys(value);
  if (keys.length === 0) {
    throw new ApiError({ kind: "protocol", message: "NOTIFICATION_PREFERENCES_PATCH_EMPTY" });
  }
  if (keys.some((key) => !KEYS.includes(key as NotificationPreferenceKey))) {
    throw new ApiError({ kind: "protocol", message: "NOTIFICATION_PREFERENCES_PATCH_INVALID" });
  }
  const body: NotificationPreferencesPatch = {};
  for (const key of KEYS) {
    if (key in value) {
      if (typeof value[key] !== "boolean") {
        throw new ApiError({ kind: "protocol", message: "NOTIFICATION_PREFERENCES_PATCH_INVALID" });
      }
      body[key] = value[key];
    }
  }
  return body;
}

export function createNotificationPreferencesApi(client: ApiClient): NotificationPreferencesApi {
  return {
    async get() {
      return parse(await client.request({ method: "GET", path: "/api/me/notification-preferences" }));
    },
    async patch(value) {
      return parse(await client.request({
        method: "PATCH", path: "/api/me/notification-preferences", body: patchBody(value),
      }));
    },
  };
}
