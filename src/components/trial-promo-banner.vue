<!--
  TrialPromoBanner — the idle free-trial promo, shared by Home and the Me page.
  Flat prompt: benefit headline + zero-commitment subtext (left) and a restrained
  soft-tint "Claim now" CTA (right), with generous top/bottom breathing so it reads
  as a light prompt amid the surrounding cards. No card chrome, no leading icon.
  The last confirmed promotion stays mounted during refresh, while claiming
  requires current authority. A failed refresh offers a read-only retry.

  Single source of truth for this card — used by both pages/index/index.vue and
  components/me/trial-entry.vue so design tweaks land in one place.
-->
<template>
  <view v-if="visible" class="block" :style="bannerOuterStyle">
    <view class="flex items-center" :style="bannerBodyStyle" data-me-action="trial-claim" role="button" :tabindex="canClaim ? 0 : -1" :aria-disabled="!canClaim" :aria-busy="trial.authorityStatus === 'loading'" :aria-label="t.trial.entryBenefitTitle" @click="openClaim" @keydown.enter.prevent="openClaim" @keydown.space.prevent="openClaim">
      <!-- Copy — left-aligned -->
      <view style="flex: 1; min-width: 0">
        <text class="block" :style="headlineStyle">{{ t.trial.entryBenefitTitle }}</text>
        <text class="block" :style="subStyle">{{ offerDesc }}</text>
      </view>

      <!-- CTA — right-aligned -->
      <view class="inline-flex items-center shrink-0 active:opacity-70" :style="claimBtnStyle">
        <text>{{ claimLabel }}</text>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 4px"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
    </view>
    <view v-if="trial.authorityStatus === 'error'" role="button" tabindex="0" data-me-action="trial-retry" :aria-label="t.trial.entryRetry" @click="retryEligibility" @keydown.enter.prevent="retryEligibility" @keydown.space.prevent="retryEligibility">
      <text>{{ t.trial.entryRetry }}</text>
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
const visible = computed(() => !isActive.value && trial.showPromo());
// BUG 173: 已确认可领取的快照在后台重拉期间保持可点。放开的只是**入口**,
// 不是权限 —— 真正下发领取命令的 start() 自己会先做一次权威资格读取并
// fail-closed(读取失败/过期一律拒绝);读失败时 confirmedOfferState() 回落
// 到 "error",入口重新关闭。首帧无任何快照时仍然不可点。
const canClaim = computed(() => trial.canStart() || trial.confirmedOfferState() === "claimable");
// Action label follows the RETAINED offer state, not the in-flight read: a
// background poll must not swap "马上领取" for "正在核实资格" and re-layout the
// card (BUG 56). Clicking is still gated by canClaim.
const claimLabel = computed(() => {
  switch (trial.confirmedOfferState()) {
    case "claimable": return t.value.trial.entryClaimCta;
    case "error": return t.value.trial.entryUnavailable;
    case "unavailable": return t.value.trial.entryUnavailable;
    default: return t.value.trial.entryChecking;
  }
});

const cfg = computed(() => trialConfig.config);
const offerDesc = computed(() => fmt(t.value.trial.entryDescription, { days: cfg.value.trialDays }));

function openClaim() {
  if (!canClaim.value) return;
  claimSheet.show();
}

function retryEligibility() {
  if (trial.authorityStatus !== "error") return;
  void trial.refreshEligibilityRemote();
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
