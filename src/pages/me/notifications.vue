<!--
  Notification Center (ported from Nexion-prototype/app/(main)/me/notifications/page.tsx).
  Filter pills by NotifKind family + unread badge + mark-all / clear-read actions +
  a timeline of routed events. Tapping a row marks it read and (if it carries a
  ctaHref) navigates. Wrapped in <AppChassis active="me">.

  Remote rows preserve click CTA and left-swipe conversion as distinct actions.
  Mock mode remains local-only and never reports a conversion to the API.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" />

      <!-- unread badge + action buttons -->
      <view class="px-4 flex items-center justify-between" style="padding-bottom: 8px">
        <view class="flex items-center" style="gap: 4px">
          <text v-if="notifs.unread > 0" :style="unreadBadgeStyle">{{ notifs.unread }}</text>
        </view>
        <view class="flex items-center" style="gap: 4px">
          <view v-if="notifs.unread > 0" class="flex items-center active:opacity-70" :style="actionBtnStyle('var(--v5-brand)')" @click="notifs.markAllRead()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 7 17l-5-5" /><path d="m22 10-7.5 7.5L13 16" /></svg>
            <text style="margin-left: 4px">{{ t.notifs.markAll }}</text>
          </view>
          <view v-if="hasRead" class="flex items-center active:opacity-70" :style="actionBtnStyle('var(--v5-ink-3)')" @click="notifs.clearRead()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
          </view>
        </view>
      </view>

      <!-- Filter pills -->
      <scroll-view scroll-x class="px-4" style="margin-bottom: 12px; white-space: nowrap">
        <template v-for="id in filterIds" :key="id">
          <view
            v-if="id === 'all' || countOf(id) > 0"
            class="active:opacity-70"
            :style="pillStyle(filter === id)"
            @click="filter = id"
          >
            <text>{{ filterLabel(id) }} ({{ countOf(id) }})</text>
          </view>
        </template>
      </scroll-view>

      <!-- Timeline -->
      <view class="px-4">
        <view v-if="notifs.error" data-testid="notification-error" :style="emptyCardStyle"><text>{{ notifsErrorText }}</text><text class="block" :style="ctaStyle('system')" @click="notifs.retryRemote()">{{ t.ui.retry }}</text></view>
        <EmptyState v-if="filtered.length === 0" kind="empty-list" :title="t.empty.listTitle" :desc="t.empty.listDesc" />
        <view v-else :style="listStyle">
          <view
            v-for="(n, i) in filtered"
            :key="n.id"
            class="flex items-start active:opacity-90"
            :style="rowStyle(i !== filtered.length - 1, !n.readAt)"
            @touchstart="onTouchStart(n, $event)"
            @touchend="onTouchEnd(n, $event)"
            @click="onTap(n)"
          >
            <view class="relative shrink-0">
              <view class="grid place-items-center" :style="iconBoxStyle(n.kind)">
                <view v-html="kindIcon(n.kind)" />
              </view>
              <view v-if="!n.readAt" :style="unreadDotStyle" />
            </view>
            <view class="min-w-0" style="flex: 1">
              <view class="flex items-baseline justify-between" style="gap: 8px">
                <text class="truncate" :style="titleStyle(!n.readAt)">{{ n.title }}</text>
                <text class="shrink-0" :style="timeStyle">{{ timeAgo(n.ts) }}</text>
              </view>
              <text v-if="n.body" class="block" :style="bodyStyle">{{ n.body }}</text>
              <text v-if="n.ctaLabel" class="block" :style="ctaStyle(n.kind)">{{ n.ctaLabel }} →</text>
            </view>
          </view>
        </view>
        <text v-if="notifs.nextCursor && !notifs.loading" class="block text-center" :style="ctaStyle('system')" @click="notifs.loadMoreRemote()">{{ t.notifs.loadMore }}</text>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useNotifications, type NotifKind, type Notification } from "@/store/notifications";
import { navTo } from "@/lib/route";
import { remoteApiEnabled } from "@/api/runtime";
import { isLeftConversionSwipe, type SwipePoint } from "@/lib/notification-swipe";

const t = useT();
const notifs = useNotifications();
// store 保留机器码(SESSION_EXPIRED / NOTIFICATION_UNAVAILABLE / 服务端 envelope 原文…),
// 视图侧统一映射成用户文案 —— 裸插值会把工程码上屏,违反「页面文案禁止错误码」。
// 写法与 risk-disclosure.vue:108 同源。
const notifsErrorText = computed(() => notifs.error ? t.value.notifs.loadFailed : "");

type Filter = "all" | NotifKind;
const filter = ref<Filter>("all");
const filterIds: Filter[] = ["all", "commission", "team", "staking", "market", "genesis", "system"];

const KIND_META: Record<NotifKind, { labelKey: string; tint: string; href: string }> = {
  commission: { labelKey: "kindMoney", tint: "var(--v5-success)", href: "/pages/me/wallet-repurchase" },
  team: { labelKey: "kindTeam", tint: "var(--v5-tech-cyan)", href: "/pages/team/team" },
  staking: { labelKey: "kindStaking", tint: "var(--v5-success)", href: "/pages/staking/staking" },
  market: { labelKey: "kindMarket", tint: "var(--v5-warning)", href: "/pages/market/market" },
  genesis: { labelKey: "kindGenesis", tint: "var(--v5-brand-2)", href: "/pages/genesis/marketplace" },
  system: { labelKey: "kindSystem", tint: "var(--v5-tech-cyan)", href: "" },
};

