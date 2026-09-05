<!--
  GreetingHeader — ZONE 1 top-of-home greeting (ported from mission-control.tsx
  GreetingHeader). Time-of-day greeting line only ("早上好, Alex").
-->
<template>
  <view class="px-1">
    <text class="block" style="font-family: var(--font-v5); font-size: 20px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.15; color: var(--v5-ink)">{{ greetingLine }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useT } from "@/i18n/use-t";
import { useProfile } from "@/store/profile";

const t = useT();
const profile = useProfile();

// Time-of-day greeting depends on the client's local hour → compute on mount
// (SPA, no SSR hydration concern; mirrors the source's mount-effect).
const greeting = ref("");
onMounted(() => {
  const h = new Date().getHours();
  greeting.value =
    h < 5
      ? t.value.home.greetingLateNight
      : h < 12
        ? t.value.home.greetingMorning
        : h < 18
          ? t.value.home.greetingAfternoon
          : t.value.home.greetingEvening;
});

// 兜底用品牌名是原设计(没设昵称时问候语显示品牌)。"Stellar" 是旧品牌,改名批次漏网 —— 它藏在
// 兜底值里而不是显示文案里,当时的 grep 没扫到。
const firstName = computed(() => (profile.displayName || "NexGrid").split(" ")[0]);
const greetingLine = computed(() => `${greeting.value}, ${firstName.value}`);
</script>
