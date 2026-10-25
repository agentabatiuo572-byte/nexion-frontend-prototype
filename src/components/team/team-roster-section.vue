<template>
  <view class="team-roster">
    <view class="roster-heading" role="button" tabindex="0" :aria-expanded="isOpen" :aria-controls="`roster-${kind}`" @click="emit('toggle')" @keydown.enter.prevent="emit('toggle')" @keydown.space.prevent="emit('toggle')">
      <view class="roster-heading-copy">
        <view class="roster-title"><view class="relation-dot" :style="{ background: color }" /><text>{{ title }}</text><text class="roster-count">{{ members.length }}</text></view>
        <text class="roster-subtitle">{{ subtitle }}</text>
      </view>
      <text class="roster-chevron" aria-hidden="true">{{ isOpen ? '−' : '+' }}</text>
    </view>
    <view v-if="isOpen" :id="`roster-${kind}`">
      <text v-if="sortedMembers.length === 0" class="roster-empty">{{ emptyLabel }}</text>
      <view v-for="m in sortedMembers" :key="m.id" class="member-row">
        <view class="member-trigger" role="button" tabindex="0" :aria-expanded="expandedMemberId === m.id" :aria-controls="`member-${kind}-${m.id}`" @click="toggleMember(m.id)" @keydown.enter.prevent="toggleMember(m.id)" @keydown.space.prevent="toggleMember(m.id)">
          <TeamRankEmblem :rank="m.vRank" :size="44" />
          <view class="member-identity">
            <text class="member-name">{{ displayNickname(m.name) }}</text>
            <view class="member-meta"><text>{{ rankLabel(m.vRank, locale.code, []) }}</text><view class="relation-dot" :style="{ background: statusColor(m.status) }" /><text>{{ auditCopy[m.status] }}</text></view>
          </view>
          <view class="member-points"><text class="tabular-nums">{{ formatComputePoints(m.monthComputePoints, locale.code) }}</text><text class="member-points-label">{{ t.network.monthVolume }}</text></view>
          <text class="roster-chevron" aria-hidden="true">{{ expandedMemberId === m.id ? '−' : '+' }}</text>
        </view>
        <view v-if="expandedMemberId === m.id" :id="`member-${kind}-${m.id}`" class="member-details">
          <view class="member-detail"><text>{{ t.network.joined }}</text><text>{{ fmt(t.uiChrome.joinedDaysAgo, { n: daysAgo(m.joinedAt) }) }}</text></view>
          <view class="member-detail"><text>{{ t.network.allTime }}</text><text class="tabular-nums">{{ formatComputePoints(m.lifetimeComputePoints, locale.code) }}</text></view>
          <view class="member-detail"><text>{{ m.layer === 1 ? t.network.badgeDirect : t.network.badgeExtended }}</text><text>{{ m.city }}</text></view>
          <text v-if="showContribution" class="member-contribution tabular-nums">+${{ formatAmount(contribution(m)) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
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
function daysAgo(joinedAt: number): number {
  return Math.floor((Date.now() - joinedAt) / 86400000);
}
function statusColor(status: MemberStatus): string {
  return status === "active" ? "var(--v5-brand)" : status === "idle" ? "var(--v5-warning)" : "var(--v5-ink-4)";
}
</script>

<style scoped>
.team-roster { min-width: 0; }
.roster-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); padding: 0 0 14px; min-height: 44px; }
.roster-heading-copy { min-width: 0; flex: 1; }
.roster-title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 16px; font-weight: 600; }
.roster-count { font-size: 13px; font-weight: 400; color: var(--v5-ink-3); }
.roster-subtitle { display: block; margin-top: 6px; font-size: 12px; line-height: 1.5; color: var(--v5-ink-3); overflow-wrap: anywhere; }
.relation-dot { width: 5px; height: 5px; border-radius: 50%; flex: 0 0 auto; }
.roster-chevron { color: var(--v5-ink-3); font-size: 16px; flex-shrink: 0; }
.roster-empty { display: block; padding: 22px 0; border-top: 1px solid var(--v5-border); font-size: 13px; color: var(--v5-ink-3); }
.member-row { border-top: 1px solid var(--v5-border); }
.member-trigger { display: flex; align-items: center; gap: var(--ui-space-row-y); padding: var(--ui-space-inset) 0; min-height: 72px; }
.member-identity { flex: 1; min-width: 0; }
.member-name { display: block; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.member-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 5px; font-size: 11px; color: var(--v5-ink-3); }
.member-points { text-align: right; font-size: 16px; color: var(--v5-ink); max-width: 34%; overflow-wrap: anywhere; }
.member-points-label { display: block; margin-top: 4px; font-size: 11px; color: var(--v5-ink-3); line-height: 1.4; }
.member-details { margin-left: 54px; padding: 0 0 16px; display: flex; flex-direction: column; gap: var(--ui-space-inline); }
.member-detail { display: flex; justify-content: space-between; gap: var(--ui-space-inset); font-size: 12px; line-height: 1.5; color: var(--v5-ink-3); }
.member-detail > :last-child { text-align: right; color: var(--v5-ink-2); overflow-wrap: anywhere; }
.member-contribution { color: var(--v5-ink-2); text-align: right; font-size: 12px; }
[role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (max-width: 360px) { .member-trigger { gap: 8px; } .member-details { margin-left: 0; } .member-points { font-size: 14px; } }
</style>
