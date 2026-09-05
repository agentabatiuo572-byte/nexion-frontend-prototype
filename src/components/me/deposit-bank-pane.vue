<!--
  DepositBankPane — 充值页「银行转账」通道段(PAY-规格 [FEAT-PAY02] 全部 + [FEAT-PAY03] 消费面)。
  视图随 deposits.intents 派生(状态 server-canonical,mock 引擎在 store;本组件唯一
  可写动作 = 生成付款单 / 取消 awaiting 单,与规格 ④「client 仅可取消」一致):
    form(金额输入 + 实时 ≈VND)→ order(VietQR + 收款账户 + 附言码 + 真倒计时)→
    waiting(「我已完成转账」仅 UI 等待提示,不改单状态)→ credited / expired / mismatch_review。
  牌价消费面:FxRateLine 顶部自治;fxAvailable=false 段内容置灰禁下单(② 异常1),
  换算 vndForUsdt 精确到盾、fmtVnd 千分位;牌价未返回换算位「—」不显示 0。
-->
<template>
  <view class="mx-4" style="padding: 0 2px">
    <FundsSandboxBadge />
    <FxRateLine />
    <view v-if="createError" style="margin-top: 10px; padding: 10px 12px; border-radius: 10px; background: var(--v5-danger-soft)">
      <text class="block break-all" style="font-size: 12px; line-height: 1.5; color: var(--v5-danger)">{{ createError }}</text>
    </view>

    <!-- ── 下单前:金额输入 + 生成付款单 ── -->
    <template v-if="paneView === 'form'">
      <!-- 收款账户池无可用账户 → 通道维护空状态([FEAT-PAY02] ⑤;segment 侧同步置灰) -->
      <view v-if="!bankRailAvailable" class="flex flex-col items-center" style="padding: 36px 0 28px">
        <view class="grid place-items-center" :style="pausedIconStyle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M10 15V9" /><path d="M14 15V9" /></svg>
        </view>
        <view><text class="block text-center" style="margin-top: 10px; font-size: 12px; color: var(--v5-ink-3); line-height: 1.45; max-width: 260px">{{ t.bankPane.railPaused }}</text></view>
      </view>

      <view v-else :style="fxUsable ? undefined : disabledWrapStyle" :aria-disabled="!fxUsable">
        <view class="rounded-2xl" :style="amountBoxStyle">
          <view><text class="block font-mono-tabular" :style="metaLabelStyle">{{ t.bankPane.amountLabel }}</text></view>
          <view class="flex items-baseline" style="margin-top: 4px; gap: 6px">
            <input
              class="flex-1 min-w-0 tabular-nums"
              :style="amountInputStyle"
              type="text"
              inputmode="decimal"
              :value="amount"
              placeholder="0.00"
              :disabled="!fxUsable"
              @input="onAmount"
            />
            <text class="font-mono-tabular" style="font-size: 15px; color: var(--v5-ink-3)">USDT</text>
          </view>
          <view style="margin-top: 8px">
            <text class="tabular-nums" style="font-size: 13px; color: var(--v5-ink-2); font-weight: 600; white-space: nowrap">{{ vndPreview }}</text>
          </view>
          <view v-if="amountError"><text class="block" :style="errTextStyle">{{ amountError }}</text></view>
        </view>

        <view class="flex items-center justify-between" style="margin-top: 10px; padding: 0 4px; gap: 8px">
          <view class="min-w-0"><text style="font-size: 12px; color: var(--v5-ink-3)">{{ feeNote }}</text></view>
          <view class="shrink-0"><text style="font-size: 12px; color: var(--v5-ink-3); white-space: nowrap">{{ limitLine }}</text></view>
        </view>

        <view
          :class="['nx-bank-create-cta w-full grid place-items-center', ctaEnabled ? 'active:opacity-90' : '']"
          :style="createBtnStyle"
          role="button" tabindex="0"
          :aria-disabled="!ctaEnabled"
          @click="createOrder()"
        >
          <view class="inline-flex items-center" style="gap: 8px">
            <view v-if="creating" :style="miniSpinnerStyle" />
            <text>{{ creating ? t.bankPane.creating : t.bankPane.createCta }}</text>
          </view>
        </view>
      </view>
    </template>

    <!-- ── 付款单(awaiting_payment)── -->
    <template v-else-if="paneView === 'order' && intent">
      <view class="nx-step-in" style="margin-top: 14px">
        <view><text class="block text-center tabular-nums" style="font-size: 13px; color: var(--v5-ink-3)">{{ fmt(t.bankPane.countdown, { time: countdownText }) }}</text></view>
        <view><text class="block text-center tabular-nums" style="margin-top: 8px; font-family: var(--font-v5); font-size: 26px; font-weight: 600; color: var(--v5-ink); white-space: nowrap">{{ fmtVnd(intent.vndAmount) }}</text></view>
        <view><text class="block text-center" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ creditLineText }}</text></view>

        <!-- 远程没有服务端签发的二维码载荷时，禁止展示本地点阵与扫码文案。 -->
        <view v-if="intent.qrPayload" :style="qrBoxStyle">
          <image :src="intent.qrPayload" mode="aspectFit" style="width: 100%; height: 100%" />
        </view>
        <view v-if="intent.qrPayload"><text class="block text-center" style="margin-top: 8px; font-size: 12px; color: var(--v5-ink-3)">{{ t.bankPane.scanHint }}</text></view>

        <!-- 收款账户(完整账号,转账要用,不脱敏;规格 ③) -->
        <view style="margin-top: 14px">
          <view class="flex items-center justify-between" :style="bankRowStyle">
            <view class="shrink-0"><text :style="bankKeyStyle">{{ t.bankPane.accountName }}</text></view>
            <view class="min-w-0"><text :style="bankValStyle">{{ intent.bankAccount.accountName }}</text></view>
          </view>
          <view class="flex items-center justify-between" :style="bankRowStyle">
            <view class="shrink-0"><text :style="bankKeyStyle">{{ t.bankPane.accountNo }}</text></view>
            <view class="flex items-center min-w-0" style="gap: 4px">
              <text class="font-mono-tabular" :style="bankValStyle" style="white-space: nowrap">{{ intent.bankAccount.accountNumber }}</text>
              <view
                class="nx-bank-copy-account-cta grid place-items-center shrink-0 active:opacity-80"
                :style="copyIconBtnStyle"
                role="button" tabindex="0"
                :aria-label="t.bankPane.copyCta"
                @click="copyAccount"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
              </view>
            </view>
          </view>
          <view class="flex items-center justify-between" :style="bankRowStyle">
            <view class="shrink-0"><text :style="bankKeyStyle">{{ t.bankPane.bankLabel }}</text></view>
            <view class="min-w-0"><text :style="bankValStyle">{{ intent.bankAccount.bankName }}</text></view>
          </view>
        </view>

        <!-- 附言码强调块 + 复制(转账匹配的生命线,规格「务必填写」) -->
        <view class="flex items-center justify-between" :style="memoBoxStyle">
          <view class="flex-1 min-w-0">
            <text class="block font-mono-tabular" :style="metaLabelStyle">{{ t.bankPane.memoLabel }}</text>
            <text class="block font-mono-tabular" :style="memoCodeStyle">{{ intent.memoCode }}</text>
          </view>
          <view class="nx-bank-copy-memo-cta grid place-items-center shrink-0 active:opacity-80" :style="memoCopyBtnStyle" role="button" tabindex="0" @click="copyMemo">
            <text style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ t.bankPane.copyCta }}</text>
          </view>
        </view>

        <!-- 三步指引 -->
        <view style="margin-top: 14px">
          <view v-for="(s, i) in steps" :key="i" class="flex items-start" style="gap: 10px; padding: 5px 0">
            <view class="grid place-items-center shrink-0" :style="stepNumStyle"><text style="font-size: 12px; font-weight: 600; color: var(--v5-brand)">{{ i + 1 }}</text></view>
            <view class="flex-1 min-w-0"><text style="font-size: 13px; color: var(--v5-ink-2); line-height: 1.5">{{ s }}</text></view>
          </view>
        </view>

        <view class="nx-bank-paid-cta w-full grid place-items-center active:opacity-90" :style="paidBtnStyle" role="button" tabindex="0" @click="paidPressed = true">
          <text>{{ t.bankPane.paidCta }}</text>
        </view>
        <!-- 取消 = ghost 弱权重(转化场景 cancel 必明显弱于主 CTA);仅 awaiting 态 -->
        <view class="nx-bank-cancel-cta w-full grid place-items-center active:opacity-70" :style="ghostBtnStyle" role="button" tabindex="0" @click="askCancel">
          <text :style="ghostTextStyle">{{ t.bankPane.cancelCta }}</text>
        </view>
      </view>
    </template>

    <!-- ── 等待回调(仅 UI 等待提示,单仍 awaiting;到点过期由 store 引擎翻面)── -->
    <template v-else-if="paneView === 'waiting'">
      <view class="flex flex-col items-center nx-step-in" style="padding: 36px 0 8px">
        <view class="nx-bank-pulse grid place-items-center" :style="waitIconStyle">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
        </view>
        <view><text class="block text-center" :style="stateTitleStyle">{{ t.bankPane.waitingTitle }}</text></view>
        <view><text class="block text-center" :style="stateBodyStyle">{{ t.bankPane.waitingBody }}</text></view>
      </view>
      <view class="nx-bank-support-link w-full grid place-items-center active:opacity-70" :style="ghostBtnStyle" role="button" tabindex="0" @click="goSupport">
        <text :style="ghostTextStyle">{{ t.topupChrome.depositNotArrived }}</text>
      </view>
    </template>

    <!-- ── 成功(credited)── -->
    <template v-else-if="paneView === 'credited' && intent">
      <view class="flex flex-col items-center nx-step-in" style="padding: 32px 0 8px">
        <view class="grid place-items-center" :style="successIconStyle">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>
        </view>
        <view><text class="block text-center" :style="stateTitleStyle">{{ t.bankPane.successTitle }}</text></view>
        <view>
          <text class="block text-center tabular-nums" style="margin-top: 8px; font-family: var(--font-v5); font-size: 20px; font-weight: 600; color: var(--v5-brand); white-space: nowrap">+{{ creditedUsdt.toFixed(2) }} USDT</text>
        </view>
        <view><text class="block text-center" :style="stateBodyStyle">{{ fmt(t.bankPane.successLine, { rate: rateText }) }}</text></view>
      </view>
      <view class="nx-bank-done-cta w-full grid place-items-center active:opacity-90" :style="paidBtnStyle" role="button" tabindex="0" @click="done">
        <text>{{ t.bankPane.doneCta }}</text>
      </view>
      <view class="nx-bank-bills-link w-full grid place-items-center active:opacity-70" :style="ghostBtnStyle" role="button" tabindex="0" @click="goBills">
        <text :style="ghostTextStyle">{{ t.bankPane.viewBills }}</text>
      </view>
    </template>

    <!-- ── 过期(expired;迟到转账已登记时加人工核对行)── -->
    <template v-else-if="paneView === 'expired' && intent">
      <view class="flex flex-col items-center nx-step-in" style="padding: 32px 0 8px">
        <view class="grid place-items-center" :style="expiredIconStyle">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
        <view><text class="block text-center" :style="stateTitleStyle">{{ t.bankPane.expiredTitle }}</text></view>
        <view><text class="block text-center" :style="stateBodyStyle">{{ fmt(t.bankPane.expiredBody, { min: lockMinText }) }}</text></view>
      </view>
      <view v-if="intent.receivedVnd" class="flex" :style="warnRowStyle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="margin-top: 1px"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
        <view class="flex-1 min-w-0"><text :style="warnTextStyle">{{ t.bankPane.lateNote }}</text></view>
      </view>
      <view
        :class="['nx-bank-regen-cta w-full grid place-items-center', creating ? '' : 'active:opacity-90']"
        :style="paidBtnStyle"
        role="button" tabindex="0"
        :aria-disabled="creating"
        @click="regen"
      >
        <view class="inline-flex items-center" style="gap: 8px">
          <view v-if="creating" :style="miniSpinnerStyle" />
          <text>{{ creating ? t.bankPane.creating : t.bankPane.regenCta }}</text>
        </view>
      </view>
      <view class="nx-bank-support-link w-full grid place-items-center active:opacity-70" :style="ghostBtnStyle" role="button" tabindex="0" @click="goSupport">
        <text :style="ghostTextStyle">{{ t.topupChrome.depositNotArrived }}</text>
      </view>
    </template>

    <!-- ── 金额不符(mismatch_review 黄警示态)── -->
    <template v-else-if="paneView === 'mismatch' && intent">
      <view class="flex flex-col items-center nx-step-in" style="padding: 32px 0 8px">
        <view class="grid place-items-center" :style="waitIconStyle">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
        </view>
        <view><text class="block text-center" :style="stateTitleStyle">{{ t.bankPane.mismatchTitle }}</text></view>
      </view>
      <view class="flex" :style="warnRowStyle">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="margin-top: 1px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
        <view class="flex-1 min-w-0"><text :style="warnTextStyle">{{ t.bankPane.mismatchBody }}</text></view>
      </view>
      <view style="margin-top: 10px">
        <view class="flex items-center justify-between" :style="bankRowStyle">
          <view class="shrink-0"><text :style="bankKeyStyle">{{ t.bankPane.expectedLabel }}</text></view>
          <view class="min-w-0"><text class="tabular-nums" :style="bankValStyle" style="white-space: nowrap">{{ fmtVnd(intent.vndAmount) }}</text></view>
        </view>
        <view class="flex items-center justify-between" :style="bankRowStyle">
          <view class="shrink-0"><text :style="bankKeyStyle">{{ t.bankPane.receivedLabel }}</text></view>
          <view class="min-w-0"><text class="tabular-nums" :style="bankValStyle" style="white-space: nowrap">{{ fmtVnd(intent.receivedVnd ?? 0) }}</text></view>
        </view>
      </view>
      <view class="nx-bank-new-topup-cta w-full grid place-items-center active:opacity-70" :style="ghostBtnStyle" role="button" tabindex="0" @click="done">
        <text :style="ghostTextStyle">{{ t.bankPane.newTopupCta }}</text>
      </view>
      <view class="nx-bank-support-link w-full grid place-items-center active:opacity-70" :style="ghostBtnStyle" role="button" tabindex="0" @click="goSupport">
        <text :style="ghostTextStyle">{{ t.topupChrome.depositNotArrived }}</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, type CSSProperties } from "vue";
