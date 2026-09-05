<!--
  PreferenceToggleRow — icon box + label/hint + iOS-style switch. Ported from the
  inline ToggleRow in Nexion-prototype me/preferences/page.tsx. Icon goes in the
  `icon` slot; tapping the whole row emits `toggle`. Switch knob is a hardware-
  replica white pill (intentional, both themes).
-->
<template>
  <view class="flex items-start active:bg-[var(--v5-surface-2)] transition" :style="rowStyle" @click="emit('toggle')">
    <view class="grid place-items-center shrink-0" :style="iconBoxStyle">
      <slot name="icon" />
    </view>
    <view class="min-w-0" style="flex: 1">
      <text class="block" :style="labelStyle">{{ label }}</text>
      <text v-if="hint" class="block" :style="hintStyle">{{ hint }}</text>
    </view>
    <view class="shrink-0 relative" :style="switchTrackStyle">
      <view :style="knobStyle" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";

const props = withDefaults(
  defineProps<{ label: string; hint?: string; value: boolean; last?: boolean }>(),
  { last: false },
);
const emit = defineEmits<{ toggle: [] }>();

const rowStyle = computed<CSSProperties>(() => ({
  gap: "12px",
  padding: "12px 14px",
  borderBottom: props.last ? "none" : "1px solid var(--v5-border)",
}));
const iconBoxStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "6px",
  background: "var(--v5-surface-2)",
};
const labelStyle: CSSProperties = { fontSize: "13px", fontWeight: 500, color: "var(--v5-ink)" };
const hintStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px", lineHeight: 1.375 };
const switchTrackStyle = computed<CSSProperties>(() => ({
  width: "36px",
  height: "20px",
  borderRadius: "999px",
  padding: "2px",
  // 关闭态用 surface-3(《03》L0-L3 阶梯里的「recessed input / inset」,语义即内凹槽)。
  // 原值 --v5-surface 与本行所在的设置卡同色 → 亮色下白轨+白圆点+白卡三层同色,
  // 整个开关消失;暗色下轨道也隐形只剩一个悬空白点。surface-3 对卡片 ΔE 9.1(亮)/
  // 10.7(暗),两个主题都一眼可辨。
  background: props.value ? "var(--v5-brand)" : "var(--v5-surface-3)",
}));
const knobStyle = computed<CSSProperties>(() => ({
  display: "block",
  width: "16px",
  height: "16px",
  borderRadius: "999px",
  background: "#FFFFFF",
  transform: props.value ? "translateX(16px)" : "translateX(0)",
  transition: "transform 150ms ease",
}));
</script>
