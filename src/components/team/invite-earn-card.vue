<template>
  <view class="nx-glass-card invite-card" :style="rootStyle">
    <view aria-hidden="true" :style="gridStyle" />

    <view class="invite-card__header">
      <text class="invite-card__title">💰 {{ rewardReady && rewardEnabled ? t.team.earnForEachFriend : t.team.inviteTitle }}</text>
      <view class="invite-card__settlement">
        <PulseDot v-if="rewardReady" color="var(--v5-success)" :size="6" />
        <text class="font-mono-tabular tabular-nums">{{ settlementStatus }}</text>
      </view>
    </view>

    <view class="nx-invite-body" :style="bodyGridStyle">
      <view class="invite-card__reward" role="status" :aria-busy="rewards.loading">
        <template v-if="rewardReady">
          <template v-if="rewardEnabled">
            <view class="invite-card__reward-line">
              <text class="font-mono-tabular invite-card__amount" :style="rewardAmountStyle">{{ nexReward.toLocaleString() }}</text>
              <text class="font-display tabular-nums" :style="rewardUnitStyle"> NEX</text>
            </view>
            <text :style="rewardLabelStyle">{{ t.team.serverRewardPerSettlement }}</text>
            <text :style="cooldownStyle">{{ t.team.perFriendCooldown }}</text>
          </template>
          <text v-else :style="cooldownStyle">{{ t.team.sharingStillAvailable }}</text>
          <view v-if="lifetimeEarned > 0" class="invite-card__earned" :style="earnedPillStyle">
            <text>💎</text><text>+{{ lifetimeEarned.toLocaleString() }} NEX</text>
          </view>
        </template>
        <text v-else :style="cooldownStyle">{{ rewards.loading ? t.team.rewardLoading : t.team.settlementUnavailable }}</text>
      </view>

      <view class="invite-card__actions nx-invite-actions" :class="{ 'invite-card__disabled': !referralCode }">
        <view class="invite-card__action nx-team-share-poster" :style="shareBtnStyle(false)" role="button" tabindex="0" :aria-label="t.team.inviteSharePoster" :aria-disabled="!referralCode" @click="openPoster">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 21v.01M17 21h.01M21 17v.01"/></svg>
          <text class="invite-card__action-label" :style="shareLabelStyle">{{ t.team.inviteSharePoster }}</text>
          <text :style="shareValStyle">{{ t.team.inviteShareQR }}</text>
        </view>
        <view class="invite-card__action nx-team-copy-code" :style="shareBtnStyle(copiedCode)" role="button" tabindex="0" :aria-label="t.team.inviteShareCode" :aria-disabled="!referralCode" @click="copyCode">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-if="copiedCode" d="M20 6 9 17l-5-5"/><template v-else><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></template></svg>
          <text class="invite-card__action-label" :style="shareLabelStyle">{{ copiedCode ? t.team.copied : t.team.inviteShareCode }}</text>
          <text class="font-mono-tabular tabular-nums" :style="shareValStyle">{{ referralCode }}</text>
        </view>
        <view class="invite-card__action nx-team-copy-link" :style="shareBtnStyle(copiedLink)" role="button" tabindex="0" :aria-label="t.team.inviteShareLink" :aria-disabled="!referralCode" @click="copyLink">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-if="copiedLink" d="M20 6 9 17l-5-5"/><template v-else><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/></template></svg>
          <text class="invite-card__action-label" :style="shareLabelStyle">{{ copiedLink ? t.team.copied : t.team.inviteShareLink }}</text>
          <text :style="shareValStyle">{{ t.team.copyCode }}</text>
        </view>
        <view class="invite-card__action invite-card__primary nx-team-share-now" :style="primaryCtaStyle" role="button" tabindex="0" :aria-label="t.team.shareInvite" :aria-disabled="!referralCode" @click="openShare">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          <text :style="primaryCtaTextStyle">{{ rewardReady && rewardEnabled ? fmt(t.team.shareAndEarn, { n: `${nexReward.toLocaleString()} NEX` }) : t.team.shareInvite }}</text>
        </view>
      </view>
    </view>

    <view class="invite-card__history" :style="tickerWrapStyle">
      <view v-if="tickerItem && rewardReady" :key="tickerIdx" class="invite-card__ticker nx-step-in">
        <text class="invite-card__ticker-symbol">⚡</text>
        <text class="invite-card__ticker-name">{{ tickerItem.name }}</text>
        <text class="invite-card__ticker-action">{{ tickerItem.action }}</text>
        <text class="font-mono-tabular tabular-nums invite-card__ticker-amount" :style="tickerAmtStyle">{{ tickerItem.amount }}</text>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h10v10M7 17 17 7"/></svg>
      </view>
      <view v-else-if="rewards.error && remoteApiEnabled" class="invite-card__retry" role="button" tabindex="0" :aria-busy="rewards.loading" @click="rewards.refresh()">
        <text>{{ rewards.loading ? t.team.rewardLoading : t.team.rewardHistoryUnavailable }}</text>
      </view>
      <text v-else-if="rewards.loading">{{ t.team.rewardLoading }}</text>
      <text v-else-if="rewardReady">{{ t.team.noSettledRewards }}</text>
    </view>
  </view>
  <SharePosterSheet :open="posterOpen" @close="posterOpen = false" />
  <ShareChannelSheet :open="shareOpen" @close="shareOpen = false" @open-poster="shareOpen = false; posterOpen = true;" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, type CSSProperties } from "vue";
