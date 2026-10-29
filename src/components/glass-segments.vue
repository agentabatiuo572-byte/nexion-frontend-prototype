<template>
  <view
    :id="hostId" class="nx-glass-segments" :class="[`nx-glass-segments--${layout}`, `nx-glass-segments--${variant}`, { 'nx-glass-segments--flat': resolvedSelection === 'flat' }]"
    :role="variant === 'navigation' ? 'navigation' : semantics === 'radio' ? 'radiogroup' : 'tablist'" :aria-label="label" :aria-orientation="variant !== 'navigation' ? layout === 'vertical' ? 'vertical' : 'horizontal' : undefined"
    :segments-config="configuration" :change:segments-config="segmentsView.update"
  >
    <LiquidGlass v-if="variant === 'navigation' || resolvedSurface === 'glass'" :radius="variant === 'navigation' ? 34 : 26" :tone="variant === 'navigation' ? 'navigation' : 'control'" :backdrop="variant === 'navigation' ? '.nx-page-enter' : ''" class="nx-glass-track nx-glass-backdrop" />
    <view v-if="resolvedSelection === 'flat'" class="nx-glass-indicator nx-flat-indicator" aria-hidden="true" />
    <LiquidGlass v-else
      class="nx-glass-indicator" :radius="variant === 'navigation' ? 28 : 23"
      tone="selection" :backdrop="variant === 'navigation' ? '.nx-page-enter' : ''"
    />
    <view
      v-for="option in options" :key="option.value" class="nx-glass-option"
      :class="[option.className, { 'nx-glass-option--selected': option.value === modelValue, 'nx-glass-option--disabled': option.disabled || option.dimmed, 'nx-tab': variant === 'navigation', 'nx-tab--bounce': variant === 'navigation' && option.value === modelValue && option.value === animatedNavigation }]"
      :data-glass-value="String(option.value)" :data-selected="option.value === modelValue"
      :id="option.id" :role="variant === 'navigation' ? 'link' : semantics === 'radio' ? 'radio' : 'tab'"
      :tabindex="option.disabled ? -1 : variant === 'navigation' || option.value === modelValue ? 0 : -1"
      :aria-current="variant === 'navigation' && option.value === modelValue ? 'page' : undefined"
      :aria-selected="variant !== 'navigation' && semantics === 'tab' ? option.value === modelValue : undefined"
      :aria-checked="variant !== 'navigation' && semantics === 'radio' ? option.value === modelValue : undefined"
      :aria-controls="option.ariaControls"
      :aria-disabled="option.disabled ? 'true' : undefined" :aria-label="option.count !== undefined ? option.label + ' ' + option.count : option.label"
      @click="onClick(option, $event)"
      @keydown="onKeydown($event, option)"
    >
      <slot name="option" :option="option" :selected="option.value === modelValue">
        <text class="nx-glass-option__label">{{ option.label }}</text>
        <text v-if="option.count !== undefined" class="nx-glass-option__count">{{ option.count }}</text>
      </slot>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, watch } from "vue";
import type { SegmentsConfiguration } from "@/lib/liquid-glass-view";
import LiquidGlass from "@/components/liquid-glass.vue";
export interface GlassOption { value: string | number; label: string; count?: string | number; disabled?: boolean; dimmed?: boolean; className?: string; icon?: string; icon2?: string; id?: string; ariaControls?: string; [key: string]: unknown; }
const props = withDefaults(defineProps<{
  modelValue: string | number;
  options: readonly GlassOption[];
  layout?: "equal" | "scroll" | "wrap" | "vertical";
  variant?: "filter" | "navigation";
  surface?: "open" | "glass";
  selection?: "glass" | "flat";
  label?: string;
  fromValue?: string;
  navigationOnArrival?: boolean;
  semantics?: "radio" | "tab";
}>(), { layout: "equal", variant: "filter", label: "", fromValue: undefined, semantics: "tab" });
// Primary segmented tabs have one glass track; secondary filters stay open.
// Selection material is explicit where the host needs a flat navigation pill.
const resolvedSurface = computed(() => props.surface ?? (props.layout === 'equal' ? 'glass' : 'open'));
const resolvedSelection = computed(() => props.selection ?? (props.variant !== 'navigation' && resolvedSurface.value === 'glass' ? 'flat' : 'glass'));
// Values originate from the caller's typed options, including narrow string unions.
const emit = defineEmits<{ (e: "update:modelValue", value: any): void; (e: "select", value: any, reason: string): void }>();
const hostId = `nx-segments-host-${getCurrentInstance()!.uid}`;
// Cold opens and same-tab activations stay still; page arrivals reuse the existing navigation intent.
const animatedNavigation = ref<string | number | undefined>(props.variant === "navigation" && props.fromValue
  && props.fromValue !== String(props.modelValue) ? props.modelValue : undefined);
