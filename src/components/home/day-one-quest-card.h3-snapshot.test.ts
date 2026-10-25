import { compile } from "@vue/compiler-dom";
import { formatAmount } from "@/lib/amount-display";
import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import { describe, expect, it } from "vitest";
import dayOneCardSource from "./day-one-quest-card.vue?raw";
import weeklyQuestListSource from "./weekly-quest-list.vue?raw";
import weeklyQuestHeroSource from "./weekly-quest-hero.vue?raw";

const template = dayOneCardSource.match(/<template>([\s\S]*?)^<\/template>/m)?.[1];
if (!template) throw new Error("DAY_ONE_CARD_TEMPLATE_MISSING");

// Compile and render the real card template. The state below is the smallest
// public view-model its setup script supplies, so both EMPTY and SNAPSHOT
// assertions execute the template's v-if branch instead of string matching.
const render = new Function("Vue", compile(template, {
  mode: "function",
  prefixIdentifiers: true,
  isCustomElement: (tag) => tag === "view" || tag === "text",
}).code)(await import("vue"));

const home = {
  dayOneFirstDayReward: "Day-One reward",
  dayOneEndsIn: "Ends in",
  dayOneExpired: "Eligibility ended",
  dayOneLoading: "Loading live tasks…",
  dayOneUnavailable: "Tasks unavailable",
  dayOneRetryLoad: "Tap to retry",
  dayOneDoneSuffix: "done",
  dayOneRewardClaimed: "Reward claimed",
  dayOneRewardUnclaimed: "Reward not claimed",
  dayOneCompleteAllHint: "Complete all tasks to claim the reward",
  dayOneNoActiveTasks: "No onboarding tasks are active for this account.",
  dayOneSnapshotUnverified: "Unverified history",
  dayOneClaimReward: "Claim Day-One reward",
  dayOneClaiming: "Confirming claim",
  dayOneClaimUnconfirmed: "Claim not confirmed",
  dayOneEarnedSuffix: "earned",
};

function renderCard(
  claimState: { empty: boolean; claimed: boolean; unverified: boolean; claimCode: string | null },
  unavailable = false,
  expired = false,
  expanded = false,
) {
  const component = {
    setup: () => ({
      formatAmount,
      props: { active: true }, expanded, rootStyle: {}, t: { home, quest: { expired: "EXPIRED" } },
      taskCountText: unavailable ? home.dayOneUnavailable : "0 tasks", rewardText: "—",
      questUnavailable: unavailable, questLoadError: unavailable,
      unavailableLabel: home.dayOneUnavailable,
      remoteApiEnabled: true, dayOneWindow: expired ? {} : null, dayOneExpired: expired,
      remainingLabel: "—", barStyle: {},
      completedCount: 0, total: 0, claimState, nexEarnedText: "0",
      tasks: expanded ? [{ id: "pending", order: 1, label: "Pending task", nex: null },
        { id: "completed", order: 2, label: "Completed task", nex: null }] : [],
      quest: { dayOneClaiming: false, dayOneClaimError: false }, toggleStyle: {},
      toggleLabel: unavailable ? home.dayOneRetryLoad : "View tasks",
      observationNotices: [], isActionable: (task: { id: string }) => task.id === "pending", onRowTap: () => undefined,
      onClaim: () => undefined, toggleExpanded: () => undefined,
      isDone: (task: { id: string }) => task.id === "completed",
      rowStyle: () => ({}), circleStyle: () => ({}), labelStyle: () => ({}),
      catStyle: () => ({}), rewardStyle: () => ({}),
    }),
    render,
  };
  return renderToString(createSSRApp(component));
}

describe("DayOneQuestCard H3 snapshot presentation", () => {
  it("shows one group-reward explanation and no per-task amount placeholders", async () => {
    const html = await renderCard({ empty: false, claimed: false, unverified: false, claimCode: null }, false, false, true);
    expect(html).toContain(home.dayOneCompleteAllHint);
    const rows = html.slice(html.indexOf('role="button"'), html.indexOf('newcomer-task__toggle'));
    expect(rows).toContain("Pending task");
    expect(rows).toContain("Completed task");
    expect(rows).not.toContain("—");
    expect(rows).not.toContain("UVT");
    expect(rows).toContain('aria-disabled="false"');
    expect(rows).toContain('aria-disabled="true"');
  });

  it("does not invite completion after expiry, claim, or an unverified read", async () => {
    for (const state of [
      { empty: false, claimed: true, unverified: false, claimCode: null },
      { empty: false, claimed: false, unverified: true, claimCode: null },
    ]) {
      expect(await renderCard(state, false, false, true)).not.toContain(home.dayOneCompleteAllHint);
    }
    const state = { empty: false, claimed: false, unverified: false, claimCode: null };
    expect(await renderCard(state, false, true, true)).not.toContain(home.dayOneCompleteAllHint);
    expect(await renderCard(state, true, false, true)).not.toContain(home.dayOneCompleteAllHint);
  });

  it("localizes default server names only at the day-one and weekly display boundary", () => {
    expect(dayOneCardSource).toContain("label: dayOneQuestDisplayName(row, locale.code, t.value)");
    expect(dayOneCardSource).toContain("id: row.questCode");
    expect(dayOneCardSource).toContain("href: row.actionRoute");
    expect(weeklyQuestListSource).toContain("return weeklyQuestDisplayName(q, locale.code, t.value)");
    expect(weeklyQuestHeroSource).toContain("weeklyQuestDisplayName(quest.value, locale.code, t.value)");
  });

  it("shows a retry control for a failed read without falsely requesting sign-in", async () => {
    const html = await renderCard({ empty: false, claimed: false, unverified: false, claimCode: null }, true);
    expect(html).toContain(home.dayOneUnavailable);
    expect(html).toContain(home.dayOneRetryLoad);
    expect(html).toContain('aria-disabled="false"');
    expect(html).not.toContain("Sign in to view");
  });

  it("renders EMPTY as no active onboarding tasks and exposes no reward claim control", async () => {
    const html = await renderCard({ empty: true, claimed: false, unverified: false, claimCode: null });
    expect(html).toContain(home.dayOneNoActiveTasks);
    expect(html).not.toContain(home.dayOneRewardUnclaimed);
    expect(html).not.toContain(home.dayOneClaimReward);
    expect(html).not.toContain("newcomer-task__claim\"");
  });

  it("renders a verified complete snapshot's claim control", async () => {
    const html = await renderCard({ empty: false, claimed: false, unverified: false, claimCode: "frozen-1" });
    expect(html).toContain(home.dayOneClaimReward);
    expect(html).toContain("newcomer-task__claim");
  });

  it("shows an expired state without an active countdown label", async () => {
    const html = await renderCard({ empty: false, claimed: false, unverified: false, claimCode: null }, false, true);
    expect(html).toContain("EXPIRED");
    expect(html).toContain('aria-label="Eligibility ended"');
    expect(html).not.toContain("Ends in");
  });
});
