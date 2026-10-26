<template>
  <view v-if="loading || activities.length || error || hasMore" class="promotion referral-progress" data-testid="referral-progress">
    <text v-if="loading" class="promotion-copy" role="status">{{ t.promotion.loading }}</text>
    <view v-for="activity in activities" :key="activity.activityId" class="referral-activity" :data-activity-id="activity.activityId">
      <view class="referral-hero">
        <view class="referral-copy">
          <text class="referral-title">{{ localized(activity.title,locale.code) || copy.firstPurchase }}</text>
          <view class="referral-count" aria-live="polite"><text class="referral-number">{{ qualifyingCount(activity.activityId) }}</text><text class="referral-caption">{{ copy.orderUnit }}{{ locale.code === 'zh' ? '' : ' · ' }}{{ copy.firstPurchaseCount }}</text></view>
          <view class="referral-actions"><NxButton class="referral-cta referral-progress-link" variant="secondary" size="medium" :disabled="progressBusy[activity.activityId] || !auth.isAuthenticated" :aria-expanded="expandedActivity===activity.activityId" :label="copy.viewProgress" @click="showProgress(activity.activityId)"><text>{{ copy.viewProgress }}</text><text aria-hidden="true">→</text></NxButton></view>
        </view>
        <view class="referral-art" aria-hidden="true"><CatalogMachineImage class="referral-gift" v-bind="referralImageProps(activity)" /></view>
      </view>
      <view v-if="expandedActivity===activity.activityId" class="referral-details">
        <text class="referral-activity-title">{{ localized(activity.title,locale.code) }}</text>
        <text class="promotion-copy">{{ t.promotion.inviteNote }}</text>
        <text v-if="progressErrors[activity.activityId]" class="promotion-copy" role="alert">{{ t.promotion.error }}</text>
        <RewardRows v-if="progress[activity.activityId]" :rewards="progress[activity.activityId].ownRewards" />
        <NxButton class="referral-cta" size="medium" :busy="loading || progressBusy[activity.activityId]" :label="t.promotion.refresh" @click="loadActivities(true)"><text>{{ t.promotion.refresh }}</text><text aria-hidden="true">→</text></NxButton>
        <view class="referral-rule-link" role="button" tabindex="0" @click="termsActivity=activity" @keydown.enter.prevent="termsActivity=activity" @keydown.space.prevent="termsActivity=activity"><text>{{ t.promotion.rulesLink }}</text><text aria-hidden="true">›</text></view>
      </view>
    </view>
    <view v-if="error" class="referral-recovery"><text class="promotion-copy" role="alert">{{ t.promotion.error }}</text><NxButton class="referral-retry" variant="text" size="medium" :busy="loading" :label="t.promotion.retry" @click="loadActivities(true)"><text>{{ t.promotion.retry }}</text><text aria-hidden="true">→</text></NxButton></view>
    <NxButton v-if="hasMore" class="referral-cta referral-more" size="medium" :busy="loading" :label="t.promotion.more" @click="loadActivities(false)"><text>{{ t.promotion.more }}</text><text aria-hidden="true">→</text></NxButton>
    <PromotionTerms :open="!!termsActivity" :title="localized(termsActivity?.title,locale.code)" :terms="localized(termsActivity?.terms,locale.code)" :disclosures="promotionDisclosures(termsActivity)" @close="termsActivity=null" />
  </view>
