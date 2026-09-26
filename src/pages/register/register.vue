<template>
  <StandalonePageShell class="rg-root" @keydown.esc="showCountries = false">
    <view class="rg-wrap" :inert="showCountries || undefined" :aria-hidden="showCountries">
      <!-- Top bar -->
      <view class="rg-top">
        <view v-if="step > 1" class="rg-iconbtn" role="button" tabindex="0" :aria-label="t.register.back" @click="back" @keydown.enter.prevent="back" @keydown.space.prevent="back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8D0DC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </view>
        <view v-else class="rg-iconbtn" role="button" tabindex="0" :aria-label="t.register.close" @click="close" @keydown.enter.prevent="close" @keydown.space.prevent="close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8D0DC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
        <view class="rg-brand">
          <BrandLockup />
        </view>
        <view class="rg-top__sp" />
      </view>

      <!-- Sponsor card (arrived via ?ref) -->
      <view v-if="sponsorPreview" class="rg-sponsor">
        <view class="rg-sponsor__av"><text class="rg-sponsor__av-t">{{ sponsorPreview.displayName[0] }}</text></view>
        <view class="rg-sponsor__body">
          <text class="rg-sponsor__name"><text class="rg-sponsor__name-b">{{ sponsorPreview.displayName }}</text> {{ t.ref.invitedYou }}</text>
          <text v-if="giftUsdt > 0" class="rg-sponsor__gift">+${{ giftUsdt }} + {{ giftNex }} NEX</text>
        </view>
        <text class="rg-sponsor__v">{{ sponsorPreview.vRank }}</text>
      </view>

      <!-- Step dots -->
      <view class="rg-dots">
        <view v-for="n in 3" :key="n" class="rg-dot" :class="n === step ? 'rg-dot--active' : (n < step ? 'rg-dot--done' : '')" />
      </view>

      <!-- Title -->
      <text class="rg-title">{{ step === 1 ? t.register.title : step === 2 ? t.register.codeStepTitle : t.register.setPasswordTitle }}</text>
      <view v-if="!remoteApiEnabled" class="rg-mode-badge" data-testid="auth-runtime-label">
        <text class="rg-mode-badge__t">{{ modeLabel }}</text>
      </view>
      <text class="rg-subtitle">
        <!-- 奖励金额护栏(包 zm T1):配置未到位/被中毒清零时金额句整体让位,$0 永不上转化首屏 -->
        <template v-if="step === 1"><template v-if="giftUsdt > 0"><text class="rg-subtitle__hl">{{ fmt(t.register.subtitleHighlight, { usd: giftUsdt }) }}</text>{{ t.register.subtitleRest }}</template><template v-else>{{ t.register.subtitleNoBonus }}</template></template>
        <template v-else-if="step === 2">{{ t.register.codeSentTo }} <text class="rg-subtitle__ph">{{ country }} {{ phone }}</text></template>
        <template v-else>{{ t.register.setPasswordHint }}</template>
      </text>

      <!-- Body -->
      <view class="rg-body">
        <!-- Step 1: phone。🔴 hint/横幅必须在本容器**内**:插在 v-if 与 v-else-if 之间会断步骤链,
             密码块曾因此在第 1 步恒渲染(独立验收 F1 抓获)。 -->
        <view v-if="step === 1">
          <view class="rg-phone" :class="{ 'rg-phone--err': phone && !phoneOk }">
            <view class="rg-phone__cc" role="button" tabindex="0" :aria-label="t.countryCodes.title" :aria-expanded="showCountries" @click="showCountries = true" @keydown.enter.prevent="showCountries = true" @keydown.space.prevent="showCountries = true">
              <text class="rg-phone__cc-t">{{ country }}</text>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: showCountries ? 'rotate(180deg)' : '' }"><path d="m6 9 6 6 6-6" /></svg>
            </view>
            <input class="rg-phone__in" type="number" inputmode="numeric" maxlength="15" :placeholder="t.register.phonePlaceholder" :value="phone" :aria-invalid="!!phone && !phoneOk" aria-describedby="register-phone-format" confirm-type="done" @input="onPhone" @confirm="onCta" />
          </view>
          <text id="register-phone-format" data-testid="auth-phone-hint" class="rg-phone-hint" :class="{ 'rg-phone-hint--err': phone && !phoneOk }" role="status" aria-live="polite">{{ phoneFormatMessage }}</text>
        </view>

        <!-- Step 2: OTP + invite -->
        <view v-else-if="step === 2" class="rg-step2">
          <view class="rg-otp">
            <input v-for="(d, i) in code" :key="i" class="rg-otp__in" :class="{ 'rg-otp__in--filled': d }" type="number" :maxlength="1" :focus="focusIdx === i" :value="d" :confirm-type="i === 5 ? 'done' : 'next'" @input="onCode(i, $event)" @confirm="i === 5 && onCta()" />
          </view>
          <view class="rg-resend">
            <text class="rg-resend__change" role="button" tabindex="0" :aria-label="t.register.changeNumber" @click="back" @keydown.enter.prevent="back" @keydown.space.prevent="back">{{ t.register.changeNumber }}</text>
            <text v-if="resendLeft > 0" class="rg-resend__count">{{ resendInText }}</text>
            <text v-else class="rg-resend__btn" role="button" tabindex="0" :aria-label="t.register.resend" @click="resend" @keydown.enter.prevent="resend" @keydown.space.prevent="resend">{{ t.register.resend }}</text>
          </view>
          <view class="rg-invite">
            <text class="rg-invite__lbl">{{ t.register.inviteLabel }} <text class="rg-invite__opt">{{ lockedRef ? t.register.inviteLockedLabel : t.register.inviteOptional }}</text></text>
            <!-- [FEAT-SHARE4] 链接来源码锁定置灰:不可修改不可删除(主人 2026-07-08 拍板);
                 无码自然进入才渲染可手输框。 -->
            <view v-if="lockedRef">
              <view class="rg-locked">
                <text class="rg-locked__code">{{ displayReferralCode(lockedRef) }}</text>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              </view>
              <text class="rg-locked__tag">{{ t.register.inviteLockedTag }}</text>
            </view>
            <input v-else class="rg-field" type="text" :placeholder="t.register.invitePlaceholder" :value="invite" confirm-type="done" @input="onInvite" @confirm="onCta" />
          </view>
        </view>

        <!-- Step 3: password -->
        <view v-else class="rg-step3">
          <view class="rg-field-wrap" :class="{ 'rg-field-wrap--err': password && !pwdOk }">
            <input class="rg-field rg-field--flex" :type="showPwd ? 'text' : 'password'" :placeholder="t.register.passwordPlaceholder" :maxlength="PASSWORD_MAX_LENGTH" :value="password" confirm-type="next" @input="onPwd" @confirm="focusPasswordConfirmation" />
            <view class="rg-eye" role="button" tabindex="0" :aria-label="showPwd ? t.register.hidePassword : t.register.showPassword" :aria-pressed="showPwd" @click="showPwd = !showPwd" @keydown.enter.prevent="showPwd = !showPwd" @keydown.space.prevent="showPwd = !showPwd">
              <svg v-if="showPwd" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><path d="m2 2 20 20" /></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
            </view>
          </view>
          <view class="rg-field-wrap" :class="{ 'rg-field-wrap--err': confirmPwd && (!pwdOk || password !== confirmPwd) }">
            <input class="rg-field rg-field--flex" :type="showPwd ? 'text' : 'password'" :placeholder="t.register.confirmPasswordPlaceholder" :maxlength="PASSWORD_MAX_LENGTH" :value="confirmPwd" :focus="confirmPasswordFocused" confirm-type="done" @input="onConfirm" @blur="confirmPasswordFocused = false" @confirm="onCta" />
            <view v-if="pwdMatch" class="rg-check">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" /></svg>
            </view>
          </view>
        </view>
      </view>

      <view v-if="reviewNotice" class="rg-review">
        <text class="rg-review__title">{{ t.register.rewardReviewTitle }}</text>
        <text class="rg-review__body">{{ reviewNoticeBody }}</text>
      </view>
      <!-- Error -->
      <view v-if="error" class="rg-error">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
        <text class="rg-error__t">{{ error }}</text>
      </view>

      <!-- Primary CTA -->
      <view
        class="rg-cta"
        data-system-chrome-primary
        :class="[ctaEnabled && !busy ? 'rg-cta--on' : '', busy ? 'rg-cta--busy' : '']"
        role="button"
        tabindex="0"
        :aria-label="ctaLabel"
        :aria-disabled="!ctaEnabled || busy"
        :aria-busy="busy"
        :aria-describedby="!ctaEnabled && !busy ? 'rg-cta-reason' : undefined"
        @click="onCta"
        @keydown.enter.prevent="onCta"
        @keydown.space.prevent="onCta"
      >
        <text class="rg-cta__t" :class="ctaEnabled && !busy ? 'rg-cta__t--on' : ''">{{ ctaLabel }}</text>
      </view>
      <text v-if="!ctaEnabled && !busy" id="rg-cta-reason" class="rg-sr-only">{{ ctaDisabledReason }}</text>

      <!-- OAuth (step 1) -->
      <view v-if="step === 1" class="rg-oauth">
        <view class="rg-divider"><view class="rg-divider__line" /><text class="rg-divider__t">{{ t.register.orContinueWith }}</text><view class="rg-divider__line" /></view>
        <AuthProviderGrid :busy="busy" @select="startOauth" />
      </view>

      <!-- Footer -->
      <view class="rg-footer">
        <text v-if="step === 1" class="rg-footer__acc">{{ t.register.haveAccount }} <text class="rg-footer__link" role="link" tabindex="0" @click="goLogin" @keydown.enter.prevent="goLogin" @keydown.space.prevent="goLogin">{{ t.register.signIn }}</text></text>
        <text class="rg-footer__terms">{{ t.register.termsPrefix }}<text class="rg-footer__terms-link active:opacity-70" role="link" tabindex="0" @click="goTerms" @keydown.enter.prevent="goTerms" @keydown.space.prevent="goTerms">{{ t.register.termsServiceLink }}</text>{{ t.register.termsAndPrivacy }}</text>
      </view>
    </view>

    <CountryCodeSheet :open="showCountries" :model-value="country" @select="pickCountry" @close="showCountries = false" />
    <CaptchaSlider v-if="showCaptcha" :phone="fullPhone" @success="onCaptchaOk" @close="showCaptcha = false" />
    <GlobalUi />
  </StandalonePageShell>
