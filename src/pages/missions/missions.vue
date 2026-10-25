<!--
  Mission Center — ported from Nexion-prototype/app/(main)/missions/page.tsx.

  Single hub for every task system: hero + sectioned RouteRows (Today /
  This Week / Day-One / Events / Achievements).

  Wrapped in <AppChassis active="home"> (reached from Home). SetPageHeader
  backHref="/" → SubPageHeader back="/pages/index/index".

  Scope note: "This Week" now embeds the live <WeeklyQuestHero> +
  <WeeklyQuestList> (ported — Tier 1 priority quest + Tier 2 engagement list +
  champion bonus, matching the source missions page). The
  Events row stat IS live: ongoing / joined / claimable counts derive from the
  ported EVENTS mock + event-quest store, so the badge + stat line are real.
-->
<template>
  <AppChassis active="home">
    <view class="missions-content">
      <SubPageHeader back="/pages/index/index" />
      <view class="mx-4"><GlassSegments :label="t.missions.heroTitle" v-model="activePanel" :options="panels" /></view>
      <view v-if="activePanel === 'today'" class="mx-4 space-y-4" style="margin-top:20px"><DailyCheckInRow /><DayOneQuestCard v-model:expanded="dayOneExpanded" /></view>
      <view v-else-if="activePanel === 'week'" style="margin-top:20px"><view class="mx-4"><WeeklyQuestHero /></view><WeeklyQuestList /></view>
      <EventsContent v-else-if="activePanel === 'events'" embedded />
      <AchievementsContent v-else embedded />
    </view>
  </AppChassis>
</template>
<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import GlassSegments from '@/components/glass-segments.vue';
import DailyCheckInRow from '@/components/home/daily-check-in-row.vue';
import EventsContent from '@/pages/events/events.vue';
import AchievementsContent from '@/pages/me/achievements.vue';
import CardStagger from "@/components/card-stagger.vue";
import EmptyState from "@/components/empty-state.vue";
import WeeklyQuestHero from "@/components/home/weekly-quest-hero.vue";
import WeeklyQuestList from "@/components/home/weekly-quest-list.vue";
import DayOneQuestCard from "@/components/home/day-one-quest-card.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useEventQuest } from "@/store/event-quest";
import { EVENTS } from "@/mock/events";
import { eventsApi, remoteApiEnabled } from "@/api/runtime";
import type { CanonicalEvent } from "@/api/events-api";
import { useApp } from "@/store/app";
import { useQuest } from "@/store/quest";
import { useLocaleStore } from "@/store/locale";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { bindPageVisibilityRefresh, createPageVisibilityRefresh } from "@/lib/page-visibility-refresh";
import { createRemotePageRequestFence } from "@/lib/remote-page-request-fence";
import { registerActivePageRefresh } from "@/lib/active-page-refresh";
import { projectMissionRemoteEvents, type MissionRemoteEventsReadState } from "./mission-events-state";

const t = useT();
const activePanel = ref('today');
const panels = computed(() => [
  {value:'today',label:t.value.missions.todayHeading},{value:'week',label:t.value.missions.weekHeading},
  {value:'events',label:t.value.missions.eventsHeading},{value:'achievements',label:t.value.missions.achievementsHeading},
]);
const eventQuest = useEventQuest();
const app = useApp();
const quest = useQuest();
const dayOneExpanded = ref(true);
const locale = useLocaleStore();
const language = computed(() => locale.code);
const remoteEvents = ref<CanonicalEvent[]>([]);
const remoteEventsReadState = ref<MissionRemoteEventsReadState>("initial");
const remoteAccountEpoch = createRemoteAccountEpoch(app.accountKey);
let mounted = false;
const remoteRequestFence = createRemotePageRequestFence(remoteAccountEpoch, () => mounted);
let releaseActiveRefresh = () => {};
function activatePageRefresh() {
  releaseActiveRefresh();
  releaseActiveRefresh = registerActivePageRefresh(async () => {
    await Promise.all([refreshRemoteEvents(), quest.refreshRemote()]);
  });
}
async function refreshRemoteEvents(): Promise<void> {
  if (!remoteApiEnabled) return;
  const scope = remoteRequestFence.capture();
  remoteEventsReadState.value = remoteEventsReadState.value === "ready" ? "refreshing" : "initial";
  try {
    const snapshot = await eventsApi.state(language.value);
    if (remoteRequestFence.isCurrent(scope)) {
      remoteEvents.value = snapshot.events;
      remoteEventsReadState.value = "ready";
    }
  } catch {
    if (remoteRequestFence.isCurrent(scope)) {
      remoteEvents.value = [];
      remoteEventsReadState.value = "error";
    }
  }
}
function retryRemoteEvents() {
  void refreshRemoteEvents();
}
const missionVisibility = createPageVisibilityRefresh((reason) => {
  if (!remoteApiEnabled) return;
  remoteAccountEpoch.bind(app.accountKey);
  if (reason === "initial") {
    remoteEvents.value = [];
    remoteEventsReadState.value = "initial";
  }
  void refreshRemoteEvents();
  void quest.refreshRemote();
});
bindPageVisibilityRefresh(missionVisibility, {
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
    callback();
  }),
});
onUnmounted(() => {
  mounted = false;
  releaseActiveRefresh();
  remoteRequestFence.invalidate();
});
watch([() => String(app.accountKey), () => app.accountBindingEpoch, () => language.value], ([accountKey]) => {
  if (!remoteApiEnabled) return;
  remoteAccountEpoch.bind(accountKey);
  remoteRequestFence.invalidate();
  remoteEvents.value = [];
  remoteEventsReadState.value = "initial";
  void refreshRemoteEvents();
});

