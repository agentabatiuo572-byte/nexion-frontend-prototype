<!--
  Wallet — ported from Nexion-prototype/app/(main)/me/wallet/page.tsx.
  iOS-Wallet pattern, top→bottom: balance hero (USDT 48px + NEX link + 3 quick
  actions) → Earnings list (Today / Pending / All-time) → Activity list (Daily
  check-in / Transaction history / Bank cards / conditional in-flight withdrawal).

  Reads useApp (user/earnings/latestWithdrawal) + useCommission (team lifetime).
  IOSList/IOSListItem (source components) are inlined as a local list primitive.
  Wrapped in <AppChassis active="me">. Header is the shared sticky <SubPageHeader>
  (back=/me → route title headerTitles.meWallet, mirroring the prototype's
  <SetPageHeader backHref="/me"/> whose chassis Header resolves the route title).
  The "Bank cards" count is a static placeholder (cards store not ported — see
  PORT report §7).
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)">
      <SubPageHeader back="/me" :title="t.headerTitles.meWallet" :subtitle="t.headerSubtitles.meWallet" />

      <!-- Balance hero — de-carded: balance + actions sit on the page floor. -->
      <view :style="heroStyle">
        <text class="block" :style="heroLabelStyle">{{ t.wallet.usdtBalance }}</text>
        <text class="block tabular-nums" :style="heroNumStyle">{{ usdtBalanceReadable ? `$${usdt.toFixed(2)}` : "—" }}</text>
        <view v-if="fundsReadable" class="inline-flex items-center active:opacity-70 transition-opacity" style="margin-top: 8px; gap: 6px" role="button" tabindex="0" :aria-label="t.wallet.nexBalance" @click="goNex">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" /></svg>
          <text style="font-size: 13px; color: var(--v5-ink-3)">{{ nexLabel }} NEX</text>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </view>

        <view v-if="fundsReadable" class="grid grid-cols-3" style="margin-top: 20px; gap: 8px">
          <view class="flex flex-col items-center active:opacity-60" style="gap: 6px" role="button" tabindex="0" :aria-label="t.wallet.topUp" @click="goTopup">
            <view class="grid place-items-center" :style="actionIconStyle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17V3" /><path d="m6 11 6 6 6-6" /><path d="M19 21H5" /></svg>
            </view>
            <text :style="actionLabelStyle">{{ t.wallet.topUp }}</text>
          </view>
          <view class="flex flex-col items-center active:opacity-60" style="gap: 6px" role="button" tabindex="0" :aria-label="t.wallet.withdraw" @click="goWithdraw">
            <view class="grid place-items-center" :style="actionIconStyle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v14" /><path d="m6 9 6-6 6 6" /><path d="M19 21H5" /></svg>
            </view>
            <text :style="actionLabelStyle">{{ t.wallet.withdraw }}</text>
          </view>
          <view class="flex flex-col items-center active:opacity-60" style="gap: 6px" role="button" tabindex="0" :aria-label="t.wallet.exchange" @click="goExchange">
            <view class="grid place-items-center" :style="actionIconStyle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
            </view>
            <text :style="actionLabelStyle">{{ t.wallet.exchange }}</text>
          </view>
        </view>
      </view>

      <!-- SPEC-7 FEAT-RISK02 异常3: 配置同步失败 → 结算暂停提示(不回退写死默认) -->
      <view v-if="configSyncFailed" :style="syncFailBoxStyle">
        <text class="block" :style="syncFailTitleStyle">{{ t.wallet.syncFailedTitle }}</text>
        <text class="block" :style="syncFailBodyStyle">{{ t.wallet.syncFailedBody }}</text>
      </view>
      <view v-if="fundsAuthorityUnavailable" :style="syncFailBoxStyle">
        <text class="block" :style="syncFailTitleStyle">{{ t.wallet.fundsUnavailableTitle }}</text>
        <text class="block" :style="syncFailBodyStyle">{{ app.remoteFleetHasSnapshot ? t.wallet.fundsStaleBody : app.remoteWalletReceiptHasSnapshot ? t.wallet.fundsReceiptOnlyBody : t.wallet.fundsUnavailableBody }}</text>
        <view role="button" tabindex="0" :aria-label="t.wallet.retryFunds" :style="retryFundsStyle" @click="retryFundsAuthority">
          <text>{{ t.wallet.retryFunds }}</text>
        </view>
      </view>

      <!-- Earnings list -->
      <text v-if="fundsReadable" class="block" :style="listTitleStyle">{{ t.wallet.earningsSection }}</text>
      <view v-if="fundsReadable" :style="listCardStyle">
        <WalletListRow icon-bg="var(--v5-success-soft)" :first="true" :label="t.wallet.todayLabel">
          <template #icon><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg></template>
          <template #value><text class="tabular-nums" style="font-family: var(--font-v5); font-size: 15px; color: var(--v5-brand)">{{ todayEarningsText }}</text></template>
        </WalletListRow>
        <WalletListRow icon-bg="var(--v5-warning-soft)" :label="t.wallet.reviewingEarnings" :sublabel="t.wallet.reviewingEarningsSub" @click="showPendingSheet">
          <template #icon><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14" /><path d="M5 2h14" /><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" /><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" /></svg></template>
          <template #value><text class="tabular-nums" style="font-family: var(--font-v5); font-size: 15px; color: var(--v5-ink)">${{ pendingReview.toFixed(2) }}</text></template>
        </WalletListRow>
        <WalletListRow icon-bg="var(--v5-brand-2-soft)" :label="t.wallet.lockedRewards" :sublabel="t.wallet.lockedRewardsSub" @click="showLockedSheet">
          <template #icon><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></template>
          <template #value><text class="tabular-nums" style="font-family: var(--font-v5); font-size: 15px; color: var(--v5-ink)">${{ lockedRewards.toFixed(2) }}</text></template>
        </WalletListRow>
        <WalletListRow icon-bg="var(--v5-tech-cyan-soft)" :label="t.wallet.allTimeEarnings" :sublabel="allTimeSublabel">
          <template #icon><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" /><path d="M3 10h18" /></svg></template>
          <template #value><text class="tabular-nums" style="font-family: var(--font-v5); font-size: 15px; color: var(--v5-ink)">${{ allTimeEarned.toFixed(2) }}</text></template>
        </WalletListRow>
      </view>

      <!-- Activity list -->
      <WalletListRow icon-bg="var(--v5-brand-2-soft)" :label="t.repurchase.ordersTitle" chevron href="/pages/me/wallet-repurchase" />
      <text class="block" :style="listTitleStyle">{{ t.wallet.activitySection }}</text>
      <view :style="listCardStyle">
        <WalletListRow icon-bg="var(--v5-brand-2-soft)" :first="true" :label="t.wallet.dailyCheckin" :sublabel="t.wallet.dailyCheckinSub" chevron href="/pages/daily/daily">
          <template #icon><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg></template>
        </WalletListRow>
        <WalletListRow icon-bg="color-mix(in srgb, var(--v5-tech-cyan) 22%, transparent)" :label="t.wallet.transactionHistory" :sublabel="t.wallet.allCreditsDebits" chevron href="/pages/me/wallet-bills">
          <template #icon><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 17.5v-11" /></svg></template>
        </WalletListRow>
        <WalletListRow icon-bg="var(--v5-warning-soft)" :label="t.cards.listTitle" :sublabel="cardsSub" chevron href="/pages/me/wallet-cards">
          <template #icon><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></svg></template>
        </WalletListRow>
        <WalletListRow v-if="showWithdrawal" icon-bg="color-mix(in srgb, var(--v5-warning) 22%, transparent)" :label="withdrawalRowLabel" :sublabel="withdrawalRowSub" chevron href="/pages/me/wallet-withdraw-tracking">
          <template #icon><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v14" /><path d="m6 9 6-6 6 6" /><path d="M19 21H5" /></svg></template>
          <template #value><text class="tabular-nums" style="font-family: var(--font-v5); font-size: 15px; color: var(--v5-danger)">-${{ latestWithdrawal!.amount.toFixed(2) }}</text></template>
        </WalletListRow>
      </view>

    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import WalletListRow from "@/components/me/wallet-list-row.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { earningsReleaseSnapshot, earningsReleaseStatus, refreshEarningsReleaseStatus, type LedgerRoute } from "@/store/earning-release";
