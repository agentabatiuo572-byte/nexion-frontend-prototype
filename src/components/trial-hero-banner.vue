<!-- Trial eligibility and claim flow remain owned by the existing trial stores. -->
<template>
  <view v-if="visible" class="nx-trial-hero" :class="{ 'nx-trial-hero--embedded': embedded, 'nx-trial-hero--long-copy': embedded && locale.code !== 'zh' }" role="button" :tabindex="canClaim ? 0 : -1" :aria-disabled="canClaim ? 'false' : 'true'"
    :aria-busy="trial.authorityStatus === 'loading'" :aria-label="t.trial.heroDeviceName + ' · ' + claimCtaText"
    @click="onClick"  @keydown.enter.prevent="onClick" @keydown.space.prevent="onClick">
    <view class="trial-aura" aria-hidden="true" />
    <view class="trial-art" aria-hidden="true"><view class="nx-home-art" /></view>
    <view class="trial-meta">
      <text class="trial-badge">{{ embedded ? fmt(copy.freeTrialDays,{n:trialDays}) : t.trial.heroBadge }}</text>
      <text class="trial-title">{{ t.trial.heroDeviceName }}</text>
      <view v-if="embedded" class="trial-reassurance"><text>{{ t.trial.homeFreeTrial }}</text><text>{{ t.trial.homeNoPayment }}</text></view>
      <template v-if="!embedded"><text class="trial-tagline">{{ taglineText }}</text><view class="trial-estimate"><text class="trial-estimate-label">{{ earnLabelText }}</text><text class="trial-value font-mono-tabular">${{ formatAmount(est) }}</text></view><text class="trial-estimate-label">{{ creditBasisText }}</text></template>
    </view>
    <view class="trial-cta nx-design-glass" aria-hidden="true"><LiquidGlass :radius="999" tone="control" /><text>{{ canClaim && embedded ? t.voucher.bannerCta : claimCtaText }}</text></view>
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
import { useLocaleStore } from "@/store/locale";
import { fmt } from "@/i18n/format";
import { useAuditUiCopy } from '@/i18n/audit-ui';
import LiquidGlass from "@/components/liquid-glass.vue";

defineProps<{ embedded?: boolean }>();

const trial = useFreeTrial();
const trialCfg = useTrialConfig();
const claimSheet = useTrialClaimSheet();
const t = useT(), copy = useAuditUiCopy();
const locale = useLocaleStore();

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
.trial-cta.nx-design-glass :deep(.nx-liquid-tint) { box-shadow: inset 0 1px 0 rgba(var(--ui-glass-rgb),.42), inset 0 -1px 1px rgba(var(--ui-glass-rgb),.08), inset 0 0 14px rgba(var(--ui-glass-rgb),.05); }
.trial-cta text { white-space: normal; overflow-wrap: anywhere; }
.trial-cta svg { flex: none; }
.trial-art { position: absolute; width: 43%; aspect-ratio: 1; right: 0; top: 50%; margin-top: -21.5%; pointer-events: none; }
.trial-art .nx-home-art { width: 100%; height: 100%; background-image: url('/static/img/home-glass-20260928/s1.webp'); }
.trial-aura { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(ellipse at 83% 54%, color-mix(in srgb, var(--v5-brand) 12%, transparent), transparent 65%); }
.nx-trial-hero--embedded { min-height:0;height:184px;min-width:0;padding:0;border:1px solid var(--v5-border);background:radial-gradient(70% 45% at 70% 92%,color-mix(in srgb,var(--v5-brand) 22%,transparent),transparent 70%),linear-gradient(180deg,var(--ui-trial-top),var(--ui-ticket-bottom)); }
.nx-trial-hero--embedded .trial-art { position:absolute;right:-6px;bottom:8px;top:auto;width:118px;height:118px;margin:0; }
.nx-trial-hero--embedded .trial-art .nx-home-art { width:118px;height:118px;margin:0; animation:trial-home-float 4.2s ease-in-out infinite; }
@keyframes trial-home-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
.nx-trial-hero--embedded .trial-aura {inset:auto;right:6px;bottom:18px;width:110px;height:22px;background:radial-gradient(closest-side,rgba(158,220,29,.42),transparent);filter:blur(2px);}
.nx-trial-hero--embedded .trial-meta { position:relative;width:auto;padding:14px 14px 0; }
.nx-trial-hero--embedded .trial-badge { display:block;padding:0;background:none;border-radius:0;color:var(--ui-lime-soft);font:500 12.5px/20px var(--font-v5); }
.nx-trial-hero--embedded .trial-title { font:600 18px/22px var(--font-v5);margin-top:8px;letter-spacing:0; }
.trial-reassurance { display:flex;flex-direction:column;max-width:110px;margin-top:6px;font:400 13px/18px var(--font-v5);color:var(--v5-ink-3); }
.nx-trial-hero--embedded .trial-cta { position:absolute;left:14px;bottom:14px;min-height:32px;margin:0;padding:0 14px;font:600 13px/1.3 var(--font-v5); }
.nx-trial-hero--long-copy { display:flex;flex-direction:column;box-sizing:border-box;height:auto;min-height:200px; }
.nx-trial-hero--long-copy .trial-meta { order:1; }
.nx-trial-hero--long-copy .trial-reassurance { max-width:none; }
.nx-trial-hero--long-copy .trial-art { position:relative;order:2;align-self:flex-end;right:-6px;bottom:auto;flex:none;width:102px;height:102px;margin:0 0 8px; }
.nx-trial-hero--long-copy .trial-art .nx-home-art { width:102px;height:102px; }
@media(max-width:350px) {
  .nx-trial-hero--embedded { display:flex;flex-direction:column;box-sizing:border-box;height:auto;min-height:200px; }
  .nx-trial-hero--embedded .trial-meta { order:1;padding-inline:12px; }
  .nx-trial-hero--embedded .trial-title { font-size:16px; }
  .nx-trial-hero--embedded .trial-art { position:relative;order:2;align-self:flex-end;right:-6px;bottom:auto;flex:none;width:92px;height:92px;margin:0 0 8px; }
  .nx-trial-hero--embedded .trial-art .nx-home-art {width:92px;height:92px;}
}
@media (prefers-reduced-motion: reduce) { .nx-trial-hero { transition: none; } .nx-trial-hero--embedded .trial-art .nx-home-art { animation:none; } }
@media (max-width: 350px) {
  .nx-trial-hero:not(.nx-trial-hero--embedded) { padding: 18px; }
  .nx-trial-hero:not(.nx-trial-hero--embedded) .trial-meta { width: 62%; }
  .nx-trial-hero:not(.nx-trial-hero--embedded) .trial-art { width: 39%; margin-top: -19.5%; }
  .trial-cta { padding-inline: 14px; }
}
</style>
