<!--
  WalletActionBtn — ported from me/page.tsx WalletActionBtn.
  iOS-Wallet 3-up action: round 44px icon chip + label + currency sub-label.
  三个动作等权、长得完全一样(主人 2026-07-31 终裁):同一实心 brand 底 + on-brand
  图标,无主次之分。**不给任何一个加 spotlight halo** —— feedback_no_icon_halo_glow
  规定 halo 仅限「唯一主 CTA」,三个平权后该豁免对谁都不成立,给三个都加正是它要防的。
  Icon 走默认 slot(inline SVG 用 stroke="currentColor")。跳 `href`(uni route),
  fail:()=>{} 兜未接入的目标。
-->
<template>
  <view class="flex flex-col items-center text-center active:opacity-90" style="gap: 6px; padding: 6px 2px; min-height: 44px" @click="go">
    <view class="grid place-items-center shrink-0" :style="iconStyle">
      <slot />
    </view>
    <text :style="labelStyle">{{ label }}</text>
    <text v-if="sub" :style="subStyle">{{ sub }}</text>
  </view>
</template>

<script setup lang="ts">
import type { CSSProperties } from "vue";

const props = defineProps<{
  href: string;
  label: string;
  sub?: string;
}>();

function go() {
  uni.navigateTo({ url: props.href, fail: () => {} });
}

const iconStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "999px",
  // 《03》§6:内嵌 icon 容器禁 border;亮底图标必须 --v5-on-brand
  // (原用 --v5-bg 取巧,两主题语义不等价)。
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
};
const labelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.005em",
  whiteSpace: "nowrap",
  lineHeight: 1.1,
};
const subStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.04em",
  color: "var(--v5-ink-4)",
  lineHeight: 1.1,
  whiteSpace: "nowrap",
};
</script>
