<template>
  <svg class="nx-message-status-icon" :class="`nx-message-status-icon--${state}`" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="state === 'sending'"><circle class="nx-message-status-track" cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 8 8" /></template>
    <path v-else-if="state === 'sent'" d="m5 12 4 4L19 6" />
    <path v-else-if="state === 'read'" d="m2 12 4 4L16 6M10 14l2 2L22 6" />
    <template v-else-if="state === 'failed'"><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" /></template>
    <template v-else-if="state === 'unknown'"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 .2c0 1.8-2.5 1.8-2.5 3.8m0 3h.01" /></template>
    <template v-else><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></template>
  </svg>
</template>
<script setup lang="ts">
import type { MessageDeliveryState } from './thread-types';
defineProps<{ state: MessageDeliveryState }>();
</script>
<style scoped>
.nx-message-status-icon { display:block; flex:none; color:var(--nx-message-status-color, var(--v5-ink-3)); }
.nx-message-status-icon--read { color:var(--nx-message-status-read, var(--v5-brand)); }
.nx-message-status-icon--failed { color:var(--nx-message-status-failed, var(--v5-danger)); }
.nx-message-status-icon--unknown { color:var(--nx-message-status-unknown, var(--v5-warning, #c58a22)); }
.nx-message-status-track { opacity:.22; }
.nx-message-status-icon--sending { animation:nx-message-status-spin 900ms linear infinite; }
@keyframes nx-message-status-spin { to { transform:rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .nx-message-status-icon--sending { animation:none; } }
</style>
