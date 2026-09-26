<template>
  <StandalonePageShell class="cn-root" :top-inset="24" @click="rulesExpanded = false">
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
      <text v-if="phase !== 'result' && !activationError" class="cn-sub">{{ subText }}</text>
      <text v-if="activationError" class="cn-sub" role="alert" aria-live="polite">{{ activationErrorText }}</text>
    </view>

    <transition name="cn-fade" mode="out-in" @after-enter="startScoreMotion">
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
        <view class="cn-cta">
          <view class="cn-go cn-go--glow active:scale-[0.98]" role="button" tabindex="0" :aria-disabled="checking || cfg.loading" :aria-busy="checking || cfg.loading" data-system-chrome-primary @click="beginCalibration" @keydown.enter.prevent="beginCalibration" @keydown.space.prevent="beginCalibration">
            <text class="cn-go__t">{{ activationError === 'reauth-required' ? t.phonePolicy.login : activationError ? t.phonePolicy.retry : t.onboarding.calibrationStart }}</text>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
          </view>
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
              <svg v-if="tc.progress < 1" width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="tc.accent" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="tc.icon" /></svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="tc.accent" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </view>
            <view class="cn-test__body">
              <text class="cn-test__title">{{ tc.title }}</text>
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
          <svg class="cn-score__tree cn-score__tree--left" viewBox="0 0 122 248" aria-hidden="true" focusable="false">
            <path d="M0 30H46V14H80M0 66H30V52H60M0 96H72M0 128H40V150H88M0 162H24M0 196H58V178H94M0 226H36V208H74" />
            <g><circle cx="80" cy="14" r="2.6" /><circle cx="60" cy="52" r="2.2" /><circle cx="72" cy="96" r="2.6" /><circle cx="88" cy="150" r="2.4" /><circle cx="24" cy="162" r="2.2" /><circle cx="94" cy="178" r="2.6" /><circle cx="74" cy="208" r="2.2" /></g>
          </svg>
          <svg class="cn-score__tree cn-score__tree--right" viewBox="0 0 122 248" aria-hidden="true" focusable="false">
            <path d="M0 40H50V22H82M0 74H28M0 104H66V120H96M0 138H38V156H80M0 172H26V158H56M0 204H62M0 232H40V214H78" />
            <g><circle cx="82" cy="22" r="2.6" /><circle cx="28" cy="74" r="2.2" /><circle cx="96" cy="120" r="2.6" /><circle cx="80" cy="156" r="2.4" /><circle cx="56" cy="158" r="2.2" /><circle cx="62" cy="204" r="2.6" /><circle cx="78" cy="214" r="2.2" /></g>
          </svg>
          <view class="cn-score__aurora" aria-hidden="true" />
          <svg :key="String(reducedMotion)" ref="scoreHex" class="cn-score__hex" viewBox="0 0 220 220" aria-hidden="true" focusable="false">
            <path v-for="layer in ['fill', 'halo', 'edge', 'pulse']" :key="layer" class="cn-score__ring" :class="`cn-score__ring--${layer}`" :d="hexFrames[0]">
              <animate v-if="!reducedMotion" attributeName="d" begin="indefinite" dur="8s" repeatCount="indefinite" :values="hexMorph" keyTimes="0;0.25;0.5;0.75;1" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1" />
            </path>
          </svg>
          <view class="cn-score__num" role="img" :aria-label="`${t.onboarding.scoreLabel} ${FINAL_SCORE}/100`">
            <view class="cn-score__value" aria-hidden="true">
              <text class="cn-score__v">{{ shownScore }}</text>
              <text class="cn-score__d">/100</text>
            </view>
            <text class="cn-score__label" aria-hidden="true">{{ t.onboarding.scoreLabel }}</text>
          </view>
        </view>
        <view class="cn-cta">
          <view class="cn-go cn-go--on active:scale-[0.98]" role="button" tabindex="0" :aria-disabled="checking || cfg.loading" :aria-busy="checking || cfg.loading" data-system-chrome-primary @click="activate" @keydown.enter.prevent="activate" @keydown.space.prevent="activate">
            <text class="cn-go__t cn-go__t--on">{{ activateText }}</text>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
          </view>
        </view>
      </view>
    </transition>

    <text v-if="phase === 'result' && isReplacement" class="cn-sub" role="note">{{ t.phonePolicy.replaceNotice }}</text>
    <view v-if="phase === 'result'" class="cn-policy" @click.stop>
      <view v-if="rulesExpanded" id="cn-policy-details" class="cn-policy__list" role="tooltip">
        <text class="cn-policy__title">{{ t.onboarding.policyTitle }}</text>
        <view v-for="(l, i) in policyLines" :key="i" class="cn-policy__line">
          <view class="cn-policy__dot" />
          <text class="cn-policy__t">{{ l }}</text>
        </view>
      </view>
      <view class="cn-policy__cap active:opacity-70" role="button" tabindex="0" :aria-label="t.onboarding.policyTitle" :aria-expanded="rulesExpanded" aria-controls="cn-policy-details" :aria-describedby="rulesExpanded ? 'cn-policy-details' : undefined" @click="rulesExpanded = !rulesExpanded">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
      </view>
    </view>
  </StandalonePageShell>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from "vue";
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
import { getCarrier } from "@/lib/carrier";
import { trialReservesSlotNow } from "@/store/free-trial";
import { useConfig } from "@/store/config";
import type { PhoneActivationError } from "@/lib/phone-policy";

