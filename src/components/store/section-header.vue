<!--
  SectionHeader — shared store section chrome (ported from store/page.tsx
  SectionHeader). Title (display 600 15) + optional mono count + optional right
  slot (used for the amber "popular" CodeTagChip on the Recommended section).
-->
<template>
  <view class="flex items-center justify-between gap-2" style="margin-right: 2px; margin-bottom: 8px; margin-left: 2px">
    <text style="font-family: var(--font-v5); font-weight: 600; font-size: 15px; color: var(--v5-ink); letter-spacing: -0.012em">{{ title }}<text
        v-if="count"
        class="font-mono-tabular ml-1"
        style="font-size: 12px; font-weight: 400; color: var(--v5-ink-3)"
      >{{ count }}</text></text>
    <slot name="right" />
  </view>
</template>

<script setup lang="ts">
defineProps<{ title: string; count?: string }>();
</script>
