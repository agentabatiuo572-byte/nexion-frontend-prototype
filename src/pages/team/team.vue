<!--
  Team — invitation network hub: InviteEarnCard → royalty hero (V3+) → V-rank summary
  → unified quick-nav (leaderboard / royalty network / binary / leadership pool) →
  TeamLedgerCard → network composition → tool grid.
  Tab page → <AppChassis active="team">.
  Reuses v-rank / network / commission / leadership-pool stores (all ported).
  zustand selectors → computed off Pinia store; mount-effect unlockMatured @60s →
  onMounted/onUnmounted interval. framer scroll-grow bar → CSS width transition.
  Nav targets to not-yet-ported sub-pages degrade via fail:()=>{} (see report §7).
-->
<template>
  <AppChassis active="team">
    <view class="pb-4" style="padding-top: 12px; color: var(--v5-ink)">
      <view class="px-4" style="display: flex; flex-direction: column; gap: 24px">
        <!-- Invite hero -->
        <InviteEarnCard />

        <!-- V3+ royalty hero -->
        <view v-if="!remoteApiEnabled && myRank >= 3" class="rounded-2xl relative overflow-hidden active:opacity-95" :style="royaltyHeroStyle" @click="go('/pages/team/unilevel')">
          <view class="flex items-center font-mono-tabular" :style="royaltyCapStyle">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14" /></svg>
            <text>{{ t.teamV3.royaltyHeroLabel }}</text>
          </view>
          <text class="block font-display tabular-nums" :style="royaltyAmtStyle">${{ monthUSDT.toFixed(2) }}</text>
          <text class="block" :style="royaltySubStyle">{{ t.teamV3.royaltyHeroSubtitle }}</text>
          <view class="flex items-center justify-between" style="margin-top: 8px">
            <text class="font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-tech-cyan-ink)' }">+{{ monthNEX.toFixed(0) }} NEX</text>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </view>
        </view>

        <!-- My V-rank summary -->
        <view class="nx-team-rank-link relative overflow-hidden rounded-2xl active:opacity-95" :style="rankCardStyle" @click="go('/pages/team/rank')">
          <NetworkOrbBackdrop :opacity="0.32" />
          <view class="relative" :style="rankContentStyle">
            <view :style="rankHeaderStyle">
              <text class="font-mono-tabular" :style="rankTitleStyle">{{ t.teamV3.yourRank }}</text>
              <view :style="rankArrowStyle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </view>
            </view>

            <view :style="rankBodyStyle">
              <view :style="rankLevelWrapStyle">
                <text class="font-display tabular-nums" :style="rankLevelTextStyle">{{ myRankDisplay }}</text>
              </view>
              <view v-if="rankInfo.next?.cultivationBonus" :style="rankDividerStyle" />
              <view v-if="rankInfo.next?.cultivationBonus" :style="rankPrizeWrapStyle">
                <text class="font-mono-tabular" :style="rankPrizeLabelStyle">{{ t.teamV3.prize }}</text>
                <text class="font-display tabular-nums" :style="rankPrizeValueStyle">{{ rankInfo.next.cultivationBonus.toLocaleString() }} NEX</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Unified quick nav -->
        <view class="nx-team-quick-panel rounded-2xl overflow-hidden" :style="quickPanelStyle">
          <!-- Leaderboard -->
          <view class="nx-team-leaderboard-link active:opacity-95" :style="quickRowStyle" @click="go('/pages/team/leaderboard')">
            <view :style="quickRowMainStyle">
              <view :style="quickIconStyle('var(--v5-warning)')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0z" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" :style="quickRowTitleStyle">{{ t.teamV3.leaderboardCard.title }}</text>
                <text class="block" :style="quickRowMetaStyle">{{ t.teamV3.leaderboardCard.subtitle }}</text>
              </view>
            </view>
            <view :style="quickRowValueWrapStyle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </view>
          </view>

          <view :style="quickDividerStyle" />

          <!-- Royalty network -->
          <view class="nx-team-royalty-network-link" :class="remoteApiEnabled ? '' : 'active:opacity-95'" :style="quickRowStyle" @click="openReferralNetwork">
            <view :style="quickRowMainStyle">
              <view :style="quickIconStyle('var(--v5-brand)')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" :style="quickRowTitleStyle">{{ t.teamV3.sevenLayerNetwork }}</text>
                <text class="block" :style="quickRowMetaStyle">{{ t.teamV3.directLabel }} · {{ directCountText }}  /  {{ t.teamV3.extendedLabel }} · {{ extendedCountText }}</text>
              </view>
            </view>
            <view :style="quickRowValueWrapStyle">
              <text class="font-display tabular-nums" :style="quickRowValueStyle">{{ totalMembersCountText }}</text>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </view>
          </view>

          <view :style="quickDividerStyle" />

          <!-- Binary -->
          <view class="nx-team-binary-link active:opacity-95" :style="quickRowStyle" @click="go('/pages/team/binary')">
            <view :style="quickRowMainStyle">
              <view :style="quickIconStyle('var(--v5-warning)')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" :style="quickRowTitleStyle">{{ t.teamV3.todayMatch }}</text>
                <text class="block" :style="quickRowMetaStyle">A · {{ leftVolText }}  /  B · {{ rightVolText }}</text>
              </view>
            </view>
            <view :style="quickRowValueWrapStyle">
              <text class="font-display tabular-nums" :style="quickRowValueWarnStyle">{{ binaryMatchText }}</text>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </view>
          </view>

          <view :style="quickDividerStyle" />

          <!-- Leadership pool -->
          <view class="nx-team-leadership-pool-link active:opacity-95" :style="quickRowStyle" @click="go('/pages/team/leadership-pool')">
            <view :style="quickRowMainStyle">
              <view :style="quickIconStyle('var(--v5-tech-cyan)')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" :style="quickRowTitleStyle">{{ t.teamV3.weeklyPool }}</text>
                <text class="block" :style="quickRowMetaStyle">{{ leadershipPoolLineA }}  /  {{ leadershipPoolLineB }}</text>
              </view>
            </view>
            <view :style="quickRowValueWrapStyle">
              <text class="font-display tabular-nums" :style="quickRowValueWarnStyle">{{ leadershipPoolPrimary }}</text>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </view>
          </view>

        </view>

        <!-- This month ledger -->
        <TeamLedgerCard
          v-if="!remoteApiEnabled || (network.remoteStatus === 'ready' && commission.eventsStatus === 'ready')"
          :total-u-s-d-t-lifetime="totalUSDTLifetime"
          :contributors="localTotalMembersCount"
          :direct-u-s-d-t="directUSDT"
          :extended-u-s-d-t="extendedUSDT"
          :month-u-s-d-t="monthUSDT"
          :month-n-e-x="monthNEX"
          :unlocked-u-s-d-t="unlockedUSDT"
          :cooling-u-s-d-t="coolingUSDT"
        />
        <view v-else :style="toolCellStyle(0)">
          <text class="block" :style="toolTitleStyle">{{ t.network.projectionErrorDesc }}</text>
          <text class="block" :style="toolSubStyle">{{ t.network.retry }}</text>
        </view>

        <!-- Team tools -->
        <view class="grid" :style="toolGridStyle">
          <view class="active:opacity-95" :style="toolCellStyle(0)" @click="go('/pages/team/quota')">
            <view class="flex items-start justify-between">
              <view :style="toolIconStyle('var(--v5-warning-soft)')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg>
              </view>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10M7 17 17 7" /></svg>
            </view>
            <text class="block" :style="toolTitleStyle">{{ t.teamV3.hardwareQuota }}</text>
            <text class="block" :style="toolSubStyle">{{ t.teamV3.quotaSubtitle }}</text>
          </view>
          <view class="active:opacity-95" :style="toolCellStyle(1)" @click="go('/pages/team/agent')">
            <view class="flex items-start justify-between">
              <view :style="toolIconStyle('var(--v5-brand-2-soft)')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14" /></svg>
              </view>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10M7 17 17 7" /></svg>
            </view>
            <text class="block" :style="toolTitleStyle">{{ t.teamV3.ambassador }}</text>
            <text class="block" :style="toolSubStyle">{{ t.teamV3.ambassadorSubtitle }}</text>
          </view>
          <view class="active:opacity-95" :style="toolCellStyle(2)" @click="go('/pages/team/network')">
            <view class="flex items-start justify-between">
              <view :style="toolIconStyle('var(--v5-tech-cyan-soft)')">
                <view class="rounded-full" :style="orbDotStyle" />
              </view>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10M7 17 17 7" /></svg>
            </view>
            <text class="block" :style="toolTitleStyle">{{ t.teamV3.visualizations.influenceNetwork }}</text>
            <text class="block" :style="toolSubStyle">{{ t.teamV3.visualizations.orbitLiveMap }}</text>
          </view>
          <view class="active:opacity-95" :style="toolCellStyle(3)" @click="go('/pages/team/tree')">
            <view class="flex items-start justify-between">
              <view :style="toolIconStyle('var(--v5-brand-soft)')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              </view>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h10v10M7 17 17 7" /></svg>
            </view>
            <text class="block" :style="toolTitleStyle">{{ t.teamV3.visualizations.genealogy }}</text>
            <text class="block" :style="toolSubStyle">{{ t.teamV3.visualizations.genealogySubtitle }}</text>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import InviteEarnCard from "@/components/team/invite-earn-card.vue";
