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
import { homeGreetingName } from "./home-greeting";
import { nexGridBrandText } from "@/lib/brand-copy";

const t = useT();
const profile = useProfile();

// Capture the client's local hour on mount, but keep locale and copy reactive.
const hour = ref<number | null>(null);
onMounted(() => {
  hour.value = new Date().getHours();
});
const greeting = computed(() => {
  const h = hour.value;
  if (h === null) return "";
  return h < 5
      ? t.value.home.greetingLateNight
      : h < 12
        ? t.value.home.greetingMorning
        : h < 18
          ? t.value.home.greetingAfternoon
          : t.value.home.greetingEvening;
});

// 登录响应 /api/app/profile 投影的是服务端完整昵称；首页不得擅自按空格截断。
// 存量账号的默认昵称在服务端仍是改名前的旧品牌,渲染层归一(见 lib/brand-copy.ts)。
const nickname = computed(() => nexGridBrandText(homeGreetingName(profile.displayName, "UVEL")));
const greetingLine = computed(() => `${greeting.value}, ${nickname.value}`);
</script>
