<!-- Wallet detail information lives below the existing balance card in Me. -->
<template>
  <view class="me-wallet-overview">
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
      <view v-if="remoteApiEnabled && !earningsReadPending && allTimeEarned === null" class="wallet-recovery">
        <text class="block wallet-recovery-body">{{ t.wallet.earningsUnavailable }}</text>
        <view role="button" tabindex="0" :aria-label="t.ui.retry" class="nx-card-recovery-action active:opacity-70" @click="retryEarningsAuthority" @keydown.enter.prevent="retryEarningsAuthority" @keydown.space.prevent="retryEarningsAuthority">
          <text>{{ t.ui.retry }}</text>
        </view>
      </view>

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
          <text class="wallet-metric-sub">{{ allTimeSublabel }}</text>
        </view>
        <view class="wallet-metric" data-wallet-metric="reviewing" role="button" tabindex="0" @click="showPendingSheet" @keydown.enter.prevent="showPendingSheet" @keydown.space.prevent="showPendingSheet">
          <text class="wallet-metric-label">{{ t.wallet.reviewingEarnings }}</text>
          <text class="wallet-metric-amount tabular-nums" :style="amountStyle(visibility.mask(bucketsReadable ? `$${formatAmount(pendingReview)}` : '—'), 22, true)">{{ visibility.mask(bucketsReadable ? `$${formatAmount(pendingReview)}` : "—") }}</text>
          <text class="wallet-metric-sub">{{ t.wallet.reviewingEarningsSub }}</text>
        </view>
        <view class="wallet-metric" data-wallet-metric="locked" role="button" tabindex="0" @click="showLockedSheet" @keydown.enter.prevent="showLockedSheet" @keydown.space.prevent="showLockedSheet">
          <text class="wallet-metric-label">{{ t.wallet.lockedRewards }}</text>
          <text class="wallet-metric-amount tabular-nums" :style="amountStyle(visibility.mask(bucketsReadable ? `$${formatAmount(lockedRewards)}` : '—'), 22, true)">{{ visibility.mask(bucketsReadable ? `$${formatAmount(lockedRewards)}` : "—") }}</text>
          <text class="wallet-metric-sub">{{ t.wallet.lockedRewardsSub }}</text>
        </view>
      </view>

    </view>
    <view v-if="remoteApiEnabled && app.remoteWithdrawalListStatus === 'error'" class="wallet-recovery">
      <text class="block wallet-recovery-title">{{ t.wallet.withdrawalStatusSubtitle }}</text>
      <text class="block wallet-recovery-body">{{ t.empty.errorDesc }}</text>
      <view class="nx-card-recovery-action active:opacity-70" role="button" tabindex="0" :aria-label="t.ui.retry" @click="app.refreshRemoteWithdrawalList()" @keydown.enter.prevent="app.refreshRemoteWithdrawalList()" @keydown.space.prevent="app.refreshRemoteWithdrawalList()"><text>{{ t.ui.retry }}</text></view>
    </view>
        <view v-if="showWithdrawal" class="wallet-activity-row wallet-withdrawal-activity" role="link" tabindex="0" @click="navTo('/pages/me/wallet-withdraw-tracking')" @keydown.enter.prevent="navTo('/pages/me/wallet-withdraw-tracking')">
          <view class="wallet-row-icon"><svg class="wallet-activity-icon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v14m-6-8 6-6 6 6M19 21H5" /></svg></view>
          <view class="wallet-activity-copy"><text class="wallet-activity-label">{{ withdrawalRowLabel }}</text><text class="wallet-activity-sub">{{ withdrawalRowSub }}</text><text class="wallet-withdrawal-amount tabular-nums">{{ visibility.mask(`-$${formatAmount(latestWithdrawal!.amount)}`) }}</text></view>
          <svg class="wallet-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </view>
  </view>
</template>
<script setup lang="ts">
import { invalidatePassiveTabRead } from "@/lib/passive-tab-read";
import { formatFinanceAmount as formatAmount } from "@/lib/finance-amount-display";
import { useDataVisibility } from "@/store/data-visibility";
import { navTo } from "@/lib/route";
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt, dateLocale } from "@/i18n/format";
import { formatDisplayDateTime } from "@/lib/display-date";
import { useApp } from "@/store/app";
import { earningsReleaseSnapshot, earningsReleaseHasSnapshot, earningsReleaseStatus, refreshEarningsReleaseStatus, type LedgerRoute } from "@/store/earning-release";
import { useCommission } from "@/store/commission";
import { useConfig } from "@/store/config";
import { confirm as uiConfirm } from "@/store/ui";
import type { WithdrawalStatus } from "@/store/types";
import { remoteApiEnabled } from "@/api/runtime";
import { resolveWalletTodayEarnings } from "@/lib/wallet-today-earnings";

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
  : app.homeTruthStatus === "ready" || app.homeTruthStatus === "loading" ? app.homeTruth?.earnings.all.usdt ?? null : null);
const teamLifetimeUSD = computed(() => !remoteApiEnabled ? commission.totalUSDTLifetime()
  : commission.eventsStatus === "ready" || commission.eventsStatus === "loading" ? commission.eventsEvidence?.aggregate.totalUSDT ?? null : null);
const allTimeEarned = computed(() => miningLifetimeUSD.value === null || teamLifetimeUSD.value === null
  ? null : miningLifetimeUSD.value + teamLifetimeUSD.value);
