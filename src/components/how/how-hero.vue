<!-- Open introduction for rule documents; asset and action cards stay separate. -->
<template>
  <view class="how-hero mx-4">
    <text class="how-hero__label">{{ label }}</text>
    <text class="how-hero__title">{{ title }}</text>
    <text class="how-hero__sub">{{ sub }}</text>
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  title: string;
  sub: string;
  accent?: "lemon" | "purple" | "amber" | "violet" | "nex" | "neutral";
}>(), { accent: "lemon" });
</script>

<style scoped>
.how-hero { padding-block: 8px 16px; font-family: var(--font-v5); overflow-wrap: anywhere; }
.how-hero__label { display: block; color: var(--v5-ink-2); font-size: 12px; line-height: 1.5; }
.how-hero__title { display: block; margin-top: 10px; color: var(--v5-ink); font-size: 26px; font-weight: 600; letter-spacing: -.022em; line-height: 1.2; }
.how-hero__sub { display: block; margin-top: 10px; color: var(--v5-ink-2); font-size: var(--ui-type-long-form); line-height: var(--ui-type-long-form-lh); }
</style>