const t = useT();
const auth = useAuth();
const app = useApp();
const cfg = useConfig();
const checking = ref(false);
const activationError = ref<PhoneActivationError | null>(null);
const activationErrorText = computed(() => activationError.value ? fmt(t.value.phonePolicy.errors[activationError.value], {
  date: new Date((app.phoneBinding?.changedAt ?? 0) + (useConfig().config.phoneBinding?.minReplacementIntervalDays ?? 0) * 86400000).toLocaleString(),
}) : "");

// Recalibrate mode (?mode=recalibrate) = new-device assessment; otherwise the
// first-time onboarding calibration. Set in onLoad.
const isRecal = ref(false);

type Phase = "intro" | "calibrating" | "result";
const phase = ref<Phase>("intro");
const rulesExpanded = ref(false);
function onRulesKeydown(event: KeyboardEvent) {
  if (!rulesExpanded.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    rulesExpanded.value = false;
    document.querySelector<HTMLElement>(".cn-policy__cap")?.focus();
  } else if (event.key === "Tab") {
    rulesExpanded.value = false;
  }
}
if (typeof document !== "undefined") document.addEventListener("keydown", onRulesKeydown);

const CALIBRATION_MS = 12_000;
// This is an estimate from device information, not a hardware benchmark.
// The timer presents progress; only the final estimated score is displayed.
const calibrationDeviceId = getDeviceId();
const cap = measureDeviceCapability(calibrationDeviceId);
const FINAL_SCORE = cap.score;

// Copy swaps: recalibrate vs first-time onboarding.
const stepText = computed(() => (isRecal.value ? t.value.onboarding.recalStep : t.value.onboarding.step3of3));
const titleText = computed(() => activationError.value ? t.value.phonePolicy.manage : phase.value === "result" ? t.value.onboarding.resultTitle : (isRecal.value ? t.value.onboarding.recalTitle : t.value.onboarding.calibrationTitle));
const subText = computed(() => (isRecal.value ? t.value.onboarding.recalSubtitle : t.value.onboarding.calibrationSubtitle));
const isReplacement = computed(() => !!app.phoneBinding && app.phoneBinding.installationId !== calibrationDeviceId);
const activateText = computed(() => isReplacement.value ? t.value.phonePolicy.confirmReplacement : (isRecal.value ? t.value.onboarding.recalActivate : t.value.onboarding.activatePhone));

// lucide paths
const ICON = {
  cpu: "M12 20v2M12 2v2M17 20v2M17 2v2M2 12h2M2 17h2M2 7h2M20 12h2M20 17h2M20 7h2M7 20v2M7 2v2",
  cpu2: "M4 4h16v16H4zM9 9h6v6H9z",
};

const whyPoints = computed(() => [
  { icon: ICON.cpu2, color: "var(--v5-brand)", text: t.value.onboarding.calibrationWhyLine1 },
]);

// ── calibrating tickers ──
const progress = ref(0);
let calInterval: ReturnType<typeof setInterval> | undefined;
let calTimeout: ReturnType<typeof setTimeout> | undefined;

function startCalibration() {
  const start = Date.now();
  calInterval = setInterval(() => {
    const p = Math.min(1, (Date.now() - start) / CALIBRATION_MS);
    progress.value = p;
  }, 100);
  calTimeout = setTimeout(() => {
    if (calInterval) clearInterval(calInterval);
    progress.value = 1;
    startResult();
    phase.value = "result";
  }, CALIBRATION_MS);
}

async function beginCalibration() {
  if (phase.value !== "intro" || checking.value || cfg.loading) return;
  checking.value = true;
  try { await cfg.load(); } finally { checking.value = false; }
  activationError.value = app.phoneActivationError();
  if (activationError.value === "reauth-required") {
    uni.reLaunch({ url: "/pages/login/login" });
    return;
  }
  if (!activationError.value) phase.value = "calibrating";
}

const progressText = computed(() =>
  fmt(t.value.onboarding.calibrationProgress, {
    n: Math.max(0, Math.ceil((1 - progress.value) * (CALIBRATION_MS / 1000))),
  })
);

