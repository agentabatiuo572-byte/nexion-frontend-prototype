<template>
  <view class="earn-way-card" :class="`earn-way-card--${artwork}`">
    <view class="earn-way-card__content">
      <text class="earn-way-card__eyebrow">{{ eyebrow }}</text>
      <text class="earn-way-card__title" role="heading" aria-level="3">{{ title }}</text>
      <text class="earn-way-card__body">{{ body }}</text>
      <NxButton class="earn-way-card__action" size="medium" :label="action" @click="activate">
        <text>{{ action }}</text>
        <svg class="earn-way-card__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
      </NxButton>
    </view>
    <view class="earn-way-card__art" aria-hidden="true" />
    <text v-if="notice" class="earn-way-card__notice" role="status">{{ notice }}</text>
  </view>
</template>

<script setup lang="ts">
import NxButton from '@/components/ui/nx-button.vue';
import { usePreferences } from '@/store/preferences';

defineProps<{ eyebrow: string; title: string; body: string; action: string; artwork: 'phone' | 'staking' | 'gpu'; notice?: string }>();
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
.earn-way-card { --earn-art-x: 30.952381%; --earn-art-y: 15.915119%; --earn-surface: #111411; position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 48%; align-items: center; gap: 6px; margin-top: 10px; min-height: 144px; padding: 16px 16px 12px 22px; border: 1px solid var(--v5-border-strong); border-radius: 18px; background: var(--earn-surface); color: var(--v5-ink); overflow: hidden; }
.earn-way-card--staking { --earn-art-y: 55.437666%; }
.earn-way-card--gpu { --earn-art-y: 94.960212%; }
.earn-way-card__content { position: relative; z-index: 1; min-width: 0; }
.earn-way-card__eyebrow { display: block; color: var(--v5-brand); font: 600 10px/1.4 var(--font-v5); letter-spacing: .08em; }
.earn-way-card__title { display: block; margin-top: 7px; font: 600 20px/1.2 var(--font-v5); letter-spacing: -.025em; overflow-wrap: anywhere; }
.earn-way-card__body { display: block; margin-top: 6px; color: var(--v5-ink-2); font: 400 var(--ui-type-list-subtitle)/1.5 var(--font-v5); overflow-wrap: anywhere; }
.earn-way-card__action {
  --v5-liquid-tint: rgba(255,255,255,.015);
  --v5-liquid-rim: rgba(222,244,143,.7);
  --v5-liquid-highlight: rgba(255,255,255,.07);
  --v5-liquid-bottom: rgba(255,255,255,.06);
  --v5-liquid-shadow: none;
  margin-top: 7px; max-width: 100%; min-height: 44px; font-size: 12px; font-weight: 500;
}
.earn-way-card__action :deep(.nx-button__surface) { min-height: 32px; padding: 6px 16px; background: radial-gradient(ellipse at 95% 95%, color-mix(in srgb, var(--v5-brand) 18%, transparent), transparent 68%), linear-gradient(170deg, rgba(255,255,255,.04), rgba(255,255,255,.015)); }
.earn-way-card__action :deep(.nx-button__content) { gap: 6px; }
.earn-way-card__arrow { flex-shrink: 0; }
/* Use the approved artwork unchanged: each 360×270 window contains only the
   machine and its original emitted light. Copy and controls remain native UI. */
.earn-way-card__art { position: absolute; right: 2px; top: 50%; width: 52%; aspect-ratio: 4 / 3; transform: translateY(-50%); pointer-events: none; background-image: url('/static/img/earn-20261027/design-art.png'); background-repeat: no-repeat; background-size: 426.666667% 379.259259%; background-position: var(--earn-art-x) var(--earn-art-y); -webkit-mask-image: linear-gradient(to right, transparent, #000 16%, #000 92%, transparent), linear-gradient(to bottom, transparent, #000 6%, #000 92%, transparent); mask-image: linear-gradient(to right, transparent, #000 16%, #000 92%, transparent), linear-gradient(to bottom, transparent, #000 6%, #000 92%, transparent); -webkit-mask-composite: source-in; mask-composite: intersect; }
.earn-way-card__notice { grid-column: 1 / -1; display: block; padding-top: 8px; border-top: 1px solid var(--v5-border); color: var(--v5-ink-2); font: 400 12px/1.5 var(--font-v5); overflow-wrap: anywhere; }
:global([data-theme="light"] .earn-way-card) { --earn-art-x: 96.258503%; --earn-surface: #fbfaf8; }
:global([data-theme="light"] .earn-way-card__action) { --v5-liquid-rim: color-mix(in srgb, var(--v5-brand) 36%, transparent); --v5-liquid-highlight: rgba(255,255,255,.2); --v5-liquid-bottom: transparent; --v5-liquid-tint: rgba(233,241,255,.55); }
:global([data-theme="light"] .earn-way-card__action .nx-button__surface) { background: rgba(231,239,255,.35); }
@media (max-width: 360px) { .earn-way-card { padding-left: 16px; grid-template-columns: minmax(0, 1fr) 44%; } .earn-way-card__title { font-size: 18px; } .earn-way-card__art { width: 49%; } .earn-way-card__action :deep(.nx-button__surface) { padding-inline: 10px; } }
</style>
