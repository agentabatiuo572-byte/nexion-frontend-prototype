// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";

const source = readFileSync(new URL("./goals.vue", import.meta.url), "utf8");
const template = parse(source, { filename: "goals.vue" }).descriptor.template!.content;
const render = new Function("Vue", compile(template, { mode: "function", prefixIdentifiers: true }).code)(Vue);
const wrapper = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("main", slots.default?.()) });
const progress = Vue.defineComponent({ setup: () => () => Vue.h("i") });

function goal(id = "goal-1") {
  return { id, targetUSDT: 500, deadlineMs: 1_900_000_000_000, createdAt: 1_800_000_000_000, achieved: false };
}

type RecommendationState = {
  status: "loading" | "ready" | "error";
  error: string | null;
  recommendation: { purchaseRequired: boolean; targetUsdt?: number; days?: number; requiredDaily?: number } | null;
};

async function show(
  status: "loading" | "ready" | "error",
  goals: ReturnType<typeof goal>[],
  recommendationState: RecommendationState = {
    status: "ready", error: null, recommendation: { purchaseRequired: false },
  },
) {
  const app = Vue.createSSRApp({
    render,
    setup: () => ({
      remoteApiEnabled: true,
      t: { goals: {
        navTitle: "Goals", heroLabel: "Goal", heroTitle: "Plan", heroSubtitle: "Current {current}", targetLabel: "Target",
        deadlineLabel: "Deadline", recHeader: "Recommendation", loading: "Loading", serverUnavailable: "Read unavailable",
        noEligibleProduct: "No eligible product", recPath: "", recReasonServer: "", shopCta: "Shop", saveCta: "Save",
        activeGoals: "Active goals", deadlineRow: "{n} days", achievedBadge: "Achieved", minTargetWarn: "", savedToast: "",
        targetPresetsLabel: "Quick target amounts", targetPresetOption: "Target {amount} USDT",
        deadlinePresetOption: "{days}-day term", removeGoalLabel: "Delete goal ${amount}",
      }, ui: { retry: "Retry" } },
      // The template formats its preset/remove accessible names through the shared helper.
      fmt: (template: string, params: Record<string, string>) =>
        template.replace(/\{(\w+)\}/g, (_m, key: string) => params[key] ?? ""),
      target: 1000, days: 90, savePending: false, editorBlocked: status !== "ready", saveBlocked: status !== "ready",
      editorHasSnapshot: status === "ready",
      PRESET_TARGETS: [500], PRESET_DEADLINES_DAYS: [30],
      goalsStore: { status, error: status === "error" ? "temporary" : "", goals, lifetimeEarningsUsdt: 25,
        recommendationStatus: recommendationState.status, recommendationError: recommendationState.error,
        recommendation: recommendationState.recommendation },
      goals,
      lifeTimeEarnings: 25, heroSubLine: "", recPathLine: "", recommendation: { reason: "" },
      retryGoals() {}, onTarget() {}, selectTarget() {}, selectDays() {}, onSave() {}, remove() {}, goStore() {},
      presetTargetStyle: () => ({}), presetTargetLabelStyle: () => ({}), presetDeadlineStyle: () => ({}), presetDeadlineLabelStyle: () => ({}),
      heroStyle: {}, heroLabelStyle: {}, heroTitleStyle: {}, heroSubStyle: {}, setterWrapStyle: {}, fieldLabelStyle: {}, inputBoxStyle: {}, dollarStyle: {}, targetInputStyle: {},
      recCardStyle: {}, recHeaderStyle: {}, recReasonStyle: {}, recPathStyle: {}, recCtaStyle: {}, recCtaLabelStyle: {}, saveBtnStyle: {}, saveBtnPendingStyle: {}, saveLabelStyle: {},
      emptyStateStyle: {}, sectionLabelStyle: {}, goalGroupStyle: {}, goalRowStyle: () => ({}), goalTargetStyle: {}, goalRemoveStyle: {}, goalDeadlineStyle: {}, goalFootMutedStyle: {}, goalFootPctStyle: {}, achievedBadgeStyle: {}, achievedLabelStyle: {},
      deadlineLine: () => "90 days", goalPct: () => 5,
    }),
  });
  app.component("AppChassis", wrapper); app.component("SubPageHeader", wrapper); app.component("GoalProgressBar", progress);
  return renderToString(app);
}

