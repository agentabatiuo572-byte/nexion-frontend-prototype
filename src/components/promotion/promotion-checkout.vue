<template>
  <view class="promotion promotion-main">
    <view class="promotion-steps"><text :class="{active:!order}">1 · {{ p.steps[0] }}</text><text :class="{active:order?.paymentStatus==='PENDING'}">2 · {{ p.steps[1] }}</text><text :class="{active:order&&order.paymentStatus!=='PENDING'}">3 · {{ p.steps[2] }}</text></view>
    <view v-if="!auth.isAuthenticated" class="promotion-flat"><text class="promotion-title">{{ p.signIn }}</text><PromotionAction class="promotion-action primary" role="button" tabindex="0" @click="signIn"><text>{{ p.signIn }}</text></PromotionAction></view>
    <view v-else-if="loading" class="promotion-flat" role="status" aria-live="polite"><text>{{ p.loading }}</text></view>
    <template v-else>
      <view v-if="unknown" class="promotion-flat" role="status"><text class="promotion-title">{{ session.record.pending?.operation==='payOrder'?p.unknownTitle:p.orderUnknownTitle }}</text><text class="promotion-copy">{{ p.unknownBody }}</text><PromotionAction class="promotion-action primary" role="button" tabindex="0" :aria-disabled="busy" @click="recover"><text>{{ p.query }}</text></PromotionAction></view>
      <view v-if="error" class="promotion-notice" role="alert"><text>{{ error }}</text></view>
      <view v-if="openedOriginal" class="promotion-notice" role="status"><text>{{ p.openedOriginal }}</text></view>
      <view v-if="items.length" class="promotion-flat">
        <text class="promotion-title">{{ p.selected }}</text>
        <view v-for="item in items" :key="item.productNo" class="promotion-row">
          <image v-if="getProduct(item.productNo)?.imageUrl" :src="getProduct(item.productNo)!.imageUrl" class="promotion-image" mode="aspectFill" />
          <view class="promotion-grow"><text style="display:block;font-weight:600">{{ selectedItemName(item) }}</text><text class="promotion-copy">{{ p.quantity }} · {{ item.quantity }}</text></view>
          <text v-if="quote" class="promotion-price">{{ quote.items.find(l=>l.productNo===item.productNo)?.subtotalUsdt }} USDT</text>
        </view>
      </view>
      <view v-if="rewards.length" class="promotion-flat">
        <text class="promotion-title">{{ order ? (order.paymentStatus==='PENDING'?p.locked:p.orderRewards) : p.expected }}</text><text class="promotion-copy" style="margin-top:10px">{{ p.rewardNote }}</text>
        <RewardRows :expected="rewards" :lines="order?.items??quote?.items" />
        <view class="promotion-link" role="button" tabindex="0" @click="termsOpen=true"><text>{{ p.rulesLink }}</text></view>
      </view>
      <view v-if="quote || order" class="promotion-flat">
        <view v-if="!order&&items.length===1&&!openedOriginal" class="promotion-link" role="button" tabindex="0" :aria-disabled="busy||!!session.record.pending" @click="chooseVoucher"><text>{{ p.voucher }}</text> · <text>{{ selectedVoucherName }}</text></view>
        <view v-if="quote" class="promotion-summary"><text>{{ p.subtotal }}</text><text>{{ quote.subtotalUsdt }} USDT</text></view>
        <view v-if="quote" class="promotion-summary"><text>{{ p.discount }}</text><text>{{ quote.discountUsdt }} USDT</text></view>
        <view class="promotion-summary total"><text>{{ p.total }}</text><text>{{ order?.amountUsdt??quote?.amountUsdt }} USDT</text></view>
        <view v-if="order ? order.paymentStatus==='PENDING'&&order.payBy : promotion?.endsAt" class="promotion-row"><text aria-hidden="true">◷</text><view class="promotion-grow"><text class="promotion-copy">{{ order ? p.payBy : p.deadline }}</text><text class="promotion-copy">{{ displayDeadline(order?.payBy??promotion!.endsAt,locale.code) }}</text></view></view>
        <text class="promotion-copy">{{ p.wallet }}</text>
        <text class="promotion-copy">{{ t.wallet.usdtBalance }} · {{ app.remoteFleetHasSnapshot ? app.user.usdtBalance.toFixed(6)+' USDT' : p.unknown }}</text>
        <view class="promotion-link" role="button" tabindex="0" @click="navTo('/pages/me/wallet-topup')"><text>{{ p.topup }}</text></view>
      </view>
      <view v-if="quote?.warnings.length" class="promotion-notice"><text v-for="(warning,index) in quote.warnings" :key="index" class="promotion-copy">{{ localized(warning,locale.code) }}</text></view>
      <template v-if="auth.isAuthenticated">
        <template v-if="order">
          <text class="promotion-copy">{{ p.orderNo }} · {{ order.orderNo }}</text>
          <text class="promotion-title">{{ order.paymentStatus==='PAID' ? p.paid : order.paymentStatus==='REFUNDED' ? p.refunded : order.paymentStatus==='PENDING' ? p.pending : order.paymentStatus==='CANCELLED' ? p.rewardCancelled : order.paymentStatus==='EXPIRED' ? t.orders.statusExpired : p.unavailable }}</text>
          <PromotionAction v-if="order.paymentStatus==='PENDING'&&!unknown" class="promotion-action primary" role="button" tabindex="0" :aria-disabled="!canPay" @click="pay"><text>{{ p.pay }}</text></PromotionAction>
          <PromotionAction class="promotion-action" role="button" tabindex="0" :aria-disabled="busy" @click="recover"><text>{{ p.query }}</text></PromotionAction>
          <view class="promotion-link" role="button" tabindex="0" @click="viewOrder"><text>{{ p.viewOrder }}</text></view>
          <PromotionAction v-if="!openedOriginal&&!props.orderNo&&props.items.length&&canStartNew" class="promotion-action primary" role="button" tabindex="0" :aria-disabled="busy" @click="startNewPurchase"><text>{{ p.buyAgain }}</text></PromotionAction>
          <view v-if="order.paymentStatus==='PENDING'&&!unknown&&canCancel" class="promotion-link" role="button" tabindex="0" :aria-disabled="busy" @click="cancelOrder"><text>{{ session.record.pending?.operation==='cancelOrder' ? p.retryOriginalCancel : p.cancelOrder }}</text></view>
        </template>
        <template v-else-if="!unknown">
          <text v-if="quote&&!quoteFresh" class="promotion-notice">{{ p.quoteExpired }}</text>
          <text v-if="quote && !completeTerms" class="promotion-notice">{{ p.termsMissing }}</text>
          <text v-if="quote&&quote.eligibility!=='ELIGIBLE'" class="promotion-notice">{{ p.disabledNote }}</text>
          <PromotionAction v-if="quote" class="promotion-action primary" role="button" tabindex="0" :aria-disabled="!canCreate" @click="createOrder"><text>{{ p.confirmOrder }}</text></PromotionAction>
          <PromotionAction v-if="!openedOriginal" class="promotion-action" role="button" tabindex="0" :aria-disabled="busy||!!session.record.pending" @click="loadQuote"><text>{{ p.quote }}</text></PromotionAction>
        </template>
      </template>
    </template>
    <PromotionTerms :open="termsOpen" :title="localized(promotion?.title,locale.code)" :terms="order ? '' : localized(promotion?.terms,locale.code)" :disclosures="disclosures" @close="termsOpen=false" />
    <view v-if="leaveOpen" class="promotion-overlay">
      <view class="promotion-overlay-dismiss" aria-hidden="true" @click="finishLeave(false)" />
      <view class="promotion-modal promotion-leave" role="dialog" aria-modal="true" :aria-label="p.leaveTitle" tabindex="-1"><LiquidGlass :radius="28" tone="navigation" /><view class="promotion-modal-content"><text class="promotion-title">{{ p.leaveTitle }}</text><text class="promotion-copy" style="margin-top:12px">{{ order?p.reservedBody:p.leaveBody }}</text><view class="promotion-actions"><PromotionAction class="promotion-action primary" role="button" tabindex="0" @click="finishLeave(false)"><text>{{ p.continue }}</text></PromotionAction><PromotionAction class="promotion-action" role="button" tabindex="0" @click="finishLeave(true)"><text>{{ p.exit }}</text></PromotionAction></view></view></view>
    </view>
  </view>
