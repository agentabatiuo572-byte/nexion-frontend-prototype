<!-- Balances retain their existing sources; the summary follows the approved wallet design. -->
<template>
  <view class="nx-wallet">
    <view class="nx-glass-card nx-glass-hero nx-wallet-summary">
      <view class="nx-wallet-arc" aria-hidden="true" />
      <view class="nx-wallet-particles" aria-hidden="true">
        <view v-for="(dot, i) in DATA_DOTS" :key="i" class="nx-wallet-particle" data-wallet-particle :style="dotStyle(dot)" />
      </view>
      <view class="nx-wallet-heading" data-me-action="wallet-bills" role="link" tabindex="0" @click="goBills"  @keydown.enter.prevent="goBills" >
        <view class="nx-wallet-symbol" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M20 12h-5v5h5" /></svg></view>
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
        <text>{{ nexMarketLabel }}</text>
        <view class="nx-wallet-bills" role="link" tabindex="0" @click="goBills"  @keydown.enter.prevent="goBills" ><text>{{ billsThisMonth }} {{ t.me.billsThisMonth }}</text><text aria-hidden="true"> ›</text></view>
      </view>
        <!-- Quick actions strip -->
        <view :style="actionsBlockStyle">
          <text class="block" style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; color: var(--v5-ink-4); margin-bottom: 8px">{{ t.me.quickActions }}</text>
          <view class="grid grid-cols-3" style="gap: 8px">
            <WalletActionBtn href="/pages/me/wallet-topup" :label="t.me.topup" sub="USDT">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17V3" /><path d="m6 11 6 6 6-6" /><path d="M19 21H5" /></svg>
            </WalletActionBtn>
            <WalletActionBtn href="/pages/me/wallet-withdraw-method" :label="t.me.withdraw" sub="USDT / VND">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v14" /><path d="m6 9 6-6 6 6" /><path d="M19 21H5" /></svg>
            </WalletActionBtn>
            <WalletActionBtn href="/pages/me/wallet-exchange" :label="t.me.exchange" sub="USDT ⇄ NEX">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 3 1.9 4.6L16 9.5l-4.6 1.9L9.5 16l-1.9-4.6L3 9.5l4.6-1.9z" /><path d="M19 14v6" /><path d="M22 17h-6" /></svg>
            </WalletActionBtn>
          </view>
        </view>

        <!-- Empty-slot conversion hook -->
        <view v-if="slotsReadable && emptySlots > 0" class="grid items-center nx-wallet-slot-block" :style="slotBlockStyle">
          <view style="min-width: 0">
            <view class="flex items-center" style="gap: 6px">
              <view aria-hidden :style="pulseDotStyle" />
              <text style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; color: var(--v5-ink-3)">{{ slotsLine }}</text>
            </view>
          </view>
          <view class="wallet-add-device shrink-0 inline-flex items-center justify-center active:opacity-90" :style="addDeviceBtnStyle" data-me-action="add-device" role="button" tabindex="0" @click="goStore"  @keydown.enter.prevent="goStore" @keydown.space.prevent="goStore">
            <text>{{ t.me.addDeviceCta }}</text>
          </view>
        </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { navReset, navTo } from "@/lib/route";
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt, openSlotsTemplate } from "@/i18n/format";
import { useApp } from "@/store/app";
import { earningsReleaseHasSnapshot, earningsReleaseSnapshot, earningsReleaseStatus } from "@/store/earning-release";
import { useBills } from "@/store/bills";
import { useMarket } from "@/store/market";
import { fundsServerEnabled, remoteApiEnabled } from "@/api/runtime";
import { remoteAuthorityStatus } from "@/lib/remote-authority-display";
import { trialReservesSlotNow, useFreeTrial } from "@/store/free-trial";
import SectionHeader from "@/components/me/section-header.vue";
import WalletActionBtn from "@/components/me/wallet-action-btn.vue";

const t = useT();
const app = useApp();
const bills = useBills();
const market = useMarket();
const trial = useFreeTrial();
const fundsReadable = computed(() => remoteAuthorityStatus({
  remoteApiEnabled,
  hasSnapshot: app.remoteFleetHasSnapshot,
  hasError: app.remoteFleetStatus === "error",
}) === "ready");
const usdtBalanceReadable = computed(() => fundsReadable.value || app.remoteWalletReceiptHasSnapshot);
const bucketsReadable = computed(() => !remoteApiEnabled || (earningsReleaseHasSnapshot.value
  && earningsReleaseSnapshot.value?.serverCanonical === true
  && (earningsReleaseStatus.value === "ready" || earningsReleaseStatus.value === "loading")));

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
    review: bucketsReadable.value ? buckets.value.pendingReviewUsdt.toFixed(2) : "—",
    locked: bucketsReadable.value ? buckets.value.bonusLockedUsdt.toFixed(2) : "—",
  }),
);

