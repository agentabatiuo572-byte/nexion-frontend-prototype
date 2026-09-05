<!--
  VBadgeIcon — ported from Nexion-prototype/app/components/v3/v-badge.tsx (VBadgeIcon).
  Square V-rank chip showing just the level digit; colour climbs with level.
  Used by rank-how.vue's 13-rank ladder. <div>→<view>, digit leaf→<text>.
-->
<template>
  <view class="rounded-xl grid place-items-center font-display tabular-nums" :style="boxStyle">
    <text :style="digitStyle">{{ v }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { VRank } from "@/store/v-rank";

const props = withDefaults(defineProps<{ v: VRank; size?: number }>(), { size: 32 });

interface ColorSpec {
  bg: string;
  text: string;
}

const COLORS: Record<number, ColorSpec> = {
  // V 军衔色阶(2026-07-23 C1 重定)。原表 text 一半走 token、一半写死**亮色**
  // (#B0B8C5 / #D4FF55 / #A88FFF / #FFCB5F …)——那批是照暗主题调的,落到亮主题的
  // 卡面上实测最低 **1.59:1**(V1),等于看不见;且 3/5/7 档 token 文字 + 字面底色
  // 在亮主题下还异色系(蓝字柠檬底 / 青字紫底)。
  // 现改为**每档 bg / text 同源于一个 token**:同族内靠透明度爬坡区分档位,
  // 徽章内部两个主题下都同色系且都跟主题。
  // ⚠️ 5-9 档的绝对对比度仍受限于亮主题语义色本身的取值(warning 2.79 / tech-cyan 1.88,
  //    = 待拍板项 A2「亮主题语义色整体不达 AA」),那是 token 值层面的问题,不在本组件;
  //    A2 定案后这里自动跟着变好,无需再改本表。
  0: { bg: "color-mix(in srgb, var(--v5-ink-3) 15%, transparent)", text: "var(--v5-ink-3)" },
  1: { bg: "color-mix(in srgb, var(--v5-ink-3) 18%, transparent)", text: "var(--v5-ink-2)" },
  2: { bg: "color-mix(in srgb, var(--v5-ink-3) 20%, transparent)", text: "var(--v5-ink)" },
  3: { bg: "color-mix(in srgb, var(--v5-brand) 12%, transparent)", text: "var(--v5-brand)" },
  4: { bg: "color-mix(in srgb, var(--v5-brand) 16%, transparent)", text: "var(--v5-brand-deep)" },
  5: { bg: "color-mix(in srgb, var(--v5-tech-cyan) 18%, transparent)", text: "var(--v5-tech-cyan)" },
  6: { bg: "color-mix(in srgb, var(--v5-nex) 22%, transparent)", text: "var(--v5-nex)" },
  7: { bg: "color-mix(in srgb, var(--v5-warning) 18%, transparent)", text: "var(--v5-warning)" },
  8: { bg: "color-mix(in srgb, var(--v5-warning) 22%, transparent)", text: "var(--v5-warning)" },
  9: { bg: "color-mix(in srgb, var(--v5-brand-2) 26%, transparent)", text: "var(--v5-brand-2)" },
  10: { bg: "linear-gradient(135deg,var(--v5-brand) 0%,var(--v5-tech-cyan) 100%)", text: "var(--v5-ink)" },
  11: { bg: "linear-gradient(135deg,var(--v5-tech-cyan) 0%,var(--v5-warning) 100%)", text: "var(--v5-ink)" },
  12: { bg: "linear-gradient(135deg,var(--v5-warning) 0%,var(--v5-brand-2) 50%,var(--v5-brand) 100%)", text: "var(--v5-ink)" },
};

const c = computed(() => COLORS[props.v]);

const boxStyle = computed<CSSProperties>(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  background: c.value.bg,
  color: c.value.text,
}));
const digitStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: `${props.size * 0.45}px`,
  color: c.value.text,
}));
</script>
