import { describe, expect, it } from "vitest";
import homeSource from "./conversion-banner.vue?raw";
import indexSource from "../../pages/index/index.vue?raw";
import howSource from "../how/how-published-content.vue?raw";
import eventPageSource from "../../pages/events/events.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import { remoteEventView, type EventActionLabels } from "@/pages/events/remote-event-view";
import type { CanonicalEvent } from "@/api/events-api";

const eventLabels: EventActionLabels = {
  claimDiscount: "Claim discount",
  checkIn: "Check in",
  reinvest: "Re-invest",
  spin: "Spin now",
  leaderboard: "Leaderboard",
  viewDetails: "View details",
  progress: "Progress",
  wheelPool: "Wheel prize pool",
};

const trackableEvent: CanonicalEvent = {
  eventCode: "weekly-progress",
  kind: "boost",
  state: "ongoing",
  title: "Weekly progress",
  subtitle: "Server projection",
  rewardName: "NEX",
  rewardType: "NEX",
  rewardAmount: 100,
  featured: false,
  trackable: true,
  targetValue: 5,
  progressValue: 2,
  userStatus: "JOINED",
  geo: "",
  href: "/pages/missions/missions",
  startsAt: null,
  endsAt: null,
};

describe("P3-14/15 audit regressions", () => {
  it("takes the progress label from the localized event labels", () => {
    expect(remoteEventView(trackableEvent, eventLabels).progress).toMatchObject({ label: "Progress" });
  });
  it("wires the live event page to each locale's progress label", () => {
    expect(eventPageSource).toContain("progress: t.value.events.progress.label");
    for (const dictionary of [en, zh, vi]) {
      expect(remoteEventView(trackableEvent, { ...eventLabels, progress: dictionary.events.progress.label }).progress?.label)
        .toBe(dictionary.events.progress.label);
      expect(dictionary.events.progress.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps the home weekly-card slot rendered for loading, error, and empty server states", () => {
    expect(indexSource).toContain('homeWeeklyPromoEnabled: platformConfig.isEnabled("homeWeeklyPromoEnabled"),');
    expect(homeSource).toContain('const weeklyState = computed<"loading" | "error" | "empty" | "ready">');
    expect(homeSource).toContain('v-if="weeklyState === \'loading\'"');
    expect(homeSource).toContain('v-else-if="weeklyState === \'error\'"');
    expect(homeSource).toContain('v-else-if="weeklyState === \'empty\'"');
    expect(homeSource).toContain('@click="onCardAction"');
    expect(homeSource).toContain('void wq.refresh()');
  });

  it("binds all published-how loading, failure, retry, and version text to i18n", () => {
    expect(howSource).toContain('t.howPublished.loading');
    expect(howSource).toContain('t.howPublished.unavailableTitle');
    expect(howSource).toContain('t.howPublished.unavailableBody');
    expect(howSource).toContain(['t.howPublished.', 'versionMeta'].join(''));
    expect(howSource).toContain('t.ui.retry');
    expect(howSource).not.toMatch(/正在读取说明|说明暂不可用|服务端内容缺失|服务端发布版本|>重试</);
  });

  it("reloads published content when the locale or content key changes and ignores an obsolete response", () => {
    expect(howSource).toContain('() => [props.contentKey, locale.code] as const');
    expect(howSource).toContain('new PublishedContentRequestFence()');
    expect(howSource).toContain('requestFence.begin(requestKey)');
    expect(howSource).toContain('if (!requestFence.isCurrent(generation)) return');
  });

  it("invalidates an in-flight published-content request when the component unmounts", () => {
    expect(howSource).toContain('import { onUnmounted, ref, watch } from "vue";');
    expect(howSource).toContain('onUnmounted(() => requestFence.invalidate());');
  });
});
