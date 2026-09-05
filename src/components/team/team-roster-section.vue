<!--
  TeamRosterSection — collapsible Direct / Extended roster (ported from
  tree/page.tsx RosterSection + MemberRow). Header badge + title + subtitle +
  chevron (tap to toggle) → member rows (avatar + name + VBadge + status dot +
  city/age + per-member royalty contribution). Members sorted by month volume.
  Each member's contribution = month vol × layer rate (UNILEVEL_USDT; direct = 10%).
  <button>→<view @click>. <span>/<div> text leaves→<text>. emits toggle.
  DECARD 2026-07-09: form-b row container — surface fill kept, outer border
  dropped (rows already hairline-separated inside).
-->
<template>
  <view class="rounded-2xl overflow-hidden" :style="cardStyle">
    <view class="flex items-center active:opacity-90" :style="headerStyle" @click="emit('toggle')">
      <text class="rounded-xl grid place-items-center font-display" :style="badgeStyle">{{ badge }}</text>
      <view class="flex-1 text-left min-w-0">
        <text class="block" :style="titleStyle">{{ title }}</text>
        <text class="block font-mono-tabular" :style="subtitleStyle">{{ subtitle }}</text>
      </view>
      <svg v-if="isOpen" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" /></svg>
      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
    </view>

    <template v-if="isOpen">
      <view v-if="sortedMembers.length === 0" class="text-center" :style="emptyStyle">
        <text>{{ emptyLabel }}</text>
      </view>
      <view v-else style="border-top: 1px solid var(--v5-border)">
        <view
          v-for="(m, i) in sortedMembers"
          :key="m.id"
          class="flex items-center"
          :style="rowStyle(i === sortedMembers.length - 1)"
        >
          <view class="rounded-full grid place-items-center shrink-0" :style="avatarStyle">
            <text style="font-size: 20px; line-height: 1">{{ m.avatar }}</text>
          </view>
          <view class="flex-1 min-w-0">
            <view class="flex items-center" style="gap: 6px">
              <text class="truncate" :style="{ fontSize: '13px', color: 'var(--v5-ink)' }">{{ m.name }}</text>
              <VBadge :v="m.vRank" size="sm" :show-title="false" />
            </view>
            <view class="flex items-center" style="margin-top: 2px; gap: 6px">
              <view class="rounded-full" :style="statusDotStyle(m.status)" />
              <text :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ m.city }} · {{ fmt(t.uiChrome.joinedDaysAgo, { n: daysAgo(m.joinedAt) }) }}</text>
            </view>
          </view>
          <view class="text-right shrink-0">
            <text v-if="showContribution" class="block font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: accentText }">+${{ contribution(m).toFixed(2) }}</text>
            <text class="block font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ fmt(t.uiChrome.volumeShort, { amount: `$${m.monthVolumeUSD}` }) }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import VBadge from "./v-badge.vue";
import type { NetworkMember, MemberStatus } from "@/store/network";
import { UNILEVEL_USDT } from "@/store/commission";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";

const props = defineProps<{
  color: string;
  title: string;
  subtitle: string;
  accentBg: string;
  accentText: string;
  badge: string;
  members: NetworkMember[];
  isOpen: boolean;
  emptyLabel: string;
  kind: "direct" | "extended";
  showContribution?: boolean;
}>();
const emit = defineEmits<{ toggle: [] }>();
const t = useT();
const showContribution = computed(() => props.showContribution !== false);

const sortedMembers = computed(() => [...props.members].sort((a, b) => b.monthVolumeUSD - a.monthVolumeUSD));

function contribution(m: NetworkMember): number {
  const layer = m.layer;
  return props.kind === "direct" ? m.monthVolumeUSD * 0.1 : m.monthVolumeUSD * (UNILEVEL_USDT[layer] ?? 0);
}
function daysAgo(joinedAt: number): number {
  return Math.floor((Date.now() - joinedAt) / 86400000);
}
function statusColor(status: MemberStatus): string {
  return status === "active" ? "var(--v5-brand)" : status === "idle" ? "var(--v5-warning)" : "var(--v5-ink-4)";
}

// ─── styles ───
// Row container: fill only, no border (radius via rounded-2xl class;
// overflow-hidden kept — it clips row corners inside the rounded fill).
const cardStyle: CSSProperties = { background: "var(--v5-surface)" };
const headerStyle: CSSProperties = { width: "100%", padding: "12px 16px", gap: "12px" };
const badgeStyle = computed<CSSProperties>(() => ({
  width: "36px",
  height: "36px",
  fontWeight: 600,
  fontSize: "12px",
  background: props.accentBg,
  color: props.accentText,
  letterSpacing: "0.06em",
}));
const titleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const subtitleStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-3)" };
const emptyStyle: CSSProperties = { padding: "24px 16px", fontSize: "12px", color: "var(--v5-ink-3)", borderTop: "1px solid var(--v5-border)" };
function rowStyle(isLast: boolean): CSSProperties {
  return { padding: "10px 16px", gap: "12px", borderBottom: isLast ? "none" : "1px solid var(--v5-border)" };
}
const avatarStyle: CSSProperties = { width: "36px", height: "36px", background: "var(--v5-surface-2)" };
function statusDotStyle(status: MemberStatus): CSSProperties {
  return { width: "6px", height: "6px", background: statusColor(status) };
}
</script>
