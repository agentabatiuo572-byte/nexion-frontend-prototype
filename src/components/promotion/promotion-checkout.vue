<template>
  <view class="promotion promotion-main">
    <view class="promotion-steps"><text :class="{active:!order}">1 · {{ p.steps[0] }}</text><text :class="{active:order?.paymentStatus==='PENDING'}">2 · {{ p.steps[1] }}</text><text :class="{active:order&&order.paymentStatus!=='PENDING'}">3 · {{ p.steps[2] }}</text></view>
    <view v-if="!auth.isAuthenticated" class="promotion-flat"><text class="promotion-title">{{ p.signIn }}</text><PromotionAction class="promotion-action primary" role="button" tabindex="0" @click="signIn"><text>{{ p.signIn }}</text></PromotionAction></view>
    <view v-else-if="loading" class="promotion-flat" role="status" aria-live="polite"><text>{{ p.loading }}</text></view>
    <template v-else>
      <view v-if="unknown" class="promotion-flat" role="status"><text class="promotion-title">{{ session.record.pending?.operation==='payOrder'?p.unknownTitle:p.orderUnknownTitle }}</text><text class="promotion-copy">{{ p.unknownBody }}</text><PromotionAction class="promotion-action primary" role="button" tabindex="0" :aria-disabled="busy" @click="recover"><text>{{ p.query }}</text></PromotionAction></view>
      <view v-if="error" class="promotion-notice" role="alert"><text>{{ error }}</text></view>
      <view v-if="openedOriginal" class="promotion-notice" role="status"><text>{{ p.openedOriginal }}</text></view>
      <view v-if="eventVoucherId&&!order&&!openedOriginal&&!session.record.pending" class="promotion-flat" data-testid="checkout-event-voucher">
        <text class="promotion-title">{{ p.eventVoucher }} · {{ eventVoucherId }}</text><text class="promotion-copy">{{ p.eventVoucherTerms }}</text>
        <PromotionAction v-if="eventVoucherStatus==='claimable'" class="promotion-action primary" role="button" tabindex="0" :aria-disabled="busy" @click="claimEventVoucher"><text>{{ p.claimEventVoucher }}</text></PromotionAction>
        <text v-else-if="eventVoucherStatus==='unavailable'" class="promotion-notice">{{ p.eventVoucherUnavailable }}</text>
      </view>
      <view v-if="items.length" class="promotion-flat">
        <text class="promotion-title">{{ p.selected }}</text>
        <view v-for="item in items" :key="item.productNo" class="promotion-row">
          <image v-if="getProduct(item.productNo)?.imageUrl" :src="getProduct(item.productNo)!.imageUrl" class="promotion-image" mode="aspectFill" />
          <view class="promotion-grow"><text style="display:block;font-weight:600">{{ selectedItemName(item) }}</text><text class="promotion-copy">{{ p.quantity }} · {{ item.quantity }}</text>
            <view class="checkout-item-quantity" :aria-label="selectedItemName(item)+' · '+p.quantity">
              <view class="checkout-item-quantity-button" data-testid="checkout-item-decrease" role="button" :tabindex="canChangeQuantity(item.productNo,-1)?0:-1" :aria-disabled="!canChangeQuantity(item.productNo,-1)" :aria-label="t.uiChrome.decreaseQty" @click="changeQuantity(item.productNo,-1)" @keydown.enter.prevent="changeQuantity(item.productNo,-1,$event)" @keydown.space.prevent="changeQuantity(item.productNo,-1,$event)">−</view>
              <text class="checkout-item-quantity-value" aria-live="polite">{{ item.quantity }}</text>
              <view class="checkout-item-quantity-button" data-testid="checkout-item-increase" role="button" :tabindex="canChangeQuantity(item.productNo,1)?0:-1" :aria-disabled="!canChangeQuantity(item.productNo,1)" :aria-label="t.uiChrome.increaseQty" @click="changeQuantity(item.productNo,1)" @keydown.enter.prevent="changeQuantity(item.productNo,1,$event)" @keydown.space.prevent="changeQuantity(item.productNo,1,$event)">+</view>
            </view>
          </view>
          <text v-if="quote" class="promotion-price">{{ formatAmount(quote.items.find(l=>l.productNo===item.productNo)?.subtotalUsdt) }} USDT</text>
        </view>
      </view>
      <view v-if="rewards.length" class="promotion-flat">
        <text class="promotion-title">{{ order ? (order.paymentStatus==='PENDING'?p.locked:p.orderRewards) : p.expected }}</text><text class="promotion-copy" style="margin-top:10px">{{ p.rewardNote }}</text>
        <RewardRows :expected="rewards" :lines="order?.items??quote?.items" />
        <view class="promotion-link" role="button" tabindex="0" @click="termsOpen=true"><text>{{ p.rulesLink }}</text></view>
      </view>
      <view v-if="quote || order" class="promotion-flat">
        <view v-if="!order&&items.length===1&&!openedOriginal&&!eventVoucherId" class="promotion-link" role="button" tabindex="0" :aria-disabled="busy||!!session.record.pending" @click="chooseVoucher"><text>{{ p.voucher }}</text> · <text>{{ selectedVoucherName }}</text></view>
        <view v-if="quote" class="promotion-summary"><text>{{ p.subtotal }}</text><text>{{ formatAmount(quote.subtotalUsdt) }} USDT</text></view>
        <view v-if="quote" class="promotion-summary"><text>{{ p.discount }}</text><text>{{ formatAmount(quote.discountUsdt) }} USDT</text></view>
        <view class="promotion-summary total"><text>{{ p.total }}</text><text>{{ formatAmount(order?.amountUsdt??quote?.amountUsdt) }} USDT</text></view>
        <view v-if="order ? order.paymentStatus==='PENDING'&&order.payBy : promotion?.endsAt" class="promotion-row"><text aria-hidden="true">◷</text><view class="promotion-grow"><text class="promotion-copy">{{ order ? p.payBy : p.deadline }}</text><text class="promotion-copy">{{ displayDeadline(order?.payBy??promotion!.endsAt,locale.code) }}</text></view></view>
        <text class="promotion-copy">{{ p.wallet }}</text>
        <text class="promotion-copy">{{ t.wallet.usdtBalance }} · {{ app.remoteFleetHasSnapshot ? formatAmount(app.user.usdtBalance)+' USDT' : p.unknown }}</text>
        <view class="promotion-link" role="button" tabindex="0" @click="navTo('/pages/me/wallet-topup')"><text>{{ p.topup }}</text></view>
      </view>
      <view v-if="quote?.warnings.length" class="promotion-notice"><text v-for="(warning,index) in quote.warnings" :key="index" class="promotion-copy">{{ localized(warning,locale.code) }}</text></view>
      <template v-if="auth.isAuthenticated">
        <template v-if="order">
          <text class="promotion-copy">{{ p.orderNo }} · {{ order.orderNo }}</text>
          <text class="promotion-title">{{ order.paymentStatus==='PAID' ? p.paid : order.paymentStatus==='REFUNDED' ? p.refunded : order.paymentStatus==='PENDING' ? p.pending : order.paymentStatus==='CANCELLED' ? p.rewardCancelled : order.paymentStatus==='EXPIRED' ? t.orders.statusExpired : p.unavailable }}</text>
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
    <PromotionTerms :open="termsOpen" :title="localized(promotion?.title,locale.code)" :terms="order ? '' : localized(promotion?.terms,locale.code)" :disclosures="disclosures" @close="termsOpen=false" />
    <view v-if="leaveOpen" class="promotion-overlay">
      <view class="promotion-overlay-dismiss" aria-hidden="true" @click="finishLeave(false)" />
      <view class="promotion-modal promotion-leave" role="dialog" aria-modal="true" :aria-label="p.leaveTitle" tabindex="-1"><LiquidGlass :radius="28" tone="navigation" /><view class="promotion-modal-content"><text class="promotion-title">{{ p.leaveTitle }}</text><text class="promotion-copy" style="margin-top:12px">{{ order?p.reservedBody:p.leaveBody }}</text><view class="promotion-actions"><PromotionAction class="promotion-action primary" role="button" tabindex="0" @click="finishLeave(false)"><text>{{ p.continue }}</text></PromotionAction><PromotionAction class="promotion-action" role="button" tabindex="0" @click="finishLeave(true)"><text>{{ p.exit }}</text></PromotionAction></view></view></view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { formatAmount as formatPlainAmount } from "@/lib/amount-display";
