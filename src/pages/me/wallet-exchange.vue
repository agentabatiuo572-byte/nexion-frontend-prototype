<!--
  Wallet Exchange — ported from Nexion-prototype/app/(main)/me/wallet/exchange/page.tsx.
  NEX↔USDT swap: pay/receive cards with live-jittered rate + flip, free network
  fee, plus the v3 risk-control dashboard (per-user $50/day cap, platform
  $20K/day pool, queue). Confirm flow gates via
  useExchangeV3.canExchange → debit/credit app balances, recordSwap, write two
  bills (debit + credit), commit v3 counters.

  Ports the basic exchange store + the v3 risk store (both new — exchange.ts /
  exchange-v3.ts). Reuses app (credit/debit USDT+NEX), bills.
  useScrollGrowProgress + IntersectionObserver ($el) is dropped (P-018 precedent)
  — cap bars render at their final width directly. window.location.href → uni
  navigateTo. SSR mounted-guard dropped. Intervals cleaned in onUnmounted
  (page-level component, P-021). Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/wallet" :title="t.exchange.title" />
      <text v-if="!remoteState && remoteError" class="block" style="margin: 0 16px; font-size: 12px; color: var(--v5-danger)">{{ t.exchange.remoteUnavailableClosed }}</text>
      <!-- 同 staking:开发诊断,DEV 构建才渲染,裸英文字面量不进三语词典。 i18n-en-ok: 工程话诊断横幅,仅 DEV 构建渲染 -->
      <text v-else-if="isDevBuild && !remoteApiEnabled" class="block" style="margin: 0 16px; font-size: 12px; color: var(--v5-warning)">Dev build · mock data</text>

      <!-- How-it-works entry + refresh — pill compacted to match the other pages;
           it stays paired with the rate-refresh button (no de-carded hero here to
           merge into — owner 2026-07-09). -->
      <view class="flex items-center" :style="topRowStyle">
        <view class="inline-flex items-center shrink-0 active:scale-[0.98]" :style="howStyle" @click="goHowItWorks">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></svg>
          <text style="margin: 0 6px">{{ t.exchange.howItWorksEntry }}</text>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
        <view class="grid place-items-center active:opacity-70" :style="refreshBtnStyle" @click="onRefresh">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg>
        </view>
      </view>

      <!-- Pay card -->
      <view :style="swapCardStyle">
        <text class="block" :style="cardLabelStyle">{{ t.exchange.pay }}</text>
        <view class="flex items-baseline" style="margin-top: 6px; gap: 4px">
          <input
            class="flex-1 min-w-0 tabular-nums"
            :style="amountInputStyle"
            type="text"
            inputmode="decimal"
            :value="input"
            placeholder="0"
            placeholder-style="color: var(--v5-ink-2)"
            :disabled="submitting"
            @input="onInput"
          />
          <text class="shrink-0" style="font-size: 15px; color: var(--v5-ink-3)">{{ fromSym }}</text>
        </view>
        <view class="flex items-center justify-between" style="margin-top: 6px">
          <text style="font-size: 12px; color: var(--v5-ink-4)">{{ minLabel }}</text>
          <view class="inline-flex items-center active:bg-[color-mix(in_srgb,var(--v5-surface-2)_50%,transparent)]" :style="maxBtnStyle" @click="setMax">
            <text style="color: var(--v5-brand)">{{ fromSym }} </text>
            <text class="tabular-nums" style="color: var(--v5-brand)">{{ fromBalLabel }}</text>
            <text style="color: var(--v5-brand)"> · {{ t.uiChrome.max }}</text>
          </view>
        </view>
      </view>

      <!-- Flip -->
      <view class="flex justify-center" style="margin: 8px 0">
        <view class="grid place-items-center active:opacity-80" :style="flipBtnStyle" @click="flip">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="m21 8-4-4-4 4" /><path d="M17 4v16" /></svg>
        </view>
      </view>

      <!-- Receive card -->
      <view :style="swapCardStyle">
        <text class="block" :style="cardLabelStyle">{{ t.exchange.receive }}</text>
        <view class="flex items-baseline" style="margin-top: 6px; gap: 4px">
          <text class="flex-1 min-w-0 tabular-nums truncate" :style="receiveValueStyle">{{ toAmountLabel }}</text>
          <text class="shrink-0" style="font-size: 15px; color: var(--v5-ink-3)">{{ toSym }}</text>
        </view>
        <view class="flex items-center justify-between" style="margin-top: 6px">
          <text style="font-size: 12px; color: var(--v5-ink-4)">{{ rateLabel }}</text>
          <text class="tabular-nums" style="font-size: 12px; color: var(--v5-ink-4)">{{ updatedLabel }}</text>
        </view>
      </view>

      <!-- Fee -->
      <view class="flex items-center justify-between" :style="feeRowStyle">
        <text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.exchange.feeLabel }}</text>
        <text style="font-size: 12px; color: var(--v5-brand)">{{ t.exchange.feeFree }}</text>
      </view>

      <!-- Error -->
      <view v-if="overBalance || underMin" :style="errorStyle">
        <text>{{ errorLabel }}</text>
      </view>

      <!-- Confirm CTA -->
      <view style="margin: 16px 16px 0">
        <!-- 金额无效 / 本次兑换在途时点了没用 → 显式 aria-disabled + 置灰(《05》§6.1
             disabled 派生:文字降 ink-4 + 填充降 surface 系),而不是靠「没有按下反馈」暗示 -->
        <view class="grid place-items-center" :class="{ 'active:opacity-90': ctaEnabled }" role="button" tabindex="0" :aria-disabled="ctaEnabled ? 'false' : 'true'" :style="confirmStyle" @click="handleConfirm">
          <text :style="confirmTextStyle">{{ t.exchange.confirm }}</text>
        </view>
      </view>

      <!-- NEX info -->
      <view class="flex items-start" :style="infoStyle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 2px; flex-shrink: 0"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
        <text style="margin-left: 8px">{{ t.exchange.nexInfo }}</text>
      </view>

      <!-- v3 risk-control dashboard -->
      <view :style="dashStyle">
        <view class="flex items-center justify-between" style="margin-bottom: 12px">
          <text :style="dashTitleStyle">{{ t.exchange.capsLabel }}</text>
          <text class="font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.exchange.capsReset }}</text>
        </view>

        <!-- Per-user cap -->
        <view style="margin-bottom: 12px">
          <view class="flex items-center justify-between" style="margin-bottom: 4px">
            <text style="font-size: 12px; color: var(--v5-ink-2)">{{ t.exchange.yourDaily }}</text>
            <view class="font-mono-tabular tabular-nums" style="font-size: 12px; color: var(--v5-ink)">
              <text>{{ remoteApiEnabled && !remoteState ? t.exchange.remoteNotProvided :`$${displayUserUsed.toFixed(2)}` }} </text>
              <text v-if="!remoteApiEnabled || remoteState" style="color: var(--v5-ink-3)">/ ${{ displayUserCap.toFixed(2) }}</text>
            </view>
          </view>
          <view :style="barTrackStyle">
            <view :style="userBarStyle" />
          </view>
        </view>

        <!-- Platform cap -->
        <view style="margin-bottom: 12px">
          <view class="flex items-center justify-between" style="margin-bottom: 4px">
            <text style="font-size: 12px; color: var(--v5-ink-2)">{{ t.walletV3.exchangePoolToday }}</text>
            <view class="font-mono-tabular tabular-nums" style="font-size: 12px; color: var(--v5-ink)">
              <text>{{ remoteApiEnabled && !remoteState ? t.exchange.remoteNotProvided :`$${(displayPlatformUsed / 1000).toFixed(1)}K` }} </text>
              <text v-if="!remoteApiEnabled || remoteState" style="color: var(--v5-ink-3)">/ ${{ (displayPlatformCap / 1000).toFixed(0) }}K</text>
            </view>
          </view>
          <view :style="barTrackStyle">
            <view :style="platformBarStyle" />
          </view>
        </view>

        <!-- Queue -->
        <view v-if="displayQueue.length > 0" :style="queueWrapStyle">
          <view class="flex items-center" :style="queueTitleStyle">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
            <text style="margin-left: 6px">{{ queuedLabel }}</text>
          </view>
          <view v-for="q in displayQueue.slice(0, 3)" :key="q.id" class="flex items-center justify-between" style="padding: 4px 0">
            <view class="flex items-center min-w-0" style="gap: 8px">
              <text class="font-mono-tabular truncate" style="font-size: 12px; color: var(--v5-ink-3)">{{ q.id }} · {{ q.direction === "nex2usdt" ? "NEX → USDT" : "USDT → NEX" }}</text>
              <view
                v-if="remoteApiEnabled"
                class="shrink-0"
                role="button"
                tabindex="0"
                :aria-disabled="cancellingOrderNo === q.id ? 'true' : 'false'"
                :style="cancelQueueButtonStyle(cancellingOrderNo === q.id)"
                @click.stop="handleCancelQueued(q.id)"
              >
                <text>{{ cancellingOrderNo === q.id ? t.exchange.cancelling : t.exchange.cancelQueued }}</text>
              </view>
            </view>
            <text class="font-mono-tabular tabular-nums shrink-0" style="font-size: 12px; color: var(--v5-ink)">${{ q.amountUSD.toFixed(2) }}</text>
          </view>
        </view>
      </view>

      <!-- History -->
      <view style="margin: 20px 16px 24px">
        <text class="block" :style="historyTitleStyle">{{ t.exchange.historyTitle }}</text>
        <EmptyState v-if="history.length === 0" kind="empty-list" :title="t.empty.listTitle" :desc="t.empty.listDesc" compact />
        <view v-else :style="historyListStyle">
          <view v-for="(h, i) in history.slice(0, 6)" :key="h.id" class="flex items-center" :style="historyRowStyle(i)">
            <view class="grid place-items-center shrink-0" :style="historyIconStyle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="m21 8-4-4-4 4" /><path d="M17 4v16" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <text class="block tabular-nums" :style="historyMainStyle">{{ swapLine(h) }}</text>
              <text class="block" :style="historySubStyle">@ {{ h.rate.toFixed(5) }} · {{ new Date(h.ts).toLocaleString(dateLocale()) }}</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { geoPolicyUserMessage } from "@/api/geo-policy-error";
