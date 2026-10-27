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
  it("does not show negative days or unlock an unconfirmed milestone after a restored streak", () => {
    const fn = parsed.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "daysLeftText")!;
    const js = ts.transpileModule(fn.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const streak = { value: 7 };
    const format = new Function('locale','t','streak','fmt', `${js}; return daysLeftText;`)({code:'zh'},{value:{daily:{milestones:{daysLeft:'还需 {n} 天'}}}},streak,(copy:string,args:{n:number})=>copy.replace('{n}',String(args.n)));
    expect(format(3)).toBe('领取资格待确认');
    expect(format(7)).toBe('领取资格待确认');
    expect(format(14)).toBe('还需 7 天');
    expect(streak.value).toBe(7);
  });
  for (const language of ["en", "zh", "vi"] as const) {
    it.each(["fallback", "throw"] as const)(`${language}: preserves local seconds when Android locale handling is %s`, mode => {
      useLocaleStore().setLocale(language);
      expect(dateLocale()).toBe({ en: "en-US", zh: "zh-CN", vi: "vi-VN" }[language]);
      const locale = vi.spyOn(Date.prototype, "toLocaleString").mockImplementation(function (this: Date) {
        if (mode === "throw") throw new Error("Android locale unavailable");
        return this.toString();
      });
      const day = { en: "Oct 3, 2026", zh: "2026/10/03", vi: "03/10/2026" }[language];
      expect(formatTs(new Date(2026, 9, 3, 16, 34, 40).getTime())).toBe(`${day} 16:34:40`);
      expect(formatTs(new Date(2026, 9, 3, 2, 7, 54).getTime())).toBe(`${day} 02:07:54`);
      expect(locale).not.toHaveBeenCalled();
    });
  }

  it.each([NaN, Infinity, -Infinity, 9e15])("keeps invalid timestamp %s unknown", timestamp => {
    expect(formatTs(timestamp)).toBe("—");
  });

  it("keeps the device's date across midnight and time zones", () => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    expect(formatTs(Date.parse("2026-10-03T14:59:59Z"))).toBe("2026/10/03 23:59:59");
    expect(formatTs(Date.parse("2026-10-03T15:00:02Z"))).toBe("2026/10/04 00:00:02");
    expect(formatTs(0)).toBe("—");
    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(formatTs(Date.parse("2026-10-03T15:00:02Z"))).toBe("2026/10/03 08:00:02");
  });
});