</template>

<script setup lang="ts">
import BrandLockup from "@/components/brand-lockup.vue";
import { ref, computed, nextTick, onUnmounted } from "vue";
import { onLoad, onUnload } from "@dcloudio/uni-app";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import GlobalUi from "@/components/global-ui.vue";
import CaptchaSlider from "@/components/captcha-slider.vue";
import CountryCodeSheet from "@/components/country-code-sheet.vue";
import AuthProviderGrid from "@/components/auth-provider-grid.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { geoPolicyUserMessage } from "@/api/geo-policy-error";
import { apiClient, authApi, remoteApiEnabled } from "@/api/runtime";
import type { OAuthProvider } from "@/api/auth-api";
import { createPublicSponsorPreviewApi, type PublicSponsorPreview } from "@/api/public-sponsor-preview-api";
import { registerMockAuthCredential } from "@/api/mock-auth-api";
import { registerAndLogin } from "@/auth/registration-auto-login";
import { normalizeRegistrationSponsorCode } from "@/auth/registration-sponsor";
import {
  exchangeVerifiedSignIn,
  finalizeVerifiedRegistration,
  otpSend,
  otpVerify,
  registerVerifiedPhone,
} from "@/store/auth-otp";
import { useApp } from "@/store/app";
import { useBills } from "@/store/bills";
import { normalizeRefCode, useSponsorship } from "@/store/sponsorship";
import { rebindAccountScopedStores } from "@/lib/account-scope";
import { displayReferralCode } from "@/lib/brand";
import { useConfig } from "@/store/config";
import { fmt } from "@/i18n/format";
import { evaluateRegistration, commitRegistration, type RegistrationAssessment } from "@/store/risk-cluster";
import { pickSponsor, type SponsorMeta } from "@/mock/sponsors";
import { toast } from "@/store/ui";
import { isPasswordOk, PASSWORD_MAX_LENGTH } from "@/auth/password-rules";
import { completeSignIn } from "@/auth/complete-sign-in";
import { restoreActivatedRegistrationSession } from "@/auth/complete-registration";
import { stageRemoteRegistrationReceipt, clearRemoteRegistrationReceipt } from "@/auth/remote-registration-receipt";
import { dialCodeForLocale, phoneFormatHint, sanitizePhoneInput, validateNationalPhone } from "@/auth/phone-number";