import PulseDot from "@/components/home/pulse-dot.vue";
import ShareChannelSheet from "@/components/team/share-channel-sheet.vue";
import SharePosterSheet from "@/components/team/share-poster-sheet.vue";
import { useApp } from "@/store/app";
import { useReferralReward } from "@/store/referral-reward";
import { useT } from "@/i18n/use-t";
import { toast } from "@/store/ui";
import { buildShareLink, copyText, notifyUnavailableShareLink } from "@/lib/share";
import { remoteApiEnabled } from "@/api/runtime";
import { fmt } from "@/i18n/format";

const t = useT();
const app = useApp();
const rewards = useReferralReward();
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
const rewardReady = computed(() => !!rewards.snapshot && !rewards.error && !rewards.loading);
const rewardEnabled = computed(() => rewards.snapshot?.rewardEnabled === true);
const nexReward = computed(() => rewards.snapshot?.inviterRewardNex ?? 0);
const lifetimeEarned = computed(() => rewards.snapshot?.lifetimeInviterNex ?? 0);
const settlementStatus = computed(() => rewards.loading
  ? t.value.team.rewardLoading
  : rewardReady.value && rewards.snapshot
  ? rewards.snapshot.rewardEnabled
    ? fmt(t.value.team.settlementStatus, {
      settled: rewards.snapshot.settledCount,
      pending: rewards.snapshot.pendingCount,
    })
    : t.value.team.referralRewardsDisabled
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
function guardLink(): string {
  const link = buildShareLink(referralCode.value);
  if (!link) notifyUnavailableShareLink();
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
  if (!guardLink()) return;
  shareOpen.value = true;
}
defineExpose({ openShare });

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

// ─── styles ───
const rootStyle: CSSProperties = {
  padding: "16px",
  background:
    "radial-gradient(70% 80% at 0% 0%, var(--v5-brand-soft) 0%, transparent 60%), radial-gradient(70% 80% at 100% 100%, var(--v5-tech-cyan-soft) 0%, transparent 60%), var(--v5-content-surface)",
};
const gridStyle: CSSProperties = {
  position: "absolute",
  inset: "0",
  backgroundImage:
    // 网格线跟随 ink:写死的白网格在亮主题下落在白卡面上 = 纹理消失(卡底是 var(--v5-surface),跟主题)
    "linear-gradient(to right, color-mix(in srgb, var(--v5-ink) 3%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--v5-ink) 3%, transparent) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  pointerEvents: "none",
  zIndex: 0,
};
const bodyGridStyle: CSSProperties = {
  marginTop: "12px",
  gap: "12px",
  alignItems: "stretch",
  zIndex: 1,
};
const rewardUnitStyle: CSSProperties = { fontSize: "15px", fontWeight: 500, opacity: 0.75, color: "var(--v5-ink-3)" };
const rewardAmountStyle: CSSProperties = {
  fontSize: "34px",
  fontWeight: 600,
  letterSpacing: "-0.024em",
  color: "var(--v5-ink)",
};
const rewardLabelStyle: CSSProperties = { fontSize: "13px", fontWeight: 500, color: "var(--v5-tech-cyan-ink)" };
const cooldownStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.3 };
const earnedPillStyle: CSSProperties = {
  marginTop: "auto",
  alignSelf: "flex-start",
  gap: "6px",
  fontSize: "12px",
  padding: "4px 8px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-tech-cyan) 12%, transparent)",
};
function shareBtnStyle(highlight: boolean): CSSProperties {
  return {
    height: "44px",
    gap: "6px",
    padding: "0 10px",
    background: highlight
      ? "color-mix(in srgb, var(--v5-brand) 15%, transparent)"
      : "var(--v5-surface-2)",
  };
}
const shareLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-2)", fontWeight: 500 };
const shareValStyle: CSSProperties = { marginLeft: "auto", minWidth: 0, fontSize: "12px", color: "var(--v5-ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const primaryCtaStyle: CSSProperties = {
  minHeight: "44px",
  gap: "4px",
  padding: "0 8px",
  background: "var(--v5-brand)",
};
const primaryCtaTextStyle: CSSProperties = {
  color: "var(--v5-on-brand)",
  fontSize: "13px",
  fontWeight: 500,
  letterSpacing: "-0.005em",
};
const tickerWrapStyle: CSSProperties = {
  marginTop: "12px",
  paddingTop: "10px",
  borderColor: "var(--v5-border)",
  minHeight: "34px",
  zIndex: 1,
};
const tickerAmtStyle: CSSProperties = { marginLeft: "auto", color: "var(--v5-brand)", fontWeight: 600 };

