<!--
  LiveFeedCard — home "my compute activity / recent income" card (P-33).
  Activity: tasks running on the account's devices, then settled rows from the
  authenticated Home settlement ledger returned by Java. Income: the latest
  income bills from the same ledger as the bills page. High-fidelity Mock data
  remains isolated in the 5174 prototype repo.
-->
<template>
  <view class="nx-home-live-feed" data-home-section="live-feed" data-feed-mode="CANONICAL">
    <view class="nx-home-feed-heading">
      <view class="nx-home-feed-identity">
        <view class="nx-home-feed-mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-7 4 14 3-7h4" /></svg>
        </view>
        <text class="nx-home-feed-title">{{ tab === 'activity' ? t.home.liveFeedTitleActivity : t.home.liveFeedTitleEarnings }}</text>
      </view>
      <GlassSegments
        v-model="tab"
        class="nx-home-feed-tabs"
        :class="{ 'nx-home-feed-tabs--vi': localeStore.code === 'vi' }"
        :options="feedTabOptions"
        :label="`${t.home.liveFeedTabActivity} / ${t.home.liveFeedTabEarnings}`"
        @keydown.up.stop.prevent="activateAdjacentTab(tab, -1)"
        @keydown.down.stop.prevent="activateAdjacentTab(tab, 1)"
      />
    </view>

    <!-- Activity tab -->
    <view v-show="tab === 'activity'" ref="activityPanel" id="home-live-feed-panel-activity" :style="tab === 'activity' ? heldPanelStyle : undefined" role="tabpanel" aria-labelledby="home-live-feed-tab-activity" :aria-hidden="tab !== 'activity'" :tabindex="tab === 'activity' ? 0 : -1">
      <HomeRunningTasks :limit="RUNNING_ROWS" @count="runningCount = $event" />
      <view
        v-for="r in visibleActivityRows"
        :key="r.k"
        data-home-live-activity-row="true"
        class="nx-feed-row"
        :class="{ 'nx-home-feed-row--entering': r.k === enteringId }"
      >
        <view class="nx-feed-icon nx-feed-icon--done" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </view>
        <view class="nx-feed-copy">
          <text class="nx-feed-title">{{ r.model }}</text>
          <view class="nx-feed-sub nx-feed-sub--split"><text class="nx-feed-sub__lead">{{ r.client }}</text><text aria-hidden="true">·</text><text data-home-live-time="true" class="nx-feed-sub__time">{{ r.ts }}</text></view>
        </view>
        <text class="nx-feed-amount nx-feed-amount--earned font-mono-tabular">{{ r.val }}</text>
      </view>
      <view v-if="displayActivityRows.length === 0 && runningCount === 0" class="nx-feed-state">
        <text>{{ remoteFeedStatusText }}</text>
        <text v-if="app.homeTruthStatus === 'error'" class="nx-feed-retry" role="button" tabindex="0" @click="retryHome" @keydown.enter.stop.prevent="retryHome" @keydown.space.stop.prevent="retryHome">{{ t.ui.retry }}</text>
      </view>
    </view>

    <!-- Earnings tab -->
    <view v-show="tab === 'earnings'" ref="earningsPanel" id="home-live-feed-panel-earnings" :style="tab === 'earnings' ? heldPanelStyle : undefined" role="tabpanel" aria-labelledby="home-live-feed-tab-earnings" :aria-hidden="tab !== 'earnings'" :tabindex="tab === 'earnings' ? 0 : -1">
      <HomeIncomeList :active="tab === 'earnings'" />
    </view>

    <view class="nx-home-feed-footer">
      <view class="nx-home-feed-more" role="link" tabindex="0" @click.stop="goAll" @keydown.enter.stop.prevent="goAll">
        <text>{{ t.home.liveFeedSeeAll }}</text>
        <text aria-hidden="true">›</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { formatUsd } from "@/lib/usd-display";
import { navTo } from "@/lib/route";
import { computed, nextTick, onUnmounted, ref, watch, type CSSProperties } from "vue";
import GlassSegments from "@/components/glass-segments.vue";
import HomeRunningTasks from "./home-running-tasks.vue";
import HomeIncomeList from "./home-income-list.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { useApp } from "@/store/app";
import { useDataVisibility } from "@/store/data-visibility";
import { useIntroMotion } from "@/composables/use-intro-motion";
import { useVisibleInterval } from "@/composables/use-tab-page-lifecycle";
import { buildCanonicalHomeFeed, formatHomeFeedTime } from "./home-live-feed";
import { parseServerTimestamp } from "@/api/server-time";
import type { AppHomeEarningsLedgerRow } from "@/api/app-home-api";