const t = useT();
const app = useApp();
const bills = useBills();
const sponsorship = remoteApiEnabled ? null : useSponsorship();
const cfg = useConfig();
const publicSponsorPreviewApi = createPublicSponsorPreviewApi(apiClient);
// 礼包金额单源派生自 platform config(禁本地常量镜像)。
const remotePreview = ref<PublicSponsorPreview | null>(null);
const giftUsdt = computed(() => remoteApiEnabled
  ? remotePreview.value?.gift.usdtAmount ?? 0
  : cfg.config.rewards.welcomeGift.usdtAmount);
const giftNex = computed(() => remoteApiEnabled
  ? remotePreview.value?.gift.nexAmount ?? 0
  : cfg.config.rewards.welcomeGift.nexAmount);

type Step = 1 | 2 | 3;

interface RemoteRegistrationAttemptContext {
  version: number;
  phone: string;
  challengeNo: string;
}
const step = ref<Step>(1);
// 包 zm T4:初始国家码随 App 语言(仅初始默认;用户手选后以 pickCountry 为准)。
const country = ref(dialCodeForLocale(useLocaleStore().code));
const showCountries = ref(false);
const phone = ref("");
const code = ref<string[]>(["", "", "", "", "", ""]);
const focusIdx = ref(0);
const invite = ref("");
const password = ref("");
const confirmPwd = ref("");
const showPwd = ref(false);
const confirmPasswordFocused = ref(false);
const error = ref<string | null>(null);
const showCaptcha = ref(false);
const registrationRisk = ref<RegistrationAssessment | null>(null);
// OTP + K1 评估进行中(⑤ 加载态): CTA 显示「校验中」,拦重复提交。
const verifying = ref(false);
const completing = ref(false);
const otpRequestId = ref<string | null>(null);
const verifiedToken = ref<string | null>(null);
const resendLeft = ref(0);
let resendTimer: ReturnType<typeof setInterval> | undefined;
let otpFlowVersion = 0;
let mounted = true;

// [FEAT-SHARE4] 链接来源码(?ref > pendingRefCode)合法即锁定;非法/缺失视同
// 无码,回到可手输。锁定后无任何解锁入口(防截断归因/换码自荐)。
const lockedRef = ref<string | null>(null);
type SponsorPreview = { displayName: string; vRank: string };
const sponsorPreview = ref<SponsorPreview | null>(null);

onLoad(async (options) => {
  const raw = options && (options as Record<string, string>).ref;
  if (remoteApiEnabled) {
    const norm = normalizeRegistrationSponsorCode(raw, true);
    if (!norm) return;
    try {
      const preview = await publicSponsorPreviewApi.preview(norm);
      if (!mounted) return;
      remotePreview.value = preview;
      lockedRef.value = preview.code;
      sponsorPreview.value = preview.sponsor;
    } catch {
      remotePreview.value = null;
      lockedRef.value = null;
      sponsorPreview.value = null;
    }
    return;
  }
  const norm = normalizeRefCode(raw) ?? sponsorship?.pendingCode;
  if (norm) {
    lockedRef.value = norm;
    const mock = pickSponsor(norm);
    sponsorPreview.value = { displayName: mock.name, vRank: `V${mock.vRank}` };
  }
});

const phoneClean = computed(() => phone.value.replace(/\s+/g, ""));
// 包 zm T5:主市场国别位数即时校验(不合法禁发送并就地提示);未列国别退回通用 6-15。
const phoneOk = computed(() => validateNationalPhone(country.value, phoneClean.value));
const phoneFormatMessage = computed(() => {
  const params = { example: phoneFormatHint(country.value) };
  return phone.value && !phoneOk.value
    ? fmt(t.value.countryCodes.phoneInvalidHint, params)
    : fmt(t.value.countryCodes.phoneExampleHint, params);
});
const modeLabel = computed(() => t.value.security.mockModeLabel);
const fullPhone = computed(() => `${country.value}${phoneClean.value}`);
const codeStr = computed(() => code.value.join(""));
const codeOk = computed(() => /^\d{6}$/.test(codeStr.value));
const pwdOk = computed(() => isPasswordOk(password.value, { phone: phoneClean.value }));
const pwdMatch = computed(() => password.value === confirmPwd.value && pwdOk.value);
const busy = computed(() => verifying.value || completing.value);
const ctaEnabled = computed(() => (step.value === 1 ? phoneOk.value : step.value === 2 ? codeOk.value : pwdMatch.value));
const ctaLabel = computed(() =>
  step.value === 2 && verifiedToken.value
    ? verifying.value ? t.value.register.signingIn : t.value.register.retrySignIn
    : step.value === 2 && verifying.value
      ? t.value.register.verifying
    : step.value === 3 && completing.value
      ? t.value.register.creating
    : step.value === 1
      ? t.value.register.sendCode
      : step.value === 2
        ? t.value.register.verify
        : t.value.register.finish,
);
const ctaDisabledReason = computed(() => {
  if (step.value === 1) return t.value.register.ctaDisabledPhone;
  if (step.value === 2) return t.value.register.ctaDisabledCode;
  return t.value.register.ctaDisabledPassword;
});
const resendInText = computed(() => (t.value.register.resendIn || "{s}s").replace("{s}", String(resendLeft.value)));
function showOauthUnavailable(provider: string) {
  toast.info(fmt(t.value.register.oauthUnavailableTitle, { provider }), t.value.register.oauthUnavailableBody);
}

function oauthProvider(label: string): OAuthProvider | null {
  return label === "Google" ? "GOOGLE"
    : label === "Apple" ? "APPLE"
    : label === "Passkey" ? "PASSKEY"
    : label === "Telegram" ? "TELEGRAM"
    : null;
}

