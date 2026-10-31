<template>
  <view v-if="open" class="nx-notice-mask nx-sheet-fade-in">
    <view :id="id" class="nx-notice nx-dialog-pop-in" role="alertdialog" aria-modal="true" :aria-label="title" :class="`nx-notice--${tone}`">
      <view class="nx-notice__icon" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <template v-if="icon === 'clock'"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></template>
          <template v-else-if="icon === 'shield'"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="M12 8v4" /><path d="M12 16h.01" /></template>
          <template v-else-if="icon === 'failed'"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></template>
          <template v-else-if="icon === 'info'"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></template>
          <template v-else><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></template>
        </svg>
      </view>
      <text class="nx-notice__title" role="heading">{{ title }}</text>
      <text v-if="body" class="nx-notice__body">{{ body }}</text>
      <slot />
      <view class="nx-notice__actions">
        <NxButton :label="primary" variant="primary" :busy="busy" @click="$emit('primary')" />
        <NxButton v-if="secondary" :label="secondary" variant="link" :disabled="busy" @click="$emit('secondary')" />
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue';
import NxButton from './nx-button.vue';
import { useDialogA11y } from '@/composables/use-dialog-a11y';
// Centered notice (payment design 07): icon, title, one short explanation, a primary action and an optional quiet one.
const props = withDefaults(defineProps<{ open: boolean; title: string; body?: string; primary: string; secondary?: string;
  icon?: 'alert' | 'clock' | 'shield' | 'failed' | 'info'; tone?: 'warning' | 'danger' | 'brand' | 'neutral'; busy?: boolean }>(), { icon: 'alert', tone: 'warning' });
const emit = defineEmits<{ (event: 'primary'): void; (event: 'secondary'): void }>();
const id = `nx-notice-${getCurrentInstance()?.uid}`;
// Esc / Android back take the quiet action when there is one; a notice without one must be answered.
useDialogA11y(computed(() => props.open), `#${id}`, () => { if (props.secondary && !props.busy) emit('secondary'); }, true, 6);
</script>
<style scoped>
.nx-notice-mask { position: fixed; inset: 0; z-index: 960; display: flex; align-items: center; justify-content: center; padding: 24px 23px; box-sizing: border-box; background: var(--v5-bg-color-mask); }
.nx-notice { width: 100%; max-width: 344px; max-height: 100%; overflow-y: auto; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; padding: 28px 24px 20px; border-radius: var(--v5-radius-2xl); background: var(--v5-surface); color: var(--v5-ink); text-align: center; }
.nx-notice__icon { flex: none; width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--nx-notice-fill) var(--nx-notice-fill-amount), transparent); color: var(--nx-notice-tone); }
/* Icon tone: brand = go ahead (pre-payment check), warning = attention, danger = failed, neutral = closed. */
.nx-notice--warning { --nx-notice-tone: var(--v5-warning); --nx-notice-fill: var(--v5-warning); --nx-notice-fill-amount: 14%; }
.nx-notice--brand { --nx-notice-tone: var(--v5-brand); --nx-notice-fill: var(--v5-brand); --nx-notice-fill-amount: 16%; }
.nx-notice--danger { --nx-notice-tone: var(--v5-danger); --nx-notice-fill: var(--v5-danger); --nx-notice-fill-amount: 16%; }
.nx-notice--neutral { --nx-notice-tone: var(--v5-ink-2); --nx-notice-fill: var(--v5-ink-3); --nx-notice-fill-amount: 18%; }
.nx-notice__title { display: block; margin-top: 16px; font: 600 20px/28px var(--font-v5); color: var(--v5-ink); }
.nx-notice__body { display: block; margin-top: 8px; font: var(--ui-type-body-weight, 400) var(--ui-type-body)/var(--ui-type-body-lh) var(--font-v5); color: var(--v5-ink-2); }
.nx-notice__actions { align-self: stretch; display: grid; gap: 4px; margin-top: 24px; }
/* The quiet action reads at button size, in the muted color. */
.nx-notice__actions :deep(.nx-button--link) { font: var(--ui-type-button-weight) var(--ui-type-button)/var(--ui-type-button-lh) var(--font-v5); }
</style>
