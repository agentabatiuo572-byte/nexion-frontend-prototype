<template><text class="nx-tag" :class="`nx-tag--${tone}`"><slot>{{ label }}</slot></text></template>
<script setup lang="ts">
withDefaults(defineProps<{ label?: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'asset' | 'genesis' }>(), { tone: 'neutral' });
</script>
<style scoped>
.nx-tag { display: inline-block; padding: 3px 8px; border-radius: 999px; background: var(--v5-surface-2); color: var(--v5-ink-2); font: 500 12px/1.4 var(--font-v5); }
.nx-tag--success { background: var(--v5-success-soft); color: var(--v5-success-ink); }
.nx-tag--warning { background: var(--v5-warning-soft); color: var(--v5-warning-ink); }
.nx-tag--danger { background: var(--v5-danger-soft); color: var(--v5-danger); }
.nx-tag--asset { background: var(--v5-nex-soft); color: var(--v5-nex); }
.nx-tag--genesis { background: color-mix(in srgb,var(--v5-genesis-gold) 12%,transparent); color: var(--v5-genesis-gold); }
</style>
