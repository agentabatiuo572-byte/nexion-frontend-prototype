import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createShareEventApi } from "./share-event-api";

const EVENT_ID = "share-event-20260824";

function response(sourceEnvironment: "PRODUCTION" | "SANDBOX", runId: string) {
  return {
    eventId: EVENT_ID,
    questCode: "H3_REFERRAL_SETTLED",
    status: "COMPLETED",
    replay: false,
    serverCanonical: true,
    source: "nx_share_event",
    sourceEnvironment,
    runId,
  };
}

describe("share event environment provenance", () => {
  it.each(["dev", "prod"] as const)("accepts Java canonical production facts in %s", async (mode) => {
    const request = vi.fn().mockResolvedValue(response("PRODUCTION", ""));
    await expect(createShareEventApi({ request } as unknown as ApiClient, mode).record({
      eventId: EVENT_ID,
      channel: "copy",
      surface: "team_hero",
      sourceEnvironment: "PRODUCTION",
      runId: "",
    }, `share-event:${EVENT_ID}`)).resolves.toMatchObject({
      sourceEnvironment: "PRODUCTION",
      runId: "",
    });
  });

  it.each(["dev", "prod"] as const)("rejects sandbox facts in %s", async (mode) => {
    const request = vi.fn().mockResolvedValue(response("SANDBOX", "catalog-run-20260824"));
    await expect(createShareEventApi({ request } as unknown as ApiClient, mode).record({
      eventId: EVENT_ID,
      channel: "copy",
      surface: "team_hero",
      sourceEnvironment: "PRODUCTION",
      runId: "",
    }, `share-event:${EVENT_ID}`)).rejects.toMatchObject({ kind: "protocol" });
  });
});
