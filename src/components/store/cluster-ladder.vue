<!--
  ClusterLadder — daily USD yield ladder (ported from store/page.tsx
  ClusterLadderV5). Phone → Box S1 → Box Pro → Rack P1, drawn bottom-up
  (column-reverse) with the user "←you" marker on Phone. Each row: label · bar
  (width = relative yield) · $/d, inside one content card. The bars grow from
  zero each time the card scrolls into view (shared useScrollGrowProgress).
  Yields are parallel estimate comparisons, so they use the metric figures (DS-27).
  Drives the "climb the ladder" upgrade intent.
-->
<template>
  <view>
    <SectionHeader :title="t.store.secNetworkLadder" :count="t.store.secNetworkLadderCount.replace('5', String(tiers.length))" />
    <view ref="ladderEl" class="nx-glass-card ladder-card">
      <view
        v-for="(tier, index) in tiers"
        :key="tier.id"
        class="ladder-row"
      >
        <view class="whitespace-nowrap truncate" :style="labelStyle(tier)">
          <text>{{ (tier.label) }}</text>
          <text v-if="tier.you" class="ladder-you">{{ t.store.ladderYou }}</text>
        </view>
        <view class="ladder-track">
          <view class="ladder-fill" :style="barStyle(tier, index)" />
        </view>
        <view class="ladder-yield" :aria-label="tier.yFull" :style="{ color: yieldColor(tier) }">
          <text class="nx-num-metric">{{ tier.y }}</text>
          <text class="ladder-unit">{{ t.store.perDay }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION } from "@/composables/use-scroll-grow-progress";
import SectionHeader from "./section-header.vue";
import { storefrontUsd, storefrontUsdFull, type StoreYieldAuthority, type StoreYieldLadderRow } from "@/lib/store-yield-authority";

const t = useT();
const { elRef: ladderEl, inView } = useScrollGrowProgress();
const props = defineProps<{ authority: StoreYieldAuthority; owned: ReturnType<typeof import("@/lib/store-upgrade").highestOwnedHardware> }>();

interface Tier {
  id: string;
  label: string;
  y: string;
  yFull: string;
  width: number;
  amount: number;
  you?: boolean;
  rack?: boolean;
  fill?: string;
  fillOpacity?: number;
}

const tiers = computed<Tier[]>(() => {
  const kindForRow: Record<string, string> = { phone: "phone", entry: "stellarbox-s1", pro: "stellarbox-pro", rack: "stellarrack-p1" };
  const rows: Tier[] = props.authority.ladder.map((row: StoreYieldLadderRow) => {
  const you = kindForRow[row.id] === props.owned?.kind;
  const amount = you && props.owned ? { usd: props.owned.baseRate, nex: props.owned.baseRateNEX } : row.amount;
  const labels = {
    phone: t.value.store.ladderPhone,
    entry: t.value.store.ladderS1,
    pro: t.value.store.ladderPro,
    rack: t.value.store.ladderRack,
  };
  return {
    id: row.id,
    label: labels[row.id],
    y: storefrontUsd(amount),
    yFull: storefrontUsdFull(amount),
    amount: amount?.usd ?? 0,
    width: row.widthPct,
    you,
    rack: row.id === "rack",
    fill: "var(--v5-brand)",
    fillOpacity: row.id === "entry" ? 0.35 : row.id === "pro" ? 0.55 : 0.75,
  };
  });
  if (props.owned && props.owned.kind !== "cloud-share" && !rows.some((row) => row.you)) {
    const amount = { usd: props.owned.baseRate, nex: props.owned.baseRateNEX };
    const maximum = Math.max(amount.usd, ...props.authority.ladder.map((row) => row.amount?.usd ?? 0));
    const ownedRow = { id: props.owned.kind, label: props.owned.name, y: storefrontUsd(amount),
      yFull: storefrontUsdFull(amount), amount: amount.usd, width: maximum > 0 ? Math.max(1, amount.usd / maximum * 100) : 0,
      you: true, rack: props.owned.kind === "stellarrack-p2", fill: "var(--v5-brand)", fillOpacity: 0.75 };
    rows.splice(props.owned.kind === "stellarbox-pro-v2" ? 4 : rows.length, 0, ownedRow);
  }
  const maximum = Math.max(0, ...rows.map((row) => row.amount));
  return rows.map((row) => ({ ...row, width: maximum > 0 && row.amount > 0 ? Math.max(1, row.amount / maximum * 100) : 0 }));
});

function labelStyle(tier: Tier): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontWeight: 500,
    fontSize: "var(--ui-type-list-subtitle)",
    color: tier.you ? "var(--v5-brand-2)" : "var(--v5-ink)",
    letterSpacing: "-0.008em",
  };
}

// Rows are drawn bottom-up, so the delay counts from the bottom row (the phone) upward.
function barStyle(tier: Tier, index: number): CSSProperties {
  return {
    width: inView.value ? `${tier.width}%` : "0%",
    transition: inView.value ? PROGRESS_GROW_TRANSITION : "none",
    transitionDelay: inView.value ? `${index * 80}ms` : "0ms",
    background: tier.you ? "var(--v5-brand-2)" : (tier.fill ?? "var(--v5-brand)"),
    opacity: tier.you ? 0.55 : (tier.fillOpacity ?? 1),
  };
}

function yieldColor(tier: Tier): string {
  return tier.you ? "var(--v5-brand-2)" : tier.rack ? "var(--v5-brand)" : "var(--v5-ink)";
}
</script>

<style scoped>
.ladder-card { display: flex; flex-direction: column-reverse; gap: var(--v5-space-1); padding: var(--ui-space-inline) var(--ui-space-inset); border-radius: var(--nx-glass-radius); background: var(--nx-glass-fill); box-shadow: var(--nx-glass-edge); }
.ladder-row { display: grid; grid-template-columns: 76px minmax(0, 1fr) 92px; align-items: center; column-gap: var(--ui-space-inline); min-height: 32px; }
.ladder-you { margin-left: var(--v5-space-1); font: 500 var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); color: var(--v5-brand-2-ink); }
.ladder-track { position: relative; height: 6px; overflow: hidden; border-radius: 999px; background: var(--v5-surface-3); }
.ladder-fill { position: absolute; top: 0; bottom: 0; left: 0; border-radius: 999px; }
.ladder-yield { overflow: hidden; text-align: right; white-space: nowrap; font: 500 13px/18px var(--font-metric); font-variant-numeric: tabular-nums; }
.ladder-unit { font: 400 var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); color: var(--v5-ink-3); }
@media (prefers-reduced-motion: reduce) { .ladder-fill { transition: none !important; } }
</style>
