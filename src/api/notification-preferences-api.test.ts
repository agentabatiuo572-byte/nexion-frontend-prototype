import { describe, expect, it, vi } from "vitest";
import type { ApiError } from "./errors";
import { createNotificationPreferencesApi } from "./notification-preferences-api";

describe("notification preferences API", () => {
  it("reads account-scoped category switches from the server", async () => {
    const request = vi.fn().mockResolvedValue({
      commission: false, team: true, staking: true, market: true, genesis: true, system: true,
    });
    const api = createNotificationPreferencesApi({ request } as never);

    await expect(api.get()).resolves.toEqual({
      commission: false, team: true, staking: true, market: true, genesis: true, system: true,
    });
    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/me/notification-preferences" });
  });

  it("patches only category switches and rejects malformed server state", async () => {
    const request = vi.fn().mockResolvedValue({
      commission: false, team: true, staking: true, market: true, genesis: true, system: true,
    });
    const api = createNotificationPreferencesApi({ request } as never);

    await expect(api.patch({ commission: false })).resolves.toMatchObject({ commission: false });
    expect(request).toHaveBeenCalledWith({
      method: "PATCH", path: "/api/me/notification-preferences", body: { commission: false },
    });

    request.mockResolvedValueOnce({ commission: false });
    await expect(api.get()).rejects.toMatchObject({
      kind: "protocol", message: "NOTIFICATION_PREFERENCES_RESPONSE_INVALID",
    } satisfies Partial<ApiError>);
  });

  it("rejects unknown categories and an empty patch before making a request", async () => {
    const request = vi.fn();
    const api = createNotificationPreferencesApi({ request } as never);

    await expect(api.patch({ unknown: true } as never)).rejects.toMatchObject({
      kind: "protocol", message: "NOTIFICATION_PREFERENCES_PATCH_INVALID",
    });
    await expect(api.patch({})).rejects.toMatchObject({
      kind: "protocol", message: "NOTIFICATION_PREFERENCES_PATCH_EMPTY",
    });
    expect(request).not.toHaveBeenCalled();
  });
});
