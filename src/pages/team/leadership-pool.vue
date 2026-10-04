<!--
  Global Leadership Pool — ported from
  Nexion-prototype/app/(main)/team/leadership-pool/page.tsx.
  Week-pool hero de-carded (DECARD form c): $X K sits directly on the page floor
  (card gradient/radial + accent border deleted, not tuned). My-status block =
  frosted-glass card, zero border (owner 2026-07-09; unlocked: projected dividend
  + votes/share stats / locked: V3-gate + path CTA). V-rank vote-weight table = single surface
  container (form b, no border, mine-row tinted). Past-pools history = transparent
  hairline group (form a). Sub-page → <AppChassis active="team"> w/ back → /team.
  Reuses leadership-pool + v-rank stores + VBadge/VBadgeIcon. useMemo → computed.
  <Link>→<view @click>.
-->
<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.pool.pageTitle" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <view v-if="remoteApiEnabled && remoteState !== 'ready'" class="text-center" style="padding: 48px 20px">
          <text class="block" :style="{ color: 'var(--v5-ink-2)', fontSize: '13px' }">{{ remoteState === 'loading' ? t.pool.loading : remoteState === 'hold' ? t.pool.settlementHold : t.pool.loadError }}</text>
          <view v-if="remoteState === 'error'" class="inline-flex items-center justify-center active:opacity-70" style="margin-top: 14px; min-height: 44px; padding: 0 18px; border-radius: 999px; background: var(--v5-brand)" @click="loadRemotePool">
            <text :style="{ color: 'var(--v5-on-brand)', fontSize: '13px', fontWeight: 600 }">{{ t.pool.retry }}</text>
          </view>
        </view>
        <template v-else>
        <!-- Week pool hero — de-carded: big number sits directly on the page
             floor (card gradient/radial would be a floor aura → deleted per
             owner call 2026-07-08, accent border dropped with it). Rules-intro
             pill rides the cap row (owner 2026-07-09: kill the empty gap above). -->
        <view class="text-center" :style="heroStyle">
          <view class="flex items-center justify-between" style="gap: 8px">
            <view class="flex items-center justify-center font-mono-tabular" :style="heroCapStyle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" /><path d="M5 21h14" /></svg>
              <text>{{ t.pool.weekPool }}</text>
            </view>
            <view class="inline-flex items-center shrink-0 active:scale-[0.98] transition-transform" :style="howEntryStyle" @click="go('/pages/team/leadership-pool-how')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
              <text>{{ t.pool.howItWorksEntry }}</text>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </view>
          </view>
          <text class="block font-display tabular-nums" :style="heroBigStyle">${{ (currentWeekPoolUSDT / 1000).toFixed(1) }}K</text>
          <text class="block" :style="heroDescStyle">{{ weeklyDescText }}</text>
        </view>

        <!-- My status — frosted-glass card (owner 2026-07-09), fill only /
             zero border; both unlocked & locked variants share the shell. -->
        <view :style="statusStyle">
          <template v-if="unlocked">
            <view class="flex items-center justify-between">
              <text class="font-mono-tabular" :style="statusCapStyle('var(--v5-brand)')">{{ t.pool.projectedDividend }}</text>
              <VBadge :v="myRank" size="sm" />
            </view>
            <text class="block font-display tabular-nums" :style="projectedStyle">${{ projectedPayout.toFixed(2) }}</text>
          </template>
          <template v-else>
            <text class="block font-mono-tabular" :style="statusCapStyle('var(--v5-ink-3)')">{{ t.pool.locked }}</text>
            <text class="block" :style="lockedHeadStyle">
              <text>{{ requiresUnlockRankParts[0] }}</text>
              <text :style="{ color: 'var(--v5-brand)', fontWeight: 600 }">{{ requiresUnlockRankParts[1] }}</text>
              <text>{{ requiresUnlockRankParts[2] }}</text>
            </text>
            <text class="block" :style="lockedSubStyle">{{ currentlyVText }}</text>
            <view class="inline-flex items-center active:scale-[0.97] transition-transform" :style="pathCtaStyle" @click="go('/pages/team/rank')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
              <text>{{ pathCtaText }}</text>
            </view>
          </template>
        </view>


        <!-- Past pools — transparent hairline group (form a, ledger idiom). -->
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
            <text class="font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: h.payoutUSDT > 0 ? 'var(--v5-brand)' : 'var(--v5-ink-3)' }">{{ h.payoutUSDT > 0 ? `+$${h.payoutUSDT.toFixed(2)}` : "—" }}</text>
          </view>
        </view>
        </template>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VBadge from "@/components/team/v-badge.vue";
