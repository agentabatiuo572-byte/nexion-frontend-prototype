<template>
  <view v-if="items.length || (!listRead && status !== 'ready') || status === 'error' || mode !== 'home'" class="promotion promotion-entry" :class="{'promotion-entry-home':mode==='home'}" :data-testid="'promotion-entry-'+mode">
    <view v-if="mode==='events'" class="entry-navigation">
      <text class="promotion-title">{{ t.promotion.promotionList }}</text>
      <view class="promotion-link" role="button" tabindex="0" @click="navTo('/pages/me/rewards-list?cat=promotion')" @keydown.enter.prevent="navTo('/pages/me/rewards-list?cat=promotion')" @keydown.space.prevent="navTo('/pages/me/rewards-list?cat=promotion')"><text>{{ t.promotion.rewards }}</text><text aria-hidden="true">›</text></view>
    </view>
    <view v-if="(status==='idle'||status==='loading')&&!items.length&&!listRead" class="entry-placeholder" role="status" aria-busy="true" :aria-label="t.promotion.loading"><view /><view /></view>
    <view v-if="status==='error'" class="entry-status nx-inline-recovery" role="alert">
      <view class="nx-inline-recovery__copy"><text class="promotion-title">{{ t.promotion.error }}</text><text class="promotion-copy">{{ t.promotion.errorNote }}</text></view>
      <NxButton class="entry-retry nx-inline-recovery__action" variant="text" size="medium" :label="t.promotion.retry" @click="load(true)"><text>{{ t.promotion.retry }}</text><text aria-hidden="true">→</text></NxButton>
    </view>
    <view v-if="status==='ready'&&!items.length&&mode==='events'" class="entry-status">
      <text class="promotion-title">{{ t.promotion.empty }}</text><text class="promotion-copy">{{ t.promotion.emptyNote }}</text>
      <NxButton class="entry-cta" size="medium" :label="t.promotion.allProducts" @click="navTo(promotionStoreHref())"><text>{{ t.promotion.allProducts }}</text><text aria-hidden="true">→</text></NxButton>
    </view>
    <view v-for="activity in visibleItems" :key="activity.activityId" :class="[mode==='home'?'entry-advert':'entry-event', 'entry-kind-'+activityKind(activity), { 'entry-advert--banner': mode==='home' && bannerReady(activity) }]" :data-color-scheme="theme.resolved" :data-activity-id="activity.activityId" :data-activity-kind="activityKind(activity)">
      <view v-if="mode==='home'" class="entry-advert-target" role="button" :tabindex="active ? 0 : -1" :aria-hidden="!active" :aria-label="localized(activity.title,locale.code)+' · '+t.promotion.browse" @click="active && navTo(promotionStoreHref(activity.activityId))" @keydown.enter.prevent="active && navTo(promotionStoreHref(activity.activityId))" @keydown.space.prevent="active && navTo(promotionStoreHref(activity.activityId))" />
      <CatalogMachineImage v-if="mode==='home'&&bannerUrl(activity)" :key="bannerKey(activity)" v-show="bannerReady(activity)" class="entry-artwork" v-bind="bannerImageProps(activity)" />
      <view v-if="mode==='home'&&!bannerReady(activity)&&promoSlots(activity).length" class="entry-product-art" aria-hidden="true"><CatalogMachineImage v-for="slot in promoSlots(activity)" :key="slot.role" :sku="slot.sku" :image-url="slot.imageUrl" :scope-key="activity.activityId+':'+slot.role" :refresh-key="catalogRefreshKey" :class="slot.role==='purchase' ? 'entry-main-image' : 'entry-gift-image'" /></view>
      <text v-if="mode==='home'" class="entry-remaining">{{ homeRemaining(activity) }}</text>
      <view v-if="mode==='events'&&activityKind(activity)!=='plain'" class="entry-event-art"><TeamArt :kind="activityArt(activity)" :size="activityKind(activity)==='spark'?88:144" /></view>
      <view v-if="mode==='home'" class="entry-copy">
        <template v-if="!bannerReady(activity)">
        <text class="entry-label">{{ activityKind(activity)==='gift' ? t.promotion.giftBadge : t.promotion.activityBadge }}</text>
        <text class="entry-title">{{ localized(activity.title,locale.code) }}</text>
        <text v-if="homeRewardSummary(activity)" class="entry-benefit">{{ homeRewardSummary(activity) }}</text>
        </template>
        <text class="entry-home-deadline" role="button" tabindex="0" :aria-label="t.promotion.homeRulesLink" @click.stop="termsActivity=activity" @keydown.enter.stop.prevent="termsActivity=activity" @keydown.space.stop.prevent="termsActivity=activity">{{ t.promotion.homeRulesLink }} ›</text>
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
    <view v-if="mode==='home'&&items.length>1" class="entry-pagination" role="button" tabindex="0" :aria-label="`${t.promotion.nextOffer} · ${activeIndex+1} / ${items.length}`" @click="cycleOffer(1)" @keydown.enter.prevent="cycleOffer(1)" @keydown.space.prevent="cycleOffer(1)" @keydown.right.prevent="cycleOffer(1)" @keydown.left.prevent="cycleOffer(-1)">
      <view v-for="(_,index) in items" :key="index" class="entry-page-dot" :class="{selected:activeIndex===index}" aria-hidden="true" />
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
import { useTheme } from '@/store/theme';
import { useT } from '@/i18n/use-t';
import { getProduct } from '@/mock/products';
import { productCatalogState,refreshProductCatalog,revalidateProductCatalog } from '@/store/product-catalog';
import { navTo } from '@/lib/route';
import { localized,displayDeadline,rewardSummary } from '@/lib/promotion-display';
import { createPromotionReadFence,isPromotionActive,promotionDisclosures,promotionStoreHref } from '@/lib/promotion-entry';
import NxButton from '@/components/ui/nx-button.vue';
import TeamArt from '@/components/team/team-art.vue';
import PromotionTerms from './promotion-terms.vue';
import CatalogMachineImage from '@/components/catalog-machine-image.vue';
import { promotionMachineSlots } from '@/components/catalog-machine-image';
import { readHomePromotions } from '@/store/home-promotions';
const props=withDefaults(defineProps<{mode?:'home'|'events';activities?:PublicPromotion[];active?:boolean}>(),{mode:'home',active:true});
const app=useApp(),locale=useLocaleStore(),theme=useTheme(),t=useT();
const items=ref<PublicPromotion[]>([]),status=ref<'idle'|'loading'|'ready'|'error'>('idle');
const listRead=ref(false);
const cursor=ref<string|null>(null),hasMore=ref(false),activeIndex=ref(0),termsActivity=ref<PublicPromotion|null>(null);
const loadedBanners=ref(new Set<string>()),imageRefresh=ref(0);
const catalogRefreshKey=computed(()=>imageRefresh.value);
// Presentation follows published reward types. Purchase rewards do not imply
// a claimed voucher or a completed milestone; those have separate event data.
function activityKind(activity:PublicPromotion):'gift'|'coupon'|'spark'|'plain' {
  const rewards=activity.rewardRules.flatMap(rule=>[rule.buyerReward,...(rule.inviterReward?[rule.inviterReward]:[])]);
  if(rewards.some(reward=>reward.type==='DEVICE'))return 'gift';
  if(rewards.some(reward=>reward.type==='DISCOUNT_USDT'))return 'coupon';
  return rewards.length?'spark':'plain';
}
function activityArt(activity:PublicPromotion){const kind=activityKind(activity);return kind==='plain'?'spark':kind;}
function promoSlots(activity:PublicPromotion) {
  void app.accountKey;void app.accountBindingEpoch;void productCatalogState.revision;
  const ready=(productCatalogState.status==='ready'||(productCatalogState.status==='loading'&&productCatalogState.serverCanonical))&&!!sessionVault.read();
  return promotionMachineSlots(activity).map(slot=>({...slot,imageUrl:ready?getProduct(slot.sku)?.imageUrl:undefined}));
}
const fence=createPromotionReadFence();let visible=true,pendingTicket:number|null=null;
const visibleItems=computed(()=>props.mode==='home'?items.value.slice(activeIndex.value,activeIndex.value+1):items.value);
// The published banner contract has no theme variants. In light mode use the
// same published rules and catalog images in a theme-aware, readable layout.
function bannerUrl(activity:PublicPromotion){return theme.resolved==='dark'&&activity.bannerImageUrl?apiRuntimeConfig.baseUrl.replace(/\/+$/,'')+activity.bannerImageUrl:null;}
function bannerKey(activity:PublicPromotion){return JSON.stringify([app.accountKey,app.accountBindingEpoch,locale.code,activity.activityId,activity.version,bannerUrl(activity),imageRefresh.value]);}
function bannerReady(activity:PublicPromotion){return !!bannerUrl(activity)&&loadedBanners.value.has(bannerKey(activity));}
function bannerImageProps(activity:PublicPromotion){
  const key=bannerKey(activity);
  return {sku:activity.activityId,imageUrl:bannerUrl(activity),scopeKey:JSON.stringify([locale.code,activity.version]),refreshKey:imageRefresh.value,onReady:(ready:boolean)=>{
    if(!visible||!items.value.some(item=>bannerKey(item)===key))return;
    if(ready)loadedBanners.value.add(key);else loadedBanners.value.delete(key);
  }};
}
function clear(resetBanners=true){items.value=[];listRead.value=false;cursor.value=null;hasMore.value=false;activeIndex.value=0;termsActivity.value=null;if(resetBanners){imageRefresh.value++;loadedBanners.value.clear();}}
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
function homeRemaining(activity:PublicPromotion) {
  // Use the published clock, refreshed with each offer read, rather than the device timezone.
  const remaining=Date.parse(activity.endsAt)-Date.parse(activity.serverTime);
  if(!Number.isFinite(remaining)||remaining<=0)return t.value.promotion.ended;
  return remaining<86400000?t.value.promotion.endsToday:fmt(t.value.promotion.daysRemaining,{n:Math.ceil(remaining/86400000)});
}
function cycleOffer(delta:number){if(items.value.length)activeIndex.value=(activeIndex.value+delta+items.value.length)%items.value.length;}
const termsRules=computed(()=>termsActivity.value?rewardSummaries(termsActivity.value):[]);
const termsText=computed(()=>termsActivity.value?[localized(termsActivity.value.terms,locale.code),t.value.promotion.deadline+' · '+displayDeadline(termsActivity.value.endsAt,locale.code)].join('\n\n'):'');
async function load(reset:boolean,preserveImages=false){
  if(!visible)return;
  if(!reset&&(status.value==='loading'||!hasMore.value)) return;
  if(props.activities===undefined&&pendingTicket!==null&&fence.current(pendingTicket))return;
  if(reset&&!preserveImages){imageRefresh.value++;loadedBanners.value.clear();termsActivity.value=null;}
  // Join a shared read already in flight; otherwise explicitly revalidate the catalog.
  const catalogRead=reset&&remoteApiEnabled&&sessionVault.read()
    ?preserveImages?revalidateProductCatalog():refreshProductCatalog(productCatalogState.status!=='loading'):Promise.resolve();
  if(props.activities!==undefined){fence.invalidate();items.value=props.activities.filter(isPromotionActive);listRead.value=true;cursor.value=null;hasMore.value=false;activeIndex.value=Math.min(activeIndex.value,Math.max(0,items.value.length-1));status.value='ready';await catalogRead;return;}
  const ticket=fence.next(),identity=`${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`;
  pendingTicket=ticket;
  status.value='loading';
  if(!remoteApiEnabled){clear();status.value=props.mode==='home'?'ready':'error';return;}
  try{
    const read=props.mode==='home'&&reset?readHomePromotions(identity,!!sessionVault.read(),!preserveImages)
      :promotionApi.list({limit:20,cursor:reset?null:cursor.value,...(props.mode==='home'?{placement:'home.purchase-promotion' as const}:{})},!!sessionVault.read());
    const [page]=await Promise.all([read,catalogRead]);
    if(!fence.current(ticket)||identity!==`${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`)return;
    const rows=reset?[]:items.value;
    items.value=[...new Map([...rows,...page.items.filter(isPromotionActive)].map(item=>[item.activityId,item])).values()];
    activeIndex.value=Math.min(activeIndex.value,Math.max(0,items.value.length-1));
    cursor.value=page.nextCursor;hasMore.value=page.hasMore;status.value='ready';
    listRead.value=true;
  }catch(cause){if(fence.current(ticket)&&identity===`${app.accountKey}:${app.accountBindingEpoch}:${locale.code}`){
    if(cause instanceof Error && 'status' in cause && (cause.status===401||cause.status===403))clear();
    status.value='error';
  }}finally{if(pendingTicket===ticket)pendingTicket=null;}
}
async function move(delta:number){
  const next=activeIndex.value+delta;if(next<0)return;
  if(next>=items.value.length&&hasMore.value)await load(false);
  if(next<items.value.length)activeIndex.value=next;
}
watch([()=>app.accountKey,()=>app.accountBindingEpoch,()=>locale.code],()=>{
  fence.invalidate();clear();status.value='idle';
  if(visible)void load(true);
},{flush:'sync'});
watch(()=>props.activities,(next,previous)=>{if(visible&&(next!==undefined||previous!==undefined))void load(true,true);},{immediate:true});
watch(()=>theme.resolved,()=>{imageRefresh.value++;loadedBanners.value.clear();});
onMounted(()=>{void load(true,true);});onShow(()=>{visible=true;void load(true,true);});
onHide(()=>{visible=false;termsActivity.value=null;});
onBeforeUnmount(()=>{visible=false;fence.invalidate();clear();});
</script>
<style src="./promotion.css"></style>
<style scoped>
.promotion-entry { display: flex; flex-direction: column; gap: var(--ui-space-inset); }
.promotion-entry-home { gap: 0; }
.entry-placeholder { min-height:146px;box-sizing:border-box;padding:20px;border-radius:24px;background:var(--v5-surface);border:1px solid var(--v5-border); }
.entry-placeholder > view { width:70%;height:18px;border-radius:8px;background:var(--v5-surface-2); }
.entry-placeholder > view + view { width:50%;height:30px;margin-top:18px; }
.entry-retry { width: auto; }
.entry-status { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ui-space-row-y); padding: var(--ui-space-inline) 0; }
.entry-status.nx-inline-recovery { display:grid; align-items:center; gap:12px; }
.entry-status.nx-inline-recovery .promotion-title { text-wrap: balance; }
.entry-advert,.entry-event { position: relative; overflow: hidden; border: 1px solid var(--v5-border); border-radius: 24px; background: linear-gradient(140deg,var(--ui-spotlight-top),var(--ui-ticket-bottom)); }
.entry-advert { min-height: 146px; border: 0; background: radial-gradient(70% 90% at 82% 72%,rgba(158,220,29,.24),transparent 62%),radial-gradient(50% 70% at 100% 0%,rgba(255,255,255,.08),transparent 60%),linear-gradient(135deg,#171717,#101010); box-shadow: inset 0 0 0 1px rgba(255,255,255,.07); }
.entry-advert[data-color-scheme="light"] { --promotion-copy-ink: var(--v5-ink); background: radial-gradient(70% 90% at 82% 72%,color-mix(in srgb,var(--v5-brand) 12%,transparent),transparent 64%),linear-gradient(135deg,var(--ui-spotlight-top),var(--ui-ticket-bottom)); box-shadow: inset 0 0 0 1px var(--v5-border); }
.entry-advert[data-color-scheme="light"]::before { background-image: radial-gradient(circle,color-mix(in srgb,var(--v5-brand) 12%,transparent) 1px,transparent 1px); }
.entry-advert[data-color-scheme="light"] .entry-label { color: var(--v5-brand); }
.entry-advert[data-color-scheme="light"] .entry-home-deadline { color: var(--v5-ink-3); }
.entry-advert[data-color-scheme="light"] .entry-product-art::before { background: radial-gradient(ellipse,color-mix(in srgb,var(--v5-brand) 22%,transparent),transparent 70%); }
.entry-advert::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle,rgba(255,255,255,.07) 1px,transparent 1px) 0 0/14px 14px; mask-image: linear-gradient(90deg,transparent 30%,#000 75%); pointer-events: none; }
.entry-advert-target { position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
.entry-advert-target:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -3px; }
.entry-artwork { position: absolute; inset: 0; width: 100%; height: 100%; }
.entry-advert .entry-copy { position: relative; display: flex; flex-direction: column; padding: 18px 18px 16px; min-height: 146px; box-sizing: border-box; color: var(--promotion-copy-ink, #f5f7fa); }
.entry-advert:has(.entry-product-art) .entry-copy { padding-right: 148px; }
.entry-label,.entry-eyebrow { display: block; color: var(--v5-brand); font: 500 12px/1.5 var(--font-v5); }
.entry-title { display: block; margin-top: 7px; font: 600 23px/1.3 var(--font-v5); overflow-wrap: anywhere; }
.entry-advert .entry-label { font-size: 12.5px; color: #c8f25a; }
.entry-advert .entry-title { margin-top: 6px; font-size: 19px; line-height: 25px; }
.entry-advert .promotion-copy { color: var(--v5-ink-2); font-size: 12px; line-height: 1.5; }
.entry-copy,.entry-event-copy { min-width: 0; }
.entry-benefit { display: block; margin-top: 5px; color: var(--v5-ink-2); font: 500 14px/1.5 var(--font-v5); overflow-wrap: anywhere; }
.entry-advert .entry-benefit { margin-top: 0; color: inherit; font: 600 19px/25px var(--font-v5); }
.entry-advert.entry-kind-gift .entry-title { color: var(--v5-ink-2); font: 500 var(--ui-type-body)/var(--ui-type-body-lh) var(--font-v5); }
.entry-advert.entry-kind-gift .entry-benefit { margin-top: 4px; color: var(--v5-brand); font: 600 var(--ui-type-profile)/var(--ui-type-profile-lh) var(--font-v5); }
.entry-home-deadline { position: relative; z-index: 2; align-self: flex-start; margin-top: auto; padding: 13px 0; margin-bottom: -13px; color: #9aa2b2; font: 400 12px/18px var(--font-v5); white-space: nowrap; }
.entry-home-deadline:focus-visible { outline: 2px solid var(--v5-brand); }
.entry-remaining { position: absolute; top: 12px; right: 16px; z-index: 2; pointer-events: none; color: var(--v5-warning-ink); font: 500 11px/18px var(--font-v5); white-space: nowrap; }
.entry-advert--banner .entry-remaining { padding:2px 7px;border-radius:6px;background:var(--v5-surface); }
.entry-advert--banner .entry-home-deadline { padding-inline:8px;border-radius:8px;background:var(--v5-surface);color:var(--v5-ink-2); }
.entry-product-art { position: absolute; right: 0; width: 160px; inset-block: 0; pointer-events: none; }
.entry-product-art::before { content: ''; position: absolute; right: 18px; bottom: 16px; width: 120px; height: 20px; background: radial-gradient(ellipse,rgba(200,242,90,.4),transparent 70%); }
.entry-main-image { position: absolute; right: 34px; top: 30px; width: 108px; height: 108px; animation: promotion-float 4.2s ease-in-out infinite; }
.entry-gift-image { position: absolute; right: 12px; bottom: 10px; width: 76px; height: 76px; animation: promotion-float 4.2s ease-in-out -1.6s infinite; }
@keyframes promotion-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
@media(prefers-reduced-motion:reduce) { .entry-main-image,.entry-gift-image { animation: none; } }
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
.entry-cta { max-width: 100%; }
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
.entry-pagination { position: relative; justify-content: center; gap: 6px; min-height: 44px; margin: -9px 0 -19px; cursor: pointer; }
.entry-page-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--v5-ink-4); }
.entry-page-dot.selected { width: 16px; background: var(--v5-brand); }
.entry-pagination:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -2px; border-radius: 12px; }
@media(max-width:374px) {
  .entry-advert:has(.entry-product-art) .entry-copy { padding-right: 105px; }
  .entry-product-art { right: 0; width: 130px; }
  .entry-main-image { right: 24px; width: 96px; height: 96px; }
  .entry-gift-image { right: 10px; width: 68px; height: 68px; }
  .entry-advert .entry-title,.entry-advert .entry-benefit { font-size: 17px; line-height: 22px; }
  .entry-home-deadline { font-size: 11px; }
  .entry-event { padding: var(--ui-space-inset); grid-template-columns: minmax(0,1fr) 104px; }
  .entry-title { font-size: 20px; }
  .entry-kind-coupon .entry-event-art { margin: -16px -16px -16px 0; }
}
</style>
