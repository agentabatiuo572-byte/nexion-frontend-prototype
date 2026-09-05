<!--
  TrialPromoBanner — the idle free-trial promo, shared by Home and the Me page.
  Flat prompt: benefit headline + zero-commitment subtext (left) and a restrained
  soft-tint "Claim now" CTA (right), with generous top/bottom breathing so it reads
  as a light prompt amid the surrounding cards. No card chrome, no leading icon.
  Visible only while the trial is idle & startable; tapping anywhere opens the
  trial-claim sheet, where the full value, limits, and terms are shown.

  Single source of truth for this card — used by both pages/index/index.vue and
  components/me/trial-entry.vue so design tweaks land in one place.
-->
<template>
  <view v-if="visible" class="block active:opacity-90" :style="bannerOuterStyle" role="button" tabindex="0" :aria-label="t.trial.entryBenefitTitle" @click="openClaim">
    <view class="flex items-center" :style="bannerBodyStyle">
      <!-- Copy — left-aligned -->
      <view style="flex: 1; min-width: 0">
        <text class="block" :style="headlineStyle">{{ t.trial.entryBenefitTitle }}</text>
        <text class="block" :style="subStyle">{{ offerDesc }}</text>
      </view>

      <!-- CTA — right-aligned -->
      <view class="inline-flex items-center shrink-0 active:opacity-70" :style="claimBtnStyle">
        <text>{{ t.trial.entryClaimCta }}</text>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useFreeTrial } from "@/store/free-trial";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { useTrialConfig } from "@/store/trial-config";

const t = useT();
const trial = useFreeTrial();
const claimSheet = useTrialClaimSheet();
const trialConfig = useTrialConfig();

const isActive = computed(() => trial.status === "active" || trial.status === "grace");
const visible = computed(() => !isActive.value && trial.canStart());

const cfg = computed(() => trialConfig.config);
const offerDesc = computed(() => fmt(t.value.trial.entryDescription, { days: cfg.value.trialDays }));

function openClaim() {
  claimSheet.show();
}

// ── styles ──
const bannerOuterStyle: CSSProperties = {};
const bannerBodyStyle: CSSProperties = {
  gap: "14px",
  padding: "18px 0",
};
const headlineStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.01em",
  lineHeight: 1.35,
};
const subStyle: CSSProperties = {
  marginTop: "4px",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.35,
};
const claimBtnStyle: CSSProperties = {
  height: "32px",
  padding: "0 13px",
  background: "color-mix(in srgb, var(--v5-success) 10%, transparent)",
  borderRadius: "999px",
  color: "var(--v5-success-ink)",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};
</script>
