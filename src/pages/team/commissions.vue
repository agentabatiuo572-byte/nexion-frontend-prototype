<template>
  <AppChassis active="team">
    <RewardPageSurface>
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.headerTitles.teamCommissions" :subtitle="t.headerSubtitles.teamCommissions" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <EmptyState
          v-if="remoteApiEnabled && commission.eventsStatus !== 'ready'"
          :kind="commission.eventsStatus === 'error' ? 'recoverable-error' : 'empty-list'"
          :title="commission.eventsStatus === 'error' ? t.network.projectionErrorTitle : t.network.projectionLoadingTitle"
          :desc="commission.eventsStatus === 'error' ? t.network.projectionErrorDesc : undefined"
          :cta-label="commission.eventsStatus === 'error' ? t.network.retry : undefined"
          compact
          @cta="commission.refreshCanonicalEvents()"
        />
        <template v-if="!remoteApiEnabled || commission.eventsStatus === 'ready'">

        <RewardHero kind="ledger" panel :label="t.commissions.thisMonth">
          <text class="reward-amount">{{ assetTotal(monthTotals.usdt, 'usdt') }}</text>
          <text class="block reward-income-uvt">{{ assetTotal(monthTotals.nex, 'nex') }}</text>
          <template #footer><view class="reward-cta reward-rule-link nx-commissions-focusable" role="link" tabindex="0" :aria-label="t.commissions.howItWorksEntry" @click="go('/pages/team/commissions-how')" @keydown.enter.prevent="go('/pages/team/commissions-how')" @keydown.space.prevent="go('/pages/team/commissions-how')"><text>{{ t.commissions.howItWorksEntry }}</text></view></template>
        </RewardHero>
        <view class="reward-income-summary">
          <view>
            <text class="block reward-caption">{{ t.directReferral.creditedTotal }}</text>
            <text class="block reward-income-summary__amount">${{ formatAmount(commission.unlockedUSDT()) }}</text>
            <text class="block reward-caption">{{ formatAmount(commission.unlockedNEX()) }} UVT</text>
          </view>
          <view>
            <text class="block reward-caption">{{ t.commissions.cooling }}</text>
            <text class="block reward-income-summary__amount">${{ formatAmount(commission.coolingUSDT()) }}</text>
            <text class="block reward-caption">{{ coolingOverviewText }}</text>
          </view>
        </view>
        <view class="reward-income-lifetime"><text>{{ t.commissions.lifetime }}</text><view class="reward-income-lifetime__amounts"><text>{{ assetTotal(lifetimeTotals.usdt, 'usdt') }}</text><text>{{ assetTotal(lifetimeTotals.nex, 'nex') }}</text></view></view>


        <GlassSegments :label="t.commissions.pageTitle" v-model="filter" :options="filterOptions" layout="scroll"  />

        <view v-if="filter !== 'all'" class="commission-filter-summary"><text>{{ t.commissions.kind[filter] }}</text><text>${{ formatAmount(byKind[filter].usdt) }} · {{ formatAmount(byKind[filter].nex) }} UVT</text></view>

        <EmptyState v-if="filtered.length === 0 && !hasMoreEvents" :kind="filter === 'all' ? 'empty-list' : 'no-filter-results'" :title="filter === 'all' ? t.empty.commissionsTitle : t.empty.filterTitle" :desc="filter === 'all' ? t.empty.commissionsDesc : t.empty.filterDesc" />
        <view v-if="filtered.length > 0" :style="listGroupStyle">
            <view
              v-for="(e, i) in filtered"
              :key="e.id"
              class="flex items-center reward-income-event"
              :style="eventRowStyle(i === filtered.length - 1)"
            >
              <view class="grid place-items-center shrink-0 reward-income-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="KIND[e.kind].color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(p, pi) in KIND[e.kind].paths" :key="pi" :d="p" /></svg>
              </view>
              <view class="flex-1 min-w-0">
                <view class="flex items-center" style="gap: 6px">
                  <text class="truncate" :style="{ fontSize: '13px', color: 'var(--v5-ink)' }">{{ e.sourceUserName }}</text>
                  <text v-if="e.layer" class="font-mono-tabular" :style="e.layer === 1 ? directBadgeStyle : extendedBadgeStyle">{{ e.layer === 1 ? t.commissions.directBadge : t.commissions.extendedBadge }}</text>
                </view>
                <text class="block font-mono-tabular" :style="eventMetaStyle">{{ eventMeta(e) }}</text>
              </view>
              <view class="text-right" style="max-width: 48%; overflow-wrap: anywhere">
                <text v-if="e.amountUSDT > 0" class="block font-mono-tabular tabular-nums" :style="commissionAmountStyle(e, 'usdt')">{{ commissionAmountLabel(e) }}</text>
                <text v-if="e.amountNEX > 0" class="block font-mono-tabular tabular-nums" :style="commissionAmountStyle(e, 'nex')">{{ commissionNexLabel(e) }}</text>
                <text v-if="e.status === 'cooling'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-warning)', marginTop: '2px' }">{{ coolingTag(e) }}</text>
                <text v-else-if="e.status === 'unlocked'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-success)', marginTop: '2px' }">{{ t.commissions.readyTag }}</text>
                <text v-else-if="e.status === 'withdrawn'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ t.commissions.withdrawnTag }}</text>
                <text v-else-if="e.status === 'frozen'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-2)', marginTop: '2px' }">{{ t.commissions.frozenTag }}</text>
                <text v-else-if="e.status === 'reversed'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-4)', marginTop: '2px' }">{{ t.commissions.reversedTag }}</text>
                <text v-else-if="e.status === 'rejected'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-danger)', marginTop: '2px' }">{{ t.commissions.rejectedTag }}</text>
                <text v-else-if="e.status === 'waiting_calculation'" class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.directReferral.waitingCalculation }}</text>
                <text v-else-if="e.status === 'recovery_pending'" class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.directReferral.recoveryPending }}</text>
                <text v-if="e.status === 'recovery_pending' && e.recoveryPendingUSDT !== undefined && e.recoveryPendingNEX !== undefined" class="block" style="font-size: 12px; color: var(--v5-warning)">{{ fmt(t.directReferral.pendingAmounts, { usdt: formatAmount(e.recoveryPendingUSDT), nex: formatAmount(e.recoveryPendingNEX) }) }}</text>
              </view>
            </view>
        </view>
            <view
              v-if="hasMoreEvents"
              class="reward-cta reward-cta--wide"
              role="button"
              :tabindex="commission.eventsLoadMoreStatus === 'loading' ? -1 : 0"
              :aria-disabled="commission.eventsLoadMoreStatus === 'loading'"
              :aria-busy="commission.eventsLoadMoreStatus === 'loading'"
              @click="loadMoreEvents"
              @keydown="activateLoadMore"
            >
              <text>{{ commission.eventsLoadMoreStatus === "loading" ? "…" : commission.eventsLoadMoreStatus === "error" ? t.network.retry : t.unilevel.loadMore }}</text>
            </view>
        </template>
      </view>
    </view>
    </RewardPageSurface>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatAmount, formatGroupedAmount } from "@/lib/amount-display";
