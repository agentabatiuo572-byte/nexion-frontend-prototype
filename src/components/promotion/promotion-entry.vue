<template>
  <view v-if="items.length || status !== 'ready' || mode !== 'home'" class="promotion promotion-entry" :data-testid="'promotion-entry-'+mode">
    <view v-if="mode==='events'" class="entry-navigation">
      <text class="promotion-title">{{ t.promotion.promotionList }}</text>
      <view class="promotion-link" role="button" tabindex="0" @click="navTo('/pages/me/rewards-list?cat=promotion')"><text>{{ t.promotion.rewards }}</text></view>
    </view>
    <view v-if="status==='loading'&&!items.length" class="promotion-flat" role="status" aria-live="polite"><text>{{ t.promotion.loading }}</text></view>
    <view v-if="status==='error'" class="promotion-flat" role="alert">
      <text class="promotion-title">{{ t.promotion.error }}</text><text class="promotion-copy">{{ t.promotion.errorNote }}</text>
      <view class="promotion-link" role="button" tabindex="0" @click="load(true)"><text>{{ t.promotion.retry }}</text></view>
    </view>
    <view v-if="status==='ready'&&!items.length&&mode==='events'" class="promotion-flat">
      <text class="promotion-title">{{ t.promotion.empty }}</text><text class="promotion-copy">{{ t.promotion.emptyNote }}</text>
      <view class="promotion-link" role="button" tabindex="0" @click="navTo(promotionStoreHref())"><text>{{ t.promotion.allProducts }}</text></view>
    </view>
    <view v-for="activity in visibleItems" :key="activity.activityId" :class="mode==='home'?'entry-advert':'entry-event'" :data-activity-id="activity.activityId">
      <view v-if="mode==='home'" class="entry-advert-target" role="button" :tabindex="active ? 0 : -1" :aria-hidden="!active" :aria-label="localized(activity.title,locale.code)+' · '+t.promotion.browse" @click="active && navTo(promotionStoreHref(activity.activityId))" />
      <view v-if="mode==='home'" class="entry-artwork" aria-hidden="true" />
      <text v-if="mode==='home'" class="entry-label">{{ t.promotion.activityBadge }}</text>
      <view class="entry-copy">
        <text v-if="mode==='events'" class="entry-eyebrow">{{ t.promotion.events }}</text>
        <text class="entry-title">{{ localized(activity.title,locale.code) }}</text>
        <text class="promotion-copy">{{ t.promotion.promoSub }}</text>
        <template v-if="mode==='events'"><text v-for="(summary,index) in rewardSummaries(activity)" :key="index" class="promotion-copy">{{ summary }}</text></template>
        <text v-if="mode==='events'" class="promotion-copy entry-deadline">{{ t.promotion.deadline }} · {{ displayDeadline(activity.endsAt,locale.code) }}</text>
        <text v-if="mode==='events'&&activity.eligibilityMessage" class="promotion-copy">{{ localized(activity.eligibilityMessage,locale.code) }}</text>
        <view v-if="mode==='events'" class="promotion-action primary" role="button" tabindex="0" @click="navTo(promotionStoreHref(activity.activityId))"><LiquidGlass :radius="999" tone="control" /><text>{{ t.promotion.browse }}</text></view>
        <view v-else class="promotion-action primary" aria-hidden="true"><LiquidGlass :radius="999" tone="control" /><text>{{ t.promotion.browse }}</text></view>
        <view v-if="mode==='events'" class="promotion-link" role="button" tabindex="0" @click="termsActivity=activity"><text>{{ t.promotion.rulesLink }}</text></view>
      </view>
    </view>
    <view v-if="mode==='home'&&items.length>1" class="entry-pagination" :aria-label="t.promotion.events">
      <view class="entry-page" role="button" tabindex="0" :aria-label="t.promotion.back" :aria-disabled="activeIndex===0" @click="move(-1)">‹</view>
      <text class="promotion-copy" aria-live="polite">{{ activeIndex+1 }} / {{ items.length }}</text>
      <view class="entry-page" role="button" tabindex="0" :aria-label="t.promotion.more" :aria-disabled="activeIndex===items.length-1&&!hasMore" @click="move(1)">›</view>
    </view>
    <view v-if="hasMore&&mode==='events'" class="promotion-action" role="button" tabindex="0" :aria-disabled="status==='loading'" @click="load(false)"><LiquidGlass :radius="999" tone="control" /><text>{{ status==='loading'?t.promotion.loading:t.promotion.more }}</text></view>
    <PromotionTerms :open="!!termsActivity" :title="localized(termsActivity?.title,locale.code)" :terms="termsText" :disclosures="promotionDisclosures(termsActivity)" @close="termsActivity=null" />
  </view>
