<!--
  InviteEarnCard — ported from Nexion-prototype/app/components/team/
  invite-earn-card.tsx. Single-card invite reward CTA: promo chip (phase-driven
  multiplier) + reward numbers/social-proof (left) + share buttons (right) +
  live commission ticker (bottom). framer AnimatePresence ticker → CSS re-keyed
  fade (nx-step-in). framer ping dot → reusable PulseDot.
  [FEAT-SHARE01] 2026-07-08 四入口接真链路(此前 DEGRADED 注记已解除):
    • 海报 → SharePosterSheet(真二维码 canvas 海报);
    • 立即分享 → ShareChannelSheet(渠道 intent 面板);
    • 邀请码/链接复制 → lib/share 单源链接 + 分享事件(quest invite_friend 接线);
    • 码为空四入口置灰 + toast(FEAT-SHARE1 异常2);复制失败禁误报(异常3)。
  <button>→<view @click>; <span>→<text>; <div>→<view>.
-->
<template>
  <view class="relative overflow-hidden rounded-2xl" :style="rootStyle">
    <!-- 24px grid overlay -->
    <view aria-hidden="true" :style="gridStyle" />

    <view
      v-if="isAuthoritativeSandbox"
      data-testid="h8-sandbox-banner"
      class="relative flex items-center"
      :style="sandboxBannerStyle"
    >
      <text>{{ t.team.sandboxBanner }} · RunID {{ sandboxRunId }}</text>
    </view>

    <!-- Top label row -->
    <view class="relative flex items-center justify-between" style="z-index: 1; font-size: 12px">
      <text :style="{ color: 'var(--v5-brand)', fontWeight: 500 }">💰 {{ t.team.earnForEachFriend }}</text>
      <view class="flex items-center" style="gap: 4px">
        <PulseDot color="var(--v5-success)" :size="6" />
        <text class="font-mono-tabular tabular-nums" :style="{ color: 'var(--v5-ink-3)' }">{{ settlementStatus }}</text>
      </view>
    </view>

    <!-- Limited-time promo chip -->
    <!-- 《02》§7:促销 callout 整句(6-7 词)禁 Mono,chip 限 <5 词 -->
    <view v-if="hasPromo" class="relative inline-flex items-center" :style="promoChipStyle">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
      <text>{{ promoChipText }}</text>
    </view>

    <!-- Two-column body -->
    <view class="relative grid" :style="bodyGridStyle">
      <!-- LEFT — stats -->
      <view class="min-w-0 flex flex-col" style="gap: 6px">
        <view class="flex items-baseline" style="gap: 4px; line-height: 1">
          <text class="font-mono-tabular" :style="leftDollarStyle">{{ nexReward.toLocaleString() }}</text>
          <text class="font-display tabular-nums" :style="leftDollarSignStyle">NEX</text>
        </view>
        <text class="font-display tabular-nums" :style="nexLineStyle">{{ t.team.serverRewardPerSettlement }}</text>
        <text :style="cooldownStyle">{{ t.team.perFriendCooldown }}</text>
        <!-- Cumulative earned pill — 仅在有已结算战绩时渲染,零收益无空态文案 -->
        <view v-if="lifetimeEarned > 0" class="inline-flex items-center" :style="earnedPillStyle">
          <text>💎</text>
          <text class="font-display tabular-nums" :style="{ color: 'var(--v5-tech-cyan-ink)', fontWeight: 600 }">+{{ lifetimeEarned.toLocaleString() }} NEX</text>
        </view>
      </view>

      <!-- RIGHT — actions(码为空整列置灰,点击仍有 toast 反馈) -->
      <view class="flex flex-col shrink-0" :class="referralCode ? '' : 'opacity-50'" style="width: 158px; gap: 8px">
        <view class="rounded-lg flex items-center active:opacity-90" :style="shareBtnStyle(false)" @click="openPoster">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 21v.01M17 21h.01M21 17v.01" /></svg>
          <text class="shrink-0" :style="shareLabelStyle">{{ t.team.inviteSharePoster }}</text>
          <text :style="shareValStyle(false)">{{ t.team.inviteShareQR }}</text>
        </view>
        <view class="rounded-lg flex items-center active:opacity-90" :style="shareBtnStyle(copiedCode)" @click="copyCode">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="copiedCode ? 'var(--v5-brand)' : 'var(--v5-brand)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><template v-if="copiedCode"><path d="M20 6 9 17l-5-5" /></template><template v-else><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></template></svg>
          <text class="shrink-0" :style="shareLabelStyle">{{ copiedCode ? t.team.copied : t.team.inviteShareCode }}</text>
          <text class="font-mono-tabular tabular-nums" :style="shareValStyle(copiedCode)">{{ referralCode }}</text>
        </view>
        <view class="rounded-lg flex items-center active:opacity-90" :style="shareBtnStyle(copiedLink)" @click="copyLink">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><template v-if="copiedLink"><path d="M20 6 9 17l-5-5" /></template><template v-else><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" /></template></svg>
          <text class="shrink-0" :style="shareLabelStyle">{{ copiedLink ? t.team.copied : t.team.inviteShareLink }}</text>
          <text class="font-mono-tabular tabular-nums" :style="shareValStyle(copiedLink)">{{ linkLabel }}</text>
        </view>

        <view class="rounded-full flex items-center justify-center active:opacity-90" :style="primaryCtaStyle" @click="openShare">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
          <text :style="primaryCtaTextStyle">{{ fmt(t.team.shareAndEarn, { n: `${nexReward.toLocaleString()} NEX` }) }}</text>
        </view>
      </view>
    </view>

    <!-- Live commission ticker -->
    <view class="relative flex items-center overflow-hidden border-t" :style="tickerWrapStyle">
      <view v-if="tickerItem" :key="tickerIdx" class="flex items-center w-full min-w-0 nx-step-in" style="gap: 6px; font-size: 12px">
        <text class="shrink-0">⚡</text>
        <text class="shrink-0" :style="{ color: 'var(--v5-ink)', fontWeight: 500 }">{{ tickerItem.name }}</text>
        <text class="truncate" :style="{ color: 'var(--v5-ink-3)' }">{{ tickerItem.action }}</text>
        <text class="font-mono-tabular tabular-nums shrink-0" :style="tickerAmtStyle">{{ tickerItem.amount }}</text>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><path d="M7 7h10v10M7 17 17 7" /></svg>
      </view>
      <!-- 🔴 两种状态拆开:原来共用一个 @click 容器,于是「暂无已结算奖励」这种**没什么可重试**
           的状态也长成可点的样子(文案却只在出错时才写「点击重试」),而且整条只有 16px 高、
           按下去零反馈 —— tap 门两条违例都出在这一个元素上。
           出错态:44px 热区 + 按下反馈 + role/tabindex(键盘激活由 lib/a11y-activate.ts 平台层给)。
           空态:纯展示,不给可点暗示。 -->
      <view
        v-else-if="rewards.error"
        class="flex items-center w-full min-w-0 active:opacity-70"
        style="gap: 6px; font-size: 12px; min-height: 44px"
        role="button" tabindex="0"
        @click="rewards.refresh()"
      >
        <text :style="{ color: 'var(--v5-ink-3)' }">{{ t.team.rewardHistoryUnavailable }}</text>
      </view>
      <view v-else class="flex items-center w-full min-w-0" style="gap: 6px; font-size: 12px">
        <text :style="{ color: 'var(--v5-ink-3)' }">{{ t.team.noSettledRewards }}</text>
      </view>
    </view>
  </view>

  <!-- [FEAT-SHARE2/3] 分享面板(fragment 兄弟节点,避开卡片 overflow-hidden) -->
  <SharePosterSheet :open="posterOpen" @close="posterOpen = false" />
  <ShareChannelSheet
    :open="shareOpen"
    @close="shareOpen = false"
    @open-poster="
      shareOpen = false;
      posterOpen = true;
    "
  />
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
const hasPromo = computed(() => false);
const multiplier = computed(() => 1);
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
// 展示用短链标签从真实链接派生(禁写死 nexgrid.ai 与实际复制内容脱节,审计 P2)。
const linkLabel = computed(() => {
  const bare = buildShareLink(referralCode.value).replace(/^https?:\/\//, "");
  if (!bare) return "—";
  return bare.length > 15 ? `${bare.slice(0, 15)}…` : bare;
});

const promoChipText = computed(() => "");

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
  if (!guardCode()) return;
  const ok = await copyText(buildShareLink(referralCode.value));
  if (!ok) {
    toast.info(t.value.share.copyFailed);
    return;
  }
  copiedLink.value = true;
  recordShareEvent("link", "team_hero");
  setTimeout(() => (copiedLink.value = false), 1500);
}
function openPoster() {
  if (!guardCode()) return;
  posterOpen.value = true;
}
function openShare() {
  if (!guardCode()) return;
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

// ─── styles ───
const rootStyle: CSSProperties = {
  padding: "16px",
  background:
    "radial-gradient(70% 80% at 0% 0%, var(--v5-brand-soft) 0%, transparent 60%), radial-gradient(70% 80% at 100% 100%, var(--v5-tech-cyan-soft) 0%, transparent 60%), var(--v5-surface)",
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
const sandboxBannerStyle: CSSProperties = {
  zIndex: 1,
  marginBottom: "10px",
  padding: "7px 10px",
  borderRadius: "10px",
  background: "color-mix(in srgb, var(--v5-warning) 12%, var(--v5-surface))",
  color: "var(--v5-warning-ink)",
  fontSize: "12px",
  fontWeight: 700,
};
const promoChipStyle: CSSProperties = {
  marginTop: "8px",
  gap: "4px",
  padding: "2px 8px",
  borderRadius: "6px",
  background: "color-mix(in srgb, var(--v5-brand-2) 12%, transparent)",
  color: "var(--v5-brand-2-ink)",
  fontSize: "12px",
  zIndex: 1,
};
const bodyGridStyle: CSSProperties = {
  marginTop: "12px",
  gridTemplateColumns: "1fr auto",
  gap: "12px",
  alignItems: "stretch",
  zIndex: 1,
};
const leftDollarSignStyle: CSSProperties = { fontSize: "15px", fontWeight: 500, opacity: 0.75, color: "var(--v5-ink-3)" };
const leftDollarStyle: CSSProperties = {
  fontSize: "34px",
  fontWeight: 600,
  letterSpacing: "-0.024em",
  color: "var(--v5-ink)",
};
const strikeStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  textDecoration: "line-through",
  marginTop: "-4px",
};
const nexLineStyle: CSSProperties = { fontSize: "13px", fontWeight: 500, color: "var(--v5-tech-cyan-ink)" };
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
function shareValStyle(_highlight: boolean): CSSProperties {
  return { marginLeft: "auto", fontSize: "12px", color: "var(--v5-ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
}
const primaryCtaStyle: CSSProperties = {
  height: "44px",
  gap: "4px",
  padding: "0 8px",
  background: "var(--v5-brand)",
  whiteSpace: "nowrap",
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
  height: "34px",
  zIndex: 1,
};
const tickerAmtStyle: CSSProperties = { marginLeft: "auto", color: "var(--v5-brand)", fontWeight: 600 };
</script>
