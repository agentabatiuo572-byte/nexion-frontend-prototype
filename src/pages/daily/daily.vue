<!--
  Daily Check-in — streak hero + 30-day milestone roadmap + streak power-ups +
  streak saver + top-streakers leaderboard + stats + withdrawal context +
  history (ported from Nexion-prototype/app/(main)/daily/page.tsx).

  Wrapped in <AppChassis active="me"> (reached from /me/wallet). Uses the points
  store (signIn / claimMilestone / useSaver / streak / history). USDT/NEX
  milestone rewards credit the wallet + write a bill (composed in the handler).
  The Day-30 "Lucky Spin" milestone grants a bonus spin ticket and opens the
  Lucky Spin sheet (useLuckySpin.grantBonusTicket + openSheet); badge stays a
  toast-only unlock. Haptic feedback → uni.vibrateShort. TOP_STREAKERS is faithful mock data.
-->
<template>
  <AppChassis active="me">
    <CardStagger style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/wallet" />

      <view v-if="remoteApiEnabled && (remoteRefreshError || faucet.remoteReadState === 'error')" class="mx-4 rounded-2xl" :style="remoteErrorStyle">
        <view class="flex items-center justify-between" style="gap: 12px">
          <text :style="{ color: 'var(--v5-warning)', fontSize: '12px', lineHeight: '1.5' }">{{ t.authOtp.errorServiceUnavailable }}</text>
          <view class="shrink-0 active:opacity-70" :style="retryBtnStyle" :aria-disabled="remoteRefreshing ? 'true' : 'false'" role="button" tabindex="0" @click="refreshDaily"  @keydown.enter.prevent="refreshDaily" @keydown.space.prevent="refreshDaily">
            <text>{{ t.store.catalogRetry }}</text>
          </view>
        </view>
      </view>

      <view v-if="remoteInitialLoading || (remoteApiEnabled && ['idle', 'loading'].includes(faucet.remoteReadState))" class="px-4" role="status" aria-live="polite">
        <text class="block text-center" style="padding: 48px 16px; color: var(--v5-ink-3); font-size: 13px">{{ t.daily.loading }}</text>
      </view>

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <template v-if="dailyFactsReady">
        <!-- Streak hero -->
        <view class="nx-glass-card relative overflow-hidden text-center" :style="heroStyle">
          <text aria-hidden :style="fireStyle">🔥</text>
          <view class="relative">
            <text class="block tabular-nums" :style="streakNumStyle">{{ streak }}</text>
            <text class="block" :style="streakLblStyle">{{ t.daily.activeStreak }}</text>
            <text class="block" :style="streakPointsStyle">{{ heroLineText }}</text>
            <!-- Sign-in button -->
            <view class="w-full inline-flex items-center justify-center active:opacity-90" :style="signInBtnStyle" role="button" tabindex="0" :aria-disabled="lastSignedToday || remoteRefreshing || checkInSubmitting || !checkInStateConfirmed ? 'true' : 'false'" @click="handleCheckIn"  @keydown.enter.prevent="handleCheckIn" @keydown.space.prevent="handleCheckIn">
              <template v-if="lastSignedToday">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px"><path d="M20 6 9 17l-5-5" /></svg>
                <text>{{ t.daily.checkedInToday }}</text>
              </template>
              <template v-else-if="!checkInStateConfirmed">
                <text>{{ t.daily.checkInUnconfirmed }}</text>
              </template>
              <template v-else>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
                <text>{{ checkInCtaText }}</text>
              </template>
            </view>
            <view v-if="lastSignedToday" class="inline-flex items-center" :style="nextClaimStyle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
              <text>{{ nextClaimText }}</text>
            </view>
          </view>
        </view>

        <!-- Lucky multiplier hint -->
        <text class="text-center" :style="luckyHintStyle">{{ luckyHint }}</text>

        <!-- Milestone rewards -->
        <view :style="milestoneCardStyle">
          <view class="flex items-center justify-between" style="margin-bottom: 12px">
            <text class="inline-flex items-center" :style="milestoneLabelStyle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
              <text>{{ t.daily.milestones.label }}</text>
            </text>
          </view>
          <view style="display: flex; flex-direction: column; gap: 8px">
            <view v-for="m in milestones" :key="m.day" class="flex items-center" :style="milestoneRowStyle(m)">
              <view class="grid place-items-center shrink-0" :style="milestoneIconStyle(m)">
                <svg v-if="isMilestoneClaimed(m)" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                <svg v-else-if="isMilestoneUnlocked(m)" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path :d="m.iconPath" />
                  <path v-if="m.iconPath2" :d="m.iconPath2" />
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <view class="flex items-center" style="gap: 8px">
                  <text class="tabular-nums" :style="milestoneDayStyle">{{ m.labelText ?? t.daily.milestones[m.labelKey] }}</text>
                  <text :style="milestoneRewardStyle">{{ m.rewardText ?? t.daily.milestones[m.rewardKey] }}</text>
                </view>
                <text class="block" v-if="!isMilestoneUnlocked(m)" :style="milestoneLeftStyle">{{ daysLeftText(m.day) }}</text>
              </view>
              <view class="active:opacity-80 transition-opacity" :style="milestoneBtnStyle(m)" role="button" tabindex="0" :aria-disabled="!isMilestoneUnlocked(m) || isMilestoneClaimed(m) ? 'true' : 'false'" @click="handleClaimMilestone(m)"  @keydown.enter.prevent="handleClaimMilestone(m)" @keydown.space.prevent="handleClaimMilestone(m)">
                <text>{{ isMilestoneClaimed(m) ? t.daily.milestones.claimed : t.daily.milestones.claim }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Streak Power-Ups -->
        <StreakPowerUps />

        <!-- Streak Saver -->
        <view class="nx-glass-card" :style="saverCardStyle">
          <view class="flex items-start" style="gap: 12px">
            <view class="grid place-items-center shrink-0" :style="saverIconStyle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <text class="block" :style="saverLabelStyle">{{ t.daily.saver.label }}</text>
              <text class="block" :style="saverHeadlineStyle">{{ saverHeadlineText }}</text>
              <text class="block" :style="saverCountStyle">{{ saverCountText }}</text>
            </view>
            <view class="active:opacity-80 transition-opacity" :style="saverBtnStyle" role="button" tabindex="0" :aria-disabled="!streakBroken || remoteRefreshing || saverSubmitting ? 'true' : 'false'" @click="handleUseSaver"  @keydown.enter.prevent="handleUseSaver" @keydown.space.prevent="handleUseSaver">
              <text>{{ t.daily.saver.use }}</text>
            </view>
          </view>
        </view>

        <!-- Top Streakers -->
        <view class="nx-glass-card overflow-hidden" :style="leaderCardStyle">
          <view class="px-4 flex items-center justify-between" style="padding-top: 12px; padding-bottom: 8px">
            <text :style="leaderLabelStyle">{{ t.daily.topStreakers.label }}</text>
            <text :style="leaderBestStyle">{{ yourBestText }}</text>
          </view>
          <view class="px-2" style="padding-bottom: 8px">
            <view v-for="(s, i) in leaderRows" :key="s.name" class="flex items-center" style="gap: 10px; padding: 8px">
              <text class="tabular-nums text-center" :style="rankStyle">{{ i + 1 }}</text>
              <text class="block grid place-items-center" :style="avatarStyle">{{ s.name.charAt(0) }}</text>
              <view class="flex-1 min-w-0 flex items-center" style="gap: 6px">
                <text class="truncate" :style="streakerNameStyle">{{ s.name }}</text>
                <text style="font-size: 12px">{{ s.countryCode }}</text>
              </view>
              <text class="tabular-nums" :style="streakerCountStyle">🔥 {{ s.streak }}</text>
            </view>
          </view>
          <text class="block px-4" :style="leaderSubStyle">{{ t.daily.topStreakers.sub }}</text>
        </view>

        </template>
        <!-- Stats grid -->
        <view class="grid grid-cols-3" style="gap: 8px">
          <view class="text-center" :style="statStyle">
            <text class="block" :style="statLabelStyle">{{ t.daily.balance }}</text>
            <text class="block tabular-nums" :style="statValStyle('var(--v5-success)')">{{ !remoteApiEnabled || app.remoteFleetHasSnapshot ? app.user.nexBalance : '—' }}</text>
            <text class="block" :style="statSubStyle">{{ t.daily.points }}</text>
          </view>
          <view class="text-center" :style="statStyle">
            <text class="block" :style="statLabelStyle">{{ t.daily.lifetime }}</text>
            <text class="block tabular-nums" :style="statValStyle('var(--v5-ink)')">{{ lifetimeEarned }}</text>
            <text class="block" :style="statSubStyle">{{ t.daily.earned }}</text>
          </view>
          <view class="text-center" :style="statStyle">
            <text class="block" :style="statLabelStyle">{{ t.daily.spent }}</text>
            <text class="block tabular-nums" :style="statValStyle('var(--v5-warning)')">{{ lifetimeSpent }}</text>
            <text class="block" :style="statSubStyle">{{ t.daily.onPayouts }}</text>
          </view>
        </view>

        <text v-if="remoteApiEnabled" class="block" :style="statSubStyle">{{ t.daily.ledgerScope }}</text>
        <view v-if="remoteApiEnabled && app.remoteFleetStatus === 'error'" role="status">
          <text class="block" :style="statSubStyle">{{ app.remoteFleetHasSnapshot ? t.wallet.fundsStaleBody : t.wallet.fundsUnavailableBody }}</text>
          <view class="inline-flex active:opacity-70" :style="retryBtnStyle" role="button" tabindex="0" @click="refreshBalance(false)"  @keydown.enter.prevent="refreshBalance(false)" @keydown.space.prevent="refreshBalance(false)">
            <text>{{ t.wallet.retryFunds }}</text>
          </view>
        </view>
        <text v-if="remoteApiEnabled && bills.summaryStatus === 'ready' && (bills.summary?.settledRewardsNex == null || bills.summary?.withdrawalOffsetNexSpent == null)" class="block" :style="statSubStyle">{{ t.home.quickFactsFailed }}</text>

        <!-- Withdrawal context -->
        <view :style="withdrawCardStyle" class="nx-glass-card active:scale-[0.98]" role="button" tabindex="0" @click="goWithdraw"  @keydown.enter.prevent="goWithdraw" @keydown.space.prevent="goWithdraw">
          <view class="flex items-center" style="gap: 12px">
            <view class="grid place-items-center" :style="withdrawIconStyle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
            </view>
            <view class="flex-1">
              <text class="block" :style="withdrawTitleStyle">{{ pointsUnlockText }}</text>
              <text class="block" :style="withdrawRuleStyle">{{ t.daily.pointsRule }}</text>
            </view>
          </view>
        </view>

        <!-- History -->
        <view>
          <text class="block px-1" :style="historyLabelStyle">{{ t.daily.recent }}</text>
          <view class="nx-glass-card overflow-hidden" :style="historyCardStyle">
            <view v-if="remoteApiEnabled && bills.summaryStatus !== 'ready'" class="p-4">
              <text>{{ bills.summaryStatus === 'error' ? t.home.quickFactsFailed : t.home.quickFactsLoading }}</text>
              <view v-if="bills.summaryStatus === 'error'" class="inline-flex active:opacity-70" :style="retryBtnStyle" role="button" tabindex="0" @click="refreshLedger()"  @keydown.enter.prevent="refreshLedger()" @keydown.space.prevent="refreshLedger()">
                <text>{{ t.store.catalogRetry }}</text>
              </view>
            </view>
            <EmptyState v-else-if="historyRows.length === 0" kind="empty-list" :title="t.empty.listTitle" :desc="t.empty.listDesc" compact />
            <view
              v-for="(h, i) in historyRows"
              v-else
              :key="`${h.ts}-${i}`"
              class="flex items-center justify-between"
              :style="historyRowStyle(i === historyRows.length - 1)"
            >
              <view>
                <text class="block" :style="historyReasonStyle">{{ h.reason }}</text>
                <text class="block" :style="historyTimeStyle">{{ formatTs(h.ts) }}</text>
              </view>
              <text class="block tabular-nums" :style="historyDeltaStyle(h.delta)">{{ h.delta > 0 ? "+" : "" }}{{ h.delta }}</text>
            </view>
          </view>
        </view>
      </view>
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { ref, computed, watch, nextTick, onMounted, onUnmounted, type CSSProperties } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import CardStagger from "@/components/card-stagger.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import StreakPowerUps from "@/components/daily/streak-power-ups.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { formatTrialDateTime } from "@/lib/trial-date";
import { useNexFaucet } from "@/store/nex-faucet";
import { useApp } from "@/store/app";
import { useBills } from "@/store/bills";
import { resolveWalletBillMemo } from "@/lib/wallet-bill-display";
import { geoPolicyUserMessage } from "@/api/geo-policy-error";
import { remoteApiEnabled, sessionVault } from "@/api/runtime";
import { useAuth } from "@/store/auth";
import { binarySessionReady as accountSessionReady } from "@/lib/binary-session-ready";
import { createScopedReadCoalescer } from "@/lib/binary-read-coalescer";
import { captureRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { postMoneyBillsOnce } from "@/lib/money-receipt";
import { useLuckySpin } from "@/store/lucky-spin";
import { toast } from "@/store/ui";
import { dailyBaseReward, dailyLuckyHint, dailyMilestoneRewardText, dailyRewardLabels, dailyUpcomingMilestone } from "./daily-reward-view";
import { dailyCheckInSuccessCopy } from "./daily-success-copy";

const ONE_DAY_MS = 86400 * 1000;

interface Milestone {
  day: number;
  rewardKey: "reward3" | "reward7" | "reward14" | "reward21" | "reward30" | "reward60" | "reward100";
  labelKey: "day3" | "day7" | "day14" | "day21" | "day30" | "day60" | "day100";
  reward: { type: "usdt" | "nex" | "spin" | "badge"; amount: number };
  tint: string;
  iconPath: string;
  iconPath2?: string;
  labelText?: string;
  rewardText?: string;
  status?: "LOCKED" | "CLAIMABLE" | "CLAIMED";
}

// Icon paths (lucide): Sparkles / Gift / TrendingUp / Star / Trophy / ShieldCheck.
const MILESTONES: Milestone[] = [
  { day: 3, rewardKey: "reward3", labelKey: "day3", reward: { type: "nex", amount: 5 }, tint: "var(--v5-nex)", iconPath: "m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" },
  { day: 7, rewardKey: "reward7", labelKey: "day7", reward: { type: "nex", amount: 15 }, tint: "var(--v5-nex)", iconPath: "M20 12v10H4V12", iconPath2: "M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7" },
  { day: 14, rewardKey: "reward14", labelKey: "day14", reward: { type: "usdt", amount: 1 }, tint: "var(--v5-warning)", iconPath: "M16 7h6v6", iconPath2: "m22 7-8.5 8.5-5-5L2 17" },
  { day: 21, rewardKey: "reward21", labelKey: "day21", reward: { type: "nex", amount: 100 }, tint: "var(--v5-nex)", iconPath: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" },
  { day: 30, rewardKey: "reward30", labelKey: "day30", reward: { type: "spin", amount: 1 }, tint: "var(--v5-brand-2)", iconPath: "M6 9H4.5a2.5 2.5 0 0 1 0-5H6", iconPath2: "M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z" },
  { day: 60, rewardKey: "reward60", labelKey: "day60", reward: { type: "usdt", amount: 10 }, tint: "var(--v5-warning)", iconPath: "M16 7h6v6", iconPath2: "m22 7-8.5 8.5-5-5L2 17" },
  { day: 100, rewardKey: "reward100", labelKey: "day100", reward: { type: "badge", amount: 1 }, tint: "var(--v5-brand)", iconPath: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z", iconPath2: "m9 12 2 2 4-4" },
];

const MOCK_TOP_STREAKERS = [
  { name: "Daniel_K", countryCode: "US", streak: 412 },
  { name: "Mei_C", countryCode: "SG", streak: 387 },
  { name: "Lukas_F", countryCode: "DE", streak: 341 },
  { name: "Carlos_M", countryCode: "BR", streak: 298 },
  { name: "Priya_S", countryCode: "IN", streak: 256 },
];

const t = useT();
const faucet = useNexFaucet();
const dailyFactsReady = computed(() => !remoteApiEnabled || faucet.remoteReadState === 'ready');
const app = useApp();
const auth = useAuth();
const remoteSessionReady = computed(() => accountSessionReady({
  remote: remoteApiEnabled, authenticated: auth.isAuthenticated,
  accountId: auth.accountId, appAccountKey: app.accountKey,
  sessionUserId: sessionVault.read()?.user.userId ?? null,
}));
let pageActive = true;
let pageVisit = 0;
let readCoalescer = createScopedReadCoalescer();
let dailyPageScope: string | null = null;
const bills = useBills();
async function refreshBalance(coalesce = true) {
  if (remoteApiEnabled && remoteSessionReady.value && pageActive) await app.refreshRemoteFleet(undefined, { coalesce }).catch(() => false);
}
async function refreshLedger(force = false) {
  if (remoteApiEnabled && remoteSessionReady.value && pageActive) await bills.refreshSummary({ force }).catch(() => {});
}
const luckySpin = useLuckySpin();
const luckyHint = computed(() => dailyLuckyHint(faucet.remoteRules, t.value.daily.luckyHint));
const checkInCtaText = computed(() => {
  if (!remoteApiEnabled) return t.value.daily.checkInCta;
  const base = dailyBaseReward(faucet.remoteRules);
  return base === null ? t.value.daily.checkInAction : fmt(t.value.daily.checkInBase, { n: base });
});
const leaderRows = computed(() => remoteApiEnabled ? faucet.topStreakers : MOCK_TOP_STREAKERS);
const milestoneRewardLabels = computed(() => dailyRewardLabels(t.value.daily.milestones));
const milestones = computed<Milestone[]>(() => remoteApiEnabled
  ? faucet.remoteMilestones.map((m) => ({
      day: m.milestoneDay,
      rewardKey: "reward3",
      labelKey: "day3",
      labelText: fmt(t.value.daily.milestones.dayLabel, { n: m.milestoneDay }),
      rewardText: dailyMilestoneRewardText(m, milestoneRewardLabels.value),
      status: m.status,
      reward: { type: (m.rewardType.toLowerCase() === "usdt" ? "usdt" : m.rewardType.toLowerCase() === "spin" ? "spin" : m.rewardType.toLowerCase() === "badge" ? "badge" : "nex") as Milestone["reward"]["type"], amount: m.rewardAmount },
      tint: "var(--v5-nex)", iconPath: "m12 3v18M3 12h18",
    }))
  : MILESTONES);

const remoteRefreshError = ref(false);
const remoteRefreshing = ref(false);
const checkInSubmitting = ref(false);
const saverSubmitting = ref(false);
const remoteInitialLoading = ref(remoteApiEnabled);
// 🔴 签到写闸(BUG 154)。`faucet.remoteReadState === 'ready'` 只说明**曾经**读到过账号状态:
// 刷新失败时它按设计保持 ready(nex-faucet-remote-resilience.test.ts「keeps the last
// confirmed daily state when a state refresh fails」——已确认的快照不许被一次失败清空)。
// 而签到的前置事实是「今天还没签」,它**只有一次成功的读取能证明**;读取失败时
// remoteCheckedInToday 停在 false,于是"未知"被当成"未签"——正是这个 bug。
// 所以写闸必须同时确认**承载这份快照的这次读取真的跑成了**:
//   · remoteRefreshError —— 本轮 refreshDaily 的读取失败(页面已挂错误条 + 重试);
//   · remoteSessionReady  —— 冷会话/未恢复:refreshDaily 会提前 return,连错误条都不会置,
//     这正是「重新同步后仍无法确认状态」那条路径,必须一起 fail-closed。
// 冷会话围栏复用 lib/binary-session-ready,不另造第二套。
const checkInStateConfirmed = computed(() => !remoteApiEnabled
  || (remoteSessionReady.value && faucet.remoteReadState === 'ready' && !remoteRefreshError.value));
let dailyRefreshRequest = 0;
async function refreshDaily() {
  if (!remoteApiEnabled || !remoteSessionReady.value || !pageActive || remoteRefreshing.value) return;
  const request = ++dailyRefreshRequest;
  remoteRefreshing.value = true;
  remoteRefreshError.value = false;
  try {
    const ok = await faucet.ensureRemote();
    if (request === dailyRefreshRequest && !ok) remoteRefreshError.value = true;
  } catch {
    if (request === dailyRefreshRequest) remoteRefreshError.value = true;
  } finally {
    if (request === dailyRefreshRequest) {
      remoteRefreshing.value = false;
      remoteInitialLoading.value = false;
    }
  }
}
function readDailyPage() {
  if (!remoteApiEnabled || !pageActive) return;
  const runtime = captureRuntimeRevision();
  const scope = {accountKey: app.accountKey, accountBindingEpoch: app.accountBindingEpoch, runtime};
  const scopeKey = remoteSessionReady.value
    ? JSON.stringify([scope.accountKey, scope.accountBindingEpoch, runtime.runId, runtime.epoch]) : null;
  if (dailyPageScope !== scopeKey) {
    dailyPageScope = scopeKey;
    dailyRefreshRequest += 1;
    remoteRefreshing.value = false;
    remoteRefreshError.value = false;
    remoteInitialLoading.value = true;
    readCoalescer = createScopedReadCoalescer();
  }
  if (scopeKey === null) return;
  void readCoalescer.run(scope, () => Promise.all([refreshDaily(), refreshLedger(), refreshBalance()]).then(() => undefined));
}
watch(() => [app.accountKey, app.accountBindingEpoch] as const, readDailyPage);
watch(remoteSessionReady, readDailyPage, { immediate: true, flush: 'post' });
// Catalog preparation publishes before the remaining account-scoped stores bind.
const unsubscribeDailyRuntime = subscribeRuntimeRevision(() => { void nextTick(readDailyPage); });
onHide(() => { pageActive = false; pageVisit += 1; });
onShow(() => { pageActive = true; readDailyPage(); });
onUnmounted(() => { pageActive = false; dailyRefreshRequest += 1; unsubscribeDailyRuntime(); });

// Per-second tick for the countdown.
const tick = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => {
    tick.value += 1;
    if (remoteApiEnabled && faucet.remoteNextResetAt > 0
        && Date.now() >= faucet.remoteNextResetAt && tick.value % 30 === 0 && !remoteRefreshing.value) {
      void refreshDaily();
    }
  }, 1000);
  // 🔴 这里曾挂过一个 reconcileFaucetBills()「签到/里程碑发币没落盘就补发」——**已撤销**。
  // 实景走查当场证伪:判据是「有领取状态、无对应账单行 ⇒ 补发」,它分不清
  //   ① 从没发过(该补)与 ② 发过了但账单行丢了(不该补)。
  // 而 ② 是**可达**的:账单表走裸 writeAccountRow(无 CAS 无合并),另一标签页写一次就会
  // 覆盖掉本页刚写的分录,而余额在账户快照里按增量合并**幸存**(实测靶
  // scripts/measure-bills-crosstab-loss.mjs)。此时自愈会二次发钱 ——
  // 浏览器实测:余额 11940 → 11943,凭空多发一次。
  // 少发是用户损失,多发是平台损失且不可追回 —— 在拿到**权威的「已付」标记**之前,
  // 这个判据不可能正确。
  // 🔴 **权威「已付」标记要等真后端**(主人 2026-08-05 拍板:不在前端做存储层事务重构,
  //   提案已被独立证伪判定不可行,见 docs/changes/2026-08-04-change2-proposal.md)。
  //   在那之前,这里**永远不要**加「按账单缺失来补发」的自愈——它必然是二次发钱的入口。
  //   已焊门:scripts/selfcheck-claim-idempotency.mjs。
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function isSameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const streak = computed(() => faucet.signInStreak);
const lastSignedToday = computed(() => remoteApiEnabled ? faucet.remoteCheckedInToday
  : faucet.lastSignedInAt > 0 && isSameDay(faucet.lastSignedInAt, Date.now()));
const claimedSet = computed(() => new Set(faucet.claimedMilestones));

function isMilestoneClaimed(m: Milestone): boolean {
  return remoteApiEnabled ? m.status === "CLAIMED" : claimedSet.value.has(m.day);
}

function isMilestoneUnlocked(m: Milestone): boolean {
  return remoteApiEnabled
    ? m.status === "CLAIMABLE" || m.status === "CLAIMED"
    : streak.value >= m.day;
}

const nextMilestone = computed(() => dailyUpcomingMilestone(streak.value, milestones.value.map(m => ({
  day: m.day, rewardText: m.rewardText ?? t.value.daily.milestones[m.rewardKey], claimed: isMilestoneClaimed(m),
}))));

const nextResetMs = computed(() => {
  void tick.value;
  if (remoteApiEnabled) return Math.max(0, faucet.remoteNextResetAt - Date.now());
  const next = today();
  next.setDate(next.getDate() + 1);
  return next.getTime() - Date.now();
});

const streakBroken = computed(() => {
  if (faucet.lastSignedInAt === 0) return false;
  return Date.now() - faucet.lastSignedInAt > 2 * ONE_DAY_MS && faucet.streakSavers > 0;
});

const heroLineText = computed(() =>
  streak.value === 0
    ? t.value.daily.startStreak
    : nextMilestone.value ? fmt(t.value.daily.daysToReward, {
        n: nextMilestone.value.remainingDays,
        unit: nextMilestone.value.remainingDays === 1 ? t.value.daily.dayShort : t.value.daily.daysShort,
        reward: nextMilestone.value.rewardText,
      }) : t.value.daily.noNextMilestone,
);
const nextClaimText = computed(() => fmt(t.value.daily.nextClaimIn, { time: formatCountdown(nextResetMs.value) }));
const saverHeadlineText = computed(() => fmt(t.value.daily.saver.headline, { n: streak.value || "0" }));
const saverCountText = computed(() =>
  faucet.streakSavers > 0 ? fmt(t.value.daily.saver.count, { n: faucet.streakSavers }) : t.value.daily.saver.empty,
);
const yourBestText = computed(() =>
  fmt(t.value.daily.topStreakers.yourBest, { n: faucet.longestStreak || streak.value || 0 }),
);
const pointsUnlockText = computed(() => t.value.daily.pointsUnlockHint);
const lifetimeEarned = computed(() =>
  remoteApiEnabled ? bills.summaryStatus === 'ready' && bills.summary?.settledRewardsNex != null
    ? String(bills.summary.settledRewardsNex) : '—'
    : String(faucet.history.reduce((s, h) => s + (h.delta > 0 ? h.delta : 0), 0)),
);
const lifetimeSpent = computed(() =>
  remoteApiEnabled ? bills.summaryStatus === 'ready' && bills.summary?.withdrawalOffsetNexSpent != null
    ? String(bills.summary.withdrawalOffsetNexSpent) : '—'
    : String(-faucet.history.reduce((s, h) => s + (h.delta < 0 ? h.delta : 0), 0)),
);
const historyRows = computed(() => remoteApiEnabled
  ? (bills.summaryStatus === 'ready' ? bills.summary?.recentNexBills ?? [] : []).map(b => ({
      ts: b.ts, delta: b.amount,
      reason: resolveWalletBillMemo(b, t.value.bills.memo as Record<string, string>)
        + (b.status === 'pending' ? ` · ${t.value.wallet.pending}` : ''),
    }))
  : faucet.history.slice(0, 10));
function daysLeftText(day: number): string {
  return fmt(t.value.daily.milestones.daysLeft, { n: day - streak.value });
}
function formatTs(ts: number): string {
  return Number.isFinite(new Date(ts).getTime()) ? formatTrialDateTime(ts) : "—";
}

/** 签到分录的稳定幂等键 = 当天日期(签到一天一次)。带时间戳的话判重永不命中 = 假幂等。 */
function signInRef(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `SIGNIN-${d.getFullYear()}${mm}${dd}`;
}


async function handleCheckIn() {
  if (!pageActive || !dailyFactsReady.value) return;
  // 写闸:账号今日签到状态**本次已确认**才允许发写请求(见 checkInStateConfirmed)。
  // 只靠 aria-disabled 不够——键盘合成 click、程序化调用都会绕过属性闸。
  if (!checkInStateConfirmed.value) {
    toast.error(t.value.authOtp.errorServiceUnavailable);
    return;
  }
  if (lastSignedToday.value || remoteRefreshing.value || checkInSubmitting.value) return;
  if (remoteApiEnabled) {
    const walletAccountKey = app.accountKey;
    const walletAccountEpoch = app.accountBindingEpoch;
    const submittingVisit = pageVisit;
    checkInSubmitting.value = true;
    try {
      const remote = await faucet.checkInRemote();
      if (!pageActive || pageVisit !== submittingVisit || app.accountKey !== walletAccountKey || app.accountBindingEpoch !== walletAccountEpoch) return;
      if (!remote.ok) {
        toast.error(remote.reason === "B1_COVERAGE_BELOW_REDLINE"
          ? t.value.binary.blockReasons.COVERAGE_BELOW_REDLINE
          : remote.reason === "B1_COVERAGE_DATA_UNAVAILABLE"
            ? t.value.binary.blockReasons.B1_COVERAGE_UNRELIABLE
            : t.value.authOtp.errorServiceUnavailable);
        return;
      }
      const successCopy = dailyCheckInSuccessCopy(remote, t.value.daily);
      toast.success(successCopy.title, successCopy.body);
      void refreshLedger(true);
      if (app.accountKey === walletAccountKey && app.accountBindingEpoch === walletAccountEpoch) {
        void refreshBalance(false);
      }
    } finally {
      checkInSubmitting.value = false;
    }
    return;
  }
  const r = faucet.signIn();
  if (!r.ok) {
    // conflict = 别的标签页刚签过(store 已刷新到最新);否则就是本页自己今天已签。
    if (r.conflict) toast.warn(t.value.errors.staleTitle, t.value.errors.staleMsg);
    else toast.info("Already checked in today", "Come back tomorrow for more NEX.");
    return;
  }
  // Faucet store tracks streak only; crediting NEX to the wallet is composed here
  // (store never imports app). MOCK-ONLY NON-ATOMIC: PROD POST /api/faucet/sign-in
  // atomically grants NEX and emits the matching bill in one idempotent transaction.
  //
  // 🔴 这一处的顺序**反不过来**(与 quest / event / achievement 三族不同):发多少 NEX 是
  // signIn() 自己摇出来的(随机倍率 + 连签奖励),不先跑它就不知道金额。于是失败面是
  // 「今天已签、NEX 没到」,而签到一天一次、当天再点也没用。
  // 对策照仓里既有的自愈教条(App.vue reconcileBills:「别记,从现有数据推出来」)——
  // ref 用**当天日期**保持稳定,进页面时若发现「今天签过但账上没有那条分录」就补发;
  // 幂等出口保证补发不会变成第二次发钱。
  const paid = postMoneyBillsOnce([{ type: "bonus", symbol: "NEX", amount: r.gained, status: "posted",
    memo: `Daily check-in · ${r.streak}-day streak`, ref: signInRef(faucet.lastSignedInAt) }]);
  // 签到发奖这一跳就是上面那个 POST /api/faucet/sign-in —— 地区拒绝以它的结果回来。
  // 🔴 翻译不出来(`null`)就是普通结果,原样落回下面的 `!== "ok"` 出口:
  //    发钱失败仍然是发钱失败,不许被说成地区受限。
  const geo = geoPolicyUserMessage(paid, t.value.geoPolicy);
  if (geo) {
    toast.error(geo);
    return;
  }
  if (paid !== "ok") return;
  try {
    uni.vibrateShort({ fail: () => {} });
  } catch {
    // vibrate unavailable
  }
  if (r.multiplier > 1) {
    toast.success(`🎲 Lucky ×${r.multiplier}! +${r.gained} NEX`, `${r.streak}-day streak`);
  } else if (r.gained > 2) {
    toast.success(`🔥 ${r.streak}-day streak! +${r.gained} NEX`, "Day-7 bonus unlocked");
  } else {
    toast.success(`+${r.gained} NEX`, `${r.streak}-day streak`);
  }
}

async function handleClaimMilestone(m: Milestone) {
  if (!dailyFactsReady.value) return;
  if (isMilestoneClaimed(m)) {
    toast.info(t.value.daily.milestones.claimedToast, "");
    return;
  }
  if (!isMilestoneUnlocked(m)) {
    toast.info(t.value.daily.milestones.lockedToast, "");
    return;
  }
  if (remoteApiEnabled) {
    if (!await faucet.claimMilestoneRemote(m.day)) {
      toast.error(t.value.authOtp.errorServiceUnavailable);
      return;
    }
    toast.success(m.rewardText ?? dailyMilestoneRewardText(
      { rewardType: m.reward.type, rewardAmount: m.reward.amount, badgeCode: null }, milestoneRewardLabels.value,
    ), fmt(t.value.daily.milestones.claimedDay, { n: m.day }));
    void refreshLedger(true);
    return;
  }
  const gainedNex = m.reward.type === "nex" ? m.reward.amount : 0;
  const rewardDisplay = t.value.daily.milestones[m.rewardKey];
  // 🔴 必须先看 ok:上面两道预判读的是本页内存态,而里程碑领取是**一次性**的。
  // 别的标签页刚领过时 store 会按磁盘最新态拒掉,此时还往下走就是白发一份奖励。
  const claim = faucet.claimMilestone(m.day, gainedNex, `Milestone Day-${m.day}: ${rewardDisplay}`);
  if (!claim.ok) {
    if (claim.conflict) toast.warn(t.value.errors.staleTitle, t.value.errors.staleMsg);
    else toast.info(t.value.daily.milestones.claimedToast, "");
    return;
  }
  // USDT / NEX milestone rewards actually credit the wallet + write a bill.
  if (m.reward.type === "usdt" || m.reward.type === "nex") {
    // MOCK-ONLY NON-ATOMIC: PROD milestone-claim endpoint TBD must atomically
    // grant the reward and emit the matching bill in one idempotent transaction.
    // 🔴 ref 去掉时间戳:里程碑一档只能领一次,`STREAK-D{day}` 天生稳定。带时间戳的话
    // 判重永不命中,幂等出口会退化成普通出口、自愈也补不上(补一次就多发一次)。
    // 顺序保持「先 claim 后发钱」——那是有意的(见上方注释:claim 才是按磁盘最新态的权威判定,
    // 反过来会在别的标签页刚领过时白发一份)。代价是发钱失败会留「已领、没到账」,
    // 这条残迹目前**没有自动补救**,而且**按主人 2026-08-05 的拍板会一直如此**:
    // 曾挂过的自愈已撤销(判据分不清「没发过」与「发过但账单丢了」,实测会二次发钱);
    // 曾提案用存储层事务根治,独立证伪判定不可行。这是 mock 期的已知边界,由真后端事务收口。
    // 发钱失败对用户是**响的**(有失败提示),不是静默吞掉。
    const paid = postMoneyBillsOnce([{
      type: "bonus",
      symbol: m.reward.type === "usdt" ? "USDT" : "NEX",
      amount: m.reward.amount,
      status: "posted",
      memo: `Streak milestone · Day-${m.day}`,
      ref: `STREAK-D${m.day}`,
    }]);
    // 同签到:里程碑发奖是本页第二个发钱跳,地区拒绝以它的结果回来。
    // `null` = 普通结果 → 原样走下面的 `!== "ok"` 出口。
    const geo = geoPolicyUserMessage(paid, t.value.geoPolicy);
    if (geo) {
      toast.error(geo);
      return;
    }
    if (paid !== "ok") return;
  }
  // Day-30 "spin" milestone grants a bonus Lucky Spin ticket + opens the wheel.
  if (m.reward.type === "spin") {
    luckySpin.grantBonusTicket(m.reward.amount);
    luckySpin.openSheet();
  }
  // spin / badge milestones are non-currency unlocks → claim (+ spin sheet above).
  toast.success(rewardDisplay, fmt(t.value.daily.milestones.claimedDay, { n: m.day }));
}

async function handleUseSaver() {
  if (!dailyFactsReady.value) return;
  if (!streakBroken.value || remoteRefreshing.value || saverSubmitting.value) return;
  if (remoteApiEnabled) {
    saverSubmitting.value = true;
    try {
      if (await faucet.useSaverRemote()) toast.success(t.value.daily.saver.restored, "");
      else toast.error(t.value.authOtp.errorServiceUnavailable);
    } finally {
      saverSubmitting.value = false;
    }
    return;
  }
  const r = faucet.useSaver();
  if (r.ok) {
    toast.success(t.value.daily.saver.restored, "");
  } else if (r.conflict) {
    toast.warn(t.value.errors.staleTitle, t.value.errors.staleMsg);
  } else {
    toast.info(t.value.daily.saver.onlyWhenBroken, "");
  }
}

function goWithdraw() {
  navTo("/pages/me/wallet-withdraw-method");
}

// ── styles ──
const heroStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  padding: "22px 20px",
  borderRadius: "var(--nx-glass-radius)",
  background: "var(--nx-glass-fill)",
  color: "var(--v5-ink)",
};
const fireStyle: CSSProperties = {
  position: "absolute",
  top: "-30px",
  right: "-10px",
  fontSize: "140px",
  opacity: 0.15,
  pointerEvents: "none",
  lineHeight: 1,
};
const streakNumStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "56px",
  letterSpacing: "-0.034em",
  lineHeight: 1,
};
const streakLblStyle: CSSProperties = {
  marginTop: "6px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-2)",
  letterSpacing: "0.06em",
};
const streakPointsStyle: CSSProperties = { marginTop: "14px", fontSize: "13px", color: "var(--v5-ink-2)" };
const disabledSignInColor = "var(--v5-ink-3)";
const signInBtnStyle = computed<CSSProperties>(() => {
  // Both "already signed in" and "state not confirmed" are non-actionable, so they
  // share the dimmed treatment; the label says which one it is.
  const inert = lastSignedToday.value || !checkInStateConfirmed.value;
  return {
    marginTop: "18px",
    height: "54px",
    borderRadius: "14px",
    background: inert ? "var(--v5-surface-2)" : "var(--v5-brand)",
    color: inert ? disabledSignInColor : "var(--v5-on-brand)",
    fontFamily: "var(--font-v5)",
    fontWeight: 600,
    fontSize: "15px",
  };
});
const nextClaimStyle: CSSProperties = {
  marginTop: "10px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const luckyHintStyle: CSSProperties = {
  marginTop: "-4px",
  display: "block",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.4,
};
// De-carded outer info card — mono label + tinted milestone rows sit on the page
// floor (2px optical inset); the game affordance (claimable row glow) is kept.
const milestoneCardStyle: CSSProperties = {
  padding: "0 2px",
};
const milestoneLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-warning)",
  letterSpacing: "0.06em",
};
function milestoneRowStyle(m: Milestone): CSSProperties {
  const claimed = isMilestoneClaimed(m);
  const canClaim = isMilestoneUnlocked(m) && !claimed;
  return {
    gap: "12px",
    padding: "10px 12px",
    borderRadius: "12px",
    background: claimed ? "var(--v5-surface-2)" : canClaim ? "var(--v5-brand-soft)" : "var(--v5-surface-2)",
  };
}
function milestoneIconStyle(m: Milestone): CSSProperties {
  const claimed = isMilestoneClaimed(m);
  const reached = isMilestoneUnlocked(m);
  return {
    width: "36px",
    height: "36px",
    borderRadius: "10px",
    background: claimed ? "rgba(255,255,255,0.5)" : `color-mix(in srgb, ${m.tint} 10%, transparent)`,
    color: claimed ? "var(--v5-ink-4)" : reached ? m.tint : "var(--v5-ink-4)",
  };
}
const milestoneDayStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const milestoneRewardStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};
const milestoneLeftStyle: CSSProperties = { marginTop: "3px", fontSize: "12px", color: "var(--v5-ink-3)" };
function milestoneBtnStyle(m: Milestone): CSSProperties {
  const claimed = isMilestoneClaimed(m);
  const canClaim = isMilestoneUnlocked(m) && !claimed;
  return {
    minHeight: "44px",  // 《07》tap≥44(原 36)
    padding: "0 14px",
    borderRadius: "999px",
    background: canClaim ? "var(--v5-brand)" : "transparent",
    color: canClaim ? "var(--v5-ink)" : "var(--v5-ink-4)",
    fontFamily: "var(--font-v5)",
    fontWeight: 500,
    fontSize: "12px",
    letterSpacing: "-0.005em",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
}
const saverCardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)", padding: "16px", borderRadius: "var(--nx-glass-radius)", background: "var(--nx-glass-fill)" };
const saverIconStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  background: "var(--v5-brand-2)",
  color: "var(--v5-on-brand-2)",
};
const saverLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
  letterSpacing: "0.06em",
};
const saverHeadlineStyle: CSSProperties = {
  marginTop: "4px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-ink)",
  lineHeight: 1.4,
  letterSpacing: "-0.008em",
};
const saverCountStyle: CSSProperties = { marginTop: "3px", fontSize: "12px", color: "var(--v5-ink-3)" };
const saverBtnStyle = computed<CSSProperties>(() => ({
  height: "44px",
  padding: "0 16px",
  borderRadius: "999px",
  background: streakBroken.value ? "var(--v5-brand-2)" : "var(--v5-surface-2)",
  color: streakBroken.value ? "var(--v5-on-brand-2)" : "var(--v5-ink-4)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  letterSpacing: "-0.005em",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
}));
// Form-b: filled container, no border — the social streak list stays grouped.
const leaderCardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
};
const leaderLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
const leaderBestStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
const rankStyle: CSSProperties = {
  width: "20px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
const avatarStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "999px",
  background: "linear-gradient(135deg, var(--v5-brand-soft), var(--v5-tech-cyan-soft))",
  color: "var(--v5-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "12px",
};
const streakerNameStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.005em",
};
const streakerCountStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontWeight: 500,
  fontSize: "12px",
  color: "var(--v5-brand-2)",
};
const leaderSubStyle: CSSProperties = { paddingBottom: "12px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.5 };
// Filled stat tiles, no border (single visual difference).
const statStyle: CSSProperties = {
  padding: "12px",
  background: "var(--v5-surface)",
  borderRadius: "16px",
};
const statLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  letterSpacing: "0.02em",
};
function statValStyle(tint: string): CSSProperties {
  return {
    marginTop: "4px",
    fontFamily: "var(--font-v5)",
    fontWeight: 500,
    fontSize: "20px",
    letterSpacing: "-0.018em",
    color: tint,
    lineHeight: 1,
  };
}
const statSubStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", color: "var(--v5-ink-3)" };
// Soft brand-2-tinted clickable callout, no border (tap affordance = tint + active-scale).
const withdrawCardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  borderRadius: "var(--nx-glass-radius)",
  padding: "14px",
  background: "var(--nx-glass-fill)",
};
const withdrawIconStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-brand-2) 20%, transparent)",
};
const withdrawTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const withdrawRuleStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };
const historyLabelStyle: CSSProperties = {
  marginBottom: "8px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
// Form-b: filled container, no border — rows already hairline-separated.
const historyCardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
};
const historyEmptyStyle: CSSProperties = { padding: "24px", fontSize: "13px", color: "var(--v5-ink-3)" };
function historyRowStyle(isLast: boolean): CSSProperties {
  return { padding: "10px 16px", borderBottom: isLast ? "none" : "1px solid var(--v5-border)" };
}
const historyReasonStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "13px", color: "var(--v5-ink)" };
const historyTimeStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
function historyDeltaStyle(delta: number): CSSProperties {
  return {
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
    fontWeight: 600,
    fontSize: "13px",
    color: delta > 0 ? "var(--v5-success)" : delta < 0 ? "var(--v5-brand-2)" : "var(--v5-ink-3)",
  };
}
const remoteErrorStyle: CSSProperties = {
  marginBottom: "12px",
  padding: "10px 12px",
  background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)",
};
const retryBtnStyle: CSSProperties = {
  minHeight: "32px",
  padding: "0 10px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink)",
  fontSize: "12px",
};


</script>
