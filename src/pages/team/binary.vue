<template>
  <AppChassis active="team">
    <RewardPageSurface>
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.headerTitles.teamBinary" :subtitle="t.headerSubtitles.teamBinary" />

        <view class="px-4" style="display: flex; flex-direction: column; gap: 12px; padding-top: 10px">
          <EmptyState
            v-if="remoteApiEnabled && pageState.primary === 'error'"
            kind="recoverable-error"
            :title="t.network.projectionErrorTitle"
            :desc="t.network.projectionErrorDesc"
            :cta-label="t.network.retry"
            compact
            @cta="retryCanonicalData"
          />
          <view
            v-else-if="remoteApiEnabled && pageState.primary === 'loading'"
            class="rounded-2xl"
            style="height: 184px; background: color-mix(in srgb, var(--v5-surface-2) 65%, transparent)"
            role="status"
            aria-live="polite"
            aria-busy="true"
          />
          <template v-if="pageState.primary === 'ready'">

        <view class="reward-summary-panel">
        <RewardHero kind="balance" :label="estimateText">
          <text class="reward-amount">+${{ formatFinanceAmount(periodMatch) }}</text>
          <template #footer><view class="reward-cta reward-rule-link" role="button" tabindex="0" @click="go('/pages/team/binary-how')" @keydown.enter.prevent="go('/pages/team/binary-how')" @keydown.space.prevent="go('/pages/team/binary-how')"><text>{{ t.binary.howItWorksEntry }}</text></view></template>
        </RewardHero>


        <view v-if="blocked" class="flex items-start" :style="blockedStyle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <view style="font-size: 12px; line-height: 1.375">
            <text class="block" :style="{ color: 'var(--v5-ink)', fontWeight: 600 }">{{ blockedTitleText }}</text>
            <text class="block" :style="{ color: 'var(--v5-ink-3)', marginTop: '4px' }">{{ blockedRecoveryText }}</text>
            <view v-if="showGrowthRecoveryCta" class="reward-cta" style="margin-top: 12px" role="button" tabindex="0" @keydown.enter.prevent="go('/pages/team/team')" @keydown.space.prevent="go('/pages/team/team')" @click="go('/pages/team/team')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg>
              <text>{{ t.binary.inviteCta }}</text>
            </view>
          </view>
        </view>


        <view class="reward-wings">
          <view v-for="wing in wings" :key="wing.key" class="reward-wing" :style="wingStyle(wing.isWeak)">
            <view class="flex items-center justify-between">
              <text class="font-display" :style="{ fontSize: '13px', fontWeight: 600, color: wing.color }">{{ wing.name }}</text>
              <text v-if="wing.isWeak" class="font-mono-tabular" :style="weakBadgeStyle">{{ t.binary.weakBadge }}</text>
            </view>
            <text class="block font-display tabular-nums" :style="wingVolStyle">{{ formatComputePoints(wing.computePoints, locale.code) }}</text>
            <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '4px' }">{{ wingMembersText(wing.count) }}</text>
            <view v-if="wing.top" class="reward-wing-member border-t" :style="topMemberStyle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg>
              <view class="reward-wing-member__body">
                <text class="block truncate" :style="{ fontSize: '12px' }">{{ wing.top.name }}</text>
                <view class="reward-wing-member__facts">
                  <VBadge class="reward-wing-member__rank" :v="wing.top.vRank" size="sm" :show-title="false" />
                  <text class="reward-wing-member__points font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ formatComputePoints(wing.top.monthComputePoints, locale.code) }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        </view>
        <view class="reward-binary-basis">
          <text class="block reward-caption">{{ t.binary.weak }} · {{ formatComputePoints(lowerComputePoints, locale.code) }}</text>
          <text class="block reward-caption">{{ formulaText }}</text>
          <text class="block reward-caption">{{ gapHintText }}</text>
        </view>

        <view v-if="remoteApiEnabled && pageState.memberDetails === 'error'" class="flex items-center justify-between" :style="memberReadErrorStyle">
          <text :style="{ fontSize: '12px', color: 'var(--v5-ink-2)' }">{{ t.binary.memberDetailsUnavailable }}</text>
          <view role="button" tabindex="0" class="reward-cta" @click="retryNetworkMembers"  @keydown.enter.prevent="retryNetworkMembers" @keydown.space.prevent="retryNetworkMembers">
            <text>{{ t.network.retry }}</text>
          </view>
        </view>


        <view v-if="recentBinaries.length > 0" :style="recentBlockStyle">
          <text class="block font-mono-tabular" :style="recentCapStyle">{{ t.binary.recentMatches }}</text>
          <view :style="recentGroupStyle">
          <view
            v-for="(e, i) in recentBinaries"
            :key="e.id"
            class="flex items-center"
            :style="recentRowStyle(i === recentBinaries.length - 1)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg>
            <view class="flex-1 min-w-0">
              <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink)' }">{{ e.sourceUserName }}</text>
              <text class="block font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ formatTrialDate(e.ts, dateLocale()) }}</text>
            </view>
            <view class="reward-match-amount"><text class="font-mono-tabular tabular-nums" :style="{ fontSize: '14px', color: binaryAmountColor(e.status), fontWeight: 600 }">{{ binaryAmountLabel(e) }}</text><text v-if="binaryStatusLabel(e.status)" class="reward-caption">{{ binaryStatusLabel(e.status) }}</text></view>
          </view>
          </view>
        </view>
          </template>
        </view>
      </view>
    </RewardPageSurface>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatFinanceAmount } from "@/lib/finance-amount-display";
