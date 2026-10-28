<template>
  <AppChassis active="me">
    <SubPageHeader back="/pages/me/wallet-withdraw-method" :title="c.title" :back-action="goBack" />
    <view class="bank-withdraw" :aria-busy="busy">
      <view v-if="error" class="notice danger" role="alert"><text>{{ error }}</text></view>
      <text v-if="busy && !silentRead" class="muted loading" role="status">{{ c.loading }}</text>

      <template v-if="order">
        <view class="status-mark" aria-hidden="true"><text>{{ outcome === 'paid' ? '✓' : outcome === 'refunded' ? '↶' : '⋯' }}</text></view>
        <text class="screen-title" data-testid="bank-order-status" role="status" aria-live="polite" aria-atomic="true">{{ statusLabel }}</text>
        <text class="intro">{{ c.resultNotes[outcome] }}</text>
        <view class="amount-card"><text class="muted">{{ c.receiveLabel }}</text><text class="money">{{ formatAmount(order.bank.amountVnd, 'VND') }}</text><text class="currency">VND</text></view>
        <view class="account-card"><text class="muted">{{ useTranslations.bankBinding.accountRoutedLabel }}</text><text class="account-number">{{ order.bank.maskedAccount }}</text></view>
        <view class="details">
          <view class="row"><text>{{ c.orderNumber }}</text><view class="code-value"><text>{{ order.withdrawalNo }}</text><CopyCodeButton :value="order.withdrawalNo" :label="c.orderNumber" /></view></view>
          <view class="row"><text>{{ c.totalDebit }}</text><text>{{ money(order.bank.amountUsdt) }} USDT</text></view>
          <view class="row"><text>{{ c.fee }}</text><text>{{ money(order.bank.feeUsdt) }}</text></view>
          <view v-if="outcome === 'refunded'" class="row"><text>{{ c.refundAmount }}</text><text>{{ money(order.settlementEvidence!.amountUsdt!) }}</text></view>
          <view v-if="terminal && order.settlementEvidence?.checkedAt" class="row"><text>{{ c.confirmedAt }}</text><text>{{ displayDate(order.settlementEvidence.checkedAt) }}</text></view>
        </view>
        <view class="action primary" role="button" tabindex="0" data-testid="bank-refresh" :aria-disabled="busy" :style="{ opacity: silentRead ? 1 : undefined }" @click="load" @keydown.enter.prevent="load" @keydown.space.prevent="load"><text>{{ c.refresh }}</text></view>
        <view v-if="terminal" class="action secondary" role="button" tabindex="0" data-testid="bank-new" :aria-disabled="busy" :style="{ opacity: silentRead ? 1 : undefined }" @click="startNew" @keydown.enter.prevent="startNew" @keydown.space.prevent="startNew"><text>{{ c.newWithdrawal }}</text></view>
        <view class="action secondary" role="button" tabindex="0" :aria-disabled="busy" :style="{ opacity: silentRead ? 1 : undefined }" @click="backToWallet" @keydown.enter.prevent="backToWallet" @keydown.space.prevent="backToWallet"><text>{{ c.backToWallet }}</text></view>
      </template>

      <template v-else-if="uncertain || displayIntents.length || (displayConfig && displayConfig.unresolvedIntent === undefined)">
        <text class="screen-title">{{ c.title }}</text>
        <view v-if="!busy || !uncertain" class="notice" role="alert"><text>{{ displayIntents.length ? c.multipleIntents : uncertain ? c.unknown : c.recoveryUnavailable }}</text></view>
        <view v-for="intent in displayIntents" :key="intent.quoteNo" class="action secondary" role="button" tabindex="0" :aria-disabled="busy" @click="openIntent(intent)" @keydown.enter.prevent="openIntent(intent)" @keydown.space.prevent="openIntent(intent)"><text>{{ intent.withdrawalNo || intent.quoteNo }}</text></view>
        <view class="action primary" role="button" tabindex="0" data-testid="bank-refresh" :aria-disabled="busy" @click="load" @keydown.enter.prevent="load" @keydown.space.prevent="load"><text>{{ c.reload }}</text></view>
      </template>

      <template v-else-if="displayConfig">
        <text class="screen-title" role="heading" aria-level="1">{{ title }}</text>
        <text class="intro">{{ quote ? c.confirmHint : formStep === 'amount' ? c.amountHint : c.recipientSubtitle }}</text>
        <view v-if="!quote && formStep === 'account'" class="chip" :class="{ warn: !displayConfig.enabled || !displayConfig.beneficiary?.canWithdraw }" data-testid="bank-account-status" role="status"><text>{{ !displayConfig.enabled ? c.unavailable : !displayConfig.beneficiary ? c.unbound : displayConfig.beneficiary.canWithdraw ? c.available : accountStatus }}</text></view>
        <view v-if="recipient" class="account-card">
          <text class="muted">{{ c.recipientTitle }}</text>
          <text class="account-number">{{ recipient.maskedAccount }}</text>
          <text class="bank-name">{{ useTranslations.bankBinding.accountRoutedLabel }}</text>
        </view>
        <view v-if="(displayConfig.beneficiary && !hasVerifiedBankIdentity(displayConfig.beneficiary)) || (quote && !hasVerifiedBankIdentity(quote))" class="notice" role="status"><text>{{ c.bankRoutingUnverified }}</text></view>

        <template v-if="quote">
          <view class="amount-card"><text class="muted">{{ c.receiveLabel }}</text><text class="money">{{ formatAmount(quote.amountVnd, 'VND') }}</text><text class="currency">VND</text></view>
          <view class="details">
            <view class="row"><text>{{ c.totalDebit }}</text><text>{{ money(quote.amountUsdt) }} USDT</text></view>
            <view class="row"><text>{{ c.fee }}</text><text>{{ money(quote.feeUsdt) }}</text></view>
            <view class="row"><text>{{ c.net }}</text><text>{{ money(quote.netUsdt) }}</text></view>
            <view class="row"><text>{{ c.rate }}</text><text>{{ formatHowNumber(quote.rateVnd, dateLocale()) }}</text></view>
            <view class="row"><text>{{ c.expiresIn }}</text><text data-testid="bank-countdown" :class="{ warn: quoteExpired }">{{ quoteExpired ? c.quoteExpired : format(c.seconds, { s: secondsLeft }) }}</text></view>
          </view>
          <view class="notice"><text>{{ c.feeIncluded }}</text></view>
          <view v-if="!quoteExpired" class="consent" role="checkbox" tabindex="0" data-testid="bank-consent" :aria-checked="accepted" :aria-disabled="busy" @click="toggleConsent" @keydown.enter.prevent="toggleConsent" @keydown.space.prevent="toggleConsent"><text class="checkbox" :class="{ checked: accepted }" aria-hidden="true">{{ accepted ? '✓' : '' }}</text><text>{{ c.consent }}</text></view>
          <text class="muted">{{ c.confirmNotice }}</text>
          <view v-if="!quoteExpired" class="action primary" role="button" tabindex="0" data-testid="bank-submit" :aria-disabled="busy || !canSubmit" @click="submit" @keydown.enter.prevent="submit" @keydown.space.prevent="submit"><text>{{ c.confirm }}</text></view>
          <view class="action secondary" role="button" tabindex="0" data-testid="bank-abandon" :aria-disabled="busy" @click="abandon" @keydown.enter.prevent="abandon" @keydown.space.prevent="abandon"><text>{{ c.backToAmount }}</text></view>
        </template>

        <template v-else-if="formStep === 'account'">
          <view class="notice"><text>{{ displayConfig.beneficiary ? c.bindingNotice : c.unboundNotice }}</text></view>
          <view v-if="displayConfig.enabled && displayConfig.beneficiary && (!displayConfig.policy || !displayConfig.capacity)" class="notice" role="status"><text>{{ c.capacityUnavailable }}</text></view>
          <view v-else-if="displayConfig.capacity && !displayConfig.capacity.withdrawalEnabled" class="notice"><text>{{ c.unavailable }}</text></view>
          <view v-if="displayConfig.beneficiary" class="action primary" role="button" tabindex="0" data-testid="bank-continue" :aria-disabled="busy || !canContinue" @click="continueWithdrawal" @keydown.enter.prevent="continueWithdrawal" @keydown.space.prevent="continueWithdrawal"><text>{{ c.continueWithdrawal }}</text></view>
          <view class="action" :class="displayConfig.beneficiary ? 'secondary' : 'primary'" role="button" tabindex="0" :aria-disabled="busy" @click="manageBank" @keydown.enter.prevent="manageBank" @keydown.space.prevent="manageBank"><text>{{ displayConfig.beneficiary ? c.changeAccount : c.addAccount }}</text></view>
        </template>

        <template v-else>
          <text class="field-label">{{ c.totalDebit }} · USDT</text>
          <view class="amount-input">
            <input data-testid="bank-amount" v-model="amount" type="text" inputmode="decimal" :disabled="busy || !canContinue" placeholder="0.00" :aria-label="c.amount" />
            <view class="use-max" role="button" tabindex="0" data-testid="bank-max" :aria-disabled="busy || !canContinue || maxAmount <= 0" @click="useMax" @keydown.enter.prevent="useMax" @keydown.space.prevent="useMax"><text>{{ c.all }}</text></view>
          </view>
          <view class="limits" v-if="displayConfig.policy && displayConfig.capacity">
            <text data-testid="bank-single-limit">{{ format(c.rangeLabel, { min: money(displayConfig.policy.minAmountUsd), max: money(displayConfig.policy.maxAmountUsd) }) }}</text>
            <text data-testid="bank-balance">{{ format(c.availableLabel, { amount: money(displayConfig.capacity.maxWithdrawableUsdt) }) }}</text>
            <text>{{ format(c.dailyLabel, { remaining: displayConfig.capacity.dailyRemainingCount, total: displayConfig.capacity.dailyLimitCount }) }}</text>
            <view class="refresh-limits" role="button" tabindex="0" data-testid="bank-refresh-limits" :aria-disabled="busy" @click="load" @keydown.enter.prevent="load" @keydown.space.prevent="load"><text>{{ c.refreshLimits }}</text></view>
          </view>
          <view v-if="displayConfig.capacity?.dailyRemainingCount === 0" class="notice" role="status"><text>{{ c.dailyExhausted }} {{ displayDate(displayConfig.capacity.dailyCountResetAt) }}</text></view>
          <text v-if="amountError" class="error-text" role="alert">{{ amountError }}</text>
          <view class="notice"><text>{{ c.feeIncluded }}</text><text class="fee-rule">{{ feeRule }}</text></view>
          <view class="action primary" role="button" tabindex="0" data-testid="bank-quote" :aria-disabled="busy || !canContinue || !!amountProblem" @click="getQuote" @keydown.enter.prevent="getQuote" @keydown.space.prevent="getQuote"><text>{{ c.quote }}</text></view>
          <view class="action secondary" role="button" tabindex="0" :aria-disabled="busy" @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack"><text>{{ c.backToAccount }}</text></view>
        </template>
        <view v-if="error || (!quote && displayConfig.enabled && (!displayConfig.policy || !displayConfig.capacity))" class="action secondary" role="button" tabindex="0" data-testid="bank-refresh" :aria-disabled="busy" @click="load" @keydown.enter.prevent="load" @keydown.space.prevent="load"><text>{{ c.reload }}</text></view>
      </template>
      <template v-else-if="requestedOrder === null">
        <text class="screen-title" role="heading" aria-level="1">{{ title }}</text>
        <text class="intro">{{ formStep === 'amount' ? c.amountHint : c.recipientSubtitle }}</text>
        <template v-if="formStep === 'account'">
          <view class="account-card"><text class="muted">{{ c.recipientTitle }}</text><text class="account-number">—</text><text class="bank-name">—</text></view>
          <view class="action primary" role="button" tabindex="-1" data-testid="bank-continue" :aria-disabled="true"><text>{{ c.continueWithdrawal }}</text></view>
        </template>
        <template v-else>
          <text class="field-label">{{ c.totalDebit }} · USDT</text>
          <view class="amount-input"><input data-testid="bank-amount" type="text" inputmode="decimal" disabled placeholder="—" :aria-label="c.amount" /><view class="use-max" role="button" tabindex="-1" aria-disabled="true"><text>{{ c.all }}</text></view></view>
          <view class="notice"><text>{{ c.feeIncluded }}</text></view>
          <view class="action primary" role="button" tabindex="-1" data-testid="bank-quote" :aria-disabled="true"><text>{{ c.quote }}</text></view>
          <view class="action secondary" role="button" tabindex="0" :aria-disabled="busy" @click="goBack"><text>{{ c.backToAccount }}</text></view>
        </template>
        <view v-if="error" class="action secondary" role="button" tabindex="0" data-testid="bank-refresh" :aria-disabled="busy" @click="load" @keydown.enter.prevent="load" @keydown.space.prevent="load"><text>{{ c.reload }}</text></view>
      </template>
      <view v-else-if="error" class="action primary" role="button" tabindex="0" data-testid="bank-refresh" :aria-disabled="busy" @click="load" @keydown.enter.prevent="load" @keydown.space.prevent="load"><text>{{ c.reload }}</text></view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatHowNumber } from "@/lib/rank-how-content";