import { toast, confirm } from "@/store/ui";
import { useApp } from "@/store/app";
import { postMoneyBills } from "@/lib/money-receipt";
import {
  createExchangePendingMutationStore,
  executeExchangeSwap,
  ExchangeOutcomeUnknownError,
  type ExchangeSwapIntent,
} from "@/lib/exchange-pending-mutation";
import {
  acquireExchangeCancelCommand,
  createExchangeCancelStorage,
  exchangeOrderCanCancel,
  finishExchangeCancelCommand,
  isCurrentExchangeCancelScope,
  visibleQueuedExchangeOrders,
} from "@/lib/exchange-cancel";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { exchangeApi, remoteApiEnabled } from "@/api/runtime";
import type { ExchangeOrder, ExchangeSnapshot } from "@/api/exchange-api";
import { useExchange, type SwapEvent } from "@/store/exchange";
import {
  useExchangeV3,
  USER_DAILY_CAP_USD,
  PLATFORM_DAILY_CAP_USD,
  dailyUserPctUsed,
  dailyPlatformPctUsed,
} from "@/store/exchange-v3";

const t = useT();
// 同 staking:生产构建里 import.meta.env.DEV 恒为 false,Mock 横幅被摇掉。
const isDevBuild = import.meta.env.DEV;
const app = useApp();
const exchange = useExchange();
const v3 = useExchangeV3();
const remoteState = ref<ExchangeSnapshot | null>(null);
const remoteError = ref<string | null>(null);
const pendingExchangeMutations = createExchangePendingMutationStore();
const exchangeCancelStorage = createExchangeCancelStorage();
const cancellingOrderNo = ref<string | null>(null);

