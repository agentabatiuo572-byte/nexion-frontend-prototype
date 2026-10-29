<!--
  LiveFeedCard — ZONE 1 dual-tab live ticker (ported from mission-control.tsx
  LiveFeedCard). The formal App keeps the same dual-tab layout while projecting
  both views exclusively from the authenticated Home settlement ledger returned
  by Java. High-fidelity Mock data remains isolated in the 5174 prototype repo.
-->
<template>
  <view class="nx-home-live-feed" data-home-section="live-feed" data-feed-mode="CANONICAL">
    <!-- Compact switcher aligned to the card's right edge. -->
    <view class="nx-home-feed-heading px-0.5 pt-1 pb-2.5 flex items-center justify-between">
      <view class="nx-home-feed-mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-7 4 14 3-7h4" /></svg>
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
    <view v-show="tab === 'activity'" id="home-live-feed-panel-activity" class="font-mono-tabular" style="padding: 0 2px 6px; font-size: 12px" role="tabpanel" aria-labelledby="home-live-feed-tab-activity" :aria-hidden="tab !== 'activity'" :tabindex="tab === 'activity' ? 0 : -1">
      <view
        v-for="(r, i) in displayActivityRows"
        :key="r.k"
        data-home-live-activity-row="true"
        class="grid items-center gap-2.5 py-2"
        :class="{ 'nx-home-feed-row--entering': r.k === enteringId }"
        :style="{ gridTemplateColumns: whoColTemplate, minHeight: '56px', rowGap: '4px', borderBottom: i < displayActivityRows.length - 1 ? '1px solid var(--v5-border)' : 'none' }"
      >
        <text data-home-live-time="true" class="tabular-nums" style="grid-column: 1 / -1; min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 18px; font-size: 12px; color: var(--v5-ink-2)">{{ r.ts }}</text>
        <text class="text-center" :style="whoBadgeStyle(r)">{{ whoLabel(r.who) }}</text>
        <!-- 《02》§4 判定线:动态流是「浏览型」内容且设计上单行截断,归 caption 12
             (原 12.5→13 迁移使截断加剧,溢出探针实测 +6px,数据驱动回到 12) -->
        <text class="truncate" style="font-family: var(--font-v5); font-weight: 400; font-size: 12px; line-height: 16px; color: var(--v5-ink-2)">{{ r.msg }}</text>
        <text class="tabular-nums text-right" style="font-weight: 500" :style="{ color: valColor(r) }">{{ r.val === 'locked' ? t.home.feedValLocked : r.val }}</text>
      </view>
      <view v-if="displayActivityRows.length === 0" class="flex items-center justify-between px-1 py-3" style="gap: 12px">
        <text style="font-size: 12px; color: var(--v5-ink-3)">{{ remoteFeedStatusText }}</text>
        <text v-if="app.homeTruthStatus === 'error'" class="active:opacity-70" role="button" tabindex="0" style="display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; font: 600 13px/20px var(--font-v5); color: var(--v5-brand)" @click="retryHome"  @keydown.enter.stop.prevent="retryHome" @keydown.space.stop.prevent="retryHome">{{ t.ui.retry }}</text>
      </view>
    </view>

    <!-- Earnings tab -->
    <view v-show="tab === 'earnings'" id="home-live-feed-panel-earnings" role="tabpanel" aria-labelledby="home-live-feed-tab-earnings" :aria-hidden="tab !== 'earnings'" :tabindex="tab === 'earnings' && displayEarningsItems.length === 0 ? 0 : -1">
      <view v-if="displayEarningsItems.length > 0" class="block active:opacity-90 transition-opacity" role="link" tabindex="0" @click="goEarnings" @keydown.enter.stop.prevent="goEarnings">
        <view
          v-for="(it, i) in displayEarningsItems"
          :key="it.id"
          data-home-live-earnings-row="true"
          class="px-0.5 py-2 grid items-center gap-2"
          :class="{ 'nx-home-feed-row--entering': it.id === enteringId }"
          :style="{ gridTemplateColumns: '5px auto minmax(0, 1fr) auto', minHeight: '56px', rowGap: '4px', fontSize: '12px', borderBottom: i < displayEarningsItems.length - 1 ? '1px solid var(--v5-border)' : 'none' }"
        >
          <text data-home-live-earnings-time="true" class="tabular-nums" style="grid-column: 1 / -1; min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 18px; color: var(--v5-ink-2)">{{ it.ts }}</text>
          <view style="width: 5px; height: 5px; border-radius: 50%; background: var(--v5-success); flex-shrink: 0" />
          <text style="font-family: var(--font-v5); font-weight: 600; color: var(--v5-ink)">{{ it.name }}</text>
          <text class="truncate flex-1" style="color: var(--v5-ink-3)">{{ it.product }}</text>
          <text class="font-mono-tabular tabular-nums whitespace-nowrap" style="color: var(--v5-success-ink); font-weight: 500">{{ earningsAmount(it) }}</text>
        </view>
      </view>
      <view v-else class="flex items-center justify-between px-1 py-3" style="gap: 12px">
        <text style="font-size: 12px; color: var(--v5-ink-3)">{{ remoteFeedStatusText }}</text>
        <text v-if="app.homeTruthStatus === 'error'" class="active:opacity-70" role="button" tabindex="0" style="display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; font: 600 13px/20px var(--font-v5); color: var(--v5-brand)" @click="retryHome"  @keydown.enter.stop.prevent="retryHome" @keydown.space.stop.prevent="retryHome">{{ t.ui.retry }}</text>
      </view>
    </view>
    <view v-if="tab === 'earnings'" class="nx-home-feed-footer flex justify-end px-0.5">
      <view class="inline-flex items-center gap-1 font-mono-tabular active:opacity-70 transition-opacity" style="min-height: 44px; font-size: 12px; color: var(--v5-ink-3)" role="link" tabindex="0" @click.stop="goEarnings" @keydown.enter.stop.prevent="goEarnings">
        <text>{{ t.home.liveFeedSeeAll }}</text>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { formatUsd } from "@/lib/usd-display";
