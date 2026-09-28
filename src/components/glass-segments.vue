<template>
  <view
    :id="hostId" class="nx-glass-segments" :class="[`nx-glass-segments--${layout}`, `nx-glass-segments--${variant}`]"
    :role="variant === 'navigation' ? 'navigation' : 'group'" :aria-label="label"
    :segments-config="configuration" :change:segments-config="segmentsView.update"
  >
    <LiquidGlass v-if="variant === 'navigation'" :radius="34" tone="navigation" backdrop=".nx-page-enter" class="nx-glass-track nx-glass-backdrop" />
    <view v-else class="nx-glass-track-viewport" aria-hidden="true">
      <view class="nx-glass-backdrop nx-glass-track--filter" />
    </view>
    <LiquidGlass
      class="nx-glass-indicator" :radius="variant === 'navigation' ? 28 : 23"
      tone="selection" :backdrop="variant === 'navigation' ? '.nx-page-enter' : ''"
    />
    <view
      v-for="option in options" :key="option.value" class="nx-glass-option"
      :class="[option.className, { 'nx-glass-option--selected': option.value === modelValue, 'nx-glass-option--disabled': option.disabled || option.dimmed, 'nx-tab': variant === 'navigation' }]"
      :data-glass-value="String(option.value)" :data-selected="option.value === modelValue"
      :role="variant === 'navigation' ? 'link' : 'button'" :tabindex="option.disabled ? -1 : 0"
      :aria-current="variant === 'navigation' && option.value === modelValue ? 'page' : undefined"
      :aria-pressed="variant !== 'navigation' ? option.value === modelValue : undefined"
      :aria-disabled="option.disabled ? 'true' : undefined" :aria-label="option.count !== undefined ? option.label + ' ' + option.count : option.label"
      @click="choose(option)"
    >
      <slot name="option" :option="option" :selected="option.value === modelValue">
        <text class="nx-glass-option__label">{{ option.label }}</text>
        <text v-if="option.count !== undefined" class="nx-glass-option__count">{{ option.count }}</text>
      </slot>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance } from "vue";
import type { SegmentsConfiguration } from "@/lib/liquid-glass-view";
import LiquidGlass from "@/components/liquid-glass.vue";
export interface GlassOption { value: string | number; label: string; count?: string | number; disabled?: boolean; dimmed?: boolean; className?: string; icon?: string; icon2?: string; [key: string]: unknown; }
const props = withDefaults(defineProps<{
  modelValue: string | number;
  options: readonly GlassOption[];
  layout?: "equal" | "scroll" | "wrap" | "vertical";
  variant?: "filter" | "navigation";
  label?: string;
  fromValue?: string;
}>(), { layout: "equal", variant: "filter", label: "", fromValue: undefined });
// Values originate from the caller's typed options, including narrow string unions.
const emit = defineEmits<{ (e: "update:modelValue", value: any): void; (e: "select", value: any): void }>();
const hostId = `nx-segments-host-${getCurrentInstance()!.uid}`;
const configuration = computed<SegmentsConfiguration>(() => ({ hostId, value: String(props.modelValue), values: props.options.map(option => String(option.value)), fromValue: props.fromValue, layout: props.layout, variant: props.variant }));
declare const segmentsView: { update(value: SegmentsConfiguration): void };

function choose(option: GlassOption) {
  if (option.disabled) return;
  emit("update:modelValue", option.value);
  emit("select", option.value); // Same-option activation remains available to callers.
}

</script>

<script module="segmentsView" lang="renderjs">
import { segmentsView as viewImplementation } from "@/lib/liquid-glass-view";
// @ts-expect-error vue-tsc 1.x treats uni renderjs as a second normal script.
export default viewImplementation;
</script>

<style scoped>
.nx-glass-segments { position: relative; display: flex; gap: 3px; padding: 4px; border-radius: 27px; min-width: 0; }
.nx-glass-backdrop { z-index: 0; }
.nx-glass-track-viewport { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; }
.nx-glass-track--filter { position: absolute; inset: 0; border-radius: inherit; background: color-mix(in srgb, var(--v5-surface-2) 82%, transparent); pointer-events: none; }
.nx-glass-segments--equal, .nx-glass-segments--equal .nx-glass-option { touch-action: pan-y; user-select: none; }
.nx-glass-segments[data-glass-dragging="true"] { cursor: grabbing; }
.nx-glass-indicator { inset: auto; left: 0; top: 0; z-index: 1; transform-origin: 0 0; visibility: hidden; }
.nx-glass-option { position: relative; z-index: 2; flex: 1 1 0; min-width: 0; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 6px 10px; box-sizing: border-box; border-radius: 23px; color: var(--v5-ink-2); cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: color 150ms, transform 100ms cubic-bezier(.2,.8,.2,1); }
.nx-glass-option--selected { color: var(--v5-brand); }
.nx-glass-option:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -3px; }
.nx-glass-option--disabled { opacity: .45; cursor: default; }
.nx-glass-option__label { font-family: var(--font-v5); font-size: 12px; font-weight: 600; line-height: 17px; text-align: center; overflow-wrap: anywhere; }
.nx-glass-option__count { font-size: 11px; font-variant-numeric: tabular-nums; }
.nx-glass-segments--scroll { overflow-x: auto; scrollbar-width: none; }
.nx-glass-segments--scroll .nx-glass-track-viewport { overflow: clip; }
.nx-glass-segments--scroll::-webkit-scrollbar { display: none; }
.nx-glass-segments--scroll .nx-glass-option { flex: 0 0 auto; white-space: nowrap; padding-inline: 16px; }
.nx-glass-segments--wrap { flex-wrap: wrap; }
.nx-glass-segments--wrap .nx-glass-option { flex: 0 1 auto; padding-inline: 16px; }
.nx-glass-segments--vertical { flex-direction: column; }
.nx-glass-segments--vertical .nx-glass-option { flex: 0 0 auto; }
.nx-glass-segments--navigation { height: 68px; padding: 5px; gap: 2px; box-sizing: border-box; background: transparent; border-radius: 34px; }
.nx-glass-segments--navigation .nx-glass-option { flex-direction: column; gap: 3px; padding: 4px 2px; border-radius: 28px; }
.nx-glass-segments--navigation :deep(.nx-tab__label) { font-family: var(--font-v5); font-size: 12px; line-height: 14px; font-weight: 600; white-space: nowrap; text-shadow: 0 1px 2px var(--v5-tabbar-ink-halo), 0 0 4px var(--v5-tabbar-ink-halo); }
.nx-glass-segments--navigation :deep(.nx-tab__icon) { filter: drop-shadow(0 1px 1px var(--v5-tabbar-ink-halo)); transition: transform 160ms cubic-bezier(.2,.8,.2,1); }
.nx-glass-segments--navigation .nx-glass-option--selected :deep(.nx-tab__icon) { transform: translateY(-1px); }
@media (prefers-reduced-motion: reduce) { .nx-glass-option, .nx-glass-indicator { transition: none; } .nx-glass-option:active, .nx-glass-option--selected :deep(.nx-tab__icon) { transform: none; } }
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { .nx-glass-segments { background: var(--v5-surface); } .nx-glass-option--selected { background: var(--v5-brand-soft); } }
</style>