import { formatFinanceAmount as formatAmount } from "@/lib/finance-amount-display";
import { computed, ref, watch } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import CopyCodeButton from "@/components/copy-code-button.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale } from "@/i18n/format";
import { useApp } from "@/store/app";
import { apiClient } from "@/api/runtime";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { createBankWithdrawalApi, hasVerifiedBankIdentity, type BankConfig, type BankQuote, type BankOrder, type BankIntent, type BankRecovery } from "@/api/bank-withdrawal-api";
import { parseServerTimestamp } from "@/api/server-time";
import { formatBankDateTime } from "@/lib/bank-date";
import { bankAccountNotice, bankBeneficiaryReady, bankCanQuote, bankOrderOutcome, bankAmountError, bankMaximumAmount } from "@/lib/bank-withdrawal-state";
import { navBack, navTo, takeNavigationQuery } from "@/lib/route";

const c = computed(() => useTranslations.value.bankWithdrawal);
const useTranslations = useT();
const app = useApp();
const api = createBankWithdrawalApi(apiClient);
const config = ref<BankConfig | null>(null);
const quote = ref<BankQuote | null>(null);
const order = ref<BankOrder | null>(null);
const busy = ref(false);
const silentRead = ref(false);
const error = ref("");
const configPresentation = ref<{ owner: string; epoch: number; value: BankConfig } | null>(null);
const displayConfig = computed(() => {
  const snapshot = configPresentation.value;
  if (!snapshot || snapshot.owner !== app.accountKey || snapshot.epoch !== app.accountBindingEpoch) return null;
  return config.value ?? (busy.value && !error.value ? snapshot.value : null);
});
const uncertain = ref(false);
const amount = ref("");
const formStep = ref<"account" | "amount">("account");
const accepted = ref(false);
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
let requestedOrder: string | null = null;
let lastCapacityResetRead = "";
let revision = 0;
let inFlight: { current: () => boolean; orderNo: string | null } | null = null;
let alive = true;
let visible = false;
const pendingKey = () => `nexgrid.bank-withdraw.pending:${app.accountKey}`;
const money = (value: number) => formatAmount(value);
const displayDate = (value: string) => formatBankDateTime(value, dateLocale());
const quoteExpired = computed(() => !!quote.value && (parseServerTimestamp(quote.value.expiresAt) ?? 0) <= now.value);
const canSubmit = computed(() => accepted.value && !!quote.value && !quoteExpired.value && !uncertain.value && config.value?.enabled === true
  && config.value.unresolvedIntent !== undefined && config.value.unresolvedIntent?.state !== "MULTIPLE"
  && bankBeneficiaryReady(config.value.beneficiary) && hasVerifiedBankIdentity(quote.value));