// Live Events row stat — ongoing / joined / claimable from the ported mock +
// store (claimable = trackable + done + not yet claimed).
const remoteEventProjection = computed(() => projectMissionRemoteEvents(remoteEventsReadState.value, remoteEvents.value));
const eventStats = computed(() => {
  if (remoteApiEnabled) {
    return remoteEventProjection.value.stats;
  }
  const ongoing = EVENTS.filter((ev) => ev.status === "ongoing").length;
  let joined = 0;
  let claimable = 0;
  for (const ev of EVENTS) {
    const trackable = ev.trackable === true;
    const isJoined = trackable ? eventQuest.isJoined(ev.id) : ev.joined;
    if (isJoined && ev.status !== "ended") joined += 1;
    if (trackable && (ev.done ?? false) && !eventQuest.isClaimed(ev.id)) claimable += 1;
  }
  return { ongoing, joined, claimable };
});

const eventStatText = computed(() => {
  if (remoteApiEnabled) {
    if (remoteEventProjection.value.state === "initial") return t.value.missions.eventsLoading;
    if (remoteEventProjection.value.state === "refreshing") return t.value.missions.eventsRefreshing;
    if (remoteEventProjection.value.state === "error") return "";
    if (remoteEventProjection.value.empty) return t.value.missions.eventsEmpty;
  }
  const stats = eventStats.value;
  return stats ? fmt(t.value.missions.eventsStat, {
    ongoing: stats.ongoing,
    joined: stats.joined,
    claimable: stats.claimable,
  }) : "";
});

function go(url: string) {
  navTo(url);
}

// 入口卡的可访问名 = 卡面标签(与 team.vue 的 nx-team-*-link 同一写法)。
// 卡面是「标签 + 数值」两行,只给 container 时读屏念不出这是什么,也不知道能进哪里;
// 名称取入口用途那一行,三张卡各自稳定唯一。
const todayEntryLabel = computed(() => t.value.missions.todayLabel);
const eventsEntryLabel = computed(() => t.value.missions.eventsLabel);
const achievementsEntryLabel = computed(() => t.value.missions.achievementsLabel);

// ── styles ──
// De-carded hero — content on the page floor (2px optical inset); surface/border
// + aurora/grid glows deleted outright, not re-tuned.
const heroStyle: CSSProperties = {
  padding: "0 2px",
};
const heroChipStyle: CSSProperties = {
  gap: "6px",
  padding: "3px 9px",
  borderRadius: "999px",
  background: "var(--v5-success-soft)",
  color: "var(--v5-success)",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
};
const heroTitleStyle: CSSProperties = {
  marginTop: "14px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "26px",
  letterSpacing: "-0.022em",
  lineHeight: 1.2,
  color: "var(--v5-ink)",
};
const heroSubtitleStyle: CSSProperties = {
  marginTop: "10px",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  color: "var(--v5-ink-2)",
  lineHeight: 1.55,
};
const sectionStyle: CSSProperties = { marginTop: "18px" };
const sectionHeadStyle: CSSProperties = { gap: "8px", marginBottom: "10px" };
const sectionTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
};
// Filled nav row, no border — chevron + active:opacity carry the tap affordance.
const rowStyle: CSSProperties = {
  gap: "12px",
  padding: "12px 14px",
  borderRadius: "var(--nx-glass-radius)",
  background: "transparent",
};
function rowIconBox(tint: string): CSSProperties {
  return {
    width: "32px",
    height: "32px",
    borderRadius: "10px",
    background: `color-mix(in srgb, ${tint} 10%, transparent)`,
  };
}
const rowLabelStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};
const rowValueStyle: CSSProperties = {
  marginTop: "2px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const badgeStyle: CSSProperties = {
  minWidth: "18px",
  height: "18px",
  padding: "0 5px",
  borderRadius: "999px",
  background: "var(--v5-warning)",
  color: "var(--v5-on-brand)",
  fontSize: "12px",
  fontWeight: 500,
};


</script>

<style scoped>
/* 三张入口卡现在可聚焦(role=button + tabindex),必须有可见焦点环:
   卡片是圆角 surface 块,默认 outline 贴着圆角被裁,键盘用户看不出焦点落在哪一张。 */
.nx-mission-entry:focus-visible {
  outline: 2px solid var(--v5-brand);
  outline-offset: 2px;
}
</style>

<style scoped>.missions-content { padding-bottom:24px; }</style>
