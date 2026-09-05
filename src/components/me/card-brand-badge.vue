<!--
  CardBrandBadge — ported from me/wallet/topup/page.tsx CardBrandBadge.
  Small auto-detected brand chip. The bg hex values are official card-brand
  colors (a design asset, like the QR B/W contrast), NOT theme tokens — kept
  literal on purpose so VISA navy / MC red read correctly in both themes.
-->
<template>
  <text class="shrink-0 inline-block tabular-nums" :style="badgeStyle">{{ label }}</text>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = defineProps<{ brand: "visa" | "mc" | "amex" | "unknown" }>();

const STYLES: Record<string, { bg: string; label: string }> = {
  visa: { bg: "#1A1F71", label: "VISA" },
  mc: { bg: "#EB001B", label: "MC" },
  amex: { bg: "#2E77BB", label: "AMEX" },
  unknown: { bg: "var(--v5-surface-3)", label: "•••" },
};

const label = computed(() => STYLES[props.brand].label);
const badgeStyle = computed<CSSProperties>(() => ({
  padding: "2px 6px",
  borderRadius: "4px",
  background: STYLES[props.brand].bg,
  color: props.brand === "unknown" ? "var(--v5-ink-3)" : "#ffffff",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "0.06em",
}));
</script>