async function syncRemoteState() {
  if (!remoteApiEnabled) return;
  const scope = captureAccountScope();
  try {
    const snapshot = await exchangeApi.fetchState();
    if (!isCurrentAccountScope(scope) || app.accountKey !== scope.accountKey) return;
    remoteState.value = snapshot;
    remoteError.value = null;
  } catch {
    if (!isCurrentAccountScope(scope) || app.accountKey !== scope.accountKey) return;
    // Failure-close: local balances, rates, queues and history are not a remote fallback.
    remoteState.value = null;
    remoteError.value = "G2_REMOTE_AUTHORITY_UNAVAILABLE";
    throw new Error(remoteError.value);
  }
}

async function cancelRemoteOrder(exchangeNo: string): Promise<"cancelled" | "unknown" | "stale" | "not-cancellable"> {
  if (!remoteApiEnabled) return "unknown";
  const current = remoteState.value?.orders.find((order) => order.exchangeNo === exchangeNo);
  if (!exchangeOrderCanCancel(current)) {
    toast.info(t.value.exchange.cancelNotAllowed);
    return "not-cancellable";
  }
  const scope = captureAccountScope();
  const key = acquireExchangeCancelCommand(exchangeCancelStorage, scope.accountKey, exchangeNo);
  cancellingOrderNo.value = exchangeNo;
  try {
    const snapshot = await exchangeApi.cancel(exchangeNo, key);
    if (!isCurrentExchangeCancelScope(scope, captureAccountScope()) || app.accountKey !== scope.accountKey) return "stale";
    remoteState.value = snapshot;
    remoteError.value = null;
    const updated = snapshot.orders.find((order) => order.exchangeNo === exchangeNo);
    if (updated?.status !== "CANCELLED") return "unknown";
    finishExchangeCancelCommand(exchangeCancelStorage, scope.accountKey, exchangeNo, key);
    toast.success(t.value.exchange.cancelDone, t.value.exchange.cancelDoneBody);
    return "cancelled";
  } catch {
    if (!isCurrentExchangeCancelScope(scope, captureAccountScope()) || app.accountKey !== scope.accountKey) return "stale";
    // A timeout may happen after the server committed. Re-read the current
    // account's authority before telling the user whether retry is needed.
    try {
      const snapshot = await exchangeApi.fetchState();
      if (!isCurrentExchangeCancelScope(scope, captureAccountScope()) || app.accountKey !== scope.accountKey) return "stale";
      remoteState.value = snapshot;
      remoteError.value = null;
      const updated = snapshot.orders.find((order) => order.exchangeNo === exchangeNo);
      if (updated?.status === "CANCELLED") {
        finishExchangeCancelCommand(exchangeCancelStorage, scope.accountKey, exchangeNo, key);
        toast.success(t.value.exchange.cancelDone, t.value.exchange.cancelDoneBody);
        return "cancelled";
      }
      if (updated && !exchangeOrderCanCancel(updated)) {
        finishExchangeCancelCommand(exchangeCancelStorage, scope.accountKey, exchangeNo, key);
        toast.info(t.value.exchange.cancelNotAllowed);
        return "not-cancellable";
      }
    } catch {
      // Keep the command key so a later retry is the same idempotent request.
      if (!isCurrentExchangeCancelScope(scope, captureAccountScope()) || app.accountKey !== scope.accountKey) return "stale";
      remoteState.value = null;
      remoteError.value = "G2_REMOTE_AUTHORITY_UNAVAILABLE";
    }
    toast.error(t.value.exchange.cancelUnknownTitle, t.value.exchange.cancelUnknownBody);
    return "unknown";
  } finally {
    if (cancellingOrderNo.value === exchangeNo) cancellingOrderNo.value = null;
  }
}

function handleCancelQueued(exchangeNo: string) {
  if (cancellingOrderNo.value) return;
  void cancelRemoteOrder(exchangeNo);
}

