<template>
  <view class="invite-card">
    <view class="invite-card__header">
      <text class="invite-card__title">{{ copy.inviteFriends }}</text>
      <view class="invite-card__rules" role="button" tabindex="0" @click="detailMode='rules'; detailOpen=true" @keydown.enter.prevent="detailMode='rules'; detailOpen=true" @keydown.space.prevent="detailMode='rules'; detailOpen=true"><text>{{ copy.rules }}</text><text aria-hidden="true">›</text></view>
    </view>
    <view v-if="referralCode" class="nx-invite-body">
      <view class="invite-card__reward" role="status" :aria-busy="rewards.loading">
        <template v-if="rewardReady && rewardEnabled">
          <view class="invite-card__reward-line"><text class="invite-card__amount">{{ rewardAmount }}</text><text class="invite-card__unit">UVT</text></view>
          <text class="invite-card__description">{{ copy.qualifiedFriendReward }}</text>
        </template>
        <template v-else-if="rewardReady"><text class="invite-card__description">{{ t.team.referralRewardsDisabled }}</text><text class="invite-card__description">{{ t.team.sharingStillAvailable }}</text></template>
        <text v-else class="invite-card__amount">—</text>
        <view class="invite-card__action invite-card__primary nx-team-share-now" role="button" tabindex="0" :aria-label="copy.inviteFriends" @click="openShare" @keydown.enter.prevent="openShare" @keydown.space.prevent="openShare"><LiquidGlass :radius="999" tone="control" /><text>{{ copy.inviteFriends }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-7-7 7 7-7 7" /></svg></view>
      </view>
      <view class="invite-card__art"><TeamArt kind="invite" :size="160" /></view>
      <view class="invite-card__actions nx-invite-actions">
        <view class="invite-card__action nx-team-share-poster" role="button" tabindex="0" :aria-label="t.team.inviteSharePoster" @click="openPoster" @keydown.enter.prevent="openPoster" @keydown.space.prevent="openPoster"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m4 17 5-6 4 4 3-3 5 6"/></svg><text>{{ t.team.inviteSharePoster }}</text></view>
        <view class="invite-card__action nx-team-copy-code" role="button" tabindex="0" :aria-label="t.team.inviteShareCode" @click="copyCode" @keydown.enter.prevent="copyCode" @keydown.space.prevent="copyCode"><text class="invite-card__hash" aria-hidden="true">#</text><text>{{ copiedCode ? t.team.copied : t.team.inviteShareCode }}</text></view>
        <view class="invite-card__action nx-team-copy-link" role="button" tabindex="0" :aria-label="t.team.inviteShareLink" @click="copyLink" @keydown.enter.prevent="copyLink" @keydown.space.prevent="copyLink"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/></svg><text>{{ copiedLink ? t.team.copied : t.team.inviteShareLink }}</text></view>
        <view class="invite-card__action invite-card__records" role="button" tabindex="0" @click="detailMode='records'; detailOpen=true" @keydown.enter.prevent="detailMode='records'; detailOpen=true" @keydown.space.prevent="detailMode='records'; detailOpen=true"><text>{{ copy.rewardRecords }}</text><text aria-hidden="true">›</text></view>
      </view>
    </view>
    <view v-else class="invite-card__unavailable" role="status" :aria-busy="rewards.loading"><text>{{ rewards.loading ? t.team.rewardLoading : t.share.linkUnavailable }}</text><view class="invite-card__retry" role="button" :tabindex="rewards.loading ? -1 : 0" :aria-disabled="rewards.loading" @click="!rewards.loading && rewards.refresh()" @keydown.enter.prevent="!rewards.loading && rewards.refresh()" @keydown.space.prevent="!rewards.loading && rewards.refresh()"><text>{{ t.network.retry }}</text></view></view>
    <view v-if="referralCode && rewards.error" class="invite-card__unavailable" role="status"><text>{{ t.team.settlementUnavailable }}</text><view class="invite-card__retry" role="button" tabindex="0" @click="rewards.refresh()" @keydown.enter.prevent="rewards.refresh()" @keydown.space.prevent="rewards.refresh()"><text>{{ t.network.retry }}</text></view></view>
  </view>
  <SharePosterSheet :open="posterOpen" @close="posterOpen=false" />
  <ShareChannelSheet :open="shareOpen" @close="shareOpen=false" @open-poster="shareOpen=false; posterOpen=true" />
  <InviteDetailSheet :open="detailOpen" :mode="detailMode" @close="detailOpen=false" @records="detailMode='records'" />
</template>
<script setup lang="ts">
import { formatAmount } from '@/lib/amount-display';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import ShareChannelSheet from './share-channel-sheet.vue';
import SharePosterSheet from './share-poster-sheet.vue';
import InviteDetailSheet from './invite-detail-sheet.vue';
import TeamArt from './team-art.vue';
import LiquidGlass from '@/components/liquid-glass.vue';
import { useApp } from '@/store/app';
import { useReferralReward } from '@/store/referral-reward';
import { useLocaleStore } from '@/store/locale';
import { useT } from '@/i18n/use-t';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { toast } from '@/store/ui';
import { buildShareLink, copyText } from '@/lib/share';
import { remoteApiEnabled } from '@/api/runtime';
import { subscribeRuntimeRevision } from '@/api/order-api';
const t=useT(), app=useApp(), rewards=useReferralReward(), locale=useLocaleStore();
const copy=computed(()=>teamRedesignCopy(locale.code));
const detailOpen=ref(false), detailMode=ref<'rules'|'records'>('rules');
const rewardReady=computed(()=>!!rewards.snapshot && !rewards.error && !rewards.loading);
const rewardEnabled=computed(()=>rewards.snapshot?.rewardEnabled===true);
const nexReward=computed(()=>rewards.snapshot?.inviterRewardNex ?? 0);
const rewardAmount=computed(()=>formatAmount(nexReward.value).replace(/\.00$/, ''));
const referralCode=computed(()=>remoteApiEnabled ? rewards.snapshot?.referralCode ?? '' : app.user.referralCode);
const copiedCode = ref(false);
const copiedLink = ref(false);
const posterOpen = ref(false);
const shareOpen = ref(false);

// FEAT-SHARE1 异常2:码为空四入口置灰 + toast,不产出空码链接。
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
  if (!guardLink()) return;
  posterOpen.value = true;
}
function openShare() {
  shareOpen.value = true;
}
defineExpose({ openShare });


