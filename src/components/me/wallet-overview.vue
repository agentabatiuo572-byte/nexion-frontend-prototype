<!-- Wallet detail information lives below the existing balance card in Me. -->
<template>
  <view v-if="props.section !== 'recovery' || hasReadRecovery" class="me-wallet-overview">
    <template v-if="props.section !== 'recovery'">
    <view class="nx-glass-card wallet-overview-card">
      <text class="wallet-section-title">{{ t.wallet.earningsSection }}</text>
      <view class="wallet-earnings">
        <view class="wallet-metric wallet-metric--today" data-wallet-metric="today">
          <text class="wallet-metric-label">{{ t.wallet.todayLabel }}</text>
          <text class="wallet-metric-amount tabular-nums" :style="amountStyle(todayEarningsText, 22, true)">{{ todayEarningsText }}</text>
        </view>
        <view class="wallet-metric" data-wallet-metric="all-time">
          <text class="wallet-metric-label">{{ t.wallet.allTimeEarnings }}</text>
          <text class="wallet-metric-amount tabular-nums" :style="amountStyle(visibility.mask(allTimeEarned === null ? '-' : `$${formatAmount(allTimeEarned)}`), 22, true)">{{ visibility.mask(allTimeEarned === null ? '-' : `$${formatAmount(allTimeEarned)}`) }}</text>
          <view class="wallet-metric-sub wallet-metric-breakdown" role="group" tabindex="0" :aria-label="allTimeSublabel">
            <view class="wallet-metric-breakdown__item" aria-hidden="true">
              <svg class="wallet-metric-breakdown__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3M10 10h4v4h-4z" /></svg>
              <text class="wallet-metric-breakdown__amount">{{ allTimeAmounts.c }}</text>
            </view>
            <view class="wallet-metric-breakdown__item" aria-hidden="true">
              <svg class="wallet-metric-breakdown__icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="4" /><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              <text class="wallet-metric-breakdown__amount">{{ allTimeAmounts.tm }}</text>
            </view>
          </view>
        </view>
        <view class="wallet-metric" data-wallet-metric="reviewing" role="button" tabindex="0" @click="showPendingSheet" @keydown.enter.prevent="showPendingSheet" @keydown.space.prevent="showPendingSheet">
          <text class="wallet-metric-label">{{ t.wallet.reviewingEarnings }}</text>
          <text class="wallet-metric-amount tabular-nums" :style="amountStyle(visibility.mask(bucketsReadable ? `$${formatAmount(pendingReview)}` : '—'), 22, true)">{{ visibility.mask(bucketsReadable ? `$${formatAmount(pendingReview)}` : "—") }}</text>
          <text class="wallet-metric-sub wallet-metric-sub--release">{{ t.wallet.reviewingEarningsSub }}</text>
        </view>
        <view class="wallet-metric" data-wallet-metric="locked" role="button" tabindex="0" @click="showLockedSheet" @keydown.enter.prevent="showLockedSheet" @keydown.space.prevent="showLockedSheet">
          <text class="wallet-metric-label">{{ t.wallet.lockedRewards }}</text>
          <text class="wallet-metric-amount tabular-nums" :style="amountStyle(visibility.mask(bucketsReadable ? `$${formatAmount(lockedRewards)}` : '—'), 22, true)">{{ visibility.mask(bucketsReadable ? `$${formatAmount(lockedRewards)}` : "—") }}</text>
          <text class="wallet-metric-sub wallet-metric-sub--release">{{ t.wallet.lockedRewardsSub }}</text>
        </view>
      </view>

    </view>
    </template>
    <template v-if="props.section !== 'summary'">
      <!-- SPEC-7 FEAT-RISK02 异常3: 配置同步失败 → 结算暂停提示(不回退写死默认) -->
      <view v-if="configSyncFailed" class="wallet-recovery">
        <text class="block wallet-recovery-title">{{ t.wallet.syncFailedTitle }}</text>
        <text class="block wallet-recovery-body">{{ t.wallet.syncFailedBody }}</text>
      </view>
      <view v-if="fundsAuthorityUnavailable" class="wallet-recovery">
        <text class="block wallet-recovery-title">{{ t.wallet.fundsUnavailableTitle }}</text>
        <text class="block wallet-recovery-body">{{ app.remoteFleetHasSnapshot ? t.wallet.fundsStaleBody : app.remoteWalletReceiptHasSnapshot ? t.wallet.fundsReceiptOnlyBody : t.wallet.fundsUnavailableBody }}</text>
        <view role="button" tabindex="0" :aria-label="t.ui.retry" class="nx-card-recovery-action active:opacity-70" @click="retryFundsAuthority" @keydown.enter.prevent="retryFundsAuthority" @keydown.space.prevent="retryFundsAuthority">
          <text>{{ t.ui.retry }}</text>
        </view>
      </view>
      <view v-if="releaseAuthorityUnavailable" class="wallet-recovery">
        <text class="block wallet-recovery-body">{{ t.wallet.releaseDetailsUnavailable }}</text>
        <view role="button" tabindex="0" :aria-label="t.ui.retry" class="nx-card-recovery-action active:opacity-70" @click="retryReleaseAuthority" @keydown.enter.prevent="retryReleaseAuthority" @keydown.space.prevent="retryReleaseAuthority">
          <text>{{ t.ui.retry }}</text>
        </view>
      </view>
      <view v-if="earningsRecoveryVisible" class="wallet-recovery">
        <text class="block wallet-recovery-body">{{ t.wallet.earningsUnavailable }}</text>
        <view role="button" tabindex="0" :aria-label="t.ui.retry" class="nx-card-recovery-action active:opacity-70" @click="retryEarningsAuthority" @keydown.enter.prevent="retryEarningsAuthority" @keydown.space.prevent="retryEarningsAuthority">
          <text>{{ t.ui.retry }}</text>
        </view>
      </view>

    <view v-if="remoteApiEnabled && app.remoteWithdrawalListStatus === 'error'" class="wallet-recovery">
      <text class="block wallet-recovery-title">{{ t.wallet.withdrawalStatusSubtitle }}</text>
      <text class="block wallet-recovery-body">{{ t.empty.errorDesc }}</text>
      <view class="nx-card-recovery-action active:opacity-70" role="button" tabindex="0" :aria-label="t.ui.retry" @click="app.refreshRemoteWithdrawalList()" @keydown.enter.prevent="app.refreshRemoteWithdrawalList()" @keydown.space.prevent="app.refreshRemoteWithdrawalList()"><text>{{ t.ui.retry }}</text></view>
    </view>
    </template>
  </view>
