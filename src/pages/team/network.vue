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
        <view class="network-overview">
          <view class="network-self" role="button" tabindex="0" :aria-label="selfNodeLabel" @click="openSelf" @keydown.enter.prevent="openSelf" @keydown.space.prevent="openSelf">
            <TeamRankEmblem v-if="!visibility.hidden" :rank="remoteApiEnabled && !vRank.remoteReady ? null : myRank" :size="44" />
            <view class="network-self-copy"><text class="network-self-title">{{ t.network.diagramYou }}</text><text class="network-meta">{{ visibility.mask(myRankText) }}</text></view>
            <text class="network-self-route">{{ t.rank.currentRank }}</text><text class="network-chevron" aria-hidden="true">→</text>
          </view>
          <view class="network-metrics">
            <view :style="metricCardStyle"><text class="block" :style="metricLabelStyle">{{ t.network.members }}</text><text class="block font-display tabular-nums" :style="metricValueStyle('var(--v5-ink)')">{{ visibility.mask(metricsUnavailable ? '—' : members.length) }}</text></view>
            <view :style="metricCardStyle"><text class="block" :style="metricLabelStyle">{{ t.network.activeNow }}</text><text class="block font-display tabular-nums" :style="metricValueStyle('var(--v5-brand)')">{{ visibility.mask(metricsUnavailable ? '—' : activeCount) }}</text></view>
            <view :style="metricCardStyle"><text class="block" :style="metricLabelStyle">{{ t.network.direct }}</text><text class="block font-display tabular-nums" :style="metricValueStyle('var(--v5-ink-2)')">{{ visibility.mask(metricsUnavailable ? '—' : directCount) }}</text></view>
          </view>
          <view v-if="!visibility.hidden && !metricsUnavailable && members.length" class="network-distribution" aria-hidden="true">
            <view class="network-distribution-direct" :style="{ flexGrow: directCount }" />
            <view class="network-distribution-other" :style="{ flexGrow: members.length - directCount }" />
          </view>
          <view class="network-legend"><text>{{ t.network.legendDirect }}</text><text>{{ t.network.legendExtended }}</text></view>
        </view>
        <view v-if="metricsUnavailable && network.remoteStatus !== 'error'" role="status" aria-busy="true" class="network-read-state"><text>{{ t.network.projectionLoadingTitle }}</text></view>
        <text v-if="!visibility.hidden && idleCount > 0" class="network-meta">{{ idleSuffixText }}</text>
        <view v-if="members.length || !metricsUnavailable" class="network-member-index">
          <view v-for="group in memberGroups" :key="group.kind" class="network-member-group">
            <view class="network-group-heading"><text>{{ group.label }}</text><text class="network-group-count tabular-nums">{{ visibility.mask(group.members.length) }}</text></view>
            <text v-if="!group.members.length" class="network-empty">{{ visibility.mask(group.emptyLabel) }}</text>
            <view v-for="member in group.members" :key="member.id" class="network-member-pick nx-net-node" :class="{ 'network-member-pick--selected': pulseId === member.id }"
              role="button" tabindex="0" :aria-label="nodeLabel(member)" @click="selected = member" @keydown.enter.prevent="selected = member" @keydown.space.prevent="selected = member">
              <TeamRankEmblem v-if="!visibility.hidden" :rank="member.vRank" :size="36" />
              <view class="network-member-identity">
                <text class="network-member-name">{{ member.name }}</text>
                <view class="network-member-meta"><text>{{ visibility.mask(rankLabel(member.vRank, locale.code, [])) }}</text><view class="network-member-dot" :style="{ background: statusColor(member.status) }" aria-hidden="true" /><text>{{ networkReauditCopy(locale.code)[member.status] }}</text></view>
              </view>
              <view class="network-member-compute"><text class="tabular-nums">{{ visibility.mask(formatComputePoints(member.monthComputePoints, locale.code)) }}</text><text class="network-meta">{{ t.network.monthVolume }}</text></view>
              <text class="network-chevron" aria-hidden="true">›</text>
            </view>
          </view>
        </view>
        <view class="network-list-link" role="button" tabindex="0" @click="navTo('/pages/team/tree')" @keydown.enter.prevent="navTo('/pages/team/tree')" @keydown.space.prevent="navTo('/pages/team/tree')"><text>{{ t.tree.pageTitle }}</text><text aria-hidden="true">→</text></view>
      </view>

      <!-- The only surfaced container is the modal member detail. -->
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

const directCount = computed(() => members.value.filter((m) => m.layer === 1).length);
const activeCount = computed(() => members.value.filter((m) => m.status === "active").length);
const idleCount = computed(() => members.value.filter((m) => m.status === "idle").length);

const idleSuffixText = computed(() => fmt(t.value.network.idleSuffix, { n: idleCount.value }));

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
  return `${member.name} · ${visibility.mask(rankLabel(member.vRank, locale.code, vRank.ladder))} · ${relation}`;
}
function statusColor(status: MemberStatus): string {
  return status === "active" ? "var(--v5-brand)" : status === "idle" ? "var(--v5-warning)" : "var(--v5-ink-4)";
}

