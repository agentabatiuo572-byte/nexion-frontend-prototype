<!--
  OrdersCard — ported from me/page.tsx OrdersCard.
  Shows the latest order (name + $total · DC + status pill) or an empty "browse
  store" CTA, plus a "View all orders" footer row with the order count. Reads
  useOrders. Latest order taps nowhere (whole card is informational); footer →
  /pages/store/orders (ported).
-->
<template>
  <view>
    <SectionHeader :title="t.orders.title" />
    <view class="relative overflow-hidden" :style="cardStyle">
      <view v-if="latestOrder" class="flex items-center justify-between" style="gap: 8px">
        <view class="min-w-0">
          <text class="block truncate" style="font-family: var(--font-v5); font-size: 13px; font-weight: 500; color: var(--v5-ink)">{{ latestOrder.productName }}</text>
          <text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 2px">${{ latestOrder.total.toFixed(0) }} · {{ latestOrder.dataCenter }}</text>
        </view>
        <text class="shrink-0 font-mono-tabular" :style="statusPillStyle(latestOrder.status)">{{ latestOrder.status }}</text>
      </view>
      <view v-else class="flex items-center justify-between" style="gap: 12px">
        <text class="flex-1 min-w-0" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.orders.empty }}</text>
        <view class="shrink-0 inline-flex items-center justify-center active:opacity-90" :style="browseBtnStyle" @click="goStore">
          <text>{{ t.orders.browseStore }}</text>
        </view>
      </view>

      <view class="flex items-center justify-between active:opacity-70" :style="footerStyle" @click="goOrders">
        <text style="font-family: var(--font-v5); font-size: 13px; font-weight: 500; color: var(--v5-ink)">{{ t.me.viewAllOrders }}</text>
        <view class="inline-flex items-center gap-0.5">
          <text v-if="orderCount > 0" class="font-mono-tabular tabular-nums" style="font-size: 12px; color: var(--v5-ink-3)">{{ orderCount }}</text>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import SectionHeader from "@/components/me/section-header.vue";
import { useT } from "@/i18n/use-t";
import { useOrders } from "@/store/orders";

const t = useT();
const orders = useOrders();

const orderCount = computed(() => orders.orders.length);
const latestOrder = computed(() => orders.orders[orders.orders.length - 1] ?? null);

function goStore() {
  uni.reLaunch({ url: "/pages/store/store", fail: () => {} });
}
function goOrders() {
  uni.navigateTo({ url: "/pages/store/orders", fail: () => {} });
}

const ORDER_STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  placed: { color: "var(--v5-brand-2-ink)", bg: "var(--v5-brand-2-soft)", border: "var(--v5-brand-2-border)" },
  paid: { color: "var(--v5-brand)", bg: "var(--v5-brand-soft)", border: "var(--v5-brand-border)" },
  provisioning: { color: "var(--v5-success-ink)", bg: "var(--v5-success-soft)", border: "color-mix(in srgb, var(--v5-success) 30%, transparent)" },
  activated: { color: "var(--v5-success-ink)", bg: "var(--v5-success-soft)", border: "color-mix(in srgb, var(--v5-success) 30%, transparent)" },
  cancelled: { color: "var(--v5-brand-2-ink)", bg: "var(--v5-brand-2-soft)", border: "var(--v5-brand-2-border)" },
};
function statusPillStyle(status: string): CSSProperties {
  const s = ORDER_STATUS_STYLE[status] ?? ORDER_STATUS_STYLE.placed;
  return {
    color: s.color,
    background: s.bg,
    border: `1px solid ${s.border}`,
    padding: "3px 8px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 500,
  };
}

const cardStyle: CSSProperties = {
  padding: "14px",
  background: "var(--v5-surface)",
  borderRadius: "16px",
};
const browseBtnStyle: CSSProperties = {
  minHeight: "44px",
  padding: "10px 16px",
  background: "var(--v5-brand-soft)",
  color: "var(--v5-brand)",
  borderRadius: "999px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
};
const footerStyle: CSSProperties = {
  // 去线(主人 2026-08-17 全站令):分组靠留白,总间距沿用有线时代的 12+12。
  marginTop: "24px",
};
</script>
