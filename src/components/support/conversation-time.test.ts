import { afterEach, describe, expect, it, vi } from "vitest";
import { buildConversationTimeGroups, formatConversationTime, type ConversationTimeOptions } from "./conversation-time";

const instant = (value: string) => Date.parse(value);
const now = instant("2026-10-26T12:00:00Z");
const options: ConversationTimeOptions = { locale: "en", now, timeZone: "UTC" };
const message = (id: string, timestamp?: number) => ({ id, timestamp });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("conversation time labels", () => {
  it.each([
    ["zh", "今天", "昨天", "星期六", "星期二", "2026/10/19", "2025/10/19", "2026/10/26"],
    ["en", "Today", "Yesterday", "Saturday", "Tuesday", "Oct 19, 2026", "Oct 19, 2025", "Oct 26, 2026"],
    ["vi", "Hôm nay", "Hôm qua", "Thứ Bảy", "Thứ Ba", "19/10/2026", "19/10/2025", "26/10/2026"],
  ] as const)("formats all age bands and a complete accessible date in %s", (locale, today, yesterday, twoDays, sixDays, older, otherYear, fullDate) => {
    for (const [date, label] of [
      ["2026-10-26", today], ["2026-10-25", yesterday], ["2026-10-24", twoDays],
      ["2026-10-20", sixDays], ["2026-10-19", older], ["2025-10-19", otherYear],
    ]) {
      expect(formatConversationTime(instant(`${date}T09:07:05Z`), { ...options, locale })?.group).toBe(`${label} 09:07`);
    }
    expect(formatConversationTime(instant("2026-10-26T09:07:05.999Z"), { ...options, locale })).toEqual({
      clock: "09:07", group: `${today} 09:07`, full: `${fullDate} 09:07:05 GMT+00:00`,
    });
  });

  it.each(["zh", "en", "vi"] as const)("uses 24-hour clocks at midnight, noon and evening in %s", locale => {
    for (const hour of [0, 12, 23]) {
      expect(formatConversationTime(instant(`2026-10-25T${String(hour).padStart(2, "0")}:07:45Z`), { ...options, locale })?.clock)
        .toBe(`${String(hour).padStart(2, "0")}:07`);
    }
  });

  it.each([undefined, Number.NaN, Infinity, -Infinity, 0, 0.5, -1, 8_640_000_000_000_001, "1700000000000" as unknown as number])(
    "omits invalid milliseconds %s without substituting now", timestamp => {
      const clock = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("ambient clock must not be read"); });
      expect(formatConversationTime(timestamp, options)).toBeNull();
      expect(Object.keys(buildConversationTimeGroups([message("invalid", timestamp)], options))).toEqual([]);
      expect(clock).not.toHaveBeenCalled();
    },
  );

  it("treats second-sized numbers as milliseconds rather than silently rescaling", () => {
    expect(formatConversationTime(1_700_000_000, options)).toEqual({
      clock: "16:13", full: "Jan 20, 1970 16:13:20 GMT+00:00", group: "Jan 20, 1970 16:13",
    });
  });

  it.each([0, -1, Number.NaN, Infinity])("uses an absolute date when the supplied reference clock is invalid: %s", reference => {
    expect(formatConversationTime(now, { ...options, now: reference })?.group).toBe("Oct 26, 2026 12:00");
  });

  it.each([
    ["2026-10-26T12:00:01Z", "Oct 26, 2026 12:00"],
    ["2026-10-27T09:00:00Z", "Oct 27, 2026 09:00"],
    ["2027-01-01T00:00:00Z", "Jan 1, 2027 00:00"],
  ])("keeps future timestamps explicit and never clamps %s to now", (timestamp, expected) => {
    expect(formatConversationTime(instant(timestamp), options)?.group).toBe(expected);
  });

  it("includes the year across New Year even if the calendar dates are adjacent", () => {
    const reference = { ...options, now: instant("2027-01-01T00:01:00Z") };
    expect(formatConversationTime(instant("2026-12-31T23:59:00Z"), reference)?.group).toBe("Dec 31, 2026 23:59");
    expect(formatConversationTime(reference.now, reference)?.group).toBe("Today 00:01");
  });

  it("uses the requested calendar rather than the UTC date and includes non-hour offsets", () => {
    expect(formatConversationTime(instant("2026-10-25T18:30:05Z"), {
      ...options, now: instant("2026-10-25T19:00:00Z"), timeZone: "Asia/Kathmandu",
    })).toEqual({ clock: "00:15", full: "Oct 26, 2026 00:15:05 GMT+05:45", group: "Today 00:15" });
  });

  it.each([
    ["2026-03-08T05:30:00Z", "2026-03-09T04:30:00Z", 23, "GMT-05:00"],
    ["2026-11-01T04:30:00Z", "2026-11-02T05:30:00Z", 25, "GMT-04:00"],
  ] as const)("uses calendar yesterday across a %s DST day", (timestamp, reference, elapsedHours, offset) => {
    expect((instant(reference) - instant(timestamp)) / 3_600_000).toBe(elapsedHours);
    const result = formatConversationTime(instant(timestamp), { ...options, now: instant(reference), timeZone: "America/New_York" });
    expect(result?.group).toBe("Yesterday 00:30");
    expect(result?.full).toContain(`00:30:00 ${offset}`);
  });

  it("distinguishes the repeated 01:30 by its actual DST offset", () => {
    const reference = { ...options, now: instant("2026-11-01T08:00:00Z"), timeZone: "America/New_York" };
    const early = formatConversationTime(instant("2026-11-01T05:30:00Z"), reference)!;
    const late = formatConversationTime(instant("2026-11-01T06:30:00Z"), reference)!;
    expect(early.clock).toBe("01:30"); expect(late.clock).toBe("01:30");
    expect(early.full).toBe("Nov 1, 2026 01:30:00 GMT-04:00");
    expect(late.full).toBe("Nov 1, 2026 01:30:00 GMT-05:00");
  });

  it.each(["zh", "en", "vi"] as const)("defaults to the device calendar independently of Intl in %s", locale => {
    const local = new Date(2026, 9, 26, 9, 7, 5), reference = new Date(2026, 9, 26, 12).getTime();
    const expected = formatConversationTime(local.getTime(), { locale, now: reference });
    vi.stubGlobal("Intl", undefined);
    const result = formatConversationTime(local.getTime(), { locale, now: reference });
    expect(result).toEqual(expected);
    expect(result?.clock).toBe("09:07");
    expect(result?.full).toMatch(/09:07:05 GMT[+-]\d{2}:\d{2}$/);
    expect(result?.group).toBe(`${{ zh: "今天", en: "Today", vi: "Hôm nay" }[locale]} 09:07`);
    // Named zones cannot be resolved without Intl: both date and offset stay local.
    expect(formatConversationTime(local.getTime(), { locale, now: reference, timeZone: "America/New_York" })).toEqual(expected);
  });

  it.each(["missing formatter", "missing parts", "throwing parts", "malformed parts", "12-hour parts"])(
    "falls back to the local calendar when native Intl has %s", mode => {
      const local = new Date(2026, 9, 26, 9, 7, 5).getTime(), reference = new Date(2026, 9, 26, 12).getTime();
      const expected = formatConversationTime(local, { locale: "en", now: reference });
      if (mode === "missing formatter") vi.stubGlobal("Intl", {});
      else vi.stubGlobal("Intl", { DateTimeFormat: class {
        formatToParts = mode === "missing parts" ? undefined : () => {
          if (mode === "throwing parts") throw new Error("unavailable");
          return mode === "12-hour parts" ? [{ type: "dayPeriod", value: "AM" }] : [];
        };
      } });
      expect(formatConversationTime(local, { locale: "en", now: reference, timeZone: "Asia/Tokyo" })).toEqual(expected);
    },
  );

  it("falls back locally for an unsupported IANA name", () => {
    const local = new Date(2026, 9, 26, 9).getTime();
    expect(formatConversationTime(local, { ...options, timeZone: "Invalid/Zone" }))
      .toEqual(formatConversationTime(local, { ...options, timeZone: undefined }));
  });
});