interface FeedRow {
  k: number | string;
  model: string;
  client: string;
  val: string;
  ts: string;
}

const t = useT();
const app = useApp();
const visibility = useDataVisibility();
const localeStore = useLocaleStore();
const tab = ref<"activity" | "earnings">("activity");

const FEED_ROWS = 6;
// The card shows five rows: up to two running tasks, then settled rows. Rows share one height so a
// task that moves from running to settled leaves the card the same size.
const CARD_ROWS = 5;
const RUNNING_ROWS = 2;
const runningCount = ref(0);
// New settlements arrive in batches with each ledger refresh. Hold them and
// reveal one at a time at the original ticker pace, each sliding in at the top
// and pushing the bottom row out. The server returns only its newest rows, so
// the rows already on screen stay until the new ones replace them. The first
// snapshot (or a different account's) and reduced motion show everything at
// once. Only real ledger rows are shown.
const REVEAL_INTERVAL_MS = 3200;
const motionAllowed = useIntroMotion();
const shownEntries = ref<AppHomeEarningsLedgerRow[]>([]);
const heldEntries = ref<AppHomeEarningsLedgerRow[]>([]); // newest first
const enteringId = ref<string | null>(null);
let revealCap = FEED_ROWS;
const canonicalFeed = computed(() => buildCanonicalHomeFeed(shownEntries.value, FEED_ROWS));
// The bottom row leaves at once while the new top row opens from zero height. Hold the panel at
// its height for the opening so nothing below it (or a page scrolled to the end) jumps.
const activityPanel = ref<unknown>(null);
const earningsPanel = ref<unknown>(null);
const heldHeight = ref<number | null>(null);
const heldPanelStyle = computed<CSSProperties | undefined>(() => heldHeight.value === null ? undefined
  : { height: `${heldHeight.value}px`, boxSizing: "border-box", overflow: "hidden" });
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
function holdPanelHeight() {
  const raw = tab.value === "activity" ? activityPanel.value : earningsPanel.value;
  const el = (raw as { $el?: unknown } | null)?.$el ?? raw;
  if (typeof HTMLElement === "undefined" || !(el instanceof HTMLElement)) return;
  heldHeight.value = el.getBoundingClientRect().height;
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => { heldHeight.value = null; }, 650);
}
onUnmounted(() => clearTimeout(releaseTimer));
function revealNext() {
  const next = heldEntries.value.at(-1);
  if (next === undefined) return;
  if (motionAllowed.value && shownEntries.value.length >= revealCap) holdPanelHeight();
  heldEntries.value = heldEntries.value.slice(0, -1);
  shownEntries.value = [next, ...shownEntries.value].slice(0, revealCap);
  enteringId.value = next.id;
}
useVisibleInterval(revealNext, REVEAL_INTERVAL_MS);
watch(() => app.homeTruth?.earningsLedger ?? [], (ledger) => {
  if (ledger.length === 0) return;
  const ordered = ledger.slice().sort((left, right) =>
    (parseServerTimestamp(right.completedAt) ?? 0) - (parseServerTimestamp(left.completedAt) ?? 0));
  const known = new Set([...shownEntries.value, ...heldEntries.value].map((entry) => entry.id));
  const fresh = ordered.filter((entry) => !known.has(entry.id));
  if (fresh.length === ordered.length || !motionAllowed.value || (fresh.length === 0 && heldEntries.value.length === 0)) {
    heldEntries.value = [];
    shownEntries.value = ordered.slice(0, FEED_ROWS);
    return;
  }
  revealCap = Math.min(FEED_ROWS, Math.max(ordered.length, shownEntries.value.length));
  const current = new Set(ordered.map((entry) => entry.id));
  heldEntries.value = [...fresh, ...heldEntries.value.filter((entry) => current.has(entry.id))];
}, { immediate: true });

