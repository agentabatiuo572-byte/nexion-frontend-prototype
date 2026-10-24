<template><view class="nx-glass-card promotion-flat">
  <text class="promotion-title">{{ t.promotion.inviteTitle }}</text><text class="promotion-copy">{{ t.promotion.inviteNote }}</text>
  <view v-if="store.error" role="alert" class="promotion-flat"><text>{{ t.prototypeBusiness.localError }}</text><view role="button" tabindex="0" class="promotion-link" @click="store.refresh"><text>{{ t.promotion.retry }}</text></view></view>
  <template v-else><view class="promotion-summary"><text>{{ t.promotion.friendPaid }}</text><text>{{ orders }}</text></view><RewardRows :rewards="rewards.slice(0,3)" /></template>
  <text class="promotion-copy">{{ t.promotion.privacy }}</text>
  <view role="button" tabindex="0" class="promotion-link" @click="navTo('/pages/events/promotion-rewards')"><text>{{ t.promotion.rewards }}</text></view>
  <view role="button" tabindex="0" class="promotion-action primary" @click="emit('share')"><text>{{ t.promotion.existingInvite }}</text></view>
</view></template>
<script setup lang="ts">
import { computed } from 'vue';import { onShow } from '@dcloudio/uni-app';import { useT } from '@/i18n/use-t';import { usePromotion } from '@/store/promotion';import { navTo } from '@/lib/route';import RewardRows from './reward-rows.vue';
const emit=defineEmits<{(event:'share'):void}>(),t=useT(),store=usePromotion();const rewards=computed(()=>store.rewards.filter(r=>r.beneficiaryRole==='DIRECT_INVITER'));const orders=computed(()=>new Set(rewards.value.map(r=>r.orderNo)).size);onShow(store.refresh);
</script>
<style src="./promotion.css"></style>