const multipleIntents = computed(() => config.value?.unresolvedIntent?.state === "MULTIPLE" ? config.value.unresolvedIntent.intents : []);
const displayIntents = computed(() => displayConfig.value?.unresolvedIntent?.state === "MULTIPLE" ? displayConfig.value.unresolvedIntent.intents : []);
const accountStatus = computed(() => displayConfig.value?.beneficiary ? c.value.accountStatus[bankAccountNotice(displayConfig.value.beneficiary)] : "");
const outcome = computed(() => order.value ? bankOrderOutcome(order.value) : "review");
const terminal = computed(() => !!order.value && ["paid", "refunded"].includes(outcome.value));
const statusLabel = computed(() => c.value[outcome.value]);
const recipient = computed(() => order.value?.bank ?? quote.value ?? displayConfig.value?.beneficiary);
const canContinue = computed(() => bankCanQuote(config.value) && !!config.value?.policy && !!config.value?.capacity && config.value.capacity.withdrawalEnabled);
const amountProblem = computed(() => bankAmountError(amount.value, config.value));
const maxAmount = computed(() => bankMaximumAmount(config.value));
const secondsLeft = computed(() => Math.max(0, Math.ceil(((parseServerTimestamp(quote.value?.expiresAt) ?? 0) - now.value) / 1000)));
const title = computed(() => quote.value ? c.value.confirmTitle : formStep.value === "amount" ? c.value.amountTitle : c.value.recipientTitle);
const feeRule = computed(() => displayConfig.value?.policy ? format(c.value.feeRule, { rate: formatHowNumber(displayConfig.value.policy.feeRatePct, dateLocale()), min: money(displayConfig.value.policy.feeMinUsd), max: money(displayConfig.value.policy.feeMaxUsd) }) : "");
const amountError = computed(() => {
  const problem = silentRead.value ? bankAmountError(amount.value, displayConfig.value) : amountProblem.value;
  if (!amount.value || !problem) return "";
  return c.value.amountErrors[problem];
});
function format(template: string, values: Record<string, string | number>) { return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? "")); }
function continueWithdrawal() { if (!busy.value && canContinue.value) formStep.value = "amount"; }
function useMax() { if (!busy.value && canContinue.value && maxAmount.value > 0) amount.value = maxAmount.value.toFixed(6).replace(/\.?0+$/, ""); }
function toggleConsent() { if (!busy.value && !quoteExpired.value) accepted.value = !accepted.value; }
function goBack() {
  if (busy.value || uncertain.value) return;
  if (quote.value) { void abandon(); return; }
  if (!order.value && formStep.value === "amount") { formStep.value = "account"; return; }
  navBack("/pages/me/wallet-withdraw-method");
}
function backToWallet() { if (!busy.value) navTo("/pages/me/me"); }
function scope() {
  const id = ++revision, owner = app.accountKey, epoch = app.accountBindingEpoch, runtime = captureRuntimeRevision();
  return () => alive && revision === id && app.accountKey === owner && app.accountBindingEpoch === epoch && isCurrentRuntimeRevision(runtime);
}
function report(_err: unknown) {
  if (!config.value) configPresentation.value = null;
  error.value = c.value.error;
}
async function run(action: (current: () => boolean) => Promise<void>, quietRead = false) {
  if (busy.value) return;
  const current = scope(); busy.value = true; silentRead.value = quietRead; error.value = "";
  inFlight = { current, orderNo: requestedOrder ?? order.value?.withdrawalNo ?? null };
  try { await action(current); } catch (err) { if (current()) report(err); }
  finally { if (inFlight?.current === current) inFlight = null; if (current()) { busy.value = false; silentRead.value = false; } }
}
async function load() {
  await run(async current => {
    const owner = app.accountKey, epoch = app.accountBindingEpoch;
    config.value = null; accepted.value = false;
    if (requestedOrder !== null || order.value) {
      const orderNo = requestedOrder ?? order.value!.withdrawalNo;
      if (!/^WD-[A-Z0-9]+$/.test(orderNo)) throw new Error("BANK_ORDER_ROUTE_INVALID");
      const loadedOrder = await api.get(orderNo);
      if (current()) { order.value = loadedOrder; uncertain.value = false; }
      return;
    }
    const pending: unknown = uni.getStorageSync(pendingKey());
    if (typeof pending === "string" && /^BQ-[a-f0-9]{32}$/.test(pending)) {
      uncertain.value = true;
      const recovered = await api.recover(pending); if (!current()) return;
      applyRecovery(recovered);
      if (recovered.state === "COMMITTED") return;
    }
    const loaded = await api.config(); if (!current()) return; config.value = loaded;
    configPresentation.value = { owner, epoch, value: loaded };
    if (loaded.unresolvedIntent?.state === "MULTIPLE") { quote.value = null; uncertain.value = true; return; }
    const intent = loaded.unresolvedIntent?.intents[0];
    if (intent) {
      uncertain.value = true;
      const recovered = await api.recover(intent.quoteNo); if (!current()) return;
      applyRecovery(recovered);
    } else if (loaded.unresolvedIntent === null) {
      quote.value = null; uncertain.value = false;
    }
  }, order.value !== null || config.value !== null);
}
function applyRecovery(recovered: BankRecovery) {
  accepted.value = false;
  if (recovered.state === "COMMITTED") { order.value = recovered; quote.value = null; uni.removeStorageSync(pendingKey()); }
  else if (recovered.state === "NOT_SUBMITTED") quote.value = recovered.quote;
  else { quote.value = null; uni.removeStorageSync(pendingKey()); if (config.value) config.value.unresolvedIntent = undefined; }
  uncertain.value = false;
}
async function openIntent(intent: BankIntent) {
  await run(async current => {
    uncertain.value = true;
    const recovered = await api.recover(intent.quoteNo); if (!current()) return;
    applyRecovery(recovered);
  });
}
function manageBank() { if (!busy.value && !quote.value && !uncertain.value && !multipleIntents.value.length) navTo("/pages/me/wallet-cards-new?returnTo=%2Fpages%2Fme%2Fwallet-withdraw-bank"); }
async function getQuote() {
  if (!canContinue.value || amountProblem.value || uncertain.value || quote.value) return;
  await run(async current => {
    const value = await api.quote(amount.value.trim().replace(",", "."));
    if (current()) { quote.value = value; accepted.value = false; }
  });
}
async function submit() {
  if (!canSubmit.value || uncertain.value) return;
  await run(async current => {
    const no = quote.value!.quoteNo;
    uni.setStorageSync(pendingKey(), no); // Recovery reference only; never persist bank details, OTPs or balances.
    if (uni.getStorageSync(pendingKey()) !== no) throw new Error("BANK_RECOVERY_NOT_DURABLE");
    uncertain.value = true;
    const value = await api.submit(no, `bank-submit:${no}`);
    if (!current()) return;
    order.value = value; quote.value = null; uncertain.value = false; uni.removeStorageSync(pendingKey());
  });
}
async function abandon() {
  if (!quote.value || busy.value || uncertain.value) return;
  await run(async current => {
    uncertain.value = true;
    const recovered = await api.abandon(quote.value!.quoteNo); if (!current()) return;
    applyRecovery(recovered);
    if (recovered.state === "ABANDONED" || recovered.state === "EXPIRED") {
      config.value = null; formStep.value = "amount";
      const owner = app.accountKey, epoch = app.accountBindingEpoch;
      const loaded = await api.config(); if (current()) {
        config.value = loaded; configPresentation.value = { owner, epoch, value: loaded };
      }
    }
  });
}
function startNew() {
  if (!terminal.value || busy.value) return;
  order.value = null; quote.value = null; requestedOrder = null; amount.value = ""; formStep.value = "account"; accepted.value = false; void load();
}
function clearScope() {
  revision++; configPresentation.value = null; config.value = null; quote.value = null; order.value = null; busy.value = false; silentRead.value = false; error.value = ""; uncertain.value = false;
  amount.value = ""; formStep.value = "account"; accepted.value = false; lastCapacityResetRead = "";
}
function invalidate() {
  if (busy.value && inFlight?.current() && inFlight.orderNo === (requestedOrder ?? order.value?.withdrawalNo ?? null)) return;
  clearScope();
  if (alive && visible) void load();
}
watch(() => [app.accountKey, app.accountBindingEpoch] as const, clearScope, { flush: "sync" });
watch(() => [app.accountKey, app.accountBindingEpoch] as const, invalidate);
const stopRuntime = subscribeRuntimeRevision(invalidate);
onLoad(params => {
  const fallback = new URLSearchParams(takeNavigationQuery("/pages/me/wallet-withdraw-bank")).get("order");
  const value = params?.order ?? fallback;
  requestedOrder = value == null ? null : typeof value === "string" ? value : "";
});
watch(now, () => {
  const resetAt = config.value?.capacity?.dailyCountResetAt;
  if (!visible || busy.value || quote.value || order.value || uncertain.value || !resetAt || lastCapacityResetRead === resetAt) return;
  if ((parseServerTimestamp(resetAt) ?? Infinity) <= now.value) { lastCapacityResetRead = resetAt; void load(); }
});
function stopTimer() { if (timer) clearInterval(timer); timer = undefined; }
onShow(() => { visible = true; now.value = Date.now(); stopTimer(); timer = setInterval(() => { now.value = Date.now(); }, 1000); void load(); });
onHide(() => { visible = false; stopTimer(); });
onUnload(() => { alive = false; visible = false; stopTimer(); stopRuntime(); revision++; });
</script>

