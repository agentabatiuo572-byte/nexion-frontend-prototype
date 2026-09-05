<!--
  HowSection — de-carded section block: accent icon chip + 15/600 title sitting
  on the page floor, body content below (was a surface+border card — dropped in
  the 2026-07 de-card sweep; whitespace does the separating now). The icon is
  provided via the `icon` slot (inline <svg stroke="currentColor">) so colour
  inherits the accent. Accent: lemon=success / amber=warning / purple=brand /
  violet=brand-2.
-->
<template>
  <view class="mx-4 mt-5" :style="cardStyle">
    <view class="flex items-center" style="gap: 10px; margin-bottom: 14px">
      <view class="grid place-items-center shrink-0" :style="chipStyle">
        <slot name="icon" />
      </view>
      <text :style="titleStyle">{{ title }}</text>
    </view>
    <slot />
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

type Accent = "lemon" | "purple" | "amber" | "violet" | "nex";

const props = withDefaults(defineProps<{ title: string; accent?: Accent }>(), { accent: "lemon" });

const ACCENT_TEXT: Record<Accent, string> = {
  nex: "var(--v5-nex)",
  lemon: "var(--v5-success)",
  purple: "var(--v5-brand)",
  amber: "var(--v5-warning)",
  violet: "var(--v5-brand-2)",
};
const ACCENT_SOFT: Record<Accent, string> = {
  nex: "var(--v5-nex-soft)",
  lemon: "var(--v5-success-soft)",
  purple: "var(--v5-brand-soft)",
  amber: "var(--v5-warning-soft)",
  violet: "var(--v5-brand-2-soft)",
};

// Transparent block — mt-5 (20px) + 16px top padding = 36px section rhythm
// (owner 2026-07-09: sections still cramped, reference Alipay/Binance grouping).
const cardStyle: CSSProperties = {
  padding: "16px 2px 0",
};
// Icon chip: soft tint only, no border (inner-element rule).
const chipStyle = computed<CSSProperties>(() => ({
  width: "32px",
  height: "32px",
  borderRadius: "10px",
  background: ACCENT_SOFT[props.accent],
  color: ACCENT_TEXT[props.accent],
}));
// Section title in the page's accent colour (owner 2026-07-09: headings must
// read as a different colour from body text, not just a different weight).
const titleStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.014em",
  color: ACCENT_TEXT[props.accent],
}));
</script>
