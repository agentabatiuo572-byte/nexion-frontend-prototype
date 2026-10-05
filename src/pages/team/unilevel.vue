<!--
  Influence Network Royalty — ported from
  Nexion-prototype/app/(main)/team/unilevel/page.tsx.
  Partner-program model: de-carded hero (monthly royalty total on the page
  floor + partner-status chip) + Direct Royalty / Network Yield Bonus /
  Partner Status sections as frosted-glass cards (owner 2026-07-09; chassis
  glass-tile tokens; tier grid keeps 4 filled cells, podium idiom + progress
  to next) + filter pills + member list (transparent hairline
  group). Sub-page → <AppChassis active="team"> w/ back → /team. Reuses network
  (byLayer) + commission config store + VBadge. useMemo → computed.
  React local state → ref. TickerNumber → direct value render (entrance tween dropped,
  values are store-derived not interval-driven). `${color}NN` alpha-hex →
  color-mix. banned hex #0F140A/#0E0E0E → tokens. De-MLM'd wording kept.
-->
<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.unilevel.pageTitle" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 16px">
        <view v-if="remoteApiEnabled && unilevelLoadError" :style="errorStateStyle">
          <text class="block" style="font-weight: 600">{{ t.network.projectionErrorTitle }}</text>
          <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ t.network.projectionErrorDesc }}</text>
          <view role="button" tabindex="0" :style="retryStyle" @click="retryRemote"><text>{{ t.network.retry }}</text></view>
        </view>
        <view v-else-if="remoteApiEnabled && unilevelLoading" class="rounded-2xl" style="height: 112px; background: color-mix(in srgb, var(--v5-surface-2) 65%, transparent)" role="status" aria-live="polite" aria-busy="true">
        </view>
        <view v-if="remoteApiEnabled && commission.configStatus === 'ready' && pausedLayers.length" :style="pausedLayersStyle">
          <text class="block" style="font-size: 13px; font-weight: 600; color: var(--v5-warning)">{{ t.unilevel.pausedLayersTitle }}</text>
          <text class="block" style="margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--v5-ink-3)">{{ pausedLayersText }}</text>
        </view>
        <!-- Hero — de-carded: royalty total sits directly on the page floor
             (bordered card + page-floor radial glow deleted outright, owner
             call 2026-07-08). Rules-intro pill sits on the section-title row
             (owner 2026-07-09: kill the empty gap above 本月版税). -->
        <view v-if="!remoteApiEnabled || commission.configStatus === 'ready'" :style="heroStyle">
          <view class="flex items-center justify-between" style="gap: 8px">
            <text class="font-mono-tabular" :style="heroCapStyle">{{ t.unilevel.heroLabel }}</text>
            <view class="nx-unilevel-how-link nx-unilevel-focus inline-flex items-center shrink-0 active:scale-[0.98]" :style="howEntryStyle" role="button" tabindex="0" :aria-label="t.unilevel.howItWorksEntry" @click="go('/pages/team/unilevel-how')"  @keydown.enter.prevent="go('/pages/team/unilevel-how')" @keydown.space.prevent="go('/pages/team/unilevel-how')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
              <text>{{ t.unilevel.howItWorksEntry }}</text>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </view>
          </view>
          <text class="block font-display tabular-nums" :style="heroBigStyle">{{ remoteApiEnabled ? (remoteState === 'ready' ? `$${remoteTotalUSDT.toFixed(2)}` : '—') : `$${totalRoyalty.toFixed(2)}` }}</text>
        </view>

        <view v-if="remoteApiEnabled && remoteState === 'ready' && commission.configStatus === 'ready'" :style="remoteBreakdownStyle">
          <view class="flex items-start" style="gap: 12px">
            <text class="rounded-xl grid place-items-center shrink-0" :style="compBadgeStyle('var(--v5-brand)')">D</text>
            <view class="flex-1 min-w-0">
              <text class="block" :style="compTitleStyle">{{ t.unilevel.directLabel }}</text>
              <text class="block" :style="compSubStyle">{{ remoteDirect.count }} {{ t.commissions.events }}</text>
            </view>
            <text class="font-display tabular-nums" :style="remoteAmountStyle">${{ remoteDirect.amountUSDT.toFixed(2) }}</text>
          </view>
          <view class="flex items-start" style="gap: 12px; margin-top: 14px">
            <text class="rounded-xl grid place-items-center shrink-0" :style="compBadgeStyle('var(--v5-brand-2)')">N</text>
            <view class="flex-1 min-w-0">
              <text class="block" :style="compTitleStyle">{{ t.unilevel.networkLabel }}</text>
              <text class="block" :style="compSubStyle">{{ remoteExtended.count }} {{ t.commissions.events }}</text>
            </view>
            <text class="font-display tabular-nums" :style="remoteAmountStyle">${{ remoteExtended.amountUSDT.toFixed(2) }}</text>
          </view>
          <text class="block font-mono-tabular" :style="remoteSplitNoteStyle">+{{ remoteTotalNEX.toLocaleString() }} NEX</text>
        </view>

        <!-- Royalty breakdown — Direct (D) + Network (N): one frosted-glass
             card each (owner 2026-07-09; chassis glass-tile tokens); colored
             badge chips + values carry the semantic identity. -->
        <view v-if="!remoteApiEnabled" class="nx-glass-card flex items-start" style="gap: 12px" :style="glassCardStyle">
          <text class="rounded-xl grid place-items-center shrink-0" :style="compBadgeStyle('var(--v5-brand)')">D</text>
          <view class="flex-1 min-w-0">
            <text class="block" :style="compTitleStyle">{{ t.unilevel.directLabel }}</text>
            <text class="block" :style="compSubStyle">{{ t.unilevel.directSub }}</text>
          </view>
          <view class="text-right shrink-0">
            <text class="block font-display tabular-nums" :style="{ fontSize: '20px', fontWeight: 600, color: 'var(--v5-brand)' }">${{ directRoyalty.toFixed(2) }}</text>
            <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ directMembersText }}</text>
          </view>
        </view>
        <view class="nx-glass-card" v-if="!remoteApiEnabled" :style="glassCardStyle">
          <view class="flex items-start" style="gap: 12px">
            <text class="rounded-xl grid place-items-center shrink-0" :style="compBadgeStyle('var(--v5-brand-2)')">N</text>
            <view class="flex-1 min-w-0">
              <text class="block" :style="compTitleStyle">{{ t.unilevel.networkLabel }}</text>
              <text class="block" :style="compSubStyle">{{ t.unilevel.networkSub }}</text>
            </view>
            <view class="text-right shrink-0">
              <text class="block font-display tabular-nums" :style="{ fontSize: '20px', fontWeight: 600, color: 'var(--v5-brand-2)' }">${{ networkBonus.toFixed(2) }}</text>
            </view>
          </view>
        </view>

        <!-- Filter pills — opens the member-list section, extra top break. -->
        <GlassSegments :label="t.unilevel.pageTitle" v-model="filter" :options="filterOptions" layout="wrap" style="margin-top: 6px"  />

        <!-- Member list — de-carded: transparent hairline group (leaderboard
             rest-list idiom); the surface + border shell was redundant
             boundary weight around already hairline-separated rows. -->
        <view v-if="remoteApiEnabled && remoteState === 'ready' && commission.configStatus === 'ready'" :style="memberGroupStyle">
          <view v-for="(event, i) in remoteFilteredEvents" :key="event.id" class="flex items-center" :style="memberRowStyle(i === remoteFilteredEvents.length - 1)">
            <view class="rounded-full grid place-items-center shrink-0" :style="memberAvatarStyle"><text style="font-size: 15px">↗</text></view>
            <view class="flex-1 min-w-0">
              <text class="block truncate" :style="{ fontSize: '13px', fontWeight: 500, color: 'var(--v5-ink)' }">{{ event.sourceUserName }}</text>
              <text class="block font-mono-tabular" :style="{ marginTop: '2px', fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ event.cycle }} · {{ event.layer === 1 ? t.unilevel.memberBadgeDirect : t.unilevel.memberBadgeExtended }} · {{ event.currency }}</text>
            </view>
            <view class="text-right"><text class="block font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: 'var(--v5-brand)' }">+${{ event.amountUSDT.toFixed(2) }}</text><text v-if="event.amountNEX > 0" class="block font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-brand-2)' }">+{{ event.amountNEX.toLocaleString() }} NEX</text></view>
          </view>
          <EmptyState v-if="remoteFilteredEvents.length === 0" kind="empty-list" :title="t.empty.commissionsTitle" :desc="t.empty.commissionsDesc" />
          <view
            v-if="remoteSnapshot && remoteSnapshot.events.length < remoteSnapshot.totalRows"
            class="nx-unilevel-load-more flex items-center justify-center active:opacity-70"
            :style="loadMoreBtnStyle"
            role="button"
            tabindex="0"
            :aria-disabled="remoteLoadMoreStatus === 'loading'"
            @click="loadMoreRemote"
            @keydown="activateRemoteLoadMore"
          >
            <text :style="loadMoreLabelStyle">{{ remoteLoadMoreStatus === "loading" ? "…" : remoteLoadMoreStatus === "error" ? t.network.retry : t.unilevel.loadMore }}</text>
          </view>
        </view>
        <view v-else-if="!remoteApiEnabled" :style="memberGroupStyle">
          <EmptyState v-if="filteredMembers.length === 0" kind="no-filter-results" :title="t.empty.filterTitle" :desc="t.empty.filterDesc" compact />
          <template v-else>
            <view
              v-for="(m, i) in visibleMembers"
              :key="m.id"
              class="nx-unilevel-member-row flex items-center"
              :style="memberRowStyle(i === visibleMembers.length - 1)"
            >
              <view class="rounded-full grid place-items-center shrink-0" :style="memberAvatarStyle">
                <text style="font-size: 20px; line-height: 1">{{ m.avatar }}</text>
              </view>
              <view class="flex-1 min-w-0">
                <view class="flex items-center" style="gap: 6px">
                  <text class="truncate" :style="{ fontSize: '13px', fontWeight: 500, color: 'var(--v5-ink)' }">{{ m.name }}</text>
                  <text v-if="m.isSpillover" class="font-mono-tabular" :style="spillTagStyle">{{ t.unilevel.spillTag }}</text>
                  <VBadge :v="m.vRank" size="sm" :show-title="false" />
                </view>
                <view class="flex items-center" style="margin-top: 2px; gap: 6px">
                  <view class="rounded-full" :style="{ width: '6px', height: '6px', background: statusColor(m.status) }" />
                  <text :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ m.status }} · {{ m.city }}</text>
                  <text class="font-mono-tabular" :style="memberBadgeStyle(m.kind)">{{ m.kind === "direct" ? t.unilevel.memberBadgeDirect : t.unilevel.memberBadgeExtended }}</text>
                </view>
              </view>
              <view class="text-right">
                <text class="font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: 'var(--v5-brand)' }">{{ remoteApiEnabled ? fmt(t.uiChrome.volumeShort, { amount: `$${m.monthVolumeUSD}` }) : `+$${memberCommission(m).toFixed(2)}` }}</text>
              </view>
            </view>
            <!-- View more — explicit user click (leaderboard idiom), 44px ghost. -->
            <view v-if="hasMoreMembers" class="nx-unilevel-load-more flex items-center justify-center active:opacity-70" :style="loadMoreBtnStyle" role="button" tabindex="0" @click="loadMoreMembers"  @keydown.enter.prevent="loadMoreMembers" @keydown.space.prevent="loadMoreMembers">
              <text :style="loadMoreLabelStyle">{{ t.unilevel.loadMore }}</text>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </view>
          </template>
        </view>
        <view v-else-if="remoteApiEnabled && unilevelLoading" :style="memberGroupStyle" role="status" aria-live="polite" aria-busy="true">
          <view class="rounded-2xl" style="height: 96px; background: color-mix(in srgb, var(--v5-surface-2) 65%, transparent)" />
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, nextTick, ref, watch, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VBadge from "@/components/team/v-badge.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useNetwork, type NetworkMember, type MemberStatus } from "@/store/network";
import { remoteApiEnabled, teamInsightsApi, sessionVault } from "@/api/runtime";
import { useAuth } from "@/store/auth";
import { binarySessionReady as accountSessionReady } from "@/lib/binary-session-ready";
import { createScopedReadCoalescer } from "@/lib/binary-read-coalescer";
import type { TeamUnilevelSnapshot } from "@/api/team-insights-api";
import { useApp } from "@/store/app";
import { useCommission } from "@/store/commission";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { navTo } from "@/lib/route";

