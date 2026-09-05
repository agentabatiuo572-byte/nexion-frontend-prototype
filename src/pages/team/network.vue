<!--
  Influence Network — ported from Nexion-prototype/app/(main)/team/network/page.tsx.
  2-orbit orb visualization: center YOU + inner orbit (Direct, lemon) + outer orbit
  (Extended, purple). Top metrics (members/active/direct) + SVG orb (orbit guides +
  connection lines + member nodes w/ random active-pulse + center node + orbit
  labels) + legend + footer note + member detail bottom sheet (tap a node).
  No L1-L7 / binary wings / 4-color layers (de-MLM'd). Sub-page → <AppChassis
  active="team"> w/ back → /team. Reuses network + v-rank stores + VBadge.
  React effect interval → onMounted/onUnmounted (P-034). React sheet state → ref +
  page mount (P-032). SVG <g @click> node taps (globe.vue pattern). SVG <animate>
  renders (P-013). banned hex #06080C→var(--v5-bg), #3A3A3A→var(--v5-ink-4).
-->
<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.network.pageTitle" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px; padding-top: 16px">
        <view v-if="remoteApiEnabled && network.remoteStatus === 'error'" :style="errorStateStyle">
          <text class="block" style="font-weight: 600">{{ t.network.projectionErrorTitle }}</text>
          <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ t.network.projectionErrorDesc }}</text>
          <view role="button" tabindex="0" :style="retryStyle" @click="network.refreshCanonicalNetwork()"><text>{{ t.network.retry }}</text></view>
        </view>
        <!-- Top metrics — filled stat tiles, no border (single visual difference) -->
        <view class="grid grid-cols-3" style="gap: 8px">
          <view class="rounded-2xl text-center" :style="metricCardStyle">
            <text class="block" :style="metricLabelStyle">{{ t.network.members }}</text>
            <text class="block font-display tabular-nums" :style="metricValueStyle('var(--v5-ink)')">{{ remoteApiEnabled && network.remoteStatus !== 'ready' ? '—' : members.length }}</text>
          </view>
          <view class="rounded-2xl text-center" :style="metricCardStyle">
            <text class="block" :style="metricLabelStyle">{{ t.network.activeNow }}</text>
            <text class="block font-display tabular-nums" :style="metricValueStyle('var(--v5-brand)')">{{ remoteApiEnabled && network.remoteStatus !== 'ready' ? '—' : activeCount }}</text>
          </view>
          <view class="rounded-2xl text-center" :style="metricCardStyle">
            <text class="block" :style="metricLabelStyle">{{ t.network.direct }}</text>
            <text class="block font-display tabular-nums" :style="metricValueStyle('var(--v5-tech-cyan)')">{{ remoteApiEnabled && network.remoteStatus !== 'ready' ? '—' : directCount }}</text>
          </view>
        </view>

        <!-- Network orb — kept as a whitelist visualization card: the in-card
             radial wash + clipping boundary belong to the orb graphic (bg +
             overflow-hidden = legal in-card glow, NOT a floor aura). De-carding
             it would strand the wash on the page floor → conservative keep,
             neutral token border. -->
        <view class="relative overflow-hidden rounded-2xl" :style="orbCardStyle">
          <svg viewBox="0 0 360 360" class="block w-full" preserveAspectRatio="xMidYMid meet" style="width: 100%">
            <defs>
              <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="rgba(198,255,58,0.35)" />
                <stop offset="60%" stop-color="rgba(198,255,58,0.10)" />
                <stop offset="100%" stop-color="rgba(198,255,58,0)" />
              </radialGradient>
            </defs>

            <!-- 2 orbit guides -->
            <circle cx="180" cy="180" r="58" fill="none" stroke="rgba(198,255,58,0.18)" stroke-width="0.8" stroke-dasharray="1 0" />
            <circle cx="180" cy="180" r="132" fill="none" stroke="rgba(124,92,255,0.18)" stroke-width="0.8" stroke-dasharray="2 6" />

            <circle cx="180" cy="180" r="50" fill="url(#centerGlow)" />

            <!-- connection lines: center → direct -->
            <line
              v-for="p in directPlotted"
              :key="`conn-${p.m.id}`"
              x1="180"
              y1="180"
              :x2="p.x"
              :y2="p.y"
              :stroke="p.m.status === 'active' ? 'rgba(198,255,58,0.30)' : 'rgba(255,255,255,0.06)'"
              stroke-width="0.6"
            />

            <!-- member nodes -->
            <g v-for="p in plotted" :key="p.m.id" class="cursor-pointer" @click="selected = p.m">
              <circle v-if="pulseId === p.m.id" :cx="p.x" :cy="p.y" r="10">
                <animate attributeName="r" values="4;18;4" dur="1s" repeatCount="1" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="1s" repeatCount="1" />
                <set attributeName="fill" :to="p.kind === 'direct' ? DIRECT_COLOR : EXTENDED_COLOR" />
              </circle>
              <circle
                :cx="p.x"
                :cy="p.y"
                :r="p.kind === 'direct' ? 5 : 3.5"
                :fill="p.m.status === 'offline' ? 'var(--v5-ink-4)' : (p.kind === 'direct' ? DIRECT_COLOR : EXTENDED_COLOR)"
                :fill-opacity="p.m.status === 'offline' ? 0.6 : 0.95"
              />
            </g>

            <!-- center YOU node -->
            <g>
              <circle cx="180" cy="180" r="14" fill="var(--v5-brand)" />
              <SvgText x="180" y="181" text-anchor="middle" dominant-baseline="middle" font-family="var(--font-v5)" font-weight="600" font-size="11" fill="var(--v5-on-brand)">{{ t.network.diagramYou }}</SvgText>
              <SvgText x="180" y="158" text-anchor="middle" font-family="var(--font-v5)" font-weight="600" font-size="9" fill="color-mix(in srgb, var(--v5-brand) 85%, transparent)" letter-spacing="1.5">{{ myRankText }}</SvgText>
            </g>

            <!-- orbit labels -->
            <SvgText x="180" y="118" text-anchor="middle" font-family="var(--font-jet-mono)" font-size="7" fill="color-mix(in srgb, var(--v5-brand) 85%, transparent)" letter-spacing="1.5">{{ t.network.badgeDirect }}</SvgText>
            <SvgText x="180" y="8" text-anchor="middle" font-family="var(--font-jet-mono)" font-size="7" fill="color-mix(in srgb, var(--v5-nex) 85%, transparent)" letter-spacing="1.5">{{ t.network.badgeExtended }}</SvgText>
          </svg>

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
      </view>

      <!-- Member detail bottom sheet -->
      <view v-if="selected" class="nx-net-sheet-wrap" role="dialog" aria-modal="true">
        <view class="nx-net-scrim" @click="selected = null" />
        <view class="nx-net-sheet" :style="sheetStyle">
          <view class="flex items-start justify-between">
            <view class="flex items-center" style="gap: 12px">
              <view class="rounded-full grid place-items-center" :style="sheetAvatarStyle">
                <text style="font-size: 26px; line-height: 1">{{ selected.avatar }}</text>
              </view>
              <view>
                <text class="block" :style="{ fontSize: '15px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ selected.name }}</text>
                <view class="flex items-center" style="margin-top: 2px; gap: 6px">
                  <VBadge :v="selected.vRank" size="sm" :show-title="false" />
                  <text class="font-mono-tabular" :style="sheetBadgeStyle(selected)">{{ selected.layer === 1 ? t.network.badgeDirect : t.network.badgeExtended }}</text>
                  <text :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">· {{ selected.city }}</text>
                </view>
              </view>
            </view>
            <view class="grid place-items-center active:opacity-60" :style="sheetCloseStyle" @click="selected = null">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </view>
          </view>
          <view class="grid grid-cols-3 text-center" style="margin-top: 12px; gap: 8px">
            <view>
              <text class="block" :style="sheetStatLabelStyle">{{ t.network.monthVolume }}</text>
              <text class="block font-display tabular-nums" :style="sheetStatValStyle('var(--v5-brand)')">${{ selected.monthVolumeUSD }}</text>
            </view>
            <view>
              <text class="block" :style="sheetStatLabelStyle">{{ t.network.allTime }}</text>
              <text class="block font-display tabular-nums" :style="sheetStatValStyle('var(--v5-ink)')">{{ selected.totalVolumeUSD === null ? '—' : `$${selected.totalVolumeUSD}` }}</text>
            </view>
            <view>
              <text class="block" :style="sheetStatLabelStyle">{{ t.network.joined }}</text>
              <text class="block font-display tabular-nums" :style="sheetStatValStyle('var(--v5-ink)')">{{ daysJoined(selected) }}d</text>
            </view>
          </view>
          <view :style="{ marginTop: '12px', fontSize: '12px', color: 'var(--v5-ink-3)' }">
            <text>{{ t.network.title }}: </text>
            <text :style="{ color: 'var(--v5-ink)' }">{{ memberRankTitle(selected) }}</text>
            <text> · {{ t.network.status }}: </text>
            <text :style="{ color: statusColor(selected.status) }">{{ selected.status }}</text>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type CSSProperties } from "vue";
