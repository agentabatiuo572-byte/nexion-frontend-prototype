<template>
  <view class="promotion" style="display:flex;flex-direction:column;gap:12px">
    <view v-if="store.error" class="promotion-flat"><text class="promotion-copy">{{ t.prototypeBusiness.localError }}</text><view role="button" tabindex="0" class="promotion-link" @click="store.refresh"><text>{{ t.promotion.retry }}</text></view></view>
    <view v-for="activity in visible" :key="activity.activityId" class="nx-glass-card promotion-flat">
      <text class="promotion-title">{{ localized(activity.title,locale.code) }}</text>
      <text class="promotion-copy">{{ localized(activity.terms,locale.code) }}</text>
      <text class="promotion-copy">{{ t.promotion.deadline }} · {{ displayDeadline(activity.endsAt,locale.code) }}</text>
      <view v-if="!productNo" class="promotion-action primary" role="button" tabindex="0" @click="navTo(promotionStoreHref(activity.activityId))"><text>{{ t.promotion.browse }}</text></view>
      <view class="promotion-link" role="button" tabindex="0" @click="selected=activity"><text>{{ t.promotion.rulesLink }}</text></view>
    </view>
    <text v-if="!visible.length&&mode==='events'&&!store.error" class="promotion-copy">{{ t.promotion.empty }}</text>
    <view v-if="mode==='events'" role="button" tabindex="0" class="promotion-link" @click="navTo('/pages/events/promotion-rewards')"><text>{{ t.promotion.rewards }}</text></view>
    <PromotionTerms :open="!!selected" :title="localized(selected?.title,locale.code)" :terms="localized(selected?.terms,locale.code)" :disclosures="promotionDisclosures(selected)" @close="selected=null" />
  </view>
</template>
<script setup lang="ts">
import { computed,ref } from 'vue';import { onShow } from '@dcloudio/uni-app';
import { useT } from '@/i18n/use-t';import { useLocaleStore } from '@/store/locale';import { usePromotion } from '@/store/promotion';import type { PublicPromotion } from '@/api/promotion-contracts';
import { localized,displayDeadline } from '@/lib/promotion-display';import { promotionDisclosures,promotionStoreHref,promotionDetailHref } from '@/lib/promotion-entry';import { navTo } from '@/lib/route';import PromotionTerms from './promotion-terms.vue';
const props=withDefaults(defineProps<{mode?:'home'|'events'|'store';productNo?:string;activityId?:string}>(),{mode:'events',productNo:'',activityId:''});
const t=useT(),locale=useLocaleStore(),store=usePromotion(),selected=ref<PublicPromotion|null>(null);
const visible=computed(()=>store.error?[]:store.activities.filter(a=>a.state==='ACTIVE'&&Date.now()<Date.parse(a.endsAt)&&(!props.productNo||a.productNos.includes(props.productNo))&&(!props.activityId||a.activityId===props.activityId)));
onShow(store.refresh);
</script>
<style src="./promotion.css"></style>