<style scoped>
.bank-withdraw { padding: 0 24px 40px; color: var(--v5-ink); font-family: var(--font-v5); }
.screen-title { display: block; font-size: 26px; line-height: 1.3; font-weight: 600; letter-spacing: -.5px; overflow-wrap: anywhere; }
.intro { display: block; margin: 10px 0 24px; color: var(--v5-ink-3); font-size: var(--ui-type-list-subtitle); line-height: 1.6; }
.muted { display: block; color: var(--v5-ink-3); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.loading { margin-bottom: 12px; }
.account-card, .amount-card { border-radius: 16px; background: var(--v5-surface-2); padding: 18px; margin: 20px 0; }
.account-number { display: block; font-size: 20px; letter-spacing: 1px; font-variant-numeric: tabular-nums; margin: 6px 0; overflow-wrap: anywhere; }
.bank-name { font-size: var(--ui-type-body); }
.chip { display: inline-block; border-radius: 999px; background: var(--v5-surface-2); color: var(--v5-brand); padding: 4px 10px; font-size: 12px; }
.notice { border-left: 2px solid var(--v5-warning); padding-left: 12px; color: var(--v5-ink-2); font-size: 12px; line-height: 1.7; margin: 20px 0; }
.danger, .error-text { color: var(--v5-danger); }
.error-text { display: block; font-size: 12px; margin-top: 10px; }
.warn { color: var(--v5-warning); }
.action { min-height: 50px; display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px 20px; border-radius: 999px; font-size: var(--ui-type-button); font-weight: 600; cursor: pointer; box-sizing: border-box; }
.primary { background: var(--v5-brand); color: var(--v5-on-brand); margin-top: 24px; }
.secondary { background: var(--v5-surface-2); color: var(--v5-ink); margin-top: 12px; }
[aria-disabled="true"] { opacity: .4; cursor: default; }
.action:focus-visible, .use-max:focus-visible, .consent:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.field-label { display: block; font-size: 12px; color: var(--v5-ink-2); margin: 18px 0 6px; }
.amount-input { display: flex; align-items: center; gap: 8px; border: 1px solid var(--v5-border-strong); border-radius: 12px; padding: 8px 12px; }
.amount-input input { flex: 1; min-width: 0; font-size: 26px; height: 44px; color: var(--v5-ink); }
.use-max { min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; color: var(--v5-brand); font-size: var(--ui-type-body); cursor: pointer; }
.limits { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--v5-ink-3); margin-top: 12px; line-height: 1.5; }
.refresh-limits { min-height: 44px; display: flex; align-items: center; color: var(--v5-brand); cursor: pointer; align-self: flex-start; }
.fee-rule { display: block; margin-top: 6px; }
.details { margin: 20px 0; }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--v5-border); font-size: var(--ui-type-list-subtitle); }
.row > text:first-child { color: var(--v5-ink-3); font-size: 12px; }
.row > text:last-child { max-width: 65%; overflow-wrap: anywhere; text-align: right; font-variant-numeric: tabular-nums; }
.code-value { display: flex; align-items: center; gap: var(--v5-space-2); max-width: 65%; min-width: 0; }
.code-value > text { min-width: 0; overflow-wrap: anywhere; text-align: right; font-variant-numeric: tabular-nums; }
.money { display: block; margin-top: 8px; font-size: 34px; font-weight: 600; line-height: 1.25; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.currency { display: block; margin-top: 8px; font-size: 12px; color: var(--v5-ink-3); }
.consent { display: flex; align-items: flex-start; gap: 10px; min-height: 44px; font-size: 12px; line-height: 1.6; cursor: pointer; margin-bottom: 10px; }
.checkbox { width: 20px; height: 20px; flex-shrink: 0; border: 1px solid var(--v5-border-strong); border-radius: 4px; display: flex; align-items: center; justify-content: center; }
.checkbox.checked { background: var(--v5-brand); color: var(--v5-on-brand); border-color: var(--v5-brand); }
.status-mark { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; background: var(--v5-surface-2); color: var(--v5-brand); border-radius: 50%; font-size: 26px; margin-bottom: 22px; }
</style>
