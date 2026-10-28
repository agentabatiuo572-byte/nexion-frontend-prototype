<template>
  <AppChassis active="team">
    <view class="pb-4" style="padding-top: 12px; color: var(--v5-ink)">
      <view class="px-4" style="display: flex; flex-direction: column; gap: 24px">
        <!-- This month ledger -->
        <TeamLedgerCard
          :available="ledgerVisible"
          :loading="ledgerLoading"
          :failed="ledgerFailureFeedback"
          :total-u-s-d-t-lifetime="totalUSDTLifetime"
          :contributors="commissionAggregate.contributorCount"
          :direct-u-s-d-t="directUSDT"
          :extended-u-s-d-t="extendedUSDT"
          :month-u-s-d-t="monthUSDT"
          :month-n-e-x="monthNEX"
          :unlocked-u-s-d-t="unlockedUSDT"
          :cooling-u-s-d-t="coolingUSDT"
          @retry="refreshRemoteLedger"
        />

        <!-- Invite hero -->
        <InviteEarnCard ref="inviteCard" />

        <view class="team-overview-grid">
        <TeamSummaryCard
          :status="teamSummaryStatus"
          :has-snapshot="network.hasRemoteSnapshot && displayCatalogValid"
          :transient-failure="network.remoteTransientFailure"
          :total="network.totalMembers"
          :direct="byLayerBuckets[1].length"
          @invite="inviteCard?.openShare()"
          @open="go('/pages/team/tree')"
          @retry="network.refreshCanonicalNetwork()"
        />

        <!-- My V-rank summary -->
        <view class="nx-team-rank-link team-rank" role="link" tabindex="0" :aria-label="t.team.rankBenefits" @click="go('/pages/team/rank')" @keydown.enter.prevent="go('/pages/team/rank')" @keydown.space.prevent="go('/pages/team/rank')">
          <view class="team-rank__header"><text class="team-rank__title">{{ designCopy.myRank }}</text><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></view>
          <view class="team-rank__emblem">
            <view class="team-rank__outline"><svg width="68" height="78" viewBox="0 0 68 78" fill="none" aria-hidden="true"><path d="M34 2 65 20v38L34 76 3 58V20Z" fill="var(--v5-surface)" stroke="var(--v5-ink-2)" stroke-width="2"/><path d="M34 6 61 22v34L34 72 7 56V22Z" stroke="var(--v5-brand)" stroke-opacity=".25"/></svg></view>
            <text class="team-rank__level">{{ visibility.mask(myRankDisplay) }}</text>
          </view>
          <text class="team-rank__hint">{{ designCopy.benefitsAndRewards }}</text>
          <view v-if="vrank.remoteError" class="team-rank__status" role="status"><text>{{ t.rank.loadError }}</text><view class="team-rank__retry" role="button" tabindex="0" @click.stop="vrank.refreshCanonicalVRank()" @keydown.enter.stop.prevent="vrank.refreshCanonicalVRank()" @keydown.space.stop.prevent="vrank.refreshCanonicalVRank()">{{ t.rank.retry }}</view></view>
        </view>

        </view>

        <ReferralProgress @share="inviteCard?.openShare()" />

        <!-- Unified quick nav -->
        <view class="nx-team-quick-panel" :style="quickPanelStyle">
          <text class="team-section-title">{{ designCopy.teamRewards }}</text>
          <!-- Leaderboard -->
          <view class="nx-team-leaderboard-link active:opacity-95" role="link" tabindex="0" :style="quickRowStyle" @click="go('/pages/team/leaderboard')">
            <view :style="quickRowMainStyle">
              <view :style="quickIconStyle('var(--v5-ink-2)')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0z" /></svg>
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
          <view class="nx-team-royalty-network-link"   role="button" tabindex="0" :aria-label="t.teamV3.sevenLayerNetwork" :style="quickRowStyle" @click="openReferralNetwork">
            <view :style="quickRowMainStyle">
              <view :style="quickIconStyle('var(--v5-ink-2)')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" :style="quickRowTitleStyle">{{ t.teamV3.sevenLayerNetwork }}</text>
                <text class="block" :style="quickRowMetaStyle">{{ t.directReferral.purchase }} · {{ t.directReferral.networkPurchase }} · {{ t.directReferral.deviceEarning }}</text>
              </view>
            </view>
            <view :style="quickRowValueWrapStyle">
              <text class="font-display tabular-nums" :style="quickRowValueStyle">{{ visibility.mask(totalMembersCountText) }}</text>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </view>
          </view>

          <view :style="quickDividerStyle" />

          <!-- Binary -->
          <view class="nx-team-binary-link active:opacity-95" role="link" tabindex="0" :style="quickRowStyle" @click="go('/pages/team/binary')">
            <view :style="quickRowMainStyle">
              <view :style="quickIconStyle('var(--v5-ink-2)')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" :style="quickRowTitleStyle">{{ t.teamV3.todayMatch }}</text>
                <text class="block" :style="quickRowMetaStyle">A · {{ visibility.mask(leftVolText) }}  /  B · {{ visibility.mask(rightVolText) }}</text>
              </view>
            </view>
            <view :style="quickRowValueWrapStyle">
              <view class="team-estimate"><text class="team-estimate__label">{{ designCopy.estimated }}</text><text class="font-display tabular-nums" :style="quickRowValueStyle">{{ visibility.mask(binaryMatchText) }}</text></view>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </view>
          </view>

          <view :style="quickDividerStyle" />

          <!-- Leadership pool -->
          <view class="nx-team-leadership-pool-link active:opacity-95" role="link" tabindex="0" :style="quickRowStyle" @click="go('/pages/team/leadership-pool')">
            <view :style="quickRowMainStyle">
              <view :style="quickIconStyle('var(--v5-ink-2)')">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" :style="quickRowTitleStyle">{{ t.teamV3.weeklyPool }}</text>
                <text class="block" :style="quickRowMetaStyle">{{ leadershipPoolLineB ? `${leadershipPoolLineA}  /  ${leadershipPoolLineB}` : leadershipPoolLineA }}</text>
              </view>
            </view>
            <view :style="quickRowValueWrapStyle">
              <view class="team-estimate"><text v-if="leadershipPoolUnlocked && remotePoolReadable" class="team-estimate__label">{{ designCopy.estimated }}</text><text class="font-display tabular-nums" :style="quickRowValueStyle">{{ visibility.mask(leadershipPoolPrimary) }}</text></view>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </view>
          </view>

        </view>

        <view>
        <text class="team-section-title">{{ designCopy.moreTools }}</text>
        <NxListGroup class="team-tools">
          <NxListRow :title="t.teamV3.hardwareQuota" :subtitle="t.teamV3.quotaSubtitle" @click="go('/pages/team/quota')"><template #leading><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7Z M3 7l9 5 9-5M12 12v10"/></svg></template></NxListRow>
          <NxListRow :title="t.teamV3.ambassador" :subtitle="t.teamV3.ambassadorSubtitle" @click="go('/pages/team/agent')"><template #leading><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></template></NxListRow>
          <NxListRow :title="t.teamV3.visualizations.influenceNetwork" :subtitle="t.teamV3.visualizations.orbitLiveMap" @click="go('/pages/team/network')"><template #leading><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="4" r="3"/><circle cx="4" cy="19" r="3"/><circle cx="20" cy="19" r="3"/><path d="m10.5 7-5 9m9-9 5 9M7 19h10"/></svg></template></NxListRow>
          <NxListRow :title="t.teamV3.visualizations.genealogy" :subtitle="t.teamV3.visualizations.genealogySubtitle" @click="go('/pages/team/tree')"><template #leading><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M2 22v-3a7 7 0 0 1 14 0v3M16 3a4 4 0 0 1 0 8M22 22v-3a7 7 0 0 0-5-6.7"/></svg></template></NxListRow>
        </NxListGroup>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { runPassiveTabRead, invalidatePassiveTabRead, passiveTabReadScope } from "@/lib/passive-tab-read";
