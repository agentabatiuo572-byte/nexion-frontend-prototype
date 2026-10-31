<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.network.pageTitle" />

      <view class="network-content">
        <view v-if="remoteApiEnabled && network.remoteStatus === 'error'" class="nx-inline-recovery" :style="errorStateStyle">
          <view class="nx-inline-recovery__copy">
            <text class="block" style="font-weight: 600">{{ t.network.projectionErrorTitle }}</text>
            <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ t.network.projectionErrorDesc }}</text>
          </view>
          <view class="nx-inline-recovery__action nx-card-recovery-action nx-card-recovery-action--quiet nx-card-recovery-action--inline" role="button" tabindex="0" @click="network.refreshCanonicalNetwork()" @keydown.enter.prevent="network.refreshCanonicalNetwork()" @keydown.space.prevent="network.refreshCanonicalNetwork()"><text>{{ t.network.retry }}</text><text aria-hidden="true">→</text></view>
        </view>
        <view class="network-overview nx-viz-press">
          <view class="network-overview__head">
            <text class="network-overview__split">{{ visibility.mask(metricsUnavailable ? '—' : ringSplitText) }}</text>
            <text class="network-overview__total"><text class="nx-num-metric">{{ visibility.mask(metricsUnavailable ? '—' : members.length) }}</text> {{ peopleUnit }}</text>
          </view>
          <!-- Orbit (P-41): direct invites on the inner ring, the rest outside, dot colour = status.
               Positions only group members; they do not encode who invited whom. -->
          <view ref="orbitRef" class="network-orbit">
            <view class="network-orbit__ring network-orbit__ring--outer" aria-hidden="true" /><view class="network-orbit__ring network-orbit__ring--inner" aria-hidden="true" />
            <!-- The centre is you: it keeps the route to your current rank. -->
            <view class="network-orbit__center" role="button" tabindex="0" :aria-label="selfNodeLabel" @click="openSelf" @keydown.enter.prevent="openSelf" @keydown.space.prevent="openSelf">
              <TeamRankEmblem v-if="!visibility.hidden" :rank="remoteApiEnabled && !vRank.remoteReady ? null : myRank" :size="52" /><text class="network-orbit__you">{{ t.network.diagramYou }}</text>
            </view>
            <template v-if="!visibility.hidden && !metricsUnavailable">
              <view v-for="(dot, index) in orbitDots" :key="dot.id" class="network-orbit__dot nx-viz-pop" :class="{ 'network-orbit__dot--inner': dot.inner }" aria-hidden="true"
                :style="{ left: `${dot.x}%`, top: `${dot.y}%`, background: dot.color, animation: orbitInView === false ? 'none' : undefined, opacity: orbitInView === false ? 0 : undefined, animationDelay: `${Math.min(index * 60, 900)}ms` }"><text>{{ dot.initial }}</text></view>
            </template>
          </view>
          <view class="network-legend">
            <view v-for="item in memberStatusCounts" :key="item.status" class="network-legend__item"><view class="network-member-dot" :style="{ background: statusColor(item.status) }" aria-hidden="true" /><text>{{ item.label }}</text><text class="nx-num-metric">{{ visibility.mask(metricsUnavailable ? '—' : item.count) }}</text></view>
          </view>
        </view>
        <view v-if="metricsUnavailable && network.remoteStatus !== 'error'" role="status" aria-busy="true" class="network-read-state"><text>{{ t.network.projectionLoadingTitle }}</text></view>
        <view v-if="members.length || !metricsUnavailable" class="network-member-index">
          <GlassSegments surface="glass" selection="flat" :label="t.network.pageTitle" :model-value="memberGroup" :options="memberGroupOptions" @select="memberGroup = $event as 'direct' | 'extended'" />
          <view v-for="group in memberGroups" :key="group.kind" class="network-member-group" :style="{ display: memberGroup === group.kind ? undefined : 'none' }">
            <view class="network-members-card">
              <text v-if="!group.members.length" class="network-empty">{{ visibility.mask(group.emptyLabel) }}</text>
              <view v-for="member in group.members" :key="member.id" class="network-member-pick nx-net-node" :class="{ 'network-member-pick--selected': pulseId === member.id }"
                role="button" tabindex="0" :aria-label="nodeLabel(member)" @click="selected = member" @keydown.enter.prevent="selected = member" @keydown.space.prevent="selected = member">
                <TeamRankEmblem v-if="!visibility.hidden" :rank="member.vRank" :size="36" />
                <view class="network-member-identity">
                  <text class="network-member-name">{{ member.name }}</text>
                  <view class="network-member-meta"><text>{{ visibility.mask(rankLabel(member.vRank, locale.code, [])) }}</text><view class="network-member-dot" :style="{ background: statusColor(member.status) }" aria-hidden="true" /><text>{{ networkReauditCopy(locale.code)[member.status] }}</text></view>
                </view>
                <view class="network-member-compute"><text class="network-member-points nx-num-metric" :aria-label="visibility.mask(formatComputePoints(member.monthComputePoints, locale.code))">{{ visibility.mask(formatComputePoints(member.monthComputePoints, locale.code).split(' ')[0]) }}</text><text class="network-meta">{{ monthPointsLabel }}</text></view>
                <text class="network-chevron" aria-hidden="true">›</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- Member details keep the existing keyboard and pointer interactions. -->
      <view v-if="selected" class="nx-net-sheet-wrap" role="dialog" aria-modal="true" :aria-label="selected.name">
        <view class="nx-net-scrim nx-sheet-fade-in" @click="selected = null" />
        <view class="nx-glass-sheet nx-net-sheet nx-sheet-slide-up" :style="sheetStyle">
          <view class="sheet-handle" aria-hidden="true" />
          <view class="sheet-heading">
            <TeamRankEmblem v-if="!visibility.hidden" :rank="selected.vRank" :size="60" />
            <view class="sheet-identity">
              <text class="sheet-name">{{ selected.name }}</text>
              <text class="sheet-rank">{{ visibility.mask(rankLabel(selected.vRank, locale.code, vRank.ladder)) }}</text>
              <text class="sheet-relation" :style="{ color: selected.layer === 1 ? DIRECT_COLOR : EXTENDED_COLOR }">{{ selected.layer === 1 ? t.network.badgeDirect : t.network.badgeExtended }}<text v-if="selected.city"> · {{ selected.city }}</text></text>
            </view>
            <view class="grid place-items-center active:opacity-60" :style="sheetCloseStyle" role="button" tabindex="0" :aria-label="t.ui.close" @click="selected = null" @keydown.enter.prevent="selected = null" @keydown.space.prevent="selected = null">
              <text aria-hidden="true">×</text>
            </view>
          </view>
          <view class="sheet-metrics">
            <view>
              <text class="block" :style="sheetStatLabelStyle">{{ t.network.monthVolume }}</text>
              <text class="block font-display tabular-nums" :style="sheetStatValStyle('var(--v5-brand)')">{{ visibility.mask(formatComputePoints(selected.monthComputePoints, locale.code)) }}</text>
            </view>
            <view>
              <text class="block" :style="sheetStatLabelStyle">{{ t.network.allTime }}</text>
              <text class="block font-display tabular-nums" :style="sheetStatValStyle('var(--v5-ink)')">{{ visibility.mask(formatComputePoints(selected.lifetimeComputePoints, locale.code)) }}</text>
            </view>
          </view>
          <view class="sheet-detail-row sheet-joined-date"><text>{{ t.network.joined }}</text><text>{{ formatDisplayDateTime(selected.joinedAt, locale.code) }}</text></view>
          <view class="sheet-detail-row"><text>{{ t.network.status }}</text><text :style="{ color: statusColor(selected.status) }">{{ networkReauditCopy(locale.code)[selected.status] }}</text></view>
          <view v-if="memberRankTitle(selected)" class="sheet-detail-row"><text>{{ t.network.title }}</text><text>{{ visibility.mask(memberRankTitle(selected)) }}</text></view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { useDataVisibility } from "@/store/data-visibility";
