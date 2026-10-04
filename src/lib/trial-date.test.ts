import { afterEach, describe, expect, it, vi } from "vitest";
import appSource from "../App.vue?raw";
import { formatTrialDate, formatTrialDateTime } from "./trial-date";

afterEach(() => vi.unstubAllEnvs());

describe("trial dates", () => {
  it("renders numeric dates on Android and keeps the local date of the server instant", () => {
    const serverInstant = Date.parse("2026-09-25T17:30:04Z");
    vi.stubEnv("TZ", "Asia/Ho_Chi_Minh");
    expect(formatTrialDate(serverInstant)).toBe("2026-09-26");
    expect(formatTrialDateTime(serverInstant)).toBe("2026-09-26 00:30:04");
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(formatTrialDate(serverInstant)).toBe("2026-09-25");
    expect(formatTrialDateTime(serverInstant)).toBe("2026-09-25 10:30:04");
  });

  it("uses the same formatter in the active-to-grace toast", () => {
    expect(appSource).toContain("formatTrialDateTime(freeTrial.graceEndsAt)");
    expect(appSource).not.toContain("freeTrial.graceEndsAt).toLocaleString(");
  });
});
