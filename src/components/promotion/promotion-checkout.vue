<template>
  <view class="promotion promotion-main">
    <view class="promotion-steps"><text :class="{active:!order}">1 · {{ t.promotion.steps[0] }}</text><text :class="{active:order?.paymentStatus==='PENDING'}">2 · {{ t.promotion.steps[1] }}</text><text :class="{active:order?.paymentStatus==='PAID'}">3 · {{ t.promotion.steps[2] }}</text></view>
    <text v-if="busy" role="status" class="promotion-copy">{{ t.promotion.loading }}</text>
    <view v-if="error" role="alert" class="promotion-flat"><text class="promotion-notice">{{ error }}</text><view role="button" tabindex="0" class="promotion-link" @click="load"><text>{{ p.retry }}</text></view></view>
    <view class="nx-glass-card promotion-flat"><view v-for="item in shownItems" :key="item.productNo" class="promotion-summary"><text>{{ getProduct(item.productNo)?.name??item.productNo }} × {{ item.quantity }}</text><text v-if="quote">{{ Number(quote.items.find(l=>l.productNo===item.productNo)?.subtotalUsdt).toFixed(2) }} USDT</text></view>
      <picker v-if="!order&&items.length===1" :range="voucherNames" @change="selectVoucher"><view class="promotion-link"><text>{{ t.promotion.voucher }} · {{ voucherNames[voucherIndex] }}</text></view></picker>
      <template v-if="quote"><view class="promotion-summary"><text>{{ t.promotion.subtotal }}</text><text>{{ Number(quote.subtotalUsdt).toFixed(2) }} USDT</text></view><view class="promotion-summary"><text>{{ t.promotion.discount }}</text><text>{{ Number(quote.discountUsdt).toFixed(2) }} USDT</text></view><view class="promotion-summary total"><text>{{ t.promotion.total }}</text><text>{{ Number(quote.amountUsdt).toFixed(2) }} USDT</text></view></template>
    </view>
    <view v-if="quote" class="nx-glass-card promotion-flat"><text class="promotion-title">{{ order?t.promotion.orderRewards:t.promotion.expected }}</text><RewardRows v-if="order?.paymentStatus==='PAID'" :rewards="rewards" :lines="order.items" /><RewardRows v-else :expected="quote.expectedRewards" :lines="quote.items" /><text class="promotion-copy">{{ t.promotion.rewardNote }}</text></view>
    <view v-if="activity" role="button" tabindex="0" class="promotion-link" @click="termsOpen=true"><text>{{ t.promotion.rulesLink }}</text></view>
    <template v-if="order"><text class="promotion-copy">{{ t.promotion.orderNo }} · {{ order.orderNo }}</text><text class="promotion-title">{{ order.paymentStatus==='PAID'?p.paid:order.paymentStatus==='PENDING'?p.pendingPayment:order.paymentStatus==='CANCELLED'?p.cancelled:order.paymentStatus==='EXPIRED'?p.expired:t.promotion.refunded }}</text>
      <text v-if="order.paymentStatus==='PENDING'" class="promotion-copy">{{ t.promotion.payBy }} · {{ displayDeadline(order.payBy??'',locale.code) }}</text>
      <view v-if="order.paymentStatus==='PENDING'" role="button" tabindex="0" :aria-disabled="busy" class="promotion-action primary" @click="pay"><text>{{ t.promotion.pay }}</text></view>
      <view v-if="order.paymentStatus==='PENDING'" role="button" tabindex="0" :aria-disabled="busy" class="promotion-link" @click="cancel"><text>{{ t.promotion.cancelOrder }}</text></view>
      <view v-if="showOrderLink" role="button" tabindex="0" class="promotion-link" @click="navTo('/pages/store/order-detail?id='+encodeURIComponent(order.orderNo))"><text>{{ t.promotion.viewOrder }}</text></view>
      <view v-if="order.paymentStatus==='PAID'" role="button" tabindex="0" class="promotion-link" @click="navTo('/pages/me/devices')"><text>{{ t.promotion.viewDevice }}</text></view>
      <view role="button" tabindex="0" class="promotion-link" @click="navTo('/pages/events/promotion-rewards?orderNo='+encodeURIComponent(order.orderNo))"><text>{{ t.promotion.rewards }}</text></view>
      <view v-if="order.paymentStatus!=='PENDING'" role="button" tabindex="0" class="promotion-link" @click="buyAgain"><text>{{ t.promotion.buyAgain }}</text></view>
    </template>
    <template v-else><view role="button" tabindex="0" :aria-disabled="!quote||busy" class="promotion-action primary" @click="create"><text>{{ t.promotion.confirmOrder }}</text></view><view role="button" tabindex="0" :aria-disabled="busy" class="promotion-link" @click="load"><text>{{ t.promotion.quote }}</text></view></template>
    <view role="button" tabindex="0" class="promotion-link" @click="leave"><text>{{ t.promotion.back }}</text></view>
    <PromotionTerms :open="termsOpen" :title="localized(activity?.title,locale.code)" :terms="localized(activity?.terms,locale.code)" :disclosures="quote?.expectedRewards.map(r=>r.disclosure)" @close="termsOpen=false" />
  </view>
