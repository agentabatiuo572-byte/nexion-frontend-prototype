<!-- ListingCard — marketplace listing tile + Buy CTA (marketplace/page.tsx ListingCard). -->
<template>
  <view class="overflow-hidden" :style="cardStyle">
    <!-- NFT visual -->
    <view class="relative flex items-center justify-center" :style="artStyle">
      <view class="text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M5 20h14" /></svg>
        <text class="block tabular-nums" :style="tokenIdStyle">#{{ l.tokenId }}</text>
        <text class="block" :style="founderStyle">{{ t.marketplace.founderLabel }}</text>
      </view>
      <view class="mc-pulse" :style="dotStyle" />
    </view>
    <!-- Meta -->
    <view style="padding: 12px">
      <text class="block" :style="priceLabelStyle">{{ t.marketplace.price }}</text>
      <text class="block tabular-nums" :style="priceStyle">${{ priceText }}</text>
      <view class="flex items-center justify-between" style="margin-top: 6px">
        <text :style="lastSaleStyle">{{ lastSaleText }}</text>
        <text class="tabular-nums" :style="deltaStyle">{{ deltaPct === null ? "—" : `${isUp ? "+" : ""}${deltaPct}%` }}</text>
      </view>
      <view class="flex justify-end" style="margin-top: 10px">
        <view class="inline-flex items-center" :class="{ 'active:scale-[0.95]': !disabled }" :style="buyBtnStyleComputed" role="button" tabindex="0" :aria-disabled="disabled ? 'true' : 'false'" :aria-label="t.marketplace.buyCta" @click="!disabled && emit('buy')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px; pointer-events: none"><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>
          <text style="pointer-events: none">{{ t.marketplace.buyCta }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";

export interface Listing {
  tokenId: number;
  holdingNo?: string;
  priceUSDT: number;
  lastSaleUSDT: number | null;
  seller: string;
  listedAt: number;
  traits: { tier: string; boost: string; mintYear: number };
}

const props = defineProps<{ l: Listing; disabled?: boolean }>();
const emit = defineEmits<{ buy: [] }>();

const t = useT();

const delta = computed(() => props.l.lastSaleUSDT === null ? 0 : props.l.priceUSDT - props.l.lastSaleUSDT);
const deltaPct = computed<string | null>(() =>
  props.l.lastSaleUSDT && props.l.lastSaleUSDT > 0
    ? ((delta.value / props.l.lastSaleUSDT) * 100).toFixed(0)
    : null,
);
const isUp = computed(() => delta.value > 0);
const priceText = computed(() => props.l.priceUSDT.toLocaleString());
const lastSaleText = computed(() => props.l.lastSaleUSDT === null
  ? "—" : fmt(t.value.marketplace.lastSale, { k: (props.l.lastSaleUSDT / 1000).toFixed(1) }));

// Collectible tile — filled surface, no border (single visual difference).
const cardStyle: CSSProperties = {
  borderRadius: "16px",
  background: "var(--v5-surface)",
};
const artStyle: CSSProperties = {
  aspectRatio: "1 / 1",
  background:
    "radial-gradient(80% 80% at 50% 30%, color-mix(in srgb, var(--v5-quest-ember) 18%, transparent) 0%, transparent 65%), linear-gradient(135deg, #1F1408 0%, var(--v5-on-brand) 100%)",
};
const tokenIdStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
  lineHeight: 1,
};
const founderStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-warning)",
};
const dotStyle: CSSProperties = {
  position: "absolute",
  top: "8px",
  right: "8px",
  width: "6px",
  height: "6px",
  borderRadius: "999px",
  background: "var(--v5-success)",
};
const priceLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.04em",
};
const priceStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
};
const lastSaleStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
};
const deltaStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 600,
  color: isUp.value ? "var(--v5-success)" : "var(--v5-brand-2)",
}));
// 🔴 阻断态走《05》§6.1 disabled 派生(文字降 ink-4 + 填充降 surface 系),**不新造灰色**。
//   独立验收 P2-13:此前关闭态下每条挂单的按钮外观全活、可点,点了才弹提示 ——
//   规格 ⑥ 要的是「一并锁闭**并**说明」,不是「看起来能买、点了才说不行」。
const buyBtnStyleComputed = computed<CSSProperties>(() => (props.disabled
  ? { ...buyBtnStyle, background: "var(--v5-surface-2)", color: "var(--v5-ink-4)" }
  : buyBtnStyle));
const buyBtnStyle: CSSProperties = {
  // 右下角小按钮:实心柠檬绿保留(醒目),但缩面积——不再满宽横条,auto 宽。
  // 《07》tap≥44:高度由 36 抬到 44(它是「买」这个不可撤销动作的入口,点错代价高)。
  height: "44px",
  padding: "0 16px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 550,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};
</script>
