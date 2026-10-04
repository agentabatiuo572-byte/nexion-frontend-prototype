import { describe, expect, it } from "vitest";
const source = (import.meta.glob("./intro.vue", {
  query: "?raw", import: "default", eager: true,
})["./intro.vue"] ?? "") as string;

describe("onboarding intro public fleet authority", () => {
  it("renders the H9 public fleet before authentication instead of waiting on home truth", () => {
    expect(source).toContain("const devices = ref(fleetNow())");
    expect(source).toContain("devices.value = fleetNow()");
    expect(source).not.toContain("devices.value = app.homeTruth?.onboarding.activeDevices");
  });
});
