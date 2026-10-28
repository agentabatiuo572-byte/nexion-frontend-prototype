<template>
  <view v-if="sheet.open" class="tcs-root" role="dialog" aria-modal="true" aria-labelledby="trial-claim-title">
    <view class="tcs-backdrop" @click="hide" />
    <view class="nx-glass-sheet tcs-panel" @click.stop>
      <view class="tcs-head">
        <view class="tcs-head-l">
          <view class="tcs-spark-box" :class="{ 'tcs-spark-box--success': activated }" aria-hidden="true">
            <svg v-if="activated" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6" /></svg>
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" /></svg>
          </view>
          <view class="tcs-head-meta">
            <text class="tcs-cap">{{ copy.noPayment }}</text>
            <text id="trial-claim-title" class="tcs-title">{{ activated ? copy.activationSuccessTitle : copy.activateTitle }}</text>
          </view>
        </view>
        <view class="tcs-close" role="button" tabindex="0" :aria-label="t.trial.sheetCloseAria" @click="hide">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>

      <view class="tcs-device">
        <view class="tcs-device-art" aria-hidden="true" />
        <view class="tcs-device-meta"><text class="tcs-device-caption">{{ copy.productLabel }}</text><text class="tcs-device-name">{{ trialView.deviceName.value ?? '-' }}</text><text class="tcs-device-duration">{{ durationText }}</text></view>
      </view>

      <view v-if="activated" class="tcs-success" role="status" aria-live="polite">
        <text class="tcs-success-body">{{ copy.activationSuccessBody }}</text>
        <view class="tcs-success-time"><text>{{ copy.remainingLabel }}</text><text class="font-mono-tabular">{{ remainingText }}</text></view>
      </view>
      <template v-else>
        <view class="tcs-hero">
          <view aria-hidden="true" class="tcs-hero-grid" />
          <view class="tcs-hero-row"><text class="tcs-hero-label">{{ copy.estimateLabel }}</text></view>
          <view class="tcs-hero-num-row"><text class="tcs-hero-num">{{ estimateText }}</text></view>
          <text class="tcs-estimate-note">{{ estimateNote }}</text>
        </view>
      </template>

      <view v-if="claimError" class="tcs-error" role="alert"><text class="tcs-error-t">{{ claimErrorText }}</text></view>
      <view v-else-if="!activated && freeTrial.authorityStatus === 'error'" class="tcs-error" role="status"><text class="tcs-error-t">{{ copy.unavailable }}</text></view>

      <view class="tcs-ctas">
        <template v-if="activated">
          <view class="tcs-claim" role="button" tabindex="0" :aria-label="copy.viewDevices" @click.stop="goDevices"><text class="tcs-claim-t">{{ copy.viewDevices }}</text></view>
          <view class="tcs-secondary" role="button" tabindex="0" :aria-label="copy.buyEarly" @click.stop="goTrial"><text>{{ copy.buyEarly }}</text></view>
        </template>
        <view v-else class="tcs-claim" :class="{ 'tcs-claim--busy': claiming }" role="button" :tabindex="claiming ? -1 : 0" :aria-label="claimCtaLabel" :aria-disabled="claiming ? 'true' : 'false'" :aria-busy="claiming ? 'true' : 'false'" @click.stop="onClaim"><text class="tcs-claim-t">{{ claimCtaLabel }}</text></view>
        <view class="tcs-dismiss" role="button" tabindex="0" :aria-label="activated ? copy.close : t.trial.sheetDismissCta" @click.stop="hide"><text class="tcs-dismiss-t">{{ activated ? copy.close : t.trial.sheetDismissCta }}</text></view>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { formatAmount } from "@/lib/amount-display";
import { computed, ref, watch } from "vue";
import { navTo } from "@/lib/route";
import { useApp } from "@/store/app";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { useFreeTrial, type TrialStartFailure } from "@/store/free-trial";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { useTrialPresentation } from '@/composables/use-trial-presentation';
import { useTrialLifecycleCopy, formatTrialRemaining } from '@/i18n/trial-lifecycle';

