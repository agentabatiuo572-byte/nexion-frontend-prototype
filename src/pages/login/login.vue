<template>
  <StandalonePageShell class="lg-root" @keydown.esc="showCountries = false">
    <view class="lg-wrap" :data-preview-account-status="previewAccount.ok ? 'ready' : previewAccount.error" :inert="showCountries || undefined" :aria-hidden="showCountries">
      <!-- Top bar -->
      <view class="lg-top">
        <view v-if="step > 1 || mode === 'reset'" class="lg-iconbtn" role="button" tabindex="0" :aria-label="t.login.back" @click="back" @keydown.enter.prevent="back" @keydown.space.prevent="back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8D0DC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </view>
        <view v-else class="lg-iconbtn" role="button" tabindex="0" :aria-label="t.login.close" @click="close" @keydown.enter.prevent="close" @keydown.space.prevent="close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8D0DC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
        <view class="lg-brand">
          <view class="lg-brand__n"><text class="lg-brand__n-t">N</text></view>
          <text class="lg-brand__name">NexGrid</text>
        </view>
        <view class="lg-top__sp" />
      </view>

      <!-- Step indicator (otp: 2, reset: 3) -->
      <view v-if="mode !== 'password'" class="lg-dots">
        <view v-for="n in (mode === 'reset' ? 3 : 2)" :key="n" class="lg-dot" :class="n === step ? 'lg-dot--active' : (n < step ? 'lg-dot--done' : '')" />
      </view>

      <!-- Title -->
      <text class="lg-title">{{ titleText }}</text>
      <view class="lg-mode-badge" data-testid="auth-runtime-label">
        <text class="lg-mode-badge__t">{{ modeLabel }}</text>
      </view>
      <view v-if="serverSessionReloadNotice" class="lg-recovery-notice" role="status" data-qa="server-session-reload-notice">
        <text class="lg-recovery-notice__t">{{ t.login.serverSessionReloadNotice }}</text>
      </view>
      <text v-if="step === 1 && mode === 'reset'" class="lg-sub">{{ t.login.resetSubtitle }}</text>
      <text v-else-if="step === 2" class="lg-sub">{{ t.login.codeSentTo }} <text class="lg-sub__ph">{{ country }} {{ phone }}</text></text>
      <text v-else-if="step === 3" class="lg-sub">{{ t.login.newPasswordHint }}</text>

      <!-- Body -->
      <view class="lg-body">
        <!-- Step 1: phone (+ password for password mode) -->
        <view v-if="step === 1" class="lg-col">
          <view class="lg-phone" :class="{ 'lg-phone--err': phone && !phoneOk }">
            <view class="lg-phone__cc" role="button" tabindex="0" :aria-label="t.countryCodes.title" :aria-expanded="showCountries" @click="showCountries = true" @keydown.enter.prevent="showCountries = true" @keydown.space.prevent="showCountries = true">
              <text class="lg-phone__cc-t">{{ country }}</text>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: showCountries ? 'rotate(180deg)' : '' }"><path d="m6 9 6 6 6-6" /></svg>
            </view>
            <input class="lg-phone__in" data-testid="mock-preview-phone" type="number" inputmode="numeric" maxlength="15" :placeholder="t.login.phonePlaceholder" :value="phone" :aria-invalid="!!phone && !phoneOk" aria-describedby="login-phone-format" :confirm-type="mode === 'password' ? 'next' : 'done'" @input="onPhone" @confirm="onPhoneConfirm" />
          </view>
          <text id="login-phone-format" data-testid="auth-phone-hint" class="lg-phone-hint" :class="{ 'lg-phone-hint--err': phone && !phoneOk }" role="status" aria-live="polite">{{ phoneFormatMessage }}</text>
          <template v-if="mode === 'password'">
            <view class="lg-field-wrap" :class="{ 'lg-field-wrap--err': password && !pwdOk }">
              <input class="lg-field--flex" data-testid="mock-preview-password" :type="showPwd ? 'text' : 'password'" :placeholder="t.login.passwordPlaceholder" :maxlength="PASSWORD_MAX_LENGTH" :value="password" :focus="passwordFocused" confirm-type="done" @input="onPwd" @blur="passwordFocused = false" @confirm="onPrimary" />
              <view class="lg-eye" role="button" tabindex="0" :aria-label="showPwd ? t.login.hidePassword : t.login.showPassword" @click="showPwd = !showPwd" @keydown.enter.prevent="showPwd = !showPwd" @keydown.space.prevent="showPwd = !showPwd">
                <svg v-if="showPwd" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><path d="m2 2 20 20" /></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
              </view>
            </view>
            <view class="lg-forgot-row">
              <text class="lg-forgot" role="link" tabindex="0" @click="goReset" @keydown.enter.prevent="goReset" @keydown.space.prevent="goReset">{{ t.login.forgotPassword }}</text>
            </view>
          </template>
        </view>

        <!-- Step 2: OTP -->
        <view v-else-if="step === 2" class="lg-col">
          <view class="lg-otp">
            <input v-for="(d, i) in code" :key="i" class="lg-otp__in" :class="{ 'lg-otp__in--filled': d }" type="number" :maxlength="1" :focus="focusIdx === i" :value="d" :confirm-type="i === 5 ? 'done' : 'next'" @input="onCode(i, $event)" @confirm="i === 5 && onPrimary()" />
          </view>
          <view class="lg-resend">
            <text class="lg-resend__change" role="button" tabindex="0" @click="back" @keydown.enter.prevent="back" @keydown.space.prevent="back">{{ t.login.changeNumber }}</text>
            <text v-if="!remoteTwoFactorChallenge && resendLeft > 0" class="lg-resend__count">{{ resendInText }}</text>
            <text v-else-if="!remoteTwoFactorChallenge" class="lg-resend__btn" role="button" tabindex="0" @click="resend" @keydown.enter.prevent="resend" @keydown.space.prevent="resend">{{ t.login.resend }}</text>
          </view>
        </view>

        <!-- Step 3: new password (reset) -->
        <view v-else class="lg-col">
          <view class="lg-field-wrap" :class="{ 'lg-field-wrap--err': newPassword && !newPwdOk }">
            <input class="lg-field--flex" :type="showPwd ? 'text' : 'password'" :placeholder="t.login.newPasswordPlaceholder || t.login.passwordPlaceholder" :maxlength="PASSWORD_MAX_LENGTH" :value="newPassword" confirm-type="next" @input="onNewPwd" @confirm="focusResetConfirmation" />
            <view class="lg-eye" role="button" tabindex="0" :aria-label="showPwd ? t.login.hidePassword : t.login.showPassword" @click="showPwd = !showPwd" @keydown.enter.prevent="showPwd = !showPwd" @keydown.space.prevent="showPwd = !showPwd">
              <svg v-if="showPwd" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><path d="m2 2 20 20" /></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
            </view>
          </view>
          <view class="lg-field-wrap" :class="{ 'lg-field-wrap--err': confirmPwd && newPassword !== confirmPwd }">
            <input class="lg-field--flex" :type="showPwd ? 'text' : 'password'" :placeholder="t.login.confirmPasswordPlaceholder" :maxlength="PASSWORD_MAX_LENGTH" :value="confirmPwd" :focus="confirmPasswordFocused" confirm-type="done" @input="onConfirm" @blur="confirmPasswordFocused = false" @confirm="onPrimary" />
          </view>
        </view>
      </view>

      <!-- Error -->
      <view v-if="error" class="lg-error">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
        <text class="lg-error__t">{{ error }}</text>
      </view>

      <!-- Primary CTA -->
      <view class="lg-cta" :class="canPrimary ? 'lg-cta--on' : ''" role="button" tabindex="0" :aria-disabled="!canPrimary || loading" :aria-describedby="!canPrimary && !loading ? 'lg-cta-reason' : undefined" data-system-chrome-primary @click="onPrimary" @keydown.enter.prevent="onPrimary" @keydown.space.prevent="onPrimary">
        <text v-if="loading" class="lg-cta__t lg-cta__t--on">···</text>
        <text v-else class="lg-cta__t" :class="canPrimary ? 'lg-cta__t--on' : ''">{{ primaryText }}</text>
      </view>
      <text v-if="!canPrimary && !loading" id="lg-cta-reason" class="lg-sr-only">{{ primaryDisabledReason }}</text>

      <!-- Mode switch (password ↔ otp), only on step 1 non-reset -->
      <view v-if="step === 1 && mode !== 'reset'" class="lg-switch" role="button" tabindex="0" @click="toggleMode" @keydown.enter.prevent="toggleMode" @keydown.space.prevent="toggleMode">
        <text class="lg-switch__t">{{ mode === 'password' ? t.login.useCodeInstead : t.login.usePasswordInstead }}</text>
      </view>

      <!-- OAuth (step 1, not reset) -->
      <view v-if="step === 1 && mode !== 'reset'" class="lg-oauth">
        <view class="lg-divider"><view class="lg-divider__line" /><text class="lg-divider__t">{{ t.login.orContinueWith }}</text><view class="lg-divider__line" /></view>
        <AuthProviderGrid :busy="loading" @select="startOauth" />
      </view>

      <!-- Footer -->
      <view class="lg-footer">
        <text v-if="step === 1 && mode !== 'reset'" class="lg-footer__acc">{{ t.login.noAccount }} <text class="lg-footer__link" role="link" tabindex="0" @click="goRegister" @keydown.enter.prevent="goRegister" @keydown.space.prevent="goRegister">{{ t.login.signUp }}</text></text>
      </view>
    </view>

    <CountryCodeSheet :open="showCountries" :model-value="country" @select="pickCountry" @close="showCountries = false" />
    <CaptchaSlider v-if="showCaptcha" :phone="fullPhone" @success="onCaptchaOk" @close="showCaptcha = false" />
    <GlobalUi />
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from "vue";
import { onLoad, onUnload } from "@dcloudio/uni-app";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import GlobalUi from "@/components/global-ui.vue";
import CaptchaSlider from "@/components/captcha-slider.vue";
import CountryCodeSheet from "@/components/country-code-sheet.vue";
import AuthProviderGrid from "@/components/auth-provider-grid.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { fmt } from "@/i18n/format";
import { geoPolicyUserMessage } from "@/api/geo-policy-error";
import { otpSend, otpVerify, type OtpScene } from "@/store/auth-otp";
import { authAccountKeyForPhone } from "@/store/auth-account";
import { normalizeRefCode } from "@/store/sponsorship";
import { toast } from "@/store/ui";
import { isResetPasswordOk, PASSWORD_MAX_LENGTH } from "@/auth/password-rules";
import { completeSignIn } from "@/auth/complete-sign-in";
import { exchangeVerifiedLogin } from "@/store/auth-otp";
import { authApi, remoteApiEnabled } from "@/api/runtime";
import { MOCK_PREVIEW_ACCOUNT, provisionMockPreviewAccount } from "@/api/mock-preview-account";
import type { OAuthProvider } from "@/api/auth-api";
import { ApiError } from "@/api/errors";
import type { UserSession } from "@/api/contracts";
import { dialCodeForLocale, phoneFormatHint, sanitizePhoneInput, validateNationalPhone } from "@/auth/phone-number";