import FxRateLine from "@/components/me/fx-rate-line.vue";
import FundsSandboxBadge from "@/components/me/funds-sandbox-badge.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navTo } from "@/lib/route";
import { toast, confirm } from "@/store/ui";
import { useDeposits } from "@/store/deposits";
import { useFx } from "@/store/fx";
import { fmtVnd, vndForUsdt } from "@/store/fx-core";
import { mockServerNow } from "@/store/server-time";
import { BANK_MAX_DEPOSIT_USDT, MIN_DEPOSIT_USDT } from "@/store/deposits-core";
import type { DepositIntent } from "@/store/types";
import { mockFundsEnabled, remoteApiEnabled } from "@/api/runtime";
import { runRecoverableFundsOperation } from "@/lib/recoverable-funds-operation";
import { buildVietQrTransferSteps } from "@/lib/vietqr-remote-safety";

const t = useT();
const fx = useFx();
const dep = useDeposits();

// ── 视图派生(单选真源 = store intents;本地只记「正在看哪张单」+ UI 等待旗)──
const viewIntentId = ref<string | null>(null);
const paidPressed = ref(false);

const intent = computed<DepositIntent | null>(
  () => dep.intents.find((i) => i.intentId === viewIntentId.value) ?? null,
);

type PaneView = "form" | "order" | "waiting" | "credited" | "expired" | "mismatch";
const paneView = computed<PaneView>(() => {
  const it = intent.value;
  if (!it || it.status === "cancelled" || it.status === "return_pending") return "form";
  if (it.status === "awaiting_payment") return paidPressed.value ? "waiting" : "order";
  if (it.status === "credited") return "credited";
  if (it.status === "expired") return "expired";
  return "mismatch";
});