const tabOrder = ["activity", "earnings"] as const;
const feedTabOptions = computed(() => [
  { value: "activity", label: t.value.home.liveFeedTabActivity, id: "home-live-feed-tab-activity", ariaControls: "home-live-feed-panel-activity" },
  { value: "earnings", label: t.value.home.liveFeedTabEarnings, id: "home-live-feed-tab-earnings", ariaControls: "home-live-feed-panel-earnings" },
]);

const displayActivityRows = computed<FeedRow[]>(() => {
  return canonicalFeed.value.activityRows.map((row) => ({
    k: row.id,
    model: row.model,
    client: row.client,
    val: visibility.mask(formatUsd(row.rewardUsdt, 'detail', true)),
    ts: formatHomeFeedTime(row.completedAt, localeStore.code),
  }));
});
const visibleActivityRows = computed(() => displayActivityRows.value.slice(0, Math.max(0, CARD_ROWS - runningCount.value)));
const remoteFeedStatusText = computed(() => {
  if (app.homeTruthStatus === "loading" || app.homeTruthStatus === "idle") return t.value.home.networkStatUpdating;
  if (app.homeTruthStatus === "error") return t.value.uiChrome.unavailable;
  return t.value.home.liveFeedEmpty;
});

function activateAdjacentTab(current: "activity" | "earnings", offset: -1 | 1) {
  const currentIndex = tabOrder.indexOf(current);
  const nextIndex = (currentIndex + offset + tabOrder.length) % tabOrder.length;
  activateTabFromKeyboard(tabOrder[nextIndex]);
}
function activateTabFromKeyboard(nextTab: "activity" | "earnings") {
  tab.value = nextTab;
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.getElementById(`home-live-feed-tab-${nextTab}`)?.focus();
  });
}
function retryHome() {
  void app.refreshHomeTruth();
}
// Activity opens every task receipt; income opens the bills page filtered to income.
function goAll() {
  navTo(tab.value === "activity" ? "/pages/me/receipts" : "/pages/me/wallet-bills?filter=in");
}
</script>

