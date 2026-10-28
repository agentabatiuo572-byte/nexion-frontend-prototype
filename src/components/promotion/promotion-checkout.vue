<template>
  <view class="promotion promotion-main">
    <view class="checkout-steps" :aria-label="p.selected">
      <view v-for="(label,index) in p.steps" :key="index" :aria-current="index===checkoutStep?'step':undefined">
        <view class="checkout-step-track"><view class="checkout-step-fill" :class="{'checkout-step-fill--active':index<=checkoutStep}" /></view>
        <text class="checkout-step-label" :class="{'checkout-step-label--active':index<=checkoutStep}">{{ index+1 }} {{ label }}</text>
      </view>
    </view>
    <view v-if="!auth.isAuthenticated" class="promotion-flat"><text class="promotion-title">{{ p.signIn }}</text><PromotionAction class="promotion-action primary" role="button" tabindex="0" @click="signIn"><text>{{ p.signIn }}</text></PromotionAction></view>
    <view v-else-if="loading" class="promotion-flat" role="status" aria-live="polite"><text>{{ p.loading }}</text></view>
    <template v-else>
      <view v-if="unknown" class="promotion-flat" role="status"><text class="promotion-title">{{ session.record.pending?.operation==='payOrder'?p.unknownTitle:p.orderUnknownTitle }}</text><text class="promotion-copy">{{ p.unknownBody }}</text><PromotionAction class="promotion-action primary" role="button" tabindex="0" :aria-disabled="busy" @click="recover"><text>{{ p.query }}</text></PromotionAction></view>
      <view v-if="error" class="promotion-notice" role="alert"><text>{{ error }}</text></view>
      <view v-if="openedOriginal" class="promotion-notice" role="status"><text>{{ p.openedOriginal }}</text></view>
      <view v-if="items.length" class="checkout-group checkout-products" :aria-label="p.selected">
        <view v-for="item in items" :key="item.productNo" class="promotion-row checkout-product-line">
          <view class="checkout-product-art"><image v-if="getProduct(item.productNo)?.imageUrl" :src="getProduct(item.productNo)!.imageUrl" class="promotion-image" mode="aspectFit" aria-hidden="true" /></view>
          <view class="promotion-grow"><text class="checkout-item-name">{{ selectedItemName(item) }}</text><text class="promotion-copy">{{ p.quantity }} · {{ item.quantity }}</text>
            <text v-if="displayQuote||order" class="promotion-price checkout-line-price">{{ formatAmount(itemSubtotal(item)) }} USDT</text>
          </view>
          <view class="checkout-item-quantity" :aria-label="selectedItemName(item)+' · '+p.quantity">
            <view class="checkout-item-quantity-button" data-testid="checkout-item-decrease" role="button" :tabindex="canChangeQuantity(item.productNo,-1)?0:-1" :aria-disabled="!canChangeQuantity(item.productNo,-1)" :aria-label="t.uiChrome.decreaseQty" @click="changeQuantity(item.productNo,-1)" @keydown.enter.prevent="changeQuantity(item.productNo,-1,$event)" @keydown.space.prevent="changeQuantity(item.productNo,-1,$event)">−</view>
            <text class="checkout-item-quantity-value" aria-live="polite">{{ item.quantity }}</text>
            <view class="checkout-item-quantity-button" data-testid="checkout-item-increase" role="button" :tabindex="canChangeQuantity(item.productNo,1)?0:-1" :aria-disabled="!canChangeQuantity(item.productNo,1)" :aria-label="t.uiChrome.increaseQty" @click="changeQuantity(item.productNo,1)" @keydown.enter.prevent="changeQuantity(item.productNo,1,$event)" @keydown.space.prevent="changeQuantity(item.productNo,1,$event)">+</view>
          </view>
        </view>
      </view>
      <view v-if="displayQuote||order||eventVoucherId" class="checkout-section" data-testid="checkout-discounts">
        <text class="checkout-section-heading">{{ p.discount }}</text>
        <view class="checkout-group">
          <view v-if="eventVoucherId&&!order&&!openedOriginal&&!session.record.pending" class="checkout-discount-row" data-testid="checkout-event-voucher">
            <view class="checkout-discount-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" /><path d="M14 6v2m0 3v2m0 3v2" /></svg></view>
            <view class="promotion-grow"><text class="checkout-discount-title">{{ p.eventVoucher }}</text><text class="checkout-discount-description">{{ p.eventVoucherTerms }}</text>
              <PromotionAction v-if="eventVoucherStatus==='claimable'" class="promotion-action primary" role="button" tabindex="0" :aria-disabled="busy" @click="claimEventVoucher"><text>{{ p.claimEventVoucher }}</text></PromotionAction>
              <text v-else-if="eventVoucherStatus==='unavailable'" class="promotion-notice">{{ p.eventVoucherUnavailable }}</text>
            </view>
            <text v-if="voucherOnlyDiscount!==undefined" class="checkout-discount-value">{{ formatDiscount(voucherOnlyDiscount) }} USDT</text>
          </view>
          <view v-if="!order&&items.length===1&&!openedOriginal&&!eventVoucherId" class="checkout-discount-row promotion-link checkout-voucher-row" role="button" :tabindex="busy||session.record.pending?-1:0" :aria-disabled="busy||!!session.record.pending" @click="chooseVoucher" @keydown.enter.prevent="chooseVoucher" @keydown.space.prevent="chooseVoucher">
            <view class="checkout-discount-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" /><path d="M14 6v2m0 3v2m0 3v2" /></svg></view>
            <view class="promotion-grow"><text class="checkout-discount-title">{{ p.voucher }}</text><text class="checkout-discount-description">{{ selectedVoucherName }}</text></view>
            <text v-if="voucherOnlyDiscount!==undefined" class="checkout-discount-value">{{ formatDiscount(voucherOnlyDiscount) }} USDT</text>
            <svg class="checkout-discount-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </view>
          <view v-if="voucherOnlyDiscount===undefined" class="checkout-discount-row" data-testid="checkout-total-discount">
            <view class="checkout-discount-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 18 12-12" /><circle cx="7" cy="7" r="2" /><circle cx="17" cy="17" r="2" /></svg></view>
            <text class="promotion-grow checkout-discount-title">{{ p.discount }}</text><text class="checkout-discount-value">{{ formatDiscount(summary?.discountUsdt) }} USDT</text>
          </view>
          <view v-if="rewards.length" class="checkout-rewards">
            <view v-if="compactGift" class="checkout-discount-row checkout-gift-summary" data-testid="checkout-gift-summary" role="button" tabindex="0" :aria-label="p.checkoutGiftTitle+' · '+compactGiftSummary+' · '+p.rulesLink" @click="termsOpen=true" @keydown.enter.prevent="termsOpen=true" @keydown.space.prevent="termsOpen=true">
              <view class="checkout-discount-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" /></svg></view>
              <view class="promotion-grow"><text class="checkout-discount-title">{{ p.checkoutGiftTitle }}</text><text class="checkout-discount-description">{{ compactGiftSummary }} · {{ p.checkoutGiftSettlement }}</text></view>
              <text class="checkout-gift-badge">{{ p.checkoutGiftBadge }}</text>
            </view>
            <view v-else class="checkout-discount-row checkout-rewards-heading">
              <view class="checkout-discount-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z" /></svg></view>
              <view class="promotion-grow"><text class="checkout-discount-title">{{ rewardsReleased ? p.rewardCancelled : order ? (order.paymentStatus==='PENDING'?p.locked:p.orderRewards) : p.expected }}</text><text class="checkout-discount-description">{{ rewardsReleased ? reviewCopy.releasedRewards : p.rewardNote }}</text></view>
            </view>
            <RewardRows v-if="!compactGift&&!rewardsReleased" :expected="rewards" :lines="order?.items??displayQuote?.items" />
            <view v-if="!compactGift&&hasRewardTerms" class="promotion-link checkout-reward-terms" role="button" tabindex="0" @click="termsOpen=true" @keydown.enter.prevent="termsOpen=true" @keydown.space.prevent="termsOpen=true"><text>{{ p.rulesLink }}</text></view>
          </view>
        </view>
      </view>
      <view v-if="displayQuote || order" class="checkout-section" data-testid="checkout-payment">
        <text class="checkout-section-heading">{{ t.store.coPaymentMethod }}</text>
        <view class="checkout-group">
          <view class="checkout-wallet">
            <view class="checkout-wallet-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M16 12h6v4h-6z" /></svg></view>
            <view class="promotion-grow"><text class="checkout-item-name">{{ p.wallet }}</text>
              <text class="promotion-copy">{{ t.wallet.usdtBalance }} · {{ (walletState==='ready' || (walletState==='loading' && app.remoteFleetHasSnapshot)) ? formatAmount(app.user.usdtBalance)+' USDT' : walletState==='loading' ? reviewCopy.walletLoading : reviewCopy.walletError }}</text>
            </view>
          </view>
          <view class="checkout-wallet-actions">
            <PromotionAction class="promotion-link" role="button" :tabindex="walletState==='loading'?-1:0" :aria-disabled="walletState==='loading'" :style="{ opacity: walletState==='loading' && app.remoteFleetHasSnapshot && !busy ? 1 : undefined }" @click="walletState!=='loading'&&refreshWallet()" @keydown.enter.prevent="walletState!=='loading'&&refreshWallet()" @keydown.space.prevent="walletState!=='loading'&&refreshWallet()"><text>{{ reviewCopy.walletRefresh }}</text></PromotionAction>
            <view class="promotion-link" role="link" tabindex="0" @click="navTo('/pages/me/wallet-topup')" @keydown.enter.prevent="navTo('/pages/me/wallet-topup')"><text>{{ p.topup }}</text></view>
          </view>
        </view>
      </view>
      <view v-if="summary" class="checkout-section" data-testid="checkout-fees">
        <text class="checkout-section-heading">{{ t.store.coReviewOrder }}</text>
        <view class="checkout-group checkout-fees">
          <view class="promotion-summary"><text>{{ p.subtotal }}</text><text>{{ formatAmount(summary.subtotalUsdt) }} USDT</text></view>
          <view class="promotion-summary"><text>{{ p.discount }}</text><text class="checkout-discount-value">{{ formatDiscount(summary.discountUsdt) }} USDT</text></view>
          <view class="promotion-summary total"><text>{{ p.total }}</text><text>{{ formatAmount(summary.amountUsdt) }} USDT</text></view>
        </view>
        <view v-if="order ? order.paymentStatus==='PENDING'&&order.payBy : promotion?.endsAt" class="promotion-row"><text aria-hidden="true">◷</text><view class="promotion-grow"><text class="promotion-copy">{{ order ? p.payBy : p.deadline }}</text><text class="promotion-copy">{{ displayDeadline(order?.payBy??promotion!.endsAt,locale.code) }}</text></view></view>
      </view>
      <view v-if="displayQuote?.warnings.length" class="promotion-notice"><text v-for="(warning,index) in displayQuote.warnings" :key="index" class="promotion-copy">{{ localized(warning,locale.code) }}</text></view>
      <template v-if="auth.isAuthenticated">
        <template v-if="order">
          <text class="promotion-copy">{{ p.orderNo }} · {{ order.orderNo }}</text>
          <text class="promotion-title">{{ order.paymentStatus==='PAID' ? p.paid : order.paymentStatus==='REFUNDED' ? p.refunded : order.paymentStatus==='PENDING' ? p.pending : order.paymentStatus==='CANCELLED' ? p.rewardCancelled : order.paymentStatus==='EXPIRED' ? t.orders.statusExpired : p.unavailable }}</text>
          <text v-if="order.paymentStatus==='PAID'" class="promotion-copy">{{ activationReadbackCopy }}</text>
          <text v-if="order.paymentStatus==='PENDING'&&payWindow!==true" class="promotion-notice">{{ payWindow===false?t.orders.statusExpired:p.unknown }}</text>

          <PromotionAction class="promotion-action" role="button" tabindex="0" :aria-disabled="busy" @click="recover"><text>{{ p.query }}</text></PromotionAction>
          <view class="promotion-link" role="button" tabindex="0" @click="viewOrder"><text>{{ p.viewOrder }}</text></view>
          <PromotionAction v-if="!openedOriginal&&!props.orderNo&&props.items.length&&canStartNew" class="promotion-action primary" role="button" tabindex="0" :aria-disabled="busy" @click="startNewPurchase"><text>{{ p.buyAgain }}</text></PromotionAction>
          <view v-if="order.paymentStatus==='PENDING'&&!unknown&&canCancel" class="promotion-link" role="button" tabindex="0" :aria-disabled="busy" @click="cancelOrder"><text>{{ session.record.pending?.operation==='cancelOrder' ? p.retryOriginalCancel : p.cancelOrder }}</text></view>
        </template>
        <template v-else-if="!unknown">
          <text v-if="quote&&!quoteFresh" class="promotion-notice">{{ p.quoteExpired }}</text>
          <text v-if="quote && !completeTerms" class="promotion-notice">{{ p.termsMissing }}</text>
          <text v-if="quote&&quote.eligibility!=='ELIGIBLE'" class="promotion-notice">{{ p.disabledNote }}</text>

          <PromotionAction v-if="!openedOriginal" class="promotion-action" role="button" tabindex="0" :aria-disabled="busy||!!session.record.pending" @click="loadQuote"><text>{{ p.quote }}</text></PromotionAction>
        </template>
      </template>
    </template>
    <slot name="review-footer" />
    <NxSheet :open="voucherOpen" :title="p.voucher" @close="voucherOpen=false">
      <view class="checkout-voucher-options" role="group" :aria-label="p.voucher">
        <PromotionAction class="promotion-action" role="button" tabindex="0" :aria-pressed="voucherId===null" @click="selectVoucher(null)" @keydown.enter.prevent="selectVoucher(null)" @keydown.space.prevent="selectVoucher(null)"><text>{{ p.noVoucher }}</text></PromotionAction>
        <PromotionAction v-for="option in voucherOptions" :key="option.def.id" class="promotion-action checkout-voucher-option" role="button" tabindex="0" :aria-pressed="voucherId===option.def.id" @click="selectVoucher(option.def.id)" @keydown.enter.prevent="selectVoucher(option.def.id)" @keydown.space.prevent="selectVoucher(option.def.id)">
          <text class="checkout-item-name">{{ option.def.name }}</text>
          <text class="promotion-copy">{{ fmt(p.voucherSaving,{amount:formatAmount(option.discount)}) }}</text>
          <text class="promotion-copy">{{ voucherCondition(option.def) }}</text>
        </PromotionAction>
      </view>
    </NxSheet>
    <PromotionTerms :open="termsOpen" :title="localized(promotion?.title,locale.code)" :terms="order ? '' : localized(promotion?.terms,locale.code)" :disclosures="disclosures" @close="termsOpen=false" />
    <view v-if="leaveOpen" class="promotion-overlay">
      <view class="promotion-overlay-dismiss" aria-hidden="true" @click="finishLeave(false)" />
      <view class="promotion-modal promotion-leave" role="dialog" aria-modal="true" :aria-label="p.leaveTitle" tabindex="-1"><LiquidGlass :radius="28" tone="navigation" /><view class="promotion-modal-content"><text class="promotion-title">{{ p.leaveTitle }}</text><text class="promotion-copy" style="margin-top:12px">{{ order?p.reservedBody:p.leaveBody }}</text><view class="promotion-actions"><PromotionAction class="promotion-action primary" role="button" tabindex="0" @click="finishLeave(false)"><text>{{ p.continue }}</text></PromotionAction><PromotionAction class="promotion-action" role="button" tabindex="0" @click="finishLeave(true)"><text>{{ p.exit }}</text></PromotionAction></view></view></view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { formatAmount as formatPlainAmount } from "@/lib/amount-display";
