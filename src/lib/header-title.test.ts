import { describe, expect, it } from "vitest";
import { routeFromH5Hash } from "./header-title";

describe("routeFromH5Hash", () => {
  it("uses the visible H5 route instead of a stale uni page stack entry", () => {
    expect(routeFromH5Hash("#/pages/me/notifications?from=bell"))
      .toBe("pages/me/notifications");
  });

  it("returns an empty route for hashes that are not UniApp pages", () => {
    expect(routeFromH5Hash("#section")).toBe("");
  });
});
