<template>
  <view class="promotion promotion-main" :class="{'promotion-main--result':order?.paymentStatus==='PAID'}">
    <view v-if="!auth.isAuthenticated" class="promotion-flat"><text class="promotion-title">{{ p.signIn }}</text><PromotionAction class="promotion-action primary" role="button" tabindex="0" @click="signIn"><text>{{ p.signIn }}</text></PromotionAction></view>
    <view v-else-if="loading" class="promotion-flat" role="status" aria-live="polite"><text>{{ p.loading }}</text></view>
    <CheckoutResult v-else-if="order?.paymentStatus==='PAID'" :state="resultState" :product-name="items.map(selectedItemName).join(' · ')" :product-image="items[0]?getProduct(items[0].productNo)?.imageUrl:undefined" :amount="order.amountUsdt??''" :error="resultError" @devices="viewDevices" @retry="readActivation">
      <PromotionAction v-if="!openedOriginal&&!props.orderNo&&props.items.length&&canStartNew" data-testid="checkout-buy-again" class="promotion-action primary" role="button" tabindex="0" :aria-disabled="busy" @click="startNewPurchase"><text>{{ p.buyAgain }}</text></PromotionAction>
    </CheckoutResult>
    <template v-else>
      <view v-if="keepRecoveryTarget" class="promotion-notice" role="alert"><text>{{ keepRecoveryReadError?t.tradein.keepRecoveryReadError:t.tradein.keepRecoveryPending }}</text><PromotionAction class="promotion-action primary" role="button" tabindex="0" @click="recoverKeepBeforeNewPurchase(true)"><text>{{ t.tradein.keepRecoveryAction }}</text></PromotionAction></view>
      <text v-if="displayQuote||order" class="checkout-review-title">{{ order?.paymentStatus==='PENDING' ? p.pending : p.confirmOrder }}</text>
      <view v-if="unknown" class="promotion-flat" role="status"><text class="promotion-title">{{ session.record.pending?.operation==='payOrder'?p.unknownTitle:p.orderUnknownTitle }}</text><text class="promotion-copy">{{ p.unknownBody }}</text><PromotionAction class="promotion-action primary" role="button" tabindex="0" :aria-disabled="busy" @click="recover"><text>{{ p.query }}</text></PromotionAction></view>
      <view v-if="error" class="promotion-notice" role="alert"><text>{{ error }}</text><view v-if="!order&&!openedOriginal&&!session.record.pending&&!freshQuoteReady&&!busy" class="promotion-link" role="button" tabindex="0" @click="loadQuote"><text>{{ t.empty.errorCta }}</text></view></view>
      <view v-if="openedOriginal" class="promotion-notice" role="status"><text>{{ p.openedOriginal }}</text></view>
      <view v-if="items.length" class="checkout-group checkout-products" :aria-label="p.selected">
        <view v-for="item in items" :key="item.productNo" class="promotion-row checkout-product-line">
          <view class="checkout-product-art"><image v-if="getProduct(item.productNo)?.imageUrl" :src="getProduct(item.productNo)!.imageUrl" class="promotion-image" mode="aspectFit" aria-hidden="true" /></view>
          <view class="promotion-grow"><text class="checkout-item-name">{{ selectedItemName(item) }}</text><text class="promotion-copy">{{ p.quantity }} · {{ item.quantity }}</text>
            <CheckoutAmount v-if="displayQuote||order" class="checkout-line-price" :value="reviewAmount(itemSubtotal(item))" :currency="reviewCurrency" />
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
            <text v-if="voucherOnlyDiscount!==undefined" class="checkout-discount-value">{{ formatDiscount(voucherOnlyDiscount) }}</text>
          </view>
          <view v-if="!order&&items.length===1&&!openedOriginal&&!eventVoucherId" class="checkout-discount-row promotion-link checkout-voucher-row" role="button" :tabindex="busy||voucherLoading||session.record.pending?-1:0" :aria-disabled="busy||voucherLoading||!!session.record.pending" @click="chooseVoucher" @keydown.enter.prevent="chooseVoucher" @keydown.space.prevent="chooseVoucher">
            <view class="checkout-discount-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" /><path d="M14 6v2m0 3v2m0 3v2" /></svg></view>
            <view class="promotion-grow"><text class="checkout-discount-title">{{ p.voucher }}</text><text class="checkout-discount-description">{{ voucherLoading ? p.loading : selectedVoucherName }}</text></view>
            <text v-if="voucherOnlyDiscount!==undefined" class="checkout-discount-value">{{ formatDiscount(voucherOnlyDiscount) }}</text>
            <svg class="checkout-discount-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </view>
          <view v-if="voucherOnlyDiscount===undefined" class="checkout-discount-row" data-testid="checkout-total-discount">
            <view class="checkout-discount-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 18 12-12" /><circle cx="7" cy="7" r="2" /><circle cx="17" cy="17" r="2" /></svg></view>
            <text class="promotion-grow checkout-discount-title">{{ p.discount }}</text><text class="checkout-discount-value">{{ formatDiscount(summary?.discountUsdt) }}</text>
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
        <text class="checkout-section-heading">{{ p.wallet }}</text>
        <view class="checkout-group">
          <view class="checkout-wallet">
            <view class="checkout-wallet-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M16 12h6v4h-6z" /></svg></view>
            <view class="promotion-grow checkout-wallet-details"><text class="checkout-item-name">{{ p.wallet }}</text>
              <view class="checkout-wallet-balance" aria-live="polite" :aria-busy="walletState==='loading'">
                <text class="checkout-wallet-label">{{ t.wallet.usdtBalance }}</text>
                <text v-if="walletState==='ready' || (walletState==='loading' && app.remoteFleetHasSnapshot)" class="checkout-wallet-amount font-mono-tabular">{{ formatAmount(app.user.usdtBalance) }}</text>
                <text v-else class="checkout-wallet-state">{{ walletState==='loading' ? reviewCopy.walletLoading : '—' }}</text>
              </view>
            </view>
            <view class="checkout-wallet-topup" role="link" tabindex="0" @click="openWalletTopup" @keydown.enter.prevent="openWalletTopup"><text>{{ p.topup }}</text><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></view>
          </view>
          <view v-if="walletState==='error'" class="checkout-wallet-recovery" role="status">
            <text>{{ reviewCopy.walletError }}</text>
            <view class="promotion-link" role="button" tabindex="0" @click="refreshWallet(true)"><text>{{ t.empty.errorCta }}</text></view>
          </view>
        </view>
      </view>
      <view v-if="summary" class="checkout-section" data-testid="checkout-fees">
        <text class="checkout-section-heading">{{ t.store.coReviewOrder }}</text>
        <view class="checkout-group checkout-fees">
          <view class="promotion-summary"><text>{{ p.subtotal }}</text><CheckoutAmount :value="reviewAmount(summary.subtotalUsdt)" :currency="reviewCurrency" /></view>
          <view class="promotion-summary"><text>{{ p.discount }}</text><text class="checkout-discount-value">{{ formatDiscount(summary.discountUsdt) }}</text></view>
          <view class="promotion-summary total"><text>{{ p.total }}</text><CheckoutAmount :value="reviewAmount(summary.amountUsdt)" :currency="reviewCurrency" /></view>
        </view>
        <view v-if="order ? order.paymentStatus==='PENDING'&&order.payBy : promotion?.endsAt" class="promotion-row"><text aria-hidden="true">◷</text><view class="promotion-grow"><text class="promotion-copy">{{ order ? p.payBy : p.deadline }}</text><text class="promotion-copy">{{ displayDeadline(order?.payBy??promotion!.endsAt,locale.code) }}</text></view></view>
      </view>
      <view v-if="displayQuote?.warnings.length" class="promotion-notice"><text v-for="(warning,index) in displayQuote.warnings" :key="index" class="promotion-copy">{{ localized(warning,locale.code) }}</text></view>
      <template v-if="auth.isAuthenticated">
        <template v-if="order">
          <text class="promotion-copy">{{ p.orderNo }} · {{ order.orderNo }}</text>
          <text class="promotion-title">{{ order.paymentStatus==='REFUNDED' ? p.refunded : order.paymentStatus==='PENDING' ? p.pending : order.paymentStatus==='CANCELLED' ? p.rewardCancelled : order.paymentStatus==='EXPIRED' ? t.orders.statusExpired : p.unavailable }}</text>
          <text v-if="order.paymentStatus==='PENDING'&&payWindow!==true" class="promotion-notice">{{ payWindow===false?t.orders.statusExpired:p.unknown }}</text>

          <PromotionAction class="promotion-action" role="button" tabindex="0" :aria-disabled="busy" @click="recover"><text>{{ p.query }}</text></PromotionAction>
          <view class="promotion-link" role="button" tabindex="0" @click="viewOrder"><text>{{ p.viewOrder }}</text></view>
          <PromotionAction v-if="!openedOriginal&&!props.orderNo&&props.items.length&&canStartNew" class="promotion-action primary" role="button" tabindex="0" :aria-disabled="busy" @click="startNewPurchase"><text>{{ p.buyAgain }}</text></PromotionAction>
        </template>
        <template v-else-if="!unknown">
          <text v-if="quote&&!quoteFresh" class="promotion-notice">{{ p.quoteExpired }}</text>
          <text v-if="quote && !completeTerms" class="promotion-notice">{{ p.termsMissing }}</text>
          <text v-if="quote&&quote.eligibility!=='ELIGIBLE'" class="promotion-notice">{{ p.disabledNote }}</text>

        </template>
      </template>
    </template>
    <slot v-if="order?.paymentStatus!=='PAID'" name="review-footer" />
    <CheckoutPaymentSheet v-if="order?.amountUsdt!==undefined" :open="paymentSheetOpen" :amount="order.amountUsdt" :balance="walletState==='ready'?app.user.usdtBalance:undefined" :busy="busy||paymentConfirming" :error="error" @close="paymentSheetOpen=false" @confirm="confirmPayment" @topup="openWalletTopup" />
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
  </view>
