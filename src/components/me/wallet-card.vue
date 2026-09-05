<!--
  WalletCard — ported from me/page.tsx WalletCard (+ design draft tech-money-card).
  Dual-currency hero: USDT (48px) on top, NEX (32px) below, then a "Quick actions"
  3-button grid (Top-up / Withdraw / Exchange), then a conditional empty-slot
  conversion hook ("Unlock +$X/d more · Add device"). Blocks are separated by 28px
  whitespace only — no rules (主人 2026-08-17 去线).
  Reads useApp for balances/devices; derivePromoUpgrade for slot potential;
  trialReservesSlotNow for the shadow-trial slot; useBills for this-month count.

  Visual layers: 24px grid overlay + drifting aurora + 5 data-dots (all aria-hidden,
  zero-interaction). framer/SVG ports use existing tokens.css keyframes
  (v5-aurora-drift / v5-dot-drift / v5-hb-pulse).
-->
<template>
  <view>
    <SectionHeader :title="t.me.myWallet" link="/pages/me/wallet-bills" :link-label="t.headerTitles.meWalletBills" />
    <view class="relative overflow-hidden" :style="cardStyle">
      <!-- grid-overlay 24px lattice -->
      <view aria-hidden :style="gridOverlayStyle" />
      <!-- aurora drift -->
      <view aria-hidden :style="auroraStyle" />
      <!-- 5 data-dots -->
      <view aria-hidden style="position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 0">
        <view v-for="(d, i) in DATA_DOTS" :key="i" :style="dotStyle(d)" />
      </view>

      <view class="relative" style="z-index: 1">
        <!-- USDT balance label -->
        <view style="margin-bottom: 8px">
          <text style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; color: var(--v5-ink-4)">{{ t.me.usdtBalance }}</text>
        </view>
        <!-- USDT hero -->
        <view class="flex items-baseline" style="gap: 8px">
          <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 20px; color: var(--v5-ink-3); font-weight: 500">$</text>
          <text class="tabular-nums" :style="usdtNumStyle">{{ intPart }}<text style="color: var(--v5-ink-3); font-size: 36px">.{{ fracPart }}</text></text>
        </view>
        <text class="block tabular-nums" :style="pendingStyle">{{ pendingLine }}</text>

        <!-- NEX hero — equal weight, separated by whitespace -->
        <view :style="nexBlockStyle">
          <view class="flex items-center justify-between" style="margin-bottom: 8px">
            <text style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; color: var(--v5-ink-4)">{{ t.uiChrome.nexBalance }}</text>
            <text :style="nexBadgeStyle">+20.4%</text>
          </view>
          <view class="flex items-baseline" style="gap: 8px">
            <text class="tabular-nums" :style="nexNumStyle">{{ nexLabel }}</text>
            <text style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 13px; color: var(--v5-nex); font-weight: 600; letter-spacing: 0.06em">NEX</text>
          </view>
          <view class="flex items-center justify-between" :style="nexSubRowStyle">
            <text style="color: var(--v5-ink-3)">≈ ${{ nexUsd }} · 1 NEX = $0.171</text>
            <!-- 《07》tap≥44:上一轮只补了按下反馈、漏了热区(实测 109.6×16,独立验收 agent 抓出)。
                 同 section-header 的处理 —— 只向左扩,右边缘不动,不越过父容器。 -->
            <view class="inline-flex items-center shrink-0 active:opacity-70 transition-opacity" style="gap: 4px; font-size: 12px; color: var(--v5-ink-3); min-height: 44px; padding-left: 16px" @click="goBills">
              <text>{{ billsThisMonth }} {{ t.me.billsThisMonth }}</text>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </view>
          </view>
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
        <view v-if="emptySlots > 0" class="grid items-center" :style="slotBlockStyle">
          <view style="min-width: 0">
            <view class="flex items-center" style="gap: 6px">
              <view aria-hidden :style="pulseDotStyle" />
              <text style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; color: var(--v5-ink-3)">{{ slotsLine }}</text>
            </view>
            <view class="flex items-baseline" style="gap: 4px; margin-top: 4px">
              <text style="font-family: var(--font-v5); font-size: 13px; color: var(--v5-ink-2)">{{ t.me.walletSlotUnlock }}</text>
              <text class="tabular-nums" :style="slotPotentialStyle">+${{ slotPotential }}/d</text>
              <text style="font-family: var(--font-v5); font-size: 13px; color: var(--v5-ink-3)">{{ t.me.walletSlotMore }}</text>
            </view>
          </view>
          <view class="shrink-0 inline-flex items-center justify-center active:opacity-90" :style="addDeviceBtnStyle" @click="goStore">
            <text>{{ t.me.addDeviceCta }}</text>
          </view>
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
import { earningsReleaseSnapshot } from "@/store/earning-release";
import { useBills } from "@/store/bills";
import { MAX_DEVICES, derivePromoUpgrade } from "@/store/device-types";
import { trialReservesSlotNow } from "@/store/free-trial";
import { isDeviceOnline } from "@/lib/hashpower";
import SectionHeader from "@/components/me/section-header.vue";
import WalletActionBtn from "@/components/me/wallet-action-btn.vue";

