<template>
  <AppChassis active="me">
    <SubPageHeader back="/pages/me/me" :title="state?.configured ? t.paymentPin.change : t.paymentPin.title" />
    <view class="payment-pin-page">
      <text class="payment-pin-page__note">{{ t.paymentPin.purpose }}</text>
      <view v-if="loading" role="status"><text class="payment-pin-page__note">{{ t.paymentPin.loading }}</text></view>
      <template v-else-if="ui.pendingOperation">
        <text class="payment-pin-page__note" role="status">{{ t.paymentPin.pending }}</text>
        <view class="payment-pin-page__primary" role="button" tabindex="0" @click="pin.resumePending">{{ t.paymentPin.query }}</view>
      </template>
      <template v-else-if="!state">
        <text class="payment-pin-page__error" role="alert">{{ t.paymentPin.readFailed }}</text>
        <view class="payment-pin-page__primary" role="button" tabindex="0" @click="load">{{ t.paymentPin.retry }}</view>
      </template>
      <template v-else-if="!state.configured">
        <text class="payment-pin-page__note">{{ t.paymentPin.notConfigured }}</text>
        <view class="payment-pin-page__primary" role="button" tabindex="0" @click="setup">{{ t.paymentPin.setup }}</view>
      </template>
      <template v-else>
        <view v-for="field in fields" :key="field.key" class="payment-pin-page__field">
          <text class="payment-pin-page__label">{{ field.label }}</text>
          <PaymentPasswordInput v-model="passwords[field.key]" :label="field.label" :disabled="ui.busy || !!state.lockedUntil" />
        </view>
        <text class="payment-pin-page__note">{{ t.paymentPin.rule }}</text>
        <text v-if="validation" class="payment-pin-page__error" role="alert">{{ validation }}</text>
        <text v-else-if="error" class="payment-pin-page__error" role="alert">{{ error }}</text>
        <text v-if="pin.locked()" class="payment-pin-page__error" role="alert">{{ lockMessage }}</text>
        <text v-else-if="!complete" class="payment-pin-page__note">{{ t.paymentPin.incomplete }}</text>
        <view class="payment-pin-page__primary" role="button" :tabindex="canSave ? 0 : -1" :aria-disabled="!canSave" @click="save">{{ ui.busy ? t.paymentPin.changing : t.paymentPin.save }}</view>
        <view v-if="state.lockedUntil && !pin.locked()" class="payment-pin-page__link" role="button" tabindex="0" @click="load">{{ t.paymentPin.retry }}</view>
        <view class="payment-pin-page__link" role="button" tabindex="0" :aria-disabled="ui.busy" @click="recover">{{ t.paymentPin.forgot }}</view>
      </template>
    </view>
  </AppChassis>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { onHide, onShow, onUnload } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import PaymentPasswordInput from "@/components/payment-password-input.vue";
