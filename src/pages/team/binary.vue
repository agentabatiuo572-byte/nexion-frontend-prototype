<template>
  <AppChassis active="team">
    <RewardPageSurface>
      <view class="pb-6" style="color: var(--v5-ink)">
        <SubPageHeader back="/pages/team/team" :title="t.headerTitles.teamBinary" :subtitle="t.headerSubtitles.teamBinary" />
        <view class="binary-content">
          <EmptyState v-if="remoteApiEnabled && pageState.primary === 'error'" kind="recoverable-error"
            :title="t.network.projectionErrorTitle" :desc="t.network.projectionErrorDesc" :cta-label="t.network.retry"
            compact @cta="retryCanonicalData" />
          <view v-else-if="remoteApiEnabled && pageState.primary === 'loading' && !snapshot" class="binary-loading"
            role="status" aria-live="polite" aria-busy="true" />
          <template v-if="pageState.primary === 'ready' || (pageState.primary === 'loading' && snapshot !== null)">
            <view class="binary-hero">
              <view class="binary-hero-heading">
                <text class="binary-label">{{ estimateText }}</text>
                <view class="binary-rule-link" role="link" tabindex="0" :aria-label="t.binary.howItWorksEntry"
                  @click="go('/pages/team/binary-how')" @keydown.enter.prevent="go('/pages/team/binary-how')" @keydown.space.prevent="go('/pages/team/binary-how')"><text>{{ binaryCopy.rules }}</text></view>
              </view>
              <RewardHero kind="balance"><text class="reward-amount">+${{ visibility.mask(formatFinanceAmount(periodMatch)) }}</text></RewardHero>
            </view>

            <view v-if="blocked" class="binary-notice" :style="blockedStyle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4m0 4h.01"/></svg>
              <view class="binary-notice-copy">
                <text class="binary-notice-title">{{ blockedTitleText }}</text>
                <text class="binary-note">{{ blockedRecoveryText }}</text>
                <view v-if="showGrowthRecoveryCta" class="binary-text-action" role="button" tabindex="0"
                  @click="go('/pages/team/team')" @keydown.enter.prevent="go('/pages/team/team')" @keydown.space.prevent="go('/pages/team/team')"><text>{{ t.binary.inviteCta }}</text><text aria-hidden="true">→</text></view>
              </view>
            </view>

            <view class="binary-comparison-section">
              <text class="binary-section-title">{{ binaryCopy.contributions }}</text>
              <view class="binary-comparison">
                <view v-for="(wing, index) in wings" :key="wing.key" class="binary-contribution">
                  <view class="binary-group-heading"><text>{{ wing.name }}</text><text v-if="wing.isWeak && !visibility.hidden" class="binary-weak">{{ t.binary.weakBadge }}</text></view>
                  <text class="binary-points tabular-nums">{{ visibility.mask('$' + formatFinanceAmount(wing.monthVol)) }}</text>
                  <view class="binary-contribution-track" aria-hidden="true"><view v-if="contributionWidths && !visibility.hidden" class="binary-contribution-fill nx-viz-rise" :class="{ 'binary-contribution-fill--other': index === 1 }" :style="{ height: contributionWidths[index] + '%', animationDelay: vizStagger(index, 120) }" /></view>
                  <text class="binary-note">{{ wingMembersText(wing.count) }}</text>
                </view>
              </view>
              <view class="reward-binary-basis">
                <text class="binary-note">{{ formulaText }}</text>
                <text class="binary-note">{{ gapHintText }}</text>
              </view>
            </view>

            <view v-if="remoteApiEnabled && pageState.memberDetails === 'error'" class="binary-member-recovery" :style="memberReadErrorStyle">
              <text class="binary-note">{{ t.binary.memberDetailsUnavailable }}</text>
              <view role="button" tabindex="0" class="binary-text-action" @click="retryNetworkMembers" @keydown.enter.prevent="retryNetworkMembers" @keydown.space.prevent="retryNetworkMembers"><text>{{ t.network.retry }}</text><text aria-hidden="true">→</text></view>
            </view>
            <view v-if="wings.some(wing => wing.top)" class="binary-leaders">
              <text class="binary-section-title">{{ binaryCopy.leadingMembers }}</text>
              <view class="reward-wings">
                <view v-for="wing in wings" :key="wing.key" class="reward-wing" :style="wingStyle(wing.isWeak)">
                  <text class="binary-label">{{ wing.name }}</text>
                  <view v-if="wing.top" class="reward-wing-member" :style="topMemberStyle">
                    <view class="reward-wing-member__body">
                      <text class="reward-wing-member__name">{{ wing.top.name }}</text>
                      <view class="reward-wing-member__facts">
                        <VBadge v-if="!visibility.hidden" class="reward-wing-member__rank" :v="wing.top.vRank" size="sm" :show-title="false" />
                        <text v-else class="reward-wing-member__rank">{{ visibility.mask('') }}</text>
                        <text class="reward-wing-member__points tabular-nums">{{ visibility.mask(formatComputePoints(wing.top.monthComputePoints, locale.code)) }}</text>
                      </view>
                    </view>
                  </view>
                  <text v-else class="binary-note">—</text>
                </view>
              </view>
            </view>

            <view v-if="recentBinaries.length > 0" class="binary-recent" :style="recentBlockStyle">
              <text class="binary-section-title" :style="recentCapStyle">{{ t.binary.recentMatches }}</text>
              <view :style="recentGroupStyle">
                <view v-for="(e, i) in recentBinaries" :key="e.id" class="binary-recent-row" :style="recentRowStyle(i === recentBinaries.length - 1)">
                  <view class="binary-recent-source"><text class="binary-record-name">{{ e.sourceUserName }}</text><text class="binary-note">{{ formatTrialDate(e.ts, dateLocale()) }}</text></view>
                  <view class="reward-match-amount"><text class="binary-record-value tabular-nums" :style="{ color: binaryAmountColor(e.status) }">{{ visibility.mask(binaryAmountLabel(e)) }}</text><text v-if="binaryStatusLabel(e.status)" class="binary-note">{{ binaryStatusLabel(e.status) }}</text></view>
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
import { vizStagger } from "@/composables/use-scroll-grow-progress";
import { useDataVisibility } from "@/store/data-visibility";
import { formatFinanceAmount } from "@/lib/finance-amount-display";
import { formatComputePoints } from "@/i18n/compute-points";
import { useLocaleStore } from "@/store/locale";
import { computed, onMounted, ref, watch, type CSSProperties } from "vue";
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
import { apiRuntimeConfig, remoteApiEnabled, sessionVault } from "@/api/runtime";
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
const visibility = useDataVisibility();
const network = useNetwork();
const commission = useCommission();
const phase = useProductPhase();
const auth = useAuth();
const app = useApp();
const locale = useLocaleStore();
const canonicalReadCoalescer = createScopedReadCoalescer();
const binaryCopy = computed(() => ({
  zh: { rules: '玩法说明', contributions: '本月两组订单额', leadingMembers: '各组领先成员' },
  en: { rules: 'How it works', contributions: 'This month’s group volume', leadingMembers: 'Top members by group' },
  vi: { rules: 'Cách nhận thưởng', contributions: 'Doanh số hai nhóm tháng này', leadingMembers: 'Thành viên dẫn đầu mỗi nhóm' },
})[locale.code === 'zh' ? 'zh' : locale.code === 'vi' ? 'vi' : 'en']);

