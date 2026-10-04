import { describe, expect, it, vi } from "vitest";
import { formatJoinedDate } from "./profile-date";

describe("profile joined date", () => {
  it("does not render the Unix epoch when the backend has no join timestamp", () => {
    expect(formatJoinedDate(0, "en-US")).toBe("—");
    expect(formatJoinedDate(Number.NaN, "en-US")).toBe("—");
    expect(formatJoinedDate(Number.POSITIVE_INFINITY, "vi-VN")).toBe("—");
    expect(formatJoinedDate(Number.MAX_VALUE, "zh-CN")).toBe("—");
  });

  it("uses local calendar fields for each shipped language when native Intl is unavailable", () => {
    const joinedAt = new Date(2026, 8, 11, 12).getTime();
    const spy = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(() => "Fri Sep 11 2026");
    try {
      expect(formatJoinedDate(joinedAt, "vi-VN")).toBe("11 thg 9, 2026");
      expect(formatJoinedDate(joinedAt, "zh-CN")).toBe("2026/09/11");
      expect(formatJoinedDate(joinedAt, "en-US")).toBe("Sep 11, 2026");
    } finally {
      spy.mockRestore();
    }
  });
});
