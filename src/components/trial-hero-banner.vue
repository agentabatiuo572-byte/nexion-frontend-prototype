<!-- Trial eligibility and claim flow remain owned by the existing trial stores. -->
<template>
  <view v-if="visible" class="nx-trial-hero" :class="{ 'nx-trial-hero--embedded': embedded }" role="button" :tabindex="canClaim ? 0 : -1" :aria-disabled="canClaim ? 'false' : 'true'"
    :aria-busy="trial.authorityStatus === 'loading'" :aria-label="t.trial.heroDeviceName + ' · ' + claimCtaText"
    @click="onClick"  @keydown.enter.prevent="onClick" @keydown.space.prevent="onClick">
    <view class="trial-aura" aria-hidden="true" />
    <view class="trial-art" aria-hidden="true"><view class="nx-home-art" /></view>
    <view class="trial-meta">
      <text class="trial-badge">{{ t.trial.heroBadge }}</text>
      <text v-if="!embedded" class="trial-title">{{ t.trial.heroDeviceName }}</text>
      <text v-if="!embedded" class="trial-tagline">{{ taglineText }}</text>
      <view class="trial-estimate">
        <text class="trial-estimate-label">{{ earnLabelText }}</text>
        <text class="trial-value font-mono-tabular">${{ formatAmount(est) }}</text>
      </view>
      <text class="trial-estimate-label">{{ embedded ? t.trial.heroCreditUse : creditBasisText }}</text>
      <view class="trial-cta" aria-hidden="true">
        <LiquidGlass :radius="999" tone="control" />
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
import { formatAmount } from "@/lib/amount-display";
import { computed } from "vue";
import { useFreeTrial } from "@/store/free-trial";
import { useTrialConfig, computeTrialOffset } from "@/store/trial-config";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import LiquidGlass from "@/components/liquid-glass.vue";

defineProps<{ embedded?: boolean }>();

const trial = useFreeTrial();
const trialCfg = useTrialConfig();
const claimSheet = useTrialClaimSheet();
const t = useT();

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
const est = computed(() => trialOffset.value.offsetUSD);
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
const dailyEarnText = computed(() => `${formatAmount(dailyEarn.value)}/d × ${trialDays.value}`);
// State the basis when the cap bites: the daily rate line alone would read as if
// the total were days × rate, which is exactly the overstatement BUG 78 reported.
const creditBasisText = computed(() => trialOffset.value.offsetUSD < trialDays.value * dailyEarn.value
  ? fmt(t.value.trial.heroCreditCapNote, { cap: formatAmount(trialCfg.config.trialOffsetCapUSD) })
  : dailyEarnText.value);

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
.nx-trial-hero { position: relative; overflow: hidden; isolation: isolate; min-height: 216px; padding: 18px 24px; border-radius: 22px; background: var(--v5-surface); color: var(--v5-ink); transition: transform 180ms ease; }
.nx-trial-hero:active { transform: scale(.985); }
.nx-trial-hero:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.trial-meta { position: relative; width: 60%; }
.trial-badge { display: inline-block; max-width: 100%; padding: 4px 10px; border-radius: var(--v5-radius-full); background: var(--v5-brand-soft); color: var(--v5-brand); font: 600 12px/1.4 var(--font-v5); overflow-wrap: anywhere; }
.trial-title { display: block; margin-top: 8px; font: 600 20px/1.25 var(--font-v5); letter-spacing: -.02em; overflow-wrap: anywhere; }
.trial-tagline { display: block; margin-top: 5px; font: 400 13px/1.5 var(--font-v5); color: var(--v5-ink-2); }
.trial-estimate { margin-top: 12px; }
.trial-estimate-label { display: block; font-size: 12px; line-height: 1.4; color: var(--v5-ink-2); }
.trial-value { display: block; margin-top: 3px; font: 600 26px/1.15 var(--font-v5); }
.trial-cta { position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; min-height: 44px; max-width: 100%; gap: 8px; margin-top: 12px; padding: 0 16px; border-radius: 999px; font: 600 14px/1.4 var(--font-v5); }
.trial-cta > text, .trial-cta > svg { position: relative; z-index: 1; }
.trial-cta text { white-space: normal; overflow-wrap: anywhere; }
.trial-cta svg { flex: none; }
.trial-art { position: absolute; width: 43%; aspect-ratio: 1; right: 0; top: 50%; margin-top: -21.5%; pointer-events: none; }
.trial-art .nx-home-art { width: 100%; height: 100%; background-image: url('/static/img/home-glass-20260928/s1.webp'); }
.trial-aura { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(ellipse at 83% 54%, color-mix(in srgb, var(--v5-brand) 12%, transparent), transparent 65%); }
.nx-trial-hero--embedded { min-width: 0; min-height: 0; padding: 0; display: flex; flex-direction: column; }
.nx-trial-hero--embedded .trial-art { position: relative; width: 100%; height: 116px; aspect-ratio: auto; top: auto; right: auto; margin: 0; }
.nx-trial-hero--embedded .trial-art .nx-home-art { width: 150px; height: 150px; margin: -16px auto 0; }
.nx-trial-hero--embedded .trial-meta { width: auto; flex: 1; padding: 12px 16px 16px; display: flex; flex-direction: column; }
.nx-trial-hero--embedded .trial-badge { padding: 0; background: none; border-radius: 0; color: var(--v5-ink); font-size: 17px; line-height: 1.3; }
.nx-trial-hero--embedded .trial-estimate { margin-top: 6px; }
.nx-trial-hero--embedded .trial-value { font-size: 26px; }
.nx-trial-hero--embedded .trial-meta > .trial-estimate-label { margin: 4px 0 12px; }
.nx-trial-hero--embedded .trial-cta { align-self: flex-start; margin-top: auto; }
@media (prefers-reduced-motion: reduce) { .nx-trial-hero { transition: none; } }
@media (max-width: 350px) {
  .nx-trial-hero:not(.nx-trial-hero--embedded) { padding: 18px; }
  .nx-trial-hero:not(.nx-trial-hero--embedded) .trial-meta { width: 62%; }
  .nx-trial-hero:not(.nx-trial-hero--embedded) .trial-art { width: 39%; margin-top: -19.5%; }
  .trial-cta { padding-inline: 14px; }
}
</style>