import { commerceCopy } from '@/lib/commerce-review';
import PromotionAction from '@/components/promotion/promotion-action.vue';
import LiquidGlass from '@/components/liquid-glass.vue';
import NxSheet from '@/components/ui/nx-sheet.vue';
import { computed,ref,shallowRef,watch,onMounted,onBeforeUnmount } from 'vue';
// #ifdef H5
import { onBeforeRouteLeave } from 'vue-router';
// #endif
import { promotionApi,deviceE3Api } from '@/api/runtime';
import type { PublicPromotion,ExpectedReward } from '@/api/promotion-api';
import type { PromotionItem } from '@/api/promotion-api';
import { validatePromotionItems } from '@/api/promotion-api';
import type { LocalizedText,RewardDisclosure,Quote } from '@/api/promotion-contracts';
import { useT } from '@/i18n/use-t';import { useLocaleStore } from '@/store/locale';import { useApp } from '@/store/app';import { useAuth } from '@/store/auth';
import { useVoucher } from '@/store/voucher';
import { computeVoucherDiscount,isVoucherValid,voucherAppliesToSku,type VoucherDef } from '@/mock/vouchers';
import { ApiError,asApiError } from '@/api/errors';
import { getProduct as readProduct } from '@/mock/products';import { refreshProductCatalog,productCatalogState,productCatalogPresentation } from '@/store/product-catalog';
import { navTo,navBack } from '@/lib/route';import { confirm,useUI } from '@/store/ui';
import { fmt } from '@/i18n/format';
import { PromotionCheckoutSession,selectPromotionCheckoutRecord,type PromotionCheckoutRecord } from '@/lib/promotion-checkout-session';
import { acquireAccountCommandKey,readAccountRow,writeAccountRow } from '@/store/account-scoped-storage';
import { registerCheckoutLeaveGuard,requestCheckoutLeave } from '@/lib/promotion-leave-guard';
import { readTrustedMonotonicNowMs,projectServerNow } from '@/lib/server-deadline-clock';
import { useDialogA11y } from '@/composables/use-dialog-a11y';
import { displayDeadline,localized,rewardSummary } from '@/lib/promotion-display';
import { promotionCheckoutHref } from '@/lib/promotion-entry';
import RewardRows from './reward-rows.vue';import PromotionTerms from './promotion-terms.vue';
const props=defineProps<{activityId:string;items:PromotionItem[];orderNo?:string;voucherId?:string;upgradeActivityId?:string}>();
function formatAmount(value: Parameters<typeof formatPlainAmount>[0]): string {
  // Checkout must disclose the exact payable, including sub-cent USDT. This
  // formatting never feeds back into a quote, receipt or payment command.
  if (formatPlainAmount(value) === '-') return '-';
  const [, sign, integer, fraction = '', exponent = '0'] = String(value).trim().match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i)!;
  const digits = integer + fraction, point = integer.length + Number(exponent);
  const whole = (point > 0 ? digits.slice(0, point).padEnd(point, '0') : '0').replace(/^0+(?=\d)/, '');
  const tail = ((point < 0 ? '0'.repeat(-point) : '') + digits.slice(Math.max(point, 0))).replace(/0+$/, '').padEnd(2, '0');
  return (sign === '-' && /[1-9]/.test(digits) ? '-' : '') + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + tail;
}
function formatDiscount(value: Parameters<typeof formatPlainAmount>[0]): string {
  const amount = formatAmount(value);
  return amount !== '-' && !amount.startsWith('-') && /[1-9]/.test(amount) ? '−' + amount : amount;
}
function getProduct(id:string){void productCatalogState.status;return readProduct(id);}
const t=useT(),p=computed(()=>t.value.promotion),locale=useLocaleStore(),app=useApp(),auth=useAuth(),voucher=useVoucher();
function selectedItemName(item:{productNo:string;productName?:string}){return (item.productName??getProduct(item.productNo)?.name??productCatalogPresentation.value?.products.find(product=>product.id===item.productNo)?.name??p.value.unknown);}
const reviewCopy=computed(()=>commerceCopy(locale.code));
const walletState=ref<'idle'|'loading'|'ready'|'error'>('idle');
let walletGeneration=0;
let catalogRefresh:Promise<boolean>|null=null;
async function refreshWallet(coalesce=false){
  if(!current()||!visible||!auth.isAuthenticated)return;
  const generation=++walletGeneration;walletState.value='loading';
  try{
    // Catalog completion advances the runtime fence. Capture the wallet read
    // afterwards, without delaying original-order or command recovery.
    if(catalogRefresh)await catalogRefresh;
    if(!current()||!visible||generation!==walletGeneration)return;
    const ok=await app.refreshRemoteFleet(app.captureRemoteAccountRequest(),{coalesce});
    if(current()&&visible&&generation===walletGeneration)walletState.value=ok&&app.remoteFleetHasSnapshot?'ready':'error';
  }catch{if(current()&&visible&&generation===walletGeneration)walletState.value='error';}
}
const account=app.accountKey,epoch=app.accountBindingEpoch;let alive=true,visible=true,readGeneration=0,refreshOnIdle=false;const current=()=>alive&&app.accountKey===account&&app.accountBindingEpoch===epoch;
const readCurrent=(generation:number)=>current()&&visible&&generation===readGeneration;
const TABLE='nexgrid-promotion-checkout-v1';
let storageReadable=true;let records:Record<string,PromotionCheckoutRecord>={};
try{records=readAccountRow<Record<string,PromotionCheckoutRecord>>(TABLE,account,true)??{};}catch{storageReadable=false;}
// A changed route cannot bypass an unresolved command from this same account.
const {intent,record:stored,openedOriginal}=selectPromotionCheckoutRecord(records,props);
const session=new PromotionCheckoutSession({api:promotionApi,current,key:key=>acquireAccountCommandKey('nexgrid-promotion-commands-v1',account,key,'promotion'),save:record=>{if(!storageReadable)throw new Error('STORAGE_UNAVAILABLE');const rows=readAccountRow<Record<string,PromotionCheckoutRecord>>(TABLE,account,true)??{};if(!writeAccountRow(TABLE,account,{...rows,[intent]:record}))throw new Error('STORAGE_UNAVAILABLE');}},stored);
const quotePresentation=shallowRef<{key:string;quote:Quote}|null>(null);
const freshQuoteReady=ref(false),revision=ref(0),quote=computed(()=>{revision.value;return session.record.pending||session.record.order||(freshQuoteReady.value&&quotePresentation.value?.key===quotePresentationKey())?session.record.quote:null;}),order=computed(()=>{revision.value;return session.record.order;}),unknown=computed(()=>{revision.value;return session.unknown;});
// Display memory never enters the executable session; refresh still invalidates that quote.
const displayQuote=computed(()=>current()&&visible&&auth.isAuthenticated ? quote.value??(quotePresentation.value?.key===quotePresentationKey()?quotePresentation.value.quote:null):null);
function quotePresentationKey(){return JSON.stringify([app.accountKey,app.accountBindingEpoch,auth.isAuthenticated,props.activityId,selection.value,eventVoucherId,props.upgradeActivityId??'',manualVoucher()?['manual',voucherId.value]:['auto'],locale.code]);}
// Payment receipts do not carry activation status. Keep activation unconfirmed;
// ended orders must never imply that payment or activation is in progress.
const checkoutStep=computed(()=>!order.value?0:['PENDING','PAID'].includes(order.value.paymentStatus)?1:-1);
const activationReadbackCopy=computed(()=>locale.code==='zh'?'付款已确认，开通状态请查看订单。':locale.code==='vi'?'Đã xác nhận thanh toán. Xem đơn hàng để kiểm tra trạng thái kích hoạt.':'Payment confirmed. View the order for activation status.');
const receiptQuote=computed(()=>order.value?.promotionQuoteId===quote.value?.quoteId?quote.value:null);
const summary=computed(()=>order.value?{
  subtotalUsdt:order.value.subtotalUsdt??receiptQuote.value?.subtotalUsdt,
  discountUsdt:order.value.discountUsdt??receiptQuote.value?.discountUsdt,
  amountUsdt:order.value.amountUsdt,
}:displayQuote.value);
function itemSubtotal(item:{productNo:string;quantity:number;subtotalUsdt?:string}) {
  if(item.subtotalUsdt!==undefined)return item.subtotalUsdt;
  return (order.value?receiptQuote.value:displayQuote.value)?.items.find(line=>line.productNo===item.productNo&&line.quantity===item.quantity)?.subtotalUsdt;
}
const promotion=shallowRef<PublicPromotion|null>(null),loading=ref(true),busy=ref(false),error=ref(''),termsOpen=ref(false),leaveOpen=ref(false);
const eventVoucherId=props.voucherId?.trim()??'';
const eventVoucherStatus=ref<'loading'|'claimable'|'available'|'unavailable'>('loading');
const voucherId=ref(session.record.voucherId??(openedOriginal?null:eventVoucherId||null));const selectedVoucherName=computed(()=>voucher.catalog.find(v=>v.id===voucherId.value)?.name??p.value.noVoucher);
// The API has no voucher-specific amount. Attribute the total to the selected
// voucher only when this quote explicitly reports zero promotion discount.
const voucherOnlyDiscount=computed(()=>!order.value&&!openedOriginal&&!!voucherId.value&&session.record.voucherId===voucherId.value
  &&items.value.length===1&&!(eventVoucherId&&session.record.pending)
  &&displayQuote.value?.promotionDiscountUsdt!==undefined&&formatAmount(displayQuote.value.promotionDiscountUsdt)==='0.00'
  ?displayQuote.value.discountUsdt:undefined);