import { navTo } from "@/lib/route";
import { ref, computed, nextTick, onMounted, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import RewardHero from "@/components/team/reward-compact-hero.vue";
import RewardPageSurface from "@/components/team/reward-page-surface.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { formatTrialDate } from "@/lib/trial-date";
import { useCommission, type CommissionEvent, type CommissionKind } from "@/store/commission";
import { remoteApiEnabled } from "@/api/runtime";

const t = useT();
const commission = useCommission();

type Filter = "all" | CommissionKind;
const filter = ref<Filter>("all");

const KIND_ORDER: CommissionKind[] = ["direct_purchase", "direct_device_earning", "unilevel", "binary", "peer", "cultivation", "leadership", "genesis", "promotion", "other"];

interface KindSpec {
  color: string;
  paths: string[];
}
const KIND: Record<CommissionKind, KindSpec> = {
  direct_purchase: { color: "var(--v5-ink-2)", paths: ["M3 3h2l3 12h11l2-8H6", "M9 20h.01M18 20h.01"] },
  direct_device_earning: { color: "var(--v5-ink-2)", paths: ["M4 3h16v14H4z", "M8 21h8M12 17v4"] },
  unilevel: { color: "var(--v5-ink-2)", paths: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"] },
  binary: { color: "var(--v5-ink-2)", paths: ["M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z"] },
  peer: { color: "var(--v5-ink-2)", paths: ["m11 17 2 2a1 1 0 1 0 3-3", "m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4", "M21 3v9h-9"] },
  cultivation: { color: "var(--v5-ink-2)", paths: ["M7 20h10", "M10 20c5.5-2.5.8-6.4 3-10", "M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z", "M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"] },
  leadership: { color: "var(--v5-ink-2)", paths: ["m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14"] },
  promotion: { color: "var(--v5-ink-2)", paths: ["M12 3v18M5 10l7-7 7 7"] },
  other: { color: "var(--v5-ink-2)", paths: ["M4 4h16v16H4z", "M8 12h8"] },
  genesis: { color: "var(--v5-ink-2)", paths: ["M6 3h12l4 6-10 13L2 9z", "M11 3 8 9l4 13 4-13-3-6", "M2 9h20"] },
};

onMounted(() => {
  commission.unlockMatured();
});
onShow(() => { if (remoteApiEnabled) void commission.refreshCanonicalEvents(); });

const events = computed(() => commission.events);
const byKind = computed(() => commission.byKind());
const filtered = computed(() =>
  filter.value === "all" ? events.value : events.value.filter((e) => e.kind === filter.value),
);
const hasMoreEvents = computed(() => remoteApiEnabled && commission.events.length < commission.eventsTotalRows);
// Read canonical totals directly so a missing asset remains unknown instead of
// inheriting a store helper's zero fallback. Never total the current page.
const monthTotals = computed(() => remoteApiEnabled
  ? { usdt: commission.eventsEvidence?.aggregate.monthUSDT, nex: commission.eventsEvidence?.aggregate.monthNEX }
  : { usdt: commission.monthUSDT(), nex: commission.monthNEX() });
const lifetimeTotals = computed(() => remoteApiEnabled
  ? { usdt: commission.eventsEvidence?.aggregate.totalUSDT, nex: commission.eventsEvidence?.aggregate.totalNEX }
  : { usdt: commission.totalUSDTLifetime(), nex: commission.totalNEXLifetime() });
function assetTotal(value: number | null | undefined, asset: 'usdt' | 'nex'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return asset === 'nex' ? '— UVT' : '— USD';
  return asset === 'usdt' ? `$${formatAmount(value)}` : `${formatAmount(value)} UVT`;
}
function loadMoreEvents() {
  if (!hasMoreEvents.value || commission.eventsLoadMoreStatus === 'loading') return;
  void commission.loadMoreCanonicalEvents();
}

const coolingOverviewText = computed(() => {
  if (remoteApiEnabled) {
    const next = commission.eventsEvidence?.aggregate.nextUnlockAt;
    return next == null ? "—" : fmt(t.value.commissions.coolingTag, { n: Math.max(0, Math.ceil((next - Date.now()) / 86400000)) });
  }
  const next = events.value
    .filter((event) => event.status === "cooling" && Number.isFinite(event.unlockAt))
    .sort((a, b) => a.unlockAt - b.unlockAt)[0];
  if (!next) return remoteApiEnabled ? "—" : t.value.commissions.unlocksIn30d;
  const days = Math.max(0, Math.ceil((next.unlockAt - Date.now()) / 86400000));
  return fmt(t.value.commissions.coolingTag, { n: days });
});

const noKindText = computed(() =>
  fmt(t.value.commissions.noKindEvents, { kind: t.value.commissions.kind[filter.value as CommissionKind] }),
);

function eventMeta(e: CommissionEvent): string {
  const kindLabel = t.value.commissions.kind[e.kind];
  const order = e.sourceRef ? ` · ${e.kind === "direct_purchase" ? t.value.directReferral.order : t.value.directReferral.receipt} ${e.sourceRef}` : e.orderAmountUSD ? ` · ${t.value.commissions.orderPrefix}${formatGroupedAmount(e.orderAmountUSD)}` : "";
  const device = e.sourceDeviceId ? ` · ${t.value.directReferral.device}: ${e.sourceDeviceId}` : "";
  const date = formatTrialDate(e.ts, dateLocale());
  return `${kindLabel}${order}${device} · ${date}`;
}
function coolingTag(e: CommissionEvent): string {
  const days = Math.max(0, Math.ceil((e.unlockAt - Date.now()) / 86400000));
  return fmt(t.value.commissions.coolingTag, { n: days });
}

function commissionAmountLabel(e: CommissionEvent): string {
  const amount = `$${formatAmount(e.amountUSDT)}`;
  if (e.status === "reversed") return `−${amount}`;
  if (e.status === "frozen" || e.status === "rejected" || e.status === "recovery_pending") return amount;
  return `+${amount}`;
}

function commissionNexLabel(e: CommissionEvent): string {
  const amount = `${formatAmount(e.amountNEX)} UVT`;
  if (e.status === "reversed") return `−${amount}`;
  if (e.status === "frozen" || e.status === "rejected" || e.status === "recovery_pending") return amount;
  return `+${amount}`;
}

function commissionAmountStyle(e: CommissionEvent, asset: "usdt" | "nex"): CSSProperties {
  const color = e.status === "rejected"
    ? "var(--v5-danger)"
    : e.status === "frozen"
      ? "var(--v5-ink-2)"
      : e.status === "reversed"
        ? "var(--v5-ink-4)"
        : "var(--v5-ink)";
  return { fontSize: asset === "usdt" ? "13px" : "12px", fontWeight: asset === "usdt" ? 600 : 400, color };
}

function go(url: string) {
  navTo(url);
}

// Reward summary cards double as filter controls: name them with the kind label
// + current amount/count so a screen reader hears what the tile selects.
function kindCardLabel(k: CommissionKind): string {
  return `${t.value.commissions.kind[k]} · ${formatAmount(byKind.value[k].usdt)} · ${byKind.value[k].count} ${t.value.commissions.events}`;
}

// Filter pills are one roving-tabindex tablist (same idiom as leaderboard/unilevel):
// arrows move selection and the focus ring follows the newly selected tab.
const FILTER_ORDER: Filter[] = ["all", ...KIND_ORDER];
function moveFilter(delta: -1 | 1) {
  const currentIndex = FILTER_ORDER.indexOf(filter.value);
  filter.value = FILTER_ORDER[(currentIndex + delta + FILTER_ORDER.length) % FILTER_ORDER.length];
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>(".nx-commissions-pill[tabindex='0']")?.focus();
  });
}

