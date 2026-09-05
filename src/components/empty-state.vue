<!--
  EmptyState —《06 缺省页规范》的唯一实现。7 种状态共用一个组件:
  插画 + 一句话标题 + 说明 + 可选 CTA,垂直居中。

  🔵 规范铁律:禁白屏 / 空容器 / 通用转圈兜底 —— 任何空数据都给 composed 引导态。
  插画按 data-theme 取 dark / light 两版:src 走 useTheme().resolved 的 computed,
  主题切换时会跟着重算(不是挂载时算一次)。

  加载态**不用**这个组件(规范 §3:加载走 skeleton,要匹配真实布局形状)。
  表单字段校验错误也不用(规范 §4:inline 就地提示,不升整页缺省页)。
-->
<template>
  <view class="nx-empty" :style="rootStyle">
    <image class="nx-empty__art" :src="artSrc" mode="aspectFit" :style="artStyle" />
    <text class="nx-empty__title" :style="titleStyle">{{ title }}</text>
    <text v-if="desc" class="nx-empty__desc" :style="descStyle">{{ desc }}</text>
    <view
      v-if="ctaLabel"
      class="nx-empty__cta active:opacity-90 transition-opacity"
      :style="ctaStyle"
      role="button"
      tabindex="0"
      :aria-label="ctaLabel"
      @click="emit('cta')"
      @keydown.enter.prevent="emit('cta')"
      @keydown.space.prevent="emit('cta')"
    >
      <text :style="ctaTextStyle">{{ ctaLabel }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useTheme } from "@/store/theme";

// 与 UI/缺省页/assets/ 下的文件名一一对应
export type EmptyKind =
  | "empty-list"
  | "no-search-results"
  | "no-filter-results"
  | "no-owned-asset"
  | "locked-or-no-permission"
  | "network-offline"
  | "recoverable-error";

const props = withDefaults(
  defineProps<{
    kind: EmptyKind;
    title: string;
    desc?: string;
    ctaLabel?: string;
    /** 转化型状态(no-owned-asset)把 CTA 做成实心品牌色,其余用 L1 surface 底(缺省页坐在页面底上) */
    emphasis?: boolean;
    /** 嵌在卡片/小容器里时收窄纵向留白 */
    compact?: boolean;
  }>(),
  { emphasis: false, compact: false },
);

const emit = defineEmits<{ (e: "cta"): void }>();

const theme = useTheme();
const artSrc = computed(() => `/static/img/empty/${theme.resolved}/${props.kind}.png`);

const rootStyle = computed<CSSProperties>(() => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: props.compact ? "24px 24px" : "40px 24px",
}));
// 《06》§1:插画 112–160px
const artStyle = computed<CSSProperties>(() => ({
  width: props.compact ? "112px" : "144px",
  height: props.compact ? "112px" : "144px",
}));
const titleStyle: CSSProperties = {
  marginTop: "12px",
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  lineHeight: "28px",
  fontWeight: 600,
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
};
const descStyle: CSSProperties = {
  marginTop: "6px",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  lineHeight: "18px",
  color: "var(--v5-ink-3)",
  maxWidth: "260px",
  textWrap: "pretty",
};
// CTA 是 pill button 不是文字链;转化型不弱化(《06》§3)
const ctaStyle = computed<CSSProperties>(() => ({
  marginTop: "16px",
  minHeight: "44px",
  padding: "0 20px",
  borderRadius: "999px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  // 缺省页坐在页面底上,弱 CTA 原 surface-2 与页面底同色不可辨(亮色 ΔE 2.2),改 L1 surface。
  background: props.emphasis ? "var(--v5-brand)" : "var(--v5-surface)",
}));
const ctaTextStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
  color: props.emphasis ? "var(--v5-on-brand)" : "var(--v5-ink-2)",
}));
</script>
