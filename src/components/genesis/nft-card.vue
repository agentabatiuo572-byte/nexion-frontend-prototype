<!-- NFTCard — .nft-card: gradient art + mono id + price/ago (genesis/page.tsx NFTCard live-market). -->
<template>
  <view class="relative overflow-hidden" :style="cardStyle">
    <view class="flex items-center justify-center" :style="artStyle">
      <text>#{{ id }}</text>
    </view>
    <text class="block" :style="idLineStyle">NEX-GEN-{{ paddedId }}</text>
    <view class="flex items-baseline justify-between" style="margin-top: 6px">
      <text class="tabular-nums" :style="priceStyle">${{ price }}K</text>
      <text :style="agoStyle">{{ agoText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";

const props = defineProps<{ id: number; price: number; ago: string }>();

const t = useT();
const paddedId = computed(() => props.id.toString().padStart(4, "0"));
const agoText = computed(() => fmt(t.value.genesis.agoLabel, { t: props.ago }));

// Collectible tile — filled surface, no border (single visual difference); the
// gradient art is the NFT's own visual identity.
const cardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "14px",
  padding: "12px",
};
const artStyle: CSSProperties = {
  height: "100px",
  borderRadius: "10px",
  background:
    "radial-gradient(60% 60% at 30% 30%, rgba(255,203,148,0.35), transparent 70%)," +
    "radial-gradient(80% 80% at 80% 80%, rgba(124,80,200,0.55), transparent 70%)," +
    "linear-gradient(135deg, var(--v5-brand) 0%, #7250C8 100%)",
  color: "var(--v5-ink)",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.018em",
};
const idLineStyle: CSSProperties = {
  marginTop: "10px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const priceStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.014em",
};
const agoStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
</script>