import SvgText from "@/components/svg-text";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VBadge from "@/components/team/v-badge.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useNetwork, type NetworkMember, type MemberStatus } from "@/store/network";
import { useVRank } from "@/store/v-rank";
import { rankTitle } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { remoteApiEnabled } from "@/api/runtime";

const VIEW = 360;
const CENTER = VIEW / 2;
const DIRECT_COLOR = "var(--v5-brand)";
const EXTENDED_COLOR = "var(--v5-tech-cyan)";
const DIRECT_RADIUS = 58;
const EXTENDED_RADIUS_MIN = 96;
const EXTENDED_RADIUS_MAX = 168;

interface Plotted {
  m: NetworkMember;
  kind: "direct" | "extended";
  x: number;
  y: number;
}

const t = useT();
const network = useNetwork();
const vRank = useVRank();
const vState = vRank;
const isZh = computed(() => useLocaleStore().code === "zh");

const members = computed(() => network.members);
const myRank = computed(() => vRank.myRank);
const myRankText = computed(() => remoteApiEnabled && vRank.ladder.length === 0 ? "—" : `V${myRank.value}`);
const selected = ref<NetworkMember | null>(null);
const pulseId = ref<string | null>(null);
let pulseTimer: ReturnType<typeof setInterval> | null = null;
let pulseCursor = 0;