import { formatComputePoints, sumComputePoints } from "@/i18n/compute-points";
import { useLocaleStore } from "@/store/locale";
import { computed, onMounted, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import RewardHero from "@/components/team/reward-compact-hero.vue";
import RewardPageSurface from "@/components/team/reward-page-surface.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import EmptyState from "@/components/empty-state.vue";
import VBadge from "@/components/team/v-badge.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { formatTrialDate } from "@/lib/trial-date";
import { useNetwork, type NetworkMember } from "@/store/network";
import { useCommission } from "@/store/commission";
import { useProductPhase } from "@/composables/use-product-phase";
import { BINARY_SETTLE_PERIOD, SETTLE_PERIOD_DAYS } from "@/lib/binary-settlement";
import { remoteApiEnabled, sessionVault } from "@/api/runtime";
import { onShow } from "@dcloudio/uni-app";
import { navTo } from "@/lib/route";
import { binaryPageState } from "@/lib/binary-page-state";
import { binaryBlockedGuidance } from "@/lib/binary-blocked-guidance";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { createScopedReadCoalescer } from "@/lib/binary-read-coalescer";
import { captureRuntimeRevision } from "@/api/order-api";
import { useAuth } from "@/store/auth";
import { useApp } from "@/store/app";

const t = useT();
const network = useNetwork();
const commission = useCommission();
const phase = useProductPhase();
const auth = useAuth();
const app = useApp();
const locale = useLocaleStore();
const canonicalReadCoalescer = createScopedReadCoalescer();

const snapshot = computed(() => commission.binarySnapshot);
const remoteSessionReady = computed(() => binarySessionReady({
  remote: remoteApiEnabled,
  authenticated: auth.isAuthenticated,
  accountId: auth.accountId,
  appAccountKey: app.accountKey,
  sessionUserId: sessionVault.read()?.user.userId ?? null,
}));
const pageState = computed(() => binaryPageState({
  remote: remoteApiEnabled,
  binaryStatus: commission.binaryStatus,
  networkStatus: network.remoteStatus,
}));
const remoteTrackA = computed(() => commission.binarySnapshot?.trackA ?? 0);
const remoteTrackB = computed(() => commission.binarySnapshot?.trackB ?? 0);
const settlePeriod = computed(() => remoteApiEnabled ? snapshot.value?.settlePeriod ?? "monthly" : BINARY_SETTLE_PERIOD);
const settleDays = computed(() => SETTLE_PERIOD_DAYS[settlePeriod.value]);
const MIN_THRESHOLD = computed(() => remoteApiEnabled ? snapshot.value?.threshold ?? 0 : 1000);
const MATCH_RATE = computed(() => remoteApiEnabled ? snapshot.value?.matchRate ?? 0 : 0.1);
const DAILY_CAP = computed(() => remoteApiEnabled ? snapshot.value?.dailyCap ?? 0 : phase.value.binaryDailyCapUSD);
const sides = computed(() => network.byBinary());
const leftPoints = computed(() => remoteApiEnabled ? snapshot.value?.trackAComputePoints ?? null : sumComputePoints(sides.value.left.map(m => m.monthComputePoints)));
const rightPoints = computed(() => remoteApiEnabled ? snapshot.value?.trackBComputePoints ?? null : sumComputePoints(sides.value.right.map(m => m.monthComputePoints)));
const lowerComputePoints = computed(() => leftPoints.value === null || rightPoints.value === null
  ? null : Math.min(leftPoints.value, rightPoints.value));
const smallerPointSide = computed(() => leftPoints.value === null || rightPoints.value === null || leftPoints.value === rightPoints.value
  ? null : leftPoints.value < rightPoints.value ? "left" : "right");
const leftMonthVol = computed(() => remoteApiEnabled ? remoteTrackA.value : network.leftVolumeMonth());
const rightMonthVol = computed(() => remoteApiEnabled ? remoteTrackB.value : network.rightVolumeMonth());
const weakSide = computed(() => (leftMonthVol.value <= rightMonthVol.value ? "left" : "right"));
const weakVol = computed(() => Math.min(leftMonthVol.value, rightMonthVol.value));
const strongVol = computed(() => Math.max(leftMonthVol.value, rightMonthVol.value));
// 非远端演示估算按周期业绩和配置比例计算，封顶 = 日封顶 × 周期天数。
// 正式远端直接读取服务端估算；公式比例来自同一快照，不在页面重算奖金。
const periodMatch = computed(() => {
  if (remoteApiEnabled) return snapshot.value?.estimatedAmountUsdt ?? 0;
  const factor = settleDays.value / 30;
  return Math.min(weakVol.value * factor * MATCH_RATE.value, DAILY_CAP.value * settleDays.value);
});
const blocked = computed(() => remoteApiEnabled
  ? Boolean(snapshot.value?.blockedReason)
  : leftMonthVol.value < MIN_THRESHOLD.value || rightMonthVol.value < MIN_THRESHOLD.value);

const recentBinaries = computed(() =>
  remoteApiEnabled
    ? (snapshot.value?.recentMatches ?? []).map((match) => ({
      id: match.id, sourceUserName: match.id, amountUSDT: match.amountUsdt, ts: match.createdAt, status: match.status,
    }))
    : commission.events.filter((e) => e.kind === "binary").slice(0, 5),
);
const spilloverCount = computed(() => remoteApiEnabled ? snapshot.value?.autoPlacedMembers ?? 0 : network.members.filter((m) => m.isSpillover).length);

function topOf(members: NetworkMember[]): NetworkMember | undefined {
  return [...members].sort((a, b) => (b.monthComputePoints ?? -1) - (a.monthComputePoints ?? -1))[0];
}

interface Wing {
  key: string;
  name: string;
  count: number;
  monthVol: number;
  computePoints: number | null;
  isWeak: boolean;
  color: string;
  top: NetworkMember | undefined;
}
const wings = computed<Wing[]>(() => [
  {
    key: "left",
    name: t.value.binary.leftWing,
    count: remoteApiEnabled && pageState.value.memberDetails !== "ready"
      ? snapshot.value?.trackAMembers ?? 0 : sides.value.left.length,
    monthVol: leftMonthVol.value,
    computePoints: leftPoints.value,
    isWeak: smallerPointSide.value === "left",
    color: "var(--v5-ink)",
    top: pageState.value.memberDetails === "ready" ? topOf(sides.value.left) : undefined,
  },
  {
    key: "right",
    name: t.value.binary.rightWing,
    count: remoteApiEnabled && pageState.value.memberDetails !== "ready"
      ? snapshot.value?.trackBMembers ?? 0 : sides.value.right.length,
    monthVol: rightMonthVol.value,
    computePoints: rightPoints.value,
    isWeak: smallerPointSide.value === "right",
    color: "var(--v5-ink)",
    top: pageState.value.memberDetails === "ready" ? topOf(sides.value.right) : undefined,
  },
]);

// 结算周期文案 + 数字据后台同源配置派生(默认每月),消除「页面暗示日结」与「每月结算」矛盾,
// 并让 hero 预计金额随结算周期联动(数字 periodMatch + 标签 {period} + 节奏 {freq} 三者一致)。
const periodFreqLabel = computed(() => t.value.binary.settlePeriodLabel[settlePeriod.value]);
const estimateText = computed(() =>
  fmt(t.value.binary.estimate, { period: t.value.binary.periodEstimateLabel[settlePeriod.value] }),
);
const gapHintText = computed(() => fmt(t.value.binary.gapHint, { freq: periodFreqLabel.value }));
const formulaText = computed(() =>
  fmt(t.value.binary.formula, {
    rate: (MATCH_RATE.value * 100).toLocaleString(dateLocale(), { maximumFractionDigits: 8 }),
    cap: formatFinanceAmount(DAILY_CAP.value),
    freq: periodFreqLabel.value,
  }),
);
const blockedDetailText = computed(() => {
  const blockedReason = snapshot.value?.blockedReason;
  if (remoteApiEnabled && blockedReason) {
    return t.value.binary.blockReasons[blockedReason as keyof typeof t.value.binary.blockReasons]
      ?? t.value.binary.blockReasons.UNKNOWN;
  }
  return fmt(t.value.binary.blockedDetail, {
    side: weakSide.value === "left" ? t.value.binary.left : t.value.binary.right,
    vol: formatFinanceAmount(weakVol.value),
  });
});
const blockedGuidance = computed(() => binaryBlockedGuidance({
  remote: remoteApiEnabled,
  blocked: blocked.value,
  reason: snapshot.value?.blockedReason,
}));
const blockedTitleText = computed(() => t.value.binary[blockedGuidance.value.titleKey]);
const showGrowthRecoveryCta = computed(() => blockedGuidance.value.showInviteOptions);
const blockedRecoveryText = computed(() => showGrowthRecoveryCta.value
  ? `${blockedDetailText.value} ${t.value.binary.blockedAction}`
  : blockedDetailText.value,
);
const spilloverTitleText = computed(() =>
  fmt(t.value.binary.spilloverTitle, { n: spilloverCount.value }),
);
function wingMembersText(n: number): string {
  return fmt(t.value.binary.monthVolMembers, { n });
}

function go(url: string) {
  navTo(url);
}

function binaryAmountLabel(event: { amountUSDT: number; status?: string }): string {
  const amount = formatFinanceAmount(event.amountUSDT);
  if (event.status === "reversed") return `−$${amount}`;
  if (event.status === "frozen" || event.status === "rejected") return `$${amount}`;
  return `+$${amount}`;
}

function binaryStatusLabel(status?: string): string {
  if (status === "cooling") return t.value.commissions.cooling;
  if (status === "unlocked") return t.value.commissions.readyTag;
  if (status === "withdrawn") return t.value.commissions.withdrawnTag;
  if (status === "frozen") return t.value.commissions.frozenTag;
  if (status === "reversed") return t.value.commissions.reversedTag;
  if (status === "rejected") return t.value.commissions.rejectedTag;
  return "";
}

function binaryAmountColor(status?: string): string {
  if (status === "rejected") return "var(--v5-danger)";
  if (status === "frozen") return "var(--v5-ink-2)";
  if (status === "reversed") return "var(--v5-ink-4)";
  return "var(--v5-ink)";
}

function retryCanonicalData(): void {
  if (!remoteSessionReady.value) return;
  const scope = {
    accountKey: app.accountKey,
    accountBindingEpoch: app.accountBindingEpoch,
    runtime: captureRuntimeRevision(),
  };
  void canonicalReadCoalescer.run(scope, () => Promise.all([
    commission.refreshCanonicalBinary(),
    network.refreshCanonicalNetwork(),
  ]).then(() => undefined));
}

function retryNetworkMembers(): void {
  if (!remoteSessionReady.value) return;
  void network.refreshCanonicalNetwork();
}

watch(remoteSessionReady, (ready, wasReady) => {
  if (ready && !wasReady) retryCanonicalData();
}, { immediate: true, flush: "post" });

onMounted(() => {
  // The projection owns rule/settlement aggregates; the network projection
  // owns the actual A/B members shown inside each wing.
  if (remoteApiEnabled) retryCanonicalData();
});
onShow(() => {
  if (remoteApiEnabled) retryCanonicalData();
});

const blockedStyle: CSSProperties = {
  padding: "14px 0",
  gap: "10px",
  background: "transparent",
};

function wingStyle(isWeak: boolean): CSSProperties {
  return {
    padding: "12px 0",
    background: "transparent",
  };
}
const weakBadgeStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--reward-accent)",
};
const wingVolStyle: CSSProperties = { marginTop: "8px", fontSize: "20px", fontWeight: 600, lineHeight: 1 };
const topMemberStyle: CSSProperties = {
  marginTop: "10px",
  paddingTop: "10px",
  borderColor: "var(--v5-border)",
  gap: "6px",
};
const memberReadErrorStyle: CSSProperties = {
  padding: "12px 0",
  gap: "12px",
  borderBottom: "1px solid var(--v5-border)",
};