const testCards = computed(() => [
  { icon: ICON.cpu, title: t.value.onboarding.testNpu, progress: progress.value, accent: "var(--v5-brand)" },
]);

// ── result score tick ──
const motionQuery = typeof window !== "undefined" && typeof window.matchMedia === "function"
  ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const reducedMotion = ref(motionQuery?.matches ?? false);
const updateReducedMotion = () => { reducedMotion.value = motionQuery?.matches ?? false; };
motionQuery?.addEventListener?.("change", updateReducedMotion);
const scoreHex = ref<SVGSVGElement | null>(null);
function startScoreMotion() {
  if (reducedMotion.value) return;
  // Start after Vue has attached every path/value; automatic SMIL can stall its first cycle.
  scoreHex.value?.querySelectorAll("animate").forEach(animation => animation.beginElement());
}
watch(reducedMotion, async reduce => {
  if (!reduce) {
    await nextTick();
    startScoreMotion();
  }
});

// The reference hero's four rounded-hexagon poses, interpolated natively by SVG.
function hexFrame(offsets: number[], corner: number): string {
  const vertices = offsets.map((offset, i) => {
    const angle = i * Math.PI / 3;
    return [110 + (90 + offset) * Math.cos(angle), 110 + (90 + offset) * Math.sin(angle)];
  });
  return vertices.map((vertex, i) => {
    const toward = (neighbor: number[]) => {
      const length = Math.hypot(neighbor[0] - vertex[0], neighbor[1] - vertex[1]);
      return vertex.map((value, axis) => (value + (neighbor[axis] - value) * corner / length).toFixed(2)).join(",");
    };
    return `${i === 0 ? "M" : "L"}${toward(vertices[(i + 5) % 6])} Q${vertex.map(value => value.toFixed(2)).join(",")} ${toward(vertices[(i + 1) % 6])}`;
  }).join(" ") + " Z";
}
const hexFrames = [
  hexFrame([0, 0, 0, 0, 0, 0], 22),
  hexFrame([7, -5, 6, -3, 7, -5], 27),
  hexFrame([-5, 7, -4, 7, -5, 6], 18),
  hexFrame([6, -6, 7, -5, 3, -3], 25),
];
const hexMorph = [...hexFrames, hexFrames[0]].join(";");
const shownScore = ref(0);
let raf = 0;
function startResult() {
  if (reducedMotion.value) {
    shownScore.value = FINAL_SCORE;
    return;
  }
  const start = Date.now();
  const tick = () => {
    const p = reducedMotion.value ? 1 : Math.min(1, (Date.now() - start) / 900);
    shownScore.value = Math.round(p * FINAL_SCORE);
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

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

async function activate() {
  if (checking.value || cfg.loading) return;
  checking.value = true;
  try { await cfg.load(); } finally { checking.value = false; }
  const app = useApp();
  // Apply the estimated baseline to the live phone device + record this
  // device as the account's calibrated device (so future logins on it skip
  // recalibration, while a different device triggers it).
  activationError.value = calibrationDeviceId !== getDeviceId() ? "device-mismatch"
    : app.applyPhoneCalibration(cap, trialReservesSlotNow() ? 1 : 0);
  if (activationError.value) return;
  useSession().markCalibrated(auth.email || auth.accountId || "default");
  if (!auth.onboardingComplete) {
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
  if (getCarrier() === "h5") {
    uni.reLaunch({ url: "/pages/register/success?download=1" });
    return;
  }
  app.resumeMining();
  activationError.value = app.phoneActivationError();
  const o = (options || {}) as Record<string, string>;
  if (o.mode === "recalibrate") isRecal.value = true;
});
onUnmounted(() => {
  if (typeof document !== "undefined") document.removeEventListener("keydown", onRulesKeydown);
  motionQuery?.removeEventListener?.("change", updateReducedMotion);
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
.cn-phase { margin-top: 20px; display: flex; flex-direction: column; gap: 10px; flex-shrink: 0; }

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
.cn-test__track { margin-top: 10px; height: 4px; border-radius: 9999px; background: var(--v5-surface-2); overflow: hidden; }
.cn-test__fill { height: 100%; border-radius: 9999px; transition: width 0.15s linear; }

.cn-score { --score-size: clamp(184px, 32vh, 306px); position: relative; height: var(--score-size); display: grid; place-items: center; isolation: isolate; }
.cn-score__tree { position: absolute; top: 50%; width: min(30%, 122px); height: 82%; fill: none; stroke: var(--v5-brand); stroke-width: 1; stroke-opacity: 0.2; transform: translateY(-50%); pointer-events: none; mask-image: linear-gradient(90deg, var(--v5-bg) 2%, transparent 70%); }
.cn-score__tree g { fill: var(--v5-brand); fill-opacity: 0.3; stroke: none; }
.cn-score__tree--left { left: 0; }
.cn-score__tree--right { right: 0; transform: translateY(-50%) scaleX(-1); }
.cn-score__aurora { position: absolute; width: calc(var(--score-size) * 0.77); height: calc(var(--score-size) * 0.77); border-radius: 50%; background: radial-gradient(circle, color-mix(in oklab, var(--v5-brand) 45%, transparent), transparent 62%); filter: blur(26px); animation: cn-aurora 13s ease-in-out infinite alternate; pointer-events: none; }
.cn-score__hex { position: relative; width: calc(var(--score-size) - 16px); height: calc(var(--score-size) - 16px); overflow: visible; }
.cn-score__ring { fill: none; stroke-linejoin: round; }
.cn-score__ring--fill { fill: color-mix(in oklab, var(--v5-brand) 5%, transparent); }
.cn-score__ring--halo { stroke: color-mix(in oklab, var(--v5-brand) 18%, transparent); stroke-width: 7.5; }
.cn-score__ring--edge { stroke: var(--v5-brand); stroke-width: 3.4; filter: drop-shadow(0 0 7px color-mix(in oklab, var(--v5-brand) 45%, transparent)) drop-shadow(0 0 18px color-mix(in oklab, var(--v5-brand) 45%, transparent)); }
.cn-score__ring--pulse { stroke: color-mix(in oklab, var(--v5-brand) 45%, var(--v5-ink)); stroke-width: 1.5; filter: drop-shadow(0 0 5px color-mix(in oklab, var(--v5-brand) 85%, transparent)); animation: cn-ring-pulse 3.2s ease-in-out infinite; }
.cn-score__num { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
.cn-score__value { position: relative; }
.cn-score__v { font-family: var(--font-v5); font-variant-numeric: tabular-nums; line-height: 1; letter-spacing: -0.035em; color: var(--v5-brand); font-size: clamp(56px, 9vh, 88px); font-weight: 600; text-shadow: 0 0 24px color-mix(in oklab, var(--v5-brand) 45%, transparent), 0 0 9px color-mix(in oklab, var(--v5-brand) 45%, transparent); }
.cn-score__label { margin-top: 8px; color: var(--v5-ink-3); font-size: 11px; letter-spacing: 0.08em; }
.cn-score__d { position: absolute; left: calc(100% + 3px); bottom: 5px; color: var(--v5-ink-3); font-size: 11px; font-variant-numeric: tabular-nums; }
@keyframes cn-aurora { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-4%, 3%) scale(1.07); } }
@keyframes cn-ring-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.95; } }

.cn-policy { position: fixed; right: 20px; bottom: calc(env(safe-area-inset-bottom, 0px) + 38px); z-index: 20; }
.cn-policy__cap { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: var(--v5-ink-3); }
.cn-policy__cap[aria-expanded="true"] { background: var(--v5-surface); color: var(--v5-ink-2); }
.cn-policy__list { position: absolute; right: 0; bottom: calc(100% + 10px); width: min(280px, calc(100vw - 40px)); box-sizing: border-box; padding: 16px; border-radius: 14px; background: var(--v5-surface-2); display: flex; flex-direction: column; gap: 8px; }
.cn-policy__list::after { content: ""; position: absolute; right: 17px; bottom: -5px; width: 10px; height: 10px; background: var(--v5-surface-2); transform: rotate(45deg); }
.cn-policy__title { display: block; margin-bottom: 2px; font-size: 12px; font-weight: 600; color: var(--v5-ink); }
.cn-policy__line { display: flex; align-items: flex-start; gap: 6px; }
.cn-policy__dot { flex-shrink: 0; margin-top: 6px; width: 4px; height: 4px; border-radius: 9999px; background: var(--v5-ink-3); }
.cn-policy__t { flex: 1; font-size: 12px; line-height: 1.375; color: var(--v5-ink-2); }

.cn-cta { margin-top: 14px; margin-bottom: 64px; flex-shrink: 0; }
.cn-go { width: 100%; height: 48px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; gap: 8px; background: var(--v5-brand); transition: transform 0.15s ease; }
.cn-go--glow { box-shadow: 0 0 24px color-mix(in oklab, var(--v5-brand) 35%, transparent); }
.cn-go__t { font-size: 15px; font-weight: 600; color: var(--v5-on-brand); }
.cn-go__t--on { font-size: 15px; }

.anim-up { animation: cn-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes cn-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.cn-fade-enter-active, .cn-fade-leave-active { transition: opacity 0.3s; }
.cn-fade-enter-from, .cn-fade-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .cn-score__aurora, .cn-score__ring--pulse, .cn-spin, .anim-up { animation: none; }
  .cn-fade-enter-active, .cn-fade-leave-active, .cn-test__fill { transition: none; }
}
</style>