</template>
<script setup lang="ts">
import { computed,onBeforeUnmount,onMounted,ref,watch } from 'vue';
import { onHide,onShow } from '@dcloudio/uni-app';
import { promotionApi,remoteApiEnabled,sessionVault } from '@/api/runtime';
import type { PublicPromotion } from '@/api/promotion-contracts';
import { useApp } from '@/store/app';
import { useLocaleStore } from '@/store/locale';
import { useT } from '@/i18n/use-t';
import { getProduct } from '@/mock/products';
import { productCatalogState } from '@/store/product-catalog';
import { navTo } from '@/lib/route';
import { localized,displayDeadline,rewardAmount } from '@/lib/promotion-display';
import { createPromotionReadFence,promotionDisclosures,promotionStoreHref } from '@/lib/promotion-entry';
import LiquidGlass from '@/components/liquid-glass.vue';
import PromotionTerms from './promotion-terms.vue';
const props=withDefaults(defineProps<{mode?:'home'|'events';activities?:PublicPromotion[];active?:boolean}>(),{mode:'home',active:true});
const app=useApp(),locale=useLocaleStore(),t=useT();
const items=ref<PublicPromotion[]>([]),status=ref<'idle'|'loading'|'ready'|'error'>('idle');
const cursor=ref<string|null>(null),hasMore=ref(false),activeIndex=ref(0),termsActivity=ref<PublicPromotion|null>(null);
const fence=createPromotionReadFence();let visible=true;
const visibleItems=computed(()=>props.mode==='home'?items.value.slice(activeIndex.value,activeIndex.value+1):items.value);
function publicName(id:string){void productCatalogState.status;return sessionVault.read()?getProduct(id)?.name??id:id;}
function rewardSummaries(activity:PublicPromotion){return activity.rewardRules.map(rule=>{
  const rewards=[rule.buyerReward,rule.inviterReward].filter((reward):reward is NonNullable<typeof reward>=>!!reward);
  return publicName(rule.productNo)+' · '+t.value.promotion.rulePer+' '+rule.minBuyQty+' · '+(rule.repeatMode==='PER_GROUP'?t.value.promotion.perGroup:t.value.promotion.oncePerOrder)+'\n'+rewards.map(reward=>(reward.beneficiaryRole==='BUYER'?t.value.promotion.buyer:t.value.promotion.inviter)+' · '+(reward.type==='DEVICE'?(reward.disclosure.deviceName || t.value.promotion.unknown)+' × '+rewardAmount(reward):rewardAmount(reward)+' '+reward.type)).join(' / ')+'\n'+t.value.promotion.orderGroupLimit+' · '+(rule.maxGroups.mode==='LIMITED'?rule.maxGroups.value:t.value.promotion.unlimitedGroups)+'\n'+t.value.promotion.personGroupLimit+' · '+(rule.maxGroupsPerPerson.mode==='LIMITED'?rule.maxGroupsPerPerson.value:t.value.promotion.unlimitedGroups);
});}
const termsText=computed(()=>termsActivity.value?[localized(termsActivity.value.terms,locale.code),...rewardSummaries(termsActivity.value),t.value.promotion.deadline+' · '+displayDeadline(termsActivity.value.endsAt,locale.code)].join('\n\n'):'');
async function load(reset:boolean){
  if(props.activities!==undefined){items.value=props.activities;status.value='ready';cursor.value=null;hasMore.value=false;return;}
  if(!reset&&(status.value==='loading'||!hasMore.value)) return;
  const ticket=fence.next(),identity=`${app.accountKey}:${app.accountBindingEpoch}`;
  status.value='loading';
  if(reset){cursor.value=null;hasMore.value=false;activeIndex.value=0;}
  if(!remoteApiEnabled){items.value=[];status.value=props.mode==='home'?'ready':'error';return;}
  try{
    const page=await promotionApi.list({limit:20,cursor:reset?null:cursor.value,...(props.mode==='home'?{placement:'home.purchase-promotion' as const}:{})},!!sessionVault.read());
    if(!visible||!fence.current(ticket)||identity!==`${app.accountKey}:${app.accountBindingEpoch}`)return;
    const rows=reset?[]:items.value;
    items.value=[...new Map([...rows,...page.items].map(item=>[item.activityId,item])).values()];
    cursor.value=page.nextCursor;hasMore.value=page.hasMore;status.value='ready';
  }catch{if(visible&&fence.current(ticket))status.value='error';}
}
async function move(delta:number){
  const next=activeIndex.value+delta;if(next<0)return;
  if(next>=items.value.length&&hasMore.value)await load(false);
  if(next<items.value.length)activeIndex.value=next;
}
watch([()=>app.accountKey,()=>app.accountBindingEpoch,()=>locale.code],()=>{
  fence.invalidate();items.value=[];cursor.value=null;hasMore.value=false;termsActivity.value=null;
  if(visible)void load(true);
});
watch(()=>props.activities,()=>{if(props.activities!==undefined)void load(true);},{immediate:true});
onMounted(()=>{void load(true);});onShow(()=>{visible=true;void load(true);});
onHide(()=>{visible=false;fence.invalidate();termsActivity.value=null;});
onBeforeUnmount(()=>{visible=false;fence.invalidate();});
</script>
<style src="./promotion.css"></style>
<style scoped>
.promotion-entry { display:flex; flex-direction:column; gap:16px; }
.entry-advert { position:relative; }
.entry-advert-target { position:absolute;inset:0;z-index:1;border-radius:24px; }
.entry-advert-target:focus-visible { outline:2px solid var(--v5-brand);outline-offset:3px; }
.entry-advert { height:184px; box-sizing:border-box; padding:16px 16px 16px 44%; border-radius:16px; overflow:hidden; background:radial-gradient(ellipse at bottom right,color-mix(in srgb,var(--v5-brand) 40%,transparent),transparent 66%),linear-gradient(145deg,var(--v5-bg),color-mix(in srgb,var(--v5-brand) 13%,var(--v5-bg))); border:1px solid color-mix(in srgb,var(--v5-brand) 65%,var(--v5-border)); box-shadow:inset 0 0 16px color-mix(in srgb,var(--v5-brand) 18%,transparent); display:flex; align-items:center; }
.entry-artwork { position:absolute; inset:0 auto 0 0; width:45%; background:url('/static/promotion/purchase-gift-reference.png') left center / auto 100% no-repeat; mask-image:linear-gradient(to right,black 80%,transparent); }
.entry-label { position:absolute; top:10px; left:10px; padding:3px 7px; border-radius:12px; border:1px solid var(--v5-brand); background:color-mix(in srgb,var(--v5-brand) 28%,var(--v5-bg)); color:var(--v5-ink); font-size:12px; }
.entry-advert .entry-title { font-size:20px; line-height:1.25; margin:0 0 8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.entry-advert .promotion-copy { font-size:12px; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.entry-title { display:block; font-size:20px; line-height:1.4; font-weight:600; margin:7px 0; overflow-wrap:anywhere; }
.entry-eyebrow { font-size:12px; color:var(--v5-brand); }
.entry-copy { min-width:0; }
.entry-copy .promotion-action { margin-top:12px; min-height:44px; font-size:13px; padding:10px 12px; }
.promotion-action { position:relative; isolation:isolate; overflow:hidden; }
.promotion-action text { position:relative; z-index:1; }
.entry-event { padding:8px 0 20px; border-bottom:1px solid var(--v5-border); }
.entry-deadline { margin-top:16px; }
.entry-pagination,.entry-navigation { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.entry-pagination { justify-content:center; margin-top:-10px; }
.entry-page { display:flex; justify-content:center; align-items:center; min-width:44px; min-height:44px; font-size:20px; color:var(--v5-brand); }
.entry-page[aria-disabled=true] { opacity:.35; }
@media(max-width:340px){.entry-advert{padding-right:12px}.entry-advert .promotion-action{padding:8px}}
</style>
