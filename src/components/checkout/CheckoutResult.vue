<template>
  <view class="checkout-result" :class="'checkout-result--' + state">
    <view class="checkout-result__body">
      <view class="checkout-result__art" :class="'is-' + phase">
        <view v-if="celebrating" class="checkout-result__celebration" aria-hidden="true"><view v-for="spark in sparks" :key="spark.index" class="checkout-result__spark" :style="spark.style" /></view>
        <view v-if="(celebrating && phase === 'confirmed') || popped" :key="phase" class="checkout-result__halo" aria-hidden="true" />
        <image v-if="productImage && !imageFailed" class="checkout-result__image" :src="productImage" :alt="productName || copy.device" mode="aspectFit" @error="imageFailed = true" />
        <view v-else class="checkout-result__fallback" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2"><rect x="16" y="8" width="32" height="44" rx="4"/><path d="M24 18h16M24 26h16M24 34h16M20 56h24"/><circle cx="32" cy="43" r="2"/></svg></view>
        <view v-if="state === 'activated' && phase === 'activating'" class="checkout-result__orbit" aria-hidden="true" />
        <view v-if="(state === 'activated' || state === 'inventory') && phase === 'complete'" class="checkout-result__check" :class="{ 'is-pop': popped }" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6"/></svg></view>
      </view>
      <view class="checkout-result__status" role="status" aria-live="polite"><text class="checkout-result__title" role="heading" aria-level="1">{{ title }}</text><text class="checkout-result__description">{{ description }}</text></view>
      <view v-if="state === 'activated'" class="checkout-result__progress">
        <view class="checkout-result__track" aria-hidden="true"><view class="checkout-result__fill" :class="'is-' + phase" /></view>
        <text class="checkout-result__progress-note">{{ phase === 'confirmed' ? copy.activationNext : phase === 'activating' ? copy.activationProgress : copy.activationComplete }}</text>
      </view>
      <view v-if="productName || amount !== undefined" class="checkout-result__summary">
        <text v-if="productName" class="checkout-result__product">{{ productName }}</text>
        <view v-if="amount !== undefined" class="checkout-result__amount"><text>{{ state === 'activated' ? copy.paidAmount : copy.orderAmount }}</text><CheckoutAmount :value="amount" currency="USDT" /></view>
      </view>
      <slot />
    </view>
    <view class="checkout-result__actions">
      <NxButton v-if="state === 'inventory' || (state === 'activated' && phase === 'complete')" :label="copy.devices" variant="primary" @click="emit('devices')" />
      <template v-else-if="state === 'error' || state === 'processing'">
        <NxButton :label="copy.query" variant="primary" @click="emit('retry')" />
        <NxButton :label="copy.deviceInventory" variant="text" @click="emit('devices')" />
      </template>
      <view v-else class="checkout-result__action-space" aria-hidden="true" />
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onHide, onShow } from '@/composables/use-tab-page-lifecycle';
import { useLocaleStore } from '@/store/locale';
import { checkoutFlowCopy } from '@/lib/checkout-flow-copy';
import NxButton from '@/components/ui/nx-button.vue';
import CheckoutAmount from './CheckoutAmount.vue';
const props = defineProps<{ state: 'activated' | 'inventory' | 'processing' | 'error'; productName?: string; productImage?: string; amount?: string | number; error?: string }>();
const emit = defineEmits<{ (event: 'devices'): void; (event: 'retry'): void }>();
const locale = useLocaleStore();
const copy = computed(() => checkoutFlowCopy(locale.code));
const phase = ref<'confirmed' | 'activating' | 'complete'>('complete');
// Confetti for the purchase itself; a check pop and halo when activation completes.
const celebrating = ref(false);
const popped = ref(false);
const imageFailed = ref(false);
const reduced = ref(false);
// Phase timing matches the CSS below. Timers, not animationend, drive the phases
// so the replay also advances where the native renderer drops animation events.
const CONFIRMED_MS = 2000, ACTIVATING_MS = 3000;
let mounted = false, presented = false, visible = true;
let timer: ReturnType<typeof setTimeout> | undefined;
let preference: MediaQueryList | undefined;
const presentable = computed(() => props.state === 'activated' || props.state === 'inventory');

const title = computed(() => phase.value === 'confirmed' ? copy.value.paid
  : props.state === 'activated' ? phase.value === 'activating' ? copy.value.activating : copy.value.activated
  : props.state === 'inventory' ? copy.value.inventory : props.state === 'processing' ? copy.value.processing : copy.value.resultError);
