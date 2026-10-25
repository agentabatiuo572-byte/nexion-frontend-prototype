<!-- Shared claim entry; eligibility and claim-sheet state remain store-owned. -->
<template>
  <view v-if="visible" class="vb-wrap" :class="{ 'vb-wrap--embedded': embedded }">
    <view class="vb-card" role="button" tabindex="0" :aria-label="t.voucher.bannerTitle" @click="open" @keydown.enter.prevent="open" @keydown.space.prevent="open">
      <view class="vb-art" aria-hidden="true"><view class="nx-home-art" /></view>
      <view class="vb-meta"><view class="vb-heading"><text class="vb-title">{{ copy.voucherShort }}</text><text class="vb-count">{{ fmt(copy.voucherShortCount,{n:offers.length}) }}</text></view>
        <view class="vb-value"><text v-if="maxDiscount != null" class="vb-currency">$</text><text>{{ faceValue }}</text></view><text class="vb-sub">{{ maxDiscount != null ? copy.upToOff : copy.voucherDiscount }}</text>
      </view>
      <view class="vb-rule" aria-hidden="true" />
      <view class="vb-footer"><text>{{ claimable.length ? copy.claimToUse : copy.autoApplyVoucher }}</text><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useVoucher } from "@/store/voucher";
import { useVoucherClaimSheet } from "@/store/voucher-claim-sheet";
import { useT } from "@/i18n/use-t";
import type { VoucherSurface } from "@/mock/vouchers";
import { useAuditUiCopy } from '@/i18n/audit-ui';
import { fmt, fmtMoney } from '@/i18n/format';
import { navTo } from '@/lib/route';
import { voucherBenefitSummary } from '@/lib/voucher-benefit-summary';
import { voucherSupportsSurface } from '@/lib/voucher-sheet-authority';

const props = defineProps<{ surface: VoucherSurface; embedded?: boolean }>();

const voucher = useVoucher();
const sheet = useVoucherClaimSheet();
const t = useT();

const copy = useAuditUiCopy();
const claimable = computed(() => voucher.claimableVouchers.filter(row => voucherSupportsSurface(row, props.surface)));
const offers = computed(() => [...new Map([...claimable.value, ...voucher.claimedUnused].map(row => [row.id,row])).values()]);
const summary = computed(() => voucherBenefitSummary(offers.value));
const maxDiscount = computed(() => summary.value.amount);
const faceValue = computed(() => maxDiscount.value != null ? fmtMoney(maxDiscount.value).replace(/^\$/, '').replace(/\.00$/, '') : summary.value.percent != null ? summary.value.percent + '%' : '–');
const visible = computed(() => offers.value.length > 0);

function open() {
  if (claimable.value.length) sheet.show(props.surface);
  else navTo('/pages/me/rewards-list?cat=voucher');
}


</script>

<style scoped>
.vb-wrap { min-width: 0; }
.vb-card { position: relative; overflow: hidden; height: 184px; box-sizing:border-box; border-radius: 22px; border: 1px solid var(--v5-border); color: var(--v5-ink); background: radial-gradient(80% 60% at 92% 8%,color-mix(in srgb,var(--v5-brand) 20%,transparent),transparent 62%),linear-gradient(180deg,var(--ui-ticket-top),var(--ui-ticket-bottom)); }
.vb-card::before,.vb-card::after { content:''; position:absolute; top:110px; width:18px; height:18px; border-radius:50%; background:var(--v5-bg); border:1px solid var(--v5-border); z-index:2; }
.vb-card::before { left:-10px; }.vb-card::after { right:-10px; }
.vb-card:focus-visible { outline:2px solid var(--v5-brand); outline-offset:3px; }
.vb-art { position:absolute; right:-18px; top:-6px; width:112px; height:112px; pointer-events:none; }
.vb-art .nx-home-art { width:100%;height:100%; transform:rotate(-8deg); animation:voucher-float 4.6s ease-in-out infinite; }
@keyframes voucher-float { 0%,100% { transform:translateY(0) rotate(-8deg); } 50% { transform:translateY(-4px) rotate(-6deg); } }
@media(prefers-reduced-motion:reduce) { .vb-art .nx-home-art { animation:none; } }
.vb-meta { position:relative;padding:14px 14px 0; }
.vb-heading { display:flex;align-items:center;gap:6px; }
.vb-title { font:500 12.5px/20px var(--font-v5);color:var(--ui-lime-soft); }
.vb-count { display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:999px;background:color-mix(in srgb,var(--v5-brand) 16%,transparent);color:var(--ui-lime-soft);font:600 11.5px/1 var(--font-v5);white-space:nowrap; }
.vb-value { display:flex;align-items:baseline;gap:2px;margin-top:22px;font:600 34px/38px var(--font-v5);letter-spacing:-.02em;color:var(--ui-lime-pale);font-variant-numeric:tabular-nums; }
.vb-currency { font-size:16px;color:var(--ui-lime-soft); }
.vb-sub { display:block;margin-top:2px;font:400 12.5px/18px var(--font-v5);color:var(--v5-ink-3); }
.vb-rule { position:absolute;left:14px;right:14px;top:119px;border-top:1px dashed var(--v5-border-strong); }
.vb-footer { position:absolute;left:14px;right:12px;bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:4px;font:400 12.5px/18px var(--font-v5);color:var(--v5-ink-2); }
.vb-footer svg { flex:none;color:var(--v5-ink-4); }
@media(max-width:350px) { .vb-heading { gap:3px;flex-wrap:wrap; }.vb-meta { padding-inline:12px; }.vb-value { font-size:30px;margin-top:16px; }.vb-art { width:94px;height:94px; }.vb-footer { font-size:11px; } }
@media(max-width:350px) {
  .vb-wrap--embedded .vb-card { height:100%;min-height:216px; }
  .vb-wrap--embedded .vb-card::before,.vb-wrap--embedded .vb-card::after { top:auto;bottom:55px; }
  .vb-wrap--embedded .vb-rule { top:auto;bottom:64px; }
}
</style>
