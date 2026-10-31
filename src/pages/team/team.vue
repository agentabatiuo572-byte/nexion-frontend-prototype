<template>
  <AppChassis active="team">
    <view class="pb-4" style="padding-top: 12px; color: var(--v5-ink)">
      <view class="px-4" style="display: flex; flex-direction: column; gap: 16px">
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
        <!-- Badge, the gap to the next rank and one bar per next-rank condition. -->
        <view class="nx-team-rank-link team-rank nx-viz-press" role="link" tabindex="0" :aria-label="t.team.rankBenefits" @click="go('/pages/team/rank')" @keydown.enter.prevent="go('/pages/team/rank')" @keydown.space.prevent="go('/pages/team/rank')">
          <view class="team-rank__header"><text class="team-rank__title">{{ designCopy.myRank }}</text><text class="team-rank__chev" aria-hidden="true">›</text></view>
          <view class="team-rank__identity">
            <TeamRankEmblem v-if="!visibility.hidden && rankReadable" :rank="remoteApiEnabled ? rankPresentation : myRank" :size="52" />
            <view class="team-rank__copy"><text class="team-rank__level">{{ visibility.mask(myRankDisplay) }}</text><text class="team-rank__hint">{{ visibility.mask(rankGapText) }}</text></view>
          </view>
          <view v-if="rankBars.length" ref="rankBarsEl" class="team-rank__bars" aria-hidden="true">
            <view v-for="(bar, index) in rankBars" :key="bar.key" class="team-rank__bar"><text>{{ bar.label }}</text><view class="team-rank__track"><view :style="{ width: rankBarsInView === false || visibility.hidden || bar.percent === null ? '0%' : `${bar.percent}%`, transition: rankBarsInView === false ? 'none' : PROGRESS_GROW_TRANSITION, transitionDelay: rankBarsInView === false ? '0ms' : vizStagger(index) }" /></view></view>
          </view>
          <view v-if="vrank.remoteError" class="team-rank__status" role="status"><text>{{ t.rank.loadError }}</text><view class="team-rank__retry" role="button" tabindex="0" @click.stop="vrank.refreshCanonicalVRank()" @keydown.enter.stop.prevent="vrank.refreshCanonicalVRank()" @keydown.space.stop.prevent="vrank.refreshCanonicalVRank()">{{ t.rank.retry }}</view></view>
        </view>

        </view>

        <ReferralProgress @share="inviteCard?.openShare()" />

        <!-- Rewards: one card per reward with its own accent and mini visual (P-41) -->
        <view>
          <view class="team-section-head"><text class="team-section-title">{{ designCopy.rewardsSection }}</text><text class="team-section-meta">{{ locale.code === "zh" ? "本期" : locale.code === "vi" ? "Kỳ này" : "This period" }}</text></view>
          <view ref="bentoEl" class="team-bento nx-viz-motion">
            <view class="nx-team-leaderboard-link team-bento__card nx-viz-press team-bento__card--wide team-bento__card--gold" role="link" tabindex="0" @click="go('/pages/team/leaderboard')" @keydown.enter.prevent="go('/pages/team/leaderboard')">
              <view class="team-bento__head"><view class="team-bento__icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0z" /></svg></view><svg class="team-bento__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></view>
              <view class="team-bento__podium" aria-hidden="true"><view v-for="(bar, index) in PODIUM_BARS" :key="index" :style="{ height: bentoInView === false ? '0px' : `${bar.height}px`, transition: bentoInView === false ? 'none' : VIZ_GROW_HEIGHT_TRANSITION, transitionDelay: bentoInView === false ? '0ms' : vizStagger(bar.order) }" /></view>
              <view class="team-bento__foot">
                <text class="team-bento__headline">{{ t.teamV3.leaderboardCard.subtitle }}</text>
                <text class="team-bento__caption">{{ t.teamV3.leaderboardCard.title }} · <text class="team-bento__muted">{{ t.leaderboard.periods.week }}</text></text>
              </view>
            </view>
            <view class="nx-team-royalty-network-link team-bento__card nx-viz-press team-bento__card--brand" role="button" tabindex="0" :aria-label="t.teamV3.sevenLayerNetwork" @click="openReferralNetwork" @keydown.enter.prevent="openReferralNetwork">
              <view class="team-bento__head"><view class="team-bento__icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg></view><svg class="team-bento__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></view>
              <view v-if="memberInitials.length" class="team-bento__avatars" aria-hidden="true">
                <text v-for="(initial, index) in memberInitials" :key="index" class="team-bento__avatar">{{ initial }}</text>
              </view>
              <view class="team-bento__foot">
                <text class="team-bento__value team-bento__value--count">{{ visibility.mask(totalMembersCountText) }}<text v-if="locale.code === 'zh' && !visibility.hidden" class="team-bento__unit">人</text></text>
                <text class="team-bento__caption">{{ designCopy.teamRewards }} · <text class="team-bento__muted">{{ designCopy.memberCountLabel }}</text></text>
              </view>
            </view>
            <view class="nx-team-binary-link team-bento__card nx-viz-press team-bento__card--cyan" role="link" tabindex="0" @click="go('/pages/team/binary')" @keydown.enter.prevent="go('/pages/team/binary')">
              <view class="team-bento__head"><view class="team-bento__icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg></view><svg class="team-bento__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></view>
              <view v-if="binary && !visibility.hidden" class="team-bento__split" aria-hidden="true"><view :style="{ width: bentoInView === false ? '0%' : `${binarySplit.left}%`, transition: bentoInView === false ? 'none' : PROGRESS_GROW_TRANSITION }" /><view :style="{ width: bentoInView === false ? '0%' : `${binarySplit.right}%`, transition: bentoInView === false ? 'none' : PROGRESS_GROW_TRANSITION, transitionDelay: bentoInView === false ? '0ms' : vizStagger(1) }" /></view>
              <view class="team-bento__foot">
                <text v-if="binaryAmountParts && !visibility.hidden" class="team-bento__value team-bento__amount nx-num-amount"><text class="team-bento__currency">{{ binaryAmountParts.prefix }}</text>{{ binaryAmountParts.integer }}<text class="team-bento__fraction">.{{ binaryAmountParts.fraction }}</text></text><text v-else class="team-bento__value team-bento__amount nx-num-amount">{{ visibility.mask(binaryMatchText) }}</text>
                <text class="team-bento__caption">{{ designCopy.twoGroupRewards }} · <text class="team-bento__muted">{{ designCopy.estimated }}</text></text>
              </view>
            </view>
            <view class="nx-team-leadership-pool-link team-bento__card nx-viz-press team-bento__card--wide team-bento__card--violet" role="link" tabindex="0" @click="go('/pages/team/leadership-pool')" @keydown.enter.prevent="go('/pages/team/leadership-pool')">
              <view class="team-bento__head"><view class="team-bento__icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14" /></svg></view><svg class="team-bento__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></view>
              <view class="team-bento__pool">
                <view class="team-bento__foot">
                  <view class="team-estimate"><text v-if="leadershipPoolUnlocked && remotePoolReadable" class="team-estimate__label">{{ designCopy.estimated }}</text><text v-if="poolAmountParts && !visibility.hidden" class="team-bento__value team-bento__amount nx-num-amount"><text class="team-bento__currency">{{ poolAmountParts.prefix }}</text>{{ poolAmountParts.integer }}<text class="team-bento__fraction">.{{ poolAmountParts.fraction }}</text></text><text v-else class="team-bento__value team-bento__amount nx-num-amount">{{ visibility.mask(leadershipPoolPrimary) }}</text></view>
                  <text class="team-bento__caption">{{ t.teamV3.weeklyPool }}<template v-if="poolShareReady"> · <text class="team-bento__muted">{{ leadershipPoolLineA }}</text></template></text>
                  <text v-if="!poolShareReady" class="team-bento__meta">{{ remotePoolReadable ? leadershipPoolLineB : leadershipPoolLineA }}</text>
                </view>
                <view class="team-bento__ring" :class="{ 'team-bento__ring--capped': poolRingPct > 0 }" aria-hidden="true" :style="{ '--nx-viz-ring': bentoInView === false ? 0 : poolRingPct, transition: bentoInView === false ? 'none' : VIZ_RING_TRANSITION }"><view><text class="team-bento__ring-value nx-num-metric">{{ !remotePoolReadable ? "—" : poolShareReady ? leadershipPoolLineB : fmt(t.home.rankUnlockAt, { n: leadershipUnlockRank }) }}</text><text v-if="poolShareReady" class="team-bento__ring-label">{{ t.pool.myShare }}</text></view></view>
              </view>
            </view>
          </view>
        </view>

        <view>
          <text class="team-section-title">{{ designCopy.moreTools }}</text>
          <view class="team-tools">
            <view class="team-tool" role="link" tabindex="0" :aria-label="t.teamV3.hardwareQuota" @click="go('/pages/team/quota')" @keydown.enter.prevent="go('/pages/team/quota')"><view class="team-tool__icon team-tool__icon--brand"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7Z M3 7l9 5 9-5M12 12v10"/></svg></view><text class="team-tool__label">{{ t.teamV3.hardwareQuota }}</text></view>
            <view class="team-tool" role="link" tabindex="0" :aria-label="t.teamV3.ambassador" @click="go('/pages/team/agent')" @keydown.enter.prevent="go('/pages/team/agent')"><view class="team-tool__icon team-tool__icon--orange"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></view><text class="team-tool__label">{{ t.teamV3.ambassador }}</text></view>
            <view class="team-tool" role="link" tabindex="0" :aria-label="t.teamV3.visualizations.influenceNetwork" @click="go('/pages/team/network')" @keydown.enter.prevent="go('/pages/team/network')"><view class="team-tool__icon team-tool__icon--cyan"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="4" r="3"/><circle cx="4" cy="19" r="3"/><circle cx="20" cy="19" r="3"/><path d="m10.5 7-5 9m9-9 5 9M7 19h10"/></svg></view><text class="team-tool__label">{{ t.teamV3.visualizations.influenceNetwork }}</text></view>
            <view class="team-tool" role="link" tabindex="0" :aria-label="t.teamV3.visualizations.genealogy" @click="go('/pages/team/tree')" @keydown.enter.prevent="go('/pages/team/tree')"><view class="team-tool__icon team-tool__icon--violet"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg></view><text class="team-tool__label">{{ t.teamV3.visualizations.genealogy }}</text></view>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION, VIZ_GROW_HEIGHT_TRANSITION, VIZ_RING_TRANSITION, vizStagger } from "@/composables/use-scroll-grow-progress";