const displayEnvironment = [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const;
let environmentInvalidated = false;
watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => { environmentInvalidated = true; }, { flush: 'sync' });
const displayEnvironmentCurrent = () => !environmentInvalidated && displayEnvironment[0] === apiRuntimeConfig.environment && displayEnvironment[1] === apiRuntimeConfig.baseUrl;
const snapshotPresentation = ref<NonNullable<typeof commission.binarySnapshot> | null>(null);
let rejectedsnapshotSource: NonNullable<typeof commission.binarySnapshot> | null = null;
watch(() => [commission.binaryStatus, commission.binarySnapshot] as const, ([status, value]) => {
  if (status === 'error') { snapshotPresentation.value = null; rejectedsnapshotSource = value; }
  else if (status === 'ready' && auth.isAuthenticated && displayEnvironmentCurrent() && value && value !== rejectedsnapshotSource) snapshotPresentation.value = value;
}, { immediate: true, flush: 'sync' });
watch(() => [app.accountKey, app.accountBindingEpoch, auth.isAuthenticated, locale.code, apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => {
  rejectedsnapshotSource = commission.binarySnapshot; snapshotPresentation.value = null;
  if (auth.isAuthenticated && displayEnvironmentCurrent()) void retryCanonicalData();
}, { flush: 'sync' });
const snapshot = computed(() => commission.binaryStatus === 'error' ? null : snapshotPresentation.value);
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
const memberDetailsReadable = computed(() => pageState.value.memberDetails === 'ready'
  || (pageState.value.memberDetails === 'loading' && network.hasRemoteSnapshot));
const remoteTrackA = computed(() => snapshot.value?.trackA ?? 0);
const remoteTrackB = computed(() => snapshot.value?.trackB ?? 0);
const settlePeriod = computed(() => remoteApiEnabled ? snapshot.value?.settlePeriod ?? "monthly" : BINARY_SETTLE_PERIOD);
const settleDays = computed(() => SETTLE_PERIOD_DAYS[settlePeriod.value]);
const MIN_THRESHOLD = computed(() => remoteApiEnabled ? snapshot.value?.threshold ?? 0 : 1000);
const MATCH_RATE = computed(() => remoteApiEnabled ? snapshot.value?.matchRate ?? 0 : 0.1);
const DAILY_CAP = computed(() => remoteApiEnabled ? snapshot.value?.dailyCap ?? 0 : phase.value.binaryDailyCapUSD);
const sides = computed(() => network.byBinary());
const leftMonthVol = computed(() => remoteApiEnabled ? remoteTrackA.value : network.leftVolumeMonth());
const rightMonthVol = computed(() => remoteApiEnabled ? remoteTrackB.value : network.rightVolumeMonth());
// Visual scale uses the same raw group volume; it does not calculate rewards.
const contributionWidths = computed(() => {
  const maximum = Math.max(leftMonthVol.value, rightMonthVol.value);
  return maximum > 0 ? [leftMonthVol.value / maximum * 100, rightMonthVol.value / maximum * 100] : [0, 0];
});
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
  isWeak: boolean;
  color: string;
  top: NetworkMember | undefined;
}
const wings = computed<Wing[]>(() => [
  {
    key: "left",
    name: t.value.binary.leftWing,
    count: remoteApiEnabled && !memberDetailsReadable.value
      ? snapshot.value?.trackAMembers ?? 0 : sides.value.left.length,
    monthVol: leftMonthVol.value,
    isWeak: leftMonthVol.value !== rightMonthVol.value && weakSide.value === "left",
    color: "var(--v5-ink)",
    top: memberDetailsReadable.value ? topOf(sides.value.left) : undefined,
  },
  {
    key: "right",
    name: t.value.binary.rightWing,
    count: remoteApiEnabled && !memberDetailsReadable.value
      ? snapshot.value?.trackBMembers ?? 0 : sides.value.right.length,
    monthVol: rightMonthVol.value,
    isWeak: leftMonthVol.value !== rightMonthVol.value && weakSide.value === "right",
    color: "var(--v5-ink)",
    top: memberDetailsReadable.value ? topOf(sides.value.right) : undefined,
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
    vol: visibility.mask(formatFinanceAmount(weakVol.value)),
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
  return fmt(t.value.binary.monthVolMembers, { n: visibility.mask(n) });
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

const blockedStyle: CSSProperties = { padding: "16px 0", gap: "10px" };
function wingStyle(_isWeak: boolean): CSSProperties { return { padding: "14px 0" }; }
const topMemberStyle: CSSProperties = { marginTop: "8px" };
const memberReadErrorStyle: CSSProperties = { gap: "12px" };
const recentBlockStyle: CSSProperties = {};
const recentCapStyle: CSSProperties = { marginBottom: "12px" };
const recentGroupStyle: CSSProperties = { borderTop: "1px solid var(--v5-border)" };
function recentRowStyle(isLast: boolean): CSSProperties {
  return { padding: "16px 0", gap: "16px", borderBottom: isLast ? "none" : "1px solid var(--v5-border)" };
}
</script>

<style scoped>
.binary-content { display: flex; flex-direction: column; gap: 28px; padding: 12px 20px 24px; }
.binary-loading { height: 156px; border-radius: 20px; background: var(--v5-surface-2); }
.binary-hero { padding: 8px 20px 16px; border-radius: 28px; background: radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, var(--ui-device-ink) 9%, transparent), transparent 60%), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.binary-hero-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.binary-label { display: block; font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); color: var(--v5-ink-2); }
.binary-hero-heading > .binary-label { flex: 1; min-width: 0; }
.binary-rule-link { display: flex; align-items: center; justify-content: flex-end; min-width: 44px; min-height: 44px; color: var(--v5-ink-3); font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); flex: 0 0 auto; }
.binary-hero :deep(.reward-hero) { border: 0; padding: 0; }
.binary-hero :deep(.reward-hero__art) { --team-art-size: 64px; flex-basis: 64px; }
.binary-hero .reward-amount { margin: 0; font-size: 40px; line-height: 48px; font-weight: 550; }
.binary-section-title { display: block; font-size: var(--ui-type-section); line-height: var(--ui-type-section-lh); font-weight: 600; color: var(--v5-ink); }
.binary-note { display: block; color: var(--v5-ink-3); font-size: var(--ui-type-list-subtitle); line-height: 1.6; overflow-wrap: anywhere; }
.binary-notice { display: flex; align-items: flex-start; border-bottom: 1px solid var(--v5-border); margin-top: -12px; }
.binary-notice > svg { flex: 0 0 18px; color: var(--v5-warning); margin-top: 2px; }
.binary-notice-copy { min-width: 0; flex: 1; }
.binary-notice-title { display: block; font-weight: 500; font-size: var(--ui-type-list-title); line-height: var(--ui-type-list-title-lh); margin-bottom: 6px; }
.binary-text-action { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; min-width: 44px; color: var(--v5-ink-2); font-size: var(--ui-type-button); line-height: var(--ui-type-button-lh); }
.binary-comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-inline); margin-top: var(--ui-space-inline); padding: 20px var(--ui-space-inset) var(--ui-space-inset); border-radius: 28px; background: radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--ui-device-ink) 9%, transparent), transparent 60%), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.binary-contribution { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; text-align: center; }
.binary-group-heading { display: flex; flex-direction: column-reverse; align-items: center; justify-content: flex-start; gap: 8px; min-height: 56px; order: 0; font: 500 var(--ui-type-list-subtitle)/var(--ui-type-list-subtitle-lh) var(--font-v5); color: var(--v5-ink-2); }
.binary-weak { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 999px; background: color-mix(in srgb, var(--ui-device-ink) 16%, transparent); color: var(--ui-device-ink); font: 500 12px/16px var(--font-v5); }
.binary-points { display: block; order: 2; color: var(--v5-ink); font: 500 15px/20px var(--font-metric); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.binary-contribution-track { position: relative; order: 1; width: 64px; height: 150px; margin: 4px 0; border-radius: 18px; background: var(--v5-surface-3); box-shadow: inset 0 0 0 1px var(--v5-border); overflow: hidden; }
.binary-contribution-fill { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 18px; background: linear-gradient(180deg, var(--v5-brand), color-mix(in srgb, var(--v5-brand) 25%, transparent)); }
.binary-contribution-fill--other { background: linear-gradient(180deg, var(--ui-device-ink), color-mix(in srgb, var(--ui-device-ink) 25%, transparent)); }
.reward-binary-basis { display: flex; flex-direction: column; gap: 8px; padding-top: 18px; margin-top: 18px; border-top: 1px solid var(--v5-border); }
.binary-member-recovery { display: flex; align-items: center; justify-content: space-between; }
.binary-member-recovery > .binary-note { flex: 1; }
.binary-member-recovery > .binary-text-action { flex: none; font: 600 13px/20px var(--font-v5); }
.reward-wings { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 24px; margin-top: 12px; border-top: 1px solid var(--v5-border); }
.reward-wing { min-width: 0; }
.reward-wing-member__body { min-width: 0; }
.reward-wing-member__name { display: block; font-size: var(--ui-type-list-title); line-height: var(--ui-type-list-title-lh); font-weight: 500; overflow-wrap: anywhere; }
.reward-wing-member__facts { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; margin-top: 8px; min-width: 0; }
.reward-wing-member__rank { flex: none; }
.reward-wing-member__points { display: block; max-width: 100%; overflow-wrap: anywhere; color: var(--v5-ink-3); font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); }
.binary-recent-row { display: flex; align-items: flex-start; }
.binary-recent-source { min-width: 0; flex: 1; }
.binary-record-name { display: block; font-size: var(--ui-type-list-title); line-height: var(--ui-type-list-title-lh); overflow-wrap: anywhere; margin-bottom: 4px; }
.binary-record-value { font-size: var(--ui-type-list-title); line-height: var(--ui-type-list-title-lh); font-weight: 500; overflow-wrap: anywhere; }
.reward-match-amount { display: flex; flex-direction: column; align-items: flex-end; text-align: right; gap: 4px; max-width: 48%; }
[role="button"]:focus-visible, [role="link"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (max-width: 374px) { .binary-content { padding-inline: 16px; gap: 24px; } .binary-hero { padding-inline: 14px; } .binary-comparison, .reward-wings { gap: 16px; } }
.binary-contribution > .binary-note { order: 3; }
.reward-binary-basis { display: flex; flex-direction: column; gap: 4px; margin-top: var(--ui-space-inline); padding: var(--ui-space-inline) var(--ui-space-inset); border-radius: 18px; background: color-mix(in srgb, var(--ui-device-ink) 10%, transparent); }
.reward-wings { padding: 4px var(--ui-space-inset) var(--ui-space-inset); border-top: 0; border-radius: var(--ui-radius-surface); background: var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
</style>