const nex = computed(() => app.user.nexBalance);
const nexLabel = computed(() => fundsReadable.value ? nex.value.toLocaleString() : "—");
const marketReady = computed(() => market.isMockMode || market.remoteReady);
const nexChangeLabel = computed(() => {
  if (!marketReady.value || !market.change24hAvailable) return "—";
  const change = market.change24hPct;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
});
const nexMarketLabel = computed(() => {
  if (!marketReady.value) return "≈ — USDT · 1 NEX = — USDT";
  const price = market.nexPriceUSDT;
  return `≈ ${fundsReadable.value ? (nex.value * price).toFixed(2) : "—"} USDT · 1 NEX = ${price.toFixed(3)} USDT`;
});

const trialReady = computed(() => !remoteApiEnabled || trial.authorityStatus === "ready"
  || (trial.authorityStatus === "loading" && trial.authorityServerState !== null));
const slotsReadable = computed(() => !remoteApiEnabled || (app.remoteFleetHasSnapshot && trialReady.value));
const activeCount = computed(() => app.activeSlotCount);
const trialSlot = computed(() => (trialReservesSlotNow() ? 1 : 0));
const emptySlots = computed(() => Math.max(0, app.slotCap - activeCount.value - trialSlot.value));
const slotsLine = computed(() => fmt(openSlotsTemplate(t.value.me.walletSlotsLine, emptySlots.value), { active: activeCount.value, open: emptySlots.value }));

const billsThisMonth = computed(() => {
  if (fundsServerEnabled && bills.summaryStatus !== "ready") return "--";
  if (fundsServerEnabled) return bills.summary?.monthBillCount ?? "--";
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
  navTo("/pages/me/wallet-bills");
}
function goStore() {
  navReset({ url: "/pages/store/store", fail: () => {} });
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
  gap: "12px",
};
const pulseDotStyle: CSSProperties = {
  width: "7px",
  height: "7px",
  borderRadius: "50%",
  background: "var(--v5-tech-cyan)",
  animation: "v5-hb-pulse 1.8s ease-in-out infinite",
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

import { useSlotActionSheet } from "@/store/slot-action-sheet";
// Native locale formatters can ignore fraction options; match the wallet detail's display rounding.
const usdtLabel = computed(() => usdtBalanceReadable.value ? usdt.value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "—");
</script>

<style scoped>
.nx-wallet-summary { position: relative; overflow: hidden; padding: 20px; isolation: isolate; }
.nx-wallet-heading { position: relative; z-index: 1; display: flex; align-items: center; gap: 12px; min-height: 44px; color: var(--v5-ink); }
.nx-wallet-symbol { display: grid; place-items: center; width: 30px; height: 30px; color: var(--v5-nex); flex-shrink: 0; }
.nx-wallet-title { flex: 1; min-width: 0; font: 600 20px/1.3 var(--font-v5); }
.nx-wallet-total { position: relative; z-index: 1; display: flex; align-items: baseline; margin: 28px 0 26px; gap: 3px; color: var(--v5-ink); font-family: var(--font-v5); font-weight: 650; letter-spacing: -.035em; line-height: 1.1; }
.nx-wallet-currency { font-size: clamp(28px, 8vw, 38px); }
.nx-wallet-amount { min-width: 0; overflow-wrap: anywhere; font-size: clamp(32px, 10.5vw, 52px); }
.nx-wallet-nex { position: relative; z-index: 1; display: flex; align-items: center; gap: 10px; padding-bottom: 8px; font: 500 20px/1.4 var(--font-v5); color: var(--v5-ink-2); overflow-wrap: anywhere; }
.nx-wallet-coin { display: grid; place-items: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; color: var(--v5-bg); background: var(--v5-nex); }
.nx-wallet-arc { position: absolute; width: 360px; height: 300px; border-radius: 50%;  bottom: -220px; right: -190px; transform: rotate(-30deg); background: radial-gradient(ellipse at center, var(--v5-nex-soft), transparent 68%); box-shadow: 0 0 40px var(--v5-nex-soft); pointer-events: none; animation: wallet-arc-breathe 7s ease-in-out infinite alternate; }
.nx-wallet-particles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
.nx-wallet-details { padding: 12px 4px 0; }
.nx-wallet-pending { color: var(--v5-success-ink); font: 400 12px/1.65 var(--font-v5); }
.nx-wallet-valuation { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; font: 400 12px/1.5 var(--font-v5); color: var(--v5-ink-3); }
.nx-wallet-bills { display: flex; align-items: center; min-height: 44px; }
.nx-wallet-slot-block { grid-template-columns: minmax(0, 1fr) auto; }
.nx-wallet-heading:focus-visible, .nx-wallet-bills:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; border-radius: 12px; }
@keyframes wallet-arc-breathe { from { opacity: .55; } to { opacity: 1; } }
@media (max-width: 350px) { .nx-wallet-slot-block { grid-template-columns: minmax(0, 1fr); } .nx-wallet-summary { padding: 18px; } }
@media (prefers-reduced-motion: reduce) { .nx-wallet-arc { animation: none; } }
@media (prefers-reduced-motion: reduce) {
  .nx-wallet-particle { animation: none !important; transform: none; }
  .nx-wallet-particle { opacity: .5 !important; }
}
.nx-wallet-heading:active, .nx-wallet-bills:active { opacity: .7; }
</style>