const t = useT();

type Step = 1 | 2 | 3;
type LoginMode = "password" | "otp" | "reset";

interface OtpFlowContext {
  version: number;
  phone: string;
  scene: OtpScene;
  requestId: string;
}

interface PasswordAttemptContext {
  version: number;
  phone: string;
  password: string;
}

interface RemoteTwoFactorAttemptContext {
  version: number;
  phone: string;
  challengeNo: string;
}

const previewAccount = provisionMockPreviewAccount();
const mode = ref<LoginMode>("password");
const step = ref<Step>(1);
const country = ref(previewAccount.ok ? MOCK_PREVIEW_ACCOUNT.countryCode : dialCodeForLocale(useLocaleStore().code));
const showCountries = ref(false);
const phone = ref(previewAccount.ok ? MOCK_PREVIEW_ACCOUNT.phone : "");
const password = ref(previewAccount.ok ? MOCK_PREVIEW_ACCOUNT.password : "");
const newPassword = ref("");
const confirmPwd = ref("");
const code = ref<string[]>(["", "", "", "", "", ""]);
const focusIdx = ref(0);
const showPwd = ref(false);
const error = ref<string | null>(null);
const resendLeft = ref(0);
const loading = ref(false);
const returnParam = ref<string | null>(null);
const refOnLogin = ref<string | null>(null);
const otpRequestId = ref<string | null>(null);
const otpVerifyToken = ref<string | null>(null);
const remoteTwoFactorChallenge = ref<string | null>(null);
const serverSessionReloadNotice = ref(false);
const passwordFocused = ref(false);
const confirmPasswordFocused = ref(false);