const t = useT();
const app = useApp();
const bills = useBills();

const buckets = computed(() => ({
  pendingReviewUsdt: earningsReleaseSnapshot.value?.buckets.pending_review
    ?? app.user.earningBuckets.pendingReviewUsdt,
  bonusLockedUsdt: earningsReleaseSnapshot.value?.buckets.bonus_locked
    ?? app.user.earningBuckets.bonusLockedUsdt,
}));
// 2026-07-31:与 wallet.vue / wallet-withdraw 同源 —— 可提口径 = 总余额(held 两桶账外)。
const usdt = computed(() => app.user.usdtBalance);
const intPart = computed(() => Math.floor(usdt.value).toLocaleString());
const fracPart = computed(() => (usdt.value - Math.floor(usdt.value)).toFixed(2).slice(2));
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

const DATA_DOTS = [
  { left: "8%", top: "80%", delay: "0s", bg: "var(--v5-tech-cyan)" },
  { left: "28%", top: "88%", delay: "1.4s", bg: "var(--v5-brand)" },
  { left: "52%", top: "84%", delay: "3.2s", bg: "var(--v5-tech-cyan)" },
  { left: "72%", top: "90%", delay: "5.0s", bg: "var(--v5-success)" },
  { left: "90%", top: "82%", delay: "6.6s", bg: "var(--v5-brand-2)" },
];

function goBills() {
  uni.navigateTo({ url: "/pages/me/wallet-bills", fail: () => {} });
}
function goStore() {
  uni.reLaunch({ url: "/pages/store/store", fail: () => {} });
}

const cardStyle: CSSProperties = {
  padding: "18px",
  background:
    "radial-gradient(80% 60% at 50% 0%, color-mix(in oklab, var(--v5-brand) 8%, transparent) 0%, transparent 55%), var(--v5-surface-2)",
  borderRadius: "16px",
  boxShadow: "var(--v5-card-shadow-lift-strong)",
};
const gridOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: "0",
  backgroundImage:
    "linear-gradient(to right, color-mix(in srgb, var(--v5-ink) 4%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--v5-ink) 4%, transparent) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  pointerEvents: "none",
  zIndex: 0,
};
const auroraStyle: CSSProperties = {
  position: "absolute",
  inset: "-20%",
  background:
    "radial-gradient(40% 50% at 80% 20%, var(--v5-tech-cyan-soft) 0%, transparent 60%), radial-gradient(40% 50% at 10% 80%, var(--v5-brand-soft) 0%, transparent 60%), radial-gradient(35% 45% at 70% 90%, color-mix(in srgb, var(--v5-warning) 25%, transparent) 0%, transparent 60%)",
  filter: "blur(8px)",
  pointerEvents: "none",
  zIndex: 0,
  opacity: 0.85,
  animation: "v5-aurora-drift 14s ease-in-out infinite",
};
function dotStyle(d: { left: string; top: string; delay: string; bg: string }): CSSProperties {
  return {
    position: "absolute",
    left: d.left,
    top: d.top,
    width: "3px",
    height: "3px",
    borderRadius: "50%",
    background: d.bg,
    opacity: 0,
    animation: "v5-dot-drift 8s linear infinite",
    animationDelay: d.delay,
  };
}
const usdtNumStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "56px",
  fontWeight: 600,
  letterSpacing: "-0.034em",
  lineHeight: 1,
  color: "var(--v5-ink)",
  whiteSpace: "nowrap",
};
const pendingStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-success-ink)",
  fontVariantNumeric: "tabular-nums",
};
// 主人 2026-08-17:卡内三道虚线分隔全删,分组改由留白独扛(块间 28px 对内部 4-8px,
// 层级差 3.5×,不靠线也读得出组)。几何总距与有线时代一致,只是线没了。
const nexBlockStyle: CSSProperties = {
  marginTop: "28px",
};
const nexBadgeStyle: CSSProperties = {
  padding: "2px 7px",
  borderRadius: "4px",
  background: "var(--v5-brand-soft)",
  color: "var(--v5-brand)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
};
const nexNumStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "36px",
  fontWeight: 600,
  letterSpacing: "-0.028em",
  lineHeight: 1,
  color: "var(--v5-ink)",
  whiteSpace: "nowrap",
};
const nexSubRowStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontVariantNumeric: "tabular-nums",
};
const actionsBlockStyle: CSSProperties = {
  marginTop: "28px",
};
const slotBlockStyle: CSSProperties = {
  marginTop: "28px",
  gridTemplateColumns: "minmax(0,1fr) auto",
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
