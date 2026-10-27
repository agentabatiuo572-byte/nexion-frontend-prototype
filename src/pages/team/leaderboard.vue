<template>
  <AppChassis active="team">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.leaderboard.pageTitle" />
      <view class="leader-content">
        <GlassSegments class="nx-leader-periods" :label="t.leaderboard.pageTitle" :model-value="period" @select="selectPeriod" :options="periodOptions" />
        <view v-if="remoteApiEnabled && remoteState !== 'ready'" class="leader-state" role="status" :aria-busy="remoteState === 'loading'">
          <text>{{ remoteState === 'loading' ? t.leaderboard.loading : t.leaderboard.loadError }}</text>
          <view v-if="remoteState === 'error'" class="leader-cta" role="button" tabindex="0" @click="loadRemote()" @keydown.enter.prevent="loadRemote()" @keydown.space.prevent="loadRemote()"><text>{{ t.leaderboard.retry }}</text><text aria-hidden="true">→</text></view>
        </view>
        <template v-if="!remoteApiEnabled || remoteState === 'ready'">
          <view v-if="paused" role="status" aria-live="polite" class="leader-state">
            <text class="leader-state-title">{{ t.leaderboard.pausedTitle }}</text>
            <text>{{ t.leaderboard.pausedBody }}</text>
            <text>{{ snapshotAvailable ? `${t.leaderboard.frozenAt} · ${pauseCapturedAt}` : t.leaderboard.snapshotUnavailable }}</text>
            <text v-if="snapshotAvailable && prize.poolUSD > 0">{{ t.leaderboard.pool.label }} · {{ fmtCompactUSD(prize.poolUSD) }}</text>
            <view class="leader-cta" role="button" tabindex="0" @click="loadRemote()" @keydown.enter.prevent="loadRemote()" @keydown.space.prevent="loadRemote()"><text>{{ t.leaderboard.retry }}</text><text aria-hidden="true">→</text></view>
          </view>
          <template v-else>
            <view class="leader-hero">
              <view class="leader-hero-copy">
                <text class="leader-caption">{{ t.leaderboard.myRank.label }}</text>
                <view class="leader-my-rank"><text class="font-display tabular-nums">{{ me.rank === null ? '—' : '#' + myRankDisplay }}</text><text class="leader-total">/ {{ totalRows.toLocaleString() }}</text></view>
                <text class="leader-gap">{{ gapText }}</text>
              </view>
              <TeamArt kind="podium" :size="112" />
            </view>

            <view class="leader-list">
              <view class="leader-list-heading"><text>{{ t.leaderboard.columns.rank }} · {{ t.leaderboard.columns.inviter }}</text><text>{{ t.leaderboard.columns.earned }}</text></view>
              <view v-for="group in rankingGroups" :key="group.id" :class="group.featured ? 'leader-podium' : 'leader-flat'">
              <view v-for="row in group.rows" :key="row.rank" class="leader-row" :data-rank="row.rank">
                <text class="leader-position tabular-nums" :class="{ 'leader-position--top': row.rank <= 3 }">{{ row.rank }}</text>
                <TeamRankEmblem :rank="row.vRank" :size="40" />
                <view class="leader-person">
                  <text class="leader-name">{{ row.handle }}</text>
                  <text class="leader-meta">{{ rankLabel(row.vRank, locale.code, []) }} · {{ fmt(t.leaderboard.chips.directs, { n: row.directs }) }}</text>
                  <text class="leader-meta">{{ fmt(t.leaderboard.chips.teamSize, { n: row.teamSize.toLocaleString() }) }}</text>
                </view>
                <view class="leader-earnings"><text class="tabular-nums">{{ formatUsd(row.earnedUSDT) }}</text></view>
              </view>
              </view>
            </view>
            <view v-if="hasMore" class="leader-more" role="button" :tabindex="remoteLoadingMore ? -1 : 0" :aria-disabled="remoteLoadingMore" :aria-busy="remoteLoadingMore" @click="loadMore" @keydown.enter.prevent="loadMore" @keydown.space.prevent="loadMore">
              <text>{{ remoteLoadingMore ? t.leaderboard.loading : remoteLoadMoreError ? t.leaderboard.retry : t.leaderboard.cta.loadMore }}</text><text aria-hidden="true">↓</text>
            </view>
            <NxButton class="leader-share" variant="secondary" :label="t.leaderboard.cta.share" @click="go('/pages/team/team?intent=share')">
              <text>{{ t.leaderboard.cta.share }}</text><text aria-hidden="true">→</text>
            </NxButton>
            <text class="block text-center" :style="footerNoteStyle">{{ period === 'all' ? t.leaderboard.noteAllTime : t.leaderboard.note }}</text>
          </template>
        </template>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatDisplayDateTime } from "@/lib/display-date";
