<template>
  <view v-if="providers.length || intent === 'LINK'" class="third-party-auth" data-testid="third-party-auth">
    <text class="oauth-title">{{ intent === "LINK" ? t.thirdParty.linkTitle : t.thirdParty.signInTitle }}</text>
    <text v-if="intent === 'LINK' && !providers.length" class="oauth-copy">{{ t.thirdParty.unavailable }}</text>
    <AuthProviderGrid v-if="labels.length" :providers="labels" :linked="linkedLabels" :busy="!!flow || submitting || disabled" :preserve-appearance="disabled && !flow && !submitting" @select="start" />
    <view v-if="flow" class="oauth-panel" aria-live="polite">
      <text class="oauth-copy">{{ verified ? t.thirdParty.confirmIdentity : t.thirdParty.browserPrompt }}</text>
      <text v-if="verified" class="oauth-identity">{{ label(selected) }} · {{ displayName }}</text>
      <input v-if="verified && intent === 'LINK'" v-model="password" password :maxlength="128"
        :placeholder="t.security.currentPassword" :aria-label="t.security.currentPassword" class="oauth-input" />
      <view v-if="challengeNo">
        <text class="oauth-copy">{{ t.thirdParty.codePrompt }} {{ deliveryHint }}</text>
        <input v-model="code" type="number" :maxlength="6" :placeholder="t.thirdParty.codeLabel"
          :aria-label="t.thirdParty.codeLabel" class="oauth-input" />
      </view>
      <view v-if="verified" class="oauth-button" role="button" tabindex="0" :aria-label="confirmLabel"
        :aria-disabled="completionDisabled" @click="complete()" @keydown.enter.prevent="complete()" @keydown.space.prevent="complete()">
        <text>{{ submitting ? "…" : confirmLabel }}</text>
      </view>
      <view class="oauth-button oauth-secondary" role="button" tabindex="0" :aria-label="t.ui.cancel"
        :aria-disabled="submitting" @click="cancelFromUser" @keydown.enter.prevent="cancelFromUser" @keydown.space.prevent="cancelFromUser">
        <text>{{ t.ui.cancel }}</text>
      </view>
    </view>
    <text v-if="message" class="oauth-copy" role="status">{{ message }}</text>
    <ServerCaptchaSlider v-if="showCaptcha" scene="LOGIN" phone="" @success="captchaComplete" @close="showCaptcha = false" />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import AuthProviderGrid from "@/components/auth-provider-grid.vue";
import ServerCaptchaSlider from "@/components/server-captcha-slider.vue";
import { useT } from "@/i18n/use-t";
import { apiClient, authApi, sessionVault } from "@/api/runtime";
import { createOAuthProviderApi, type OAuthFlow, type ThirdPartyProvider } from "@/api/oauth-provider-api";
import { completeSignIn } from "@/auth/complete-sign-in";
import { stageRemoteRegistrationReceipt } from "@/auth/remote-registration-receipt";
import { navReset } from "@/lib/route";
import { toast } from "@/store/ui";
import { useLocaleStore } from "@/store/locale";
import { ApiError } from "@/api/errors";
import { listenForNativeOAuthReturn, validOAuthBrowserReceipt, type OAuthBrowserReceipt } from "@/auth/oauth-browser-return";

const props = withDefaults(defineProps<{ intent?: "LOGIN" | "LINK"; disabled?: boolean; returnTo?: string | null; sponsorCode?: string | null }>(), {
  intent: "LOGIN", disabled: false, returnTo: null, sponsorCode: null,
});
const t = useT();
const emit = defineEmits<{ (event: "busy", busy: boolean): void }>();
const api = createOAuthProviderApi(apiClient, authApi);
const providers = ref<ThirdPartyProvider[]>([]);
const linked = ref<ThirdPartyProvider[]>([]);
const flow = ref<OAuthFlow | null>(null);
const selected = ref<ThirdPartyProvider>("GOOGLE");
const verified = ref(false);
const displayName = ref("");
const message = ref("");
const password = ref("");
const challengeNo = ref("");
const code = ref("");
const deliveryHint = ref("");
const submitting = ref(false);
const confirmLabel = computed(() => props.intent === "LINK" ? t.value.thirdParty.confirmLink : t.value.thirdParty.continueLogin);
const completionDisabled = computed(() => submitting.value || (props.intent === "LINK" && !password.value)
  || (!!challengeNo.value && !/^\d{6}$/.test(code.value)));
const showCaptcha = ref(false);
const names = { GOOGLE: "Google", APPLE: "Apple", TELEGRAM: "Telegram" } as const;
const label = (provider: ThirdPartyProvider) => names[provider];
const linkedLabels = computed(() => props.intent === "LINK" ? linked.value.map(label) : []);
const labels = computed(() => (props.intent === "LINK"
  ? [...new Set([...providers.value, ...linked.value])] : providers.value).map(label));
