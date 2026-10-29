<!-- Trial eligibility and claim flow remain owned by the existing trial stores. -->
<template>
  <view v-if="visible" class="nx-trial-hero" :class="{ 'nx-trial-hero--embedded': embedded, 'nx-trial-hero--long-copy': embedded && locale.code !== 'zh', 'nx-trial-hero--lifecycle': hasLifecycle || capacityFull, 'nx-trial-hero--card-entry': cardEntry }" :data-trial-state="status" :role="cardEntry ? 'button' : undefined" :tabindex="cardEntry ? 0 : undefined" :aria-label="cardEntry ? `${badgeText} · ${trialView.deviceName.value ?? t.trial.heroDeviceName} · ${ctaText}` : undefined" :aria-busy="trial.authorityStatus === 'loading'" @click="onClick" @keydown.enter.self.prevent="cardEntry && onClick()" @keydown.space.self.prevent="cardEntry && onClick()">
    <view v-if="!embedded" class="trial-aura" aria-hidden="true" />
    <view class="trial-art" aria-hidden="true"><view class="trial-floor" /><view class="nx-home-art" /></view>
    <view class="trial-meta">
      <view v-if="(cardEntry || !embedded) && (status === 'active' || status === 'grace')" class="trial-status-row"><text class="trial-badge" :aria-label="badgeText">{{ status === 'active' ? lifecycleCopy.cardActiveTitle : lifecycleCopy.cardGraceTitle }}</text><text class="trial-header-countdown" :aria-label="`${status === 'grace' ? lifecycleCopy.creditUntilLabel : lifecycleCopy.remainingLabel} ${remainingText}`">{{ cardRemainingText }}</text></view>
      <text v-else class="trial-badge">{{ badgeText }}</text>
      <text class="trial-title">{{ trialView.deviceName.value ?? t.trial.heroDeviceName }}</text>
      <template v-if="status === 'active' || status === 'grace'">
        <text v-if="!embedded" class="trial-tagline">{{ durationText }}</text>
        <view v-else class="trial-lifecycle-credit"><text>{{ lifecycleCopy.creditLabel }}</text><text class="font-mono-tabular">{{ visibility.mask(creditText) }}</text></view>
      </template>
      <text v-else-if="status === 'ended' || status === 'converted'" class="trial-lifecycle-body">{{ status === 'ended' ? lifecycleCopy.endedBody : lifecycleCopy.convertedBody }}</text>
      <template v-else>
        <view v-if="embedded && !capacityFull" class="trial-reassurance"><text>{{ t.trial.homeNoPayment }}</text></view>
        <text v-else-if="!embedded" class="trial-tagline">{{ taglineText }}</text>
      </template>
      <text v-if="capacityFull && !hasLifecycle" class="trial-lifecycle-body">{{ embedded ? lifecycleCopy.cardCapacityFull : lifecycleCopy.capacityFull }}</text>
    </view>
    <template v-if="!embedded">
      <view class="trial-rule" aria-hidden="true" />
      <view v-if="status === 'active' || status === 'grace'" class="trial-figure trial-lifecycle-credit"><text class="trial-figure__label">{{ lifecycleCopy.creditLabel }}</text><text class="trial-amount nx-num-amount"><text class="trial-amount__minor">{{ creditParts.currency }}</text>{{ creditParts.whole }}<text class="trial-amount__minor">{{ creditParts.cents }}</text></text></view>
      <view v-else-if="!hasLifecycle" class="trial-figure"><text class="trial-figure__label">{{ t.trial.heroEarnLabel }}</text><text class="trial-amount trial-value nx-num-amount"><text class="trial-amount__minor">{{ estimateParts.currency }}</text>{{ estimateParts.whole }}<text class="trial-amount__minor">{{ estimateParts.cents }}</text></text></view>
    </template>
    <view v-if="!cardEntry" class="trial-cta" :class="{ 'trial-cta--brand': !embedded && (canRestart || !hasLifecycle && !capacityFull) }" role="button" :tabindex="canOpen ? 0 : -1" :aria-disabled="canOpen ? 'false' : 'true'" :aria-label="ctaText" @click.stop="onClick" @keydown.enter.stop.prevent="onClick" @keydown.space.stop.prevent="onClick"><view class="trial-cta__surface nx-frosted-button"><text>{{ embedded && capacityFull ? lifecycleCopy.cardManage : embedded && canClaim ? t.trial.homeClaimShort : ctaText }}</text></view></view>
      <view v-if="trial.authorityStatus === 'error'" role="button" tabindex="0" :aria-label="t.trial.entryRetry"
        class="trial-retry" @click.stop="retryEligibility">
        <text>{{ t.trial.entryRetry }}</text>
      </view>
  </view>