onMounted(()=>void rewards.refresh());
const stopRuntimeRefresh=subscribeRuntimeRevision(()=>{if(remoteApiEnabled)void rewards.refresh();});
onUnmounted(stopRuntimeRefresh);
</script>
<style scoped>
.invite-card { position: relative; padding: var(--ui-space-section) 18px 12px; border-radius: 22px; background: var(--v5-surface); color: var(--v5-ink); }
.invite-card__header { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); }
.invite-card__title { font: 600 22px/1.35 var(--font-v5); }
.invite-card__rules { display: flex; align-items: center; gap: 7px; min-height: 44px; color: var(--v5-ink-3); font-size: 12px; }
.nx-invite-body { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1fr); column-gap: 2px; padding-top: 8px; }
.invite-card__reward { min-width: 0; position: relative; z-index: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 9px; }
.invite-card__reward-line { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; }
.invite-card__amount { font: 600 clamp(28px,9vw,42px)/1.1 var(--font-v5); letter-spacing: -.035em; font-variant-numeric: tabular-nums; }
.invite-card__unit { font: 500 17px/1.2 var(--font-v5); }
.invite-card__description { font: 400 12px/1.5 var(--font-v5); color: var(--v5-ink-3); overflow-wrap: anywhere; }
.invite-card__art { display: flex; align-items: center; justify-content: center; min-width: 0; overflow: hidden; }
.invite-card__action { position: relative; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 7px; font: 500 12px/1.4 var(--font-v5); color: var(--v5-ink-2); cursor: pointer; }
.invite-card__primary { isolation: isolate; align-self: stretch; gap: var(--ui-space-inline); padding: 8px 12px; box-sizing: border-box; border-radius: 999px; margin-top: 5px; font-size: 13px; color: var(--v5-ink); }
.invite-card__primary > text,.invite-card__primary > svg { position: relative; z-index: 1; }
.invite-card__primary > text { text-align: center; min-width: 0; overflow-wrap: anywhere; }
.invite-card__primary > svg { flex: 0 0 auto; }
.invite-card__actions { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 2px 6px; padding-top: 14px; }
.invite-card__records { grid-column: 1 / -1; justify-self: end; min-height: 40px; }
.invite-card__hash { font-size: 21px; line-height: 1; }
.invite-card__unavailable { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); min-height: 70px; color: var(--v5-ink-3); font-size: 12px; }
.invite-card__retry { min-height: 44px; padding: 0 8px; flex: 0 0 auto; display: flex; align-items: center; }
.invite-card [tabindex='0']:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.invite-card__action:active,.invite-card__rules:active,.invite-card__retry:active { opacity: .75; }
@media (min-width: 375px) { .invite-card__actions { grid-template-columns: 1fr 1.1fr .9fr 1.4fr; column-gap: 4px; } .invite-card__records { grid-column: auto; min-height: 44px; } }
</style>