let generation = 0;
let pollVersion = 0;
let disposed = false;
let revision = 0;
let expiresAt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let popup: Window | null = null;
function sameSession() {
  return sessionVault.revision() === revision
    || (props.intent === "LINK" && sessionVault.isRefreshContinuation(revision));
}
function acceptReceipt(receipt: OAuthBrowserReceipt) {
  if (!flow.value || disposed || flow.value.flowId !== receipt.flowId) return;
  flow.value.receipt = receipt.receipt;
  if (timer) clearTimeout(timer);
  void poll(generation);
}
const stopNativeReturn = listenForNativeOAuthReturn(acceptReceipt);
function browserMessage(event: MessageEvent) {
  if (!flow.value || event.source !== popup || event.origin !== new URL(flow.value.authorizationUrl).origin
      || event.data?.type !== "uvel-oauth" || !validOAuthBrowserReceipt(event.data)) return;
  acceptReceipt(event.data);
}

function cancel() {
  generation++;
  pollVersion++;
  if (timer) clearTimeout(timer);
  popup?.close(); popup = null;
  flow.value = null; verified.value = false; password.value = ""; code.value = ""; challengeNo.value = "";
  showCaptcha.value = false;
  emit("busy", false);
}
function cancelFromUser() {
  if (submitting.value) return;
  if (props.intent === "LOGIN" && !authApi.pendingLogin()
      && authApi.pendingLoginContext()?.context.flowId === flow.value?.flowId) authApi.cancelLoginChallenge();
  cancel();
}
function errorMessage(cause: unknown): string {
  const error = cause instanceof ApiError ? cause.message : "";
  if (error === "OAUTH_ACCOUNT_LINK_REQUIRED") return t.value.thirdParty.linkRequired;
  if (error?.startsWith("USER_REGISTRATION_SPONSOR_")) return t.value.register.sponsorEnvironmentMismatch;
  if (error === "OAUTH_LINK_PASSWORD_INVALID") return t.value.thirdParty.passwordInvalid;
  if (error === "OAUTH_IDENTITY_ALREADY_LINKED" || error === "OAUTH_PROVIDER_ALREADY_LINKED")
    return t.value.thirdParty.linkConflict;
  if (error === "USER_TWO_FACTOR_CHALLENGE_INVALID") return t.value.thirdParty.codeInvalid;
  if (error === "USER_PASSWORD_RESET_REQUIRED") return t.value.thirdParty.passwordReset;
  return t.value.thirdParty.failed;
}
async function start(name: string) {
  if (flow.value || submitting.value || props.disabled || disposed) return;
  if (props.intent === "LOGIN" && authApi.pendingLogin()) { message.value = t.value.login.unknownAttempt; return; }
  const provider = (Object.keys(names) as ThirdPartyProvider[]).find(key => names[key] === name);
  if (!provider || !providers.value.includes(provider)
      || (props.intent === "LINK" && linked.value.includes(provider))) return;
  const current = ++generation;
  revision = sessionVault.revision();
  selected.value = provider; message.value = ""; submitting.value = true; emit("busy", true);
  // Reserve a popup synchronously during the click; never use an embedded provider WebView.
  // #ifdef H5
  popup = window.open("about:blank", "_blank");
  if (!popup) { message.value = t.value.thirdParty.popupBlocked; submitting.value = false; emit("busy", false); return; }
  // #endif
  try {
    const next = await api.start(provider, props.intent, props.sponsorCode);
    if (disposed || current !== generation || !sameSession()) { cancel(); return; }
    flow.value = next; expiresAt = Date.now() + next.expiresInSec * 1000;
    // #ifdef H5
    if (popup) popup.location.href = next.authorizationUrl;
    // #endif
    // #ifdef APP-PLUS
    plus.runtime.openURL(next.authorizationUrl, () => {
      if (current === generation) { cancel(); message.value = t.value.thirdParty.failed; }
    });
    // #endif
    void poll(current);
  } catch (cause) { cancel(); message.value = errorMessage(cause); }
  finally { submitting.value = false; }
}
async function poll(current: number) {
  if (disposed || current !== generation || !flow.value || verified.value) return;
  const request = ++pollVersion;
  if (timer) clearTimeout(timer);
  if (Date.now() >= expiresAt || !sameSession()) {
    cancel(); message.value = t.value.thirdParty.expired; return;
  }
  try {
    const status = await api.status(flow.value);
    if (disposed || current !== generation || request !== pollVersion || verified.value) return;
    if (status.provider !== selected.value) throw new Error("OAUTH_PROVIDER_MISMATCH");
    if (status.status === "VERIFIED") {
      displayName.value = status.displayName || label(selected.value);
      if (flow.value?.receipt) {
        verified.value = true; popup?.close(); popup = null; return;
      }
    }
    else if (status.status !== "PENDING") { cancel(); message.value = t.value.thirdParty.failed; return; }
  } catch (cause) {
    if (disposed || current !== generation || request !== pollVersion || verified.value) return;
    if (!(cause instanceof ApiError) || cause.kind !== "network") {
      cancel(); message.value = errorMessage(cause); return;
    }
  }
  if (!verified.value && request === pollVersion) timer = setTimeout(() => { void poll(current); }, 2000);
}
function captchaComplete(ticket: string) {
  showCaptcha.value = false;
  void complete(ticket);
}
async function complete(captchaTicket?: string) {
  if (!flow.value || !verified.value || completionDisabled.value || disposed) return;
  const current = generation;
  if (Date.now() >= expiresAt || !sameSession()) {
    cancel(); message.value = t.value.thirdParty.expired; return;
  }
  submitting.value = true; message.value = "";
  try {
    if (props.intent === "LINK") {
      await api.link(flow.value, password.value);
      if (disposed || current !== generation) return;
      // POST is the binding result. A failed optional list refresh must not turn it into a failed mutation.
      if (!linked.value.includes(selected.value)) linked.value.push(selected.value);
      cancel(); message.value = t.value.thirdParty.linkSuccess;
    } else {
      const result = await api.complete(selected.value, flow.value, revision,
        challengeNo.value || undefined, code.value || undefined, captchaTicket);
      if (disposed || current !== generation) {
        if (result.kind === "authenticated") authApi.discardSessionIfCurrent(result.vaultRevision);
        return;
      }
      if (result.kind === "challenge") {
        challengeNo.value = result.challengeNo; deliveryHint.value = result.deliveryHint; code.value = ""; return;
      }
      const registrationDestination = result.registrationReceipt
        ? "/pages/register/success"
        : props.returnTo;
      const completed = completeSignIn({
        identity: `user:${result.user.userId}`, returnTo: registrationDestination,
        serverProfile: result.user, onboardingComplete: result.user.onboardingComplete,
        serverSessionRevision: result.vaultRevision,
        deferNavigation: !!result.registrationReceipt,
        registrationLocale: result.registrationReceipt ? useLocaleStore().code : undefined,
      });
      if (!completed.ok) throw new Error("SIGN_IN_FAILED");
      if (result.registrationReceipt) {
        stageRemoteRegistrationReceipt(result.registrationReceipt, `user:${result.user.userId}`);
        toast.success(t.value.register.registrationSignedIn);
        // #ifdef H5
        navReset({ url: "/pages/register/success", fail: () => navReset({ url: "/pages/onboarding/estimator", fail: () => {} }) });
        // #endif
        // #ifndef H5
        navReset({ url: "/pages/onboarding/estimator", fail: () => {} });
        // #endif
      }
      cancel();
    }
  } catch (cause) {
    if (!disposed && current === generation) {
      if (props.intent === "LOGIN" && authApi.pendingLogin()) {
        // Leave the durable attempt intact. The shared login recovery UI owns
        // ambiguous completion, including recovery after this flow has expired.
        cancel(); message.value = t.value.login.unknownAttempt;
      } else if (cause instanceof ApiError && cause.message === "USER_CAPTCHA_REQUIRED") showCaptcha.value = true;
      else message.value = errorMessage(cause);
    }
  } finally { submitting.value = false; password.value = ""; }
}
onMounted(async () => {
  // #ifdef H5
  window.addEventListener("message", browserMessage);
  // #endif
  try {
    const available = await api.available();
    if (!disposed) providers.value = available;
    if (props.intent === "LINK") {
      const value = await api.linked();
      if (!disposed) linked.value = value;
    }
  } catch { if (!disposed && props.intent === "LINK") message.value = t.value.thirdParty.unavailable; }
});
onUnmounted(() => {
  disposed = true; cancel(); stopNativeReturn();
  // #ifdef H5
  window.removeEventListener("message", browserMessage);
  // #endif
});
</script>

