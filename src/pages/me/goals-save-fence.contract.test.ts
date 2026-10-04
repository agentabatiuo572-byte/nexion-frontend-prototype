import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error The isolated legacy-JS realm is used only by the Node test runner.
import { createContext, runInContext } from "node:vm";
import { compileScript, parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { createPinia, setActivePinia } from "pinia";
import ts from "typescript";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { useUI } from "@/store/ui";

const source = readFileSync(new URL("./goals.vue", import.meta.url), "utf8");

function legacyNativePage() {
  const context = createContext({ module: { exports: {} } });
  runInContext(`
    delete Array.prototype.at;
    this.goalsStore = {
      accountEpoch: 1, status: "ready", goals: [], lifetimeEarningsUsdt: 0,
      recommendationStatus: "ready", recommendation: null,
      saves: [], recommendations: [], failNextSave: false,
      async setGoal(intent) {
        this.saves.push({ ...intent });
        if (this.failNextSave) {
          this.failNextSave = false;
          throw new Error("GOAL_SAVE_FAILED");
        }
        this.goals.push({ id: "saved-goal", targetUSDT: intent.targetUSDT,
          deadlineMs: intent.deadlineMs, createdAt: Date.now(), achieved: false });
        return "saved";
      },
      async refreshRecommendation(target, deadline) {
        this.recommendations.push({ target, deadline });
      },
    };
    this.ui = { toasts: [], pushToast(toast) { this.toasts.push(toast); } };
    this.exports = this.module.exports;
  `, context);
  context.require = (id: string) => {
    if (id === "vue") return { ...Vue, onMounted: () => {} };
    if (id === "@dcloudio/uni-app") return { onShow: () => {} };
    if (id === "@/store/goals") return { useGoals: () => context.goalsStore };
    if (id === "@/store/ui") return { useUI: () => context.ui };
    if (id === "@/store/app") return { useApp: () => ({ accountKey: "user:3778", accountBindingEpoch: 1 }) };
    if (id === "@/i18n/use-t") return { useT: () => ({ value: { goals: zh.goals } }) };
    if (id === "@/i18n/format") return { fmt };
    if (id === "@/api/runtime") return { remoteApiEnabled: true };
    if (id === "@/lib/brand-copy") return { nexGridBrandText: (value: string) => value };
    if (id === "@/lib/route") return { navReset: () => {} };
    if (id.endsWith(".vue")) return { __esModule: true, default: {} };
    throw new Error(`Unexpected goals script import: ${id}`);
  };
  const { descriptor } = parse(source, { filename: "goals.vue" });
  const script = compileScript(descriptor, { id: "goals-native-save" });
  const implementation = ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  runInContext(implementation, context);
  const scope = Vue.effectScope();
  const page = scope.run(() => context.module.exports.default.setup({}, { expose() {} }));
  return { context, page, scope };
}

describe("native goal save without Array.at", () => {
  it("confirms one saved goal, restores its term and shows success in the actual page script", async () => {
    const { context, page, scope } = legacyNativePage();
    try {
      expect(runInContext("typeof [].at", context)).toBe("undefined");
      expect(context.goalsStore.goals.at).toBeUndefined();
      page.selectTarget(500);
      page.selectDays(30);
      context.goalsStore.recommendations.length = 0;
      await page.onSave();
      expect(context.goalsStore.saves).toHaveLength(1);
      expect(context.goalsStore.goals).toHaveLength(1);
      expect(context.ui.toasts).toEqual([{ kind: "success", title: "目标已保存 · 30 天达成 $500" }]);
      expect(page.restoredGoal.value).toEqual({ targetUSDT: 500, days: 30 });
      expect(page.savePending.value).toBe(false);
      expect(page.saveBlocked.value).toBe(true);
      expect(context.goalsStore.recommendations).toEqual([{
        target: 500, deadline: context.goalsStore.goals[0].deadlineMs,
      }]);
      await page.onSave();
      expect(context.goalsStore.saves).toHaveLength(1);
    } finally { scope.stop(); }
  });

  it("preserves a failed save intent for retry and then confirms success without duplicating the goal", async () => {
    const { context, page, scope } = legacyNativePage();
    try {
      page.selectTarget(500);
      page.selectDays(30);
      context.goalsStore.failNextSave = true;
      await page.onSave();
      expect(context.goalsStore.goals).toHaveLength(0);
      expect(context.ui.toasts).toEqual([{ kind: "warn", title: "GOAL_SAVE_FAILED" }]);
      expect(page.savePending.value).toBe(false);
      await page.onSave();
      expect(context.goalsStore.saves).toHaveLength(2);
      expect(context.goalsStore.saves[1]).toEqual(context.goalsStore.saves[0]);
      expect(context.goalsStore.goals).toHaveLength(1);
      expect(context.ui.toasts[1]).toEqual({ kind: "success", title: "目标已保存 · 30 天达成 $500" });
    } finally { scope.stop(); }
  });
});

describe("earning-goal save account fence", () => {
  it("keeps the submitted retry payload and fences success handling by account epoch", () => {
    expect(source).toMatch(/retryableSaveIntents/);
    expect(source).toMatch(/expectedAccountEpoch === goalsStore\.accountEpoch/);
  });

  it("disables editable goal controls while a save is pending", () => {
    expect(source).toMatch(/:disabled="editorBlocked"/);
    expect(source).toMatch(/editorBlocked = computed\(\(\) => savePending\.value/);
    expect(source).toMatch(/selectTarget\(p\)/);
    expect(source).toMatch(/selectDays\(d\)/);
  });

  it("hides a server-confirmed recommendation when no purchase is required", () => {
    expect(source).toMatch(/recommendation\?\.purchaseRequired/);
    expect(source).toMatch(/recommendationStatus === 'ready'/);
  });

  it("explains an impossible catalog target without offering a purchase CTA", () => {
    expect(source).toMatch(/recommendationError === 'GOAL_NO_ELIGIBLE_PRODUCT'/);
    expect(source).toMatch(/t\.goals\.noEligibleProduct/);
    expect(source).toMatch(/purchaseRequired === true/);
  });

  it("does not round a positive required daily amount down to zero", () => {
    expect(source).toMatch(/function formatGoalDailyRate\(value: number\)/);
    expect(source).toMatch(/formatGoalDailyRate\(goalsStore\.recommendation\?\.requiredDaily/);
  });
});

/**
 * zentao #247:保存成功提示把 90 天期限显示成「$90 天」。
 *
 * 中文文案写成 `"目标已保存 · ${days} 天达成 ${amount}"` —— 把 `${amount}` 的 `$`
 * 复制到了天数上,而 `fmt` 把 `$` 当字面量原样留下。天数不是金额,$ 只属于金额。
 *
 * 判据是**行为**而非文本:用真实 fmt 渲染一遍,断言天数前没有 $、金额前有 $。
 */
describe("goal save toast placeholder contract", () => {
  it("keeps days unitless and groups default and custom amounts", () => {
    expect(source).toMatch(/savedToast, \{ amount: target\.value\.toLocaleString\("en-US"\), days: days\.value \}/);
    expect(fmt(zh.goals.savedToast, { amount: (1000).toLocaleString("en-US"), days: 90 }))
      .toBe("目标已保存 · 90 天达成 $1,000");
    expect(fmt(zh.goals.savedToast, { amount: (1234.56).toLocaleString("en-US"), days: 180 }))
      .toBe("目标已保存 · 180 天达成 $1,234.56");
  });

  it("shows both saved terms through the page-bound toast store after an async save", async () => {
    const pagePinia = createPinia();
    const pageUi = useUI(pagePinia);
    const otherPinia = createPinia();
    setActivePinia(otherPinia);
    const goals: Array<{ id: string; targetUSDT: number; deadlineMs: number; createdAt: number; achieved: boolean }> = [];
    const goalsStore = {
      accountEpoch: 1,
      goals,
      setGoal: async (intent: { targetUSDT: number; deadlineMs: number }) => {
        await Promise.resolve();
        goals.push({ id: String(goals.length + 1), targetUSDT: intent.targetUSDT,
          deadlineMs: intent.deadlineMs, createdAt: Date.now(), achieved: false });
        return "saved";
      },
      refreshRecommendation: async () => {},
    };
    const target = { value: 500 };
    const days = { value: 90 };
    const savePending = { value: false };
    const start = source.indexOf("async function onSave()");
    const end = source.indexOf("async function remove(", start);
    const implementation = ts.transpileModule(source.slice(start, end), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const makeSave = new Function("saveBlocked", "target", "days", "goalsStore", "savePending", "ui", "t", "fmt", "restoreEditorFromGoal", "ONE_DAY_MS",
      `let saveEpoch = 0; const retryableSaveIntents = new Map(); ${implementation}; return onSave;`);
    const save = makeSave({ value: false }, target, days, goalsStore, savePending, pageUi,
      { value: { goals: zh.goals } }, fmt, () => {}, 86_400_000) as () => Promise<void>;

    await save();
    expect(pageUi.toasts.at(-1)?.title).toBe("目标已保存 · 90 天达成 $500");
    days.value = 30;
    await save();
    expect(pageUi.toasts.at(-1)?.title).toBe("目标已保存 · 30 天达成 $500");
    expect(useUI(otherPinia).toasts).toEqual([]);
    expect(goals).toHaveLength(2);
    expect(savePending.value).toBe(false);
  });
});
