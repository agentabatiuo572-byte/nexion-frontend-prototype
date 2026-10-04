<!--
  ClusterLadder — daily USD yield ladder (ported from store/page.tsx
  ClusterLadderV5). Phone → Box S1 → Box Pro → Rack P1, drawn bottom-up
  (column-reverse) with the user "←you" marker on Phone. Each row: label · bar
  (width = relative yield) · $/d. Drives the "climb the ladder" upgrade intent.
-->
<template>
  <view>
    <SectionHeader :title="t.store.secNetworkLadder" :count="t.store.secNetworkLadderCount.replace('5', String(tiers.length))" />
    <view class="flex flex-col-reverse" :style="frameStyle">
      <view
        v-for="tier in tiers"
        :key="tier.id"
        class="grid items-center"
        style="grid-template-columns: 72px minmax(0, 1fr) minmax(70px, 84px); gap: 10px"
      >
        <view class="whitespace-nowrap truncate" :style="labelStyle(tier)">
          <text>{{ tier.label }}</text>
          <text
            v-if="tier.you"
            class="font-mono-tabular"
            style="font-size: 12px; color: var(--v5-brand-2-ink); margin-left: 4px; opacity: 0.7"
          >{{ t.store.ladderYou }}</text>
        </view>
        <view class="relative overflow-hidden" style="height: 5px; background: var(--v5-surface-3); border-radius: 2.5px">
          <view class="absolute left-0 top-0 bottom-0" :style="barStyle(tier)" />
        </view>
        <view class="text-right tabular-nums whitespace-nowrap overflow-hidden" :aria-label="tier.yFull" :style="yieldStyle(tier)">
          <text>{{ tier.y }}</text>
          <text style="font-size: 12px; color: var(--v5-ink-4); font-weight: 400">{{ t.store.perDay }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import SectionHeader from "./section-header.vue";
import { storefrontUsd, storefrontUsdFull, type StoreYieldAuthority, type StoreYieldLadderRow } from "@/lib/store-yield-authority";

const t = useT();
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

const frameStyle: CSSProperties = {
  paddingTop: "2px",
  gap: "8px",
};

function labelStyle(tier: Tier): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontWeight: 500,
    fontSize: "13px",
    color: tier.you ? "var(--v5-brand-2)" : "var(--v5-ink)",
    letterSpacing: "-0.008em",
  };
}

function barStyle(tier: Tier): CSSProperties {
  return {
    width: `${tier.width}%`,
    background: tier.you ? "var(--v5-brand-2)" : (tier.fill ?? "var(--v5-brand)"),
    opacity: tier.you ? 0.55 : (tier.fillOpacity ?? 1),
    borderRadius: "2.5px",
  };
}

function yieldStyle(tier: Tier): CSSProperties {
  const color = tier.you
    ? "var(--v5-brand-2)"
    : tier.rack
      ? "var(--v5-brand)"
      : "var(--v5-ink)";
  return {
    fontFamily: "var(--font-v5)",
    fontWeight: 600,
    fontSize: "13px",
    color,
    letterSpacing: "-0.008em",
  };
}
</script>