let resendTimer: ReturnType<typeof setInterval> | undefined;
let signInTimer: ReturnType<typeof setTimeout> | undefined;
let otpFlowVersion = 0;
let mounted = true;

onLoad((options) => {
  const o = (options || {}) as Record<string, string>;
  if (o.return) returnParam.value = o.return;
  serverSessionReloadNotice.value = o.notice === "server-session-reload";
  // [FEAT-SHARE4] 与注册页同一 client 预检:非法码不入绑定链(服务端权威校验另行)。
  const normRef = normalizeRefCode(o.ref);
  if (normRef) refOnLogin.value = normRef;
});

const showCaptcha = ref(false);

const phoneClean = computed(() => sanitizePhoneInput(phone.value));
const phoneOk = computed(() => validateNationalPhone(country.value, phoneClean.value));
const phoneFormatMessage = computed(() => {
  const params = { example: phoneFormatHint(country.value) };
  return phone.value && !phoneOk.value
    ? fmt(t.value.countryCodes.phoneInvalidHint, params)
    : fmt(t.value.countryCodes.phoneExampleHint, params);
});
const fullPhone = computed(() => `${country.value}${phoneClean.value}`);
const otpScene = computed<OtpScene>(() => (mode.value === "reset" ? "reset" : "login"));
const codeOk = computed(() => /^\d{6}$/.test(code.value.join("")));
// Login mode accepts any non-empty password (existing users may have shorter
// passwords from before the strength rule) — mirrors prototype `pwdOk`.
const pwdOk = computed(() => password.value.length > 0);

function authenticatedAccountId(user: UserSession): string {
  if (remoteApiEnabled) return `user:${user.userId}`;
  // Mock password auth shares the same account scope as the legacy OTP and
  // registration directory, so one phone never opens two local wallets.
  return authAccountKeyForPhone(`${user.countryCode}${user.phone}`) ?? `user:${user.userId}`;
}
// Reset mode's new password must pass the full strength check.
const newPwdOk = computed(() => isResetPasswordOk(newPassword.value, { phone: phoneClean.value }));
const pwdMatch = computed(() => newPassword.value === confirmPwd.value && newPwdOk.value);

const titleText = computed(() => {
  if (step.value === 3) return t.value.login.newPasswordTitle;
  if (step.value === 2) return t.value.login.codeStepTitle;
  if (mode.value === "reset") return t.value.login.resetTitle;
  return t.value.login.title;
});
const modeLabel = computed(() => t.value.security.mockModeLabel);
const primaryText = computed(() => {
  if (step.value === 1) return mode.value === "password" ? t.value.login.signIn : t.value.login.sendCode;
  if (step.value === 2) return t.value.login.verify;
  return t.value.login.finishReset;
});
const canPrimary = computed(() => {
  if (step.value === 1) return mode.value === "password" ? (phoneOk.value && pwdOk.value && !loading.value) : (phoneOk.value && !loading.value);
  if (step.value === 2) return codeOk.value && !loading.value;
  return pwdMatch.value && !loading.value;
});
const primaryDisabledReason = computed(() => {
  if (step.value === 1) {
    if (!phoneOk.value) return t.value.login.errorInvalidPhone;
    if (mode.value === "password" && !pwdOk.value) return t.value.login.errorInvalidPassword;
  }
  if (step.value === 2 && !codeOk.value) return t.value.login.errorInvalidCode;
  if (step.value === 3 && !newPwdOk.value) return t.value.login.errorWeakPassword;
  if (step.value === 3 && !pwdMatch.value) return t.value.login.passwordMismatch;
  return "";
});
const resendInText = computed(() => (t.value.login.resendIn || "{s}s").replace("{s}", String(resendLeft.value)));
function showOauthUnavailable(provider: string) {
  toast.info(fmt(t.value.login.oauthUnavailableTitle, { provider }), t.value.login.oauthUnavailableBody);
}

