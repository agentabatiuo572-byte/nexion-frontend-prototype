import { afterEach, expect, test, vi } from "vitest";
import { parse } from "@vue/compiler-sfc";
import { formatTrialDate } from "@/lib/trial-date";
import source from "./binary.vue?raw";

// Execute the real recent-match template binding with the shared formatter.
const expression = parse(source).descriptor.template!.content.match(/\{\{\s*([^{}]*\be\.ts\b[^{}]*)\s*\}\}/)?.[1];
if (!expression) throw new Error("Missing binary event date binding");
const eventDate = new Function("e", "formatTrialDate", "dateLocale", `return ${expression};`) as
  (event: { ts: number }, formatter: typeof formatTrialDate, locale: () => string) => string;

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

for (const [zone, date] of [["Asia/Tokyo", "2026-10-12"], ["Asia/Ho_Chi_Minh", "2026-10-11"]]) {
  test.each(["missing Intl", "English fallback", "throws"])(`544 sibling binary ${zone} %s retains local event dates`, mode => {
    vi.stubEnv("TZ", zone);
    if (mode === "missing Intl") vi.stubGlobal("Intl", undefined);
    const nativeLocale = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(() => {
      if (mode === "throws") throw new Error("Android locale formatter unavailable");
      return "Mon Oct 12 2026";
    });
    const event = Object.freeze({ ts: Date.parse("2026-10-11T15:30:00Z") });
    for (const locale of ["zh-CN", "en-US", "vi-VN"]) {
      expect(eventDate(event, formatTrialDate, () => locale)).toBe(locale.startsWith("zh") ? date.replace(/-/g, "/") : locale.startsWith("vi") ? `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : `Oct ${Number(date.slice(8))}, 2026`);
    }
    expect(nativeLocale).not.toHaveBeenCalled();
    expect(event.ts).toBe(Date.parse("2026-10-11T15:30:00Z"));
  });
}

test("544 sibling binary unknown timestamps retain a dash rather than inventing an epoch", () => {
  for (const ts of [NaN, Infinity, -Infinity, 8.64e15 + 1, null, undefined, ""]) {
    expect(eventDate({ ts: ts as number }, formatTrialDate, () => "zh-CN")).toBe("—");
  }
});
