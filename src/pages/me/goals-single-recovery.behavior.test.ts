import * as Vue from "vue";
import { expect, it, vi } from "vitest";
import { all, flush, mountEntry, slot, text } from "@/lib/entry-review.test-support";
import { formatAmount, formatGroupedAmount } from "@/lib/amount-display";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import type { Goal } from "@/store/goals";
import source from "./goals.vue?raw";

it("offers one recovery action, then saves and reads back 500/90 days and deletes the goal", async () => {
  let failing = true;
  const goalsStore = Vue.reactive({ status: "loading", accountEpoch: 1, readSuccessRevision:0, readSuccessScope:{accountKey:"test",epoch:1}, captureReadBinding:()=>({accountKey:"test",epoch:1}), goals: [] as Goal[], lifetimeEarningsUsdt: 375,
    recommendationStatus: "idle", recommendationError: null, recommendation: null as { purchaseRequired: boolean } | null,
    ensure: vi.fn(async () => { goalsStore.status = failing ? "error" : "ready"; if(!failing)goalsStore.readSuccessRevision++; }),
    refresh: vi.fn(async () => { goalsStore.status = "loading"; await Promise.resolve(); goalsStore.status = failing ? "error" : "ready"; if(!failing)goalsStore.readSuccessRevision++; }),
    refreshRecommendation: vi.fn(async () => { goalsStore.recommendationStatus = "ready"; goalsStore.recommendation = { purchaseRequired: false }; }),
    setGoal: vi.fn(async (intent: { targetUSDT: number; days: number; deadlineMs: number }) => {
      goalsStore.goals = [{ id: "goal-test", targetUSDT: intent.targetUSDT, deadlineMs: intent.deadlineMs, createdAt: intent.deadlineMs - intent.days * 86400000, achieved: false }];
      return "saved";
    }),
    remove: vi.fn(async (id: string) => { goalsStore.goals = goalsStore.goals.filter(goal => goal.id !== id); }),
  });
  const ui = { pushToast: vi.fn() };
  let actions!: { refreshRemoteGoals(force?: boolean): Promise<void>; onSave(): Promise<void> };
  const page = mountEntry(source.replace("</script>", 'import { capture } from "test:probe"; capture({ refreshRemoteGoals, onSave });\n</script>'), {
    "test:probe": { capture: (value: typeof actions) => { actions = value; } },
    "@/lib/amount-display": { formatAmount, formatGroupedAmount }, "@/lib/route": { navReset: vi.fn() },
    "@dcloudio/uni-app": { onShow: vi.fn(), onHide: vi.fn() },
    "@/components/app-chassis.vue": slot, "@/components/sub-page-header.vue": { default: { render: () => null } },
    "@/components/me/goal-progress-bar.vue": { default: { render: () => null } },
    "@/i18n/use-t": { useT: () => Vue.ref(zh) }, "@/i18n/format": { fmt },
    "@/store/goals": { useGoals: () => goalsStore }, "@/store/app": { useApp: () => ({ accountKey: "test", accountBindingEpoch: 1 }) },
    "@/store/ui": { useUI: () => ui }, "@/api/runtime": { remoteApiEnabled: true }, "@/lib/brand-copy": { nexGridBrandText: (value: string) => value },
  });
  await flush();
  const singleFailure = () => {
    expect(text(page.root).split(zh.goals.serverUnavailable)).toHaveLength(2);
    expect(all(page.root).filter(n => n.props.role === "button" && n.props["aria-label"] === zh.ui.retry)).toHaveLength(1);
    expect(page.control(zh.goals.saveCta)?.props["aria-disabled"]).toBe(true);
  };
  singleFailure(); await actions.onSave(); expect(goalsStore.setGoal).not.toHaveBeenCalled();
  failing = false; page.control(zh.ui.retry)!.props.onClick(); await flush();
  expect(goalsStore.refresh).toHaveBeenCalledOnce();
  expect(text(page.root)).not.toContain(zh.goals.serverUnavailable);
  page.nodes("nx-goal-target-preset")[0].props.onClick();
  page.nodes("nx-goal-deadline-preset")[1].props.onClick(); await flush();
  await page.control(zh.goals.saveCta)!.props.onClick(); await flush();
  expect(goalsStore.setGoal).toHaveBeenCalledWith(expect.objectContaining({ targetUSDT: 500, days: 90 }));
  expect(text(page.root)).toContain("75%");
  const saved = page.control(zh.goals.saveCta)!;
  expect(saved.props["aria-disabled"]).toBe(true);
  expect(saved.props.style).toMatchObject({ background: "var(--v5-brand)" });
  await saved.props.onClick(); expect(goalsStore.setGoal).toHaveBeenCalledOnce();
  failing = true; await actions.refreshRemoteGoals(true); await flush();
  singleFailure(); expect(text(page.root)).not.toContain("75%");
  failing = false; page.control(zh.ui.retry)!.props.onClick(); await flush();
  const removeLabel = fmt(zh.goals.removeGoalLabel, { amount: formatAmount(500) });
  await all(page.root).find(n => n.props["aria-label"] === removeLabel)!.props.onClick(); await flush();
  expect(goalsStore.remove).toHaveBeenCalledWith("goal-test"); expect(text(page.root)).not.toContain("75%");
  page.unmount();
});