import { formatUsd } from "@/lib/usd-display";
import { formatComputePoints, sumComputePoints } from "@/i18n/compute-points";
import ReferralProgress from '@/components/promotion/referral-progress.vue';
import { navTo } from "@/lib/route";
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onLoad, onShow, onHide } from "@/composables/use-tab-page-lifecycle";
import { takeNavigationQuery } from "@/lib/route";
import AppChassis from "@/components/tab-page-frame.vue";
import { teamRedesignCopy } from '@/i18n/team-redesign';
import NxListGroup from "@/components/ui/nx-list-group.vue";
import NxListRow from "@/components/ui/nx-list-row.vue";
import InviteEarnCard from "@/components/team/invite-earn-card.vue";
import TeamLedgerCard from "@/components/team/team-ledger-card.vue";
import NetworkOrbBackdrop from "@/components/team/network-orb-backdrop.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { useVRank, nextRankProgress } from "@/store/v-rank";
import { rankLabel } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { useNetwork } from "@/store/network";
import { useCommission } from "@/store/commission";
import { useLeadershipPool } from "@/store/leadership-pool";
import { apiRuntimeConfig, remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import { productCatalogState, productCatalogDisplayProof, isProductCatalogDisplayCurrent } from "@/store/product-catalog";
import type { TeamCommissionSnapshot, TeamLeadershipPoolSnapshot } from "@/api/team-insights-api";
import { leadershipPoolFailureState } from "@/lib/leadership-pool-state";
import { useReferralReward } from "@/store/referral-reward";
import { useApp } from "@/store/app";
import { useDataVisibility } from '@/store/data-visibility';
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";

const t = useT();
const visibility = useDataVisibility();
const app = useApp();
const vrank = useVRank();
const locale = useLocaleStore();
const network = useNetwork();
const commission = useCommission();
type LedgerPresentation = Pick<TeamCommissionSnapshot["aggregate"], "totalUSDT" | "contributorCount" | "directUSDT" | "extendedUSDT" | "monthUSDT" | "monthNEX" | "unlockedUSDT" | "coolingUSDT">;
const ledgerPresentation = ref<LedgerPresentation | null>(null);
const rankPresentation = ref<number | null>(null);
const displayEnvironmentInvalidated = ref(false);
watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl], () => { displayEnvironmentInvalidated.value = true; }, { flush: "sync" });
const displayCatalogValid = computed(() => !displayEnvironmentInvalidated.value && productCatalogDisplayProof.value !== null
  && isProductCatalogDisplayCurrent() && (productCatalogState.status === "error" || productCatalogState.status === "loading"
    || (productCatalogState.serverCanonical && productCatalogState.sourceEnvironment === "PRODUCTION" && productCatalogState.runId === "")));
