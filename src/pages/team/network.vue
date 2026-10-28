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
        <view class="grid grid-cols-3 network-metrics" style="gap: 8px">
          <view class="text-center" :style="metricCardStyle">
            <text class="block" :style="metricLabelStyle">{{ t.network.members }}</text>
            <text class="block font-display tabular-nums" :style="metricValueStyle('var(--v5-ink)')">{{ metricsUnavailable ? '—' : members.length }}</text>
          </view>
          <view class="text-center" :style="metricCardStyle">
            <text class="block" :style="metricLabelStyle">{{ t.network.activeNow }}</text>
            <text class="block font-display tabular-nums" :style="metricValueStyle('var(--v5-brand)')">{{ metricsUnavailable ? '—' : activeCount }}</text>
          </view>
          <view class="text-center" :style="metricCardStyle">
            <text class="block" :style="metricLabelStyle">{{ t.network.direct }}</text>
            <text class="block font-display tabular-nums" :style="metricValueStyle('var(--v5-ink-2)')">{{ metricsUnavailable ? '—' : directCount }}</text>
          </view>
        </view>

        <view v-if="metricsUnavailable && network.remoteStatus !== 'error'" role="status" aria-busy="true" class="network-read-state"><text>{{ t.network.projectionLoadingTitle }}</text></view>
        <view class="relative network-graph" :style="orbCardStyle">
          <!-- APP-vue creates template SVG as HTML unknown elements. Keep this
               interactive graph in supported view/text nodes with the same 360
               coordinate system; do not broaden the small-icon SVG adapter. -->
          <!-- #ifdef APP-PLUS -->
          <view class="nx-net-native" style="position: relative; width: 100%; height: 0; padding-top: 100%">
            <view class="nx-net-native-orbit" :style="nativeOrbitStyle(DIRECT_RADIUS, false)" />
            <view class="nx-net-native-orbit" :style="nativeOrbitStyle(140, true)" />
            <view :style="{ ...nativePosition(CENTER, CENTER), width: '28%', height: '28%', borderRadius: '50%', background: 'radial-gradient(circle, var(--v5-brand-soft), transparent)', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }" />
            <view v-for="p in directPlotted" :key="`conn-${p.m.id}`" class="nx-net-native-connection" :style="nativeConnectionStyle(p)" />
            <view
              v-for="p in plotted"
              :key="p.m.id"
              class="nx-net-node cursor-pointer"
              role="button"
              tabindex="0"
              :aria-label="nodeLabel(p)"
              :style="nativeNodeStyle(p.x, p.y)"
              @click="selected = p.m"

              @keydown.enter.prevent="selected = p.m" @keydown.space.prevent="selected = p.m"
            >
              <view v-if="pulseId === p.m.id" class="nx-net-native-pulse" :style="{ borderColor: p.kind === 'direct' ? DIRECT_COLOR : EXTENDED_COLOR }" />
              <view :style="{ width: p.kind === 'direct' ? '12px' : '8px', height: p.kind === 'direct' ? '12px' : '8px', borderRadius: '50%', background: 'linear-gradient(145deg, var(--v5-ink-2), var(--v5-surface-3))', border: `1px solid ${p.kind === 'direct' ? DIRECT_COLOR : EXTENDED_COLOR}`, opacity: p.m.status === 'offline' ? 0.6 : 0.95 }" />
              <text class="network-native-name">{{ compactMemberName(p.m.name) }}</text>
            </view>
            <view
              class="nx-net-node cursor-pointer"
              role="button"
              tabindex="0"
              :aria-label="selfNodeLabel"
              :style="nativeNodeStyle(CENTER, CENTER, 44)"
              @click="openSelf"

              @keydown.enter.prevent="openSelf" @keydown.space.prevent="openSelf"
            >
              <view style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(145deg, var(--v5-ink-3), var(--v5-surface-3)); border: 1px solid var(--v5-brand)">
                <text style="font-family: var(--font-v5); font-weight: 600; font-size: 11px; color: var(--v5-ink)">{{ t.network.diagramYou }}</text>
              </view>
            </view>
            <text :style="nativeLabelStyle(158, 'var(--v5-brand)', 9)">{{ myRankText }}</text>
          </view>
          <!-- #endif -->
          <!-- #ifndef APP-PLUS -->
          <svg viewBox="0 0 360 360" class="block w-full" preserveAspectRatio="xMidYMid meet" style="width: 100%">
            <defs>
              <linearGradient id="networkSilver" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="var(--v5-ink-3)" />
                <stop offset="45%" stop-color="var(--v5-surface-2)" />
                <stop offset="100%" stop-color="var(--v5-ink-4)" />
              </linearGradient>
              <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="rgba(198,255,58,0.35)" />
                <stop offset="60%" stop-color="rgba(198,255,58,0.10)" />
                <stop offset="100%" stop-color="rgba(198,255,58,0)" />
              </radialGradient>
            </defs>

            <!-- 2 orbit guides -->
            <circle cx="180" cy="180" :r="DIRECT_RADIUS" fill="none" stroke="rgba(198,255,58,0.18)" stroke-width="0.8" stroke-dasharray="1 0" />
            <circle cx="180" cy="180" r="140" fill="none" stroke="var(--v5-ink-3)" stroke-opacity="0.25" stroke-width="0.8" stroke-dasharray="2 6" />

            <circle cx="180" cy="180" r="50" fill="url(#centerGlow)" />

            <!-- connection lines: center → direct -->
            <line
              v-for="p in directPlotted"
              :key="`conn-${p.m.id}`"
              x1="180"
              y1="180"
              :x2="p.x"
              :y2="p.y"
              :stroke="p.m.status === 'active' ? 'rgba(198,255,58,0.30)' : 'var(--v5-border)'"
              stroke-width="0.6"
            />

            <!-- member nodes — each is a real focusable button. The orb graphic stays
                 the layout; role/tabindex/aria-label + explicit keydown make every node
                 reachable and named. (SVGElement has no .click(), so the shared
                 activation layer cannot synthesize activation here — globe.vue's
                 established pattern: hand-written keydown with .prevent, which makes
                 the platform layer yield via ev.defaultPrevented.) -->
            <g
              v-for="p in plotted"
              :key="p.m.id"
              class="nx-net-node cursor-pointer"
              role="button"
              tabindex="0"
              :aria-label="nodeLabel(p)"
              @click="selected = p.m"

              @keydown.enter.prevent="selected = p.m" @keydown.space.prevent="selected = p.m"
            >
              <rect :x="p.x - 32" :y="p.y - 32" width="64" height="64" fill="transparent" pointer-events="all" />
              <circle v-if="pulseId === p.m.id" :cx="p.x" :cy="p.y" r="10">
                <animate attributeName="r" values="4;18;4" dur="1s" repeatCount="1" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="1s" repeatCount="1" />
                <set attributeName="fill" :to="p.kind === 'direct' ? DIRECT_COLOR : EXTENDED_COLOR" />
              </circle>
              <circle
                :cx="p.x"
                :cy="p.y"
                :r="p.kind === 'direct' ? 5 : 3.5"
                fill="url(#networkSilver)"
                :stroke="p.kind === 'direct' ? DIRECT_COLOR : EXTENDED_COLOR"
                stroke-width="0.8"
                :fill-opacity="p.m.status === 'offline' ? 0.6 : 0.95"
              />
              <SvgText :x="p.x" :y="p.y + 19" text-anchor="middle" font-family="var(--font-v5)" font-size="11" fill="var(--v5-ink-2)" pointer-events="none">{{ compactMemberName(p.m.name) }}</SvgText>
            </g>

            <!-- center YOU node — also a real focusable control. The member orbs
                 were named, but the root node stayed a bare graphic: with 0 members
                 it is the only node on screen, so a keyboard/screen-reader user
                 could not reach the page's declared core action at all (BUG 96).
                 Same SVGElement constraint as the orbs: hand-written keydown. -->
            <g
              class="nx-net-node cursor-pointer"
              role="button"
              tabindex="0"
              :aria-label="selfNodeLabel"
              @click="openSelf"

              @keydown.enter.prevent="openSelf" @keydown.space.prevent="openSelf"
            >
              <!-- Match the member hit area: 64 viewBox units still exceed 44 CSS
                   pixels at the supported 320px phone width. The orb stays 36. -->
              <rect x="148" y="148" width="64" height="64" fill="transparent" pointer-events="all" />
              <circle cx="180" cy="180" r="18" fill="url(#networkSilver)" stroke="var(--v5-brand)" stroke-width="0.8" />
              <SvgText x="180" y="181" text-anchor="middle" dominant-baseline="middle" font-family="var(--font-v5)" font-weight="600" font-size="11" fill="var(--v5-ink)">{{ t.network.diagramYou }}</SvgText>
              <SvgText x="180" y="158" text-anchor="middle" font-family="var(--font-v5)" font-weight="600" font-size="9" fill="color-mix(in srgb, var(--v5-brand) 85%, transparent)" letter-spacing="1.5">{{ myRankText }}</SvgText>
            </g>

            <!-- orbit labels -->
          </svg>
          <!-- #endif -->

          <!-- Legend -->
          <view class="flex items-center justify-center" :style="legendWrapStyle">
            <view class="inline-flex items-center" style="gap: 4px">
              <view class="rounded-full" :style="{ width: '7px', height: '7px', background: DIRECT_COLOR }" />
              <text>{{ t.network.legendDirect }}</text>
            </view>
            <view class="inline-flex items-center" style="gap: 4px">
              <view class="rounded-full" :style="{ width: '7px', height: '7px', background: EXTENDED_COLOR }" />
              <text>{{ t.network.legendExtended }}</text>
            </view>
          </view>
        </view>

        <!-- Footer note -->
        <view :style="footerStyle">
          <text v-if="idleCount > 0">{{ idleSuffixText }}</text>
          <text>{{ t.network.legend }}</text>
        </view>
        <view v-if="members.length" class="network-member-index">
          <view v-for="member in members.slice(0, 12)" :key="member.id" class="network-member-pick" role="button" tabindex="0" :aria-label="member.name" @click="selected=member" @keydown.enter.prevent="selected=member" @keydown.space.prevent="selected=member">
            <view class="network-member-dot" :style="{background:member.layer===1 ? DIRECT_COLOR : EXTENDED_COLOR}" /><text class="network-member-name">{{ member.name }}</text><text class="network-member-rank">V{{ member.vRank }}</text>
          </view>
        </view>
        <view class="network-list-link" role="button" tabindex="0" @click="navTo('/pages/team/tree')" @keydown.enter.prevent="navTo('/pages/team/tree')" @keydown.space.prevent="navTo('/pages/team/tree')"><text>{{ t.tree.pageTitle }}</text><text aria-hidden="true">→</text></view>
      </view>

      <!-- The only surfaced container is the modal member detail. -->
      <view v-if="selected" class="nx-net-sheet-wrap" role="dialog" aria-modal="true" :aria-label="selected.name">
        <view class="nx-net-scrim" @click="selected = null" />
        <view class="nx-glass-sheet nx-net-sheet" :style="sheetStyle">
          <view class="sheet-handle" aria-hidden="true" />
          <view class="sheet-heading">
            <TeamRankEmblem :rank="selected.vRank" :size="60" />
            <view class="sheet-identity">
              <text class="sheet-name">{{ selected.name }}</text>
              <text class="sheet-rank">{{ rankLabel(selected.vRank, locale.code, vRank.ladder) }}</text>
              <text class="sheet-relation" :style="{ color: selected.layer === 1 ? DIRECT_COLOR : EXTENDED_COLOR }">{{ selected.layer === 1 ? t.network.badgeDirect : t.network.badgeExtended }}<text v-if="selected.city"> · {{ selected.city }}</text></text>
            </view>
            <view class="grid place-items-center active:opacity-60" :style="sheetCloseStyle" role="button" tabindex="0" :aria-label="t.ui.close" @click="selected = null" @keydown.enter.prevent="selected = null" @keydown.space.prevent="selected = null">
              <text aria-hidden="true">×</text>
            </view>
          </view>
          <view class="sheet-metrics">
            <view>
              <text class="block" :style="sheetStatLabelStyle">{{ t.network.monthVolume }}</text>
              <text class="block font-display tabular-nums" :style="sheetStatValStyle('var(--v5-brand)')">{{ formatComputePoints(selected.monthComputePoints, locale.code) }}</text>
            </view>
            <view>
              <text class="block" :style="sheetStatLabelStyle">{{ t.network.allTime }}</text>
              <text class="block font-display tabular-nums" :style="sheetStatValStyle('var(--v5-ink)')">{{ formatComputePoints(selected.lifetimeComputePoints, locale.code) }}</text>
            </view>
          </view>
          <view class="sheet-detail-row sheet-joined-date"><text>{{ t.network.joined }}</text><text>{{ formatDisplayDateTime(selected.joinedAt, locale.code) }}</text></view>
          <view class="sheet-detail-row"><text>{{ t.network.status }}</text><text :style="{ color: statusColor(selected.status) }">{{ networkReauditCopy(locale.code)[selected.status] }}</text></view>
          <view v-if="memberRankTitle(selected)" class="sheet-detail-row"><text>{{ t.network.title }}</text><text>{{ memberRankTitle(selected) }}</text></view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatDisplayDateTime } from "@/lib/display-date";
