<!--
  Re-invest Boost (ported from Nexion-prototype/app/(main)/me/wallet/repurchase/page.tsx).
  Mock mode keeps the isolated demo rail; remote mode renders and submits only
  server-authoritative repurchase data. Explicit sandbox stays HOLD until its
  isolated backend route exists. Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/wallet" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <!-- hero — rules-intro pill rides the title row (owner 2026-07-09: kill
             the empty gap above the hero). -->
        <view class="nx-glass-card" :style="heroStyle">
          <view class="flex items-center justify-between" style="gap: 8px">
            <view class="flex items-center" style="gap: 8px">
              <view class="grid place-items-center" :style="heroIconBoxStyle">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
              </view>
              <view>
                <text class="block" :style="heroTitleStyle">{{ w.hero }}</text>
                <text class="block" :style="heroPtsStyle">{{ heroApy }}</text>
              </view>
            </view>
            <view class="inline-flex items-center shrink-0 active:scale-[0.98]" :style="howLinkStyle" role="button" tabindex="0" @click="goHow"  @keydown.enter.prevent="goHow" @keydown.space.prevent="goHow">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
              <text style="margin: 0 6px">{{ w.howItWorksEntry }}</text>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            </view>
          </view>

          <view class="grid grid-cols-2" :style="benefitsGridStyle">
            <view v-for="(b, i) in benefitTiles" :key="b.text" class="flex items-center nx-step-in" :style="benefitStyle(b.tint, i)">
              <view v-html="b.icon" />
              <text :style="benefitTextStyle">{{ b.text }}</text>
            </view>
          </view>
        </view>

        <view v-if="isSandboxHold" :style="unavailableStyle">
          <text class="block" :style="unavailableTitleStyle">{{ unavailableTitle }}</text>
          <text class="block" :style="unavailableBodyStyle">{{ unavailableBody }}</text>
        </view>

        <view v-else-if="isRemote && !remoteReady" :style="unavailableStyle" role="status" :aria-busy="repurchase.loading">
          <text class="block" :style="unavailableTitleStyle">{{ repurchase.loading ? loadingLabel : unavailableTitle }}</text>
          <text v-if="!repurchase.loading" class="block" :style="unavailableBodyStyle">{{ unavailableBody }}</text>
          <view v-if="!repurchase.loading" class="nx-repurchase-submit-cta w-full flex items-center justify-center" :style="retryCtaStyle" role="button" tabindex="0" @click="refreshRemote">
            <text>{{ retryLabel }}</text>
          </view>
        </view>

        <template v-else>
        <view v-if="repurchase.historyLoading || repurchase.historyError" :style="cardStyle" role="status" aria-live="polite">
          <text>{{ repurchase.historyLoading ? w.historySyncing : w.historySyncFailed }}</text>
          <view v-if="!repurchase.historyLoading" role="button" tabindex="0" :style="retryCtaStyle" @click="repurchase.refreshHistory()"  @keydown.enter.prevent="repurchase.refreshHistory()" @keydown.space.prevent="repurchase.refreshHistory()">
            <text>{{ retryLabel }}</text>
          </view>
        </view>
        <!-- amount input -->
        <view :style="cardStyle">
          <text class="block" :style="monoLabelStyle">{{ w.amountLabel }}</text>
          <view class="flex items-baseline" style="gap: 8px; margin-top: 8px">
            <text class="shrink-0" :style="dollarStyle">$</text>
            <input
              :value="formatCommandAmount(amount)"
              :aria-label="w.amountLabel"
              type="digit"
              :disabled="confirming || repurchase.submitting || recovering"
              :style="amountInputStyle"
              @input="onAmount"
            />
            <text class="shrink-0" :style="usdtStyle">USDT</text>
          </view>
          <view class="grid grid-cols-4" style="gap: 8px; margin-top: 12px">
            <!-- 反馈恒定:选中档原是空 class,按下零反馈 -->
            <view v-for="p in presets" :key="p" class="active:opacity-70 transition-opacity" :style="presetStyle(amount === p)" role="button" tabindex="0" @click="selectPreset(p)">
              <text>${{ p }}</text>
            </view>
          </view>
          <view style="margin-top: 12px">
            <text :style="balanceLabelStyle">{{ w.balanceLabel }}</text>
            <text :style="balanceValueStyle"> ${{ displayBalance.toFixed(2) }}</text>
          </view>
        </view>

        <!-- projection -->
        <view :style="cardStyle">
          <text class="block" :style="monoLabelStyle">{{ isRemote ? fmt(w.afterDays, { days: repurchase.config?.lockDays ?? '—' }) : w.after90 }}</text>
          <view style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px">
            <Row :label="w.principal" :value="`$${formatCommandAmount(amount)}`" />
            <Row :label="isRemote ? fmt(w.interestCanonical, { apy: repurchase.config?.apyPct ?? '—', days: repurchase.config?.lockDays ?? '—' }) : w.interest" :value="projectedYield === null ? '—' : `+$${projectedYield.toFixed(2)}`" tint="var(--v5-brand)" />
            <view :style="dividerStyle" />
            <Row :label="w.unlockable" :value="projectedYield === null ? '—' : `$${(amount + projectedYield).toFixed(2)}`" bold />
          </view>
        </view>

        <!-- CTA -->
        <text v-if="recovering" class="block" :style="lockedNoticeStyle">{{ w.recoveryHint }}</text>
        <!-- 置灰必须**说出来**:光换配色 + handler 里静默 return,读屏念的还是「按钮」、
             眼睛看到的还是「复投 $100.00」——实测复现单(#165)正是这么读成「仍启用」的。
             aria-disabled 同时是平台键盘激活层的第三道闸(a11y-activate 不激活置灰控件)。 -->
        <view class="nx-repurchase-submit-cta w-full flex items-center justify-center" :class="{ 'active:scale-[0.98]': canSubmit }" :style="ctaStyle" role="button" tabindex="0" :aria-disabled="canSubmit ? 'false' : 'true'" :aria-busy="repurchase.submitting" @click="handleRepurchase">
          <text>{{ ctaLabel }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="canSubmit ? 'var(--v5-on-brand)' : 'var(--v5-ink-4)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 8px"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>

        <!-- 余额不足:原因 + 下一步(充值)。只说「余额不足」不给出口 = 把用户堵在死路上。 -->
        <view v-if="insufficientBalance" :style="insufficientNoticeStyle" role="status">
          <text class="block" :style="insufficientTitleStyle">{{ w.insufficient }}</text>
          <text class="block" :style="insufficientBodyStyle">{{ fmt(w.insufficientSub, { a: displayBalance.toFixed(2) }) }}</text>
          <view class="active:opacity-80" :style="topupCtaStyle" role="button" tabindex="0" :aria-label="t.me.topup" @click="goTopup">
            <text>{{ t.me.topup }}</text>
          </view>
        </view>

        <text class="block" :style="lockedNoticeStyle">{{ isRemote ? fmt(w.confirmMessage, { amount: formatCommandAmount(amount), days: repurchase.config?.lockDays ?? '—', penalty: repurchase.config?.earlyPenaltyPct ?? '—' }) : w.lockedNotice }}</text>
        </template>
        <view v-if="isRemote" :style="cardStyle">
          <text class="block" :style="heroTitleStyle">{{ w.ordersTitle }}</text>
          <view role="button" tabindex="0" :aria-disabled="confirming || repurchase.submitting || repurchase.loading" :style="retryCtaStyle" @click="refreshOrders"  @keydown.enter.prevent="refreshOrders" @keydown.space.prevent="refreshOrders"><text>{{ repurchase.loading ? w.loading : w.retry }}</text></view>
          <text v-if="!repurchase.loading && !repurchase.error && !repurchase.orders.length">{{ w.ordersEmpty }}</text>
          <view v-for="order in repurchase.orders" :key="order.orderNo" style="padding: 16px 0; border-top: 1px solid var(--v5-border)">
            <text class="block" style="overflow-wrap: anywhere">{{ order.orderNo }}</text>
            <Row :label="orderStatusLabel(order.status)" :value="`${order.amountUsdt.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`" />
            <Row :label="w.maturesAt" :value="new Date(order.unlockAt).toLocaleString(dateLocale())" />
            <Row :label="fmt(w.interestCanonical, { apy: order.apyPct, days: order.lockDays })" :value="`${order.estimatedInterestUsdt.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDT`" />
            <view v-if="order.status === 'MATURE_UNCLAIMED'" role="button" tabindex="0" :aria-disabled="confirming || repurchase.submitting || repurchase.loading || !!repurchase.error" :style="retryCtaStyle" @click="handleClaim(order.orderNo)"  @keydown.enter.prevent="handleClaim(order.orderNo)" @keydown.space.prevent="handleClaim(order.orderNo)"><text>{{ w.claimAction }}</text></view>
            <view v-if="order.status === 'ACTIVE'" role="button" tabindex="0" :aria-disabled="confirming || repurchase.submitting || repurchase.loading || !!repurchase.error" :style="retryCtaStyle" @click="handleEarlyWithdraw(order.orderNo)"  @keydown.enter.prevent="handleEarlyWithdraw(order.orderNo)" @keydown.space.prevent="handleEarlyWithdraw(order.orderNo)"><text>{{ w.earlyAction }}</text></view>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import Row from "@/components/me/repurchase-row.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { geoPolicyUserMessage } from "@/api/geo-policy-error";
import { confirm as uiConfirm, toast } from "@/store/ui";
import { useApp } from "@/store/app";
import { postMoneyBill } from "@/lib/money-receipt";
import { useStaking } from "@/store/staking";
import { apiRuntimeConfig } from "@/api/runtime";
import { useRepurchase } from "@/store/repurchase";
import { resolveRepurchaseRuntimePolicy } from "@/lib/repurchase-runtime-policy";
import { navTo } from "@/lib/route";
import { formatCommandAmount, normalizeCommandAmount } from "@/lib/command-amount";
import type { RepurchaseStatus } from "@/api/repurchase-api";

const PRESETS = [100, 200, 500, 1000];

const t = useT();
const w = computed(() => t.value.repurchase);
const app = useApp();
const staking = useStaking();
const repurchase = useRepurchase();
const repurchasePolicy = resolveRepurchaseRuntimePolicy(apiRuntimeConfig.environment);
const isRemote = computed(() => repurchasePolicy.serverAuthoritative);
const isSandboxHold = computed(() => repurchasePolicy.unavailable);
const isMounted = ref(true);

const user = computed(() => app.user);
const amount = ref<number>(200);
const amountTouched = ref(false);
const confirming = ref(false);
let accountGeneration = 0;
watch(() => app.accountKey, () => { accountGeneration += 1; }, { flush: "sync" });
const currentScope = (generation: number) => isMounted.value && generation === accountGeneration;
const recovering = computed(() => isRemote.value && repurchase.pendingOpenAmount !== null);
watch(() => repurchase.pendingOpenAmount, (pending) => {
  if (pending !== null) amount.value = pending;
}, { immediate: true });
const presets = computed(() => (isRemote.value ? (repurchase.config?.presets ?? []) : PRESETS));
const displayBalance = computed(() => (isRemote.value ? repurchase.walletBalanceUsdt : user.value.usdtBalance));
const remoteReady = computed(() => isRemote.value && repurchase.config !== null
  && !repurchase.loading && repurchase.serverTime > 0 && !repurchase.error);

const projectedYield = computed<number | null>(() => {
  if (!isRemote.value) return amount.value * 0.35 * (90 / 365);
  const config = repurchase.config;
  return config ? amount.value * (config.apyPct / 100) * (config.lockDays / 365) : null;
});
const canSubmit = computed(() => {
  if (isRemote.value) {
    const config = repurchase.config;
    return Boolean(
      remoteReady.value && (config?.enabled || recovering.value)
      && !confirming.value
      && !repurchase.submitting
      && Number.isFinite(amount.value)
      && (recovering.value || (amount.value >= (config?.minAmountUsdt ?? Infinity)
        && amount.value <= repurchase.walletBalanceUsdt)),
    );
  }
  return amount.value > 0 && amount.value <= user.value.usdtBalance;
});

/**
 * 主按钮此刻**只因余额**而不可提交 —— 判据要窄,窄到「把余额补上就能提交」:
 * · 恢复态(上一笔结果未确认)按原金额重放,**豁免**余额门(与 canSubmit 同一条豁免),
 *   否则用户会被永久卡在恢复路径上;
 * · 产品未开放/快照未就绪时不报「余额不足」—— 那是另一件事,报错会指错方向;
 * · 余额取 displayBalance(remote 走权威快照),与按钮、与余额行**同源**,
 *   不会出现「行里写着 $0.00、门却按另一个数判」的自相矛盾。
 */
const insufficientBalance = computed(() => {
  if (recovering.value || !Number.isFinite(amount.value)) return false;
  if (!(amount.value > displayBalance.value)) return false;
  if (isRemote.value) {
    const config = repurchase.config;
    return remoteReady.value && Boolean(config?.enabled);
  }
  return amount.value > 0;
});

const ctaLabel = computed(() => recovering.value
  ? fmt(w.value.recoveryCta, { amount: formatCommandAmount(amount.value) })
  : fmt(w.value.cta, { amount: formatCommandAmount(amount.value) }));
const unavailableTitle = computed(() => w.value.unavailableTitle);
const unavailableBody = computed(() => w.value.unavailableBody);
const retryLabel = computed(() => w.value.retry);
const loadingLabel = computed(() => w.value.loading);
const heroApy = computed(() => {
  if (!isRemote.value) return w.value.benefits.apy;
  const config = repurchase.config;
  return config ? fmt(w.value.benefits.apyCanonical, { apy: config.apyPct, days: config.lockDays }) : "—";
});

const BENEFIT_SVG = {
  sparkles: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>`,
  zap: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" /></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>`,
  diamond: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" /></svg>`,
};

const benefitTiles = computed(() => {
  const config = repurchase.config;
  if (isRemote.value && !config) return [];
  return [
    {
      icon: BENEFIT_SVG.zap,
      text: isRemote.value
        ? fmt(w.value.benefits.apyCanonical, { apy: config!.apyPct, days: config!.lockDays })
        : w.value.benefits.apy,
      tint: "var(--v5-warning)",
    },
    {
      icon: BENEFIT_SVG.check,
      text: isRemote.value
        ? fmt(w.value.benefits.cultivationCanonical, { multiplier: config!.effectiveNurtureMultiplier })
        : w.value.benefits.cultivation,
      tint: "var(--v5-tech-cyan)",
    },
    {
      icon: BENEFIT_SVG.diamond,
      text: isRemote.value
        ? fmt(w.value.benefits.genesisCanonical, { tickets: config!.ticketPerOrder })
        : w.value.benefits.genesis,
      tint: "var(--v5-brand-2)",
    },
  ];
});

function detailVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onAmount(e: Event) {
  if (confirming.value || repurchase.submitting || recovering.value) return;
  amountTouched.value = true;
  amount.value = normalizeCommandAmount(detailVal(e));
}

function selectPreset(preset: number) {
  if (confirming.value || repurchase.submitting || recovering.value) return;
  amountTouched.value = true;
  amount.value = preset;
}

function refreshOrders() {
  if (confirming.value || repurchase.submitting || repurchase.loading) return;
  void refreshRemote();
}

async function refreshRemote() {
  if (!isRemote.value || !isMounted.value) return;
  await repurchase.refresh();
  if (!isMounted.value) return;
  if (repurchase.pendingOpenAmount !== null) amount.value = repurchase.pendingOpenAmount;
  else if (!amountTouched.value && repurchase.config) {
    amount.value = repurchase.config.presets[0] ?? repurchase.config.minAmountUsdt;
  }
}

async function handleRepurchase() {
  if (isRemote.value) {
    if (!isMounted.value) return;
    // 快照未就绪 = 整页 HOLD,那时根本没有可点的按钮。
    if (!remoteReady.value) return;
    // 🔴 余额门(第一道,按钮禁用之外的独立一道):余额不足**明确拒绝并说明原因**,
    //    不是静默 return —— 静默 return 在用户看来和「点了没反应」无法区分。
    if (insufficientBalance.value) {
      toast.error(w.value.insufficient, fmt(w.value.insufficientSub, { a: displayBalance.value.toFixed(2) }));
      return;
    }
    if (!canSubmit.value) return;
    confirming.value = true;
    const generation = accountGeneration;
    const quoteAmount = normalizeCommandAmount(amount.value);
    let confirmed = false;
    try {
      const config = repurchase.config;
      confirmed = await uiConfirm({
        title: w.value.confirmTitle,
        message: recovering.value
          ? fmt(w.value.recoveryHint, {
              amount: formatCommandAmount(quoteAmount),
              days: config?.lockDays ?? 0,
              penalty: config?.earlyPenaltyPct ?? 0,
            })
          : fmt(w.value.confirmMessage, {
              amount: formatCommandAmount(quoteAmount),
              days: config?.lockDays ?? 0,
              penalty: config?.earlyPenaltyPct ?? 0,
            }),
        confirmLabel: w.value.confirmLabel,
        cancelLabel: w.value.cancelLabel,
        icon: "warn",
        owner: "wallet-repurchase",
      });
    } finally {
      confirming.value = false;
    }
    if (!confirmed || !currentScope(generation)) return;
    try {
      await repurchase.open(quoteAmount);
      if (!currentScope(generation)) return;
      toast.success(w.value.toastSuccess, `${formatCommandAmount(quoteAmount)} USDT`);
      const nextPreset = repurchase.config?.presets?.[0];
      amount.value = repurchase.pendingOpenAmount ?? nextPreset ?? repurchase.config?.minAmountUsdt ?? 0;
    } catch (cause) {
      if (!currentScope(generation)) return;
      const message = cause instanceof Error && cause.message
        ? cause.message
        : w.value.unavailableBody;
      toast.error(w.value.unavailableTitle, message);
    }
    return;
  }
  if (isSandboxHold.value) {
    toast.error(unavailableTitle.value, unavailableBody.value);
    return;
  }
  if (!canSubmit.value) return;
  const billRef = `REINVEST-${Date.now().toString(36).toUpperCase()}`;
  // Cross-store orchestration in the handler (stores don't import each other).
  // 🔴 顺序 = 扣款⊗记账(原子)→ 建仓(2026-08-04 R4「钱动了、账没记上」)。原顺序是
  // 「扣款 → 建仓 → 裸 bills.add」,而 bills.add 写不进去时返回 null 且不抛异常、没人接 ——
  // 钱扣了、仓建了、弹成功,账单页却查无此单。收口到 postMoneyBill 后,收据落不了盘
  // = 钱没扣、仓没建、明确报错。
  const before = app.captureMoney();
  const paid = postMoneyBill({
    type: "stake",
    symbol: "USDT",
    amount: -amount.value,
    status: "posted",
    memo: `Re-invest · 90d stake`,
    ref: billRef,
  });
  // The ledger post is this page's server round-trip, so a region refusal comes
  // back as its outcome. Translate first; `null` means it's an ordinary outcome
  // and the branches below handle it unchanged — a failed post must never be
  // reported to the user as a region block.
  const geoPaid = geoPolicyUserMessage(paid, t.value.geoPolicy);
  if (geoPaid) {
    // 同上:复投是动钱路径,拒单必须带资金交代。
    toast.error(geoPaid, t.value.geoPolicy.fundsSafeNote);
    return;
  }
  if (paid === "insufficient") {
    toast.error(w.value.insufficient, fmt(w.value.insufficientSub, { a: user.value.usdtBalance.toFixed(2) }));
    return;
  }
  if (paid !== "ok") return; // 落盘失败:资金已还原**或**已入待对账("stuck" 那格钱仍扣着,收口点给了交易号);账上无记录,收口点已提示
  // 🔴 同 stake-sheet:建仓失败(版本冲突耗尽)必须把刚扣的钱退回,否则钱扣了仓位不存在。
  // 退回走同一个收口点:restoreTo 精确还原扣款前的 withdrawableUsdt(裸 creditBalance 只加
  // 总余额、不还可提额度,退一次压低一次),并补一条反向分录 —— 不留「有扣款无凭证」。
  const opened = staking.stake(amount.value, 90);
  if (!opened.ok) {
    const reversed = postMoneyBill(
      {
        type: "stake",
        symbol: "USDT",
        amount: amount.value,
        status: "posted",
        memo: `Re-invest reversed · 90d stake refunded`,
        memoKey: "stakeReversed",
        // 🔴 冲正分录的幂等键要与原分录分开(addOnce 按 ref+type+symbol 判重,
        // 原本三项完全相同 → 将来任何幂等写都会误命中冲正行)。同 marketplace。
        ref: `${billRef}-REV`,
      },
      { restoreTo: before },
    );
    // 🔴 冲正自己也会失败:reversed !== "ok" 时钱**仍然扣着**,而下面这条文案
    // 明说「The full amount is back in your balance」—— 当面撒谎(对抗审计 B-P1-2)。
    // 收口点在 stuck 分支已给了响亮终态 + 交易号,这里不再叠一句假承诺。
    if (reversed !== "ok") return;
    // 同 stake-sheet:conflict=true 是别处刚改过持仓,false 是本机存储写不进去 —— 归因不混用。
    toast.error(
      t.value.stakingV3.toast.openFailedTitle,
      opened.conflict ? t.value.stakingV3.toast.openFailedSubtitle : t.value.stakingV3.toast.openFailedStorageSubtitle,
    );
    return;
  }
  toast.success(w.value.toastSuccess, fmt(w.value.toastSubtitle, { a: amount.value }));
  amount.value = 200;
}

function orderStatusLabel(status: RepurchaseStatus): string {
  return ({ PENDING_LOCK: w.value.statusPending, ACTIVE: w.value.statusActive,
    MATURE_UNCLAIMED: w.value.statusMature, CLAIMED: w.value.statusClaimed,
    EARLY_WITHDRAWN: w.value.statusEarly })[status];
}

async function handleClaim(orderNo: string) {
  const order = repurchase.orders.find((entry) => entry.orderNo === orderNo);
  if (!isRemote.value || !isMounted.value || confirming.value || repurchase.submitting || repurchase.loading || repurchase.error || order?.status !== "MATURE_UNCLAIMED") return;
  const generation = accountGeneration;
  confirming.value = true;
  try {
    const confirmed = await uiConfirm({
      title: w.value.claimTitle,
      message: fmt(w.value.claimMessage, { order: orderNo, amount: (order.amountUsdt + order.estimatedInterestUsdt).toFixed(6) }),
      confirmLabel: w.value.claimAction, cancelLabel: w.value.cancelLabel, icon: "info", owner: "wallet-repurchase",
    });
    if (!confirmed || !currentScope(generation) || repurchase.orders.find((entry) => entry.orderNo === orderNo)?.status !== "MATURE_UNCLAIMED") return;
    await repurchase.claim(orderNo);
    if (currentScope(generation)) toast.success(w.value.actionSuccess);
  } catch {
    if (currentScope(generation)) toast.error(w.value.unavailableTitle, w.value.actionUnknown);
  } finally { confirming.value = false; }
}

async function handleEarlyWithdraw(orderNo: string) {
  const order = repurchase.orders.find((entry) => entry.orderNo === orderNo);
  if (!isRemote.value || !isMounted.value || confirming.value || repurchase.submitting || repurchase.loading || repurchase.error || order?.status !== "ACTIVE") return;
  const generation = accountGeneration;
  confirming.value = true;
  try {
    const confirmed = await uiConfirm({
      title: w.value.earlyTitle,
      message: fmt(w.value.earlyMessage, { order: orderNo, penalty: order.earlyPenaltyPct, amount: (order.amountUsdt * (1 - order.earlyPenaltyPct / 100)).toFixed(6) }),
      confirmLabel: w.value.earlyAction, cancelLabel: w.value.cancelLabel, icon: "warn", owner: "wallet-repurchase",
    });
    if (!confirmed || !currentScope(generation) || repurchase.orders.find((entry) => entry.orderNo === orderNo)?.status !== "ACTIVE") return;
    await repurchase.earlyWithdraw(orderNo);
    if (currentScope(generation)) toast.success(w.value.actionSuccess);
  } catch {
    if (currentScope(generation)) toast.error(w.value.unavailableTitle, w.value.actionUnknown);
  } finally { confirming.value = false; }
}

function goHow() {
  navTo("/pages/me/wallet-repurchase-how");
}

/** 余额不足的出口:充值页(与 store 结算/订单详情的引导同一目标)。 */
function goTopup() {
  navTo("/pages/me/wallet-topup");
}

onMounted(() => {
  if (isRemote.value) void refreshRemote();
});
onUnmounted(() => {
  isMounted.value = false;
});

// Secondary nav pill — soft brand-2 tint carries the affordance, no border (chip rule).
const howLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0 12px",
  height: "44px",  // 《07》tap≥44(原 34)
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
};
// Spotlight hero kept (single per screen) but neutralised: the accent floor-adjacent
// glow is dropped;描边已整条删除(《03》§3 零 border,C2 第二轮)。The colourful
// benefit tiles inside carry the visual interest.
const heroStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  borderRadius: "var(--nx-glass-radius)",
  padding: "16px",
  background: "var(--nx-glass-fill)",
};
const heroIconBoxStyle: CSSProperties = { width: "40px", height: "40px", borderRadius: "12px", background: "color-mix(in srgb, var(--v5-brand) 20%, transparent)" };
const heroTitleStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontWeight: 600, fontSize: "20px", letterSpacing: "-0.014em", color: "var(--v5-ink)" };
const heroPtsStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };
const benefitsGridStyle: CSSProperties = { marginTop: "12px", gap: "8px" };
function benefitStyle(tint: string, i: number): CSSProperties {
  return {
    gap: "6px",
    padding: "8px",
    borderRadius: "8px",
    background: `color-mix(in srgb, ${tint} 12%, transparent)`,
    animationDelay: `${i * 0.08}s`,
  };
}
const benefitTextStyle: CSSProperties = { fontSize: "12px", color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)" };
// De-carded data sections (amount input, projection) on the page floor, 2px inset.
const cardStyle: CSSProperties = { padding: "0 2px" };
const monoLabelStyle: CSSProperties = { fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", fontWeight: 500, color: "var(--v5-ink-3)", letterSpacing: "0.06em" };
const dollarStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "26px", color: "var(--v5-ink-3)" };
const amountInputStyle: CSSProperties = { fontFamily: "var(--font-v5)", flex: "1", minWidth: "0", background: "transparent", fontSize: "26px", fontWeight: 600, color: "var(--v5-ink)" };
const usdtStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
function presetStyle(active: boolean): CSSProperties {
  return {
    height: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 600,
    // 区块已去卡,档位直接坐在页面底上:原 surface-2 与页面底同色不可辨,改 L1 surface。
    background: active ? "var(--v5-brand)" : "var(--v5-surface)",
    color: active ? "var(--v5-on-brand)" : "var(--v5-ink-2)",
  };
}
const balanceLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const balanceValueStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "12px", color: "var(--v5-ink-2)", marginLeft: "4px" };
const dividerStyle: CSSProperties = { height: "1px", background: "color-mix(in srgb, var(--v5-surface-2) 60%, transparent)", margin: "8px 0" };
const ctaStyle = computed<CSSProperties>(() => ({
  width: "100%",
  height: "48px",
  borderRadius: "999px",
  fontSize: "15px",
  fontWeight: 600,
  background: canSubmit.value ? "var(--v5-brand)" : "var(--v5-surface-2)",
  color: canSubmit.value ? "var(--v5-on-brand)" : "var(--v5-ink-4)",
  boxShadow: canSubmit.value ? "var(--v5-spotlight-brand)" : "none",
}));
const lockedNoticeStyle: CSSProperties = { padding: "0 8px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.625 };
const unavailableStyle: CSSProperties = { padding: "16px", borderRadius: "12px", background: "var(--v5-surface-2)" };
const unavailableTitleStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)" };
const unavailableBodyStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.625 };
const retryCtaStyle: CSSProperties = { marginTop: "12px", height: "44px", borderRadius: "999px", background: "var(--v5-surface)", color: "var(--v5-ink-2)", fontSize: "13px", fontWeight: 600 };
// 余额不足提示:warning 描边 + 一句原因 + 一个充值出口。读屏靠 role="status" 播报,
// 视觉靠 warning 色与主按钮的置灰形成对照。
const insufficientNoticeStyle: CSSProperties = { padding: "12px", borderRadius: "12px", background: "color-mix(in srgb, var(--v5-warning) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--v5-warning) 40%, transparent)" };
const insufficientTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-warning)" };
const insufficientBodyStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", color: "var(--v5-ink-2)" };
const topupCtaStyle: CSSProperties = { marginTop: "10px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "999px", background: "var(--v5-brand)", color: "var(--v5-on-brand)", fontSize: "15px", fontWeight: 600 };


</script>
