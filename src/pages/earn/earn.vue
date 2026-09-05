<!--
  Earn tab — ported from Nexion-prototype/app/(main)/earn/page.tsx.
  Hybrid: V5 HERO (PillTabs + TotalEarnedCard) on top, V4 device-pool sections
  below. Conversion arc (earned → missed → trial escape → devices → fleet decay
  → market context → tier-locked tasks → footer):
    TrialHeroBanner / TrialGhostSlot
    → PillTabs (Today/Week/Month/All) + TotalEarnedCard (range total + breakdown)
    → MissedIncomeBanner
    → "My Devices" header + slot rail + DeviceCardPC × N + add-device CTA
    → MarketBoard
    → TaskCenter.

  PillTabs + TotalEarnedCard inlined here (page-specific). Wrapped in
  <AppChassis active="earn">; entrance via <CardStagger>. Reads the same
  `earnings` aggregate Home reads so the Today pill matches Home exactly.
-->
<template>
  <AppChassis active="earn">
    <template #pageTop>
      <CardStagger class="pt-3 space-y-6" style="color: var(--v5-ink)">
        <!-- Trial entries -->
        <view class="mx-4">
          <TrialHeroBanner class="w-full" />
        </view>
        <TrialGhostSlot class="mx-4" />
      </CardStagger>
    </template>

    <CardStagger class="pt-6 pb-4 space-y-6" style="color: var(--v5-ink)">
      <view v-if="app.remoteFleetStatus === 'error'" class="mx-4 rounded-xl" style="padding: 12px; background: var(--v5-danger-soft); color: var(--v5-danger)">
        <text class="block" style="font-size: 13px; font-weight: 600">{{ t.wallet.syncFailedTitle }}</text>
        <text class="block" style="font-size: 12px; margin-top: 4px">{{ t.wallet.syncFailedBody }}</text>
        <!-- 文案必须裹 <text>:uni 下 <view> 里的裸 {{ }} 在 App 端不保证渲染。
             顺带补 role/tabindex —— 这是个真控件(重试),本仓禁原生 button,
             键盘语义由 lib/a11y-activate.ts 平台层按 role+tabindex 自动补上。 -->
        <view
          class="inline-flex items-center active:opacity-70"
          style="min-height: 44px; margin-top: 4px; color: var(--v5-brand)"
          role="button" tabindex="0"
          @click="retryFleet"
        >
          <text>{{ t.tradein.errPleaseRetry }}</text>
        </view>
      </view>
      <!-- ===== HERO: pill tabs ===== -->
      <view class="mx-4">
        <!-- 轨道贴页面底:surface-2 与页面底同色不可辨(亮色 ΔE 2.2),改 L1 surface;选中 pill 已是 brand-soft,不撞色 -->
        <view class="flex gap-0.5" style="background: var(--v5-surface); border-radius: 12px; padding: 3px">
          <view v-for="r in RANGES" :key="r" class="flex-1 grid place-items-center active:opacity-70" :style="pillStyle(r)" @click="range = r">
            <text :style="pillLabelStyle(r)">{{ rangeLabel(r) }}</text>
          </view>
        </view>
      </view>

      <!-- ===== HERO: total earned card ===== -->
      <view class="mx-4">
        <view class="relative overflow-hidden" :style="totalCardStyle">
          <!-- drifting dots (particle effect; card background removed per design) -->
          <view aria-hidden style="position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden">
            <view v-for="(d, i) in HERO_DOTS" :key="i" :style="heroDotStyle(d)" />
          </view>

          <view class="relative" style="z-index: 1">
            <view class="flex justify-between items-center gap-2">
              <text class="font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-4); letter-spacing: 0.04em">{{ t.earn.computeEarned }} · {{ rangeLabel(range) }}</text>
              <text class="font-mono-tabular" :style="usdtTagStyle">USDT</text>
            </view>

            <view class="mt-2.5 flex items-baseline gap-1" style="font-family: var(--font-v5); font-weight: 600; letter-spacing: -0.024em; line-height: 1; color: var(--v5-ink)">
              <text style="font-size: 20px; color: var(--v5-ink-3); font-weight: 500">$</text>
              <text class="tabular-nums" style="font-size: 56px">{{ totalInt }}<text v-if="totalKnown" style="font-size: 36px; color: var(--v5-ink-3); font-weight: 600">.{{ totalCents }}</text></text>
            </view>
            <text class="block mt-2 font-mono-tabular tabular-nums" style="font-size: 15px; color: var(--v5-nex); font-weight: 600">+{{ nexFmt }} <text style="font-size: 12px; font-weight: 500; letter-spacing: 0.06em">NEX</text></text>
            <text class="block mt-2 font-mono-tabular tabular-nums" style="font-size: 12px; color: var(--v5-ink-3)">{{ jobsText }}</text>
          </view>
        </view>
      </view>

      <!-- My devices header -->
      <view class="mx-4 mt-2 mb-1 px-1 flex items-center justify-between">
        <text style="font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-ink); letter-spacing: -0.012em">{{ t.home.myFleet }}</text>
        <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 12px; color: var(--v5-ink-4)">{{ fleetCountText }}</text>
      </view>
      <!-- FEAT-DEV01: 任务池升级提示线(信息态 · 行内展开;详情入口 → W-CAP1 说明弹层) -->
      <!-- 仅 @click:uni 编译器在小程序端将 click 映射为 tap;H5 下 @tap+@click 双绑会双触发(本页实测,开关类必单绑) -->
      <view class="mx-4 mb-2 rounded-xl active:opacity-90" style="background: var(--v5-tech-cyan-soft); padding: 9px 12px; min-height: 44px; display: flex; flex-direction: column; justify-content: center" @click="taskPoolOpen = !taskPoolOpen">
        <view class="flex items-center justify-between gap-2">
          <view class="flex items-center gap-1.5 min-w-0">
            <svg class="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
            <text class="truncate" style="font-size: 12px; font-weight: 600; color: var(--v5-ink-2)">{{ t.earn.taskPoolLineTitle }}</text>
          </view>
          <svg class="shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: taskPoolOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }"><path d="m6 9 6 6 6-6" /></svg>
        </view>
        <view v-if="taskPoolOpen" style="margin-top: 6px">
          <text style="font-size: 12px; color: var(--v5-ink-3); line-height: 1.55">{{ t.earn.taskPoolLineBody }}</text>
          <text class="block" style="margin-top: 6px; font-size: 12px; color: var(--v5-brand); font-weight: 600" @click.stop="openExplainer">{{ t.earn.capExplainTitle }} →</text>
        </view>
      </view>
      <!-- Device pool — one card, accordion rows (one detail open at a time) -->
      <EmptySlotsHint>
        <DeviceCardPC v-for="(d, i) in devices" :key="d.id" :device="d" :expanded="expandedId === d.id" :divider="i !== 0" @toggle="toggleDevice(d.id)" />
      </EmptySlotsHint>

      <ComputeShareEntry />
      <!-- Loss-aversion — moved directly above the market board -->
      <MissedIncomeBanner />
      <MarketBoard />
      <TaskCenter />
      <!-- FEAT-DEV01: W-CAP1 任务产能说明弹层(单实例;设备卡/补贴 badge/提示线共用入口) -->
      <CapacityExplainerSheet />
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import CardStagger from "@/components/card-stagger.vue";
import TrialHeroBanner from "@/components/trial-hero-banner.vue";
import TrialGhostSlot from "@/components/trial-ghost-slot.vue";
import DeviceCardPC from "@/components/earn/device-card-pc.vue";
import CapacityExplainerSheet from "@/components/earn/capacity-explainer-sheet.vue";
import MissedIncomeBanner from "@/components/earn/missed-income-banner.vue";
import ComputeShareEntry from "@/components/earn/compute-share-entry.vue";
import EmptySlotsHint from "@/components/earn/empty-slots-hint.vue";
import MarketBoard from "@/components/earn/market-board.vue";
import TaskCenter from "@/components/earn/task-center.vue";
import { useApp } from "@/store/app";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useCapacityExplainer } from "@/composables/use-capacity-explainer";
import { useFreeTrial } from "@/store/free-trial";
import { remoteApiEnabled } from "@/api/runtime";