function cancelQueueButtonStyle(disabled: boolean): CSSProperties {
  return {
    minHeight: "24px",
    padding: "0 8px",
    borderRadius: "999px",
    background: disabled ? "var(--v5-surface-3)" : "color-mix(in srgb, var(--v5-danger) 10%, transparent)",
    color: disabled ? "var(--v5-ink-4)" : "var(--v5-danger)",
    fontSize: "12px",
    pointerEvents: disabled ? "none" : "auto",
  };
}

const history = computed<SwapEvent[]>(() => {
  if (!remoteApiEnabled) return exchange.history;
  return (remoteState.value?.orders ?? []).map((order) => ({
    id: order.exchangeNo,
    ts: order.createdAt ?? 0,
    fromSym: order.fromAsset,
    toSym: order.toAsset,
    fromAmount: order.fromAmount,
    toAmount: order.toAmount,
    rate: order.rate,
  }));
});
// remote mode must never render persisted exchange or v3 facts.
const displayUserUsed = computed(() => remoteApiEnabled ? (remoteState.value?.todayUserUsedUsdt ?? 0) : v3.todayUserUsedUSD);
const displayPlatformUsed = computed(() => remoteApiEnabled ? (remoteState.value?.todayPlatformUsedUsdt ?? 0) : v3.todayPlatformUsedUSD);
const displayUserCap = computed(() => remoteApiEnabled ? (remoteState.value?.caps.userDailyCapUsdt ?? 0) : USER_DAILY_CAP_USD);
const displayPlatformCap = computed(() => remoteApiEnabled ? (remoteState.value?.caps.platformDailyCapUsdt ?? 0) : PLATFORM_DAILY_CAP_USD);
const displayQueue = computed(() => remoteApiEnabled
  ? visibleQueuedExchangeOrders(remoteState.value?.orders ?? []).map((order) => ({
    id: order.exchangeNo,
    amountUSD: order.fromAsset === "USDT" ? order.fromAmount : order.toAmount,
    direction: order.fromAsset === "NEX" ? "nex2usdt" as const : "usdt2nex" as const,
  }))
  : v3.queue);
const rate = computed(() => remoteApiEnabled ? (remoteState.value?.caps.currentPrice ?? 0) : exchange.rate);

const direction = ref<"usdt2nex" | "nex2usdt">("nex2usdt");
const input = ref("");
const secsAgo = ref(0);

// Roll daily counters on mount.
onMounted(() => {
  if (remoteApiEnabled) {
    void syncRemoteState().catch(() => toast.error(t.value.exchange.remoteUnavailableToast));
    return;
  }
  // Explicit mock mode only: local counters and local wallet receipts are never remote success.
  v3.resetIfNewDay();
});

// Periodic rate refresh (15s) + "n seconds ago" ticker (500ms). Page-level
// component → clean up in onUnmounted (P-021).
let rateTimer: ReturnType<typeof setInterval> | null = null;
let agoTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  if (remoteApiEnabled) {
    rateTimer = setInterval(() => { void syncRemoteState().catch(() => {}); }, 15000);
    return;
  }
  rateTimer = setInterval(() => exchange.refreshRate(), 15000);
  agoTimer = setInterval(() => {
    secsAgo.value = Math.floor((Date.now() - exchange.rateUpdatedAt) / 1000);
  }, 500);
});
onUnmounted(() => {
  if (rateTimer) clearInterval(rateTimer);
  if (agoTimer) clearInterval(agoTimer);
});

const fromSym = computed(() => (direction.value === "usdt2nex" ? "USDT" : "NEX"));
const toSym = computed(() => (direction.value === "usdt2nex" ? "NEX" : "USDT"));
const fromBal = computed(() => {
  if (remoteApiEnabled) return direction.value === "usdt2nex"
    ? (remoteState.value?.wallet.usdtAvailable ?? 0)
    : (remoteState.value?.wallet.nexAvailable ?? 0);
  return direction.value === "usdt2nex" ? app.user.usdtBalance : app.user.nexBalance;
});
const minFrom = computed(() => (direction.value === "usdt2nex" ? 1 : 10));

/**
 * 🔴 **账本精度 = 2 位,两个币种都是**:app.ts 的 creditBalance / debitBalance /
 * creditNex / debitNex 落账时一律 `+(...).toFixed(2)` —— 0.01 就是这个平台真正能
 * 成交的最小单位。报价、展示、成交必须**全部站在这一个精度上**:
 *   · 有一处比它**粗** → 用户看到的不是实际到账的数(展示「12 NEX」实入 11.76,每笔差 0.24);
 *   · 有一处比它**细** → 展示的小数位落账时被账本抹掉(报价 10.5374 实入 10.54)。
 * 所以 money() 只此一个取整口径,报价 / 输入 / 展示三条路径共用,不给「二次舍入」留位置。
 */
const money = (n: number): number => +n.toFixed(2);
/** 展示口径与 money() 同精度 —— 屏幕上的数 = 报价的数 = 落账的数。 */
const amtLabel = (n: number): string =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 输入在**进入资金链路的那一刻**就归到账本精度:此后报价 / 额度门 / 扣款 / 账单 / 历史
// 拿到的是同一个数。留着 1.2345 往下走的话,弹窗显示 1.23、账本扣 1.23、账单却记 1.2345。
const fromAmount = computed(() => {
  const n = parseFloat(input.value || "0");
  return isNaN(n) ? 0 : money(n);
});
/**
 * 报价公式**单源**:页面展示与「确认后复验」跑同一个函数、同一套取整。
 * 分成两份写的话,复验永远只是在跟自己的复制品比对 —— 判据自证,漂移照样漏过去。
 */
