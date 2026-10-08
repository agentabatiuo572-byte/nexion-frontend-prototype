<template>
  <view v-if="loading || error || receipt?.promotionQuoteId || rewards.length" class="promotion promotion-flat" style="margin:20px 16px">
    <text class="promotion-title">{{ t.promotion.orderRewards }}</text><text class="promotion-copy">{{ t.promotion.refundNote }}</text>
    <text v-if="loading" class="promotion-copy" role="status">{{ t.promotion.loading }}</text>
    <RewardRows v-if="rewards.length" :rewards="rewards" :lines="receipt?.items" />
    <RewardRows v-else :expected="receipt?.rewards" :lines="receipt?.items" />
    <text v-if="error" class="promotion-copy" role="alert">{{ t.promotion.error }}</text>
    <view class="promotion-link" role="button" tabindex="0" :aria-disabled="loading" @click="load"><text>{{ t.promotion.refresh }}</text></view>
    <PromotionAction v-if="receipt?.paymentStatus==='PENDING'" class="promotion-action primary" role="button" tabindex="0" @click="resume"><text>{{ t.promotion.resume }}</text></PromotionAction>
    <view class="promotion-link" role="button" tabindex="0" @click="navTo('/pages/me/rewards-list?cat=promotion&orderNo='+encodeURIComponent(orderNo))"><text>{{ t.promotion.rewards }}</text></view>
  </view>
</template>
<script setup lang="ts">
import PromotionAction from '@/components/promotion/promotion-action.vue';
import {ref,watch,onBeforeUnmount} from 'vue';import {useT} from '@/i18n/use-t';import {useApp} from '@/store/app';import {promotionApi,remoteApiEnabled} from '@/api/runtime';import type{OrderReceipt,Reward} from '@/api/promotion-api';import {navTo} from '@/lib/route';import RewardRows from './reward-rows.vue';
const props=defineProps<{orderNo:string}>();const t=useT(),app=useApp();const receipt=ref<OrderReceipt|null>(null),rewards=ref<Reward[]>([]),error=ref(false),loading=ref(false);let generation=0,alive=true;
async function load(){
  if(!props.orderNo||!remoteApiEnabled||loading.value)return;
  const request=++generation,account=app.accountKey,epoch=app.accountBindingEpoch;
  const current=()=>alive&&request===generation&&account===app.accountKey&&epoch===app.accountBindingEpoch;
  loading.value=true;error.value=false;
  const [order,page]=await Promise.allSettled([promotionApi.findOrder(props.orderNo),promotionApi.rewards({orderNo:props.orderNo,limit:100})]);
  if(!current())return;
  if(order.status==='fulfilled')receipt.value=order.value;
  if(page.status==='fulfilled')rewards.value=page.value.items;
  error.value=order.status==='rejected'||page.status==='rejected';loading.value=false;
}
function resume(){void navTo('/pages/store/checkout?promotion=1&orderNo='+encodeURIComponent(props.orderNo));}
watch(()=>[props.orderNo,app.accountKey,app.accountBindingEpoch],()=>{generation++;receipt.value=null;rewards.value=[];loading.value=false;error.value=false;void load();},{immediate:true});onBeforeUnmount(()=>{alive=false;generation++;});
</script>
<style src="./promotion.css"></style>