type Range = "Today" | "Week" | "Month" | "All";
const RANGES: Range[] = ["Today", "Week", "Month", "All"];

const app = useApp();
const t = useT();
const range = ref<Range>("Today");
const freeTrial = useFreeTrial();

// The banner is the first discoverable H2 entry. Do not make a new user wait
// for the global poll before we know whether the server has made it eligible.
onShow(() => {
  if (remoteApiEnabled) void freeTrial.refreshRemote(true);
});

function retryFleet() { void app.refreshRemoteFleet().catch(() => undefined); }
function rangeLabel(r: Range): string { return r === "Today" ? t.value.earn.rangeToday : r === "Week" ? t.value.earn.rangeWeek : r === "Month" ? t.value.earn.rangeMonth : t.value.earn.rangeAll; }

// FEAT-DEV01: 任务池提示线展开态 + W-CAP1 弹层入口。
const taskPoolOpen = ref(false);
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
const fleetCountText = computed(() => fmt(t.value.home.fleetOfMax, { n: devices.value.length }));

// ── HERO total earned ──
const serverPeriod = computed(() => {
  const e = app.homeTruth?.earnings;
  if (!e) return null;
  return range.value === "Today" ? e.today : range.value === "Week" ? e.week : range.value === "Month" ? e.month : e.all;
});
const mockTotal = computed(() => {
  const e = app.earnings;
  return range.value === "Today" ? e.today : range.value === "Week" ? e.thisWeek : range.value === "Month" ? e.thisMonth : e.total;
});
const total = computed(() => remoteApiEnabled ? serverPeriod.value?.usdt ?? null : mockTotal.value);
const totalKnown = computed(() => total.value !== null);
const totalInt = computed(() => total.value === null ? "—" : Math.floor(total.value).toLocaleString());
const totalCents = computed(() => total.value === null ? "" : String(Math.floor(total.value * 100) % 100).padStart(2, "0"));
const nexTotal = computed(() => remoteApiEnabled ? serverPeriod.value?.nex ?? null : (() => { const e = app.earnings; const ratio = e.today > 0 ? e.todayNEX / e.today : 0; return mockTotal.value * ratio; })());
const nexFmt = computed(() => nexTotal.value === null ? "—" : nexTotal.value.toLocaleString(undefined, { maximumFractionDigits: 1 }));
const jobsCount = computed(() => remoteApiEnabled ? serverPeriod.value?.jobCount ?? null : (range.value === "Today" ? 14 : range.value === "Week" ? 98 : range.value === "Month" ? 412 : 1247));
const jobsText = computed(() => jobsCount.value === null ? "—" : fmt(t.value.earn.jobsCount, { n: jobsCount.value.toLocaleString() }));

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
    fontSize: "13px",
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
</script>