import TeamLedgerCard from "@/components/team/team-ledger-card.vue";
import NetworkOrbBackdrop from "@/components/team/network-orb-backdrop.vue";
import { useT } from "@/i18n/use-t";
import { useVRank, nextRankProgress } from "@/store/v-rank";
import { rankLabel } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { useNetwork } from "@/store/network";
import { useCommission } from "@/store/commission";
import { useLeadershipPool } from "@/store/leadership-pool";
import { remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { TeamLeadershipPoolSnapshot } from "@/api/team-insights-api";
import { useReferralReward } from "@/store/referral-reward";
import { useApp } from "@/store/app";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import {
  captureCommerceSandboxRun,
  isCurrentCommerceSandboxScope,
  subscribeCurrentCommerceSandboxRun,
} from "@/api/order-api";

const t = useT();
const app = useApp();
const vrank = useVRank();
const isZh = computed(() => useLocaleStore().code === "zh");
const network = useNetwork();
const commission = useCommission();
const pool = useLeadershipPool();
const referralRewards = useReferralReward();
const remotePool = ref<TeamLeadershipPoolSnapshot | null>(null);
const remotePoolState = ref<"idle" | "loading" | "ready" | "error">(remoteApiEnabled ? "idle" : "ready");
let remotePoolRequest = 0;
let remotePoolMounted = true;

const myRank = computed(() => vrank.myRank);
// 头衔显示名按语言取(中文界面出中文头衔),拼法收在 lib/v-rank-copy;远端档位未到仍显示 V—
const myRankDisplay = computed(() => (remoteApiEnabled && vrank.ladder.length === 0 ? "V—" : rankLabel(vrank.myRank, isZh.value, vrank.ladder)));
const members = computed(() => network.members);
const localTotalMembersCount = computed(() => network.totalMembers);
const events = computed(() => commission.events);

const rankInfo = computed(() =>
  nextRankProgress({
    myRank: vrank.myRank,
    selfBuyUSD: vrank.selfBuyUSD,
    directRefs: vrank.directRefs,
  teamVolumeUSD: vrank.teamVolumeUSD,
  vDownlineCounts: vrank.vDownlineCounts,
}, vrank.ladder),
);

const byLayerBuckets = computed(() => network.byLayer());
const directCountText = computed(() => {
  if (remoteApiEnabled) {
    const count = referralRewards.snapshot?.invitedCount;
    return count === undefined ? "—" : String(count);
  }
  return String(byLayerBuckets.value[1].length);
});
const extendedCountText = computed(() => {
  if (remoteApiEnabled && network.remoteStatus !== "ready") return "—";
  return String(([2, 3, 4, 5, 6, 7] as const).reduce((s, L) => s + byLayerBuckets.value[L].length, 0));
});
const totalMembersCountText = computed(() => remoteApiEnabled && network.remoteStatus !== "ready" ? "—" : String(localTotalMembersCount.value));

// Commission month aggregates (30d) + direct/extended split.
const ledger = computed(() => {
  const cutoff = Date.now() - 30 * 86400000;
  let mU = 0, mS = 0, uU = 0, cU = 0, tU = 0, dU = 0, eU = 0;
  for (const e of events.value) {
    if (e.ts >= cutoff) {
      mU += e.amountUSDT;
      mS += e.amountNEX;
    }
    if (e.status === "unlocked") uU += e.amountUSDT;
    if (e.status === "cooling") cU += e.amountUSDT;
    tU += e.amountUSDT;
    if (e.kind === "unilevel" && e.layer === 1) dU += e.amountUSDT;
    else eU += e.amountUSDT;
  }
  return { monthUSDT: mU, monthNEX: mS, unlockedUSDT: uU, coolingUSDT: cU, totalUSDTLifetime: tU, directUSDT: dU, extendedUSDT: eU };
});
const monthUSDT = computed(() => ledger.value.monthUSDT);
const monthNEX = computed(() => ledger.value.monthNEX);
const unlockedUSDT = computed(() => ledger.value.unlockedUSDT);
const coolingUSDT = computed(() => ledger.value.coolingUSDT);
const totalUSDTLifetime = computed(() => ledger.value.totalUSDTLifetime);
const directUSDT = computed(() => ledger.value.directUSDT);
const extendedUSDT = computed(() => ledger.value.extendedUSDT);

// Binary match snapshot.
const binary = computed(() => {
  if (remoteApiEnabled) {
    const snapshot = commission.binarySnapshot;
    if (!snapshot) return null;
    return {
      binaryMatch: snapshot?.estimatedAmountUsdt ?? 0,
      leftVol: snapshot?.trackA ?? 0,
      rightVol: snapshot?.trackB ?? 0,
    };
  }
  let L = 0, R = 0;
  for (const m of members.value) {
    if (m.binary === "left") L += m.monthVolumeUSD;
    else if (m.binary === "right") R += m.monthVolumeUSD;
  }
  const match = Math.min(Math.min(L / 30, R / 30) * 0.1, 5000);
  return { binaryMatch: match, leftVol: L, rightVol: R };
});
const binaryMatchText = computed(() => binary.value === null ? "—" : `+$${binary.value.binaryMatch.toFixed(2)}`);
const leftVolText = computed(() => binary.value === null ? "—" : `$${binary.value.leftVol.toFixed(0)}`);
const rightVolText = computed(() => binary.value === null ? "—" : `$${binary.value.rightVol.toFixed(0)}`);

const myVotes = computed(() => remoteApiEnabled ? remotePool.value?.myVotes ?? 0 : pool.myVotes(vrank.myRank));
const myShare = computed(() => remoteApiEnabled ? remotePool.value?.mySharePct ?? 0 : pool.mySharePct(vrank.myRank));
const projectedPayout = computed(() => remoteApiEnabled ? remotePool.value?.projectedPayoutUSDT ?? 0 : pool.myProjectedPayout(vrank.myRank));
const leadershipPoolUnlocked = computed(() => myVotes.value > 0);
const leadershipPoolKText = computed(() => (remoteApiEnabled ? remotePool.value?.currentWeekPoolUSDT ?? 0 : pool.currentWeekPoolUSDT) / 1000);
const leadershipPoolPrimary = computed(() =>
  remoteApiEnabled && remotePoolState.value !== "ready" ? "—" : leadershipPoolUnlocked.value ? `+$${projectedPayout.value.toFixed(2)}` : `$${leadershipPoolKText.value.toFixed(1)}K`,
);
const leadershipPoolLineA = computed(() =>
  remoteApiEnabled && remotePoolState.value !== "ready" ? t.value.network.projectionErrorDesc : leadershipPoolUnlocked.value ? `${myVotes.value} ${t.value.teamV3.votes}` : t.value.home.poolV3Unlock,
);
const leadershipPoolLineB = computed(() =>
  remoteApiEnabled && remotePoolState.value !== "ready" ? t.value.network.retry : leadershipPoolUnlocked.value ? `${(myShare.value * 100).toFixed(2)}%` : t.value.home.poolThisWeek,
);

function go(url: string) {
  uni.navigateTo({ url, fail: () => {} });
}
function openReferralNetwork() {
  go("/pages/team/unilevel");
}

// unlockMatured at mount + every 60s.
let unlockTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  if (remoteApiEnabled) {
    void vrank.refreshCanonicalVRank();
    void commission.refreshCanonicalBinary();
    void commission.refreshCanonicalEvents();
    void network.refreshCanonicalNetwork();
    void refreshRemotePool();
    return;
  }
  commission.unlockMatured();
  unlockTimer = setInterval(() => commission.unlockMatured(), 60_000);
});
async function refreshRemotePool() {
  if (!remoteApiEnabled) return;
  const request = ++remotePoolRequest;
  const accountKey = app.accountKey;
  const accountScope = captureAccountScope();
  const runScope = captureCommerceSandboxRun();
  remotePoolState.value = "loading";
  remotePool.value = null;
  const current = () => remotePoolMounted && request === remotePoolRequest
    && accountKey === app.accountKey && isCurrentAccountScope(accountScope)
    && isCurrentCommerceSandboxScope(runScope);
  try {
    const snapshot = await teamInsightsApi.leadershipPool();
    if (!current()) return;
    remotePool.value = snapshot;
    remotePoolState.value = "ready";
  } catch {
    if (!current()) return;
    remotePool.value = null;
    remotePoolState.value = "error";
  }
}
watch(() => app.accountKey, () => { if (remoteApiEnabled) { remotePool.value = null; void refreshRemotePool(); } });
const unsubscribeRemotePoolRun = subscribeCurrentCommerceSandboxRun(() => {
  if (!remoteApiEnabled || !remotePoolMounted) return;
  remotePoolRequest += 1;
  remotePool.value = null;
  remotePoolState.value = "loading";
  void refreshRemotePool();
});
onUnmounted(() => {
  if (unlockTimer) clearInterval(unlockTimer);
  unsubscribeRemotePoolRun();
  remotePoolMounted = false;
  remotePoolRequest += 1;
  remotePool.value = null;
});

