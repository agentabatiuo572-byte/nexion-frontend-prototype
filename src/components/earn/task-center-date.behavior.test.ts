import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import source from "./task-center.vue?raw";
import * as dates from "@/lib/display-date";
import { taskRelativeTime } from "@/lib/task-relative-time";
import { formatUsd } from "@/lib/usd-display";
import { workloadLabel } from "@/lib/workload-label";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
const dictionaries = { zh, en, vi: vietnamese };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const script = ts.transpileModule(compileScript(parse(source).descriptor, { id: "task-history-date", inlineTemplate: true,
  templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text"].includes(tag) } },
}).content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function history(completedAt: unknown) {
  const locale = Vue.reactive({ code: "zh" as keyof typeof dictionaries });
  const task = { id: "historical-task", receiptNo: "canonical-receipt", model: "Cloud 503", category: "IG", reward: 0.123456, completedAt };
  const app = { accountKey: "fixture", accountBindingEpoch: 1, visibleDevices: [{ recentTasks: [task], kind: "cloud-share", vramTotal: 0 }],
    homeTruth: { onGrid: { activeJobs: 0 } }, remoteAssignmentStatus: "ready", remoteAssignmentHasSnapshot: true };
  const interval = vi.fn(), receipt = vi.fn();
  const imports: Record<string, unknown> = { '@/store/data-visibility': { useDataVisibility: () => ({ hidden: false, mask: String }) }, vue: Vue, "@/lib/display-date": dates, "@/lib/task-relative-time": { taskRelativeTime },
    "@/lib/usd-display": { formatUsd }, "@/lib/workload-label": { workloadLabel }, "@/lib/route": { navTo: vi.fn() },
    "@/composables/use-tab-page-lifecycle": { onShow: vi.fn(), onHide: vi.fn(), useVisibleInterval: interval },
    "@/i18n/use-t": { useT: () => Vue.computed(() => dictionaries[locale.code]) }, "@/i18n/messages/en": { en }, "@/i18n/format": { dateLocale: () => locale.code },
    "@/store/app": { useApp: () => app }, "@/store/receipts": { useReceipts: vi.fn() }, "@/store/ui": { toast: { error: vi.fn() } },
    "@/store/earn-config": { prepareEarnConfig: vi.fn(), useEarnConfig: () => ({ lockedTeasers: () => [], refreshRoute: async () => undefined }) },
    "@/api/runtime": { remoteApiEnabled: true, taskAssignmentApi: { receipt } }, "@/components/me/receipt-modal.vue": { default: { render: () => null } } };
  const exports = {} as { default: Vue.Component };
  new Function("require", "exports", script)((id: string) => imports[id], exports);
  return { locale, app, task, interval, receipt, html: () => renderToString(Vue.createSSRApp(exports.default)) };
}
it.each([
  ["Asia/Tokyo", -540, ["2026/01/01 01:05", "Jan 1, 2026 01:05", "01/01/2026 01:05"]],
  ["America/Los_Angeles", 480, ["2025/12/31 08:05", "Dec 31, 2025 08:05", "31/12/2025 08:05"]],
] as const)("renders completed history with local date and year without Intl in %s", async (zone, offset, expected) => {
  vi.stubEnv("TZ", zone); expect(new Date("2025-12-31T16:05:06Z").getTimezoneOffset()).toBe(offset); vi.stubGlobal("Intl", undefined);
  const screen = history(Date.parse("2025-12-31T16:05:06Z")), before = JSON.stringify(screen.task);
  for (const [index, language] of ["zh", "en", "vi"].entries()) {
    screen.locale.code = language as keyof typeof dictionaries; const html = await screen.html();
    expect(html).toContain(expected[index]); expect(html).toContain("+$0.1235"); expect(html).toContain("Cloud 503");
    expect(html).toContain(en.market.workloads.IG.label);
    expect(html).toContain('data-task-id="historical-task"'); expect(html).toContain('title="canonical-receipt"');
    expect(html).toContain('d="M4 2v20l2-1');
  }
  expect(JSON.stringify(screen.task)).toBe(before); expect(screen.receipt).not.toHaveBeenCalled();
});
it.each([0, -1, NaN, Infinity, undefined])("keeps missing/invalid completed timestamp %s as a placeholder", async value => {
  const screen = history(value);
  for (const language of ["zh", "en", "vi"] as const) {
    screen.locale.code = language; const html = await screen.html();
    expect(html).toMatch(/earn-history-time[^>]*>—<\/text>/); expect(html).not.toContain("NaN"); expect(html).not.toContain("1970");
    expect(html).toContain("+$0.1235"); expect(html).toContain('title="canonical-receipt"');
  }
});
it("keeps the same latest-first history and has no relative-date polling", async () => {
  const screen = history(Date.parse("2025-12-31T16:05:06Z"));
  screen.app.visibleDevices[0].recentTasks.push({ ...screen.task, id: "newer-task", completedAt: Date.parse("2026-10-26T17:13:00Z") });
  const html = await screen.html(); expect(html.indexOf('data-task-id="newer-task"')).toBeLessThan(html.indexOf('data-task-id="historical-task"'));
  expect(screen.interval).not.toHaveBeenCalled(); expect(screen.receipt).not.toHaveBeenCalled();
});