function oauthProvider(label: string): OAuthProvider | null {
  return label === "Google" ? "GOOGLE"
    : label === "Apple" ? "APPLE"
    : label === "Passkey" ? "PASSKEY"
    : label === "Telegram" ? "TELEGRAM"
    : null;
}

function oauthError(cause: unknown, provider: OAuthProvider): string {
  const code = cause instanceof ApiError ? cause.message : "";
  if (code === "OAUTH_PROVIDER_NOT_CONFIGURED" || code === "OAUTH_PROVIDER_UNAVAILABLE"
      || code === "OAUTH_SANDBOX_ONLY") {
    return `${fmt(t.value.login.oauthUnavailableTitle, { provider })}: ${t.value.login.oauthUnavailableBody}`;
  }
  return remoteLoginError(cause);
}

async function startOauth(label: string) {
  const provider = oauthProvider(label);
  if (!provider || !remoteApiEnabled) {
    showOauthUnavailable(label);
    return;
  }
  if (loading.value) return;
  const flowVersion = ++otpFlowVersion;
  loading.value = true;
  error.value = null;
  try {
    const result = await authApi.oauthExchange({
      provider,
      mode: "PROVIDER",
      displayName: provider,
    });
    if (!mounted || flowVersion !== otpFlowVersion) {
      authApi.discardSessionIfCurrent(result.vaultRevision);
      return;
    }
    const completed = completeSignIn({
      identity: authenticatedAccountId(result.user),
      returnTo: returnParam.value,
      onboardingComplete: true,
      serverProfile: result.user,
      serverSessionRevision: result.vaultRevision,
    });
    if (!completed.ok) {
      loading.value = false;
      error.value = t.value.authOtp.errorServiceUnavailable;
    }
  } catch (cause) {
    if (!mounted || flowVersion !== otpFlowVersion) return;
    loading.value = false;
    error.value = oauthError(cause, provider);
  }
}

function inputVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onPhone(e: Event) {
  invalidateOtpFlow();
  phone.value = sanitizePhoneInput(inputVal(e));
  error.value = null;
}
function focusPassword() {
  passwordFocused.value = false;
  void nextTick(() => { passwordFocused.value = true; });
}
function focusResetConfirmation() {
  confirmPasswordFocused.value = false;
  void nextTick(() => { confirmPasswordFocused.value = true; });
}
function onPhoneConfirm() {
  if (mode.value === "password") {
    focusPassword();
    return;
  }
  onPrimary();
}
function onPwd(e: Event) { password.value = inputVal(e); error.value = null; }
function onNewPwd(e: Event) { newPassword.value = inputVal(e); error.value = null; }
function onConfirm(e: Event) { confirmPwd.value = inputVal(e); error.value = null; }
function onCode(i: number, e: Event) {
  const digits = inputVal(e).replace(/\D/g, "");
  const next = [...code.value];
  next[i] = digits.slice(-1) || "";
  code.value = next;
  error.value = null;
  if (next[i] && i < 5) focusIdx.value = i + 1;
  if (next.every(Boolean)) verifyCode();
}
function pickCountry(c: string) {
  invalidateOtpFlow();
  country.value = c;
  showCountries.value = false;
}

function clearSignIn() {
  if (signInTimer) { clearTimeout(signInTimer); signInTimer = undefined; }
  loading.value = false;
}

/** 换号、返回或切换认证方式后，旧发码/验码/登录回包不得写回当前页面。 */
function invalidateOtpFlow() {
  otpFlowVersion += 1;
  clearSignIn();
  otpRequestId.value = null;
  otpVerifyToken.value = null;
  remoteTwoFactorChallenge.value = null;
}

function isCurrentOtpFlow(context: OtpFlowContext): boolean {
  return (
    mounted
    && context.version === otpFlowVersion
    && fullPhone.value === context.phone
    && otpScene.value === context.scene
    && step.value === 2
    && otpRequestId.value === context.requestId
  );
}

function isCurrentPasswordAttempt(context: PasswordAttemptContext): boolean {
  return mounted
    && context.version === otpFlowVersion
    && mode.value === "password"
    && step.value === 1
    && fullPhone.value === context.phone
    && password.value === context.password;
}

function isCurrentRemoteTwoFactorAttempt(context: RemoteTwoFactorAttemptContext): boolean {
  return mounted
    && context.version === otpFlowVersion
    && mode.value === "password"
    && step.value === 2
    && fullPhone.value === context.phone
    && remoteTwoFactorChallenge.value === context.challengeNo;
}

// A region-policy refusal arrives as a code on the same result objects as every
// other sign-in failure. Translate it first; `null` means it wasn't one, and the
// caller must fall through to its existing mapping — otherwise an unrelated
// failure would be reported to the user as a region block.
function geoText(code: unknown): string | null {
  return geoPolicyUserMessage(code, t.value.geoPolicy);
}