type RateTierId = "standard" | "verified" | "elite" | "diamond";
interface RateTier {
  id: RateTierId;
  minVolume: number;
  color: string;
  bg: string;
}
const MOCK_RATE_TIERS: ReadonlyArray<RateTier> = [
  { id: "standard", minVolume: 0, color: "var(--v5-ink-3)", bg: "var(--v5-surface-2)" },
  { id: "verified", minVolume: 5_000, color: "var(--v5-success)", bg: "var(--v5-success-soft)" },
  { id: "elite", minVolume: 50_000, color: "var(--v5-tech-cyan)", bg: "var(--v5-tech-cyan-soft)" },
  { id: "diamond", minVolume: 500_000, color: "var(--v5-brand-2)", bg: "var(--v5-brand-2-soft)" },
];
function pickRateTier(monthlyVolume: number, tiers: ReadonlyArray<RateTier>): RateTier {
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (monthlyVolume >= tiers[i].minVolume) return tiers[i];
  }
  return tiers[0];
}
function nextRateTier(current: RateTier, tiers: ReadonlyArray<RateTier>): RateTier | null {
  const idx = tiers.findIndex((tier) => tier.id === current.id);
  return idx < tiers.length - 1 ? tiers[idx + 1] : null;
}

type FilterId = "all" | "direct" | "extended";
type PlottedMember = NetworkMember & { kind: "direct" | "extended" };

