<template>
  <view class="ticket-stat">
    <text class="ticket-stat-label">{{ label }}</text>
    <text class="ticket-stat-value" :style="{ color: tint }">{{ value }}</text>
  </view>
</template>

<script setup lang="ts">
defineProps<{ tint: string; label: string; value: number; icon: string }>();
</script>

<style scoped>
.ticket-stat { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 8px; min-width: 0; }
.ticket-stat-label { font-family: var(--font-v5); font-size: 12px; color: var(--v5-ink-3); line-height: 1.4; overflow-wrap: anywhere; }
.ticket-stat-value { font-family: var(--font-v5); font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.1; }
</style>
