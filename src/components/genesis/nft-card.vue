<!-- Live Genesis listing artwork keeps the supplied token identity. -->
<template>
  <view class="nx-glass-card relative overflow-hidden" :style="cardStyle">
    <GenesisArtwork context="holding" :serial="id" style="border-radius: 10px" />
    <view class="flex items-baseline justify-between" style="margin-top: 6px">
      <text class="tabular-nums" :style="priceStyle">${{ price }}K</text>
      <text :style="agoStyle">{{ agoText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { displayGenesisHoldingId } from "@/lib/genesis-holding-id";
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";

const props = defineProps<{ id: string | number; price: number; ago: string }>();

const t = useT();
const agoText = computed(() => fmt(t.value.genesis.agoLabel, { t: props.ago }));

// Collectible tile — filled surface, no border (single visual difference); the
// gradient art is the NFT's own visual identity.
const cardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
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

import GenesisArtwork from "@/components/genesis/genesis-artwork.vue";
</script>
