<!--
  Wallet NEX — ported from Nexion-prototype/app/(main)/me/wallet/nex/page.tsx.
  User-level NEX holdings detail (vs /market platform-level). Surface:
    1. Hero — NEX balance + USD value + 24h change + sparkline + view-market link
    2. Quick actions 2-cell — Buy / Sell (NEX↔USDT exchange)
    3. Position breakdown — Liquid / Compute accrual / Pending
    4. P&L card — cost basis + unrealized P&L
    5. Use NEX — Exchange to USDT / Offset withdrawal fees (NEX = 2 functions only)
    6. Recent NEX activity list (mining + commission)

  Reads app (user/devices), market (nexPriceUSDT/change24hPct/klineHourly/
  tickPrice), commission (events). tickPrice on a 3s interval (cleaned in
  onUnmounted, P-021). SSR mounted-guard dropped. Helper components inlined as
  v-for data + a local NexSparkline. SetPageHeader → SubPageHeader. Wrapped in
  <AppChassis active="me">. NEX has exactly 2 functions (exchange → USDT,
  offset withdrawal fees); NEX staking / re-invest removed (主人 2026-06-17).
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/wallet" />

      <view :style="bodyStyle">
        <!-- Hero — de-carded: balance sits on the page floor, floor glow deleted. -->
        <view :style="heroStyle">
          <view>
            <text class="block" :style="heroLabelStyle">{{ t.nexWallet.holdingsLabel }}</text>
            <view class="flex items-end justify-between" style="margin-top: 10px">
              <view>
                <text class="block tabular-nums" :style="heroNumStyle">{{ fmtNum(nexBalance, 2) }}</text>
                <text class="block" :style="heroUnitStyle">NEX</text>
              </view>
              <view class="text-right">
                <text class="block tabular-nums" :style="heroUsdStyle">≈ {{ fmtUSD(usdValue) }}</text>
                <text class="block tabular-nums" :style="heroChangeStyle">{{ isUp ? "▲" : "▼" }} {{ Math.abs(change24h).toFixed(2) }}% (24h)</text>
              </view>
            </view>

            <!-- sparkline -->
            <view class="overflow-hidden" :style="sparkBoxStyle">
              <NexSparkline :data="kline" :up="isUp" />
            </view>

            <view class="inline-flex items-center active:opacity-80" :style="viewMarketStyle" @click="goMarket">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" /></svg>
              <text style="margin: 0 4px">{{ t.nexWallet.viewMarket }}</text>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </view>
          </view>
        </view>

        <!-- Quick actions 4-cell -->
        <view class="grid grid-cols-2" style="gap: 8px">
          <view v-for="qc in quickCells" :key="qc.label" class="active:scale-[0.97]" :style="quickCellStyle" @click="navTo(qc.href)">
            <view class="grid place-items-center" :style="quickIconStyle(qc.tint)">
              <view v-html="qc.icon" />
            </view>
            <text class="block" :style="quickLabelStyle">{{ qc.label }}</text>
          </view>
        </view>

        <!-- Position breakdown -->
        <view :style="cardStyle">
          <text class="block" :style="cardLabelStyle">{{ t.nexWallet.breakdown.label }}</text>
          <view style="margin-top: 10px; border-top: 1px solid var(--v5-border)">
            <view v-for="(br, i) in breakdownRows" :key="br.label" class="flex items-center" :style="breakdownRowStyle(i)">
              <view class="grid place-items-center shrink-0" :style="breakdownIconStyle(br.tint)">
                <view v-html="br.icon" />
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" :style="breakdownLabelStyle">{{ br.label }}</text>
                <text class="block truncate" :style="breakdownHintStyle">{{ br.hint }}</text>
              </view>
              <text class="font-mono-tabular tabular-nums" :style="breakdownValueStyle">{{ br.value }}</text>
            </view>
          </view>
        </view>

        <!-- P&L -->
        <view :style="cardStyle">
          <view class="flex items-center justify-between">
            <text :style="cardLabelStyle">{{ t.nexWallet.pnl.label }}</text>
            <text class="tabular-nums" :style="pnlValueStyle">{{ pnlSummary }}</text>
          </view>
          <view class="grid grid-cols-3" style="margin-top: 12px; gap: 8px 12px">
            <view v-for="cell in pnlCells" :key="cell.label">
              <text class="block" :style="pnlCellLabelStyle">{{ cell.label }}</text>
              <text class="block tabular-nums" :style="pnlCellValueStyle">{{ cell.value }}</text>
            </view>
          </view>
        </view>

        <!-- Use NEX -->
        <view :style="cardStyle">
          <text class="block" :style="[cardLabelStyle, { marginBottom: '12px' }]">{{ t.nexWallet.useNex.label }}</text>
          <view class="grid grid-cols-2" style="gap: 8px">
            <view v-for="tile in useTiles" :key="tile.label" class="active:scale-[0.98]" :style="useTileStyle" @click="navTo(tile.href)">
              <view class="flex items-center justify-between">
                <view v-html="tile.icon" />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </view>
              <text class="block" :style="useTileLabelStyle">{{ tile.label }}</text>
              <text class="block" :style="useTileSubStyle">{{ tile.sub }}</text>
            </view>
          </view>
        </view>

        <!-- Recent NEX activity — de-carded: header + hairline row group on the floor. -->
        <view :style="activityWrapStyle">
          <view class="flex items-center justify-between" :style="activityHeadStyle">
            <text :style="cardLabelStyle">{{ t.nexWallet.activity.label }}</text>
            <view class="inline-flex items-center active:opacity-70" :style="viewAllStyle" @click="goBills">
              <text>{{ t.nexWallet.activity.viewAll }}</text>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </view>
          </view>
          <EmptyState v-if="activity.length === 0" kind="empty-list" :title="t.empty.listTitle" :desc="t.empty.listDesc" compact />
          <view v-else :style="activityListStyle">
            <view v-for="(a, i) in activity" :key="a.id" class="flex items-center" :style="activityRowStyle(i)">
            <view class="grid place-items-center shrink-0" :style="activityIconStyle(a.kind)">
              <svg v-if="a.kind === 'mining'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v2" /><path d="M12 2v2" /><path d="M17 20v2" /><path d="M17 2v2" /><path d="M2 12h2" /><path d="M2 17h2" /><path d="M2 7h2" /><path d="M20 12h2" /><path d="M20 17h2" /><path d="M20 7h2" /><path d="M7 20v2" /><path d="M7 2v2" /><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="8" y="8" width="8" height="8" rx="1" /></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <text class="block truncate" :style="activityLabelStyle">{{ a.label }}</text>
              <text class="block" :style="activityTimeStyle">{{ new Date(a.ts).toLocaleString(dateLocale()) }}</text>
            </view>
            <view class="text-right">
              <text class="block tabular-nums" :style="activityNexStyle">{{ a.nex >= 0 ? "+" : "" }}{{ fmtNum(a.nex, 2) }} NEX</text>
              <text class="block" :style="activityUsdStyle">≈ {{ fmtUSD(a.nex * nexPrice) }}</text>
            </view>
          </view>
          </view>
        </view>

        <text class="block" :style="noteStyle">{{ t.nexWallet.note }}</text>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import NexSparkline from "@/components/me/nex-sparkline.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale } from "@/i18n/format";