function oauthError(cause: unknown, provider: OAuthProvider): string {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "OAUTH_PROVIDER_NOT_CONFIGURED" || code === "OAUTH_PROVIDER_UNAVAILABLE"
      || code === "OAUTH_SANDBOX_ONLY") {
    return `${fmt(t.value.register.oauthUnavailableTitle, { provider })}: ${t.value.register.oauthUnavailableBody}`;
  }
  return t.value.authOtp.errorServiceUnavailable;
}

async function startOauth(label: string) {
  const provider = oauthProvider(label);
  if (!provider || !remoteApiEnabled) {
    showOauthUnavailable(label);
    return;
  }
  if (busy.value) return;
  const flowVersion = ++otpFlowVersion;
  completing.value = true;
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
      identity: `user:${result.user.userId}`,
      onboardingComplete: true,
      serverProfile: result.user,
      serverSessionRevision: result.vaultRevision,
    });
    if (!completed.ok) {
      completing.value = false;
      error.value = t.value.authOtp.errorServiceUnavailable;
    }
  } catch (cause) {
    if (!mounted || flowVersion !== otpFlowVersion) return;
    completing.value = false;
    error.value = oauthError(cause, provider);
  }
}
const reviewNotice = computed(() => registrationRisk.value !== null && registrationRisk.value.cluster.status !== "clear");
// 分因提示: 同簇重复账号用「设备已有账号活动」口径;裸号/未绑定用「先审核,绑定后释放」口径。
const reviewNoticeBody = computed(() => {
  const c = registrationRisk.value?.cluster;
  if (!c) return "";
  const dup = c.reasons.includes("duplicate-pending-line") || c.reasons.includes("duplicate-freeze-line");
  const bare = c.reasons.includes("bare-identity") || c.reasons.includes("unbound-free-slot");
  return !dup && bare ? t.value.register.rewardReviewBodyUnbound : t.value.register.rewardReviewBody;
});

function invalidateOtpFlow() {
  otpFlowVersion += 1;
  verifying.value = false;
}

// uni <input> delivers the value on e.detail.value at runtime; vue-tsc types
// the payload as a DOM Event, so we read detail through a narrow cast helper.
function inputVal(e: Event): string {
  return (e as unknown as { detail: { value: string } }).detail.value;
}
function onPhone(e: Event) {
  invalidateOtpFlow();
  phone.value = sanitizePhoneInput(inputVal(e));
  error.value = null;
  registrationRisk.value = null;
  otpRequestId.value = null;
  verifiedToken.value = null;
}
function onInvite(e: Event) { invite.value = inputVal(e); error.value = null; registrationRisk.value = null; }
function onCode(i: number, e: Event) {
  const digits = inputVal(e).replace(/\D/g, "");
  const next = [...code.value];
  next[i] = digits.slice(-1) || "";
  code.value = next;
  error.value = null;
  if (next[i] && i < 5) focusIdx.value = i + 1;
  if (next.every(Boolean)) verifyCode();
}
function onPwd(e: Event) { password.value = inputVal(e); error.value = null; }
function onConfirm(e: Event) { confirmPwd.value = inputVal(e); error.value = null; }
function focusPasswordConfirmation() {
  confirmPasswordFocused.value = false;
  void nextTick(() => { confirmPasswordFocused.value = true; });
}

function pickCountry(c: string) {
  invalidateOtpFlow();
  country.value = c;
  showCountries.value = false;
}

function onCta() {
  if (busy.value) return;
  if (!ctaEnabled.value) {
    error.value = ctaDisabledReason.value;
    return;
  }
  if (step.value === 1) goSendCode();
  else if (step.value === 2) verifyCode();
  else void finish();
}
function goSendCode() {
  error.value = null;
  if (!phoneOk.value) { error.value = t.value.register.errorInvalidPhone; return; }
  void requestCode();
}
// FEAT-AUTH01: 发码统一走闸门(冷却/24h 限频/滑块);倒计时以 server 返回值为准。
async function requestCode(captchaTicket?: string) {
  if (verifying.value) return;
  const phoneAtRequest = fullPhone.value;
  const flowVersion = ++otpFlowVersion;
  verifying.value = true;
  if (remoteApiEnabled) {
    try {
      const res = await authApi.sendRegistrationOtp({ countryCode: country.value, phone: phoneClean.value });
      if (!mounted || flowVersion !== otpFlowVersion || fullPhone.value !== phoneAtRequest) return;
      verifying.value = false;
      otpRequestId.value = res.challengeNo;
      verifiedToken.value = null;
      code.value = ["", "", "", "", "", ""];
      focusIdx.value = 0;
      step.value = 2;
      startResend(res.resendAfterSec);
    } catch (cause) {
      if (!mounted || flowVersion !== otpFlowVersion) return;
      verifying.value = false;
      error.value = geoText(cause) ?? t.value.authOtp.errorOtpSendUnavailable;
    }
    return;
  }
  const res = await otpSend(phoneAtRequest, "register", captchaTicket);
  if (!mounted || flowVersion !== otpFlowVersion || fullPhone.value !== phoneAtRequest) return;
  verifying.value = false;
  if (res.ok) {
    otpRequestId.value = res.requestId;
    verifiedToken.value = null;
    code.value = ["", "", "", "", "", ""];
    focusIdx.value = 0;
    step.value = 2;
    startResend(res.resendAfterSec);
    return;
  }
  if (res.error === "captcha_required") { showCaptcha.value = true; return; }
  if (res.error === "rate_limited") {
    // 规格 ⑤(AUTH01/AUTH03 同口径):冷却中被拒 → Toast 剩余秒数;inline 错误条留给 verify 类错误。
    toast.info(fmt(t.value.authOtp.errorTooFrequent, { s: res.retryAfterSec }));
    if (step.value === 2) startResend(res.retryAfterSec);
  }
}
function onCaptchaOk(ticket: string) {
  showCaptcha.value = false;
  void requestCode(ticket);
}
function startResend(sec: number) {
  resendLeft.value = sec;
  if (resendTimer) clearInterval(resendTimer);
  resendTimer = setInterval(() => {
    resendLeft.value = Math.max(0, resendLeft.value - 1);
    if (resendLeft.value <= 0 && resendTimer) clearInterval(resendTimer);
  }, 1000);
}
function resend() {
  if (resendLeft.value > 0) return;
  error.value = null;
  void requestCode();
}
function currentSponsorCode(): string | null {
  // 锁定码优先(?ref / pendingRefCode);仅无锁定时才取手输([FEAT-SHARE4] ③)。
  return lockedRef.value || normalizeRegistrationSponsorCode(invite.value, remoteApiEnabled);
}
// A region-policy refusal reaches this page two ways: as a code on an OTP/
// registration result, or as a thrown error out of the registration transaction.
// `geoPolicyUserMessage` reads both shapes. `null` means it wasn't a region
// refusal, and the caller must fall through to its existing mapping — otherwise
// an unrelated failure would be reported to the user as a region block.
function geoText(code: unknown): string | null {
  return geoPolicyUserMessage(code, t.value.geoPolicy);
}