const sheet = useTrialClaimSheet();
const freeTrial = useFreeTrial();
const trialView = useTrialPresentation();
const app = useApp();
const t = useT();
const copy = useTrialLifecycleCopy();

const durationText = computed(() => trialView.config.value ? fmt(copy.value.durationDays, { days: trialView.config.value.trialDays }) : '-');
const estimateText = computed(() => trialView.estimatedOffsetUSD.value === null ? '-' : `$${formatAmount(trialView.estimatedOffsetUSD.value)}`);
const estimateNote = computed(() => trialView.config.value ? fmt(copy.value.estimateNote, {
  rate: formatAmount(trialView.config.value.shadowDailyUSD), days: trialView.config.value.trialDays,
  cap: formatAmount(trialView.config.value.trialOffsetCapUSD),
}) : freeTrial.authorityStatus === 'error' ? copy.value.unavailable : copy.value.loading);
const remainingText = computed(() => trialView.remainingMs.value === null ? '-' : formatTrialRemaining(trialView.remainingMs.value, copy.value.longRemaining));

// Claim submission — loading guard against double taps (异常3; the store's
// start() is idempotent underneath, this just keeps the UI honest) + inline
// error with retry (spec ⑤: failure is never silent).
const claiming = ref(false);
const activated = ref(false);
const claimError = ref(false);
const claimErrorReason = ref<TrialStartFailure>();
let claimSequence = 0;
const claimCtaLabel = computed(() => claiming.value ? copy.value.activating
  : claimErrorReason.value === 'capacity-full' ? copy.value.manageDevices
  : claimErrorReason.value === 'converted' ? copy.value.viewDevices
  : claimErrorReason.value === 'in-progress' ? copy.value.viewTrial
  : claimErrorReason.value === 'used' ? copy.value.buyDevice
  : claimErrorReason.value === "onboarding-required" ? t.value.trial.claimOnboardingCta
  : claimErrorReason.value === "terms-required" ? t.value.trial.claimTermsCta
  : claimError.value || freeTrial.authorityStatus === 'error' ? t.value.trial.claimRetryCta : copy.value.activateCta);
const claimErrorText = computed(() => claimErrorReason.value === "onboarding-required" ? t.value.trial.claimOnboardingRequired
  : claimErrorReason.value === "terms-required" ? t.value.trial.claimTermsRequired
  : claimErrorReason.value === 'capacity-full' ? copy.value.capacityFull
  : claimErrorReason.value === "unknown"
  ? t.value.trial.claimUnknownInline
  : reasonText(claimErrorReason.value));

function reasonText(reason: TrialStartFailure | undefined): string {
  const w = t.value.trial;
  if (reason === 'capacity-full') return copy.value.capacityFull;
  if (reason === "converted") return w.eligReasonConverted;
  if (reason === "used") return w.eligReasonUsed;
  if (reason === "in-progress") return w.eligReasonInProgress;
  if (reason === "quota-exhausted") return w.eligReasonQuota;
  if (reason === "risk") return w.eligReasonRisk;
  if (reason === "product-unavailable") return t.value.store.trialProductUnavailable;
  if (reason === "unknown") return w.eligReasonUnknown;
  return w.eligReasonClosed;
}

function hide() {
  claimError.value = false;
  claimErrorReason.value = undefined;
  sheet.hide();
}
function goDevices() { hide(); navTo('/pages/me/devices'); }
function goTrial() { hide(); navTo('/pages/me/trial'); }
async function onClaim() {
  if (claiming.value || !sheet.open || activated.value) return;
  if (claimErrorReason.value === 'capacity-full' || claimErrorReason.value === 'converted') { goDevices(); return; }
  if (claimErrorReason.value === 'in-progress' || claimErrorReason.value === 'used') { goTrial(); return; }
  if (claimErrorReason.value === "terms-required") { hide(); navTo("/pages/onboarding/terms"); return; }
  if (claimErrorReason.value === "onboarding-required") {
    hide();
    // #ifdef H5
    navTo("/pages/register/success?setup=1");
    // #endif
    // #ifndef H5
    navTo("/pages/onboarding/estimator");
    // #endif
    return;
  }
  const requestedEpoch = app.accountBindingEpoch;
  const requestedSequence = ++claimSequence;
  claiming.value = true;
  claimError.value = false;
  // Remote start first refreshes GET /api/trial/eligibility, then posts the
  // idempotent command and performs an authoritative readback.
  const r = await freeTrial.start();
  if (requestedSequence !== claimSequence) return;
  claiming.value = false;
  if (requestedEpoch !== app.accountBindingEpoch || !sheet.open) return;
  if (!r.ok) {
    claimErrorReason.value = r.reason;
    claimError.value = true; // inline error + retry CTA, stay in the sheet
    return;
  }
  claimError.value = false;
  claimErrorReason.value = undefined;
  // start() only resolves ok after the authoritative state readback succeeds.
  activated.value = true;
}

