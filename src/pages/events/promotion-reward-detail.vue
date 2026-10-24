<template><AppChassis active="me"><SubPageHeader back="/pages/events/promotion-rewards" :title="t.promotion['reward-detail']" /><view class="promotion promotion-main">
  <view v-if="error" role="alert" class="promotion-flat"><text class="promotion-copy">{{ error }}</text><view role="button" tabindex="0" class="promotion-link" @click="refresh"><text>{{ t.promotion.retry }}</text></view></view>
  <template v-if="reward"><RewardRows :rewards="[reward]" :link-details="false" /><DisclosureDetails :disclosure="reward.disclosure" />
    <text class="promotion-copy">{{ t.promotion.sourceOrder }} · {{ reward.orderNo }}</text>
    <view v-if="reward.beneficiaryRole==='BUYER'" role="button" tabindex="0" class="promotion-link" @click="navTo('/pages/store/order-detail?id='+encodeURIComponent(reward.orderNo))"><text>{{ t.promotion.viewOrder }}</text></view>
    <view v-for="deviceId in reward.localDeviceIds??[]" :key="deviceId" role="button" tabindex="0" class="promotion-link" @click="navTo('/pages/earn/device-detail?id='+encodeURIComponent(deviceId))"><text>{{ t.promotion.viewDevice }}</text></view>
    <view v-if="reward.assetReceipt?.ledgerBizNo" role="button" tabindex="0" class="promotion-link" @click="navTo('/pages/me/wallet-bills?ref='+encodeURIComponent(reward.obligationId))"><text>{{ t.promotion.viewBills }}</text></view>
    <view v-if="['PENDING','READY','RETRYABLE_FAILED'].includes(reward.state)" role="button" tabindex="0" class="promotion-action primary" :aria-disabled="busy" @click="retry"><text>{{ busy?t.promotion.loading:t.promotion.retry }}</text></view>
    <view role="button" tabindex="0" class="promotion-link" @click="refresh"><text>{{ t.promotion.refresh }}</text></view>
    <text v-if="reward.beneficiaryRole==='DIRECT_INVITER'" class="promotion-copy">{{ t.promotion.privacy }}</text>
  </template><view v-else-if="!error" class="promotion-flat"><text>{{ t.promotion.emptyRewards }}</text></view>
  <view role="button" tabindex="0" class="promotion-link" @click="navTo('/pages/events/promotion-rewards')"><text>{{ t.promotion.back }}</text></view>
</view></AppChassis></template>
<script setup lang="ts">
import { computed,ref } from 'vue';import { onLoad,onShow } from '@dcloudio/uni-app';import AppChassis from '@/components/app-chassis.vue';import SubPageHeader from '@/components/sub-page-header.vue';import RewardRows from '@/components/promotion/reward-rows.vue';import DisclosureDetails from '@/components/promotion/disclosure-details.vue';import { useT } from '@/i18n/use-t';import { usePromotion } from '@/store/promotion';import { navTo } from '@/lib/route';
const t=useT(),store=usePromotion(),id=ref(''),busy=ref(false),error=ref('');const reward=computed(()=>store.rewards.find(r=>r.obligationId===id.value));onLoad(q=>{id.value=String(q?.obligationId??'');refresh();});onShow(refresh);function refresh(){store.refresh();error.value=store.error?t.value.prototypeBusiness.localError:'';}function retry(){if(busy.value)return;busy.value=true;try{store.retryReward(id.value);error.value='';}catch{error.value=t.value.prototypeBusiness.storage;}finally{busy.value=false;}}
</script>
<style src="../../components/promotion/promotion.css"></style>