import { useCommission } from "@/store/commission";
import { useCards } from "@/store/cards";
import { useConfig } from "@/store/config";
import { confirm as uiConfirm } from "@/store/ui";
import type { WithdrawalStatus } from "@/store/types";
import { onShow } from "@dcloudio/uni-app";
import { remoteApiEnabled, developmentPaymentEnabled } from "@/api/runtime";
import { resolveWalletTodayEarnings } from "@/lib/wallet-today-earnings";

const t = useT();
const app = useApp();
const commission = useCommission();
const cards = useCards();
const cfg = useConfig();

// uni pages remain alive in the navigation stack. Refresh the server-owned
// wallet projection whenever this page becomes visible so a completed exchange
// cannot send the user back to a stale pre-exchange balance.
onShow(() => {
  if (remoteApiEnabled) {
    void app.refreshRemoteFleet();
    void refreshEarningsReleaseStatus().catch(() => undefined);
  }
});

const configSyncFailed = computed(() => cfg.syncFailed);
const fundsAuthorityUnavailable = computed(() => remoteApiEnabled && app.remoteFleetStatus === "error");
const fundsReadable = computed(() => !remoteApiEnabled || app.remoteFleetHasSnapshot);
const usdtBalanceReadable = computed(() => fundsReadable.value || app.remoteWalletReceiptHasSnapshot);