watch(() => props.modelValue, value => {
  if (props.variant === "navigation") animatedNavigation.value = value;
});
let navigationOnArrival = false;
// #ifdef APP-PLUS
navigationOnArrival = true;
// #endif
const configuration = computed<SegmentsConfiguration>(() => ({ hostId, value: String(props.modelValue), values: props.options.map(option => String(option.value)), fromValue: props.fromValue, layout: props.layout, variant: props.variant, navigationOnArrival: props.navigationOnArrival ?? navigationOnArrival }));
declare const segmentsView: { update(value: SegmentsConfiguration): void };

function choose(option: GlassOption, reason = "activation") {
  if (option.disabled) return;
  emit("update:modelValue", option.value);
  emit("select", option.value, reason); // Same-option activation remains available to callers.
}

function onClick(option: GlassOption, event: Event) {
  const dataset = (event.currentTarget as HTMLElement | null)?.dataset;
  choose(option, dataset?.glassKeyboard === "arrow" ? "arrow" : dataset?.glassActivation === "drag" ? "drag" : "activation");
}

function onKeydown(event: KeyboardEvent, option: GlassOption) {
  // App-Plus sends serialised events to this thread. Its physical keyboard is
  // handled in renderjs, where cancellation and DOM focus are available.
  if (typeof event.preventDefault !== "function") return;
  if (event.altKey || event.ctrlKey || event.metaKey || option.disabled) return;
  if (["Enter", " ", "Spacebar"].includes(event.key)) {
    if (props.variant === "navigation" && event.key !== "Enter") return;
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat) choose(option);
    return;
  }
  const keys = props.layout === "vertical" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
  if (![...keys, "Home", "End"].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  const enabled = props.options.filter(item => !item.disabled);
  const index = enabled.indexOf(option);
  const next = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1
    : (index + (event.key === keys[1] ? 1 : -1) + enabled.length) % enabled.length;
  const target = enabled[next];
  if (!target) return;
  if (props.variant !== "navigation") choose(target, "arrow");
  // Uni normalises currentTarget to metadata even on H5; locate the rendered
  // host explicitly instead of assuming that metadata is a DOM element.
  const root = typeof document === "undefined" ? null : document.getElementById(hostId);
  void nextTick(() => {
    const items = root?.querySelectorAll<HTMLElement>(".nx-glass-option");
    items?.[props.options.indexOf(target)]?.focus();
  });
}

</script>

<script module="segmentsView" lang="renderjs">
import { segmentsView as viewImplementation } from "@/lib/liquid-glass-view";
// @ts-expect-error vue-tsc 1.x treats uni renderjs as a second normal script.
export default viewImplementation;
</script>

<style scoped>
.nx-glass-segments { position: relative; display: flex; gap: 3px; padding: 4px; border-radius: 28px; min-width: 0; }
.nx-glass-backdrop { z-index: 0; }
.nx-glass-segments--filter { background: transparent; border: 0; box-shadow: none; }
.nx-glass-segments--equal, .nx-glass-segments--equal .nx-glass-option { touch-action: pan-y; user-select: none; }
.nx-glass-segments[data-glass-dragging="true"] { cursor: grabbing; }
.nx-glass-indicator { inset: auto; left: 0; top: 0; z-index: 1; transform-origin: 0 0; visibility: hidden; }
.nx-flat-indicator { position: absolute; pointer-events: none; border-radius: 24px; background: var(--v5-brand-soft); }
.nx-glass-option { position: relative; z-index: 2; flex: 1 1 0; min-width: 0; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 6px 10px; box-sizing: border-box; border-radius: 24px; color: var(--v5-ink-2); cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: color 150ms, transform 100ms cubic-bezier(.2,.8,.2,1); }
.nx-glass-option--selected { color: var(--v5-brand); }
.nx-glass-option:active { opacity: .78; }
.nx-glass-option:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -3px; }
.nx-glass-option--disabled { opacity: .45; cursor: default; }
.nx-glass-option__label { font-family: var(--font-v5); font-size: 12px; font-weight: 600; line-height: 17px; text-align: center; overflow-wrap: anywhere; }
.nx-glass-option__count { font-size: 12px; font-variant-numeric: tabular-nums; }
/* Main switch and secondary filters (design system 03 §3.7): 32px visible options inside a
   40px track, 44px hit area, 500 labels, muted until selected. :where() keeps page overrides
   (home 90x26 switch, message centre) stronger than these defaults. */
