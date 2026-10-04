import { expect, test, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createBehaviorAnalyticsApi, type BehaviorEvent } from "./behavior-analytics-api";

const storeView: BehaviorEvent = {
  clientEventId: "e".repeat(32),
  eventName: "store.viewed",
  sessionId: "a".repeat(32),
  route: "/pages/store/store",
  clientTs: 1_700_000_000_000,
  deviceType: "H5",
  locale: "zh-CN",
};

test("store conversion uses the authenticated analytics endpoint and rejects client actor or alternate route", async () => {
  const request = vi.fn().mockResolvedValue({ accepted: true, duplicate: false, eventId: "server-event" });
  const api = createBehaviorAnalyticsApi({ request } as unknown as ApiClient);

  await expect(api.ingest(storeView)).resolves.toMatchObject({ accepted: true, eventId: "server-event" });
  expect(request).toHaveBeenCalledWith({
    method: "POST", path: "/api/app/analytics/events", body: storeView,
  });
  await expect(api.ingest({ ...storeView, user_id: 999 } as BehaviorEvent)).rejects.toThrow("L6_EVENT_PAYLOAD_INVALID");
  await expect(api.ingest({ ...storeView, route: "/pages/store/detail" })).rejects.toThrow("L6_EVENT_PAYLOAD_INVALID");
  await expect(api.ingest({ ...storeView, eventName: "store.purchased" } as unknown as BehaviorEvent))
    .rejects.toThrow("L6_EVENT_PAYLOAD_INVALID");
  expect(request).toHaveBeenCalledTimes(1);
});
