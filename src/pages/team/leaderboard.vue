<template>
  <AppChassis active="team">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="pointsCopy.title" />
      <view class="leader-content">
        <GlassSegments class="nx-leader-periods" surface="glass" selection="flat" :label="pointsCopy.title" :model-value="period" @select="selectPeriod" :options="periodOptions" />
        <view v-if="remoteApiEnabled && remoteState !== 'ready' && !(remoteState === 'loading' && remoteSnapshot)" class="leader-state" role="status" :aria-busy="remoteState === 'loading'">
          <text>{{ remoteState === 'loading' ? t.leaderboard.loading : t.leaderboard.loadError }}</text>
          <view v-if="remoteState === 'error'" class="leader-cta" role="button" tabindex="0" @click="loadRemote()" @keydown.enter.prevent="loadRemote()" @keydown.space.prevent="loadRemote()"><text class="leader-retry-label">{{ t.leaderboard.retry }}</text><text aria-hidden="true">→</text></view>
        </view>
        <template v-if="!remoteApiEnabled || remoteState === 'ready' || (remoteState === 'loading' && remoteSnapshot !== null)">
          <view v-if="paused" role="status" aria-live="polite" class="leader-state">
            <text class="leader-state-title">{{ t.leaderboard.pausedTitle }}</text>
            <text>{{ t.leaderboard.pausedBody }}</text>
            <text>{{ snapshotAvailable ? `${t.leaderboard.frozenAt} · ${pauseCapturedAt}` : t.leaderboard.snapshotUnavailable }}</text>
            <view class="leader-cta" role="button" tabindex="0" @click="loadRemote()" @keydown.enter.prevent="loadRemote()" @keydown.space.prevent="loadRemote()"><text class="leader-retry-label">{{ t.leaderboard.retry }}</text><text aria-hidden="true">→</text></view>
          </view>
          <template v-else>
            <view class="leader-hero">
              <view class="leader-hero-copy">
                <text class="leader-caption">{{ t.leaderboard.myRank.label }}</text>
                <view class="leader-my-rank"><text class="font-display tabular-nums">{{ visibility.mask(!pointsRankingAvailable || me.rank === null ? '—' : '#' + myRankDisplay) }}</text><text class="leader-total">/ {{ visibility.mask(pointsRankingAvailable ? totalRows.toLocaleString() : '—') }}</text></view>
                <text class="leader-gap">{{ visibility.mask(gapText) }}</text>
              </view>
              <TeamArt kind="podium" :size="80" />
            </view>

            <view v-if="!pointsRankingAvailable" class="leader-state" role="status"><text>{{ pointsCopy.unavailable }}</text></view>
            <view v-else class="leader-list">
              <view class="leader-list-heading"><text>{{ t.leaderboard.columns.rank }} · {{ t.leaderboard.columns.inviter }}</text><text>{{ pointsCopy.points }}</text></view>
              <view v-for="group in rankingGroups" :key="group.id" :class="group.featured ? 'leader-podium' : 'leader-flat'">
              <view v-for="row in group.rows" :key="row.rank" class="leader-row" :data-rank="visibility.hidden ? undefined : row.rank">
                <text class="leader-position tabular-nums" :class="{ 'leader-position--top': row.rank <= 3 }">{{ visibility.mask(row.rank) }}</text>
                <TeamRankEmblem v-if="!visibility.hidden" :rank="row.vRank" :size="40" /><view v-else style="width: 40px; height: 40px" aria-hidden="true" />
                <view class="leader-person">
                  <text class="leader-name">{{ row.handle }}</text>
                  <text class="leader-meta">{{ visibility.mask(rankLabel(row.vRank, locale.code, [])) }} · {{ fmt(t.leaderboard.chips.directs, { n: visibility.mask(row.directs) }) }}</text>
                  <text class="leader-meta">{{ fmt(t.leaderboard.chips.teamSize, { n: visibility.mask(row.teamSize.toLocaleString()) }) }}</text>
                </view>
                <view class="leader-points"><text class="tabular-nums">{{ visibility.mask(formatComputePoints(row.computePoints, locale.code)) }}</text></view>
              </view>
              </view>
            </view>
            <view v-if="hasMore" class="leader-more" role="button" :tabindex="remoteState !== 'ready' || remoteLoadingMore ? -1 : 0" :aria-disabled="remoteState !== 'ready' || remoteLoadingMore" :aria-busy="remoteLoadingMore" @click="loadMore" @keydown.enter.prevent="loadMore" @keydown.space.prevent="loadMore">
              <text :class="{ 'leader-retry-label': remoteLoadMoreError }">{{ remoteLoadMoreError ? t.leaderboard.retry : t.leaderboard.cta.loadMore }}</text><text aria-hidden="true">↓</text>
            </view>
            <NxButton class="leader-share" variant="secondary" :label="t.leaderboard.cta.share" @click="go('/pages/team/team?intent=share')">
              <text>{{ t.leaderboard.cta.share }}</text><text aria-hidden="true">→</text>
            </NxButton>
            <text class="block text-center" :style="footerNoteStyle">{{ period === 'all' ? pointsCopy.noteAll : pointsCopy.note }}</text>
          </template>
        </template>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { useDataVisibility } from "@/store/data-visibility";
