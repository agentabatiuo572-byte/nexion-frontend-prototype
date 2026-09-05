<!-- CalloutBox — accent 14% 混 surface 的底 + ink-2 正文,零 border(《03》§3/§6)。
     底色公式与实测数据见下方 boxStyle 上的注释。 -->
<template>
  <view :style="boxStyle">
    <text class="block" :style="titleStyle">{{ title }}</text>
    <text class="block" :style="bodyStyle">{{ body }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

type Accent = "lemon" | "purple" | "amber" | "violet" | "nex";

const props = withDefaults(defineProps<{ title: string; body: string; tone?: Accent }>(), { tone: "amber" });

const ACCENT_TEXT: Record<Accent, string> = {
  nex: "var(--v5-nex)",
  lemon: "var(--v5-success)",
  purple: "var(--v5-brand)",
  amber: "var(--v5-warning)",
  violet: "var(--v5-brand-2)",
};
// 零-border(《03》§3 + §6):原文件头自称「accent-callout 例外」——那句写于
// 2026-07-09「有条件例外一律收回」终裁之前,现已作废。callout 一律零 border,
// 边界靠底色与页面地板的**亮度差**表达(ACCENT_BORDER 表随之无消费者,已删)。
//
// 🔴 底色从 `--v5-*-soft` 改为 `color-mix(accent 14%, --v5-surface)`(2026-07-23 C2 第二轮,
// 主人拍板)。根因:soft token 在**亮主题**是暖色不透明浅调,压在暖米色页面地板
// (var(--v5-bg))上亮度差趋近 0 —— 删掉 border 后边界只剩色相撑,违反《03》§4
// 「相邻层亮度差可辨」。
//
// 实测(真实渲染元素 · 边界对比 = 卡底 vs 父底):
//   暗主题 全部改善:1.39 ~ 1.55(卡比地板**亮**,签名 ΔY +1.96 ~ +2.76)
//   亮主题 卡比地板**暗**(签名 ΔY 全为负):✓ 1.112 · nex 1.057 · ⚠️amber **1.022**
//
// ⚠️ 三条如实记,别被上面的改善数字误导(独立验收 v2 逐条纠正过我的初版描述):
//  1. 亮主题的机制**不是**「surface 比地板亮所以产生正亮度差」—— 混入 14% accent 后
//     结果比地板**暗**,是负亮度差。方向说反了,现已改正。
//  2. **amber 在亮主题等于没修**(边界对比 1.02)。它还是本组件的**默认 tone**、实例最多。
//  3. 暗主题标题对比变动实测 0.58(不是初版写的 ≤0.15 —— 那只验了亮主题)。
//
// 为什么 amber 不能靠加深底色救(已算过,别再试):加深会同步压低标题对比,而标题用的
// 就是同一族 accent —— 14%/26%/40% 对应 边界 1.02/1.16/1.36,标题 2.74/2.41/2.06,
// 标题本来就已低于 AA 4.5。改用 `--v5-warning-ink` 档做标题可到 4.42(lemon 4.25 /
// violet 4.33),但 ink token 是照**纯白底**调到 4.5 的,一加 tint 就掉到 AA 线下。
// ⇒ **根因在 token 层不在本组件**,归待拍板项 A2「亮主题语义色整体不达 AA」;
//    A2 若定义出「tint 底上的 ink 档」,本组件无需再改就会自动达标。
//
// ⚠️ 改这里必须先实测**双主题**对比度 —— 本轮踩过「换底色反而把对比度打下去」的坑。
const boxStyle = computed<CSSProperties>(() => ({
  marginTop: "10px",
  background: `color-mix(in srgb, ${ACCENT_TEXT[props.tone]} 14%, var(--v5-surface))`,
  borderRadius: "12px",
  padding: "10px 14px",
}));
const titleStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: ACCENT_TEXT[props.tone],
}));
const bodyStyle: CSSProperties = {
  marginTop: "2px",
  fontSize: "12px",
  color: "var(--v5-ink-2)",
  lineHeight: 1.5,
};
</script>