// page-level interval (P-034): deterministic decorative pulse every 1.2s.
// It never fabricates a member or metric and does not use client randomness.
onMounted(() => {
  if (remoteApiEnabled) void network.refreshCanonicalNetwork();
  pulseTimer = setInterval(() => {
    const pool = members.value.filter((m) => m.status === "active");
    if (pool.length === 0) return;
    const pick = pool[pulseCursor % pool.length];
    pulseCursor += 1;
    pulseId.value = pick.id;
  }, 1200);
});
onUnmounted(() => {
  if (pulseTimer) clearInterval(pulseTimer);
});

const plotted = computed<Plotted[]>(() => {
  const direct = members.value.filter((m) => m.layer === 1);
  const extended = members.value.filter((m) => m.layer !== 1);
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

const directCount = computed(() => members.value.filter((m) => m.layer === 1).length);
const activeCount = computed(() => members.value.filter((m) => m.status === "active").length);
const idleCount = computed(() => members.value.filter((m) => m.status === "idle").length);

const idleSuffixText = computed(() => fmt(t.value.network.idleSuffix, { n: idleCount.value }));

function daysJoined(m: NetworkMember): number {
  return Math.floor((Date.now() - m.joinedAt) / 86400000);
}
// 头衔显示名收在 lib/v-rank-copy(中文界面用中文头衔;档位表由 store 给,不直读 MOCK-ONLY 的 V_RANKS)
function memberRankTitle(m: NetworkMember): string {
  return rankTitle(m.vRank, isZh.value, vState.ladder);
}
function statusColor(status: MemberStatus): string {
  return status === "active" ? "var(--v5-brand)" : status === "idle" ? "var(--v5-warning)" : "var(--v5-ink-4)";
}

// ─── styles ───
// Filled stat tile, no border (single visual difference).
const metricCardStyle: CSSProperties = { background: "var(--v5-surface)", borderRadius: "16px", padding: "12px" };
const errorStateStyle: CSSProperties = { padding: "14px", borderRadius: "14px", background: "var(--v5-warning-soft)", color: "var(--v5-ink)" };
const retryStyle: CSSProperties = { marginTop: "10px", minHeight: "44px", display: "grid", placeItems: "center", borderRadius: "999px", background: "var(--v5-surface-2)", color: "var(--v5-ink-2)" };
const metricLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
function metricValueStyle(color: string): CSSProperties {
  return { fontSize: "20px", fontWeight: 600, marginTop: "4px", color };
}

// Visualization card (whitelist): flat part of the bg equals the page floor, so
// the neutral border IS the card boundary — dropping it would turn the radial
// wash into a floor aura (which must then be deleted, degrading the orb).
//
// 🔴 C2 第二轮实测复核(2026-07-23):上面这句是对的,别再删。运行时两主题实测
// 卡片自身底色与第一个不透明祖先**逐值相同**(dark 都是 rgb(0,0,0)、light 都是
// rgb(244,241,233))→ 平底层与页面地板零色差,《03》§3「零 border 靠 surface 微差色
// 分层」的前提(存在可用的 surface 微差)在这里**不成立**。按 §3 本体,这是
// 「**透明容器**」形态(平底=地板,可见的只有装饰性 radial wash),而 border
// **正是**规范允许透明容器使用的边界。已登记 ZERO-BORDER-ALLOWLIST。
// 🔴 wash 用 --v5-nex-soft,不写死 rgba(124,92,255,0.18):后者是**暗色调过的紫**,
// 双主题恒定,落到米色底上是一团发灰的紫晕(2026-08-18 实测)。这层 wash 又不能删
// (见上,它是本卡的可见主体),所以按全站其余 54 层同一个写法走 *-soft 档:
// 亮色 #ECE7FF 淡紫、暗色 rgba(180,127,255,0.20)。
const orbCardStyle: CSSProperties = {
  background: "radial-gradient(60% 50% at 50% 50%, var(--v5-nex-soft) 0%, transparent 65%), var(--v5-bg)",
  border: "1px solid var(--v5-border)",
};
const legendWrapStyle: CSSProperties = { padding: "4px 12px 12px", gap: "16px", fontSize: "12px", color: "var(--v5-ink-3)" };
// SKILL leading-relaxed = 1.625 (原版 .text-[12px] leading-relaxed; was 1.6)
const footerStyle: CSSProperties = { padding: "0 4px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.625 };

const sheetStyle: CSSProperties = {
  width: "100%",
  background: "var(--v5-surface)",
  borderRadius: "16px 16px 0 0",
  padding: "16px",
  borderTop: "1px solid var(--v5-border)",
};
const sheetAvatarStyle: CSSProperties = { width: "48px", height: "48px", background: "var(--v5-surface-2)" };
function sheetBadgeStyle(m: NetworkMember): CSSProperties {
  const isDirect = m.layer === 1;
  const color = isDirect ? "var(--v5-brand)" : "var(--v5-tech-cyan)";
  return {
    fontSize: "12px",
    letterSpacing: "0.12em",
    padding: "1px 4px",
    borderRadius: "4px",
    background: `color-mix(in srgb, ${color} 18%, transparent)`,
    color,
  };
}
const sheetCloseStyle: CSSProperties = { width: "32px", height: "32px" };
const sheetStatLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
function sheetStatValStyle(color: string): CSSProperties {
  return { fontSize: "15px", fontWeight: 600, marginTop: "2px", color };
}

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => selected.value !== null), ".nx-net-sheet-wrap", () => { selected.value = null; });
</script>

<style scoped>
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
</style>
