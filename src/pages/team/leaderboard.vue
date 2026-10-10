<!--
  Global Leaderboard — ported from
  Nexion-prototype/app/(main)/team/leaderboard/page.tsx.
  Prize-pool hero (de-carded, period-specific) + period segmented tabs
  (today/week/month/all) + my-rank transparent stat row (rank + gap-to-next +
  share CTA) + podium (#2/#1/#3 filled columns, #1 raised) + reward rows +
  rest list (transparent hairline group, #4-#100) + share CTA + footer note.
  Sub-page → <AppChassis active="team"> w/ back → /team. SegmentedControl →
  inline pill tabs (events.vue pattern). LEADERBOARD mock ported to src/mock.
  React local/memo state → ref/computed. <Link>→<view @click>. lucide → inline <svg>.

  Rest list is paginated (20/page, explicit "View more" click) instead of
  rendering all 100 rows at once — deliberately NOT scroll-auto-loaded via
  IntersectionObserver: that version misfired on wide/tall viewports (loads
  race ahead of the browser's real intersection check, see PORT-PITFALLS).
  Share CTA is position:sticky (not fixed — that escapes the H5 device-bezel
  preview, see sticky-cta-bar.vue) so it's visible without scrolling to the
  page end.
-->
<template>
  <AppChassis active="team">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.leaderboard.pageTitle" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <view v-if="remoteApiEnabled && remoteState !== 'ready'" class="text-center" style="padding: 48px 20px">
          <text class="block" :style="{ color: 'var(--v5-ink-2)', fontSize: '13px' }">{{ remoteState === 'loading' ? t.leaderboard.loading : t.leaderboard.loadError }}</text>
          <view v-if="remoteState === 'error'" class="inline-flex items-center justify-center active:opacity-70" style="margin-top: 14px; min-height: 44px; padding: 0 18px; border-radius: 999px; background: var(--v5-brand)" role="button" tabindex="0" @click="loadRemote()"  @keydown.enter.prevent="loadRemote()" @keydown.space.prevent="loadRemote()">
            <text :style="{ color: 'var(--v5-on-brand)', fontSize: '13px', fontWeight: 600 }">{{ t.leaderboard.retry }}</text>
          </view>
        </view>
        <!-- Prize pool hero — de-carded: big number sits directly on the page
             floor. No floor glow (owner call 2026-07-08: page-floor auras get
             deleted, not tuned — clip-edge class of bugs removed at the root). -->
        <view v-if="!remoteApiEnabled || remoteState === 'ready'" :style="heroStyle">
          <view class="flex items-start justify-between">
            <view>
              <text class="block font-mono-tabular" :style="heroCapStyle('var(--v5-warning)')">{{ t.leaderboard.pool.label }} · {{ t.leaderboard.periods[period] }}</text>
              <text class="block font-display tabular-nums" :style="heroBigStyle">{{ snapshotAvailable ? fmtCompactUSD(prize.poolUSD) : '—' }}</text>
              <text v-if="!paused && prize.poolUSD > 0" class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '6px' }">{{ payoutToText }}</text>
            </view>
            <view class="rounded-2xl grid place-items-center" :style="heroIconStyle">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></svg>
            </view>
          </view>
          <view class="flex items-center justify-between" :style="heroFooterStyle">
            <text :style="{ color: 'var(--v5-ink-3)' }">{{ t.leaderboard.pool.resetsIn }}</text>
            <text class="font-mono-tabular" :style="{ color: 'var(--v5-ink-2)' }">{{ resetsInText }}</text>
          </view>
        </view>

        <!-- Period tabs -->
        <GlassSegments class="nx-leader-periods" :label="t.leaderboard.pageTitle" :model-value="period" @select="selectPeriod" :options="periodOptions" />
        <template v-if="!remoteApiEnabled || remoteState === 'ready'">

        <view v-if="paused" role="status" aria-live="polite" class="text-center" style="padding: 32px 20px">
          <text class="block" :style="{ color: 'var(--v5-ink)', fontSize: '15px', fontWeight: 600 }">{{ t.leaderboard.pausedTitle }}</text>
          <text class="block" :style="{ color: 'var(--v5-ink-2)', fontSize: '13px', marginTop: '10px' }">{{ t.leaderboard.pausedBody }}</text>
          <text class="block" :style="{ color: 'var(--v5-ink-2)', fontSize: '12px', marginTop: '10px' }">{{ snapshotAvailable ? `${t.leaderboard.frozenAt} · ${pauseCapturedAt}` : t.leaderboard.snapshotUnavailable }}</text>
          <view class="inline-flex items-center justify-center active:opacity-70" style="margin-top: 14px; min-height: 44px; padding: 0 18px; border-radius: 999px; background: var(--v5-brand)" role="button" tabindex="0" @click="loadRemote()" @keydown.enter.prevent="loadRemote()" @keydown.space.prevent="loadRemote()">
            <text :style="{ color: 'var(--v5-on-brand)', fontSize: '13px', fontWeight: 600 }">{{ t.leaderboard.retry }}</text>
          </view>
        </view>
        <template v-else>

        <!-- My rank — transparent stat row on the page floor (was a second
             glowing hero stacked right under the prize hero). -->
        <view :style="myRankStyle">
          <view class="flex items-center justify-between" style="flex-wrap: wrap; gap: 12px">
            <view style="flex: 1 1 200px; min-width: 0">
              <text class="block font-mono-tabular" :style="heroCapStyle('var(--v5-brand-2)')">{{ t.leaderboard.myRank.label }}</text>
              <view class="flex items-baseline" style="margin-top: 4px; gap: 6px">
                <text class="font-display tabular-nums" :style="myRankBigStyle">#{{ myRankDisplay }}</text>
                <text :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">/ {{ totalRows.toLocaleString() }}+</text>
              </view>
              <view class="flex items-center" style="margin-top: 8px; gap: 6px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
                <text :style="{ fontSize: '12px', color: 'var(--v5-warning)' }">{{ gapText }}</text>
              </view>
            </view>
            <view class="flex items-center active:scale-[0.97]" :style="climbCtaStyle" role="button" tabindex="0" @click="go('/pages/team/team')"  @keydown.enter.prevent="go('/pages/team/team')" @keydown.space.prevent="go('/pages/team/team')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /><line x1="15.41" x2="8.59" y1="6.51" y2="10.49" /></svg>
              <text :style="{ color: 'var(--v5-on-brand)' }">{{ t.leaderboard.myRank.climb }}</text>
            </view>
          </view>
        </view>

        <!-- Podium (Top 3) — outer card shell dropped; the three filled
             columns sit directly on the page (single visual difference). -->
        <view :style="podiumCardStyle">
          <view class="grid grid-cols-3" style="gap: 8px; align-items: flex-end">
            <view v-for="(p, displayIdx) in podiumDisplay" :key="p.row.rank" class="rounded-xl text-center" :style="podiumColStyle(p.isFirst)">
              <text class="block" style="font-size: 26px; line-height: 1">{{ p.prize.medal }}</text>
              <view class="rounded-full grid place-items-center" :style="podiumAvatarStyle(p.prize.color)">
                <text :style="{ color: 'var(--v5-ink)', fontFamily: 'var(--font-v5)', fontWeight: 600, fontSize: '13px' }">{{ p.row.handle.charAt(0) }}</text>
              </view>
              <text class="block truncate" :style="podiumHandleStyle">{{ p.row.handle }}</text>
              <text class="block" :style="{ fontSize: '12px' }">{{ p.row.flag }}</text>
              <text class="block font-mono-tabular tabular-nums" :style="podiumEarnStyle(p.prize.color)">{{ fmtCompactUSD(p.row.earnedUSDT) }}</text>
              <text class="block" :style="{ marginTop: '2px', fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ fmt(t.leaderboard.chips.directs, { n: p.row.directs }) }}</text>
            </view>
          </view>
        </view>

        <!-- Rest list (#4-#100) — de-carded: transparent hairline group
             (earnings-ledger idiom), the header row doubles as the opener. -->
        <view :style="listCardStyle">
          <view class="grid items-center" :style="listHeadStyle">
            <text>{{ t.leaderboard.columns.rank }}</text>
            <text>{{ t.leaderboard.columns.inviter }}</text>
            <text class="text-right">{{ t.leaderboard.columns.directs }}</text>
            <text class="text-right">{{ t.leaderboard.columns.earned }}</text>
          </view>
          <view
            v-for="(row, i) in visibleRest"
            :key="row.rank"
            class="grid items-center"
            :style="listRowStyle(i === visibleRest.length - 1)"
          >
            <text class="font-mono-tabular tabular-nums" :style="{ color: 'var(--v5-ink-3)', fontSize: '12px' }">{{ row.rank }}</text>
            <view class="flex items-center min-w-0" style="gap: 8px">
              <view class="rounded-full grid place-items-center shrink-0" :style="rowAvatarStyle">
                <text :style="{ color: 'var(--v5-ink)', fontFamily: 'var(--font-v5)', fontWeight: 600, fontSize: '12px' }">{{ row.handle.charAt(0) }}</text>
              </view>
              <view class="min-w-0">
                <view class="flex items-center" style="gap: 6px">
                  <text class="truncate" :style="{ fontWeight: 600, color: 'var(--v5-ink)', fontSize: '13px' }">{{ row.handle }}</text>
                  <text :style="{ fontSize: '12px' }">{{ row.flag }}</text>
                  <svg v-if="row.hasDevice" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><rect width="16" height="16" x="4" y="4" rx="2" /><rect width="6" height="6" x="9" y="9" rx="1" /><path d="M15 2v2" /><path d="M15 20v2" /><path d="M2 15h2" /><path d="M2 9h2" /><path d="M20 15h2" /><path d="M20 9h2" /><path d="M9 2v2" /><path d="M9 20v2" /></svg>
                </view>
                <view class="flex items-center" style="margin-top: 2px; gap: 6px">
                  <text class="font-mono-tabular" :style="vRankChipStyle">V{{ row.vRank }}</text>
                  <text class="font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: 'var(--v5-ink-4)' }">{{ fmt(t.leaderboard.chips.teamSize, { n: row.teamSize.toLocaleString() }) }}</text>
                  <text v-if="row.delta !== 0" class="font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: row.delta > 0 ? 'var(--v5-brand)' : 'var(--v5-brand-2)' }">{{ row.delta > 0 ? "↑" : "↓" }}{{ Math.abs(row.delta) }}</text>
                </view>
              </view>
            </view>
            <text class="text-right font-mono-tabular tabular-nums" :style="{ color: 'var(--v5-ink-2)' }">{{ row.directs }}</text>
            <text class="text-right font-mono-tabular tabular-nums" :style="{ fontWeight: 600, color: 'var(--v5-brand)' }">{{ fmtCompactUSD(row.earnedUSDT) }}</text>
          </view>
        </view>
        <!-- View more — explicit user click, not scroll-auto: fully
             predictable regardless of viewport size (the scroll-triggered
             IntersectionObserver version misfired on wide desktop windows). -->
        <view v-if="hasMore" class="flex items-center justify-center active:opacity-70" :style="loadMoreBtnStyle" role="button" tabindex="0" :aria-disabled="remoteLoadingMore" @click="loadMore"  @keydown.enter.prevent="loadMore" @keydown.space.prevent="loadMore">
          <text :style="loadMoreLabelStyle">{{ remoteLoadMoreError ? t.leaderboard.loadError : t.leaderboard.cta.loadMore }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </view>

        <!-- Share CTA — sticky within the scroll viewport so it stays visible
             without scrolling to the page end, then settles into flow once the
             real bottom is reached. Bleeds edge-to-edge via negative margin to
             escape the px-4 parent; 26px bottom offset mirrors AppChassis's
             sub-route safe-area inset (SUB_BOTTOM) so it clears the home indicator. -->
        <view :style="shareStickyStyle">
          <view class="flex items-center justify-center active:scale-[0.98]" :style="shareCtaStyle" role="button" tabindex="0" @click="go('/pages/team/team')"  @keydown.enter.prevent="go('/pages/team/team')" @keydown.space.prevent="go('/pages/team/team')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /><line x1="15.41" x2="8.59" y1="6.51" y2="10.49" /></svg>
            <text :style="{ color: 'var(--v5-on-brand)' }">{{ t.leaderboard.cta.share }}</text>
          </view>
        </view>

        <!-- footer note -->
        <text class="block text-center" :style="footerNoteStyle">{{ period === 'all' ? t.leaderboard.noteAllTime : t.leaderboard.note }}</text>
        </template>
        </template>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, nextTick, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { LEADERBOARD, MY_RANK, PERIOD_PRIZE, type LeaderPeriod } from "@/mock/leaderboard";
import { remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { TeamLeaderboardSnapshot } from "@/api/team-insights-api";
import { asApiError } from "@/api/errors";
import { useApp } from "@/store/app";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision } from "@/api/order-api";

const t = useT();
const app = useApp();
const PERIODS: LeaderPeriod[] = ["today", "week", "month", "all"];
const period = ref<LeaderPeriod>("week");
const remoteSnapshot = ref<TeamLeaderboardSnapshot | null>(null);
const remoteState = ref<"loading" | "ready" | "error">(remoteApiEnabled ? "loading" : "ready");
const remoteLoadingMore = ref(false);
const remoteLoadMoreError = ref(false);
let remoteRequest = 0;
let mounted = true;
// One screen's worth per load — reduces initial render + (future) server load.
const PAGE_SIZE = 20;
const visibleCount = ref(PAGE_SIZE);
watch(period, () => { visibleCount.value = PAGE_SIZE; if (remoteApiEnabled) void loadRemote(1, false); });
watch(() => app.accountKey, () => {
  if (!remoteApiEnabled) return;
  remoteSnapshot.value = null;
  void loadRemote(1, false);
});

const rows = computed(() => remoteApiEnabled ? (remoteSnapshot.value?.period === period.value ? remoteSnapshot.value.rows : []) : LEADERBOARD[period.value]);
const paused = computed(() => remoteApiEnabled && remoteSnapshot.value?.period === period.value && remoteSnapshot.value.paused === true);
const snapshotAvailable = computed(() => !paused.value || (remoteSnapshot.value?.snapshotState === "FROZEN" && remoteSnapshot.value?.dataAvailable === true));
const pauseCapturedAt = computed(() => remoteSnapshot.value?.pauseCapturedAt ?? "");
const prize = computed(() => remoteApiEnabled ? { poolUSD: remoteSnapshot.value?.poolUsd ?? 0,
  topN: remoteSnapshot.value?.topN ?? 0, resetsIn: null as string | null, label: period.value }
  // Fixture rows can support layout preview, but client fixtures must never invent a cash pool.
  : { poolUSD: 0, topN: 0, resetsIn: PERIOD_PRIZE[period.value].resetsIn, label: period.value });
// Missing countdowns stay unknown without crowding the compact value slot.
const resetsInText = computed(() => {
  const value = prize.value.resetsIn;
  return value && value !== "—" ? value : t.value.leaderboard.pool.resetsUnavailable;
});
const me = computed(() => remoteApiEnabled ? { rank: remoteSnapshot.value?.myRank ?? null,
  gapToNext: remoteSnapshot.value?.gapToNext ?? 0 } : MY_RANK[period.value]);
const totalRows = computed(() => remoteApiEnabled ? remoteSnapshot.value?.totalRows ?? 0 : rows.value.length);
const myRankDisplay = computed(() => me.value.rank === null ? "—" : String(me.value.rank));
const top3 = computed(() => rows.value.slice(0, 3));
const rest = computed(() => rows.value.slice(3));
const visibleRest = computed(() => remoteApiEnabled ? rest.value : rest.value.slice(0, visibleCount.value));
const hasMore = computed(() => remoteApiEnabled
  ? rows.value.length < (remoteSnapshot.value?.totalRows ?? 0)
  : visibleCount.value < rest.value.length);

function loadMore() {
  if (remoteApiEnabled) {
    if (remoteLoadingMore.value || !hasMore.value || !remoteSnapshot.value) return;
    void loadRemote(remoteSnapshot.value.page + 1, true);
    return;
  }
  visibleCount.value = Math.min(rest.value.length, visibleCount.value + PAGE_SIZE);
}

async function loadRemote(page = 1, append = false) {
  const request = ++remoteRequest;
  const accountKey = app.accountKey;
  const accountScope = captureAccountScope();
  const runScope = captureRuntimeRevision();
  const requestedPeriod = period.value;
  remoteLoadMoreError.value = false;
  if (append) remoteLoadingMore.value = true;
  else {
    remoteState.value = "loading";
    remoteSnapshot.value = null;
  }
  const current = () => mounted && request === remoteRequest && accountKey === app.accountKey
    && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope)
    && requestedPeriod === period.value;
  try {
    const snapshot = await teamInsightsApi.leaderboard(requestedPeriod, page, PAGE_SIZE,
      append ? remoteSnapshot.value?.snapshotAt : null,
      append ? remoteSnapshot.value?.snapshotVersion : null);
    if (!current()) { if (request === remoteRequest && !append) { remoteSnapshot.value = null; remoteState.value = "error"; } return; }
    if (append) {
      const previous = remoteSnapshot.value;
      const expectedFirstRank = previous ? previous.rows.length + 1 : -1;
      if (!previous || previous.period !== requestedPeriod || snapshot.period !== requestedPeriod || snapshot.page !== page
        || snapshot.snapshotAt !== previous.snapshotAt
        || snapshot.snapshotVersion !== previous.snapshotVersion
        || snapshot.paused !== previous.paused || snapshot.snapshotState !== previous.snapshotState
        || snapshot.dataAvailable !== previous.dataAvailable
        || snapshot.pauseSnapshotId !== previous.pauseSnapshotId || snapshot.pauseCapturedAt !== previous.pauseCapturedAt
        || snapshot.pageSize !== PAGE_SIZE || snapshot.rows[0]?.rank !== expectedFirstRank) {
        throw new Error("TEAM_LEADERBOARD_PAGE_SEQUENCE_INVALID");
      }
      remoteSnapshot.value = { ...snapshot, rows: [...previous.rows, ...snapshot.rows] };
    } else {
      remoteSnapshot.value = snapshot;
    }
    remoteState.value = "ready";
  } catch (error) {
    if (!current()) { if (request === remoteRequest && !append) { remoteSnapshot.value = null; remoteState.value = "error"; } return; }
    const apiError = asApiError(error);
    if (append && apiError.message === "TEAM_LEADERBOARD_SNAPSHOT_STALE") {
      // The server deliberately refuses a continuation after its five-minute
      // frozen candidate snapshot expires; restart from page one rather than
      // retrying a token that can never become valid again.
      void loadRemote(1, false);
    } else if (append) remoteLoadMoreError.value = true;
    else {
      remoteSnapshot.value = null;
      remoteState.value = "error";
    }
  } finally {
    if (request === remoteRequest) remoteLoadingMore.value = false;
    // 键盘切换周期后把焦点还给当前选中格(见 movePeriod 注释)。
    if (pendingPeriodFocus && request === remoteRequest) {
      pendingPeriodFocus = false;
      void nextTick(focusActivePeriodTab);
    }
  }
}

onShow(() => { if (remoteApiEnabled) void loadRemote(1, false); });
onUnmounted(() => { mounted = false; remoteRequest += 1; remoteSnapshot.value = null; });

// Podium display order: #2 (left) / #1 (center, raised) / #3 (right)
const podiumDisplay = computed(() => {
  const order = [top3.value[1], top3.value[0], top3.value[2]];
  return order
    .map((row, idx) => {
      if (!row) return null;
      const actualIdx = idx === 0 ? 1 : idx === 1 ? 0 : 2;
      return { row, prize: podiumVisuals[actualIdx], isFirst: actualIdx === 0 };
    })
    .filter((x): x is { row: (typeof rows.value)[number]; prize: (typeof podiumVisuals)[number]; isFirst: boolean } => x !== null);
});

// Visual rank markers only. Reward amounts and prize names are never inferred on the client.
const podiumVisuals = [
  { medal: "🥇", color: "var(--v5-warning-soft)" },
  { medal: "🥈", color: "var(--v5-surface-2)" },
  { medal: "🥉", color: "var(--v5-brand-soft)" },
] as const;

const payoutToText = computed(() => fmt(t.value.leaderboard.pool.payoutTo, { n: prize.value.topN }));
const gapText = computed(() => me.value.rank === null
  ? t.value.leaderboard.myRank.notRanked
  : me.value.rank === 1 ? t.value.leaderboard.myRank.first
    : fmt(t.value.leaderboard.myRank.gap, { amount: me.value.gapToNext.toLocaleString() }));

function fmtCompactUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function go(url: string) {
  navTo(url);
}

function selectPeriod(next: LeaderPeriod) {
  period.value = next;
}

// 🔴 方向键切换必须让焦点**留在** tablist 上(zentao #215)。
// 切周期会触发 loadRemote:它把 remoteState 置 loading、快照置 null,列表区随之
// 重渲染,原来那一格从 DOM 里消失,焦点就掉回页面根节点 —— 后续 ArrowRight/Left
// 全部失效。nextTick 只够应付同步重渲染,所以这里在**本轮读结束**后再补一次焦点
// (成功/失败都补:失败态同样不该把键盘用户丢在页外)。
let pendingPeriodFocus = false;
function focusActivePeriodTab(): void {
  if (typeof document === "undefined") return;
  document.querySelector<HTMLElement>('.nx-leader-periods .nx-glass-option[tabindex="0"]')?.focus();
}
function movePeriod(delta: -1 | 1) {
  const currentIndex = PERIODS.indexOf(period.value);
  const next = PERIODS[(currentIndex + delta + PERIODS.length) % PERIODS.length];
  if (!next || next === period.value) return;
  pendingPeriodFocus = true;
  period.value = next;
  void nextTick(focusActivePeriodTab);
}

// ─── styles ───
// De-carded hero: no surface/border/glow — content sits directly on the page
// floor (page-floor auras are deleted outright per owner call, not re-tuned).
const heroStyle: CSSProperties = { padding: "6px 2px 0" };
function heroCapStyle(color: string): CSSProperties {
  return { fontSize: "12px", fontWeight: 500, color, letterSpacing: "0.06em" };
}
const heroBigStyle: CSSProperties = { marginTop: "8px", fontSize: "34px", fontWeight: 600, lineHeight: 1, letterSpacing: "-0.022em", color: "var(--v5-warning)" };
const heroIconStyle: CSSProperties = { width: "48px", height: "48px", background: "color-mix(in srgb, var(--v5-warning) 15%, transparent)" };
// -2px side margins pull the hairline back to full width (hero has a 2px optical inset).
const heroFooterStyle: CSSProperties = { margin: "12px -2px 0", padding: "12px 2px 0", borderTop: "1px solid var(--v5-border)", fontSize: "12px" };

// 轨道贴页面底:surface-2 与页面底同色不可辨(亮色 ΔE 2.2),改 L1 surface
const segWrapStyle: CSSProperties = { background: "var(--v5-surface)", borderRadius: "12px", padding: "3px", gap: "2px" };
function pillStyle(p: LeaderPeriod): CSSProperties {
  const on = period.value === p;
  // 《07》tap≥44(原 34);同型控件 earn 页已是 44,这里是漏掉的兄弟实例
  // 选中态原是「surface 底 + 投影」,轨道提到 L1 后会与轨道撞色(只剩投影可辨),且投影表达层级违反《03》;
  // 改 brand-soft 底 + brand 文字,与 earn / live-feed-card / marketplace sortPill 同一写法。
  return { height: "44px", borderRadius: "9px", background: on ? "var(--v5-brand-soft)" : "transparent", boxShadow: "none" };
}
function pillLabelStyle(p: LeaderPeriod): CSSProperties {
  const on = period.value === p;
  return { fontSize: "12px", fontWeight: on ? 600 : 500, color: on ? "var(--v5-brand)" : "var(--v5-ink-3)" };
}

// Transparent stat row — was a second glowing surface card under the hero.
const myRankStyle: CSSProperties = { padding: "4px 2px 0" };
const myRankBigStyle: CSSProperties = { fontSize: "26px", fontWeight: 600, lineHeight: 1, letterSpacing: "-0.022em", color: "var(--v5-ink)" };
const climbCtaStyle: CSSProperties = {
  gap: "6px",
  minHeight: "44px",
  flexShrink: 0,
  marginLeft: "auto",
  justifyContent: "center",
  whiteSpace: "nowrap",
  padding: "0 14px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};

// Outer podium shell dropped — the three filled columns are the visual unit.
const podiumCardStyle: CSSProperties = { padding: "8px 0 0" };
function podiumColStyle(isFirst: boolean): CSSProperties {
  return {
    padding: "10px",
    // 非第一名原用 surface-2,与页面底同色(亮色 ΔE 2.2)不可辨,改 L1 surface。
    background: isFirst ? "var(--v5-warning-soft)" : "var(--v5-surface)",
    transform: isFirst ? "translateY(-6px)" : "none",
  };
}
function podiumAvatarStyle(color: string): CSSProperties {
  return { width: "36px", height: "36px", margin: "6px auto 0", background: color };
}
const podiumHandleStyle: CSSProperties = { marginTop: "6px", fontFamily: "var(--font-v5)", fontWeight: 600, fontSize: "12px", color: "var(--v5-ink)" };
function podiumEarnStyle(color: string): CSSProperties {
  return { marginTop: "4px", fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "13px", fontWeight: 600, color };
}

// Transparent hairline group — rows were already hairline-separated; the
// surface + outer border was redundant boundary weight.
const listCardStyle: CSSProperties = { marginTop: "12px", padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
const listHeadStyle: CSSProperties = {
  gridTemplateColumns: "32px 1fr 56px 84px",
  padding: "10px 0",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
  borderBottom: "1px solid var(--v5-border)",
};
function listRowStyle(isLast: boolean): CSSProperties {
  return {
    gridTemplateColumns: "32px 1fr 56px 84px",
    padding: "10px 0",
    fontSize: "12px",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
const rowAvatarStyle: CSSProperties = { width: "28px", height: "28px", background: "linear-gradient(135deg, var(--v5-success-soft), var(--v5-brand-soft))" };
const vRankChipStyle: CSSProperties = {
  padding: "0 4px",
  borderRadius: "4px",
  background: "color-mix(in srgb, var(--v5-surface-2) 60%, transparent)",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};

// Ghost affordance — 44px tap target kept, boxed chrome dropped.
const loadMoreBtnStyle: CSSProperties = {
  gap: "6px",
  height: "44px",
  marginTop: "-4px",
};
const loadMoreLabelStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
};

const shareStickyStyle: CSSProperties = {
  position: "sticky",
  bottom: "26px",
  zIndex: 10,
  margin: "0 -16px",
  padding: "12px 16px",
  background: "var(--v5-sticky-bar-bg)",
  backdropFilter: "blur(22px) saturate(180%)",
  borderTop: "1px solid var(--v5-sticky-bar-border)",
};
const shareCtaStyle: CSSProperties = {
  width: "100%",
  gap: "6px",
  height: "50px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  boxShadow: "var(--v5-spotlight-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "15px",
  letterSpacing: "-0.005em",
};
const footerNoteStyle: CSSProperties = { paddingTop: "8px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.625 };

import GlassSegments from "@/components/glass-segments.vue";
const periodOptions = computed(() => PERIODS.map(value => ({ value, label: t.value.leaderboard.periods[value] })));
</script>
