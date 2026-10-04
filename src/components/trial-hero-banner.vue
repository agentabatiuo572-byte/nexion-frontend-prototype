<!-- Trial eligibility and claim flow remain owned by the existing trial stores. -->
<template>
  <view v-if="visible" class="nx-trial-hero nx-home-glass-item" role="button" :tabindex="canClaim ? 0 : -1" :aria-disabled="canClaim ? 'false' : 'true'"
    :aria-busy="trial.authorityStatus === 'loading'" :aria-label="t.trial.heroDeviceName + ' · ' + claimCtaText"
    @click="onClick"  @keydown.enter.prevent="onClick" @keydown.space.prevent="onClick">
    <view class="nx-home-glass-panel" aria-hidden="true" />
    <view class="trial-aura" aria-hidden="true" />
    <view class="trial-art nx-home-art-float" aria-hidden="true"><view class="nx-home-art" /></view>
    <view class="trial-meta">
      <text class="trial-badge">{{ t.trial.heroBadge }}</text>
      <text class="trial-title">{{ t.trial.heroDeviceName }}</text>
      <text class="trial-tagline">{{ taglineText }}</text>
      <view class="trial-estimate">
        <text class="trial-estimate-label">{{ earnLabelText }}</text>
        <text class="trial-value font-mono-tabular">${{ est }}</text>
      </view>
      <text class="trial-estimate-label">{{ creditBasisText }}</text>
      <view class="trial-cta nx-home-pill" aria-hidden="true">
        <text>{{ claimCtaText }}</text>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
      </view>
    </view>
      <view v-if="trial.authorityStatus === 'error'" role="button" tabindex="0" :aria-label="t.trial.entryRetry"
        style="padding: 8px 16px" @click.stop="retryEligibility"  @keydown.enter.stop.prevent="retryEligibility" @keydown.space.stop.prevent="retryEligibility">
        <text>{{ t.trial.entryRetry }}</text>
      </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { useFreeTrial } from "@/store/free-trial";
import { useTrialConfig, computeTrialOffset } from "@/store/trial-config";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useScrollGrowProgress } from "@/composables/use-scroll-grow-progress";

const trial = useFreeTrial();
const trialCfg = useTrialConfig();
const claimSheet = useTrialClaimSheet();
const t = useT();

// Entrance plays once the coupon scrolls into view (not on mount).
const { elRef, inView } = useScrollGrowProgress({ threshold: 0.25 });
const played = ref(false);
watch(inView, (v) => {
  if (v) played.value = true;
});

const eligibility = computed(() => trial.eligibility());
const canClaim = computed(() => trial.status === "none"
  && (eligibility.value.ok || trial.confirmedOfferState() === "claimable"));
const productUnavailable = computed(() => eligibility.value.reason === "product-unavailable");
const visible = computed(() => trial.status === "none"
  && trialCfg.config.seatsLeftToday > 0
  && trial.showHeroPromo());

const trialDays = computed(() => trialCfg.config.trialDays);
const dailyEarn = computed(() => trialCfg.config.shadowDailyUSD);
// The hero quotes the SAME creditable amount every other surface quotes: the
// trial-earnings offset is capped (trialOffsetCapUSD), so the raw
// days × shadowDailyUSD accrual is NOT what the user can offset. /me/trial and
// checkout both go through computeTrialOffset; quoting the uncapped accrual
// here overstated the benefit by the whole over-cap remainder (BUG 78).
const trialOffset = computed(() => computeTrialOffset(trialCfg.config, trialDays.value * dailyEarn.value));
const est = computed(() => Math.round(trialOffset.value.offsetUSD));
const taglineText = computed(() => fmt(t.value.trial.heroTagline, { days: trialDays.value }));
const earnLabelText = computed(() => fmt(t.value.trial.heroEarnLabel, { days: trialDays.value }));
const trialsLeftText = computed(() => fmt(t.value.trial.heroTrialsLeft, { n: trialCfg.config.seatsLeftToday }));
const availabilityText = computed(() => productUnavailable.value
  ? t.value.trial.heroProductUnavailable
  : trialsLeftText.value);
// CTA text follows the RETAINED offer state (BUG 14): an in-flight poll must
// not swap the label and re-lay-out the ticket while the confirmed offer is
// still the last thing the server told us. onClick stays gated by canClaim.
const claimCtaText = computed(() => {
  switch (trial.confirmedOfferState()) {
    case "claimable": return t.value.trial.heroClaimCta;
    case "error": return t.value.trial.entryUnavailable;
    case "unavailable": return t.value.store.temporarilyOutOfStock;
    default: return t.value.trial.entryChecking;
  }
});
const dailyEarnText = computed(() => `${dailyEarn.value.toFixed(2)}/d × ${trialDays.value}`);
// State the basis when the cap bites: the daily rate line alone would read as if
// the total were days × rate, which is exactly the overstatement BUG 78 reported.
const creditBasisText = computed(() => trialOffset.value.offsetUSD < trialDays.value * dailyEarn.value
  ? fmt(t.value.trial.heroCreditCapNote, { cap: trialCfg.config.trialOffsetCapUSD.toFixed(0) })
  : dailyEarnText.value);