import VBadgeIcon from "@/components/team/v-badge-icon.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useLeadershipPool, V_VOTES, POOL_TOP_N, type LeadershipPayout } from "@/store/leadership-pool";
import { useVRank, type VRank } from "@/store/v-rank";
import { rankLabel, rankTitle } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { TeamLeadershipPoolSnapshot } from "@/api/team-insights-api";
import { leadershipPoolFailureState } from "@/lib/leadership-pool-state";
import { createPayoutClock } from "@/lib/payout-clock";
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
const vState = useVRank();
const pool = useLeadershipPool();
const remotePool = ref<TeamLeadershipPoolSnapshot | null>(null);
const remoteState = ref<"loading" | "ready" | "error" | "hold">(remoteApiEnabled ? "loading" : "ready");
let remoteRequest = 0;
let mounted = true;
let pageVisible = false;
const now = ref(Date.now());
const payoutClock = createPayoutClock({
  tick: (value) => { now.value = value; },
  nextPayoutAt: () => remoteApiEnabled ? Date.parse(remotePool.value?.nextPayoutAt ?? "") : NaN,
  refresh: () => loadRemotePool(),
});

const myRank = computed(() => (remoteApiEnabled ? remotePool.value?.myRank ?? 0 : vState.myRank) as VRank);
const poolUnlockRank = computed(() => (remoteApiEnabled ? remotePool.value?.unlockRank ?? 3 : 3) as VRank);
const poolInjectRate = computed(() => remoteApiEnabled ? remotePool.value?.injectRate ?? 0 : 0.05);
const unlocked = computed(() => remoteApiEnabled ? (remotePool.value?.myVotes ?? 0) > 0 : myRank.value >= poolUnlockRank.value);
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
const configuredVotes = computed(() => new Map(vState.ladder.map((row) => [row.v, row.leadershipVotes])));
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
  const n = daysToPayout.value > 0 ? `${daysToPayout.value}${t.value.pool.daysShort}` : `${hoursToPayout.value}${t.value.pool.hoursShort}`;
  const rate = `${(poolInjectRate.value * 100).toFixed(2).replace(/\\.00$/, "")}%`;
  return fmt(t.value.pool.weeklyDesc, { rate, n });
});
const locale = useLocaleStore();
const rankReady = computed(() => vState.remoteReady);
const poolUnlockRankLabel = computed(() => rankReady.value ? rankLabel(poolUnlockRank.value, locale.code, vState.ladder) : "—");
const requiresUnlockRankParts = computed(() => {
  const sentence = fmt(t.value.pool.requiresUnlockRank, { rank: poolUnlockRankLabel.value });
  const i = sentence.indexOf(poolUnlockRankLabel.value);
  if (i >= 0) return [sentence.slice(0, i), poolUnlockRankLabel.value, sentence.slice(i + poolUnlockRankLabel.value.length)];
  return [sentence, "", ""];
});
const currentlyVText = computed(() => fmt(t.value.pool.currentlyUnlockRank, {
  n: myRank.value, title: rankTitle(myRank.value, locale.code, vState.ladder), rank: poolUnlockRankLabel.value,
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
      label: rankLabel(v, locale.code, vState.ladder),
      isMine: remoteApiEnabled ? canonical?.isMine === true : v === vState.myRank,
      peopleVotes: fmt(t.value.pool.peopleVotesEa, { count: count.toLocaleString(), votes: votes ?? "—" }),
      shareOfPool,
      perPerson: ((currentWeekPoolUSDT.value * shareOfPool) / Math.max(count, 1)).toFixed(0),
    };
  });
});

function poolTotalText(h: LeadershipPayout): string {
  if (remoteApiEnabled && h.poolUSDT <= 0) return "";
  return fmt(t.value.pool.poolTotalShort, { k: (h.poolUSDT / 1000).toFixed(1), n: h.totalVotes.toLocaleString() });
}

function go(url: string) {
  navTo(url);
}

