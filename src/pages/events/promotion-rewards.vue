<template><AppChassis active="me"><SubPageHeader back="/pages/me/rewards" :title="t.promotion.rewards" /><PromotionRewardList :order-no="orderNo" :activity-id="activityId" /></AppChassis></template>
<script setup lang="ts">
import { ref } from 'vue';import { onLoad } from '@dcloudio/uni-app';import AppChassis from '@/components/app-chassis.vue';import SubPageHeader from '@/components/sub-page-header.vue';import PromotionRewardList from '@/components/promotion/promotion-reward-list.vue';import { useT } from '@/i18n/use-t';
const t=useT(),orderNo=ref(''),activityId=ref('');onLoad(q=>{orderNo.value=String(q?.orderNo??'');activityId.value=String(q?.activityId??'');});
</script>
