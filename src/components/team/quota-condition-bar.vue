<template>
  <view ref="elRef" class="quota-progress" role="progressbar" :aria-label="label" :aria-valuetext="valueText" :aria-valuenow="Math.round(progress * 100)" :aria-valuemin="0" :aria-valuemax="100">
    <view :style="fillStyle" />
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from '@/composables/use-scroll-grow-progress';
const props = defineProps<{ pct: number; met: boolean; tint: string; label?: string; valueText?: string }>();
const { elRef, inView } = useScrollGrowProgress();
const progress = computed(() => Number.isFinite(props.pct) ? Math.max(0, Math.min(1, props.pct)) : 0);
const fillStyle = computed(() => ({ width: `${inView.value ? progress.value * 100 : 0}%`, transition: inView.value ? PROGRESS_GROW_TRANSITION : 'none' }));
</script>
<style scoped>
.quota-progress { height:7px;margin-top:9px;border-radius:999px;background:var(--v5-surface-3);overflow:hidden; }
.quota-progress > view { height:100%;border-radius:inherit;background:var(--v5-brand); }
@media(prefers-reduced-motion:reduce) { .quota-progress > view { transition:none!important; } }
</style>