/**
 * 六张 kind 卡的左右方向键。
 *
 * 卡片与下方 pill 行驱动**同一个** filter,但它们是两个独立的单选组:卡组只有 6 个成员
 * (没有「全部」),所以方向键必须在**卡组内部**环转,不能复用 moveFilter —— 那会把选中项
 * 移到「全部」,而卡组里没有对应成员,焦点随即无处可去。
 *
 * 焦点目标按 tabindex 而不是 aria-checked 取:filter 为「全部」时卡组无成员被选中,
 * 此时可 Tab 进入的是第一张卡(tabindex=0),按 aria-checked 会取到 null 而丢失焦点。
 */
function moveKindCard(index: number, delta: -1 | 1) {
  const next = KIND_ORDER[(index + delta + KIND_ORDER.length) % KIND_ORDER.length];
  if (!next || next === filter.value) return;
  filter.value = next;
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
  });
}

function activateLoadMore(event: KeyboardEvent) {
  if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  loadMoreEvents();
}
// Transparent hairline group — border-top opens the group, rows separate with hairlines.
const listGroupStyle: CSSProperties = { padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
function eventRowStyle(isLast: boolean): CSSProperties {
  return {
    padding: "12px 0",
    gap: "12px",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
const directBadgeStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand)",
  background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)",
  padding: "0 4px",
  borderRadius: "4px",
};
const extendedBadgeStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-2)",
  background: "var(--v5-surface)",
  padding: "0 4px",
  borderRadius: "4px",
};
const eventMetaStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "2px" };