// Sign-in completion (shared by password + OTP). Binds the account-cloud
// snapshot, claims this carrier's session, and routes a changed physical device
// through recalibration before the main app.
function finishSignIn(
  session: { accountId: string; signInIdempotencyKey?: string; onboardingComplete: boolean; serverProfile?: UserSession; serverSessionRevision?: number },
  context: OtpFlowContext | null = null,
) {
  signInTimer = undefined;
  if (!mounted || (context && !isCurrentOtpFlow(context))) return;
  const result = completeSignIn({
    identity: session.accountId,
    returnTo: returnParam.value,
    sponsorCode: refOnLogin.value,
    idempotencyKey: session.signInIdempotencyKey,
    onboardingComplete: session.onboardingComplete,
    serverProfile: session.serverProfile,
    serverSessionRevision: session.serverSessionRevision,
  });
  if (!result.ok) {
    loading.value = false;
    error.value = geoText(result.error)
      ?? (result.error === "account_pending"
        ? t.value.login.errorRegistrationIncomplete
        : result.error === "account_not_found"
          ? t.value.login.errorAccountNotRegistered
        : t.value.authOtp.errorServiceUnavailable);
  }
}

function finishVerifiedOtpSignIn(verifyToken: string, context: OtpFlowContext) {
  if (!isCurrentOtpFlow(context)) return;
  const exchange = exchangeVerifiedLogin(context.phone, verifyToken);
  if (!exchange.ok) {
    if (!isCurrentOtpFlow(context)) return;
    loading.value = false;
    error.value = geoText(exchange.error)
      ?? (exchange.error === "verify_token_invalid"
        ? t.value.authOtp.errorOtpExpired
        : t.value.authOtp.errorServiceUnavailable);
    return;
  }
  finishSignIn(exchange, context);
}

function startResend(sec: number) {
  resendLeft.value = sec;
  if (resendTimer) clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    resendLeft.value = Math.max(0, resendLeft.value - 1);
    if (resendLeft.value <= 0 && resendTimer) clearInterval(resendTimer);
  }, 1000);
}
// FEAT-AUTH01: 发码统一走闸门(冷却/24h 限频/滑块)。倒计时以 server 返回的
// resendAfterSec 为准,client 不再持有 60s 业务常量。
async function requestCode(captchaTicket?: string) {
  if (loading.value) return;
  const phoneAtRequest = fullPhone.value;
  const sceneAtRequest = otpScene.value;
  const stepAtRequest = step.value;
  const flowVersion = ++otpFlowVersion;
  loading.value = true;
  if (remoteApiEnabled) {
    try {
      const res = sceneAtRequest === "reset"
        ? await authApi.sendPasswordResetOtp({ countryCode: country.value, phone: phoneClean.value })
        : await authApi.sendLoginOtp({ countryCode: country.value, phone: phoneClean.value });
      if (!mounted || flowVersion !== otpFlowVersion || fullPhone.value !== phoneAtRequest || step.value !== stepAtRequest) return;
      loading.value = false;
      otpRequestId.value = res.challengeNo;
      otpVerifyToken.value = null;
      code.value = ["", "", "", "", "", ""];
      focusIdx.value = 0;
      step.value = 2;
      startResend(res.resendAfterSec);
    } catch (cause) {
      if (!mounted || flowVersion !== otpFlowVersion || fullPhone.value !== phoneAtRequest) return;
      loading.value = false;
      error.value = remoteLoginError(cause);
    }
    return;
  }
  const res = await otpSend(phoneAtRequest, sceneAtRequest, captchaTicket);
  if (
    !mounted
    || flowVersion !== otpFlowVersion
    || fullPhone.value !== phoneAtRequest
    || otpScene.value !== sceneAtRequest
    || step.value !== stepAtRequest
  ) return;
  loading.value = false;
  if (res.ok) {
    otpRequestId.value = res.requestId;
    otpVerifyToken.value = null;
    code.value = ["", "", "", "", "", ""];
    focusIdx.value = 0;
    step.value = 2;
    startResend(res.resendAfterSec);
    return;
  }
  if (res.error === "captcha_required") { showCaptcha.value = true; return; }
  if (res.error === "rate_limited") {
    // 规格 ⑤(AUTH01):`rate_limited` → Toast 剩余秒数;inline 错误条留给 verify 类错误。
    toast.info(fmt(t.value.authOtp.errorTooFrequent, { s: res.retryAfterSec }));
    if (step.value === 2) startResend(res.retryAfterSec);
  }
}
function onCaptchaOk(ticket: string) {
  showCaptcha.value = false;
  void requestCode(ticket);
}
function resend() {
  if (resendLeft.value > 0) return;
  error.value = null;
  void requestCode();
}

function goSendCode() {
  error.value = null;
  if (!phoneOk.value) { error.value = t.value.login.errorInvalidPhone; return; }
  void requestCode();
}
function remoteLoginError(error: unknown): string {
  const code = error instanceof ApiError ? error.message : "";
  return geoText(code)
    ?? (code === "USER_INVALID_CREDENTIALS" ? t.value.login.errorInvalidCredentials
      : code === "USER_TWO_FACTOR_CHALLENGE_INVALID" || code === "OTP_CODE_INVALID"
        ? t.value.security.twoFactorCodeInvalid
        : t.value.authOtp.errorServiceUnavailable);
}

