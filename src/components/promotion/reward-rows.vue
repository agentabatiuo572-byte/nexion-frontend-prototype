<template>
  <view class="promotion">
    <view v-for="entry in entries" :key="entry.key" class="promotion-row">
      <view class="promotion-symbol" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8C6 8 5 5 7 3c2-2 5 2 5 5 M12 8c6 0 7-3 5-5-2-2-5 2-5 5" /></svg></view>
      <view class="promotion-grow">
        <text v-if="entry.productNo" class="promotion-copy">{{ t.promotion.buyLine }} · {{ (entry.productName || productName(entry.productNo)) }}<template v-if="entry.quantity"> × {{ entry.quantity }}</template></text>
        <text style="display:block;font-size:15px;font-weight:600">{{ entry.reward.type==='DEVICE' ? (entry.deviceName || t.promotion.unknown)+' × '+rewardAmount(entry.reward,entry.groups) : rewardAmount(entry.reward,entry.groups)+' '+entry.reward.type }}</text>
        <text v-if="entry.reward.beneficiaryRole==='DIRECT_INVITER'" class="promotion-copy">{{ t.promotion.inviter }}</text>
        <text v-if="!entry.state" class="promotion-copy">{{ t.promotion.settle }}</text>
        <text v-if="entry.message" class="promotion-copy">{{ localized(entry.message,locale.code) }}</text>
        <text v-if="entry.state" class="promotion-badge">{{ displayState(entry.state,entry.refundHold) }}</text>
        <view v-if="entry.obligationId&&linkDetails!==false" class="promotion-link" role="button" tabindex="0" @click="navTo('/pages/events/promotion-reward-detail?obligationId='+encodeURIComponent(entry.obligationId))"><text>{{ t.promotion['reward-detail'] }}</text></view>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { ExpectedReward, Reward, PublicRewardSpec } from '@/api/promotion-api';
import { useT } from '@/i18n/use-t';
import { useLocaleStore } from '@/store/locale';
import { getProduct } from '@/mock/products';
import { productCatalogState } from '@/store/product-catalog';
import { localized,rewardAmount,rewardStateKey } from '@/lib/promotion-display';
import { navTo } from '@/lib/route';
const props=withDefaults(defineProps<{ expected?:ExpectedReward[]; rewards?:Reward[]; specs?:PublicRewardSpec[]; productNo?:string; lines?:{lineId:string;productNo:string;productName?:string;quantity?:number}[];linkDetails?:boolean }>(),{linkDetails:true});
const t=useT();const locale=useLocaleStore();
function displayState(state:Reward['state'],hold:boolean){return hold&&!['CANCELLED','REVERSED'].includes(state)?t.value.promotion.rewardHold:t.value.promotion[rewardStateKey(state)];}
const productName=(id:string)=>{void productCatalogState.status;return getProduct(id)?.name ?? t.value.promotion.devices;};
const entries=computed(()=>[
  ...(props.expected??[]).map(r=>({key:r.lineId+':'+r.rewardRuleId,deviceName:r.disclosure?.deviceName,productName:props.lines?.find(l=>l.lineId===r.lineId)?.productName,productNo:props.lines?.find(l=>l.lineId===r.lineId)?.productNo??props.productNo,quantity:props.lines?.find(l=>l.lineId===r.lineId)?.quantity,reward:r.reward,groups:r.groups,message:r.message,state:null,refundHold:false,obligationId:null})),
  ...(props.rewards??[]).map(r=>({key:r.obligationId,deviceName:r.disclosure?.deviceName,productName:props.lines?.find(l=>l.lineId===r.orderLineId)?.productName,productNo:props.lines?.find(line=>line.lineId===r.orderLineId)?.productNo??props.productNo,quantity:props.lines?.find(line=>line.lineId===r.orderLineId)?.quantity,reward:r.reward,groups:1,message:null,state:r.state,refundHold:r.refundHold,obligationId:r.obligationId})),
  ...(props.specs??[]).map(r=>({key:r.rewardRuleId,deviceName:r.disclosure?.deviceName,productName:undefined,productNo:props.productNo,quantity:null,reward:r,groups:1,message:null,state:null,refundHold:false,obligationId:null})),
]);
</script>
<style src="./promotion.css"></style>
