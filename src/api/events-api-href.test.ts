import { describe, expect, it, vi } from "vitest";
import { createEventsApi, isValidEventHref } from "./events-api";

describe("isValidEventHref", () => {
  it.each([
    "",
    "/pages/store/store",
    "/pages/me/wallet-repurchase",
    "/pages/team/leaderboard",
  ])("accepts the supported in-app event route %s", (href) => {
    expect(isValidEventHref(href)).toBe(true);
  });

  it.each([
    "https://example.com",
    "javascript:alert(1)",
    "//example.com/path",
    "/pages/../store/store",
    "/pages/store/./detail",
    "/pages//store",
  ])("rejects an unsafe or ambiguous event route %s", (href) => {
    expect(isValidEventHref(href)).toBe(false);
  });

  it("preserves a canonical non-NEX claim receipt without coercing its asset", async () => {
    const request = vi.fn().mockResolvedValue({
      eventId: "usdt-boost",
      rewardType: "USDT",
      rewardAmount: 12.5,
      badgeCode: null,
    });
    const api = createEventsApi({ request } as never);

    await expect(api.claim("usdt-boost", "event-claim-usdt-boost"))
      .resolves.toEqual({ eventId: "usdt-boost", rewardType: "USDT", rewardAmount: 12.5, badgeCode: null });
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/events/usdt-boost/claim",
      idempotencyKey: "event-claim-usdt-boost",
    });
  });
});