import { runPassiveTabRead, invalidatePassiveTabRead, passiveTabReadScope } from "@/lib/passive-tab-read";
import { formatUsd, formatUsdOverviewParts } from "@/lib/usd-display";
import { formatComputePoints, sumComputePoints } from "@/i18n/compute-points";
import ReferralProgress from '@/components/promotion/referral-progress.vue';
import { navTo } from "@/lib/route";
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onLoad, onShow, onHide } from "@/composables/use-tab-page-lifecycle";
import { takeNavigationQuery } from "@/lib/route";
import AppChassis from "@/components/tab-page-frame.vue";
import { teamRedesignCopy } from '@/i18n/team-redesign';
import InviteEarnCard from "@/components/team/invite-earn-card.vue";
import TeamLedgerCard from "@/components/team/team-ledger-card.vue";
import TeamRankEmblem from "@/components/team/team-rank-emblem.vue";
import { teamRankProgress } from "@/lib/team-rank-progress";
import { useAuditUiCopy } from "@/i18n/audit-ui";
import NetworkOrbBackdrop from "@/components/team/network-orb-backdrop.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { useVRank } from "@/store/v-rank";
import { rankLabel } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { useNetwork } from "@/store/network";
import { useCommission } from "@/store/commission";
import { useLeadershipPool } from "@/store/leadership-pool";
import { apiRuntimeConfig, remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import { productCatalogState, productCatalogDisplayProof, productCatalogPresentation, isProductCatalogDisplayCurrent } from "@/store/product-catalog";
import type { CanonicalBinaryState } from "@/api/commission-config-api";
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
const auditCopy = useAuditUiCopy();
const locale = useLocaleStore();
const network = useNetwork();
const commission = useCommission();
type LedgerPresentation = Pick<TeamCommissionSnapshot["aggregate"], "totalUSDT" | "contributorCount" | "directUSDT" | "extendedUSDT" | "monthUSDT" | "monthNEX" | "unlockedUSDT" | "coolingUSDT">;
const ledgerPresentation = ref<LedgerPresentation | null>(null);
const rankPresentation = ref<number | null>(null);
const binaryPresentation = ref<Pick<CanonicalBinaryState, "estimatedAmountUsdt" | "trackA" | "trackB"> | null>(null);
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
  ledgerPresentation.value = null; rankPresentation.value = null; binaryPresentation.value = null;
  remotePoolRequest += 1; remotePool.value = null; remotePoolState.value = "idle";
}
watch([ledgerFailed, () => network.remoteStatus === "ready" && commission.eventsStatus === "ready"], ([failed, ready]) => {
  if (failed) ledgerFailureFeedback.value = true;
  else if (ready) ledgerFailureFeedback.value = false;
}, { immediate: true, flush: "sync" });
watch(() => [app.accountKey, app.accountBindingEpoch, apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl, locale.code], clearTeamPresentation, { flush: "sync" });
watch(() => locale.code, () => { commission.invalidateReadOwner(); network.invalidateReadOwner(); vrank.invalidateReadOwner(); }, { flush: "sync" });
watch(displayCatalogValid, valid => { if (!valid) clearTeamPresentation(); }, { flush: "sync" });
// Catalog publication metadata and image URLs do not change binary facts.
// Business changes revoke the display even when the revision stays the same.
watch(() => {
  const snapshot = productCatalogPresentation.value;
  return snapshot && JSON.stringify([snapshot.source, snapshot.serverCanonical, snapshot.sourceEnvironment, snapshot.runId, snapshot.products.map(({ imageUrl: _imageUrl, ...product }) => product)]);
}, () => { binaryPresentation.value = null; }, { flush: "sync" });
watch([() => commission.binaryStatus, () => commission.binarySnapshot], () => {
  if (commission.binaryStatus === "error") { binaryPresentation.value = null; return; }
  const snapshot = commission.binarySnapshot;
  if (!displayCatalogValid.value || commission.binaryStatus !== "ready" || !snapshot) return;
  const { estimatedAmountUsdt, trackA, trackB } = snapshot;
  binaryPresentation.value = { estimatedAmountUsdt, trackA, trackB };
}, { immediate: true, flush: "sync" });
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

