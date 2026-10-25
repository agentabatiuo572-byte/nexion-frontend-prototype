<!-- Shared claim entry; eligibility and claim-sheet state remain store-owned. -->
<template>
  <view v-if="visible" class="vb-wrap" :class="{ 'vb-wrap--embedded': embedded }">
    <view class="vb-card" role="button" tabindex="0" :aria-label="t.voucher.bannerTitle" @click="open">
      <view class="vb-aura" aria-hidden="true" />
      <view class="vb-art" aria-hidden="true">
        <view class="nx-home-art" />
      </view>
      <view class="vb-meta">
        <text class="vb-title">{{ t.voucher.bannerTitle }}</text>
        <text class="vb-sub">{{ t.voucher.bannerSub }}</text>
        <view class="vb-cta" aria-hidden="true">
          <LiquidGlass :radius="999" tone="control" />
          <text>{{ t.voucher.bannerCta }}</text>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useVoucher } from "@/store/voucher";
import { useVoucherClaimSheet } from "@/store/voucher-claim-sheet";
import { useT } from "@/i18n/use-t";
import type { VoucherSurface } from "@/mock/vouchers";
import LiquidGlass from "@/components/liquid-glass.vue";

const props = defineProps<{ surface: VoucherSurface; embedded?: boolean }>();

const voucher = useVoucher();
const sheet = useVoucherClaimSheet();
const t = useT();

const visible = computed(() => voucher.hasClaimableForSurface(props.surface));

function open() {
  sheet.show(props.surface);
}


</script>

<style scoped>
.vb-wrap { padding: 12px 16px 0; }
.vb-card { position: relative; overflow: hidden; isolation: isolate; min-height: 164px; padding: 22px 24px; border-radius: 22px; background: var(--v5-surface); transition: transform 180ms ease; }
.vb-card:active { transform: scale(.985); }
.vb-card:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.vb-meta { position: relative; width: 57%; }
.vb-title { display: block; max-width: 6.8em; font: 600 20px/1.3 var(--font-v5); letter-spacing: -.025em; color: var(--v5-ink); overflow-wrap: anywhere; }
.vb-sub { display: block; margin-top: 8px; font-size: 13px; line-height: 1.45; color: var(--v5-ink-2); }
.vb-cta { position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; min-height: 44px; margin-top: 14px; padding: 0 16px; gap: 10px; font-size: 14px; font-weight: 600; color: var(--v5-ink); border-radius: 999px; }
.vb-cta > text, .vb-cta > svg { position: relative; z-index: 1; }
.vb-cta > svg { flex: none; }
.vb-art { position: absolute; width: 48%; aspect-ratio: 1; right: 2px; top: 50%; margin-top: -24%; pointer-events: none; }
.vb-art .nx-home-art { width: 100%; height: 100%; background-position: 0 0; }
.vb-aura { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(ellipse at 83% 63%, color-mix(in srgb, var(--v5-brand) 14%, transparent), transparent 65%); }
.vb-wrap--embedded { padding: 0; min-width: 0; display: flex; }
.vb-wrap--embedded .vb-card { display: flex; flex-direction: column; width: 100%; min-width: 0; padding: 0; }
.vb-wrap--embedded .vb-art { position: relative; width: 100%; height: 116px; aspect-ratio: auto; top: auto; right: auto; margin: 0; }
.vb-wrap--embedded .vb-art .nx-home-art { width: 150px; height: 150px; margin: -16px auto 0; }
.vb-wrap--embedded .vb-meta { display: flex; flex: 1; flex-direction: column; width: auto; padding: 12px 16px 16px; border-top: 1px dashed var(--v5-border); }
.vb-wrap--embedded .vb-meta::before, .vb-wrap--embedded .vb-meta::after { content: ''; position: absolute; top: -7px; width: 14px; height: 14px; border-radius: 50%; background: var(--v5-bg); }
.vb-wrap--embedded .vb-meta::before { left: -7px; }
.vb-wrap--embedded .vb-meta::after { right: -7px; }
.vb-wrap--embedded .vb-title { font-size: 17px; max-width: none; }
.vb-wrap--embedded .vb-sub { margin: 6px 0 16px; font-size: 13px; }
.vb-wrap--embedded .vb-cta { align-self: flex-start; margin-top: auto; }
@media (prefers-reduced-motion: reduce) { .vb-card { transition: none; } }
@media (max-width: 350px) {
  .vb-wrap:not(.vb-wrap--embedded) .vb-card { padding: 20px 18px; }
  .vb-wrap:not(.vb-wrap--embedded) .vb-meta { width: 60%; }
  .vb-wrap:not(.vb-wrap--embedded) .vb-art { width: 43%; right: 0; margin-top: -21.5%; }
}
</style>
