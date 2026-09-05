<!--
  StakePositionRow — active/matured/closed staking position card
  (staking/page.tsx StakePositionRow). Progress bar + 3-cell grid + claim /
  early-withdraw / track actions. `now` is passed from the page (which ticks
  every 4s) so progress + remaining days stay live without a per-row timer.
  Claim / early-withdraw emit to the page (cross-store composition lives there).
-->
<template>
  <view :style="cardStyle">
    <!-- row1: principal + term-chip -->
    <view class="flex items-baseline justify-between">
      <text class="block tabular-nums" :style="principalStyle">${{ amountText }}</text>
      <view class="flex items-center" style="gap: 6px">
        <text :style="termChipStyle">{{ p.termDays }}d · {{ apyPct }}% APY</text>
        <text v-if="isClaimed" :style="statusChipStyle('var(--v5-success)')">{{ t.stakingV3.position.claimed }}</text>
        <text v-if="isEarlyOut" :style="statusChipStyle('var(--v5-brand-2)')">{{ t.stakingV3.position.earlyWithdrew }}</text>
        <text v-if="isMatured && !isClaimed && !isEarlyOut" :style="maturedChipStyle">{{ t.stakingV3.position.matured }}</text>
      </view>
    </view>

    <template v-if="!isClaimed && !isEarlyOut">
      <!-- progress -->
      <view :style="progressTrackStyle">
        <view :style="progressFillStyle" />
      </view>

      <!-- 3-cell grid -->
      <view class="grid grid-cols-3" :style="cellGridStyle">
        <view>
          <text class="block" :style="cellKStyle">{{ t.uiChrome.daysIn }}</text>
          <text class="block tabular-nums" :style="cellVStyle(false)">{{ daysIn }} / {{ p.termDays }}</text>
        </view>
        <view>
          <text class="block" :style="cellKStyle">{{ t.stakingV3.position.accrued }}</text>
          <text class="block tabular-nums" :style="cellVStyle(true)">+${{ accruedText }}</text>
        </view>
        <view>
          <text class="block" :style="cellKStyle">{{ isMatured ? t.stakingV3.position.statusLabel : t.stakingV3.position.remainingLabel }}</text>
          <text class="block tabular-nums" :style="cellVStyle(false)">{{ isMatured ? t.stakingV3.position.unlocked : `${remainingDays}d` }}</text>
        </view>
      </view>

      <!-- Actions -->
      <view class="flex" style="margin-top: 12px; gap: 8px">
        <view v-if="isMatured" class="flex-1 inline-flex items-center justify-center active:opacity-85" :style="claimBtnStyle" role="button" tabindex="0" @click="emit('claim')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M20 6 9 17l-5-5" /></svg>
          <text>{{ claimText }}</text>
        </view>
        <template v-else>
          <view class="flex-1 active:opacity-80 inline-flex items-center justify-center" :style="earlyBtnStyle" role="button" tabindex="0" @click="emit('earlyWithdraw')">
            <text>{{ t.stakingV3.position.earlyWithdraw }}</text>
          </view>
          <view class="flex-1 inline-flex items-center justify-center active:opacity-85" :style="trackBtnStyle" role="button" tabindex="0" @click="onTrack">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
            <text>{{ t.stakingV3.position.track }}</text>
          </view>
        </template>
      </view>
    </template>

    <view v-else :style="closedNoteStyle">
      <text>{{ isClaimed ? t.stakingV3.position.returnedToWallet : t.stakingV3.position.penaltyDeducted }} · </text>
      <text>{{ startedDate }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import type { StakingPosition } from "@/store/staking";
import { toast } from "@/store/ui";

const ONE_DAY_MS = 86400 * 1000;

const props = defineProps<{ p: StakingPosition; now: number }>();
const emit = defineEmits<{ claim: []; earlyWithdraw: [] }>();

const t = useT();

const elapsed = computed(() => Math.min(props.now, props.p.unlockTs) - props.p.startTs);
const total = computed(() => props.p.unlockTs - props.p.startTs);
const pct = computed(() => Math.min(1, Math.max(0, elapsed.value / total.value)));
const remainingDays = computed(() => Math.max(0, Math.ceil((props.p.unlockTs - props.now) / ONE_DAY_MS)));
const accrued = computed(() => props.p.amountUSDT * props.p.apy * (elapsed.value / (365 * ONE_DAY_MS)));
const isMatured = computed(() => props.p.status === "matured" || props.now >= props.p.unlockTs);
const isClaimed = computed(() => props.p.status === "claimed");
const isEarlyOut = computed(() => props.p.status === "early-withdrawn");

const amountText = computed(() => props.p.amountUSDT.toLocaleString());
const apyPct = computed(() => (props.p.apy * 100).toFixed(0));
const daysIn = computed(() => Math.floor(elapsed.value / ONE_DAY_MS));
const accruedText = computed(() => accrued.value.toFixed(2));
const claimText = computed(() => fmt(t.value.stakingV3.position.claim, { amount: (props.p.amountUSDT + accrued.value).toFixed(2) }));
const startedDate = computed(() => new Date(props.p.startTs).toLocaleDateString(dateLocale()));

function onTrack() {
  toast.info(t.value.stakingV3.position.autoClaimToast, fmt(t.value.stakingV3.position.autoClaimSubtitle, { n: remainingDays.value }));
}

const cardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "14px",
  padding: "14px",
};
const principalStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
};
const termChipStyle: CSSProperties = {
  padding: "2px 8px",
  borderRadius: "999px",
  background: "var(--v5-brand-soft)",
  color: "var(--v5-brand)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
};
function statusChipStyle(tint: string): CSSProperties {
  return {
    fontSize: "12px",
    color: tint,
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  };
}
const maturedChipStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-brand)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontWeight: 600,
};
const progressTrackStyle: CSSProperties = {
  marginTop: "12px",
  height: "6px",
  background: "var(--v5-surface-3)",
  borderRadius: "3px",
  overflow: "hidden",
};
const progressFillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${pct.value * 100}%`,
  background: "linear-gradient(90deg, #36D4FF, var(--v5-success))",
  borderRadius: "3px",
  transition: "width 0.6s ease",
}));
const cellGridStyle: CSSProperties = {
  gap: "10px",
  marginTop: "14px",
  paddingTop: "12px",
  borderTop: "1px solid var(--v5-border)",
};
const cellKStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
function cellVStyle(success: boolean): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontWeight: 600,
    fontSize: "15px",
    color: success ? "var(--v5-success)" : "var(--v5-ink)",
    marginTop: "3px",
  };
}
const claimBtnStyle: CSSProperties = {
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  boxShadow: "var(--v5-spotlight-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};
const earlyBtnStyle: CSSProperties = {
  height: "44px",
  borderRadius: "999px",
  background: "transparent",
  border: "1px solid var(--v5-border)",
  color: "var(--v5-ink-3)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
};
const trackBtnStyle: CSSProperties = {
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  boxShadow: "var(--v5-spotlight-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};
const closedNoteStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
};
</script>