const rankReadable = computed(() => !remoteApiEnabled || (rankPresentation.value !== null && vrank.remoteReady));
const rankProgress = computed(() => teamRankProgress({
  myRank: vrank.myRank,
  selfComputePoints: vrank.selfComputePoints,
  directRefs: vrank.directRefs,
  teamComputePoints: vrank.teamComputePoints,
  vDownlineCounts: vrank.vDownlineCounts,
}, vrank.ladder));
const rankGapText = computed(() => {
  if (!rankReadable.value) return designCopy.value.benefitsAndRewards;
  const next = rankProgress.value.next;
  if (!next) return t.value.home.rankTopTier;
  return `${fmt(auditCopy.value.toRank, { rank: `V${next.v}` })}${locale.code === "zh" ? " " : " · "}${fmt(auditCopy.value.remainingConditions, { n: rankProgress.value.missing.length })}`;
});
// One short bar per condition of the next rank; unknown progress keeps an empty track.
const rankBars = computed(() => {
  const next = rankProgress.value.next;
  if (!rankReadable.value || !next) return [];
  const short = locale.code === "zh" ? { selfComputePoints: "自购", directRefs: "好友", teamComputePoints: "团队" }
    : locale.code === "vi" ? { selfComputePoints: "Cá nhân", directRefs: "Bạn bè", teamComputePoints: "Nhóm" }
      : { selfComputePoints: "Self", directRefs: "Friends", teamComputePoints: "Team" };
  return rankProgress.value.rows.filter(row => row.tier === next.v).map(row => ({
    key: row.key,
    label: row.kind === "vDownlines" ? `V${row.vLevel}` : short[row.kind],
    percent: row.status === "unknown" ? null : row.required === 0 ? 100 : Math.min(100, Math.round(row.current! / row.required * 100)),
  }));
});
const { elRef: rankBarsEl, inView: rankBarsInView } = useScrollGrowProgress();

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
    const snapshot = binaryPresentation.value;
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
const binaryAmountParts = computed(() => binary.value === null ? null : formatUsdOverviewParts(binary.value.binaryMatch));

