<!--
  TrialClaimSheet — chassis-level bottom sheet surfacing the free-trial offer.
  FEAT-TRIAL02: confirming claims the trial DIRECTLY (no card, no payment
  method anywhere in the flow — spec ②⑤). Failure shows an inline error +
  retry inside the sheet (never silent); ineligible surfaces the concrete
  reason (异常2). Zero-friction copy, fully i18n-routed (t.trial.sheet*).
-->
<template>
  <view v-if="sheet.open" class="tcs-root" role="dialog" aria-modal="true">
    <view class="tcs-backdrop" @click="hide" />

    <view class="tcs-panel" @click.stop>
      <!-- header -->
      <view class="tcs-head">
        <view class="tcs-head-l">
          <view class="tcs-spark-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" /></svg>
          </view>
          <view class="tcs-head-meta">
            <text class="tcs-cap">{{ t.trial.sheetCapLabel }}</text>
            <text class="tcs-title">{{ t.trial.sheetTitle }}</text>
          </view>
        </view>
        <view class="tcs-close" role="button" tabindex="0" :aria-label="t.trial.sheetCloseAria" @click="hide">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>

      <!-- hero shadow-potential block -->
      <view class="tcs-hero">
        <view aria-hidden class="tcs-hero-grid" />
        <view class="tcs-hero-row">
          <text class="tcs-hero-label">{{ t.trial.sheetPotentialLabel }}</text>
          <text class="tcs-hero-perday">{{ perDay }}</text>
        </view>
        <view class="tcs-hero-num-row">
          <text class="tcs-hero-num">${{ shadowTotal }}</text>
          <text class="tcs-hero-suffix">{{ totalSuffix }}</text>
        </view>
      </view>

      <!-- 3 value props -->
      <view class="tcs-props">
        <view class="tcs-prop">
          <view class="tcs-prop-ico tcs-ico-brand">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
          </view>
          <view class="tcs-prop-meta">
            <text class="tcs-prop-title">{{ t.trial.sheetProp1Title }}</text>
            <text class="tcs-prop-sub">{{ prop1Sub }}</text>
          </view>
        </view>
        <view class="tcs-prop">
          <view class="tcs-prop-ico tcs-ico-cyan">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" /></svg>
          </view>
          <view class="tcs-prop-meta">
            <text class="tcs-prop-title">{{ t.trial.sheetProp2Title }}</text>
            <text class="tcs-prop-sub">{{ t.trial.sheetProp2Sub }}</text>
          </view>
        </view>
        <view class="tcs-prop">
          <view class="tcs-prop-ico tcs-ico-brand">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" /></svg>
          </view>
          <view class="tcs-prop-meta">
            <text class="tcs-prop-title">{{ prop3Title }}</text>
            <text class="tcs-prop-sub">{{ prop3Sub }}</text>
          </view>
        </view>
      </view>

      <!-- Inline claim error + retry (spec ⑤ — never silent) -->
      <view v-if="claimError" class="tcs-error">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 1px"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
        <text class="tcs-error-t">{{ claimErrorText }}</text>
      </view>

      <!-- CTAs -->
      <view class="tcs-ctas">
        <view class="tcs-claim" :class="{ 'tcs-claim--busy': claiming }" role="button" tabindex="0" :aria-label="claimCtaLabel" :aria-busy="claiming ? 'true' : 'false'" @click.stop="onClaim">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" /></svg>
          <text class="tcs-claim-t">{{ claimCtaLabel }}</text>
        </view>
        <view class="tcs-dismiss" role="button" tabindex="0" :aria-label="t.trial.sheetDismissCta" @click.stop="hide">
          <text class="tcs-dismiss-t">{{ t.trial.sheetDismissCta }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { useTrialConfig } from "@/store/trial-config";
import { useFreeTrial, type TrialIneligibleReason } from "@/store/free-trial";
import { toast } from "@/store/ui";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const sheet = useTrialClaimSheet();
const trialConfig = useTrialConfig();
const freeTrial = useFreeTrial();
const t = useT();

const cfg = computed(() => trialConfig.config);
const shadowTotal = computed(() => (cfg.value.shadowDailyUSD * cfg.value.trialDays).toFixed(0));
const perDay = computed(() => fmt(t.value.trial.sheetPerDay, { amount: cfg.value.shadowDailyUSD.toFixed(2) }));
const totalSuffix = computed(() => fmt(t.value.trial.sheetTotalSuffix, { days: String(cfg.value.trialDays) }));
const prop1Sub = computed(() => fmt(t.value.trial.sheetProp1Sub, { days: String(cfg.value.trialDays) }));
const prop3Title = computed(() => fmt(t.value.trial.sheetProp3Title, { amount: String(cfg.value.discountCapUSD) }));
const prop3Sub = computed(() => fmt(t.value.trial.sheetProp3Sub, { pct: (cfg.value.discountRate * 100).toFixed(0) }));

// Claim submission — loading guard against double taps (异常3; the store's
// start() is idempotent underneath, this just keeps the UI honest) + inline
// error with retry (spec ⑤: failure is never silent).
const claiming = ref(false);
const claimError = ref(false);
const claimErrorReason = ref<TrialIneligibleReason>();
const claimCtaLabel = computed(() => (claimError.value ? t.value.trial.claimRetryCta : t.value.trial.sheetClaimCta));
const claimErrorText = computed(() => claimErrorReason.value === "unknown"
  ? t.value.trial.claimUnknownInline
  : t.value.trial.claimErrorInline);

function reasonText(reason: TrialIneligibleReason | undefined): string {
  const w = t.value.trial;
  if (reason === "converted") return w.eligReasonConverted;
  if (reason === "used") return w.eligReasonUsed;
  if (reason === "in-progress") return w.eligReasonInProgress;
  if (reason === "risk") return w.eligReasonRisk;
  if (reason === "unknown") return w.eligReasonUnknown;
  return w.eligReasonClosed;
}

function hide() {
  claimError.value = false;
  claimErrorReason.value = undefined;
  sheet.hide();
}
async function onClaim() {
  if (claiming.value) return;
  claiming.value = true;
  // Remote start first refreshes GET /api/trial/eligibility, then posts the
  // idempotent command and performs an authoritative readback.
  const r = await freeTrial.start();
  claiming.value = false;
  if (!r.ok) {
    if (r.reason && r.reason !== "unknown") {
      sheet.hide();
      toast.info(reasonText(r.reason));
      return;
    }
    claimErrorReason.value = r.reason;
    claimError.value = true; // inline error + retry CTA, stay in the sheet
    return;
  }
  claimError.value = false;
  claimErrorReason.value = undefined;
  sheet.hide();
  toast.success(t.value.trial.toastActivated);
}

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => sheet.open), ".tcs-root", hide);
</script>