</template>
<script setup lang="ts">
import { formatGroupedAmount as formatAmount } from "@/lib/amount-display";
import { checkoutReviewAmount, formatCheckoutReviewAmount,type CheckoutReviewCurrency } from '@/lib/checkout-review-amount';
import { commerceCopy } from '@/lib/commerce-review';
import PromotionAction from '@/components/promotion/promotion-action.vue';
import NxSheet from '@/components/ui/nx-sheet.vue';
import CheckoutPaymentSheet from '@/components/checkout/CheckoutPaymentSheet.vue';
import CheckoutResult from '@/components/checkout/CheckoutResult.vue';
import CheckoutAmount from '@/components/checkout/CheckoutAmount.vue';
import { computed,ref,shallowRef,watch,onMounted,onBeforeUnmount } from 'vue';
// #ifdef H5
import { onBeforeRouteLeave } from 'vue-router';
// #endif
import { promotionApi,deviceE3Api,purchaseEligibilityApi,sessionVault } from '@/api/runtime';
import { captureRuntimeRevision,isCurrentRuntimeRevision } from '@/api/order-api';
import type { PublicPromotion,ExpectedReward } from '@/api/promotion-api';
import type { PromotionItem } from '@/api/promotion-api';
import { validatePromotionItems } from '@/api/promotion-api';
import type { LocalizedText,RewardDisclosure,Quote } from '@/api/promotion-contracts';
import { useT } from '@/i18n/use-t';import { useLocaleStore } from '@/store/locale';import { useApp } from '@/store/app';import { useAuth } from '@/store/auth';
import { readPendingKeepCommand } from '@/lib/keep-command-recovery';
import { useTradeinSheet } from '@/store/tradein-sheet';
import type { DeviceKind } from '@/store/types';
import { useVoucher } from '@/store/voucher';
import { useOrders } from '@/store/orders';
import { computeVoucherDiscount,isVoucherValid,voucherAppliesToSku,type VoucherDef } from '@/mock/vouchers';
import { ApiError,asApiError } from '@/api/errors';
import { getProduct as readProduct } from '@/mock/products';import { refreshProductCatalog,productCatalogState,productCatalogPresentation } from '@/store/product-catalog';
import { navTo,navBack } from '@/lib/route';import { confirm,useUI } from '@/store/ui';
import { fmt } from '@/i18n/format';
import { PromotionCheckoutSession,selectPromotionCheckoutRecord,type PromotionCheckoutRecord } from '@/lib/promotion-checkout-session';
import { acquireAccountCommandKey,readAccountRow,writeAccountRow } from '@/store/account-scoped-storage';
import { registerCheckoutLeaveGuard } from '@/lib/promotion-leave-guard';
import { readTrustedMonotonicNowMs,projectServerNow } from '@/lib/server-deadline-clock';
import { displayDeadline,localized,rewardSummary } from '@/lib/promotion-display';
import { promotionCheckoutHref } from '@/lib/promotion-entry';
import { executePaymentWithPassword } from '@/lib/authorized-payment';
import { assertCheckoutPurchaseStock,CheckoutPurchaseCheckError } from '@/lib/checkout-purchase-check';
import { checkoutFlowCopy } from '@/lib/checkout-flow-copy';
import RewardRows from './reward-rows.vue';import PromotionTerms from './promotion-terms.vue';
const props=defineProps<{activityId:string;items:PromotionItem[];orderNo?:string;voucherId?:string;upgradeActivityId?:string}>();
function formatDiscount(value: Parameters<typeof formatAmount>[0]): string {
  return formatCheckoutReviewAmount(value, reviewCurrency.value, true);
}
function getProduct(id:string){void productCatalogState.status;return readProduct(id);}
const t=useT(),p=computed(()=>t.value.promotion),locale=useLocaleStore(),app=useApp(),auth=useAuth(),voucher=useVoucher(),orders=useOrders();
function selectedItemName(item:{productNo:string;productName?:string}){return (item.productName??getProduct(item.productNo)?.name??productCatalogPresentation.value?.products.find(product=>product.id===item.productNo)?.name??p.value.unknown);}
const reviewCopy=computed(()=>commerceCopy(locale.code));
const flowCopy=computed(()=>checkoutFlowCopy(locale.code));
const walletState=ref<'idle'|'loading'|'ready'|'error'>('idle');
let walletGeneration=0;
let walletTimer:ReturnType<typeof setInterval>|undefined;
let catalogRefresh:Promise<boolean>|null=null;
async function refreshWallet(coalesce=false){
  if(!current()||!visible.value||!auth.isAuthenticated)return;
  const generation=++walletGeneration;walletState.value='loading';
  try{
    // Catalog completion advances the runtime fence. Capture the wallet read
    // afterwards, without delaying original-order or command recovery.
    if(catalogRefresh)await catalogRefresh;
    if(!current()||!visible.value||generation!==walletGeneration)return;
    const ok=await app.refreshRemoteFleet(app.captureRemoteAccountRequest(),{coalesce});
    if(current()&&visible.value&&generation===walletGeneration)walletState.value=ok&&app.remoteFleetHasSnapshot?'ready':'error';
  }catch{if(current()&&visible.value&&generation===walletGeneration)walletState.value='error';}
}
const visible=ref(true);
const account=app.accountKey,epoch=app.accountBindingEpoch;let alive=true,readGeneration=0,refreshOnIdle=false;const current=()=>alive&&app.accountKey===account&&app.accountBindingEpoch===epoch;
const readCurrent=(generation:number)=>current()&&visible.value&&generation===readGeneration;
const TABLE='nexgrid-promotion-checkout-v1';
let storageReadable=true;let records:Record<string,PromotionCheckoutRecord>={};
try{records=readAccountRow<Record<string,PromotionCheckoutRecord>>(TABLE,account,true)??{};}catch{storageReadable=false;}
// A changed route cannot bypass an unresolved command from this same account.
const {intent,record:stored,openedOriginal}=selectPromotionCheckoutRecord(records,props);
const session=new PromotionCheckoutSession({api:promotionApi,current,key:key=>acquireAccountCommandKey('nexgrid-promotion-commands-v1',account,key,'promotion'),save:record=>{if(!storageReadable)throw new Error('STORAGE_UNAVAILABLE');const rows=readAccountRow<Record<string,PromotionCheckoutRecord>>(TABLE,account,true)??{};if(!writeAccountRow(TABLE,account,{...rows,[intent]:record}))throw new Error('STORAGE_UNAVAILABLE');}},stored);
const quotePresentation=shallowRef<{key:string;quote:Quote}|null>(null);
const freshQuoteReady=ref(false),revision=ref(0),quote=computed(()=>{revision.value;return session.record.pending||session.record.order||(freshQuoteReady.value&&quotePresentation.value?.key===quotePresentationKey())?session.record.quote:null;}),order=computed(()=>{revision.value;return session.record.order;}),unknown=computed(()=>{revision.value;return session.unknown;});
// Display memory never enters the executable session; refresh still invalidates that quote.
const displayQuote=computed(()=>current()&&visible.value&&auth.isAuthenticated ? quote.value??(quotePresentation.value?.key===quotePresentationKey()?quotePresentation.value.quote:null):null);
function quotePresentationKey(){return JSON.stringify([app.accountKey,app.accountBindingEpoch,auth.isAuthenticated,props.activityId,selection.value,eventVoucherId,props.upgradeActivityId??'',manualVoucher()?['manual',voucherId.value]:['auto'],locale.code]);}
const resultState=ref<'activated'|'inventory'|'processing'|'error'>('processing'),resultError=ref(''),resultReading=ref(false);
let resultGeneration=0;
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
const promotion=shallowRef<PublicPromotion|null>(null),loading=ref(true),busy=ref(false),error=ref(''),termsOpen=ref(false);
const paymentSheetOpen=ref(false),paymentConfirming=ref(false),leaving=ref(false);
const paymentEntryChecking=ref(false);
const reviewCurrency=computed<CheckoutReviewCurrency>(()=>paymentSheetOpen.value||paymentConfirming.value?'USDT':'USD');
function reviewAmount(amount:Parameters<typeof checkoutReviewAmount>[0]){return checkoutReviewAmount(amount,reviewCurrency.value);}
const eventVoucherId=props.voucherId?.trim()??'';
const eventVoucherStatus=ref<'loading'|'claimable'|'available'|'unavailable'>('loading');
const voucherId=ref(session.record.voucherId??(openedOriginal?null:eventVoucherId||null));const selectedVoucherName=computed(()=>voucher.catalog.find(v=>v.id===voucherId.value)?.name??p.value.noVoucher);
// The API has no voucher-specific amount. Attribute the total to the selected
// voucher only when this quote explicitly reports zero promotion discount.
const voucherOnlyDiscount=computed(()=>!order.value&&!openedOriginal&&!!voucherId.value&&session.record.voucherId===voucherId.value
  &&items.value.length===1&&!(eventVoucherId&&session.record.pending)
  &&displayQuote.value?.promotionDiscountUsdt!==undefined&&formatAmount(displayQuote.value.promotionDiscountUsdt)==='0.00'
  ?displayQuote.value.discountUsdt:undefined);
