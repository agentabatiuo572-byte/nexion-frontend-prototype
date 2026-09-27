<!-- Live Genesis listing artwork keeps the supplied token identity. -->
<template>
  <view class="relative overflow-hidden" :style="cardStyle">
    <GenesisArtwork context="holding" :serial="id" style="border-radius: 10px" />
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
import GenesisArtwork from "@/components/genesis/genesis-artwork.vue";

const props = defineProps<{ id: number; price: number; ago: string }>();

const t = useT();
const agoText = computed(() => fmt(t.value.genesis.agoLabel, { t: props.ago }));

// Collectible tile — filled surface, no border.
const cardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "14px",
  padding: "12px",
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
