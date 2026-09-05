<!--
  Global Network map — ported from Nexion-prototype/app/(main)/globe/page.tsx.

  Top stat tiles → inline SVG dotmap (procedural continent silhouettes +
  region nodes w/ glow halos + SMIL pulse ring + connection lines from "you")
  → region cards list → bottom-sheet drawer on tap.

  Wrapped in <AppChassis active="me"> (reached from /me). SetPageHeader
  backHref="/me" → SubPageHeader back="/pages/me/me". Inline <svg> + <animate>
  carry over (P-013). Source dot hex (#1F2D1A bright olive / #101418 dim) →
  var(--v5-brand) low-opacity (matches "brighter green = denser cluster"
  legend) / var(--v5-ink-4). Drawer is position:fixed so it overlays the
  whole chassis. Sandbox decorative values come from the named deterministic
  fixture; production never promotes fixture values to telemetry.
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/me" />

      <!-- Top stats -->
      <view class="mx-4 mb-3 grid grid-cols-2 gap-2">
        <view class="rounded-2xl" :style="statTileStyle">
          <view class="flex items-center" style="gap: 6px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></svg>
            <text style="font-size: 12px; letter-spacing: 0.16em; color: var(--v5-ink-3)">{{ t.globe.activeNodes }}</text>
          </view>
          <text class="block tabular-nums" :style="statValStyle">{{ activeNodesText }}</text>
        </view>
        <view class="rounded-2xl" :style="statTileStyle">
          <view class="flex items-center" style="gap: 6px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></svg>
            <text style="font-size: 12px; letter-spacing: 0.16em; color: var(--v5-ink-3)">{{ t.globe.activeJobs }}</text>
          </view>
          <text class="block tabular-nums" :style="statValStyle">{{ activeJobsText }}</text>
        </view>
      </view>

      <view v-if="remoteApiEnabled && projectionStatus !== 'ready'" class="mx-4 mt-4">
        <EmptyState
          :kind="projectionStatus === 'error' ? 'recoverable-error' : 'empty-list'"
          :title="projectionStateTitle"
          :desc="projectionStateDesc"
          :cta-label="projectionStatus === 'error' ? t.ui.retry : undefined"
          emphasis
          compact
          @cta="loadRegions"
        />
      </view>

      <template v-else>
      <!-- Map — de-carded (border dropped); relative + overflow-hidden retained
           to clip the region glow halos at the rounded panel edge (functional). -->
      <view class="mx-4 rounded-2xl relative overflow-hidden" :style="mapCardStyle">
        <svg :viewBox="`0 0 ${W} ${H}`" class="w-full block" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="globe-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="var(--v5-brand)" stop-opacity="0.9" />
              <stop offset="60%" stop-color="var(--v5-brand)" stop-opacity="0.2" />
              <stop offset="100%" stop-color="var(--v5-brand)" stop-opacity="0" />
            </radialGradient>
            <radialGradient id="you-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="var(--v5-tech-cyan)" stop-opacity="1" />
              <stop offset="100%" stop-color="var(--v5-tech-cyan)" stop-opacity="0" />
            </radialGradient>
          </defs>

          <!-- Dot continents -->
          <circle
            v-for="(d, i) in dots"
            :key="`dot-${i}`"
            :cx="d.x"
            :cy="d.y"
            :r="d.r"
            :fill="d.bright ? 'var(--v5-brand)' : 'var(--v5-ink-4)'"
            :opacity="d.bright ? 0.5 : 0.25"
          />

          <!-- Connection lines from "you" → other regions -->
          <line
            v-for="r in otherRegions"
            :key="`line-${r.id}`"
            :x1="meX"
            :y1="meY"
            :x2="r.cx * W"
            :y2="r.cy * H"
            stroke="var(--v5-brand)"
            stroke-opacity="0.08"
            stroke-width="0.6"
            stroke-dasharray="2 3"
          />

          <!-- Region nodes -->
          <g v-for="r in regions" :key="r.id" class="cursor-pointer" @click="select(r)">
            <circle :cx="r.cx * W" :cy="r.cy * H" r="18" :fill="`url(#${r.isYou ? 'you-glow' : 'globe-glow'})`" />
            <circle :cx="r.cx * W" :cy="r.cy * H" r="5" :fill="r.isYou ? 'var(--v5-tech-cyan)' : 'var(--v5-brand)'" />
            <!-- Pulse ring -->
            <circle
              v-if="pulseRegionId === r.id"
              :key="`pulse-${r.id}-${pulseTick}`"
              :cx="r.cx * W"
              :cy="r.cy * H"
              r="5"
              fill="none"
              :stroke="r.isYou ? 'var(--v5-tech-cyan)' : 'var(--v5-brand)'"
              stroke-width="1"
            >
              <animate attributeName="r" values="5;24" dur="1.6s" repeatCount="1" />
              <animate attributeName="opacity" values="1;0" dur="1.6s" repeatCount="1" />
            </circle>
            <SvgText
              v-if="r.isYou"
              :x="r.cx * W + 8"
              :y="r.cy * H - 8"
              fill="var(--v5-tech-cyan)"
              font-size="10"
              font-weight="600"
              font-family="ui-monospace, monospace"
            >{{ t.globe.yourNodeBadge }}</SvgText>
          </g>
        </svg>
        <text class="block text-center" style="font-size: 12px; color: var(--v5-ink-4); margin-top: 8px">{{ t.globe.tapHint }} · {{ t.globe.legend }}</text>
      </view>

      <!-- Region list — de-carded: transparent hairline group (earnings-ledger
           idiom), rows carry their own dividers (last row = no bottom border). -->
      <view class="mx-4 mt-4 mb-6" :style="regionListStyle">
        <view
          v-for="(r, i) in regions"
          :key="r.id"
          class="w-full flex items-center active:opacity-80"
          :style="regionRowStyle(i === regions.length - 1)"
          @click="select(r)"
        >
          <view class="grid place-items-center shrink-0" :style="regionIconBox(r.isYou)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" :stroke="r.isYou ? 'var(--v5-tech-cyan)' : 'var(--v5-brand)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></svg>
          </view>
          <view class="flex-1 min-w-0">
            <view class="flex items-center" style="gap: 8px">
              <text style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ regionName(r) }}</text>
              <text v-if="r.isYou" :style="youChipStyle">{{ t.globe.youAre }}</text>
            </view>
            <text class="block tabular-nums" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 2px">{{ regionDevicesText(r) }} · {{ regionLatencyText(r) }}</text>
          </view>
          <text class="shrink-0 tabular-nums" :style="regionRateStyle">{{ (r.jobsPerHour / 1000).toFixed(1) }}k/h</text>
        </view>
      </view>

      <!-- Drawer -->
      <view v-if="selected" class="nx-globe-drawer" role="dialog" aria-modal="true">
        <view class="nx-globe-scrim" @click="selected = null" />
        <view class="relative border rounded-2xl" :style="drawerCardStyle">
          <view class="absolute grid place-items-center active:opacity-70" :style="drawerCloseStyle" @click="selected = null">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </view>
          <view class="flex items-center" style="gap: 12px">
            <view class="grid place-items-center" :style="drawerIconBox(selected.isYou)">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" :stroke="selected.isYou ? 'var(--v5-tech-cyan)' : 'var(--v5-brand)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <text class="block" style="font-size: 20px; font-weight: 600; color: var(--v5-ink)">{{ regionName(selected) }}</text>
              <text v-if="selected.isYou" class="block" style="font-size: 12px; color: var(--v5-brand-2); margin-top: 2px">{{ t.globe.youAre }}</text>
            </view>
          </view>
          <view class="grid grid-cols-3 gap-2 mt-4">
            <view class="rounded-xl text-center" :style="drawerStatStyle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></svg>
              <text class="block tabular-nums" :style="drawerStatValStyle">{{ selected.devices.toLocaleString() }}</text>
              <text class="block" :style="drawerStatLabelStyle">{{ t.globe.activeNodes }}</text>
            </view>
            <view class="rounded-xl text-center" :style="drawerStatStyle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" /></svg>
              <text class="block tabular-nums" :style="drawerStatValStyle">{{ (selected.jobsPerHour / 1000).toFixed(1) }}k/h</text>
              <text class="block" :style="drawerStatLabelStyle">{{ t.globe.jobsPerHour }}</text>
            </view>
            <view class="rounded-xl text-center" :style="drawerStatStyle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto"><path d="M12 20h.01" /><path d="M2 8.82a15 15 0 0 1 20 0" /><path d="M5 12.859a10 10 0 0 1 14 0" /><path d="M8.5 16.429a5 5 0 0 1 7 0" /></svg>
              <text class="block tabular-nums" :style="drawerStatValStyle">{{ selected.avgLatencyMs === null ? t.globe.metricUnavailable : `${selected.avgLatencyMs}ms` }}</text>
              <text class="block" :style="drawerStatLabelStyle">{{ t.uiChrome.latency }}</text>
            </view>
          </view>
          <text class="block" style="font-size: 12px; color: var(--v5-ink-4); margin-top: 12px; line-height: 1.625">{{ regionJobsText(selected) }} · {{ remoteApiEnabled ? fmt(t.globe.projectionUpdatedAt, { at: generatedAtText }) : fmt(t.globe.uptimeLine, { v: uptimeText }) }}</text>
        </view>
      </view>
      </template>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, type CSSProperties } from "vue";
