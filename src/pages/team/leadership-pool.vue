<template>
  <AppChassis active="team">
    <RewardPageSurface>
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.pool.pageTitle" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">


        <view class="reward-summary-panel">
        <RewardHero kind="balance" :label="t.pool.weekPool" :sub="weeklyDescText">
          <text class="reward-amount">{{ remoteApiEnabled && !remotePool ? '—' : '$' + formatFinanceAmount(currentWeekPoolUSDT) }}</text>
          <template #footer><view class="reward-cta reward-rule-link" role="button" tabindex="0" @click="go('/pages/team/leadership-pool-how')" @keydown.enter.prevent="go('/pages/team/leadership-pool-how')" @keydown.space.prevent="go('/pages/team/leadership-pool-how')"><text>{{ t.pool.howItWorksEntry }}</text></view></template>
        </RewardHero>


        <view :style="statusStyle">
          <template v-if="remoteApiEnabled && !remotePool">
            <text class="block font-mono-tabular" :style="statusCapStyle('var(--v5-ink-2)')">{{ t.pool.projectedDividend }}</text>
            <text class="block font-display tabular-nums" :style="projectedStyle">—</text>
          </template>
          <template v-else-if="unlocked">
            <view class="flex items-center justify-between">
              <text class="font-mono-tabular" :style="statusCapStyle('var(--v5-ink-2)')">{{ t.pool.projectedDividend }}</text>
              <VBadge :v="myRank" size="sm" />
            </view>
            <text class="block font-display tabular-nums" :style="projectedStyle">${{ formatFinanceAmount(projectedPayout) }}</text>
            <view class="pool-votes">
              <view><text :style="statLabelStyle">{{ auditCopy.votes }}</text><text class="block" :style="statValueStyle">{{ myVotes }}</text></view>
              <view><text :style="statLabelStyle">{{ auditCopy.totalVotes }}</text><text class="block" :style="statValueStyle">{{ totalVotes }}</text></view>
              <view><text :style="statLabelStyle">{{ auditCopy.share }}</text><text class="block" :style="statValueStyle">{{ shareLabel }}</text></view>
            </view>
            <text v-if="myVotes === 0" class="block" :style="lockedSubStyle">{{ auditCopy.qualified }} · {{ auditCopy.noVotes }}</text>
          </template>
          <template v-else>
            <text class="block font-mono-tabular" :style="statusCapStyle('var(--v5-ink-3)')">{{ t.pool.locked }}</text>
            <text class="block" :style="lockedHeadStyle">
              <text>{{ requiresUnlockRankParts[0] }}</text>
              <text :style="{ color: 'var(--v5-ink)', fontWeight: 600 }">{{ requiresUnlockRankParts[1] }}</text>
              <text>{{ requiresUnlockRankParts[2] }}</text>
            </text>
            <text class="block" :style="lockedSubStyle">{{ currentlyVText }}</text>
            <view class="reward-cta" style="margin-top: 14px" role="button" tabindex="0" @click="go('/pages/team/rank')" @keydown.enter.prevent="go('/pages/team/rank')" @keydown.space.prevent="go('/pages/team/rank')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
              <text>{{ pathCtaText }}</text>
            </view>
          </template>
        </view>



        </view>
        <view v-if="poolHistory.length > 0" :style="pastGroupStyle">
          <text class="block font-mono-tabular" :style="pastHeadStyle">{{ t.pool.pastPools }}</text>
          <view
            v-for="(h, i) in poolHistory"
            :key="h.weekId"
            class="flex items-center justify-between"
            :style="historyRowStyle(i === poolHistory.length - 1)"
          >
            <view>
              <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink)' }">{{ h.weekId }}</text>
              <text v-if="poolTotalText(h)" class="block font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ poolTotalText(h) }}</text>
            </view>
            <text class="font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: 'var(--v5-ink)' }">{{ historyAmount(h.payoutUSDT) }}</text>
          </view>
        </view>

        <view v-if="remoteApiEnabled && remoteState !== 'ready' && !(remoteState === 'loading' && remotePool)" class="text-center" style="padding: 48px 20px">
          <text class="block" :style="{ color: 'var(--v5-ink-2)', fontSize: '13px' }">{{ remoteState === 'loading' ? t.pool.loading : remoteState === 'hold' ? t.pool.settlementHold : t.pool.loadError }}</text>
          <view v-if="remoteState === 'error' || remoteState === 'hold'" class="reward-cta" style="margin-top: 14px" role="button" tabindex="0" @click="retryRemotePool" @keydown.enter.prevent="retryRemotePool" @keydown.space.prevent="retryRemotePool">
            <text :style="{ color: 'var(--v5-on-brand)', fontSize: '13px', fontWeight: 600 }">{{ t.pool.retry }}</text>
          </view>
        </view>

      </view>
    </view>
    </RewardPageSurface>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatFinanceAmount } from "@/lib/finance-amount-display";
