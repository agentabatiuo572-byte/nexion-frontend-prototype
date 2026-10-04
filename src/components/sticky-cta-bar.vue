<!--
  StickyCTABar — chassis-level sticky bottom CTA. Ported from
  Nexion-prototype/app/components/mobile/sticky-cta-bar.tsx.
  Mounted as a direct chassis child (absolute positioning) so it stays inside
  the device bezel and respects overflow:hidden + rounded corners.
    · renders only when store.cta !== null
    · Link → <view @click> + shared navTo (P-036: no native <button>/<a>)
    · lucide ArrowRight → inline <svg stroke="currentColor">
    · useHaptic("medium") → uni.vibrateShort
    · frosted gradient via existing --v5-sticky-bar-bg / -border tokens
  All display text (amount / subtext / buttonLabel) is caller-supplied via the
  payload; the price eyebrow is static via i18n (t.stickyCta.priceLabel).
-->
<template>
  <view v-if="cta" class="scb-outer" :style="outerStyle">
    <view class="scb-bar" :style="barStyle">
      <view class="scb-info">
        <!-- Eyebrow — explicitly labels the number as PRICE so it isn't
             confused with yield/earnings shown elsewhere on the page. -->
        <text class="scb-eyebrow">{{ t.stickyCta.priceLabel }}</text>
        <!-- Price — small dim $ prefix + big bold number. -->
        <view class="scb-price">
          <template v-if="hasDollarPrefix">
            <text class="scb-price-dollar">$</text>
            <text class="scb-price-num">{{ amountBody }}</text>
          </template>
          <text v-else class="scb-price-num">{{ cta.amount }}</text>
        </view>
        <text v-if="cta.amountSubtext" class="scb-subtext" :style="subtextStyle">{{ cta.amountSubtext }}</text>
      </view>

      <view
        class="scb-cta"
        :style="ctaStyle"
        role="button"
        :tabindex="cta.disabled ? -1 : 0"
        :aria-disabled="cta.disabled ? 'true' : 'false'"
        @click="onTap"
        @keydown.enter.prevent="onTap"
        @keydown.space.prevent="onTap"
      >
        <text class="scb-cta-t">{{ cta.buttonLabel }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { useStickyCTA } from "@/store/sticky-cta-bar";

const t = useT();
const sticky = useStickyCTA();
const cta = computed(() => sticky.cta);

const accentColor = computed(() => cta.value?.accentColor ?? "var(--v5-brand)");
const subColor = computed(() => cta.value?.subtextColor ?? "var(--v5-ink-3)");

// showTabBar=true  → above TabBar (84px) + 4px gap = 88
// showTabBar=false → above Home Indicator (20px) + 4px gap = 24
const bottomOffset = computed(() => ((cta.value?.showTabBar ?? true) ? 88 : 24));

const hasDollarPrefix = computed(() => cta.value?.amount.startsWith("$") ?? false);
const amountBody = computed(() => (cta.value ? cta.value.amount.slice(1) : ""));

const outerStyle = computed<CSSProperties>(() => ({
  bottom: bottomOffset.value > 24 ? `${bottomOffset.value - 24}px` : "0",
}));
const barStyle = computed<CSSProperties>(() => ({
  // SKILL Sheets > iOS home indicator safe area: bottom padding clears the
  // 20px home indicator + finger margin = 38px.
  padding: "14px 16px calc(env(safe-area-inset-bottom) + 38px)",
  background: "var(--v5-sticky-bar-bg)",
  backdropFilter: "blur(22px) saturate(180%)",
  borderTop: "1px solid var(--v5-sticky-bar-border)",
}));
const subtextStyle = computed<CSSProperties>(() => ({ color: subColor.value }));
const ctaStyle = computed<CSSProperties>(() => ({ background: accentColor.value }));

function onTap() {
  if (!cta.value || cta.value.disabled) return;
  uni.vibrateShort({ fail: () => {} });
  navTo(cta.value.href);
}
</script>

<style scoped>
.scb-outer {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 35;
  pointer-events: none;
}
.scb-bar {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.scb-info {
  flex: 1;
  min-width: 0;
}
.scb-eyebrow {
  display: block;
  font-family: var(--font-jet-mono), monospace;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--v5-ink-3);
  text-transform: uppercase;
  line-height: 1;
}
.scb-price {
  display: flex;
  align-items: baseline;
  margin-top: 2px;
  font-family: var(--font-v5);
  letter-spacing: -0.02em;
  color: var(--v5-ink);
  white-space: nowrap;
  line-height: 1.1;
}
.scb-price-dollar {
  font-size: 15px;
  color: var(--v5-ink-3);
  font-weight: 500;
}
.scb-price-num {
  font-size: 26px;
  font-weight: 600;
}
.scb-subtext {
  display: block;
  margin-top: 1px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.scb-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  flex-shrink: 0;
}
.scb-cta:active {
  opacity: 0.85;
}
.scb-cta[aria-disabled="true"] {
  background: var(--v5-surface-2) !important;
  opacity: 1;
}
.scb-cta[aria-disabled="true"] .scb-cta-t {
  color: var(--v5-ink-4);
}
.scb-cta-t {
  font-family: var(--font-v5);
  font-weight: 600;
  font-size: 13px;
  letter-spacing: -0.005em;
  color: var(--v5-on-brand);
  white-space: nowrap;
}
</style>