</script>

<style scoped>
.invite-card { position: relative; overflow: hidden; border-radius: 16px; }
.invite-card__header { position: relative; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px; font-size: 12px; z-index: 1; }
.invite-card__title { color: var(--v5-brand); font-weight: 500; }
.invite-card__settlement { display: flex; align-items: center; gap: 4px; color: var(--v5-ink-3); }
.nx-invite-body { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) 158px; }
.invite-card__reward { display: flex; flex-direction: column; min-width: 0; gap: 6px; font-size: 12px; line-height: 1.5; }
.invite-card__reward-line { display: flex; align-items: baseline; gap: 4px; line-height: 1; }
.nx-invite-actions { width: 158px; }
.invite-card__actions { display: flex; flex-direction: column; gap: 8px; }
.invite-card__action { display: flex; align-items: center; min-width: 0; min-height: 44px; border-radius: 8px; }
.invite-card__action > svg, .invite-card__action-label { flex-shrink: 0; }
.invite-card__primary { justify-content: center; border-radius: 999px; text-align: center; }
.invite-card__primary > text { min-width: 0; overflow-wrap: anywhere; line-height: 1.3; padding: 6px 0; }
.invite-card__action:active, .invite-card__retry:active { opacity: .75; }
.invite-card__disabled { opacity: .5; }
.invite-card [tabindex="0"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.invite-card__history { position: relative; display: flex; align-items: center; border-top: 1px solid; color: var(--v5-ink-3); font-size: 12px; line-height: 1.5; }
.invite-card__history:empty { display: none; }
.invite-card__ticker { display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0; }
.invite-card__ticker-symbol, .invite-card__ticker-amount, .invite-card__ticker > svg { flex-shrink: 0; }
.invite-card__ticker-name { min-width: 0; max-width: 34%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--v5-ink); font-weight: 500; }
.invite-card__ticker-action { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.invite-card__earned { display: inline-flex; align-items: center; color: var(--v5-tech-cyan-ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.invite-card__retry { min-height: 44px; display: flex; align-items: center; }
@media (max-width: 350px) {
  .nx-invite-body { grid-template-columns: minmax(0, 1fr); }
  .nx-invite-actions { width: 100%; }
}
</style>