async function signInWithPassword() {
  if (loading.value || signInTimer) return;
  error.value = null;
  if (!phoneOk.value || !pwdOk.value) { error.value = t.value.login.errorInvalidPassword; return; }
  const phoneAtSignIn = fullPhone.value;
  const flowVersion = ++otpFlowVersion;
  const passwordAttempt: PasswordAttemptContext = {
    version: flowVersion,
    phone: phoneAtSignIn,
    password: password.value,
  };
  loading.value = true;
  try {
    const result = await authApi.login({ countryCode: country.value, phone: phoneClean.value, password: password.value });
    if (!isCurrentPasswordAttempt(passwordAttempt)) {
      if (result.kind === "authenticated") authApi.discardSessionIfCurrent(result.vaultRevision);
      return;
    }
    if (result.kind === "challenge") {
      remoteTwoFactorChallenge.value = result.challengeNo;
      code.value = ["", "", "", "", "", ""];
      focusIdx.value = 0;
      loading.value = false;
      step.value = 2;
      return;
    }
    finishSignIn({ accountId: authenticatedAccountId(result.user), onboardingComplete: true, serverProfile: result.user, serverSessionRevision: result.vaultRevision });
  } catch (loginError) {
    if (!isCurrentPasswordAttempt(passwordAttempt)) return;
    loading.value = false;
    error.value = remoteLoginError(loginError);
  }
}

async function verifyRemoteTwoFactor() {
  const challengeNo = remoteTwoFactorChallenge.value;
  if (!challengeNo) return;
  const twoFactorAttempt: RemoteTwoFactorAttemptContext = {
    version: otpFlowVersion,
    phone: fullPhone.value,
    challengeNo,
  };
  loading.value = true;
  try {
    const result = await authApi.completeTwoFactor({
      countryCode: country.value,
      phone: phoneClean.value,
      password: password.value,
      challengeNo,
      code: code.value.join(""),
    });
    if (result.kind !== "authenticated") throw new Error("TWO_FACTOR_SESSION_MISSING");
    if (!isCurrentRemoteTwoFactorAttempt(twoFactorAttempt)) {
      authApi.discardSessionIfCurrent(result.vaultRevision);
      return;
    }
    finishSignIn({ accountId: authenticatedAccountId(result.user), onboardingComplete: true, serverProfile: result.user, serverSessionRevision: result.vaultRevision });
  } catch (loginError) {
    if (!isCurrentRemoteTwoFactorAttempt(twoFactorAttempt)) return;
    loading.value = false;
    error.value = remoteLoginError(loginError);
  }
}
async function verifyCode() {
  if (loading.value || signInTimer) return;
  error.value = null;
  if (!codeOk.value) { error.value = t.value.login.errorInvalidCode; return; }
  if (remoteTwoFactorChallenge.value) { await verifyRemoteTwoFactor(); return; }
  const requestId = otpRequestId.value;
  if (!requestId) { loading.value = false; error.value = t.value.authOtp.errorOtpNotFound; return; }
  const context: OtpFlowContext = {
    version: otpFlowVersion,
    phone: fullPhone.value,
    scene: otpScene.value,
    requestId,
  };
  loading.value = true;
  if (remoteApiEnabled) {
    if (mode.value === "reset") {
      loading.value = false;
      step.value = 3;
      return;
    }
    try {
      const result = await authApi.completeOtpLogin({
        countryCode: country.value,
        phone: phoneClean.value,
        challengeNo: requestId,
        code: code.value.join(""),
      });
      if (result.kind !== "authenticated") throw new Error("LOGIN_OTP_SESSION_MISSING");
      if (!isCurrentOtpFlow(context)) {
        authApi.discardSessionIfCurrent(result.vaultRevision);
        return;
      }
      finishSignIn({
        accountId: authenticatedAccountId(result.user),
        onboardingComplete: true,
        serverProfile: result.user,
        serverSessionRevision: result.vaultRevision,
      }, context);
    } catch (cause) {
      if (!isCurrentOtpFlow(context)) return;
      loading.value = false;
      error.value = remoteLoginError(cause);
    }
    return;
  }
  if (mode.value !== "reset" && otpVerifyToken.value) {
    finishVerifiedOtpSignIn(otpVerifyToken.value, context);
    return;
  }
  // FEAT-AUTH01: server 同构校验(TTL/attemptsLeft/一码一)。PROD: 用返回的
  // verifyToken 换 session；mock 同样必须由本地 exchange 消费该凭证。
  const res = await otpVerify(context.phone, context.scene, context.requestId, code.value.join(""));
  if (!isCurrentOtpFlow(context)) return;
  if (!res.ok) {
    loading.value = false;
    // 与 register.vue 的同名分支消费同一个 otpVerify 结果类型 —— 两边必须一起接,
    // 否则同一种拒绝在登录页和注册页显示不同文案。
    const geo = geoText(res.error);
    if (geo) { error.value = geo; return; }
    if (res.error === "otp_invalid") {
      error.value = fmt(t.value.authOtp.errorOtpInvalid, { n: res.attemptsLeft });
    } else if (res.error === "otp_expired") {
      error.value = t.value.authOtp.errorOtpExpired;
    } else if (res.error === "otp_attempts_exceeded") {
      error.value = t.value.authOtp.errorOtpExhausted;
      code.value = ["", "", "", "", "", ""];
      focusIdx.value = 0;
    } else {
      error.value = t.value.authOtp.errorOtpNotFound;
    }
    return;
  }
  if (mode.value === "reset") { loading.value = false; step.value = 3; return; }
  otpVerifyToken.value = res.verifyToken;
  finishVerifiedOtpSignIn(res.verifyToken, context);
}
async function finishReset() {
  if (loading.value || signInTimer) return;
  error.value = null;
  if (!newPwdOk.value) { error.value = t.value.login.errorWeakPassword; return; }
  if (!pwdMatch.value) { error.value = t.value.login.passwordMismatch; return; }
  const challengeNo = otpRequestId.value;
  if (!challengeNo) { error.value = t.value.authOtp.errorOtpNotFound; return; }
  loading.value = true;
  try {
    await authApi.completePasswordReset({
      countryCode: country.value,
      phone: phoneClean.value,
      challengeNo,
      code: code.value.join(""),
      newPassword: newPassword.value,
    });
  } catch (cause) {
    loading.value = false;
    const message = cause instanceof ApiError ? cause.message : "";
    error.value = message === "USER_PASSWORD_RESET_CHALLENGE_INVALID" || message === "OTP_CODE_INVALID"
      ? t.value.login.errorInvalidCode
      : message === "USER_NEW_PASSWORD_MUST_DIFFER"
        ? t.value.login.errorWeakPassword
        : t.value.authOtp.errorServiceUnavailable;
    return;
  }
  loading.value = false;
  toast.success(t.value.login.resetSuccess, "");
  invalidateOtpFlow();
  mode.value = "password";
  step.value = 1;
  password.value = "";
  newPassword.value = "";
  confirmPwd.value = "";
}

