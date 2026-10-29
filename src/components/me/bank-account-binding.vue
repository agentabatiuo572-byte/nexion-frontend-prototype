<template>
  <view class="bank-binding" data-testid="bank-account-binding">
    <SubPageHeader back="/pages/me/me" :title="headerTitle" :back-action="headerBack" />
    <view class="binding-body">
      <text v-if="state.busy && !state.config" class="hint" role="status">{{ t.bankWithdrawal.loading }}</text>
      <view v-if="state.error" class="error-note" role="alert"><text>{{ errorMessage }}</text></view>
      <view v-if="state.error === 'load' || state.error === 'unsupported' || state.error === 'routingUnverified'" class="text-action" role="button" tabindex="0" :aria-disabled="state.busy" @click="form.load" @keydown.enter.prevent="form.load" @keydown.space.prevent="form.load"><text>{{ c.retry }}</text></view>

      <!-- Saved: first binding or a completed change. -->
      <view v-if="screen === 'saved'" class="binding-done">
        <view class="done-icon" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg></view>
        <text class="done-title" role="status" data-testid="bank-bind-saved">{{ savedAfterChange ? c.savedChangedTitle : t.bankWithdrawal.bound }}</text>
        <text v-if="state.config?.beneficiary" class="done-account mono">{{ state.config.beneficiary.maskedAccount }}</text>
        <view class="done-notes">
          <text class="hint" data-testid="bank-binding-status">{{ accountStatus }}</text>
          <text class="hint">{{ c.doneNote }}</text>
        </view>
        <view class="done-actions">
          <view class="submit ready" role="button" tabindex="0" @click="goWithdraw" @keydown.enter.prevent="goWithdraw" @keydown.space.prevent="goWithdraw"><text>{{ c.goWithdraw }}</text></view>
          <view class="glass-action" role="button" tabindex="0" data-testid="bank-bind-done" @click="done" @keydown.enter.prevent="done" @keydown.space.prevent="done"><LiquidGlass :radius="24" tone="control" /><text>{{ c.done }}</text></view>
        </view>
      </view>

      <!-- Bound account overview: change entry, or why it is locked. -->
      <template v-else-if="screen === 'overview' && state.config?.beneficiary">
        <view class="account-card bound-summary">
          <view class="account-head">
            <view class="account-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18" /><path d="M5 10v8" /><path d="M9.5 10v8" /><path d="M14.5 10v8" /><path d="M19 10v8" /><path d="M3 21h18" /><path d="m12 3 9 5H3z" /></svg></view>
            <view class="account-title">
              <text class="row-title">{{ c.currentAccount }}</text>
              <text class="hint">{{ t.bankWithdrawal.recipientSubtitle }}</text>
            </view>
            <NxTag :tone="accountNotice === 'ready' ? 'success' : 'warning'" :label="accountNotice === 'ready' ? c.statusReady : c.statusUnavailable" />
          </view>
          <view class="account-number">
            <text class="mono account-masked">{{ state.config.beneficiary.maskedAccount }}</text>
            <text class="hint">{{ t.bankWithdrawal.effective }}: {{ displayDate(state.config.beneficiary.effectiveAt) }}</text>
          </view>
          <text v-if="accountNotice !== 'ready'" class="hint warn-text" data-testid="bank-binding-status">{{ accountStatus }}</text>
        </view>
        <template v-if="changeLocked">
          <view class="glass-action" role="button" tabindex="-1" aria-disabled="true" data-testid="bank-change"><LiquidGlass :radius="24" tone="control" /><text>{{ c.locked }}</text></view>
          <text class="hint">{{ c.lockedReason }}</text>
          <view class="link-row" role="link" tabindex="0" @click="goWithdraw" @keydown.enter.prevent="goWithdraw"><text>{{ c.viewWithdrawal }}</text><text aria-hidden="true">›</text></view>
        </template>
        <view v-else-if="directBankBindingAvailable(state.config)" class="glass-action change-action" role="button" tabindex="0" data-testid="bank-change" @click="startChange" @keydown.enter.prevent="startChange" @keydown.space.prevent="startChange"><LiquidGlass :radius="24" tone="control" /><text>{{ c.changeAccount }}</text></view>
        <view class="rules" role="group" :aria-label="copy.bankRules">
          <text class="rules-title">{{ copy.bankRules }}</text>
          <text v-for="rule in rules" :key="rule" class="hint rule">{{ rule }}</text>
        </view>
      </template>

      <!-- Change step 2: review the new account and confirm with the SMS code. -->
      <template v-else-if="screen === 'verify' && state.config?.beneficiary">
        <view class="steps" aria-hidden="true"><text class="step step--on">1 {{ c.stepNew }}</text><text class="step step--on">2 {{ c.stepVerify }}</text></view>
        <view class="section-head"><text class="section-title">{{ c.verifyTitle }}</text><text class="hint">{{ c.verifyHint }}</text></view>
        <view class="group" role="group" :aria-label="c.reviewTitle" data-testid="bank-binding-review">
          <view class="review-row"><text>{{ c.oldAccount }}</text><text class="mono muted">{{ state.config.beneficiary.maskedAccount }}</text></view>
          <view class="review-row"><text>{{ c.newAccount }}</text><text class="mono strong" data-testid="bank-review-account">{{ state.account.trim() }}</text></view>
          <view class="review-row"><text>{{ c.holderLabel }}</text><text class="strong" data-testid="bank-review-holder">{{ state.holder.trim() }}</text></view>
          <view v-if="state.phase === 'details'" class="group-link" role="button" tabindex="0" data-testid="bank-bind-edit" @click="changeStep = 1" @keydown.enter.prevent="changeStep = 1" @keydown.space.prevent="changeStep = 1"><text>{{ c.editDetails }}</text></view>
        </view>
        <view class="field-block">
        <view class="group">
          <view class="field-row">
            <text class="field-label">{{ t.bankWithdrawal.code }}</text>
            <input v-model="state.code" class="field mono" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" :disabled="fieldsDisabled" :placeholder="c.otpPlaceholder" placeholder-style="color: var(--v5-ink-4)" :aria-label="`${t.bankWithdrawal.code} · ${c.required}`" aria-required="true" data-testid="bank-otp" />
            <view class="otp-send nx-frosted-button" role="button" tabindex="0" data-testid="bank-send-otp" :aria-disabled="!canSendOtp" @click="sendOtp" @keydown.enter.prevent="sendOtp" @keydown.space.prevent="sendOtp"><text>{{ resendSeconds > 0 ? c.otpResendIn.replace('{s}', String(resendSeconds)) : t.bankWithdrawal.sendCode }}</text></view>
          </view>
        </view>
        <text v-if="state.challengeNo" class="hint" role="status" data-testid="bank-otp-status">{{ state.otpExpiresAt > now ? c.otpSentValid.replace('{m}', String(otpMinutesLeft)) : c.otpExpired }}</text>
        <text v-else class="hint">{{ c.otpHint }}</text>
        </view>
        <view class="submit" :class="{ ready: canSubmit }" role="button" tabindex="0" data-testid="bank-bind-continue" :aria-disabled="!canSubmit" @click="submitChange" @keydown.enter.prevent="submitChange" @keydown.space.prevent="submitChange">
          <text>{{ state.busy ? t.bankWithdrawal.loading : state.phase === 'uncertain' ? c.retryOriginal : c.confirmChange }}</text>
        </view>
        <text class="hint footnote">{{ c.changeEffectiveNote }}</text>
      </template>

      <!-- First binding, or change step 1: the new account. -->
      <template v-else-if="screen === 'first' || screen === 'details'">
        <view v-if="screen === 'details'" class="steps" aria-hidden="true"><text class="step step--on">1 {{ c.stepNew }}</text><text class="step">2 {{ c.stepVerify }}</text></view>
        <view v-if="screen === 'details'" class="section-head"><text class="section-title">{{ c.newAccountTitle }}</text><text class="hint" data-testid="bank-account-routed-notice">{{ c.accountRoutedNotice }}</text></view>
        <view v-else class="first-head">
          <view class="first-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18" /><path d="M5 10v8" /><path d="M9.5 10v8" /><path d="M14.5 10v8" /><path d="M19 10v8" /><path d="M3 21h18" /><path d="m12 3 9 5H3z" /></svg></view>
          <text class="first-title">{{ c.firstTitle }}</text>
          <text class="hint">{{ t.bankWithdrawal.recipientSubtitle }}</text>
        </view>
        <view class="field-block">
        <view class="group">
          <view class="field-row">
            <text class="field-label">{{ c.accountLabel }}</text>
            <input v-model="state.account" class="field mono" type="text" inputmode="numeric" maxlength="32" autocomplete="off" required aria-required="true" :disabled="fieldsDisabled" :placeholder="c.accountPlaceholder" placeholder-style="color: var(--v5-ink-4)" :aria-label="`${c.accountLabel} · ${c.required}`" data-testid="bank-account" />
          </view>
          <view class="field-row">
            <text class="field-label">{{ c.holderLabel }}</text>
            <input v-model="state.holder" class="field" type="text" maxlength="100" autocomplete="off" required aria-required="true" :disabled="fieldsDisabled" :placeholder="c.holderPlaceholder" placeholder-style="color: var(--v5-ink-4)" :aria-label="`${c.holderLabel} · ${c.required}`" data-testid="bank-holder" />
          </view>
        </view>
        <view class="hint-stack">
          <text class="hint">{{ c.accountHint }}</text>
          <text v-if="screen === 'first'" class="hint">{{ c.firstNoSms }}</text>
        </view>
        </view>
        <view v-if="screen === 'details'" class="submit" :class="{ ready: canGoNext }" role="button" tabindex="0" data-testid="bank-change-next" :aria-disabled="!canGoNext" @click="goVerify" @keydown.enter.prevent="goVerify" @keydown.space.prevent="goVerify"><text>{{ canGoNext ? c.next : t.cards.formSubmitDisabled }}</text></view>
        <view v-else class="submit" :class="{ ready: canSubmit }" role="button" tabindex="0" data-testid="bank-bind-continue" :aria-disabled="!canSubmit" @click="submitBinding" @keydown.enter.prevent="submitBinding" @keydown.space.prevent="submitBinding">
          <text>{{ state.busy ? t.bankWithdrawal.loading : state.phase === 'uncertain' ? c.retryOriginal : canSubmit ? c.continue : t.cards.formSubmitDisabled }}</text>
        </view>
        <view class="footnote-row"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg><text>{{ copy.bankFooter }}</text></view>
      </template>
    </view>

    <!-- First binding confirmation: the user must confirm account number and holder before saving. -->
    <view v-if="review" class="review-sheet-root">
      <view class="review-scrim nx-sheet-fade-in" @click="cancelReview" />
      <view class="nx-glass-sheet nx-sheet-slide-up review-sheet" role="dialog" aria-modal="true" :aria-label="c.reviewTitle" data-testid="bank-binding-review">
        <view class="sheet-handle" aria-hidden="true" />
        <view class="sheet-head"><text class="section-title" role="heading" aria-level="2">{{ c.reviewTitle }}</text><text class="hint">{{ c.reviewHint }}</text></view>
        <view class="group group--inset">
          <view class="review-row"><text>{{ c.accountLabel }}</text><text class="mono strong" data-testid="bank-review-account">{{ review.account }}</text></view>
          <view class="review-row"><text>{{ c.holderLabel }}</text><text class="strong" data-testid="bank-review-holder">{{ review.holder }}</text></view>
        </view>
        <text class="hint">{{ c.effectiveNote }}</text>
        <view class="sheet-actions">
          <view class="submit ready" role="button" tabindex="0" data-testid="bank-bind-confirm" @click="confirmBinding" @keydown.enter.prevent="confirmBinding" @keydown.space.prevent="confirmBinding"><text>{{ c.confirmSave }}</text></view>
          <view class="glass-action" role="button" tabindex="0" data-testid="bank-bind-edit" @click="cancelReview" @keydown.enter.prevent="cancelReview" @keydown.space.prevent="cancelReview"><LiquidGlass :radius="24" tone="control" /><text>{{ c.editDetails }}</text></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { dateLocale } from "@/i18n/format";