import { formatDisplayDateTime } from "@/lib/display-date";
import { displayNickname } from "@/lib/brand-copy";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { formatComputePoints } from "@/i18n/compute-points";
import { computed, ref, watch, onMounted, onUnmounted, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import GlassSegments from "@/components/glass-segments.vue";
import { useScrollGrowProgress } from "@/composables/use-scroll-grow-progress";
import TeamRankEmblem from "@/components/team/team-rank-emblem.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useNetwork, type NetworkMember, type MemberStatus } from "@/store/network";
import { useVRank } from "@/store/v-rank";
import { rankTitle, rankLabel } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { remoteApiEnabled } from "@/api/runtime";
import { onShow, onHide } from "@dcloudio/uni-app";
import { navTo } from "@/lib/route";

const DIRECT_COLOR = "var(--v5-brand)";
const EXTENDED_COLOR = "var(--v5-ink-2)";

const t = useT();
const visibility = useDataVisibility();
const network = useNetwork();
const vRank = useVRank();
const locale = useLocaleStore();
const { elRef: orbitRef, inView: orbitInView } = useScrollGrowProgress();

const members = computed(() => network.members.map(member => ({ ...member, name: displayNickname(member.name) })));
const myRank = computed(() => vRank.myRank);
// Unavailable only when this account has never produced a projection. A
// background re-read keeps the confirmed snapshot on screen (BUG 63).
const metricsUnavailable = computed(() => remoteApiEnabled && !network.hasRemoteSnapshot);
const myRankText = computed(() => remoteApiEnabled && !vRank.remoteReady ? "—" : rankLabel(myRank.value, locale.code, vRank.ladder));
const selectedId = ref<string | null>(null);
const selected = computed<NetworkMember | null>({
  get: () => members.value.find(member => member.id === selectedId.value) ?? null,
  set: member => { selectedId.value = member?.id ?? null; },
});
// Clear invalid IDs before a later snapshot can reopen an old account's sheet.
watch(selected, member => { if (!member) selectedId.value = null; }, { flush: "sync" });
const pulseId = ref<string | null>(null);
let pulseTimer: ReturnType<typeof setTimeout> | null = null;
const reducedMotion = ref(false);
let motionQuery: MediaQueryList | null = null;
let pageVisible = true;
function stopPulse() {
  if (pulseTimer) clearTimeout(pulseTimer);
  pulseTimer = null;
  pulseId.value = null;
}
function syncMotion() {
  reducedMotion.value = motionQuery?.matches ?? false;
  if (reducedMotion.value) stopPulse();
}
// A single acknowledgement follows selection; decorative pulses never imply
// a new online event and never run while the page is hidden or motion is reduced.
watch(selectedId, id => {
  stopPulse();
  if (!id || reducedMotion.value || !pageVisible) return;
  pulseId.value = id;
  pulseTimer = setTimeout(stopPulse, 1000);
});
onMounted(() => {
  if (remoteApiEnabled) void network.ensureCanonicalNetwork();
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    syncMotion();
    motionQuery.addEventListener('change', syncMotion);
  }
});
onShow(() => {
  pageVisible = true;
  if (remoteApiEnabled) void network.ensureCanonicalNetwork();
});
onHide(() => { pageVisible = false; stopPulse(); });
onUnmounted(() => {
  stopPulse();
  motionQuery?.removeEventListener('change', syncMotion);
});