import GlassSegments from "@/components/glass-segments.vue";
const filterOptions = computed(() => [
  { value: "all", label: t.value.commissions.all, count: remoteApiEnabled ? commission.eventsTotalRows : commission.events.length },
  ...KIND_ORDER.map(value => ({ value, label: t.value.commissions.kind[value], count: byKind.value[value].count })),
]);
</script>

<style scoped>
.reward-income-summary { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 24px; padding: var(--ui-space-inline) 0; border-bottom: 1px solid var(--v5-border); }
.reward-income-summary__amount { margin: 6px 0 4px; font-size: 23px; font-weight: 600; font-variant-numeric: tabular-nums; }
.reward-income-uvt { margin-top: 6px; font-size: 16px; font-variant-numeric: tabular-nums; }
.reward-income-lifetime { display: flex; justify-content: space-between; gap: var(--ui-space-inline); font-size: 12px; color: var(--v5-ink-3); padding-bottom: 8px; }
.reward-income-lifetime__amounts { display: flex; flex-direction: column; gap: 4px; text-align: right; font-variant-numeric: tabular-nums; }
.reward-income-icon { width: 32px; height: 32px; color: var(--v5-ink-2); }
.reward-income-event { align-items: flex-start; }
.commission-filter-summary { display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;color:var(--v5-ink-2);font-size:12px; }
/* Keyboard focus must be visible on the self-drawn tiles/pills — they are
   focusable now (role+tabindex), and without this the focus ring is the
   browser default outline clipped by the scroll-view on the pill row. */
.nx-commissions-focusable:focus-visible,
.nx-commissions-pill:focus-visible {
  outline: 2px solid var(--v5-brand);
  outline-offset: 2px;
  border-radius: 12px;
}
</style>
