<template>
  <view v-if="loading || activities.length || error || hasMore" class="promotion referral-progress" data-testid="referral-progress">
    <text v-if="loading" class="promotion-copy" role="status">{{ t.promotion.loading }}</text>
    <view v-for="activity in activities" :key="activity.activityId" class="referral-activity" :data-activity-id="activity.activityId">
      <view class="referral-hero">
        <view class="referral-copy">
          <text class="referral-title">{{ copy.firstPurchase }}</text>
          <view class="referral-count" aria-live="polite"><text class="referral-number">{{ qualifyingCount(activity.activityId) }}</text><text class="referral-unit">{{ copy.orderUnit }}</text></view>
          <text class="referral-caption">{{ copy.firstPurchaseCount }}</text>
        </view>
        <view class="referral-art"><TeamArt kind="gift" :size="144" /></view>
      </view>
      <view class="referral-actions">
        <view class="referral-progress-link" role="button" :tabindex="loading || !auth.isAuthenticated ? -1 : 0" :aria-disabled="loading || !auth.isAuthenticated" :aria-expanded="expandedActivity===activity.activityId" @click="showProgress(activity.activityId)" @keydown.enter.prevent="showProgress(activity.activityId)" @keydown.space.prevent="showProgress(activity.activityId)"><text>{{ copy.viewProgress }}</text><text aria-hidden="true">›</text></view>
        <NxButton class="referral-cta" size="medium" :label="t.promotion.existingInvite" @click="emit('share')"><text>{{ copy.inviteFriends }}</text><text aria-hidden="true">→</text></NxButton>
      </view>
      <view v-if="expandedActivity===activity.activityId" class="referral-details">
        <text class="referral-activity-title">{{ localized(activity.title,locale.code) }}</text>
        <text class="promotion-copy">{{ t.promotion.inviteNote }}</text>
        <RewardRows v-if="progress[activity.activityId]" :rewards="progress[activity.activityId].ownRewards" />
        <NxButton class="referral-cta" size="medium" :busy="loading" :label="t.promotion.refresh" @click="loadProgress(activity.activityId)"><text>{{ t.promotion.refresh }}</text><text aria-hidden="true">→</text></NxButton>
      </view>
    </view>
    <view v-if="error" class="referral-recovery"><text class="promotion-copy" role="alert">{{ t.promotion.error }}</text><NxButton class="referral-cta" size="medium" :busy="loading" :label="t.promotion.retry" @click="loadActivities"><text>{{ t.promotion.retry }}</text><text aria-hidden="true">→</text></NxButton></view>
    <NxButton v-if="hasMore" class="referral-cta referral-more" size="medium" :busy="loading" :label="t.promotion.more" @click="loadActivities"><text>{{ t.promotion.more }}</text><text aria-hidden="true">→</text></NxButton>
  </view>
