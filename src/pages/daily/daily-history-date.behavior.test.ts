import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { dateLocale } from "@/i18n/format";
import { useLocaleStore } from "@/store/locale";
import { formatTrialDateTime } from "@/lib/trial-date";
import source from "./daily.vue?raw";

// Execute the page's actual formatter with its real helper, without any reward command.
const script = parse(source, { filename: "daily.vue" }).descriptor.scriptSetup!.content;
const parsed = ts.createSourceFile("daily.ts", script, ts.ScriptTarget.Latest, true);
const formatter = parsed.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "formatTs");
if (!formatter) throw new Error("Daily history formatter missing");
const code = ts.transpileModule(formatter.getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const formatTs = new Function("formatTrialDateTime", "dateLocale", `${code}; return formatTs;`)(
  formatTrialDateTime, dateLocale,
) as (timestamp: number) => string;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn(), getSystemInfoSync: () => ({ language: "en" }) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Daily actual history date formatter", () => {
  for (const language of ["en", "zh", "vi"] as const) {
    it.each(["fallback", "throw"] as const)(`${language}: preserves local seconds when Android locale handling is %s`, mode => {
      useLocaleStore().setLocale(language);
      expect(dateLocale()).toBe({ en: "en-US", zh: "zh-CN", vi: "vi-VN" }[language]);
      const locale = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (this: Date) {
        if (mode === "throw") throw new Error("Android locale unavailable");
        return this.toString();
      });
      expect(formatTs(new Date(2026, 9, 3, 16, 34, 40).getTime())).toBe("2026-10-03 16:34:40");
      expect(formatTs(new Date(2026, 9, 3, 2, 7, 54).getTime())).toBe("2026-10-03 02:07:54");
      expect(locale).not.toHaveBeenCalled();
    });
  }

  it.each([NaN, Infinity, -Infinity, 9e15])("keeps invalid timestamp %s unknown", timestamp => {
    expect(formatTs(timestamp)).toBe("—");
  });

  it("keeps the device's date across midnight and time zones", () => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    expect(formatTs(Date.parse("2026-10-03T14:59:59Z"))).toBe("2026-10-03 23:59:59");
    expect(formatTs(Date.parse("2026-10-03T15:00:02Z"))).toBe("2026-10-04 00:00:02");
    expect(formatTs(0)).toBe("1970-01-01 09:00:00");
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(formatTs(Date.parse("2026-10-03T15:00:02Z"))).toBe("2026-10-03 08:00:02");
  });
});
