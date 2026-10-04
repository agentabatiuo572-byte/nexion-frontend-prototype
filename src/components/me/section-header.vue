<!--
  SectionHeader (me) — ported from me/page.tsx SectionHeader.
  Strict port of styles-v5.css .tech-sec-h: title (display 600 15 -0.012 ink) +
  optional count (mono 11.5 ink-3) + optional right link (display 500 13 ink-3 +
  chevron). The link navigates via `link` (uni route) with fail:()=>{} for
  not-yet-ported targets.
-->
<template>
  <!-- 🔴 margin 必须跟着链接走:44pt 热区只在有链接时存在,而 margin 曾被无条件减掉 10px ——
       me 页 6 个 header 里 5 个没链接,行高还是 18px,标题到内容的间距从 12px 塌到 2px
       (独立验收 agent 抓出)。
       有链接:12 + 44 + 2 = 58 ≈ 原 52;无链接:22 + 18 + 12 = 52,与改动前完全一致。 -->
  <view class="flex items-center justify-between" :style="{ margin: hasLink ? '12px 2px 2px' : '22px 2px 12px' }">
    <view class="inline-flex items-center" style="gap: 8px">
      <text style="font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-ink); letter-spacing: -0.012em">{{ title }}</text>
      <text v-if="count" style="font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; font-weight: 400; color: var(--v5-ink-3)">{{ count }}</text>
    </view>
    <!-- 《07》tap≥44 + 《08》§2:这个链接全站 me 域复用,原先热区只有文字高、按下也零反馈。
         🔴 热区只向**左**扩:先试过「两侧 padding + 负 margin 抵消」,右侧负 margin 让元素越过
         父容器右边界,溢出探针实测 me 页新增 2 处横向溢出。左侧是 justify-between 留出的空白,
         往那边扩不碰任何东西,右边缘则原地不动。 -->
    <view v-if="link && linkLabel" class="inline-flex items-center gap-0.5 active:opacity-60 transition-opacity" style="font-family: var(--font-v5); font-weight: 500; font-size: 13px; color: var(--v5-ink-3); min-height: 44px; padding-left: 20px" :data-me-action="link ? `section:${link}` : undefined" role="button" tabindex="0" :aria-label="linkLabel" @click="go" @keydown.enter.prevent="go" @keydown.space.prevent="go">
      <text>{{ linkLabel }}</text>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed } from "vue";

const props = defineProps<{
  title: string;
  count?: string;
  link?: string;
  linkLabel?: string;
}>();

const hasLink = computed(() => !!props.link && !!props.linkLabel);

function go() {
  if (!props.link) return;
  navTo(props.link);
}
</script>
