import { describe, expect, it } from "vitest";

const earn = (import.meta.glob("./earn/earn.vue", { query: "?raw", import: "default", eager: true })["./earn/earn.vue"] ?? "") as string;
const store = (import.meta.glob("./store/store.vue", { query: "?raw", import: "default", eager: true })["./store/store.vue"] ?? "") as string;
const detail = (import.meta.glob("./store/detail.vue", { query: "?raw", import: "default", eager: true })["./store/detail.vue"] ?? "") as string;

describe("Day One page observation wiring", () => {
  it("records only after authenticated, visible, successful authority reads", () => {
    expect(earn).toContain("app.homeTruthStatus !== \"ready\"");
    expect(earn).toContain("app.remoteFleetStatus !== \"ready\"");
    expect(earn).toContain("dayOnePageObservationApi.earnPage");
    expect(store).toContain("catalogStatus.value !== \"ready\"");
    expect(store).toContain("dayOnePageObservationApi.storePage");
    expect(detail).toContain("canonicalProduct.id !== \"stellarbox-s1\"");
    expect(detail).toContain("dayOnePageObservationApi.s1Roi");
    for (const source of [earn, store, detail]) {
      expect(source).toContain("authenticatedPageObservationReporter.report");
      expect(source).toContain("isCurrent: isCurrentAccountScope");
    }
  });
});
