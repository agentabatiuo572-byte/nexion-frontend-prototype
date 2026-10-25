<template>
  <view v-if="items.length || status !== 'ready' || mode !== 'home'" class="promotion promotion-entry" :data-testid="'promotion-entry-'+mode">
    <view v-if="mode==='events'" class="entry-navigation">
      <text class="promotion-title">{{ t.promotion.promotionList }}</text>
      <view class="promotion-link" role="button" tabindex="0" @click="navTo('/pages/me/rewards-list?cat=promotion')" @keydown.enter.prevent="navTo('/pages/me/rewards-list?cat=promotion')" @keydown.space.prevent="navTo('/pages/me/rewards-list?cat=promotion')"><text>{{ t.promotion.rewards }}</text><text aria-hidden="true">›</text></view>
    </view>
    <view v-if="status==='loading'&&!items.length" class="entry-status" role="status" aria-live="polite"><text>{{ t.promotion.loading }}</text></view>
    <view v-if="status==='error'" class="entry-status" role="alert">
      <text class="promotion-title">{{ t.promotion.error }}</text><text class="promotion-copy">{{ t.promotion.errorNote }}</text>
      <NxButton class="entry-cta" size="medium" :label="t.promotion.retry" @click="load(true)"><text>{{ t.promotion.retry }}</text><text aria-hidden="true">→</text></NxButton>
    </view>
    <view v-if="status==='ready'&&!items.length&&mode==='events'" class="entry-status">
      <text class="promotion-title">{{ t.promotion.empty }}</text><text class="promotion-copy">{{ t.promotion.emptyNote }}</text>
      <NxButton class="entry-cta" size="medium" :label="t.promotion.allProducts" @click="navTo(promotionStoreHref())"><text>{{ t.promotion.allProducts }}</text><text aria-hidden="true">→</text></NxButton>
    </view>
    <view v-for="activity in visibleItems" :key="activity.activityId" :class="[mode==='home'?'entry-advert':'entry-event', 'entry-kind-'+activityKind(activity)]" :data-activity-id="activity.activityId" :data-activity-kind="activityKind(activity)">
      <view v-if="mode==='home'" class="entry-advert-target" role="button" :tabindex="active ? 0 : -1" :aria-hidden="!active" :aria-label="localized(activity.title,locale.code)+' · '+t.promotion.browse" @click="active && navTo(promotionStoreHref(activity.activityId))" @keydown.enter.prevent="active && navTo(promotionStoreHref(activity.activityId))" @keydown.space.prevent="active && navTo(promotionStoreHref(activity.activityId))" />
      <image v-if="mode==='home'&&bannerUrl(activity)" :key="[app.accountKey,app.accountBindingEpoch,locale.code,bannerUrl(activity)].join(':')" v-show="bannerReady(activity)" class="entry-artwork" :src="bannerUrl(activity)" mode="aspectFit" aria-hidden="true" alt="" @load="loadBanner(activity)" @error="failBanner(activity)" />
      <view v-if="mode==='home'&&!bannerReady(activity)&&promoImages(activity).length" class="entry-product-art" aria-hidden="true"><image v-for="(src,index) in promoImages(activity)" :key="src" :src="src" mode="aspectFit" :class="index ? 'entry-gift-image' : 'entry-main-image'" @error="failedProductImages.add(src)" /></view>
      <view v-if="mode==='events'&&activityKind(activity)!=='plain'" class="entry-event-art"><TeamArt :kind="activityArt(activity)" :size="activityKind(activity)==='spark'?88:144" /></view>
      <view v-if="mode==='home'&&!bannerReady(activity)" class="entry-copy">
        <text class="entry-label">{{ t.promotion.activityBadge }}</text>
        <text class="entry-title">{{ localized(activity.title,locale.code) }}</text>
        <text v-if="homeRewardSummary(activity)" class="entry-benefit">{{ homeRewardSummary(activity) }}</text>
        <text class="entry-home-deadline" role="button" tabindex="0" :aria-label="t.promotion.rulesLink" @click.stop="termsActivity=activity" @keydown.enter.stop.prevent="termsActivity=activity" @keydown.space.stop.prevent="termsActivity=activity">{{ displayDeadline(activity.endsAt,locale.code) }} · {{ t.promotion.rulesLink }} ›</text>
      </view>
      <view v-if="mode==='events'" class="entry-event-copy">
        <text class="entry-eyebrow">{{ t.promotion.activityBadge }}</text>
        <text class="entry-title">{{ localized(activity.title,locale.code) }}</text>
        <view v-if="activity.rewardRules.length" class="entry-benefits">
          <view v-for="rule in activity.rewardRules" :key="rule.ruleId" class="entry-benefit-row">
            <text v-if="activityKind(activity)==='spark'" class="entry-condition">{{ t.promotion.rulePer }} {{ rule.minBuyQty }}</text>
            <text class="entry-benefit">{{ rewardSummary(rule.buyerReward,t.promotion,rule.buyerReward.disclosure.deviceName) }}</text>
            <text v-if="rule.inviterReward" class="entry-inviter-benefit">{{ t.promotion.inviter }} · {{ rewardSummary(rule.inviterReward,t.promotion,rule.inviterReward.disclosure.deviceName) }}</text>
          </view>
        </view>
        <text v-if="activity.eligibilityMessage" class="promotion-copy entry-eligibility">{{ localized(activity.eligibilityMessage,locale.code) }}</text>
      </view>
      <view v-if="mode==='events'" class="entry-event-footer">
        <text class="entry-deadline">{{ t.promotion.deadline }} · {{ displayDeadline(activity.endsAt,locale.code) }}</text>
        <view class="entry-event-actions">
          <view class="promotion-link" role="button" tabindex="0" @click="termsActivity=activity" @keydown.enter.prevent="termsActivity=activity" @keydown.space.prevent="termsActivity=activity"><text>{{ t.promotion.rulesLink }}</text><text aria-hidden="true">›</text></view>
          <NxButton class="entry-cta" size="medium" :label="t.promotion.browse" @click="navTo(promotionStoreHref(activity.activityId))"><text>{{ t.promotion.browse }}</text><text aria-hidden="true">→</text></NxButton>
        </view>
      </view>
    </view>
    <view v-if="mode==='home'&&items.length>1" class="entry-pagination" :aria-label="t.promotion.events">
      <view v-for="(_,index) in items" :key="index" class="entry-page-dot" role="button" tabindex="0" :aria-label="`${index+1} / ${items.length}`" :aria-current="activeIndex===index" @click="activeIndex=index" @keydown.enter.prevent="activeIndex=index" @keydown.space.prevent="activeIndex=index"><view :class="{selected:activeIndex===index}" /></view>
    </view>
    <NxButton v-if="hasMore&&mode==='events'" class="entry-cta" size="medium" :busy="status==='loading'" :label="status==='loading'?t.promotion.loading:t.promotion.more" @click="load(false)"><text>{{ status==='loading'?t.promotion.loading:t.promotion.more }}</text><text aria-hidden="true">→</text></NxButton>
    <PromotionTerms :open="!!termsActivity" :title="localized(termsActivity?.title,locale.code)" :terms="termsText" :rules="termsRules" :disclosures="promotionDisclosures(termsActivity)" @close="termsActivity=null" />
  </view>