<style scoped>
.tcs-root {
  position: fixed;
  inset: 0;
  z-index: 790;
}
.tcs-backdrop {
  position: absolute;
  inset: 0;
  background: var(--v5-bg-color-mask);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  animation: tcs-fade 0.24s ease-out;
}
.tcs-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 800;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  background: var(--v5-surface);
  border-top: 1px solid var(--v5-border);
  padding: 20px 16px;
  padding-bottom: calc(env(safe-area-inset-bottom) + 38px);
  animation: tcs-slide-up 0.36s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes tcs-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes tcs-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.tcs-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.tcs-head-l {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tcs-spark-box {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--v5-brand) 14%, transparent);
}
.tcs-head-meta {
  display: flex;
  flex-direction: column;
}
.tcs-cap {
  font-size: 12px;
  font-family: var(--font-jet-mono), monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--v5-brand);
}
.tcs-title {
  font-family: var(--font-v5);
  font-size: 15px;
  font-weight: 600;
  color: var(--v5-ink);
  margin-top: 2px;
  line-height: 1.25;
}
.tcs-close {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--v5-surface-2);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: background 0.12s ease;
}
.tcs-close:active {
  background: var(--v5-surface-3);
}
.tcs-hero {
  margin-top: 16px;
  border-radius: 16px;
  padding: 16px;
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, var(--v5-brand) 6%, var(--v5-surface-2));
  border: 1px solid color-mix(in srgb, var(--v5-brand) 32%, transparent);
}
.tcs-hero-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.06;
  background-image:
    linear-gradient(var(--v5-brand) 1px, transparent 1px),
    linear-gradient(90deg, var(--v5-brand) 1px, transparent 1px);
  background-size: 16px 16px;
}
.tcs-hero-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tcs-hero-label {
  font-size: 12px;
  font-family: var(--font-jet-mono), monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--v5-brand);
}
.tcs-hero-perday {
  font-size: 12px;
  font-family: var(--font-jet-mono), monospace;
  color: var(--v5-ink-4);
  font-variant-numeric: tabular-nums;
}
.tcs-hero-num-row {
  position: relative;
  margin-top: 6px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.tcs-hero-num {
  font-family: var(--font-v5);
  font-size: 34px;
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1;
  color: var(--v5-brand);
  font-variant-numeric: tabular-nums;
}
.tcs-hero-suffix {
  font-size: 12px;
  font-family: var(--font-jet-mono), monospace;
  color: var(--v5-ink-3);
}
.tcs-props {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tcs-prop {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.tcs-prop-ico {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.tcs-ico-brand {
  background: color-mix(in srgb, var(--v5-brand) 12%, transparent);
}
.tcs-ico-cyan {
  background: color-mix(in srgb, var(--v5-tech-cyan) 12%, transparent);
}
.tcs-prop-meta {
  flex: 1;
  min-width: 0;
}
.tcs-prop-title {
  font-family: var(--font-v5);
  font-size: 13px;
  font-weight: 600;
  color: var(--v5-ink);
  line-height: 1.375;
}
.tcs-prop-sub {
  display: block;
  font-size: 12px;
  color: var(--v5-ink-3);
  margin-top: 4px;
  line-height: 1.625;
}
.tcs-error {
  margin-top: 14px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--v5-warning) 10%, transparent);
}
.tcs-error-t {
  flex: 1;
  font-size: 12px;
  color: var(--v5-ink-2);
  line-height: 1.625;
  text-wrap: pretty;
}
.tcs-ctas {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tcs-claim--busy {
  opacity: 0.7;
  pointer-events: none;
}
.tcs-claim {
  width: 100%;
  height: 48px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--v5-brand);
  box-shadow: 0 0 24px color-mix(in srgb, var(--v5-brand) 24%, transparent);
  transition: transform 0.12s ease;
}
.tcs-claim:active {
  transform: scale(0.98);
}
.tcs-claim-t {
  font-size: 13px;
  font-weight: 600;
  color: var(--v5-on-brand);
  font-family: var(--font-v5);
}
.tcs-dismiss {
  width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.12s ease;
}
.tcs-dismiss:active {
  opacity: 0.7;
}
.tcs-dismiss-t {
  font-size: 13px;
  font-weight: 400;
  color: var(--v5-ink-3);
}
</style>