import { navTo } from "@/lib/route";
import { computed, nextTick, ref, watch, type CSSProperties } from "vue";
import GlassSegments from "@/components/glass-segments.vue";
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
  lvl: "ok" | "live" | "warn";
  who: string;
  msg: string;
  val: string;
  ts: string;
}
interface EarningsItem {
  id: string;
  name: string;
  product: string;
  amount: number;
  ts: string;
}

const t = useT();
const app = useApp();
const visibility = useDataVisibility();
const tab = ref<"activity" | "earnings">("activity");

const FEED_ROWS = 6;
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
function revealNext() {
  const next = heldEntries.value.at(-1);
  if (next === undefined) return;
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
    lvl: "ok",
    who: "You",
    msg: `${row.model} @ ${row.client}`,
    val: visibility.mask(formatUsd(row.rewardUsdt, 'detail', true)),
    ts: formatHomeFeedTime(row.completedAt, localeStore.code),
  }));
});
const displayEarningsItems = computed<EarningsItem[]>(() => {
  return canonicalFeed.value.earningsItems.map((row) => ({
    id: row.id,
    name: row.model,
    product: row.client,
    amount: row.amountUsdt,
    ts: formatHomeFeedTime(row.completedAt, localeStore.code),
  }));
});
const remoteFeedStatusText = computed(() => {
  if (app.homeTruthStatus === "loading" || app.homeTruthStatus === "idle") return t.value.home.networkStatUpdating;
  if (app.homeTruthStatus === "error") return t.value.uiChrome.unavailable;
  return tab.value === "activity" ? t.value.home.liveFeedEmpty : t.value.home.ledgerEmpty;
});

// 身份徽章列宽按语言取值(包 G P2#2 选项 a):en「Peer」/zh「同伴」进 38px,
// vi「Thành viên」实测 ~62px,固定 38px 溢出 5px+;列宽仍是常量 → 跨行对齐不破。
const localeStore = useLocaleStore();
const whoColTemplate = computed(() => `${localeStore.code === "vi" ? "66px" : "38px"} minmax(0, 1fr) auto`);

function whoBadgeStyle(r: FeedRow): CSSProperties {
  const bg = r.lvl === "ok" ? "var(--v5-success-soft)" : r.lvl === "live" ? "var(--v5-tech-cyan-soft)" : "var(--v5-warning-soft)";
  const color = r.lvl === "ok" ? "var(--v5-success)" : r.lvl === "live" ? "var(--v5-tech-cyan)" : "var(--v5-warning)";
  return { fontSize: "12px", fontWeight: 500, padding: "1px 5px", borderRadius: "3px", letterSpacing: "0.04em", background: bg, color };
}
function valColor(r: FeedRow): string {
  return r.val === "locked" ? "var(--v5-ink-4)" : r.who === "You" ? "var(--v5-ink-3)" : "var(--v5-success)";
}
function whoLabel(who: string): string { return who === "You" ? t.value.home.feedWhoYou : who === "Peer" ? t.value.home.feedWhoPeer : who === "Lock" ? t.value.home.feedWhoLock : who; }
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
function earningsAmount(it: EarningsItem): string {
  return visibility.mask(formatUsd(it.amount, 'detail', true));
}
function retryHome() {
  void app.refreshHomeTruth();
}
function goEarnings() {
  navTo("/pages/me/wallet-bills");
}


</script>

<style scoped>
.nx-home-live-feed { padding: 12px 16px 6px; border-radius: var(--ui-radius-surface); background: var(--v5-surface); }
.nx-home-feed-heading { min-height:44px; }
/* A newly settled row opens from zero height at the top, pushing older rows down. */
.nx-home-feed-row--entering { overflow: hidden; animation: nx-home-feed-row-in .6s cubic-bezier(.2,.8,.2,1); }
@keyframes nx-home-feed-row-in {
  from { max-height: 0; min-height: 0; padding-top: 0; padding-bottom: 0; opacity: 0; background-color: var(--v5-brand-soft); }
  60% { opacity: 1; }
  to { max-height: 80px; opacity: 1; background-color: transparent; }
}
@media (prefers-reduced-motion: reduce) { .nx-home-feed-row--entering { animation: none; } }
.nx-home-feed-mark { display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:color-mix(in srgb,var(--v5-brand) 10%,transparent);color:var(--v5-brand); }
.nx-home-feed-tabs { flex:0 0 90px;width:90px;height:26px;min-width:0;padding:2px;gap:1px; }
.nx-home-feed-tabs :deep(.nx-glass-option) { min-height:22px;padding:0; }
.nx-home-feed-tabs :deep(.nx-glass-option::after) { content:"";position:absolute;inset:-11px 0; }
.nx-home-feed-tabs :deep(.nx-glass-option__label) { font-size:10px;font-weight:600;line-height:12px;white-space:nowrap; }
.nx-home-feed-tabs--vi :deep(.nx-glass-option__label) { font-size:9px;letter-spacing:-.4px; }
</style>