function quoteTo(dir: "usdt2nex" | "nex2usdt", from: number, r: number): number {
  if (from === 0) return 0;
  return money(dir === "usdt2nex" ? from / r : from * r);
}
const toAmount = computed(() => quoteTo(direction.value, fromAmount.value, rate.value));
const overBalance = computed(() => fromAmount.value > fromBal.value);
const underMin = computed(() => fromAmount.value > 0 && fromAmount.value < minFrom.value);
const valid = computed(() => fromAmount.value > 0 && !overBalance.value && !underMin.value);
/**
 * 🔴 提交在途守卫(范式同 wallet-cards-new.vue 的 isBinding:`ref(false)` 挂在
 * **组件实例**上,不用 checkout.vue 那个模块级 `let` —— 模块级变量跨实例共享,
 * 任一提前 return 忘复位就把后续所有兑换永久锁死)。
 * 置位点在**第一个 await 之前**,复位统一交给 finally:确认弹窗打开的那几秒
 * 页面还活着,不挡就能叠出第二个弹窗 → 两次确认 = 两条完整兑换链。
 */
const submitting = ref(false);
const ctaEnabled = computed(() => valid.value && !submitting.value);
// USD value of this swap = the leg denominated in USDT
const swapUSDValue = computed(() => (direction.value === "usdt2nex" ? fromAmount.value : toAmount.value));

// uni input event → e.detail.value (typed Event; mirrors topup-card-form).
function detailVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onInput(e: Event) {
  input.value = detailVal(e).replace(/[^0-9.]/g, "");
}
function setMax() {
  // 提交在途时输入面整体冻结(输入框有 :disabled,这两个裸 <view @click> 入口没有)。
  // 快照已让改动动不了钱,但页面会立刻显示与刚确认的弹窗不同的数字,同一笔出现两个口径。
  if (submitting.value) return;
  input.value = String(fromBal.value);
}
function flip() {
  if (submitting.value) return;
  direction.value = direction.value === "usdt2nex" ? "nex2usdt" : "usdt2nex";
  input.value = "";
}

function onRefresh() {
  if (remoteApiEnabled) {
    void syncRemoteState()
      .then(() => toast.info(t.value.exchange.remoteRefreshed))
      .catch(() => toast.error(t.value.exchange.remoteUnavailableToast));
    return;
  }
  exchange.refreshRate();
  toast.info(t.value.exchange.quoteRefreshing);
}
function goHowItWorks() {
  uni.navigateTo({ url: "/pages/me/wallet-exchange-how", fail: () => {} });
}

function notifyRemoteSwapResult(order: ExchangeOrder) {
  if (order.status === "COMPLETED" || order.status === "SUCCESS") {
    toast.success(t.value.exchange.swapped);
    return;
  }
  if (order.status === "QUEUED") {
    toast.info(
      t.value.exchange.queuedToastTitle,
      fmt(t.value.exchange.queuedToastBody, { amount: (order.fromAsset === "USDT" ? order.fromAmount : order.toAmount).toFixed(2) }),
    );
    return;
  }
  const reason = {
    CANCELLED: t.value.exchange.swapCancelledReason,
    USER_CAP: t.value.exchange.swapUserCapReason,
    PLATFORM_CAP: t.value.exchange.swapPlatformCapReason,
    GEO_BLOCKED: t.value.exchange.swapGeoBlockedReason,
  }[order.status];
  toast.error(reason ?? fmt(t.value.exchange.swapNotFilled, { status: order.status }), order.exchangeNo);
}