const t = useT();
const app = useApp();
const auth = useAuth();
const readCoalescer = createScopedReadCoalescer();
const remoteSessionReady = computed(() => accountSessionReady({
  remote: remoteApiEnabled,
  authenticated: auth.isAuthenticated,
  accountId: auth.accountId,
  appAccountKey: app.accountKey,
  sessionUserId: sessionVault.read()?.user.userId ?? null,
}));
const network = useNetwork();
const commission = useCommission();
const remoteSnapshot = ref<TeamUnilevelSnapshot | null>(null);
const remoteState = ref<"loading" | "ready" | "error">(remoteApiEnabled ? "loading" : "ready");
const remoteLoadMoreStatus = ref<"idle" | "loading" | "error">("idle");
let remoteRequest = 0;
let mounted = true;
onMounted(retryRemote);
onShow(retryRemote);
const unsubscribeRuntimeRevision = subscribeRuntimeRevision(() => {
  retryRemote();
});
watch(() => [app.accountKey, app.accountBindingEpoch] as const, () => {
  if (!remoteApiEnabled) return;
  remoteSnapshot.value = null;
  remoteState.value = "loading";
  remoteLoadMoreStatus.value = "idle";
  retryRemote();
});
watch(remoteSessionReady, (ready, wasReady) => {
  if (ready && !wasReady) retryRemote();
}, { immediate: true, flush: "post" });
async function loadRemote() {
  if (!remoteApiEnabled || !remoteSessionReady.value || !mounted) return;
  const request = ++remoteRequest;
  const accountKey = app.accountKey;
  const accountScope = captureAccountScope();
  const runScope = captureRuntimeRevision();
  remoteState.value = "loading";
  remoteLoadMoreStatus.value = "idle";
  remoteSnapshot.value = null;
  const current = () => mounted && request === remoteRequest && accountKey === app.accountKey
    && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope);
  try {
    const snapshot = await teamInsightsApi.unilevel("month", 1, 20);
    if (!current()) return;
    remoteSnapshot.value = snapshot;
    remoteState.value = "ready";
  } catch {
    if (!current()) return;
    remoteSnapshot.value = null;
    remoteState.value = "error";
  }
}
async function loadMoreRemote() {
  const currentSnapshot = remoteSnapshot.value;
  if (!remoteApiEnabled || !remoteSessionReady.value || !mounted || remoteState.value !== "ready" || !currentSnapshot
      || remoteLoadMoreStatus.value === "loading"
      || currentSnapshot.events.length >= currentSnapshot.totalRows) return;
  const accountKey = app.accountKey;
  const accountScope = captureAccountScope();
  const runScope = captureRuntimeRevision();
  const nextPage = currentSnapshot.page + 1;
  const request = remoteRequest;
  const current = () => mounted && request === remoteRequest && remoteSnapshot.value === currentSnapshot
    && accountKey === app.accountKey && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope);
  remoteLoadMoreStatus.value = "loading";
  try {
    const next = await teamInsightsApi.unilevel("month", nextPage, currentSnapshot.pageSize, currentSnapshot.snapshotAt);
    if (!current()) return;
    if (next.page !== nextPage) throw new Error("UNILEVEL_PAGE_MISMATCH");
    const seen = new Set(currentSnapshot.events.map((event) => event.id));
    remoteSnapshot.value = {
      ...next,
      events: [...currentSnapshot.events, ...next.events.filter((event) => !seen.has(event.id))],
    };
    remoteLoadMoreStatus.value = "idle";
  } catch {
    if (current()) remoteLoadMoreStatus.value = "error";
  }
}
function activateRemoteLoadMore(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  void loadMoreRemote();
}
onUnmounted(() => { unsubscribeRuntimeRevision(); mounted = false; remoteRequest += 1; remoteSnapshot.value = null; });
function retryRemote() {
  if (!remoteApiEnabled || !remoteSessionReady.value || !mounted) return;
  void readCoalescer.run({
    accountKey: app.accountKey,
    accountBindingEpoch: app.accountBindingEpoch,
    runtime: captureRuntimeRevision(),
  }, () => Promise.all([commission.ensureCanonicalConfig(), network.ensureCanonicalNetwork(), loadRemote()]).then(() => undefined));
}
const filter = ref<FilterId>("all");
const remoteFilteredEvents = computed(() => (remoteSnapshot.value?.events ?? []).filter((event) =>
  filter.value === "all" || (filter.value === "direct" ? event.layer === 1 : event.layer > 1),
));
const unilevelLoadError = computed(() => network.remoteStatus === "error"
  || remoteState.value === "error" || commission.configStatus === "error");
