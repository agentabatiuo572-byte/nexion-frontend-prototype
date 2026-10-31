<template>
  <text v-if="loading && listRead && !activities.length" class="referral-refresh-status" role="status" aria-live="polite">{{ t.promotion.loading }}</text>
  <view v-if="(loading && !listRead) || activities.length || error || hasMore" class="promotion referral-progress" data-testid="referral-progress">
    <text v-if="loading && !listRead && !activities.length" class="promotion-copy" role="status">{{ t.promotion.loading }}</text>
    <view v-for="activity in activities" :key="activity.activityId" class="referral-activity" :data-activity-id="activity.activityId">
      <view class="referral-meta">
        <text v-if="deadlineText(activity)" class="referral-deadline">{{ deadlineText(activity) }}</text>
        <view class="referral-rule-pill" role="button" tabindex="0" @click="termsActivity=activity" @keydown.enter.prevent="termsActivity=activity" @keydown.space.prevent="termsActivity=activity"><text>{{ t.promotion.rulesLink }}</text><text aria-hidden="true">›</text></view>
      </view>
      <view class="referral-hero">
        <view class="referral-copy">
          <text class="referral-title">{{ localized(activity.title,locale.code) || copy.firstPurchase }}</text>
          <view class="referral-count" aria-live="polite"><text class="referral-number">{{ visibility.mask(qualifyingCount(activity.activityId)) }}</text><text class="referral-caption">{{ copy.orderUnit }}{{ locale.code === 'zh' ? '' : ' · ' }}{{ copy.firstPurchaseCount }}</text></view>
        </view>
        <view class="referral-art" aria-hidden="true"><CatalogMachineImage class="referral-gift" v-bind="referralImageProps(activity)" /></view>
      </view>
      <view class="referral-actions"><NxButton class="referral-cta referral-progress-link" variant="secondary" size="medium" :disabled="progressBusy[activity.activityId] || !auth.isAuthenticated" :aria-expanded="expandedActivity===activity.activityId" :label="copy.viewProgress" @click="showProgress(activity.activityId)"><text>{{ copy.viewProgress }}</text><text aria-hidden="true">→</text></NxButton></view>
      <!-- Progress opens as a sheet; expandedActivity stays the single source of which one is open. -->
      <NxSheet :open="expandedActivity===activity.activityId" :title="localized(activity.title,locale.code) || copy.firstPurchase" @close="expandedActivity=null">
        <view class="referral-details">
          <view class="referral-summary"><text class="referral-number">{{ visibility.mask(qualifyingCount(activity.activityId)) }}</text><text class="referral-caption">{{ copy.orderUnit }}{{ locale.code === 'zh' ? '' : ' · ' }}{{ copy.firstPurchaseCount }}</text></view>
          <text class="referral-activity-title">{{ copy.rewardRecords }}</text>
          <view v-if="progressErrors[activity.activityId]" class="nx-inline-recovery"><text class="promotion-copy nx-inline-recovery__copy" role="alert">{{ t.promotion.error }}</text><NxButton class="referral-retry nx-inline-recovery__action" variant="text" size="medium" :busy="progressBusy[activity.activityId]" :label="t.promotion.retry" @click="loadProgress(activity.activityId,true)" /></view>
          <RewardRows v-else-if="progress[activity.activityId]?.ownRewards.length" :rewards="progress[activity.activityId].ownRewards" :value-mask="visibility.hidden ? visibility.mask('') : undefined" />
          <view v-else class="referral-empty" role="status">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C6 8 5 5 7 3c2-2 5 2 5 5M12 8c6 0 7-3 5-5-2-2-5 2-5 5" /></svg>
            <text>{{ !progress[activity.activityId] && progressBusy[activity.activityId] ? t.promotion.loading : copy.noRewardRecords }}</text>
          </view>
          <view class="referral-rule-link" role="button" tabindex="0" @click="termsActivity=activity" @keydown.enter.prevent="termsActivity=activity" @keydown.space.prevent="termsActivity=activity"><text>{{ t.promotion.rulesLink }}</text><text aria-hidden="true">›</text></view>
          <NxButton class="referral-share" variant="primary" :label="copy.inviteFriends" @click="emit('share')" />
        </view>
      </NxSheet>
    </view>
    <view v-if="error" class="referral-recovery nx-inline-recovery"><text class="promotion-copy nx-inline-recovery__copy" role="alert">{{ t.promotion.error }}</text><NxButton class="referral-retry nx-inline-recovery__action" variant="text" size="medium" :busy="loading" :label="t.promotion.retry" @click="loadActivities(true)"><text>{{ t.promotion.retry }}</text><text aria-hidden="true">→</text></NxButton></view>
    <NxButton v-if="hasMore" class="referral-cta referral-more" size="medium" :busy="loading" :label="t.promotion.more" @click="loadActivities(false)"><text>{{ t.promotion.more }}</text><text aria-hidden="true">→</text></NxButton>
    <PromotionTerms :open="!!termsActivity" :title="localized(termsActivity?.title,locale.code)" :terms="localized(termsActivity?.terms,locale.code)" :disclosures="promotionDisclosures(termsActivity)" @close="termsActivity=null" />
  </view>