import SvgText from "@/components/svg-text";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import EmptyState from "@/components/empty-state.vue";
import { useT } from "@/i18n/use-t";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { publicStatsHealth } from "@/lib/platform-stats";
import { MOCK_GLOBE_FIXTURE_ID, REGIONS, type RegionData } from "@/mock/globe-regions";
import { dateLocale, fmt } from "@/i18n/format";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { networkRegionsApi, remoteApiEnabled } from "@/api/runtime";
import type { NetworkRegionProjection } from "@/api/network-regions-api";

const t = useT();
const app = useApp();
const cfg = useConfig();

const W = 440;
const H = 240;
type GlobeRegion = {
  id: string;
  i18nKey?: RegionData["i18nKey"];
  displayName?: string;
  cx: number;
  cy: number;
  devices: number;
  activeJobs: number;
  jobsPerHour: number;
  avgLatencyMs: number | null;
  isYou?: boolean;
};

const selected = ref<GlobeRegion | null>(null);
const networkProjection = ref<NetworkRegionProjection | null>(null);
const projectionStatus = ref<"loading" | "ready" | "empty" | "error">(remoteApiEnabled ? "loading" : "ready");
let projectionRequest = 0;
const pulseTick = ref(0);
let pulseTimer = 0;

const global = computed(() => app.global);
const activeNodesText = computed(() => {
  if (remoteApiEnabled) return networkProjection.value?.activeNodes === undefined ? "—" : networkProjection.value.activeNodes.toLocaleString();
  const health = publicStatsHealth(cfg.config.publicStats);
  return cfg.syncFailed || !health.devicesOk
    ? t.value.home.networkStatUpdating
    : global.value.activeDevices.toLocaleString();
});
const activeJobsText = computed(() => {
  if (remoteApiEnabled) return networkProjection.value?.activeJobs === undefined ? "—" : networkProjection.value.activeJobs.toLocaleString();
  return global.value.activeJobs.toLocaleString();
});

