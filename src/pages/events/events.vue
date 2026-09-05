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
        <!-- Featured hero -->
        <EventsFeaturedHero
          v-if="featured"
          :ev="featured"
          :reward-nex="rewardNexOf(featured)"
          @join="handleJoin(featured)"
          @claim="handleClaim(featured)"
          @cta="handleCta(featured)"
        />

        <!-- Tabs — shared SegmentedControl spec (segmented-control.tsx): p-1 / gap
             0.5 / rounded-2xl container, h-11 rounded-[10px] segments, brand fill
             + on-brand text on active (no shadow), label v5 12.5/500/-0.005em. -->
        <view class="flex" :style="segWrapStyle">
          <view v-for="id in TABS" :key="id" class="flex-1 relative grid place-items-center active:opacity-70" :style="pillStyle(id)" @click="tab = id">
            <text :style="pillLabelStyle(id)">{{ t.events.tabs[id] }}</text>
          </view>
        </view>

        <!-- Event list -->
        <EmptyState
          v-if="remoteEventsError"
          kind="recoverable-error"
          :title="t.events.loadErrorTitle"
          :desc="t.events.loadErrorBody"
          :cta-label="t.events.retry"
          @cta="retryRemoteEvents"
        />
        <EmptyState v-else-if="filtered.length === 0 && emptyKey" kind="no-filter-results" :title="t.empty.filterTitle" :desc="t.empty.filterDesc" />
        <view v-else class="space-y-2.5">
          <EventsCard
            v-for="ev in filtered"
            :key="ev.id"
            :ev="ev"
            :reward-nex="rewardNexOf(ev)"
            @join="handleJoin(ev)"
            @claim="handleClaim(ev)"
            @cta="handleCta(ev)"
          />
        </view>

        <!-- footer -->
        <text class="block text-center" style="font-size: 12px; color: var(--v5-ink-3); line-height: 1.625; padding-top: 4px">{{ t.events.note }}</text>
      </view>
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import CardStagger from "@/components/card-stagger.vue";
import EventsFeaturedHero from "@/components/events/events-featured-hero.vue";
import EventsCard from "@/components/events/events-card.vue";
import { useT } from "@/i18n/use-t";
import { geoPolicyUserMessage } from "@/api/geo-policy-error";
import { eventsApi, remoteApiEnabled } from "@/api/runtime";
import type { CanonicalEvent } from "@/api/events-api";
import { postMoneyBillsOnce } from "@/lib/money-receipt";
import { useEventQuest } from "@/store/event-quest";
import { useApp } from "@/store/app";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";
import { useLuckySpin } from "@/store/lucky-spin";
import { toast } from "@/store/ui";
import { EVENTS, type EventStatus, type NexEvent } from "@/mock/events";

type TabId = "all" | EventStatus | "joined";
type EnrichedEvent = NexEvent & { _trackable: boolean; _done: boolean; _claimed: boolean };

const TABS: TabId[] = ["all", "ongoing", "upcoming", "joined", "ended"];

const t = useT();
const eventQuest = useEventQuest();
const luckySpin = useLuckySpin();
const app = useApp();

const tab = ref<TabId>("ongoing");
const remoteEvents = ref<CanonicalEvent[]>([]);
const remoteEventsError = ref(false);
const remoteAccountEpoch = createRemoteAccountEpoch(app.accountKey);

function remoteEventView(event: CanonicalEvent): NexEvent {
  const tintByKind: Record<CanonicalEvent["kind"], string> = {
    discount: "#FFC83D", referral: "#7DD3FC", wheel: "#C4B5FD", regional: "#FB7185",
    boost: "#86EFAC", seasonal: "#F9A8D4", holding: "#93C5FD", onboarding: "#FDE68A",
  };
  return {
    id: event.eventCode,
    kind: event.kind,
    status: event.state,
    title: event.title,
    subtitle: event.subtitle,
    emoji: "✦",
    tint: tintByKind[event.kind],
    reward: `${event.rewardAmount} ${event.rewardName}`,
    progress: event.trackable ? { current: event.progressValue, total: event.targetValue, label: "progress" } : null,
    joined: ["JOINED", "CLAIMABLE", "CLAIMED"].includes(event.userStatus),
    href: event.href || undefined,
    featured: event.featured,
    trackable: event.trackable,
    done: ["CLAIMABLE", "CLAIMED"].includes(event.userStatus),
    rewardNEX: event.rewardType === "NEX" ? event.rewardAmount : 0,
  };
}

async function loadRemoteEvents(request: RemoteAccountRequest = remoteAccountEpoch.snapshot()) {
  if (!remoteApiEnabled) return;
  try {
    const snapshot = await eventsApi.state();
    if (!remoteAccountEpoch.isCurrent(request)) return;
    remoteEvents.value = snapshot.events;
    remoteEventsError.value = false;
  } catch {
    if (remoteAccountEpoch.isCurrent(request)) {
      remoteEvents.value = [];
      remoteEventsError.value = true;
    }
  }
}
function retryRemoteEvents() {
  void loadRemoteEvents();
}
onMounted(() => {
  if (!remoteApiEnabled) return;
  remoteAccountEpoch.bind(app.accountKey);
  remoteEvents.value = [];
  remoteEventsError.value = false;
  void loadRemoteEvents();
});
watch(() => app.accountKey, (accountKey) => {
  if (!remoteApiEnabled) return;
  remoteAccountEpoch.bind(accountKey);
  remoteEvents.value = [];
  remoteEventsError.value = false;
  void loadRemoteEvents();
});

// Enrich each event with live join/claim state from the store.
const enrichedEvents = computed<EnrichedEvent[]>(() =>
  (remoteApiEnabled ? remoteEvents.value.map(remoteEventView) : EVENTS).map((ev) => {
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
  if (!ev._trackable) return;
  if (remoteApiEnabled) {
    if (await eventQuest.joinRemote(ev.id)) {
      await loadRemoteEvents();
      toast.success(t.value.events.toast.joinedTitle.replace("{name}", ev.title), t.value.events.toast.joinedBody);
    } else {
      toast.error(t.value.authOtp.errorServiceUnavailable);
    }
    return;
  }
  const joined = eventQuest.join(ev.id);
  if (joined) {
    toast.success(t.value.events.toast.joinedTitle.replace("{name}", ev.title), t.value.events.toast.joinedBody);
    return;
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
  if (!ev._trackable || !ev._done || ev._claimed) return;
  if (remoteApiEnabled) {
    if (await eventQuest.claimRemote(ev.id)) {
      await loadRemoteEvents();
      toast.success(t.value.events.toast.claimedTitle.replace("{n}", rewardNexOf(ev).toLocaleString()), ev.title);
    } else {
      toast.error(t.value.authOtp.errorServiceUnavailable);
    }
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
  if (!eventQuest.claim(ev.id)) return; // 消费失败:钱已幂等落定,重试命中同一 ref 不会再发
  toast.success(t.value.events.toast.claimedTitle.replace("{n}", reward.toLocaleString()), ev.title);
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
    luckySpin.openSheet();
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
</script>