async function loadRemotePool() {
  if (!remoteApiEnabled || !pageVisible) return;
  const request = ++remoteRequest;
  const accountKey = app.accountKey;
  const accountScope = captureAccountScope();
  const runScope = captureRuntimeRevision();
  void vState.refreshCanonicalVRank();
  remoteState.value = "loading";
  remotePool.value = null;
  const current = () => mounted && pageVisible && request === remoteRequest && accountKey === app.accountKey
    && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope);
  try {
    const snapshot = await teamInsightsApi.leadershipPool();
    if (!current()) return;
    remotePool.value = snapshot;
    remoteState.value = "ready";
  } catch (cause) {
    if (!current()) return;
    remotePool.value = null;
    remoteState.value = leadershipPoolFailureState(cause);
  }
}

watch(() => app.accountKey, () => {
  if (!remoteApiEnabled) return;
  remotePool.value = null;
  void loadRemotePool();
});
const unsubscribePoolRun = subscribeRuntimeRevision(() => {
  if (!remoteApiEnabled || !mounted) return;
  remoteRequest += 1;
  remotePool.value = null;
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

// ─── styles ───
// Soft tint only — pills carry no border (chip/pill whitelist rule).
const howEntryStyle: CSSProperties = {
  gap: "6px",
  padding: "0 12px",
  height: "34px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
};

// De-carded hero: no surface/border/glow — the big number sits directly on the
// page floor with a 2px optical inset (leaderboard.vue prize-hero idiom).
const heroStyle: CSSProperties = { padding: "10px 2px 0" };
const heroCapStyle: CSSProperties = { gap: "6px", fontSize: "12px", letterSpacing: "0.16em", color: "var(--v5-brand-2)" };
const heroBigStyle: CSSProperties = { marginTop: "8px", fontSize: "56px", fontWeight: 600, lineHeight: 1, color: "var(--v5-ink)" };
const heroDescStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-ink-3)" };

// Frosted-glass status card (owner 2026-07-09) — chassis glass-tile token,
// fill only / zero border (bg-filled cards carry no border line).
const statusStyle: CSSProperties = {
  padding: "16px",
  borderRadius: "16px",
  background: "var(--v5-glass-bg)",
  backdropFilter: "blur(18px) saturate(180%)",
};
function statusCapStyle(color: string): CSSProperties {
  return { fontSize: "12px", letterSpacing: "0.16em", color };
}
const projectedStyle: CSSProperties = { marginTop: "8px", fontSize: "34px", fontWeight: 600, lineHeight: 1, color: "var(--v5-brand)" };
const statLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const statValueStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)", marginTop: "2px" };
const lockedHeadStyle: CSSProperties = { marginTop: "8px", fontSize: "15px", color: "var(--v5-ink)" };
// SKILL leading-snug = 1.375 (原版 .mt-1.5 text-[12px] leading-snug; was 1.45)
const lockedSubStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.375 };
const pathCtaStyle: CSSProperties = {
  marginTop: "12px",
  gap: "6px",
  padding: "0 16px",
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontSize: "13px",
  fontWeight: 600,
};

const concentrationStripStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-brand-2) 9%, transparent)",
};
const concentrationTextStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-brand-2)", lineHeight: 1.45 };

// Form b container — no border (fill is the single visual difference);
// overflow-hidden stays: the tinted mine-row must clip to the radius.
const tableCardStyle: CSSProperties = { background: "var(--v5-surface)", borderRadius: "16px" };
const tableHeadStyle: CSSProperties = { padding: "14px 16px 8px" };
const tableHeadCapStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.16em", color: "var(--v5-ink-3)" };
function voteRowStyle(isMine: boolean, isLast: boolean): CSSProperties {
  return {
    padding: "10px 16px",
    gap: "12px",
    background: isMine ? "color-mix(in srgb, var(--v5-brand) 5%, transparent)" : "transparent",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
// Transparent hairline group (form a) — border-top opens the group, rows keep
// their hairlines, content sits on the 2px optical inset.
const pastGroupStyle: CSSProperties = { marginTop: "12px", padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
const pastHeadStyle: CSSProperties = { padding: "12px 0 8px", fontSize: "12px", letterSpacing: "0.16em", color: "var(--v5-ink-3)" };
function historyRowStyle(isLast: boolean): CSSProperties {
  return { padding: "12px 0", borderBottom: isLast ? "none" : "1px solid var(--v5-border)" };
}
</script>
