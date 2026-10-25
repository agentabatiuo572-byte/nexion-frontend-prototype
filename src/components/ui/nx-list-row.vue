<template>
  <view class="nx-list-row" role="button" :tabindex="disabled ? -1 : 0" :aria-disabled="disabled" :aria-label="title" @click="activate" @keydown.enter.prevent="activate" @keydown.space.prevent="activate">
    <view v-if="$slots.leading" class="nx-list-row__leading"><slot name="leading" /></view>
    <view class="nx-list-row__copy"><text class="nx-list-row__title">{{ title }}</text><text v-if="subtitle" class="nx-list-row__subtitle">{{ subtitle }}</text></view>
    <text v-if="value" class="nx-list-row__value">{{ value }}</text><svg class="nx-list-row__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
  </view>
</template>
<script setup lang="ts">
const props = defineProps<{ title: string; subtitle?: string; value?: string; disabled?: boolean }>();
const emit = defineEmits<{ (event: 'click'): void }>();
function activate(event?: Event) { if (!props.disabled && !(event as KeyboardEvent)?.repeat) emit('click'); }
</script>
<style scoped>
.nx-list-row { display: flex; align-items: center; gap: var(--ui-space-inline); min-height: 64px; padding: var(--ui-space-row-y) var(--ui-space-inset); color: var(--v5-ink); cursor: pointer; }
.nx-list-row:active { background: var(--v5-surface-2); }
.nx-list-row:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -2px; }
.nx-list-row__leading { display: grid; place-items: center; flex: none; width: 36px; color: var(--v5-ink-2); }
.nx-list-row__copy { flex: 1; min-width: 0; }
.nx-list-row__title { display: block; font: 500 15px/20px var(--font-v5); }
.nx-list-row__subtitle { display: block; margin-top: 2px; font: 400 13px/18px var(--font-v5); color: var(--v5-ink-3); }
.nx-list-row__value { max-width: 38%; font: 500 12px/1.4 var(--font-v5); color: var(--v5-ink-2); text-align: right; overflow-wrap: anywhere; }
.nx-list-row__chevron { flex: none; color: var(--v5-ink-4); }
</style>