function isCurrentRemoteRegistrationAttempt(context: RemoteRegistrationAttemptContext): boolean {
  return mounted
    && context.version === otpFlowVersion
    && step.value === 3
    && fullPhone.value === context.phone
    && otpRequestId.value === context.challengeNo;
}

function registrationErrorText(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "USER_REGISTRATION_SPONSOR_ENVIRONMENT_MISMATCH") {
    return t.value.register.sandboxSponsorEnvironmentMismatch;
  }
  return geoText(cause) ?? t.value.authOtp.errorServiceUnavailable;
}

async function verifyCode() {
  if (verifying.value) return;
  error.value = null;
  if (verifiedToken.value) {
    verifying.value = true;
    exchangeVerifiedAccount(verifiedToken.value, fullPhone.value, otpFlowVersion);
    return;
  }
  if (!codeOk.value) { error.value = t.value.register.errorInvalidCode; return; }
  // The remote contract validates the OTP atomically with registration. Do not
  // mirror a successful verification in local storage before that authority has
  // accepted it.
  if (remoteApiEnabled) {
    if (!otpRequestId.value) { error.value = t.value.authOtp.errorOtpNotFound; return; }
    step.value = 3;
    return;
  }
  // ⚠️ MOCK-ONLY: PRD 已列的 OTP verify 的 TTL/attempts/一码一与验后账号分流
  // 在 auth-otp mock；K1 注册评估仍在下方 client mock 执行，不能声称由本次 OTP
  // 响应返回。PROD 应由注册事务（endpoint/回执契约 TBD）原子重校验 verifyToken、
  // K1 与唯一性，并只返回服务端结论。
  verifying.value = true;
  const requestId = otpRequestId.value;
  if (!requestId) { verifying.value = false; error.value = t.value.authOtp.errorOtpNotFound; return; }
  const phoneAtVerify = fullPhone.value;
  const flowVersion = otpFlowVersion;
  const res = await otpVerify(phoneAtVerify, "register", requestId, codeStr.value);
  if (
    !mounted
    || flowVersion !== otpFlowVersion
    || step.value !== 2
    || otpRequestId.value !== requestId
    || fullPhone.value !== phoneAtVerify
  ) return;
  if (!res.ok) {
    verifying.value = false;
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
    } else if (res.error === "account_lookup_failed") {
      error.value = t.value.authOtp.errorServiceUnavailable;
    } else {
      error.value = t.value.authOtp.errorOtpNotFound;
    }
    return;
  }
  verifiedToken.value = res.verifyToken;
  if (res.nextAction === "sign_in") {
    exchangeVerifiedAccount(res.verifyToken, phoneAtVerify, flowVersion);
    return;
  }
  if (res.nextAction !== "continue_registration") {
    verifying.value = false;
    verifiedToken.value = null;
    error.value = t.value.authOtp.errorServiceUnavailable;
    return;
  }
  const assessment = evaluateRegistration(prospectiveIdentity(), { sponsorId: currentSponsorCode() });
  registrationRisk.value = assessment;
  verifying.value = false;
  // 只在最终 reserve 时执行 signup gate：验码后的 pending 恢复必须先由
  // 账号目录识别并沿用冻结上下文，不能被此刻变化的页面/K1 临时态拦断。
  step.value = 3;
}
async function exchangeVerifiedAccount(token: string, phoneAtVerify: string, flowVersion: number) {
  if (!mounted || flowVersion !== otpFlowVersion || fullPhone.value !== phoneAtVerify) return;
  const exchange = exchangeVerifiedSignIn(phoneAtVerify, token);
  if (!exchange.ok) {
    verifying.value = false;
    if (exchange.error !== "account_directory_unavailable") verifiedToken.value = null;
    // 第三条同形路径:老号在注册页触发的自动登录。它消费的错误与 login.vue 已接的
    // 是同一个函数、同一个类型 —— 漏接会导致同一种拒绝在两条路上显示不同文案。
    error.value = geoText(exchange.error) ?? (exchange.error === "account_directory_unavailable"
      ? t.value.authOtp.errorServiceUnavailable
      : t.value.authOtp.errorOtpExpired);
    return;
  }
  // 立即进入既有登录完成链，不以人为计时器阻塞；toast 会随目标页面的 GlobalUi
  // 保留“已注册 / 正在登录”的可读反馈。
  toast.info(t.value.register.accountExistsTitle, t.value.register.accountExistsSigningIn);
  await nextTick();
  if (!mounted || flowVersion !== otpFlowVersion || fullPhone.value !== phoneAtVerify) return;
  const completed = completeSignIn({
    identity: exchange.accountId,
    sponsorCode: currentSponsorCode(),
    idempotencyKey: exchange.signInIdempotencyKey,
    onboardingComplete: exchange.onboardingComplete,
  });
  if (!completed.ok) {
    verifying.value = false;
    error.value = geoText(completed.error) ?? (completed.error === "account_pending"
      ? t.value.login.errorRegistrationIncomplete
      : t.value.authOtp.errorServiceUnavailable);
  }
}
async function finish() {
  if (completing.value) return;
  error.value = null;
  if (!pwdOk.value) { error.value = t.value.register.errorWeakPassword; return; }
  if (!pwdMatch.value) { error.value = t.value.register.passwordMismatch; return; }
  if (remoteApiEnabled) {
    const challengeNo = otpRequestId.value;
    if (!challengeNo) {
      error.value = t.value.authOtp.errorOtpExpired;
      step.value = 2;
      return;
    }
    const registrationAttempt: RemoteRegistrationAttemptContext = {
      version: otpFlowVersion,
      phone: fullPhone.value,
      challengeNo,
    };
    completing.value = true;
    const registration = await registerAndLogin(authApi, {
      countryCode: country.value,
      phone: phoneClean.value,
      challengeNo,
      code: codeStr.value,
      password: password.value,
      sponsorCode: currentSponsorCode(),
    }, () => isCurrentRemoteRegistrationAttempt(registrationAttempt));
    if (registration.kind === "stale") return;
    if (registration.kind === "registration_error") {
      completing.value = false;
      error.value = registrationErrorText(registration.error);
      return;
    }
    if (registration.kind === "login_error") {
      completing.value = false;
      error.value = t.value.register.registrationOutcomeUnknown;
      return;
    }
    const completed = completeSignIn({
      identity: `user:${registration.user.userId}`,
      onboardingComplete: true,
      serverProfile: registration.user,
      serverSessionRevision: registration.vaultRevision,
      deferNavigation: true,
    });
    if (!completed.ok) {
      error.value = geoText(completed.error) ?? t.value.authOtp.errorServiceUnavailable;
      completing.value = false;
      clearRemoteRegistrationReceipt();
      return;
    }
    stageRemoteRegistrationReceipt(registration.registrationReceipt ?? null, `user:${registration.user.userId}`);
    toast.success(t.value.register.registrationSignedIn);
    launchRegistrationSuccess();
    return;
  }
  const identity = prospectiveIdentity();
  const sponsorCode = currentSponsorCode();
  // 完成时点重评(含最新邀请码): R5 口径下评估随调随算,不留步骤间缓存。
  const assessment = evaluateRegistration(identity, { sponsorId: sponsorCode });
  registrationRisk.value = assessment;
  const token = verifiedToken.value;
  if (!token) {
    error.value = t.value.authOtp.errorOtpExpired;
    step.value = 2;
    code.value = ["", "", "", "", "", ""];
    otpRequestId.value = null;
    resendLeft.value = 0;
    return;
  }
  completing.value = true;
  const accountResult = registerVerifiedPhone(fullPhone.value, token, {
    sponsorCode,
    giftRoute: assessment.giftRoute,
    allowCreate: assessment.gateRoute !== "manual_or_reject",
  });
  if (!accountResult.ok) {
    if (accountResult.error === "account_exists") {
      completing.value = false;
      step.value = 2;
      verifying.value = true;
      exchangeVerifiedAccount(token, fullPhone.value, otpFlowVersion);
      return;
    } else if (accountResult.error === "registration_blocked") {
      error.value = t.value.register.errorSignupLimited;
    } else {
      // 同形第四条:漏接会把地区拒单报成「验证码已过期」,用户重发验证码→再被拒→循环,
      // 那是主动误导,不只是缺文案。
      error.value = geoText(accountResult.error) ?? (accountResult.error === "account_directory_unavailable"
        ? t.value.authOtp.errorServiceUnavailable
        : t.value.authOtp.errorOtpExpired);
    }
    completing.value = false;
    return;
  }
  // 包 zm F2:legacy 目录不存密码 —— 把本次设置的密码登记进 mock authApi 注册表,
  // 否则 mock 档密码登录永远「查无此人」。两个成功分支(已提交/新建)都要走到,故放在这里。
  registerMockAuthCredential(country.value, phoneClean.value, password.value);
  const previousAccountKey = app.accountKey || "default";
  const restorePreviousAccountScope = () => {
    app.bindAccount(previousAccountKey);
    rebindAccountScopedStores(previousAccountKey);
  };
  if (accountResult.alreadyCommitted) {
    completeActivatedRegistration(accountResult.accountId, restorePreviousAccountScope);
    return;
  }
  const createdIdentity = accountResult.accountId;
  const registration = accountResult.registration;
  if (!registration) {
    completing.value = false;
    error.value = t.value.authOtp.errorServiceUnavailable;
    return;
  }
  // ⚠️ MOCK-ONLY CROSS-STORE MUTATION：注册提交依次写账号目录 pending → 当前
  // account-cloud 作用域 → K1 风险身份 → 推荐绑定/礼包领取 → 奖励余额回执 → 两条
  // 账单 → active finalize。任一步失败不把半成品账号留作当前作用域；已落的业务
  // 副作用由冻结 giftRef + 幂等补齐链在同号重试时收敛。PROD 应由服务端单事务完成
  // （注册提交 endpoint TBD; candidate: `POST /api/auth/register`）。
  try {
    app.bindAccount(createdIdentity);
    rebindAccountScopedStores(createdIdentity);
    if (!commitRegistration(createdIdentity, { sponsorId: registration.sponsorCode })) {
      throw new Error("risk_registration_unavailable");
    }
    if (registration.sponsorCode) {
      if (!sponsorship?.bind(registration.sponsorCode)) throw new Error("sponsor_bind_unavailable");
      const gift = sponsorship.ensureGiftClaim(createdIdentity, {
        usdt: registration.giftUsdt,
        nex: registration.giftNex,
      });
      if (!gift) throw new Error("gift_claim_unavailable");
      {
        const posted = app.creditRewardBucketOnce(registration.giftRef, registration.giftRoute, gift.usdt, gift.nex);
        if (!posted) throw new Error("gift_credit_unavailable");
        const giftRef = registration.giftRef;
        const giftPosted = registration.giftRoute === "withdrawable";
        const giftMemo = giftPosted ? t.value.register.giftBillMemo : t.value.register.giftPendingBillMemo;
        const usdtBill = bills.addOnce({ type: "bonus", symbol: "USDT", amount: gift.usdt, status: giftPosted ? "posted" : "pending", memo: giftMemo, ref: giftRef });
        const nexBill = bills.addOnce({ type: "bonus", symbol: "NEX", amount: gift.nex, status: giftPosted ? "posted" : "pending", memo: giftMemo, ref: giftRef });
        if (!usdtBill || !nexBill) throw new Error("gift_bill_unavailable");
        if (posted && giftPosted) {
          toast.success(
            `+$${gift.usdt} + ${gift.nex} NEX`,
            sponsorPreview.value
              ? fmt(t.value.register.giftCreditedToastSubSponsor, { name: sponsorPreview.value.displayName })
              : t.value.register.giftCreditedToastSub,
          );
        } else {
          toast.info(t.value.register.giftPendingToast, t.value.register.giftPendingToastSub);
        }
      }
    }
  } catch (err) {
    restorePreviousAccountScope();
    completing.value = false;
    error.value = geoText(err) ?? t.value.authOtp.errorServiceUnavailable;
    return;
  }
  const finalized = finalizeVerifiedRegistration(fullPhone.value, token);
  if (!finalized.ok) {
    restorePreviousAccountScope();
    completing.value = false;
    // 同形第五条,理由同上。
    error.value = geoText(finalized.error) ?? (finalized.error === "account_directory_unavailable"
      ? t.value.authOtp.errorServiceUnavailable
      : t.value.authOtp.errorOtpExpired);
    return;
  }
  completeActivatedRegistration(finalized.accountId, restorePreviousAccountScope);
}
function completeActivatedRegistration(accountId: string, restorePreviousAccountScope: (() => void) | null = null) {
  // finalize→auth/session 之间中断时，同一注册结果会再次走这里补齐登录态。
  if (!restoreActivatedRegistrationSession(accountId)) {
    restorePreviousAccountScope?.();
    completing.value = false;
    error.value = t.value.authOtp.errorServiceUnavailable;
    return;
  }
  launchRegistrationSuccess();
}
function launchRegistrationSuccess() {
  // [FEAT-SHARE5] H5 注册完成 → 成功页(礼包确认 + 引导下载 APP);
  // APP 壳内注册装 APP 引导无意义,直进 onboarding(异常2)。
  // #ifdef H5
  uni.reLaunch({
    url: "/pages/register/success",
    fail: () => uni.reLaunch({ url: "/pages/onboarding/estimator", fail: () => {} }),
  });
  // #endif
  // #ifndef H5
  uni.reLaunch({ url: "/pages/onboarding/estimator", fail: () => {} });
  // #endif
}
function prospectiveIdentity() {
  return `${country.value}${phoneClean.value}@demo.nexgrid.ai`;
}
function back() {
  invalidateOtpFlow();
  error.value = null;
  registrationRisk.value = null;
  verifying.value = false;
  completing.value = false;
  otpRequestId.value = null;
  verifiedToken.value = null;
  code.value = ["", "", "", "", "", ""];
  focusIdx.value = 0;
  if (resendTimer) clearInterval(resendTimer);
  resendLeft.value = 0;
  step.value = (step.value === 3 ? 2 : 1) as Step;
}
function close() { uni.reLaunch({ url: "/pages/onboarding/intro", fail: () => {} }); }
function goLogin() { uni.reLaunch({ url: "/pages/login/login", fail: () => {} }); }
function goTerms() { uni.navigateTo({ url: "/pages/onboarding/terms", fail: () => {} }); }

