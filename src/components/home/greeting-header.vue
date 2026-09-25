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

// Read the local hour on mount, while keeping the wording reactive to locale changes.
const hour = ref(new Date().getHours());
onMounted(() => {
  hour.value = new Date().getHours();
});
const greeting = computed(() =>
  hour.value < 5
    ? t.value.home.greetingLateNight
    : hour.value < 12
      ? t.value.home.greetingMorning
      : hour.value < 18
        ? t.value.home.greetingAfternoon
        : t.value.home.greetingEvening,
);

// 兜底用品牌名是原设计(没设昵称时问候语显示品牌)。"Stellar" 是旧品牌,改名批次漏网 —— 它藏在
// 兜底值里而不是显示文案里,当时的 grep 没扫到。
const firstName = computed(() => (profile.displayName || "UVEL").split(" ")[0]);
const greetingLine = computed(() => `${greeting.value}, ${firstName.value}`);
</script>