</template>
<script setup lang="ts">
import { fmt } from '@/i18n/format';
import { computed,onBeforeUnmount,onMounted,ref,watch } from 'vue';
import { onHide,onShow } from '@/composables/use-tab-page-lifecycle';
import { apiRuntimeConfig,promotionApi,remoteApiEnabled,sessionVault } from '@/api/runtime';
import type { PublicPromotion } from '@/api/promotion-contracts';
import { useApp } from '@/store/app';
import { useLocaleStore } from '@/store/locale';
import { useT } from '@/i18n/use-t';
import { getProduct } from '@/mock/products';
import { productCatalogState } from '@/store/product-catalog';
import { navTo } from '@/lib/route';
import { localized,displayDeadline,rewardSummary } from '@/lib/promotion-display';
import { createPromotionReadFence,isPromotionActive,promotionDisclosures,promotionStoreHref } from '@/lib/promotion-entry';
import NxButton from '@/components/ui/nx-button.vue';
import TeamArt from '@/components/team/team-art.vue';
import PromotionTerms from './promotion-terms.vue';
const props=withDefaults(defineProps<{mode?:'home'|'events';activities?:PublicPromotion[];active?:boolean}>(),{mode:'home',active:true});
const app=useApp(),locale=useLocaleStore(),t=useT();
const items=ref<PublicPromotion[]>([]),status=ref<'idle'|'loading'|'ready'|'error'>('idle');
const cursor=ref<string|null>(null),hasMore=ref(false),activeIndex=ref(0),termsActivity=ref<PublicPromotion|null>(null);
const loadedBanners=ref(new Set<string>()),failedBanners=ref(new Set<string>());
const failedProductImages=ref(new Set<string>());
// Presentation follows published reward types. Purchase rewards do not imply
// a claimed voucher or a completed milestone; those have separate event data.
function activityKind(activity:PublicPromotion):'gift'|'coupon'|'spark'|'plain' {
  const rewards=activity.rewardRules.flatMap(rule=>[rule.buyerReward,...(rule.inviterReward?[rule.inviterReward]:[])]);
  if(rewards.some(reward=>reward.type==='DEVICE'))return 'gift';
  if(rewards.some(reward=>reward.type==='DISCOUNT_USDT'))return 'coupon';
  return rewards.length?'spark':'plain';
}
function activityArt(activity:PublicPromotion){const kind=activityKind(activity);return kind==='plain'?'spark':kind;}
function promoImages(activity:PublicPromotion) {
  void productCatalogState.status;
  const rule=activity.rewardRules[0];
  if(!rule||!sessionVault.read())return [];
  const ids=[rule.productNo,...(rule.buyerReward.type==='DEVICE'?[rule.buyerReward.giftProductNo]:[])];
  return ids.map(id=>getProduct(id)?.imageUrl).filter((src):src is string=>!!src&&!failedProductImages.value.has(src));
}
const fence=createPromotionReadFence();let visible=true;
const visibleItems=computed(()=>props.mode==='home'?items.value.slice(activeIndex.value,activeIndex.value+1):items.value);
function bannerUrl(activity:PublicPromotion){return activity.bannerImageUrl&&!failedBanners.value.has(activity.bannerImageUrl)?apiRuntimeConfig.baseUrl.replace(/\/+$/,'')+activity.bannerImageUrl:null;}
function bannerReady(activity:PublicPromotion){const url=bannerUrl(activity);return !!url&&loadedBanners.value.has(url);}
function loadBanner(activity:PublicPromotion){const url=bannerUrl(activity);if(url)loadedBanners.value.add(url);}
function failBanner(activity:PublicPromotion){const url=bannerUrl(activity);if(activity.bannerImageUrl){failedBanners.value.add(activity.bannerImageUrl);if(url)loadedBanners.value.delete(url);}}
function clear(resetBanners=true){items.value=[];cursor.value=null;hasMore.value=false;activeIndex.value=0;termsActivity.value=null;if(resetBanners){loadedBanners.value.clear();failedBanners.value.clear();}}
function publicName(id:string){void productCatalogState.status;return sessionVault.read()?getProduct(id)?.name??id:id;}
function rewardSummaries(activity:PublicPromotion){return activity.rewardRules.map(rule=>{
  const rewards=[rule.buyerReward,rule.inviterReward].filter((reward):reward is NonNullable<typeof reward>=>!!reward);
  return { id:rule.ruleId, text: publicName(rule.productNo)+' · '+t.value.promotion.rulePer+' '+rule.minBuyQty+' · '+(rule.repeatMode==='PER_GROUP'?t.value.promotion.perGroup:t.value.promotion.oncePerOrder)+'\n'+rewards.map(reward=>(reward.beneficiaryRole==='BUYER'?t.value.promotion.buyer:t.value.promotion.inviter)+' · '+rewardSummary(reward,t.value.promotion,reward.disclosure.deviceName)).join(' / ')+'\n'+[rule.maxGroups.mode==='LIMITED'?fmt(t.value.promotion.orderRewardLimit,{n:rule.maxGroups.value}):'',rule.maxGroupsPerPerson.mode==='LIMITED'?fmt(t.value.promotion.personRewardLimit,{n:rule.maxGroupsPerPerson.value}):''].filter(Boolean).join(' · ') };
});}
function homeRewardSummary(activity:PublicPromotion) {
  const reward=activity.rewardRules[0]?.buyerReward;
  if(!reward)return '';
  return localized(reward.disclosure.benefitDescription,locale.code)
    || rewardSummary(reward,t.value.promotion,reward.disclosure.deviceName || (reward.type==='DEVICE'?publicName(reward.giftProductNo):null));
}
const termsRules=computed(()=>termsActivity.value?rewardSummaries(termsActivity.value):[]);
const termsText=computed(()=>termsActivity.value?[localized(termsActivity.value.terms,locale.code),t.value.promotion.deadline+' · '+displayDeadline(termsActivity.value.endsAt,locale.code)].join('\n\n'):'');
async function load(reset:boolean){
  if(!visible)return;
  if(props.activities!==undefined){fence.invalidate();clear(false);items.value=props.activities.filter(isPromotionActive);status.value='ready';return;}
  if(!reset&&(status.value==='loading'||!hasMore.value)) return;
  const ticket=fence.next(),identity=`${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`;
  status.value='loading';
  if(reset)clear();
  if(!remoteApiEnabled){clear();status.value=props.mode==='home'?'ready':'error';return;}
  try{
    const page=await promotionApi.list({limit:20,cursor:reset?null:cursor.value,...(props.mode==='home'?{placement:'home.purchase-promotion' as const}:{})},!!sessionVault.read());
    if(!visible||!fence.current(ticket)||identity!==`${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`)return;
    const rows=reset?[]:items.value;
    items.value=[...new Map([...rows,...page.items.filter(isPromotionActive)].map(item=>[item.activityId,item])).values()];
    cursor.value=page.nextCursor;hasMore.value=page.hasMore;status.value='ready';
  }catch{if(visible&&fence.current(ticket)&&identity===`${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`){clear();status.value='error';}}
}
async function move(delta:number){
  const next=activeIndex.value+delta;if(next<0)return;
  if(next>=items.value.length&&hasMore.value)await load(false);
  if(next<items.value.length)activeIndex.value=next;
}
watch([()=>app.accountKey,()=>app.accountBindingEpoch,()=>locale.code],()=>{
  fence.invalidate();clear();status.value='idle';
  if(visible)void load(true);
});
watch(()=>props.activities,(next,previous)=>{if(visible&&(next!==undefined||previous!==undefined))void load(true);},{immediate:true});
onMounted(()=>{void load(true);});onShow(()=>{visible=true;void load(true);});
onHide(()=>{visible=false;fence.invalidate();clear();status.value='idle';});
onBeforeUnmount(()=>{visible=false;fence.invalidate();clear();});
</script>
<style src="./promotion.css"></style>
<style scoped>
.promotion-entry { display: flex; flex-direction: column; gap: var(--ui-space-inset); }
.entry-status { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ui-space-row-y); padding: var(--ui-space-inline) 0; }
.entry-advert,.entry-event { position: relative; overflow: hidden; border: 1px solid var(--v5-border); border-radius: 24px; background: linear-gradient(140deg,var(--ui-spotlight-top),var(--ui-ticket-bottom)); }
.entry-advert { min-height: 146px; }
.entry-advert-target { position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
.entry-advert-target:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -3px; }
.entry-artwork { position: absolute; inset: 0; width: 100%; height: 100%; }
.entry-advert .entry-copy { position: relative; display: flex; flex-direction: column; padding: 18px; min-height: 146px; box-sizing: border-box; }
.entry-advert:has(.entry-product-art) .entry-copy { padding-right: 148px; }
.entry-label,.entry-eyebrow { display: block; color: var(--v5-brand); font: 500 12px/1.5 var(--font-v5); }
.entry-title { display: block; margin-top: 7px; font: 600 23px/1.3 var(--font-v5); overflow-wrap: anywhere; }
.entry-advert .entry-title { font-size: 19px; line-height: 25px; }
.entry-advert .promotion-copy { color: var(--v5-ink-2); font-size: 12px; line-height: 1.5; }
.entry-copy,.entry-event-copy { min-width: 0; }
.entry-benefit { display: block; margin-top: 5px; color: var(--v5-ink-2); font: 500 14px/1.5 var(--font-v5); overflow-wrap: anywhere; }
.entry-advert .entry-benefit { font-size: 12px; font-weight: 400; }
.entry-home-deadline { position: relative; z-index: 2; margin-top: auto; padding-top: 8px; color: var(--v5-ink-3); font: 400 12px/1.5 var(--font-v5); }
.entry-home-deadline:focus-visible { outline: 2px solid var(--v5-brand); }
.entry-product-art { position: absolute; right: 0; width: 160px; inset-block: 0; pointer-events: none; }
.entry-main-image { position: absolute; right: 30px; top: 4px; width: 118px; height: 118px; }
.entry-gift-image { position: absolute; right: -6px; bottom: 6px; width: 84px; height: 84px; }
.entry-event { display: grid; grid-template-columns: minmax(0,1fr) 128px; padding: var(--ui-space-section); gap: var(--ui-space-inset) 0; }
.entry-event-copy { position: relative; z-index: 1; grid-column: 1; grid-row: 1; }
.entry-event-art { display: flex; align-items: center; justify-content: center; grid-column: 2; grid-row: 1; pointer-events: none; }
.entry-event-art :deep(.team-art) { max-width: none; }
.entry-event.entry-kind-gift { background: radial-gradient(ellipse at 88% 40%,color-mix(in srgb,var(--v5-brand) 9%,transparent),transparent 56%),linear-gradient(140deg,var(--ui-spotlight-top),var(--ui-ticket-bottom)); }
.entry-event.entry-kind-gift .entry-event-art { align-self: center; }
.entry-benefits { margin-top: var(--ui-space-inline); }
.entry-benefit-row + .entry-benefit-row { margin-top: var(--ui-space-inline); }
.entry-inviter-benefit,.entry-condition { display: block; margin-top: 4px; color: var(--v5-ink-3); font: 400 12px/1.5 var(--font-v5); }
.entry-eligibility { margin-top: var(--ui-space-row-y); }
.entry-event-footer { position: relative; z-index: 1; grid-column: 1 / -1; }
.entry-deadline { display: block; color: var(--v5-ink-3); font: 400 11px/1.5 var(--font-v5); overflow-wrap: anywhere; }
.entry-event-actions { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-top: var(--ui-space-row-y); }
.promotion-link { gap: 8px; color: var(--v5-ink-2); }
.entry-cta { --v5-liquid-tint: rgba(38,38,42,.88); --v5-surface: #26262a; color: #fff; background: #26262a; box-sizing: border-box; }
.entry-event.entry-kind-coupon { grid-template-columns: minmax(0,1fr) 94px; border-radius: 16px; }
.entry-kind-coupon .entry-event-copy { padding-right: 18px; }
.entry-kind-coupon .entry-event-art { border-left: 1px dashed var(--v5-border); margin: -20px -20px -16px 0; overflow: hidden; }
.entry-kind-coupon .entry-event-art :deep(.team-art) { transform: rotate(-12deg); }
.entry-kind-coupon .entry-event-footer { border-top: 1px dashed var(--v5-border); padding-top: 14px; }
.entry-event.entry-kind-spark { grid-template-columns: minmax(0,1fr) 72px; }
.entry-kind-spark .entry-event-art { align-self: start; }
.entry-kind-spark .entry-benefits { margin-top: 18px; padding-left: 14px; border-left: 1px solid var(--v5-border); }
.entry-kind-spark .entry-benefit-row { position: relative; }
.entry-kind-spark .entry-benefit-row::before { content: ''; position: absolute; left: -18px; top: 6px; width: 7px; height: 7px; border-radius: 50%; background: var(--v5-brand); }
.entry-kind-spark .entry-benefit { font-size: 20px; }
.entry-kind-plain .entry-event-copy { grid-column: 1 / -1; }
.entry-pagination,.entry-navigation { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); }
.entry-pagination { justify-content: center; gap: 0; margin-top: -10px; }
.entry-page-dot { display: grid; place-items: center; width: 28px; height: 28px; cursor: pointer; }
.entry-page-dot > view { width: 6px; height: 6px; border-radius: 999px; background: var(--v5-surface-3); }
.entry-page-dot > .selected { width: 16px; background: var(--v5-brand); }
.entry-page-dot:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -2px; }
@media(max-width:350px) {
  .entry-advert:has(.entry-product-art) .entry-copy { padding-right: 120px; }
  .entry-product-art { right: -15px; }
  .entry-advert .entry-title { font-size: 17px; line-height: 22px; }
  .entry-home-deadline { font-size: 11px; }
  .entry-event { padding: var(--ui-space-inset); grid-template-columns: minmax(0,1fr) 104px; }
  .entry-title { font-size: 20px; }
  .entry-kind-coupon .entry-event-art { margin: -16px -16px -16px 0; }
}
</style>