const voucherOpen=ref(false);
const manualVoucher=()=>session.record.voucherMode==='manual'||(session.record.voucherMode===undefined&&session.record.voucherId!==undefined);
function eligibleVouchers(subtotal:number) {
  if(selection.value.length!==1||!Number.isFinite(subtotal))return [];
  return voucher.claimedUnused.filter(def=>isVoucherValid(def)&&voucherAppliesToSku(def,selection.value[0].productNo))
    .map(def=>({def,discount:computeVoucherDiscount(def,subtotal)})).filter(option=>option.discount>0);
}
const voucherOptions=computed(()=>eligibleVouchers(Number(quote.value?.subtotalUsdt)));
function voucherCondition(def:VoucherDef):string {
  const scope=def.applicableSkus.length?def.applicableSkus.map(id=>selectedItemName({productNo:id})).join(' / '):p.value.voucherAllProducts;
  return [scope,fmt(p.value.voucherMinimum,{amount:formatAmount(def.minPurchaseUSD??0)}),def.endAt?p.value.deadline+' · '+displayDeadline(new Date(def.endAt).toISOString(),locale.code):''].filter(Boolean).join(' · ');
}
const selection=ref(props.items.map(({productNo,quantity})=>({productNo,quantity})));
const rewardsReleased=computed(()=>!!order.value&&['CANCELLED','EXPIRED','REFUNDED'].includes(order.value.paymentStatus));
const items=computed(()=>order.value?.items??displayQuote.value?.items??selection.value);const rewards=computed(()=>order.value?.rewards??displayQuote.value?.expectedRewards??[]);
// Match the published device FAQ's scope in store/detail; do not extend it to SHARE.
const hasDevicePolicy=computed(()=>items.value.some(item=>{const product=getProduct(item.productNo);return !!product&&product.productType!=='SHARE';}));
function canChangeQuantity(productNo:string,delta:-1|1):boolean {
  const item=selection.value.find(item=>item.productNo===productNo);
  return current()&&visible&&auth.isAuthenticated&&!loading.value&&!busy.value
    &&!openedOriginal&&!props.orderNo&&!session.record.pending&&!order.value&&!unknown.value
    &&!!item&&item.quantity+delta>=1&&selection.value.reduce((sum,item)=>sum+item.quantity,0)+delta<=100;
}
async function changeQuantity(productNo:string,delta:-1|1,event?:KeyboardEvent):Promise<void> {
  if(event?.repeat||!canChangeQuantity(productNo,delta))return;
  const next=selection.value.map(item=>item.productNo===productNo?{...item,quantity:item.quantity+delta}:item);
  validatePromotionItems(next);
  selection.value=next;
  await loadQuote();
}
function disclosure(r:ExpectedReward):RewardDisclosure|null {const d=r.disclosure;return d&&[d.title,d.terms,d.refundTerms,d.benefitDescription].every(x=>x&&['zh','en','vi'].every(l=>typeof x[l as keyof LocalizedText]==='string'&&x[l as keyof LocalizedText].trim()))?d:null;}
const disclosures=computed(()=>rewards.value.map(disclosure).filter((d):d is RewardDisclosure=>!!d));const completeTerms=computed(()=>disclosures.value.length===rewards.value.length);
const hasRewardTerms=computed(()=>auth.isAuthenticated&&!loading.value&&disclosures.value.length>0);
// The compact gift row is only for a simple, eligible buyer gift before order
// creation. Multiple rewards, inviter benefits and receipt states keep their
// full breakdown; a short summary must never hide a condition or cancellation.
const compactGift=computed(()=>{
  const reward=rewards.value[0];
  return !order.value&&items.value.length===1&&rewards.value.length===1&&completeTerms.value&&hasRewardTerms.value
    &&reward.eligibility==='ELIGIBLE'&&!reward.message&&reward.beneficiaryRole==='BUYER'
    &&reward.reward.beneficiaryRole==='BUYER'&&reward.reward.type==='DEVICE' ? reward : null;
});
const compactGiftSummary=computed(()=>compactGift.value?rewardSummary(compactGift.value.reward,p.value,compactGift.value.disclosure.deviceName,compactGift.value.groups):'');
let receivedAt:number|null=null,promotionReceivedAt:number|null=null,orderClock:{serverNow:number;at:number}|null=null,clockGeneration=0;const quoteFresh=ref(false),payWindow=ref<boolean|null>(null);let timer:ReturnType<typeof setInterval>|undefined;
watch(quotePresentationKey,()=>{
  quotePresentation.value=null;freshQuoteReady.value=false;receivedAt=null;quoteFresh.value=false;readGeneration++;
},{flush:'sync'});
function updateClock(){
  const now=readTrustedMonotonicNowMs();quoteFresh.value=!!quote.value&&receivedAt!==null&&now!==null&&projectServerNow(Date.parse(quote.value.serverTime),receivedAt,now)<Date.parse(quote.value.expiresAt);
  const sample=receivedAt!==null&&quote.value?{serverNow:Date.parse(quote.value.serverTime),at:receivedAt}:promotionReceivedAt!==null&&promotion.value?{serverNow:Date.parse(promotion.value.serverTime),at:promotionReceivedAt}:orderClock;
  const deadline=Date.parse(order.value?.payBy??'');
  payWindow.value=order.value?.paymentStatus==='PENDING'&&now!==null&&sample&&Number.isFinite(deadline)?projectServerNow(sample.serverNow,sample.at,now)<deadline:null;
}
async function loadOrderClock(){
  updateClock();if(!current()||order.value?.paymentStatus!=='PENDING'||payWindow.value!==null)return;
  const generation=++clockGeneration,sampledAt=readTrustedMonotonicNowMs();if(sampledAt===null)return;
  // Persisted quotes have no live monotonic anchor; an empty fleet still carries validated server time.
  const fleet=await deviceE3Api.fleet();if(!current()||generation!==clockGeneration)return;
  orderClock={serverNow:fleet.serverNow,at:sampledAt};updateClock();
}
const canCreate=computed(()=>current()&&visible&&auth.isAuthenticated&&!busy.value&&!unknown.value&&completeTerms.value&&(quoteFresh.value||session.retryOriginal)&&quote.value?.eligibility==='ELIGIBLE'&&session.canExecute(quote.value.items.length>1?'createBundle':'createOrder'));
const canPay=computed(()=>(Number(order.value?.amountUsdt)===0||walletState.value==='ready')&&!busy.value&&!unknown.value&&completeTerms.value&&session.confirmed&&order.value?.paymentStatus==='PENDING'&&payWindow.value===true&&session.canExecute('payOrder'));
const canCancel=computed(()=>{revision.value;return !busy.value&&!unknown.value&&session.confirmed&&order.value?.paymentStatus==='PENDING'&&session.canExecute('cancelOrder');});
const canStartNew=computed(()=>{revision.value;return !busy.value&&!unknown.value&&session.confirmed&&!session.record.pending&&!!order.value&&['PAID','CANCELLED','EXPIRED','REFUNDED'].includes(order.value.paymentStatus);});
async function run(action:()=>Promise<void>){if(busy.value||!current())return;busy.value=true;error.value='';try{await action();}catch(cause){if(current()){const message=asApiError(cause).message;error.value=message==='PROMOTION_NOT_ELIGIBLE_OR_UNAVAILABLE'?p.value.disabledNote:message.includes('CAPACITY_UNAVAILABLE')?p.value.capacityUnavailable:message==='PROMOTION_ACCOUNT_UNAVAILABLE'?p.value.accountUnavailable:message.includes('QUOTE_EXPIRED')||message.includes('QUOTE_INPUT_CHANGED')?p.value.quoteExpired:message.includes('INSUFFICIENT')?p.value.balanceInsufficient:p.value.errorNote;}}finally{if(current()){busy.value=false;revision.value++;updateClock();}}}
async function loadQuote(){
  if(busy.value||!visible||!current()||openedOriginal||props.orderNo||session.record.pending||session.record.order||!auth.isAuthenticated)return;
  const generation=++readGeneration,inputKey=quotePresentationKey();
  if(quotePresentation.value?.key!==inputKey){quotePresentation.value=null;promotion.value=null;}
  voucherOpen.value=false;freshQuoteReady.value=false;promotionReceivedAt=null;termsOpen.value=false;receivedAt=null;quoteFresh.value=false;
  await run(async()=>{
    try{session.invalidateQuote();revision.value++;}catch(cause){quotePresentation.value=null;throw cause;}
    const sampledAt=readTrustedMonotonicNowMs();
    if(props.activityId)void promotionApi.get(props.activityId,auth.isAuthenticated).then(value=>{
      if(readCurrent(generation)){promotion.value=value.state==='ACTIVE'?value:null;promotionReceivedAt=sampledAt;updateClock();}
    }).catch(()=>{});
    try{
      const requestedItems=selection.value.map(item=>({...item}));
      let result:Quote;
      let selectedId:string|null=voucherId.value;
      let activityId=props.activityId||null;
      if(eventVoucherId){
        eventVoucherStatus.value='loading';
        const refreshed=await voucher.refreshRemote();if(!readCurrent(generation))return;
        if(!refreshed)throw new Error('VOUCHER_STATE_UNAVAILABLE');
        const available=voucher.claimedUnused.some(offer=>offer.id===eventVoucherId);
        const claimable=voucher.claimableVouchers.some(offer=>offer.id===eventVoucherId&&(!offer.claimSurfaces.length||offer.claimSurfaces.includes('store')));
        eventVoucherStatus.value=requestedItems.length!==1?'unavailable':available?'available':claimable?'claimable':'unavailable';
        if(eventVoucherStatus.value!=='available'){quotePresentation.value=null;promotion.value=null;return;}
        voucherId.value=eventVoucherId;activityId=null;
        if(props.upgradeActivityId){
          const candidate=await promotionApi.get(props.upgradeActivityId,true);if(!readCurrent(generation))return;
          if(candidate.state==='ACTIVE'&&candidate.eligibility==='ESTIMATE_ELIGIBLE'&&candidate.productNos.includes(requestedItems[0].productNo)){
            activityId=candidate.activityId;promotion.value=candidate;promotionReceivedAt=sampledAt;
          }
        }
      }
      if(eventVoucherId){
        result=await promotionApi.quote(requestedItems,activityId,voucherId.value,false);
        selectedId=eventVoucherId;
      }else{
        result=await promotionApi.quote(requestedItems,props.activityId||null,manualVoucher()?voucherId.value:null);
        if(!readCurrent(generation))return;
        selectedId=manualVoucher()?voucherId.value:null;
        if(!manualVoucher()&&requestedItems.length===1){
          if(!await voucher.refreshRemote())throw new Error('VOUCHER_CATALOG_UNAVAILABLE');
          if(!readCurrent(generation))return;
          for(const option of eligibleVouchers(Number(result.subtotalUsdt))){
            try{
              const candidate=await promotionApi.quote(requestedItems,props.activityId||null,option.def.id);
              if(!readCurrent(generation))return;
              if(candidate.eligibility==='ELIGIBLE'&&(result.eligibility!=='ELIGIBLE'||Number(candidate.amountUsdt)<Number(result.amountUsdt))){
                result=candidate;selectedId=option.def.id;
              }
            }catch(cause){
              if(!readCurrent(generation))return;
              // A rejected coupon can be skipped; an unavailable quote cannot be charged.
              if(asApiError(cause).kind!=='business')throw cause;
            }
          }
        }
      }
      if(!readCurrent(generation)||inputKey!==quotePresentationKey())return;
      if(result.items.length!==requestedItems.length||requestedItems.some(item=>!result.items.some(line=>line.productNo===item.productNo&&line.quantity===item.quantity)))throw new Error('QUOTE_INPUT_CHANGED');
      voucherId.value=selectedId;
      session.setQuote(result,selectedId);quotePresentation.value={key:quotePresentationKey(),quote:result};freshQuoteReady.value=true;receivedAt=sampledAt;revision.value++;updateClock();
    }catch(cause){if(readCurrent(generation)){if(!(cause instanceof ApiError&&cause.kind==='network')){quotePresentation.value=null;promotion.value=null;}throw cause;}}
  });
}
async function claimEventVoucher(){
  if(!eventVoucherId||eventVoucherStatus.value!=='claimable'||busy.value||!visible||!current()||openedOriginal||session.record.pending||order.value)return;
  const generation=readGeneration;
  let claimed=false;
  await run(async()=>{claimed=await voucher.claimRemote(eventVoucherId,'store');if(!claimed&&readCurrent(generation))throw new Error('VOUCHER_CLAIM_FAILED');});
  // A repeated claim receipt is idempotent; only a fresh voucher-state read can authorize use.
  if((claimed||voucher.remoteStatus==='ready')&&readCurrent(generation))await loadQuote();
}
async function chooseVoucher(){
  if(eventVoucherId||openedOriginal||props.orderNo||busy.value||session.record.pending||order.value||items.value.length!==1)return;
  const generation=readGeneration;
  const selectable=()=>readCurrent(generation)&&!busy.value&&!session.record.pending&&!order.value;
  if(!await voucher.refreshRemote()){if(selectable())error.value=p.value.errorNote;return;}
  if(selectable())voucherOpen.value=true;
}
async function selectVoucher(id:string|null){
  if(!voucherOpen.value||!current()||!visible||openedOriginal||props.orderNo||busy.value||session.record.pending||order.value||unknown.value)return;
  if(id!==null&&!voucherOptions.value.some(option=>option.def.id===id))return;
  try{session.selectVoucher(id);}catch{error.value=p.value.errorNote;return;}
  voucherId.value=id;voucherOpen.value=false;await loadQuote();
}
async function createOrder(){if(!canCreate.value)return;await run(()=>session.create());}
const paymentDialogOwner=`promotion-payment:${Date.now()}:${Math.random()}`;
let paymentConfirming=false;
async function pay(){
  updateClock();if(paymentConfirming||!visible||!current()||!canPay.value)return;
  const expectedOrder=order.value,generation=readGeneration;
  if(!expectedOrder)return;
  const {orderNo,amountUsdt}=expectedOrder;
  paymentConfirming=true;
  try{
    const accepted=await confirm({
      title:t.value.store.coConfirmPurchase,
      message:fmt(t.value.store.coConfirmPurchaseMessage,{amount:formatAmount(amountUsdt)}),
      confirmLabel:t.value.store.coConfirmPayment,cancelLabel:t.value.store.coCancel,owner:paymentDialogOwner,
    });
    updateClock();
    if(!accepted||!readCurrent(generation)||!canPay.value||order.value?.orderNo!==orderNo||order.value?.amountUsdt!==amountUsdt)return;
    walletState.value='loading';
    await run(()=>session.pay());
    await refreshWallet();
  }finally{paymentConfirming=false;}
}
async function recover(){walletState.value='loading';await run(async()=>{await session.recover();if(!current())return;revision.value++;await loadOrderClock();});await refreshWallet();}
async function startNewPurchase(){if(!canStartNew.value||props.orderNo||openedOriginal)return;session.startNewPurchase();asked='';voucherId.value=props.voucherId?.trim()||null;revision.value++;await loadQuote();}
async function cancelOrder(){if(!canCancel.value)return;const ok=await confirm({title:p.value.cancelTitle,message:p.value.cancelBody,confirmLabel:p.value.cancelOrder,cancelLabel:p.value.keep,danger:true});if(ok&&current())await run(()=>session.cancel());}
function viewOrder(){if(order.value)void navTo('/pages/store/order-detail?id='+encodeURIComponent(order.value.orderNo));}
function signIn(){void navTo('/pages/login/login?return='+encodeURIComponent(promotionCheckoutHref(selection.value,props.activityId,props)));}
let leaveResolver:((allowed:boolean)=>void)|null=null;let asked='';let disposeGuard:(()=>void)|null=null;
function finishLeave(allowed:boolean){leaveOpen.value=false;leaveResolver?.(allowed);leaveResolver=null;}
function requestLeave():Promise<boolean>{
  updateClock();
  const reserved=payWindow.value===true;
  const fingerprint=order.value?.orderNo??quote.value?.quoteId??'';
  if(!current()||busy.value||unknown.value||!rewards.value.length||!fingerprint||asked||session.record.leavePromptShown||(order.value?!reserved:!quoteFresh.value||quote.value?.eligibility!=='ELIGIBLE'))return Promise.resolve(true);
  asked=fingerprint;
  try{session.rememberLeavePrompt();}catch{return Promise.resolve(true);}
  leaveOpen.value=true;return new Promise(resolve=>{leaveResolver=resolve;});
}
useDialogA11y(leaveOpen,'.promotion-leave',()=>finishLeave(false));
// H5 browser history uses the router guard; no artificial history entry or popstate trap.
// #ifdef H5
onBeforeRouteLeave(()=>requestCheckoutLeave());
// #endif
let nativeBackApproved=false;
function back():boolean{if(nativeBackApproved){nativeBackApproved=false;return false;}void requestLeave().then(ok=>{if(ok&&current()){nativeBackApproved=true;navBack('/store');}});return true;}
function hide(){
  visible=false;quotePresentation.value=null;readGeneration++;walletGeneration++;walletState.value='idle';refreshOnIdle=false;termsOpen.value=false;voucherOpen.value=false;promotion.value=null;promotionReceivedAt=null;
  useUI().clearConfirmsBy(paymentDialogOwner);
  if(current()&&!session.record.pending&&!session.record.order){
    freshQuoteReady.value=false;receivedAt=null;quoteFresh.value=false;
    try{if(session.record.quote)session.invalidateQuote();}catch{error.value=p.value.errorNote;}
    revision.value++;
  }
  disposeGuard?.();disposeGuard=null;finishLeave(true);
}
function show(){
  visible=true;if(!current())return;
  if(!disposeGuard)disposeGuard=registerCheckoutLeaveGuard(requestLeave);
  if(busy.value){refreshOnIdle=true;return;}
  if(session.record.pending||session.record.order)void recover();else if(!props.orderNo){void refreshWallet(true);void loadQuote();}
}
watch(busy,value=>{if(!value&&refreshOnIdle){refreshOnIdle=false;if(visible&&current())show();}});
const footer = computed(() => {
  if (loading.value || !auth.isAuthenticated || unknown.value) return null;
  const rawAmount = order.value?.amountUsdt ?? displayQuote.value?.amountUsdt;
  const amount = rawAmount == null ? '-' : formatAmount(rawAmount)+' USDT';
  if (order.value?.paymentStatus === 'PENDING') return { amount, label: p.value.pay, disabled: !canPay.value, action: pay };
  if (!order.value) return { amount, label: p.value.confirmOrder, disabled: !canCreate.value, action: createOrder };
  return null;
});
defineExpose({back,hide,show,footer,hasDevicePolicy,hasRewardTerms});
onMounted(async()=>{
  disposeGuard=registerCheckoutLeaveGuard(requestLeave);timer=setInterval(updateClock,1000);
  // Catalog and current campaign visibility cannot block an original order or
  // command receipt. Historical rewards always come from that receipt.
  if(auth.isAuthenticated)catalogRefresh=refreshProductCatalog(true).catch(()=>false);
  try {
    if(auth.isAuthenticated){
      if(props.orderNo&&!session.record.order&&!session.record.pending){
        const receipt=await promotionApi.findOrder(props.orderNo);if(!current())return;
        if(!receipt)throw new Error('ORIGINAL_ORDER_NOT_FOUND');
        session.resume(receipt);
      }
      if(session.record.pending||session.record.order)await recover();else await Promise.all([loadQuote(),refreshWallet(true)]);
    }
  }catch{if(current())error.value=p.value.error;}finally{if(current())loading.value=false;}
});
onBeforeUnmount(()=>{hide();alive=false;if(timer)clearInterval(timer);});
</script>
<style src="./promotion.css"></style>