const allTimeSublabel = computed(() =>
  fmt(t.value.wallet.allTimeSublabel, {
    c: visibility.mask(miningLifetimeUSD.value === null ? "-" : `$${formatAmount(miningLifetimeUSD.value)}`),
    tm: visibility.mask(teamLifetimeUSD.value === null ? "-" : `$${formatAmount(teamLifetimeUSD.value)}`),
  }),
);
// 🔴 用**主单**(优先最早的在途单)而不是「最新一笔」:一张在途 + 一张更新的已到账时,
// 问「最新一笔」会拿到已到账那张 → 入口整行消失,在审核的那笔钱用户再也看不到。
const latestWithdrawal = computed(() => app.primaryWithdrawal);
const showWithdrawal = computed(
  () => !!latestWithdrawal.value && latestWithdrawal.value.status !== "confirmed",
);
const withdrawalRowLabel = computed(() =>
  latestWithdrawal.value ? fmt(t.value.wallet.withdrawalRow, { network: latestWithdrawal.value.network }) : "",
);
const withdrawalRowSub = computed(() => {
  const w = latestWithdrawal.value;
  if (!w) return "";
  return `${statusLabel(w.status, w.network)} · ${fmtTime(remoteApiEnabled ? w.displaySubmittedAt : w.submittedAt, w.network)}`;
});

function statusLabel(s: WithdrawalStatus, network: string): string {
  const labels: Record<WithdrawalStatus, string> = {
    submitted: t.value.wallet.submitted,
    "review-pending": t.value.wallet.reviewPending,
    "review-passed": t.value.wallet.reviewPassed,
    processing: t.value.wallet.processing,
    sent: network === "BANK-VND" ? t.value.bankWithdrawal.processing : t.value.wallet.sent,
    confirmed: t.value.wallet.confirmed,
    "review-rejected": t.value.wallet.reviewRejected,
    frozen: t.value.wallet.statusFrozen,
    "address-invalid": t.value.wallet.statusAddressInvalid,
    "tx-failed": t.value.wallet.statusTxFailed,
    refunded: t.value.wallet.statusRefunded,
  };
  return labels[s];
}
function fmtTime(ts: number | null | undefined, network: string): string {
  const bank = network === "BANK-VND";
  const date = formatDisplayDateTime(ts, dateLocale(), false, bank ? 7 * 60 : undefined);
  return bank && date !== "—" ? `${date} UTC+7` : date;
}

// Amounts keep their full precision and shrink only when their formatted text needs it.
function amountStyle(value: string, size: number, half = false): CSSProperties {
  return { fontSize: `min(${size}px, calc((100vw - ${half ? 128 : 76}px) / ${value.length * (half ? 1.2 : 0.6)}))` };
}
</script>
<style scoped>
.me-wallet-overview { color: var(--v5-ink); font-family: var(--font-v5); }
.wallet-overview-card { padding: var(--v5-space-4); border-radius: var(--v5-radius-l); }
.wallet-section-title { display: block; margin-bottom: var(--v5-space-3); font-size: var(--v5-type-body-m); font-weight: 500; }
.wallet-earnings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--v5-space-3); }
.wallet-metric { min-width: 0; }
.wallet-metric:nth-child(n+3) { padding-top: var(--v5-space-3); border-top: 1px solid var(--v5-border); }
.wallet-metric-label { display: block; color: var(--v5-ink-3); font-size: var(--v5-type-caption); line-height: 1.5; }
.wallet-metric-amount { display: block; margin-top: var(--v5-space-1); font-weight: 500; line-height: 1.2; letter-spacing: -.025em; white-space: nowrap; }
.wallet-metric--today .wallet-metric-amount { color: var(--v5-brand); }
.wallet-metric-sub { display: block; margin-top: var(--v5-space-1); font-size: var(--v5-type-caption); color: var(--v5-ink-3); line-height: 1.5; overflow-wrap: anywhere; }
.wallet-activity-row { display: flex; gap: var(--v5-space-3); align-items: center; padding: var(--v5-space-3) var(--v5-space-4); margin-top: var(--v5-space-3); border-radius: var(--v5-radius-l); background: var(--v5-surface); }
.wallet-row-icon { flex-shrink: 0; color: var(--v5-warning); }
.wallet-activity-copy { flex: 1; min-width: 0; }
.wallet-activity-label, .wallet-withdrawal-amount { display: block; font-size: var(--v5-type-body-m); }
.wallet-activity-sub { display: block; color: var(--v5-ink-3); font-size: var(--v5-type-caption); line-height: 1.5; overflow-wrap: anywhere; }
.wallet-withdrawal-amount { margin-top: var(--v5-space-1); color: var(--v5-danger); }
.wallet-chevron { flex-shrink: 0; color: var(--v5-ink-3); }
.wallet-recovery { padding: var(--v5-space-3); margin-bottom: var(--v5-space-3); border-radius: var(--v5-radius-m); background: var(--v5-warning-soft); }
.wallet-recovery-title { font-size: var(--v5-type-caption); color: var(--v5-warning); font-weight: 500; }
.wallet-recovery-body { font-size: var(--v5-type-caption); color: var(--v5-ink-3); line-height: 1.5; overflow-wrap: anywhere; }
[role="button"], [role="link"] { cursor: pointer; }
[role="button"]:focus-visible, [role="link"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; border-radius: var(--v5-radius-s); }
</style>
