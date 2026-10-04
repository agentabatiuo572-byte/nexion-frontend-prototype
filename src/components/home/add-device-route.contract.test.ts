import { describe, expect, it } from "vitest";
import { resolveAddDeviceRoute } from "./add-device-route";

describe("home add-device route", () => {
  it("opens the canonical detail only when the recommended product exists", () => {
    expect(resolveAddDeviceRoute("stellarbox-pro", () => true)).toBe("/pages/store/detail?id=stellarbox-pro");
  });

  it("falls back to the live catalog when the legacy recommendation is absent", () => {
    expect(resolveAddDeviceRoute("stellarbox-s1", () => false)).toBe("/pages/store/store");
  });
});