const metricCardStyle: CSSProperties = { display: "flex", flexDirection: "column", minWidth: 0 };
const errorStateStyle: CSSProperties = { padding: "12px 0", borderBottom: "1px solid var(--v5-border)", color: "var(--v5-ink)" };
const metricLabelStyle: CSSProperties = { fontSize: "var(--ui-type-meta)", color: "var(--v5-ink-3)", lineHeight: "var(--ui-type-meta-lh)", flex: 1 };
function metricValueStyle(color: string): CSSProperties {
  return { fontSize: "var(--ui-type-page-title)", lineHeight: "var(--ui-type-page-title-lh)", fontWeight: 600, marginTop: "6px", overflowWrap: "anywhere", color };
}
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
.network-content { display: flex; flex-direction: column; gap: 24px; padding: 12px 20px 24px; }
.network-overview { padding: 0 16px 16px; border: 1px solid var(--v5-border); border-radius: 20px; background: var(--v5-surface); }
.network-self { display: flex; align-items: center; gap: 10px; min-height: 64px; padding-block: 10px; border-bottom: 1px solid var(--v5-border); }
.network-self-copy { min-width: 0; flex: 1; }
.network-self-title { display: block; font-size: var(--ui-type-list-title); line-height: var(--ui-type-list-title-lh); font-weight: 500; }
.network-self-route { max-width: 36%; color: var(--v5-ink-3); font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); text-align: right; }
.network-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; padding-block: 18px; }
.network-distribution { display: flex; height: 5px; overflow: hidden; border-radius: 3px; background: var(--v5-surface-3); }
.network-distribution > view { min-width: 0; flex-basis: 0; }
.network-distribution-direct { background: var(--v5-brand); }
.network-distribution-other { background: var(--v5-ink-3); }
.network-legend { display: flex; justify-content: space-between; gap: 16px; padding-top: 10px; font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); color: var(--v5-ink-3); }
.network-legend > text { flex: 1; min-width: 0; }
.network-legend > text:first-child { color: var(--v5-brand); }
.network-legend > text:last-child { text-align: right; }
.network-meta { display: block; color: var(--v5-ink-3); font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); margin-top: 4px; overflow-wrap: anywhere; }
.network-read-state { color: var(--v5-ink-3); font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); padding: 16px 0; }
.network-member-index { display: flex; flex-direction: column; gap: 28px; }
.network-group-heading { display: flex; align-items: baseline; gap: 10px; font-size: var(--ui-type-section); line-height: var(--ui-type-section-lh); font-weight: 600; padding-bottom: 12px; }
.network-group-count { color: var(--v5-ink-3); font-size: var(--ui-type-meta); font-weight: 400; }
.network-member-pick { display: flex; align-items: center; gap: 10px; min-height: 64px; padding-block: 14px; border-top: 1px solid var(--v5-border); box-sizing: border-box; }
.network-member-pick--selected { background: color-mix(in srgb, var(--v5-brand) 6%, transparent); }
.network-member-identity { flex: 1; min-width: 0; }
.network-member-name { display: block; font-size: var(--ui-type-list-title); line-height: var(--ui-type-list-title-lh); font-weight: 500; overflow-wrap: anywhere; }
.network-member-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; margin-top: 5px; font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); color: var(--v5-ink-3); }
.network-member-dot { width: 5px; height: 5px; border-radius: 50%; flex: none; }
.network-member-compute { max-width: 33%; text-align: right; font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); color: var(--v5-ink-2); overflow-wrap: anywhere; }
.network-chevron { color: var(--v5-ink-3); flex: none; }
.network-empty { display: block; padding-block: 16px; border-top: 1px solid var(--v5-border); color: var(--v5-ink-3); font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); }
.network-list-link { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 48px; padding: 12px 0; border-top: 1px solid var(--v5-border); color: var(--v5-ink-2); font-size: var(--ui-type-button); line-height: var(--ui-type-button-lh); }
.sheet-handle { width: 36px; height: 3px; border-radius: 999px; background: var(--v5-ink-4); margin: 0 auto 20px; }
.sheet-heading { display: flex; align-items: center; gap: var(--ui-space-inline); }
.sheet-identity { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.sheet-name { display: block; font-size: var(--ui-type-profile); line-height: var(--ui-type-profile-lh); font-weight: 600; }
.sheet-rank { display: block; margin-top: 4px; font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); color: var(--v5-ink-2); }
.sheet-relation { display: block; font-size: var(--ui-type-meta); line-height: 1.5; margin-top: 4px; }
.sheet-metrics { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; padding: 24px 0; }
.sheet-detail-row { display: flex; align-items: start; justify-content: space-between; gap: 20px; padding: 14px 0; border-top: 1px solid var(--v5-border); font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3); line-height: 1.5; }
.sheet-joined-date { flex-wrap: wrap; }
.sheet-joined-date > :last-child { min-width: 0; flex: 1 1 170px; }
.sheet-detail-row > :last-child { text-align: right; color: var(--v5-ink); overflow-wrap: anywhere; }
[role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.nx-net-sheet-wrap { position: fixed; inset: 0; z-index: 790; display: flex; align-items: flex-end; justify-content: center; }
.nx-net-scrim { position: absolute; inset: 0; background: color-mix(in srgb, var(--v5-surface-3) 70%, transparent); backdrop-filter: blur(4px); }
.nx-net-sheet { position: relative; z-index: 1; }
@media (max-width: 374px) { .network-content { padding-inline: 16px; } .network-overview { padding-inline: 14px; } .network-member-pick { gap: 8px; min-height: 56px; } }
</style>