watch(() => app.accountBindingEpoch, () => {
  claimSequence++;
  claiming.value = false;
  activated.value = false;
  claimError.value = false;
  claimErrorReason.value = undefined;
  sheet.closeTransient();
}, { flush: 'sync' });
watch(() => sheet.open, open => {
  if (!open) return;
  claimError.value = false;
  claimErrorReason.value = undefined;
  activated.value = !claiming.value && freeTrial.authorityStatus === 'ready'
    && (freeTrial.status === 'active' || freeTrial.status === 'grace');
});

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => sheet.open), ".tcs-root", hide);


</script>

<style scoped>
.tcs-root { position:fixed;inset:0;z-index:790; }
.tcs-backdrop { position:absolute;inset:0;background:var(--v5-bg-color-mask);backdrop-filter:blur(8px) saturate(150%);-webkit-backdrop-filter:blur(8px) saturate(150%);animation:tcs-fade .24s ease-out; }
.tcs-panel { position:absolute;left:0;right:0;bottom:0;z-index:800;box-sizing:border-box;max-height:calc(100% - var(--nx-overlay-top));overflow-y:auto;border-radius:var(--nx-glass-radius) var(--nx-glass-radius) 0 0;box-shadow:var(--nx-glass-edge);background:var(--nx-glass-fill);border:none;padding:20px 16px calc(env(safe-area-inset-bottom) + 38px);animation:tcs-slide-up .36s cubic-bezier(.16,1,.3,1); }
@keyframes tcs-fade { from { opacity:0; } to { opacity:1; } }
@keyframes tcs-slide-up { from { transform:translateY(100%); } to { transform:translateY(0); } }
.tcs-head { display:flex;align-items:flex-start;justify-content:space-between;gap:8px; }
.tcs-head-l { display:flex;align-items:center;gap:10px;min-width:0; }
.tcs-spark-box { width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex-shrink:0;background:color-mix(in srgb,var(--v5-brand) 14%,transparent); }
.tcs-spark-box--success { box-shadow:0 0 24px color-mix(in srgb,var(--v5-brand) 14%,transparent);animation:tcs-success .4s ease-out; }
@keyframes tcs-success { from { transform:scale(.8);opacity:.4; } to { transform:scale(1);opacity:1; } }
.tcs-head-meta { display:flex;flex-direction:column;min-width:0; }
.tcs-cap { font:500 11px/1.4 var(--font-v5);color:var(--v5-brand); }
.tcs-title { font:600 17px/1.35 var(--font-v5);color:var(--v5-ink);margin-top:3px;overflow-wrap:anywhere; }
.tcs-close { width:44px;height:44px;border-radius:999px;background:var(--v5-surface-2);display:grid;place-items:center;flex-shrink:0; }
.tcs-close:active { background:var(--v5-surface-3); }
.tcs-device { display:flex;align-items:center;gap:14px;margin-top:16px;padding:6px 0 14px;border-bottom:1px solid var(--v5-border); }
.tcs-device-art { width:92px;height:92px;flex:none;background:url('/static/img/home-glass-20260928/s1.webp') center/contain no-repeat; }
.tcs-device-meta { min-width:0;display:flex;flex-direction:column;gap:5px; }
.tcs-device-caption { font:400 11px/1.5 var(--font-v5);color:var(--v5-ink-3); }
.tcs-device-name { font:600 19px/1.3 var(--font-v5);color:var(--v5-ink);overflow-wrap:anywhere; }
.tcs-device-duration { font:500 var(--ui-type-list-subtitle)/1.5 var(--font-v5);color:var(--v5-brand);overflow-wrap:anywhere; }
.tcs-hero { margin-top:16px;border-radius:16px;padding:16px;position:relative;overflow:hidden;background:color-mix(in srgb,var(--v5-brand) 6%,var(--v5-surface-2));border:1px solid color-mix(in srgb,var(--v5-brand) 25%,transparent); }
.tcs-hero-grid { position:absolute;inset:0;pointer-events:none;opacity:.04;background-image:linear-gradient(var(--v5-brand) 1px,transparent 1px),linear-gradient(90deg,var(--v5-brand) 1px,transparent 1px);background-size:16px 16px; }
.tcs-hero-row,.tcs-hero-num-row { position:relative; }
.tcs-hero-label { font:500 12px/1.5 var(--font-v5);color:var(--v5-ink-2);overflow-wrap:anywhere; }
.tcs-hero-num-row { margin-top:8px; }
.tcs-hero-num { font:600 34px/1.15 var(--font-v5);letter-spacing:-.025em;color:var(--v5-brand);font-variant-numeric:tabular-nums;overflow-wrap:anywhere; }
.tcs-estimate-note { display:block;position:relative;margin-top:9px;font:400 11px/1.65 var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }
.tcs-success { margin-top:16px;padding:16px;border-radius:16px;background:color-mix(in srgb,var(--v5-brand) 7%,var(--v5-surface-2));border:1px solid color-mix(in srgb,var(--v5-brand) 25%,transparent); }
.tcs-success-body { display:block;font:400 var(--ui-type-list-subtitle)/1.65 var(--font-v5);color:var(--v5-ink-2); }
.tcs-success-time { display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 12px;margin-top:14px;font:400 12px/1.5 var(--font-v5);color:var(--v5-ink-3); }
.tcs-success-time > text:last-child { font-size:22px;font-weight:600;color:var(--v5-brand); }
.tcs-error { margin-top:14px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--v5-warning) 10%,transparent); }
.tcs-error-t { display:block;font:400 12px/1.65 var(--font-v5);color:var(--v5-ink-2);overflow-wrap:anywhere; }
.tcs-ctas { margin-top:20px;display:flex;flex-direction:column;gap:8px; }
.tcs-claim { box-sizing:border-box;width:100%;min-height:48px;padding:12px 16px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:var(--v5-brand);box-shadow:0 0 24px color-mix(in srgb,var(--v5-brand) 18%,transparent);transition:transform .12s ease; }
.tcs-claim:active { transform:scale(.98); }
.tcs-claim--busy { opacity:.7;pointer-events:none; }
.tcs-claim-t { font:600 13px/1.5 var(--font-v5);color:var(--v5-on-brand);text-align:center;overflow-wrap:anywhere; }
.tcs-secondary { box-sizing:border-box;min-height:44px;padding:10px 16px;border-radius:999px;border:1px solid var(--v5-border);display:flex;align-items:center;justify-content:center;font:500 var(--ui-type-list-subtitle)/1.5 var(--font-v5);color:var(--v5-ink);text-align:center;overflow-wrap:anywhere; }
.tcs-dismiss { width:100%;min-height:44px;display:flex;align-items:center;justify-content:center; }
.tcs-dismiss:active { opacity:.7; }
.tcs-dismiss-t { font:400 var(--ui-type-list-subtitle)/1.5 var(--font-v5);color:var(--v5-ink-3);text-align:center; }
.tcs-claim:focus-visible,.tcs-secondary:focus-visible,.tcs-close:focus-visible,.tcs-dismiss:focus-visible { outline:2px solid var(--v5-brand);outline-offset:3px; }
@media(max-width:350px) { .tcs-device-art { width:76px;height:76px; }.tcs-device-name {font-size:17px;}.tcs-title {font-size:16px;} }
@media(prefers-reduced-motion:reduce) { .tcs-panel,.tcs-backdrop,.tcs-spark-box--success { animation:none; }.tcs-claim { transition:none; } }
</style>