import { displayNickname } from "@/lib/brand-copy";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { formatComputePoints } from "@/i18n/compute-points";
import { computed, ref, watch, onMounted, onUnmounted, type CSSProperties } from "vue";
import SvgText from "@/components/svg-text";
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

const VIEW = 360;
const CENTER = VIEW / 2;
const DIRECT_COLOR = "var(--v5-brand)";
const EXTENDED_COLOR = "var(--v5-ink-2)";
const DIRECT_RADIUS = 72;
const EXTENDED_RADIUS_MIN = 140;
const EXTENDED_RADIUS_MAX = 140;

interface Plotted {
  m: NetworkMember;
  kind: "direct" | "extended";
  x: number;
  y: number;
}

const t = useT();
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

const plotted = computed<Plotted[]>(() => {
  const direct = members.value.filter((m) => m.layer === 1).slice(0,6);
  const extended = members.value.filter((m) => m.layer !== 1).slice(0,12);
  const out: Plotted[] = [];
  const r2 = (n: number) => Math.round(n * 100) / 100;

  direct.forEach((m, i) => {
    const deg = (i / Math.max(1, direct.length)) * 360 - 90;
    const rad = (deg * Math.PI) / 180;
    out.push({ m, kind: "direct", x: r2(CENTER + Math.cos(rad) * DIRECT_RADIUS), y: r2(CENTER + Math.sin(rad) * DIRECT_RADIUS) });
  });
  extended.forEach((m, i) => {
    const deg = (i / Math.max(1, extended.length)) * 360 + (i % 2 === 0 ? 0 : 6);
    const rad = (deg * Math.PI) / 180;
    const span = EXTENDED_RADIUS_MAX - EXTENDED_RADIUS_MIN;
    const r = EXTENDED_RADIUS_MIN + (((i * 37) % 100) / 100) * span;
    out.push({ m, kind: "extended", x: r2(CENTER + Math.cos(rad) * r), y: r2(CENTER + Math.sin(rad) * r) });
  });
  return out;
});
const directPlotted = computed(() => plotted.value.filter((p) => p.kind === "direct"));