</template>

<script setup lang="ts">
import { formatAmount } from "@/lib/amount-display";
import { computed } from "vue";
import { useDataVisibility } from "@/store/data-visibility";
import { useFreeTrial } from "@/store/free-trial";
import { useTrialConfig } from "@/store/trial-config";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { fmt } from "@/i18n/format";
import { useAuditUiCopy } from '@/i18n/audit-ui';
import { useTrialLifecycleCopy, formatTrialRemaining } from '@/i18n/trial-lifecycle';
import { useTrialPresentation } from '@/composables/use-trial-presentation';
import { navTo } from '@/lib/route';

const props = defineProps<{ embedded?: boolean }>();
const visibility = useDataVisibility();

const trial = useFreeTrial();
const trialCfg = useTrialConfig();
const trialView = useTrialPresentation();
const claimSheet = useTrialClaimSheet();
const t = useT(), copy = useAuditUiCopy();
const locale = useLocaleStore();
const lifecycleCopy = useTrialLifecycleCopy();
const status = computed(() => trialView.status.value);
const hasLifecycle = computed(() => status.value !== null && status.value !== 'none');

const eligibility = computed(() => trial.eligibility());
const canRestart = computed(() => status.value === 'ended' && eligibility.value.ok);
const canClaim = computed(() => trial.status === "none"
  && trial.authorityStatus !== 'error'
  && (eligibility.value.ok || trial.confirmedOfferState() === "claimable"));
const productUnavailable = computed(() => eligibility.value.reason === "product-unavailable");
const capacityFull = computed(() => eligibility.value.reason === 'capacity-full');
const visible = computed(() => trial.status === "none"
  && trialCfg.config.seatsLeftToday > 0
  && (trial.showHeroPromo() || capacityFull.value) || hasLifecycle.value);
const canOpen = computed(() => hasLifecycle.value || canClaim.value || capacityFull.value);
const cardEntry = computed(() => props.embedded && hasLifecycle.value);

