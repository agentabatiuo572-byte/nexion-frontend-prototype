<!--
  WalletListRow — local iOS-list row primitive (inlines source IOSListItem for
  the wallet page; the original component isn't ported). Icon chip (28px, tinted
  bg via icon-bg prop) + label + optional sublabel + optional right value slot +
  optional chevron. Rows draw a top divider except the first (`first`). When
  `href` is set the whole row navigates (fail:()=>{} for not-yet-ported targets).
-->
<template>
  <!-- 可交互 = 自带 href(内部导航)**或**父层挂了 @click(如 wallet 的「锁定收益」开弹层)。
       原先两个判定都只看 href:纯展示行照样绑 click(点了没反应 = 死控件),
       而用 @click 的行有监听器却拿不到按下反馈。现在统一由 interactive 决定两件事。 -->
  <view class="flex items-center transition" :class="{ 'active:bg-[var(--v5-surface-2)]': interactive }" :style="rowStyle" :role="interactive ? (href ? 'link' : 'button') : undefined" :tabindex="interactive ? 0 : undefined" v-on="href ? { click: go } : {}">
    <view class="grid place-items-center shrink-0" :style="iconChipStyle">
      <slot name="icon" />
    </view>
    <view class="flex-1 min-w-0" style="padding-top: 8px; padding-bottom: 8px">
      <text class="block" :style="labelStyle">{{ label }}</text>
      <text v-if="sublabel" class="block truncate" :style="sublabelStyle">{{ sublabel }}</text>
    </view>
    <view v-if="hasValue" class="shrink-0 text-right" :style="valueWrapStyle">
      <slot name="value" />
    </view>
    <svg v-if="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="margin-left: 6px"><path d="m9 18 6-6-6-6" /></svg>
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, useAttrs, useSlots, type CSSProperties } from "vue";

const props = withDefaults(
  defineProps<{
    label: string;
    sublabel?: string;
    iconBg?: string;
    first?: boolean;
    chevron?: boolean;
    href?: string;
  }>(),
  { first: false, chevron: false },
);

const slots = useSlots();
const attrs = useAttrs();
const hasValue = computed(() => !!slots.value);
// 父层的 @click 会 fallthrough 到根元素上,所以它也算「这行可点」
const interactive = computed(() => !!props.href || !!attrs.onClick);

function go() {
  if (!props.href) return;
  navTo(props.href);
}

// Content aligns to the transparent group's gutter (page 16px + 2px inset); the
// row's own horizontal padding is dropped so it no longer double-insets.
const rowStyle = computed<CSSProperties>(() => ({
  gap: "12px",
  minHeight: "44px",
  padding: "0",
  borderTop: props.first ? "none" : "1px solid var(--v5-border)",
}));
const iconChipStyle = computed<CSSProperties>(() => ({
  width: "28px",
  height: "28px",
  borderRadius: "7px",
  background: props.iconBg ?? "var(--v5-surface-2)",
}));
const labelStyle: CSSProperties = {
  fontSize: "15px",
  lineHeight: 1.25,
  color: "var(--v5-ink)",
};
const sublabelStyle: CSSProperties = {
  marginTop: "2px",
  fontSize: "12px",
  lineHeight: 1.375,
  color: "var(--v5-ink-3)",
};
const valueWrapStyle: CSSProperties = {
  marginLeft: "8px",
  maxWidth: "160px",
};
</script>
