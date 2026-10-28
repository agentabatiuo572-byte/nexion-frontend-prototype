<template>
  <AppChassis active="team">
    <RewardPageSurface>
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.headerTitles.teamCommissions" :subtitle="t.headerSubtitles.teamCommissions" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <EmptyState
          v-if="remoteApiEnabled && !ledger"
          :kind="commission.eventsStatus === 'error' ? 'recoverable-error' : 'empty-list'"
          :title="commission.eventsStatus === 'error' ? t.network.projectionErrorTitle : t.network.projectionLoadingTitle"
          :desc="commission.eventsStatus === 'error' ? t.network.projectionErrorDesc : undefined"
          :cta-label="commission.eventsStatus === 'error' ? t.network.retry : undefined"
          compact
          @cta="commission.refreshCanonicalEvents()"
        />
        <template v-if="!remoteApiEnabled || ledger !== null">

        <RewardHero class="commission-overview" kind="ledger" panel :label="t.commissions.thisMonth">
          <text class="reward-amount">{{ assetTotal(monthTotals.usdt, 'usdt') }}</text>
          <text class="block reward-income-uvt">{{ assetTotal(monthTotals.nex, 'uvt') }}</text>
          <template #footer><view class="commission-overview__rules nx-commissions-focusable" role="link" tabindex="0" :aria-label="t.commissions.howItWorksEntry" @click="go('/pages/team/commissions-how')" @keydown.enter.prevent="go('/pages/team/commissions-how')" @keydown.space.prevent="go('/pages/team/commissions-how')"><text>{{ t.commissions.howItWorksEntry }}</text></view></template>
        </RewardHero>
        <view class="reward-income-summary">
          <view>
            <text class="block reward-caption">{{ t.directReferral.creditedTotal }}</text>
            <text class="block reward-income-summary__amount">${{ assetNumber('unlockedUSDT', commission.unlockedUSDT()) }}</text>
            <text class="block reward-caption">{{ assetNumber('unlockedNEX', commission.unlockedNEX()) }} UVT</text>
          </view>
          <view>
            <text class="block reward-caption">{{ t.commissions.cooling }}</text>
            <text class="block reward-income-summary__amount">${{ assetNumber('coolingUSDT', commission.coolingUSDT()) }}</text>
            <text class="block reward-caption">{{ coolingOverviewText }}</text>
          </view>
        </view>
        <view class="reward-income-lifetime"><text>{{ t.commissions.lifetime }}</text><view class="reward-income-lifetime__amounts"><text>{{ assetTotal(lifetimeTotals.usdt, 'usdt') }}</text><text>{{ assetTotal(lifetimeTotals.nex, 'uvt') }}</text></view></view>


        <view class="commission-filter-bar">
          <text>{{ filterCopy.title }}</text>
          <view class="commission-filter-trigger" role="button" tabindex="0" aria-haspopup="dialog" :aria-expanded="filterOpen" @click="filterOpen = true" @keydown.enter.prevent="filterOpen = true" @keydown.space.prevent="filterOpen = true">
            <text>{{ selectedFilterLabel }}</text><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </view>
        </view>

        <view v-if="filter !== 'all'" class="commission-filter-summary"><text>{{ t.commissions.kind[filter] }}</text><text>${{ visibility.mask(formatAmount(byKind[filter].usdt)) }} · {{ visibility.mask(formatAmount(byKind[filter].nex)) }} UVT</text></view>

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
                <text v-if="e.amountNEX > 0" class="block font-mono-tabular tabular-nums" :style="commissionAmountStyle(e, 'uvt')">{{ commissionNexLabel(e) }}</text>
                <text v-if="e.status === 'cooling'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-warning)', marginTop: '2px' }">{{ coolingTag(e) }}</text>
                <text v-else-if="e.status === 'unlocked'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-success)', marginTop: '2px' }">{{ t.commissions.readyTag }}</text>
                <text v-else-if="e.status === 'withdrawn'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ t.commissions.withdrawnTag }}</text>
                <text v-else-if="e.status === 'frozen'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-2)', marginTop: '2px' }">{{ t.commissions.frozenTag }}</text>
                <text v-else-if="e.status === 'reversed'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-4)', marginTop: '2px' }">{{ t.commissions.reversedTag }}</text>
                <text v-else-if="e.status === 'rejected'" class="block" :style="{ fontSize: '12px', color: 'var(--v5-danger)', marginTop: '2px' }">{{ t.commissions.rejectedTag }}</text>
                <text v-else-if="e.status === 'waiting_calculation'" class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.directReferral.waitingCalculation }}</text>
                <text v-else-if="e.status === 'recovery_pending'" class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.directReferral.recoveryPending }}</text>
                <text v-if="e.status === 'recovery_pending' && e.recoveryPendingUSDT !== undefined && e.recoveryPendingNEX !== undefined" class="block" style="font-size: 12px; color: var(--v5-warning)">{{ fmt(t.directReferral.pendingAmounts, { usdt: visibility.mask(formatAmount(e.recoveryPendingUSDT)), nex: visibility.mask(formatAmount(e.recoveryPendingNEX)) }) }}</text>
              </view>
            </view>
        </view>
            <view
              v-if="hasMoreEvents"
              class="reward-cta reward-cta--wide"
              role="button"
              :tabindex="commission.eventsStatus !== 'ready' || commission.eventsLoadMoreStatus === 'loading' ? -1 : 0"
              :aria-disabled="commission.eventsStatus !== 'ready' || commission.eventsLoadMoreStatus === 'loading'"
              :aria-busy="commission.eventsLoadMoreStatus === 'loading'"
              @click="loadMoreEvents"
              @keydown="activateLoadMore"
            >
              <text>{{ commission.eventsLoadMoreStatus === "error" ? t.network.retry : t.unilevel.loadMore }}</text>
            </view>
        </template>
      </view>
    </view>
    <NxSheet :open="filterOpen" :title="filterCopy.title" @close="filterOpen = false">
      <view class="commission-filter-options">
        <view v-for="option in filterOptions" :key="option.value" class="commission-filter-option" :class="{ 'commission-filter-option--selected': filter === option.value }" role="button" tabindex="0" :aria-pressed="filter === option.value" :aria-label="option.fullLabel" @click="selectFilter(option.value)" @keydown.enter.prevent="selectFilter(option.value)" @keydown.space.prevent="selectFilter(option.value)">
          <text>{{ option.label }}</text><text class="commission-filter-option__count">{{ visibility.mask(option.count ?? '—') }}</text>
        </view>
      </view>
    </NxSheet>
    </RewardPageSurface>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatAmount, formatGroupedAmount } from "@/lib/amount-display";