describe("conversation time grouping", () => {
  const base = instant("2026-10-26T09:00:00Z");

  it.each([300_000, 360_000, 86_399_999, 86_400_000, 86_400_001])("groups only at the exact 24-hour boundary: %sms", gap => {
    const result = buildConversationTimeGroups([message("first", base), message("next", base + gap)], options);
    expect(Object.keys(result)).toEqual(gap < 86_400_000 ? ["first"] : ["first", "next"]);
  });

  it("uses the previous valid message, not elapsed time since the last group, in long sessions", () => {
    const messages = Array.from({ length: 180 }, (_, index) => message(`stable-${index}`, base + index * 3_600_000));
    expect(Object.keys(buildConversationTimeGroups(messages, { ...options, now: base + 180 * 3_600_000 }))).toEqual(["stable-0"]);
  });

  it("does not divide a one-minute midnight crossing", () => {
    const reference = { ...options, now: instant("2026-10-26T18:00:00Z"), timeZone: "Asia/Tokyo" };
    expect(buildConversationTimeGroups([
      message("before", instant("2026-10-26T14:59:00Z")), message("after", instant("2026-10-26T15:00:00Z")),
    ], reference)).toEqual({ before: "Yesterday 23:59" });
  });

  it("does not mistake the spring-forward wall-clock jump for an elapsed 24-hour gap", () => {
    const reference = { ...options, now: instant("2026-03-08T09:00:00Z"), timeZone: "America/New_York" };
    expect(buildConversationTimeGroups([
      message("before", instant("2026-03-08T06:59:00Z")), message("after", instant("2026-03-08T07:01:00Z")),
    ], reference)).toEqual({ before: "Today 01:59" });
  });

  it("does not divide identical fall-back clocks one hour apart", () => {
    expect(buildConversationTimeGroups([
      message("first-hour", instant("2026-11-01T05:30:00Z")), message("second-hour", instant("2026-11-01T06:30:00Z")),
    ], { ...options, now: instant("2026-11-01T08:00:00Z"), timeZone: "America/New_York" }))
      .toEqual({ "first-hour": "Today 01:30" });
  });

  it("keeps backwards time and equal instants without inventing gaps or changing reply order", () => {
    const messages = Object.freeze([
      Object.freeze(message("question-a", base)), Object.freeze(message("reply-a", base + 600_000)),
      Object.freeze(message("question-b", base + 60_000)), Object.freeze(message("same-instant", base + 60_000)),
    ]);
    expect(buildConversationTimeGroups(messages, options)).toEqual({
      "question-a": "Today 09:00",
    });
    expect(messages.map(value => value.id)).toEqual(["question-a", "reply-a", "question-b", "same-instant"]);
  });

  it("starts at the first valid message and skips unknown clocks without inventing separators", () => {
    expect(buildConversationTimeGroups([
      message("missing"), message("invalid", Number.NaN), message("first", base), message("same", base),
      message("zero", 0), message("after-zero", base), message("infinite", Infinity), message("after-invalid", base + 60_000),
    ], options)).toEqual({ first: "Today 09:00" });
    expect(buildConversationTimeGroups([], options)).toEqual({});
  });

  it("keeps retries of the same ID stable and does not reset the adjacent-message gap", () => {
    const messages = [message("first", base), message("waiting", base + 180_000), message("last", base + 86_580_000)];
    const expected = { first: "Today 09:00", last: "Oct 27, 2026 09:03" };
    expect(buildConversationTimeGroups(messages, options)).toEqual(expected);
    expect(buildConversationTimeGroups(messages.map(value => ({ ...value })), options)).toEqual(expected);
    expect(buildConversationTimeGroups([
      ...messages.slice(0, 2), message("first", base), messages[2],
    ], options)).toEqual(expected);
  });

  it("uses the latest same-ID snapshot without moving it or retaining a stale separator", () => {
    expect(buildConversationTimeGroups([
      message("confirmed", base), message("next", base + 300_000), message("confirmed", base + 60_000),
    ], options)).toEqual({ confirmed: "Today 09:01" });
    expect(buildConversationTimeGroups([
      message("unknown"), message("next", base + 60_000), message("unknown", base),
    ], options)).toEqual({ unknown: "Today 09:00" });
  });

  it("recomputes the page seam from stable IDs, removing a former first group when appropriate", () => {
    const current = Object.freeze([Object.freeze(message("current-first", base + 180_000)), Object.freeze(message("current-last", base + 420_000))]);
    expect(buildConversationTimeGroups(current, options)).toEqual({ "current-first": "Today 09:03" });
    expect(buildConversationTimeGroups([message("older", base), ...current], options)).toEqual({ older: "Today 09:00" });
    expect(buildConversationTimeGroups([message("older", base + 180_000 - 86_400_000), ...current], options))
      .toEqual({ older: "Yesterday 09:03", "current-first": "Today 09:03" });
    expect(current.map(value => value.id)).toEqual(["current-first", "current-last"]);
  });

  it("keeps arbitrary server IDs as own record keys", () => {
    const result = buildConversationTimeGroups([
      message("__proto__", base), message("constructor", base + 86_400_000), message("turn:user/1", base + 172_800_000),
    ], options);
    expect(Object.keys(result)).toEqual(["__proto__", "constructor", "turn:user/1"]);
    expect(result.__proto__).toBe("Today 09:00");
  });
});
