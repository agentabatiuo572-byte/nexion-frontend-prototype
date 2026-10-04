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
  recommendation: { purchaseRequired: boolean } | null;
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
  it("locks the default editor until the server goal has loaded", async () => {
    const html = await show("loading", []);
    expect(html).toMatch(/<input[^>]*disabled/);
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toMatch(/<text[^>]*>Recommendation<\/text>/);
  });

  it("keeps a confirmed snapshot and exposes a retry after a later list failure", async () => {
    const html = await show("error", [goal()]);
    expect(html).toContain("$500");
    expect(html).toContain("Retry");
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
    const app = Vue.reactive({ accountKey: "user:1", accountBindingEpoch: 1 });
    const target = Vue.ref(1000);
    const days = Vue.ref(90);
    const restoredGoal = Vue.ref<{ targetUSDT: number; days: number } | null>(null);
    const saveBlocked = Vue.computed(() => restoredGoal.value !== null
      && target.value === restoredGoal.value.targetUSDT && days.value === restoredGoal.value.days);
    const savePending = Vue.ref(false);
    const older = { ...goal("older"), targetUSDT: 1000, createdAt: Date.now() - 2 * 86_400_000 };
    const stored = { ...goal("newer"), deadlineMs: Date.now() + 89 * 86_400_000,
      createdAt: Date.now() - 86_400_000 };
    const goalsStore = {
      accountEpoch: 1, status: "ready", goals: [stored, older],
      ensure: vi.fn().mockResolvedValue(undefined), refresh: vi.fn().mockResolvedValue(undefined),
      refreshRecommendation: vi.fn().mockResolvedValue(undefined),
    };
    const execute = new Function("remoteApiEnabled", "goalsStore", "target", "days", "restoredGoal", "savePending", "ONE_DAY_MS", "onMounted", "onShow", "watch", "app", `let editorReadEpoch = 0; let restoringEditor = false; ${ts.transpileModule(implementation, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText}; return { refreshRemoteGoals, retryGoals };`);
    const scope = Vue.effectScope();
    const page = scope.run(() => execute(true, goalsStore, target, days, restoredGoal, savePending, 86_400_000, (hook: () => void) => mount.push(hook), (hook: () => void) => showHooks.push(hook), Vue.watch, app));
    expect(mount).toHaveLength(1);
    expect(showHooks).toHaveLength(1);
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
    scope.stop();
  });
});