import { useApp } from "@/store/app";
import { useMarket } from "@/store/market";
import { useCommission } from "@/store/commission";
import { useBills } from "@/store/bills";
import { remoteApiEnabled } from "@/api/runtime";

const t = useT();
const app = useApp();
const market = useMarket();
const commission = useCommission();
const bills = useBills();

let priceTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  if (!market.isMockMode) {
    void market.syncRemote();
  }
  priceTimer = setInterval(() => market.tickPrice(), 3000);
});
onUnmounted(() => {
  if (priceTimer) clearInterval(priceTimer);
});
onShow(() => {
  if (remoteApiEnabled) void bills.refreshServerLedger().catch(() => undefined);
});

const nexBalance = computed(() => app.user.nexBalance);
const nexPrice = computed(() => market.nexPriceUSDT);
const change24h = computed(() => market.change24hPct);
const kline = computed(() => market.klineHourly);
const usdValue = computed(() => nexBalance.value * nexPrice.value);
const isUp = computed(() => change24h.value >= 0);

// Only active devices contribute today's NEX.
const todayNEX = computed<number | null>(() =>
  remoteApiEnabled
    ? bills.serverStatus !== "ready"
      ? null
      : bills.bills
        .filter((bill) => bill.symbol === "NEX" && bill.type === "earn" && bill.status !== "failed" && bill.ts >= new Date().setHours(0, 0, 0, 0))
        .reduce((sum, bill) => sum + bill.amount, 0)
    : app.visibleDevices.filter((d) => d.activatedAt !== null).reduce((s, d) => s + (d.todayEarningsNEX ?? 0), 0),
);