<style scoped>
.nx-home-live-feed { padding: var(--ui-space-inline) 16px 4px; border: 1px solid var(--v5-border); border-radius: var(--ui-radius-surface); background: var(--v5-surface); color: var(--v5-ink); }
.nx-home-feed-heading { display:flex;align-items:center;justify-content:space-between;gap:var(--ui-space-inline);min-height:44px; }
.nx-home-feed-identity { display:flex;align-items:center;gap:10px;min-width:0; }
.nx-home-feed-mark { display:flex;align-items:center;justify-content:center;flex:none;width:30px;height:30px;border-radius:50%;background:color-mix(in srgb,var(--v5-brand) 10%,transparent);color:var(--v5-brand); }
.nx-home-feed-title { font:var(--ui-type-subheading-weight) var(--ui-type-subheading)/var(--ui-type-subheading-lh) var(--font-v5);overflow-wrap:anywhere; }
.nx-home-feed-tabs { flex:0 0 90px;width:90px;height:26px;min-width:0;padding:2px;gap:1px; }
.nx-home-feed-tabs :deep(.nx-glass-option) { min-height:22px;padding:0; }
.nx-home-feed-tabs :deep(.nx-glass-option::after) { content:"";position:absolute;inset:-11px 0; }
.nx-home-feed-tabs :deep(.nx-glass-option__label) { font-size:10px;font-weight:600;line-height:12px;white-space:nowrap; }
.nx-home-feed-tabs--vi :deep(.nx-glass-option__label) { font-size:9px;letter-spacing:-.4px; }
/* Feed rows (also rendered by the running-task and income children). One height for every row. */
.nx-home-live-feed :deep(.nx-feed-row) { position:relative;display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;column-gap:var(--ui-space-inline);box-sizing:border-box;min-height:63px;padding:var(--ui-space-inline) 0; }
/* Every row (and the empty state) carries its own top divider, so the first row is no taller than the rest. */
.nx-home-live-feed :deep(.nx-feed-row), .nx-home-live-feed :deep(.nx-feed-state) { border-top:1px solid var(--v5-border); }
/* A running row sits higher so its progress bar keeps clear of the divider below. */
.nx-home-live-feed :deep(.nx-feed-row--running) { padding:var(--v5-space-2) 0 var(--ui-space-inset); }
.nx-home-live-feed :deep(.nx-feed-icon) { display:grid;place-items:center;width:32px;height:32px;border-radius:10px; }
.nx-home-live-feed :deep(.nx-feed-icon--done) { background:color-mix(in srgb,var(--v5-success) 16%,transparent);color:var(--v5-success); }
.nx-home-live-feed :deep(.nx-feed-icon--running) { background:color-mix(in srgb,var(--ui-device-ink) 16%,transparent);color:var(--ui-device-ink); }
.nx-home-live-feed :deep(.nx-feed-copy) { display:flex;flex-direction:column;min-width:0; }
.nx-home-live-feed :deep(.nx-feed-title-row) { display:flex;align-items:center;gap:var(--v5-space-2);min-width:0; }
.nx-home-live-feed :deep(.nx-feed-title) { overflow:hidden;font:var(--ui-type-message-title-weight) var(--ui-type-message-title)/var(--ui-type-message-title-lh) var(--font-v5);white-space:nowrap;text-overflow:ellipsis; }
.nx-home-live-feed :deep(.nx-feed-sub) { overflow:hidden;font:var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5);color:var(--v5-ink-3);white-space:nowrap;text-overflow:ellipsis; }
.nx-home-live-feed :deep(.nx-feed-sub--split) { display:flex;gap:var(--v5-space-1); }
.nx-home-live-feed :deep(.nx-feed-sub__lead) { overflow:hidden;min-width:0;text-overflow:ellipsis;white-space:nowrap; }
.nx-home-live-feed :deep(.nx-feed-sub__time) { flex:none; }
.nx-home-live-feed :deep(.nx-feed-amount) { display:flex;align-items:baseline;gap:9px;font:500 14px/20px var(--font-metric);white-space:nowrap; }
.nx-home-live-feed :deep(.nx-feed-amount--earned), .nx-home-live-feed :deep(.nx-feed-list .nx-feed-amount) { color:var(--v5-success-ink); }
.nx-home-live-feed :deep(.nx-feed-unit) { font:500 12px/16px var(--font-metric);color:var(--v5-ink-3); }
.nx-home-live-feed :deep(.nx-feed-figure) { display:flex;flex-direction:column;align-items:flex-end; }
.nx-home-live-feed :deep(.nx-feed-pct) { font:500 14px/20px var(--font-metric);color:var(--ui-device-ink); }
.nx-home-live-feed :deep(.nx-feed-est) { font:400 12px/18px var(--font-metric);color:var(--v5-ink-3);white-space:nowrap; }
.nx-home-live-feed :deep(.nx-feed-progress) { position:absolute;left:0;right:0;bottom:var(--v5-space-2);height:4px;overflow:hidden;border-radius:999px;background:var(--v5-surface-3); }
.nx-home-live-feed :deep(.nx-feed-progress__fill) { height:100%;border-radius:inherit;background:var(--ui-device-ink);transition:width 1s linear; }
.nx-home-live-feed :deep(.nx-feed-state) { display:flex;align-items:center;justify-content:space-between;gap:var(--ui-space-inline);min-height:64px;font:var(--ui-type-note-weight) var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5);color:var(--v5-ink-3); }
.nx-home-live-feed :deep(.nx-feed-retry) { display:inline-flex;align-items:center;min-height:44px;padding:0 12px;font:500 13px/18px var(--font-v5);color:var(--v5-brand); }
.nx-home-feed-footer { display:flex;justify-content:flex-end; }
.nx-home-feed-more { display:inline-flex;align-items:center;gap:var(--v5-space-1);min-height:44px;font:500 13px/18px var(--font-v5);color:var(--v5-ink-3); }
/* A newly settled row opens from zero height at the top, pushing older rows down. */
.nx-home-feed-row--entering { overflow: hidden; animation: nx-home-feed-row-in .6s cubic-bezier(.2,.8,.2,1); }
@keyframes nx-home-feed-row-in {
  from { max-height: 0; min-height: 0; padding-top: 0; padding-bottom: 0; opacity: 0; background-color: var(--v5-brand-soft); }
  60% { opacity: 1; }
  to { max-height: 80px; opacity: 1; background-color: transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .nx-home-feed-row--entering { animation: none; }
  .nx-home-live-feed :deep(.nx-feed-progress__fill) { transition: none; }
}
</style>
