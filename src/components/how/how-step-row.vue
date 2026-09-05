<!-- StepRow — numbered accent circle + title + body (how-it-works/parts.tsx StepRow).
     Alipay/Binance pattern (owner 2026-07-09): the number and title share one
     items-center row so the digit's optical centre lines up with the title's
     first line; the body indents 40px (28px circle + 12px gap) to sit under the
     title, not under the number. Number centering is inline (grid+placeItems) so
     it never depends on utility-class order. -->
<template>
  <view class="nx-how-step">
    <view class="flex items-center" style="gap: 12px">
      <text class="shrink-0 font-mono-tabular" :style="numStyle">{{ n }}</text>
      <text class="flex-1 min-w-0" :style="titleStyle">{{ title }}</text>
    </view>
    <text class="block" :style="bodyStyle">{{ body }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

type Accent = "lemon" | "purple" | "amber" | "violet" | "nex";

const props = withDefaults(defineProps<{ n: number; title: string; body: string; accent?: Accent }>(), {
  accent: "lemon",
});

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

// Numbered circle: soft tint only, no border (inner-element rule).
// display/placeItems inline so centering never depends on class order.
const numStyle = computed<CSSProperties>(() => ({
  display: "grid",
  placeItems: "center",
  width: "28px",
  height: "28px",
  borderRadius: "999px",
  background: ACCENT_SOFT[props.accent],
  color: ACCENT_TEXT[props.accent],
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "12px",
  lineHeight: 1,
  letterSpacing: "-0.005em",
}));
// Typography pass 2026-07-08 (owner: prose was a wall of text) — title up to
// 13.5, body up to 13/1.62 in ink-2, wider title→body gap.
const titleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  lineHeight: 1.4,
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};
// Body indents 40px (28px number + 12px gap) so it aligns under the title.
const bodyStyle: CSSProperties = {
  marginTop: "6px",
  marginLeft: "40px",
  fontSize: "13px",
  color: "var(--v5-ink-2)",
  lineHeight: 1.62,
};
</script>

<style scoped>
/* Hairline between steps + extra air (owner 2026-07-08: more breathing +
   a subtle divider between units). Component-scoped so all 10 call sites
   get it without touching their gap containers; :first/:last trim the ends. */
.nx-how-step {
  padding: 6px 0 13px;
  border-bottom: 1px solid var(--v5-border);
}
.nx-how-step:first-child {
  padding-top: 0;
}
.nx-how-step:last-child {
  padding-bottom: 0;
  border-bottom: none;
}
</style>