const unilevelLoading = computed(() => !unilevelLoadError.value && (
  network.remoteStatus !== "ready" || remoteState.value !== "ready" || commission.configStatus !== "ready"
));

const byLayer = computed(() => network.byLayer());
const directMembers = computed(() => byLayer.value[1] ?? []);
const extendedMembers = computed(() =>
  ([2, 3, 4, 5, 6, 7] as const).flatMap((L) => byLayer.value[L] ?? []),
);

const monthlyNetworkVolume = computed(() =>
  ([1, 2, 3, 4, 5, 6, 7] as const).reduce(
    (sum, L) => sum + (byLayer.value[L] ?? []).reduce((s, m) => s + m.monthVolumeUSD, 0),
    0,
  ),
);
const rateTiers = computed<ReadonlyArray<RateTier>>(() => {
  const thresholds = commission.config?.partnerThresholds;
  if (!remoteApiEnabled || !thresholds) return MOCK_RATE_TIERS;
  return [
    { ...MOCK_RATE_TIERS[0], minVolume: thresholds.standard },
    { ...MOCK_RATE_TIERS[1], minVolume: thresholds.verified },
    { ...MOCK_RATE_TIERS[2], minVolume: thresholds.premium },
    { ...MOCK_RATE_TIERS[3], minVolume: thresholds.diamond },
  ];
});
const currentTier = computed(() => pickRateTier(monthlyNetworkVolume.value, rateTiers.value));
const next = computed(() => nextRateTier(currentTier.value, rateTiers.value));