const ledgerFailureFeedback = ref(false);
const ledgerFailed = computed(() => remoteApiEnabled && (network.remoteStatus === "error" || commission.eventsStatus === "error"));
const ledgerLoading = computed(() => remoteApiEnabled && !ledgerFailed.value
  && (network.remoteStatus !== "ready" || commission.eventsStatus !== "ready"));
const ledgerStrictFailure = computed(() => (network.remoteStatus === "error" && !network.remoteTransientFailure)
  || (commission.eventsStatus === "error" && !commission.eventsTransientFailure));
const ledgerVisible = computed(() => !remoteApiEnabled || (!ledgerStrictFailure.value
  && network.hasRemoteSnapshot && ledgerPresentation.value !== null));
const networkReadable = computed(() => !remoteApiEnabled || network.remoteStatus === "ready"
  || (displayCatalogValid.value && network.hasRemoteSnapshot && (network.remoteStatus === "loading"
    || (network.remoteStatus === "error" && network.remoteTransientFailure))));
const pool = useLeadershipPool();
const referralRewards = useReferralReward();
const remotePool = ref<TeamLeadershipPoolSnapshot | null>(null);
const remotePoolState = ref<"idle" | "loading" | "ready" | "error" | "hold">(remoteApiEnabled ? "idle" : "ready");
const remotePoolReadable = computed(() => !remoteApiEnabled || remotePoolState.value === "ready"
  || (remotePoolState.value === "loading" && remotePool.value !== null));