// #ifdef APP-PLUS
function nativePosition(x: number, y: number): CSSProperties {
  return { position: "absolute", left: `${x / VIEW * 100}%`, top: `${y / VIEW * 100}%` };
}
function nativeNodeStyle(x: number, y: number, size = 48): CSSProperties {
  return { ...nativePosition(x, y), width: `${size}px`, height: `${size}px`, display: "flex", alignItems: "center", justifyContent: "center", transform: "translate(-50%, -50%)" };
}
function nativeOrbitStyle(radius: number, extended: boolean): CSSProperties {
  const diameter = `${radius * 2 / VIEW * 100}%`;
  return { ...nativePosition(CENTER, CENTER), width: diameter, height: diameter, borderRadius: "50%", border: `1px ${extended ? "dashed" : "solid"} ${extended ? EXTENDED_COLOR : DIRECT_COLOR}`, opacity: 0.18, transform: "translate(-50%, -50%)", pointerEvents: "none" };
}
function nativeConnectionStyle(p: Plotted): CSSProperties {
  const dx = p.x - CENTER, dy = p.y - CENTER;
  return { ...nativePosition(CENTER, CENTER), width: `${Math.hypot(dx, dy) / VIEW * 100}%`, height: "1px", background: p.m.status === "active" ? DIRECT_COLOR : "var(--v5-ink-4)", opacity: p.m.status === "active" ? 0.3 : 0.06, transform: `rotate(${Math.atan2(dy, dx)}rad)`, transformOrigin: "0 50%", pointerEvents: "none" };
}
function nativeLabelStyle(y: number, color: string, size: number): CSSProperties {
  return { ...nativePosition(CENTER, y), transform: "translate(-50%, -100%)", color, fontSize: `${size}px`, fontFamily: "var(--font-jet-mono)", letterSpacing: "1.5px", whiteSpace: "nowrap", pointerEvents: "none" };
}
// #endif

