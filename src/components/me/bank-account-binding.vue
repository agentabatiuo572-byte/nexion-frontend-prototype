<template>
  <view class="bank-binding" data-testid="bank-account-binding">
    <SubPageHeader back="/pages/me/wallet" :title="t.cards.newTitle" />
    <view class="binding-body">
      <view class="binding-head">
        <view class="binding-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" /></svg>
        </view>
        <view>
          <text class="head-title">{{ c.type }}</text>
          <text class="head-note">{{ c.securityNote }}</text>
        </view>
      </view>

      <view v-if="state.config?.beneficiary" class="bound-summary" role="status">
        <text class="head-title">{{ c.accountRoutedLabel }} · {{ state.config.beneficiary.maskedAccount }}</text>
        <text class="hint" data-testid="bank-binding-status">{{ accountStatus }}</text>
        <text class="hint">{{ t.bankWithdrawal.effective }}: {{ displayDate(state.config.beneficiary.effectiveAt) }}</text>
      </view>
      <text v-if="state.busy && !state.config" class="hint" role="status">{{ t.bankWithdrawal.loading }}</text>
      <view v-if="state.error" class="error-note" role="alert"><text>{{ errorMessage }}</text></view>
      <view v-if="state.error === 'load' || state.error === 'unsupported' || state.error === 'routingUnverified'" class="text-action" role="button" tabindex="0" :aria-disabled="state.busy" @click="form.load" @keydown.enter.prevent="form.load" @keydown.space.prevent="form.load"><text>{{ c.retry }}</text></view>

      <template v-if="state.phase !== 'saved'">
        <view v-if="review" class="binding-review" role="group" :aria-label="c.reviewTitle" data-testid="bank-binding-review">
          <text class="head-title" role="heading" aria-level="2">{{ c.reviewTitle }}</text>
          <text class="hint">{{ c.reviewHint }}</text>
          <view class="review-row"><text>{{ c.accountLabel }}</text><text class="mono" data-testid="bank-review-account">{{ review.account }}</text></view>
          <view class="review-row"><text>{{ c.holderLabel }}</text><text data-testid="bank-review-holder">{{ review.holder }}</text></view>
          <view class="submit ready" role="button" tabindex="0" data-testid="bank-bind-confirm" @click="confirmBinding" @keydown.enter.prevent="confirmBinding" @keydown.space.prevent="confirmBinding"><text>{{ c.confirmSave }}</text></view>
          <view class="text-action" role="button" tabindex="0" data-testid="bank-bind-edit" @click="cancelReview" @keydown.enter.prevent="cancelReview" @keydown.space.prevent="cancelReview"><text>{{ c.editDetails }}</text></view>
        </view>
        <view v-else class="binding-fields">
          <text v-if="state.config && directBankBindingAvailable(state.config)" class="hint" role="status" data-testid="bank-account-routed-notice">{{ c.accountRoutedNotice }}</text>
          <text class="field-label">{{ c.accountLabel }} <text class="required">*</text></text>
          <input v-model="state.account" class="field mono" type="text" inputmode="numeric" maxlength="32" autocomplete="off" required aria-required="true" :disabled="fieldsDisabled" :placeholder="c.accountPlaceholder" :aria-label="`${c.accountLabel} · ${c.required}`" data-testid="bank-account" />
          <text class="field-label">{{ c.holderLabel }} <text class="required">*</text></text>
          <input v-model="state.holder" class="field" type="text" maxlength="100" autocomplete="off" required aria-required="true" :disabled="fieldsDisabled" :placeholder="c.holderPlaceholder" :aria-label="`${c.holderLabel} · ${c.required}`" data-testid="bank-holder" />
          <view v-if="state.config?.beneficiary" class="otp-fields">
            <text class="hint">{{ c.otpHint }}</text>
            <text class="field-label">{{ t.bankWithdrawal.code }} <text class="required">*</text></text>
            <input v-model="state.code" class="field mono" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" :disabled="fieldsDisabled" :placeholder="c.otpPlaceholder" :aria-label="t.bankWithdrawal.code" data-testid="bank-otp" />
            <view class="text-action" role="button" tabindex="0" data-testid="bank-send-otp" :aria-disabled="!canSendOtp" @click="sendOtp" @keydown.enter.prevent="sendOtp" @keydown.space.prevent="sendOtp"><text>{{ resendSeconds > 0 ? c.otpResendIn.replace('{s}', String(resendSeconds)) : t.bankWithdrawal.sendCode }}</text></view>
            <text v-if="state.challengeNo" class="hint" role="status" data-testid="bank-otp-status">{{ state.otpExpiresAt > now ? t.bankWithdrawal.otpSent : c.otpExpired }}</text>
          </view>
          <view class="default-row" role="group" :aria-label="`${c.defaultLabel} · ${t.cards.formDefaultOn}`">
            <view class="default-check" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.4"><path d="m5 12 4 4L19 6" /></svg></view>
            <text>{{ c.defaultLabel }}</text><text class="default-state">{{ t.cards.formDefaultOn }}</text>
          </view>
          <text class="hint">{{ c.singleAccount }}</text>
        </view>
        <view v-if="!review" class="submit" :class="{ ready: canSubmit }" role="button" tabindex="0" data-testid="bank-bind-continue" :aria-disabled="!canSubmit" @click="submitBinding" @keydown.enter.prevent="submitBinding" @keydown.space.prevent="submitBinding">
          <text>{{ state.busy ? t.bankWithdrawal.loading : state.phase === 'uncertain' ? c.retryOriginal : canSubmit ? c.continue : t.cards.formSubmitDisabled }}</text>
        </view>
        <text class="disclaimer">{{ c.disclaimer }}</text>
      </template>
      <template v-else>
        <text class="saved-note" role="status" data-testid="bank-bind-saved">{{ t.bankWithdrawal.bound }}</text>
        <view class="submit ready" role="button" tabindex="0" data-testid="bank-bind-done" @click="done" @keydown.enter.prevent="done" @keydown.space.prevent="done"><text>{{ c.done }}</text></view>
      </template>
      <text v-if="state.config && directBankBindingAvailable(state.config)" class="disclaimer">{{ t.bankWithdrawal.bindingNotice }}</text>
    </view>

  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from "vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { useApp } from "@/store/app";