import { navTo } from "@/lib/route";
import { ref, computed, watch, onMounted, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import RewardHero from "@/components/team/reward-compact-hero.vue";
import RewardPageSurface from "@/components/team/reward-page-surface.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import NxSheet from "@/components/ui/nx-sheet.vue";
import { commissionFilterCopy } from '@/i18n/commission-filter-copy';
import { useApp } from '@/store/app';
import { useAuth } from '@/store/auth';
import { useLocaleStore } from '@/store/locale';
import { useDataVisibility } from '@/store/data-visibility';
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { formatTrialDate } from "@/lib/trial-date";
import { useCommission, type CommissionEvent, type CommissionKind } from "@/store/commission";
import { apiRuntimeConfig, remoteApiEnabled } from "@/api/runtime";

const t = useT();
const commission = useCommission();
const app = useApp();
const auth = useAuth();
const locale = useLocaleStore();
const visibility = useDataVisibility();
const displayEnvironment = [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const;
let environmentInvalidated = false;
watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => { environmentInvalidated = true; }, { flush: 'sync' });
const displayEnvironmentCurrent = () => !environmentInvalidated && displayEnvironment[0] === apiRuntimeConfig.environment && displayEnvironment[1] === apiRuntimeConfig.baseUrl;
const ledgerPresentation = ref<NonNullable<typeof commission.eventsEvidence> | null>(null);
let rejectedledgerSource: NonNullable<typeof commission.eventsEvidence> | null = null;
watch(() => [commission.eventsStatus, commission.eventsEvidence] as const, ([status, value]) => {
  if (status === 'error') { ledgerPresentation.value = null; rejectedledgerSource = value; }
  else if (status === 'ready' && auth.isAuthenticated && displayEnvironmentCurrent() && value && value !== rejectedledgerSource) ledgerPresentation.value = value;
}, { immediate: true, flush: 'sync' });
watch(() => [app.accountKey, app.accountBindingEpoch, auth.isAuthenticated, locale.code, apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => {
  rejectedledgerSource = commission.eventsEvidence; ledgerPresentation.value = null;
  if (auth.isAuthenticated && displayEnvironmentCurrent()) void commission.refreshCanonicalEvents();
}, { flush: 'sync' });
const ledger = computed(() => commission.eventsStatus === 'error' ? null : ledgerPresentation.value);

type Filter = "all" | CommissionKind;
const filter = ref<Filter>("all");
const filterOpen = ref(false);
const filterCopy = computed(() => commissionFilterCopy(locale.code));
const selectedFilterLabel = computed(() => filter.value === 'all' ? filterCopy.value.all : filterCopy.value.kinds[filter.value]);
function selectFilter(value: Filter) { filter.value = value; filterOpen.value = false; }

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

const events = computed(() => remoteApiEnabled ? ledger.value?.events ?? [] : commission.events);
const byKind = computed(() => remoteApiEnabled ? ledger.value?.aggregate.byKind ?? commission.byKind() : commission.byKind());
const filtered = computed(() =>
  filter.value === "all" ? events.value : events.value.filter((e) => e.kind === filter.value),
);
const hasMoreEvents = computed(() => remoteApiEnabled && ledger.value !== null && ledger.value.events.length < ledger.value.totalRows);
// Read canonical totals directly so a missing asset remains unknown instead of
// inheriting a store helper's zero fallback. Never total the current page.
const monthTotals = computed(() => remoteApiEnabled
  ? { usdt: ledger.value?.aggregate.monthUSDT, nex: ledger.value?.aggregate.monthNEX }
  : { usdt: commission.monthUSDT(), nex: commission.monthNEX() });
const lifetimeTotals = computed(() => remoteApiEnabled
  ? { usdt: ledger.value?.aggregate.totalUSDT, nex: ledger.value?.aggregate.totalNEX }
  : { usdt: commission.totalUSDTLifetime(), nex: commission.totalNEXLifetime() });
function assetNumber(key: 'unlockedUSDT' | 'unlockedNEX' | 'coolingUSDT', mock: number): string {
  const value = remoteApiEnabled ? ledger.value?.aggregate[key] : mock;
  return visibility.mask(typeof value === 'number' && Number.isFinite(value) ? formatAmount(value) : '—');
}
function assetTotal(value: number | null | undefined, asset: 'usdt' | 'uvt'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return asset === 'uvt' ? `${visibility.mask('—')} UVT` : `${visibility.mask('—')} USD`;
  return asset === 'usdt' ? `$${visibility.mask(formatAmount(value))}` : `${visibility.mask(formatAmount(value))} UVT`;
}
function loadMoreEvents() {
  if (commission.eventsStatus !== 'ready' || !hasMoreEvents.value || commission.eventsLoadMoreStatus === 'loading') return;
  void commission.loadMoreCanonicalEvents();
}

const coolingOverviewText = computed(() => {
  if (remoteApiEnabled) {
    const next = ledger.value?.aggregate.nextUnlockAt;
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
  const order = e.sourceRef ? ` · ${e.kind === "direct_purchase" ? t.value.directReferral.order : t.value.directReferral.receipt} ${e.sourceRef}` : e.orderAmountUSD ? ` · ${t.value.commissions.orderPrefix}${visibility.mask(formatGroupedAmount(e.orderAmountUSD))}` : "";
  const device = e.sourceDeviceId ? ` · ${t.value.directReferral.device}: ${e.sourceDeviceId}` : "";
  const date = formatTrialDate(e.ts, dateLocale());
  return `${kindLabel}${order}${device} · ${date}`;
}
function coolingTag(e: CommissionEvent): string {
  const days = Math.max(0, Math.ceil((e.unlockAt - Date.now()) / 86400000));
  return fmt(t.value.commissions.coolingTag, { n: days });
}

function commissionAmountLabel(e: CommissionEvent): string {
  const amount = `$${visibility.mask(formatAmount(e.amountUSDT))}`;
  if (e.status === "reversed") return `−${amount}`;
  if (e.status === "frozen" || e.status === "rejected" || e.status === "recovery_pending") return amount;
  return `+${amount}`;
}

function commissionNexLabel(e: CommissionEvent): string {
  const amount = `${visibility.mask(formatAmount(e.amountNEX))} UVT`;
  if (e.status === "reversed") return `−${amount}`;
  if (e.status === "frozen" || e.status === "rejected" || e.status === "recovery_pending") return amount;
  return `+${amount}`;
}

function commissionAmountStyle(e: CommissionEvent, asset: "usdt" | "uvt"): CSSProperties {
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
  return `${t.value.commissions.kind[k]} · ${visibility.mask(formatAmount(byKind.value[k].usdt))} · ${visibility.mask(byKind.value[k].count)} ${t.value.commissions.events}`;
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


const filterOptions = computed(() => [
  { value: "all" as Filter, label: filterCopy.value.all, fullLabel: t.value.commissions.all, count: remoteApiEnabled ? ledger.value?.totalRows : commission.events.length },
  ...KIND_ORDER.map(value => ({ value, label: filterCopy.value.kinds[value], fullLabel: t.value.commissions.kind[value], count: byKind.value[value].count })),
]);
</script>

<style scoped>
.commission-overview.reward-hero--panel { position: relative; box-sizing: border-box; min-height: 136px; padding: 14px 16px 18px; }
.commission-overview :deep(.reward-hero__art) { --team-art-size: 64px; flex-basis: 64px; align-self: flex-start; }
.commission-overview .reward-income-uvt { padding-right: 48px; }
.commission-overview__rules { position: absolute; right: 10px; bottom: 2px; display: flex; align-items: center; justify-content: flex-end; box-sizing: border-box; min-width: 44px; min-height: 44px; padding: 0 6px; background: transparent; color: var(--v5-ink-3); font-size: 12px; font-weight: 400; line-height: 16px; cursor: pointer; }
.reward-income-summary { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 24px; padding: var(--ui-space-inline) 0; border-bottom: 1px solid var(--v5-border); }
.reward-income-summary__amount { margin: 6px 0 4px; font-size: 23px; font-weight: 600; font-variant-numeric: tabular-nums; }
.reward-income-uvt { margin-top: 6px; font-size: 16px; font-variant-numeric: tabular-nums; }
.reward-income-lifetime { display: flex; justify-content: space-between; gap: var(--ui-space-inline); font-size: 12px; color: var(--v5-ink-3); padding-bottom: 8px; }
.reward-income-lifetime__amounts { display: flex; flex-direction: column; gap: 4px; text-align: right; font-variant-numeric: tabular-nums; }
.reward-income-icon { width: 32px; height: 32px; color: var(--v5-ink-2); }
.reward-income-event { align-items: flex-start; }
.commission-filter-summary { display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;color:var(--v5-ink-2);font-size:12px; }
.commission-filter-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--v5-ink-3); font-size: var(--ui-type-list-subtitle); }
.commission-filter-trigger { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-height: 44px; max-width: 70%; color: var(--v5-ink); font-weight: 500; cursor: pointer; }
.commission-filter-trigger svg { flex: none; }
.commission-filter-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.commission-filter-option { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; min-height: 44px; box-sizing: border-box; border-radius: 12px; background: var(--v5-surface-2); font-size: var(--ui-type-list-subtitle); line-height: 1.4; overflow-wrap: anywhere; cursor: pointer; }
.commission-filter-option--selected { color: var(--v5-brand); background: var(--v5-brand-soft); }
.commission-filter-option__count { flex: none; font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); font-variant-numeric: tabular-nums; }
.commission-filter-trigger:focus-visible, .commission-filter-option:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
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