const directVolume = computed(() => directMembers.value.reduce((s, m) => s + m.monthVolumeUSD, 0));
const directRoyalty = computed(() => directVolume.value * commission.unilevelRate(1));
const networkBonus = computed(() =>
  extendedMembers.value.reduce((sum, m) => sum + m.monthVolumeUSD * commission.unilevelRate(m.layer), 0),
);
const influenceScore = computed(() => {
  const min = commission.config?.influenceClampMin ?? 1;
  const max = commission.config?.influenceClampMax ?? 5;
  if (monthlyNetworkVolume.value < 100) return min;
  return Math.min(max, Math.max(min, 1 + Math.log10(monthlyNetworkVolume.value / 100)));
});
const totalRoyalty = computed(() => directRoyalty.value + networkBonus.value);
const remoteDirect = computed(() => remoteSnapshot.value?.split.direct ?? { amountUSDT: 0, amountNEX: 0, count: 0 });
const remoteExtended = computed(() => remoteSnapshot.value?.split.extended ?? { amountUSDT: 0, amountNEX: 0, count: 0 });
const remoteTotalUSDT = computed(() => remoteDirect.value.amountUSDT + remoteExtended.value.amountUSDT);
const remoteTotalNEX = computed(() => remoteDirect.value.amountNEX + remoteExtended.value.amountNEX);
const canonicalPolicyText = computed(() => commission.config
  ? commission.config.coolingDays === null
    ? t.value.unilevel.canonicalPolicyUnavailable
    : fmt(t.value.unilevel.canonicalPolicy, { days: commission.config.coolingDays, multiplier: commission.config.promoMultiplier })
  : "");