import { formatDisplayDateTime } from "@/lib/display-date";
import { formatComputePoints } from "@/i18n/compute-points";
import { leaderboardPointsCopy } from "@/i18n/leaderboard-points-copy";
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
import { apiRuntimeConfig, remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { TeamLeaderboardSnapshot } from "@/api/team-insights-api";
import { asApiError } from "@/api/errors";
import { useAuth } from '@/store/auth';
import { useApp } from "@/store/app";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";

const t = useT();
const visibility = useDataVisibility();
const locale = useLocaleStore();
const pointsCopy = computed(() => leaderboardPointsCopy(locale.code));
const app = useApp();
const auth = useAuth();
const readEnvironment = [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const;
let environmentInvalidated = false;
watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => { environmentInvalidated = true; }, { flush: 'sync' });
const environmentCurrent = () => !environmentInvalidated && readEnvironment[0] === apiRuntimeConfig.environment && readEnvironment[1] === apiRuntimeConfig.baseUrl;
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
watch(period, () => { remoteSnapshot.value = null; visibleCount.value = PAGE_SIZE; if (remoteApiEnabled) void loadRemote(1, false); }, { flush: 'sync' });
watch(() => [app.accountKey, app.accountBindingEpoch, auth.isAuthenticated, locale.code, apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => {
  if (!remoteApiEnabled) return;
  remoteRequest += 1; remoteSnapshot.value = null; remoteState.value = 'loading';
  if (auth.isAuthenticated && environmentCurrent()) void loadRemote(1, false);
}, { flush: 'sync' });

const rows = computed(() => remoteApiEnabled ? (remoteSnapshot.value?.period === period.value ? remoteSnapshot.value.rows : []) : LEADERBOARD[period.value]);
const paused = computed(() => remoteApiEnabled && remoteSnapshot.value?.period === period.value && remoteSnapshot.value.paused === true);
const snapshotAvailable = computed(() => !paused.value || (remoteSnapshot.value?.snapshotState === "FROZEN" && remoteSnapshot.value?.dataAvailable === true));
const pauseCapturedAt = computed(() => formatDisplayDateTime(remoteSnapshot.value?.pauseCapturedAt, locale.code, true));
const pointsRankingAvailable = computed(() => !remoteApiEnabled || remoteSnapshot.value?.rankingMetric === "COMPUTE_POINTS");
const me = computed(() => remoteApiEnabled ? { rank: remoteSnapshot.value?.myRank ?? null,
  gapToNextComputePoints: remoteSnapshot.value?.gapToNextComputePoints ?? null } : MY_RANK[period.value]);
const totalRows = computed(() => remoteApiEnabled ? remoteSnapshot.value?.totalRows ?? 0 : rows.value.length);
const myRankDisplay = computed(() => me.value.rank === null ? "—" : String(me.value.rank));
const visibleRows = computed(() => remoteApiEnabled ? rows.value : rows.value.slice(0, visibleCount.value));
const rankingGroups = computed(() => [
  { id: "leaders", featured: true, rows: visibleRows.value.filter(row => row.rank <= 3) },
  { id: "others", featured: false, rows: visibleRows.value.filter(row => row.rank > 3) },
].filter(group => group.rows.length > 0));
const hasMore = computed(() => pointsRankingAvailable.value && (remoteApiEnabled
  ? rows.value.length < (remoteSnapshot.value?.totalRows ?? 0)
  : visibleCount.value < rows.value.length));

function loadMore() {
  if (remoteApiEnabled) {
    if (remoteState.value !== 'ready' || remoteLoadingMore.value || !hasMore.value || !remoteSnapshot.value) return;
    void loadRemote(remoteSnapshot.value.page + 1, true);
    return;
  }
  visibleCount.value = Math.min(rows.value.length, visibleCount.value + PAGE_SIZE);
}

async function loadRemote(page = 1, append = false) {
  if (!pageVisible || !auth.isAuthenticated || !environmentCurrent()) return;
  const request = ++remoteRequest;
  const accountKey = app.accountKey;
  const accountScope = captureAccountScope();
  const runScope = captureRuntimeRevision();
  const readLocale = locale.code;
  const requestedPeriod = period.value;
  remoteLoadMoreError.value = false;
  if (append) remoteLoadingMore.value = true;
  else {
    remoteState.value = "loading";
  }
  const current = () => mounted && request === remoteRequest && accountKey === app.accountKey
    && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope)
    && auth.isAuthenticated && readLocale === locale.code && environmentCurrent()
    && requestedPeriod === period.value;
  try {
    const snapshot = await teamInsightsApi.leaderboard(requestedPeriod, page, PAGE_SIZE,
      append ? remoteSnapshot.value?.snapshotAt : null,
      append ? remoteSnapshot.value?.snapshotVersion : null);
    if (!current()) return;
    if (append) {
      const previous = remoteSnapshot.value;
      const expectedFirstRank = previous ? previous.rows.length + 1 : -1;
      if (!previous || previous.period !== requestedPeriod || snapshot.period !== requestedPeriod || snapshot.page !== page
        || snapshot.snapshotAt !== previous.snapshotAt
        || snapshot.snapshotVersion !== previous.snapshotVersion
        || snapshot.paused !== previous.paused || snapshot.snapshotState !== previous.snapshotState
        || snapshot.rankingMetric !== previous.rankingMetric
        || snapshot.dataAvailable !== previous.dataAvailable
        || snapshot.pauseSnapshotId !== previous.pauseSnapshotId || snapshot.pauseCapturedAt !== previous.pauseCapturedAt
        || snapshot.pageSize !== PAGE_SIZE || snapshot.rows[0]?.rank !== expectedFirstRank) {
        throw new Error("TEAM_LEADERBOARD_PAGE_SEQUENCE_INVALID");
      }
      const lastPoints = previous.rows.map(row => row.computePoints).filter(value => value !== null).at(-1);
      const firstPoints = snapshot.rows.find(row => row.computePoints !== null)?.computePoints;
      if (snapshot.rankingMetric === "COMPUTE_POINTS" && lastPoints != null && firstPoints != null && firstPoints > lastPoints) {
        throw new Error("TEAM_LEADERBOARD_PAGE_SEQUENCE_INVALID");
      }
      remoteSnapshot.value = { ...snapshot, rows: [...previous.rows, ...snapshot.rows] };
    } else {
      remoteSnapshot.value = snapshot;
    }
    remoteState.value = "ready";
  } catch (error) {
    if (!current()) return;
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

const gapText = computed(() => !pointsRankingAvailable.value ? "—"
  : me.value.rank === null ? t.value.leaderboard.myRank.notRanked
    : me.value.rank === 1 ? t.value.leaderboard.myRank.first
      : me.value.gapToNextComputePoints === null ? "—"
        : fmt(pointsCopy.value.gap, { points: formatComputePoints(me.value.gapToNextComputePoints, locale.code) }));

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
.nx-leader-periods { width: 100%; min-width: 0; }
.leader-hero { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); padding: 4px 0 8px; }
.leader-hero-copy { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.leader-caption { color: var(--v5-ink-3); font-size: var(--ui-type-list-subtitle); }
.leader-my-rank { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; font-size: var(--ui-type-wallet-amount); font-weight: 600; line-height: var(--ui-type-wallet-amount-lh); margin: 8px 0 12px; }
.leader-total { color: var(--v5-ink-3); font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); font-weight: 400; }
.leader-gap { display: block; color: var(--v5-ink-2); font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); }
.leader-list-heading { display: flex; justify-content: space-between; gap: var(--ui-space-inset); color: var(--v5-ink-3); font-size: 12px; padding-bottom: 12px; }
.leader-list-heading > :last-child { text-align: right; }
.leader-podium { padding: 0 12px; border: 1px solid var(--v5-border); border-radius: 16px; background: color-mix(in srgb, var(--v5-ink) 4%, var(--v5-bg)); }
.leader-podium > .leader-row:first-child { border-top: 0; }
.leader-flat { margin-top: var(--ui-space-inline); }
.leader-row { display: flex; align-items: center; gap: var(--ui-space-row-y); border-top: 1px solid var(--v5-border); padding: 16px 0; min-height: 64px; }
.leader-position { min-width: 20px; font-size: 14px; color: var(--v5-ink-3); }
.leader-position--top { color: var(--v5-brand); font-weight: 600; }
.leader-person { min-width: 0; flex: 1; }
.leader-name { display: block; font-size: var(--ui-type-list-title); line-height: var(--ui-type-list-title-lh); font-weight: 500; overflow-wrap: anywhere; }
.leader-meta { display: block; color: var(--v5-ink-3); font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); margin-top: 4px; overflow-wrap: anywhere; }
.leader-points { text-align: right; font-size: var(--ui-type-list-subtitle); line-height: var(--ui-type-list-subtitle-lh); max-width: 34%; overflow-wrap: anywhere; }
.leader-currency { display: block; margin-top: 4px; font-size: 11px; color: var(--v5-ink-3); }
.leader-cta { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inset); min-height: 48px; padding: var(--ui-space-inline) 20px; box-sizing: border-box; border: 1px solid var(--v5-border); border-radius: 999px; color: var(--v5-ink); background: color-mix(in srgb, var(--v5-ink) 6%, transparent); font-size: 14px; font-weight: 500; }
.leader-more { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-2); }
.leader-retry-label { font: 600 13px/20px var(--font-v5); }
.leader-share { width:100%; }
.leader-state { display: flex; flex-direction: column; gap: 14px; padding: 32px 0; color: var(--v5-ink-2); font-size: var(--ui-type-list-subtitle); line-height: 1.6; }
.leader-state-title { font-size: var(--ui-type-card-title); line-height: var(--ui-type-card-title-lh); font-weight: var(--ui-type-card-title-weight); color: var(--v5-ink); }
[role="button"]:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
@media (max-width: 374px) { .leader-content { padding-left: 16px; padding-right: 16px; } .leader-hero :deep(.team-art) { --team-art-size: 72px; } .leader-row { gap: 6px; min-height: 56px; } .leader-podium { padding-inline: 8px; } .leader-points { font-size: var(--ui-type-list-subtitle); } }
</style>
