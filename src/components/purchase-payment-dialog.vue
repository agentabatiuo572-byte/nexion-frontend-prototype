<template>
  <view v-if="active && !s.open && (pending.length || showHistory && records.length)" class="purchase-payment-resume" role="status">
    <view v-for="row in showHistory ? records : pending" :key="row.commandKey" class="purchase-payment__row"><text>{{ row.summary }} · {{ row.lastStatus === 'MANUAL_REVIEW' ? copy.review : row.lastStatus === 'EXPIRED' ? copy.ended : row.businessDelivered ? copy.delivered : copy.resume }}</text><NxButton :label="copy.view" variant="text" @click="payment.resume(row)" /></view>
  </view>
  <NxSheet :open="s.open && active" :title="s.pending ? copy.pending : copy.title" @close="payment.close">
    <view class="purchase-payment">
      <text class="purchase-payment__summary">{{ s.summary }}</text>
      <template v-if="!s.pending">
        <view class="purchase-payment__methods" role="group" :aria-label="copy.title">
          <button v-for="method in methods" :key="method.id" class="purchase-payment__method" :class="{ selected: s.method === method.id }" :aria-pressed="s.method === method.id" :disabled="s.busy" @click="payment.select(method.id)">
            <view><text class="purchase-payment__title">{{ method.title }}</text><text class="purchase-payment__note">{{ method.hint }}</text><text v-if="method.id === 'WALLET'" class="purchase-payment__note">{{ copy.available }} · {{ balanceText }} USDT</text></view>
            <text aria-hidden="true" class="purchase-payment__check">{{ s.method === method.id ? '●' : '○' }}</text>
          </button>
        </view>
        <text v-if="s.loading" class="purchase-payment__note" role="status">{{ copy.loading }}</text>
      </template>
      <view v-if="fees" class="purchase-payment__fees">
        <view class="purchase-payment__row"><text>{{ copy.subtotal }}</text><text>{{ amount(fees.subtotalUsdt) }}</text></view>
        <view class="purchase-payment__row"><text>{{ copy.channelFee }}</text><text>{{ amount(fees.channelFeeUsdt) }}</text></view>
        <view class="purchase-payment__row"><text>{{ copy.networkFee }}</text><text>{{ s.method === 'HDPAY_BANK' ? copy.notApplicable : amount(fees.networkConfirmFeeUsdt) }}</text></view>
        <view class="purchase-payment__row purchase-payment__total"><text>{{ copy.total }}</text><CheckoutAmount :value="fees.totalUsdt" currency="USDT" /></view>
        <template v-if="s.method === 'HDPAY_BANK'">
          <view v-if="s.quote?.fxRateVndPerUsdt" class="purchase-payment__row"><text>{{ copy.fx }}</text><text>1 USDT = {{ s.quote.fxRateVndPerUsdt }} VND</text></view>
          <view class="purchase-payment__row purchase-payment__total"><text>{{ copy.total }}</text><text>{{ vnd(fees.amountVnd) }} VND</text></view>
        </template>
        <text class="purchase-payment__note">{{ copy.validity }} {{ expiry(fees.expiresAt) }}</text>
        <text v-if="s.method === 'CREGIS_USDT_BSC'" class="purchase-payment__note">{{ copy.gas }}</text>
      </view>
      <view v-else-if="!s.pending && s.method === 'WALLET'" class="purchase-payment__row purchase-payment__total"><text>{{ copy.total }}</text><CheckoutAmount :value="s.amount" currency="USDT" /></view>
      <template v-if="s.intent">
        <text class="purchase-payment__status" role="status">{{ intentMessage }}</text>
        <template v-if="s.intent.address && s.intent.status === 'AWAITING_PAYMENT'">
          <text class="purchase-payment__title">{{ copy.address }}</text>
          <image v-if="qrImage" class="purchase-payment__qr" :src="qrImage" mode="aspectFit" aria-hidden="true" />
          <text class="purchase-payment__address" selectable>{{ s.intent.address }}</text>
          <text class="purchase-payment__note">{{ copy.network }}</text>
          <NxButton :label="copy.copyAddress" variant="secondary" @click="copyAddress" />
        </template>
        <NxButton v-if="s.intent.paymentUrl && s.intent.status === 'AWAITING_PAYMENT'" :label="copy.openBank" variant="primary" @click="payment.openBank" />
      </template>
    </view>
    <template #footer>
      <view class="purchase-payment__footer">
        <text v-if="s.error" class="purchase-payment__error" role="alert">{{ copy.error }}</text>
        <text v-if="!s.pending && s.method === 'WALLET' && !walletEnough" class="purchase-payment__note">{{ balanceKnown ? copy.low : copy.walletUnavailable }}</text>
        <template v-if="s.pending">
          <text v-if="!s.intent" class="purchase-payment__note" role="status">{{ copy.unknown }}</text>
          <NxButton :label="s.busy ? copy.busy : copy.query" :busy="s.busy" variant="primary" @click="payment.query" />
          <NxButton v-if="s.unavailable" :label="copy.submitOriginal" variant="secondary" :disabled="s.busy" @click="payment.submitOriginal" />
          <NxButton v-if="s.intent?.status === 'MANUAL_REVIEW'" :label="copy.support" variant="text" @click="goSupport" />
          <NxButton v-if="s.intent?.fulfilmentStatus === 'DELIVERED'" :label="copy.viewOrder" variant="secondary" @click="payment.viewOrder" />
        </template>
        <template v-else>
          <NxButton v-if="s.error || quoteExpired" :label="copy.retry" variant="secondary" :disabled="s.loading" @click="payment.select(s.method)" />
          <text v-if="quoteExpired" class="purchase-payment__note">{{ copy.expired }}</text>
          <NxButton :label="copy.confirm" variant="primary" :busy="s.busy" :disabled="!canConfirm" @click="payment.confirm" />
        </template>
        <NxButton :label="copy.leave" variant="text" @click="payment.close" />
      </view>
    </template>
  </NxSheet>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { onShow, onHide, useVisibleInterval } from '@/composables/use-tab-page-lifecycle';