</template>
<script setup lang="ts">
import{computed,ref,watch,onBeforeUnmount}from'vue';import{promotionApi,remoteApiEnabled}from'@/api/runtime';import type{PublicPromotion,ReferralProgress}from'@/api/promotion-contracts';import{useApp}from'@/store/app';import{useAuth}from'@/store/auth';import{useT}from'@/i18n/use-t';import{useLocaleStore}from'@/store/locale';import{localized}from'@/lib/promotion-display';import RewardRows from'./reward-rows.vue';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import TeamArt from '@/components/team/team-art.vue';
import NxButton from '@/components/ui/nx-button.vue';
const emit=defineEmits<{(e:'share'):void}>(),t=useT(),app=useApp(),auth=useAuth(),locale=useLocaleStore();const activities=ref<PublicPromotion[]>([]),progress=ref<Record<string,ReferralProgress>>({}),loading=ref(false),error=ref(false),hasMore=ref(false);let cursor:string|null=null,generation=0,alive=true;
const copy=computed(()=>teamRedesignCopy(locale.code)),expandedActivity=ref<string|null>(null);
function qualifyingCount(id:string){return loading.value||error.value?'-':progress.value[id]?.qualifyingOrders??'-';}
function showProgress(id:string){if(loading.value||!auth.isAuthenticated)return;expandedActivity.value=expandedActivity.value===id?null:id;if(expandedActivity.value)void loadProgress(id);}
async function loadActivities(){if(!remoteApiEnabled||loading.value)return;const request=generation,account=app.accountKey,epoch=app.accountBindingEpoch;const current=()=>alive&&generation===request&&account===app.accountKey&&epoch===app.accountBindingEpoch;loading.value=true;error.value=false;try{const page=await promotionApi.list({cursor,limit:20},auth.isAuthenticated);if(!current())return;activities.value=[...new Map([...activities.value,...page.items.filter(p=>p.template==='DIRECT_REFERRAL')].map(activity=>[activity.activityId,activity])).values()];cursor=page.nextCursor;hasMore.value=page.hasMore;if(auth.isAuthenticated)for(const p of activities.value){if(!current())break;const result=await promotionApi.referral(p.activityId);if(current())progress.value={...progress.value,[p.activityId]:result};}}catch{if(current())error.value=true;}finally{if(current())loading.value=false;}}
async function loadProgress(id:string){if(!auth.isAuthenticated||loading.value)return;const request=generation,account=app.accountKey,epoch=app.accountBindingEpoch;const current=()=>alive&&request===generation&&account===app.accountKey&&epoch===app.accountBindingEpoch;loading.value=true;error.value=false;try{const result=await promotionApi.referral(id);if(current())progress.value={...progress.value,[id]:result};}catch{if(current())error.value=true;}finally{if(current())loading.value=false;}}
watch(()=>[app.accountKey,app.accountBindingEpoch],()=>{generation++;activities.value=[];progress.value={};expandedActivity.value=null;cursor=null;hasMore.value=false;error.value=false;loading.value=false;void loadActivities();},{immediate:true});onBeforeUnmount(()=>{alive=false;generation++;});
</script>
<style src="./promotion.css"></style>
<style scoped>
.referral-progress { min-width: 0; }
.referral-activity { padding: var(--ui-space-section); border-radius: 24px; border: 1px solid var(--v5-border); background: radial-gradient(ellipse at 86% 36%,color-mix(in srgb,var(--v5-brand) 8%,transparent),transparent 58%),linear-gradient(140deg,var(--ui-spotlight-top),var(--ui-ticket-bottom)); }
.referral-activity + .referral-activity { margin-top: var(--ui-space-inset); }
.referral-hero { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.referral-copy { position: relative; z-index: 1; flex: 1; min-width: 0; }
.referral-title { display: block; font: 600 22px/1.3 var(--font-v5); overflow-wrap: anywhere; }
.referral-count { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; margin-top: 18px; }
.referral-number { color: var(--v5-brand); font: 600 46px/1 var(--font-v5); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.referral-unit { font: 500 14px/1.4 var(--font-v5); }
.referral-caption { display: block; margin-top: 8px; color: var(--v5-ink-3); font: 400 12px/1.5 var(--font-v5); }
.referral-art { flex: 0 0 128px; display: flex; justify-content: center; }
.referral-art :deep(.team-art) { max-width: none; }
.referral-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 12px; margin-top: var(--ui-space-inline); }
.referral-progress-link { display: inline-flex; align-items: center; gap: var(--ui-space-row-y); min-height: 44px; color: var(--v5-ink-2); font: 400 13px/1.4 var(--font-v5); cursor: pointer; }
.referral-progress-link[aria-disabled=true] { opacity: .5; }
.referral-progress-link:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.referral-cta { --v5-liquid-tint: rgba(38,38,42,.88); --v5-surface: #26262a; color: #fff; background: #26262a; box-sizing: border-box; }
.referral-details { margin-top: var(--ui-space-inset); padding-top: 16px; border-top: 1px solid var(--v5-border); }
.referral-activity-title { display: block; margin-bottom: 6px; font: 600 14px/1.5 var(--font-v5); }
.referral-details > .referral-cta { margin-top: var(--ui-space-inline); }
.referral-recovery { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-inline); margin-top: var(--ui-space-inline); }
.referral-more { margin-top: var(--ui-space-inset); }
@media(max-width:350px) { .referral-activity { padding: var(--ui-space-inset); } .referral-title { font-size: 20px; } .referral-art { flex-basis: 104px; } .referral-number { font-size: 40px; } }
</style>
