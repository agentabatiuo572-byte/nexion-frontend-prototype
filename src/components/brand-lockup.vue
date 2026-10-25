<!-- Official UVEL Brand Kit 2026-10-21. Keep the artwork intact and switch by page background. -->
<template>
  <!-- role/aria-label:换成图片后读屏就读不到品牌名了(换之前是 <text>UVEL</text>)。
       页眉那处是装饰(页面另有上下文),调用方传 aria-hidden 覆盖即可,后来的属性优先。 -->
  <view class="nx-brand-lockup" :style="boxStyle" role="img" aria-label="UVEL">
    <image v-if="props.variant === 'mark'" class="nx-brand-lockup__img" src="/static/img/brand/uvel-symbol.png" mode="aspectFit" />
    <image v-else class="nx-brand-lockup__img nx-brand-lockup__img--light" :src="src.light" mode="aspectFit" />
    <image v-if="props.variant === 'lockup'" class="nx-brand-lockup__img nx-brand-lockup__img--dark" :src="src.dark" mode="aspectFit" />
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { brandLockupBox, type BrandVariant } from "@/lib/brand-lockup-size";

const props = withDefaults(defineProps<{ height?: number; variant?: BrandVariant }>(), {
  height: 40,
  variant: "lockup",
});

// Shared aspect ratios and minimum readable size match the selected kit assets.
const boxStyle = computed(() => {
  const box = brandLockupBox(props.height, props.variant);
  return { width: `${box.width}px`, height: `${box.height}px` };
});

const src = { light: "/static/img/brand/header-logo-light.png", dark: "/static/img/brand/header-logo-dark.png" };
</script>

<style scoped>
.nx-brand-lockup {
  position: relative;
  display: block;
  flex-shrink: 0;
}
.nx-brand-lockup__img {
  width: 100%;
  height: 100%;
  display: block;
}
.nx-brand-lockup__img--dark {
  display: none;
}
:global(:root:not([data-theme="light"]) .nx-brand-lockup__img--light) {
  display: none;
}
:global(:root:not([data-theme="light"]) .nx-brand-lockup__img--dark) {
  display: block;
}
</style>