</template>
<script setup lang="ts">
import { invalidatePassiveTabRead } from "@/lib/passive-tab-read";
import { formatFinanceAmount as formatAmount } from "@/lib/finance-amount-display";
import { useDataVisibility } from "@/store/data-visibility";
import { computed, ref, watch, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { earningsReleaseSnapshot, earningsReleaseHasSnapshot, earningsReleaseStatus, refreshEarningsReleaseStatus, type LedgerRoute } from "@/store/earning-release";
import { useCommission } from "@/store/commission";
import { useConfig } from "@/store/config";
import { confirm as uiConfirm } from "@/store/ui";
import { remoteApiEnabled } from "@/api/runtime";
import { resolveWalletTodayEarnings } from "@/lib/wallet-today-earnings";

const props = withDefaults(defineProps<{ section?: 'all' | 'summary' | 'recovery' }>(), { section: 'all' });
const t = useT();
const visibility = useDataVisibility();
const app = useApp();
const commission = useCommission();
const cfg = useConfig();
const configSyncFailed = computed(() => cfg.syncFailed);
const fundsAuthorityUnavailable = computed(() => remoteApiEnabled && app.remoteFleetStatus === "error");
const releaseAuthorityUnavailable = computed(() => remoteApiEnabled && earningsReleaseStatus.value === "error");
const earningsReadPending = computed(() => app.homeTruthStatus === "idle" || app.homeTruthStatus === "loading"
  || commission.eventsStatus === "idle" || commission.eventsStatus === "loading");
const homeEarningsReadFailed = ref(false);
watch(() => [app.homeTruthStatus, app.homeTruth] as const, ([status, snapshot]) => {
  if (status === "error") homeEarningsReadFailed.value = true;
  else if (status === "ready" || (status === "idle" && !snapshot)) homeEarningsReadFailed.value = false;
}, { immediate: true, flush: "sync" });
const earningsRecoveryVisible = computed(() => remoteApiEnabled && (homeEarningsReadFailed.value || commission.eventsReadFailed
  || app.homeTruthStatus === "error" || commission.eventsStatus === "error"
  || (!earningsReadPending.value && allTimeEarned.value === null)));
const bucketsReadable = computed(() => !remoteApiEnabled || (earningsReleaseHasSnapshot.value
  && earningsReleaseSnapshot.value?.serverCanonical === true
  && (earningsReleaseStatus.value === "ready" || earningsReleaseStatus.value === "loading")));

function retryFundsAuthority() {
  invalidatePassiveTabRead("remote-fleet");
  void app.refreshRemoteFleet();
}
function retryReleaseAuthority() {
  invalidatePassiveTabRead("earning-release");
  if (earningsReleaseStatus.value === "loading") return;
  void refreshEarningsReleaseStatus().catch(() => undefined);
}
function retryEarningsAuthority() {
  if (app.homeTruthStatus !== "loading") void app.refreshHomeTruth().catch(() => undefined);
  if (commission.eventsStatus !== "loading") void commission.refreshCanonicalEvents().catch(() => undefined);
}

// Release explanations use the same account-scoped server receipt as the
// buckets. Local device clustering and configuration defaults are not facts
// about the user's held funds or their release eligibility.
function releaseSheetMessage(route: LedgerRoute): string {
  const snapshot = earningsReleaseSnapshot.value;
  if (earningsReleaseStatus.value !== "ready" || !snapshot?.serverCanonical) {
    return t.value.wallet.releaseDetailsUnavailable;
  }
  if (snapshot.buckets[route] === 0) {
    return route === "pending_review" ? t.value.wallet.pendingSheetEmpty : t.value.wallet.lockedSheetEmpty;
  }
  const body = route === "pending_review" ? t.value.wallet.pendingSheetBody : t.value.wallet.lockedSheetBody;
  if (snapshot.releaseMode !== "attest_or_manual" || snapshot.clusterRestricted
    || snapshot.requiredAttestationSeconds <= 0) return body;
  return body + "\n" + fmt(t.value.wallet.releaseAttestationInfo, {
    hours: Math.ceil(snapshot.requiredAttestationSeconds / 3600 * 100) / 100,
  });
}
function showPendingSheet() {
  uiConfirm({
    title: t.value.wallet.pendingSheetTitle,
    message: releaseSheetMessage("pending_review"),
    confirmLabel: t.value.wallet.sheetOk,
    hideCancel: true,
    icon: "info",
  });
}
function showLockedSheet() {
  uiConfirm({
    title: t.value.wallet.lockedSheetTitle,
    message: releaseSheetMessage("bonus_locked"),
    confirmLabel: t.value.wallet.sheetOk,
    hideCancel: true,
    icon: "info",
  });
}

const buckets = computed(() => ({
  pendingReviewUsdt: earningsReleaseSnapshot.value?.buckets.pending_review
    ?? app.user.earningBuckets.pendingReviewUsdt,
  bonusLockedUsdt: earningsReleaseSnapshot.value?.buckets.bonus_locked
    ?? app.user.earningBuckets.bonusLockedUsdt,
}));
const todayEarnings = computed(() => resolveWalletTodayEarnings({
  remoteApiEnabled,
  homeTruthStatus: app.homeTruthStatus,
  homeTodayUsdt: app.homeTruth?.earnings.today.usdt ?? null,
  localTodayUsdt: app.earnings.today,
}));
const todayEarningsText = computed(() => visibility.mask(todayEarnings.value === null ? "—" : `+$${formatAmount(todayEarnings.value)}`));
const pendingReview = computed(() => buckets.value.pendingReviewUsdt);
const lockedRewards = computed(() => buckets.value.bonusLockedUsdt);
const miningLifetimeUSD = computed(() => !remoteApiEnabled ? app.earnings.total
  : app.homeTruthStatus === "ready" || app.homeTruthStatus === "loading"
    || (app.homeTruthStatus === "error" && app.homeTruthTransientFailure) ? app.homeTruth?.earnings.all.usdt ?? null : null);
const teamLifetimeUSD = computed(() => !remoteApiEnabled ? commission.totalUSDTLifetime()
  : commission.eventsStatus === "ready" ? commission.eventsEvidence?.aggregate.totalUSDT ?? null
  : commission.eventsStatus === "idle" || commission.eventsStatus === "loading"
    || (commission.eventsStatus === "error" && commission.eventsTransientFailure)
      ? commission.eventsLifetimeDisplayUSDT ?? (commission.eventsStatus === "loading" ? commission.eventsEvidence?.aggregate.totalUSDT : null) ?? null : null);
const allTimeEarned = computed(() => miningLifetimeUSD.value === null || teamLifetimeUSD.value === null
  ? null : miningLifetimeUSD.value + teamLifetimeUSD.value);
const hasReadRecovery = computed(() => configSyncFailed.value || fundsAuthorityUnavailable.value || releaseAuthorityUnavailable.value
  || earningsRecoveryVisible.value
  || (remoteApiEnabled && app.remoteWithdrawalListStatus === "error"));
const allTimeAmounts = computed(() => ({
  c: visibility.mask(miningLifetimeUSD.value === null ? "-" : `$${formatAmount(miningLifetimeUSD.value)}`),
  tm: visibility.mask(teamLifetimeUSD.value === null ? "-" : `$${formatAmount(teamLifetimeUSD.value)}`),
}));
const allTimeSublabel = computed(() => fmt(t.value.wallet.allTimeSublabel, allTimeAmounts.value));
// Amounts keep their full precision and shrink only when their formatted text needs it.
function amountStyle(value: string, size: number, half = false): CSSProperties {
  return { fontSize: `min(${size}px, calc((100vw - ${half ? 128 : 76}px) / ${value.length * (half ? 1.2 : 0.6)}))` };
}
</script>
<style scoped>
.me-wallet-overview { color: var(--v5-ink); font-family: var(--font-v5); }
.wallet-overview-card { padding: var(--v5-space-4); border-radius: var(--v5-radius-l); }
.wallet-section-title { display: block; margin-bottom: var(--v5-space-3); font-size: var(--ui-type-section); font-weight: 500; }
.wallet-earnings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--v5-space-3); }
.wallet-metric { min-width: 0; }
.wallet-metric:nth-child(n+3) { padding-top: var(--v5-space-3); border-top: 1px solid var(--v5-border); }
.wallet-metric-label { display: block; color: var(--v5-ink-3); font-size: var(--v5-type-caption); line-height: 1.5; }
.wallet-metric-amount { font-family: var(--font-metric); display: block; min-height: 26.4px; margin-top: var(--v5-space-1); font-weight: 500; line-height: 1.2; letter-spacing: -.025em; white-space: nowrap; }
.wallet-metric--today .wallet-metric-amount { color: var(--v5-brand); }
.wallet-metric-sub { display: block; margin-top: var(--v5-space-1); font-size: var(--v5-type-caption); color: var(--v5-ink-3); line-height: 1.5; overflow-wrap: anywhere; }
.wallet-metric-sub--release { font-size: 10px; line-height: 1.4; }
.wallet-metric-breakdown { display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; max-width: 100%; min-height: 16px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scrollbar-width: none; }
.wallet-metric-breakdown::-webkit-scrollbar { display: none; }
.wallet-metric-breakdown:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; border-radius: var(--v5-radius-s); }
.wallet-metric-breakdown__item { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 3px; font-size: 10px; line-height: 1.4; white-space: nowrap; font-variant-numeric: tabular-nums; }
.wallet-metric-breakdown__icon { flex: 0 0 12px; }
.wallet-recovery { padding: var(--v5-space-3); margin-bottom: var(--v5-space-3); border-radius: var(--v5-radius-m); background: var(--v5-warning-soft); }
.wallet-recovery-title { font-size: var(--v5-type-caption); color: var(--v5-warning); font-weight: 500; }
.wallet-recovery-body { font-size: var(--v5-type-caption); color: var(--v5-ink-3); line-height: 1.5; overflow-wrap: anywhere; }
[role="button"] { cursor: pointer; }
[role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; border-radius: var(--v5-radius-s); }
</style>
