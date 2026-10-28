<template>
  <AppChassis active="me">
    <template #pageFixed="{ top }">
    <view class="message-center message-page" :style="{ top: top + 'px' }">
      <view class="message-nav">
        <view class="message-button message-icon-button nx-design-glass" role="button" tabindex="0" :aria-label="t.profile.back" @click="navBack('/pages/me/me')"><LiquidGlass :radius="22" tone="navigation" /><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg></view>
        <view v-if="summaryRecovery.visible" class="message-summary-recovery" role="alert"><text v-if="!headerState.title" class="message-recovery-title" role="heading" aria-level="1">{{ t.notifs.drawerTitle }}</text><view class="message-button" role="button" :tabindex="summaryRecovery.busy ? -1 : 0" :aria-disabled="summaryRecovery.busy" :aria-label="summaryRecovery.label + ' · ' + t.ui.retry" @click="retrySummary" @keydown.enter.prevent="retrySummary" @keydown.space.prevent="retrySummary"><text>{{ summaryRecovery.label }} · {{ t.ui.retry }}</text></view></view>
        <view class="message-button message-icon-button nx-design-glass" role="button" tabindex="0" :aria-label="t.notifs.preferences" @click="navTo('/pages/me/preferences')"><LiquidGlass :radius="22" tone="navigation" /><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></view>
      </view>
      <view v-if="!summaryRecovery.visible" class="message-compact" :class="{ 'message-compact--visible': !headerState.title }" :aria-hidden="headerState.title"><text>{{ t.notifs.drawerTitle }} · {{ section === 'service' ? t.notifs.serviceTab : t.notifs.notificationsTab }}</text></view>
      <view class="message-collapse" :class="{ 'message-collapse--hidden': !headerState.title }" :style="collapseStyle('title')" :aria-hidden="!headerState.title" :inert="!headerState.title ? true : undefined" @focusin="headerFocused = true" @focusout="headerFocused = false">
        <view class="message-heading">
          <view class="message-heading-row">
            <text class="message-title" :class="{ 'message-title--hidden': !headerState.title }" :aria-hidden="!headerState.title" role="heading" aria-level="1">{{ t.notifs.drawerTitle }}</text>
            <view class="message-subtitle" role="status"><view v-if="center.totalUnread" class="message-status-dot" aria-hidden="true" /><text>{{ unreadLabel }}</text></view>
            <view v-if="section === 'notifications' && notifs.unread > 0" class="message-button message-mark-all" role="button" :tabindex="headerState.title && !markingAll && !clearingRead ? 0 : -1" :aria-disabled="markingAll || clearingRead" :aria-label="t.notifs.markAll" @click="markAll" @keydown.enter.prevent="markAll" @keydown.space.prevent="markAll"><text>{{ actionCopy.markAllShort }}</text></view>
          </view>
        </view>
      </view>
      <view class="message-collapse message-primary-wrap" :class="{ 'message-collapse--hidden': !headerState.primary }" :style="collapseStyle('primary')" :aria-hidden="!headerState.primary" :inert="!headerState.primary ? true : undefined" @focusin="headerFocused = true" @focusout="headerFocused = false">
        <view class="message-primary-inner"><GlassSegments v-model="section" :options="accessibleSectionOptions" :label="t.notifs.drawerTitle" class="message-primary">
          <template #option="{ option }"><text class="message-option-label">{{ option.label }}</text><view v-if="option.hasUnread" class="message-status-dot" aria-hidden="true" /></template>
        </GlassSegments></view>
      </view>
      <GlassSegments v-if="section === 'service'" v-model="serviceFilter" :options="serviceFilters" layout="scroll" semantics="radio" :label="t.notifs.serviceFilterLabel" class="message-filters">
        <template #option="{ option }"><text class="message-option-label">{{ option.label }}</text><view v-if="option.count && option.value !== 'all'" class="message-category-dot" aria-hidden="true" /></template>
      </GlassSegments>
      <GlassSegments v-else :label="t.notifs.filterGroupLabel" semantics="radio" v-model="filter" :options="filterOptions" layout="scroll" class="message-filters">
        <template #option="{ option }"><text class="message-option-label">{{ option.label }}</text><view v-if="option.hasUnread && option.value !== 'all'" class="message-category-dot" aria-hidden="true" /></template>
      </GlassSegments>
      <scroll-view :key="section" scroll-y class="message-scroll" :show-scrollbar="false" @scroll="onMessageScroll" @wheel="onScrollInput" @touchmove="onScrollInput" @keydown.up="onScrollInput" @keydown.down="onScrollInput" @keydown.home="onScrollInput" @keydown.end="onScrollInput" @keydown.page-up="onScrollInput" @keydown.page-down="onScrollInput">
      <ServiceMessageList v-if="section === 'service'" :filter="serviceFilter" hide-filters />
      <view v-else class="notification-feed" :aria-busy="notifs.loading">
        <view v-if="!notifs.loading && !notifs.error && notifs.nextCursor && filtered.length === 0" role="status" class="message-state"><text>{{ t.notifs.moreToCheck }}</text></view>
        <EmptyState v-if="!notifs.loading && !notifs.error && !notifs.nextCursor && filtered.length === 0" kind="empty-list" :title="emptyTitle" :desc="notifs.items.length === 0 ? t.notifs.emptyBody : undefined" />
        <view v-for="(n, index) in filtered" :key="n.id" class="notification-item" :class="{ 'notification-item--read': !!n.readAt, 'notification-item--last': index === filtered.length - 1 }">
          <text v-if="index === 0 || dateHeading(n.ts) !== dateHeading(filtered[index - 1].ts)" class="notification-date" role="heading" aria-level="2">{{ dateHeading(n.ts) }}</text>
          <view class="notification-row" role="button" tabindex="0" :aria-label="platformDisplayText(n.title)" :aria-expanded="directNotice(n) ? undefined : expandedId === n.id" @click="toggle(n)" @touchstart="onTouchStart(n, $event)" @touchend="onTouchEnd(n, $event)">
            <view class="notification-icon" aria-hidden="true" v-html="kindIcon(n)" />
            <view class="notification-content"><view class="notification-top"><view class="notification-heading"><text class="notification-title">{{ platformDisplayText(n.title) }}</text><text v-if="n.priority === 'critical' || n.priority === 'high'" class="notification-important">{{ t.notifs.important }}</text></view><view class="notification-meta"><text class="notification-time">{{ timeAgo(n.ts) }}</text><view v-if="!n.readAt" class="message-status-dot" aria-hidden="true" /></view></view><text v-if="n.body && expandedId !== n.id" class="notification-preview">{{ platformDisplayText(n.body) }}</text></view>
            <svg v-if="n.ctaHref" class="notification-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </view>
          <view v-if="expandedId === n.id" class="notification-detail"><text v-if="n.body" class="notification-body">{{ platformDisplayText(n.body) }}</text><view v-if="n.ctaHref" class="message-button notification-cta" role="button" tabindex="0" :aria-label="platformDisplayText(n.ctaLabel || t.me.open)" @click.stop="onTap(n)"><LiquidGlass :radius="22" /><text>{{ platformDisplayText(n.ctaLabel || t.me.open) }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2"><path d="M4 12h16m-7-7 7 7-7 7" /></svg></view></view>
        </view>
        <view v-if="notifs.error" data-testid="notification-error" class="message-state" :class="{ 'message-state--inline': notifs.items.length > 0 }" role="alert"><text>{{ notifsErrorText }}</text><view class="message-button message-retry" role="button" :tabindex="notifs.loading ? -1 : 0" :aria-disabled="notifs.loading" :aria-label="t.ui.retry" @click="notifs.retryRemote()" @keydown.enter.prevent="notifs.retryRemote()" @keydown.space.prevent="notifs.retryRemote()"><text>{{ t.ui.retry }}</text></view></view>
        <view v-if="notifs.loading && !filtered.length" class="message-state" role="status" aria-live="polite"><text>{{ t.help.loadingMore }}</text></view>
        <view v-if="notifs.nextCursor" class="message-more"><view class="message-button" role="button" :tabindex="notifs.loading ? -1 : 0" :aria-disabled="notifs.loading" :aria-label="t.notifs.loadMore" @click="notifs.loadMoreRemote()"><LiquidGlass :radius="22" /><text>{{ notifs.loading ? t.help.loadingMore : t.notifs.loadMore }}</text></view></view>
        <view v-if="notifs.items.length || notifs.nextCursor" class="notification-management">
          <view class="message-button" role="button" :tabindex="clearingRead || markingAll || notifs.loading ? -1 : 0" :aria-disabled="clearingRead || markingAll || notifs.loading" @click="confirmClearRead"><LiquidGlass :radius="22" /><text>{{ actionCopy.clearRead }}</text></view>
        </view>
      </view>
      <view class="message-scroll-compensation" :style="{ height: headerCompensation + 'px' }" aria-hidden="true" />
      </scroll-view>
    </view>
    </template>
  </AppChassis>
</template>

<script setup lang="ts">
import { displayTimestamp, formatDisplayDate } from "@/lib/display-date";
import { platformDisplayText } from "@/lib/brand-copy";
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { onShow, onHide, onLoad, onResize } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import LiquidGlass from "@/components/liquid-glass.vue";
import ServiceMessageList from "@/components/support/service-message-list.vue";
import { useConversations } from "@/store/conversations";
import { useMessageDrawer, type MessageSection } from "@/store/message-drawer";
import { notificationCategory, type NotificationCategory } from "@/lib/notification-category";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { fmt } from "@/i18n/format";
import { useNotifications, type Notification } from "@/store/notifications";
import { navTo, navBack, takeNavigationQuery } from "@/lib/route";
import { remoteApiEnabled } from "@/api/runtime";
import { isLeftConversionSwipe, type SwipePoint } from "@/lib/notification-swipe";
import { useApp } from "@/store/app";
import { remoteAccountScope } from "@/lib/remote-account-epoch";
import { isDirectNotificationSummary } from "@/lib/notification-summary";
import { notificationActionsCopy } from "@/i18n/notification-actions";
import { confirm, useUI } from "@/store/ui";

const t = useT();
const locale = useLocaleStore();
const notifs = useNotifications();
const app = useApp();
const ui = useUI();
const actionCopy = computed(() => notificationActionsCopy[locale.code === 'zh' || locale.code === 'vi' ? locale.code : 'en']);
const clearingRead = ref(false);
const confirmOwner = `notification-center:${Date.now()}-${Math.random().toString(36).slice(2)}`;
let pageGeneration = 0;
let pageVisible = true;
let disposed = false;
function captureIntent() {
  return { generation: pageGeneration, account: remoteAccountScope.snapshot() };
}
function isCurrentIntent(intent: ReturnType<typeof captureIntent>) {
  return !disposed && pageVisible && intent.generation === pageGeneration
    && remoteAccountScope.isCurrent(intent.account);
}
// store 保留机器码(SESSION_EXPIRED / NOTIFICATION_UNAVAILABLE / 服务端 envelope 原文…),
// 视图侧统一映射成用户文案 —— 裸插值会把工程码上屏,违反「页面文案禁止错误码」。
// 写法与 risk-disclosure.vue:108 同源。
const notifsErrorText = computed(() => notifs.error ? t.value.notifs.loadFailed : "");

const center = useMessageDrawer();
const conversations = useConversations();
let sectionLoaded = false;
let sectionAccountWasBound = app.accountKey !== "default";
const initialSectionAccountEpoch = app.accountBindingEpoch;
let sectionEntryAllowed = true;
let initialSection: MessageSection | null = sectionAccountWasBound ? null : center.section;
const section = computed({ get: () => center.section, set: (value: MessageSection) => {
  center.section = value;
  if (!sectionAccountWasBound && sectionEntryAllowed) initialSection = value;
  preserveSectionInH5();
} });
const summaryRecovery = computed(() => ({
  visible: !!center.error || (section.value === "service" && conversations.realtimeFallback),
  label: center.error ? actionCopy.value.refreshFailed : actionCopy.value.liveUnavailable,
  busy: center.loading || (section.value === "service" && conversations.categoryLoading),
}));
function retrySummary() {
  if (!pageVisible || disposed || summaryRecovery.value.busy) return;
  if (section.value === "service" && conversations.realtimeFallback) {
    conversations.stopRealtime(); conversations.startRealtime();
  }
  void center.refresh();
}
function preserveSectionInH5() {
  if (!sectionLoaded || disposed || !pageVisible || typeof window === "undefined"
    || typeof window.history?.replaceState !== "function") return;
  const hash = window.location.hash.replace(/^#/, "");
  const question = hash.indexOf("?");
  const path = question < 0 ? hash : hash.slice(0, question);
  if (path !== "/pages/me/notifications") return;
  const query = new URLSearchParams(question < 0 ? "" : hash.slice(question + 1));
  if (query.get("section") === section.value) return;
  query.set("section", section.value);
  try {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${path}?${query}`);
  } catch { /* Unsupported history leaves the existing in-memory selection intact. */ }
}
onLoad(query => {
  const pending = takeNavigationQuery("/pages/me/notifications");
  const initial = query?.section ?? new URLSearchParams(pending).get("section");
  sectionLoaded = true;
  if (sectionEntryAllowed && (initial === "notifications" || initial === "service")) section.value = initial;
  else preserveSectionInH5();
});
const sectionOptions = computed(() => [
  { value: "notifications", label: t.value.notifs.notificationsTab, hasUnread: notifs.unread > 0 },
  { value: "service", label: t.value.notifs.serviceTab, hasUnread: center.serviceUnread > 0 },
]);
const unreadLabel = computed(() => center.error ? t.value.notifs.unreadUnavailable : center.totalUnread > 0 ? fmt(t.value.notifs.unreadCount, { n: center.totalUnread }) : center.loading ? t.value.notifs.unreadUnavailable : t.value.notifs.allCaughtUp);
type Filter = "all" | NotificationCategory;
const filter = ref<Filter>("all");
const filterIds: Filter[] = ["all", "finance", "device", "team", "rewards", "system"];
const visibleFilterIds = computed(() => filterIds);
const expandedId = ref<string | null>(null);
const categoryKeys = { finance: "categoryFinance", device: "categoryDevice", team: "kindTeam", rewards: "categoryRewards", system: "kindSystem" } as const;
const categoryIcons: Record<NotificationCategory, string> = {
  finance: '<path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2"/><path d="M3 6v12a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-3"/>',
  device: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  rewards: '<path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  system: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
};
function kindIcon(n: Notification) { return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${categoryIcons[notificationCategory(n)]}</svg>`; }
function countOf(id: Filter) { return id === "all" ? notifs.items.length : notifs.items.filter(n => notificationCategory(n) === id).length; }
const filtered = computed(() => filter.value === "all" ? notifs.items : notifs.items.filter(n => notificationCategory(n) === filter.value));
function filterLabel(id: Filter) { return id === "all" ? t.value.notifs.filterAll : t.value.notifs[categoryKeys[id]]; }
const emptyTitle = computed(() => notifs.items.length === 0 ? t.value.notifs.emptyAllTitle : fmt(t.value.notifs.emptyFilterTitle, { filter: filterLabel(filter.value) }));
function directNotice(n: Notification) { return !!n.ctaHref && isDirectNotificationSummary(n.body); }
function toggle(n: Notification) {
  if (directNotice(n)) { void onTap(n); return; }
  void notifs.markRead(n.id);
  expandedId.value = expandedId.value === n.id ? null : n.id;
}
const markingAll = ref(false);
async function markAll() { if (markingAll.value || clearingRead.value) return; markingAll.value = true; try { await notifs.markAllRead(); } finally { markingAll.value = false; } }
async function confirmClearRead() {
  const intent = captureIntent();
  if (!isCurrentIntent(intent) || clearingRead.value || markingAll.value || notifs.loading) return;
  clearingRead.value = true;
  try {
    const copy = actionCopy.value;
    const accepted = await confirm({ owner: confirmOwner, title: copy.title, message: copy.message,
      confirmLabel: copy.confirm, cancelLabel: copy.cancel, icon: 'warn', danger: true });
    if (accepted && isCurrentIntent(intent)) await notifs.clearRead();
  } finally {
    if (isCurrentIntent(intent)) clearingRead.value = false;
  }
}
watch(() => [app.accountKey, app.accountBindingEpoch] as const, ([nextKey, nextEpoch], [previousKey]) => {
  // Reapply only the first startup intent after the existing store reset.
  // A second bind (including the same account) is a real reset, even in one tick.
  const firstBinding = remoteApiEnabled && !sectionAccountWasBound && previousKey === "default"
    && nextKey !== "default" && nextEpoch === initialSectionAccountEpoch + 1;
  if (nextKey !== "default") sectionAccountWasBound = true;
  if (firstBinding && initialSection) section.value = initialSection;
  else if (!firstBinding) {
    sectionEntryAllowed = false;
    initialSection = null;
    section.value = "notifications";
  }
  preserveSectionInH5();
  expandedId.value = null; filter.value = "all"; serviceFilter.value = "all"; resetHeader();
  if (!disposed && pageVisible) void center.refresh();
});

function dateHeading(ts: number): string {
  if (displayTimestamp(ts) === null) return "—";
  const date = new Date(ts), today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return t.value.notifs.today;
  if (date.toDateString() === yesterday.toDateString()) return t.value.notifs.yesterday;
  return formatDisplayDate(ts, locale.code);
}

function timeAgo(ts: number): string {
  if (displayTimestamp(ts) === null) return "—";
  const date = new Date(ts), now = new Date(), yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    const clock = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return `${t.value.notifs.yesterday} ${clock}`;
  }
  // Compare local calendar dates, not elapsed 24-hour periods (including DST).
  const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    - Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86_400_000);
  if (days > 1) return fmt(t.value.tickets.timeDaysAgo, { n: days });
  const mins = Math.max(1, Math.floor((now.getTime() - ts) / 60_000));
  if (mins < 60) return fmt(t.value.tickets.timeMinutesAgo, { n: mins });
  return fmt(t.value.tickets.timeHoursAgo, { n: Math.floor(mins / 60) });
}

async function onTap(n: Notification) {
  const intent = captureIntent();
  if (!isCurrentIntent(intent)) return;
  if (suppressedClick?.id === n.id && Date.now() <= suppressedClick.until) {
    suppressedClick = null;
    return;
  }
  if (n.ctaHref) {
    if (remoteApiEnabled) {
      const canonicalRoute = await notifs.recordCta(n.id);
      if (canonicalRoute && isCurrentIntent(intent)) navTo(canonicalRoute);
    } else {
      await notifs.markRead(n.id);
      if (isCurrentIntent(intent)) navTo(n.ctaHref);
    }
    return;
  }
  await notifs.markRead(n.id);
  // Missing CTA is the PC operator's explicit "no navigation" choice.
}

type UniTouchEvent = { changedTouches?: ArrayLike<{ clientX: number; clientY: number }> };
const touchStarts = new Map<string, { point: SwipePoint; intent: ReturnType<typeof captureIntent> }>();
let suppressedClick: { id: string; until: number } | null = null;

function touchPoint(event: UniTouchEvent): SwipePoint | null {
  const touch = event.changedTouches?.[0];
  return touch ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : null;
}

function onTouchStart(n: Notification, event: UniTouchEvent) {
  const intent = captureIntent();
  if (!isCurrentIntent(intent)) return;
  const point = touchPoint(event);
  if (point) touchStarts.set(n.id, { point, intent });
}

async function onTouchEnd(n: Notification, event: UniTouchEvent) {
  const start = touchStarts.get(n.id);
  touchStarts.delete(n.id);
  const end = touchPoint(event);
  if (!remoteApiEnabled) return;
  if (!start || !end || !isCurrentIntent(start.intent) || !isLeftConversionSwipe(start.point, end)) return;
  suppressedClick = { id: n.id, until: Date.now() + 800 };
  const canonicalRoute = await notifs.recordSwipeConversion(n.id);
  if (canonicalRoute && isCurrentIntent(start.intent)) navTo(canonicalRoute);
}
function invalidatePendingIntents() {
  pageGeneration += 1;
  clearingRead.value = false;
  ui.clearConfirmsBy(confirmOwner);
  touchStarts.clear();
  suppressedClick = null;
}
function invalidatePage() {
  pageVisible = false;
  invalidatePendingIntents();
}
watch(() => [app.accountKey, app.accountBindingEpoch], invalidatePendingIntents, { flush: "sync" });
onMounted(() => { if (!disposed && pageVisible) void center.refresh(); });
onShow(() => {
  if (disposed) return;
  pageVisible = true;
  preserveSectionInH5();
  void center.refresh();
});
onHide(invalidatePage);
onUnmounted(() => { disposed = true; invalidatePage(); });

import GlassSegments from "@/components/glass-segments.vue";
const filterOptions = computed(() => visibleFilterIds.value.map(value => {
  const count = value === 'all' ? notifs.unread : notifs.unreadByCategory[value];
  return { value, label: filterLabel(value), hasUnread: count > 0 };
}));

import { advanceMessageHeader, createMessageHeaderState } from "@/lib/message-header-scroll";
const headerState = ref(createMessageHeaderState());
const headerFocused = ref(false);
const headerInstance = getCurrentInstance();
const headerHeights = ref<{ title: number; primary: number } | null>(null);
const accessibleSectionOptions = computed(() => sectionOptions.value.map(option => ({ ...option, disabled: !headerState.value.primary })));
const headerCompensation = computed(() => headerHeights.value
  ? (headerState.value.title ? 0 : headerHeights.value.title) + (headerState.value.primary ? 0 : headerHeights.value.primary) : 0);
function collapseStyle(part: 'title' | 'primary') {
  return headerHeights.value ? { height: (headerState.value[part] ? headerHeights.value[part] : 0) + 'px' } : undefined;
}
// Measure the always-mounted inner content, even while its outer wrapper is
// clipped. The same heights drive the header and list-end compensation.
async function measureHeader() {
  await nextTick();
  if (disposed || typeof uni === 'undefined' || typeof uni.createSelectorQuery !== 'function' || !headerInstance?.proxy) return;
  uni.createSelectorQuery().in(headerInstance.proxy)
    .select('.message-heading').boundingClientRect()
    .select('.message-primary-inner').boundingClientRect()
    .exec((boxes: Array<{ height?: number } | null>) => {
      const title = boxes[0]?.height, primary = boxes[1]?.height;
      if (!disposed && typeof title === 'number' && title > 0 && typeof primary === 'number' && primary > 0) headerHeights.value = { title, primary };
    });
}
onMounted(measureHeader);
onResize(measureHeader);
watch([unreadLabel, sectionOptions, section, () => center.error], measureHeader);
let lastScrollInputAt = -Infinity;
function onScrollInput() { lastScrollInputAt = Date.now(); }
const serviceFilter = ref<"all" | "advisor">("all");
const serviceFilters = computed(() => [
  { value: "all", label: t.value.notifs.filterAll, hasUnread: center.serviceUnread > 0 }, { value: "advisor", label: t.value.conversations.typeAdvisor, count: center.humanUnread },
]);
function onMessageScroll(event: { detail: { scrollTop: number } }) {
  const now = Date.now();
  headerState.value = advanceMessageHeader(headerState.value, event.detail.scrollTop, headerFocused.value, now, now - lastScrollInputAt < 160);
}
function resetHeader() { headerState.value = createMessageHeaderState(); }
watch(section, () => { resetHeader(); preserveSectionInH5(); });
</script>

<style src="@/styles/message-center.css"></style>
<style scoped>
.message-recovery-title { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
.message-nav .message-summary-recovery { flex: 1; min-width: 0; margin: 0 8px; }
.message-nav .message-summary-recovery .message-button { font: 600 13px/20px var(--font-v5); text-align: center; }
.notification-management { display: flex; justify-content: flex-end; padding: 4px 0 8px; }
/* Keep the shared segment semantics and keyboard handling; only this page's
   rails use the reference's green primary selection and neutral category glass. */
.message-center .message-primary { height: 50px; box-sizing: border-box; padding: 3px 0; gap: 4px; border: 0; background: transparent; box-shadow: none; }
.message-center .message-filters :deep(.nx-glass-option--selected::before) { content: ""; position: absolute; inset: 5px 0; z-index: 0; border-radius: 999px; pointer-events: none; border: 1px solid var(--message-glass-border); background: var(--message-glass-fill); box-shadow: inset 0 1px 0 var(--message-glass-border); -webkit-backdrop-filter: blur(16px) saturate(170%); backdrop-filter: blur(16px) saturate(170%); }
.message-option-label, .message-category-dot { position: relative; z-index: 1; }
.message-center .message-primary :deep(.nx-glass-track-viewport),
.message-center .message-primary :deep(.nx-glass-indicator),
.message-center .message-filters :deep(.nx-glass-track-viewport),
.message-center .message-filters :deep(.nx-glass-indicator) { display: none; }
.message-center .message-primary :deep(.nx-glass-option) { min-height: 44px; height: 44px; padding: 0 10px; gap: 6px; border: 1px solid transparent; border-radius: 999px; color: var(--v5-ink-2); font-size: var(--ui-type-list-title); line-height: 20px; font-weight: 500; }
.message-center .message-primary :deep(.nx-glass-option--selected) { --v5-liquid-selection-shadow: inset 0 1px 0 var(--v5-border); color: var(--ui-lime-soft, var(--v5-brand)); font-weight: 600; background: linear-gradient(180deg, color-mix(in srgb, var(--v5-brand) 30%, transparent), color-mix(in srgb, var(--v5-brand) 10%, transparent)); border-color: color-mix(in srgb, var(--ui-lime-soft, var(--v5-brand)) 45%, transparent); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--message-selected-highlight) 55%, transparent), inset 0 -1px 2px color-mix(in srgb, var(--v5-brand) 25%, transparent); }
.message-center .message-filters { align-self: flex-start; width: fit-content; max-width: 100%; box-sizing: border-box; height: 44px; min-height: 44px; margin-block: 7px -5px; padding: 0; gap: 6px; border-radius: 0; background: transparent; }
.message-center .message-filters :deep(.nx-glass-option) { min-height: 44px; height: 44px; padding: 0 9px; gap: 4px; border: 0; border-radius: 999px; color: var(--v5-ink-3); font-size: 13.5px; line-height: normal; font-weight: 400; }
.message-center .message-filters :deep(.nx-glass-option--selected) { color: var(--v5-ink); font-weight: 600; background: transparent; }
.message-category-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--v5-brand); flex-shrink: 0; align-self: center; }
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .message-center .message-primary :deep(.nx-glass-option--selected), .message-center .message-filters :deep(.nx-glass-option--selected::before) { background: var(--v5-surface); backdrop-filter: none; -webkit-backdrop-filter: none; }
  .message-center .message-primary :deep(.nx-glass-option--selected) { background: var(--v5-brand-soft); }
}
</style>
