import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import source from "./activity-row.vue?raw";
import * as dates from "@/lib/display-date";
import * as presentation from "@/lib/genesis-marketplace-presentation";
import { displayGenesisHoldingId } from "@/lib/genesis-holding-id";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const dictionaries = { zh, en, vi: vietnamese };
const code = ts.transpileModule(compileScript(parse(source).descriptor, { id: "activity-date", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text"].includes(tag) } },
}).content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function row(ts: unknown) {
  const locale = Vue.reactive({ code: "zh" as keyof typeof dictionaries });
  const event = { id: "historical-sale", kind: "sale", priceUSDT: 1.234567, from: "—", to: "—", ts, description: "Original settled activity description" };
  const modules: Record<string, unknown> = { vue: Vue, "@/lib/display-date": dates,
    "@/lib/genesis-marketplace-presentation": presentation, "@/lib/genesis-holding-id": { displayGenesisHoldingId },
    "@/i18n/use-t": { useT: () => Vue.computed(() => dictionaries[locale.code]) }, "@/i18n/format": { fmt, dateLocale: () => locale.code } };
  const exports = {} as { default: Vue.Component };
  new Function("require", "exports", code)((id: string) => modules[id], exports);
  return { locale, event, html: () => renderToString(Vue.createSSRApp(exports.default, { e: event, isLast: true })) };
}
it.each([
  ["Asia/Tokyo", -540, ["2026/01/01 01:05", "Jan 1, 2026 01:05", "01/01/2026 01:05"]],
  ["America/Los_Angeles", 480, ["2025/12/31 08:05", "Dec 31, 2025 08:05", "31/12/2025 08:05"]],
] as const)("renders the actual history row across local years without Intl in %s", async (zone, offset, expected) => {
  vi.stubEnv("TZ", zone); expect(new Date("2025-12-31T16:05:06Z").getTimezoneOffset()).toBe(offset);
  vi.stubGlobal("Intl", undefined);
  const screen = row(Date.parse("2025-12-31T16:05:06Z")), before = JSON.stringify(screen.event);
  for (const [index, language] of ["zh", "en", "vi"].entries()) {
    screen.locale.code = language as keyof typeof dictionaries;
    const html = await screen.html(); expect(html).toContain(expected[index]);
    expect(html).toContain("$1.234567"); expect(html).toContain(screen.event.description);
  }
  expect(JSON.stringify(screen.event)).toBe(before);
});
it.each([0, -1, NaN, Infinity, undefined])("keeps invalid/missing historical timestamp %s unknown", async value => {
  const screen = row(value);
  for (const language of ["zh", "en", "vi"] as const) {
    screen.locale.code = language; const html = await screen.html();
    expect(html).toContain("—"); expect(html).not.toContain("NaN"); expect(html).not.toContain("1970");
    expect(html).toContain("$1.234567");
  }
});