<style scoped>
.promotion-overlay { box-sizing: border-box; padding: max(16px, var(--nx-overlay-top)) 16px var(--nx-overlay-bottom); }
.promotion-leave { max-height: calc(100vh - max(16px, var(--nx-overlay-top)) - var(--nx-overlay-bottom)); overscroll-behavior: contain; }
.promotion-main { padding-bottom:140px; }
.checkout-steps { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
.checkout-step-track { height:3px; border-radius:999px; background:var(--v5-surface-3); }
.checkout-step-fill { height:100%; border-radius:inherit; }
.checkout-step-fill--active { background:linear-gradient(90deg,var(--v5-brand-deep),var(--ui-lime-soft)); box-shadow:0 0 10px var(--v5-brand-border); }
.checkout-step-label { display:block; margin-top:8px; font:400 12.5px/18px var(--font-v5); color:var(--v5-ink-3); overflow-wrap:anywhere; }
.checkout-step-label--active { color:var(--v5-brand); font-weight:600; }
.checkout-group { overflow:hidden; min-width:0; border:1px solid var(--v5-border); border-radius:22px; background:var(--ui-content-surface); }
.checkout-section { min-width:0; }
.checkout-section-heading { display:flex; align-items:center; min-height:44px; padding:0 2px; font:600 var(--ui-type-section)/20px var(--font-v5); }
.checkout-product-line { display:grid; grid-template-columns:68px minmax(0,1fr); align-items:center; gap:10px 12px; padding:10px 16px; }
.checkout-product-art { display:grid; place-items:center; width:68px; height:68px; border-radius:16px; overflow:hidden; background:radial-gradient(60% 30% at 50% 84%,color-mix(in srgb,var(--ui-lime-soft) 35%,transparent),transparent 70%),linear-gradient(180deg,var(--ui-content-surface-3),var(--ui-content-surface-2)); }
.checkout-product-art .promotion-image { width:74px; height:74px; }
.checkout-discount-row { display:flex; align-items:center; gap:12px; min-height:64px; box-sizing:border-box; padding:10px 16px; border-bottom:1px solid var(--v5-border); }
.checkout-discount-row:last-child { border-bottom:0; }
.checkout-discount-icon { display:grid; place-items:center; flex:none; width:36px; height:36px; border-radius:12px; background:var(--ui-content-surface-2); color:var(--v5-ink-2); }
.checkout-discount-title { display:block; font:500 var(--ui-type-list-title)/20px var(--font-v5); overflow-wrap:anywhere; }
.checkout-discount-description { display:block; margin-top:2px; font:400 13px/18px var(--font-v5); color:var(--v5-ink-3); overflow-wrap:anywhere; }
.checkout-discount-chevron { flex:none; color:var(--v5-ink-4); }
.checkout-voucher-row { gap:12px; color:var(--v5-ink); }
.checkout-voucher-row[aria-disabled="true"] { opacity:.45; }
.checkout-rewards-heading { border-bottom:0; }
.checkout-gift-summary { cursor:pointer; }
.checkout-gift-summary:focus-visible { outline:2px solid var(--v5-brand); outline-offset:-2px; }
.checkout-gift-badge { flex-shrink:0; padding:2px 7px; border-radius:6px; font:500 12px/18px var(--font-v5); color:var(--v5-brand); background:color-mix(in srgb,var(--v5-brand) 12%,transparent); }
.checkout-rewards :deep(.promotion-row) { align-items:center; min-height:64px; box-sizing:border-box; padding:10px 16px; }
.checkout-rewards :deep(.promotion-symbol) { display:grid; place-items:center; width:36px; height:36px; border-radius:12px; background:var(--ui-content-surface-2); color:var(--v5-ink-2); }
.checkout-rewards :deep(.promotion-symbol svg) { width:18px; height:18px; }
.checkout-rewards :deep(.promotion-grow > text:not([class])),.checkout-rewards :deep(.promotion-grow > uni-text:not([class])) { font:500 var(--ui-type-list-title)/20px var(--font-v5) !important; }
.checkout-rewards :deep(.promotion-copy) { margin-top:2px; font:400 var(--ui-type-list-subtitle)/18px var(--font-v5); }
.checkout-reward-terms { margin:0 16px 0 64px; }
.checkout-discount-value { color:var(--v5-brand); font-variant-numeric:tabular-nums; }
.checkout-discount-row .checkout-discount-value { flex-shrink:0; max-width:45%; overflow-wrap:anywhere; text-align:right; font:600 15px/20px var(--font-v5); }
.checkout-wallet { display:flex; align-items:center; gap:12px; padding:14px 16px; background:linear-gradient(90deg,color-mix(in srgb,var(--v5-brand) 12%,transparent),color-mix(in srgb,var(--v5-brand) 2%,transparent)); box-shadow:inset 3px 0 0 var(--v5-brand); }
.checkout-wallet-icon { display:grid; place-items:center; flex:none; width:36px; height:36px; border-radius:12px; color:var(--v5-brand); background:var(--ui-content-surface-2); }
.checkout-wallet-actions { display:flex; flex-wrap:wrap; gap:4px 16px; padding:0 16px; }
.checkout-fees { padding:6px 16px; }
.checkout-fees .promotion-summary { box-sizing:border-box; align-items:center; font-variant-numeric:tabular-nums; }
.checkout-fees .promotion-summary > :last-child { max-width:65%; }
.checkout-item-name { display:block; font:500 var(--ui-type-list-title)/20px var(--font-v5); overflow-wrap:anywhere; }
.checkout-line-price { display:block; margin-top:6px; line-height:1.5; overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
.checkout-voucher-options { display:flex; flex-direction:column; gap:var(--ui-space-inline); }
.checkout-voucher-option { align-items:flex-start; flex-direction:column; gap:6px; text-align:left; }
.checkout-voucher-options [aria-pressed="true"] { background:var(--v5-brand-soft); box-shadow:inset 0 0 0 1px var(--v5-brand); }
.checkout-item-quantity { grid-column:2; justify-self:start; display:inline-flex; align-items:center; border:1px solid var(--v5-border); border-radius:999px; background:var(--ui-content-surface-2); }
.checkout-item-quantity-button { display:grid; place-items:center; width:44px; min-height:44px; border-radius:999px; font:400 18px/20px var(--font-v5); cursor:pointer; }
.checkout-item-quantity-button[aria-disabled="true"] { opacity:.35; cursor:default; }
.checkout-item-quantity-button:focus-visible { outline:2px solid var(--v5-brand); outline-offset:-2px; }
.checkout-item-quantity-value { min-width:24px; text-align:center; font:600 15px/20px var(--font-v5); font-variant-numeric:tabular-nums; }
.promotion-summary.total { min-height:55px; box-sizing:border-box; }
@media(min-width:390px) { .checkout-product-line { grid-template-columns:68px minmax(0,1fr) auto; }.checkout-item-quantity { grid-column:3;grid-row:1; }.checkout-item-quantity-value { min-width:20px; } }
@media(prefers-reduced-motion:reduce) { .promotion-action:active { transform:none; } }
</style>