</template>
<script setup lang="ts">
import{computed,ref,watch,onBeforeUnmount}from'vue';import{promotionApi,remoteApiEnabled,sessionVault}from'@/api/runtime';import type{PublicPromotion,ReferralProgress}from'@/api/promotion-contracts';import{useApp}from'@/store/app';import{useAuth}from'@/store/auth';import{useT}from'@/i18n/use-t';import{useLocaleStore}from'@/store/locale';import{localized}from'@/lib/promotion-display';import RewardRows from'./reward-rows.vue';
import { onHide,onShow } from '@/composables/use-tab-page-lifecycle';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import NxButton from '@/components/ui/nx-button.vue';
import PromotionTerms from './promotion-terms.vue';
import { isPromotionActive,promotionDisclosures } from '@/lib/promotion-entry';
import CatalogMachineImage from '@/components/catalog-machine-image.vue';
import { promotionMachineSlots } from '@/components/catalog-machine-image';
import { getProduct } from '@/mock/products';
import { productCatalogState,refreshProductCatalog } from '@/store/product-catalog';
const emit=defineEmits<{(e:'share'):void}>(),t=useT(),app=useApp(),auth=useAuth(),locale=useLocaleStore();const activities=ref<PublicPromotion[]>([]),progress=ref<Record<string,ReferralProgress>>({}),loading=ref(false),error=ref(false),hasMore=ref(false);let cursor:string|null=null,generation=0,alive=true,visible=true;
const copy=computed(()=>teamRedesignCopy(locale.code)),expandedActivity=ref<string|null>(null);
const termsActivity=ref<PublicPromotion|null>(null);
const progressBusy=ref<Record<string,boolean>>({}),progressErrors=ref<Record<string,boolean>>({});
const imageRefresh=ref<Record<string,number>>({});
function referralImageProps(activity:PublicPromotion){
  const slot=promotionMachineSlots(activity).find(item=>item.role==='purchase');
  return {sku:slot?.sku,imageUrl:auth.isAuthenticated&&productCatalogState.status==='ready'&&slot?getProduct(slot.sku)?.imageUrl:undefined,
    scopeKey:activity.activityId+':purchase',refreshKey:JSON.stringify([productCatalogState.status,productCatalogState.revision,activity.version,imageRefresh.value[activity.activityId]])};
}
function qualifyingCount(id:string){return progressBusy.value[id]||progressErrors.value[id]?'-':progress.value[id]?.qualifyingOrders??'-';}
function showProgress(id:string){if(!visible||progressBusy.value[id]||!auth.isAuthenticated)return;expandedActivity.value=expandedActivity.value===id?null:id;if(expandedActivity.value)void loadProgress(id);}
function currentRead(){const request=generation,account=app.accountKey,epoch=app.accountBindingEpoch,authenticated=auth.isAuthenticated;return()=>alive&&visible&&request===generation&&account===app.accountKey&&epoch===app.accountBindingEpoch&&authenticated===auth.isAuthenticated;}
function clearRead(preserveExpanded=true){
  generation++;activities.value=[];progress.value={};progressBusy.value={};progressErrors.value={};imageRefresh.value={};termsActivity.value=null;
  if(!preserveExpanded)expandedActivity.value=null;
  cursor=null;hasMore.value=false;error.value=false;loading.value=false;
}
async function loadActivities(reset=false){
  if(!visible||!remoteApiEnabled||(!reset&&loading.value))return;
  if(reset)clearRead();
  const current=currentRead();loading.value=true;error.value=false;
  const catalogRead=reset&&auth.isAuthenticated&&sessionVault.read()
    ?refreshProductCatalog(productCatalogState.status!=='loading'):Promise.resolve();
  try{
    const [page]=await Promise.all([promotionApi.list({cursor:reset?null:cursor,limit:20},auth.isAuthenticated),catalogRead]);if(!current())return;
    const returnedIds=new Set(page.items.map(p=>p.activityId));
    const previous=reset?[]:activities.value.filter(p=>!returnedIds.has(p.activityId));
    activities.value=[...new Map([...previous,...page.items.filter(p=>p.template==='DIRECT_REFERRAL'&&isPromotionActive(p))].map(activity=>[activity.activityId,activity])).values()];
    cursor=page.nextCursor;hasMore.value=page.hasMore;
    if(expandedActivity.value&&!activities.value.some(p=>p.activityId===expandedActivity.value)&&!hasMore.value)expandedActivity.value=null;
    const ids=new Set(activities.value.map(p=>p.activityId));
    progress.value=Object.fromEntries(Object.entries(progress.value).filter(([id])=>ids.has(id)));
    progressErrors.value=Object.fromEntries(Object.entries(progressErrors.value).filter(([id])=>ids.has(id)));
    if(auth.isAuthenticated)await Promise.all(activities.value.map(p=>loadProgress(p.activityId)));
  }catch{if(current())error.value=true;}finally{if(current())loading.value=false;}
}
async function loadProgress(id:string){
  if(!visible||!auth.isAuthenticated||!sessionVault.read()||progressBusy.value[id])return;
  const current=currentRead();progressBusy.value={...progressBusy.value,[id]:true};
  imageRefresh.value={...imageRefresh.value,[id]:(imageRefresh.value[id]??0)+1};
  try{const result=await promotionApi.referral(id);if(current()){progress.value={...progress.value,[id]:result};progressErrors.value={...progressErrors.value,[id]:false};}}
  catch{if(current())progressErrors.value={...progressErrors.value,[id]:true};}
  finally{if(current())progressBusy.value={...progressBusy.value,[id]:false};}
}
watch(()=>[app.accountKey,app.accountBindingEpoch,auth.isAuthenticated],()=>{clearRead(false);if(visible)void loadActivities(true);},{immediate:true});
onShow(()=>{visible=true;void loadActivities(true);});
onHide(()=>{visible=false;clearRead();});
onBeforeUnmount(()=>{alive=false;visible=false;generation++;});
</script>
<style src="./promotion.css"></style>
<style scoped>
.referral-progress { min-width: 0; }
.referral-activity { padding: var(--ui-space-inset); border-radius: 22px; border: 1px solid var(--v5-border); background: radial-gradient(ellipse at 86% 36%,color-mix(in srgb,var(--v5-brand) 8%,transparent),transparent 58%),linear-gradient(140deg,var(--ui-spotlight-top),var(--ui-ticket-bottom)); }
.referral-activity + .referral-activity { margin-top: var(--ui-space-inset); }
.referral-hero { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.referral-copy { position: relative; z-index: 1; flex: 1; min-width: 0; }
.referral-title { display: block; font: 600 18px/1.3 var(--font-v5); overflow-wrap: anywhere; }
.referral-count { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; margin-top: var(--ui-space-inline); }
.referral-number { color: var(--v5-brand); font: 600 36px/1 var(--font-v5); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.referral-unit { font: 500 14px/1.4 var(--font-v5); }
.referral-caption { color: var(--v5-ink-2); font: 400 14px/1.45 var(--font-v5); }
.referral-art { position: relative; flex: 0 0 144px; height: 124px; overflow: hidden; }
.referral-gift { position: absolute; inset: 0; width: 100%; height: 100%; }
.referral-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px; margin-top: var(--ui-space-inline); }
.referral-progress-link { display: inline-flex; align-items: center; gap: var(--ui-space-row-y); min-height: 44px; color: var(--v5-ink-2); font: 400 13px/1.4 var(--font-v5); cursor: pointer; }
.referral-progress-link[aria-disabled=true] { opacity: .5; }
.referral-progress-link:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.referral-cta { --v5-liquid-tint: rgba(38,38,42,.88); --v5-surface: #26262a; color: #fff; background: #26262a; box-sizing: border-box; }
.referral-details { margin-top: var(--ui-space-inset); padding-top: 16px; border-top: 1px solid var(--v5-border); }
.referral-activity-title { display: block; margin-bottom: 6px; font: 600 14px/1.5 var(--font-v5); }
.referral-details > .referral-cta { margin-top: var(--ui-space-inline); }
.referral-retry { width: 100%; }
.referral-recovery { display: flex; flex-direction: column; align-items: center; gap: var(--ui-space-inline); margin-top: var(--ui-space-inline); }
.referral-more { margin-top: var(--ui-space-inset); }
.referral-rule-link { display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;margin-top:8px;color:var(--v5-ink-3);font:400 12px/1.5 var(--font-v5); }
.referral-rule-link:focus-visible { outline:2px solid var(--v5-brand);outline-offset:2px; }
@media(max-width:350px) { .referral-art { flex-basis: 110px; height: 110px; } }
</style>