<style scoped>
.third-party-auth { margin: 20px 0; color: var(--v5-ink); }
.oauth-title { display: block; font-size: var(--ui-type-subheading); font-weight: var(--ui-type-subheading-weight); margin-bottom: 12px; }
.oauth-copy { display: block; font-size: var(--ui-type-list-subtitle); line-height: 1.6; color: var(--v5-ink-2); margin: 10px 0; overflow-wrap: anywhere; }
.oauth-panel { padding: 14px; margin-top: 12px; border-radius: 16px; background: var(--v5-surface); }
.oauth-identity { display: block; overflow-wrap: anywhere; font-weight: 600; margin: 12px 0; }
.oauth-input { box-sizing: border-box; min-height: 44px; width: 100%; padding: 10px; border-radius: 10px; color: var(--v5-ink); background: var(--v5-surface-2); margin: 12px 0; }
.oauth-button { min-height: 44px; display: flex; align-items: center; justify-content: center; margin-top: 10px; border-radius: 12px; background: var(--v5-brand); color: white; font-size: var(--ui-type-button); }
.oauth-button:active { opacity: 0.8; }
.oauth-button:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.oauth-button[aria-disabled="true"] { opacity: 0.5; }
.oauth-secondary { background: var(--v5-surface-2); color: var(--v5-ink); }
</style>