// 进段即接管在途单 / 人工核对单(刷新不丢单;credited/expired 旧单不复活)
onMounted(() => {
  if (remoteApiEnabled && !mockFundsEnabled) {
    // 🔴 失败信号改读 store 状态,不再靠 reject:那条缝已按 ADR 改成自吞降级
    //   (docs/changes/2026-08-13-remote-refresh-resilience.md「需要失败信号的消费方
    //   改走返回值 / store 状态字段」)。若继续 .catch,缝不抛了这里就永远拿不到错,
    //   充值页的报错横幅会**静默变哑** —— 改缝必须连消费方一起改,这就是那一半。
    void dep.refreshRemoteVietQrDeposits().then(() => {
      if (dep.serverStatus === "error" && dep.serverError) {
        console.warn("[deposit] refresh failed:", dep.serverError);
        createError.value = t.value.topupChrome.depositOpFailedNote;
      }
    });
    dep.startRemoteVietQrPolling();
  }
  const resume = dep.intents.find((i) => i.status === "awaiting_payment" || i.status === "mismatch_review");
  if (resume) viewIntentId.value = resume.intentId;
});
watch(
  () => intent.value?.intentId,
  () => {
    paidPressed.value = false;
  },
);

// ── 金额输入(USDT 主位 + 实时 ≈VND 副显)──
const amount = ref("25");
function onAmount(e: Event) {
  // uni input 事件取 e.detail.value(同 topup-card-form 惯用法);
  // 数字 + 单小数点 + 两位小数(输入中的尾点「25.」保留,正则可选组吃掉)
  const raw = ((e as unknown as { detail?: { value?: string } }).detail?.value ?? "").replace(/[^\d.]/g, "");
  const m = raw.match(/^(\d*)(?:\.(\d{0,2}))?/);
  amount.value = m ? m[1] + (m[2] !== undefined ? `.${m[2]}` : "") : "";
}
const amountNum = computed(() => {
  const n = parseFloat(amount.value);
  return Number.isFinite(n) ? n : 0;
});
const minDeposit = computed(() => remoteApiEnabled && !mockFundsEnabled ? fx.minDepositUsdt : MIN_DEPOSIT_USDT);
const maxDeposit = computed(() => remoteApiEnabled && !mockFundsEnabled ? fx.maxDepositUsdt : BANK_MAX_DEPOSIT_USDT);
const bankRailAvailable = computed(() => remoteApiEnabled && !mockFundsEnabled ? fx.vietQrEnabled : dep.bankRailAvailable);
const inRange = computed(() => amountNum.value >= minDeposit.value && amountNum.value <= maxDeposit.value);
const fxUsable = computed(() => fx.fxAvailable && fx.configReady && bankRailAvailable.value);

