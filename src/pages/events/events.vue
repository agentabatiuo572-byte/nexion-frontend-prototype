<!--
  Events Center — ported from Nexion-prototype/app/(main)/events/page.tsx.

  Featured hero → segmented tabs (All / Ongoing / Upcoming / Joined / Ended) →
  event cards list → footer note. Trackable events opt into join→claim flow
  (event-quest store, P-027 reactive Record); claim 走 money-receipt 收口点
  + writes a bill. Decomposed into src/components/events/* (FeaturedHero /
  Card) — each carries its own scroll-grow bar.

  Wrapped in <AppChassis active="home"> (reached from Home). SetPageHeader
  backHref="/" → SubPageHeader back="/pages/index/index". SegmentedControl →
  inline pill tabs. The source's live evaluateEventProgress() is replaced by
  the mock's `trackable`/`done` flags (self-contained, backend-replaceable).
  The SSR `mounted` gate is dropped (no hydration in uni). The lucky-wheel
  event's "Spin now" CTA opens the Lucky Spin sheet via useLuckySpin().openSheet()
  (emitted up from EventsCard as `cta`, kind === "wheel").
  Achievements unlock on claim is omitted (no achievements store ported).
-->
<template>
  <AppChassis active="home">
    <CardStagger class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/index/index" />

      <view class="px-4 space-y-3">
        <GlassSegments :label="t.promotion.events" v-model="eventSource" :options="sourceOptions" />
        <PromotionEntry v-if="eventSource==='promotions'" mode="events" />
        <view v-else-if="!signedIn" class="promotion-flat"><view class="promotion-action" role="button" tabindex="0" @click="navTo('/pages/login/login?return='+encodeURIComponent('/pages/events/events'))"><text>{{ t.promotion.signIn }}</text></view></view>
        <template v-else>
        <!-- Existing join/claim events retain their own server-owned actions. -->
        <EventsFeaturedHero
          v-if="featured"
          :ev="featured"
          :reward-nex="rewardNexOf(featured)"
          :busy="commandBusy === featured.id"
          @join="handleJoin(featured)"
          @claim="handleClaim(featured)"
          @cta="handleCta(featured)"
        />

        <!-- Tabs — shared SegmentedControl spec (segmented-control.tsx): p-1 / gap
             0.5 / rounded-2xl container, h-11 rounded-[10px] segments, brand fill
             + on-brand text on active (no shadow), label v5 12.5/500/-0.005em. -->
        <GlassSegments :label="t.events.categoryGroupLabel" v-model="tab" :options="tabOptions" layout="scroll"  />

        <!-- Event list -->
        <EmptyState
          v-if="remoteEventsError"
          kind="recoverable-error"
          :title="t.events.loadErrorTitle"
          :desc="t.events.loadErrorBody"
          :cta-label="t.events.retry"
          :cta-disabled="remoteEventsLoading"
          :cta-busy="remoteEventsLoading"
          @cta="retryRemoteEvents"
        />
        <EmptyState v-else-if="filtered.length === 0 && emptyKey" kind="no-filter-results" :title="t.empty.filterTitle" :desc="t.empty.filterDesc" />
        <view v-else class="space-y-2.5">
          <EventsCard
            v-for="ev in filtered"
            :key="ev.id"
            :ev="ev"
            :reward-nex="rewardNexOf(ev)"
            :busy="commandBusy === ev.id"
            @join="handleJoin(ev)"
            @claim="handleClaim(ev)"
            @cta="handleCta(ev)"
          />
        </view>

        <!-- footer -->
        <text class="block text-center" style="font-size: 12px; color: var(--v5-ink-3); line-height: 1.625; padding-top: 4px">{{ t.events.note }}</text>
        </template>
      </view>
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch, type CSSProperties } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import CardStagger from "@/components/card-stagger.vue";
import EventsFeaturedHero from "@/components/events/events-featured-hero.vue";
import EventsCard from "@/components/events/events-card.vue";
import PromotionEntry from "@/components/promotion/promotion-entry.vue";
import { useT } from "@/i18n/use-t";
import { navTo } from '@/lib/route';
import { geoPolicyUserMessage } from "@/api/geo-policy-error";
import { eventsApi, remoteApiEnabled,sessionVault } from "@/api/runtime";
import type { CanonicalEvent } from "@/api/events-api";
import { postMoneyBillsOnce } from "@/lib/money-receipt";
import { useEventQuest } from "@/store/event-quest";
import { useApp } from "@/store/app";
import { useLocaleStore } from "@/store/locale";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { bindPageVisibilityRefresh, createPageVisibilityRefresh } from "@/lib/page-visibility-refresh";
import { createRemotePageRequestFence } from "@/lib/remote-page-request-fence";
import { createRemotePageCommandFence } from "@/lib/remote-page-command-fence";
import { useLuckySpin } from "@/store/lucky-spin";
import { toast } from "@/store/ui";
import { EVENTS, type EventStatus, type NexEvent } from "@/mock/events";
import { remoteEventView, type EventActionLabels } from "./remote-event-view";
import { runRemoteEventAction } from "./remote-event-action";
import { registerActivePageRefresh } from "@/lib/active-page-refresh";

type TabId = "all" | EventStatus | "joined";
type EnrichedEvent = NexEvent & { _trackable: boolean; _done: boolean; _claimed: boolean };

const TABS: TabId[] = ["all", "ongoing", "upcoming", "joined", "ended"];

const t = useT();
const eventSource=ref('promotions');
const signedIn=computed(()=>{void app.accountKey;void app.accountBindingEpoch;return !!sessionVault.read();});
const sourceOptions=computed(()=>[
  {value:'promotions',label:t.value.promotion.promotionList},
  {value:'legacy',label:t.value.promotion.legacyEvents},
]);
const eventQuest = useEventQuest();
const luckySpin = useLuckySpin();
const app = useApp();
const locale = useLocaleStore();
const language = computed(() => locale.code);

const tab = ref<TabId>("ongoing");
const remoteEvents = ref<CanonicalEvent[]>([]);
const remoteEventsError = ref(false);
const remoteEventsLoading = ref(remoteApiEnabled);
const commandBusy = ref<string | null>(null);
const remoteAccountEpoch = createRemoteAccountEpoch(app.accountKey);
let mounted = false;
const remoteRequestFence = createRemotePageRequestFence(remoteAccountEpoch, () => mounted);
const remoteCommandFence = createRemotePageCommandFence(remoteAccountEpoch, () => mounted);
let releaseActiveRefresh = () => {};
function activatePageRefresh() {
  releaseActiveRefresh();
  releaseActiveRefresh = registerActivePageRefresh(loadRemoteEvents);
}

const eventActionLabels = computed<EventActionLabels>(() => ({
  claimDiscount: t.value.events.action.claimDiscount,
  checkIn: t.value.events.action.checkIn,
  reinvest: t.value.events.action.reinvest,
  spin: t.value.events.action.spin,
  leaderboard: t.value.events.action.leaderboard,
  viewDetails: t.value.events.action.viewDetails,
  progress: t.value.events.progress.label,
  wheelPool: t.value.events.wheelPool,
}));

async function loadRemoteEvents() {
  if (!remoteApiEnabled||!sessionVault.read()) return;
  const scope = remoteRequestFence.capture();
  remoteEventsLoading.value = true;
  try {
    const snapshot = await eventsApi.state(language.value);
    if (!remoteRequestFence.isCurrent(scope)) return;
    remoteEvents.value = snapshot.events;
    remoteEventsError.value = false;
  } catch {
    if (remoteRequestFence.isCurrent(scope)) {
      remoteEvents.value = [];
      remoteEventsError.value = true;
    }
  } finally {
    if (remoteRequestFence.isCurrent(scope)) remoteEventsLoading.value = false;
  }
}
function retryRemoteEvents() {
  void loadRemoteEvents();
}

const eventVisibility = createPageVisibilityRefresh((reason) => {
  if (!remoteApiEnabled) return;
  remoteAccountEpoch.bind(app.accountKey);
  if (reason === "initial") {
    remoteEvents.value = [];
    remoteEventsError.value = false;
    remoteEventsLoading.value = true;
  }
  void loadRemoteEvents();
});
bindPageVisibilityRefresh(eventVisibility, {
  mounted: (callback) => onMounted(() => {
    mounted = true;
    activatePageRefresh();
    callback();
  }),
  shown: (callback) => onShow(() => {
    mounted = true;
    activatePageRefresh();
    callback();
  }),
  hidden: (callback) => onHide(() => {
    mounted = false;
    releaseActiveRefresh();
    remoteRequestFence.invalidate();
    remoteCommandFence.invalidate();
    callback();
  }),
});
onUnmounted(() => {
  mounted = false;
  releaseActiveRefresh();
  remoteRequestFence.invalidate();
  remoteCommandFence.invalidate();
});
watch([() => String(app.accountKey), () => app.accountBindingEpoch, () => language.value], ([accountKey]) => {
  remoteCommandFence.invalidate();
  if (!remoteApiEnabled) return;
  remoteAccountEpoch.bind(accountKey);
  remoteRequestFence.invalidate();
  remoteEvents.value = [];
  remoteEventsError.value = false;
  remoteEventsLoading.value = true;
  void loadRemoteEvents();
});

// Enrich each event with live join/claim state from the store.
const enrichedEvents = computed<EnrichedEvent[]>(() =>
  (remoteApiEnabled
    ? remoteEvents.value.map((event) => remoteEventView(event, eventActionLabels.value))
    : EVENTS.map((event) => ({ ...event, runtimeSource: "mock" as const }))
  ).map((ev) => {
    const trackable = ev.trackable === true;
    const remoteStatus = remoteApiEnabled
      ? remoteEvents.value.find((event) => event.eventCode === ev.id)?.userStatus
      : undefined;
    const joinedFromStore = eventQuest.isJoined(ev.id);
    const claimedFromStore = eventQuest.isClaimed(ev.id);
    return {
      ...ev,
      // In remote mode the event snapshot itself is the authority. The store
      // only mirrors it after an acknowledged command and must not override it.
      joined: remoteApiEnabled ? ev.joined : (trackable ? joinedFromStore : ev.joined),
      _trackable: trackable,
      _done: ev.done ?? false,
      _claimed: remoteApiEnabled ? remoteStatus === "CLAIMED" : claimedFromStore,
    };
  }),
);

const featured = computed(() =>
  enrichedEvents.value.find((e) => e.featured && e.status === "ongoing"),
);

const filtered = computed<EnrichedEvent[]>(() => {
  const all = enrichedEvents.value;
  const feat = featured.value;
  switch (tab.value) {
    case "all":
      return all.filter((e) => e !== feat);
    case "ongoing":
      return all.filter((e) => e.status === "ongoing" && e !== feat);
    case "upcoming":
      return all.filter((e) => e.status === "upcoming");
    case "joined":
      return all.filter((e) => e.joined && e !== feat);
    case "ended":
      return all.filter((e) => e.status === "ended");
    default:
      return [];
  }
});

const emptyKey = computed<keyof typeof t.value.events.empty | null>(() => {
  if (tab.value === "ongoing" || tab.value === "upcoming" || tab.value === "joined" || tab.value === "ended") {
    return tab.value;
  }
  return null;
});

function rewardNexOf(ev: EnrichedEvent): number {
  return ev.rewardNEX ?? 0;
}

async function handleJoin(ev: EnrichedEvent) {
  if (!ev._trackable || commandBusy.value === ev.id) return;
  commandBusy.value = ev.id;
  try {
    if (remoteApiEnabled) {
      await runRemoteEventAction({
      fence: remoteCommandFence,
      command: () => eventQuest.joinRemote(ev.id),
      refresh: loadRemoteEvents,
      onSuccess: () => toast.success(t.value.events.toast.joinedTitle.replace("{name}", ev.title), t.value.events.toast.joinedBody),
      onFailure: () => toast.error(t.value.authOtp.errorServiceUnavailable),
      });
      return;
    }
    const joined = eventQuest.join(ev.id);
    if (joined) {
      toast.success(t.value.events.toast.joinedTitle.replace("{name}", ev.title), t.value.events.toast.joinedBody);
      return;
    }
  } finally {
    if (commandBusy.value === ev.id) commandBusy.value = null;
  }
  // 🔴 join() 返回 false **只有一种含义:这个活动已经加入过**(幂等短路),不是失败。
  // 2026-08-07 第四轮验收 F1:我上一版把它当失败弹「没能把你加进这个活动」——
  // 用户连点两下就会看到与事实相反的报错。同文件领奖侧早就处理对了(幂等 false 静默返回),
  // 这里对齐它。
  // 至于地区拒绝:store 目前**没有任何表达「真失败」的通道**(join 只返回布尔),
  // 所以这条路径没有可翻译的对象 —— 等接口层接通、join 能回出拒绝原因时再接,
  // 硬接一个布尔值只会得到一段恒不触发的死代码。已记进交接书。
}

async function handleClaim(ev: EnrichedEvent) {
  if (!ev._trackable || !ev._done || ev._claimed || commandBusy.value === ev.id) return;
  commandBusy.value = ev.id;
  try {
    if (remoteApiEnabled) {
      await runRemoteEventAction({
      fence: remoteCommandFence,
      command: () => eventQuest.claimRemote(ev.id),
      refresh: loadRemoteEvents,
      onSuccess: () => toast.success(t.value.events.claimedReward.replace("{reward}", ev.reward), ev.title),
      onFailure: () => toast.error(t.value.authOtp.errorServiceUnavailable),
      });
      return;
    }
    const reward = rewardNexOf(ev);
  // MOCK-ONLY NON-ATOMIC: PROD event-claim endpoint TBD must claim, credit,
  // and emit the matching bill in one idempotent transaction.
  // 🔴 顺序 = 先发钱(幂等)→ 后消费资格(2026-08-04 对抗审计 B-P1-3):原来先 claim 消费掉,
  // 发钱失败就 return,资格没了奖归零。ref 去掉时间戳改成活动 id(活动只能领一次,天然稳定)——
  // 带时间戳的 ref 判重永不命中,幂等出口会退化成普通出口。
    const paid = reward > 0
    ? postMoneyBillsOnce([{
      type: "achievement",
      symbol: "NEX",
      amount: reward,
      status: "posted",
      memo: `Event reward · ${ev.id}`,
      ref: `EVENT-${ev.id}`,
    }])
    : "ok";
  // 领奖这一跳就是上面那个待定的 event-claim endpoint —— 地区拒绝以它的结果回来
  // (join 那条路径已一并接上 —— 见 handleJoin 的说明)。
  // 🔴 `null` = 普通结果,原样走下面的 `!== "ok"` 出口,发钱失败不许被说成地区受限。
    const geo = geoPolicyUserMessage(paid, t.value.geoPolicy);
    if (geo) {
      toast.error(geo);
      return;
    }
    if (paid !== "ok") return;
    if (!eventQuest.claim(ev.id)) return;
    toast.success(t.value.events.toast.claimedTitle.replace("{n}", reward.toLocaleString()), ev.title);
  } finally {
    if (commandBusy.value === ev.id) commandBusy.value = null;
  }
}

// Decorative (non-trackable) CTA. The lucky-wheel event opens the Lucky Spin
// sheet instead of the join/claim path; other decorative CTAs navigate via the
// card's own href.
function handleCta(ev: EnrichedEvent) {
  if (ev.kind === "discount") {
    eventQuest.join(ev.id);
    if (eventQuest.claim(ev.id)) {
      toast.success(t.value.events.toast.discountClaimedTitle, ev.title);
    }
    return;
  }
  if (ev.kind === "wheel") {
      luckySpin.openSheet(ev.id);
  }
}

// ── styles ──
const segWrapStyle: CSSProperties = {
  // 轨道贴页面底:surface-2 与页面底同色不可辨(亮色 ΔE 2.2),改 L1 surface;选中 pill 是 brand 实底,不撞色
  background: "var(--v5-surface)",
  borderRadius: "16px",
  padding: "4px",
  gap: "2px",
};
function pillStyle(id: TabId): CSSProperties {
  const on = tab.value === id;
  return {
    height: "44px",
    borderRadius: "10px",
    background: on ? "var(--v5-brand)" : "transparent",
  };
}
/** roving tabindex 的标准行为:左右方向键移一格并选上,焦点跟到新选中项。 */
function moveTab(index: number, delta: number): void {
  const next = TABS[(index + delta + TABS.length) % TABS.length];
  if (!next) return;
  tab.value = next;
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  });
}
function pillLabelStyle(id: TabId): CSSProperties {
  const on = tab.value === id;
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "13px",
    fontWeight: 500,
    letterSpacing: "-0.005em",
    color: on ? "var(--v5-on-brand)" : "var(--v5-ink-3)",
  };
}
const emptyStyle: CSSProperties = {
  border: "1px dashed var(--v5-border-strong)",
  padding: "32px",
};

import GlassSegments from "@/components/glass-segments.vue";
const tabOptions = computed(() => TABS.map(value => ({ value, label: t.value.events.tabs[value] })));
</script>
