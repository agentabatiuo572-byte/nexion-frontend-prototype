<!-- Balances retain their existing sources; the summary follows the approved wallet design. -->
<template>
  <view class="nx-wallet">
    <view class="nx-glass-card nx-wallet-summary">
      <view class="nx-wallet-arc" aria-hidden="true" />
      <view class="nx-wallet-heading" role="link" tabindex="0" @click="goBills" @keydown.enter.stop.prevent="goBills" @keydown.space.stop.prevent="goBills">
        <svg class="nx-wallet-symbol" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M20 12h-5v5h5" /></svg>
        <text class="nx-wallet-title">{{ t.me.myWallet }}</text>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
      </view>
      <view class="nx-wallet-total" :aria-label="t.me.usdtBalance + ': $' + usdtLabel">
        <text class="nx-wallet-currency">$</text><text class="tabular-nums nx-wallet-amount">{{ usdtLabel }}</text>
      </view>
      <view class="nx-wallet-nex" :aria-label="t.uiChrome.nexBalance + ': ' + nexLabel + ' NEX'">
        <view class="nx-wallet-coin" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9zM8 15V9l8 6V9" /></svg></view>
        <text class="tabular-nums">{{ nexLabel }} NEX</text>
      </view>
    </view>
    <view class="nx-wallet-details">
      <text class="block nx-wallet-pending tabular-nums">{{ pendingLine }}</text>
      <view class="nx-wallet-valuation">
        <text>≈ ${{ nexUsd }} · 1 NEX = $0.171</text>
        <view class="nx-wallet-bills" role="link" tabindex="0" @click="goBills" @keydown.enter.stop.prevent="goBills" @keydown.space.stop.prevent="goBills"><text>{{ billsThisMonth }} {{ t.me.billsThisMonth }}</text><text aria-hidden="true"> ›</text></view>
      </view>
        <!-- Quick actions strip -->
        <view :style="actionsBlockStyle">
          <text class="block" style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; color: var(--v5-ink-4); margin-bottom: 8px">{{ t.me.quickActions }}</text>
          <view class="grid grid-cols-3" style="gap: 8px">
            <WalletActionBtn href="/pages/me/wallet-topup" :label="t.me.topup" sub="USDT">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17V3" /><path d="m6 11 6 6 6-6" /><path d="M19 21H5" /></svg>
            </WalletActionBtn>
            <WalletActionBtn href="/pages/me/wallet-withdraw" :label="t.me.withdraw" sub="USDT">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v14" /><path d="m6 9 6-6 6 6" /><path d="M19 21H5" /></svg>
            </WalletActionBtn>
            <WalletActionBtn href="/pages/me/wallet-exchange" :label="t.me.exchange" sub="USDT ⇄ NEX">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 3 1.9 4.6L16 9.5l-4.6 1.9L9.5 16l-1.9-4.6L3 9.5l4.6-1.9z" /><path d="M19 14v6" /><path d="M22 17h-6" /></svg>
            </WalletActionBtn>
          </view>
        </view>

        <!-- Empty-slot conversion hook -->
        <view v-if="emptySlots > 0" class="nx-wallet-slot-block grid items-center" :style="slotBlockStyle">
          <view style="min-width: 0">
            <view class="flex items-center" style="gap: 6px">
              <view aria-hidden :style="pulseDotStyle" />
              <text style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; color: var(--v5-ink-3)">{{ slotsLine }}</text>
            </view>
            <view class="flex items-baseline flex-wrap" style="gap: 4px; margin-top: 4px">
              <text style="font-family: var(--font-v5); font-size: 13px; color: var(--v5-ink-2); white-space: nowrap">{{ t.me.walletSlotUnlock }}</text>
              <text class="tabular-nums" :style="slotPotentialStyle">+${{ slotPotential }}/d</text>
              <text style="font-family: var(--font-v5); font-size: 13px; color: var(--v5-ink-3)">{{ t.me.walletSlotMore }}</text>
            </view>
          </view>
          <view class="wallet-add-device shrink-0 inline-flex items-center justify-center active:opacity-90" :style="addDeviceBtnStyle" role="button" tabindex="0" :aria-busy="slotSheet.checking" :aria-disabled="slotSheet.checking" @click="goStore" @keydown.enter.stop.prevent="goStore" @keydown.space.stop.prevent="goStore">
            <text>{{ t.me.addDeviceCta }}</text>
          </view>
        </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { useSlotActionSheet } from "@/store/slot-action-sheet";
import { earningsReleaseSnapshot } from "@/store/earning-release";
import { useBills } from "@/store/bills";
import { MAX_DEVICES, derivePromoUpgrade } from "@/store/device-types";
import { trialReservesSlotNow } from "@/store/free-trial";
import { isDeviceOnline } from "@/lib/hashpower";
import WalletActionBtn from "@/components/me/wallet-action-btn.vue";

const t = useT();
const app = useApp();
const slotSheet = useSlotActionSheet();
const bills = useBills();

