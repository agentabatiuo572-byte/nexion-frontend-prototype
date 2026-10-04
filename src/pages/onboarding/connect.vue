<template>
  <StandalonePageShell class="cn-root" :top-inset="24" @click="rulesExpanded = false">
    <!-- Progress (3/3 full) -->
    <view class="cn-bars">
      <view class="cn-back active:opacity-60" role="button" :tabindex="activationBusy || phase === 'calibrating' ? -1 : 0" :aria-disabled="activationBusy || phase === 'calibrating'" :aria-label="t.login.back" @click="leaveConnect" @keydown.enter.prevent="leaveConnect" @keydown.space.prevent="leaveConnect">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>
      <view class="cn-bar"><view class="cn-bar__fill cn-bar__fill--full" /></view>
      <view class="cn-bar"><view class="cn-bar__fill cn-bar__fill--full" /></view>
      <view class="cn-bar"><view class="cn-bar__fill cn-bar__fill--full" /></view>
    </view>

    <view>
      <text class="cn-step">{{ stepText }}</text>
      <text class="cn-title">{{ nativePhoneAvailable ? titleText : phoneActivationGuidance.title }}</text>
      <text v-if="!nativePhoneAvailable || (phase !== 'result' && phase !== 'error')" class="cn-sub">{{ nativePhoneAvailable ? subText : phoneActivationGuidance.body }}</text>
    </view>

    <view v-if="nativePhoneAvailable">
      <!-- Phase: intro -->
      <view v-if="phase === 'intro'" key="intro" class="cn-phase">
        <view class="cn-why">
          <text class="cn-why__h">{{ t.onboarding.calibrationWhyTitle }}</text>
          <view class="cn-why__list">
            <view v-for="(p, i) in whyPoints" :key="i" class="cn-point">
              <view class="cn-point__ic">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="p.color" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="p.icon" /></svg>
              </view>
              <text class="cn-point__t">{{ p.text }}</text>
            </view>
          </view>
        </view>
        <view class="cn-go cn-go--glow active:scale-[0.98]" role="button" tabindex="0" data-system-chrome-primary @click="phase = 'calibrating'" @keydown.enter.prevent="phase = 'calibrating'" @keydown.space.prevent="phase = 'calibrating'">
          <text class="cn-go__t">{{ t.onboarding.calibrationStart }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
      </view>

      <!-- Phase: calibrating -->
      <view v-else-if="phase === 'calibrating'" key="calibrating" class="cn-phase">
        <view class="cn-prog-row">
          <svg class="cn-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          <text class="cn-prog-row__t">{{ t.onboarding.detecting }}</text>
        </view>

      </view>

      <!-- Phase: result: the server score is the only public calibration figure. -->
      <view v-else-if="phase === 'result'" key="result" class="cn-phase anim-up">
        <view class="cn-score cn-score--hex" role="img" :aria-label="`${t.onboarding.resultTitle} ${finalScore} ${t.onboarding.phoneComputeUnit}`">
          <view class="cn-score__aurora" aria-hidden="true" />
          <svg class="cn-score__hex" viewBox="0 0 220 220" aria-hidden="true" focusable="false">
            <path class="cn-score__ring cn-score__ring--halo" :d="scoreHexPath" />
            <path class="cn-score__ring cn-score__ring--edge" :d="scoreHexPath" />
          </svg>
          <view class="cn-score__num">
            <text class="cn-score__v">{{ shownScore }}</text>
            <text class="cn-score__d">{{ t.onboarding.phoneComputeUnit }}</text>
          </view>
        </view>
      </view>

      <!-- A failed calibration is a real terminal state until the user retries. -->
      <view v-else key="error" class="cn-phase anim-up">
        <view class="cn-policy">
          <view class="cn-policy__cap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
            <text class="cn-policy__cap-t">{{ failureTitle }}</text>
          </view>
          <text class="cn-policy__t">{{ failureDetail }}</text>
          <text v-if="failedAction !== 'defer'" class="cn-policy__t cn-policy__t--spaced">{{ t.onboarding.activationDeferredHint }}</text>
          <text class="cn-policy__t cn-policy__t--spaced">{{ t.onboarding.activationRewardGate }}</text>
        </view>
      </view>
    </view>

    <view v-if="!nativePhoneAvailable" class="cn-cta">
      <view class="cn-go cn-go--on active:scale-[0.98]" role="button" tabindex="0" data-system-chrome-primary @click="leaveConnect" @keydown.enter.prevent="leaveConnect" @keydown.space.prevent="leaveConnect">
        <text class="cn-go__t cn-go__t--on">{{ t.login.back }}</text>
      </view>
    </view>
    <view v-if="nativePhoneAvailable" class="cn-cta">
      <view v-if="phase === 'result'" class="cn-go cn-go--on active:scale-[0.98]" role="button" :tabindex="activationBusy ? -1 : 0" :aria-disabled="activationBusy" data-system-chrome-primary @click="activate" @keydown.enter.prevent="activate" @keydown.space.prevent="activate">
        <text class="cn-go__t cn-go__t--on">{{ activateText }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
      <view v-else-if="phase === 'error'" class="cn-error-actions">
        <view class="cn-go cn-go--on active:scale-[0.98]" role="button" :tabindex="activationBusy ? -1 : 0" :aria-disabled="activationBusy" data-system-chrome-primary @click="retryCalibration" @keydown.enter.prevent="retryCalibration" @keydown.space.prevent="retryCalibration">
          <text class="cn-go__t cn-go__t--on">{{ t.onboarding.activationRetry }}</text>
        </view>
        <view v-if="failedAction !== 'defer'" class="cn-go cn-go--secondary active:scale-[0.98]" role="button" :tabindex="activationBusy ? -1 : 0" :aria-disabled="activationBusy" @click="deferPhoneActivation" @keydown.enter.prevent="deferPhoneActivation" @keydown.space.prevent="deferPhoneActivation">
          <text class="cn-go__t cn-go__t--secondary">{{ t.onboarding.activationDefer }}</text>
        </view>
      </view>
    </view>
    <view v-if="nativePhoneAvailable && phase === 'result'" class="cn-policy-float" @click.stop>
      <view v-if="rulesExpanded" id="cn-policy-details" class="cn-policy-float__list" role="tooltip">
        <text class="cn-policy-float__title">{{ t.onboarding.policyTitle }}</text>
        <text v-for="(line, i) in policyLines" :key="i" class="cn-policy__t">{{ line }}</text>
      </view>
      <view class="cn-policy-float__button" role="button" tabindex="0" :aria-label="t.onboarding.policyTitle" :aria-expanded="rulesExpanded" aria-controls="cn-policy-details" @click="rulesExpanded = !rulesExpanded" @keydown.enter.prevent="rulesExpanded = !rulesExpanded" @keydown.space.prevent="rulesExpanded = !rulesExpanded">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
      </view>
    </view>
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { navReset } from "@/lib/route";
import { hasNativeAndroidPhoneRuntime } from "@/lib/native-phone-runtime";
import { resolvePhoneActivationGuidance } from "@/lib/phone-activation-guidance";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { onLoad, onBackPress } from "@dcloudio/uni-app";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import { useT } from "@/i18n/use-t";
import { useAuth } from "@/store/auth";
import { useApp } from "@/store/app";
import { useSession } from "@/store/session";
import { markAuthAccountOnboardingComplete } from "@/store/auth-account";
import { getDeviceId } from "@/lib/device-id";
import { collectDeviceSignals } from "@/lib/device-signals";
import { requireCryptoUuid } from "@/lib/secure-command-id";
import { onboardingCalibrationApi, remoteApiEnabled } from "@/api/runtime";
import type { OnboardingCalibration } from "@/api/onboarding-calibration-api";
import { calibrationBelongsTo, createPhoneCalibrationFlow } from "@/lib/phone-calibration-flow";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import type { RemoteAccountRequest } from "@/lib/remote-account-epoch";
import { confirmDeferredPhoneActivation } from "@/lib/defer-phone-activation";
import { isCurrentOnboardingCalibrationScope, type OnboardingCalibrationScope } from "@/lib/onboarding-calibration-scope";

const t = useT();
const auth = useAuth();

// Only explicit remeasurement or a server-confirmed replacement is recalibration.
const isRecal = ref(false);
const isLogin = ref(false);
const loginCheckNeeded = ref(false);
const resumeDeferred = ref(false);

type Phase = "intro" | "calibrating" | "result" | "error";
type FailedAction = "calibration" | "activate" | "defer";
const phase = ref<Phase>("intro");
const rulesExpanded = ref(false);
const shownScore = ref(0);
let scoreTimer: ReturnType<typeof setInterval> | null = null;
const failedAction = ref<FailedAction>("calibration");
const failureCode = ref("");

// Every runtime mode receives final facts from the authenticated server. The
// onboarding path intentionally has no local capability fallback, so mock,
// sandbox, and remote cannot turn device observations into business facts.
const canonical = ref<OnboardingCalibration | null>(null);
const finalScore = computed(() => canonical.value?.computeValue ?? 0);

let mounted = true;
let accountEpoch = 0;
let requestGeneration = 0;
function accountKey(): string { return auth.accountId || auth.email || "default"; }
type RequestScope = OnboardingCalibrationScope & { remote: RemoteAccountRequest };
function currentScope(): RequestScope {
  return { accountKey: accountKey(), accountEpoch, generation: requestGeneration, remote: captureAccountScope() };
}
function scopeIsCurrent(scope: RequestScope): boolean {
  return mounted && auth.isAuthenticated && isCurrentAccountScope(scope.remote)
    && isCurrentOnboardingCalibrationScope(scope, currentScope());
}
function acceptCurrentCanonical(scope: RequestScope, result: OnboardingCalibration): boolean {
  return scopeIsCurrent(scope) && calibrationBelongsTo(result, accountKey(), getDeviceId());
}
const authenticatedAccountKey = computed(() => auth.isAuthenticated ? accountKey() : "");
watch(authenticatedAccountKey, (next, previous) => {
  if (next === previous) return;
  // Remote login hydrates the non-secret account routing key after the
  // authenticated page is already mounted. That one-way bootstrap is not an
  // account switch and must not invalidate an in-flight server calibration.
  if ((!previous || previous === "default") && next && next !== "default") return;
  activationBusy.value = false;
  accountEpoch += 1;
  requestGeneration += 1;
  calibrationFlow.reset();
  activationIntent = null;
  canonical.value = null;
  if (phase.value !== "intro") phase.value = "error";
  failedAction.value = "calibration";
});

// Copy swaps: recalibrate vs first-time onboarding.
const stepText = computed(() => (isRecal.value ? t.value.onboarding.recalStep : t.value.onboarding.step3of3));
const titleText = computed(() => phase.value === "error" ? failureTitle.value
  : loginCheckNeeded.value ? t.value.onboarding.phoneBindingCheckTitle
  : isRecal.value ? t.value.onboarding.recalTitle : t.value.onboarding.calibrationTitle);
const subText = computed(() => loginCheckNeeded.value ? t.value.onboarding.phoneBindingCheckBody
  : isRecal.value ? t.value.onboarding.recalSubtitle : t.value.onboarding.calibrationSubtitle);
const activateText = computed(() => (isRecal.value ? t.value.onboarding.recalActivate : t.value.onboarding.activatePhone));
const failureDetail = computed(() => canonical.value?.calibrationStatus === "PENDING_VERIFICATION"
  ? t.value.onboarding.phoneCalibrationPendingBody
  : failureCode.value === "PHONE_REPLACEMENT_DISABLED" ? t.value.onboarding.phoneReplacementDisabled
  : failureCode.value === "PHONE_REPLACEMENT_COOLDOWN" ? t.value.onboarding.phoneReplacementCooldown
  : failureCode.value === "PHONE_CALIBRATION_RULES_CHANGED" ? t.value.onboarding.phoneCalibrationRulesChanged
  : loginCheckNeeded.value ? t.value.onboarding.phoneBindingReadUnavailableBody
  : failedAction.value === "defer" ? t.value.onboarding.activationDeferFailed
  : failedAction.value === "calibration" ? t.value.onboarding.calibrationRetry
  : t.value.onboarding.activationBindRetry);
const failureTitle = computed(() => canonical.value?.calibrationStatus === "PENDING_VERIFICATION"
  ? t.value.onboarding.phoneCalibrationPendingTitle
  : loginCheckNeeded.value ? t.value.onboarding.phoneBindingReadUnavailableTitle
  : failedAction.value === "calibration"
  ? t.value.onboarding.calibrationFailedTitle
  : failedAction.value === "defer" ? t.value.onboarding.activationDeferFailedTitle
  : t.value.onboarding.activationFailedTitle);

// lucide paths
const ICON = {
  cpu: "M12 20v2M12 2v2M17 20v2M17 2v2M2 12h2M2 17h2M2 7h2M20 12h2M20 17h2M20 7h2M7 20v2M7 2v2",
  cpu2: "M4 4h16v16H4zM9 9h6v6H9z",
};

const whyPoints = computed(() => [
  { icon: ICON.cpu2, color: "var(--v5-brand)", text: t.value.onboarding.calibrationWhyLine1 },
]);

// Initial onboarding reuses the estimator's canonical result. Only an explicit
// warehouse remeasurement/resume can replace an existing calibration.
const calibrationFlow = createPhoneCalibrationFlow({ api: onboardingCalibrationApi,
  collect: collectDeviceSignals, key: () => `onboarding:${requireCryptoUuid()}` });
const nativePhoneAvailable = hasNativeAndroidPhoneRuntime();
const phoneActivationGuidance = computed(() => resolvePhoneActivationGuidance(nativePhoneAvailable, t.value.myDevices));
let activationIntent: { target: "ACTIVE" | "DEFERRED"; revision: number; idempotencyKey: string } | null = null;
const activationBusy = ref(false);

async function startCalibration() {
  if (!nativePhoneAvailable) return;
  failureCode.value = "";
  canonical.value = null;
  activationIntent = null;
  const requestScope = { ...currentScope(), generation: ++requestGeneration };
  try {
    if (loginCheckNeeded.value) {
      const status = await onboardingCalibrationApi.phoneLogin(getDeviceId());
      if (!scopeIsCurrent(requestScope)) return;
      if (status === "BOUND") {
        navReset({ url: "/pages/index/index", fail: () => {} });
        return;
      }
      if (status !== "NEEDS_CALIBRATION" && status !== "REPLACEMENT_REQUIRED") throw new Error(status);
      isRecal.value = status === "REPLACEMENT_REQUIRED";
      loginCheckNeeded.value = false;
      phase.value = "intro";
      return;
    }
    const result = await calibrationFlow.run({ deviceId: getDeviceId(), accountKey: accountKey(),
      isCurrent: () => scopeIsCurrent(requestScope), recalibrate: isRecal.value || resumeDeferred.value });
    if (!acceptCurrentCanonical(requestScope, result)) return;
    canonical.value = result;
    if (result.activationStatus === "DEFERRED") {
      resumeDeferred.value = true;
      phase.value = "intro";
      return;
    }
    if (!result.calibrationAvailable || result.calibrationStatus !== "MATCHED") {
      failedAction.value = "calibration";
      resumeDeferred.value = true;
      phase.value = "error";
      return;
    }
    phase.value = "result";
  } catch (cause) {
    if (!mounted || !isCurrentOnboardingCalibrationScope(requestScope, currentScope())) return;
    failureCode.value = cause instanceof Error ? cause.message : "";
    failedAction.value = "calibration";
    phase.value = "error";
  }
}

// The real API remains authoritative; animation only counts up to its confirmed score.
const scoreHexPath = "M110 20 L176 52 Q200 65 200 88 L200 132 Q200 155 176 168 L110 200 L44 168 Q20 155 20 132 L20 88 Q20 65 44 52 Z";
watch([phase, finalScore], ([next, score]) => {
  if (scoreTimer) clearInterval(scoreTimer);
  scoreTimer = null;
  shownScore.value = 0;
  if (next !== "result") return;
  const target = Math.max(0, score);
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    shownScore.value = target;
    return;
  }
  const start = Date.now();
  scoreTimer = setInterval(() => {
    const progress = Math.min(1, (Date.now() - start) / 900);
    shownScore.value = progress === 1 ? target : Math.round(progress * target);
    if (progress === 1 && scoreTimer) { clearInterval(scoreTimer); scoreTimer = null; }
  }, 30);
}, { immediate: true });
const policyLines = computed(() => [
  t.value.onboarding.policyLine1,
  t.value.onboarding.policyLine2,
  t.value.onboarding.policyLine3,
]);

// start calibration when entering that phase
watch(phase, (p) => {
  if (p === "calibrating") startCalibration();
});

function retryCalibration() {
  if (!nativePhoneAvailable || activationBusy.value) return;
  if (failureCode.value === "PHONE_CALIBRATION_RULES_CHANGED") {
    calibrationFlow.reset();
    resumeDeferred.value = true;
    phase.value = "calibrating";
    return;
  }
  if (failedAction.value === "activate") {
    if (!canonical.value?.calibrationAvailable) {
      resumeDeferred.value = true;
      phase.value = "intro";
      return;
    }
    void activate();
    return;
  }
  if (failedAction.value === "defer") {
    void deferPhoneActivation();
    return;
  }
  phase.value = "calibrating";
}

function activationCommand(target: "ACTIVE" | "DEFERRED", revision: number) {
  if (!activationIntent || activationIntent.target !== target || activationIntent.revision !== revision) {
    activationIntent = {
      target,
      revision,
      idempotencyKey: `phone-activation:${target.toLowerCase()}:${requireCryptoUuid()}`,
    };
  }
  return activationIntent;
}

function completeOnboardingLocally(): boolean {
  if (isRecal.value) return true;
  if (!auth.completeOnboarding()) return false;
  // The phone account directory is a local mock/cache concern. In remote mode
  // the authenticated backend transition is authoritative and must not be
  // downgraded to a visible activation failure when this optional cache is
  // unavailable (private browsing, storage quota, or native bridge failure).
  if (markAuthAccountOnboardingComplete(auth.email || auth.accountId || "default") || remoteApiEnabled) return true;
  if (!auth.requireOnboarding()) auth.signOut();
  return false;
}

async function activate() {
  if (!nativePhoneAvailable || !mounted || !canonical.value?.calibrationAvailable
      || canonical.value.calibrationStatus !== "MATCHED" || activationBusy.value) return;
  activationBusy.value = true;
  const requestScope = { ...currentScope() };
  const before = canonical.value;
  const command = activationCommand("ACTIVE", before.revision);
  const app = useApp();
  // Apply the server-confirmed baseline to the live phone device + record this
  // device as the account's calibrated device (so future logins on it skip
  // recalibration, while a different device triggers it).
  try {
    let activated: OnboardingCalibration;
    try {
      activated = await onboardingCalibrationApi.activate(before.deviceId, command.revision, command.idempotencyKey);
    } catch (cause) {
      if (!scopeIsCurrent(requestScope)) return;
      const readback = await onboardingCalibrationApi.result(before.deviceId);
      if (!acceptCurrentCanonical(requestScope, readback)) return;
      canonical.value = readback;
      if (!readback.calibrationAvailable || readback.activationStatus !== "ACTIVE") throw cause;
      activated = readback;
    }
    if (!acceptCurrentCanonical(requestScope, activated)) return;
    if (!activated.calibrationAvailable || activated.activationStatus !== "ACTIVE") throw new Error("PHONE_ACTIVATION_NOT_CONFIRMED");
    if (!useSession().markCalibrated(auth.email || auth.accountId || "default")
        || !completeOnboardingLocally()) {
      throw new Error("PHONE_ACTIVATION_LOCAL_COMMIT_FAILED");
    }
    canonical.value = activated;
    // Activation is already committed by the canonical endpoint. A secondary
    // fleet refresh must not turn that success into a false activation error;
    // App-level resilience owns refresh failure and the next page can retry it.
    void app.refreshRemoteFleet();
    if (isRecal.value) app.resumeMining();
    navReset({ url: "/pages/index/index", fail: () => {} });
  } catch (cause) {
    if (scopeIsCurrent(requestScope)) {
      failureCode.value = cause instanceof Error ? cause.message : "";
      failedAction.value = "activate";
      phase.value = "error";
    }
  } finally {
    if (scopeIsCurrent(requestScope)) activationBusy.value = false;
  }
}

async function deferPhoneActivation() {
  if (isLogin.value) { void navReset({ url: "/pages/index/index", fail: () => {} }); return; }
  if (!nativePhoneAvailable || !mounted || activationBusy.value) return;
  activationBusy.value = true;
  const requestScope = { ...currentScope() };
  try {
    const current = await confirmDeferredPhoneActivation({
      current: canonical.value, deviceId: getDeviceId(),
      command: (revision) => activationCommand("DEFERRED", revision),
      isCurrent: () => scopeIsCurrent(requestScope),
      accept: (result) => acceptCurrentCanonical(requestScope, result),
    });
    if (!scopeIsCurrent(requestScope)) return;
    if (current.activationStatus !== "DEFERRED") throw new Error("PHONE_DEFER_NOT_CONFIRMED");
    canonical.value = current;
    const app = useApp();
    const phone = app.devices.find((device) => device.kind === "phone");
    const localPhoneStateCommitted = (remoteApiEnabled || !phone || app.deactivateDevice(phone.id))
      && useSession().markPhoneActivationDeferred(auth.email || auth.accountId || "default");
    if (!localPhoneStateCommitted && !remoteApiEnabled) {
      throw new Error("PHONE_DEFER_LOCAL_COMMIT_FAILED");
    }
    if (!completeOnboardingLocally()) throw new Error("ONBOARDING_LOCAL_COMMIT_FAILED");
    uni.showToast({ title: t.value.onboarding.activationDeferredToast, icon: "none" });
    navReset({ url: isRecal.value ? "/pages/me/devices" : "/pages/index/index", fail: () => {} });
  } catch (cause) {
    if (scopeIsCurrent(requestScope)) {
      // A conflicting or uncertain write can leave the cached revision stale.
      // The next explicit retry must first read the latest server decision.
      canonical.value = null;
      failureCode.value = cause instanceof Error ? cause.message : "";
      failedAction.value = "defer";
      phase.value = "error";
    }
  } finally {
    if (scopeIsCurrent(requestScope)) activationBusy.value = false;
  }
}
function leaveConnect() {
  if (activationBusy.value || phase.value === "calibrating") return;
  requestGeneration += 1;
  // #ifdef H5
  navReset({ url: "/pages/index/index", fail: () => {} });
  // #endif
  // #ifndef H5
  navReset({ url: isLogin.value ? "/pages/index/index" : isRecal.value ? "/pages/me/devices" : "/pages/onboarding/estimator", fail: () => {} });
  // #endif
}

onLoad((options) => {
  // #ifdef H5
  navReset({ url: "/pages/register/success?download=1", fail: () => {} });
  return;
  // #endif
  const o = (options || {}) as Record<string, string>;
  isLogin.value = o.mode === "login";
  isRecal.value = o.mode === "recalibrate";
  resumeDeferred.value = o.mode === "resume";
  loginCheckNeeded.value = isLogin.value;
  phase.value = "intro";
});
onMounted(() => {
  if (nativePhoneAvailable && (isLogin.value || (!isRecal.value && !resumeDeferred.value))) phase.value = "calibrating";
});
onBackPress(() => { leaveConnect(); return true; });
onUnmounted(() => {
  mounted = false;
  if (scoreTimer) clearInterval(scoreTimer);
  requestGeneration += 1;
});
</script>

<style scoped>
.cn-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 24px 20px;
  background: var(--v5-bg);
  overflow-y: auto;
}
.cn-bars { min-height: 44px; display: flex; align-items: center; gap: 6px; margin-bottom: 20px; }
.cn-back { width: 44px; height: 44px; margin-left: -12px; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 9999px; }
.cn-bar { flex: 1; height: 4px; border-radius: 9999px; background: var(--v5-surface); overflow: hidden; }
.cn-bar__fill { height: 100%; width: 0; background: var(--v5-brand); }
.cn-bar__fill--full { width: 100%; }
.cn-step { display: block; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--v5-brand); }
.cn-title { display: block; font-family: var(--font-v5); margin-top: 4px; font-size: 20px; font-weight: 600; line-height: 1.25; color: var(--v5-ink); }
.cn-sub { display: block; margin-top: 4px; font-size: 13px; color: var(--v5-ink-3); }
.cn-phase { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; }

