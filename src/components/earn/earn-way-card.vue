<template>
  <view class="earn-way-card">
    <view class="earn-way-card__content">
      <text class="earn-way-card__eyebrow">{{ eyebrow }}</text>
      <text class="earn-way-card__title" role="heading" aria-level="3">{{ title }}</text>
      <text class="earn-way-card__body">{{ body }}</text>
      <NxButton class="earn-way-card__action" size="medium" :label="action" @click="activate">
        <text>{{ action }}</text>
        <svg class="earn-way-card__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
      </NxButton>
    </view>
    <view class="earn-way-card__art" aria-hidden="true">
      <image class="earn-way-card__image" :src="image" mode="aspectFit" alt="" :draggable="false" />
    </view>
    <text v-if="notice" class="earn-way-card__notice" role="status">{{ notice }}</text>
  </view>
</template>

<script setup lang="ts">
import NxButton from '@/components/ui/nx-button.vue';
import { usePreferences } from '@/store/preferences';

defineProps<{ eyebrow: string; title: string; body: string; action: string; image: string; notice?: string }>();
const emit = defineEmits<{ (event: 'click'): void }>();
// #ifndef H5
const preferences = usePreferences();
// #endif
function activate() {
  // #ifndef H5
  if (preferences.hapticsEnabled) uni.vibrateShort({ type: 'light' });
  // #endif
  emit('click');
}
</script>

<style scoped>
.earn-way-card { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 40%; align-items: center; gap: 8px; margin-top: 10px; padding: 16px 12px 16px 16px; border: 1px solid var(--v5-border-strong); border-radius: 20px; background: var(--v5-surface); color: var(--v5-ink); }
.earn-way-card__content { position: relative; z-index: 1; min-width: 0; }
.earn-way-card__eyebrow { display: block; color: var(--v5-brand); font: 600 10px/1.4 var(--font-v5); letter-spacing: .08em; }
.earn-way-card__title { display: block; margin-top: 7px; font: 600 20px/1.2 var(--font-v5); letter-spacing: -.025em; overflow-wrap: anywhere; }
.earn-way-card__body { display: block; margin-top: 6px; color: var(--v5-ink-2); font: 400 13px/1.5 var(--font-v5); overflow-wrap: anywhere; }
.earn-way-card__action {
  --v5-liquid-tint: color-mix(in srgb, var(--v5-brand) 8%, transparent);
  --v5-liquid-rim: color-mix(in srgb, var(--v5-brand) 35%, transparent);
  --v5-liquid-highlight: color-mix(in srgb, var(--v5-brand) 14%, transparent);
  --v5-liquid-bottom: color-mix(in srgb, var(--v5-brand) 18%, transparent);
  --v5-liquid-shadow: none;
  margin-top: 9px; max-width: 100%;
}
.earn-way-card__action :deep(.nx-button__surface) { padding-inline: 12px; border: 1px solid var(--v5-liquid-rim); }
.earn-way-card__action :deep(.nx-button__content) { gap: 6px; }
.earn-way-card__arrow { flex-shrink: 0; }
.earn-way-card__art { position: relative; min-width: 0; height: 124px; pointer-events: none; }
.earn-way-card__art::before { content: ''; position: absolute; inset: -8px -10px; border-radius: 50%; background: radial-gradient(ellipse at 58% 58%, color-mix(in srgb, var(--v5-brand) 26%, transparent), color-mix(in srgb, var(--v5-brand) 12%, transparent) 48%, transparent 74%); }
.earn-way-card__image { position: relative; display: block; width: 100%; height: 124px; transform: scale(1.18); }
.earn-way-card__notice { grid-column: 1 / -1; display: block; padding-top: 8px; border-top: 1px solid var(--v5-border); color: var(--v5-ink-2); font: 400 12px/1.5 var(--font-v5); overflow-wrap: anywhere; }
</style>