async function handleConfirm() {
  // 🔴 重入守卫排在最前:无守卫时连点两次会排队两条完整兑换链,而第二条的额度门
  // 读到的还是第一条 v3.record 之前的计数 —— 两笔都放行,日限直接翻倍。
  if (submitting.value) return;
  if (!valid.value) return;

  // 🔴 **成交快照冻在第一个 await 之前**(范式同 wallet-withdraw.vue 的 snap)。
  // 方向 / 币种 / 金额 / 到账额 / 汇率 / USD 计值 / 账号 一次冻结;额度门、弹窗文案、
  // 扣款、入账、记账、日限计数全部只读这一份。
  // 此前它们全是活读,而「确认弹窗 + 900ms 结算延迟」这段窗口里:汇率每 15s 自己跳、
  // 用户还能翻方向 / 改金额 —— 实际成交与用户点「确认」时看到的不是同一笔;
  // 额度门更只在确认那一刻按当时的值校验过一次,确认后把金额改大即可绕过每日额度。
  // 币种取 store 的类型单源(SwapEvent),不让对象字面量把 "USDT"|"NEX" 宽化成 string。
  const snap = {
    direction: direction.value,
    fromSym: fromSym.value as SwapEvent["fromSym"],
    toSym: toSym.value as SwapEvent["toSym"],
    fromAmount: fromAmount.value,
    toAmount: toAmount.value,
    rate: rate.value,
    usd: swapUSDValue.value,
    account: app.accountKey,
    remoteBaseline: remoteState.value,
  };

  submitting.value = true;
  // settled 记录「这笔到底成交了没有」—— 下面 catch 里那句资金断言必须跟它走,
  // 不能无条件说「一分没动」。见 catch 处注释。
  let settled = false;
  try {
    if (remoteApiEnabled) {
      const ok = await confirm({
        title: t.value.exchange.confirm,
        message: `${snap.fromSym} ${amtLabel(snap.fromAmount)} → ${snap.toSym} ${amtLabel(snap.toAmount)}`,
        icon: "info",
        confirmLabel: t.value.exchange.confirm,
      });
      if (!ok) return;
      if (app.accountKey !== snap.account || !snap.remoteBaseline) {
        toast.error(t.value.exchange.quoteStaleTitle, t.value.exchange.quoteStaleContext);
        return;
      }
      const directionCode = snap.direction === "usdt2nex" ? "USDT_TO_NEX" : "NEX_TO_USDT";
      const intent: ExchangeSwapIntent = {
        direction: directionCode,
        fromAmount: snap.fromAmount,
        queueIfCapped: true,
      };
      const result = await executeExchangeSwap<ExchangeSnapshot>({
        pending: pendingExchangeMutations,
        accountKey: snap.account,
        intent,
        baseline: snap.remoteBaseline,
        swap: (idempotencyKey) => exchangeApi.swap(directionCode, snap.fromAmount, true, idempotencyKey),
        fetchState: () => exchangeApi.fetchState(),
      });
      if (app.accountKey !== snap.account) {
        await syncRemoteState();
        toast.info(t.value.exchange.accountSwitchedRefreshed);
        return;
      }
      remoteState.value = result.snapshot;
      remoteError.value = null;
      if (["COMPLETED", "SUCCESS", "QUEUED"].includes(result.order.status)) input.value = "";
      notifyRemoteSwapResult(result.order as ExchangeOrder);
      return;
    }
    // v3 gate: cap / queue —— 判的是**快照金额**,后面扣的也是它(同一个数)。
    // 兑换只受汇率、日限、平台额度与地理限制约束。
    const gate = v3.canExchange(snap.usd);
    if (!gate.ok) {
      if (gate.reason === "user-cap") {
        const queueIt = await confirm({
          title: t.value.exchange.capReachedTitle,
          message: fmt(t.value.exchange.capReachedMessage, {
            used: gate.usedToday.toFixed(2),
            cap: String(gate.cap),
            amount: snap.usd.toFixed(2),
          }),
          icon: "warn",
          confirmLabel: t.value.exchange.capReachedConfirm,
        });
        if (queueIt) {
          v3.enqueue({ amountUSD: snap.usd, direction: snap.direction });
          toast.info(
            t.value.exchange.queuedToastTitle,
            fmt(t.value.exchange.queuedToastBody, { amount: snap.usd.toFixed(2) }),
          );
        }
        return;
      }
      if (gate.reason === "platform-cap") {
        toast.error(
          t.value.exchange.platformExhaustedTitle,
          fmt(t.value.exchange.platformExhaustedBody, { cap: (gate.cap / 1000).toFixed(0) }),
        );
        return;
      }
    }

    const ok = await confirm({
      title: t.value.exchange.confirm,
      // 🔴 弹窗数字与到账数字必须逐位相同 —— 走同一个 amtLabel,不在这里另立取整规则。
      // 曾经这行对 NEX 取整到 0 位:1 USDT @0.085 展示「12 NEX」,实入 11.76,每笔差 0.24。
      message: `${snap.fromSym} ${amtLabel(snap.fromAmount)} → ${snap.toSym} ${amtLabel(snap.toAmount)}`,
      icon: "info",
      confirmLabel: t.value.exchange.confirm,
    });
    if (!ok) return;

    toast.info(t.value.exchange.confirmingToast);
    // 结算延迟(MOCK:真实现是兑换提交 endpoint〔TBD;PRD 未定义〕的往返)。写成 await 而不是 setTimeout 回调 ——
    // 回调版的守卫在函数返回时就复位了,等于没守;await 让整条链留在同一个 try/finally 里。
    await new Promise((r) => setTimeout(r, 900));

    // 🔴 **确认后复验**:快照对**当前**权威值还成不成立。不成立一律拒单重报价,
    // 绝不静默按新值成交 —— 用户确认的是 A,扣的就必须是 A,否则宁可什么都不发生。
    //  ① 汇率:拿**当前**汇率按同一个 quoteTo 重算到账额;变了就是漂移。
    //     (反过来用快照汇率复验快照报价,等式恒成立,这道门等于没有。)
    if (quoteTo(snap.direction, snap.fromAmount, rate.value) !== snap.toAmount) {
      toast.error(t.value.exchange.quoteStaleTitle, t.value.exchange.quoteStaleRate);
      return;
    }
    //  ② 账号:确认期间换号 → 钱会扣在新账号头上,而弹窗展示的是旧账号的数。
    //  ③ 额度:再问一次同一个门(入参仍是快照金额)。
    //     ⚠️ 这只收口**本标签页**;计数器自身的跨标签页竞态是 exchange-v3.ts 的独立缺陷,不在本次范围。
    if (app.accountKey !== snap.account || !v3.canExchange(snap.usd).ok) {
      toast.error(t.value.exchange.quoteStaleTitle, t.value.exchange.quoteStaleContext);
      return;
    }

    // ⚠️ MOCK-ONLY CROSS-STORE MUTATION (NON-ATOMIC):debit + credit + recordSwap +
    // bills + v3.record 是分开的写。PRODUCTION:POST /api/exchange/swap 单事务提交,
    // 带 Idempotency-Key(PRD §9.4.3;阈值走 GET /api/config/exchange/caps,
    //  全局暂停走 POST /api/admin/exchange/pause)。
    // 🔴 一进一出两腿 + 两条分录 = **一笔交易**,走多腿收口点一次提交(2026-08-04 R4)。
    // 原实现:debit → credit → 两次裸 billsStore.add。bills.add 写不进去时返回 null 且不抛
    // 异常、没人接 —— 钱两边都动了、弹「兑换完成」,账单页却只有半边甚至一条都没有。
    // 收口后:资金两腿与两条分录同生共死(分录一次落盘,不存在"落了一条"的中间态);
    // 任何一环失败 → restoreMoney 精确还原资金三元组(含 withdrawableUsdt)+ 明确报错。
    // recordSwap 放在提交成功之后:它是这笔交易的**流水快照**,交易没成就不该有这条记录。
    const swapMemo = `Swap ${snap.fromSym} → ${snap.toSym}`;
    const swapRef = `SWAP-${Date.now().toString(36).toUpperCase()}`;
    const posted = postMoneyBills([
      { type: "swap", amount: -snap.fromAmount, symbol: snap.fromSym, status: "posted", memo: swapMemo, ref: swapRef },
      { type: "swap", amount: snap.toAmount, symbol: snap.toSym, status: "posted", memo: swapMemo, ref: swapRef },
    ]);
    if (posted === "insufficient") {
      toast.error(
        t.value.exchange.insufficientTitle,
        t.value.exchange.insufficientMessage.replace("{sym}", snap.fromSym),
      );
      return;
    }
    if (posted !== "ok") return; // 落盘失败:资金已还原、账上无记录、收口点已提示
    settled = true; // 过了这行 = 资金真的动过,此后任何拒绝都不许再说「一分没动」

    exchange.recordSwap({
      fromSym: snap.fromSym,
      toSym: snap.toSym,
      fromAmount: snap.fromAmount,
      toAmount: snap.toAmount,
      rate: snap.rate,
    });

    // Commit to v3 daily counters + lifetime
    v3.record(snap.usd);

    toast.success(
      t.value.exchange.swapped,
      t.value.exchange.swappedDetail
        .replace("{from}", snap.fromSym)
        .replace("{fromAmt}", amtLabel(snap.fromAmount))
        .replace("{to}", snap.toSym)
        .replace("{toAmt}", amtLabel(snap.toAmount)),
    );
    input.value = "";
  } catch (err) {
    if (remoteApiEnabled) {
      if (err instanceof ExchangeOutcomeUnknownError) {
        if (app.accountKey === snap.account && err.authoritativeState) {
          remoteState.value = err.authoritativeState as ExchangeSnapshot;
        } else if (app.accountKey !== snap.account) {
          await syncRemoteState().catch(() => {});
        }
        remoteError.value = "G2_SWAP_OUTCOME_UNKNOWN";
        toast.error(t.value.exchange.outcomeUnknownTitle, t.value.exchange.outcomeUnknownBody);
        return;
      }
      remoteState.value = null;
      remoteError.value = "G2_REMOTE_AUTHORITY_UNAVAILABLE";
      // 这条路径失败的是用户刚提交的**兑换动作**,不是一次数据读取 —— 与 :268/:370 两处
      // 「拉取失败」共用一句「数据取不到,请稍后再试」会让用户以为刷新一下就好,
      // 而实际是这笔兑换没有成交(独立审查判为文案与实际状态不符)。
      toast.error(t.value.exchange.swapFailed);
      return;
    }
    // A region refusal surfaces on this path as a rejected submit. Translate it
    // into a toast; anything else is not ours to swallow — rethrow so the
    // existing failure behaviour (and the `finally` unlock below) is unchanged.
    const geo = geoPolicyUserMessage(err, t.value.geoPolicy);
    if (!geo) throw err;
    // 资金那句必须跟事实走,不能跟期望走:本 catch 在生产形态下可能落在
    // 「已部分落账后重试」的下游,那时说「一分没动」就是当面撒谎(本仓在
    // wallet-repurchase.vue 已为同形错误踩过一次)。settled 为真即已成交过,
    // 此时只报拒绝原因、不做资金断言。
    toast.error(geo, settled ? undefined : t.value.geoPolicy.fundsSafeNote);
  } finally {
    // 所有出口(含取消 / 拒单 / 抛异常)统一解锁 —— 复位点只有一个,不会有分支漏掉。
    submitting.value = false;
  }
}