const regions = computed<GlobeRegion[]>(() => remoteApiEnabled
  ? (networkProjection.value?.regions ?? []).map((region, index, all) => ({
      id: region.id,
      displayName: region.displayName,
      cx: region.longitude === null ? (index + 1) / (all.length + 1) : (region.longitude + 180) / 360,
      cy: region.latitude === null ? 0.38 + (index % 3) * 0.14 : (90 - region.latitude) / 180,
      devices: region.activeNodes,
      activeJobs: region.activeJobs,
      jobsPerHour: region.jobsPerHour,
      avgLatencyMs: null,
      isYou: region.isUserRegion,
    }))
  : REGIONS.map((region) => ({ ...region, activeJobs: 0 })));
const me = computed(() => regions.value.find((r) => r.isYou) ?? null);
const meX = computed(() => (me.value?.cx ?? 0) * W);
const meY = computed(() => (me.value?.cy ?? 0) * H);
const otherRegions = computed(() => regions.value.filter((r) => !r.isYou));

// Deterministic pulse selection is decorative only; it must never become a metric source.
const pulseRegionId = computed<string | null>(() => {
  if (pulseTick.value === 0) return null;
  if (regions.value.length === 0) return null;
  return regions.value[(pulseTick.value - 1) % regions.value.length]?.id ?? null;
});