const memberGroups = computed(() => [
  { kind: 'direct', label: t.value.network.badgeDirect, emptyLabel: t.value.tree.emptyDirect, members: members.value.filter(member => member.layer === 1) },
  { kind: 'extended', label: t.value.network.badgeExtended, emptyLabel: t.value.tree.emptyExtended, members: members.value.filter(member => member.layer !== 1) },
]);
const memberGroup = ref<'direct' | 'extended'>('direct');
const memberGroupOptions = computed(() => memberGroups.value.map(group => ({ value: group.kind, label: `${group.label} ${visibility.mask(group.members.length)}` })));

const directCount = computed(() => members.value.filter((m) => m.layer === 1).length);
// Orbit dots: up to 12 direct invites on the inner ring and 24 others outside, evenly spaced.
const orbitDots = computed(() => {
  const used = new Set<string>();
  const initialOf = (name: string) => {
    const trimmed = name.trim(), first = trimmed.charAt(0).toUpperCase() || "•";
    // A repeated first letter gets its second letter so two dots never read the same.
    const initial = used.has(first) && trimmed.length > 1 ? first + trimmed.charAt(1).toLowerCase() : first;
    used.add(first);
    return initial;
  };
  const place = (list: typeof members.value, radius: number, offset: number, inner: boolean) => list.map((member, index) => {
    const angle = (offset + index * 360 / list.length) * Math.PI / 180;
    return { id: member.id, inner, color: statusColor(member.status), initial: initialOf(member.name),
      x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
  });
  return [...place(members.value.filter(m => m.layer === 1).slice(0, 12), 25, -90, true),
    ...place(members.value.filter(m => m.layer !== 1).slice(0, 24), 45, -60, false)];
});
const ringSplitText = computed(() => {
  const direct = directCount.value, team = members.value.length - direct;
  return locale.code === "zh" ? `内圈直接邀请 ${direct} · 外圈团队 ${team}` : locale.code === "vi" ? `Vòng trong: mời trực tiếp ${direct} · Vòng ngoài: đội ${team}` : `Inner: direct ${direct} · Outer: team ${team}`;
});
const peopleUnit = computed(() => locale.code === "zh" ? "人" : locale.code === "vi" ? "thành viên" : "members");
const monthPointsLabel = computed(() => locale.code === "zh" ? "本月算力点" : t.value.network.monthVolume);
const memberStatusCounts = computed(() => (["active", "idle", "offline"] as const).map(status => ({
  status, label: networkReauditCopy(locale.code)[status], count: members.value.filter(member => member.status === status).length,
})));

// 头衔显示名收在 lib/v-rank-copy，档位表只读取 canonical store projection。
function memberRankTitle(m: NetworkMember): string {
  return rankTitle(m.vRank, locale.code, vRank.ladder);
}
// The same self route and member detail remain reachable by pointer and keyboard.
const selfNodeLabel = computed(() => fmt(t.value.network.selfNodeLabel, { n: visibility.mask(myRankText.value) }));
function openSelf() {
  void navTo("/pages/team/rank");
}

function nodeLabel(member: NetworkMember): string {
  const relation = member.layer === 1 ? t.value.network.badgeDirect : t.value.network.badgeExtended;
  return `${member.name} · ${visibility.mask(rankLabel(member.vRank, locale.code, vRank.ladder))} · ${relation} · ${networkReauditCopy(locale.code)[member.status]} · ${t.value.network.monthVolume} ${visibility.mask(formatComputePoints(member.monthComputePoints, locale.code))}`;
}
function statusColor(status: MemberStatus): string {
  return status === "active" ? "var(--v5-brand)" : status === "idle" ? "var(--v5-warning)" : "var(--v5-ink-4)";
}

const errorStateStyle: CSSProperties = { padding: "12px 0", borderBottom: "1px solid var(--v5-border)", color: "var(--v5-ink)" };
const sheetStyle: CSSProperties = {
  boxShadow: "var(--nx-glass-edge)", width: "100%", maxWidth: "520px",
  maxHeight: "min(80vh, calc(100% - var(--nx-overlay-top)))", overflowY: "auto", boxSizing: "border-box",
  background: "var(--nx-glass-fill)", backdropFilter: "blur(24px)",
  borderRadius: "28px 28px 0 0", border: "1px solid var(--v5-border)",
  padding: "12px 24px calc(24px + var(--nx-overlay-safe-bottom))",
};
const sheetCloseStyle: CSSProperties = { width: "44px", height: "44px", flexShrink: 0, fontSize: "24px", color: "var(--v5-ink-2)" };
const sheetStatLabelStyle: CSSProperties = { fontSize: "12px", lineHeight: 1.5, color: "var(--v5-ink-3)" };
function sheetStatValStyle(color: string): CSSProperties {
  return { fontSize: "var(--ui-type-profile)", fontWeight: 600, marginTop: "8px", overflowWrap: "anywhere", color };
}

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => selected.value !== null), ".nx-net-sheet-wrap", () => { selected.value = null; }, true);


