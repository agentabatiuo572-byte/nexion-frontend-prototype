import { afterEach, describe, expect, it } from "vitest";
import {
  businessDayKey, businessOffsetLabel, businessOffsetMinutes, parseBusinessCalendar, setBusinessCalendar,
} from "./business-calendar";

const serverSeed = {
  tracks: {
    LEGACY: [{ zoneId: "Asia/Shanghai", offsetMinutes: 480, effectiveAt: "1969-12-31T16:00:00Z" }],
    GROWTH_TEAM: [
      { zoneId: "Asia/Shanghai", offsetMinutes: 480, effectiveAt: "1969-12-31T16:00:00Z" },
      { zoneId: "Asia/Ho_Chi_Minh", offsetMinutes: 420, effectiveAt: "2026-10-18T16:00:00Z" },
    ],
  },
};

afterEach(() => setBusinessCalendar(null));

describe("business calendar", () => {
  it("cuts days on the seed before the calendar is read", () => {
    expect(businessDayKey("LEGACY", Date.parse("2026-10-27T15:59:59Z"))).toBe("2026-10-27");
    expect(businessDayKey("LEGACY", Date.parse("2026-10-27T16:00:00Z"))).toBe("2026-10-28");
    expect(businessOffsetMinutes("GROWTH_TEAM", Date.parse("2026-10-18T15:59:59Z"))).toBe(480);
    expect(businessOffsetMinutes("GROWTH_TEAM", Date.parse("2026-10-18T16:00:00Z"))).toBe(420);
    expect(businessOffsetLabel("LEGACY")).toBe("UTC+8");
  });

  it("follows a scheduled global zone from its effective instant", () => {
    const calendar = parseBusinessCalendar({
      tracks: {
        LEGACY: [...serverSeed.tracks.LEGACY, { zoneId: "Asia/Tokyo", offsetMinutes: 540, effectiveAt: "2026-11-30T15:00:00Z" }],
        GROWTH_TEAM: [...serverSeed.tracks.GROWTH_TEAM, { zoneId: "Asia/Tokyo", offsetMinutes: 540, effectiveAt: "2026-11-30T15:00:00Z" }],
      },
    });
    expect(calendar).not.toBeNull();
    setBusinessCalendar(calendar);
    expect(businessDayKey("LEGACY", Date.parse("2026-11-30T15:30:00Z"))).toBe("2026-12-01");
    expect(businessDayKey("LEGACY", Date.parse("2026-11-30T14:30:00Z"))).toBe("2026-11-30");
    expect(businessOffsetLabel("GROWTH_TEAM", Date.parse("2026-12-02T00:00:00Z"))).toBe("UTC+9");
  });

  it("labels fractional and negative offsets", () => {
    setBusinessCalendar(parseBusinessCalendar({
      tracks: {
        LEGACY: [{ zoneId: "Asia/Kolkata", offsetMinutes: 330, effectiveAt: "1970-01-01T00:00:00Z" }],
        GROWTH_TEAM: [{ zoneId: "America/Bogota", offsetMinutes: -300, effectiveAt: "1970-01-01T00:00:00Z" }],
      },
    }));
    expect(businessOffsetLabel("LEGACY")).toBe("UTC+5:30");
    expect(businessOffsetLabel("GROWTH_TEAM")).toBe("UTC-5");
  });

  it("rejects incomplete payloads so the last good calendar stays", () => {
    expect(parseBusinessCalendar(null)).toBeNull();
    expect(parseBusinessCalendar({ tracks: { LEGACY: serverSeed.tracks.LEGACY } })).toBeNull();
    expect(parseBusinessCalendar({ tracks: { ...serverSeed.tracks, LEGACY: [] } })).toBeNull();
    expect(parseBusinessCalendar({ tracks: { ...serverSeed.tracks, LEGACY: [{ zoneId: "X", offsetMinutes: 480.5, effectiveAt: "1970-01-01T00:00:00Z" }] } })).toBeNull();
    expect(parseBusinessCalendar({ tracks: { ...serverSeed.tracks, LEGACY: [{ zoneId: "X", offsetMinutes: 480, effectiveAt: "not a date" }] } })).toBeNull();
    expect(parseBusinessCalendar(serverSeed)).toEqual({
      LEGACY: [{ zoneId: "Asia/Shanghai", offsetMinutes: 480, effectiveAt: Date.UTC(1969, 11, 31, 16) }],
      GROWTH_TEAM: [
        { zoneId: "Asia/Shanghai", offsetMinutes: 480, effectiveAt: Date.UTC(1969, 11, 31, 16) },
        { zoneId: "Asia/Ho_Chi_Minh", offsetMinutes: 420, effectiveAt: Date.UTC(2026, 9, 18, 16) },
      ],
    });
  });
});
