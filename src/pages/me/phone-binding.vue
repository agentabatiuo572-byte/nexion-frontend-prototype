<template>
  <AppChassis active="me">
    <view class="phone-binding-page">
      <SubPageHeader back="/pages/me/security" :title="t.security.phoneBindingTitle" />
      <view class="phone-binding-card">
        <text class="phone-binding-note" role="status">{{ bound ? t.security.phoneBindingDone : t.security.phoneBindingRequired }}</text>
        <template v-if="!bound">
          <view class="phone-binding-number">
            <picker :range="dialCodes" :value="countryIndex" @change="onCountryChange">
              <view class="phone-binding-code" role="button" :aria-label="t.countryCodes.title">{{ countryCode }} ▾</view>
            </picker>
            <input v-model="phone" type="number" inputmode="numeric" maxlength="15" :placeholder="t.register.phonePlaceholder" :aria-label="t.register.phonePlaceholder" />
          </view>
          <view class="phone-binding-action" role="button" tabindex="0" :aria-disabled="busy || !validPhone || resendLeft > 0" @click="sendCode()" @keydown.enter.prevent="sendCode()">
            {{ resendLeft > 0 ? `${t.security.phoneBindingResend} ${resendLeft}s` : t.addrRebind.otpSendCta }}
          </view>
          <input v-if="challengeNo" v-model="code" class="phone-binding-input" type="number" inputmode="numeric" maxlength="6" :placeholder="t.addrRebind.otpPlaceholder" :aria-label="t.addrRebind.otpPlaceholder" />
          <view v-if="challengeNo" class="phone-binding-action" role="button" tabindex="0" :aria-disabled="busy || !validCode" @click="submit" @keydown.enter.prevent="submit">{{ t.security.phoneBindingConfirm }}</view>
          <text v-if="error" class="phone-binding-error" role="alert">{{ error }}</text>
        </template>
        <view v-else class="phone-binding-action" role="button" tabindex="0" @click="navTo('/pages/me/security')" @keydown.enter.prevent="navTo('/pages/me/security')">{{ t.security.back }}</view>
      </view>
      <ServerCaptchaSlider v-if="showCaptcha" :phone="`${countryCode}${phone}`" scene="REGISTER" @success="onCaptchaSuccess" @close="showCaptcha = false" />
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import ServerCaptchaSlider from "@/components/server-captcha-slider.vue";
import { accountApi, authApi, sessionVault } from "@/api/runtime";
import { sanitizePhoneInput, validateNationalPhone } from "@/auth/phone-number";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";
import { asApiError } from "@/api/errors";

const t = useT();
const dialCodes = ["+84", "+86"];
const countryIndex = ref(0);
const countryCode = computed(() => dialCodes[countryIndex.value] ?? "+84");
const phone = ref("");
const code = ref("");
const challengeNo = ref("");
const busy = ref(false);
const bound = ref(false);
const error = ref("");
const showCaptcha = ref(false);
const resendLeft = ref(0);
const validPhone = computed(() => validateNationalPhone(countryCode.value, phone.value));
const validCode = computed(() => /^\d{6}$/.test(code.value));
let timer: ReturnType<typeof setInterval> | null = null;

onShow(() => { bound.value = !!sessionVault.read()?.user.phone; });
onUnmounted(() => { if (timer) clearInterval(timer); });
watch([phone, countryCode], () => { challengeNo.value = ""; code.value = ""; });
function onCountryChange(event: { detail: { value: string } }) {
  countryIndex.value = Number(event.detail.value) || 0;
  challengeNo.value = "";
  code.value = "";
}
function startCooldown(seconds: number) {
  resendLeft.value = seconds;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    resendLeft.value = Math.max(0, resendLeft.value - 1);
    if (!resendLeft.value && timer) { clearInterval(timer); timer = null; }
  }, 1000);
}
async function sendCode(captchaTicket?: string) {
  if (busy.value || resendLeft.value || !validPhone.value) return;
  const owner = sessionVault.read()?.user.userId;
  if (!owner) return;
  busy.value = true;
  error.value = "";
  const number = sanitizePhoneInput(phone.value);
  const country = countryCode.value;
  try {
    const result = await accountApi.sendPhoneBindingChallenge(country, number, captchaTicket);
    if (sessionVault.read()?.user.userId !== owner || countryCode.value !== country
        || sanitizePhoneInput(phone.value) !== number) return;
    challengeNo.value = result.challengeNo;
    startCooldown(result.resendAfterSec);
  } catch (cause) {
    if (sessionVault.read()?.user.userId !== owner) return;
    const failure = asApiError(cause);
    if (failure.message === "USER_CAPTCHA_REQUIRED") showCaptcha.value = true;
    else if (failure.message === "USER_PHONE_ALREADY_USED") error.value = t.value.security.phoneBindingUsed;
    else error.value = t.value.security.phoneBindingSendFailed;
  } finally { busy.value = false; }
}
function onCaptchaSuccess(ticket: string) { showCaptcha.value = false; void sendCode(ticket); }
async function submit() {
  if (busy.value || !challengeNo.value || !validCode.value || !validPhone.value) return;
  const owner = sessionVault.read()?.user.userId;
  if (!owner) return;
  busy.value = true;
  error.value = "";
  let submitted = false;
  try {
    await accountApi.bindPhone(countryCode.value, sanitizePhoneInput(phone.value), challengeNo.value, code.value);
    submitted = true;
    const restored = await authApi.restore();
    if (sessionVault.read()?.user.userId !== owner) return;
    if (restored?.user.userId === owner && restored.user.phone) bound.value = true;
    else error.value = t.value.security.phoneBindingRefresh;
  } catch (cause) {
    const restored = await authApi.restore().catch(() => null);
    if (restored?.user.userId === owner && restored.user.phone) bound.value = true;
    else if (sessionVault.read()?.user.userId === owner) {
      const failure = asApiError(cause);
      error.value = submitted ? t.value.security.phoneBindingRefresh
        : failure.message === "USER_PHONE_ALREADY_USED" ? t.value.security.phoneBindingUsed
        : failure.message === "USER_PHONE_BINDING_CODE_INVALID" ? t.value.security.phoneBindingCodeInvalid
        : t.value.security.phoneBindingFailed;
    }
  } finally { busy.value = false; }
}
</script>

<style scoped>
.phone-binding-page { min-height: 100vh; padding-bottom: 32px; color: var(--v5-ink); }
.phone-binding-card { margin: 20px 16px; padding: 20px; border-radius: 18px; background: var(--v5-surface-1); display: grid; gap: 16px; }
.phone-binding-note { color: var(--v5-ink-2); line-height: 1.5; }
.phone-binding-number { display: flex; align-items: center; gap: 12px; }
.phone-binding-code, .phone-binding-number input, .phone-binding-input { padding: 12px; border: 1px solid var(--v5-ink-4); border-radius: 10px; min-height: 48px; }
.phone-binding-number input { flex: 1; min-width: 0; }
.phone-binding-action { min-height: 48px; display: grid; place-items: center; border-radius: 10px; background: var(--v5-brand); color: var(--v5-on-brand); font-weight: 600; }
.phone-binding-action[aria-disabled="true"] { opacity: .5; }
.phone-binding-error { color: var(--v5-danger); }
</style>