function onPrimary() {
  if (step.value === 1) { if (mode.value === "password") signInWithPassword(); else goSendCode(); }
  else if (step.value === 2) verifyCode();
  else finishReset();
}
function toggleMode() {
  invalidateOtpFlow();
  error.value = null;
  password.value = ""; newPassword.value = ""; confirmPwd.value = "";
  showPwd.value = false; showCountries.value = false;
  code.value = ["", "", "", "", "", ""];
  otpRequestId.value = null;
  otpVerifyToken.value = null;
  remoteTwoFactorChallenge.value = null;
  resendLeft.value = 0;
  step.value = 1;
  mode.value = mode.value === "password" ? "otp" : "password";
}
function goReset() {
  invalidateOtpFlow();
  error.value = null;
  password.value = ""; newPassword.value = ""; confirmPwd.value = "";
  showPwd.value = false; showCountries.value = false;
  code.value = ["", "", "", "", "", ""];
  otpRequestId.value = null;
  otpVerifyToken.value = null;
  resendLeft.value = 0;
  step.value = 1;
  mode.value = "reset";
}
function back() {
  invalidateOtpFlow();
  error.value = null;
  if (mode.value === "reset" && step.value === 1) {
    code.value = ["", "", "", "", "", ""]; otpRequestId.value = null; otpVerifyToken.value = null; resendLeft.value = 0;
    mode.value = "password"; return;
  }
  if (mode.value === "reset" && step.value === 3) {
    newPassword.value = ""; confirmPwd.value = ""; showPwd.value = false;
    code.value = ["", "", "", "", "", ""]; otpRequestId.value = null; otpVerifyToken.value = null; resendLeft.value = 0;
    step.value = 2; return;
  }
  code.value = ["", "", "", "", "", ""]; otpRequestId.value = null; otpVerifyToken.value = null; resendLeft.value = 0; focusIdx.value = 0;
  step.value = 1;
}
function close() {
  invalidateOtpFlow();
  uni.reLaunch({ url: "/pages/onboarding/intro", fail: () => {} });
}
function goRegister() {
  invalidateOtpFlow();
  uni.reLaunch({ url: "/pages/register/register", fail: () => {} });
}

function cleanup() {
  mounted = false;
  invalidateOtpFlow();
  if (resendTimer) clearInterval(resendTimer);
}
onUnload(() => cleanup());
onUnmounted(() => cleanup());
</script>