const voucherOpen=ref(false),voucherLoading=ref(false);
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
const keepRecoveryTarget=ref<string|null>(null),keepRecoveryReadError=ref(false),tradein=useTradeinSheet();
function recoverKeepBeforeNewPurchase(reopen=false):boolean {
  // Original orders and commands always recover before any new purchase gate.
  if(props.orderNo||session.record.order||session.record.pending)return false;
  const previous=keepRecoveryTarget.value;
  keepRecoveryTarget.value=null;keepRecoveryReadError.value=false;
  for(const {productNo} of selection.value){
    try{if(!readPendingKeepCommand(account,productNo))continue;}
    catch{keepRecoveryReadError.value=true;}
    keepRecoveryTarget.value=productNo;
    freshQuoteReady.value=false;quoteFresh.value=false;quotePresentation.value=null;
    if(reopen||previous!==productNo)tradein.showKeepRecovery(productNo as DeviceKind);
    return true;
  }
  return false;
}
const rewardsReleased=computed(()=>!!order.value&&['CANCELLED','EXPIRED','REFUNDED'].includes(order.value.paymentStatus));
const items=computed(()=>order.value?.items??displayQuote.value?.items??selection.value);const rewards=computed(()=>order.value?.rewards??displayQuote.value?.expectedRewards??[]);
// Match the published device FAQ's scope in store/detail; do not extend it to SHARE.
const hasDevicePolicy=computed(()=>items.value.some(item=>{const product=getProduct(item.productNo);return !!product&&product.productType!=='SHARE';}));
function canChangeQuantity(productNo:string,delta:-1|1):boolean {
  const item=selection.value.find(item=>item.productNo===productNo);
  return current()&&visible.value&&auth.isAuthenticated&&!loading.value&&!busy.value
    &&!openedOriginal&&!props.orderNo&&!session.record.pending&&!order.value&&!unknown.value
    &&!!item&&item.quantity+delta>=1&&selection.value.reduce((sum,item)=>sum+item.quantity,0)+delta<=100
    &&(delta<0||app.remoteSlotsUsed==null||selection.value.reduce((sum,item)=>sum+item.quantity,0)+delta<=app.slotCap-app.remoteSlotsUsed);
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
const canCreate=computed(()=>current()&&visible.value&&auth.isAuthenticated&&!busy.value&&!unknown.value&&!keepRecoveryTarget.value&&completeTerms.value&&(quoteFresh.value||session.retryOriginal)&&quote.value?.eligibility==='ELIGIBLE'&&session.canExecute(quote.value.items.length>1?'createBundle':'createOrder'));
const canPay=computed(()=>(Number(order.value?.amountUsdt)===0||walletState.value==='ready')&&!busy.value&&!unknown.value&&completeTerms.value&&session.confirmed&&order.value?.paymentStatus==='PENDING'&&payWindow.value===true&&session.canExecute('payOrder'));
const canCancel=computed(()=>{revision.value;return !busy.value&&!unknown.value&&session.confirmed&&order.value?.paymentStatus==='PENDING'&&session.canExecute('cancelOrder');});
const canStartNew=computed(()=>{revision.value;return !busy.value&&!unknown.value&&session.confirmed&&!session.record.pending&&!!order.value&&['PAID','CANCELLED','EXPIRED','REFUNDED'].includes(order.value.paymentStatus);});
async function run(action:()=>Promise<void>){if(busy.value||!current())return;busy.value=true;error.value='';try{await action();}catch(cause){if(current()){
  if(cause instanceof CheckoutPurchaseCheckError)error.value=cause.reason==='stock'?t.value.store.temporarilyOutOfStock:cause.reason==='unavailable'?t.value.store.productUnavailable:flowCopy.value.queryFailed;
  else{const message=asApiError(cause).message;error.value=message==='PROMOTION_NOT_ELIGIBLE_OR_UNAVAILABLE'?p.value.disabledNote:message.includes('CAPACITY_UNAVAILABLE')?p.value.capacityUnavailable:message==='PROMOTION_ACCOUNT_UNAVAILABLE'?p.value.accountUnavailable:message.includes('QUOTE_EXPIRED')||message.includes('QUOTE_INPUT_CHANGED')?p.value.quoteExpired:message.includes('INSUFFICIENT')?p.value.balanceInsufficient:p.value.errorNote;}
}}finally{if(current()){busy.value=false;revision.value++;updateClock();}}}
async function loadQuote(){
  if(busy.value||!visible.value||!current()||openedOriginal||props.orderNo||session.record.pending||session.record.order||!auth.isAuthenticated)return;
  if(recoverKeepBeforeNewPurchase())return;
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
  if(!eventVoucherId||eventVoucherStatus.value!=='claimable'||busy.value||!visible.value||!current()||openedOriginal||session.record.pending||order.value)return;
  const generation=readGeneration;
  let claimed=false;
  await run(async()=>{claimed=await voucher.claimRemote(eventVoucherId,'store');if(!claimed&&readCurrent(generation))throw new Error('VOUCHER_CLAIM_FAILED');});
  // A repeated claim receipt is idempotent; only a fresh voucher-state read can authorize use.
  if((claimed||voucher.remoteStatus==='ready')&&readCurrent(generation))await loadQuote();
}
async function chooseVoucher(){
  if(eventVoucherId||openedOriginal||props.orderNo||busy.value||voucherLoading.value||session.record.pending||order.value||items.value.length!==1)return;
  const generation=readGeneration;
  const selectable=()=>readCurrent(generation)&&!busy.value&&!session.record.pending&&!order.value;
  voucherLoading.value=true;
  try{
    if(!await voucher.refreshRemote()){if(selectable())error.value=p.value.errorNote;return;}
    if(selectable())voucherOpen.value=true;
  }finally{voucherLoading.value=false;}
}
async function selectVoucher(id:string|null){
  if(!voucherOpen.value||!current()||!visible.value||openedOriginal||props.orderNo||busy.value||session.record.pending||order.value||unknown.value)return;
  if(id!==null&&!voucherOptions.value.some(option=>option.def.id===id))return;
  try{session.selectVoucher(id);}catch{error.value=p.value.errorNote;return;}
  voucherId.value=id;voucherOpen.value=false;await loadQuote();
}
async function createOrder(){if(!current()||!visible.value||leaving.value||recoverKeepBeforeNewPurchase()||!canCreate.value)return;await run(()=>session.create());if(canPay.value&&current()&&visible.value)paymentSheetOpen.value=true;}
const paymentDialogOwner=`promotion-payment:${Date.now()}:${Math.random()}`;
async function pay(){
  updateClock();if(paymentEntryChecking.value||paymentConfirming.value||leaving.value||!visible.value||!current()||!canPay.value)return;
  paymentEntryChecking.value=true;
  try{
    // Keep the original order amount. A current quote is not current purchase
    // permission: all original lines need fresh overall server decisions.
    const recovered=await recover();
    if(!recovered||!canPay.value||!current()||!visible.value)return;
    const expectedOrder=order.value,generation=readGeneration,runtime=captureRuntimeRevision(),sessionRevision=sessionVault.revision();
    if(!expectedOrder)return;
    const signature=JSON.stringify([expectedOrder.orderNo,expectedOrder.amountUsdt,expectedOrder.payBy,expectedOrder.items]);
    const entryCurrent=()=>readCurrent(generation)&&auth.isAuthenticated&&isCurrentRuntimeRevision(runtime)
      &&(sessionVault.revision()===sessionRevision||sessionVault.isRefreshContinuation(sessionRevision))
      &&session.confirmed&&!session.unknown&&order.value?.paymentStatus==='PENDING'
      &&JSON.stringify([order.value.orderNo,order.value.amountUsdt,order.value.payBy,order.value.items])===signature;
    let ready=false,blocked='';
    await run(async()=>{
      const items=(expectedOrder.items??[]).map(({productNo,quantity})=>({productNo,quantity}));
      const [eligibility]=await Promise.all([
        Promise.all([...new Set(items.map(item=>item.productNo))].map(productNo=>purchaseEligibilityApi.get(productNo)))
          .catch(cause=>{throw new CheckoutPurchaseCheckError('read',undefined,cause);}),
        assertCheckoutPurchaseStock(items).catch(cause=>{
          if(cause instanceof CheckoutPurchaseCheckError&&(cause.reason==='stock'||cause.reason==='unavailable'))
            blocked=cause.reason==='stock'?t.value.store.temporarilyOutOfStock:t.value.store.productUnavailable;
          throw cause;
        }),
      ]);
      updateClock();if(!entryCurrent()||payWindow.value!==true)return;
      if(eligibility.some(item=>!item.eligible)){blocked=t.value.store.gateBlockedToast;error.value=blocked;return;}
      ready=true;
    });
    if(ready&&entryCurrent()&&canPay.value)paymentSheetOpen.value=true;
    else if(blocked&&entryCurrent()&&canCancel.value){
      const cancel=await confirm({title:flowCopy.value.cannotPay,message:blocked,confirmLabel:p.value.cancelOrder,cancelLabel:p.value.keep,owner:paymentDialogOwner});
      if(cancel&&entryCurrent())await cancelOrder();
    }
  }finally{paymentEntryChecking.value=false;}
}
async function confirmPayment(){
  updateClock();if(!paymentSheetOpen.value||paymentConfirming.value||leaving.value||!visible.value||!current()||!canPay.value)return;
  const expectedOrder=order.value,generation=readGeneration,runtime=captureRuntimeRevision(),sessionRevision=sessionVault.revision();
  if(!expectedOrder)return;
  const {orderNo,amountUsdt}=expectedOrder;
  if(amountUsdt===undefined||!Number.isFinite(Number(amountUsdt)))return;
  const lines=JSON.stringify(expectedOrder.items),payBy=expectedOrder.payBy;
  const paymentCurrent=()=>readCurrent(generation)&&auth.isAuthenticated&&isCurrentRuntimeRevision(runtime)
    &&(sessionVault.revision()===sessionRevision||sessionVault.isRefreshContinuation(sessionRevision))
    &&order.value?.orderNo===orderNo&&order.value?.amountUsdt===amountUsdt&&JSON.stringify(order.value?.items)===lines&&order.value?.payBy===payBy
    &&order.value?.paymentStatus==='PENDING'&&payWindow.value===true&&!session.unknown;
  paymentConfirming.value=true;paymentSheetOpen.value=false;
  let rejection='';
  try{
    await run(async()=>{
      await executePaymentWithPassword({amount:amountUsdt,currency:'USDT',summary:expectedOrder.items?.map(item=>item.productName).join(', ')||t.value.store.coConfirmPurchase,
        details:expectedOrder.items?.map(item=>({name:item.productName,quantity:item.quantity}))},
        async authorization=>{
          try{
            await assertCheckoutPurchaseStock((expectedOrder.items??[]).map(({productNo,quantity})=>({productNo,quantity})));
            updateClock();if(!paymentCurrent())return;
            await session.pay(authorization);
          }
          catch(cause){
            const failure=asApiError(cause);
            if(cause instanceof CheckoutPurchaseCheckError){if(cause.reason==='stock'||cause.reason==='unavailable')rejection=failure.message;}
            else if(failure.kind==='business'&&!failure.message.startsWith('PAYMENT_PASSWORD_'))rejection=failure.message;
            throw cause;
          }
        },
        paymentCurrent);
    });
    if(!readCurrent(generation))return;
    if(order.value?.paymentStatus==='PAID')await readActivation();
    else{
      await refreshWallet();
      if(!rejection)return;
      const reason=error.value;
      const recovered=await recover();
      if(!recovered||!readCurrent(generation)||unknown.value||!canCancel.value)return;
      const cancel=await confirm({title:flowCopy.value.cannotPay,message:reason||p.value.disabledNote,confirmLabel:p.value.cancelOrder,cancelLabel:p.value.keep,owner:paymentDialogOwner});
      if(cancel&&readCurrent(generation))await cancelOrder();
    }
  }finally{paymentConfirming.value=false;}
}
async function recover():Promise<boolean>{
  let verified=false;
  walletState.value='loading';
  await run(async()=>{await session.recover();if(!current())return;revision.value++;await loadOrderClock();verified=true;});
  await refreshWallet();
  if(current()&&visible.value&&order.value?.paymentStatus==='PAID')await readActivation();
  return verified&&current()&&visible.value&&!unknown.value;
}
async function readActivation(){
  if(!current()||!visible.value||resultReading.value||order.value?.paymentStatus!=='PAID')return;
  const orderNo=order.value.orderNo,generation=++resultGeneration;
  const valid=()=>current()&&visible.value&&generation===resultGeneration&&order.value?.orderNo===orderNo;
  resultReading.value=true;resultError.value='';resultState.value='processing';walletState.value='loading';
  try{
    if(catalogRefresh)await catalogRefresh;
    if(!valid())return;
    const [canonical,fleetReady]=await Promise.all([orders.ensureRemoteOrder(orderNo),app.refreshRemoteFleet(app.captureRemoteAccountRequest())]);
    if(!valid())return;
    walletState.value=fleetReady&&app.remoteFleetHasSnapshot?'ready':'error';
    if(!canonical||canonical.id!==orderNo||!fleetReady)throw new Error('ACTIVATION_READBACK_UNAVAILABLE');
    if(canonical.status==='activated'||canonical.status==='inventory')resultState.value=canonical.status;
    else if(['paid','provisioning'].includes(canonical.status))resultState.value='processing';
    else throw new Error('ACTIVATION_READBACK_UNCONFIRMED');
  }catch{if(valid()){resultState.value='error';resultError.value=t.value.orders.walletPaymentConfirmedRefreshPending;if(walletState.value==='loading')walletState.value='error';}}
  finally{if(generation===resultGeneration)resultReading.value=false;}
}
async function startNewPurchase(){if(!canStartNew.value||props.orderNo||openedOriginal)return;session.startNewPurchase();voucherId.value=props.voucherId?.trim()||null;revision.value++;await loadQuote();}
async function cancelOrder():Promise<boolean>{
  if(!canCancel.value||!current()||!visible.value)return false;
  const original=order.value!.orderNo;
  let verified=false;
  await run(async()=>{
    await session.cancel();
    if(!current())return;
    // A cancel acknowledgement alone does not permit leaving. Read the same
    // canonical order once more and preserve unresolved original commands.
    await session.recover();
    verified=true;
  });
  const cancelled=verified&&current()&&visible.value&&order.value?.orderNo===original&&!unknown.value&&['CANCELLED','EXPIRED'].includes(order.value.paymentStatus);
  if(!cancelled&&current())error.value=flowCopy.value.cancelFailed;
  return cancelled;
}
function viewOrder(){if(order.value)void navTo('/pages/store/order-detail?id='+encodeURIComponent(order.value.orderNo));}
function viewDevices(){if(current()&&visible.value&&order.value?.paymentStatus==='PAID')void navTo('/pages/me/devices');}
function openWalletTopup(){paymentSheetOpen.value=false;void navTo('/pages/me/wallet-topup');}
function signIn(){void navTo('/pages/login/login?return='+encodeURIComponent(promotionCheckoutHref(selection.value,props.activityId,props)));}
let disposeGuard:(()=>void)|null=null;
async function requestLeave():Promise<boolean>{
  if(nativeBackApproved)return true;
  if(!current()||!visible.value||busy.value||paymentConfirming.value||leaving.value)return false;
  if(!session.record.order&&!session.record.pending)return true;
  leaving.value=true;paymentSheetOpen.value=false;
  try{
    const recovered=await recover();
    if(!recovered||!current()||unknown.value||session.record.pending&&!session.retryOriginal)return false;
    if(!order.value)return !session.record.pending;
    if(order.value.paymentStatus!=='PENDING')return true;
    // Missing trusted time cannot turn an unresolved original order into a
    // successful cancellation. Keep it visible for an explicit read retry.
    if(payWindow.value===null){error.value=p.value.unknown;return false;}
    return await cancelOrder();
  }finally{leaving.value=false;}
}
function allowAuxiliaryNavigation():Promise<boolean>{
  // Recharge and legal links are auxiliary navigation, not checkout cancel.
  return Promise.resolve(!busy.value&&!paymentConfirming.value&&!leaving.value);
}
function routeLeavesPurchase(path:string):boolean{
  return /\/(?:pages\/)?store(?:\/store|\/detail|\/bundle)?(?:\?|$)/.test(path);
}
// #ifdef H5
onBeforeRouteLeave(to=>routeLeavesPurchase(to.path)?requestLeave():allowAuxiliaryNavigation());
// #endif
let nativeBackApproved=false;
function back():boolean{
  if(nativeBackApproved){nativeBackApproved=false;return false;}
  void requestLeave().then(ok=>{if(ok&&current()){nativeBackApproved=true;navBack('/store');}});
  return true;
}
function hide(){
  if(walletTimer){clearInterval(walletTimer);walletTimer=undefined;}
  visible.value=false;quotePresentation.value=null;readGeneration++;walletGeneration++;resultGeneration++;resultReading.value=false;paymentSheetOpen.value=false;walletState.value='idle';refreshOnIdle=false;termsOpen.value=false;voucherOpen.value=false;promotion.value=null;promotionReceivedAt=null;
  useUI().clearConfirmsBy(paymentDialogOwner);
  if(current()&&!session.record.pending&&!session.record.order){
    freshQuoteReady.value=false;receivedAt=null;quoteFresh.value=false;
    try{if(session.record.quote)session.invalidateQuote();}catch{error.value=p.value.errorNote;}
    revision.value++;
  }
  disposeGuard?.();disposeGuard=null;
}
function show(){
  visible.value=true;nativeBackApproved=false;if(!current())return;
  startWalletTimer();
  if(!disposeGuard)disposeGuard=registerCheckoutLeaveGuard(allowAuxiliaryNavigation);
  if(busy.value){refreshOnIdle=true;return;}
  if(session.record.pending||session.record.order)void recover();else if(!props.orderNo){void refreshWallet(true);void loadQuote();}
}
watch(busy,value=>{if(!value&&refreshOnIdle){refreshOnIdle=false;if(visible.value&&current())show();}});
const footer = computed(() => {
  if (loading.value || !auth.isAuthenticated || unknown.value || keepRecoveryTarget.value) return null;
  const rawAmount = order.value?.amountUsdt ?? displayQuote.value?.amountUsdt;
  const currency=reviewCurrency.value,amount=formatCheckoutReviewAmount(rawAmount,currency),amountValue=reviewAmount(rawAmount);
  if (order.value?.paymentStatus === 'PENDING') return { amount, amountValue, currency, label: p.value.pay, disabled: rawAmount==null||!canPay.value||leaving.value||paymentConfirming.value||paymentEntryChecking.value, action: pay };
  if (!order.value) return { amount, amountValue, currency, label: p.value.confirmOrder, disabled: rawAmount==null||!canCreate.value||leaving.value, action: createOrder };
  return null;
});
const backDisabled=computed(()=>busy.value||leaving.value||paymentConfirming.value||!!order.value&&order.value.paymentStatus==='PENDING'&&payWindow.value===null);
const resultVisible = computed(() => order.value?.paymentStatus === 'PAID');
defineExpose({back,hide,show,footer,hasDevicePolicy,hasRewardTerms,backDisabled,resultVisible});
function startWalletTimer(){
  if(walletTimer)return;
  walletTimer=setInterval(()=>{
    if(!visible.value||!current()||loading.value||busy.value||paymentConfirming.value||paymentSheetOpen.value||leaving.value||termsOpen.value||voucherOpen.value||voucherLoading.value)return;
    if(walletState.value!=='loading')void refreshWallet(true);
    if(!session.record.order&&!session.record.pending)void loadQuote();
  },30000);
}
onMounted(async()=>{
  disposeGuard=registerCheckoutLeaveGuard(allowAuxiliaryNavigation);timer=setInterval(updateClock,1000);
  startWalletTimer();
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
onBeforeUnmount(()=>{hide();alive=false;if(timer)clearInterval(timer);if(walletTimer)clearInterval(walletTimer);});
</script>
<style src="./promotion.css"></style>

<style scoped>
.promotion-main { padding-bottom:140px; }
.promotion-main--result { padding-bottom:var(--ui-space-inset); min-height:calc(100dvh - var(--nx-overlay-top) - var(--ui-space-section-gap) * 3); box-sizing:border-box; }
.checkout-review-title { display:block; margin:var(--v5-space-2) 0; font:var(--ui-type-page-title-weight) var(--ui-type-page-title)/var(--ui-type-page-title-lh) var(--font-v5); color:var(--v5-ink); }
.checkout-group { overflow:hidden; min-width:0; border:1px solid color-mix(in srgb,var(--v5-border) 40%,transparent); border-radius:22px; background:var(--ui-content-surface); }
.checkout-section { min-width:0; }
.checkout-section-heading { display:flex; align-items:center; min-height:44px; padding:0 2px; font:600 var(--ui-type-section)/20px var(--font-v5); }
.checkout-product-line { display:grid; grid-template-columns:68px minmax(0,1fr); align-items:center; gap:var(--ui-space-row-y) var(--ui-space-inset); padding:var(--ui-space-section) var(--ui-space-inset); border-color:color-mix(in srgb,var(--v5-border) 40%,transparent); }
.checkout-product-art { display:grid; place-items:center; width:68px; height:68px; border-radius:16px; overflow:hidden; }
.checkout-product-art .promotion-image { width:74px; height:74px; }
.checkout-discount-row { display:flex; align-items:center; gap:var(--ui-space-inline); min-height:64px; box-sizing:border-box; padding:var(--ui-space-inline) var(--ui-space-inset); border-bottom:1px solid color-mix(in srgb,var(--v5-border) 40%,transparent); }
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
.checkout-wallet { display:grid; grid-template-columns:36px minmax(0,1fr) auto; align-items:center; gap:var(--ui-space-inline); padding:var(--ui-space-inset); }
.checkout-wallet-icon { display:grid; place-items:center; width:36px; height:36px; border-radius:var(--ui-radius-icon); color:var(--v5-brand); background:var(--ui-content-surface-2); }
.checkout-wallet-details { min-width:0; }
.checkout-wallet-balance { display:flex; flex-wrap:wrap; align-items:baseline; gap:var(--v5-space-1) var(--v5-space-2); margin-top:var(--v5-space-1); }
.checkout-wallet-label,.checkout-wallet-state { font:400 var(--ui-type-list-subtitle)/18px var(--font-v5); color:var(--v5-ink-3); overflow-wrap:anywhere; }
.checkout-wallet-amount { font-size:var(--ui-type-list-title); font-weight:600; line-height:1.5; color:var(--v5-ink); overflow-wrap:anywhere; }
.checkout-wallet-topup { display:flex; align-items:center; justify-content:flex-end; gap:var(--v5-space-1); min-width:44px; min-height:44px; color:var(--v5-brand); font:500 var(--ui-type-list-subtitle)/18px var(--font-v5); cursor:pointer; }
.checkout-wallet-topup svg { flex:none; }
.checkout-wallet-topup:focus-visible { outline:2px solid var(--v5-brand); outline-offset:2px; }
.checkout-wallet-recovery { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:var(--v5-space-2); margin:0 var(--ui-space-inset); border-top:1px solid var(--v5-border); color:var(--v5-ink-3); font:400 var(--ui-type-list-subtitle)/18px var(--font-v5); }
.checkout-fees { padding:6px 16px; }
.checkout-fees .promotion-summary { box-sizing:border-box; align-items:center; min-height:calc(var(--ui-space-inset) * 3); font-variant-numeric:tabular-nums; border-bottom:1px solid color-mix(in srgb,var(--v5-border) 40%,transparent); }
.checkout-fees .promotion-summary:last-child { border-bottom:0; }
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