</template>
<script setup lang="ts">
import { runPassiveTabRead, invalidatePassiveTabRead, passiveTabReadScope } from "@/lib/passive-tab-read";
import{computed,ref,watch,onBeforeUnmount}from'vue';import{promotionApi,remoteApiEnabled,sessionVault}from'@/api/runtime';import type{PublicPromotion,ReferralProgress}from'@/api/promotion-contracts';import{useApp}from'@/store/app';import{useAuth}from'@/store/auth';import{useT}from'@/i18n/use-t';import{useLocaleStore}from'@/store/locale';import{localized}from'@/lib/promotion-display';import RewardRows from'./reward-rows.vue';
import { onHide,onShow } from '@/composables/use-tab-page-lifecycle';
import { useDataVisibility } from '@/store/data-visibility';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import NxButton from '@/components/ui/nx-button.vue';
import PromotionTerms from './promotion-terms.vue';
import NxSheet from '@/components/ui/nx-sheet.vue';
import { isPromotionActive,promotionDisclosures } from '@/lib/promotion-entry';
import CatalogMachineImage from '@/components/catalog-machine-image.vue';
import { promotionMachineSlots } from '@/components/catalog-machine-image';
import { getProduct } from '@/mock/products';
import { productCatalogState,refreshProductCatalog,revalidateProductCatalog } from '@/store/product-catalog';
const emit=defineEmits<{(e:'share'):void}>(),t=useT(),app=useApp(),auth=useAuth(),locale=useLocaleStore();const activities=ref<PublicPromotion[]>([]),progress=ref<Record<string,ReferralProgress>>({}),loading=ref(false),error=ref(false),hasMore=ref(false),listRead=ref(false);let cursor:string|null=null,generation=0,alive=true,visible=true;
const visibility=useDataVisibility();
const copy=computed(()=>teamRedesignCopy(locale.code)),expandedActivity=ref<string|null>(null);
const termsActivity=ref<PublicPromotion|null>(null);
// A short end-date chip from the activity's own window.
function deadlineText(activity:PublicPromotion){const end=new Date(activity.endsAt);if(Number.isNaN(end.getTime()))return'';const m=end.getMonth()+1,d=end.getDate();return locale.code==='zh'?`${m}/${d} 截止`:locale.code==='vi'?`Hết hạn ${d}/${m}`:`Ends ${m}/${d}`;}
const progressBusy=ref<Record<string,boolean>>({}),progressErrors=ref<Record<string,boolean>>({});
const imageRefresh=ref<Record<string,number>>({});
let progressTimer:ReturnType<typeof setInterval>|undefined;
function stopProgressUpdates(){if(progressTimer!==undefined)clearInterval(progressTimer);progressTimer=undefined;}
function startProgressUpdates(){
  stopProgressUpdates();
  if(!visible||!auth.isAuthenticated||!remoteApiEnabled)return;
  progressTimer=setInterval(()=>{
    if(!visible||loading.value||(typeof document!=='undefined'&&document.hidden))return;
    for(const activity of activities.value)void loadProgress(activity.activityId);
  },30_000);
}
function referralImageProps(activity:PublicPromotion){
  const slot=promotionMachineSlots(activity).find(item=>item.role==='purchase');
  void productCatalogState.revision;
  const readable=productCatalogState.status==='ready'||(productCatalogState.status==='loading'&&productCatalogState.serverCanonical);
  return {sku:slot?.sku,imageUrl:auth.isAuthenticated&&readable&&slot?getProduct(slot.sku)?.imageUrl:undefined,
    scopeKey:activity.activityId+':purchase',refreshKey:JSON.stringify([activity.version,imageRefresh.value[activity.activityId]])};
}
function qualifyingCount(id:string){return progressErrors.value[id]?'-':progress.value[id]?.qualifyingOrders??'-';}
function showProgress(id:string){if(!visible||progressBusy.value[id]||!auth.isAuthenticated)return;expandedActivity.value=expandedActivity.value===id?null:id;if(expandedActivity.value)void loadProgress(id,true);}
function currentRead(){const request=generation,account=app.accountKey,epoch=app.accountBindingEpoch,authenticated=auth.isAuthenticated,language=locale.code,readScope=passiveTabReadScope();return()=>alive&&visible&&request===generation&&account===app.accountKey&&epoch===app.accountBindingEpoch&&authenticated===auth.isAuthenticated&&language===locale.code&&readScope===passiveTabReadScope();}
function clearRead(preserveExpanded=true){
  generation++;activities.value=[];progress.value={};progressBusy.value={};progressErrors.value={};imageRefresh.value={};termsActivity.value=null;
  if(!preserveExpanded)expandedActivity.value=null;
  cursor=null;hasMore.value=false;error.value=false;loading.value=false;listRead.value=false;
}
async function loadActivities(reset=false,passive=false){
  if(!visible||!remoteApiEnabled||(!reset&&loading.value))return;
  if(reset){generation++;progressBusy.value={};termsActivity.value=null;}
  const current=currentRead();loading.value=true;if(!passive)error.value=false;
  const catalogRead=reset&&auth.isAuthenticated&&sessionVault.read()
    ?passive?revalidateProductCatalog():refreshProductCatalog(productCatalogState.status!=='loading'):Promise.resolve();
  try{
    const query={cursor:reset?null:cursor,limit:20},authenticated=auth.isAuthenticated;
    const read=()=>promotionApi.list(query,authenticated);
    const list=passive?runPassiveTabRead('promotion-list',read,{...query,authenticated}):(invalidatePassiveTabRead('promotion-list'),read());
    const [page]=await Promise.all([list,catalogRead]);if(!current())return;
    listRead.value=true;error.value=false;
    const returnedIds=new Set(page.items.map(p=>p.activityId));
    const previous=reset?[]:activities.value.filter(p=>!returnedIds.has(p.activityId));
    activities.value=[...new Map([...previous,...page.items.filter(p=>p.template==='DIRECT_REFERRAL'&&isPromotionActive(p))].map(activity=>[activity.activityId,activity])).values()];
    cursor=page.nextCursor;hasMore.value=page.hasMore;
    if(expandedActivity.value&&!activities.value.some(p=>p.activityId===expandedActivity.value)&&!hasMore.value)expandedActivity.value=null;
    const ids=new Set(activities.value.map(p=>p.activityId));
    progress.value=Object.fromEntries(Object.entries(progress.value).filter(([id])=>ids.has(id)));
    progressErrors.value=Object.fromEntries(Object.entries(progressErrors.value).filter(([id])=>ids.has(id)));
    if(auth.isAuthenticated)await Promise.all(activities.value.map(p=>loadProgress(p.activityId,false,passive)));
  }catch{if(current())error.value=true;}finally{if(current())loading.value=false;}
}
async function loadProgress(id:string,refreshImage=false,passive=false){
  if(!visible||!auth.isAuthenticated||!sessionVault.read()||progressBusy.value[id])return;
  const current=currentRead();progressBusy.value={...progressBusy.value,[id]:true};
  if(refreshImage||progressErrors.value[id])imageRefresh.value={...imageRefresh.value,[id]:(imageRefresh.value[id]??0)+1};
  try{const read=()=>promotionApi.referral(id);const result=await(passive?runPassiveTabRead('promotion-referral',read,{id}):(invalidatePassiveTabRead('promotion-referral'),read()));if(current()){progress.value={...progress.value,[id]:result};progressErrors.value={...progressErrors.value,[id]:false};}}
  catch{if(current())progressErrors.value={...progressErrors.value,[id]:true};}
  finally{if(current())progressBusy.value={...progressBusy.value,[id]:false};}
}
const readIdentity=()=>[app.accountKey,app.accountBindingEpoch,auth.isAuthenticated,locale.code];
watch(readIdentity,()=>{clearRead(false);startProgressUpdates();},{immediate:true,flush:'sync'});
// Clear private data immediately, then read after account hydration finishes the shared scope.
watch(readIdentity,()=>{if(visible)void loadActivities(true,true);},{immediate:true});
onShow(()=>{visible=true;startProgressUpdates();void loadActivities(true,true);});
onHide(()=>{visible=false;stopProgressUpdates();generation++;progressBusy.value={};loading.value=false;termsActivity.value=null;});
onBeforeUnmount(()=>{alive=false;visible=false;stopProgressUpdates();generation++;});
</script>
<style src="./promotion.css"></style>
<style scoped>
.referral-progress { min-width: 0; }
.referral-refresh-status { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.referral-activity { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 14px; padding: var(--v5-space-5); border-radius: 28px; background: radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, var(--v5-brand-2) 11%, transparent), transparent 60%), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.referral-activity + .referral-activity { margin-top: var(--ui-space-inset); }
.referral-hero { position: relative; display: flex; align-items: center; min-height: 96px; }
.referral-meta { position: relative; z-index: 1; display: flex; align-items: center; gap: var(--v5-space-2); }
.referral-deadline { height: 24px; padding: 0 10px; display: flex; align-items: center; border-radius: 999px; font: 600 11px/1 var(--font-v5); color: var(--v5-brand-2-ink); background: color-mix(in srgb, var(--v5-brand-2) 16%, transparent); }
.referral-rule-pill { position: relative; isolation: isolate; display: flex; align-items: center; gap: 4px; min-height: 44px; margin-block: -8px; padding: 0 10px; color: var(--v5-ink-2); font: 600 12px/16px var(--font-v5); }
.referral-rule-pill::before { content: ""; position: absolute; inset: 8px 0; z-index: -1; border-radius: 999px; background: color-mix(in srgb, var(--v5-ink) 6%, transparent); }
.referral-rule-pill:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.referral-copy { position: relative; z-index: 1; flex: 1; min-width: 0; }
.referral-title { display: block; max-width: 60%; font: 600 17px/24px var(--font-v5); overflow-wrap: anywhere; }
.referral-count { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; margin-top: var(--v5-space-1); }
.referral-number { color: var(--v5-brand-2-ink); font: 600 40px/44px var(--font-metric); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.referral-unit { font: 500 14px/1.4 var(--font-v5); }
.referral-caption { color: var(--v5-ink-2); font: 400 13px/18px var(--font-v5); }
.referral-art { position: absolute; top: -40px; right: -16px; width: 150px; height: 150px; pointer-events: none; }
.referral-gift { position: absolute; inset: 0; width: 100%; height: 100%; }
.referral-actions { display: flex; }
.referral-actions > .referral-progress-link { flex: 1; }
.referral-progress-link { max-width: 100%; }
.referral-details { display: flex; flex-direction: column; gap: var(--v5-space-2); }
.referral-summary { display: flex; align-items: baseline; gap: 6px; padding: var(--v5-space-4); border-radius: 20px; background: radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, var(--v5-brand-2) 12%, transparent), transparent 60%), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.referral-share { margin-top: var(--v5-space-2); }
.referral-activity-title { display: block; margin-top: var(--v5-space-2); font: 600 14px/20px var(--font-v5); }
.referral-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 0 12px; color: var(--v5-ink-3); font-size: var(--ui-type-list-subtitle); }
.referral-details > .referral-cta { margin-top: var(--ui-space-inline); }
.referral-retry { width: auto; }
.referral-recovery { margin-top: var(--ui-space-inline); }
.referral-more { margin-top: var(--ui-space-inset); }
.referral-rule-link { display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;margin-top:8px;color:var(--v5-ink-3);font:400 12px/1.5 var(--font-v5); }
.referral-rule-link:focus-visible { outline:2px solid var(--v5-brand);outline-offset:2px; }
@media(max-width:350px) { .referral-art { flex-basis: 110px; height: 110px; } }
</style>
