<template><text class="nx-tag" :class="[`nx-tag--${tone}`, `nx-tag--${size}`]"><slot>{{ label }}</slot></text></template>
<script setup lang="ts">
// Status and attribute chips (design system 03 §3.8): status 24px, credential 28px.
withDefaults(defineProps<{ label?: string; tone?: 'neutral' | 'unavailable' | 'brand' | 'success' | 'warning' | 'danger' | 'uvt' | 'genesis'; size?: 'status' | 'credential' }>(), { tone: 'neutral', size: 'status' });
</script>
<style scoped>
.nx-tag { display: inline-flex; align-items: center; flex: none; box-sizing: border-box; height: 24px; padding: 0 8px; border-radius: 999px; background: var(--v5-surface-3); color: var(--v5-ink-2); font: var(--ui-type-chip-weight) var(--ui-type-chip)/var(--ui-type-chip-lh) var(--font-v5); white-space: nowrap; }
.nx-tag--credential { height: 28px; padding: 0 10px; }
.nx-tag--unavailable { color: var(--v5-ink-3); }
.nx-tag--brand { background: var(--v5-brand-soft); color: var(--v5-brand); }
.nx-tag--success { background: var(--v5-success-soft); color: var(--v5-success-ink); }
.nx-tag--warning { background: var(--v5-warning-soft); color: var(--v5-warning-ink); }
.nx-tag--danger { background: var(--v5-danger-soft); color: var(--v5-danger); }
.nx-tag--uvt { background: var(--v5-nex-soft); color: var(--v5-nex-ink); }
.nx-tag--genesis { background: color-mix(in srgb,var(--v5-genesis-gold) 12%,transparent); color: var(--v5-genesis-gold); }
</style>