const directCount = computed(() => members.value.filter((m) => m.layer === 1).length);
const activeCount = computed(() => members.value.filter((m) => m.status === "active").length);
const idleCount = computed(() => members.value.filter((m) => m.status === "idle").length);

const idleSuffixText = computed(() => fmt(t.value.network.idleSuffix, { n: idleCount.value }));

// 头衔显示名收在 lib/v-rank-copy，档位表只读取 canonical store projection。
function memberRankTitle(m: NetworkMember): string {
  return rankTitle(m.vRank, locale.code, vRank.ladder);
}
// Orb nodes are the only way into a member's detail sheet; name each one with the
// member, their rank and the relation (direct / extended) so a screen reader user
// can pick a node without seeing the graphic. rankLabel always carries `V{n}` —
// rankTitle alone renders empty when the ladder has not loaded (remote mode).
// 中心「你」节点的可访问名称与激活行为。它不打开成员详情(自己没有 NetworkMember 行),
// 而是进入「我的等级」——这是根节点在页面上唯一有意义的动作。名称里的 {n} 是**完整的**
// 等级文本(myRankText 已含 V 前缀);词典里不得再写 V{n},否则读屏会把 V0 念成 VV0
// (zentao #222)。等级未就绪时用 — 占位,绝不产出空名(空 aria-label 等于没有可访问名称)。
const selfNodeLabel = computed(() => fmt(t.value.network.selfNodeLabel, { n: myRankText.value }));
function openSelf() {
  void navTo("/pages/team/rank");
}

