<!--
  WithdrawalLockedWarning — ported from me/page.tsx WithdrawalLockedWarning.
  Shown when usdtBalance < MIN_WITHDRAWAL_USD ($20). Warning-soft row with a "!"
  chip + locked headline + body (min + shortfall) + "Browse hardware" link
  (conversion nudge → /store).
-->
<template>
  <view class="flex items-start" :style="rowStyle">
    <view class="grid place-items-center shrink-0" :style="iconStyle">
      <text :style="iconCharStyle">!</text>
    </view>
    <view class="flex-1 min-w-0">
      <text class="block" :style="titleStyle">{{ t.me.withdrawalLocked }}</text>
      <text class="block" :style="bodyStyle">{{ bodyLine }}</text>
      <view class="inline-flex items-center" :style="linkStyle" @click="goStore">
        <text>{{ t.me.withdrawalLockedBrowse }}</text>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";

const MIN_WITHDRAWAL_USD = 20;

const props = defineProps<{ balance: number }>();
const t = useT();

const shortBy = computed(() => (MIN_WITHDRAWAL_USD - props.balance).toFixed(2));
const bodyLine = computed(() => fmt(t.value.me.withdrawalLockedBody, { min: MIN_WITHDRAWAL_USD, short: shortBy.value }));

function goStore() {
  uni.reLaunch({ url: "/pages/store/store", fail: () => {} });
}

const rowStyle: CSSProperties = {
  gap: "10px",
  padding: "14px",
  background: "var(--v5-warning-soft)",
  border: "1px solid color-mix(in srgb, var(--v5-warning) 20%, transparent)",
  borderRadius: "12px",
};
const iconStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "8px",
  background: "var(--v5-warning)",
};
const iconCharStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  color: "var(--v5-on-brand)",
};
const titleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 500,
  letterSpacing: "-0.01em",
  color: "var(--v5-warning-ink)",
};
const bodyStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "13px",
  color: "var(--v5-ink-2)",
  lineHeight: 1.5,
};
const linkStyle: CSSProperties = {
  gap: "4px",
  marginTop: "8px",
  color: "var(--v5-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
};
</script>
