<template>
  <view class="nx-glass-card invite-card">
    <view v-if="isAuthoritativeSandbox" data-testid="h8-sandbox-banner" class="invite-card__sandbox">
      <text>{{ t.team.sandboxBanner }} · RunID {{ sandboxRunId }}</text>
    </view>
    <view class="invite-card__header">
      <svg class="invite-card__people" width="88" height="94" viewBox="0 0 88 94" fill="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="invite-glass-fill" x1="8" y1="10" x2="74" y2="90" gradientUnits="userSpaceOnUse"><stop stop-color="var(--v5-ink)" stop-opacity=".3"/><stop offset=".45" stop-color="var(--v5-ink)" stop-opacity=".04"/><stop offset="1" stop-color="var(--v5-ink)" stop-opacity=".18"/></linearGradient>
          <linearGradient id="invite-glass-edge" x1="10" y1="8" x2="76" y2="84" gradientUnits="userSpaceOnUse"><stop stop-color="var(--v5-ink)" stop-opacity=".85"/><stop offset=".45" stop-color="var(--v5-ink)" stop-opacity=".14"/><stop offset="1" stop-color="var(--v5-ink)" stop-opacity=".48"/></linearGradient>
        </defs>
        <g fill="url(#invite-glass-fill)" stroke="url(#invite-glass-edge)" stroke-width="1.3">
          <circle cx="65" cy="29" r="11"/><path d="M47 83V63a18 18 0 0 1 36 0v20Q65 89 47 83Z"/>
          <circle cx="33" cy="22" r="17"/><path d="M6 84V61a27 27 0 0 1 54 0v23Q33 92 6 84Z"/>
        </g>
        <path d="M21 11a14 14 0 0 1 14-4M13 55a23 23 0 0 1 15-15M60 23a8 8 0 0 1 8-2" stroke="var(--v5-ink)" stroke-opacity=".65" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <view class="invite-card__heading">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87"/></svg>
        <text class="invite-card__title">{{ t.team.inviteTitle }}</text>
      </view>
      <text class="invite-card__tagline">{{ t.team.inviteTagline }}</text>
    </view>
    <view class="invite-card__reward" role="status" :aria-busy="rewards.loading">
      <template v-if="rewards.snapshot && !rewards.error">
        <view class="invite-card__reward-line"><text>{{ t.team.serverRewardPerSettlement }}</text><text class="invite-card__amount">{{ nexReward.toLocaleString() }} NEX</text></view>
        <text class="invite-card__muted">{{ t.team.perFriendCooldown }}</text>
        <text class="invite-card__muted">{{ settlementStatus }}</text>
        <text v-if="lifetimeEarned > 0" class="invite-card__earned">+{{ lifetimeEarned.toLocaleString() }} NEX</text>
      </template>
      <text v-else class="invite-card__muted">{{ rewards.loading ? t.team.rewardLoading : t.team.settlementUnavailable }}</text>
      <view class="invite-card__rules" role="link" tabindex="0" @click="openRules"><text>{{ t.team.rewardRules }}</text><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></view>
    </view>

    <view class="invite-card__actions" :class="{ 'invite-card__disabled': !referralCode }">
      <view class="nx-glass-action invite-card__action" role="button" tabindex="0" :aria-label="t.team.inviteSharePoster" :aria-disabled="!referralCode" @click="openPoster">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="16" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 5"/></svg>
        <text>{{ t.team.inviteSharePoster }}</text>
      </view>
      <view class="nx-glass-action invite-card__action" role="button" tabindex="0" :aria-label="t.team.inviteShareCode" :aria-disabled="!referralCode" @click="copyCode">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-if="copiedCode" d="m4 12 5 5L20 6"/><template v-else><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 15h3v3h3v3h-6z"/></template></svg>
        <text>{{ copiedCode ? t.team.copied : t.team.inviteShareCode }}</text>
      </view>
      <view class="nx-glass-action invite-card__action" role="button" tabindex="0" :aria-label="t.team.inviteShareLink" :aria-disabled="!referralCode" @click="copyLink">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-if="copiedLink" d="m4 12 5 5L20 6"/><template v-else><path d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(2 0) scale(.83 1)"/></template></svg>
        <text>{{ copiedLink ? t.team.copied : t.team.inviteShareLink }}</text>
      </view>
    </view>
    <view class="invite-card__cta" :class="{ 'invite-card__disabled': !referralCode }" role="button" tabindex="0" :aria-disabled="!referralCode" @click="openShare">
      <text>{{ t.team.shareInvite }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
    </view>

    <view class="invite-card__history">
      <view v-if="tickerItem && !rewards.error" :key="tickerIdx" class="invite-card__ticker nx-step-in">
        <text>{{ tickerItem.name }}</text><text>{{ tickerItem.action }}</text><text class="invite-card__earned">{{ tickerItem.amount }}</text>
      </view>
      <view v-else-if="rewards.error && remoteApiEnabled" class="invite-card__retry" role="button" tabindex="0" :aria-busy="rewards.loading" @click="rewards.refresh()">
        <text>{{ rewards.loading ? t.team.rewardLoading : t.team.rewardHistoryUnavailable }}</text>
      </view>
      <text v-else-if="rewards.loading">{{ t.team.rewardLoading }}</text>
      <text v-else-if="rewards.snapshot">{{ t.team.noSettledRewards }}</text>
    </view>
  </view>
  <SharePosterSheet :open="posterOpen" @close="posterOpen = false" />
  <ShareChannelSheet :open="shareOpen" @close="shareOpen = false" @open-poster="shareOpen = false; posterOpen = true;" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import ShareChannelSheet from "@/components/team/share-channel-sheet.vue";
import SharePosterSheet from "@/components/team/share-poster-sheet.vue";
import { useApp } from "@/store/app";
import { useReferralReward } from "@/store/referral-reward";
import { useT } from "@/i18n/use-t";
import { toast } from "@/store/ui";
import { buildShareLink, copyText, recordShareEvent } from "@/lib/share";
import { remoteApiEnabled } from "@/api/runtime";
import { fmt } from "@/i18n/format";

const t = useT();
const app = useApp();
const rewards = useReferralReward();
const isAuthoritativeSandbox = computed(() =>
  rewards.snapshot?.source === "mock"
  && rewards.snapshot?.sourceEnvironment === "SANDBOX",
);
const sandboxRunId = computed(() => rewards.snapshot?.runId ?? "—");

interface TickerItem {
  name: string;
  action: string;
  amount: string;
}
const tickerItems = computed<TickerItem[]>(() => (rewards.snapshot?.recentRewards ?? []).map((row) => ({
  name: row.settlementNo.length > 12 ? `${row.settlementNo.slice(0, 12)}…` : row.settlementNo,
  action: row.releaseBucket === "withdrawable" ? t.value.team.settledToWallet : t.value.team.settledProtected,
  amount: `+${row.amountNex.toLocaleString()} NEX`,
})));
const nexReward = computed(() => rewards.snapshot?.inviterRewardNex ?? 0);
const lifetimeEarned = computed(() => rewards.snapshot?.lifetimeInviterNex ?? 0);
const settlementStatus = computed(() => rewards.snapshot
  ? fmt(t.value.team.settlementStatus, {
      settled: rewards.snapshot.settledCount,
      pending: rewards.snapshot.pendingCount,
    })
  : t.value.team.settlementUnavailable);

const referralCode = computed(() => {
  if (remoteApiEnabled) return rewards.snapshot?.referralCode ?? "";
  return app.user.referralCode;
});

const copiedCode = ref(false);
const copiedLink = ref(false);
const posterOpen = ref(false);
const shareOpen = ref(false);
const tickerIdx = ref(0);
const tickerItem = computed(() => tickerItems.value[tickerIdx.value] ?? null);

// FEAT-SHARE1 异常2:码为空四入口置灰 + toast,不产出空码链接。
function guardCode(): boolean {
  if (referralCode.value) return true;
  toast.info(t.value.share.noCodeYet);
  return false;
}

function guardShareLink(): string {
  if (!guardCode()) return "";
  const link = buildShareLink(referralCode.value);
  if (!link) toast.info(t.value.share.linkUnavailable);
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
  recordShareEvent("code", "team_hero");
  setTimeout(() => (copiedCode.value = false), 1500);
}
async function copyLink() {
  const link = guardShareLink();
  if (!link) return;
  const ok = await copyText(link);
  if (!ok) {
    toast.info(t.value.share.copyFailed);
    return;
  }
  copiedLink.value = true;
  recordShareEvent("link", "team_hero");
  setTimeout(() => (copiedLink.value = false), 1500);
}
function openPoster() {
  if (!guardShareLink()) return;
  posterOpen.value = true;
}
function openShare() {
  if (!guardShareLink()) return;
  shareOpen.value = true;
}

let tickerTimer: ReturnType<typeof setInterval> | null = null;
watch(() => tickerItems.value.length, (length) => {
  if (tickerTimer) clearInterval(tickerTimer);
  tickerTimer = null;
  tickerIdx.value = 0;
  if (length > 1) tickerTimer = setInterval(() => {
    tickerIdx.value = (tickerIdx.value + 1) % length;
  }, 4200);
});
onMounted(() => void rewards.refresh());
onUnmounted(() => {
  if (tickerTimer) clearInterval(tickerTimer);
});

function openRules() {
  uni.navigateTo({ url: "/pages/team/unilevel-how", fail: () => {} });
}
defineExpose({ openShare });
</script>

<style scoped>
.invite-card { padding: 20px; }
.invite-card__header { position: relative; padding-right: 80px; padding-bottom: 14px; min-height: 94px; }
.invite-card__people { position: absolute; top: -4px; right: -6px; width: 78px; pointer-events: none; }
.invite-card__heading { display: flex; align-items: center; gap: 12px; }
.invite-card__title { font-size: 20px; font-weight: 600; line-height: 1.3; }
.invite-card__tagline { display: block; margin-top: 10px; font-size: 13px; line-height: 1.5; color: var(--v5-ink-3); }
.invite-card__reward { display: flex; flex-direction: column; gap: 6px; font-size: 13px; line-height: 1.5; }
.invite-card__reward-line { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.invite-card__amount { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.invite-card__muted { color: var(--v5-ink-3); }
.invite-card__rules { display: flex; gap: 10px; align-items: center; min-height: 44px; align-self: flex-start; color: var(--v5-ink-2); }
.invite-card__actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 8px; }
.invite-card__action { display: flex; min-width: 0; min-height: 84px; flex-direction: column; align-items: center; justify-content: center; gap: 9px; padding: 12px 4px; border: 1px solid color-mix(in srgb, var(--v5-ink) 16%, transparent); border-radius: 18px; color: var(--v5-brand); text-align: center; }
.invite-card__action text { color: var(--v5-ink); font-size: 13px; line-height: 1.3; overflow-wrap: anywhere; }
.invite-card__cta { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 14px; min-height: 48px; border-radius: 999px; padding: 10px 14px; background: var(--v5-brand); color: var(--v5-on-brand); font-size: 15px; font-weight: 600; }
.invite-card__cta:active, .invite-card__action:active, .invite-card__rules:active, .invite-card__retry:active { opacity: .75; }
.invite-card__disabled { opacity: .5; }
.invite-card [tabindex="0"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.invite-card__history { margin-top: 10px; color: var(--v5-ink-3); font-size: 12px; line-height: 1.5; }
.invite-card__history:empty { display: none; }
.invite-card__ticker { display: flex; gap: 6px; flex-wrap: wrap; border-top: 1px solid var(--v5-border); padding-top: 10px; }
.invite-card__earned { color: var(--v5-tech-cyan-ink); font-variant-numeric: tabular-nums; }
.invite-card__retry { min-height: 44px; display: flex; align-items: center; }
.invite-card__sandbox { margin-bottom: 14px; padding: 8px 10px; border-radius: 10px; background: var(--v5-warning-soft); color: var(--v5-warning-ink); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
@media (max-width: 350px) {
  .invite-card__header { padding-right: 0; min-height: 0; }
  .invite-card__people { display: none; }
}
</style>
