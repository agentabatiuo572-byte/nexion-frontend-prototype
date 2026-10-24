<template><view class="promotion promotion-main">
  <GlassSegments v-model="filter" :options="options" :label="t.promotion.allStates" layout="scroll" />
  <view role="button" tabindex="0" class="promotion-link" @click="store.refresh"><text>{{ t.promotion.refresh }}</text></view>
  <view v-if="store.error" role="alert" class="promotion-flat"><text>{{ t.prototypeBusiness.localError }}</text><view role="button" tabindex="0" class="promotion-link" @click="store.refresh"><text>{{ t.promotion.retry }}</text></view></view>
  <view v-else-if="!visible.length" class="promotion-flat"><text class="promotion-title">{{ t.promotion.emptyRewards }}</text><text class="promotion-copy">{{ t.promotion.emptyNote }}</text><view role="button" tabindex="0" class="promotion-link" @click="navTo('/pages/store/store')"><text>{{ t.promotion.buyMore }}</text></view></view>
  <RewardRows v-else :rewards="visible.slice(0,limit)" />
  <view v-if="visible.length>limit" role="button" tabindex="0" class="promotion-action" @click="limit+=20"><text>{{ t.promotion.more }}</text></view>
</view></template>
<script setup lang="ts">
import { computed,ref,watch } from 'vue';import { onShow } from '@dcloudio/uni-app';import { useT } from '@/i18n/use-t';import { usePromotion } from '@/store/promotion';import { rewardStateKey } from '@/lib/promotion-display';import { navTo } from '@/lib/route';import type { RewardState } from '@/api/promotion-contracts';import GlassSegments from '@/components/glass-segments.vue';import RewardRows from './reward-rows.vue';
const props=withDefaults(defineProps<{activityId?:string;orderNo?:string}>(),{activityId:'',orderNo:''}),t=useT(),store=usePromotion(),filter=ref('all'),limit=ref(20);
const states:RewardState[]=['PENDING','READY','PROCESSING','ISSUED','RETRYABLE_FAILED','OUTCOME_UNKNOWN','CANCELLED','REVERSAL_PENDING','REVERSED','MANUAL_REVIEW'];
const options=computed(()=>[{value:'all',label:t.value.promotion.allStates},...states.map(value=>({value,label:t.value.promotion[rewardStateKey(value)]}))]);
const visible=computed(()=>store.rewards.filter(r=>(!props.activityId||r.activityId===props.activityId)&&(!props.orderNo||r.orderNo===props.orderNo)&&(filter.value==='all'||r.state===filter.value)).slice().reverse());
watch(filter,()=>limit.value=20);onShow(store.refresh);
</script>
<style src="./promotion.css"></style>