<style scoped>
.lg-root { position: fixed; inset: 0; background: var(--v5-bg); overflow-y: auto; }
.lg-wrap { display: flex; flex-direction: column; padding: 16px 24px 0; min-height: 100%; box-sizing: border-box; }
.lg-top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
.lg-iconbtn { width: 44px; height: 44px; margin-left: -8px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; justify-self: start; transition: opacity 0.15s; }
/* 《08》§2 按下反馈 —— 本页六个可点控件原先按下去零视觉变化(CDP forcePseudoState 实测) */
.lg-iconbtn:active, .lg-phone__cc:active, .lg-eye:active, .lg-forgot:active, .lg-switch:active { opacity: 0.6; }
.lg-brand { display: flex; align-items: center; gap: 6px; justify-self: center; }
.lg-brand__n { width: 24px; height: 24px; border-radius: 7px; background: var(--v5-ink); display: flex; align-items: center; justify-content: center; }
.lg-brand__n-t { color: var(--v5-surface); font-family: var(--font-v5); font-weight: 600; font-size: 13px; }
.lg-brand__name { color: var(--v5-ink); font-weight: 600; font-family: var(--font-v5); font-size: 15px; letter-spacing: -0.02em; }
.lg-dots { margin-top: 28px; display: flex; align-items: center; gap: 6px; }
.lg-dot { height: 4px; width: 16px; border-radius: 9999px; background: var(--v5-surface-2); transition: all 0.3s; }
.lg-dot--active { width: 32px; background: var(--v5-brand); }
.lg-dot--done { width: 16px; background: color-mix(in srgb, var(--v5-brand) 40%, transparent); }
.lg-title { display: block; font-family: var(--font-v5); margin-top: 12px; font-size: 34px; font-weight: 600; line-height: 1.15; letter-spacing: -0.025em; color: var(--v5-ink); }
.lg-mode-badge { display: inline-flex; margin-top: 8px; padding: 5px 8px; border-radius: 999px; background: var(--v5-warning-soft); }
.lg-mode-badge__t { font-size: 12px; font-weight: 600; color: var(--v5-warning); }
.lg-recovery-notice { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--v5-brand) 12%, transparent); border: 1px solid color-mix(in srgb, var(--v5-brand) 34%, transparent); }
.lg-recovery-notice__t { display: block; font-size: 13px; line-height: 1.5; color: var(--v5-ink-2); }
.lg-sub { display: block; margin-top: 8px; font-size: 13px; color: var(--v5-ink-3); }
.lg-sub__ph { font-family: var(--font-v5); color: var(--v5-ink); font-variant-numeric: tabular-nums; }
.lg-body { margin-top: 28px; }
.lg-col { display: flex; flex-direction: column; gap: 12px; }
.lg-phone { position: relative; background: var(--v5-surface); border: 1px solid var(--v5-surface-2); border-radius: 16px; height: 56px; display: flex; align-items: center; }
.lg-phone--err { border-color: color-mix(in srgb, var(--v5-brand-2) 55%, transparent); }
.lg-phone__cc { height: 100%; padding: 0 16px; display: flex; align-items: center; gap: 4px; border-right: 1px solid var(--v5-surface-2); transition: opacity 0.15s; }
.lg-phone__cc-t { font-size: 15px; color: var(--v5-ink); }
.lg-phone__in { flex: 1; height: 100%; background: transparent; padding: 0 16px; font-size: 15px; color: var(--v5-ink); }
.lg-phone-hint { display: block; margin-top: -4px; padding: 0 4px; font-size: 12px; line-height: 18px; color: var(--v5-ink-3); }
.lg-phone-hint--err { color: var(--v5-brand-2); }
.lg-field-wrap { display: flex; align-items: center; background: var(--v5-surface); border: 1px solid var(--v5-surface-2); border-radius: 16px; height: 56px; padding: 0 16px; }
.lg-field-wrap--err { border-color: color-mix(in srgb, var(--v5-brand-2) 45%, transparent); }
.lg-field--flex { flex: 1; background: transparent; border: none; height: 100%; font-size: 15px; color: var(--v5-ink); }
/* 《07》tap≥44:三处热区实测 24×30 / 65×36 / 342×18。热区靠 min-* 撑开,
   图标与文字靠 flex 居中 + 负 margin 抵消,视觉位置与原先一致(只有热区变大)。 */
.lg-eye { min-width: 44px; min-height: 44px; margin-right: -10px; display: flex; align-items: center; justify-content: center; }
.lg-forgot-row { display: flex; justify-content: flex-end; }
.lg-forgot { font-size: 13px; color: var(--v5-ink-3); min-height: 44px; padding: 0 4px; line-height: 44px; }
.lg-otp { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.lg-sandbox-otp { padding: 10px 12px; border-radius: 12px; background: var(--v5-warning-soft); }
.lg-sandbox-otp__t { font-size: 12px; line-height: 18px; font-weight: 600; color: var(--v5-warning); }
.lg-otp__in { width: 48px; height: 56px; text-align: center; font-family: var(--font-v5); font-variant-numeric: tabular-nums; font-size: 20px; font-weight: 600; border-radius: 12px; background: var(--v5-surface); border: 1px solid var(--v5-surface-2); color: var(--v5-ink-4); }
.lg-otp__in--filled { border-color: color-mix(in srgb, var(--v5-brand) 45%, transparent); color: var(--v5-ink); }
.lg-resend { display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
.lg-resend__change { color: var(--v5-ink-3); }
.lg-resend__count { font-family: var(--font-v5); color: var(--v5-ink-4); font-variant-numeric: tabular-nums; }
.lg-resend__btn { color: var(--v5-brand); font-weight: 500; }
.lg-error { margin-top: 12px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--v5-brand-2); background: color-mix(in srgb, var(--v5-brand-2) 10%, transparent); border-radius: 8px; padding: 8px 12px; }
.lg-error__t { flex: 1; }
.lg-cta { margin-top: 24px; height: 56px; border-radius: 9999px; background: var(--v5-surface); display: flex; align-items: center; justify-content: center; }
.lg-cta--on { background: var(--v5-brand); }
.lg-cta__t { font-size: 15px; font-weight: 600; color: var(--v5-ink-4); }
.lg-cta__t--on { color: var(--v5-on-brand); }
.lg-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
/* min-height 18→44 会多占 26px,margin-top 12→4 抵消一半,视觉间距 12→17px 基本不变 */
.lg-switch { margin-top: 4px; min-height: 44px; display: flex; align-items: center; justify-content: center; }
.lg-switch__t { font-size: 13px; color: var(--v5-brand); font-weight: 500; }
.lg-divider { display: flex; align-items: center; margin: 28px 0; }
.lg-divider__line { flex: 1; height: 1px; background: var(--v5-surface-2); }
.lg-divider__t { padding: 0 12px; font-size: 12px; color: var(--v5-ink-3); }
.lg-footer { margin-top: auto; padding-top: 32px; text-align: center; }
.lg-footer__acc { display: block; font-size: 13px; color: var(--v5-ink-3); }
/* 句中行内链接:WCAG 2.5.8 对 inline 目标豁免 44pt(强撑高会拆掉整句行高),
   但纵向 padding 对 inline 元素不撑行盒、只扩热区 —— 17px 高的热区就此变 45px,零布局代价。 */
.lg-footer__link { color: var(--v5-brand); font-weight: 500; padding: 14px 10px; margin: 0 -10px; transition: opacity 0.15s; }
.lg-footer__link:active { opacity: 0.6; }
</style>