// Mock-only fixture value. Remote mode renders unavailable telemetry instead.
const uptimeText = computed(() => remoteApiEnabled
  ? t.value.globe.metricUnavailable
  : `${MOCK_GLOBE_FIXTURE_ID} · 99.20%`);
const generatedAtText = computed(() => networkProjection.value
  ? new Date(networkProjection.value.generatedAt).toLocaleString(dateLocale())
  : t.value.globe.metricUnavailable);
const projectionStateTitle = computed(() => projectionStatus.value === "error"
  ? t.value.globe.regionProjectionErrorTitle
  : projectionStatus.value === "empty"
    ? t.value.globe.regionProjectionEmptyTitle
    : t.value.globe.regionProjectionLoadingTitle);
const projectionStateDesc = computed(() => projectionStatus.value === "error"
  ? t.value.globe.regionProjectionErrorDesc
  : projectionStatus.value === "empty"
    ? t.value.globe.regionProjectionEmptyDesc
    : t.value.globe.regionProjectionLoadingDesc);

const dots = computed(() => generateDotMap(W, H));

function select(r: GlobeRegion) {
  selected.value = r;
}

function regionName(r: GlobeRegion): string {
  if (r.displayName) return r.displayName;
  const g = t.value.globe as Record<string, string>;
  return r.i18nKey ? g[r.i18nKey] ?? r.id : r.id;
}
function regionDevicesText(r: GlobeRegion): string {
  return fmt(t.value.globe.regionDevices, { n: r.devices.toLocaleString() });
}
function regionLatencyText(r: GlobeRegion): string {
  if (r.avgLatencyMs === null) return fmt(t.value.globe.regionLatencyUnavailable, { n: t.value.globe.metricUnavailable });
  return fmt(t.value.globe.regionLatency, { n: String(r.avgLatencyMs) });
}
function regionJobsText(r: GlobeRegion): string {
  return fmt(t.value.globe.regionJobs, { n: r.jobsPerHour.toLocaleString() });
}

async function loadRegions() {
  if (!remoteApiEnabled) return;
  const request = ++projectionRequest;
  const accountKey = String(app.accountKey);
  projectionStatus.value = "loading";
  try {
    const next = await networkRegionsApi.list();
    if (request !== projectionRequest || accountKey !== String(app.accountKey)) return;
    networkProjection.value = next;
    projectionStatus.value = next.regions.length > 0 ? "ready" : "empty";
  } catch {
    if (request !== projectionRequest || accountKey !== String(app.accountKey)) return;
    networkProjection.value = null;
    projectionStatus.value = "error";
  }
}

onMounted(() => {
  void loadRegions();
  pulseTimer = setInterval(() => {
    pulseTick.value += 1;
  }, 1800) as unknown as number;
});
watch(() => String(app.accountKey), () => {
  projectionRequest += 1;
  selected.value = null;
  networkProjection.value = null;
  projectionStatus.value = remoteApiEnabled ? "loading" : "ready";
  void loadRegions();
});
onUnmounted(() => {
  projectionRequest += 1;
  if (pulseTimer) clearInterval(pulseTimer);
});

