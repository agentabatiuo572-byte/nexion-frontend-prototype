<template>
  <view v-if="failed || !hasSnapshot" class="nx-staking-read-status" role="status" aria-live="polite" :aria-busy="loading">
    <text>{{ failed ? (hasSnapshot ? copy.stale : copy.unavailable) : copy.loading }}</text>
    <view v-if="failed" class="nx-staking-read-retry" role="button" :aria-disabled="loading" :tabindex="loading ? -1 : 0" @click="retry" @keydown.enter.prevent="retry" @keydown.space.prevent="retry">
      <text>{{ loading ? copy.loading : copy.retry }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useStakingReviewCopy } from "@/lib/staking-review-copy";
const props = defineProps<{ hasSnapshot: boolean; loading: boolean; failed: boolean }>();
const emit = defineEmits<{ retry: [] }>();
const copy = useStakingReviewCopy();
function retry() { if (!props.loading) emit("retry"); }
</script>

<style scoped>
.nx-staking-read-status { padding: 12px 16px; color: var(--v5-ink-2); font-size: 13px; line-height: 1.6; }
.nx-staking-read-retry { display: flex; align-items: center; justify-content: center; min-height: 44px; margin-top: 8px; padding: 0 16px; border-radius: 999px; background: transparent; color: var(--v5-brand); font: 600 13px/20px var(--font-v5); }
.nx-staking-read-retry[aria-disabled="true"] { opacity: .55; }
</style>