.cn-why { background: var(--v5-surface); border-radius: 16px; padding: 16px; }
.cn-why__h { display: block; font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--v5-brand); }
.cn-why__list { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.cn-point { display: flex; align-items: flex-start; gap: 10px; }
.cn-point__ic { width: 24px; height: 24px; border-radius: 6px; background: var(--v5-surface-2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
.cn-point__t { flex: 1; font-size: 13px; line-height: 1.375; color: var(--v5-ink); }

.cn-prog-row { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.cn-prog-row__t { font-size: 12px; color: var(--v5-ink-3); }
.cn-spin { animation: cn-spin 0.9s linear infinite; }
@keyframes cn-spin { to { transform: rotate(360deg); } }
.cn-test { border-radius: 12px; padding: 12px; background: var(--v5-surface); border: 1px solid var(--v5-border); }
.cn-test__top { display: flex; align-items: center; gap: 10px; }
.cn-test__ic { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cn-test__body { flex: 1; min-width: 0; }
.cn-test__title { display: block; font-size: 13px; font-weight: 600; color: var(--v5-ink); line-height: 1.25; }
.cn-test__metric { display: block; font-family: var(--font-jet-mono), ui-monospace, monospace; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--v5-ink-3); margin-top: 2px; }
.cn-test__track { margin-top: 10px; height: 4px; border-radius: 9999px; background: var(--v5-surface-2); overflow: hidden; }
.cn-test__fill { height: 100%; border-radius: 9999px; transition: width 0.15s linear; }

.cn-score { position: relative; overflow: hidden; border-radius: 16px; padding: 20px; text-align: center; background: radial-gradient(70% 80% at 50% 0%, color-mix(in oklab, var(--v5-brand) 18%, transparent) 0%, transparent 60%), var(--v5-surface); border: 1px solid var(--v5-border); box-shadow: var(--v5-card-shadow-lift-strong); }
.cn-score__cap { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--v5-brand); }
.cn-score__cap-t { font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; letter-spacing: 0.18em; color: var(--v5-brand); }
.cn-score__num { margin-top: 12px; display: flex; align-items: baseline; justify-content: center; gap: 4px; }
.cn-score__v { font-family: var(--font-v5); font-variant-numeric: tabular-nums; line-height: 1; letter-spacing: -0.025em; color: var(--v5-brand); font-size: 56px; font-weight: 600; }
.cn-score__d { font-family: var(--font-v5); font-variant-numeric: tabular-nums; color: var(--v5-ink-3); font-size: 20px; font-weight: 500; }
.cn-score__tier { display: block; margin-top: 8px; font-size: 13px; font-weight: 600; color: var(--v5-ink); }
.cn-score__yield { margin: 12px auto 0; display: inline-flex; align-items: baseline; gap: 8px; padding: 6px 12px; border-radius: 9999px; background: color-mix(in oklab, var(--v5-brand) 14%, transparent); }
.cn-score__yield-cap { font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--v5-brand); }
.cn-score__yield-v { font-family: var(--font-v5); font-variant-numeric: tabular-nums; color: var(--v5-brand); font-size: 15px; font-weight: 600; }

.cn-summary { border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 8px; background: var(--v5-surface); }
.cn-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.cn-row__check { width: 24px; height: 24px; border-radius: 6px; background: color-mix(in oklab, var(--v5-brand) 14%, transparent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cn-row__label { color: var(--v5-ink-3); }
.cn-row__val { margin-left: auto; font-family: var(--font-jet-mono), ui-monospace, monospace; font-variant-numeric: tabular-nums; color: var(--v5-ink); font-weight: 600; }

.cn-policy { border-radius: 16px; padding: 14px; background: color-mix(in oklab, var(--v5-warning) 8%, transparent); border: 1px solid color-mix(in oklab, var(--v5-warning) 22%, transparent); }
.cn-policy__cap { display: flex; align-items: center; gap: 6px; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--v5-warning); }
.cn-policy__cap-t { font-family: var(--font-jet-mono), ui-monospace, monospace; font-size: 12px; letter-spacing: 0.16em; color: var(--v5-warning); }
.cn-policy__list { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.cn-policy__line { display: flex; align-items: flex-start; gap: 6px; }
.cn-policy__dot { flex-shrink: 0; margin-top: 6px; width: 4px; height: 4px; border-radius: 9999px; background: color-mix(in oklab, var(--v5-warning) 55%, transparent); }
.cn-policy__t { flex: 1; font-size: 12px; line-height: 1.375; color: var(--v5-ink-2); }
.cn-policy__t--spaced { display: block; margin-top: 8px; }

.cn-cta { margin-top: auto; padding-top: 24px; }
.cn-go { width: 100%; height: 48px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--v5-brand); transition: transform 0.15s ease; }
.cn-go--glow { box-shadow: 0 0 24px color-mix(in oklab, var(--v5-brand) 35%, transparent); }
.cn-go__t { font-size: 15px; font-weight: 600; color: var(--v5-on-brand); }
.cn-go__t--on { font-size: 15px; }
.cn-error-actions { display: flex; flex-direction: column; gap: 10px; }
.cn-go--secondary { background: var(--v5-surface); }
.cn-go__t--secondary { color: var(--v5-ink); }

.anim-up { animation: cn-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes cn-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.cn-score--hex { --score-size: clamp(184px, 32vh, 306px); width: 100%; height: var(--score-size); box-sizing: border-box; display: grid; place-items: center; border: 0; background: transparent; box-shadow: none; padding: 0; overflow: visible; isolation: isolate; }
.cn-score__aurora { grid-area: 1 / 1; width: min(70vw, 220px); height: min(70vw, 220px); border-radius: 50%; background: radial-gradient(circle, color-mix(in oklab, var(--v5-brand) 42%, transparent), transparent 64%); filter: blur(24px); animation: cn-aurora 5s ease-in-out infinite alternate; }
.cn-score__hex { grid-area: 1 / 1; width: calc(var(--score-size) - 16px); height: calc(var(--score-size) - 16px); animation: cn-hex-breathe 7s ease-in-out infinite; }
.cn-score__ring { fill: none; stroke-linejoin: round; }
.cn-score__ring--halo { stroke: color-mix(in oklab, var(--v5-brand) 18%, transparent); stroke-width: 8; }
.cn-score__ring--edge { stroke: var(--v5-brand); stroke-width: 3.4; filter: drop-shadow(0 0 9px color-mix(in oklab, var(--v5-brand) 48%, transparent)); }
.cn-score--hex .cn-score__num { grid-area: 1 / 1; z-index: 1; margin: 0; }
.cn-policy-float { position: fixed; right: 20px; bottom: calc(env(safe-area-inset-bottom, 0px) + 38px); z-index: 20; }
.cn-policy-float__button { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; color: var(--v5-ink-2); background: var(--v5-surface); }
.cn-policy-float__list { position: absolute; right: 0; bottom: 54px; width: min(280px, calc(100vw - 40px)); box-sizing: border-box; padding: 16px; border-radius: 14px; background: var(--v5-surface-2); display: flex; flex-direction: column; gap: 8px; }
.cn-policy-float__title { color: var(--v5-ink); font-size: 12px; font-weight: 600; }
@keyframes cn-aurora { from { transform: scale(.95); opacity: .7; } to { transform: scale(1.08); opacity: 1; } }
@keyframes cn-hex-breathe { 0%, 100% { transform: scale(.97) rotate(0deg); } 50% { transform: scale(1.03) rotate(3deg); } }
@media (prefers-reduced-motion: reduce) { .cn-score__aurora, .cn-score__hex { animation: none; } }
</style>
