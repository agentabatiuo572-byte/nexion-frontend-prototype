import { describe, expect, it } from "vitest";
import type { ApiClient } from "@/api/api-client";
import { createPlatformConfigApi } from "@/api/platform-config-api";

const { demoShareOverride, withDemoShareChannels } = await import(new URL("../../scripts/lib/prototype-demo-share.mjs", import.meta.url).href);
const { fixture } = await import(new URL("../../scripts/lib/design-review-fixture.mjs", import.meta.url).href);
const url = (path: string) => new URL(path, "http://127.0.0.1:5197");

describe("isolated share demo override", () => {
  it.each(["zh", "en", "vi"])("passes the real platform API contract in %s", async locale => {
    const state = { dataState: "normal" };
    const request = { method: () => "GET" };
    const client = { request: async ({ path }: { path: string }) =>
      demoShareOverride(url(path), locale, state, request) ?? fixture(url(path), locale, state, request),
    } as ApiClient;
    const config = await createPlatformConfigApi(client, "dev").platformConfig();
    expect(config.share.channels).toEqual([
      { key: "copy", intentType: "copy", enabled: true },
      { key: "poster", intentType: "poster", enabled: true },
      { key: "system", intentType: "system", enabled: true },
    ]);
    expect(config.share.baseUrl).toBe(fixture(url("/api/config/platform"), locale, state, request).share.baseUrl);
  });

  it("leaves the base fixture and unrelated fields untouched across empty/recovery reads", () => {
    const endpoint = url("/api/config/platform?officialLinkFragments=true");
    const base = fixture(endpoint, "zh", {}, undefined);
    const before = structuredClone(base);
    const normal = demoShareOverride(endpoint, "zh", { dataState: "normal" });
    expect(normal).toEqual({ ...before, share: { ...before.share, channels: normal.share.channels } });
    normal.share.channels[0].enabled = false;
    expect(demoShareOverride(endpoint, "zh", { dataState: "empty" }).share.channels).toEqual([]);
    expect(demoShareOverride(endpoint, "zh", { dataState: "normal" }).share.channels[0].enabled).toBe(true);
    expect(base).toEqual(before);
    expect(base.share.channels).toEqual([]);
  });

  it("does not intercept writes, other reads or issue a share receipt", () => {
    expect(demoShareOverride(url("/api/config/platform"), "zh", {}, { method: () => "POST" })).toBeUndefined();
    for (const path of ["/api/share/event", "/api/config/referral-rewards", "/api/orders", "/api/quests/state"]) {
      expect(demoShareOverride(url(path), "zh", {}, { method: () => "GET" })).toBeUndefined();
      expect(demoShareOverride(url(path), "zh", {}, { method: () => "POST" })).toBeUndefined();
    }
  });

  it("preserves a caller's existing platform overrides when integrating the transform", () => {
    const platform = structuredClone(fixture(url("/api/config/platform"), "en", {}));
    platform.share.baseUrl = "https://demo.uvel.example/ref/";
    platform.featureFlags.homeNewcomerTasksEnabled = false;
    const before = structuredClone(platform);
    const result = withDemoShareChannels(platform, { dataState: "normal" });
    expect(result).toEqual({ ...before, share: { ...before.share, channels: result.share.channels } });
    expect(result.share.channels).toHaveLength(3);
    expect(platform).toEqual(before);
  });
});
