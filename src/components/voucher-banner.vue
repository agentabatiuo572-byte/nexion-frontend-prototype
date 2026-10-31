<!-- Shared store-ticket appearance; eligibility and claiming remain store-owned. -->
<template>
  <view v-if="visible" class="vb-wrap">
    <view class="vb-card store-voucher-ticket">
      <view class="vb-card-entry" role="button" tabindex="0" :aria-label="t.voucher.bannerTitle" @click="open" @keydown.enter.prevent="open" @keydown.space.prevent="open" />
      <view class="store-voucher-ticket__value"><text v-if="maxDiscount != null" class="store-voucher-ticket__currency">$</text><text>{{ faceValue }}</text></view>
      <view class="store-voucher-ticket__rule" aria-hidden="true" />
      <view class="store-voucher-ticket__copy">
        <text class="store-voucher-ticket__title">{{ copy.voucherShort }} · {{ fmt(copy.voucherShortCount,{n:offers.length}) }}</text>
        <view class="store-voucher-ticket__hint">
          <text v-if="maxDiscount == null">{{ copy.voucherDiscount }}</text>
          <text v-if="!hasClaimed">{{ copy.claimToUse }}</text>
          <view v-else class="vb-claimed">
            <text>{{ t.voucher.bannerClaimed }}</text><text aria-hidden="true"> · </text>
            <view class="vb-use-link" role="link" tabindex="0" @click.stop="useVoucherNow" @keydown.enter.stop.prevent="useVoucherNow"><text>{{ t.voucher.bannerUse }}</text><text aria-hidden="true"> →</text></view>
          </view>
        </view>
      </view>
      <image class="store-voucher-ticket__art" src="/static/img/home-glass-20260928/coupon.webp" mode="aspectFit" aria-hidden="true" />
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
import { remoteApiEnabled } from '@/api/runtime';

const props = defineProps<{ surface: VoucherSurface }>();

const voucher = useVoucher();
const sheet = useVoucherClaimSheet();
const t = useT();

const copy = useAuditUiCopy();
const claimable = computed(() => (remoteApiEnabled ? voucher.presentationClaimable : voucher.claimableVouchers).filter(row => voucherSupportsSurface(row, props.surface)));
const offers = computed(() => remoteApiEnabled
  ? voucher.presentationOffers.filter(row => !voucher.presentationClaimable.some(item => item.id === row.id) || voucherSupportsSurface(row, props.surface))
  : [...new Map([...claimable.value, ...voucher.claimedUnused].map(row => [row.id,row])).values()]);
const summary = computed(() => voucherBenefitSummary(offers.value));
const hasClaimed = computed(() => offers.value.some(offer => !(remoteApiEnabled ? voucher.presentationClaimable : voucher.claimableVouchers).some(row => row.id === offer.id)));
const maxDiscount = computed(() => summary.value.amount);
const faceValue = computed(() => maxDiscount.value != null ? fmtMoney(maxDiscount.value).replace(/^\$/, '').replace(/\.00$/, '') : summary.value.percent != null ? summary.value.percent + '%' : '–');
const visible = computed(() => offers.value.length > 0);

function open() {
  if ((!remoteApiEnabled || voucher.remoteStatus === 'ready') && voucher.claimableVouchers.some(row => voucherSupportsSurface(row, props.surface))) sheet.show(props.surface);
  else navTo('/pages/me/rewards-list?cat=voucher');
}

function useVoucherNow() { navTo('/pages/store/store'); }


</script>

<style scoped src="@/components/store/voucher-ticket.css"></style>
<style scoped>
.vb-wrap { min-width:0; }
.vb-card-entry { position:absolute; inset:0; z-index:3; border-radius:inherit; }
.vb-card-entry:focus-visible { outline:2px solid var(--v5-brand); outline-offset:-3px; }
.vb-claimed { display:flex; align-items:center; flex-wrap:wrap; }
.vb-use-link { position:relative; z-index:4; display:inline-flex; align-items:center; min-height:44px; color:var(--v5-brand); white-space:nowrap; }
.vb-use-link:focus-visible { outline:2px solid var(--v5-brand); outline-offset:2px; border-radius:4px; }
</style>
