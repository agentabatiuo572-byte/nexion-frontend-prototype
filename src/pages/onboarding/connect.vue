<template>
  <StandalonePageShell class="cn-root" :top-inset="24">
    <!-- Progress (3/3 full) -->
    <view class="cn-bars">
      <view class="cn-back active:opacity-60" role="button" tabindex="0" :aria-label="t.login.back" @click="leaveConnect" @keydown.enter.prevent="leaveConnect" @keydown.space.prevent="leaveConnect">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </view>
      <view class="cn-bar"><view class="cn-bar__fill cn-bar__fill--full" /></view>
      <view class="cn-bar"><view class="cn-bar__fill cn-bar__fill--full" /></view>
      <view class="cn-bar"><view class="cn-bar__fill cn-bar__fill--full" /></view>
    </view>

    <view>
      <text class="cn-step">{{ stepText }}</text>
      <text class="cn-title">{{ titleText }}</text>
      <text class="cn-sub">{{ subText }}</text>
    </view>

    <transition name="cn-fade" mode="out-in">
      <!-- Phase: intro -->
      <view v-if="phase === 'intro'" key="intro" class="cn-phase">
        <view class="cn-why">
          <text class="cn-why__h">{{ t.onboarding.calibrationWhyTitle }}</text>
          <view class="cn-why__list">
            <view v-for="(p, i) in whyPoints" :key="i" class="cn-point">
              <view class="cn-point__ic">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="p.color" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="p.icon" /><path v-if="p.icon2" :d="p.icon2" /></svg>
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
          <text class="cn-prog-row__t">{{ progressText }}</text>
        </view>
        <view v-for="(tc, i) in testCards" :key="i" class="cn-test">
          <view class="cn-test__top">
            <view class="cn-test__ic" :style="{ background: mix(tc.accent, 14), color: tc.accent }">
              <svg v-if="tc.progress < 1" width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="tc.accent" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="tc.icon" /><path v-if="tc.icon2" :d="tc.icon2" /></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="tc.accent" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </view>
            <view class="cn-test__body">
              <text class="cn-test__title">{{ tc.title }}</text>
              <text class="cn-test__metric">{{ tc.metric }}</text>
            </view>
          </view>
          <view class="cn-test__track">
            <view class="cn-test__fill" :style="{ width: (tc.progress * 100) + '%', background: tc.accent }" />
          </view>
        </view>
      </view>

      <!-- Phase: result -->
      <view v-else key="result" class="cn-phase anim-up">
        <view class="cn-score">
          <view class="cn-score__cap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
            <text class="cn-score__cap-t">{{ t.onboarding.resultTitle }}</text>
          </view>
          <view class="cn-score__num">
            <text class="cn-score__v">{{ shownScore }}</text>
            <text class="cn-score__d">/100</text>
          </view>
          <text class="cn-score__tier">{{ tierLabel }}</text>
          <view class="cn-score__yield">
            <text class="cn-score__yield-cap">{{ t.onboarding.resultEstYield }}</text>
            <text class="cn-score__yield-v">${{ FINAL_YIELD.toFixed(2) }}/d</text>
          </view>
        </view>

        <view class="cn-summary">
          <view v-for="(r, i) in resultRows" :key="i" class="cn-row">
            <view class="cn-row__check">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </view>
            <text class="cn-row__label">{{ r.label }}</text>
            <text class="cn-row__val">{{ r.value }}</text>
          </view>
        </view>

        <view class="cn-policy">
          <view class="cn-policy__cap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
            <text class="cn-policy__cap-t">{{ t.onboarding.policyTitle }}</text>
          </view>
          <view class="cn-policy__list">
            <view v-for="(l, i) in policyLines" :key="i" class="cn-policy__line">
              <view class="cn-policy__dot" />
              <text class="cn-policy__t">{{ l }}</text>
            </view>
          </view>
        </view>
      </view>
    </transition>

    <view class="cn-cta">
      <view v-if="phase === 'result'" class="cn-go cn-go--on active:scale-[0.98]" role="button" tabindex="0" data-system-chrome-primary @click="activate" @keydown.enter.prevent="activate" @keydown.space.prevent="activate">
        <text class="cn-go__t cn-go__t--on">{{ activateText }}</text>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
    </view>
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import StandalonePageShell from "@/components/device/standalone-page-shell.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useAuth } from "@/store/auth";
import { useApp } from "@/store/app";
import { useSession } from "@/store/session";
import { markAuthAccountOnboardingComplete } from "@/store/auth-account";
import { measureDeviceCapability } from "@/lib/device-capability";
import { getDeviceId } from "@/lib/device-id";