function cleanup() {
  mounted = false;
  invalidateOtpFlow();
  if (resendTimer) clearInterval(resendTimer);
}
onUnload(() => cleanup());
onUnmounted(() => cleanup());
</script>

<style scoped>
.rg-root { position: fixed; inset: 0; background: var(--v5-bg); overflow-y: auto; }
.rg-wrap { display: flex; flex-direction: column; padding: 16px 24px 0; min-height: 100%; box-sizing: border-box; }
.rg-top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; }
.rg-iconbtn { width: 44px; height: 44px; margin-left: -8px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; justify-self: start; transition: opacity 0.15s; }
/* 《08》§2 按下反馈(同 login) */
.rg-iconbtn:active, .rg-phone__cc:active { opacity: 0.6; }
.rg-brand { display: flex; align-items: center; gap: 6px; justify-self: center; }
.rg-top__sp { }
.rg-sponsor { margin-top: 16px; border-radius: 16px; padding: 12px; display: flex; align-items: center; gap: 12px; background: radial-gradient(80% 60% at 0% 0%, rgba(198,255,58,0.12) 0%, transparent 65%), var(--v5-surface); }
.rg-sponsor__av { width: 40px; height: 40px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: linear-gradient(135deg, var(--v5-brand), var(--v5-tech-cyan)); }
.rg-sponsor__av-t { color: var(--v5-on-brand); font-family: var(--font-v5); font-weight: 600; font-size: 20px; }
.rg-sponsor__body { flex: 1; min-width: 0; }
.rg-sponsor__name { display: block; font-size: 13px; color: var(--v5-ink); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.rg-sponsor__name-b { font-weight: 600; }
.rg-sponsor__gift { display: block; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--v5-brand); margin-top: 2px; }
.rg-sponsor__v { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--v5-brand); background: color-mix(in srgb, var(--v5-brand) 15%, transparent); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
.rg-dots { margin-top: 28px; display: flex; align-items: center; gap: 6px; }
.rg-dot { height: 4px; width: 16px; border-radius: 9999px; background: var(--v5-surface-2); transition: all 0.3s; }
.rg-dot--active { width: 32px; background: var(--v5-brand); }
.rg-dot--done { width: 16px; background: color-mix(in srgb, var(--v5-brand) 40%, transparent); }
.rg-title { display: block; font-family: var(--font-v5); margin-top: 12px; font-size: 34px; font-weight: 600; line-height: 1.15; letter-spacing: -0.025em; color: var(--v5-ink); }
.rg-subtitle { display: block; margin-top: 8px; font-size: 13px; color: var(--v5-ink-3); }
.rg-subtitle__hl { color: var(--v5-brand); font-weight: 600; }
.rg-subtitle__ph { font-family: var(--font-v5); color: var(--v5-ink); font-variant-numeric: tabular-nums; }
.rg-body { margin-top: 28px; }
.rg-phone { position: relative; background: var(--v5-surface); border: 1px solid var(--v5-surface-2); border-radius: 16px; height: 56px; display: flex; align-items: center; }
.rg-phone--err { border-color: color-mix(in srgb, var(--v5-brand-2) 55%, transparent); }
.rg-phone__cc { height: 100%; padding: 0 16px; display: flex; align-items: center; gap: 4px; border-right: 1px solid var(--v5-surface-2); transition: opacity 0.15s; }
.rg-phone__cc-t { font-size: 15px; color: var(--v5-ink); }
.rg-phone__in { flex: 1; height: 100%; background: transparent; padding: 0 16px; font-size: 15px; color: var(--v5-ink); }
.rg-step2 { display: flex; flex-direction: column; gap: 20px; }
.rg-otp { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rg-otp__in { width: 48px; height: 56px; text-align: center; font-family: var(--font-v5); font-variant-numeric: tabular-nums; font-size: 20px; font-weight: 600; border-radius: 12px; background: var(--v5-surface); border: 1px solid var(--v5-surface-2); color: var(--v5-ink-4); }
.rg-otp__in--filled { border-color: color-mix(in srgb, var(--v5-brand) 45%, transparent); color: var(--v5-ink); }
.rg-resend { display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
.rg-resend__change { color: var(--v5-ink-3); }
.rg-resend__count { font-family: var(--font-v5); color: var(--v5-ink-4); font-variant-numeric: tabular-nums; }
.rg-resend__btn { color: var(--v5-brand); font-weight: 500; }
.rg-invite__lbl { display: block; font-size: 12px; color: var(--v5-ink-3); margin-bottom: 6px; padding: 0 4px; }
.rg-invite__opt { color: var(--v5-ink-4); }
/* [FEAT-SHARE4] 链接来源码锁定态:同 rg-field 形制但压暗 + 锁标,无输入交互。 */
.rg-locked { display: flex; align-items: center; gap: 8px; background: #0A0A0A; border: 1px solid var(--v5-surface-2); border-radius: 16px; height: 56px; padding: 0 16px; opacity: 0.9; }
.rg-locked__code { flex: 1; font-size: 15px; color: var(--text-muted); font-family: var(--font-jet-mono), ui-monospace, monospace; letter-spacing: 0.04em; }
.rg-locked__tag { display: block; margin-top: 8px; padding: 0 4px; font-size: 12px; color: var(--v5-brand); }
.rg-step3 { display: flex; flex-direction: column; gap: 12px; }
/* 《03》§3 零 border:填充容器不描边(2026-08-15 zero-border 门抓获存量);错误态改 soft tint 表达。 */
.rg-field { background: var(--v5-surface); border-radius: 16px; height: 56px; padding: 0 16px; font-size: 15px; color: var(--v5-ink); }
.rg-field-wrap { display: flex; align-items: center; background: var(--v5-surface); border-radius: 16px; height: 56px; padding: 0 16px; }
.rg-field-wrap--err { background: color-mix(in srgb, var(--v5-brand-2) 12%, var(--v5-surface)); }
.rg-field--flex { flex: 1; background: transparent; border: none; height: 100%; padding: 0; }
.rg-eye { padding: 4px; }
.rg-check { display: flex; }
.rg-review { margin-top: 16px; border-radius: 12px; background: color-mix(in srgb, var(--v5-warning) 10%, transparent); padding: 10px 12px; }
.rg-review__title { display: block; font-size: 13px; font-weight: 600; color: var(--v5-warning); }
.rg-review__body { display: block; margin-top: 4px; font-size: 12px; line-height: 1.45; color: var(--v5-ink-3); }
.rg-error { margin-top: 12px; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--v5-brand-2); background: color-mix(in srgb, var(--v5-brand-2) 10%, transparent); border-radius: 8px; padding: 8px 12px; }
.rg-phone-hint { display: block; margin-top: 8px; font-size: 12px; color: var(--v5-ink-3); }
.rg-phone-hint--err { color: var(--v5-brand-2); }
.rg-devbanner { margin-top: 10px; border-radius: 8px; padding: 8px 12px; background: color-mix(in srgb, var(--v5-warning) 12%, transparent); }
.rg-devbanner__t { font-size: 12px; color: var(--v5-warning); }
.rg-error__t { flex: 1; }
.rg-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.rg-cta { margin-top: 20px; height: 56px; border-radius: 9999px; background: var(--v5-surface); display: flex; align-items: center; justify-content: center; }
.rg-cta--on { background: var(--v5-brand); }
.rg-cta--busy { opacity: 0.7; }
.rg-cta__t { font-size: 15px; font-weight: 600; color: var(--v5-ink-4); }
.rg-cta__t--on { color: var(--v5-on-brand); }
.rg-oauth { }
.rg-divider { display: flex; align-items: center; margin: 24px 0; }
.rg-divider__line { flex: 1; height: 1px; background: var(--v5-surface-2); }
.rg-divider__t { padding: 0 12px; font-size: 12px; color: var(--v5-ink-3); }
.rg-mode-badge { display: inline-flex; margin-top: 8px; padding: 5px 8px; border-radius: 999px; background: var(--v5-warning-soft); }
.rg-mode-badge__t { font-size: 12px; font-weight: 600; color: var(--v5-warning); }
.rg-footer { margin-top: auto; padding-top: 32px; text-align: center; }
.rg-footer__acc { display: block; font-size: 13px; color: var(--v5-ink-3); }
/* 同 login:inline 目标吃 WCAG 2.5.8 豁免,纵向 padding 扩热区不撑行高 */
/* 水平也补 10px:"Sign in" 只有 25px 宽,纵向撑够了横向还是不够。负 margin 抵消布局,
   多出来的热区落在句子里的空白与标点上 —— 那本来就不可点,重叠反而符合 Fitts 定律。 */
.rg-footer__link { color: var(--v5-brand); font-weight: 500; padding: 14px 10px; margin: 0 -10px; transition: opacity 0.15s; }
.rg-footer__link:active { opacity: 0.6; }
.rg-footer__terms { display: block; margin-top: 8px; font-size: 12px; color: var(--v5-ink-4); }
/* padding 15 而非 14:这行字比 footer__link 小(11.5px),14 只能撑到 43 —— 差 1px 也是差 */
.rg-footer__terms-link { color: var(--v5-ink-3); text-decoration: underline; text-underline-offset: 2px; padding: 15px 0; }
</style>
