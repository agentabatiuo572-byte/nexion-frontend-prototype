<!-- Shared claim entry; eligibility and claim-sheet state remain store-owned. -->
<template>
  <view v-if="visible" class="vb-wrap">
    <view class="vb-card nx-home-glass-item" role="button" tabindex="0" :aria-label="t.voucher.bannerTitle" @click="open">
      <view class="nx-home-glass-panel" aria-hidden="true" />
      <view class="vb-aura" aria-hidden="true" />
      <view class="vb-art nx-home-art-float" aria-hidden="true">
        <view class="nx-home-art" />
      </view>
      <view class="vb-meta">
        <text class="vb-title">{{ t.voucher.bannerTitle }}</text>
        <text class="vb-sub">{{ t.voucher.bannerSub }}</text>
        <view class="vb-cta nx-home-pill" aria-hidden="true">
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

const props = defineProps<{ surface: VoucherSurface }>();
const voucher = useVoucher();
const sheet = useVoucherClaimSheet();
const t = useT();
const visible = computed(() => voucher.hasClaimableForSurface(props.surface));

function open() {
  sheet.show();
}
</script>

<style scoped>
.vb-wrap { padding: 12px 16px 0; }
.vb-card { min-height: 176px; padding: 22px 24px; border-radius: var(--v5-radius-2xl); }
.vb-meta { position: relative; width: 57%; }
.vb-title { display: block; max-width: 6.8em; font: 600 20px/1.3 var(--font-v5); letter-spacing: -.025em; color: var(--v5-ink); overflow-wrap: anywhere; }
.vb-sub { display: block; margin-top: 8px; font-size: 13px; line-height: 1.45; color: var(--v5-ink-2); }
.vb-cta { display: inline-flex; min-width: 116px; margin-top: 14px; padding: 8px 20px; gap: 10px; font-size: 15px; }
.vb-art { position: absolute; width: 48%; aspect-ratio: 1; right: 2px; top: 50%; margin-top: -24%; pointer-events: none; }
.vb-art .nx-home-art { width: 100%; height: 100%; background-position: 0 0; }
.vb-aura { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(ellipse at 83% 63%, color-mix(in srgb, var(--v5-brand) 14%, transparent), transparent 65%); }
@media (max-width: 350px) {
  .vb-card { padding: 20px 18px; }
  .vb-meta { width: 60%; }
  .vb-art { width: 43%; right: 0; margin-top: -21.5%; }
}
</style>
