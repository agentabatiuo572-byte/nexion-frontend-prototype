<template>
  <view class="team-roster">
    <view class="roster-heading">
      <text class="roster-title">{{ title }}</text>
      <text v-if="!$slots.root" class="roster-subtitle">{{ visibility.mask(subtitle) }}</text>
    </view>
    <view :id="`roster-${kind}`" class="roster-card">
      <slot name="root" />
      <text v-if="sortedMembers.length === 0" class="roster-empty">{{ visibility.mask(emptyLabel) }}</text>
      <view v-for="m in sortedMembers" :key="m.id" class="member-row">
        <!-- The whole row opens the member's details; there is no separate expand icon. -->
        <view class="member-trigger" role="button" tabindex="0" :aria-expanded="expandedMemberId === m.id" :aria-controls="`member-${kind}-${m.id}`" @click="toggleMember(m.id)" @keydown.enter.prevent="toggleMember(m.id)" @keydown.space.prevent="toggleMember(m.id)">
          <TeamRankEmblem v-if="!visibility.hidden" :rank="m.vRank" :size="36" />
          <view class="member-identity">
            <text class="member-name">{{ displayNickname(m.name) }}</text>
            <view class="member-meta"><text>{{ visibility.mask(rankLabel(m.vRank, locale.code, [])) }}</text><view class="relation-dot" :style="{ background: statusColor(m.status) }" /><text>{{ auditCopy[m.status] }}</text></view>
          </view>
          <view class="member-points"><text class="nx-num-metric" :aria-label="visibility.mask(formatComputePoints(m.monthComputePoints, locale.code))">{{ visibility.mask(formatComputePoints(m.monthComputePoints, locale.code).split(' ')[0]) }}</text></view>
        </view>
        <view v-if="expandedMemberId === m.id" :id="`member-${kind}-${m.id}`" class="member-details">
          <view class="member-detail member-joined"><text>{{ t.network.joined }}</text><text>{{ formatDisplayDateTime(m.joinedAt, locale.code) }}</text></view>
          <view class="member-detail"><text>{{ t.network.allTime }}</text><text class="tabular-nums">{{ visibility.mask(formatComputePoints(m.lifetimeComputePoints, locale.code)) }}</text></view>
          <view class="member-detail"><text>{{ m.layer === 1 ? t.network.badgeDirect : t.network.badgeExtended }}</text><text>{{ m.city }}</text></view>
          <text v-if="showContribution" class="member-contribution tabular-nums">+${{ visibility.mask(formatAmount(contribution(m))) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useDataVisibility } from "@/store/data-visibility";
import { displayNickname } from "@/lib/brand-copy";
import { formatAmount } from "@/lib/amount-display";
import { formatComputePoints } from "@/i18n/compute-points";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { rankLabel } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { computed, ref, watch } from "vue";
import TeamRankEmblem from "./team-rank-emblem.vue";
import type { NetworkMember, MemberStatus } from "@/store/network";
import { UNILEVEL_USDT } from "@/store/commission";
import { useT } from "@/i18n/use-t";
import { formatDisplayDateTime } from "@/lib/display-date";

const props = defineProps<{
  color: string;
  title: string;
  subtitle: string;
  accentBg: string;
  accentText: string;
  badge: string;
  members: NetworkMember[];
  emptyLabel: string;
  kind: "direct" | "extended";
  showContribution?: boolean;
}>();
const t = useT();
const visibility = useDataVisibility();
const showContribution = computed(() => props.showContribution !== false);
const locale = useLocaleStore();
const auditCopy = computed(() => networkReauditCopy(locale.code));
const sortedMembers = computed(() => [...props.members].sort((a, b) => (b.monthComputePoints ?? -1) - (a.monthComputePoints ?? -1)));
const expandedMemberId = ref<string | null>(null);
function toggleMember(id: string): void {
  expandedMemberId.value = expandedMemberId.value === id ? null : id;
}
watch(() => props.members, (members) => {
  if (!members.some(member => member.id === expandedMemberId.value)) expandedMemberId.value = null;
});
function contribution(m: NetworkMember): number {
  return props.kind === "direct" ? m.monthVolumeUSD * 0.1 : m.monthVolumeUSD * (UNILEVEL_USDT[m.layer] ?? 0);
}
function statusColor(status: MemberStatus): string {
  return status === "active" ? "var(--v5-brand)" : status === "idle" ? "var(--v5-warning)" : "var(--v5-ink-4)";
}
</script>

<style scoped>
.team-roster { min-width: 0; }
.roster-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-inline); padding: 0 var(--v5-space-1) 10px; }
.roster-title { min-width: 0; font-size: 16px; font-weight: 600; }
.roster-subtitle { flex-shrink: 0; max-width: 60%; text-align: right; font-size: 12px; line-height: 1.5; color: var(--v5-ink-3); overflow-wrap: anywhere; }
.relation-dot { width: 5px; height: 5px; border-radius: 50%; flex: 0 0 auto; }
.roster-empty { display: block; padding: 22px 0; font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3); }
.member-row + .member-row { border-top: 1px solid var(--v5-border); }
.member-trigger { display: flex; align-items: center; gap: var(--ui-space-inline); padding: 10px 0; min-height: 60px; box-sizing: border-box; }
.member-identity { flex: 1; min-width: 0; }
.member-name { display: block; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.member-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 3px; font-size: 11px; color: var(--v5-ink-3); }
.member-points { text-align: right; font: 600 15px/20px var(--font-metric); color: var(--v5-ink); max-width: 34%; overflow-wrap: anywhere; }
.member-details { margin-left: 48px; padding: 0 0 var(--v5-space-4); display: flex; flex-direction: column; gap: var(--ui-space-inline); }
.member-detail { display: flex; justify-content: space-between; gap: var(--ui-space-inset); font-size: 12px; line-height: 1.5; color: var(--v5-ink-3); }
.member-detail > :last-child { text-align: right; color: var(--v5-ink-2); overflow-wrap: anywhere; }
.member-joined { flex-wrap: wrap; }
.member-joined > :last-child { min-width: 0; flex: 1 1 170px; }
.member-contribution { color: var(--v5-ink-2); text-align: right; font-size: 12px; }
[role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (max-width: 360px) { .member-trigger { gap: var(--v5-space-2); } .member-details { margin-left: 0; } .member-points { font-size: 14px; } }
</style>