function retryFundsAuthority() {
  void app.refreshRemoteFleet();
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
// 2026-07-31:充值本金可提后,「可提现 USDT」= 总余额(held 两桶本就账外,不含在内)。
// 必须与 wallet-withdraw 的 maxWithdrawable 同源,否则钱包页显示的数与实际能提的数对不上。
const usdt = computed(() => app.user.usdtBalance);
const nexLabel = computed(() => app.user.nexBalance.toLocaleString());
const pending = computed(() => app.user.pendingEarnings);
const todayEarnings = computed(() => resolveWalletTodayEarnings({
  remoteApiEnabled,
  homeTruthStatus: app.homeTruthStatus,
  homeTodayUsdt: app.homeTruth?.earnings.today.usdt ?? null,
  localTodayUsdt: app.earnings.today,
}));
const todayEarningsText = computed(() => todayEarnings.value === null ? "—" : `+$${todayEarnings.value.toFixed(2)}`);
const pendingReview = computed(() => buckets.value.pendingReviewUsdt);
const lockedRewards = computed(() => buckets.value.bonusLockedUsdt);
const teamLifetimeUSD = computed(() => commission.totalUSDTLifetime());
const allTimeEarned = computed(() => app.earnings.total + teamLifetimeUSD.value);
const allTimeSublabel = computed(() =>
  fmt(t.value.wallet.allTimeSublabel, {
    c: app.earnings.total.toFixed(2),
    tm: teamLifetimeUSD.value.toFixed(2),
  }),
);
// Bank cards: dynamic count from cards store (mirrors prototype `${n} 张已绑定`
// vs reuse hint). Label + these sub-strings are hardcoded in the prototype too
// (no i18n key) — see PORT report for the missing wallet.myBankCards keys.
const cardsCount = computed(() => cards.cards.length);
const cardsSub = computed(() =>
  remoteApiEnabled && !developmentPaymentEnabled
    ? t.value.cards.newTitle
    : cardsCount.value > 0
    ? fmt(t.value.wallet.cardsBound, { n: cardsCount.value })
    : t.value.wallet.cardsReuseHint,
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
  return `${statusLabel(w.status)} · ${fmtTime(w.submittedAt)}`;
});

function statusLabel(s: WithdrawalStatus): string {
  const labels: Record<WithdrawalStatus, string> = {
    submitted: t.value.wallet.submitted,
    "review-pending": t.value.wallet.reviewPending,
    "review-passed": t.value.wallet.reviewPassed,
    processing: t.value.wallet.processing,
    sent: t.value.wallet.sent,
    confirmed: t.value.wallet.confirmed,
    "review-rejected": t.value.wallet.reviewRejected,
    frozen: t.value.wallet.statusFrozen,
    "address-invalid": t.value.wallet.statusAddressInvalid,
    "tx-failed": t.value.wallet.statusTxFailed,
    refunded: t.value.wallet.statusRefunded,
  };
  return labels[s];
}
function fmtTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return t.value.wallet.timeJustNow;
  if (m < 60) return fmt(t.value.wallet.timeMinutesAgo, { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return fmt(t.value.wallet.timeHoursAgo, { n: h });
  return fmt(t.value.wallet.timeDaysAgo, { n: Math.floor(h / 24) });
}

function goNex() {
  navTo("/pages/me/wallet-nex");
}
function goTopup() {
  navTo("/pages/me/wallet-topup");
}
function goWithdraw() {
  navTo("/pages/me/wallet-withdraw-method");
}
function goExchange() {
  navTo("/pages/me/wallet-exchange");
}

// ── styles ──
// De-carded: balance sits directly on the page floor (surface/ambient overlay/
// shadow dropped — the ambient would read as a floor glow once un-carded). 2px
// optical inset aligns the big number with the section labels + list rows.
const heroStyle: CSSProperties = {
  margin: "0 16px 12px",
  padding: "0 2px",
};
const heroLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
const heroNumStyle: CSSProperties = {
  marginTop: "6px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "56px",
  letterSpacing: "-0.034em",
  color: "var(--v5-ink)",
  lineHeight: 1,
};
const actionIconStyle: CSSProperties = {
  width: "48px",
  height: "48px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
};
const actionLabelStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-2)",
};
// Section label (de-card spec): 15px/600/ink, sits above the transparent list
// group at the 18px content edge (16px gutter + 2px inset).
const listTitleStyle: CSSProperties = {
  margin: "22px 18px 12px",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.012em",
  color: "var(--v5-ink)",
};
// Transparent hairline group (earnings-ledger idiom): the container border-top
// opens the group, rows carry their own dividers (first row = no top border).
const listCardStyle: CSSProperties = {
  margin: "0 16px",
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
const syncFailBoxStyle: CSSProperties = {
  margin: "8px 16px 0",
  padding: "10px 12px",
  borderRadius: "12px",
  background: "var(--v5-warning-soft)",
};
const syncFailTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-warning)",
};
const syncFailBodyStyle: CSSProperties = {
  marginTop: "2px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.45,
};
const retryFundsStyle: CSSProperties = {
  marginTop: "10px",
  minHeight: "44px",
  padding: "0 16px",
  borderRadius: "999px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--v5-surface)",
  color: "var(--v5-ink-2)",
  fontSize: "13px",
  fontWeight: 600,
};
</script>