import { usePaymentPassword, simplePaymentPassword, validPaymentPassword } from "@/store/payment-password";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { navTo } from "@/lib/route";
import { toast } from "@/store/ui";
import { sessionVault } from "@/api/runtime";
const pin = usePaymentPassword(); const ui = pin.ui; const state = computed(() => ui.state); const t = useT();
const passwords = reactive({ current: "", new: "", confirm: "" }); const loading = ref(true);
let active = true; let submitted = false;
const fields = computed(() => ([{ key: "current" as const, label: t.value.paymentPin.current }, { key: "new" as const, label: t.value.paymentPin.new }, { key: "confirm" as const, label: t.value.paymentPin.confirmNew }]));
const complete = computed(() => Object.values(passwords).every(validPaymentPassword));
const validation = computed(() => {
  if (validPaymentPassword(passwords.new) && simplePaymentPassword(passwords.new)) return t.value.paymentPin.simple;
  if (passwords.current && passwords.new === passwords.current) return t.value.paymentPin.samePassword;
  if (validPaymentPassword(passwords.confirm) && passwords.confirm !== passwords.new) return t.value.paymentPin.mismatch;
  return "";
});
const error = computed(() => !ui.changeError || ui.changeError === "locked" ? "" : ui.changeError === "incorrect" ? fmt(t.value.paymentPin.incorrect, { n: state.value?.remainingAttempts ?? 0 }) : t.value.paymentPin[ui.changeError]);
const lockMessage = computed(() => {
  const seconds = Math.max(0, Math.ceil((Date.parse(state.value?.lockedUntil ?? "") - ui.now) / 1000));
  return fmt(t.value.paymentPin.locked, { time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` });
});
const canSave = computed(() => complete.value && !validation.value && !ui.busy && !state.value?.lockedUntil && !ui.pendingOperation);
function clear() { passwords.current = ""; passwords.new = ""; passwords.confirm = ""; }
async function load() { loading.value = true; ui.changeError = ""; await pin.refreshStatus(); if (active) { loading.value = false; await pin.resumePending(); } }
async function setup() { if (await pin.setup()) { toast.success(t.value.paymentPin.setupSuccess); navTo("/me"); } else await load(); }
async function recover() { if (ui.busy) return; clear(); if (await pin.recover()) { toast.success(t.value.paymentPin.resetSuccess); navTo("/me"); } else await load(); }
async function save() {
  if (!canSave.value || !state.value) return;
  submitted = true;
  const result = pin.change(passwords.current, passwords.new, passwords.confirm);
  passwords.current = "";
  const success = await result;
  if (!success && !ui.visible) submitted = false;
  if (pin.locked() || ui.visible) clear();
}
watch(() => ui.completedRevision, () => {
  if (submitted && ui.completedOperation === "change") {
    submitted = false; clear(); toast.success(t.value.paymentPin.changeSuccess); navTo("/me");
  }
});
const unsubscribe = sessionVault.subscribe?.((_previous, _next, continuation) => { if (!continuation) { clear(); submitted = false; } });
function hide() { active = false; clear(); }
function visibility() { if (typeof document !== "undefined" && document.hidden) hide(); }
onShow(() => { active = true; void load(); }); onHide(hide); onUnload(hide);
let timer: ReturnType<typeof setInterval>;
onMounted(() => { timer = setInterval(pin.tick, 1000); if (typeof document !== "undefined") document.addEventListener("visibilitychange", visibility); });
onUnmounted(() => { clear(); clearInterval(timer); unsubscribe?.(); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visibility); });
</script>
<style scoped>
.payment-pin-page { padding: var(--v5-space-4) var(--v5-space-5) calc(var(--v5-space-6) + var(--v5-space-1) + env(safe-area-inset-bottom)); max-width: 480px; margin: 0 auto; color: var(--v5-ink); }
.payment-pin-page__note { display: block; font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-2); line-height: 1.65; margin-bottom: var(--v5-space-4); }
.payment-pin-page__field { margin-top: var(--v5-space-6); }
.payment-pin-page__label { display: block; font-size: var(--ui-type-list-title); font-weight: 600; line-height: 1.5; }
.payment-pin-page__error { display: block; color: var(--v5-danger); font-size: var(--ui-type-list-subtitle); line-height: 1.6; margin: var(--ui-space-row-y) 0; }
.payment-pin-page__primary { display: flex; align-items: center; justify-content: center; min-height: 48px; padding: var(--v5-space-3) var(--v5-space-4); border-radius: var(--v5-radius-full); background: var(--v5-brand); color: var(--v5-on-brand); font-size: var(--ui-type-button); font-weight: 600; text-align: center; margin-top: var(--v5-space-5); }
.payment-pin-page__primary[aria-disabled="true"] { opacity: .45; }
.payment-pin-page__link { display: flex; align-items: center; justify-content: center; min-height: 48px; margin-top: var(--v5-space-2); color: var(--v5-brand); font-size: var(--ui-type-list-subtitle); text-align: center; }
</style>
