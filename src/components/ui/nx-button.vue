<template>
  <view class="nx-button" :class="[`nx-button--${variant}`, `nx-button--${size}`, { 'nx-button--disabled': disabled || busy }]"
    role="button" :tabindex="disabled || busy ? -1 : 0" :aria-disabled="disabled || busy" :aria-busy="busy" :aria-label="label"
    @click="activate" @keydown.enter.prevent="activate" @keydown.space.prevent="activate">
    <view class="nx-button__surface" :class="{ 'nx-frosted-button': variant === 'secondary' || variant === 'brand' }">
      <view class="nx-button__content"><slot><text>{{ label }}</text></slot></view>
    </view>
  </view>
</template>
<script setup lang="ts">
// Design system 03 §3.1: primary = solid brand, brand = brand glass, secondary = neutral glass,
// text = in-place action in brand color, link = next-level navigation in muted color.
const props = withDefaults(defineProps<{ label?: string; variant?: 'primary' | 'brand' | 'secondary' | 'text' | 'link'; size?: 'large' | 'medium' | 'small'; disabled?: boolean; busy?: boolean }>(), { variant: 'secondary', size: 'large' });
const emit = defineEmits<{ (event: 'click'): void }>();
function activate(event?: Event) { if (!props.disabled && !props.busy && !(event as KeyboardEvent)?.repeat) emit('click'); }
</script>
<style scoped>
.nx-button { position: relative; isolation: isolate; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 48px; border-radius: 999px; color: var(--v5-ink); font: var(--ui-type-button-weight) var(--ui-type-button)/var(--ui-type-button-lh) var(--font-v5); cursor: pointer; transition: transform 160ms ease; }
/* The hit area participates in layout; its compact surface stays inside it. */
.nx-button__surface { position: relative; box-sizing: border-box; display: flex; align-items: center; justify-content: center; flex: 1; min-width: 0; min-height: 48px; padding: 10px 20px; border-radius: inherit; }
.nx-button__content { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; text-align: center; overflow-wrap: anywhere; }
.nx-button--primary > .nx-button__surface { background: var(--v5-brand); color: var(--v5-on-brand); }
/* Brand glass keeps the shared frosted material and only swaps fill, ink and the solid fallback. */
.nx-button--brand > .nx-button__surface { --ui-button-fill: color-mix(in srgb, var(--v5-brand) 14%, transparent); --ui-button-ink: var(--v5-brand); --ui-button-solid: color-mix(in srgb, var(--v5-brand) 12%, var(--v5-surface)); }
.nx-button--text { color: var(--v5-brand); }
/* M keeps the button role (L/M 15/20 at the 390 band); S uses the compact role 13/18. */
.nx-button--medium { min-height: 44px; padding-block: 2px; }
.nx-button--small { min-height: 44px; padding-block: 6px; font: var(--ui-type-compact-button-weight) var(--ui-type-compact-button)/var(--ui-type-compact-button-lh) var(--font-v5); }
.nx-button--medium > .nx-button__surface { min-height: 40px; padding: 8px 16px; }
.nx-button--small > .nx-button__surface { min-height: 32px; padding: 6px 12px; }
.nx-button--link { color: var(--v5-ink-3); font: var(--ui-type-text-link-weight) var(--ui-type-text-link)/var(--ui-type-text-link-lh) var(--font-v5); }
.nx-button--text > .nx-button__surface, .nx-button--link > .nx-button__surface { padding-inline: 8px; }
.nx-button--disabled { opacity: .5; cursor: default; }
.nx-button:not(.nx-button--disabled):active { transform: scale(.98); }
.nx-button:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .nx-button { transition: none; }
  .nx-button:not(.nx-button--disabled):active { transform: none; }
}
</style>