const t = useT();
const auth = useAuth();

// Recalibrate mode (?mode=recalibrate) = new-device re-measure; otherwise the
// first-time onboarding calibration. Set in onLoad.
const isRecal = ref(false);

type Phase = "intro" | "calibrating" | "result";
const phase = ref<Phase>("intro");

const CALIBRATION_MS = 12_000;
// Capability finals are DETERMINISTICALLY derived from this device's real
// signals (not hardcoded) — so the displayed TOPS/score/tier/yield are
// plausible, reproducible, and monotonic with real device class.
const cap = measureDeviceCapability(getDeviceId());
const FINAL_TOPS = cap.tops;
const FINAL_SCORE = cap.score;
const FINAL_TIER = cap.tier;
const FINAL_YIELD = cap.baseRateUsdt;
// Network + battery rows stay cosmetic ritual theater (not part of the
// hardware-class capability score).
const FINAL_PING = { sg: 38, tk: 42, us: 156 };
const FINAL_BATTERY = 78;

// Copy swaps: recalibrate vs first-time onboarding.
const stepText = computed(() => (isRecal.value ? t.value.onboarding.recalStep : t.value.onboarding.step3of3));
const titleText = computed(() => (isRecal.value ? t.value.onboarding.recalTitle : t.value.onboarding.calibrationTitle));
const subText = computed(() => (isRecal.value ? t.value.onboarding.recalSubtitle : t.value.onboarding.calibrationSubtitle));
const activateText = computed(() => (isRecal.value ? t.value.onboarding.recalActivate : t.value.onboarding.activatePhone));

// lucide paths
const ICON = {
  cpu: "M12 20v2M12 2v2M17 20v2M17 2v2M2 12h2M2 17h2M2 7h2M20 12h2M20 17h2M20 7h2M7 20v2M7 2v2",
  cpu2: "M4 4h16v16H4zM9 9h6v6H9z",
  globe: "M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  globe2: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
  battery: "M7 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7M11 7l-4 5h4l-4 5",
};

const whyPoints = computed(() => [
  { icon: ICON.cpu2, color: "var(--v5-brand)", text: t.value.onboarding.calibrationWhyLine1 },
  { icon: ICON.globe2, icon2: ICON.globe, color: "var(--v5-tech-cyan)", text: t.value.onboarding.calibrationWhyLine2 },
  { icon: ICON.battery, color: "var(--v5-warning)", text: t.value.onboarding.calibrationWhyLine3 },
]);

// ── calibrating tickers ──
const progress = ref(0);
const tops = ref(0);
const ping = ref({ sg: 0, tk: 0, us: 0 });
const battery = ref(0);
let calInterval: ReturnType<typeof setInterval> | undefined;
let calTimeout: ReturnType<typeof setTimeout> | undefined;

function startCalibration() {
  const start = Date.now();
  calInterval = setInterval(() => {
    const p = Math.min(1, (Date.now() - start) / CALIBRATION_MS);
    progress.value = p;
    const npuP = Math.min(1, p / 0.45);
    tops.value = +(npuP * FINAL_TOPS + (npuP < 1 ? (Math.random() - 0.5) * 2 : 0)).toFixed(1);
    if (p > 0.3) {
      const netP = Math.min(1, (p - 0.3) / 0.5);
      ping.value = {
        sg: Math.round(netP * FINAL_PING.sg + (netP < 1 ? Math.random() * 12 : 0)),
        tk: Math.round(netP * FINAL_PING.tk + (netP < 1 ? Math.random() * 10 : 0)),
        us: Math.round(netP * FINAL_PING.us + (netP < 1 ? Math.random() * 18 : 0)),
      };
    }
    if (p > 0.55) {
      battery.value = Math.round(Math.min(1, (p - 0.55) / 0.3) * FINAL_BATTERY);
    }
  }, 100);
  calTimeout = setTimeout(() => {
    if (calInterval) clearInterval(calInterval);
    progress.value = 1;
    startResult();
    phase.value = "result";
  }, CALIBRATION_MS);
}

const progressText = computed(() =>
  fmt(t.value.onboarding.calibrationProgress, {
    n: Math.max(0, Math.ceil((1 - progress.value) * (CALIBRATION_MS / 1000))),
  })
);