let remotePoolRequest = 0;
let remotePoolMounted = true;
function clearTeamPresentation() {
  ledgerFailureFeedback.value = false;
  ledgerPresentation.value = null; rankPresentation.value = null;
  remotePoolRequest += 1; remotePool.value = null; remotePoolState.value = "idle";
}
watch([ledgerFailed, () => network.remoteStatus === "ready" && commission.eventsStatus === "ready"], ([failed, ready]) => {
  if (failed) ledgerFailureFeedback.value = true;
  else if (ready) ledgerFailureFeedback.value = false;
}, { immediate: true, flush: "sync" });
watch(() => [app.accountKey, app.accountBindingEpoch, apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl, locale.code], clearTeamPresentation, { flush: "sync" });
watch(() => locale.code, () => { commission.invalidateReadOwner(); network.invalidateReadOwner(); vrank.invalidateReadOwner(); }, { flush: "sync" });
watch(displayCatalogValid, valid => { if (!valid) clearTeamPresentation(); }, { flush: "sync" });
watch([() => commission.eventsStatus, () => commission.eventsEvidence, () => network.remoteStatus, () => network.remoteTransientFailure, () => commission.eventsTransientFailure], () => {
  if (ledgerStrictFailure.value) { ledgerPresentation.value = null; return; }
  const evidence = commission.eventsEvidence;
  if (!displayCatalogValid.value || commission.eventsStatus !== "ready" || !evidence?.serverCanonical
    || evidence.sourceEnvironment !== "PRODUCTION" || evidence.runId !== "") return;
  const { totalUSDT, contributorCount, directUSDT, extendedUSDT, monthUSDT, monthNEX, unlockedUSDT, coolingUSDT } = evidence.aggregate;
  const values = { totalUSDT, contributorCount, directUSDT, extendedUSDT, monthUSDT, monthNEX, unlockedUSDT, coolingUSDT };
  if (Object.values(values).every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) ledgerPresentation.value = values;
  else ledgerPresentation.value = null;
}, { immediate: true, flush: "sync" });
watch([() => vrank.remoteReady, () => vrank.remoteError, () => vrank.myRank, () => vrank.remoteTransientFailure], () => {
  if (vrank.remoteError && !vrank.remoteTransientFailure) { rankPresentation.value = null; return; }
  if (displayCatalogValid.value && vrank.remoteReady) rankPresentation.value = vrank.myRank;
}, { immediate: true, flush: "sync" });

const designCopy = computed(() => teamRedesignCopy(locale.code));
const myRank = computed(() => vrank.myRank);
// 头衔显示名按语言取(中文界面出中文头衔),拼法收在 lib/v-rank-copy;远端档位未到仍显示 V—
const myRankDisplay = computed(() => remoteApiEnabled ? rankPresentation.value === null ? "V—" : `V${rankPresentation.value}` : `V${myRank.value}`);
const members = computed(() => network.members);
const localTotalMembersCount = computed(() => network.totalMembers);
const events = computed(() => commission.events);
const commissionAggregate = computed(() => ledgerPresentation.value ?? {
  totalUSDT: 0, totalNEX: 0, directUSDT: 0, extendedUSDT: 0, contributorCount: 0,
});

const rankInfo = computed(() =>
  nextRankProgress({
    myRank: vrank.myRank,
    selfBuyUSD: vrank.selfBuyUSD,
    selfComputePoints: vrank.selfComputePoints,
    directRefs: vrank.directRefs,
  teamVolumeUSD: vrank.teamVolumeUSD,
  teamComputePoints: vrank.teamComputePoints,
  vDownlineCounts: vrank.vDownlineCounts,
}, vrank.ladder, "compute-points"),
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
  if (!networkReadable.value) return "—";
  return String(([2, 3, 4, 5, 6, 7] as const).reduce((s, L) => s + byLayerBuckets.value[L].length, 0));
});
const totalMembersCountText = computed(() => !networkReadable.value ? "—" : String(localTotalMembersCount.value));