function compactMemberName(name: string): string { const chars = Array.from(name); return chars.length > 8 ? chars.slice(0,7).join('') + '…' : name; }
function nodeLabel(p: Plotted): string {
  const relation = p.kind === "direct" ? t.value.network.badgeDirect : t.value.network.badgeExtended;
  return `${p.m.name} · ${rankLabel(p.m.vRank, locale.code, vRank.ladder)} · ${relation}`;
}
function statusColor(status: MemberStatus): string {
  return status === "active" ? "var(--v5-brand)" : status === "idle" ? "var(--v5-warning)" : "var(--v5-ink-4)";
}

// Metrics stay on the floor; the interactive graph has one quiet canvas.
const metricCardStyle: CSSProperties = { padding: "12px 4px", display: "flex", flexDirection: "column" };
const errorStateStyle: CSSProperties = { padding: "12px 0", borderBottom: "1px solid var(--v5-border)", color: "var(--v5-ink)" };
const metricLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.5, flex: 1 };
function metricValueStyle(color: string): CSSProperties {
  return { fontSize: "26px", fontWeight: 600, marginTop: "8px", color };
}
const orbCardStyle: CSSProperties = {
  background: "color-mix(in srgb, var(--v5-ink) 3%, var(--v5-bg))",
  border: "1px solid var(--v5-border)", borderRadius: "24px",
  padding: "8px", boxSizing: "border-box",
};
const legendWrapStyle: CSSProperties = { padding: "12px 0", gap: "16px", flexWrap: "wrap", fontSize: "12px", color: "var(--v5-ink-3)" };
const footerStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", textAlign: "center", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.625 };
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
  return { fontSize: "24px", fontWeight: 600, marginTop: "8px", overflowWrap: "anywhere", color };
}

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => selected.value !== null), ".nx-net-sheet-wrap", () => { selected.value = null; }, true);


