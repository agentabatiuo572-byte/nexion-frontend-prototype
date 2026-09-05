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
    <CardStagger class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/index/index" />

      <!-- Hero — de-carded: chip + title + subtitle sit on the page floor; aurora
           + grid floor decoration deleted outright (owner call 2026-07-08). -->
      <view class="mx-4" :style="heroStyle">
        <view>
          <view class="inline-flex items-center font-mono-tabular" :style="heroChipStyle">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0z" /></svg>
            {{ t.missions.heroLabel }}
          </view>
          <text class="block" :style="heroTitleStyle">{{ t.missions.heroTitle }}</text>
          <text class="block" :style="heroSubtitleStyle">{{ t.missions.heroSubtitle }}</text>
        </view>
      </view>

      <!-- Today -->
      <view :style="sectionStyle">
        <view class="mx-4 flex items-center" :style="sectionHeadStyle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></svg>
          <text :style="sectionTitleStyle">{{ t.missions.todayHeading }}</text>
        </view>
        <view class="mx-4 flex items-center active:opacity-80" :style="rowStyle" @click="go('/pages/daily/daily')">
          <view class="grid place-items-center shrink-0" :style="rowIconBox('var(--v5-brand-2)')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>
          </view>
          <view class="flex-1 min-w-0">
            <text class="block" :style="rowLabelStyle">{{ t.missions.todayLabel }}</text>
            <text class="block truncate" :style="rowValueStyle">{{ t.missions.todayValue }}</text>
          </view>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
      </view>

      <!-- This Week — embed live Weekly Quest hero + list (ported, source parity) -->
      <view :style="sectionStyle">
        <view class="mx-4 flex items-center" :style="sectionHeadStyle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /></svg>
          <text :style="sectionTitleStyle">{{ t.missions.weekHeading }}</text>
        </view>
        <view class="mx-4"><WeeklyQuestHero /></view>
        <WeeklyQuestList />
      </view>

      <!-- Events -->
      <view :style="sectionStyle">
        <view class="mx-4 flex items-center" :style="sectionHeadStyle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>
          <text :style="sectionTitleStyle">{{ t.missions.eventsHeading }}</text>
        </view>
        <EmptyState
          v-if="remoteEventsError"
          class="mx-4"
          kind="recoverable-error"
          :title="t.missions.eventsUnavailableTitle"
          :desc="t.missions.eventsUnavailableBody"
          :cta-label="t.missions.retry"
          @cta="retryRemoteEvents"
        />
        <view v-else class="mx-4 flex items-center active:opacity-80" :style="rowStyle" @click="go('/pages/events/events')">
          <view class="grid place-items-center shrink-0" :style="rowIconBox('var(--v5-warning)')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /></svg>
          </view>
          <view class="flex-1 min-w-0">
            <view class="flex items-center" style="gap: 6px">
              <text :style="rowLabelStyle">{{ t.missions.eventsLabel }}</text>
              <text v-if="eventStats.claimable > 0" class="inline-flex items-center justify-center tabular-nums font-mono-tabular" :style="badgeStyle">{{ eventStats.claimable }}</text>
            </view>
            <text class="block truncate" :style="rowValueStyle">{{ eventStatText }}</text>
          </view>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
      </view>

      <!-- Achievements -->
      <view :style="sectionStyle">
        <view class="mx-4 flex items-center" :style="sectionHeadStyle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0z" /></svg>
          <text :style="sectionTitleStyle">{{ t.missions.achievementsHeading }}</text>
        </view>
        <view class="mx-4 flex items-center active:opacity-80" :style="rowStyle" @click="go('/pages/me/achievements')">
          <view class="grid place-items-center shrink-0" :style="rowIconBox('var(--v5-success)')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0z" /></svg>
          </view>
          <view class="flex-1 min-w-0">
            <text class="block" :style="rowLabelStyle">{{ t.missions.achievementsLabel }}</text>
            <text class="block truncate" :style="rowValueStyle">{{ t.missions.achievementsValue }}</text>
          </view>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
      </view>
    </CardStagger>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import CardStagger from "@/components/card-stagger.vue";
import EmptyState from "@/components/empty-state.vue";
import WeeklyQuestHero from "@/components/home/weekly-quest-hero.vue";
import WeeklyQuestList from "@/components/home/weekly-quest-list.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useEventQuest } from "@/store/event-quest";
import { EVENTS } from "@/mock/events";
import { eventsApi, remoteApiEnabled } from "@/api/runtime";
import type { CanonicalEvent } from "@/api/events-api";
import { useApp } from "@/store/app";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";

const t = useT();
const eventQuest = useEventQuest();
const app = useApp();
const remoteEvents = ref<CanonicalEvent[]>([]);
const remoteEventsError = ref(false);
const remoteAccountEpoch = createRemoteAccountEpoch(app.accountKey);
async function refreshRemoteEvents(request: RemoteAccountRequest = remoteAccountEpoch.snapshot()): Promise<void> {
  if (!remoteApiEnabled) return;
  try {
    const snapshot = await eventsApi.state();
    if (remoteAccountEpoch.isCurrent(request)) {
      remoteEvents.value = snapshot.events;
      remoteEventsError.value = false;
    }
  } catch {
    if (remoteAccountEpoch.isCurrent(request)) {
      remoteEvents.value = [];
      remoteEventsError.value = true;
    }
  }
}
function retryRemoteEvents() {
  void refreshRemoteEvents();
}
onMounted(() => {
  if (!remoteApiEnabled) return;
  remoteAccountEpoch.bind(app.accountKey);
  remoteEvents.value = [];
  remoteEventsError.value = false;
  void refreshRemoteEvents();
});
watch(() => app.accountKey, (accountKey) => {
  if (!remoteApiEnabled) return;
  remoteAccountEpoch.bind(accountKey);
  remoteEvents.value = [];
  remoteEventsError.value = false;
  void refreshRemoteEvents();
});

// Live Events row stat — ongoing / joined / claimable from the ported mock +
// store (claimable = trackable + done + not yet claimed).
const eventStats = computed(() => {
  if (remoteApiEnabled) {
    const current = remoteEvents.value;
    return {
      ongoing: current.filter((event) => event.state === "ongoing").length,
      joined: current.filter((event) => event.state !== "ended" && ["JOINED", "CLAIMABLE", "CLAIMED"].includes(event.userStatus)).length,
      claimable: current.filter((event) => event.userStatus === "CLAIMABLE").length,
    };
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

const eventStatText = computed(() =>
  fmt(t.value.missions.eventsStat, {
    ongoing: eventStats.value.ongoing,
    joined: eventStats.value.joined,
    claimable: eventStats.value.claimable,
  }),
);

function go(url: string) {
  uni.navigateTo({ url, fail: () => {} });
}

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
  borderRadius: "12px",
  background: "var(--v5-surface)",
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
