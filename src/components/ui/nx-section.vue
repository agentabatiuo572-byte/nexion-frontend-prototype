<template>
  <view class="nx-section">
    <view v-if="title" class="nx-section__heading">
      <view class="nx-section__titles"><text class="nx-section__title" role="heading" aria-level="2">{{ title }}</text><text v-if="meta" class="nx-section__meta">{{ meta }}</text></view>
      <NxButton v-if="action" :label="action" variant="text" size="medium" @click="$emit('action')"><text>{{ action }}</text><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></NxButton>
    </view>
    <slot />
  </view>
</template>
<script setup lang="ts">
import NxButton from './nx-button.vue';
defineProps<{ title?: string; meta?: string; action?: string }>();
defineEmits<{ (event: 'action'): void }>();
</script>
<style scoped>
.nx-section { min-width: 0; color: var(--v5-ink); }
.nx-section__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; margin-bottom: 0;padding:0 2px; }
.nx-section__titles { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; min-width: 0; }
.nx-section__title { font: 600 var(--ui-type-section)/var(--ui-type-section-lh) var(--font-v5); letter-spacing: -.02em; }
.nx-section__meta { font: 500 13px/18px var(--font-v5); color: var(--v5-ink-3); }
.nx-section__heading :deep(.nx-button) {font-size:13px;gap:2px;padding:0;min-height:44px;color:var(--v5-ink-2);}
@media (max-width: 374px) {
  .nx-section__meta { font-size: 12px; line-height: 16px; }
  .nx-section__heading :deep(.nx-button) { font-size: 13px; }
}
</style>