const minLabel = computed(() => `$${minDeposit.value}`);
const maxLabel = computed(() => `$${maxDeposit.value.toLocaleString("en-US")}`);
const limitLine = computed(() => fmt(t.value.bankPane.limitNote, { min: minLabel.value, max: maxLabel.value }));
const feeNote = computed(() => {
  if (!fx.configReady) return "—";
  if (fx.feeUsdt <= 0 && fx.feeVnd <= 0) return t.value.bankPane.feeNote;
  const usdt = fx.feeUsdt.toFixed(2);
  return fx.feeVnd > 0
    ? fmt(t.value.bankPane.feeConfiguredVnd, { usdt, vnd: fmtVnd(fx.feeVnd) })
    : fmt(t.value.bankPane.feeConfigured, { usdt });
});
const amountError = computed(() =>
  amount.value !== "" && !inRange.value ? fmt(t.value.bankPane.limitError, { min: minLabel.value, max: maxLabel.value }) : "",
);
// 牌价未返回/不可用 → 占位「—」不显示 0([FEAT-PAY03] ⑤ 空状态)
const vndPreview = computed(() =>
  fxUsable.value && amountNum.value > 0
    ? fmt(t.value.bankPane.approx, { vnd: fmtVnd(vndForUsdt(amountNum.value, fx.quoteRate)) })
    : fmt(t.value.bankPane.approx, { vnd: "—" }),
);
const ctaEnabled = computed(() => fxUsable.value && inRange.value && !creating.value);