const canonicalPeriodText = computed(() => remoteSnapshot.value
  ? t.value.unilevel.periods[remoteSnapshot.value.period] : "");
const pausedLayers = computed(() => commission.config
  ? ([1, 2, 3, 4, 5, 6, 7] as const).filter((layer) => commission.config?.unilevelPaused[layer])
  : []);
const pausedLayersText = computed(() => t.value.unilevel.pausedLayersDesc);
const filteredMembers = computed<PlottedMember[]>(() => {
  if (filter.value === "all") {
    return [
      ...directMembers.value.map((m) => ({ ...m, kind: "direct" as const })),
      ...extendedMembers.value.map((m) => ({ ...m, kind: "extended" as const })),
    ];
  }
  if (filter.value === "direct") return directMembers.value.map((m) => ({ ...m, kind: "direct" as const }));
  return extendedMembers.value.map((m) => ({ ...m, kind: "extended" as const }));
});

// Paginated load-more (leaderboard rest-list idiom): one screen per page,
// explicit "View more" click. Resets to page 1 when the filter changes.
const PAGE_SIZE = 20;
const visibleCount = ref(PAGE_SIZE);
watch(filter, () => { visibleCount.value = PAGE_SIZE; });
const visibleMembers = computed(() => filteredMembers.value.slice(0, visibleCount.value));
const hasMoreMembers = computed(() => visibleCount.value < filteredMembers.value.length);
function loadMoreMembers() {
  visibleCount.value = Math.min(filteredMembers.value.length, visibleCount.value + PAGE_SIZE);
}

// i18n text
const heroRateLineText = computed(() =>
  fmt(t.value.unilevel.heroRateLine, { rate: (commission.unilevelRate(1) * 100).toFixed(0), tier: t.value.unilevel.rateTiers[currentTier.value.id].name }),
);
const directRateText = computed(() => fmt(t.value.unilevel.directRateText, { rate: (commission.unilevelRate(1) * 100).toFixed(0) }));
const directMembersText = computed(() => fmt(t.value.unilevel.directMembersText, { n: directMembers.value.length }));
const rateTierCurrentText = computed(() => fmt(t.value.unilevel.rateTierCurrent, { tier: t.value.unilevel.rateTiers[currentTier.value.id].name }));
const rateTierProgressText = computed(() => {
  if (!next.value) return "";
  return fmt(t.value.unilevel.rateTierProgress, {
    remaining: Math.max(0, next.value.minVolume - monthlyNetworkVolume.value).toLocaleString(),
    next: t.value.unilevel.rateTiers[next.value.id].name,
  });
});
const rateTierMaxedText = computed(() => fmt(t.value.unilevel.rateTierMaxed, { tier: t.value.unilevel.rateTiers[currentTier.value.id].name }));

function tierVolLabel(minVolume: number): string {
  return minVolume >= 1000 ? `${minVolume / 1000}K+` : `${minVolume}`;
}
function statusColor(status: MemberStatus): string {
  return status === "active" ? "var(--v5-brand)" : status === "idle" ? "var(--v5-warning)" : "var(--v5-ink-4)";
}
function memberCommission(m: PlottedMember): number {
  return m.monthVolumeUSD * commission.unilevelRate(m.layer);
}