</template>
<script setup lang="ts">
import PromotionAction from '@/components/promotion/promotion-action.vue';
import LiquidGlass from '@/components/liquid-glass.vue';
import { computed,ref,shallowRef,onMounted,onBeforeUnmount } from 'vue';
// #ifdef H5
import { onBeforeRouteLeave } from 'vue-router';
// #endif
import { promotionApi } from '@/api/runtime';
import type { PublicPromotion,ExpectedReward } from '@/api/promotion-api';
import type { PromotionItem } from '@/api/promotion-api';
import type { LocalizedText,RewardDisclosure } from '@/api/promotion-contracts';
import { useT } from '@/i18n/use-t';import { useLocaleStore } from '@/store/locale';import { useApp } from '@/store/app';import { useAuth } from '@/store/auth';
import { useVoucher } from '@/store/voucher';
import { asApiError } from '@/api/errors';
import { getProduct as readProduct } from '@/mock/products';import { refreshProductCatalog,productCatalogState } from '@/store/product-catalog';
import { navTo,navBack } from '@/lib/route';import { confirm } from '@/store/ui';
import { PromotionCheckoutSession,selectPromotionCheckoutRecord,type PromotionCheckoutRecord } from '@/lib/promotion-checkout-session';
import { acquireAccountCommandKey,readAccountRow,writeAccountRow } from '@/store/account-scoped-storage';
import { registerCheckoutLeaveGuard,requestCheckoutLeave } from '@/lib/promotion-leave-guard';
import { readTrustedMonotonicNowMs,projectServerNow } from '@/lib/server-deadline-clock';
import { useDialogA11y } from '@/composables/use-dialog-a11y';
import { displayDeadline,localized } from '@/lib/promotion-display';
import RewardRows from './reward-rows.vue';import PromotionTerms from './promotion-terms.vue';
const props=defineProps<{activityId:string;items:PromotionItem[];orderNo?:string}>();
function getProduct(id:string){void productCatalogState.status;return readProduct(id);}
const t=useT(),p=computed(()=>t.value.promotion),locale=useLocaleStore(),app=useApp(),auth=useAuth(),voucher=useVoucher();
function selectedItemName(item:{productNo:string;productName?:string}){return ('productName' in item?item.productName:getProduct(item.productNo)?.name)??p.value.unknown;}
const account=app.accountKey,epoch=app.accountBindingEpoch;let alive=true;const current=()=>alive&&app.accountKey===account&&app.accountBindingEpoch===epoch;
const TABLE='nexgrid-promotion-checkout-v1';
let storageReadable=true;let records:Record<string,PromotionCheckoutRecord>={};
try{records=readAccountRow<Record<string,PromotionCheckoutRecord>>(TABLE,account,true)??{};}catch{storageReadable=false;}
// A changed route cannot bypass an unresolved command from this same account.
const {intent,record:stored,openedOriginal}=selectPromotionCheckoutRecord(records,props);
const session=new PromotionCheckoutSession({api:promotionApi,current,key:key=>acquireAccountCommandKey('nexgrid-promotion-commands-v1',account,key,'promotion'),save:record=>{if(!storageReadable)throw new Error('STORAGE_UNAVAILABLE');const rows=readAccountRow<Record<string,PromotionCheckoutRecord>>(TABLE,account,true)??{};if(!writeAccountRow(TABLE,account,{...rows,[intent]:record}))throw new Error('STORAGE_UNAVAILABLE');}},stored);
const revision=ref(0),quote=computed(()=>{revision.value;return session.record.quote;}),order=computed(()=>{revision.value;return session.record.order;}),unknown=computed(()=>{revision.value;return session.unknown;});
const promotion=shallowRef<PublicPromotion|null>(null),loading=ref(true),busy=ref(false),error=ref(''),termsOpen=ref(false),leaveOpen=ref(false);
const voucherId=ref(session.record.voucherId??null);const selectedVoucherName=computed(()=>voucher.catalog.find(v=>v.id===voucherId.value)?.name??p.value.noVoucher);
const items=computed(()=>order.value?.items??quote.value?.items??props.items);const rewards=computed(()=>order.value?.rewards??quote.value?.expectedRewards??[]);
function disclosure(r:ExpectedReward):RewardDisclosure|null {const d=r.disclosure;return d&&[d.title,d.terms,d.refundTerms,d.benefitDescription].every(x=>x&&['zh','en','vi'].every(l=>typeof x[l as keyof LocalizedText]==='string'&&x[l as keyof LocalizedText].trim()))?d:null;}
const disclosures=computed(()=>rewards.value.map(disclosure).filter((d):d is RewardDisclosure=>!!d));const completeTerms=computed(()=>disclosures.value.length===rewards.value.length);
let receivedAt:number|null=null,promotionReceivedAt:number|null=null;const quoteFresh=ref(false);let timer:ReturnType<typeof setInterval>|undefined;
function updateClock(){const now=readTrustedMonotonicNowMs();quoteFresh.value=!!quote.value&&receivedAt!==null&&now!==null&&projectServerNow(Date.parse(quote.value.serverTime),receivedAt,now)<Date.parse(quote.value.expiresAt);}
const canCreate=computed(()=>!busy.value&&!unknown.value&&completeTerms.value&&(quoteFresh.value||session.retryOriginal)&&quote.value?.eligibility==='ELIGIBLE'&&session.canExecute(quote.value.items.length>1?'createBundle':'createOrder'));
const canPay=computed(()=>!busy.value&&!unknown.value&&completeTerms.value&&session.confirmed&&order.value?.paymentStatus==='PENDING'&&session.canExecute('payOrder'));
const canCancel=computed(()=>{revision.value;return !busy.value&&!unknown.value&&session.confirmed&&order.value?.paymentStatus==='PENDING'&&session.canExecute('cancelOrder');});
const canStartNew=computed(()=>{revision.value;return !busy.value&&!unknown.value&&session.confirmed&&!session.record.pending&&!!order.value&&['PAID','CANCELLED','EXPIRED','REFUNDED'].includes(order.value.paymentStatus);});
async function run(action:()=>Promise<void>){if(busy.value||!current())return;busy.value=true;error.value='';try{await action();}catch(cause){if(current()){const message=asApiError(cause).message;error.value=message==='PROMOTION_NOT_ELIGIBLE_OR_UNAVAILABLE'?p.value.disabledNote:message.includes('CAPACITY_UNAVAILABLE')?p.value.capacityUnavailable:message==='PROMOTION_ACCOUNT_UNAVAILABLE'?p.value.accountUnavailable:message.includes('QUOTE_EXPIRED')||message.includes('QUOTE_INPUT_CHANGED')?p.value.quoteExpired:message.includes('INSUFFICIENT')?p.value.balanceInsufficient:p.value.errorNote;}}finally{if(current()){busy.value=false;revision.value++;}}}
async function loadQuote(){if(openedOriginal||session.record.pending||session.record.order||!auth.isAuthenticated)return;await run(async()=>{session.invalidateQuote();revision.value++;const sampledAt=readTrustedMonotonicNowMs();const result=await promotionApi.quote(props.items,props.activityId||null,voucherId.value);if(!current())return;session.setQuote(result,voucherId.value);receivedAt=sampledAt;revision.value++;updateClock();});}
async function chooseVoucher(){if(openedOriginal||busy.value||session.record.pending||order.value||items.value.length!==1)return;await voucher.refreshRemote();if(!current())return;const options=voucher.claimedUnused;uni.showActionSheet({itemList:[p.value.noVoucher,...options.map(v=>v.name)],success:result=>{if(!current())return;voucherId.value=result.tapIndex===0?null:options[result.tapIndex-1]?.id??null;void loadQuote();}});}
async function createOrder(){if(!canCreate.value)return;await run(()=>session.create());}
async function pay(){if(!canPay.value)return;await run(()=>session.pay());}
async function recover(){await run(()=>session.recover());}
async function startNewPurchase(){if(!canStartNew.value||props.orderNo||openedOriginal)return;session.startNewPurchase();voucherId.value=null;revision.value++;await loadQuote();}
async function cancelOrder(){if(!canCancel.value)return;const ok=await confirm({title:p.value.cancelTitle,message:p.value.cancelBody,confirmLabel:p.value.cancelOrder,cancelLabel:p.value.keep,danger:true});if(ok&&current())await run(()=>session.cancel());}
function viewOrder(){if(order.value)void navTo('/pages/store/order-detail?id='+encodeURIComponent(order.value.orderNo));}
function signIn(){void navTo('/pages/login/login?return='+encodeURIComponent('/pages/store/checkout?activityId='+props.activityId+'&items='+encodeURIComponent(JSON.stringify(props.items))));}
let leaveResolver:((allowed:boolean)=>void)|null=null;let asked='';let disposeGuard:(()=>void)|null=null;
function finishLeave(allowed:boolean){leaveOpen.value=false;leaveResolver?.(allowed);leaveResolver=null;}
function requestLeave():Promise<boolean>{
  updateClock();
  const now=readTrustedMonotonicNowMs(),sample=receivedAt!==null&&quote.value?{time:quote.value.serverTime,at:receivedAt}:promotionReceivedAt!==null&&promotion.value?{time:promotion.value.serverTime,at:promotionReceivedAt}:null;
  const reserved=!!order.value&&order.value.paymentStatus==='PENDING'&&now!==null&&!!sample&&projectServerNow(Date.parse(sample.time),sample.at,now)<Date.parse(order.value.payBy??'');
  const fingerprint=order.value?.orderNo??quote.value?.quoteId??'';
  if(!current()||busy.value||unknown.value||!rewards.value.length||!fingerprint||asked===fingerprint||(order.value?!reserved:!quoteFresh.value||quote.value?.eligibility!=='ELIGIBLE'))return Promise.resolve(true);
  asked=fingerprint;leaveOpen.value=true;return new Promise(resolve=>{leaveResolver=resolve;});
}
useDialogA11y(leaveOpen,'.promotion-leave',()=>finishLeave(false));
// H5 browser history uses the router guard; no artificial history entry or popstate trap.
// #ifdef H5
onBeforeRouteLeave(()=>requestCheckoutLeave());
// #endif
let nativeBackApproved=false;
function back():boolean{if(nativeBackApproved){nativeBackApproved=false;return false;}void requestLeave().then(ok=>{if(ok&&current()){nativeBackApproved=true;navBack('/store');}});return true;}
function hide(){disposeGuard?.();disposeGuard=null;finishLeave(true);}
function show(){if(!disposeGuard)disposeGuard=registerCheckoutLeaveGuard(requestLeave);if(session.record.pending||session.record.order)void recover();}
defineExpose({back,hide,show});
onMounted(async()=>{
  disposeGuard=registerCheckoutLeaveGuard(requestLeave);timer=setInterval(updateClock,1000);
  // Catalog and current campaign visibility cannot block an original order or
  // command receipt. Historical rewards always come from that receipt.
  if(auth.isAuthenticated)void refreshProductCatalog(true).catch(()=>{});
  if(props.activityId){const sampledAt=readTrustedMonotonicNowMs();void promotionApi.get(props.activityId,auth.isAuthenticated).then(value=>{if(current()){promotion.value=value;promotionReceivedAt=sampledAt;}}).catch(()=>{});}
  try {
    if(auth.isAuthenticated){
      if(props.orderNo&&!session.record.order&&!session.record.pending){
        const receipt=await promotionApi.findOrder(props.orderNo);if(!current())return;
        if(!receipt)throw new Error('ORIGINAL_ORDER_NOT_FOUND');
        session.resume(receipt);
      }
      if(session.record.pending||session.record.order)await recover();else await loadQuote();
    }
  }catch{if(current())error.value=p.value.error;}finally{if(current())loading.value=false;}
});
onBeforeUnmount(()=>{alive=false;disposeGuard?.();if(timer)clearInterval(timer);finishLeave(true);});
</script>
<style src="./promotion.css"></style>