:where(.nx-glass-segments--filter) .nx-glass-option { min-height: 32px; padding: 6px 12px; color: var(--v5-ink-3); }
:where(.nx-glass-segments--filter) .nx-glass-option::after { content: ""; position: absolute; inset: -6px 0; }
:where(.nx-glass-segments--filter) .nx-glass-option--selected { color: var(--v5-brand); }
:where(.nx-glass-segments--filter) .nx-glass-option__label { font-size: var(--ui-type-segment); font-weight: var(--ui-type-segment-weight); line-height: var(--ui-type-segment-lh); }
:where(.nx-glass-segments--scroll, .nx-glass-segments--wrap) .nx-glass-option__label { font-size: var(--ui-type-compact-button); line-height: var(--ui-type-compact-button-lh); }
.nx-glass-segments--scroll { overflow-x: auto; scrollbar-width: none; }
.nx-glass-segments--scroll::-webkit-scrollbar { display: none; }
.nx-glass-segments--scroll .nx-glass-option { flex: 0 0 auto; white-space: nowrap; padding-inline: 16px; }
.nx-glass-segments--wrap { flex-wrap: wrap; }
.nx-glass-segments--wrap .nx-glass-option { flex: 0 1 auto; padding-inline: 16px; }
.nx-glass-segments--vertical { flex-direction: column; }
.nx-glass-segments--vertical .nx-glass-option { flex: 0 0 auto; }
.nx-glass-segments--navigation { --nx-tab-icon-scale: 1.09; height: var(--nx-tabbar-height, 56px); padding: 5px; gap: 2px; box-sizing: border-box; background: transparent; border-radius: 34px; }
.nx-glass-segments--navigation .nx-glass-option { gap: 0; padding: 4px 2px; border-radius: 28px; }
.nx-glass-segments--navigation .nx-flat-indicator { border-radius:999px; }
@media (forced-colors: active) { .nx-flat-indicator { outline:1px solid Highlight;outline-offset:-1px; } }
.nx-glass-segments--navigation :deep(.nx-tab__icon) { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; flex-shrink: 0; line-height: 0; filter: drop-shadow(0 1px 1px var(--v5-tabbar-ink-halo)); transition: transform 160ms cubic-bezier(.2,.8,.2,1); transform-origin: center; }
.nx-glass-segments--navigation .nx-glass-option--selected :deep(.nx-tab__icon) { transform: translateY(-1px); }
@keyframes nx-tab-select {
  0%, 100% { transform: scale(var(--nx-tab-icon-scale, 1)); }
  40% { transform: scale(calc(var(--nx-tab-icon-scale, 1) * 1.16)); }
  72% { transform: scale(calc(var(--nx-tab-icon-scale, 1) * .96)); }
}
.nx-glass-segments--navigation :deep(.nx-tab__icon),
.nx-glass-segments--navigation .nx-glass-option--selected :deep(.nx-tab__icon) { transform: scale(var(--nx-tab-icon-scale)); transition: none; }
.nx-glass-segments--navigation .nx-tab--bounce :deep(.nx-tab__icon) { animation: nx-tab-select 260ms cubic-bezier(.2,.8,.2,1) 1; }
@media (prefers-reduced-motion: reduce) { .nx-glass-option, .nx-glass-indicator { transition: none; } .nx-glass-option:active { transform: none; } .nx-glass-segments--navigation .nx-tab--bounce :deep(.nx-tab__icon) { animation: none; } .nx-glass-segments--navigation :deep(.nx-tab__icon), .nx-glass-segments--navigation .nx-glass-option--selected :deep(.nx-tab__icon) { transform: scale(var(--nx-tab-icon-scale, 1)); transition: none; } }
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) { .nx-glass-segments--navigation { background: var(--v5-surface); } .nx-glass-option--selected { background: var(--v5-brand-soft); } }
</style>