</template>
<script setup lang="ts">
import { captureAccountScope,isCurrentAccountScope } from '@/lib/account-scope';
import { onBeforeUnmount } from 'vue';
import { onHide,onShow } from '@dcloudio/uni-app';
import { computed,onMounted,ref,watch } from 'vue';import { useT } from '@/i18n/use-t';import { fmt } from '@/i18n/format';import { useLocaleStore } from '@/store/locale';import { useApp } from '@/store/app';import { usePromotion,type PromotionOrder } from '@/store/promotion';import { useVoucher } from '@/store/voucher';import { getProduct } from '@/mock/products';import type { Item,Quote } from '@/api/promotion-contracts';import { localized,displayDeadline } from '@/lib/promotion-display';import { promotionBundleHref } from '@/lib/promotion-entry';import { navTo } from '@/lib/route';import { confirm } from '@/store/ui';import RewardRows from './reward-rows.vue';import PromotionTerms from './promotion-terms.vue';
const props=withDefaults(defineProps<{activityId:string;items:Item[];orderNo?:string;showOrderLink?:boolean}>(),{orderNo:'',showOrderLink:true}),t=useT(),p=computed(()=>t.value.prototypeBusiness),locale=useLocaleStore(),app=useApp(),store=usePromotion(),vouchers=useVoucher();
const order=ref<PromotionOrder|null>(null),quote=ref<Quote|null>(null),error=ref(''),busy=ref(false),termsOpen=ref(false),voucherIndex=ref(0);
const scope=captureAccountScope;
let visible=true,actionVersion=0;
function invalidate(){visible=false;actionVersion++;busy.value=false;}
function current(action:number,expected:ReturnType<typeof scope>){return visible&&action===actionVersion&&isCurrentAccountScope(expected);}
// Order readback adds lineId/productName; only the selected SKU quantities identify a draft.
const checkoutKey=()=>`nexgrid-promotion-checkout:${app.accountKey}:${props.activityId}:${JSON.stringify(props.items.map(({productNo,quantity})=>({productNo,quantity})))}`;
const voucherNames=computed(()=>[p.value.noVoucher,...vouchers.claimedUnused.map(v=>v.name)]);
const shownItems=computed(()=>order.value?.items??props.items),activity=computed(()=>store.activities.find(a=>a.activityId===(order.value?.quote.activityId??props.activityId))??null);
const rewards=computed(()=>store.rewards.filter(r=>r.orderNo===order.value?.orderNo));
function message(e:unknown){return p.value[(e instanceof Error?e.message:'storage') as keyof typeof p.value]??p.value.storage;}
function load(){if(busy.value||!visible)return;busy.value=true;error.value='';try{store.refresh();let original=props.orderNo;if(!original){const saved=uni.getStorageSync(checkoutKey());if(typeof saved==='string')original=saved;}order.value=original?store.getOrder(original):null;if(original&&!order.value)throw new Error('unavailable');quote.value=order.value?.quote??store.quote(props.items,props.activityId,voucherIndex.value?vouchers.claimedUnused[voucherIndex.value-1]?.id:null);}catch(e){error.value=message(e);}finally{busy.value=false;}}
function selectVoucher(event:{detail:{value:string}}){voucherIndex.value=Number(event.detail.value)||0;quote.value=null;load();}
function create(){if(!quote.value||busy.value)return;busy.value=true;error.value='';try{order.value=store.createOrder(quote.value.quoteId,quote.value.quoteId);uni.setStorageSync(checkoutKey(),order.value.orderNo);}catch(e){error.value=message(e);}finally{busy.value=false;}}
async function pay(){if(!order.value||busy.value||!visible)return;const expected=scope(),action=++actionVersion,no=order.value.orderNo;busy.value=true;try{const accepted=await confirm({title:p.value.purchaseConfirm,message:fmt(p.value.purchaseConfirmBody,{amount:Number(order.value.amountUsdt).toFixed(2)}),confirmLabel:t.value.promotion.pay,cancelLabel:p.value.cancel});if(!accepted||!current(action,expected))return;order.value=store.payOrder(no);error.value='';}catch(e){if(current(action,expected))error.value=message(e);}finally{if(action===actionVersion)busy.value=false;}}
async function cancel(){if(!order.value||busy.value||!visible)return;const expected=scope(),action=++actionVersion,no=order.value.orderNo;busy.value=true;try{const accepted=await confirm({title:t.value.promotion.cancelOrder,message:t.value.promotion.leaveBody,confirmLabel:p.value.cancel,cancelLabel:p.value.continue});if(!accepted||!current(action,expected))return;order.value=store.cancelOrder(no);error.value='';}catch(e){if(current(action,expected))error.value=message(e);}finally{if(action===actionVersion)busy.value=false;}}
function buyAgain(){try{uni.removeStorageSync(checkoutKey());order.value=null;quote.value=null;error.value='';void navTo(promotionBundleHref(props.activityId,props.items));}catch(e){error.value=message(e);}}
async function leave(){if(!visible||busy.value)return;const expected=scope(),action=++actionVersion;if(order.value?.paymentStatus==='PENDING'){const accepted=await confirm({title:t.value.promotion.leaveTitle,message:t.value.promotion.reservedBody,confirmLabel:t.value.promotion.exit,cancelLabel:t.value.promotion.continue});if(!accepted||!current(action,expected))return;}void navTo(promotionBundleHref(props.activityId,props.items));}
watch(()=>[app.accountKey,props.activityId,JSON.stringify(props.items),props.orderNo],()=>{actionVersion++;order.value=null;quote.value=null;busy.value=false;voucherIndex.value=0;load();});onMounted(load);onHide(invalidate);onBeforeUnmount(invalidate);onShow(()=>{visible=true;load();});
</script>
<style src="./promotion.css"></style>