// Calendar-month totals and lifetime direct/extended split.
const ledger = computed(() => {
  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  let mU = 0, mS = 0, uU = 0, cU = 0, tU = 0, dU = 0, eU = 0;
  for (const e of events.value) {
    if (e.ts >= cutoff) {
      mU += e.amountUSDT;
      mS += e.amountNEX;
    }
    if (e.status === "unlocked") uU += e.amountUSDT;
    if (e.status === "cooling") cU += e.amountUSDT;
    tU += e.amountUSDT;
    if (e.kind === "direct_purchase" || e.kind === "direct_device_earning" || (e.kind === "unilevel" && e.layer === 1)) dU += e.amountUSDT;
    else eU += e.amountUSDT;
  }
  if (remoteApiEnabled) {
    return { monthUSDT: ledgerPresentation.value?.monthUSDT ?? 0, monthNEX: ledgerPresentation.value?.monthNEX ?? 0, unlockedUSDT: ledgerPresentation.value?.unlockedUSDT ?? 0, coolingUSDT: ledgerPresentation.value?.coolingUSDT ?? 0,
      totalUSDTLifetime: commissionAggregate.value.totalUSDT,
      directUSDT: commissionAggregate.value.directUSDT,
      extendedUSDT: commissionAggregate.value.extendedUSDT };
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
const binaryMatchText = computed(() => binary.value === null ? "—" : formatUsd(binary.value.binaryMatch));
const leftVolText = computed(() => formatComputePoints(remoteApiEnabled ? commission.binarySnapshot?.trackAComputePoints : sumComputePoints(members.value.filter(m => m.binary === 'left').map(m => m.monthComputePoints)), locale.code));
const rightVolText = computed(() => formatComputePoints(remoteApiEnabled ? commission.binarySnapshot?.trackBComputePoints : sumComputePoints(members.value.filter(m => m.binary === 'right').map(m => m.monthComputePoints)), locale.code));

const myVotes = computed(() => remoteApiEnabled ? remotePool.value?.myVotes ?? 0 : pool.myVotes(vrank.myRank));
const leadershipUnlockRank = computed(() => remoteApiEnabled ? remotePool.value?.unlockRank ?? 3 : 3);
const myShare = computed(() => remoteApiEnabled ? remotePool.value?.mySharePct ?? 0 : pool.mySharePct(vrank.myRank));
const projectedPayout = computed(() => remoteApiEnabled ? remotePool.value?.projectedPayoutUSDT ?? 0 : pool.myProjectedPayout(vrank.myRank));
const leadershipPoolUnlocked = computed(() => myVotes.value > 0);
const leadershipPoolTotal = computed(() => remoteApiEnabled ? remotePool.value?.currentWeekPoolUSDT ?? 0 : pool.currentWeekPoolUSDT);
const leadershipPoolPrimary = computed(() =>
  !remotePoolReadable.value ? "—" : formatUsd(leadershipPoolUnlocked.value ? projectedPayout.value : leadershipPoolTotal.value),
);
const leadershipPoolLineA = computed(() =>
  !remotePoolReadable.value ? (remotePoolState.value === "hold" ? t.value.pool.settlementHoldShort : remotePoolState.value === "loading" ? t.value.pool.loading : t.value.network.projectionErrorDesc) : leadershipPoolUnlocked.value ? `${visibility.mask(myVotes.value)} ${t.value.teamV3.votes}` : `V${leadershipUnlockRank.value}`,
);
const poolThisWeekText = computed(() => {
  const rate = remoteApiEnabled ? remotePool.value?.injectRate : 0.05;
  return rate == null ? "" : fmt(t.value.home.poolThisWeek, {
    rate: (rate * 100).toLocaleString(dateLocale(), { maximumFractionDigits: 8 }),
  });
});
// 摘要行第二段只承载**真实数据**(占比 / 周池比例)。非就绪态一律留空 —— 状态说明已在
// lineA,操作入口是整行点击进详情页;此前这里塞过 t.network.retry(「重新加载」),把一个
// 动作标签放进了状态位,还留下一个悬空的「/」(zentao #206)。
const leadershipPoolLineB = computed(() =>
  !remotePoolReadable.value ? "" : leadershipPoolUnlocked.value ? visibility.mask(`${(myShare.value * 100).toFixed(2)}%`) : poolThisWeekText.value,
);

function go(url: string) {
  navTo(url);
}
function openReferralNetwork() {
  go("/pages/team/unilevel");
}

// unlockMatured at mount + every 60s.
let unlockTimer: ReturnType<typeof setInterval> | null = null;
let remotePoolVisible = false;
onMounted(() => {
  if (remoteApiEnabled) return;
  commission.unlockMatured();
  unlockTimer = setInterval(() => commission.unlockMatured(), 60_000);
});
onShow(() => {
  remotePoolVisible = true;
  if (!remoteApiEnabled) return;
  void vrank.ensureCanonicalVRank();
  void commission.ensureCanonicalBinary();
  void commission.ensureCanonicalEvents();
  void network.ensureCanonicalNetwork();
  void refreshRemotePool(true);
});
onHide(() => { remotePoolVisible = false; remotePoolRequest += 1; });
async function refreshRemotePool(passive = false) {
  if (!remoteApiEnabled || !remotePoolVisible || displayEnvironmentInvalidated.value) return;
  const request = ++remotePoolRequest;
  const accountKey = app.accountKey;
  const accountScope = captureAccountScope();
  const readScope = passiveTabReadScope();
  const runScope = captureRuntimeRevision();
  if (!passive || !["error", "hold"].includes(remotePoolState.value)) remotePoolState.value = "loading";
  const current = () => remotePoolMounted && remotePoolVisible && request === remotePoolRequest
    && accountKey === app.accountKey && isCurrentAccountScope(accountScope)
    && isCurrentRuntimeRevision(runScope) && readScope === passiveTabReadScope();
  try {
    const snapshot = await (passive ? runPassiveTabRead('leadership-pool', () => teamInsightsApi.leadershipPool()) : (invalidatePassiveTabRead('leadership-pool'), teamInsightsApi.leadershipPool()));
    if (!current()) return;
    remotePool.value = snapshot;
    remotePoolState.value = "ready";
  } catch (cause) {
    if (!current()) return;
    remotePool.value = null;
    remotePoolState.value = leadershipPoolFailureState(cause);
  }
}
async function refreshRemoteLedger() {
  await Promise.allSettled([network.refreshCanonicalNetwork(), commission.refreshCanonicalEvents()]);
}
watch(() => app.accountKey, () => { if (remoteApiEnabled) { remotePool.value = null; void refreshRemotePool(true); } });
const unsubscribeRemotePoolRun = subscribeRuntimeRevision(scope => {
  invalidatePassiveTabRead("leadership-pool");
  if (!isProductCatalogDisplayCurrent(scope)) clearTeamPresentation();
  if (!remoteApiEnabled || !remotePoolMounted || !remotePoolVisible) return;
  remotePoolRequest += 1;
  if (!displayCatalogValid.value) remotePool.value = null;
  remotePoolState.value = "loading";
  void refreshRemotePool(true);
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
const rankTitleStyle: CSSProperties = { fontSize: "var(--ui-type-section)", fontWeight: 600, color: "var(--v5-tech-cyan-ink)" };
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

const quickPanelStyle: CSSProperties = { background: 'transparent', borderRadius: '0', boxShadow: 'none' };
const quickRowStyle: CSSProperties = {
  minHeight: "74px",
  padding: "14px 0",
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
    background: "transparent",
    color,
  };
}
const quickRowTitleStyle: CSSProperties = { fontSize: "var(--ui-type-section)", fontWeight: 600, lineHeight: 1.2, color: "var(--v5-ink)" };
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
  marginLeft: "0",
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
const toolTitleStyle: CSSProperties = { marginTop: "14px", fontSize: "var(--ui-type-section)", fontWeight: 600, lineHeight: 1.4 };
const toolSubStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "4px", lineHeight: 1.35 };
const orbDotStyle: CSSProperties = {
  width: "18px",
  height: "18px",
  background: "radial-gradient(circle at 30% 30%, var(--v5-brand) 0%, var(--v5-tech-cyan) 70%, transparent 100%)",
};

import TeamSummaryCard from "@/components/team/team-summary-card.vue";
const inviteCard = ref<InstanceType<typeof InviteEarnCard> | null>(null);
// Consume an explicit invitation intent once after the invite card has its code.
const pendingShareIntent = ref(false);
const invitePageVisible = ref(false);
onLoad((query) => {
  const fallback = new URLSearchParams(takeNavigationQuery('/pages/team/team'));
  pendingShareIntent.value = (query?.intent ?? fallback.get('intent')) === 'share';
});
onShow(() => { invitePageVisible.value = true; });
onHide(() => { invitePageVisible.value = false; pendingShareIntent.value = false; });
watch(() => app.accountKey, () => { pendingShareIntent.value = false; });
watch([pendingShareIntent, invitePageVisible, inviteCard, () => referralRewards.snapshot?.referralCode, () => referralRewards.loading], () => {
  if (!pendingShareIntent.value || !invitePageVisible.value || !inviteCard.value || referralRewards.loading) return;
  if (remoteApiEnabled && !referralRewards.snapshot?.referralCode) return;
  pendingShareIntent.value = false;
  inviteCard.value.openShare();
}, { flush: 'post' });
const teamSummaryStatus = computed(() => remoteApiEnabled ? network.remoteStatus : "ready");
</script>

<style scoped>
.team-overview-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: var(--ui-space-inline); align-items: stretch; }
.team-rank { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 6px; min-width: 0; padding: var(--ui-space-inline); border: 1px solid var(--v5-border); border-radius: 22px; background: radial-gradient(ellipse at 50% 68%,color-mix(in srgb,var(--v5-brand) 7%,transparent),transparent 70%),var(--v5-surface); }
.team-rank__header { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 32px; gap: 4px; }
.team-rank__header > svg { flex-shrink: 0; color: var(--v5-ink-3); }
.team-rank:active { opacity: .8; }
.team-rank:focus-visible, .team-tool:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.team-rank__emblem { position: relative; display: grid; place-items: center; flex: none; width: 68px; height: 78px; }
.team-rank__outline { position: absolute; inset: 0; }
.team-rank__title { display: block; font: 600 var(--ui-type-section)/1.4 var(--font-v5); }
.team-rank__level { position: relative; display: block; font: 600 24px/1.3 var(--font-v5); color: var(--v5-brand); }
.team-rank__status { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px; font: 400 12px/1.4 var(--font-v5); color: var(--v5-ink-3); }
.team-rank__retry { display: flex; align-items: center; min-height: 44px; padding: 0 6px; color: var(--v5-brand); }
.team-rank__hint { display: block; margin-top: 4px; text-align: center; font: 400 12px/1.4 var(--font-v5); color: var(--v5-ink-3); }
@media(max-width:359px) {
  .team-overview-grid :deep(.team-summary__header),.team-rank__header { min-height: 42px; }
}
.team-section-title { display: block; font: 600 var(--ui-type-section)/1.4 var(--font-v5); margin-bottom: 8px; }
.team-tools { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); column-gap: var(--ui-space-inset); background: transparent; border: 0; border-radius: 0; }
.team-tools :deep(.nx-list-row) { padding-left: 0; padding-right: 0; min-width: 0; border: 0; }
.team-tools :deep(.nx-list-row__subtitle) { font-size: 12px; overflow-wrap: normal; word-break:normal; }
.team-tools :deep(.nx-list-row__title) { font-size: 14px; overflow-wrap: normal; word-break:normal; }
.team-tools :deep(.nx-list-row__leading) { width:24px; }
@media(max-width:359px) { .team-tools { grid-template-columns:minmax(0,1fr); } }
.team-estimate { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
.team-estimate__label { font: 400 11px/1.4 var(--font-v5); color: var(--v5-ink-3); }
.team-tool :deep(svg) { color: var(--v5-brand); stroke: var(--v5-brand); }
.team-tool :deep(svg:first-child) { flex-shrink: 0; }
.nx-team-royalty-network-link:active { opacity: .7; }
</style>