const totalSpent = computed(() => nexBalance.value * market.costBasis);
const pnl = computed(() => usdValue.value - totalSpent.value);
const pnlPct = computed(() => (totalSpent.value > 0 ? (pnl.value / totalSpent.value) * 100 : 0));

const nexLedger = computed(() => {
  if (!remoteApiEnabled || bills.serverStatus !== "ready") return [];
  return bills.bills
    .filter((bill) => bill.symbol === "NEX" && bill.status !== "failed")
    .map((bill) => ({
      id: bill.id,
      ts: bill.ts,
      kind: "ledger",
      nex: bill.amount,
      label: bill.memo || bill.type,
    }));
});
const pendingNex = computed<number | null>(() => {
  if (!remoteApiEnabled) return 0;
  if (bills.serverStatus !== "ready") return null;
  return bills.bills
    .filter((bill) => bill.symbol === "NEX" && bill.status === "pending")
    .reduce((sum, bill) => sum + Math.abs(bill.amount), 0);
});

// NEX activity — mock uses the prototype fixture; remote uses the production
// wallet ledger only and stays empty while that authority is unavailable.
const activity = computed(() => {
  if (remoteApiEnabled) return nexLedger.value.slice().sort((a, b) => b.ts - a.ts).slice(0, 10);
  const items: Array<{ id: string; ts: number; kind: string; nex: number; label: string }> = [];
  for (const e of commission.events) {
    if (e.amountNEX > 0) {
      // e.kind 是枚举值,直接渲染会把 unilevel/binary 这种内部词漏给用户 —— 走 i18n 映射。
      items.push({ id: e.id, ts: e.ts, kind: e.kind, nex: e.amountNEX, label: `${e.sourceUserName} · ${t.value.commissions.kind[e.kind]}` });
    }
  }
  for (let i = 0; i < 5; i++) {
    items.push({
      id: `mine-${i}`,
      ts: Date.now() - i * 86400_000,
      kind: "mining",
      nex: (todayNEX.value ?? 0) * (0.6 + i * 0.1),
      label: t.value.nexWallet.activity.miningLabel,
    });
  }
  return items.sort((a, b) => b.ts - a.ts).slice(0, 10);
});