// ─── styles ───
const royaltyHeroStyle: CSSProperties = {
  padding: "16px",
  background: "radial-gradient(80% 60% at 100% 0%, var(--v5-brand-soft) 0%, transparent 60%), var(--v5-surface)",
};
const royaltyCapStyle: CSSProperties = { gap: "6px", fontSize: "12px", color: "var(--v5-brand)", marginBottom: "8px" };
const royaltyAmtStyle: CSSProperties = { fontSize: "26px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1 };
const royaltySubStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", color: "var(--v5-ink-3)" };

const rankCardStyle: CSSProperties = {
  padding: "16px",
  background: "var(--v5-surface)",
};
const rankContentStyle: CSSProperties = {
  minHeight: "104px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  gap: "16px",
};
const rankHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};
const rankTitleStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--v5-tech-cyan-ink)" };
const rankArrowStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  display: "grid",
  placeItems: "center",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-ink) 5%, transparent)",
};
const rankBodyStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 1px minmax(0, 1fr)",
  alignItems: "center",
  gap: "14px",
};
const rankLevelWrapStyle: CSSProperties = {
  minHeight: "44px",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
};
const rankLevelTextStyle: CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  lineHeight: 1,
  color: "var(--v5-ink)",
  whiteSpace: "nowrap",
};
const rankDividerStyle: CSSProperties = {
  width: "1px",
  height: "34px",
  background: "color-mix(in srgb, var(--v5-ink) 12%, transparent)",
};
const rankPrizeWrapStyle: CSSProperties = {
  minHeight: "44px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  justifyContent: "center",
};
const rankPrizeLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-brand)", lineHeight: 1.1 };
const rankPrizeValueStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: 1,
  color: "var(--v5-ink)",
  whiteSpace: "nowrap",
};