describe("earning-goal read recovery", () => {
  it("shows loading instead of default editor values until the server goal has loaded", async () => {
    const html = await show("loading", []);
    expect(html).not.toContain("<input");
    expect(html).toContain("Loading");
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toMatch(/<text[^>]*>Recommendation<\/text>/);
  });

  it("keeps a confirmed snapshot and exposes a retry after a later list failure", async () => {
    const html = await show("error", [goal()]);
    expect(html).toContain("$500");
    expect(html).toContain("Retry");
  });

  it("does not combine a new default editor with an old purchasable recommendation during reentry", async () => {
    const html = await show("loading", [{ ...goal("29"), targetUSDT: 100 }], {
      status: "ready", error: null,
      recommendation: { purchaseRequired: true, targetUsdt: 100, days: 180, requiredDaily: 100 / 180 },
    });
    expect(html).toContain("$100");
    expect(html).toContain("Loading");
    expect(html).not.toContain('value="1000"');
    expect(html).not.toContain('aria-checked="true"');
    expect(html).not.toContain("Shop");
  });

  it("retains the saved goal and retry after list failure without offering the old purchase intent", async () => {
    const html = await show("error", [{ ...goal("29"), targetUSDT: 100 }], {
      status: "ready", error: null,
      recommendation: { purchaseRequired: true, targetUsdt: 100, days: 180, requiredDaily: 100 / 180 },
    });
    expect(html).toContain("$100");
    expect(html).toContain("Read unavailable");
    expect(html).toContain("Retry");
    expect(html).not.toContain('value="1000"');
    expect(html).not.toContain("Shop");
  });

  it("does not offer a ready recommendation for a different editor amount", async () => {
    const html = await show("ready", [], {
      status: "ready", error: null,
      recommendation: { purchaseRequired: true, targetUsdt: 100, days: 180, requiredDaily: 100 / 180 },
    });
    expect(html).not.toContain("Shop");
  });

  it("keeps the purchase CTA available for a ready recommendation matching the editor", async () => {
    const html = await show("ready", [], {
      status: "ready", error: null,
      recommendation: { purchaseRequired: true, targetUsdt: 1000, days: 90, requiredDaily: 1000 / 90 },
    });
    expect(html).toContain('value="1000"');
    expect(html).toContain("Shop");
  });

  it("fences the store navigation handler while reading or after the recommendation input changes", () => {
    const start = source.indexOf("function goStore()");
    const end = source.indexOf("// ── styles", start);
    const implementation = ts.transpileModule(source.slice(start, end), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const editorBlocked = Vue.ref(true);
    const target = Vue.ref(100);
    const store = { recommendationStatus: "ready", recommendation: { purchaseRequired: true, targetUsdt: 100, productNo: "sku-s1" } };
    const navigate = vi.fn();
    const go = new Function("remoteApiEnabled", "editorBlocked", "goalsStore", "target", "recommendation", "navReset",
      `${implementation}; return goStore;`)(true, editorBlocked, store, target, { value: { tier: "S1" } }, navigate);
    go();
    expect(navigate).not.toHaveBeenCalled();
    editorBlocked.value = false;
    target.value = 1000;
    go();
    expect(navigate).not.toHaveBeenCalled();
    target.value = 100;
    go();
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ url: "/pages/store/store?focus=sku-s1&focusName=S1", fail: expect.any(Function) });
  });

  it("formats the recommendation amount, term and daily rate from the same server response", () => {
    const start = source.indexOf("const recPathLine = computed");
    const end = source.indexOf("function detailVal", start);
    const implementation = ts.transpileModule(source.slice(start, end), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const format = (text: string, params: Record<string, string | number>) =>
      text.replace(/\{(\w+)\}/g, (_m, key: string) => String(params[key] ?? ""));
    const read = new Function("computed", "fmt", "t", "target", "days", "goalsStore", "recommendation", `${implementation}; return recPathLine.value;`);
    expect(read(Vue.computed, format, { value: { goals: { recPath: "{target}|{days}|{perDay}|{tier}" } } },
      Vue.ref(1000), Vue.ref(90), { recommendation: { targetUsdt: 100, days: 180, requiredDaily: 100 / 180 } },
      { value: { tier: "S1" } })).toBe("100|180|0.56|S1");
  });

  it("offers retry on an initial list failure without inventing an active goal", async () => {
    const html = await show("error", []);
    expect(html).toContain("Read unavailable");
    expect(html).toContain("Retry");
    expect(html).not.toContain("90 days");
  });

  it("does not render a product card or purchase CTA for a completed goal response", async () => {
    const html = await show("ready", [], {
      status: "ready", error: null, recommendation: { purchaseRequired: false },
    });

    expect(html).not.toMatch(/<text[^>]*>Recommendation<\/text>/);
    expect(html).not.toContain("Shop");
  });

  it("shows a deterministic no-eligible-product error without a retry or purchase CTA", async () => {
    const html = await show("ready", [], {
      status: "error", error: "GOAL_NO_ELIGIBLE_PRODUCT", recommendation: null,
    });

    expect(html).toContain("No eligible product");
    expect(html).not.toContain("Retry");
    expect(html).not.toContain("Shop");
  });

  it("restores the newest saved goal before recommending, including refresh and account rebind", async () => {
    const start = source.indexOf("function restoreEditorFromGoal");
    const end = source.indexOf("function deadlineLine");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const implementation = source.slice(start, end);
    const mount: Array<() => void> = [];
    const showHooks: Array<() => void> = [];
    const hideHooks: Array<() => void> = [];
    const unmountHooks: Array<() => void> = [];
    const app = Vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1 });
    const target = Vue.ref(1000);
    const days = Vue.ref(90);
    const restoredGoal = Vue.ref<{ targetUSDT: number; days: number } | null>(null);
    const saveBlocked = Vue.computed(() => restoredGoal.value !== null
      && target.value === restoredGoal.value.targetUSDT && days.value === restoredGoal.value.days);
    const savePending = Vue.ref(false);
    const editorReadPending = Vue.ref(false);
    const older = { ...goal("older"), targetUSDT: 1000, createdAt: Date.now() - 2 * 86_400_000 };
    const stored = { ...goal("newer"), deadlineMs: Date.now() + 89 * 86_400_000,
      createdAt: Date.now() - 86_400_000 };
    const goalsStore = {
      accountEpoch: 1, status: "ready", goals: [stored, older],
      ensure: vi.fn().mockResolvedValue(undefined), refresh: vi.fn().mockResolvedValue(undefined),
      refreshRecommendation: vi.fn().mockResolvedValue(undefined),
    };
    const execute = new Function("remoteApiEnabled", "goalsStore", "target", "days", "restoredGoal", "savePending", "editorReadPending", "ONE_DAY_MS", "onMounted", "onShow", "onHide", "onUnmounted", "watch", "app", `let editorReadEpoch = 0; let restoringEditor = false; let deleteFeedbackVisible = true; let deleteFeedbackGeneration = 0; ${ts.transpileModule(implementation, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText}; return { refreshRemoteGoals, retryGoals, deleteFeedbackSnapshot: () => ({ visible: deleteFeedbackVisible, generation: deleteFeedbackGeneration }) };`);
    const scope = Vue.effectScope();
    const page = scope.run(() => execute(true, goalsStore, target, days, restoredGoal, savePending, editorReadPending, 86_400_000, (hook: () => void) => mount.push(hook), (hook: () => void) => showHooks.push(hook), (hook: () => void) => hideHooks.push(hook), (hook: () => void) => unmountHooks.push(hook), Vue.watch, app));
    expect(mount).toHaveLength(1);
    expect(showHooks).toHaveLength(1);
    expect(hideHooks).toHaveLength(1);
    expect(unmountHooks).toHaveLength(1);
    expect(target.value).toBe(500);
    expect(days.value).toBe(90);
    await page.refreshRemoteGoals();
    expect(target.value).toBe(500);
    expect(days.value).toBe(90);
    expect(saveBlocked.value).toBe(true);
    expect(goalsStore.refreshRecommendation).toHaveBeenCalledExactlyOnceWith(500, stored.deadlineMs);

    target.value = 1000;
    expect(saveBlocked.value).toBe(false);
    expect(goalsStore.refreshRecommendation).toHaveBeenLastCalledWith(1000, expect.any(Number));
    app.accountBindingEpoch += 1;
    await Vue.nextTick();
    await page.refreshRemoteGoals(true);
    expect(target.value).toBe(500);
    expect(days.value).toBe(90);
    expect(saveBlocked.value).toBe(true);
    expect(goalsStore.refresh).toHaveBeenCalledTimes(1);
    goalsStore.goals = [];
    await page.refreshRemoteGoals(true);
    expect(target.value).toBe(1000);
    expect(days.value).toBe(90);
    expect(saveBlocked.value).toBe(false);

    const saved = { ...goal("29"), targetUSDT: 100, createdAt: Date.now(), deadlineMs: Date.now() + 180 * 86_400_000 };
    goalsStore.goals = [saved];
    let release!: () => void;
    goalsStore.refresh.mockImplementationOnce(() => {
      goalsStore.status = "loading";
      return new Promise<void>((resolve) => { release = resolve; });
    });
    const reading = page.refreshRemoteGoals(true);
    expect(editorReadPending.value).toBe(true);
    goalsStore.status = "ready";
    release();
    await reading;
    expect(editorReadPending.value).toBe(false);
    expect(target.value).toBe(100);
    expect(days.value).toBe(180);
    expect(saveBlocked.value).toBe(true);
    expect(goalsStore.refreshRecommendation).toHaveBeenLastCalledWith(100, saved.deadlineMs);

    goalsStore.refresh.mockImplementationOnce(async () => { goalsStore.status = "error"; });
    await page.refreshRemoteGoals(true);
    expect(editorReadPending.value).toBe(false);
    expect(goalsStore.goals).toEqual([saved]);
    // Register and execute the real lifecycle callbacks, rather than omitting them.
    expect(page.deleteFeedbackSnapshot()).toEqual({ visible: true, generation: 0 });
    hideHooks[0]();
    expect(page.deleteFeedbackSnapshot()).toEqual({ visible: false, generation: 1 });
    const ensureCallsBeforeShow = goalsStore.ensure.mock.calls.length;
    showHooks[0]();
    await Vue.nextTick();
    expect(page.deleteFeedbackSnapshot()).toEqual({ visible: true, generation: 1 });
    expect(goalsStore.ensure).toHaveBeenCalledTimes(ensureCallsBeforeShow + 1);
    unmountHooks[0]();
    expect(page.deleteFeedbackSnapshot()).toEqual({ visible: false, generation: 2 });
    scope.stop();
  });
});
