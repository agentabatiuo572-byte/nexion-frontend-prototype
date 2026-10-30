<!--
  Earn tab — ported from Nexion-prototype/app/(main)/earn/page.tsx.
  Hybrid: V5 HERO (PillTabs + TotalEarnedCard) on top, V4 device-pool sections
  below. Conversion arc (earned → missed → trial escape → devices → fleet decay
  → market context → tier-locked tasks → footer):
    TrialHeroBanner / TrialGhostSlot
    → PillTabs (Today/Week/Month/All) + TotalEarnedCard (range total + breakdown)
    → MissedIncomeBanner
    → "My Devices" header + compact DeviceCardPC rows + add-device CTA
    → MarketBoard
    → TaskCenter.

  PillTabs + TotalEarnedCard inlined here (page-specific). Wrapped in
  <AppChassis active="earn">; entrance via <CardStagger>. Reads the same
  `earnings` aggregate Home reads so the Today pill matches Home exactly.
-->
<template>
  <AppChassis active="earn">
    <CardStagger class="pt-6 pb-4 space-y-6" style="color: var(--v5-ink)">
      <view v-if="app.remoteFleetStatus === 'error'" class="nx-inline-recovery mx-4 rounded-xl" style="padding: 12px; background: var(--v5-danger-soft); color: var(--v5-danger)">
        <view class="nx-inline-recovery__copy">
          <text class="block" style="font-size: 13px; font-weight: 600">{{ t.coreReview.fleetReadFailed }}</text>
          <text class="block" style="font-size: 12px; margin-top: 4px">{{ t.coreReview.fleetReadRetry }}</text>
        </view>
        <!-- 文案必须裹 <text>:uni 下 <view> 里的裸 {{ }} 在 App 端不保证渲染。
             顺带补 role/tabindex —— 这是个真控件(重试),本仓禁原生 button,
             键盘语义由 lib/a11y-activate.ts 平台层按 role+tabindex 自动补上。 -->
        <view
          class="nx-inline-recovery__action active:opacity-70"
          style="color: var(--v5-brand)"
          role="button" tabindex="0"
          @click="retryFleet"
        >
          <text>{{ t.ui.retry }}</text>
        </view>
      </view>
      <!-- ===== HERO: pill tabs ===== -->
      <view class="mx-4">
        <GlassSegments class="earn-range" :label="t.earn.rangeGroupLabel" semantics="radio" v-model="range" :options="rangeOptions"  />
      </view>

      <!-- ===== HERO: total earned card ===== -->
      <view class="mx-4">
        <view class="relative overflow-hidden" :style="totalCardStyle">
          <view class="relative" style="z-index: 1">
            <view class="flex justify-between items-center gap-2">
              <view class="flex items-center gap-1 min-w-0"><text style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-2)">{{ auditCopy.deviceRevenue }} · {{ rangeLabel(range) }}</text><DataVisibilityToggle /></view>
              <text class="earn-scope">{{ auditCopy.revenueScope }}</text>
            </view>

            <view class="mt-2.5 flex items-baseline gap-1" style="font-family: var(--font-amount); font-weight: 600; letter-spacing: -0.024em; line-height: 1; color: var(--v5-ink)">
              <text v-if="totalKnown && !visibility.hidden" style="font-size: 20px; color: var(--v5-ink-3); font-weight: 500">{{ totalPrefix }}</text>
              <text v-if="visibility.hidden" class="tabular-nums" style="font-size: 56px">{{ visibility.mask(totalInt) }}</text>
              <text v-else class="tabular-nums" style="font-size: 56px">{{ totalInt }}<text v-if="totalKnown" style="font-size: 36px; color: var(--v5-ink-3); font-weight: 600">.{{ totalCents }}</text></text>
            </view>
            <text class="block mt-2 font-mono-tabular tabular-nums" style="font-size: 15px; color: var(--v5-nex); font-weight: 600">{{ visibility.mask(`+${nexFmt}`) }} <text style="font-size: 12px; font-weight: 500; letter-spacing: 0.06em">UVT</text></text>
            <!-- 只有**确实请求失败**时才说不可用并给重试;零值已在上面显示为 0(#128)。 -->
            <view v-if="remoteApiEnabled && app.homeTruthStatus === 'error'" class="nx-inline-recovery mt-2" role="status" aria-live="polite">
              <view class="nx-inline-recovery__copy">
                  <text class="block" style="font-size: 12px; font-weight: 600; color: var(--v5-danger)">{{ t.earn.summaryUnavailableTitle }}</text>
                  <text class="block" style="font-size: 12px; margin-top: 2px; color: var(--v5-ink-3)">{{ t.earn.summaryUnavailableBody }}</text>
              </view>
              <view
                class="nx-inline-recovery__action active:opacity-70"
                  style="color: var(--v5-brand)"
                role="button" tabindex="0"
                @click="retrySummary"

                @keydown.enter.prevent="retrySummary" @keydown.space.prevent="retrySummary"
              >
                <text>{{ t.ui.retry }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- My devices header and selected-period completed jobs. -->
      <view class="mx-4 mt-2 mb-1 px-1">
        <view class="flex items-center justify-between gap-2">
          <view class="flex items-center min-w-0">
            <text style="font-family: var(--font-v5); font-size: var(--ui-type-section); font-weight: 600; color: var(--v5-ink); letter-spacing: -0.012em">{{ t.home.myFleet }}</text>
            <view class="earn-capacity-info" role="button" tabindex="0" aria-haspopup="dialog" :aria-label="t.earn.taskPoolLineTitle" @click="openExplainer" @keydown.enter.stop.prevent="!$event.repeat && openExplainer()" @keydown.space.stop.prevent="!$event.repeat && openExplainer()">
              <svg class="earn-capacity-info__glyph" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <g class="earn-capacity-info__rocket">
                  <path d="M8 14 5 17v3l4-2m7-4 3 3v3l-4-2" />
                  <path d="M12 2c-3.3 2.7-4.7 7.5-3.5 13.5L10 18h4l1.5-2.5C16.7 9.5 15.3 4.7 12 2Z" fill="currentColor" fill-opacity=".12" />
                  <circle cx="12" cy="9" r="2" />
                  <path class="earn-capacity-info__flame" d="M10.2 18.5c-.7 1.5.2 3 1.8 4 1.6-1 2.5-2.5 1.8-4" fill="currentColor" stroke="none" />
                  <path class="earn-capacity-info__exhaust" d="M8 21v1m8-1v1" stroke-width="1.2" />
                </g>
              </svg>
            </view>
          </view>
          <text class="tabular-nums shrink-0" style="font-family: var(--font-v5); font-size: 12px; color: var(--v5-ink-2)">{{ visibility.mask(fleetCountText) }}</text>
        </view>
        <text class="block" style="font-size: 12px; line-height: 18px; color: var(--v5-ink-3)">{{ jobsText }}</text>
      </view>
      <!-- Device pool — one card, accordion rows (one detail open at a time) -->
      <EmptySlotsHint v-if="fleetReady" :trial-expanded="expandedId === 'trial:current'" @toggle-trial="toggleDevice('trial:current')">
        <DeviceCardPC v-for="(d, i) in devices" :key="d.id" :device="d" :expanded="expandedId === d.id" :divider="i !== 0 || trialPresentation.active.value" @toggle="toggleDevice(d.id)" />
      </EmptySlotsHint>

      <EarningsLedgerCard class="mx-4" />
      <MarketBoard />
      <TaskCenter />
      <NxSection class="mx-4 earn-more-ways" :title="auditCopy.moreWays">
        <!-- #ifdef H5 -->
        <EarnWayCard eyebrow="ANDROID" :title="remainderCopy.earnWays.phoneTitle" :body="remainderCopy.earnWays.phoneBody"
          artwork="phone" :action="remainderCopy.downloadApp" @click="goPhoneDownload" />
        <!-- #endif -->
        <!-- #ifndef H5 -->
        <EarnWayCard eyebrow="ANDROID" :title="remainderCopy.earnWays.phoneTitle" :body="remainderCopy.earnWays.phoneBody"
          artwork="phone" :action="nativePhoneAvailable ? remainderCopy.earnWays.phoneAction : remainderCopy.earnWays.phoneReadOnly" @click="goPhoneCompute" />
        <!-- #endif -->
        <EarnWayCard v-if="stakingVisible" eyebrow="UVT" :title="remainderCopy.stakingTitle" :body="remainderCopy.earnWays.stakingBody"
          artwork="staking" :action="remainderCopy.stakingAction" @click="goStaking" />
      </NxSection>
      <!-- FEAT-DEV01: W-CAP1 任务产能说明弹层(单实例;设备卡/补贴 badge/提示线共用入口) -->
      <CapacityExplainerSheet />
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { runPassiveTabRead, invalidatePassiveTabRead } from "@/lib/passive-tab-read";
import { formatAmount } from "@/lib/amount-display";
import { formatUsdOverviewParts } from "@/lib/usd-display";
import { onUnmounted, computed, nextTick, ref, watch, type CSSProperties } from "vue";
import { onHide, onShow } from "@/composables/use-tab-page-lifecycle";
import AppChassis from "@/components/tab-page-frame.vue";
import CardStagger from "@/components/card-stagger.vue";
import NxSection from "@/components/ui/nx-section.vue";
import EarnWayCard from "@/components/earn/earn-way-card.vue";
import EarningsLedgerCard from "@/components/home/earnings-ledger-card.vue";
import { useAuditUiCopy } from "@/i18n/audit-ui";
import { useRemainderUiCopy } from "@/i18n/remainder-ui";
import { useConfig } from "@/store/config";
import { hasNativePhoneRuntime } from "@/lib/native-phone-runtime";
import { navTo } from "@/lib/route";
import { useTrialPresentation } from "@/composables/use-trial-presentation";
import DeviceCardPC from "@/components/earn/device-card-pc.vue";
import CapacityExplainerSheet from "@/components/earn/capacity-explainer-sheet.vue";

import EmptySlotsHint from "@/components/earn/empty-slots-hint.vue";
import MarketBoard from "@/components/earn/market-board.vue";
import TaskCenter from "@/components/earn/task-center.vue";
import { useApp } from "@/store/app";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useCapacityExplainer } from "@/composables/use-capacity-explainer";
import { useFreeTrial } from "@/store/free-trial";
import { dayOnePageObservationApi, remoteApiEnabled, sessionVault } from "@/api/runtime";
import { isActiveSlotDevice } from "@/lib/device-slot-policy";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { reportDayOnePageObservation } from "@/lib/day-one-page-observation";
import { useDataVisibility } from "@/store/data-visibility";
import DataVisibilityToggle from "@/components/ui/data-visibility-toggle.vue";

type Range = "Today" | "Week" | "Month" | "All";
const RANGES: Range[] = ["Today", "Week", "Month", "All"];

const app = useApp();
const t = useT();
const visibility = useDataVisibility();
const auditCopy = useAuditUiCopy();
const remainderCopy = useRemainderUiCopy();
const config = useConfig();
const stakingVisible = computed(() => config.configStatus === "ready" && config.isEnabled("stakingVisible"));
const nativePhoneAvailable = hasNativePhoneRuntime();

// H5 exposes a download guide, never a phone calibration or execution action.
// #ifdef H5
function goPhoneDownload() { navTo("/pages/register/success?download=1"); }
// #endif
// #ifndef H5
function goPhoneCompute() {
  navTo(nativePhoneAvailable ? "/pages/onboarding/connect?mode=recalibrate" : "/pages/me/devices");
}
// #endif
function goStaking() {
  if (stakingVisible.value) navTo("/pages/staking/staking");
}
const range = ref<Range>("Today");
const freeTrial = useFreeTrial();
let earnPageVisible = false;
let earnObservationEpoch = 0;

// The banner is the first discoverable H2 entry. Do not make a new user wait
// for the global poll before we know whether the server has made it eligible.
onShow(() => {
  earnPageVisible = true;
  app.setTaskReadPageVisible("earn", true);
  if (remoteApiEnabled) {
    void runPassiveTabRead('trial-state', () => freeTrial.refreshRemote());
    void runPassiveTabRead('remote-fleet', () => app.refreshRemoteFleet(undefined, { coalesce: true })).catch(() => undefined);
    void app.ensureHomeTruth().catch(() => undefined);
    void observeDayOneEarnPage();
  }
});

onHide(() => {
  earnPageVisible = false;
  app.setTaskReadPageVisible("earn", false);
  earnObservationEpoch += 1;
});
onUnmounted(() => {
  earnPageVisible = false;
  app.setTaskReadPageVisible("earn", false);
  earnObservationEpoch += 1;
});

async function observeDayOneEarnPage(): Promise<void> {
  if (!remoteApiEnabled || !earnPageVisible || app.homeTruthStatus !== "ready"
    || app.remoteFleetStatus !== "ready" || !app.homeTruth) return;
  const scope = captureAccountScope();
  const pageEpoch = earnObservationEpoch;
  await nextTick();
  if (!earnPageVisible || pageEpoch !== earnObservationEpoch || app.homeTruthStatus !== "ready"
    || app.remoteFleetStatus !== "ready" || !app.homeTruth) return;
  void reportDayOnePageObservation("visit_earn", {
    scope,
    session: sessionVault.read(),
    visible: () => earnPageVisible && pageEpoch === earnObservationEpoch,
    isCurrent: isCurrentAccountScope,
    submit: () => dayOnePageObservationApi.earnPage(),
  });
}

watch([() => app.homeTruthStatus, () => app.remoteFleetStatus, () => app.homeTruth], () => {
  void observeDayOneEarnPage();
});

function retryFleet() { invalidatePassiveTabRead('remote-fleet'); void app.refreshRemoteFleet().catch(() => undefined); }
/** Retry the summary read itself (Home overview), not just the fleet. */
function retrySummary() { void app.refreshHomeTruth().catch(() => undefined); }
function rangeLabel(r: Range): string { return r === "Today" ? t.value.earn.rangeToday : r === "Week" ? t.value.earn.rangeWeek : r === "Month" ? t.value.earn.rangeMonth : t.value.earn.rangeAll; }
/** 单选组的左右方向键:移一格并选上,焦点跟到新选中项(roving tabindex 的标准行为)。 */
function moveRange(index: number, delta: number): void {
  const next = RANGES[(index + delta + RANGES.length) % RANGES.length];
  if (!next) return;
  range.value = next;
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
  });
}