const buckets = computed(() => ({
  pendingReviewUsdt: earningsReleaseSnapshot.value?.buckets.pending_review
    ?? app.user.earningBuckets.pendingReviewUsdt,
  bonusLockedUsdt: earningsReleaseSnapshot.value?.buckets.bonus_locked
    ?? app.user.earningBuckets.bonusLockedUsdt,
}));
// 2026-07-31:与 wallet.vue / wallet-withdraw 同源 —— 可提口径 = 总余额(held 两桶账外)。
const usdt = computed(() => app.user.usdtBalance);
const usdtLabel = computed(() => usdt.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pendingLine = computed(() =>
  fmt(t.value.me.walletBucketsHint, {
    review: buckets.value.pendingReviewUsdt.toFixed(2),
    locked: buckets.value.bonusLockedUsdt.toFixed(2),
  }),
);

const nex = computed(() => app.user.nexBalance);
const nexLabel = computed(() => nex.value.toLocaleString());
const nexUsd = computed(() => (nex.value * 0.171).toFixed(2));

const activeCount = computed(() => app.activeSlotCount);
const trialSlot = computed(() => (trialReservesSlotNow() ? 1 : 0));
const emptySlots = computed(() => Math.max(0, MAX_DEVICES - activeCount.value - trialSlot.value));
const onlineCount = computed(
  () => app.visibleDevices.filter((d) => d.activatedAt !== null && isDeviceOnline(d, Date.now())).length + trialSlot.value,
);
const slotPotential = computed(() => Math.round(emptySlots.value * derivePromoUpgrade(app.visibleDevices).targetDaily));
const slotsLine = computed(() => fmt(t.value.me.walletSlotsLine, { online: onlineCount.value, open: emptySlots.value }));

const billsThisMonth = computed(() => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return bills.bills.filter((b) => b.ts >= startOfMonth).length;
});

function goBills() { uni.navigateTo({ url: "/pages/me/wallet-bills", fail: () => {} }); }
function goStore() { void slotSheet.openForSlot(); }

const actionsBlockStyle: CSSProperties = {
  marginTop: "28px",
};
const slotBlockStyle: CSSProperties = {
  marginTop: "28px",
  gap: "12px",
};
const pulseDotStyle: CSSProperties = {
  width: "7px",
  height: "7px",
  borderRadius: "50%",
  background: "var(--v5-tech-cyan)",
  animation: "v5-hb-pulse 1.8s ease-in-out infinite",
};
const slotPotentialStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  fontWeight: 600,
  letterSpacing: "-0.022em",
  color: "var(--v5-brand-2-ink)",
  lineHeight: 1,
};
const addDeviceBtnStyle: CSSProperties = {
  minHeight: "44px",
  padding: "11px 16px",
  background: "color-mix(in srgb, var(--v5-brand-2) 16%, transparent)",
  color: "var(--v5-brand-2-ink)",
  borderRadius: "999px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  letterSpacing: "-0.005em",
  whiteSpace: "nowrap",
};
</script>

<style scoped>
.nx-wallet-summary { position: relative; overflow: hidden; padding: 20px; isolation: isolate; }
.nx-wallet-heading { position: relative; display: flex; align-items: center; gap: 12px; min-height: 44px; color: var(--v5-ink); }
.nx-wallet-symbol { color: var(--v5-nex); flex-shrink: 0; }
.nx-wallet-title { flex: 1; min-width: 0; font: 600 20px/1.3 var(--font-v5); }
.nx-wallet-total { position: relative; display: flex; align-items: baseline; margin: 28px 0 26px; gap: 3px; color: var(--v5-ink); font-family: var(--font-v5); font-weight: 650; letter-spacing: -.035em; line-height: 1.1; }
.nx-wallet-currency { font-size: clamp(28px, 8vw, 38px); }
.nx-wallet-amount { min-width: 0; overflow-wrap: anywhere; font-size: clamp(32px, 10.5vw, 52px); }
.nx-wallet-nex { position: relative; display: flex; align-items: center; gap: 10px; padding-bottom: 8px; font: 500 20px/1.4 var(--font-v5); color: var(--v5-ink-2); overflow-wrap: anywhere; }
.nx-wallet-coin { display: grid; place-items: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; color: var(--v5-bg); background: var(--v5-nex); }
.nx-wallet-arc { position: absolute; width: 360px; height: 300px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--v5-nex) 50%, transparent); bottom: -220px; right: -190px; transform: rotate(-30deg); background: radial-gradient(ellipse at center, var(--v5-nex-soft), transparent 68%); box-shadow: 0 0 40px var(--v5-nex-soft); pointer-events: none; animation: wallet-arc-breathe 7s ease-in-out infinite alternate; }
.nx-wallet-details { padding: 12px 4px 0; }
.nx-wallet-pending { color: var(--v5-success-ink); font: 400 12px/1.65 var(--font-v5); }
.nx-wallet-valuation { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; font: 400 12px/1.5 var(--font-v5); color: var(--v5-ink-3); }
.nx-wallet-bills { display: flex; align-items: center; min-height: 44px; }
.nx-wallet-slot-block { grid-template-columns: minmax(0, 1fr) auto; }
.nx-wallet-heading:focus-visible, .nx-wallet-bills:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; border-radius: 12px; }
@keyframes wallet-arc-breathe { from { opacity: .55; } to { opacity: 1; } }
@media (max-width: 350px) { .nx-wallet-slot-block { grid-template-columns: minmax(0, 1fr); } .nx-wallet-summary { padding: 18px; } }
@media (prefers-reduced-motion: reduce) { .nx-wallet-arc { animation: none; } }
</style>