function go(url: string) {
  navTo(url);
}

// Filter pills are one roving-tabindex tablist: arrows move the selection and the
// focus ring follows it (same idiom as leaderboard.vue).
const FILTER_ORDER: FilterId[] = ["all", "direct", "extended"];
function moveFilter(delta: -1 | 1) {
  const currentIndex = FILTER_ORDER.indexOf(filter.value);
  filter.value = FILTER_ORDER[(currentIndex + delta + FILTER_ORDER.length) % FILTER_ORDER.length];
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>(".nx-unilevel-filter[tabindex='0']")?.focus();
  });
}

// ─── styles ───
// Pill chip on the title row: compact (34px) so it doesn't dominate the
// section-title line; soft tint only, no border (chip whitelist).
const howEntryStyle: CSSProperties = {
  gap: "6px",
  padding: "0 12px",
  minHeight: "44px",  // 《07》tap≥44(原 34)
  height: "34px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
};

// De-carded hero: no surface/border/glow — content sits directly on the page
// floor (page-floor auras are deleted outright per owner call, not re-tuned).
const heroStyle: CSSProperties = { padding: "6px 2px 0" };
const errorStateStyle: CSSProperties = { padding: "14px", borderRadius: "14px", background: "var(--v5-warning-soft)", color: "var(--v5-ink)" };
const pausedLayersStyle: CSSProperties = { padding: "12px 14px", borderRadius: "14px", background: "var(--v5-warning-soft)" };
const retryStyle: CSSProperties = { marginTop: "10px", minHeight: "44px", display: "grid", placeItems: "center", borderRadius: "999px", background: "var(--v5-surface-2)", color: "var(--v5-ink-2)" };
const remoteBreakdownStyle: CSSProperties = { padding: "16px", borderRadius: "16px", background: "var(--v5-glass-bg)", backdropFilter: "blur(18px) saturate(180%)" };
const remoteAmountStyle: CSSProperties = { fontSize: "20px", fontWeight: 600, color: "var(--v5-brand)" };
const remoteSplitNoteStyle: CSSProperties = { marginTop: "14px", fontSize: "12px", color: "var(--v5-ink-3)" };
const heroCapStyle: CSSProperties = { fontSize: "12px", fontWeight: 500, color: "var(--v5-brand)", letterSpacing: "0.06em" };
const heroBigStyle: CSSProperties = { marginTop: "8px", fontSize: "34px", fontWeight: 600, lineHeight: 1, letterSpacing: "-0.022em", color: "var(--v5-ink)" };
const heroTierChipStyle = computed<CSSProperties>(() => ({
  marginTop: "12px",
  padding: "4px 10px",
  borderRadius: "6px",
  fontSize: "12px",
  fontWeight: 600,
  background: `color-mix(in srgb, ${currentTier.value.color} 15%, transparent)`,
  color: currentTier.value.color,
}));

// Frosted-glass card shell (owner 2026-07-09) shared by the D / N / tier
// sections — theme-aware chassis glass-tile tokens; blur strength matches
// the genesis dock glass (Vue auto-prefixes backdropFilter inline).
// Fill only, zero border: bg-filled cards carry no border line (owner ruling
// 2026-07-09, same day).
const glassCardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  padding: "16px",
  borderRadius: "var(--nx-glass-radius)",
  background: "var(--nx-glass-fill)",
  backdropFilter: "none",
};
function compBadgeStyle(color: string): CSSProperties {
  return {
    width: "40px",
    height: "40px",
    background: `color-mix(in srgb, ${color} 22%, transparent)`,
    color,
    fontSize: "20px",
    fontWeight: 600,
  };
}
const compTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const compSubStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.375 }; // SKILL: leading-snug=1.375 (was 1.45)
// Inner note row under the N metrics.
const algoNoteStyle: CSSProperties = {
  marginTop: "10px",
  gap: "6px",
};