const quickPanelStyle: CSSProperties = {
  // 《03》§6:带 bg 填充零 border
  background: "var(--v5-surface)",
};
const quickRowStyle: CSSProperties = {
  minHeight: "74px",
  padding: "14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
};
const quickRowMainStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: "12px",
};
function quickIconStyle(color: string): CSSProperties {
  return {
    width: "36px",
    height: "36px",
    borderRadius: "12px",
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
  };
}
const quickRowTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, lineHeight: 1.2, color: "var(--v5-ink)" };
const quickRowMetaStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "12px",
  lineHeight: 1.35,
  color: "var(--v5-ink-3)",
  whiteSpace: "normal",
};
const quickRowValueWrapStyle: CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  gap: "8px",
};
const quickRowValueStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, lineHeight: 1, color: "var(--v5-ink)", whiteSpace: "nowrap" };
const quickRowValueWarnStyle: CSSProperties = { ...quickRowValueStyle, color: "var(--v5-warning-ink)" };
const quickDividerStyle: CSSProperties = {
  height: "1px",
  marginLeft: "62px",
  background: "var(--v5-border)",
};
const toolGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  background: "var(--v5-surface)",
  borderRadius: "16px",
  overflow: "hidden",
};
function toolCellStyle(index: number): CSSProperties {
  return {
    minHeight: "118px",
    padding: "14px",
    borderRight: index % 2 === 0 ? "1px solid var(--v5-border)" : "none",
    borderBottom: index < 2 ? "1px solid var(--v5-border)" : "none",
  };
}
function toolIconStyle(bg: string): CSSProperties {
  return {
    width: "34px",
    height: "34px",
    borderRadius: "12px",
    display: "grid",
    placeItems: "center",
    background: `color-mix(in srgb, ${bg} 58%, transparent)`,
  };
}
const toolTitleStyle: CSSProperties = { marginTop: "10px", fontSize: "13px", fontWeight: 600, lineHeight: 1.2 };
const toolSubStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "4px", lineHeight: 1.35 };
const orbDotStyle: CSSProperties = {
  width: "18px",
  height: "18px",
  background: "radial-gradient(circle at 30% 30%, var(--v5-brand) 0%, var(--v5-tech-cyan) 70%, transparent 100%)",
};
</script>