// Queue information opens the existing capacity explanation directly.
const capacityExplainer = useCapacityExplainer();
function openExplainer() {
  capacityExplainer.open();
}

// Accordion: only one device detail open at a time (null = all collapsed).
const expandedId = ref<string | null>(null);
function toggleDevice(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

// Earn shows ACTIVE fleet only (inventory lives in /me/devices).
const devices = computed(() => app.visibleDevices.filter((d) => d.activatedAt !== null));
const trialPresentation = useTrialPresentation();
// A background refresh remains authoritative only for fresh mutations. For
// read-only presentation, keep the bound account's last confirmed fleet visible
// until the next response resolves; a first read and every error stay unknown.
const fleetReady = computed(() => !remoteApiEnabled
  || app.remoteFleetStatus === "ready"
  || (app.remoteFleetStatus === "loading" && app.remoteFleetHasSnapshot));
const fleetCountText = computed(() => fleetReady.value && (app.remoteSlotsUsed != null || trialPresentation.reservedSlots.value !== null) ? fmt(t.value.home.fleetOfMax, {
  n: app.remoteSlotsUsed ?? (app.activeSlotCount + (trialPresentation.reservedSlots.value ?? 0)),
  max: app.slotCap,
}) : "— / —");

// ── HERO total earned ──
const serverPeriod = computed(() => {
  // An explicit transient read failure may retain history; live guards still require ready.
  if (remoteApiEnabled && app.homeTruthStatus !== "ready" && app.homeTruthStatus !== "loading"
    && !(app.homeTruthStatus === "error" && app.homeTruthTransientFailure)) return null;
  const e = app.homeTruth?.earnings;
  if (!e) return null;
  return range.value === "Today" ? e.today : range.value === "Week" ? e.week : range.value === "Month" ? e.month : e.all;
});
/**
 * A successful Home overview encodes an empty settled-receipt period as three
 * nulls. That is a confirmed zero for every range; a failed/absent overview has
 * no period and stays unknown with the existing retry state. For a partial
 * Today projection, the device snapshot remains the zero-safe fallback. #249
 */
const serverPeriodValue = computed(() => {
  const period = serverPeriod.value;
  if (!period) return null;
  if (period.usdt === null && period.nex === null && period.jobCount === null) {
    return { usdt: 0, nex: 0, jobCount: 0 };
  }
  if (range.value !== "Today") return period;
  const fleet = app.remoteRealizedToday;
  return {
    ...period,
    usdt: period.usdt ?? fleet?.usdt ?? null,
    nex: period.nex ?? fleet?.nex ?? null,
    jobCount: period.jobCount ?? (fleet && fleet.usdt === 0 && fleet.nex === 0 ? 0 : null),
  };
});
const mockTotal = computed(() => {
  const e = app.earnings;
  return range.value === "Today" ? e.today : range.value === "Week" ? e.thisWeek : range.value === "Month" ? e.thisMonth : e.total;
});
const total = computed(() => remoteApiEnabled ? serverPeriodValue.value?.usdt ?? null : mockTotal.value);
const totalParts = computed(() => formatUsdOverviewParts(total.value));
const totalKnown = computed(() => totalParts.value !== null);
const totalPrefix = computed(() => totalParts.value?.prefix ?? "");
const totalInt = computed(() => totalParts.value?.integer ?? "—");
const totalCents = computed(() => totalParts.value?.fraction ?? "");
const nexTotal = computed(() => remoteApiEnabled ? serverPeriodValue.value?.nex ?? null : (() => { const e = app.earnings; const ratio = e.today > 0 ? e.todayNEX / e.today : 0; return mockTotal.value * ratio; })());
const nexFmt = computed(() => nexTotal.value === null ? "—" : formatAmount(nexTotal.value));
const jobsCount = computed(() => {
  if (!remoteApiEnabled) return range.value === "Today" ? 14 : range.value === "Week" ? 98 : range.value === "Month" ? 412 : 1247;
  return serverPeriodValue.value?.jobCount ?? null;
});
const jobsText = computed(() => jobsCount.value === null ? visibility.mask("—") : fmt(t.value.earn.jobsCount, { n: visibility.mask(jobsCount.value.toLocaleString()) }));

// drifting hero dots
const HERO_DOTS = [
  { left: "12%", delay: 0, color: "var(--v5-tech-cyan-ink)" },
  { left: "32%", delay: 1.6, color: "var(--v5-brand)" },
  { left: "54%", delay: 3.2, color: "var(--v5-brand-2-ink)" },
  { left: "72%", delay: 4.8, color: "var(--v5-tech-cyan-ink)" },
  { left: "88%", delay: 6.4, color: "var(--v5-brand)" },
];

// ── styles ──
function pillStyle(r: Range): CSSProperties {
  const on = range.value === r;
  return {
    // 《07》tap≥44(原 32);《03》§2 圆角上阶梯 9→12;透明 border 无视觉作用,删。
    height: "44px",
    background: on ? "var(--v5-brand-soft)" : "transparent",
    borderRadius: "12px",
  };
}
function pillLabelStyle(r: Range): CSSProperties {
  const on = range.value === r;
  return {
    color: on ? "var(--v5-brand)" : "var(--v5-ink-3)",
    fontFamily: "var(--font-v5)",
    fontWeight: on ? 600 : 500,
    fontSize: "var(--ui-type-list-subtitle)",
  };
}
const totalCardStyle: CSSProperties = {
  padding: "0 0 10px",
};
function heroDotStyle(d: { left: string; delay: number; color: string }): CSSProperties {
  return {
    position: "absolute",
    bottom: "-6px",
    left: d.left,
    width: "4px",
    height: "4px",
    borderRadius: "50%",
    background: d.color,
    opacity: 0,
    animation: "v5-dot-drift 8s linear infinite",
    animationDelay: `${d.delay}s`,
  };
}
const usdtTagStyle: CSSProperties = {
  fontSize: "12px",
  padding: "2px 7px",
  borderRadius: "4px",
  background: "var(--v5-brand-soft)",
  color: "var(--v5-brand)",
  fontWeight: 500,
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

import GlassSegments from "@/components/glass-segments.vue";
const rangeOptions = computed(() => RANGES.map(value => ({ value, label: rangeLabel(value) })));
</script>

<style scoped>
.earn-capacity-info { width:44px; height:44px; flex:none; display:grid; place-items:center; color:var(--v5-brand); background:transparent; cursor:pointer; }
/* App renders small SVGs through NxNativeSvg/v-html, so inner nodes need deep selectors. */
.earn-capacity-info :deep(.earn-capacity-info__glyph) { display:block; overflow:visible; }
.earn-capacity-info :deep(.earn-capacity-info__rocket) { animation:earn-rocket-hop 1.6s ease-in-out infinite; }
.earn-capacity-info :deep(.earn-capacity-info__flame) { transform-origin:12px 18.5px; animation:earn-rocket-flame .72s ease-in-out infinite; }
.earn-capacity-info :deep(.earn-capacity-info__exhaust) { animation:earn-rocket-exhaust .9s ease-out infinite; }
@keyframes earn-rocket-hop { 0%,100% { transform:translateY(1px); } 50% { transform:translateY(-1.5px); } }
@keyframes earn-rocket-flame { 0%,100% { transform:scaleY(.6); opacity:.55; } 50% { transform:scaleY(1.15); opacity:1; } }
@keyframes earn-rocket-exhaust { 0% { transform:translateY(0); opacity:0; } 25% { opacity:.65; } 100% { transform:translateY(2.5px); opacity:0; } }
@media (prefers-reduced-motion:reduce) { .earn-capacity-info :deep(.earn-capacity-info__rocket),.earn-capacity-info :deep(.earn-capacity-info__flame),.earn-capacity-info :deep(.earn-capacity-info__exhaust) { animation:none; }.earn-capacity-info :deep(.earn-capacity-info__exhaust) { opacity:0; } }
.earn-capacity-info:focus-visible { outline:2px solid var(--v5-brand); outline-offset:-2px; border-radius:12px; }
.earn-scope { color: var(--v5-ink-2); font: 400 12px/1.4 var(--font-v5); text-align: right; max-width: 50%; }
.earn-more-ways :deep(.nx-section__title) { font-size: 20px; line-height: 1.25; }
/* Short period names stay on one line (vi "Hôm nay" broke at 320). */
.earn-range :deep(.nx-glass-option__label) { white-space: nowrap; overflow-wrap: normal; }
</style>
