import { describe, expect, it } from "vitest";
// @ts-expect-error This source-level UI contract runs in Node.
import { readFileSync } from "node:fs";

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

describe("wallet pagination UI contracts", () => {
  it("uses server-filtered pagers without the legacy eager ledger refresh", () => {
    const page = read("wallet-bills.vue");
    expect(page).toContain("getLedger");
    expect(page).toContain("activePager.value.refresh()");
    expect(page).toContain("activePager.value.loadMore()");
    expect(page).not.toContain("refreshServerLedger");
    expect(page).not.toContain("useScrollGrowProgress");
  });

  it("keeps remote summary consumers unknown while loading or failed", () => {
    const rewards = read("rewards.vue");
    const nex = read("wallet-nex.vue");
    const card = read("../../components/me/wallet-card.vue");
    expect(rewards).toContain("summaryStatus");
    expect(rewards).toContain("rewardsUsdt");
    expect(nex).toContain("todayNexEarn");
    expect(nex).toContain("pendingNex");
    expect(card).toContain("monthBillCount");
    expect(card).toContain("if (fundsServerEnabled) return bills.summary?.monthBillCount");
  });

  it("does not advance the reward watermark after a failed summary or a late account response", () => {
    const rewardsSeen = read("../../store/rewards-seen.ts");
    const rewards = read("rewards.vue");
    expect(rewardsSeen).toContain("latestRewardAt");
    expect(rewardsSeen).toContain("summaryStatus");
    expect(rewardsSeen).toContain("bills.summary!.asOf");
    expect(rewardsSeen).toContain('bills.summaryStatus !== "ready" || !bills.summary');
    expect(rewards).toContain("const accountKey = app.accountKey");
    expect(rewards).toContain("accountKey === app.accountKey && bills.summaryStatus === \"ready\"");
    expect(rewards).toContain("remoteAccountScope.isCurrent(accountScope)");
    expect(rewards).toContain("onHide(invalidateRewardView)");
    expect(rewards).toContain("onUnmounted(invalidateRewardView)");
  });

  it("distinguishes an unavailable NEX summary from a genuinely empty activity history", () => {
    const nex = read("wallet-nex.vue");
    expect(nex).toContain('v-if="remoteApiEnabled && bills.summaryStatus === \'error\'"');
    expect(nex).toContain('@click="refreshNexSummary"');
    expect(nex).toContain('v-else-if="remoteApiEnabled && bills.summaryStatus !== \'ready\'"');
    expect(nex).toContain("t.wallet.loadingTransactions");
    expect(nex).not.toContain('<text>…</text>');
    expect(read("wallet-bills.vue")).toContain("t.wallet.loadingTransactions");
  });

  it("keeps rows visible for append failures, while initial refresh failures retry the first page", () => {
    for (const page of [read("wallet-bills.vue"), read("rewards-list.vue")]) {
      expect(page).toContain("initialLoading");
      expect(page).toContain("initialError");
    }
    expect(read("wallet-bills.vue")).toContain('activePager.value.status === "error" && activePager.value.rows.length > 0');
    expect(read("wallet-bills.vue")).toContain('activePager.value.status === "ready" && activePager.value.rows.length > 0 && Boolean(activePager.value.error)');
    expect(read("rewards-list.vue")).toContain('activePager.value.status === "error" && records.value.length > 0');
    expect(read("rewards-list.vue")).toContain('activePager.value.status === "ready" && records.value.length > 0 && Boolean(activePager.value.error)');
    expect(read("wallet-bills.vue")).toContain('@click="refreshLedger"');
    expect(read("wallet-bills.vue")).toContain('@click="loadMore"');
    expect(read("wallet-bills.vue")).toContain('loading: () => activePager.value.loadingMore || activePager.value.status === "loading"');
    expect(read("rewards-list.vue")).toContain('@click="refreshRecords"');
    expect(read("rewards-list.vue")).toContain('@click="loadMoreRecords"');
    expect(read("rewards-list.vue")).toContain('loading: () => activePager.value.loadingMore || activePager.value.status === "loading"');
  });

  it("guards deferred scroll bindings against page-hide and duplicate lifecycle rebinds", () => {
    const composable = read("../../composables/use-manual-scroll-load-more.ts");
    expect(composable).toContain("let revision = 0");
    expect(composable).toContain("if (!active || currentRevision !== revision) return");
    expect(composable).toContain("onHide(deactivate)");
    expect(composable).toContain("onUnmounted(deactivate)");
  });
});