import { formatAmount } from "@/lib/amount-display";
import { formatUsd } from '@/lib/usd-display';
import { navTo } from "@/lib/route";
import { computed, nextTick, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import NxButton from '@/components/ui/nx-button.vue';
import TeamArt from "@/components/team/team-art.vue";
import TeamRankEmblem from "@/components/team/team-rank-emblem.vue";
import { rankLabel } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { LEADERBOARD, MY_RANK, type LeaderPeriod } from "@/mock/leaderboard";
import { remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { TeamLeaderboardSnapshot } from "@/api/team-insights-api";
import { asApiError } from "@/api/errors";
import { useApp } from "@/store/app";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";

const t = useT();
const locale = useLocaleStore();
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
const pauseCapturedAt = computed(() => formatDisplayDateTime(remoteSnapshot.value?.pauseCapturedAt, locale.code, true));
// Only show a supplied pool as historical context; no payout or reset promotion.
const prize = computed(() => ({ poolUSD: remoteApiEnabled ? remoteSnapshot.value?.poolUsd ?? 0 : 0 }));
const me = computed(() => remoteApiEnabled ? { rank: remoteSnapshot.value?.myRank ?? null,
  gapToNext: remoteSnapshot.value?.gapToNext ?? 0 } : MY_RANK[period.value]);
const totalRows = computed(() => remoteApiEnabled ? remoteSnapshot.value?.totalRows ?? 0 : rows.value.length);
const myRankDisplay = computed(() => me.value.rank === null ? "—" : String(me.value.rank));
const visibleRows = computed(() => remoteApiEnabled ? rows.value : rows.value.slice(0, visibleCount.value));
const rankingGroups = computed(() => [
  { id: "leaders", featured: true, rows: visibleRows.value.filter(row => row.rank <= 3) },
  { id: "others", featured: false, rows: visibleRows.value.filter(row => row.rank > 3) },
].filter(group => group.rows.length > 0));
const hasMore = computed(() => remoteApiEnabled
  ? rows.value.length < (remoteSnapshot.value?.totalRows ?? 0)
  : visibleCount.value < rows.value.length);

function loadMore() {
  if (remoteApiEnabled) {
    if (remoteLoadingMore.value || !hasMore.value || !remoteSnapshot.value) return;
    void loadRemote(remoteSnapshot.value.page + 1, true);
    return;
  }
  visibleCount.value = Math.min(rows.value.length, visibleCount.value + PAGE_SIZE);
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

let pageVisible = false;
const stopRuntimeRefresh = subscribeRuntimeRevision(() => {
  if (remoteApiEnabled && mounted && pageVisible) void loadRemote(1, false);
});
onShow(() => { pageVisible = true; if (remoteApiEnabled) void loadRemote(1, false); });
onHide(() => { pageVisible = false; remoteRequest += 1; });
onUnmounted(() => { stopRuntimeRefresh(); mounted = false; remoteRequest += 1; remoteSnapshot.value = null; });

const gapText = computed(() => me.value.rank === null
  ? t.value.leaderboard.myRank.notRanked
  : me.value.rank === 1 ? t.value.leaderboard.myRank.first
    : fmt(t.value.leaderboard.myRank.gap, { amount: formatAmount(me.value.gapToNext) }));

function fmtCompactUSD(n: number): string {
  if (n >= 1_000_000) return `$${formatAmount(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${formatAmount(n / 1_000)}K`;
  return `$${formatAmount(n)}`;
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

const footerNoteStyle: CSSProperties = { paddingTop: "8px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.625 };
import GlassSegments from "@/components/glass-segments.vue";
const periodOptions = computed(() => PERIODS.map(value => ({ value, label: t.value.leaderboard.periods[value] })));
</script>

<style scoped>
.leader-content { display: flex; flex-direction: column; gap: 24px; padding: var(--ui-space-inline) 20px 24px; }
.nx-leader-periods { background: transparent; border: 0; box-shadow: none; padding: 0; }
.leader-hero { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); padding: 4px 0 8px; }
.leader-hero-copy { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.leader-caption { color: var(--v5-ink-3); font-size: 13px; }
.leader-my-rank { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; font-size: 36px; font-weight: 600; line-height: 1.2; margin: 8px 0 12px; }
.leader-total { color: var(--v5-ink-3); font-size: 12px; font-weight: 400; }
.leader-gap { display: block; color: var(--v5-ink-2); font-size: 12px; line-height: 1.6; }
.leader-list-heading { display: flex; justify-content: space-between; gap: var(--ui-space-inset); color: var(--v5-ink-3); font-size: 12px; padding-bottom: 12px; }
.leader-list-heading > :last-child { text-align: right; }
.leader-podium { padding: 0 14px; border: 1px solid var(--v5-border); border-radius: 22px; background: color-mix(in srgb, var(--v5-ink) 4%, var(--v5-bg)); }
.leader-podium > .leader-row:first-child { border-top: 0; }
.leader-flat { margin-top: var(--ui-space-inline); }
.leader-row { display: flex; align-items: center; gap: var(--ui-space-row-y); border-top: 1px solid var(--v5-border); padding: 18px 0; }
.leader-position { min-width: 20px; font-size: 14px; color: var(--v5-ink-3); }
.leader-position--top { color: var(--v5-brand); font-weight: 600; }
.leader-person { min-width: 0; flex: 1; }
.leader-name { display: block; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.leader-meta { display: block; color: var(--v5-ink-3); font-size: 11px; line-height: 1.5; margin-top: 4px; overflow-wrap: anywhere; }
.leader-earnings { text-align: right; font-size: 15px; max-width: 32%; overflow-wrap: anywhere; }
.leader-currency { display: block; margin-top: 4px; font-size: 11px; color: var(--v5-ink-3); }
.leader-cta { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inset); min-height: 48px; padding: var(--ui-space-inline) 20px; box-sizing: border-box; border: 1px solid var(--v5-border); border-radius: 999px; color: var(--v5-ink); background: color-mix(in srgb, var(--v5-ink) 6%, transparent); font-size: 14px; font-weight: 500; }
.leader-more { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; font-size: 13px; color: var(--v5-ink-2); }
.leader-share { width:100%; }
.leader-state { display: flex; flex-direction: column; gap: 14px; padding: 32px 0; color: var(--v5-ink-2); font-size: 13px; line-height: 1.6; }
.leader-state-title { font-size: 17px; font-weight: 600; color: var(--v5-ink); }
[role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (max-width: 360px) { .leader-content { padding-left: 16px; padding-right: 16px; } .leader-hero :deep(.team-art) { width: 88px !important; height: 88px !important; } .leader-row { gap: 6px; } .leader-earnings { font-size: 13px; } }
</style>