// ── 生成付款单(mock ~600ms 延迟演加载态:按钮内联 spinner「生成中…」)──
const creating = ref(false);
const createError = ref("");
let createTimer: ReturnType<typeof setTimeout> | undefined;
function createOrder(presetUsdt?: number) {
  const usdt = presetUsdt ?? amountNum.value;
  if (creating.value || !fxUsable.value || usdt < MIN_DEPOSIT_USDT || usdt > BANK_MAX_DEPOSIT_USDT) return;
  creating.value = true;
  createError.value = "";
  const expectedAccountKey = dep.currentAccountKey();
  createTimer = setTimeout(() => { void completeCreateOrder(usdt, expectedAccountKey); }, 600);
}
async function completeCreateOrder(usdt: number, expectedAccountKey: string) {
  await runRecoverableFundsOperation(async () => {
      const it = mockFundsEnabled
        ? await dep.createSandboxBankIntent(usdt, expectedAccountKey)
        : remoteApiEnabled
          ? await dep.createRemoteBankIntent(usdt, expectedAccountKey)
          : dep.createBankIntent(usdt);
      if (!it) throw new Error(t.value.fx.updating);
      return it;
    }, {
      success: (it) => {
        viewIntentId.value = it.intentId;
        paidPressed.value = false;
      },
      failure: (reason) => {
        createError.value = reason;
        toast.error(reason);
      },
      settled: () => { creating.value = false; },
      // lib 新契约:fallback = 用户面人话(原始 cause 由 lib 进日志)。审计 R3 抓获:此处
      // 曾仍传 "VIETQR_CREATE_FAILED",lib 改版后它从「极端边界才漏出」变成「每次失败必弹」。
    }, t.value.topupChrome.depositOpFailedNote);
}
/** 过期态「重新生成」= 新单新锁价(沿用原单金额,当前牌价重新锁定)。 */
function regen() {
  const it = intent.value;
  if (!it) return;
  createOrder(it.usdtAmount);
}
function done() {
  viewIntentId.value = null;
  paidPressed.value = false;
}