const testCards = computed(() => {
  const npuP = Math.min(1, progress.value / 0.45);
  const netP = Math.min(1, Math.max(0, (progress.value - 0.3) / 0.5));
  const pwP = Math.min(1, Math.max(0, (progress.value - 0.55) / 0.3));
  return [
    { icon: ICON.cpu, title: t.value.onboarding.testNpu, metric: fmt(t.value.onboarding.testComputeMetric, { n: tops.value.toFixed(1) }), progress: npuP, accent: "var(--v5-brand)" },
    { icon: ICON.globe2, icon2: ICON.globe, title: t.value.onboarding.testNetwork, metric: fmt(t.value.onboarding.testNetworkPing, ping.value), progress: netP, accent: "var(--v5-tech-cyan)" },
    { icon: ICON.battery, title: t.value.onboarding.testPower, metric: fmt(t.value.onboarding.testPowerOK, { n: battery.value }), progress: pwP, accent: "var(--v5-warning)" },
  ];
});

// ── result score tick ──
const shownScore = ref(0);
let raf = 0;
function startResult() {
  const start = Date.now();
  const tick = () => {
    const p = Math.min(1, (Date.now() - start) / 900);
    shownScore.value = Math.round(p * FINAL_SCORE);
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

const tierLabel = computed(() => fmt(t.value.onboarding.resultTier, { n: FINAL_TIER }));
const resultRows = computed(() => [
  { label: t.value.onboarding.testNpu, value: fmt(t.value.onboarding.resultComputeMetric, { n: FINAL_TOPS }) },
  { label: t.value.onboarding.testNetwork, value: `${FINAL_PING.sg}ms · ${t.value.onboarding.resultLatencyGood}` },
  { label: t.value.onboarding.testPower, value: fmt(t.value.onboarding.resultPowerReady, { n: FINAL_BATTERY }) },
]);
const policyLines = computed(() => [
  t.value.onboarding.policyLine1,
  t.value.onboarding.policyLine2,
  t.value.onboarding.policyLine3,
]);

function mix(token: string, pct: number) {
  return `color-mix(in oklab, ${token} ${pct}%, transparent)`;
}

// start calibration when entering that phase
import { watch } from "vue";
watch(phase, (p) => {
  if (p === "calibrating") startCalibration();
});

function activate() {
  const app = useApp();
  // Apply the freshly-measured baseline to the live phone device + record this
  // device as the account's calibrated device (so future logins on it skip
  // recalibration, while a different device triggers it).
  app.applyPhoneCalibration(cap);
  useSession().markCalibrated(auth.email || auth.accountId || "default");
  if (isRecal.value) {
    app.resumeMining();
  } else {
    if (!auth.completeOnboarding()) {
      uni.showToast({ title: t.value.authOtp.errorServiceUnavailable, icon: "none" });
      return;
    }
    if (!markAuthAccountOnboardingComplete(auth.email || auth.accountId || "default")) {
      if (!auth.requireOnboarding()) auth.signOut();
      uni.showToast({ title: t.value.authOtp.errorServiceUnavailable, icon: "none" });
      return;
    }
  }
  uni.reLaunch({ url: "/pages/index/index", fail: () => {} });
}
function leaveConnect() {
  if (calInterval) clearInterval(calInterval);
  if (calTimeout) clearTimeout(calTimeout);
  uni.reLaunch({ url: isRecal.value ? "/pages/me/devices" : "/pages/onboarding/estimator", fail: () => {} });
}

onLoad((options) => {
  const o = (options || {}) as Record<string, string>;
  if (o.mode === "recalibrate") isRecal.value = true;
});
onUnmounted(() => {
  if (calInterval) clearInterval(calInterval);
  if (calTimeout) clearTimeout(calTimeout);
  if (raf) cancelAnimationFrame(raf);
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

.cn-cta { margin-top: auto; padding-top: 24px; }
.cn-go { width: 100%; height: 48px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--v5-brand); transition: transform 0.15s ease; }
.cn-go--glow { box-shadow: 0 0 24px color-mix(in oklab, var(--v5-brand) 35%, transparent); }
.cn-go__t { font-size: 15px; font-weight: 600; color: var(--v5-on-brand); }
.cn-go__t--on { font-size: 15px; }

.anim-up { animation: cn-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes cn-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.cn-fade-enter-active, .cn-fade-leave-active { transition: opacity 0.3s; }
.cn-fade-enter-from, .cn-fade-leave-to { opacity: 0; }
</style>
