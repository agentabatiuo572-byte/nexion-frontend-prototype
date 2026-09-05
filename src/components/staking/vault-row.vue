<!--
  VaultRow — row-in-card vault picker (staking/page.tsx VaultRow). Tier code-tag
  chip + APY/blurb/min meta + optional ribbon (180d cyan / 365d gold) + arrow.
  Click → emits `open` so the page opens the stake sheet for this term.
-->
<template>
  <view :class="['nx-staking-vault-row', `nx-staking-vault-row-${term}`, 'active:opacity-70']" :style="rowStyle" role="button" tabindex="0" @click="emit('open')">
    <!-- Tier code-tag -->
    <text :style="tierChipStyle">{{ term }}D</text>

    <!-- Middle column -->
    <view style="min-width: 0">
      <view class="flex items-baseline flex-wrap" style="gap: 6px">
        <text class="tabular-nums" :style="apyStyle">{{ apyPct }}%</text>
        <text :style="apyUnitStyle">APY</text>
        <text v-if="ribbon" :style="ribbonStyle">{{ ribbon.label }}</text>
      </view>
      <text class="block" :style="blurbStyle">{{ blurb }}</text>
      <text class="block tabular-nums" :style="metaStyle">{{ fmt(t.stakingV3.vaultMin, { amount: `$${minText}` }) }} · {{ penaltyPct }}% {{ penaltySuffix }}</text>
    </view>

    <!-- Arrow -->
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import type { StakingTerm } from "@/store/staking";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";

interface Ribbon {
  label: string;
  tone: "cyan" | "gold";
}
// 《03》§4:内嵌 chip 用 soft bg tint,禁加 border → C2 删 borderColor(已无消费者)
interface TierTone {
  softBg: string;
  text: string;
}

const props = defineProps<{
  term: StakingTerm;
  apy: number;
  penalty: number;
  min: number;
  blurb: string;
  penaltySuffix: string;
  ribbon?: Ribbon;
  isLast: boolean;
}>();
const emit = defineEmits<{ open: [] }>();
const t = useT();

const TIER_TONES: Record<StakingTerm, TierTone> = {
  30: { softBg: "var(--v5-success-soft)", text: "var(--v5-success)" },
  90: { softBg: "var(--v5-brand-soft)", text: "var(--v5-brand)" },
  180: { softBg: "var(--v5-tech-cyan-soft)", text: "var(--v5-tech-cyan)" },
  365: { softBg: "var(--v5-warning-soft)", text: "var(--v5-warning)" },
};

const tone = computed(() => TIER_TONES[props.term]);
const apyPct = computed(() => (props.apy * 100).toFixed(0));
const penaltyPct = computed(() => (props.penalty * 100).toFixed(0));
const minText = computed(() => props.min.toLocaleString());

const rowStyle = computed<CSSProperties>(() => ({
  display: "grid",
  gridTemplateColumns: "auto 1fr auto",
  gap: "12px",
  alignItems: "center",
  padding: "14px 0",
  borderBottom: props.isLast ? "none" : "1px solid var(--v5-border)",
}));
const tierChipStyle = computed<CSSProperties>(() => ({
  padding: "4px 10px",
  background: tone.value.softBg,
  borderRadius: "999px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: tone.value.text,
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
}));
const apyStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.014em",
  color: "var(--v5-success)",
  lineHeight: 1.1,
};
const apyUnitStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  fontWeight: 500,
};
const ribbonStyle = computed<CSSProperties>(() => ({
  padding: "2px 7px",
  borderRadius: "999px",
  background: props.ribbon?.tone === "cyan" ? "var(--v5-tech-cyan-soft)" : "var(--v5-warning-soft)",
  color: props.ribbon?.tone === "cyan" ? "var(--v5-tech-cyan)" : "var(--v5-warning)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.02em",
}));
const blurbStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink-3)",
  marginTop: "3px",
  lineHeight: 1.4,
};
const metaStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  marginTop: "3px",
};
</script>
