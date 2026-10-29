<template>
  <view class="invite-card">
    <view class="invite-card__header">
      <text class="invite-card__title">{{ copy.inviteFriends }}</text>
      <view class="invite-card__header-actions">
      <view v-if="needsRetry" class="invite-card__history invite-card__retry" role="button" tabindex="0" :aria-label="t.network.retry" @click="rewards.refresh()" @keydown.enter.prevent="rewards.refresh()" @keydown.space.prevent="rewards.refresh()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M5.5 7a8 8 0 0 1 13-1L20 9M4 15l1.5 3a8 8 0 0 0 13-1"/></svg></view>
      <view v-else class="invite-card__history" role="button" tabindex="0" :aria-label="copy.rewards" @click="detailMode='records'; detailOpen=true" @keydown.enter.prevent="detailMode='records'; detailOpen=true" @keydown.space.prevent="detailMode='records'; detailOpen=true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/></svg><text>{{ copy.rewards }}</text></view>
      <view class="invite-card__rules" role="button" tabindex="0" @click="detailMode='rules'; detailOpen=true" @keydown.enter.prevent="detailMode='rules'; detailOpen=true" @keydown.space.prevent="detailMode='rules'; detailOpen=true"><text>{{ copy.rules }}</text><text aria-hidden="true">›</text></view>
      </view>
    </view>
    <view class="nx-invite-body">
      <view class="invite-card__reward" role="status" :aria-busy="rewards.loading">
        <view class="invite-card__reward-line"><text class="invite-card__amount">{{ rewardPresentationText }}</text><text class="invite-card__unit">UVT</text></view>
        <!-- Reserve the normal localized caption while loading. Only the
             active exceptional state may add height to this compact card. -->
        <view class="invite-card__descriptions">
          <text class="invite-card__description" :class="{ 'is-active': rewardCaption === 'qualified' }" :aria-hidden="rewardCaption !== 'qualified'">{{ copy.qualifiedFriendReward }}</text>
          <view class="invite-card__description" :class="{ 'is-active': rewardCaption === 'disabled' }" :aria-hidden="rewardCaption !== 'disabled'"><text>{{ t.team.referralRewardsDisabled }}</text><text>{{ t.team.sharingStillAvailable }}</text></view>
          <text class="invite-card__description" :class="{ 'is-active': rewardCaption === 'error' }" :aria-hidden="rewardCaption !== 'error'">{{ t.team.settlementUnavailable }}</text>
          <text class="invite-card__description" :class="{ 'is-active': rewardCaption === 'unavailable' }" :aria-hidden="rewardCaption !== 'unavailable'">{{ t.share.linkUnavailable }}</text>
        </view>
        <view class="invite-card__action invite-card__primary nx-team-share-now nx-frosted-button" role="button" :tabindex="referralCode ? 0 : -1" :aria-disabled="!referralCode" :aria-label="copy.inviteFriends" @click="openShare" @keydown.enter.prevent="openShare" @keydown.space.prevent="openShare"><text>{{ copy.inviteFriends }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-7-7 7 7-7 7" /></svg></view>
      </view>
      <view class="invite-card__art"><TeamArt kind="invite" :size="128" /></view>
      <view class="invite-card__actions nx-invite-actions">
        <view class="invite-card__action nx-team-share-poster" role="button" :tabindex="referralCode ? 0 : -1" :aria-disabled="!referralCode" :aria-label="t.team.inviteSharePoster" @click="openPoster" @keydown.enter.prevent="openPoster" @keydown.space.prevent="openPoster"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m4 17 5-6 4 4 3-3 5 6"/></svg><text>{{ t.team.inviteSharePoster }}</text></view>
        <view class="invite-card__action nx-team-copy-code" role="button" :tabindex="referralCode ? 0 : -1" :aria-disabled="!referralCode" :aria-label="t.team.inviteShareCode" @click="copyCode" @keydown.enter.prevent="copyCode" @keydown.space.prevent="copyCode"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 15h3v3h3v3M15 21v-3"/></svg><text>{{ copiedCode ? t.team.copied : t.team.inviteShareCode }}</text></view>
        <view class="invite-card__action nx-team-copy-link" role="button" :tabindex="referralCode ? 0 : -1" :aria-disabled="!referralCode" :aria-label="t.team.inviteShareLink" @click="copyLink" @keydown.enter.prevent="copyLink" @keydown.space.prevent="copyLink"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/></svg><text>{{ copiedLink ? t.team.copied : t.team.inviteShareLink }}</text></view>
      </view>
    </view>
  </view>
  <SharePosterSheet :open="posterOpen" @close="posterOpen=false" />
  <ShareChannelSheet :open="shareOpen" @close="shareOpen=false" @open-poster="shareOpen=false; posterOpen=true" />
  <InviteDetailSheet :open="detailOpen" :mode="detailMode" @close="detailOpen=false" />
</template>
<script setup lang="ts">
import { formatAmount } from '@/lib/amount-display';
import { ref, computed, onUnmounted, watch } from 'vue';
import { onShow, onHide } from '@/composables/use-tab-page-lifecycle';
import ShareChannelSheet from './share-channel-sheet.vue';
import SharePosterSheet from './share-poster-sheet.vue';
import InviteDetailSheet from './invite-detail-sheet.vue';
import TeamArt from './team-art.vue';
import { useApp } from '@/store/app';
import { useReferralReward } from '@/store/referral-reward';
import { useLocaleStore } from '@/store/locale';
import { useT } from '@/i18n/use-t';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { toast } from '@/store/ui';
import { buildShareLink, copyText } from '@/lib/share';
import { apiRuntimeConfig, remoteApiEnabled } from '@/api/runtime';
import { productCatalogState, productCatalogDisplayProof, isProductCatalogDisplayCurrent } from '@/store/product-catalog';
import { subscribeRuntimeRevision } from '@/api/order-api';
const t=useT(), app=useApp(), rewards=useReferralReward(), locale=useLocaleStore();
const copy=computed(()=>teamRedesignCopy(locale.code));
const rewardPresentation=ref<number|null>(null);
const rewardRead=ref<'enabled'|'disabled'|null>(null);
const displayEnvironmentInvalidated=ref(false);
watch(()=>[apiRuntimeConfig.environment,apiRuntimeConfig.baseUrl],()=>{displayEnvironmentInvalidated.value=true;},{flush:'sync'});
const displayCatalogValid=computed(()=>!displayEnvironmentInvalidated.value && productCatalogDisplayProof.value!==null && isProductCatalogDisplayCurrent()
  && (productCatalogState.status==='error'||productCatalogState.status==='loading'||(productCatalogState.serverCanonical && productCatalogState.sourceEnvironment==='PRODUCTION' && productCatalogState.runId==='')));
watch(()=>[app.accountKey,app.accountBindingEpoch,apiRuntimeConfig.environment,apiRuntimeConfig.baseUrl,locale.code],()=>{rewardPresentation.value=null;rewardRead.value=null;},{flush:'sync'});
watch(()=>locale.code,()=>rewards.invalidateReadOwner(),{flush:'sync'});
watch(displayCatalogValid,valid=>{if(!valid){rewardPresentation.value=null;rewardRead.value=null;}},{flush:'sync'});
watch([()=>rewards.snapshot,()=>rewards.snapshot?.inviterRewardNex,()=>rewards.snapshot?.rewardEnabled,()=>rewards.loading,()=>rewards.error,()=>rewards.transientFailure],()=>{
  if(rewards.snapshot?.rewardEnabled===false){rewardPresentation.value=null;rewardRead.value='disabled';}
  if(rewards.error){if(!rewards.transientFailure)rewardPresentation.value=null;return;}
  const snapshot=rewards.snapshot;
  if(!displayCatalogValid.value||rewards.loading||!snapshot)return;
  rewardRead.value=snapshot.sourceEnvironment==='PRODUCTION' && snapshot.source==='ledger' && (snapshot.runId===null || snapshot.runId==='')
    && Number.isFinite(snapshot.inviterRewardNex) && snapshot.inviterRewardNex>=0 ? snapshot.rewardEnabled ? 'enabled' : 'disabled' : null;
  rewardPresentation.value=rewardRead.value==='enabled' ? snapshot.inviterRewardNex : null;
},{immediate:true,flush:'sync'});
const rewardPresentationText=computed(()=>rewardPresentation.value===null||(rewards.error&&!rewards.transientFailure)?'—':formatAmount(rewardPresentation.value).replace(/\.00$/,''));
const detailOpen=ref(false), detailMode=ref<'rules'|'records'>('rules');
const rewardReady=computed(()=>!!rewards.snapshot && !rewards.error && !rewards.loading);
const rewardEnabled=computed(()=>rewards.snapshot?.rewardEnabled===true);
const nexReward=computed(()=>rewards.snapshot?.inviterRewardNex ?? 0);
const rewardAmount=computed(()=>formatAmount(nexReward.value).replace(/\.00$/, ''));
const referralCode=computed(()=>remoteApiEnabled ? !rewards.loading && !rewards.error ? rewards.snapshot?.referralCode ?? '' : '' : app.user.referralCode);
const rewardCaption=computed(()=>rewards.error ? 'error' : !rewards.loading && rewards.snapshot && !referralCode.value ? 'unavailable'
  : rewardRead.value==='disabled' ? 'disabled' : 'qualified');
const needsRetry=computed(()=>!rewards.loading && (!!rewards.error || !referralCode.value));
const copiedCode = ref(false);
const copiedLink = ref(false);
const posterOpen = ref(false);
const shareOpen = ref(false);

// FEAT-SHARE1:码为空四入口仍拒绝操作，不产出空码链接。
function guardCode(): boolean {
  if (referralCode.value) return true;
  toast.info(t.value.share.noCodeYet);
  return false;
}
function guardLink(): string {
  const link = buildShareLink(referralCode.value);
  // Missing link data belongs in the recoverable sheet. The confirmed code
  // remains useful there even while platform configuration is unavailable.
  if (!link) shareOpen.value = true;
  return link;
}

async function copyCode() {
  if (!guardCode()) return;
  const ok = await copyText(referralCode.value);
  if (!ok) {
    // 异常3:剪贴板失败禁误报成功态。
    toast.info(t.value.share.copyFailed);
    return;
  }
  copiedCode.value = true;
  // BUG 171:按钮的 :aria-label 是静态名称,只把按钮文字换成「已复制!」读屏不播报
  // (名称来自 aria-label,文字变化被盖住)。可感知反馈走 toast —— 宿主 .nx-toast-host
  // 是 role=status + aria-live=polite,与 share-poster-sheet 的复制反馈同源。
  toast.success(t.value.team.inviteCodeCopied);
  // 🔴 复制邀请码**不是分享**(zentao #199)。
  //   此前这里上报 channel="code" 的分享事件,服务端据此消费 invite_friend 任务;
  //   任务校验一旦失败,用户会在「邀请码已复制」之后又看到「分享已发出,但服务端暂时
  //   无法验证任务,未发放奖励」—— 他并没有分享任何东西。复制与分享的埋点必须隔离:
  //   只有真正把内容发到某个渠道(见 lib/share.ts 的 activateChannel)才算分享。
  setTimeout(() => (copiedCode.value = false), 1500);
}
async function copyLink() {
  if (!guardCode()) return;
  const link = guardLink();
  if (!link) return;
  const ok = await copyText(link);
  if (!ok) {
    toast.info(t.value.share.copyFailed);
    return;
  }
  copiedLink.value = true;
  toast.success(t.value.team.inviteLinkCopied);
  // 同上:复制链接只是把文本放进剪贴板,不构成分享事件。
  setTimeout(() => (copiedLink.value = false), 1500);
}
function openPoster() {
  if (!guardCode()) return;
  if (!guardLink()) return;
  posterOpen.value = true;
}
function openShare() {
  if (!guardCode()) return;
  shareOpen.value = true;
}
defineExpose({ openShare });


let visible = false;
onShow(()=>{visible = true; void rewards.ensure();});
onHide(()=>{visible = false;});
const stopRuntimeRefresh=subscribeRuntimeRevision(scope=>{
  if(!isProductCatalogDisplayCurrent(scope)){rewardPresentation.value=null;rewardRead.value=null;}
  if(remoteApiEnabled && visible)void rewards.ensure();
});
onUnmounted(stopRuntimeRefresh);
</script>
<style scoped>
.invite-card { position: relative; padding: 12px var(--ui-space-inset) 8px; border: 1px solid var(--v5-border); border-radius: 22px; background: radial-gradient(ellipse at 86% 58%,color-mix(in srgb,var(--v5-brand) 9%,transparent),transparent 64%),var(--v5-surface); color: var(--v5-ink); }
.invite-card__header { display: flex; flex-wrap: wrap; align-items: center; min-height: 44px; gap: 4px var(--ui-space-inline); }
.invite-card__title { flex: 1 1 auto; min-width: 0; font: 600 18px/1.35 var(--font-v5); overflow-wrap: anywhere; }
.invite-card__header-actions { display: flex; align-items: center; flex: 0 0 auto; gap: 8px; margin-inline-start: auto; }
.invite-card__history { display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 44px; min-height: 44px; color: var(--v5-ink-3); font: 400 12px/1.4 var(--font-v5); cursor: pointer; }
.invite-card__history svg { flex: 0 0 18px; }
.invite-card__rules { display: flex; align-items: center; justify-content: center; gap: 7px; min-width: 44px; min-height: 44px; color: var(--v5-ink-3); font-size: 12px; }
.nx-invite-body { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); column-gap: 2px; padding-top: 0; }
.invite-card__reward { min-width: 0; position: relative; z-index: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.invite-card__reward-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 6px; max-width: 100%; }
.invite-card__amount { font: 600 clamp(32px,10.25vw,40px)/1.1 var(--font-amount); letter-spacing: -.035em; font-variant-numeric: tabular-nums; color: var(--v5-brand); }
.invite-card__unit { font: 500 21px/1.2 var(--font-v5); }
.invite-card__descriptions { display: grid; align-self: stretch; min-height: 18px; }
.invite-card__description { grid-area: 1 / 1; display: none; visibility: hidden; font: 400 12px/1.5 var(--font-v5); color: var(--v5-ink-3); overflow-wrap: anywhere; }
.invite-card__description:first-child { display: block; }
.invite-card__description.is-active { display: block; visibility: visible; }
.invite-card__description > text { display: block; }
.invite-card__art { position: relative; display: flex; align-items: center; justify-content: center; min-width: 0; pointer-events: none; }
.invite-card__art :deep(.team-art) { position: relative; z-index: 1; width: 100%; height: auto; aspect-ratio: 4 / 3; transform: translateY(-14px) scale(1.08); }
.invite-card__action { position: relative; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 7px; font: 500 12px/1.4 var(--font-v5); color: var(--v5-ink-2); cursor: pointer; }
.invite-card__primary { isolation: isolate; align-self: flex-start; width: max-content; min-width: min(128px,100%); max-width: 100%; gap: 8px; padding: 8px 10px; box-sizing: border-box; border-radius: 999px; margin-top: 2px; font-size: var(--ui-type-list-subtitle); color: var(--v5-ink); }
.invite-card__primary > text,.invite-card__primary > svg { position: relative; z-index: 1; }
.invite-card__primary > text { text-align: center; min-width: 0; overflow-wrap: anywhere; }
.invite-card__primary > svg { flex: 0 0 auto; }
.invite-card__actions { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 2px 6px; margin-top: 6px; border-top: 1px solid var(--v5-border); }
.invite-card__actions > .invite-card__action + .invite-card__action::before { content: ''; position: absolute; left: -3px; top: 12px; bottom: 12px; width: 1px; background: var(--v5-border); }

.invite-card__action[aria-disabled='true'] { cursor: default; }
.invite-card [tabindex='0']:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.invite-card__action:active,.invite-card__rules:active,.invite-card__history:active { opacity: .75; }
.invite-card__actions svg { color: var(--v5-brand); }
</style>
