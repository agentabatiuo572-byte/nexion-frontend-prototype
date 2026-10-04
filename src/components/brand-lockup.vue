<!--
  BrandLockup —— 官方品牌标识的唯一渲染出口(2026-08-31 批准包)。

  为什么是组件不是各页自己拼:改 logo 前,登录 / 注册 / 条款 / 邀请落地 / 贡献证明卡
  五个地方各写了一份「深色方块 + 字母 N + 文字 UVEL」,字号圆角各不相同,换标要改五遍
  还必然漏(本轮就是先只发现两处,换个搜法才捞全)。资产收进这里后,以后换标只动这一个文件。

  两个档位对应批准包的两个批准尺寸,比例写死,容器按 height 反算宽 —— 容器与图同比,
  aspectFit 才不会在盒子里留透明边(头部 logo 踩过:96px 盒子装 2.967:1 的图,左右各留 8px)。
    lockup = 横版(图形 + UVEL 字标),用在纯品牌行;
    mark   = 纯图形,用在「标 + 页面标题」这种字标位已被占用的地方。

  深浅两版成对渲染、按根节点 data-theme 切换 —— 与 app-chassis 顶部品牌行同机制。
  chassis 与 onboarding/intro 仍是各自内联的同款写法:它们一个是全站外壳、一个带首屏动画,
  本轮不动以免把风险面扩大;后续可收编进本组件。
-->
<template>
  <!-- role/aria-label:换成图片后读屏就读不到品牌名了(换之前是 <text>UVEL</text>)。
       页眉那处是装饰(页面另有上下文),调用方传 aria-hidden 覆盖即可,后来的属性优先。 -->
  <view class="nx-brand-lockup" :style="boxStyle" role="img" aria-label="UVEL">
    <image class="nx-brand-lockup__img nx-brand-lockup__img--light" :src="src.light" mode="aspectFit" />
    <image class="nx-brand-lockup__img nx-brand-lockup__img--dark" :src="src.dark" mode="aspectFit" />
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { brandLockupBox, type BrandVariant } from "@/lib/brand-lockup-size";

const props = withDefaults(defineProps<{ height?: number; variant?: BrandVariant }>(), {
  height: 40,
  variant: "lockup",
});

// 盒子尺寸(含批准包写死的最小渲染尺寸下限)全在 lib/brand-lockup-size.ts —— 那边有红测盯着,
// 改反了会当场红。这里只负责把算出来的数变成样式。
const boxStyle = computed(() => {
  const box = brandLockupBox(props.height, props.variant);
  return { width: `${box.width}px`, height: `${box.height}px` };
});

const src = computed(() =>
  props.variant === "lockup"
    ? { light: "/static/img/brand/header-logo-light.png", dark: "/static/img/brand/header-logo-dark.png" }
    : { light: "/static/img/brand/app-icon-light.png", dark: "/static/img/brand/app-icon-dark.png" },
);
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