const trialDays = computed(() => trialView.config.value?.trialDays ?? trialCfg.config.trialDays);
// The hero quotes the SAME creditable amount every other surface quotes: the
// trial-earnings offset is capped (trialOffsetCapUSD), so the raw
// days × shadowDailyUSD accrual is NOT what the user can offset. /me/trial and
// checkout both go through computeTrialOffset; quoting the uncapped accrual
// here overstated the benefit by the whole over-cap remainder (BUG 78).
const estimateText = computed(() => trialView.estimatedOffsetUSD.value === null ? '-' : `$${formatAmount(trialView.estimatedOffsetUSD.value)}`);
const creditText = computed(() => trialView.offsetUSD.value === null ? '-' : `$${formatAmount(trialView.offsetUSD.value)}`);
const remainingText = computed(() => trialView.remainingMs.value === null ? '-' : formatTrialRemaining(trialView.remainingMs.value, lifecycleCopy.value.longRemaining));
const cardRemainingText = computed(() => {
  if (trialView.remainingMs.value === null) return '-';
  const minutes = Math.max(0, Math.ceil(trialView.remainingMs.value / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  return `${days}d ${hours}h:${String(minutes % 60).padStart(2, '0')}`;
});
const badgeText = computed(() => {
  if (status.value === 'active') return lifecycleCopy.value.activeTitle;
  if (status.value === 'grace') return lifecycleCopy.value.graceTitle;
  if (status.value === 'ended') return lifecycleCopy.value.endedTitle;
  if (status.value === 'converted') return lifecycleCopy.value.convertedTitle;
  return t.value.trial.heroBadge;
});
const taglineText = computed(() => fmt(t.value.trial.heroTagline, { days: trialDays.value }));
const durationText = computed(() => fmt(lifecycleCopy.value.durationDays, { days: trialDays.value }));
// Design system amount: currency sign and cents in the muted colour, whole part in the main colour.
const amountParts = (text: string) => { const match = /^(\$?)(.*?)(\.\d+)?$/.exec(text)!; return { currency: match[1], whole: match[2], cents: match[3] ?? '' }; };
const estimateParts = computed(() => amountParts(estimateText.value));
const creditParts = computed(() => amountParts(creditText.value));
// CTA text follows the RETAINED offer state (BUG 14): an in-flight poll must
// not swap the label and re-lay-out the ticket while the confirmed offer is
// still the last thing the server told us. onClick stays gated by canClaim.
const claimCtaText = computed(() => {
  if (capacityFull.value) return lifecycleCopy.value.manageDevices;
  switch (trial.confirmedOfferState()) {
    case "claimable": return t.value.trial.heroClaimCta;
    case "error": return t.value.trial.entryUnavailable;
    case "unavailable": return productUnavailable.value ? t.value.trial.heroProductUnavailable : t.value.store.temporarilyOutOfStock;
    default: return t.value.trial.entryChecking;
  }
});
const ctaText = computed(() => status.value === 'converted' ? lifecycleCopy.value.viewDevices
  : canRestart.value ? t.value.trial.heroClaimCta
  : status.value === 'ended' ? lifecycleCopy.value.buyDevice
  : hasLifecycle.value ? lifecycleCopy.value.viewTrial : claimCtaText.value);

function onClick() {
  if (canRestart.value) { claimSheet.show(); return; }
  if (status.value === 'converted') { navTo('/pages/me/devices'); return; }
  if (hasLifecycle.value) { navTo('/pages/me/trial'); return; }
  if (capacityFull.value) { navTo('/pages/me/devices'); return; }
  if (!canClaim.value) return;
  claimSheet.show();
}

function retryEligibility() {
  if (trial.authorityStatus !== "error") return;
  void trialView.refresh();
}


</script>

<style scoped>
.nx-trial-hero { position: relative; overflow: hidden; isolation: isolate; min-height: 216px; padding: 18px 24px; border-radius: 22px; background: var(--v5-surface); color: var(--v5-ink); transition: transform 180ms ease; }
.nx-trial-hero:active { transform: scale(.985); }
.nx-trial-hero:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.trial-meta { position: relative; width: 60%; }
.trial-badge { display: inline-block; max-width: 100%; padding: 4px 10px; border-radius: var(--v5-radius-full); background: var(--v5-brand-soft); color: var(--v5-brand); font: 600 12px/1.4 var(--font-v5); overflow-wrap: anywhere; }
.trial-title { display: block; margin-top: 8px; font: 600 20px/1.25 var(--font-v5); letter-spacing: -.02em; overflow-wrap: anywhere; }
/* The touch target stays 44px; the glass surface can be visually compact. */
.trial-cta { position:relative;display:inline-flex;align-items:center;justify-content:center;min-height:44px;max-width:100%;margin-top:12px;border-radius:var(--v5-radius-full);font:500 13px/1.4 var(--font-v5); }
.trial-cta__surface { position:relative;isolation:isolate;display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;max-width:100%;padding:0 16px;border-radius:inherit; }
.trial-cta__surface > text { position:relative;z-index:1;white-space:normal;overflow-wrap:anywhere; }
.trial-cta:focus-visible { outline:2px solid var(--v5-brand);outline-offset:3px; }
.trial-cta[aria-disabled="true"] { opacity:.5; }
.trial-retry { position:relative;z-index:1;padding:8px 14px;font:600 13px/20px var(--font-v5);color:var(--v5-warning); }
.trial-art { position: absolute; width: 43%; aspect-ratio: 1; right: 0; top: 42%; margin-top: -21.5%; pointer-events: none; }
.trial-art .nx-home-art { position:relative;z-index:1;width:100%;height:100%;background-image:url('/static/img/home-glass-20260928/s1.webp'); }
/* Home offer (P-34 A): identity and device on top, a hairline, then the figure and its action. */
.nx-trial-hero:not(.nx-trial-hero--embedded) { display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"meta art" "rule rule" "figure cta";gap:16px 12px;align-items:center;box-sizing:border-box;min-height:0;padding:20px;border:1px solid var(--v5-border); }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-meta { grid-area:meta;display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;width:auto; }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-badge { display:inline-flex;align-items:center;box-sizing:border-box;height:24px;margin-bottom:4px;padding:0 8px;font:var(--ui-type-chip-weight) var(--ui-type-chip)/var(--ui-type-chip-lh) var(--font-v5);white-space:nowrap; }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-status-row { align-items:center;justify-content:flex-start;gap:8px;margin-bottom:4px; }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-status-row .trial-badge { margin:0; }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-header-countdown { font:400 13px/18px var(--font-jet-mono);font-variant-numeric:tabular-nums;color:var(--v5-ink); }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-title { margin:0;font:var(--ui-type-hero-title-weight) var(--ui-type-hero-title)/var(--ui-type-hero-title-lh) var(--font-v5);letter-spacing:-.01em; }
.trial-tagline,
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-lifecycle-body { margin:0;font:var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5);color:var(--v5-ink-3); }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-art { grid-area:art;position:relative;top:auto;right:auto;width:168px;height:168px;margin:-30px -20px -26px -8px; }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-art .nx-home-art { animation:trial-home-float 4.2s ease-in-out infinite; }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-floor { left:10%;bottom:6%;width:80%;height:22%;background:radial-gradient(closest-side,color-mix(in srgb,var(--v5-brand) 35%,transparent),transparent);filter:blur(6px); }
.trial-rule { grid-area:rule;height:1px;background:var(--v5-border); }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-figure { grid-area:figure;display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;margin:0; }
.trial-figure__label { font:var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5);color:var(--v5-ink-3); }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-amount { font:500 28px/36px var(--font-amount);font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--v5-ink);white-space:nowrap; }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-value { color:var(--v5-brand); }
.trial-amount__minor { color:var(--v5-ink-3);line-height:1; }
.trial-amount__minor:first-child { font-size:max(12px,.55em); }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-cta { grid-area:cta;align-self:end;justify-self:end;margin:0 0 -2px;font:var(--ui-type-button-weight) var(--ui-type-button)/var(--ui-type-button-lh) var(--font-v5); }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-cta__surface { min-height:40px;padding:0 16px; }
.trial-cta--brand .trial-cta__surface { --ui-button-fill:color-mix(in srgb,var(--v5-brand) 14%,transparent);--ui-button-ink:var(--v5-brand);--ui-button-solid:color-mix(in srgb,var(--v5-brand) 12%,var(--v5-surface)); }
.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-retry { grid-column:1 / -1; }
.trial-aura { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(circle 110px at calc(100% - 70px) 70px, color-mix(in srgb, var(--v5-brand) 14%, transparent), transparent); }
/* Each benefit has one copy zone and one full-size device zone. */
.nx-trial-hero--embedded { display:flex;flex-direction:column;box-sizing:border-box;height:100%;min-height:200px;min-width:0;padding:0;border:1px solid var(--v5-border);background:linear-gradient(180deg,var(--ui-trial-top),var(--ui-ticket-bottom)); }
.nx-trial-hero--embedded .trial-meta { position:relative;order:0;z-index:1;flex:none;width:auto;padding:12px 12px 0; }
.nx-trial-hero--embedded .trial-badge { display:block;padding:0;background:none;border-radius:0;color:var(--ui-lime-soft);font:500 12px/18px var(--font-v5); }
.nx-trial-hero--embedded .trial-title { font:600 16px/20px var(--font-v5);margin-top:6px;letter-spacing:0; }
.trial-reassurance { margin-top:4px;font:400 12px/16px var(--font-v5);color:var(--v5-ink-3); }
.nx-trial-hero--embedded .trial-art { position:relative;order:1;align-self:center;flex:none;top:auto;right:auto;bottom:auto;width:118px;height:118px;margin:2px 0 6px; }
.nx-trial-hero--embedded:not(.nx-trial-hero--card-entry) .trial-art { align-self:flex-start;margin:2px 0 14px 2px; }
.nx-trial-hero--embedded .trial-art .nx-home-art { position:relative;z-index:1;width:118px;height:118px;animation:trial-home-float 4.2s ease-in-out infinite; }
.trial-floor { position:absolute;left:10%;bottom:4px;width:80%;height:18px;border-radius:50%;background:radial-gradient(ellipse,color-mix(in srgb,var(--v5-brand) 48%,transparent),transparent 70%);filter:blur(2px);animation:trial-floor-float 4.2s ease-in-out infinite; }
@keyframes trial-home-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
@keyframes trial-floor-float { 0%,100% { transform:scaleX(1);opacity:1; } 50% { transform:scaleX(.9);opacity:.7; } }
.nx-trial-hero--embedded .trial-cta { position:absolute;right:10px;bottom:4px;z-index:2;min-height:44px;max-width:calc(100% - 20px);margin:0;font:600 12px/16px var(--font-v5); }
.nx-trial-hero--embedded .trial-cta__surface { min-height:32px;padding:8px 12px; }
.trial-lifecycle-credit { display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 6px;margin-top:6px;font:400 11px/16px var(--font-v5);color:var(--v5-ink-3); }
.trial-lifecycle-credit > text:last-child { color:var(--v5-brand);font-weight:600;font-size:14px;white-space:nowrap; }
.trial-lifecycle-body { display:block;margin-top:6px;font:400 12px/18px var(--font-v5);color:var(--v5-ink-2);overflow-wrap:anywhere; }
.nx-trial-hero--card-entry { cursor:pointer; }
.trial-status-row { display:flex;align-items:baseline;justify-content:space-between;gap:4px; }
.trial-status-row .trial-badge { white-space:nowrap; }
.trial-header-countdown { font:400 11px/18px var(--font-v5);font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--v5-ink-3); }
@media(max-width:350px) {
  .nx-trial-hero--embedded .trial-meta { padding:10px 10px 0; }
  .nx-trial-hero--embedded .trial-badge { font-size:11px;line-height:16px; }
  .nx-trial-hero--embedded .trial-title { font-size:14px;line-height:18px;margin-top:5px; }
  .nx-trial-hero--embedded .trial-reassurance { font-size:11px;line-height:16px; }
  .trial-header-countdown { font-size:10px;line-height:16px; }
  .nx-trial-hero:not(.nx-trial-hero--embedded) { padding:16px; }
  .nx-trial-hero:not(.nx-trial-hero--embedded) .trial-art { width:136px;height:136px;margin:-24px -16px -20px -8px; }
  .nx-trial-hero:not(.nx-trial-hero--embedded) .trial-amount { font-size:24px;line-height:32px; }
}
@media(prefers-reduced-motion:reduce) {
  .nx-trial-hero { transition:none; }
  .nx-trial-hero--embedded .trial-art .nx-home-art,.nx-trial-hero:not(.nx-trial-hero--embedded) .trial-art .nx-home-art,.trial-floor { animation:none; }
}
</style>