const KIND_ICON: Record<NotifKind, string> = {
  commission: `<path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />`,
  team: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />`,
  staking: `<rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />`,
  market: `<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />`,
  genesis: `<path d="M6 3h12l4 6-10 13L2 9Z" /><path d="M11 3 8 9l4 13 4-13-3-6" /><path d="M2 9h20" />`,
  system: `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" />`,
};
function kindIcon(k: NotifKind): string {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${KIND_META[k].tint}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${KIND_ICON[k]}</svg>`;
}

const hasRead = computed(() => notifs.items.some((i) => i.readAt));
function countOf(id: Filter): number {
  return id === "all" ? notifs.items.length : notifs.items.filter((x) => x.kind === id).length;
}
const filtered = computed(() =>
  filter.value === "all" ? notifs.items : notifs.items.filter((x) => x.kind === filter.value),
);

function filterLabelKey(id: Filter): string {
  return id === "all" ? "filterAll" : KIND_META[id].labelKey;
}
function filterLabel(id: Filter): string {
  return (t.value.notifs as unknown as Record<string, string>)[filterLabelKey(id)];
}
const emptyTitle = computed(() =>
  notifs.items.length === 0
    ? t.value.notifs.emptyAllTitle
    : fmt(t.value.notifs.emptyFilterTitle, { filter: filterLabel(filter.value).toLowerCase() }),
);

function timeAgo(ts: number): string {
  const mins = Math.max(1, Math.floor((Date.now() - ts) / 60_000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

async function onTap(n: Notification) {
  if (suppressedClick?.id === n.id && Date.now() <= suppressedClick.until) {
    suppressedClick = null;
    return;
  }
  if (n.ctaHref) {
    if (remoteApiEnabled) {
      const canonicalRoute = await notifs.recordCta(n.id);
      if (canonicalRoute) navTo(canonicalRoute);
    } else {
      await notifs.markRead(n.id);
      navTo(n.ctaHref);
    }
    return;
  }
  await notifs.markRead(n.id);
  const href = KIND_META[n.kind].href;
  if (href) navTo(href);
}

type UniTouchEvent = { changedTouches?: ArrayLike<{ clientX: number; clientY: number }> };
const touchStarts = new Map<string, SwipePoint>();
let suppressedClick: { id: string; until: number } | null = null;

function touchPoint(event: UniTouchEvent): SwipePoint | null {
  const touch = event.changedTouches?.[0];
  return touch ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : null;
}

function onTouchStart(n: Notification, event: UniTouchEvent) {
  const point = touchPoint(event);
  if (point) touchStarts.set(n.id, point);
}

async function onTouchEnd(n: Notification, event: UniTouchEvent) {
  const start = touchStarts.get(n.id);
  touchStarts.delete(n.id);
  const end = touchPoint(event);
  if (!remoteApiEnabled) return;
  if (!start || !end || !isLeftConversionSwipe(start, end)) return;
  suppressedClick = { id: n.id, until: Date.now() + 800 };
  const canonicalRoute = await notifs.recordSwipeConversion(n.id);
  if (canonicalRoute) navTo(canonicalRoute);
}
onMounted(() => { void notifs.refreshRemote(); });

const unreadBadgeStyle: CSSProperties = {
  fontSize: "12px",
  background: "var(--v5-danger)",
  color: "var(--v5-on-brand)",
  padding: "2px 6px",
  borderRadius: "999px",
  fontWeight: 600,
};
function actionBtnStyle(color: string): CSSProperties {
  return { height: "36px", padding: "0 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600, color };
}
function pillStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    height: "44px",
    padding: "0 16px",
    marginRight: "6px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 600,
    // 未选中原 surface-2 与页面底同色不可辨(亮色 ΔE 2.2),筛选胶囊直接坐在页面底上 → 改 L1
    background: active ? "var(--v5-brand)" : "var(--v5-surface)",
    color: active ? "var(--v5-on-brand)" : "var(--v5-ink-3)",
  };
}
// Empty state — dashed outline hint, no fill (V5 empty-state idiom).
const emptyCardStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px dashed var(--v5-border-strong)",
  padding: "32px",
  textAlign: "center",
};
const emptyTitleStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink)" };
const emptyBodyStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "4px", lineHeight: 1.375 };
// Transparent hairline group — border-top opens the timeline, rows carry dividers;
// the unread row keeps its surface-2 highlight tint.
const listStyle: CSSProperties = {
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
function rowStyle(divider: boolean, unread: boolean): CSSProperties {
  return {
    gap: "12px",
    padding: "12px 0",
    borderBottom: divider ? "1px solid var(--v5-border)" : "none",
    background: unread ? "var(--v5-surface-2)" : "transparent",
  };
}
function iconBoxStyle(k: NotifKind): CSSProperties {
  return {
    width: "36px",
    height: "36px",
    borderRadius: "12px",
    background: `color-mix(in srgb, ${KIND_META[k].tint} 18%, transparent)`,
  };
}
const unreadDotStyle: CSSProperties = {
  position: "absolute",
  top: "-2px",
  right: "-2px",
  width: "8px",
  height: "8px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
};
function titleStyle(unread: boolean): CSSProperties {
  return {
    fontSize: "13px",
    color: unread ? "var(--v5-ink)" : "var(--v5-ink-2)",
    fontWeight: unread ? 600 : 400,
  };
}
const timeStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const bodyStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px", lineHeight: 1.375 };
function ctaStyle(k: NotifKind): CSSProperties {
  return { fontSize: "12px", fontWeight: 600, color: KIND_META[k].tint, marginTop: "6px" };
}
</script>