import { computed, ref, watch, nextTick, onBeforeUnmount } from "vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import LiquidGlass from "@/components/liquid-glass.vue";
import NxTag from "@/components/ui/nx-tag.vue";
import { useT } from "@/i18n/use-t";
import { useApp } from "@/store/app";
import { apiClient } from "@/api/runtime";
import { createBankWithdrawalApi } from "@/api/bank-withdrawal-api";
import { captureRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { formatBankDateTime } from "@/lib/bank-date";
import { createBankBindingForm, directBankBindingAvailable, validBankRecipient } from "@/lib/bank-binding-form";
import { bankAccountNotice } from "@/lib/bank-withdrawal-state";
import { navReplace, navTo } from "@/lib/route";
import { requireAccountPhone } from "@/lib/require-account-phone";
import { useFinanceReviewCopy } from "@/lib/finance-review-copy";

const props = defineProps<{ active: boolean; returnTo: string }>();
const t = useT(), c = computed(() => t.value.bankBinding), app = useApp();
const copy = useFinanceReviewCopy();
const identity = () => `${app.accountKey}:${app.accountBindingEpoch}:${captureRuntimeRevision().epoch}`;
const form = createBankBindingForm(createBankWithdrawalApi(apiClient), identity);
const state = form.state, now = ref(Date.now());
const review = ref<{ account: string; holder: string; code: string; challengeNo: string; owner: string; config: typeof state.config } | null>(null);
// A bound account opens on its overview; changing it is an explicit two-step flow
// (new account, then review + SMS). First binding needs no SMS.
const changing = ref(false);
const changeStep = ref<1 | 2>(1);
const savedAfterChange = ref(false);
const screen = computed(() => state.phase === "saved" ? "saved"
  : !state.config?.beneficiary ? "first"
  : !changing.value ? "overview" : changeStep.value === 1 ? "details" : "verify");
// A pending quote or withdrawal blocks a change; the server rejects one as well.
const changeLocked = computed(() => !!state.config?.unresolvedIntent);
const accountNotice = computed(() => state.config?.beneficiary ? bankAccountNotice(state.config.beneficiary) : "ready");
const accountStatus = computed(() => state.config?.beneficiary ? t.value.bankWithdrawal.accountStatus[accountNotice.value] : "");
const headerTitle = computed(() => screen.value === "details" || screen.value === "verify" || (screen.value === "saved" && savedAfterChange.value)
  ? c.value.changeTitle : screen.value === "overview" ? c.value.overviewTitle : t.value.cards.newTitle);
const rules = computed(() => [c.value.rule1, c.value.rule2, c.value.rule3, c.value.rule4]);
const fieldsDisabled = computed(() => state.busy || state.phase !== "details" || !directBankBindingAvailable(state.config));
const canSubmit = computed(() => { void now.value; return !state.busy && (state.phase === "uncertain" || form.canContinue()); });
const canSendOtp = computed(() => { void now.value; return form.canSendOtp(); });
const canGoNext = computed(() => !fieldsDisabled.value && validBankRecipient(state));
const resendSeconds = computed(() => Math.max(0, Math.ceil((state.resendAt - now.value) / 1000)));
const otpMinutesLeft = computed(() => Math.max(1, Math.ceil((state.otpExpiresAt - now.value) / 60000)));
function sendOtp() { if (canSendOtp.value && requireAccountPhone()) void form.sendOtp(); }
const errorMessage = computed(() => ({ load: c.value.loadError, unsupported: c.value.unsupported, routingUnverified: c.value.routingUnverified, bind: c.value.bindError, unknown: c.value.unknown, otpSend: c.value.otpSendError, otpInvalid: c.value.otpInvalid, otpRateLimited: c.value.otpRateLimited }[state.error] || c.value.bindError));
const displayDate = (value: string) => formatBankDateTime(value, dateLocale());
function focusTestId(id: string) {
  void nextTick(() => { if (typeof document !== "undefined") document.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.focus(); });
}
function startChange() {
  if (changeLocked.value || !directBankBindingAvailable(state.config)) return;
  changing.value = true; changeStep.value = 1;
}
function goVerify() {
  if (!canGoNext.value) return;
  changeStep.value = 2;
  focusTestId("bank-send-otp");
}
// Header back walks the change flow one step at a time; outside it, the page goes back.
const headerBack = computed(() => {
  if (state.phase !== "details" || !changing.value) return undefined;
  return () => { if (changeStep.value === 2) changeStep.value = 1; else changing.value = false; };
});
function submitBinding() {
  if (!canSubmit.value) return;
  if (state.phase === "uncertain") { void form.submit(); return; }
  review.value = { account: state.account.trim(), holder: state.holder.trim(), code: state.code,
    challengeNo: state.challengeNo, owner: identity(), config: state.config };
  focusTestId("bank-bind-confirm");
}
// Step 2 shows the new account next to the SMS code, so submitting it is the routing confirmation.
function submitChange() {
  if (!canSubmit.value) return;
  savedAfterChange.value = true;
  void form.submit(state.phase !== "uncertain");
}
function cancelReview() { review.value = null; focusTestId("bank-bind-continue"); }
function confirmBinding() {
  const checked = review.value;
  if (!checked) return;
  review.value = null;
  if (checked.owner !== identity() || checked.config !== state.config || checked.account !== state.account.trim()
    || checked.holder !== state.holder.trim() || checked.code !== state.code || checked.challengeNo !== state.challengeNo
    || !form.canContinue()) return;
  savedAfterChange.value = false;
  void form.submit(true);
}
watch(() => state.phase, phase => {
  if (phase === "saved") focusTestId("bank-bind-done");
});
let timer: ReturnType<typeof setInterval> | undefined;
function reset() {
  review.value = null;
  changing.value = false; changeStep.value = 1; savedAfterChange.value = false;
  form.reset();
  if (timer) clearInterval(timer); timer = undefined;
  if (props.active) { now.value = Date.now(); timer = setInterval(() => { now.value = Date.now(); }, 1000); void form.load(); }
}
watch(() => [props.active, app.accountKey, app.accountBindingEpoch] as const, reset, { immediate: true });
const stopRuntime = subscribeRuntimeRevision(reset);
onBeforeUnmount(() => { stopRuntime(); if (timer) clearInterval(timer); form.reset(); });
function done() { void navReplace(props.returnTo === "/pages/me/wallet-cards" ? "/pages/me/me" : props.returnTo); }
function goWithdraw() { navTo("/pages/me/wallet-withdraw-bank"); }
</script>

<style scoped>
.bank-binding { color: var(--v5-ink); }
.binding-body { display: flex; flex-direction: column; gap: 16px; padding: 0 16px 28px; }
/* Standalone notes share the 4px inset of section titles. */
.binding-body > .hint, .field-block > .hint, .hint-stack { padding: 0 4px; }
.hint-stack { display: flex; flex-direction: column; }
.hint { display: block; color: var(--v5-ink-3); font: 400 var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); overflow-wrap: anywhere; }
.warn-text { color: var(--v5-warning-ink); }
/* Account numbers and codes are read character by character (01 §1.2). */
.mono { font-family: var(--font-jet-mono); font-variant-numeric: tabular-nums; letter-spacing: .03em; }
.error-note { display: block; padding: 12px; background: color-mix(in srgb, var(--v5-danger) 10%, transparent); border-radius: 12px; color: var(--v5-danger); font-size: 12px; line-height: 1.6; }
.text-action { min-height: 44px; display: flex; align-items: center; color: var(--v5-brand); font-size: 13px; }
/* Current account */
.account-card { display: flex; flex-direction: column; gap: 12px; padding: var(--ui-space-inset-hero); border: 1px solid var(--v5-border); border-radius: var(--ui-radius-surface); background: var(--v5-surface); }
.account-head { display: flex; align-items: center; gap: 12px; }
.account-icon, .first-icon { display: grid; place-items: center; flex: none; color: var(--v5-brand); background: color-mix(in srgb, var(--v5-brand) 16%, transparent); }
.account-icon { width: 36px; height: 36px; border-radius: 12px; }
.account-title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.row-title { font: var(--ui-type-subheading-weight) var(--ui-type-subheading)/var(--ui-type-subheading-lh) var(--font-v5); }
.account-number { display: flex; flex-direction: column; gap: 4px; padding-top: 12px; border-top: 1px solid var(--v5-border); }
.account-masked { font-size: 20px; line-height: 28px; font-weight: 500; letter-spacing: .06em; }
.rules { display: flex; flex-direction: column; gap: 4px; margin-top: 16px; padding: 0 4px; }
.rules-title { font: 500 13px/18px var(--font-v5); color: var(--v5-ink); margin-bottom: 4px; }
.rule { padding-left: 14px; position: relative; }
.rule::before { content: "•"; position: absolute; left: 2px; }
.link-row { display: flex; align-items: center; justify-content: space-between; min-height: 44px; padding: 0 4px; color: var(--v5-ink-3); font: 500 13px/18px var(--font-v5); }
/* Steps and sections */
.steps { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.step { padding-top: 9px; border-top: 3px solid var(--v5-surface-3); color: var(--v5-ink-3); font: 500 12px/16px var(--font-v5); }
.step--on { border-top-color: var(--v5-brand); color: var(--v5-brand); }
.section-head { display: flex; flex-direction: column; gap: 4px; padding: 4px 4px 0; }
.section-head .hint, .first-head .hint, .sheet-head .hint { font: 400 var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.section-title { font: var(--ui-type-section-weight) var(--ui-type-section)/var(--ui-type-section-lh) var(--font-v5); }
.first-head { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 16px 8px; text-align: center; }
.first-icon { width: 56px; height: 56px; border-radius: 18px; }
.first-title { font: var(--ui-type-hero-title-weight, 600) var(--ui-type-hero-title)/var(--ui-type-hero-title-lh) var(--font-v5); }
/* Grouped fields and review rows */
.field-block { display: flex; flex-direction: column; gap: 8px; }
.group { border-radius: var(--ui-radius-surface); border: 1px solid var(--v5-border); background: var(--v5-surface); overflow: hidden; }
.group--inset { border: 0; background: var(--v5-surface-2); }
.field-row { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 0 16px; border-bottom: 1px solid var(--v5-border); }
.field-row:last-child { border-bottom: 0; }
/* At least 72px so zh labels align; longer en/vi labels keep one line. */
.field-label { flex: none; min-width: 72px; max-width: 45%; color: var(--v5-ink-3); font: 400 14px/20px var(--font-v5); }
.field { flex: 1; min-width: 0; box-sizing: border-box; height: 44px; min-height: 44px; padding: 0; background: transparent; border: 0; font-size: var(--ui-type-input); line-height: var(--ui-type-input-lh); color: var(--v5-ink); }
/* Brand glass S (03 §3.1): frosted material with a 14% brand fill. */
.otp-send { --ui-button-fill: color-mix(in srgb, var(--v5-brand) 14%, transparent); --ui-button-ink: var(--v5-brand); flex: none; display: inline-flex; align-items: center; min-height: 32px; padding: 0 12px; border-radius: 999px; font: var(--ui-type-compact-button-weight) var(--ui-type-compact-button)/var(--ui-type-compact-button-lh) var(--font-v5); white-space: nowrap; }
.otp-send[aria-disabled="true"] { opacity: .5; }
.review-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 52px; padding: 0 16px; border-bottom: 1px solid var(--v5-border); color: var(--v5-ink-3); font: 400 14px/20px var(--font-v5); overflow-wrap: anywhere; }
.review-row:last-child { border-bottom: 0; }
.strong { color: var(--v5-ink); font-size: 15px; font-weight: 500; text-align: right; }
.muted { color: var(--v5-ink-3); }
.group-link { display: flex; align-items: center; justify-content: center; min-height: 44px; color: var(--v5-brand); font: var(--ui-type-compact-button-weight) var(--ui-type-compact-button)/var(--ui-type-compact-button-lh) var(--font-v5); }
/* Actions */
/* Primary L (03 §3.1); disabled is the same button at 50%. */
.submit { display: flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 48px; padding: 8px 20px; border-radius: 999px; background: var(--v5-brand); color: var(--v5-on-brand); font: var(--ui-type-button-weight) var(--ui-type-button)/var(--ui-type-button-lh) var(--font-v5); text-align: center; opacity: .5; }
.submit.ready { opacity: 1; cursor: pointer; }
.submit.ready:active { transform: scale(.98); }
/* Neutral glass L (03 §3.1). */
.glass-action { position: relative; isolation: isolate; display: grid; place-items: center; min-height: 48px; border-radius: 24px; color: var(--v5-ink); font: var(--ui-type-button-weight) var(--ui-type-button)/var(--ui-type-button-lh) var(--font-v5); cursor: pointer; }
.glass-action[aria-disabled="true"] { opacity: .5; cursor: default; }
.glass-action > text { position: relative; z-index: 1; }
.footnote { padding: 0 4px; }
.footnote-row { display: flex; gap: 8px; padding: 0 4px; color: var(--v5-ink-3); font: 400 var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); }
.footnote-row svg { flex: none; margin-top: 2px; }
/* Saved */
.binding-done { display: flex; flex-direction: column; align-items: center; gap: 12px; padding-top: 48px; text-align: center; }
.done-notes { display: flex; flex-direction: column; padding: 0 16px; }
.done-icon { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 999px; background: color-mix(in srgb, var(--v5-brand) 16%, transparent); color: var(--v5-brand); }
.done-title { font: 600 var(--ui-type-hero-title)/var(--ui-type-hero-title-lh) var(--font-v5); }
.done-account { font-size: 17px; line-height: 24px; font-weight: 500; letter-spacing: .06em; }
.done-actions { align-self: stretch; display: flex; flex-direction: column; gap: 8px; margin-top: 24px; }
/* First-binding review sheet */
.review-sheet-root { position: fixed; inset: 0; z-index: 790; display: flex; align-items: flex-end; }
.review-scrim { position: absolute; inset: 0; background: var(--v5-bg-color-mask); }
.review-sheet { position: relative; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; padding: 8px 16px calc(16px + var(--nx-overlay-safe-bottom, 0px)); border-radius: 28px 28px 0 0; background: var(--v5-surface); }
.sheet-handle { width: 36px; height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--v5-ink) 18%, transparent); align-self: center; }
.sheet-head { display: flex; flex-direction: column; gap: 4px; padding: 4px 4px 0; }
.sheet-actions { display: flex; flex-direction: column; gap: 8px; }
[aria-disabled="true"] { cursor: default; }
</style>
