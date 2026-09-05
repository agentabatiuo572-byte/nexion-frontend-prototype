<!--
  VoucherBanner — the fallback claim entry shown after the popup is closed.
  Rendered by app-chassis at the top of the content area (NOT inside the protected
  tab-page files), gated by the current route's surface. Self-hides unless a
  claimable voucher targets `surface`. Tapping re-opens the claim sheet.
  Gutter-padded (16px) to align with each page's px-4 content. Card chrome with a
  soft brand tint — token-only colors, on-brand text on the CTA pill.
-->
<template>
  <view v-if="visible" class="vb-wrap active:opacity-90" role="button" tabindex="0" :aria-label="t.voucher.bannerTitle" @click="open">
    <view class="vb-card">
      <view class="vb-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" /></svg>
      </view>
      <view class="vb-meta">
        <text class="vb-title">{{ t.voucher.bannerTitle }}</text>
        <text class="vb-sub">{{ t.voucher.bannerSub }}</text>
      </view>
      <view class="vb-cta">
        <text class="vb-cta-t">{{ t.voucher.bannerCta }}</text>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 3px"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
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
.vb-wrap {
  padding: 12px 16px 0;
}
.vb-card {
  display: flex;
  align-items: center;
  gap: 12px;
  /* 《03》§2 圆角上阶梯(14 → radius-m 16);§6 带 bg 填充零 border ——
     本卡在 home/earn/store/me 四个 tab 都渲染,是零-border 铁律的最大破口。
     视觉焦点改由内部 brand 径向渐变承担(原就有),不靠 accent 描边抢眼。 */
  border-radius: 16px;
  padding: 12px 14px;
  background: radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--v5-brand) 16%, transparent), transparent 70%), var(--v5-surface-2);
}
.vb-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--v5-brand) 14%, transparent);
}
.vb-meta {
  flex: 1;
  min-width: 0;
}
.vb-title {
  display: block;
  font-family: var(--font-v5);
  font-size: 13px;
  font-weight: 600;
  color: var(--v5-ink);
  letter-spacing: -0.008em;
  line-height: 1.3;
}
.vb-sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--v5-ink-3);
  line-height: 1.3;
}
.vb-cta {
  flex-shrink: 0;
  min-height: 30px;
  padding: 0 13px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: var(--v5-brand);
}
.vb-cta-t {
  font-family: var(--font-v5);
  font-size: 12px;
  font-weight: 600;
  color: var(--v5-on-brand);
  letter-spacing: -0.005em;
}
</style>
