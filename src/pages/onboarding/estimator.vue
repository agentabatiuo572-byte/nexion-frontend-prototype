<template>
  <StandalonePageShell class="est-root" :top-inset="24">
    <!-- Progress -->
    <view class="est-bars">
      <view class="est-back active:opacity-60" role="button" :tabindex="deferBusy ? -1 : 0" :aria-disabled="deferBusy" :aria-label="t.login.back" @click="leaveEstimator" @keydown.enter.prevent="leaveEstimator" @keydown.space.prevent="leaveEstimator">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>
      <view class="est-bar"><view class="est-bar__fill est-bar__fill--full" /></view>
      <view class="est-bar"><view class="est-bar__fill est-bar__fill--full" /></view>
      <view class="est-bar"><view class="est-bar__fill" /></view>
    </view>

    <view>
      <text class="est-step">{{ t.onboarding.step2of3 }}</text>
      <text class="est-title">{{ nativePhoneAvailable ? t.onboarding.estimatorTitleH : phoneActivationGuidance.title }}</text>
      <text class="est-hint">{{ nativePhoneAvailable ? (deferFailed ? t.onboarding.activationDeferFailedTitle : deferred ? t.onboarding.activationDeferredHint : loadFailed ? t.onboarding.calibrationFailedTitle : (detected ? t.onboarding.estimatorHint : t.onboarding.detecting)) : phoneActivationGuidance.body }}</text>
    </view>

    <!-- Device reveal: loading → phone card -->
    <view v-if="nativePhoneAvailable" class="est-reveal">
      <transition name="est-fade" mode="out-in">
        <view v-if="loadFailed || deferred" key="failed" class="est-loading est-loading--failed">
          <text class="est-loading__t">{{ deferFailed ? t.onboarding.activationDeferFailedTitle : deferred ? t.onboarding.activationDefer : calibration?.calibrationStatus === 'PENDING_VERIFICATION' ? t.onboarding.phoneCalibrationPendingTitle : t.onboarding.calibrationFailedTitle }}</text>
          <text v-if="loadFailed" class="est-failed__hint">{{ failureDetail }}</text>
          <text v-if="!deferFailed" class="est-failed__hint">{{ t.onboarding.activationDeferredHint }}</text>
          <text class="est-failed__hint">{{ t.onboarding.activationRewardGate }}</text>
          <view class="est-failed__actions">
            <view class="est-failed__button est-failed__button--primary" role="button" :tabindex="deferBusy ? -1 : 0" :aria-disabled="deferBusy"
              @click="retryCalibration" @keydown.enter.prevent="retryCalibration" @keydown.space.prevent="retryCalibration">
              <text>{{ deferred ? t.onboarding.calibrationStart : t.onboarding.activationRetry }}</text>
            </view>
            <view v-if="!deferFailed" class="est-failed__button" role="button" :tabindex="deferBusy ? -1 : 0" :aria-disabled="deferBusy"
              @click="deferPhoneActivation" @keydown.enter.prevent="deferPhoneActivation" @keydown.space.prevent="deferPhoneActivation">
              <text>{{ t.onboarding.activationDefer }}</text>
            </view>
          </view>
        </view>
        <view v-else-if="!detected" key="loading" class="est-loading">
          <svg class="est-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <text class="est-loading__t">{{ t.onboarding.detecting }}</text>
        </view>
        <view v-else key="reveal" class="est-phone anim-up">
          <view class="est-phone__pill">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            <text class="est-phone__pill-t">{{ t.onboarding.detected }}</text>
          </view>
          <view class="est-phone__icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" />
            </svg>
          </view>
          <view class="est-phone__body">
            <text class="est-phone__name">{{ t.onboarding.yourPhone }}</text>
            <text class="est-phone__spec">{{ calibration?.computeValue }} {{ t.onboarding.phoneComputeUnit }} · {{ calibration?.tierName }}</text>
          </view>
          <view class="est-phone__rate">
            <text class="est-phone__rate-v">{{ phoneRateLabel }}</text>
            <text class="est-phone__rate-u">{{ t.onboarding.perDay }}</text>
          </view>
        </view>
      </transition>
    </view>

    <!-- Upgrade comparison -->
    <view v-if="detected && (s1 || pro)" class="est-compare anim-up-delay">
      <text class="est-compare__h">{{ t.onboarding.unlockMore }}</text>
      <view v-if="s1" class="cmp">
        <view class="cmp__icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
        </view>
        <view class="cmp__body">
          <text class="cmp__label">{{ s1?.label ?? t.onboarding.withS1 }}</text>
          <text class="cmp__sub">{{ multS1Label }} {{ t.onboarding.yourCurrentRate }}</text>
        </view>
        <text class="cmp__val">{{ s1Label }}{{ t.onboarding.perDay }}</text>
      </view>
      <view v-if="pro" class="cmp">
        <view class="cmp__icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" /></svg>
        </view>
        <view class="cmp__body">
          <text class="cmp__label">{{ pro?.label ?? t.onboarding.withPro }}</text>
          <text class="cmp__sub">{{ proMonthlyLabel }}{{ t.onboarding.perMonth }}</text>
        </view>
        <text class="cmp__val">{{ proLabel }}{{ t.onboarding.perDay }}</text>
      </view>
    </view>

    <!-- CTA -->
    <view class="est-cta">
      <view v-if="!nativePhoneAvailable" class="est-go est-go--on active:scale-[0.98]" role="button" tabindex="0" data-system-chrome-primary @click="leaveEstimator" @keydown.enter.prevent="leaveEstimator" @keydown.space.prevent="leaveEstimator">
        <text class="est-go__t">{{ t.login.back }}</text>
      </view>
      <view v-else class="est-go" :class="{ 'est-go--on': detected, 'active:scale-[0.98]': detected }" role="button" :tabindex="detected ? 0 : -1" :aria-disabled="!detected" data-system-chrome-primary @click="goConnect" @keydown.enter.prevent="goConnect" @keydown.space.prevent="goConnect">
        <text class="est-go__t">{{ t.onboarding.startEarning }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="detected ? 'var(--v5-on-brand)' : 'var(--v5-ink-4)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
    </view>
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { navReset } from "@/lib/route";
import { onBackPress, onLoad } from "@dcloudio/uni-app";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import { useT } from "@/i18n/use-t";
import { getDeviceId } from "@/lib/device-id";
import { hasNativeAndroidPhoneRuntime } from "@/lib/native-phone-runtime";
import { resolvePhoneActivationGuidance } from "@/lib/phone-activation-guidance";
import { onboardingCalibrationApi, remoteApiEnabled } from "@/api/runtime";
import type { OnboardingCalibration } from "@/api/onboarding-calibration-api";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { useSession } from "@/store/session";
import { markAuthAccountOnboardingComplete } from "@/store/auth-account";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import type { RemoteAccountRequest } from "@/lib/remote-account-epoch";
import { createEstimatorScope, isCurrentEstimatorScope, type EstimatorScope } from "@/lib/estimator-scope";
import { requireCryptoUuid } from "@/lib/secure-command-id";
import { confirmDeferredPhoneActivation } from "@/lib/defer-phone-activation";
import { collectDeviceSignals } from "@/lib/device-signals";
import { calibrationBelongsTo, createPhoneCalibrationFlow } from "@/lib/phone-calibration-flow";

const t = useT();
const app = useApp();
const auth = useAuth();
const detected = ref(false);
const loadFailed = ref(false);
const deferFailed = ref(false);
const deferred = ref(false);
const loading = ref(false);
const deferBusy = ref(false);
const calibration = ref<OnboardingCalibration | null>(null);
const failureDetail = computed(() => calibration.value?.calibrationStatus === "PENDING_VERIFICATION"
  ? t.value.onboarding.phoneCalibrationPendingBody
  : deferFailed.value ? t.value.onboarding.activationDeferFailed : t.value.onboarding.calibrationRetry);
const comparison = (key: string) => computed(() => calibration.value?.comparisonConfig.find((item) => item.key === key) ?? null);
const phone = comparison("phone");
const s1 = comparison("s1");
const pro = comparison("pro");
const phoneRate = computed(() => calibration.value?.baseRateUsdt ?? phone.value?.dailyUsdt ?? null);
const phoneRateLabel = computed(() => phoneRate.value === null ? "—" : `~$${phoneRate.value.toFixed(2)}`);
const s1Label = computed(() => s1.value ? `$${s1.value.dailyUsdt.toFixed(2)}` : "—");
const proLabel = computed(() => pro.value ? `$${pro.value.dailyUsdt.toFixed(2)}` : "—");
const proMonthlyLabel = computed(() => pro.value ? `~$${(pro.value.dailyUsdt * 30).toFixed(0)}` : "—");
const multS1Label = computed(() => phoneRate.value && s1.value ? `${Math.round(s1.value.dailyUsdt / phoneRate.value)}×` : "—");

let timer: ReturnType<typeof setTimeout> | undefined;
let mounted = false;
let accountEpoch = 0;
let generation = 0;
let accountWatchKey = String(app.accountKey || "");
let deferIntent: { revision: number; idempotencyKey: string } | null = null;
const calibrationFlow = createPhoneCalibrationFlow({ api: onboardingCalibrationApi,
  collect: collectDeviceSignals, key: () => `onboarding:${requireCryptoUuid()}` });
const nativePhoneAvailable = hasNativeAndroidPhoneRuntime();
const phoneActivationGuidance = computed(() => resolvePhoneActivationGuidance(nativePhoneAvailable, t.value.myDevices));

function scopePair(): { estimator: EstimatorScope; remote: RemoteAccountRequest } {
  return {
    estimator: createEstimatorScope(String(app.accountKey || ""), accountEpoch, generation),
    remote: captureAccountScope(),
  };
}

function isCurrent(scope: { estimator: EstimatorScope; remote: RemoteAccountRequest }): boolean {
  return mounted && isCurrentEstimatorScope(scope.estimator, createEstimatorScope(String(app.accountKey || ""), accountEpoch, generation))
    && isCurrentAccountScope(scope.remote);
}

function loadCalibration(recalibrate = false) {
  if (!nativePhoneAvailable) return;
  const scope = scopePair();
  loadFailed.value = false;
  deferFailed.value = false;
  deferred.value = false;
  loading.value = true;
  void Promise.resolve().then(() => calibrationFlow.run({ deviceId: getDeviceId(), accountKey: auth.accountId,
    isCurrent: () => isCurrent(scope) && auth.isAuthenticated,
    recalibrate,
  })).then((result) => {
    if (!isCurrent(scope)) return;
    if (result.activationStatus === "DEFERRED") {
      calibration.value = result;
      detected.value = false;
      deferred.value = true;
      return;
    }
    if (!result.calibrationAvailable || result.calibrationStatus !== "MATCHED" || (result.activationStatus !== "CALIBRATED" && result.activationStatus !== "ACTIVE")) {
      calibration.value = result;
      detected.value = false;
      loadFailed.value = true;
      return;
    }
    calibration.value = result;
    scheduleReveal();
  }).catch(() => {
    if (!mounted || !isCurrentEstimatorScope(scope.estimator,
      createEstimatorScope(String(app.accountKey || ""), accountEpoch, generation))) return;
    calibration.value = null;
    detected.value = false;
    loadFailed.value = true;
  }).finally(() => {
    if (mounted && isCurrentEstimatorScope(scope.estimator,
      createEstimatorScope(String(app.accountKey || ""), accountEpoch, generation))) loading.value = false;
  });
}

function retryCalibration() {
  if (deferBusy.value) return;
  if (!nativePhoneAvailable) return;
  if (loading.value) return;
  if (deferFailed.value) { void deferPhoneActivation(); return; }
  if (deferred.value) {
    navReset({ url: "/pages/onboarding/connect?mode=resume", fail: () => {} });
    return;
  }
  generation += 1;
  if (timer) clearTimeout(timer);
  const needsCalibration = calibration.value !== null && calibration.value.calibrationStatus !== "MATCHED";
  detected.value = false;
  calibration.value = null;
  calibrationFlow.reset();
  loadCalibration(needsCalibration);
}

function scheduleReveal() {
  if (timer) clearTimeout(timer);
  const scope = scopePair();
  timer = setTimeout(() => {
    if (isCurrent(scope)) detected.value = true;
  }, 1200);
}

watch(() => String(app.accountKey || ""), (next) => {
  if (next === accountWatchKey) return;
  accountWatchKey = next;
  accountEpoch += 1;
  generation += 1;
  deferBusy.value = false;
  deferIntent = null;
  calibrationFlow.reset();
  detected.value = false;
  loadFailed.value = false;
  deferFailed.value = false;
  deferred.value = false;
  calibration.value = null;
  loadCalibration();
});

onLoad(() => {
  // #ifdef H5
  navReset({ url: "/pages/register/success?download=1", fail: () => {} });
  // #endif
});
onMounted(() => {
  mounted = true;
  loadCalibration();
});
onUnmounted(() => {
  if (timer) clearTimeout(timer);
  mounted = false;
  generation += 1;
});

onBackPress(() => {
  if (!mounted || deferBusy.value) return true;
  leaveEstimator();
  return true;
});

function goConnect() {
  if (!nativePhoneAvailable || !detected.value || !calibration.value?.calibrationAvailable) return;
  navReset({ url: "/pages/onboarding/connect", fail: () => {} });
}

function completeOnboardingLocally(): boolean {
  if (!auth.completeOnboarding()) return false;
  if (markAuthAccountOnboardingComplete(auth.email || auth.accountId || "default") || remoteApiEnabled) return true;
  if (!auth.requireOnboarding()) auth.signOut();
  return false;
}

function leaveEstimator() {
  if (!mounted || deferBusy.value) return;
  generation += 1;
  // #ifdef H5
  navReset({ url: "/pages/index/index", fail: () => {} });
  // #endif
  // #ifndef H5
  navReset({ url: "/pages/onboarding/intro", fail: () => {} });
  // #endif
}

async function deferPhoneActivation() {
  if (!nativePhoneAvailable || !mounted || deferBusy.value || loading.value) return;
  deferBusy.value = true;
  const scope = scopePair();
  const deviceId = getDeviceId();
  try {
    const deferred = await confirmDeferredPhoneActivation({
      current: calibration.value,
      deviceId,
      command: (revision) => {
        if (!deferIntent || deferIntent.revision !== revision) {
          deferIntent = {
            revision,
            idempotencyKey: `phone-activation:deferred:${requireCryptoUuid()}`,
          };
        }
        return deferIntent;
      },
      isCurrent: () => isCurrent(scope),
      accept: (result) => isCurrent(scope) && calibrationBelongsTo(result, auth.accountId, deviceId),
    });
    if (!isCurrent(scope) || deferred.activationStatus !== "DEFERRED") return;

    calibration.value = deferred;
    const phoneDevice = app.devices.find((device) => device.kind === "phone");
    const localPhoneStateCommitted = (remoteApiEnabled || !phoneDevice || app.deactivateDevice(phoneDevice.id))
      && useSession().markPhoneActivationDeferred(auth.email || auth.accountId || "default");
    if (!localPhoneStateCommitted && !remoteApiEnabled) throw new Error("PHONE_DEFER_LOCAL_COMMIT_FAILED");
    if (!completeOnboardingLocally()) throw new Error("ONBOARDING_LOCAL_COMMIT_FAILED");

    uni.showToast({ title: t.value.onboarding.activationDeferredToast, icon: "none" });
    navReset({ url: "/pages/index/index", fail: () => {} });
  } catch {
    if (isCurrent(scope)) {
      calibration.value = null;
      deferFailed.value = true;
      loadFailed.value = true;
      uni.showToast({ title: t.value.onboarding.activationDeferFailed, icon: "none" });
    }
  } finally {
    if (isCurrent(scope)) deferBusy.value = false;
  }
}
</script>

<style scoped>
.est-root {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 24px 20px;
  background: var(--v5-bg);
  overflow-y: auto;
}
.est-bars {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 20px;
  min-height: 44px;
}
.est-back { width: 44px; height: 44px; margin-left: -12px; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 9999px; }
.est-bar {
  flex: 1;
  height: 4px;
  border-radius: 9999px;
  background: var(--v5-surface);
  overflow: hidden;
}
.est-bar__fill {
  height: 100%;
  width: 0;
  background: var(--v5-brand);
  transition: width 0.5s;
}
.est-bar__fill--full {
  width: 100%;
}
.est-step {
  display: block;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--v5-brand);
}
.est-title {
  display: block;
  font-family: var(--font-v5);
  margin-top: 4px;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--v5-ink);
}
.est-hint {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: var(--v5-ink-3);
}
.est-reveal {
  margin-top: 20px;
}
.est-loading {
  height: 88px;
  background: var(--v5-surface);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.est-spin {
  animation: est-spin 0.9s linear infinite;
}
@keyframes est-spin {
  to { transform: rotate(360deg); }
}
.est-loading__t {
  font-size: 13px;
  color: var(--v5-ink-3);
}
.est-loading--failed {
  height: auto;
  min-height: 150px;
  padding: 16px;
  flex-direction: column;
  align-items: stretch;
}
.est-failed__hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--v5-ink-3);
}
.est-failed__actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
.est-failed__button {
  flex: 1;
  min-height: 42px;
  border: 1px solid var(--v5-line);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--v5-ink);
  font-size: 13px;
  font-weight: 600;
}
.est-failed__button--primary {
  border-color: var(--v5-brand);
  background: var(--v5-brand);
  color: var(--v5-on-brand);
}
.est-phone {
  position: relative;
  background: linear-gradient(135deg, color-mix(in oklab, var(--v5-brand) 12%, transparent), var(--v5-surface) 60%);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 0 24px -4px rgba(198, 255, 58, 0.35);
}
.est-phone__pill {
  position: absolute;
  top: -10px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--v5-brand);
}
.est-phone__pill-t {
  font-size: 12px;
  font-weight: 600;
  color: var(--v5-on-brand);
}
.est-phone__icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: color-mix(in oklab, var(--v5-brand) 25%, transparent);
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--v5-brand) 40%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.est-phone__body {
  flex: 1;
  min-width: 0;
}
.est-phone__name {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
}
.est-phone__spec {
  display: block;
  font-size: 12px;
  color: color-mix(in oklab, var(--v5-brand) 90%, transparent);
  margin-top: 2px;
}
.est-phone__rate {
  text-align: right;
  flex-shrink: 0;
}
.est-phone__rate-v {
  display: block;
  font-family: var(--font-v5);
  font-variant-numeric: tabular-nums;
  font-size: 20px;
  font-weight: 600;
  color: var(--v5-brand);
}
.est-phone__rate-u {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-4);
}
.est-compare {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.est-compare__h {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--v5-ink-3);
  padding: 0 4px;
}
.cmp {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 12px;
  padding: 12px 16px;
  background: var(--v5-surface);
}
.cmp__icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  /* 原 --v5-surface 与外层 .cmp 同色 → 图标框隐形(双主题)。surface-3 = 内凹 inset 语义。 */
  background: var(--v5-surface-3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cmp__body {
  flex: 1;
  min-width: 0;
}
.cmp__label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--v5-ink);
}
.cmp__sub {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-3);
  margin-top: 2px;
}
.cmp__val {
  font-family: var(--font-v5);
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--v5-ink);
}
.est-cta {
  position: sticky;
  bottom: 0;
  z-index: 3;
  margin-top: auto;
  padding-top: 24px;
  margin-right: 4px;
  margin-left: 4px;
  background: linear-gradient(to bottom, transparent, var(--v5-bg) 24px);
}
.est-go {
  width: 100%;
  height: 48px;
  border-radius: 9999px;
  background: var(--v5-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.15s ease, background 0.3s ease;
}
.est-go--on {
  background: var(--v5-brand);
}
.est-go__t {
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink-4);
}
.est-go--on .est-go__t {
  color: var(--v5-on-brand);
}

/* entrance */
.anim-up {
  animation: est-up 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.anim-up-delay {
  animation: est-up 0.32s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
}
@keyframes est-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.est-fade-enter-active,
.est-fade-leave-active {
  transition: opacity 0.25s;
}
.est-fade-enter-from,
.est-fade-leave-to {
  opacity: 0;
}
</style>