import { apiClient } from "@/api/runtime";
import { createBankWithdrawalApi } from "@/api/bank-withdrawal-api";
import { captureRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { formatBankDateTime } from "@/lib/bank-date";
import { createBankBindingForm, directBankBindingAvailable } from "@/lib/bank-binding-form";
import { bankAccountNotice } from "@/lib/bank-withdrawal-state";
import { navReplace } from "@/lib/route";

const props = defineProps<{ active: boolean; returnTo: string }>();
const t = useT(), c = computed(() => t.value.bankBinding), app = useApp();
const identity = () => `${app.accountKey}:${app.accountBindingEpoch}:${captureRuntimeRevision().epoch}`;
const form = createBankBindingForm(createBankWithdrawalApi(apiClient), identity);
const state = form.state, now = ref(Date.now());
const review = ref<{ account: string; holder: string; code: string; challengeNo: string; owner: string; config: typeof state.config } | null>(null);
const accountStatus = computed(() => state.config?.beneficiary ? t.value.bankWithdrawal.accountStatus[bankAccountNotice(state.config.beneficiary)] : "");
const fieldsDisabled = computed(() => state.busy || state.phase !== "details" || !directBankBindingAvailable(state.config));
const canSubmit = computed(() => { void now.value; return !state.busy && (state.phase === "uncertain" || form.canContinue()); });
const canSendOtp = computed(() => { void now.value; return form.canSendOtp(); });
const resendSeconds = computed(() => Math.max(0, Math.ceil((state.resendAt - now.value) / 1000)));
function sendOtp() { if (canSendOtp.value) void form.sendOtp(); }
const errorMessage = computed(() => ({ load: c.value.loadError, unsupported: c.value.unsupported, routingUnverified: c.value.routingUnverified, bind: c.value.bindError, unknown: c.value.unknown, otpSend: c.value.otpSendError, otpInvalid: c.value.otpInvalid, otpRateLimited: c.value.otpRateLimited }[state.error] || c.value.bindError));
const displayDate = formatBankDateTime;
function submitBinding() {
  if (!canSubmit.value) return;
  if (state.phase === "uncertain") { void form.submit(); return; }
  review.value = { account: state.account.trim(), holder: state.holder.trim(), code: state.code,
    challengeNo: state.challengeNo, owner: identity(), config: state.config };
  void nextTick(() => { if (typeof document !== "undefined") document.querySelector<HTMLElement>('[data-testid="bank-bind-confirm"]')?.focus(); });
}
function cancelReview() { review.value = null; void nextTick(() => { if (typeof document !== "undefined") document.querySelector<HTMLElement>('[data-testid="bank-bind-continue"]')?.focus(); }); }
function confirmBinding() {
  const checked = review.value;
  if (!checked) return;
  review.value = null;
  if (checked.owner !== identity() || checked.config !== state.config || checked.account !== state.account.trim()
    || checked.holder !== state.holder.trim() || checked.code !== state.code || checked.challengeNo !== state.challengeNo
    || !form.canContinue()) return;
  void form.submit(true);
}
watch(() => state.phase, async phase => {
  if (phase !== "saved") return;
  await nextTick();
  if (typeof document !== "undefined") document.querySelector<HTMLElement>('[data-testid="bank-bind-done"]')?.focus();
});
let timer: ReturnType<typeof setInterval> | undefined;
function reset() {
  review.value = null;
  form.reset();
  if (timer) clearInterval(timer); timer = undefined;
  if (props.active) { now.value = Date.now(); timer = setInterval(() => { now.value = Date.now(); }, 1000); void form.load(); }
}
watch(() => [props.active, app.accountKey, app.accountBindingEpoch] as const, reset, { immediate: true });
const stopRuntime = subscribeRuntimeRevision(reset);
onBeforeUnmount(() => { stopRuntime(); if (timer) clearInterval(timer); form.reset(); });
function done() { void navReplace(props.returnTo === "/pages/me/wallet-cards" ? "/pages/me/wallet" : props.returnTo); }
</script>

<style scoped>
.bank-binding { color: var(--v5-ink); }
.binding-body { padding: 0 16px 28px; }
.binding-head { display: flex; align-items: center; gap: 12px; padding: 0 2px 14px; border-bottom: 1px solid color-mix(in srgb, var(--v5-border) 70%, transparent); }
.binding-icon { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: 8px; background: color-mix(in srgb, var(--v5-brand-2) 15%, transparent); }
.head-title { display: block; font-size: 13px; font-weight: 600; }
.head-note { display: block; margin-top: 2px; font-size: 12px; color: var(--v5-ink-3); }
.binding-fields { padding: 16px 2px 0; }
.field-label { display: block; margin-bottom: 4px; font-size: 12px; color: var(--v5-ink-3); }
.required { color: var(--v5-brand-2); }
.field { box-sizing: border-box; width: 100%; height: 40px; min-height: 40px; background: var(--v5-surface-2); border: 1px solid var(--v5-border); border-radius: 8px; padding: 0 12px; margin-bottom: 12px; font-size: 13px; color: var(--v5-ink); }
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: .03em; }
.default-row { display: flex; align-items: center; gap: 8px; margin-top: 4px; min-height: 44px; color: var(--v5-ink-2); font-size: 13px; }
.default-check { width: 18px; height: 18px; flex-shrink: 0; background: var(--v5-ink); border-radius: 2px; display: grid; place-items: center; }
.default-state { margin-left: auto; color: var(--v5-brand); font-size: 12px; font-weight: 600; }
.hint { display: block; color: var(--v5-ink-3); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.submit { display: flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 48px; padding: 8px 16px; margin-top: 16px; border-radius: 999px; background: var(--v5-surface-2); color: var(--v5-ink-4); font-size: 13px; font-weight: 600; text-align: center; }
.submit.ready { background: var(--v5-brand); color: var(--v5-on-brand); cursor: pointer; }
.submit.ready:active { transform: scale(.98); }
.disclaimer { display: block; margin-top: 12px; padding: 0 4px; color: var(--v5-ink-3); font-size: 12px; line-height: 1.625; }
.error-note { display: block; margin: 12px 0; padding: 12px; background: color-mix(in srgb, var(--v5-danger) 10%, transparent); border-radius: 8px; color: var(--v5-danger); font-size: 12px; line-height: 1.6; }
.text-action { min-height: 44px; display: flex; align-items: center; color: var(--v5-brand); font-size: 13px; }
.bound-summary { padding: 14px 2px; border-bottom: 1px solid var(--v5-border); }
.binding-review { padding: 16px 2px 0; }
.review-row { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--v5-border); font-size: 13px; overflow-wrap: anywhere; }
.saved-note { display: block; margin: 20px 0; font-size: 13px; color: var(--v5-brand); }
[aria-disabled="true"] { cursor: default; }
</style>