import PromotionAction from '@/components/promotion/promotion-action.vue';
import LiquidGlass from '@/components/liquid-glass.vue';
import { computed,ref,shallowRef,watch,onMounted,onBeforeUnmount } from 'vue';
// #ifdef H5
import { onBeforeRouteLeave } from 'vue-router';
// #endif
import { promotionApi,deviceE3Api } from '@/api/runtime';
import type { PublicPromotion,ExpectedReward } from '@/api/promotion-api';
import type { PromotionItem } from '@/api/promotion-api';
import { validatePromotionItems } from '@/api/promotion-api';
import type { LocalizedText,RewardDisclosure } from '@/api/promotion-contracts';
import { useT } from '@/i18n/use-t';import { useLocaleStore } from '@/store/locale';import { useApp } from '@/store/app';import { useAuth } from '@/store/auth';
import { useVoucher } from '@/store/voucher';
import { asApiError } from '@/api/errors';
import { getProduct as readProduct } from '@/mock/products';import { refreshProductCatalog,productCatalogState,productCatalogPresentation } from '@/store/product-catalog';
import { navTo,navBack } from '@/lib/route';import { confirm,useUI } from '@/store/ui';
import { fmt } from '@/i18n/format';
import { PromotionCheckoutSession,selectPromotionCheckoutRecord,type PromotionCheckoutRecord } from '@/lib/promotion-checkout-session';
import { acquireAccountCommandKey,readAccountRow,writeAccountRow } from '@/store/account-scoped-storage';
import { registerCheckoutLeaveGuard,requestCheckoutLeave } from '@/lib/promotion-leave-guard';
import { readTrustedMonotonicNowMs,projectServerNow } from '@/lib/server-deadline-clock';
import { useDialogA11y } from '@/composables/use-dialog-a11y';
import { displayDeadline,localized } from '@/lib/promotion-display';
import { promotionCheckoutHref } from '@/lib/promotion-entry';
import RewardRows from './reward-rows.vue';import PromotionTerms from './promotion-terms.vue';
const props=defineProps<{activityId:string;items:PromotionItem[];orderNo?:string;voucherId?:string;upgradeActivityId?:string}>();
function formatAmount(value: Parameters<typeof formatPlainAmount>[0]): string {
  return formatPlainAmount(value).replace(/\B(?=(\d{3})+\.)/g, ',');
}
function getProduct(id:string){void productCatalogState.status;return readProduct(id);}
const t=useT(),p=computed(()=>t.value.promotion),locale=useLocaleStore(),app=useApp(),auth=useAuth(),voucher=useVoucher();
function selectedItemName(item:{productNo:string;productName?:string}){return item.productName??getProduct(item.productNo)?.name??productCatalogPresentation.value?.products.find(product=>product.id===item.productNo)?.name??p.value.unknown;}
const account=app.accountKey,epoch=app.accountBindingEpoch;let alive=true,visible=true,readGeneration=0,refreshOnIdle=false;const current=()=>alive&&app.accountKey===account&&app.accountBindingEpoch===epoch;
const readCurrent=(generation:number)=>current()&&visible&&generation===readGeneration;
const TABLE='nexgrid-promotion-checkout-v1';
let storageReadable=true;let records:Record<string,PromotionCheckoutRecord>={};
try{records=readAccountRow<Record<string,PromotionCheckoutRecord>>(TABLE,account,true)??{};}catch{storageReadable=false;}
// A changed route cannot bypass an unresolved command from this same account.
const {intent,record:stored,openedOriginal}=selectPromotionCheckoutRecord(records,props);
const session=new PromotionCheckoutSession({api:promotionApi,current,key:key=>acquireAccountCommandKey('nexgrid-promotion-commands-v1',account,key,'promotion'),save:record=>{if(!storageReadable)throw new Error('STORAGE_UNAVAILABLE');const rows=readAccountRow<Record<string,PromotionCheckoutRecord>>(TABLE,account,true)??{};if(!writeAccountRow(TABLE,account,{...rows,[intent]:record}))throw new Error('STORAGE_UNAVAILABLE');}},stored);
const freshQuoteReady=ref(false),revision=ref(0),quote=computed(()=>{revision.value;return session.record.pending||session.record.order||freshQuoteReady.value?session.record.quote:null;}),order=computed(()=>{revision.value;return session.record.order;}),unknown=computed(()=>{revision.value;return session.unknown;});
const promotion=shallowRef<PublicPromotion|null>(null),loading=ref(true),busy=ref(false),error=ref(''),termsOpen=ref(false),leaveOpen=ref(false);
const eventVoucherId=props.voucherId?.trim()??'';
const eventVoucherStatus=ref<'loading'|'claimable'|'available'|'unavailable'>('loading');
const voucherId=ref(session.record.voucherId??(openedOriginal?null:eventVoucherId||null));const selectedVoucherName=computed(()=>voucher.catalog.find(v=>v.id===voucherId.value)?.name??p.value.noVoucher);
const selection=ref(props.items.map(({productNo,quantity})=>({productNo,quantity})));
const items=computed(()=>order.value?.items??quote.value?.items??selection.value);const rewards=computed(()=>order.value?.rewards??quote.value?.expectedRewards??[]);
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
let receivedAt:number|null=null,promotionReceivedAt:number|null=null,orderClock:{serverNow:number;at:number}|null=null,clockGeneration=0;const quoteFresh=ref(false),payWindow=ref<boolean|null>(null);let timer:ReturnType<typeof setInterval>|undefined;
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
const canCreate=computed(()=>!busy.value&&!unknown.value&&completeTerms.value&&(quoteFresh.value||session.retryOriginal)&&quote.value?.eligibility==='ELIGIBLE'&&session.canExecute(quote.value.items.length>1?'createBundle':'createOrder'));
const canPay=computed(()=>!busy.value&&!unknown.value&&completeTerms.value&&session.confirmed&&order.value?.paymentStatus==='PENDING'&&payWindow.value===true&&session.canExecute('payOrder'));
const canCancel=computed(()=>{revision.value;return !busy.value&&!unknown.value&&session.confirmed&&order.value?.paymentStatus==='PENDING'&&session.canExecute('cancelOrder');});
const canStartNew=computed(()=>{revision.value;return !busy.value&&!unknown.value&&session.confirmed&&!session.record.pending&&!!order.value&&['PAID','CANCELLED','EXPIRED','REFUNDED'].includes(order.value.paymentStatus);});
async function run(action:()=>Promise<void>){if(busy.value||!current())return;busy.value=true;error.value='';try{await action();}catch(cause){if(current()){const message=asApiError(cause).message;error.value=message==='PROMOTION_NOT_ELIGIBLE_OR_UNAVAILABLE'?p.value.disabledNote:message.includes('CAPACITY_UNAVAILABLE')?p.value.capacityUnavailable:message==='PROMOTION_ACCOUNT_UNAVAILABLE'?p.value.accountUnavailable:message.includes('QUOTE_EXPIRED')||message.includes('QUOTE_INPUT_CHANGED')?p.value.quoteExpired:message.includes('INSUFFICIENT')?p.value.balanceInsufficient:p.value.errorNote;}}finally{if(current()){busy.value=false;revision.value++;updateClock();}}}
async function loadQuote(){
  if(busy.value||!visible||!current()||openedOriginal||props.orderNo||session.record.pending||session.record.order||!auth.isAuthenticated)return;
  const generation=++readGeneration;
  freshQuoteReady.value=false;promotion.value=null;promotionReceivedAt=null;termsOpen.value=false;receivedAt=null;quoteFresh.value=false;
  await run(async()=>{
    session.invalidateQuote();revision.value++;
    const sampledAt=readTrustedMonotonicNowMs();
    if(props.activityId)void promotionApi.get(props.activityId,auth.isAuthenticated).then(value=>{
      if(readCurrent(generation)&&value.state==='ACTIVE'){promotion.value=value;promotionReceivedAt=sampledAt;updateClock();}
    }).catch(()=>{});
    try{
      const requestedItems=selection.value.map(item=>({...item}));
      let activityId=props.activityId||null;
      if(eventVoucherId){
        eventVoucherStatus.value='loading';
        const refreshed=await voucher.refreshRemote();if(!readCurrent(generation))return;
        if(!refreshed)throw new Error('VOUCHER_STATE_UNAVAILABLE');
        const available=voucher.claimedUnused.some(offer=>offer.id===eventVoucherId);
        const claimable=voucher.claimableVouchers.some(offer=>offer.id===eventVoucherId&&offer.claimSurfaces.includes('store'));
        eventVoucherStatus.value=requestedItems.length!==1?'unavailable':available?'available':claimable?'claimable':'unavailable';
        if(eventVoucherStatus.value!=='available')return;
        voucherId.value=eventVoucherId;activityId=null;
        if(props.upgradeActivityId){
          const candidate=await promotionApi.get(props.upgradeActivityId,true);if(!readCurrent(generation))return;
          if(candidate.state==='ACTIVE'&&candidate.eligibility==='ESTIMATE_ELIGIBLE'&&candidate.productNos.includes(requestedItems[0].productNo)){
            activityId=candidate.activityId;promotion.value=candidate;promotionReceivedAt=sampledAt;
          }
        }
      }
      const result=eventVoucherId?await promotionApi.quote(requestedItems,activityId,voucherId.value,false):await promotionApi.quote(requestedItems,activityId,voucherId.value);
      if(!readCurrent(generation))return;
      if(result.items.length!==requestedItems.length||requestedItems.some(item=>!result.items.some(line=>line.productNo===item.productNo&&line.quantity===item.quantity)))throw new Error('QUOTE_INPUT_CHANGED');
      session.setQuote(result,voucherId.value);freshQuoteReady.value=true;receivedAt=sampledAt;revision.value++;updateClock();
    }catch(cause){if(readCurrent(generation))throw cause;}
  });
}
async function claimEventVoucher(){
  if(!eventVoucherId||eventVoucherStatus.value!=='claimable'||busy.value||!visible||!current()||openedOriginal||session.record.pending||order.value)return;
  const generation=readGeneration;
  let claimed=false;
  await run(async()=>{claimed=await voucher.claimRemote(eventVoucherId,'store');if(!claimed&&readCurrent(generation))throw new Error('VOUCHER_CLAIM_FAILED');});
  // A repeated claim receipt is idempotent; only a fresh voucher-state read can authorize use.
  if(claimed&&readCurrent(generation))await loadQuote();
}
async function chooseVoucher(){
  if(eventVoucherId||openedOriginal||busy.value||session.record.pending||order.value||items.value.length!==1)return;
  const generation=readGeneration;
  const selectable=()=>readCurrent(generation)&&!busy.value&&!session.record.pending&&!order.value;
  await voucher.refreshRemote();if(!selectable())return;
  const options=voucher.claimedUnused;
  uni.showActionSheet({itemList:[p.value.noVoucher,...options.map(v=>v.name)],success:result=>{
    if(!selectable())return;
    voucherId.value=result.tapIndex===0?null:options[result.tapIndex-1]?.id??null;void loadQuote();
  }});
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
    await run(()=>session.pay());
  }finally{paymentConfirming=false;}
}
async function recover(){await run(async()=>{await session.recover();if(!current())return;revision.value++;await loadOrderClock();});}
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
  visible=false;readGeneration++;refreshOnIdle=false;termsOpen.value=false;promotion.value=null;promotionReceivedAt=null;
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
  if(session.record.pending||session.record.order)void recover();else if(!props.orderNo)void loadQuote();
}
watch(busy,value=>{if(!value&&refreshOnIdle){refreshOnIdle=false;if(visible&&current())show();}});
const footer = computed(() => {
  if (loading.value || !auth.isAuthenticated || unknown.value) return null;
  const rawAmount = order.value?.amountUsdt ?? quote.value?.amountUsdt;
  const amount = rawAmount == null ? '-' : '$'+formatAmount(rawAmount);
  if (order.value?.paymentStatus === 'PENDING') return { amount, label: p.value.pay, disabled: !canPay.value, action: pay };
  if (!order.value) return { amount, label: p.value.confirmOrder, disabled: !canCreate.value, action: createOrder };
  return null;
});
defineExpose({back,hide,show,footer});
onMounted(async()=>{
  disposeGuard=registerCheckoutLeaveGuard(requestLeave);timer=setInterval(updateClock,1000);
  // Catalog and current campaign visibility cannot block an original order or
  // command receipt. Historical rewards always come from that receipt.
  if(auth.isAuthenticated)void refreshProductCatalog(true).catch(()=>{});
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
onBeforeUnmount(()=>{hide();alive=false;if(timer)clearInterval(timer);});
</script>
<style src="./promotion.css"></style>

<style scoped>
.promotion-main { padding-bottom:140px; }
.checkout-item-quantity { display:inline-flex; align-items:center; margin-top:6px; border:1px solid var(--v5-border); border-radius:999px; background:var(--ui-content-surface-2); }
.checkout-item-quantity-button { display:grid; place-items:center; width:32px; min-height:36px; border-radius:999px; font:400 18px/20px var(--font-v5); cursor:pointer; }
.checkout-item-quantity-button[aria-disabled="true"] { opacity:.35; cursor:default; }
.checkout-item-quantity-button:focus-visible { outline:2px solid var(--v5-brand); outline-offset:-2px; }
.checkout-item-quantity-value { min-width:24px; text-align:center; font:600 15px/20px var(--font-v5); font-variant-numeric:tabular-nums; }
.promotion-summary.total { min-height:55px; box-sizing:border-box; }
</style>