const availabilityDotStyle = computed<CSSProperties>(() => ({
  width: "6px",
  height: "6px",
  borderRadius: "50%",
  background: canClaim.value ? "var(--v5-quest-ember)" : "var(--v5-ink-4)",
  boxShadow: canClaim.value ? "0 0 6px color-mix(in srgb, var(--v5-quest-ember) 70%, transparent)" : "none",
  animation: canClaim.value ? "v5-hb-pulse 1.6s ease-in-out infinite" : "none",
}));
const claimCtaStyle = computed<CSSProperties>(() => ({
  padding: "8px 14px",
  borderRadius: "999px",
  background: canClaim.value ? "transparent" : "var(--v5-surface-2)",
  color: canClaim.value ? "var(--v5-quest-violet-ink)" : "var(--v5-ink-4)",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  border: canClaim.value ? "1px solid color-mix(in srgb, var(--v5-quest-violet-ink) 45%, transparent)" : "1px solid var(--v5-border)",
  gap: "5px",
  letterSpacing: "-0.005em",
  whiteSpace: "nowrap",
  flexShrink: 0,
}));

const COUPON_MASK =
  "radial-gradient(circle at 62% 0, transparent 7px, #000 7.5px), " +
  "radial-gradient(circle at 62% 100%, transparent 7px, #000 7.5px)";

const rootStyle = computed<CSSProperties>(() => ({
  position: "relative",
  marginTop: "12px",
  color: "var(--v5-ink)",
  transformOrigin: "50% 50%",
  transformStyle: "preserve-3d",
  backfaceVisibility: "hidden",
  // Before play: opacity 0 (no flash of finished state); on play: 3D Y-flip in.
  opacity: played.value ? undefined : 0,
  animation: played.value ? "v5-ticket-enter 900ms cubic-bezier(0.22, 1.2, 0.36, 1) both" : "none",
  WebkitMaskImage: COUPON_MASK,
  WebkitMaskComposite: "source-in",
  maskImage: COUPON_MASK,
  maskComposite: "intersect",
}));

const bodyStyle: CSSProperties = {
  borderRadius: "16px",
  background:
    "radial-gradient(70% 60% at 0% 0%, color-mix(in srgb, var(--v5-quest-violet) 18%, transparent), transparent 60%), " +
    "radial-gradient(80% 100% at 100% 100%, color-mix(in srgb, var(--v5-quest-violet) 12%, transparent), transparent 65%), " +
    "var(--v5-surface)",
  overflow: "hidden",
  position: "relative",
  boxShadow: "var(--v5-card-shadow-lift)",
};

const shimmerStyle = computed<CSSProperties>(() => ({
  position: "absolute",
  inset: "0",
  pointerEvents: "none",
  zIndex: 2,
  overflow: "hidden",
  background: "linear-gradient(100deg, transparent 25%, rgba(198,255,58,0.55) 50%, transparent 75%)",
  animation: played.value ? "v5-ticket-shimmer 1100ms ease-out 850ms 1 forwards" : "none",
  opacity: 0,
  mixBlendMode: "screen",
}));

function onClick() {
  if (!canClaim.value) return;
  claimSheet.show();
}

function retryEligibility() {
  if (trial.authorityStatus !== "error") return;
  void trial.refreshEligibilityRemote();
}


</script>

<style scoped>
.nx-trial-hero { min-height: 216px; padding: 18px 24px; border-radius: var(--v5-radius-2xl); color: var(--v5-ink); }
.trial-meta { position: relative; width: 60%; }
.trial-badge { display: inline-block; max-width: 100%; padding: 4px 10px; border-radius: var(--v5-radius-full); background: var(--v5-brand-soft); color: var(--v5-brand); font: 600 12px/1.4 var(--font-v5); overflow-wrap: anywhere; }
.trial-title { display: block; margin-top: 8px; font: 600 20px/1.25 var(--font-v5); letter-spacing: -.02em; overflow-wrap: anywhere; }
.trial-tagline { display: block; margin-top: 5px; font: 400 13px/1.5 var(--font-v5); color: var(--v5-ink-2); }
.trial-estimate { margin-top: 12px; }
.trial-estimate-label { display: block; font-size: 12px; line-height: 1.4; color: var(--v5-ink-2); }
.trial-value { display: block; margin-top: 3px; font: 600 26px/1.15 var(--font-v5); }
.trial-cta { display: inline-flex; max-width: 100%; gap: 8px; margin-top: 12px; padding: 8px 18px; font: 600 15px/1.4 var(--font-v5); }
.trial-cta text { white-space: normal; overflow-wrap: anywhere; }
.trial-cta svg { flex: none; }
.trial-art { position: absolute; width: 43%; aspect-ratio: 1; right: 0; top: 50%; margin-top: -21.5%; pointer-events: none; }
.trial-art .nx-home-art { width: 100%; height: 100%; background-image: url('/static/img/home-glass-20260928/s1.webp'); }
.trial-aura { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(ellipse at 83% 54%, color-mix(in srgb, var(--v5-brand) 12%, transparent), transparent 65%); }
@media (max-width: 350px) {
  .nx-trial-hero { padding: 18px; }
  .trial-meta { width: 62%; }
  .trial-art { width: 39%; margin-top: -19.5%; }
  .trial-cta { padding-inline: 14px; }
}
</style>