import NxSheet from '@/components/ui/nx-sheet.vue';
import NxButton from '@/components/ui/nx-button.vue';
import CheckoutAmount from '@/components/checkout/CheckoutAmount.vue';
import { usePurchasePayment } from '@/store/purchase-payment';
import { useApp } from '@/store/app';
import { useLocaleStore } from '@/store/locale';
import { purchasePaymentCopy } from '@/lib/purchase-payment-copy';
import { formatGroupedAmount } from '@/lib/amount-display';
import { navTo } from '@/lib/route';
import { toast } from '@/store/ui';
import type { PurchaseMethod } from '@/api/purchase-payment-api';
import qrcode from 'qrcode-generator';
const payment = usePurchasePayment(), s = payment.state, app = useApp(), locale = useLocaleStore();
withDefaults(defineProps<{ showHistory?: boolean }>(), { showHistory: false });
const active = ref(true);
const copy = computed(() => purchasePaymentCopy(locale.code));
const pending = computed(() => { app.accountKey; s.revision; return payment.pending(); });
const records = computed(() => { app.accountKey; s.revision; return payment.records(); });
const methods = computed<{ id: PurchaseMethod; title: string; hint: string }[]>(() => [
  { id: 'WALLET', title: copy.value.wallet, hint: copy.value.walletHint }, { id: 'HDPAY_BANK', title: copy.value.bank, hint: copy.value.bankHint }, { id: 'CREGIS_USDT_BSC', title: copy.value.chain, hint: copy.value.chainHint },
]);
const balanceKnown = computed(() => Number.isFinite(app.user.usdtBalance) && app.user.usdtBalance >= 0 && app.remoteFleetHasSnapshot);
const balanceText = computed(() => balanceKnown.value ? formatGroupedAmount(app.user.usdtBalance) : '—');
const walletEnough = computed(() => Number(s.amount) === 0 || balanceKnown.value && app.user.usdtBalance >= Number(s.amount));
const fees = computed(() => s.intent ?? s.quote);
const qrImage = computed(() => { if (!s.intent?.address) return ''; const qr = qrcode(0, 'M'); qr.addData(s.intent.address); qr.make(); return qr.createDataURL(6, 4); });
const now = ref(Date.now());
useVisibleInterval(() => { if (active.value && s.open) now.value = Date.now(); }, 1000);
const quoteExpired = computed(() => !!s.quote && !s.pending && Date.parse(s.quote.expiresAt) <= now.value);
const canConfirm = computed(() => !s.busy && !s.loading && !s.error && !quoteExpired.value && (s.method === 'WALLET' ? walletEnough.value : !!s.quote));
const intentMessage = computed(() => s.intent?.status === 'MANUAL_REVIEW' ? `${s.intent.fulfilmentStatus === 'DELIVERED' ? copy.value.delivered + '。' : ''}${copy.value.review}` : s.intent?.status === 'EXPIRED' ? copy.value.ended : copy.value.unknown);
function amount(value: string | number) { return formatGroupedAmount(value); }
function vnd(value: string | null) { return value ? Number(value).toLocaleString(locale.code === 'zh' ? 'zh-CN' : locale.code === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 0 }) : '—'; }
function expiry(value: string) { return new Date(value).toLocaleTimeString(undefined, { hour12: false }); }
function copyAddress() { if (s.intent?.address) uni.setClipboardData({ data: s.intent.address, success: () => toast.success(copy.value.copied) }); }
function goSupport() { payment.close(); void navTo('/pages/me/support'); }
watch(() => app.accountKey, () => payment.close());
function hide() { if (active.value && s.open) payment.close(); active.value = false; }
function visibility() { if (typeof document !== 'undefined' && document.hidden && active.value && s.open) payment.close(); }
onShow(() => { active.value = true; }); onHide(hide);
onMounted(() => { if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility); });
onUnmounted(() => { if (active.value && s.open) payment.close(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility); });
</script>
<style scoped>
.purchase-payment { display: grid; gap: var(--v5-space-4); }
.purchase-payment__summary,.purchase-payment__title { display: block; color: var(--v5-ink); font: var(--ui-type-list-title-weight) var(--ui-type-list-title)/var(--ui-type-list-title-lh) var(--font-v5); }
.purchase-payment__note { display: block; margin-top: var(--v5-space-2); color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.purchase-payment__methods,.purchase-payment__footer { display: grid; gap: var(--v5-space-3); }
.purchase-payment__method { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 72px; margin: 0; padding: var(--v5-space-4); box-sizing: border-box; text-align: left; border: 1px solid var(--v5-border); border-radius: var(--v5-radius-m); background: var(--v5-surface-2); color: var(--v5-ink); }
.purchase-payment__method::after { border: 0; }
.purchase-payment__method.selected { border-color: var(--v5-brand); }
.purchase-payment__check { flex: none; color: var(--v5-brand); margin-left: var(--v5-space-3); }
.purchase-payment__row { display: flex; align-items: center; justify-content: space-between; gap: var(--v5-space-3); padding: var(--v5-space-3) 0; border-bottom: 1px solid color-mix(in srgb, var(--v5-ink) 5%, transparent); color: var(--v5-ink-2); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.purchase-payment__total { color: var(--v5-ink); font-weight: 600; flex-wrap: wrap; }
.purchase-payment__address { display: block; word-break: break-all; padding: var(--v5-space-3); border-radius: var(--v5-radius-m); background: var(--v5-surface-2); color: var(--v5-ink); font-size: var(--ui-type-body); line-height: var(--ui-type-body-lh); }
.purchase-payment__qr { display: block; width: 180px; height: 180px; margin: 0 auto; padding: var(--v5-space-2); background: white; border-radius: var(--v5-radius-m); }
.purchase-payment__status { display: block; color: var(--v5-ink-2); font-size: var(--ui-type-body); line-height: var(--ui-type-body-lh); }
.purchase-payment__error { color: var(--v5-danger); font-size: var(--ui-type-body); line-height: var(--ui-type-body-lh); }
.purchase-payment-resume { position: fixed; z-index: 890; left: var(--v5-space-4); right: var(--v5-space-4); bottom: calc(var(--nx-overlay-safe-bottom, 24px) + 64px); display: grid; gap: var(--v5-space-2); max-height: 160px; overflow: auto; padding: var(--v5-space-2) var(--v5-space-3); border: 1px solid var(--v5-border); border-radius: var(--v5-radius-m); background: var(--v5-surface); color: var(--v5-ink); font-size: var(--ui-type-description); }
</style>
