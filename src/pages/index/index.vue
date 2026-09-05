<!--
  Home (mission-control) — ZONE 1 in progress. Ported from
  Nexion-prototype/app/components/home/mission-control.tsx (3157 lines, 25
  sections). Built up zone by zone; sections live in src/components/home/*.vue
  and are assembled here inside the chassis + CardStagger entrance.

  ZONE 1 (hook): Greeting → TechMoney → active trial slot →
  [Newcomer ↔ Weekly task carousel] → LiveFeed.
-->
<template>
  <AppChassis active="home">
    <CardStagger class="px-4 pt-3 pb-4 space-y-6" style="color: var(--v5-ink)">
      <!-- ZONE 1: hook — earned anchor + conversion stack + social proof -->
      <view class="home-earnings-cluster">
        <GreetingHeader />
        <TechMoneyCard />
      </view>
      <TrialGhostSlot />

      <view
        v-if="visibleTaskCards.length"
        id="home-task-carousel"
        class="home-task-carousel"
        role="region"
        :aria-label="t.home.taskCarouselLabel"
        :tabindex="hasTaskCarousel ? 0 : -1"
        @focusin="onTaskFocusIn"
        @focusout="onTaskFocusOut"
        @keydown.left.prevent="onTaskCarouselKeydown(-1)"
        @keydown.right.prevent="onTaskCarouselKeydown(1)"
      >
        <swiper
          :key="taskCardSignature"
          class="home-task-carousel__swiper"
          :style="{ height: `${taskCarouselHeight}px` }"
          :current="taskSlide"
          :duration="320"
          :autoplay="shouldAutoplay"
          :interval="TASK_CAROUSEL_INTERVAL_MS"
          :circular="hasTaskCarousel"
          :disable-touch="!hasTaskCarousel"
          previous-margin="0px"
          next-margin="0px"
          @change="onTaskSlideChange"
          @touchstart="onTaskTouchStart"
          @touchmove="onTaskTouchMove"
          @touchend="resetTaskTouch"
          @touchcancel="resetTaskTouch"
        >
          <swiper-item v-for="(card, index) in visibleTaskCards" :key="card">
            <view
              :id="`home-task-slide-${card}`"
              class="home-task-carousel__slide"
              role="group"
              :aria-label="taskCardTitle(card)"
              :aria-hidden="taskSlide !== index"
            >
              <DayOneQuestCard
                v-if="card === 'newcomer'"
                :active="taskSlide === index"
                :expanded="newcomerExpanded"
                @update:expanded="onNewcomerExpandedChange"
              />
              <ConversionBanner v-else :active="taskSlide === index" />
            </view>
          </swiper-item>
        </swiper>

        <text class="home-task-carousel__status" aria-live="polite" aria-atomic="true">
          {{ taskCarouselAnnouncement }}
        </text>
      </view>

      <LiveFeedCard />

      <!-- ZONE 2: status — your fleet, the grid, network pulse -->
      <QuickActionRow />
      <MyFleetSection />
      <OnGridSection />
      <NetworkPulseCard />

      <!-- ZONE 3: AI advisor bridge -->
      <NovaCardSlot v-if="!remoteApiEnabled" />

      <!-- ZONE 5: money & ROI -->
      <DoTheMathCard />
      <EarningsLedgerCard />

      <!-- ZONE 6: server-authoritative NEX trend and workload board -->
      <NexPriceCard />
      <MarketBoardCard />
      <ProductTrustCard />
      <TrustChipWall />
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, watch } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { useGenesisConfig } from "@/store/genesis-config";
import AppChassis from "@/components/app-chassis.vue";
import CardStagger from "@/components/card-stagger.vue";
import GreetingHeader from "@/components/home/greeting-header.vue";
import TechMoneyCard from "@/components/home/tech-money-card.vue";
import TrialGhostSlot from "@/components/trial-ghost-slot.vue";
import ConversionBanner from "@/components/home/conversion-banner.vue";
import DayOneQuestCard from "@/components/home/day-one-quest-card.vue";
import LiveFeedCard from "@/components/home/live-feed-card.vue";
import QuickActionRow from "@/components/home/quick-action-row.vue";
import MyFleetSection from "@/components/home/my-fleet-section.vue";
import OnGridSection from "@/components/home/on-grid-section.vue";
import NetworkPulseCard from "@/components/home/network-pulse-card.vue";
import NovaCardSlot from "@/components/home/nova-card-slot.vue";
import DoTheMathCard from "@/components/home/do-the-math-card.vue";
import EarningsLedgerCard from "@/components/home/earnings-ledger-card.vue";
import NexPriceCard from "@/components/home/nex-price-card.vue";
import MarketBoardCard from "@/components/home/market-board-card.vue";
import ProductTrustCard from "@/components/home/product-trust-card.vue";
import TrustChipWall from "@/components/home/trust-chip-wall.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useConfig } from "@/store/config";
import { useLocaleStore } from "@/store/locale";
import { useWeeklyQuest } from "@/store/weekly-quest";
import { remoteApiEnabled } from "@/api/runtime";
import {
  deriveHomeTaskCards,
  isHomeWeeklyCardReady,
  type HomeTaskCardId,
} from "@/lib/home-task-carousel";

type TaskCardId = HomeTaskCardId;

interface TouchPoint {
  clientX: number;
  clientY: number;
}

const TASK_CAROUSEL_INTERVAL_MS = 5000;
const TASK_CARD_COLLAPSED_HEIGHT = 184;

const t = useT();
// 🔴 首页承载 QuickActionRow(创世快捷入口,受闸文案),必须跟着重读配置(独立验收 P1:
//   此前只有 3 个创世页接了 onShow,首页与商城页漏接 —— 用户停在首页,运营切关闭,
//   首页仍在催「仅剩 N 席」)。
onShow(() => useGenesisConfig().refresh());
const locale = useLocaleStore();
const platformConfig = useConfig();
const weeklyQuestStore = useWeeklyQuest();
const instance = getCurrentInstance();

// PC 端更新任务配置后，用户回到首页即可读取最新投影，无需杀掉 App 重开。
onShow(() => {
  void platformConfig.load();
  if (remoteApiEnabled) void weeklyQuestStore.refresh();
});

const taskSlide = ref(0);
const taskCarouselHeight = ref(TASK_CARD_COLLAPSED_HEIGHT);
const newcomerExpanded = ref(false);
const prefersReducedMotion = ref(false);
const taskFocusWithin = ref(false);
const taskCarouselAnnouncement = ref("");
let taskTouchStart: TouchPoint | null = null;
let touchCollapsedExpandedCard = false;

const weeklyCardReady = computed(() => isHomeWeeklyCardReady(
  remoteApiEnabled,
  weeklyQuestStore.loading,
  weeklyQuestStore.error,
  weeklyQuestStore.snapshot,
));
const visibleTaskCards = computed<TaskCardId[]>(() =>
  deriveHomeTaskCards(platformConfig.syncFailed, {
    homeNewcomerTasksEnabled: platformConfig.isEnabled("homeNewcomerTasksEnabled"),
    homeWeeklyPromoEnabled:
      platformConfig.isEnabled("homeWeeklyPromoEnabled") && weeklyCardReady.value,
  }),
);

const taskCardSignature = computed(() => visibleTaskCards.value.join("-"));
const hasTaskCarousel = computed(() => visibleTaskCards.value.length > 1);
const currentTaskCard = computed(() => visibleTaskCards.value[taskSlide.value]);
const shouldAutoplay = computed(
  () =>
    hasTaskCarousel.value &&
    !newcomerExpanded.value &&
    !prefersReducedMotion.value &&
    !taskFocusWithin.value,
);

function taskCardTitle(card: TaskCardId) {
  return card === "newcomer" ? t.value.home.dayOneFirstDayReward : t.value.home.weeklyQuestEyebrow;
}

function announceTaskSlide(index = taskSlide.value) {
  const card = visibleTaskCards.value[index];
  if (!card) return;
  taskCarouselAnnouncement.value = fmt(t.value.home.taskCarouselPosition, {
    current: index + 1,
    total: visibleTaskCards.value.length,
    title: taskCardTitle(card),
  });
}

function measureExpandedNewcomer() {
  if (!newcomerExpanded.value || currentTaskCard.value !== "newcomer") {
    taskCarouselHeight.value = TASK_CARD_COLLAPSED_HEIGHT;
    return;
  }

  nextTick(() => {
    uni
      .createSelectorQuery()
      .in(instance)
      .select("#home-newcomer-task-card")
      .boundingClientRect((rect) => {
        const info = rect as UniApp.NodeInfo | null;
        if (info?.height) {
          taskCarouselHeight.value = Math.max(TASK_CARD_COLLAPSED_HEIGHT, Math.ceil(info.height));
        }
      })
      .exec();
  });
}

function setNewcomerExpanded(value: boolean) {
  newcomerExpanded.value = value;
  if (!value) taskCarouselHeight.value = TASK_CARD_COLLAPSED_HEIGHT;
  else measureExpandedNewcomer();
}

function onNewcomerExpandedChange(value: boolean) {
  setNewcomerExpanded(value);
  if (!value) blurTaskCarouselFocus();
}

function showRelativeTaskSlide(delta: -1 | 1) {
  const total = visibleTaskCards.value.length;
  if (total < 2) return;
  const next = (taskSlide.value + delta + total) % total;

  // #ifdef H5
  document.getElementById("home-task-carousel")?.focus();
  // #endif

  taskSlide.value = next;
  if (visibleTaskCards.value[next] !== "newcomer" && newcomerExpanded.value) {
    setNewcomerExpanded(false);
  }
  announceTaskSlide(next);
}

function onTaskCarouselKeydown(delta: -1 | 1) {
  showRelativeTaskSlide(delta);
}

function onTaskSlideChange(event: Event) {
  const detail = (event as unknown as { detail: { current: number; source?: string } }).detail;
  const next = Math.min(detail.current, Math.max(visibleTaskCards.value.length - 1, 0));
  taskSlide.value = next;

  if (visibleTaskCards.value[next] !== "newcomer" && newcomerExpanded.value) {
    setNewcomerExpanded(false);
  } else {
    measureExpandedNewcomer();
  }

  if (detail.source === "touch") {
    announceTaskSlide(next);
    blurTaskCarouselFocus();
  }
}

function readFirstTouch(event: Event): TouchPoint | null {
  const touches = (event as unknown as { touches?: ArrayLike<TouchPoint> }).touches;
  return touches?.[0] ?? null;
}

function onTaskTouchStart(event: Event) {
  touchCollapsedExpandedCard = false;
  taskTouchStart =
    hasTaskCarousel.value && newcomerExpanded.value && currentTaskCard.value === "newcomer"
      ? readFirstTouch(event)
      : null;
}

function onTaskTouchMove(event: Event) {
  if (!taskTouchStart || touchCollapsedExpandedCard) return;
  const point = readFirstTouch(event);
  if (!point) return;

  const dx = point.clientX - taskTouchStart.clientX;
  const dy = point.clientY - taskTouchStart.clientY;
  if (Math.abs(dx) < 18 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;

  touchCollapsedExpandedCard = true;
  setNewcomerExpanded(false);
  blurTaskCarouselFocus();
}

function resetTaskTouch() {
  taskTouchStart = null;
  touchCollapsedExpandedCard = false;
}

function onTaskFocusIn() {
  // #ifdef H5
  taskFocusWithin.value = true;
  // #endif
}

function onTaskFocusOut() {
  // #ifdef H5
  nextTick(() => {
    const root = document.getElementById("home-task-carousel");
    taskFocusWithin.value = Boolean(root?.contains(document.activeElement));
  });
  // #endif
}

function blurTaskCarouselFocus() {
  taskFocusWithin.value = false;
  // #ifdef H5
  const active = document.activeElement;
  if (active instanceof HTMLElement && document.getElementById("home-task-carousel")?.contains(active)) {
    active.blur();
  }
  // #endif
}

watch(taskCardSignature, () => {
  taskSlide.value = 0;
  setNewcomerExpanded(false);
  resetTaskTouch();
  taskCarouselAnnouncement.value = "";
});

onLoad(() => {
  locale.ensureSystemDetected();
  // #ifdef H5
  prefersReducedMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // #endif
});
</script>

<style scoped>
.home-earnings-cluster {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.home-task-carousel {
  position: relative;
  min-width: 0;
  outline: none;
  --home-task-card-height: 184px;
}

.home-task-carousel:focus-visible {
  outline: 2px solid var(--v5-brand);
  outline-offset: 3px;
  border-radius: 16px;
}

.home-task-carousel__swiper {
  width: 100%;
  transition: height 240ms cubic-bezier(0.32, 0.72, 0, 1);
}

.home-task-carousel__slide {
  box-sizing: border-box;
  width: 100%;
}

.home-task-carousel__status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .home-task-carousel__swiper {
    transition: none;
  }
}
</style>