const description = computed(() => phase.value === 'confirmed' ? props.state === 'activated' ? copy.value.paidHint : copy.value.paidInventoryHint
  : props.state === 'activated' ? phase.value === 'activating' ? copy.value.activatingHint : copy.value.activatedHint
  : props.state === 'inventory' ? copy.value.inventoryHint : props.state === 'processing' ? copy.value.processingHint : props.error || copy.value.resultErrorHint);
const sparks = Array.from({ length: 36 }, (_, index) => ({ index, style: {
  '--x': `${12 + (index * 17) % 77}%`, '--dx': `${(index * 73) % 241 - 120}px`,
  '--dy': `${110 + (index * 37) % 170}px`, '--spin': `${120 + (index * 67) % 540}deg`,
  '--delay': `${(index * 43) % 400}ms`, '--duration': `${2600 + (index * 71) % 1200}ms`,
} }));

function clearTimer() { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } }
function skipPresentation() { clearTimer(); phase.value = 'complete'; celebrating.value = false; popped.value = false; }
function startPresentation() {
  if (!presentable.value) return;
  clearTimer(); celebrating.value = false; popped.value = false;
  if (presented || reduced.value || !visible || (typeof document !== 'undefined' && document.hidden)) {
    presented = true; phase.value = 'complete'; return;
  }
  presented = true; phase.value = 'confirmed'; celebrating.value = true;
  timer = setTimeout(() => {
    if (props.state !== 'activated') { phase.value = 'complete'; timer = undefined; return; }
    phase.value = 'activating';
    timer = setTimeout(() => { timer = undefined; phase.value = 'complete'; celebrating.value = false; popped.value = true; }, ACTIVATING_MS);
  }, CONFIRMED_MS);
}
// Without a media query (native renderer) motion stays on unless the user asked for less.
function updatePreference() { reduced.value = preference?.matches === true; if (reduced.value) skipPresentation(); }
function visibilityChanged() { if (document.hidden) skipPresentation(); }
watch(() => props.state, () => { skipPresentation(); if (mounted) startPresentation(); });
watch(() => props.productImage, () => { imageFailed.value = false; });
onHide(() => { visible = false; skipPresentation(); });
onShow(() => { visible = true; });
onMounted(() => {
  mounted = true;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    preference = window.matchMedia('(prefers-reduced-motion: reduce)'); updatePreference();
    if (preference.addEventListener) preference.addEventListener('change', updatePreference);
    else preference.addListener(updatePreference);
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibilityChanged);
  startPresentation();
});
onBeforeUnmount(() => {
  mounted = false; clearTimer();
  if (preference?.removeEventListener) preference.removeEventListener('change', updatePreference);
  else preference?.removeListener(updatePreference);
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibilityChanged);
});
</script>
<style scoped>
.checkout-result { box-sizing: border-box; display: flex; flex-direction: column; min-height: calc(100dvh - 128px); padding-inline: var(--v5-space-6); color: var(--v5-ink); }
.checkout-result__body { flex: 1 0 auto; display: flex; flex-direction: column; justify-content: center; padding-block: var(--v5-space-6); }
.checkout-result__art { position: relative; isolation: isolate; flex: none; display: grid; place-items: center; height: 156px; margin: 0 0 var(--v5-space-4); }
.checkout-result__art.is-confirmed .checkout-result__image, .checkout-result__art.is-confirmed .checkout-result__fallback { animation: checkout-confirmed-rise 700ms cubic-bezier(.16, 1, .3, 1) both; }
.checkout-result__image, .checkout-result__fallback { position: relative; z-index: 1; width: 160px; height: 148px; }
.checkout-result__fallback { display: grid; place-items: center; color: var(--v5-brand); }
.checkout-result__fallback svg { width: 80px; height: 80px; }
.checkout-result__art.is-activating .checkout-result__image { animation: checkout-device-breathe 1600ms ease-in-out infinite; }
.checkout-result__title { display: block; text-align: center; font: var(--ui-type-page-title-weight) var(--ui-type-page-title)/var(--ui-type-page-title-lh) var(--font-v5); }
.checkout-result__status { min-height: calc(var(--ui-type-page-title-lh) + var(--v5-space-1) + var(--ui-type-description-lh) * 2); }
.checkout-result__description { display: block; margin-top: var(--v5-space-1); text-align: center; color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.checkout-result__progress { display: grid; grid-template-rows: 6px 36px; justify-items: center; gap: var(--v5-space-2); width: min(100%, 240px); margin: var(--v5-space-4) auto; }
.checkout-result__track { width: 200px; max-width: 100%; height: 6px; overflow: hidden; border-radius: var(--v5-radius-full); background: var(--v5-surface-3); }
.checkout-result__fill { width: 0; height: 100%; border-radius: inherit; background: var(--v5-brand); }
.checkout-result__fill.is-activating { animation: checkout-activation-fill 3s linear both; }
.checkout-result__fill.is-complete { width: 100%; }
.checkout-result__progress-note { text-align: center; color: var(--v5-ink-3); font: var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); }
.checkout-result__summary { display: grid; gap: var(--v5-space-1); margin-top: var(--v5-space-4); text-align: center; }
.checkout-result__product { display: block; color: var(--v5-ink-2); font: var(--ui-type-body-weight) var(--ui-type-body)/var(--ui-type-body-lh) var(--font-v5); }
.checkout-result__amount { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center; gap: var(--v5-space-2); color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.checkout-result__amount > :last-child { color: var(--v5-ink); font-size: var(--ui-type-hero-title); line-height: var(--ui-type-hero-title-lh); }
.checkout-result__actions { flex: none; display: grid; gap: var(--v5-space-2); margin-top: auto; padding: var(--v5-space-6) 0 var(--v5-space-4); background: var(--v5-bg); }
.checkout-result__action-space { min-height: 48px; }
.checkout-result__orbit { position: absolute; z-index: 2; left: calc(50% + 84px); bottom: var(--v5-space-3); width: 24px; height: 24px; border: 2px solid var(--v5-brand-soft); border-top-color: var(--v5-brand); border-right-color: var(--v5-brand); border-radius: 50%; animation: checkout-orbit-spin 1s linear infinite; pointer-events: none; }
.checkout-result__check { position: absolute; z-index: 3; right: calc(50% - 76px); bottom: var(--v5-space-2); display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--v5-brand); color: var(--v5-on-brand); pointer-events: none; }
.checkout-result__check svg { width: 24px; height: 24px; }
.checkout-result__check.is-pop { animation: checkout-success-pop 500ms cubic-bezier(.16, 1, .3, 1) both; }
.checkout-result__halo { position: absolute; z-index: 0; left: 50%; top: 50%; width: 216px; max-width: 100%; height: 180px; border-radius: 50%; background: radial-gradient(ellipse at center, color-mix(in srgb, var(--v5-brand) 24%, transparent), var(--v5-brand-soft) 40%, transparent 72%); opacity: 0; transform: translate(-50%, -50%); animation: checkout-success-halo 3200ms ease-out both; pointer-events: none; }
.checkout-result__celebration { position: absolute; z-index: 2; inset: calc(-1 * var(--v5-space-4)) calc(-1 * var(--v5-space-2)) calc(-1 * var(--v5-space-6)); overflow: hidden; pointer-events: none; }
.checkout-result__spark { position: absolute; left: var(--x); top: 30%; width: 9px; height: 4px; border-radius: calc(var(--v5-space-1) / 4); background: var(--v5-brand); opacity: 0; animation: checkout-spark-fall var(--duration) linear var(--delay) both; pointer-events: none; }
.checkout-result__spark:nth-child(3n + 2) { background: var(--v5-ink); }
.checkout-result__spark:nth-child(3n) { background: color-mix(in srgb, var(--v5-brand) 45%, var(--v5-ink)); }
.checkout-result__spark:nth-child(4n) { width: 5px; height: 8px; }
.checkout-result__spark:nth-child(5n) { border-radius: 50%; width: 6px; height: 6px; }
@keyframes checkout-confirmed-rise { 0% { opacity: .4; transform: translateY(12px) scale(.94); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes checkout-activation-fill { from { width: 0; } to { width: 100%; } }
@keyframes checkout-device-breathe { 50% { transform: translateY(-4px); } }
@keyframes checkout-orbit-spin { to { transform: rotate(360deg); } }
@keyframes checkout-success-pop { from { opacity: 0; transform: scale(.6) rotate(-12deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
@keyframes checkout-success-halo { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.7); } 12% { opacity: .8; transform: translate(-50%, -50%) scale(1); } 45% { opacity: .45; } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.12); } }
@keyframes checkout-spark-fall { 0% { opacity: 0; transform: translate3d(0, -8px, 0) rotate(0) scale(.75); } 12% { opacity: .95; } 28% { transform: translate3d(calc(var(--dx) * .45), calc(var(--dy) * .12 - 16px), 0) rotate(calc(var(--spin) * .3)) scale(1); } 75% { opacity: .7; } 100% { opacity: 0; transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--spin)) scale(.45); } }
@media (prefers-reduced-motion: reduce) {
  .checkout-result *, .checkout-result *::before, .checkout-result *::after { animation: none !important; transition: none !important; }
  .checkout-result__celebration, .checkout-result__halo, .checkout-result__orbit { display: none !important; }
  .checkout-result__fill { width: 100%; }
}
</style>
