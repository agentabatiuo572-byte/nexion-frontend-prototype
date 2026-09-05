<!--
  TrialEntry — ported from me/page.tsx TrialEntry (Sprint #146-2).
  Two states, self-deciding:
   • active/grace → compact status row ("Trial · {state}" → /me/trial).
   • else         → <TrialPromoBanner> (idle free-trial ad banner, shared
                    with Home; self-hides unless the trial is startable).
  Reads useFreeTrial for the active/idle split; the promo banner owns its own
  store reads + claim-sheet trigger.
-->
<template>
  <!-- Active-state row -->
  <view v-if="isActive" class="block active:opacity-90" :style="activeRowStyle" role="button" tabindex="0" :aria-label="activeTitle" @click="goTrial">
    <view style="flex: 1; min-width: 0">
      <text class="block" style="font-family: var(--font-v5); font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ activeTitle }}</text>
      <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 2px; font-family: var(--font-jet-mono), ui-monospace, monospace">{{ t.trial.entryDeviceName }}</text>
    </view>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
  </view>

  <!-- Idle → shared free-trial promo banner -->
  <TrialPromoBanner v-else />
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useFreeTrial } from "@/store/free-trial";
import TrialPromoBanner from "@/components/trial-promo-banner.vue";

const t = useT();
const trial = useFreeTrial();

const status = computed(() => trial.status);
const isActive = computed(() => status.value === "active" || status.value === "grace");

const stateLabel = computed(() =>
  status.value === "grace" ? t.value.trial.activeStateGrace : t.value.trial.activeStateActive,
);
const activeTitle = computed(() => fmt(t.value.trial.activeTitle, { state: stateLabel.value }));

function goTrial() {
  uni.navigateTo({ url: "/pages/me/trial", fail: () => {} });
}

// ── styles ──
const activeRowStyle: CSSProperties = {
  marginTop: "10px",
  padding: "14px 16px",
  background: "var(--v5-surface)",
  borderRadius: "16px",
  display: "flex",
  alignItems: "center",
  gap: "12px",
};
</script>
