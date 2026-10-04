import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatTrialDate, formatTrialDateTime } from "@/lib/trial-date";
import listSource from "./orders.vue?raw";
import detailSource from "./order-detail.vue?raw";

function section(source: string, start: string, end: string): string {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  if (first < 0 || last < 0) throw new Error(`Missing order date consumer: ${start}`);
  return ts.transpileModule(source.slice(first, last), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}

// Execute the page functions themselves, with the real shared formatter.
const dateText = new Function("formatTrialDate", "dateLocale",
  `${section(listSource, "function dateText(", "function goStore(")}; return dateText;`,
)(formatTrialDate, () => "zh-CN") as (ts: number) => string;
function detail(timeline: { status: string; ts: number }[]) {
  return new Function("formatTrialDateTime", "dateLocale", "order",
    `${section(detailSource, "function eventFor(", "async function handleCancel(")}; return { dt, eventText };`,
  )(formatTrialDateTime, () => "zh-CN", { value: { timeline } }) as {
    dt: (ts: number) => string;
    eventText: (status: string) => string;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("BUG 412 order date consumers", () => {
  for (const [zone, time, midnightDate, midnightTime] of [
    ["Asia/Tokyo", "11:48:31", "2026-10-03", "00:01:02"],
    ["Asia/Ho_Chi_Minh", "09:48:31", "2026-10-02", "22:01:02"],
  ]) {
    it.each(["english fallback", "throws"])(`${zone} keeps local numeric dates and seconds when Android locale %s`, (mode) => {
      vi.stubEnv("TZ", zone);
      const fallback = () => {
        if (mode === "throws") throw new Error("Android locale formatter unavailable");
        return "Sat Oct 03 2026 11:48:31 GMT+0900 (JST)";
      };
      const shortLocale = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(fallback);
      const longLocale = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(fallback);
      const placedAt = Date.parse("2026-10-03T02:48:31Z");
      const midnight = Date.parse("2026-10-02T15:01:02Z");
      const timeline = [{ status: "placed", ts: placedAt }, { status: "paid", ts: placedAt + 1000 }];
      const view = detail(timeline);

      expect(dateText(placedAt)).toBe("2026-10-03");
      expect(view.dt(placedAt)).toBe(`2026-10-03 ${time}`);
      expect(view.eventText("placed")).toBe(`2026-10-03 ${time}`);
      expect(view.eventText("paid")).toBe(`2026-10-03 ${time.slice(0, -2)}32`);
      expect(view.eventText("activated")).toBe("");
      expect(dateText(midnight)).toBe(midnightDate);
      expect(view.dt(midnight)).toBe(`${midnightDate} ${midnightTime}`);
      expect(timeline[0].ts).toBe(placedAt);
      expect(shortLocale).not.toHaveBeenCalled();
      expect(longLocale).not.toHaveBeenCalled();
    });
  }

  it("shows unknown for non-finite and out-of-range epochs while retaining epoch zero", () => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    for (const invalid of [NaN, Infinity, -Infinity, 8.64e15 + 1, -8.64e15 - 1]) {
      const view = detail([{ status: "placed", ts: invalid }]);
      expect(dateText(invalid)).toBe("—");
      expect(view.dt(invalid)).toBe("—");
      expect(view.eventText("placed")).toBe("—");
    }
    expect(dateText(0)).toBe("1970-01-01");
    expect(detail([]).dt(0)).toBe("1970-01-01 09:00:00");
  });

  it("routes the list, all summary timestamps and the timeline through the numeric consumers", () => {
    expect(listSource).toContain('import { formatTrialDate } from "@/lib/trial-date";');
    expect(detailSource).toContain('import { formatTrialDateTime } from "@/lib/trial-date";');
    expect(listSource).toContain("{{ dateText(o.placedAt) }}");
    for (const field of ["placedAt", "expiresAt", "paidAt", "activatedAt", "refundedAt"]) {
      expect(detailSource).toContain(`{{ dt(order.${field}) }}`);
    }
    expect(detailSource).toContain("{{ eventText(stage) }}");
  });
});
