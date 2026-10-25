<template>
  <view class="nx-button" :class="[`nx-button--${variant}`, `nx-button--${size}`, { 'nx-button--disabled': disabled || busy }]"
    role="button" :tabindex="disabled || busy ? -1 : 0" :aria-disabled="disabled || busy" :aria-busy="busy" :aria-label="label"
    @click="activate" @keydown.enter.prevent="activate" @keydown.space.prevent="activate">
    <LiquidGlass v-if="variant === 'secondary'" :radius="999" tone="control" />
    <view class="nx-button__content"><slot><text>{{ label }}</text></slot></view>
  </view>
</template>
<script setup lang="ts">
import LiquidGlass from '@/components/liquid-glass.vue';
const props = withDefaults(defineProps<{ label?: string; variant?: 'primary' | 'secondary' | 'tertiary' | 'text'; size?: 'large' | 'medium' | 'small'; disabled?: boolean; busy?: boolean }>(), { variant: 'secondary', size: 'large' });
const emit = defineEmits<{ (event: 'click'): void }>();
function activate(event?: Event) { if (!props.disabled && !props.busy && !(event as KeyboardEvent)?.repeat) emit('click'); }
</script>
<style scoped>
.nx-button { position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 10px 20px; border-radius: 999px; color: var(--v5-ink); font: 600 14px/1.4 var(--font-v5); cursor: pointer; transition: transform 160ms ease; }
.nx-button__content { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 0; text-align: center; overflow-wrap: anywhere; }
.nx-button--primary { background: var(--v5-brand); color: var(--v5-on-brand); }
.nx-button--tertiary { background: var(--v5-surface-2); }
.nx-button--text { background: transparent; color: var(--v5-ink-2); padding-inline: 8px; }
.nx-button--medium { min-height: 40px; padding: 8px 16px; font-size: 13px; }
.nx-button--small { min-height: 32px; padding: 6px 12px; font-size: 12px; }
.nx-button--disabled { opacity: .5; cursor: default; }
.nx-button:not(.nx-button--disabled):active { transform: scale(.98); }
.nx-button:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .nx-button { transition: none; } }
</style>