// Transparent hairline group — cap label outside, border-top opens the rows.
const recentBlockStyle: CSSProperties = { marginTop: "12px" };
const recentCapStyle: CSSProperties = {
  padding: "0 2px",
  marginBottom: "8px",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-ink-3)",
};
const recentGroupStyle: CSSProperties = { padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
function recentRowStyle(isLast: boolean): CSSProperties {
  return {
    padding: "11px 0",
    gap: "10px",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}


</script>

<style scoped>
.reward-wings { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 24px; margin-top: var(--ui-space-inline); }
.reward-wing { min-width: 0; }
.reward-wing-member { display: flex; align-items: flex-start; }
.reward-wing-member > svg { flex: 0 0 18px; margin-top: 2px; }
.reward-wing-member__body { flex: 1; min-width: 0; }
.reward-wing-member__facts { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; margin-top: 4px; min-width: 0; }
.reward-wing-member__rank { flex: none; }
.reward-wing-member__points { display: block; max-width: 100%; overflow-wrap: anywhere; line-height: 1.5; }
.reward-binary-basis { display: flex; flex-direction: column; gap: 8px; padding: 4px 0 12px; border-bottom: 1px solid var(--v5-border); }
.reward-match-amount { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; max-width: 48%; }
@media (max-width: 360px) { .reward-wings { gap: 14px; } }
</style>
