<!--
  HowHero — shared "How it works" page hero (ported from
  Nexion-prototype/app/components/how-it-works/parts.tsx HowHero).
  3-layer aurora (per accent) + 24px grid overlay + accent code-tag chip +
  Page H1 26/600 + Body 13.5. Accent: lemon=success / amber=warning /
  purple=brand / violet=brand-2.
-->
<!-- Header→content breathing is owned by SubPageHeader's margin-bottom (global);
     hero adds none of its own so every sub-page matches. -->
<template>
  <view class="mx-4 relative overflow-hidden" :style="cardStyle">
    <view aria-hidden class="gen-anim" :style="auroraStyle" />
    <view aria-hidden :style="gridStyle" />
    <view class="relative">
      <text :style="chipStyle">{{ label }}</text>
      <text class="block" :style="titleStyle">{{ title }}</text>
      <text class="block" :style="subStyle">{{ sub }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

type Accent = "lemon" | "purple" | "amber" | "violet" | "nex";

const props = withDefaults(defineProps<{ label: string; title: string; sub: string; accent?: Accent }>(), {
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
const AURORA: Record<Accent, string> = {
  nex:
    "radial-gradient(40% 50% at 80% 20%, var(--v5-nex-soft) 0%, transparent 60%)," +
    "radial-gradient(40% 50% at 10% 80%, var(--v5-brand-soft) 0%, transparent 60%)," +
    "radial-gradient(35% 45% at 70% 90%, rgba(255,203,148,0.20) 0%, transparent 60%)",
  lemon:
    "radial-gradient(40% 50% at 80% 20%, var(--v5-success-soft) 0%, transparent 60%)," +
    "radial-gradient(40% 50% at 10% 80%, var(--v5-tech-cyan-soft) 0%, transparent 60%)," +
    "radial-gradient(35% 45% at 70% 90%, rgba(255,203,148,0.20) 0%, transparent 60%)",
  amber:
    "radial-gradient(40% 50% at 80% 20%, var(--v5-warning-soft) 0%, transparent 60%)," +
    "radial-gradient(40% 50% at 10% 80%, var(--v5-brand-2-soft) 0%, transparent 60%)," +
    "radial-gradient(35% 45% at 70% 90%, rgba(255,203,148,0.25) 0%, transparent 60%)",
  purple:
    "radial-gradient(40% 50% at 80% 20%, var(--v5-tech-cyan-soft) 0%, transparent 60%)," +
    "radial-gradient(40% 50% at 10% 80%, var(--v5-brand-soft) 0%, transparent 60%)," +
    "radial-gradient(35% 45% at 70% 90%, rgba(255,203,148,0.20) 0%, transparent 60%)",
  violet:
    "radial-gradient(40% 50% at 80% 20%, var(--v5-brand-2-soft) 0%, transparent 60%)," +
    "radial-gradient(40% 50% at 10% 80%, var(--v5-brand-soft) 0%, transparent 60%)," +
    "radial-gradient(35% 45% at 70% 90%, rgba(255,203,148,0.20) 0%, transparent 60%)",
};

// 零-border(《03》§3):带 surface 填充的卡片不描边,层级靠 surface 微差色 +
// 内部 aurora/grid 表达(参照 Today's earnings card)。
const cardStyle: CSSProperties = {
  padding: "22px",
  borderRadius: "16px",
  background: "var(--v5-surface)",
};
const auroraStyle = computed<CSSProperties>(() => ({
  position: "absolute",
  inset: "-20%",
  background: AURORA[props.accent],
  filter: "blur(8px)",
  pointerEvents: "none",
  opacity: 0.85,
  animation: "v5-aurora-drift 14s ease-in-out infinite",
}));
const gridStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage:
    // 网格线跟随 ink:抄亮主题字面值时暗主题下 4% 近黑落在近黑卡面上 = 纹理消失
    "linear-gradient(to right, color-mix(in srgb, var(--v5-ink) 4%, transparent) 1px, transparent 1px)," +
    "linear-gradient(to bottom, color-mix(in srgb, var(--v5-ink) 4%, transparent) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  pointerEvents: "none",
};
const chipStyle = computed<CSSProperties>(() => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 9px",
  borderRadius: "999px",
  background: ACCENT_SOFT[props.accent],
  color: ACCENT_TEXT[props.accent],
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
}));
const titleStyle: CSSProperties = {
  marginTop: "14px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "26px",
  letterSpacing: "-0.022em",
  lineHeight: 1.2,
  color: "var(--v5-ink)",
};
const subStyle: CSSProperties = {
  marginTop: "10px",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink-2)",
  lineHeight: 1.55,
};
</script>