function fmtNum(n: number, dp = 2): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: dp });
}
function fmtUSD(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function navTo(href: string) {
  if (!href || href === "#") return;
  uni.navigateTo({ url: href, fail: () => {} });
}
function goMarket() {
  uni.reLaunch({ url: "/pages/market/market", fail: () => {} });
}
function goBills() {
  uni.navigateTo({ url: "/pages/me/wallet-bills", fail: () => {} });
}

// ── inline-icon SVG strings (lucide replacements) ──
const ICON = {
  up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/></svg>',
  down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/></svg>',
  lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  percent: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" x2="5" y1="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  refresh: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  cpu: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>',
  hourglass: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>',
  crown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>',
  heart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
};

const quickCells = computed(() => [
  { href: "/pages/me/wallet-exchange", icon: tintIcon(ICON.up, "var(--v5-success)"), label: t.value.nexWallet.actions.buy, tint: "var(--v5-success)" },
  { href: "/pages/me/wallet-exchange", icon: tintIcon(ICON.down, "var(--v5-brand-2)"), label: t.value.nexWallet.actions.sell, tint: "var(--v5-brand-2)" },
]);

const breakdownRows = computed(() => [
  { label: t.value.nexWallet.breakdown.liquid, value: `${fmtNum(nexBalance.value, 2)} NEX`, hint: fmtUSD(usdValue.value), tint: "var(--v5-success)", icon: tintIcon(ICON.up, "var(--v5-success)") },
  { label: t.value.nexWallet.breakdown.mining, value: todayNEX.value === null ? "—" : `+${fmtNum(todayNEX.value, 2)} NEX`, hint: todayNEX.value === null ? "—" : t.value.nexWallet.breakdown.miningHint, tint: "var(--v5-brand)", icon: tintIcon(ICON.cpu, "var(--v5-brand)") },
  { label: t.value.nexWallet.breakdown.pending, value: pendingNex.value === null ? "—" : `${fmtNum(pendingNex.value, 2)} NEX`, hint: pendingNex.value === null ? "—" : t.value.nexWallet.breakdown.pendingHint, tint: "var(--v5-warning)", icon: tintIcon(ICON.hourglass, "var(--v5-warning)") },
]);

const pnlSummary = computed(() => `${pnl.value >= 0 ? "+" : ""}${fmtUSD(pnl.value)} (${pnl.value >= 0 ? "+" : ""}${pnlPct.value.toFixed(1)}%)`);
const pnlCells = computed(() => [
  { label: t.value.nexWallet.pnl.costBasis, value: market.costBasis > 0 ? `$${market.costBasis.toFixed(3)}` : "—" },
  { label: t.value.nexWallet.pnl.totalSpent, value: fmtUSD(totalSpent.value) },
  { label: t.value.nexWallet.pnl.currentValue, value: fmtUSD(usdValue.value) },
]);

const useTiles = computed(() => [
  { href: "/pages/me/wallet-exchange", icon: tintIcon(ICON.refresh, "var(--v5-success)"), label: t.value.nexWallet.useNex.exchange, sub: t.value.nexWallet.useNex.exchangeSub },
  { href: "/pages/me/wallet-withdraw", icon: tintIcon(ICON.percent, "var(--v5-brand-2)"), label: t.value.nexWallet.useNex.feeOffset, sub: t.value.nexWallet.useNex.feeOffsetSub },
]);

function tintIcon(svg: string, color: string): string {
  // Replace the lucide default stroke=currentColor in the size-16/14 quick
  // icons with the tile tint (icons authored with stroke="currentColor").
  return svg.replace('stroke="currentColor"', `stroke="${color}"`);
}

// ── styles ──
const bodyStyle: CSSProperties = { padding: "0 16px 32px" };
// De-carded hero — balance sits on the page floor (2px optical inset); the floor
// glow blob is deleted outright, not re-tuned (owner call 2026-07-08).
const heroStyle: CSSProperties = {
  padding: "0 2px",
};
const heroLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-brand-2)",
};
const heroNumStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "34px",
  letterSpacing: "-0.022em",
  color: "var(--v5-ink)",
  lineHeight: 1,
};
const heroUnitStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  letterSpacing: "0.06em",
  color: "var(--v5-ink-3)",
};
const heroUsdStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "15px",
  fontWeight: 500,
  color: "var(--v5-ink-2)",
};
const heroChangeStyle = computed<CSSProperties>(() => ({
  marginTop: "4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: isUp.value ? "var(--v5-success)" : "var(--v5-brand-2)",
}));
const sparkBoxStyle: CSSProperties = {
  marginTop: "14px",
  height: "56px",
  borderRadius: "10px",
  // hero 已去卡,走势图底盒直接坐在页面底上;surface-2 与页面底同色不可辨 → 改 L1 surface。
  background: "var(--v5-surface)",
};
const viewMarketStyle: CSSProperties = {
  marginTop: "10px",
  marginLeft: "-8px",
  minHeight: "44px",
  padding: "0 10px",
  borderRadius: "8px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.04em",
  color: "var(--v5-brand-2)",
};
// Quick action cells — filled tiles, no border (single visual difference).
const quickCellStyle: CSSProperties = {
  marginTop: "12px",
  borderRadius: "12px",
  // 格子直接坐在页面底上,原 surface-2 与页面底同色不可辨,改 L1 surface。
  background: "var(--v5-surface)",
  padding: "12px",
  textAlign: "center",
};
function quickIconStyle(tint: string): CSSProperties {
  return {
    width: "32px",
    height: "32px",
    margin: "0 auto",
    borderRadius: "8px",
    background: `color-mix(in srgb, ${tint} 15%, transparent)`,
    color: tint,
  };
}
const quickLabelStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-ink-2)",
};
// De-carded section on the page floor — mono label + content, 2px optical inset.
const cardStyle: CSSProperties = {
  marginTop: "12px",
  padding: "0 2px",
};
const cardLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-ink-3)",
};
function breakdownRowStyle(i: number): CSSProperties {
  return {
    gap: "12px",
    padding: "12px 0",
    borderBottom: i < breakdownRows.value.length - 1 ? "1px solid var(--v5-border)" : "none",
  };
}
function breakdownIconStyle(tint: string): CSSProperties {
  return {
    width: "28px",
    height: "28px",
    borderRadius: "8px",
    // Prototype BreakdownRow: `${tint}22` = hex alpha 0x22/255 ≈ 13%, not 22%.
    background: `color-mix(in srgb, ${tint} 13%, transparent)`,
    color: tint,
  };
}
const breakdownLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink)" };
const breakdownHintStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-3)" };
const breakdownValueStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const pnlValueStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "13px",
  fontWeight: 600,
  color: pnl.value >= 0 ? "var(--v5-success)" : "var(--v5-brand-2)",
}));
const pnlCellLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.04em",
  color: "var(--v5-ink-4)",
};
const pnlCellValueStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "13px",
  color: "var(--v5-ink)",
};
// 所在区块已去卡,tile 直接坐在页面底上:原 surface-2 与页面底同色不可辨,改 L1 surface。
const useTileStyle: CSSProperties = { padding: "12px", borderRadius: "12px", background: "var(--v5-surface)" };
const useTileLabelStyle: CSSProperties = {
  marginTop: "8px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  letterSpacing: "-0.008em",
  color: "var(--v5-ink)",
};
const useTileSubStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.4 };
// De-carded activity — header + hairline row group on the page floor.
const activityWrapStyle: CSSProperties = { marginTop: "12px" };
const activityHeadStyle: CSSProperties = { padding: "0 2px 8px" };
const activityListStyle: CSSProperties = { padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
const viewAllStyle: CSSProperties = {
  minHeight: "44px",
  margin: "-12px -2px -12px 0",
  padding: "0 10px",
  borderRadius: "6px",
  fontSize: "12px",
  color: "var(--v5-brand-2)",
  gap: "2px",
};
const activityEmptyStyle: CSSProperties = { padding: "24px 2px", textAlign: "center", fontSize: "12px", color: "var(--v5-ink-3)" };
function activityRowStyle(i: number): CSSProperties {
  return {
    gap: "12px",
    padding: "10px 0",
    borderBottom: i < activity.value.length - 1 ? "1px solid var(--v5-border)" : "none",
  };
}
function activityIconStyle(kind: string): CSSProperties {
  return {
    width: "32px",
    height: "32px",
    borderRadius: "8px",
    background: kind === "mining" ? "var(--v5-brand-soft)" : "var(--v5-success-soft)",
  };
}
const activityLabelStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "13px", color: "var(--v5-ink)" };
const activityTimeStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const activityNexStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-brand)",
};
const activityUsdStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const noteStyle: CSSProperties = {
  paddingTop: "4px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.625,
  textAlign: "center",
};
</script>