// ── derived labels ──
const minLabel = computed(() => t.value.exchange.minAmount.replace("{n}", String(minFrom.value)).replace("{sym}", fromSym.value));
const fromBalLabel = computed(() => (fromSym.value === "USDT" ? fromBal.value.toFixed(2) : fromBal.value.toLocaleString()));
const toAmountLabel = computed(() => amtLabel(toAmount.value));
const rateLabel = computed(() => t.value.exchange.rate.replace("{rate}", rate.value.toFixed(5)));
const updatedLabel = computed(() => t.value.exchange.rateLastUpdated.replace("{n}", String(secsAgo.value)));
const errorLabel = computed(() =>
  overBalance.value
    ? t.value.exchange.insufficientMessage.replace("{sym}", fromSym.value)
    : t.value.exchange.minAmount.replace("{n}", String(minFrom.value)).replace("{sym}", fromSym.value),
);
const queuedLabel = computed(() => fmt(t.value.exchange.queuedLabel, { n: String(displayQueue.value.length) }));
// 历史行同样走 amtLabel:历史与余额对不上,多半就是这里自己又取了一次整。
function swapLine(h: SwapEvent): string {
  return `${amtLabel(h.fromAmount)} ${h.fromSym} → ${amtLabel(h.toAmount)} ${h.toSym}`;
}

