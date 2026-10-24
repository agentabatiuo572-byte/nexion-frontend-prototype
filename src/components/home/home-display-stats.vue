<template>
  <view class="home-display-stats">
    <view class="home-display-item">
      <view class="home-display-dot" />
      <text class="home-display-number">{{ value ? value.online.toLocaleString('en-US') : '—' }}</text>
      <text>{{ t.intro.statsDevices }}</text>
    </view>
    <view class="home-display-separator" />
    <view class="home-display-item">
      <text class="home-display-number home-display-number--brand">{{ value ? `$${formatAmount(value.paid)}` : '—' }}</text>
      <text>{{ t.intro.statsPaidTotal }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import { apiClient } from "@/api/runtime";
import { useT } from "@/i18n/use-t";
import { formatAmount } from "@/lib/amount-display";
import { createHomeDisplayPlayer, parseHomeDisplayBatch } from "@/lib/home-display-player";

const props = defineProps<{ active: boolean }>();
const t = useT();
const value = ref<{ online: number; paid: number } | null>(null);
const player = createHomeDisplayPlayer({
  fetch: async () => parseHomeDisplayBatch(await apiClient.request({ path: "/api/config/home-display", authenticated: false })),
  now: () => typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now(),
  render: next => {
    if (next?.online !== value.value?.online || next?.paid !== value.value?.paid) value.value = next;
  },
});
function syncVisibility() {
  if (props.active && (typeof document === "undefined" || !document.hidden)) player.start();
  else player.stop();
}
watch(() => props.active, syncVisibility);
onMounted(() => {
  syncVisibility();
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", syncVisibility);
});
onUnmounted(() => {
  player.stop();
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", syncVisibility);
});
</script>

<style scoped>
.home-display-stats { display: inline-flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 20px; padding: 9px 16px; border-radius: 999px; background: var(--v5-surface); font-size: 12px; line-height: 1.5; color: var(--v5-ink-3); }
.home-display-item { display: flex; align-items: center; gap: 6px; }
.home-display-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--v5-brand); }
.home-display-number { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--v5-ink); }
.home-display-number--brand { color: var(--v5-brand); }
.home-display-separator { height: 12px; border-left: 1px solid var(--v5-border-strong); }
</style>