</script>

<style scoped>
.network-content { display: flex; flex-direction: column; gap: var(--v5-space-4); padding: var(--v5-space-3) var(--v5-space-5) var(--v5-space-6); }
.network-overview { padding: 0 var(--v5-space-4) var(--v5-space-4); border: 0; border-radius: 28px; background: radial-gradient(120% 90% at 50% 40%, color-mix(in srgb, var(--v5-brand) 9%, transparent), transparent 60%), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.network-overview__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-inline); padding-top: var(--ui-space-inset); font: 600 12px/18px var(--font-v5); color: var(--v5-ink-2); }
.network-overview__split { min-width: 0; overflow-wrap: anywhere; }
.network-overview__total { flex: none; color: var(--v5-ink); }
.network-overview__total > .nx-num-metric { font-size: 13px; }
.network-orbit { position: relative; width: 300px; max-width: 100%; aspect-ratio: 1; margin: var(--v5-space-1) auto 0; }
.network-orbit__ring { position: absolute; border-radius: 999px; border: 1px dashed color-mix(in srgb, var(--v5-ink) 14%, transparent); }
.network-orbit__ring--outer { inset: 5%; }
.network-orbit__ring--inner { inset: 25%; border-color: color-mix(in srgb, var(--v5-brand) 30%, transparent); }
.network-orbit__center { position: absolute; left: 50%; top: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; width: 72px; height: 72px; margin: -36px 0 0 -36px; border-radius: 999px; background: radial-gradient(closest-side, color-mix(in srgb, var(--v5-brand) 16%, transparent), transparent); }
.network-orbit__you { font: 600 11px/14px var(--font-v5); color: var(--v5-brand); }
.network-orbit__center:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.network-orbit__dot { position: absolute; display: grid; place-items: center; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 999px; box-shadow: 0 0 0 3px var(--v5-surface); font: 600 10px/1 var(--font-v5); color: var(--v5-on-brand); }
.network-orbit__dot--inner { width: 26px; height: 26px; margin: -13px 0 0 -13px; }
.network-legend { display: flex; justify-content: center; flex-wrap: wrap; gap: var(--v5-space-2) var(--v5-space-3); padding-top: var(--ui-space-row-y); font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); color: var(--v5-ink-3); }
.network-legend__item { display: flex; align-items: center; gap: 5px; }
.network-meta { display: block; color: var(--v5-ink-3); font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); margin-top: var(--v5-space-1); overflow-wrap: anywhere; }
.network-read-state { color: var(--v5-ink-3); font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); padding: var(--v5-space-4) 0; }
.network-member-index { display: flex; flex-direction: column; gap: var(--v5-space-4); }
.network-members-card { padding: 0 var(--ui-space-inset); border-radius: var(--ui-radius-surface); background: var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.network-members-card > .network-member-pick:first-child, .network-members-card > .network-empty:first-child { border-top: 0; }
.network-group-heading { display: flex; align-items: baseline; gap: var(--ui-space-row-y); font-size: var(--ui-type-section); line-height: var(--ui-type-section-lh); font-weight: 600; padding-bottom: var(--v5-space-3); }
.network-group-count { color: var(--v5-ink-3); font-size: var(--ui-type-meta); font-weight: 400; }
.network-member-pick { display: flex; align-items: center; gap: var(--ui-space-inline); min-height: 60px; padding-block: 10px; border-top: 1px solid var(--v5-border); box-sizing: border-box; }
.network-member-pick--selected { background: color-mix(in srgb, var(--v5-brand) 6%, transparent); }
.network-member-identity { flex: 1; min-width: 0; }
.network-member-name { display: block; font-size: var(--ui-type-list-title); line-height: var(--ui-type-list-title-lh); font-weight: 500; overflow-wrap: anywhere; }
.network-member-meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--v5-space-1) 6px; margin-top: 5px; font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); color: var(--v5-ink-3); }
.network-member-dot { width: 5px; height: 5px; border-radius: 50%; flex: none; }
.network-member-compute { max-width: 33%; text-align: right; font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); color: var(--v5-ink-2); overflow-wrap: anywhere; }
.network-member-points { font-size: 15px; line-height: 20px; font-weight: 600; color: var(--v5-ink); }
.network-chevron { color: var(--v5-ink-3); flex: none; }
.network-empty { display: block; padding-block: var(--v5-space-4); border-top: 1px solid var(--v5-border); color: var(--v5-ink-3); font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); }
.sheet-handle { width: 36px; height: 3px; border-radius: 999px; background: var(--v5-ink-4); margin: 0 auto var(--v5-space-5); }
.sheet-heading { display: flex; align-items: center; gap: var(--ui-space-inline); }
.sheet-identity { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.sheet-name { display: block; font-size: var(--ui-type-profile); line-height: var(--ui-type-profile-lh); font-weight: 600; }
.sheet-rank { display: block; margin-top: var(--v5-space-1); font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); color: var(--v5-ink-2); }
.sheet-relation { display: block; font-size: var(--ui-type-meta); line-height: 1.5; margin-top: var(--v5-space-1); }
.sheet-metrics { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--v5-space-5); padding: var(--v5-space-6) 0; }
.sheet-detail-row { display: flex; align-items: start; justify-content: space-between; gap: var(--v5-space-5); padding: 14px 0; border-top: 1px solid var(--v5-border); font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3); line-height: 1.5; }
.sheet-joined-date { flex-wrap: wrap; }
.sheet-joined-date > :last-child { min-width: 0; flex: 1 1 170px; }
.sheet-detail-row > :last-child { text-align: right; color: var(--v5-ink); overflow-wrap: anywhere; }
[role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.nx-net-sheet-wrap { position: fixed; inset: 0; z-index: 790; display: flex; align-items: flex-end; justify-content: center; }
.nx-net-scrim { position: absolute; inset: 0; background: color-mix(in srgb, var(--v5-surface-3) 70%, transparent); backdrop-filter: blur(4px); }
.nx-net-sheet { position: relative; z-index: 1; }
@media (max-width: 374px) { .network-content { padding-inline: var(--v5-space-4); } .network-overview { padding-inline: 14px; } .network-member-pick { gap: var(--v5-space-2); min-height: 56px; } }
</style>