</script>

<style scoped>
.network-content { display: flex; flex-direction: column; gap: var(--ui-space-section); padding: var(--ui-space-inline) 20px 24px; }
.network-metrics { border-bottom: 1px solid var(--v5-border); padding-bottom: 12px; }
.network-graph { width: 100%; max-width: 520px; align-self: center; }
.network-read-state { color: var(--v5-ink-3); font-size: 13px; text-align: center; padding: var(--ui-space-inline) 0; }
.network-member-index { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px;margin-bottom:var(--ui-space-section); }
.network-member-pick { display:flex;align-items:center;gap:8px;min-height:48px;border-bottom:1px solid var(--v5-border);font-size:13px; }
.network-member-dot { width:5px;height:5px;border-radius:50%;flex-shrink:0; }
.network-member-name { min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1; }
.network-member-rank { font-size:11px;color:var(--v5-ink-3); }
.network-native-name { position:absolute;top:32px;left:50%;transform:translateX(-50%);font-size:10px;white-space:nowrap;color:var(--v5-ink-2);pointer-events:none; }
.network-list-link { display: flex; align-items: center; justify-content: center; gap: var(--ui-space-inline); min-height: 48px; padding: var(--ui-space-row-y) 20px; border: 1px solid var(--v5-border); border-radius: 999px; background: color-mix(in srgb, var(--v5-ink) 6%, transparent); font-size: 14px; }
.sheet-handle { width: 36px; height: 3px; border-radius: 999px; background: var(--v5-ink-4); margin: 0 auto 20px; }
.sheet-heading { display: flex; align-items: center; gap: var(--ui-space-inline); }
.sheet-identity { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.sheet-name { display: block; font-size: 20px; font-weight: 600; }
.sheet-rank { display: block; margin-top: 4px; font-size: 12px; color: var(--v5-ink-2); }
.sheet-relation { display: block; font-size: 12px; line-height: 1.5; margin-top: 4px; }
.sheet-metrics { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--ui-space-section); padding: 24px 0; }
.sheet-detail-row { display: flex; align-items: start; justify-content: space-between; gap: var(--ui-space-section); padding: var(--ui-space-inset) 0; border-top: 1px solid var(--v5-border); font-size: 13px; color: var(--v5-ink-3); line-height: 1.5; }
.sheet-joined-date { flex-wrap: wrap; }
.sheet-joined-date > :last-child { min-width: 0; flex: 1 1 170px; }
.sheet-detail-row > :last-child { text-align: right; color: var(--v5-ink); overflow-wrap: anywhere; }
[role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { .nx-net-native-pulse { animation: none !important; } }

/* #ifdef APP-PLUS */
.nx-net-native-pulse {
  position: absolute;
  width: 20px;
  height: 20px;
  border: 1px solid;
  border-radius: 50%;
  pointer-events: none;
  animation: nx-net-native-pulse 1s;
}
@keyframes nx-net-native-pulse {
  0%, 100% { transform: scale(0.4); opacity: 0.6; }
  50% { transform: scale(1.8); opacity: 0; }
}
/* #endif */
.nx-net-sheet-wrap {
  position: fixed;
  inset: 0;
  z-index: 790;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.nx-net-scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--v5-surface-3) 70%, transparent);
  backdrop-filter: blur(4px);
}
.nx-net-sheet {
  position: relative;
  z-index: 1;
}
/* Orb nodes are focusable buttons now. outline follows the node's bounding box,
   so the focused member is visible without redrawing the graphic. */
.nx-net-node {
  outline: none;
}
.nx-net-node:focus,
.nx-net-node:focus-visible {
  outline: 2px solid var(--v5-brand);
  outline-offset: 3px;
}
</style>
