<!-- Trial eligibility and claim flow remain owned by the existing trial stores. -->
<template>
  <view v-if="visible" class="nx-trial-hero nx-home-glass-item" role="button" tabindex="0"
    :aria-label="t.trial.heroDeviceName + ' · ' + t.trial.heroClaimCta"
    @click="onClick" @keydown.enter.stop.prevent="onClick" @keydown.space.stop.prevent="onClick">
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
      <view class="trial-cta nx-home-pill" aria-hidden="true">
        <text>{{ t.trial.heroClaimCta }}</text>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useFreeTrial } from "@/store/free-trial";
import { useTrialConfig } from "@/store/trial-config";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";

const trial = useFreeTrial();
const trialCfg = useTrialConfig();
const claimSheet = useTrialClaimSheet();
const t = useT();
const visible = computed(() => trial.status === "none" && trial.canStart());
const trialDays = computed(() => trialCfg.config.trialDays);
const dailyEarn = computed(() => trialCfg.config.shadowDailyUSD);
const est = computed(() => Math.round(trialDays.value * dailyEarn.value));
const taglineText = computed(() => fmt(t.value.trial.heroTagline, { days: trialDays.value }));
const earnLabelText = computed(() => fmt(t.value.trial.heroEarnLabel, { days: trialDays.value }));
function onClick() { claimSheet.show(); }
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
.trial-art .nx-home-art { width: 100%; height: 100%; background-position: 0 100%; }
.trial-aura { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(ellipse at 83% 54%, color-mix(in srgb, var(--v5-brand) 12%, transparent), transparent 65%); }
@media (max-width: 350px) {
  .nx-trial-hero { padding: 18px; }
  .trial-meta { width: 62%; }
  .trial-art { width: 39%; margin-top: -19.5%; }
  .trial-cta { padding-inline: 14px; }
}
</style>