// Tier cells: fill only, no border (podium idiom — current cell tinted,
// the rest dimmed surface-2; text color carries the current accent).
function tierCardStyle(tier: RateTier): CSSProperties {
  const isCurrent = tier.id === currentTier.value.id;
  return {
    padding: "8px",
    background: isCurrent ? tier.bg : "color-mix(in srgb, var(--v5-surface-2) 55%, transparent)",
  };
}
const tierProgressFillStyle = computed<CSSProperties>(() => ({
  height: "100%",
  width: `${next.value ? Math.min(100, (monthlyNetworkVolume.value / next.value.minVolume) * 100) : 100}%`,
  background: next.value ? `linear-gradient(to right, ${currentTier.value.color}, ${next.value.color})` : currentTier.value.color,
  transition: "width 300ms ease",
}));
const maxedChipStyle: CSSProperties = {
  marginTop: "12px",
  gap: "6px",
  padding: "4px 10px",
  borderRadius: "6px",
  background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)",
  color: "var(--v5-brand-2)",
  fontSize: "12px",
  fontWeight: 600,
};

function pillStyle(active: boolean): CSSProperties {
  return {
    height: "44px",
    padding: "0 16px",
    gap: "6px",
    borderRadius: "999px",
    // 未选中态原用 surface-2,与页面底同色(亮色 ΔE 2.2)不可辨,改 L1 surface。
    background: active ? "var(--v5-brand)" : "var(--v5-surface)",
  };
}
function pillTextStyle(active: boolean): CSSProperties {
  return { fontSize: "12px", fontWeight: 600, color: active ? "var(--v5-on-brand)" : "var(--v5-ink-3)" };
}
function pillCountStyle(active: boolean): CSSProperties {
  return { fontSize: "12px", opacity: 0.65, color: active ? "var(--v5-on-brand)" : "var(--v5-ink-3)" };
}

// Transparent hairline group — border-top opener + 2px optical inset;
// rows sit on the page floor, content aligned to the 16px gutter.
const memberGroupStyle: CSSProperties = { padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
function memberRowStyle(isLast: boolean): CSSProperties {
  return { padding: "12px 0", gap: "12px", borderBottom: isLast ? "none" : "1px solid var(--v5-border)" };
}
// 头像框坐在透明发丝线组里(直接贴页面底),原 surface-2 同色不可辨,改 L1 surface。
const memberAvatarStyle: CSSProperties = { width: "36px", height: "36px", background: "var(--v5-surface)" };
// Ghost "View more" affordance — 44px tap target, boxed chrome dropped.
const loadMoreBtnStyle: CSSProperties = { gap: "6px", height: "44px", marginTop: "2px" };
const loadMoreLabelStyle: CSSProperties = { fontSize: "13px", fontWeight: 500, color: "var(--v5-ink-3)" };
const spillTagStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-brand-2)",
  background: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)",
  padding: "0 4px",
  borderRadius: "4px",
};
function memberBadgeStyle(kind: "direct" | "extended"): CSSProperties {
  const color = kind === "direct" ? "var(--v5-brand)" : "var(--v5-tech-cyan)";
  return {
    marginLeft: "auto",
    padding: "0 4px",
    borderRadius: "4px",
    fontSize: "12px",
    letterSpacing: "0.04em",
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    color,
  };
}

import GlassSegments from "@/components/glass-segments.vue";
const filterOptions = computed(() => [
  { value: "all", label: t.value.unilevel.filterAll, count: !remoteApiEnabled || network.remoteStatus === "ready" ? directMembers.value.length + extendedMembers.value.length : "—", className: "nx-unilevel-filter-all" },
  { value: "direct", label: t.value.unilevel.filterDirect, count: !remoteApiEnabled || network.remoteStatus === "ready" ? directMembers.value.length : "—", className: "nx-unilevel-filter-direct" },
  { value: "extended", label: t.value.unilevel.filterExtended, count: !remoteApiEnabled || network.remoteStatus === "ready" ? extendedMembers.value.length : "—", className: "nx-unilevel-filter-extended" },
]);
</script>

<style scoped>
/* The filter pills and the rules entry are keyboard-focusable now; the ring must be
   visible inside the horizontal scroll-view (default outline gets clipped). */
.nx-unilevel-filter:focus-visible,
.nx-unilevel-focus:focus-visible {
  outline: 2px solid var(--v5-brand);
  outline-offset: 2px;
}
</style>
