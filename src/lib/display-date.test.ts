import { afterEach, expect, it, vi } from "vitest";
import { displayTimestamp, formatCalendarDate, formatDisplayDate, formatDisplayDateTime, formatDisplayTime } from "./display-date";
import { formatBankDateTime } from "./bank-date";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each([
  ["zh", "2026/10/26"], ["en", "Oct 26, 2026"], ["vi", "26/10/2026"],
])("formats %s local events without native Intl, retaining minute/second precision", (locale, day) => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  expect(new Date("2026-12-31T16:05:06Z").getTimezoneOffset()).toBe(-540);
  vi.stubGlobal("Intl", undefined);
  const native = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(() => { throw new Error("native locale unavailable"); });
  const timestamp = Date.parse("2026-10-26T04:05:06Z");
  expect(formatDisplayDate(timestamp, locale)).toBe(day);
  expect(formatDisplayDateTime(timestamp, locale)).toBe(`${day} 13:05`);
  expect(formatDisplayDateTime(timestamp, locale, true)).toBe(`${day} 13:05:06`);
  expect(formatDisplayTime(timestamp)).toBe("13:05");
  expect(native).not.toHaveBeenCalled();
});

it.each(["Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati"])("never changes a calendar-only date in %s", zone => {
  vi.stubEnv("TZ", zone);
  expect(new Date("2026-01-01T00:00:00Z").getTimezoneOffset()).toBe(({ "Asia/Tokyo": -540, "America/Los_Angeles": 480, "Pacific/Kiritimati": -840 } as Record<string, number>)[zone]);
  expect(formatCalendarDate("2026-01-01", "zh")).toBe("2026/01/01");
  expect(formatDisplayDate("2026-01-01", "en")).toBe("Jan 1, 2026");
  expect(formatDisplayDateTime("2026-01-01", "vi")).toBe("01/01/2026");
  expect(formatCalendarDate("2028-02-29", "vi")).toBe("29/02/2028");
  expect(formatCalendarDate("2026-02-29", "vi")).toBe("—");
});

it("keeps instants across local year boundaries, Java +08 values, UTC and bank UTC+7", () => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  expect(new Date("2026-12-31T16:05:06Z").getTimezoneOffset()).toBe(-540);
  const instant = "2026-12-31T16:05:06Z";
  expect(formatDisplayDateTime(instant, "en", true)).toBe("Jan 1, 2027 01:05:06");
  expect(formatDisplayDateTime(instant, "zh", true, 0)).toBe("2026/12/31 16:05:06");
  expect(formatBankDateTime(instant, "vi")).toBe("31/12/2026 23:05:06 UTC+7");
  expect(formatDisplayDateTime("2027-01-01 00:05:06", "zh", true)).toBe("2027/01/01 01:05:06");
  expect(displayTimestamp("2027-01-01 00:05:06")).toBe(displayTimestamp(instant));
  vi.stubEnv("TZ", "America/Los_Angeles");
  expect(new Date("2026-12-31T16:05:06Z").getTimezoneOffset()).toBe(480);
  expect(formatDisplayDateTime(instant, "en", true)).toBe("Dec 31, 2026 08:05:06");
  expect(formatBankDateTime(instant, "vi")).toBe("31/12/2026 23:05:06 UTC+7");
});

it.each([undefined, null, 0, -1, -1000, "1970-01-01T00:00:00Z", "", "not-a-date", "2026-02-29", "2026-02-29T01:02:03Z", "2026-10-26T25:00:00Z", "1792987200", NaN, Infinity, 9e18])("keeps invalid input %s unknown without guessing seconds", value => {
  expect(formatDisplayDate(value, "zh")).toBe("—");
  expect(formatDisplayDateTime(value, "en", true)).toBe("—");
  expect(formatDisplayTime(value)).toBe("—");
});

it("treats zero/negative event timestamps as missing and retains the declared millisecond unit", () => {
  vi.stubEnv("TZ", "UTC");
  expect(displayTimestamp(0)).toBe(null);
  expect(formatDisplayDateTime(0, "en", true)).toBe("—");
  expect(displayTimestamp(1000)).toBe(1000);
  expect(formatDisplayTime(1000, true)).toBe("00:00:01");
  expect(formatDisplayDateTime(8.64e15, "zh", true, 420)).toBe("—");
});
