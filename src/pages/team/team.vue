<template>
  <AppChassis active="team">
    <view class="pb-4" style="padding-top: 12px; color: var(--v5-ink)">
      <view class="px-4" style="display: flex; flex-direction: column; gap: 24px">
        <!-- Invite hero -->
        <InviteEarnCard ref="inviteCard" />

        <TeamSummaryCard
          :status="teamSummaryStatus"
          :total="network.totalMembers"
          :direct="byLayerBuckets[1].length"
          @invite="inviteCard?.openShare()"
          @open="go('/pages/team/tree')"
          @retry="network.refreshCanonicalNetwork()"
        />

        <!-- V3+ royalty hero -->
        <view v-if="!remoteApiEnabled && myRank >= 3" class="nx-glass-card rounded-2xl relative overflow-hidden active:opacity-95" :style="royaltyHeroStyle" @click="go('/pages/team/unilevel')">
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
        <view class="nx-glass-card nx-team-rank-link team-rank" role="link" tabindex="0" :aria-label="t.team.rankBenefits" @click="go('/pages/team/rank')">
          <view class="team-rank__emblem" aria-hidden="true">
            <svg width="60" height="66" viewBox="0 0 60 66" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linejoin="round"><path d="M30 5 54 19 30 33 6 19Z" fill="color-mix(in srgb, var(--v5-tech-cyan) 50%, transparent)"/><path d="M6 19v28l24 14V33Z" fill="color-mix(in srgb, var(--v5-tech-cyan) 28%, transparent)"/><path d="M54 19v28L30 61V33Z" fill="color-mix(in srgb, var(--v5-tech-cyan) 65%, transparent)"/><path d="m30 14 15 9-15 9-15-9Z" fill="var(--v5-bg)" stroke="none"/></svg>
          </view>
          <view class="team-rank__body">
            <text class="team-rank__title">{{ t.teamV3.yourRank }}</text>
            <text class="team-rank__level">{{ myRankDisplay }}</text>
            <text class="team-rank__hint">{{ t.team.rankBenefits }}</text>
          </view>
          <svg class="team-rank__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
        </view>

        <!-- Unified quick nav -->
        <view class="nx-glass-card nx-team-quick-panel rounded-2xl overflow-hidden" :style="quickPanelStyle">
          <!-- Leaderboard -->
          <view class="nx-team-leaderboard-link active:opacity-95" role="link" tabindex="0" :style="quickRowStyle" @click="go('/pages/team/leaderboard')">
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
          <view class="nx-team-royalty-network-link" role="link" tabindex="0" :class="remoteApiEnabled ? '' : 'active:opacity-95'" :style="quickRowStyle" @click="openReferralNetwork">
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
          <view class="nx-team-binary-link active:opacity-95" role="link" tabindex="0" :style="quickRowStyle" @click="go('/pages/team/binary')">
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
          <view class="nx-team-leadership-pool-link active:opacity-95" role="link" tabindex="0" :style="quickRowStyle" @click="go('/pages/team/leadership-pool')">
            <view :style="quickRowMainStyle">
              <view :style="quickIconStyle('var(--v5-tech-cyan)')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" :style="quickRowTitleStyle">{{ t.teamV3.weeklyPool }}</text>
                <text class="block" :style="quickRowMetaStyle">{{ leadershipPoolLineA }}</text>
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
        <view class="grid team-tools" :style="toolGridStyle">
          <view class="nx-glass-card team-tool active:opacity-95" :style="toolCellStyle(0)" role="link" tabindex="0" @click="go('/pages/team/quota')">
            <view class="flex items-start justify-between">
              <view :style="toolIconStyle('var(--v5-warning-soft)')">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5v10l-9 5-9-5V7Z M3 7l9 5 9-5M12 12v10" /></svg>
              </view>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7" /></svg>
            </view>
            <text class="block" :style="toolTitleStyle">{{ t.teamV3.hardwareQuota }}</text>
          </view>
          <view class="nx-glass-card team-tool active:opacity-95" :style="toolCellStyle(1)" role="link" tabindex="0" @click="go('/pages/team/agent')">
            <view class="flex items-start justify-between">
              <view :style="toolIconStyle('var(--v5-brand-2-soft)')">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
              </view>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7" /></svg>
            </view>
            <text class="block" :style="toolTitleStyle">{{ t.teamV3.ambassador }}</text>
          </view>
          <view class="nx-glass-card team-tool active:opacity-95" :style="toolCellStyle(2)" role="link" tabindex="0" @click="go('/pages/team/network')">
            <view class="flex items-start justify-between">
              <view :style="toolIconStyle('var(--v5-tech-cyan-soft)')">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="m10 6-4 9m8-9 4 9M8 18h8"/></svg>
              </view>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7" /></svg>
            </view>
            <text class="block" :style="toolTitleStyle">{{ t.teamV3.visualizations.influenceNetwork }}</text>
          </view>
          <view class="nx-glass-card team-tool active:opacity-95" :style="toolCellStyle(3)" role="link" tabindex="0" @click="go('/pages/team/tree')">
            <view class="flex items-start justify-between">
              <view :style="toolIconStyle('var(--v5-brand-soft)')">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M5 16v-4h14v4"/></svg>
              </view>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7" /></svg>
            </view>
            <text class="block" :style="toolTitleStyle">{{ t.teamV3.visualizations.genealogy }}</text>
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
import TeamSummaryCard from "@/components/team/team-summary-card.vue";
import { useT } from "@/i18n/use-t";
import { useVRank } from "@/store/v-rank";
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
const inviteCard = ref<InstanceType<typeof InviteEarnCard> | null>(null);
const teamSummaryStatus = computed(() => remoteApiEnabled ? network.remoteStatus : "ready");
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
const projectedPayout = computed(() => remoteApiEnabled ? remotePool.value?.projectedPayoutUSDT ?? 0 : pool.myProjectedPayout(vrank.myRank));
const leadershipPoolUnlocked = computed(() => myVotes.value > 0);
const leadershipPoolKText = computed(() => (remoteApiEnabled ? remotePool.value?.currentWeekPoolUSDT ?? 0 : pool.currentWeekPoolUSDT) / 1000);
const leadershipPoolPrimary = computed(() =>
  remoteApiEnabled && remotePoolState.value !== "ready" ? "—" : leadershipPoolUnlocked.value ? `+$${projectedPayout.value.toFixed(2)}` : `$${leadershipPoolKText.value.toFixed(1)}K`,
);
const leadershipPoolLineA = computed(() =>
  remoteApiEnabled && remotePoolState.value !== "ready" ? t.value.network.projectionErrorDesc : leadershipPoolUnlocked.value ? t.value.pool.unlocked : t.value.publicCopy.participationUnavailable,
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
const royaltyHeroStyle: CSSProperties = { borderRadius: "var(--nx-glass-radius)", boxShadow: "var(--nx-glass-edge)",
  padding: "16px",
  background: "var(--nx-glass-fill)",
};
const royaltyCapStyle: CSSProperties = { gap: "6px", fontSize: "12px", color: "var(--v5-brand)", marginBottom: "8px" };
const royaltyAmtStyle: CSSProperties = { fontSize: "26px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1 };
const royaltySubStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", color: "var(--v5-ink-3)" };


const quickPanelStyle: CSSProperties = { borderRadius: "var(--nx-glass-radius)", boxShadow: "var(--nx-glass-edge)",
  // 《03》§6:带 bg 填充零 border
  background: "var(--nx-glass-fill)",
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
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: "12px",
};
function toolCellStyle(_index: number): CSSProperties {
  return {
    minHeight: "110px",
    padding: "16px",
  };
}
function toolIconStyle(_bg: string): CSSProperties {
  return {
    width: "34px",
    height: "34px",
    display: "grid",
    placeItems: "center",
  };
}
const toolTitleStyle: CSSProperties = { marginTop: "14px", fontSize: "15px", fontWeight: 600, lineHeight: 1.4 };
const toolSubStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "4px", lineHeight: 1.35 };
</script>

<style scoped>
.team-rank { display: flex; align-items: center; gap: 16px; padding: 20px; }
.team-rank:active { opacity: .8; }
.team-rank:focus-visible, .team-tool:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.team-rank__emblem { flex-shrink: 0; color: var(--v5-tech-cyan); filter: drop-shadow(0 6px 14px color-mix(in srgb, var(--v5-tech-cyan) 32%, transparent)); }
.team-rank__body { min-width: 0; flex: 1; }
.team-rank__title { display: block; font-size: 18px; font-weight: 600; }
.team-rank__level { display: block; margin-top: 8px; font-size: 20px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
.team-rank__hint { display: block; margin-top: 8px; font-size: 12px; line-height: 1.4; color: var(--v5-ink-3); }
.team-rank__chevron { flex-shrink: 0; }
.team-tool { min-width: 0; }
.team-tool :deep(svg) { color: var(--v5-brand); stroke: var(--v5-brand); }
.team-tool :deep(svg:first-child) { flex-shrink: 0; }
</style>