// ── 真倒计时(派生自 expireAt,与 store 过期引擎同源;到点 store 翻 expired 视图自换)──
const nowTick = ref(mockServerNow());
let tickTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tickTimer = setInterval(() => {
    nowTick.value = mockServerNow();
  }, 1000);
});
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
  if (createTimer) clearTimeout(createTimer);
  if (remoteApiEnabled && !mockFundsEnabled) dep.stopRemoteVietQrPolling();
});
const countdownText = computed(() => {
  const it = intent.value;
  if (!it) return "00:00";
  const left = Math.max(0, Math.floor((it.expireAt - nowTick.value) / 1000));
  return `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
});

// ── 展示派生 ──
/** 成功态入账额读关联 DepositRecord(差额核销/迟到补入账时 ≠ 原下单额);
 *  记录与意向单同号(depositId = intentId)。 */
const creditedUsdt = computed(() => {
  const it = intent.value;
  if (!it) return 0;
  return dep.records.find((r) => r.depositId === it.intentId)?.creditedUsdt ?? it.usdtAmount;
});
const rateText = computed(() => (intent.value ? intent.value.fxRate.toLocaleString("en-US") : "—"));
const creditLineText = computed(() =>
  intent.value
    ? fmt(t.value.bankPane.creditLine, { usdt: intent.value.usdtAmount.toFixed(2), rate: rateText.value })
    : "",
);
// 过期文案的锁价分钟数:配置未返回用「—」占位,不显示 0(同 fx-rate-line 口径)
const lockMinText = computed(() => (fx.lockWindowMin > 0 ? String(fx.lockWindowMin) : "—"));
const steps = computed(() => {
  const it = intent.value;
  return buildVietQrTransferSteps(
    it?.qrPayload,
    it?.bankAccount.accountNumber ?? "",
    it ? fmtVnd(it.vndAmount) : "",
    {
      scan: t.value.bankPane.step1,
      manual: (account, amount) => fmt(t.value.bankPane.manualStep1, { account, amount }),
      amount: t.value.bankPane.step2,
      complete: t.value.bankPane.step3,
    },
  );
});

// ── 动作 ──
function copyText(data: string, okText: string) {
  uni.setClipboardData({
    data,
    showToast: false, // 系统 toast 恒中文,关掉,只留应用内三语 toast(同 deposit-usdt-pane 收敛)
    success: () => {
      uni.hideToast();
      toast.success(okText);
    },
    fail: () => {},
  });
}
function copyMemo() {
  if (intent.value) copyText(intent.value.memoCode, t.value.bankPane.memoCopied);
}
function copyAccount() {
  // 复制纯数字账号(去空格,银行 App 粘贴即用)
  if (intent.value) copyText(intent.value.bankAccount.accountNumber.replace(/\s/g, ""), t.value.bankPane.accountCopied);
}
async function askCancel() {
  const it = intent.value;
  if (!it || it.status !== "awaiting_payment") return;
  const ok = await confirm({
    title: t.value.bankPane.cancelConfirmTitle,
    message: t.value.bankPane.cancelConfirmBody,
    confirmLabel: t.value.bankPane.cancelConfirmOk,
    cancelLabel: t.value.bankPane.cancelConfirmNo,
    danger: true,
    icon: "warn",
  });
  if (!ok) return;
  const r = remoteApiEnabled
    ? await dep.cancelRemoteBankIntent(it.intentId)
    : dep.cancelBankIntent(it.intentId);
  if (r.ok) {
    toast.success(t.value.bankPane.cancelledToast);
    viewIntentId.value = null;
  } else if (r.conflict) {
    // 这张付款单在别处已经付掉 / 超时 / 撤掉了,store 已把最新状态刷回来。
    toast.warn(t.value.errors.staleTitle, t.value.errors.staleMsg);
  }
}
function goSupport() {
  // cat=deposit:从充值场景进工单,预选「充值」分类(同 usdt 段入口)
  navTo("/pages/me/support-tickets?mode=create&cat=deposit");
}
function goBills() {
  navTo("/pages/me/wallet-bills");
}

// ── styles ──
const metaLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
// 牌价不可用:段内容置灰禁下单([FEAT-PAY03] ② 异常1;文案由 FxRateLine 灰态给出)
const disabledWrapStyle: CSSProperties = {
  opacity: 0.45,
  pointerEvents: "none",
};
const amountBoxStyle: CSSProperties = {
  marginTop: "14px",
  padding: "14px",
  background: "var(--v5-surface-2)",
};
const amountInputStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "26px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  background: "transparent",
  border: "none",
  outline: "none",
  padding: 0,
  minWidth: 0,
};
const errTextStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "12px",
  color: "var(--v5-danger)",
  lineHeight: 1.4,
};
function pillBtn(bg: string, color: string): CSSProperties {
  return {
    marginTop: "14px",
    height: "48px",
    borderRadius: "999px",
    background: bg,
    color,
    fontFamily: "var(--font-v5)",
    fontSize: "15px",
    fontWeight: 600,
  };
}
const createBtnStyle = computed<CSSProperties>(() =>
  ctaEnabled.value ? pillBtn("var(--v5-brand)", "var(--v5-on-brand)") : pillBtn("var(--v5-surface-2)", "var(--v5-ink-4)"),
);
const paidBtnStyle: CSSProperties = pillBtn("var(--v5-brand)", "var(--v5-on-brand)");
const ghostBtnStyle: CSSProperties = {
  marginTop: "6px",
  minHeight: "44px",
  borderRadius: "999px",
  background: "transparent",
};
const ghostTextStyle: CSSProperties = {
  fontSize: "13px",
  color: "var(--v5-ink-3)",
};
const miniSpinnerStyle: CSSProperties = {
  width: "16px",
  height: "16px",
  borderRadius: "50%",
  border: "2px solid color-mix(in srgb, currentColor 30%, transparent)",
  borderTopColor: "currentColor",
  animation: "spin 1s linear infinite",
  flexShrink: 0,
};
const qrBoxStyle: CSSProperties = {
  width: "160px",
  height: "160px",
  margin: "14px auto 0",
  borderRadius: "16px",
  background: "#ffffff", // QR 物理白卡,双主题固定(同 deposit-usdt-pane 先例)
  padding: "8px",
  display: "grid",
  placeItems: "center",
};
const qrGridStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  gridTemplateColumns: "repeat(21, 1fr)",
  gridTemplateRows: "repeat(21, 1fr)",
};
const qrDarkCellStyle: CSSProperties = {
  background: "rgba(0,0,0,0.85)", // QR 物理黑,白卡内固定色(同旧点阵先例)
  borderRadius: "1px",
};
const bankRowStyle: CSSProperties = {
  padding: "9px 0",
  gap: "10px",
  borderTop: "1px solid var(--v5-border)",
};
const bankKeyStyle: CSSProperties = {
  fontSize: "13px",
  color: "var(--v5-ink-3)",
};
const bankValStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--v5-ink)",
  textAlign: "right",
};
const memoBoxStyle: CSSProperties = {
  marginTop: "10px",
  padding: "12px",
  gap: "8px",
  borderRadius: "12px",
  background: "var(--v5-brand-soft)",
};
const memoCodeStyle: CSSProperties = {
  marginTop: "2px",
  fontSize: "20px",
  fontWeight: 600,
  color: "var(--v5-brand)",
  letterSpacing: "1px",
  whiteSpace: "nowrap",
};
const memoCopyBtnStyle: CSSProperties = {
  minHeight: "44px",
  padding: "0 16px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
};
const copyIconBtnStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  margin: "-10px -6px -10px 0", // 44 热区不撑 9px 行距(负 margin 同 fx-rate-line 手法)
  borderRadius: "10px",
};
const stepNumStyle: CSSProperties = {
  width: "22px",
  height: "22px",
  borderRadius: "50%",
  background: "var(--v5-brand-soft)",
};
const stateTitleStyle: CSSProperties = {
  marginTop: "12px",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const stateBodyStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.55,
  maxWidth: "280px",
};
const waitIconStyle: CSSProperties = {
  width: "52px",
  height: "52px",
  borderRadius: "50%",
  background: "var(--v5-warning-soft)",
};
const successIconStyle: CSSProperties = {
  width: "52px",
  height: "52px",
  borderRadius: "50%",
  background: "var(--v5-success-soft)",
};
const expiredIconStyle: CSSProperties = {
  width: "52px",
  height: "52px",
  borderRadius: "50%",
  background: "var(--v5-surface-2)",
};
const warnRowStyle: CSSProperties = {
  marginTop: "8px",
  padding: "10px 12px",
  gap: "8px",
  borderRadius: "12px",
  background: "var(--v5-warning-soft)",
};
const warnTextStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-warning)",
  lineHeight: 1.45,
};
const pausedIconStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "14px",
  background: "var(--v5-surface-2)",
};
</script>

<style scoped>
/* 等待回调脉冲(规格 ⑤ 加载态「等待到账确认」脉冲;匹配形状,非通用转圈) */
.nx-bank-pulse {
  animation: nx-bank-pulse 1.6s ease-in-out infinite;
}
@keyframes nx-bank-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.06);
    opacity: 0.72;
  }
}
</style>