const myVotes = computed(() => remoteApiEnabled ? remotePool.value?.myVotes ?? 0 : pool.myVotes(vrank.myRank));
const leadershipUnlockRank = computed(() => remoteApiEnabled ? remotePool.value?.unlockRank ?? 3 : 3);
const myShare = computed(() => remoteApiEnabled ? remotePool.value?.mySharePct ?? 0 : pool.mySharePct(vrank.myRank));
const projectedPayout = computed(() => remoteApiEnabled ? remotePool.value?.projectedPayoutUSDT ?? 0 : pool.myProjectedPayout(vrank.myRank));
const leadershipPoolUnlocked = computed(() => myVotes.value > 0);
const leadershipPoolTotal = computed(() => remoteApiEnabled ? remotePool.value?.currentWeekPoolUSDT ?? 0 : pool.currentWeekPoolUSDT);
const leadershipPoolPrimary = computed(() =>
  !remotePoolReadable.value ? "—" : formatUsd(leadershipPoolUnlocked.value ? projectedPayout.value : leadershipPoolTotal.value),
);
const poolAmountParts = computed(() => !remotePoolReadable.value ? null : formatUsdOverviewParts(leadershipPoolUnlocked.value ? projectedPayout.value : leadershipPoolTotal.value));
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

// Mini visuals on the reward cards: member initials, the A/B volume split and my pool share.
const memberInitials = computed(() => {
  if (!networkReadable.value || visibility.hidden) return [];
  const members = ([1, 2, 3, 4, 5, 6, 7] as const).flatMap(layer => byLayerBuckets.value[layer]);
  const initials = members.slice(0, 3).map(member => member.name.trim().charAt(0).toUpperCase() || "•");
  return members.length > 3 ? [...initials, `+${members.length - 3}`] : initials;
});
const binarySplit = computed(() => {
  const left = binary.value?.leftVol ?? 0, right = binary.value?.rightVol ?? 0;
  // Each side's share of the track, leaving room for the 3px gap.
  return left + right > 0 ? { left: left / (left + right) * 98, right: right / (left + right) * 98 } : { left: 0, right: 0 };
});
// Decorative pedestals (2nd, 1st, 3rd); they rise 3rd → 2nd → 1st.
const PODIUM_BARS = [{ height: 26, order: 1 }, { height: 40, order: 2 }, { height: 18, order: 0 }];
const { elRef: bentoEl, inView: bentoInView } = useScrollGrowProgress();
const poolShareReady = computed(() => remotePoolReadable.value && leadershipPoolUnlocked.value);
const poolRingPct = computed(() => !visibility.hidden && remotePoolReadable.value && leadershipPoolUnlocked.value
  ? Math.min(100, Math.max(0, myShare.value * 100)) : 0);

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
const rankTitleStyle: CSSProperties = { fontSize: "var(--ui-type-card-title)", fontWeight: 600, color: "var(--v5-tech-cyan-ink)" };
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
const toolTitleStyle: CSSProperties = { marginTop: "14px", fontSize: "var(--ui-type-subheading)", fontWeight: "var(--ui-type-subheading-weight)", lineHeight: 1.4 };
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
.team-rank { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: var(--v5-space-2); min-width: 0; min-height: 176px; box-sizing: border-box; padding: var(--ui-space-inset); border-radius: 24px; background: radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, var(--v5-brand) 9%, transparent), transparent 60%), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.team-rank__header { display: flex; align-items: center; justify-content: space-between; min-height: 24px; gap: 4px; }
.team-rank__title { font: 600 14px/20px var(--font-v5); }
.team-rank__chev { font-size: 18px; color: var(--v5-ink-4); }
.team-rank__identity { display: flex; align-items: center; gap: 8px; min-width: 0; }
.team-rank__copy { display: flex; flex-direction: column; min-width: 0; }
.team-rank__level { font: 700 22px/26px var(--font-metric); color: var(--v5-brand); }
.team-rank__hint { font: 400 11px/14px var(--font-v5); color: var(--v5-ink-3); overflow-wrap: anywhere; }
.team-rank__bars { display: flex; flex-direction: column; gap: 6px; margin-top: auto; }
.team-rank__bar { display: grid; grid-template-columns: minmax(28px, max-content) minmax(0, 1fr); align-items: center; gap: 6px; font: 400 10px/12px var(--font-v5); color: var(--v5-ink-3); }
.team-rank__track { height: 4px; overflow: hidden; border-radius: 999px; background: var(--v5-surface-3); }
.team-rank__track > view { height: 100%; border-radius: 999px; background: var(--v5-brand); }
.team-overview-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: var(--ui-space-inline); align-items: stretch; }
.team-rank:focus-visible, .team-tool:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.team-rank__status { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px; font: 400 12px/1.4 var(--font-v5); color: var(--v5-ink-3); }
.team-rank__retry { display: flex; align-items: center; min-height: 44px; padding: 0 6px; color: var(--v5-brand); }
@media(max-width:359px) {
  .team-overview-grid :deep(.team-summary__header),.team-rank__header { min-height: 42px; }
}
.team-section-title { display: block; font: 600 var(--ui-type-section)/1.4 var(--font-v5); margin-bottom: var(--v5-space-4); }
.team-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-inline); }
.team-section-meta { font: 400 12px/1.4 var(--font-v5); color: var(--v5-ink-3); }
.team-estimate { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
.team-estimate__label { font: 400 11px/1.4 var(--font-v5); color: var(--v5-ink-3); }
/* Reward cards (P-41): flat surface with a faint accent tint, accent icon and a mini visual. */
.team-bento { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-inline); }
.team-bento__card { --accent: var(--v5-brand); position: relative; display: flex; flex-direction: column; gap: var(--ui-space-inline); min-width: 0; min-height: 168px; box-sizing: border-box; padding: var(--ui-space-inset); overflow: hidden; border-radius: var(--ui-radius-surface); background: radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 60%), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.team-bento__card--wide { grid-column: span 2; min-height: 132px; }
.team-bento__card--gold { --accent: var(--v5-warning); }
.team-bento__card--brand { --accent: var(--v5-brand); }
.team-bento__card--cyan { --accent: var(--ui-device-ink); }
.team-bento__card--violet { --accent: var(--v5-nex); }
.team-bento__card:focus-visible, .team-tool:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.team-bento__head { display: flex; align-items: center; justify-content: space-between; }
.team-bento__icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 12px; color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent); }
.team-bento__chev { color: var(--v5-ink-4); }
.team-bento__foot { display: flex; flex-direction: column; gap: 2px; margin-top: auto; min-width: 0; }
.team-bento__headline { font: 600 var(--ui-type-hero-title)/var(--ui-type-hero-title-lh) var(--font-v5); }
.team-bento__value { font: 500 22px/30px var(--font-metric); font-variant-numeric: tabular-nums; white-space: nowrap; }
.team-bento__amount { font-family: var(--font-amount); }
.team-bento__value--count { font-size: 28px; line-height: 34px; }
.team-bento__unit { margin-left: 6px; font: 400 13px/1 var(--font-v5); color: var(--v5-ink-3); }
.team-bento__currency { font-size: 14px; }
.team-bento__fraction { color: var(--v5-ink-3); }
.team-bento__caption { font: 500 var(--ui-type-description)/18px var(--font-v5); color: var(--v5-ink); }
.team-bento__muted { color: var(--v5-ink-3); }
.team-bento__meta { font: var(--ui-type-meta-weight) var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); color: var(--v5-ink-3); overflow-wrap: anywhere; }
.team-bento__podium { position: absolute; right: var(--ui-space-inset); bottom: 14px; display: flex; align-items: flex-end; gap: var(--v5-space-1); }
.team-bento__podium > view { width: 22px; border-radius: 6px 6px 2px 2px; }
.team-bento__card--gold { display: grid; grid-template-columns: minmax(0, 1fr) 74px; gap: var(--v5-space-3); }
.team-bento__card--gold .team-bento__head { grid-column: 1 / -1; }
.team-bento__card--gold .team-bento__foot { grid-column: 1; grid-row: 2; align-self: end; }
.team-bento__card--gold .team-bento__podium { position: static; grid-column: 2; grid-row: 2; align-self: end; height: 40px; }
.team-bento__podium > view:nth-child(1) { background: linear-gradient(180deg, var(--v5-ink-2), color-mix(in srgb, var(--v5-ink-2) 25%, transparent)); }
.team-bento__podium > view:nth-child(2) { background: linear-gradient(180deg, var(--v5-warning), color-mix(in srgb, var(--v5-warning) 25%, transparent)); }
.team-bento__podium > view:nth-child(3) { background: linear-gradient(180deg, var(--v5-brand-2), color-mix(in srgb, var(--v5-brand-2) 25%, transparent)); }
.team-bento__avatars { display: flex; }
.team-bento__avatar { display: grid; place-items: center; min-width: 22px; height: 22px; margin-left: -6px; padding: 0 var(--v5-space-1); box-sizing: border-box; border-radius: 999px; background: var(--v5-brand); box-shadow: 0 0 0 2px var(--v5-surface); font: 600 10px/1 var(--font-v5); color: var(--v5-on-brand); }
.team-bento__avatar:first-child { margin-left: 0; }
.team-bento__avatar:nth-child(2) { background: var(--ui-device-ink); }
.team-bento__avatar:nth-child(3) { background: var(--v5-warning); }
.team-bento__avatar:nth-child(4) { background: var(--v5-ink-2); }
.team-bento__split { display: flex; gap: 3px; }
.team-bento__split > view { height: 8px; min-width: 0; border-radius: 999px; background: var(--ui-device-ink); }
.team-bento__split > view:last-child { background: color-mix(in srgb, var(--ui-device-ink) 35%, transparent); }
.team-bento__pool { display: grid; grid-template-columns: minmax(0, 1fr) 92px; align-items: end; gap: var(--v5-space-3); margin-top: auto; }
.team-bento__ring { display: grid; place-items: center; width: 92px; height: 92px; border-radius: 999px; background: conic-gradient(var(--v5-nex) calc(var(--nx-viz-ring) * 1%), var(--v5-surface-3) 0); }
/* Round arc ends, as on the pool page. */
@supports (width: calc(sin(1deg) * 1px)) {
  .team-bento__ring--capped { background: radial-gradient(circle at calc(50% + sin(calc(var(--nx-viz-ring) * 3.6deg)) * 42px) calc(50% - cos(calc(var(--nx-viz-ring) * 3.6deg)) * 42px), var(--v5-nex) 3.5px, transparent 4px), radial-gradient(circle at 50% 4px, var(--v5-nex) 3.5px, transparent 4px), conic-gradient(var(--v5-nex) calc(var(--nx-viz-ring) * 1%), var(--v5-surface-3) 0); }
}
.team-bento__ring > view { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; width: 76px; height: 76px; padding: 0 var(--v5-space-1); box-sizing: border-box; border-radius: 999px; background: var(--v5-surface); text-align: center; }
.team-bento__ring-value { font: 600 15px/18px var(--font-metric); color: var(--v5-nex); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.team-bento__ring-label { font: 500 11px/14px var(--font-v5); color: var(--v5-ink-3); }
.team-bento__pool .team-estimate { align-items: flex-start; gap: 2px; }
/* More tools: four glass icon buttons in one row. */
.team-tools { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--v5-space-2); }
.team-tool { display: flex; flex-direction: column; align-items: center; gap: var(--v5-space-2); min-width: 0; }
.team-tool:active { opacity: .8; }
.team-tool__icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 20px; background: linear-gradient(145deg, rgba(255,255,255,.07), transparent 40%, transparent 64%, rgba(255,255,255,.05)), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border), inset 0 3px 6px -2px rgba(255,255,255,.18); }
.team-tool__icon--brand { color: var(--v5-brand); }
.team-tool__icon--orange { color: var(--v5-brand-2); }
.team-tool__icon--cyan { color: var(--ui-device-ink); }
.team-tool__icon--violet { color: var(--v5-nex); }
.team-tool__label { max-width: 100%; text-align: center; font: 500 var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); color: var(--v5-ink-2); overflow-wrap: anywhere; }
</style>