// ── styles ──
const topRowStyle: CSSProperties = { padding: "0 16px 8px", gap: "8px" };
const howStyle: CSSProperties = {
  height: "44px",  // 《07》tap≥44(原 34)
  padding: "0 12px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
};
const refreshBtnStyle: CSSProperties = {
  marginLeft: "auto",
  width: "44px",
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-surface)",
};
// Recessed swap field (topup tone): surface-2 fill, no border — pay/receive read
// as a matched field pair around the flip control, numbers stay full-ink.
const swapCardStyle: CSSProperties = {
  margin: "0 16px",
  background: "var(--v5-surface-2)",
  borderRadius: "16px",
  padding: "16px",
};
const cardLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-ink-3)",
};
const amountInputStyle: CSSProperties = {
  background: "transparent",
  fontFamily: "var(--font-v5)",
  fontSize: "26px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const receiveValueStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "26px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const maxBtnStyle: CSSProperties = {
  minHeight: "44px",
  margin: "-12px -8px -12px 0",
  padding: "0 10px",
  borderRadius: "6px",
  fontSize: "12px",
};
const flipBtnStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)",
};
const feeRowStyle: CSSProperties = { margin: "8px 16px 0" };
const errorStyle: CSSProperties = {
  margin: "12px 16px 0",
  padding: "8px 12px",
  borderRadius: "8px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  fontSize: "12px",
  color: "var(--v5-brand-2)",
};
const confirmStyle = computed<CSSProperties>(() => ({
  height: "44px",
  borderRadius: "12px",
  background: ctaEnabled.value ? "var(--v5-brand)" : "var(--v5-surface-2)",
}));
const confirmTextStyle = computed<CSSProperties>(() => ({
  fontSize: "13px",
  fontWeight: 600,
  color: ctaEnabled.value ? "var(--v5-on-brand)" : "var(--v5-ink-4)",
}));
const infoStyle: CSSProperties = {
  margin: "16px 16px 0",
  padding: "10px 12px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-brand-2) 8%, transparent)",
  fontSize: "12px",
  color: "color-mix(in srgb, var(--v5-brand-2) 90%, transparent)",
  lineHeight: 1.625,
};
// De-carded: the risk-control dashboard sits on the page floor; the mono title
// opens it and the inner queue hairlines carry the section breaks.
const dashStyle: CSSProperties = {
  margin: "16px 16px 0",
  padding: "0 2px",
};
const dashTitleStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-ink-3)",
};
const barTrackStyle: CSSProperties = {
  height: "6px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  overflow: "hidden",
};
const userBarStyle = computed<CSSProperties>(() => {
  const pct = remoteApiEnabled
    ? Math.min(1, displayUserUsed.value / Math.max(displayUserCap.value, 1))
    : dailyUserPctUsed(v3.todayUserUsedUSD);
  return {
    height: "100%",
    width: `${pct * 100}%`,
    borderRadius: "999px",
    background: pct >= 0.85 ? "var(--v5-brand-2)" : "var(--v5-brand)",
    transition: "width 600ms cubic-bezier(0.16,1,0.3,1)",
  };
});
const platformBarStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${remoteApiEnabled
    ? Math.min(1, displayPlatformUsed.value / Math.max(displayPlatformCap.value, 1)) * 100
    : dailyPlatformPctUsed(v3.todayPlatformUsedUSD) * 100}%`,
  borderRadius: "999px",
  background: "var(--v5-brand-2)",
  transition: "width 600ms cubic-bezier(0.16,1,0.3,1)",
}));
const queueWrapStyle: CSSProperties = {
  marginTop: "12px",
  paddingTop: "12px",
  borderTop: "1px solid var(--v5-border)",
};
const queueTitleStyle: CSSProperties = {
  marginBottom: "6px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-warning)",
};
// Section label (de-card spec): 15px/600/ink at the 18px content edge.
const historyTitleStyle: CSSProperties = {
  padding: "0 2px 12px",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.012em",
  color: "var(--v5-ink)",
};
// Empty state (de-card white-list): dashed outline, no fill.
const historyEmptyStyle: CSSProperties = {
  border: "1px dashed var(--v5-border-strong)",
  borderRadius: "16px",
  padding: "24px",
  textAlign: "center",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
// Transparent hairline group: container border-top opens it, rows self-divide.
const historyListStyle: CSSProperties = {
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
function historyRowStyle(i: number): CSSProperties {
  return {
    gap: "12px",
    padding: "12px 0",
    borderTop: i !== 0 ? "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)" : "none",
  };
}
const historyIconStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "8px",
  background: "color-mix(in srgb, var(--v5-brand) 10%, transparent)",
};
const historyMainStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)",
};
const historySubStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-4)" };
</script>
