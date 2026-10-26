<template>
  <view v-if="open" class="nx-sheet-mask" @click.self="$emit('close')">
    <view :id="id" class="nx-sheet" role="dialog" aria-modal="true" :aria-label="title">
      <view class="nx-sheet__header"><text class="nx-sheet__title">{{ title }}</text><NxButton :label="copy.close" size="medium" @click="$emit('close')"><text aria-hidden="true">×</text></NxButton></view>
      <view class="nx-sheet__body"><slot /></view>
      <view v-if="$slots.footer" class="nx-sheet__footer"><slot name="footer" /></view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue';
import NxButton from './nx-button.vue';
import { useDialogA11y } from '@/composables/use-dialog-a11y';
import { useAuditUiCopy } from '@/i18n/audit-ui';
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ (event: 'close'): void }>();
const copy = useAuditUiCopy();
const id = `nx-sheet-${getCurrentInstance()?.uid}`;
useDialogA11y(computed(() => props.open), `#${id}`, () => emit('close'));
</script>
<style scoped>
.nx-sheet-mask { position: fixed; inset: 0; z-index: 900; display: flex; align-items: flex-end; justify-content: center; background: #0008; }
.nx-sheet { display: flex; flex-direction: column; width: 100%; max-width: 480px; max-height: min(88%, calc(100% - var(--nx-overlay-top))); box-sizing: border-box; padding-bottom: var(--nx-overlay-safe-bottom); background: var(--v5-surface); border-radius: 24px 24px 0 0; color: var(--v5-ink); }
.nx-sheet__header { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--v5-border); }
.nx-sheet__title { font: 600 20px/1.35 var(--font-v5); }
.nx-sheet__body { min-height: 0; overflow-y: auto; padding: 20px; }
.nx-sheet__footer { flex: none; padding: 16px 20px; border-top: 1px solid var(--v5-border); }
</style>
