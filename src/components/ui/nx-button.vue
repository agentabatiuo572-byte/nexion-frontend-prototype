<template>
  <view class="nx-button" :class="[`nx-button--${variant}`, `nx-button--${size}`, { 'nx-button--disabled': disabled || busy }]"
    role="button" :tabindex="disabled || busy ? -1 : 0" :aria-disabled="disabled || busy" :aria-busy="busy" :aria-label="label"
    @click="activate" @keydown.enter.prevent="activate" @keydown.space.prevent="activate">
    <view class="nx-button__surface">
      <LiquidGlass v-if="variant === 'secondary'" :radius="999" tone="control" />
      <view class="nx-button__content"><slot><text>{{ label }}</text></slot></view>
    </view>
  </view>
</template>
<script setup lang="ts">
import LiquidGlass from '@/components/liquid-glass.vue';
const props = withDefaults(defineProps<{ label?: string; variant?: 'primary' | 'secondary' | 'tertiary' | 'text'; size?: 'large' | 'medium' | 'small'; disabled?: boolean; busy?: boolean }>(), { variant: 'secondary', size: 'large' });
const emit = defineEmits<{ (event: 'click'): void }>();
function activate(event?: Event) { if (!props.disabled && !props.busy && !(event as KeyboardEvent)?.repeat) emit('click'); }
</script>
<style scoped>
.nx-button { position: relative; isolation: isolate; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 48px; border-radius: 999px; color: var(--v5-ink); font: 600 var(--ui-type-button)/var(--ui-type-button-lh) var(--font-v5); cursor: pointer; transition: transform 160ms ease; }
/* The hit area participates in layout; its compact surface stays inside it. */
.nx-button__surface { position: relative; box-sizing: border-box; display: flex; align-items: center; justify-content: center; flex: 1; min-width: 0; min-height: 48px; padding: 10px 20px; border-radius: inherit; }
.nx-button__content { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 0; text-align: center; overflow-wrap: anywhere; }
.nx-button--primary > .nx-button__surface { background: var(--v5-brand); color: var(--v5-on-brand); }
.nx-button--tertiary > .nx-button__surface { background: var(--v5-surface-2); }
.nx-button--text { color: var(--v5-ink-2); }
/* Compact variants are fixed-size exceptions to the button role (10-responsive-type §10.2). */
.nx-button--medium { min-height: 44px; padding-block: 2px; font-size: 13px; line-height: 1.4; }
.nx-button--small { min-height: 44px; padding-block: 6px; font-size: 12px; line-height: 1.4; }
.nx-button--medium > .nx-button__surface { min-height: 40px; padding: 8px 16px; }
.nx-button--small > .nx-button__surface { min-height: 32px; padding: 6px 12px; }
.nx-button--text > .nx-button__surface { padding-inline: 8px; }
.nx-button--disabled { opacity: .5; cursor: default; }
.nx-button:not(.nx-button--disabled):active { transform: scale(.98); }
.nx-button:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .nx-button { transition: none; }
  .nx-button:not(.nx-button--disabled):active { transform: none; }
}
</style>