// Procedural dot-map silhouette (loose continent blobs).
function generateDotMap(w: number, h: number): Array<{ x: number; y: number; r: number; bright: boolean }> {
  const out: Array<{ x: number; y: number; r: number; bright: boolean }> = [];
  const blobs = [
    { cx: 0.22, cy: 0.4, r: 0.13 },
    { cx: 0.3, cy: 0.7, r: 0.08 },
    { cx: 0.5, cy: 0.36, r: 0.11 },
    { cx: 0.55, cy: 0.62, r: 0.12 },
    { cx: 0.78, cy: 0.5, r: 0.16 },
    { cx: 0.85, cy: 0.72, r: 0.06 },
  ];
  const cols = 60;
  const rows = 30;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const nx = (c + 0.5) / cols;
      const ny = (r + 0.5) / rows;
      let nearest = Infinity;
      for (const b of blobs) {
        const dx = nx - b.cx;
        const dy = ny - b.cy;
        const d = Math.sqrt(dx * dx + dy * dy) - b.r;
        if (d < nearest) nearest = d;
      }
      const rng = mulberry32(r * 1000 + c);
      if (nearest < 0.02) {
        out.push({
          x: Math.round(nx * w * 100) / 100,
          y: Math.round(ny * h * 100) / 100,
          r: Math.round((0.9 + rng() * 0.6) * 100) / 100,
          bright: rng() < 0.55,
        });
      } else if (nearest < 0.07 && rng() < 0.25) {
        out.push({
          x: Math.round(nx * w * 100) / 100,
          y: Math.round(ny * h * 100) / 100,
          r: 0.6,
          bright: false,
        });
      }
    }
  }
  return out;
}

function mulberry32(seed: number) {
  return function () {
    let s = (seed += 0x6d2b79f5);
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

// ── styles ──
const statTileStyle: CSSProperties = {
  background: "var(--v5-surface)",
  padding: "12px",
};
const statValStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  fontWeight: 600,
  marginTop: "4px",
  color: "var(--v5-ink)",
};
const mapCardStyle: CSSProperties = {
  background: "var(--v5-surface-3)",
  padding: "12px",
};
const regionListStyle: CSSProperties = {
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
function regionRowStyle(last: boolean): CSSProperties {
  return {
    padding: "16px 0",
    gap: "12px",
    textAlign: "left",
    borderBottom: last ? "none" : "1px solid var(--v5-border)",
  };
}
function regionIconBox(isYou?: boolean): CSSProperties {
  return {
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    background: isYou
      ? "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)"
      : "color-mix(in srgb, var(--v5-brand) 10%, transparent)",
  };
}
const youChipStyle: CSSProperties = {
  fontSize: "12px",
  padding: "2px 6px",
  borderRadius: "8px",
  background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)",
  color: "var(--v5-brand-2)",
};
const regionRateStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-brand)",
};
const drawerCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "420px",
  background: "var(--v5-surface)",
  borderColor: "var(--v5-border)",
  padding: "20px",
};
const drawerCloseStyle: CSSProperties = {
  top: "12px",
  right: "12px",
  width: "28px",
  height: "28px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
};
function drawerIconBox(isYou?: boolean): CSSProperties {
  return {
    width: "48px",
    height: "48px",
    borderRadius: "12px",
    background: isYou
      ? "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)"
      : "color-mix(in srgb, var(--v5-brand) 10%, transparent)",
  };
}
const drawerStatStyle: CSSProperties = {
  background: "var(--v5-surface-2)",
  padding: "10px",
};
const drawerStatValStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  marginTop: "4px",
  color: "var(--v5-ink)",
};
const drawerStatLabelStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-ink-4)",
  marginTop: "2px",
};

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => selected.value !== null), ".nx-globe-drawer", () => { selected.value = null; });
</script>

<style scoped>
.nx-globe-drawer {
  position: fixed;
  inset: 0;
  z-index: 790;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 12px 16px;
}
.nx-globe-scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--v5-surface-3) 80%, transparent);
  backdrop-filter: blur(4px);
}
</style>