import { navTo } from "@/lib/route";
import { computed, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import RewardHero from "@/components/team/reward-compact-hero.vue";
import RewardPageSurface from "@/components/team/reward-page-surface.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VBadge from "@/components/team/v-badge.vue";
import VBadgeIcon from "@/components/team/v-badge-icon.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useLeadershipPool, V_VOTES, POOL_TOP_N, type LeadershipPayout } from "@/store/leadership-pool";
import { useVRank, type VRank } from "@/store/v-rank";
import { rankLabel, rankTitle } from "@/lib/v-rank-copy";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { useLocaleStore } from "@/store/locale";
import { apiRuntimeConfig, remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { TeamLeadershipPoolSnapshot } from "@/api/team-insights-api";
import { leadershipPoolFailureState } from "@/lib/leadership-pool-state";
import { createPayoutClock } from "@/lib/payout-clock";
import { useAuth } from '@/store/auth';
import { useApp } from "@/store/app";
import { leadershipMainRows } from "@/lib/leadership-pool-main";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import {
  captureRuntimeRevision,
  isCurrentRuntimeRevision,
  subscribeRuntimeRevision,
} from "@/api/order-api";

const t = useT();
const app = useApp();
const auth = useAuth();
const readEnvironment = [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const;
let environmentInvalidated = false;
watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => { environmentInvalidated = true; }, { flush: 'sync' });
const environmentCurrent = () => !environmentInvalidated && readEnvironment[0] === apiRuntimeConfig.environment && readEnvironment[1] === apiRuntimeConfig.baseUrl;
const vState = useVRank();
const pool = useLeadershipPool();
const rankPresentation = ref<typeof vState.ladder | null>(null);
let rejectedRankSource: typeof vState.ladder | null = null;
watch(() => [vState.remoteReady, vState.remoteError, vState.ladder] as const, ([ready, error, rows]) => {
  if (error) { rankPresentation.value = null; rejectedRankSource = rows; }
  else if (ready && rows !== rejectedRankSource && auth.isAuthenticated && environmentCurrent()) rankPresentation.value = rows;
}, { immediate: true, flush: 'sync' });
const rankDisplayReady = computed(() => rankPresentation.value !== null);
const poolRules = ref<Pick<TeamLeadershipPoolSnapshot, 'unlockRank' | 'injectRate'> | null>(null);
const remotePool = ref<TeamLeadershipPoolSnapshot | null>(null);
const remoteState = ref<"loading" | "ready" | "error" | "hold">(remoteApiEnabled ? "loading" : "ready");
let remoteRequest = 0;
let mounted = true;
let pageVisible = false;
const now = ref(Date.now());
const payoutClock = createPayoutClock({
  tick: (value) => { now.value = value; },
  nextPayoutAt: () => remoteApiEnabled ? Date.parse(remotePool.value?.nextPayoutAt ?? "") : NaN,
  refresh: () => {
    // Display expiry only; this existing wall-clock hint never settles or grants anything.
    remotePool.value = null;
    return loadRemotePool();
  },
});

const myRank = computed(() => (remoteApiEnabled ? remotePool.value?.myRank ?? 0 : vState.myRank) as VRank);
const poolUnlockRank = computed(() => (remoteApiEnabled ? remotePool.value?.unlockRank ?? poolRules.value?.unlockRank ?? 3 : 3) as VRank);
// Rank eligibility and this period's allocation are separate facts.
const unlocked = computed(() => myRank.value >= poolUnlockRank.value);
const dist = computed(() => {
  if (!remoteApiEnabled) return pool.globalVDistribution;
  const result = {} as Record<VRank, number>;
  for (let rank = 0; rank <= 12; rank += 1) result[rank as VRank] = 0;
  for (const row of remotePool.value?.distribution ?? []) result[row.vRank as VRank] = row.people;
  return result;
});
const remoteVotesByRank = computed(() => {
  const result: Record<number, number> = {};
  for (const row of remotePool.value?.distribution ?? []) result[row.vRank] = row.votes;
  return result;
});
const configuredVotes = computed(() => new Map((rankPresentation.value ?? []).map((row) => [row.v, row.leadershipVotes])));
const currentWeekPoolUSDT = computed(() => remoteApiEnabled ? remotePool.value?.currentWeekPoolUSDT ?? 0 : pool.currentWeekPoolUSDT);
const totalVotes = computed(() => remoteApiEnabled ? remotePool.value?.totalVotes ?? 0 : pool.totalVotes());
const myVotes = computed(() => remoteApiEnabled ? remotePool.value?.myVotes ?? 0 : pool.myVotes(vState.myRank));
const myShare = computed(() => remoteApiEnabled ? remotePool.value?.mySharePct ?? 0 : pool.mySharePct(vState.myRank));
const projectedPayout = computed(() => remoteApiEnabled ? remotePool.value?.projectedPayoutUSDT ?? 0 : pool.myProjectedPayout(vState.myRank));
const nextPayoutTs = computed(() => remoteApiEnabled ? Date.parse(remotePool.value?.nextPayoutAt ?? "") || Date.now() : pool.nextPayoutTs());
const poolHistory = computed<LeadershipPayout[]>(() => remoteApiEnabled
  ? (remotePool.value?.history ?? []).map((item) => ({ weekId: item.weekId, weekStartTs: 0,
      poolUSDT: 0, myVotes: myVotes.value, totalVotes: totalVotes.value,
      mySharePct: myShare.value, payoutUSDT: item.payoutUSDT }))
  : pool.history);
const daysToPayout = computed(() => Math.max(0, Math.ceil((nextPayoutTs.value - now.value) / 86400000)));
const hoursToPayout = computed(() => Math.max(0, Math.ceil((nextPayoutTs.value - now.value) / 3600000)));

const weeklyDescText = computed(() => {
  if (remoteApiEnabled && !remotePool.value) return "—";
  const n = daysToPayout.value > 0 ? `${daysToPayout.value}${t.value.pool.daysShort}` : `${hoursToPayout.value}${t.value.pool.hoursShort}`;
  return fmt(t.value.pool.weeklyDesc, { n });
});
const locale = useLocaleStore();
const auditCopy = computed(() => networkReauditCopy(locale.code));
const shareLabel = computed(() => totalVotes.value > 0 && Number.isFinite(myShare.value)
  ? `${(myShare.value * 100).toLocaleString(locale.code, { maximumFractionDigits: 2 })}%` : '—');
const rankReady = computed(() => rankDisplayReady.value);
const poolUnlockRankLabel = computed(() => rankReady.value ? rankLabel(poolUnlockRank.value, locale.code, rankPresentation.value ?? []) : "—");
const requiresUnlockRankParts = computed(() => {
  const sentence = fmt(t.value.pool.requiresUnlockRank, { rank: poolUnlockRankLabel.value });
  const i = sentence.indexOf(poolUnlockRankLabel.value);
  if (i >= 0) return [sentence.slice(0, i), poolUnlockRankLabel.value, sentence.slice(i + poolUnlockRankLabel.value.length)];
  return [sentence, "", ""];
});
const currentlyVText = computed(() => fmt(t.value.pool.currentlyUnlockRank, {
  n: myRank.value, title: rankTitle(myRank.value, locale.code, rankPresentation.value ?? []), rank: poolUnlockRankLabel.value,
}));
const pathCtaText = computed(() => fmt(t.value.pool.seePathUnlockRank, { rank: poolUnlockRankLabel.value }));
const totalPeopleText = computed(() =>
  fmt(t.value.pool.totalPeople, { n: Object.values(dist.value).reduce((a, b) => a + b, 0).toLocaleString() }),
);
// 头部集中度:派生真值(顶部 N 名领袖占池比),随 seed/票权变,非硬编码。
const poolTopN = computed(() => remoteApiEnabled ? remotePool.value?.topN ?? 0 : POOL_TOP_N);
const topPct = computed(() => {
  if (!remoteApiEnabled) return Math.round(pool.topConcentrationPct() * 100);
  if (totalVotes.value <= 0) return 0;
  let remaining = poolTopN.value; let votes = 0;
  for (let rank = 12; rank >= poolUnlockRank.value && remaining > 0; rank -= 1) {
    const count = dist.value[rank as VRank] ?? 0; const take = Math.min(count, remaining);
    votes += take * (remoteVotesByRank.value[rank] ?? 0); remaining -= take;
  }
  return Math.round((votes / totalVotes.value) * 100);
});
const concentrationText = computed(() => fmt(t.value.pool.concentrationHint, { n: poolTopN.value, pct: topPct.value }));

const voteRows = computed(() => {
  const ranks = Array.from({ length: 13 - poolUnlockRank.value }, (_, index) =>
    (poolUnlockRank.value + index) as VRank);
  const canonicalRows = remoteApiEnabled
    ? leadershipMainRows(remotePool.value ?? { totalVotes: 0, distribution: [] }, myRank.value, ranks, configuredVotes.value)
    : [];
  const canonicalByRank = new Map(canonicalRows.map((row) => [row.rank, row]));
  return ranks.map((v) => {
    const canonical = canonicalByRank.get(v);
    const count = remoteApiEnabled ? canonical?.people ?? 0 : dist.value[v] ?? 0;
    const votes = remoteApiEnabled ? canonical?.votes ?? null : V_VOTES[v];
    const shareOfPool = remoteApiEnabled
      ? (canonical?.sharePct ?? 0) / 100
      : totalVotes.value > 0 ? (count * V_VOTES[v]) / totalVotes.value : 0;
    return {
      v,
      label: rankLabel(v, locale.code, rankPresentation.value ?? []),
      isMine: remoteApiEnabled ? canonical?.isMine === true : v === vState.myRank,
      peopleVotes: fmt(t.value.pool.peopleVotesEa, { count: count.toLocaleString(), votes: votes ?? "—" }),
      shareOfPool,
      perPerson: formatFinanceAmount((currentWeekPoolUSDT.value * shareOfPool) / Math.max(count, 1)),
    };
  });
});

function poolTotalText(h: LeadershipPayout): string {
  if (remoteApiEnabled && h.poolUSDT <= 0) return "";
  return fmt(t.value.pool.poolTotalShort, { k: formatFinanceAmount(h.poolUSDT / 1000), n: h.totalVotes.toLocaleString() });
}

function go(url: string) {
  navTo(url);
}
function historyAmount(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  return `${value > 0 ? '+' : ''}$${formatFinanceAmount(value)}`;
}
function retryRemotePool() {
  if (remoteState.value === 'loading') return;
  void loadRemotePool();
}

async function loadRemotePool() {
  if (!remoteApiEnabled || !pageVisible || !auth.isAuthenticated || !environmentCurrent()) return;
  const request = ++remoteRequest;
  const accountKey = app.accountKey;
  const accountScope = captureAccountScope();
  const runScope = captureRuntimeRevision();
  const readLocale = locale.code;
  void vState.refreshCanonicalVRank();
  remoteState.value = "loading";
  const current = () => mounted && pageVisible && request === remoteRequest && accountKey === app.accountKey
    && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope)
    && auth.isAuthenticated && readLocale === locale.code && environmentCurrent();
  try {
    const snapshot = await teamInsightsApi.leadershipPool();
    if (!current()) return;
    remotePool.value = snapshot;
    poolRules.value = { unlockRank: snapshot.unlockRank, injectRate: snapshot.injectRate };
    remoteState.value = "ready";
  } catch (cause) {
    if (!current()) return;
    remotePool.value = null; poolRules.value = null;
    remoteState.value = leadershipPoolFailureState(cause);
  }
}

watch(() => [app.accountKey, app.accountBindingEpoch, auth.isAuthenticated, locale.code, apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => {
  if (!remoteApiEnabled) return;
  remoteRequest += 1; remotePool.value = null; poolRules.value = null; remoteState.value = 'loading';
  rejectedRankSource = vState.ladder; rankPresentation.value = null;
  if (auth.isAuthenticated && environmentCurrent()) void loadRemotePool();
}, { flush: 'sync' });
const unsubscribePoolRun = subscribeRuntimeRevision(() => {
  if (!remoteApiEnabled || !mounted) return;
  remoteRequest += 1;
  remoteState.value = "loading";
  void loadRemotePool();
});
onShow(() => {
  pageVisible = true;
  if (remoteApiEnabled) void loadRemotePool();
  payoutClock.start();
});
onHide(() => {
  pageVisible = false;
  remoteRequest += 1;
  remotePool.value = null;
  remoteState.value = remoteApiEnabled ? "loading" : "ready";
  payoutClock.stop();
});
onUnmounted(() => {
  pageVisible = false;
  payoutClock.stop();
  unsubscribePoolRun();
  mounted = false;
  remoteRequest += 1;
  remotePool.value = null;
});

const statusStyle: CSSProperties = {
  padding: "16px 0",
  background: "transparent",
};
function statusCapStyle(color: string): CSSProperties {
  return { fontSize: "12px", letterSpacing: "0.16em", color };
}
const projectedStyle: CSSProperties = { marginTop: "8px", fontSize: "28px", fontWeight: 600, lineHeight: 1.2, color: "var(--v5-ink)" };
const statLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const statValueStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)", marginTop: "2px" };
const lockedHeadStyle: CSSProperties = { marginTop: "8px", fontSize: "15px", color: "var(--v5-ink)" };
// SKILL leading-snug = 1.375 (原版 .mt-1.5 text-[12px] leading-snug; was 1.45)
const lockedSubStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.375 };
// Transparent hairline group (form a) — border-top opens the group, rows keep
// their hairlines, content sits on the 2px optical inset.
const pastGroupStyle: CSSProperties = { marginTop: "12px", padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
const pastHeadStyle: CSSProperties = { padding: "12px 0 8px", fontSize: "12px", letterSpacing: "0.16em", color: "var(--v5-ink-3)" };
function historyRowStyle(isLast: boolean): CSSProperties {
  return { padding: "12px 0", borderBottom: isLast ? "none" : "1px solid var(--v5-border)" };
}
</script>

<style scoped>
.pool-votes { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--ui-space-inline); margin-top:var(--ui-space-inset); overflow-wrap:anywhere; }
</style>
