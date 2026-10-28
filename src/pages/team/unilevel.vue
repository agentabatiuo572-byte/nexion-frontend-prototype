<template>
  <AppChassis active="team">
    <RewardPageSurface>
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.directReferral.title" :action-label="t.unilevel.howItWorksEntry" :action="openRules" plain />
      <view class="px-4" style="display: flex; flex-direction: column; gap: 16px">
        <EmptyState v-if="remoteState === 'error'" kind="recoverable-error" :title="updateRequired ? t.directReferral.updateRequired : t.network.projectionErrorTitle" :desc="updateRequired ? t.directReferral.updateHint : t.network.projectionErrorDesc" :cta-label="t.network.retry" @cta="retryRemote" />
        <view v-else-if="remoteState !== 'ready' && !remoteSnapshot" role="status" aria-busy="true"><text>{{ t.network.projectionLoadingTitle }}</text></view>
        <template v-else-if="remoteSnapshot">
          <RewardHero kind="members" panel>
            <text class="block" style="font-size: var(--ui-type-section); font-weight: 600">{{ filter === 'device_earning' ? t.directReferral.deviceEarning : t.directReferral.purchaseTotal }}</text>
            <view class="nx-royalty-totals" :class="{ 'nx-royalty-totals-large': wideAmount(remoteTotalUSDT) || wideAmount(remoteTotalNEX) }">
              <view><text class="block font-display tabular-nums nx-direct-amount" :style="{ fontSize: amount(remoteTotalUSDT).length > 18 ? '20px' : '26px', fontWeight: 600, color: 'var(--v5-ink)' }">${{ amount(remoteTotalUSDT) }}</text></view>
              <view><text class="block font-display tabular-nums nx-direct-amount" :style="{ fontSize: amount(remoteTotalNEX).length > 18 ? '20px' : '26px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ amount(remoteTotalNEX) }}</text><text>UVT</text></view>
            </view>
            <text class="block" style="margin-top: 8px; font-size: 12px; color: var(--v5-ink-3)">{{ remoteGroupCount }} {{ t.directReferral.settlementGroups }}</text>
            <text class="block" style="margin-top: 6px; font-size: 12px; line-height: 1.6; color: var(--v5-ink-3)">{{ auditCopy.netSummary }}</text>
          </RewardHero>
        </template>
        <GlassSegments :label="t.directReferral.period" v-model="period" :options="periodOptions" layout="scroll" />
        <GlassSegments :label="t.directReferral.source" v-model="filter" :options="filterOptions" layout="wrap" />
        <view v-if="(remoteState === 'ready' || remoteState === 'loading') && remoteSnapshot" style="border-top: 1px solid var(--v5-border)">
          <view v-for="event in remoteSnapshot.events" :key="event.id" class="nx-direct-event" style="padding: 14px 0; border-bottom: 1px solid var(--v5-border)">
            <view :class="{ 'nx-royalty-event-large': wideAmount(event.amountUSDT) || wideAmount(event.amountNEX) }" style="display: flex; justify-content: space-between; gap: 10px">
              <view style="flex: 1; min-width: 0">
                <text class="block" style="font-size: var(--ui-type-list-subtitle); overflow-wrap: anywhere">{{ event.sourceUserName }}</text>
                <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ filter === 'device_earning' ? t.directReferral.deviceEarning : filter === 'direct' ? t.directReferral.purchase : t.directReferral.networkPurchase }}</text>
              </view>
              <view style="max-width: 58%; text-align: right">
                <text class="block font-mono-tabular nx-direct-amount" style="color: var(--v5-ink)">${{ amount(event.amountUSDT) }}</text>
                <text class="block font-mono-tabular nx-direct-amount" style="color: var(--v5-ink)">{{ amount(event.amountNEX) }} UVT</text>
              </view>
            </view>
            <text class="block nx-unilevel-details">{{ logicCopy.eventAt }}: {{ teamEventDate(event.ts, locale.code) }}</text>
            <view style="margin-top: 6px"><text class="nx-royalty-status">{{ statusText(event) }}</text></view>
            <text v-if="event.status === 'recovery_pending'" class="block nx-direct-amount" style="margin-top: 4px; font-size: 12px; color: var(--v5-warning)">{{ fmt(auditCopy.pendingRecovery, { usdt: '$' + amount(event.recoveryPendingUSDT), uvt: amount(event.recoveryPendingNEX) }) }}</text>
            <view role="button" tabindex="0" class="nx-unilevel-focus nx-unilevel-details-toggle" :aria-expanded="expandedRecords.includes(event.id)" @click="toggleRecord(event.id)" @keydown.enter.prevent="toggleRecord(event.id)" @keydown.space.prevent="toggleRecord(event.id)"><text>{{ expandedRecords.includes(event.id) ? auditCopy.hideDetails : auditCopy.recordDetails }}</text></view>
            <view v-if="expandedRecords.includes(event.id)" class="nx-unilevel-details">
              <text class="block">{{ filter === 'device_earning' ? t.directReferral.receipt : t.directReferral.order }} · {{ sourceReference(event) }}</text>
              <text v-if="'sourceDeviceId' in event && event.sourceDeviceId" class="block">{{ t.directReferral.device }}: {{ event.sourceDeviceId }}</text>
              <text class="block">{{ t.directReferral.settlement }}: {{ event.id }}</text>
              <text class="block">{{ logicCopy.settledAt }}: {{ logicCopy.dateUnavailable }}</text>
              <text v-if="event.status === 'cooling' || ('statusUSDT' in event && event.statusUSDT === 'cooling') || ('statusNEX' in event && event.statusNEX === 'cooling')" class="block">{{ logicCopy.expectedUnlockAt }}: {{ teamEventDate(event.unlockAt, locale.code) }}</text>
            </view>
          </view>
          <EmptyState v-if="remoteSnapshot.totalRows === 0" kind="no-filter-results" :title="t.directReferral.empty" :desc="t.directReferral.emptyDesc" />
          <view v-if="remoteSnapshot.totalRows === 0" role="button" tabindex="0" class="nx-unilevel-focus reward-cta" @click="go('/pages/team/team')" @keydown.enter.prevent="go('/pages/team/team')" @keydown.space.prevent="go('/pages/team/team')"><text>{{ t.directReferral.invite }}</text></view>
          <view v-if="remoteSnapshot.events.length < remoteSnapshot.totalRows" class="nx-unilevel-load-more nx-unilevel-focus reward-cta reward-cta--wide" role="button" :tabindex="remoteState !== 'ready' || remoteLoadMoreStatus === 'loading' ? -1 : 0" :aria-disabled="remoteState !== 'ready' || remoteLoadMoreStatus === 'loading'"  @click="loadMoreRemote" @keydown.enter.prevent="loadMoreRemote" @keydown.space.prevent="loadMoreRemote"><text>{{ remoteLoadMoreStatus === 'error' ? t.network.retry : t.unilevel.loadMore }}</text></view>
        </view>
        <view v-if="policyState === 'error'" role="alert">
          <text class="block">{{ t.directReferral.policyError }}</text>
          <view role="button" tabindex="0" class="nx-unilevel-focus reward-cta" @click="retryRemote" @keydown.enter.prevent="retryRemote" @keydown.space.prevent="retryRemote"><text>{{ t.network.retry }}</text></view>
        </view>
        <view v-else-if="policyState !== 'ready' && !policy" role="status" aria-busy="true"><text>{{ t.network.projectionLoadingTitle }}</text></view>
        <view v-else-if="policy" style="display: flex; flex-direction: column; gap: 8px">
          <text v-if="!policy.configured" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.directReferral.unconfigured }}</text>
          <text v-else-if="policy.nexUsdtPrice === null" style="font-size: 12px; color: var(--v5-warning)">{{ t.directReferral.priceUnavailable }}</text>
        </view>
        <view role="button" tabindex="0" class="nx-unilevel-focus nx-unilevel-details-toggle" :aria-expanded="showSettlementDetails" @click="showSettlementDetails = !showSettlementDetails" @keydown.enter.prevent="showSettlementDetails = !showSettlementDetails" @keydown.space.prevent="showSettlementDetails = !showSettlementDetails"><text>{{ auditCopy.settlementDetails }}</text><text aria-hidden="true">{{ showSettlementDetails ? '−' : '+' }}</text></view>
        <view v-if="showSettlementDetails" class="nx-unilevel-details">
          <text class="block">{{ t.directReferral.netHint }}</text>
          <text v-if="filter === 'device_earning'" class="block">{{ t.directReferral.platformPays }}</text>
          <template v-if="(policyState === 'ready' || policyState === 'loading') && policy">
            <text class="block">{{ ruleDescription }}</text>
          </template>
        </view>
      </view>
    </view>
    </RewardPageSurface>
  </AppChassis>
</template>

<script setup lang="ts">
import { teamLogicCopy } from "@/i18n/team-logic-copy";
import { teamEventDate } from "@/lib/team-event-date";
import { formatAmount } from "@/lib/amount-display";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import RewardHero from "@/components/team/reward-compact-hero.vue";
import RewardPageSurface from "@/components/team/reward-page-surface.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import EmptyState from "@/components/empty-state.vue";
import GlassSegments from "@/components/glass-segments.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { fmt, dateLocale } from "@/i18n/format";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { apiClient, apiRuntimeConfig, expectedApiEnvironment, remoteApiEnabled, sessionVault } from "@/api/runtime";
import { createDirectReferralApi, type DirectReferralPolicy, type DirectReferralSnapshot, type DirectReferralEvent, type DirectReferralPeriod } from "@/api/direct-referral-api";
import { createTeamInsightsApi, type TeamUnilevelSnapshot, type TeamUnilevelEvent } from "@/api/team-insights-api";
import { binarySessionReady as accountSessionReady } from "@/lib/binary-session-ready";
import { createScopedReadCoalescer } from "@/lib/binary-read-coalescer";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { navTo } from "@/lib/route";
import { formatHowNumber } from "@/lib/rank-how-content";

const t = useT(), app = useApp(), auth = useAuth();
const locale = useLocaleStore();
const logicCopy = computed(() => teamLogicCopy(locale.code));
const auditCopy = computed(() => networkReauditCopy(locale.code));
const expandedRecords = ref<string[]>([]);
const showSettlementDetails = ref(false);
function toggleRecord(id: string) {
  expandedRecords.value = expandedRecords.value.includes(id)
    ? expandedRecords.value.filter(value => value !== id) : [...expandedRecords.value, id];
}
const readEnvironment = [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const;
let environmentInvalidated = false;
watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => { environmentInvalidated = true; }, { flush: 'sync' });
const environmentCurrent = () => !environmentInvalidated && readEnvironment[0] === apiRuntimeConfig.environment && readEnvironment[1] === apiRuntimeConfig.baseUrl;
const directApi = createDirectReferralApi(apiClient, expectedApiEnvironment);
const purchaseApi = createTeamInsightsApi(apiClient, expectedApiEnvironment);
let readCoalescer = createScopedReadCoalescer();
const period = ref<DirectReferralPeriod>("month");
const filter = ref<"direct" | "extended" | "device_earning">("direct");
const remoteSnapshot = ref<TeamUnilevelSnapshot | DirectReferralSnapshot | null>(null);
const policy = ref<DirectReferralPolicy | null>(null);
const remoteState = ref<"loading" | "ready" | "error">("loading");
const policyState = ref<"loading" | "ready" | "error">("loading");
const remoteLoadMoreStatus = ref<"idle" | "loading" | "error">("idle");
const updateRequired = ref(false);
let remoteRequest = 0, mounted = true, querySnapshotAt: string | null = null;
const remoteSessionReady = computed(() => accountSessionReady({
  remote: remoteApiEnabled, authenticated: auth.isAuthenticated, accountId: auth.accountId,
  appAccountKey: app.accountKey, sessionUserId: sessionVault.read()?.user.userId ?? null,
}));
function readPage(page = 1, pageSize = 20) {
  return filter.value === "device_earning"
    ? directApi.snapshot(period.value, page, pageSize, querySnapshotAt, "device_earning")
    : purchaseApi.unilevel(period.value, page, pageSize, querySnapshotAt, filter.value);
}
async function loadRemote() {
  if (!remoteSessionReady.value || !mounted || !environmentCurrent()) return;
  const request = ++remoteRequest, accountKey = app.accountKey, selectedPeriod = period.value, selectedFilter = filter.value;
  const accountScope = captureAccountScope(), runScope = captureRuntimeRevision();
  remoteState.value = "loading"; policyState.value = "loading"; remoteLoadMoreStatus.value = "idle"; updateRequired.value = false;
  const readLocale = locale.code;
  const current = () => mounted && request === remoteRequest && accountKey === app.accountKey && selectedPeriod === period.value && selectedFilter === filter.value
    && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope) && readLocale === locale.code && environmentCurrent();
  await Promise.all([
    readPage().then(snapshot => { if (current()) { querySnapshotAt = snapshot.snapshotAt; remoteSnapshot.value = snapshot; remoteState.value = "ready"; } })
      .catch((error: unknown) => { if (current()) { remoteSnapshot.value = null; updateRequired.value = error instanceof Error && ["TEAM_SCHEMA_UPDATE_REQUIRED", "TEAM_SCHEMA_VERSION_UNSUPPORTED", "DIRECT_REFERRAL_SCHEMA_VERSION_UNSUPPORTED"].includes(error.message); remoteState.value = "error"; } }),
    directApi.policy().then(snapshot => { if (current()) { policy.value = snapshot; policyState.value = "ready"; } })
      .catch(() => { if (current()) { policy.value = null; policyState.value = "error"; } }),
  ]);
}
async function loadMoreRemote() {
  const snapshot = remoteSnapshot.value;
  if (!mounted || !remoteSessionReady.value || remoteState.value !== "ready" || !snapshot
    || remoteLoadMoreStatus.value === "loading" || snapshot.events.length >= snapshot.totalRows) return;
  const request = remoteRequest, accountKey = app.accountKey, accountScope = captureAccountScope(), runScope = captureRuntimeRevision(), readLocale = locale.code;
  const current = () => mounted && request === remoteRequest && remoteSnapshot.value === snapshot && accountKey === app.accountKey
    && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope);
  remoteLoadMoreStatus.value = "loading";
  try {
    const next = await readPage(snapshot.page + 1, snapshot.pageSize);
    if (!current()) return;
    if (next.page !== snapshot.page + 1 || next.snapshotAt !== snapshot.snapshotAt || next.totalRows !== snapshot.totalRows) throw new Error("REWARD_PAGE_MISMATCH");
    const seen = new Set(snapshot.events.map(event => event.id));
    const events = [...snapshot.events, ...(next.events as (TeamUnilevelEvent | DirectReferralEvent)[]).filter(event => !seen.has(event.id))];
    remoteSnapshot.value = { ...next, events } as TeamUnilevelSnapshot | DirectReferralSnapshot;
    remoteLoadMoreStatus.value = "idle";
  } catch { if (current()) remoteLoadMoreStatus.value = "error"; }
}
function retryRemote() {
  if (!remoteSessionReady.value || !mounted) return;
  void readCoalescer.run({ accountKey: app.accountKey, accountBindingEpoch: app.accountBindingEpoch, runtime: captureRuntimeRevision() }, loadRemote);
}
function invalidate(resetSnapshot = true) {
  expandedRecords.value = []; showSettlementDetails.value = false;
  remoteRequest++; remoteSnapshot.value = null; policy.value = null; remoteState.value = "loading"; policyState.value = "loading"; remoteLoadMoreStatus.value = "idle";
  if (resetSnapshot) querySnapshotAt = null;
  readCoalescer = createScopedReadCoalescer();
}
watch(() => [app.accountKey, app.accountBindingEpoch] as const, () => { invalidate(); retryRemote(); }, { flush: "sync" });
watch(remoteSessionReady, ready => { if (ready) retryRemote(); else invalidate(); }, { immediate: true, flush: "post" });
watch(period, () => { invalidate(); retryRemote(); }, { flush: 'sync' });
watch(filter, () => { invalidate(false); retryRemote(); }, { flush: 'sync' });
watch(() => [locale.code, apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl] as const, () => { invalidate(); retryRemote(); }, { flush: 'sync' });
const unsubscribeRuntimeRevision = subscribeRuntimeRevision(() => { remoteRequest++; readCoalescer = createScopedReadCoalescer(); querySnapshotAt = null; retryRemote(); });
onMounted(retryRemote); onShow(() => { querySnapshotAt = null; retryRemote(); });
onUnmounted(() => { mounted = false; invalidate(); unsubscribeRuntimeRevision(); });
const totals = computed(() => {
  const snapshot = remoteSnapshot.value;
  if (!snapshot) return { amountUSDT: 0, amountNEX: 0, count: 0 };
  if ("direct" in snapshot.split) {
    const { direct, extended } = snapshot.split;
    return { amountUSDT: direct.amountUSDT + extended.amountUSDT, amountNEX: direct.amountNEX + extended.amountNEX, count: direct.count + extended.count };
  }
  return snapshot.split.deviceEarning;
});
const remoteTotalUSDT = computed(() => totals.value.amountUSDT), remoteTotalNEX = computed(() => totals.value.amountNEX), remoteGroupCount = computed(() => totals.value.count);
const ruleDescription = computed(() => {
  const p = policy.value;
  if (!p) return "";
  if (filter.value === "extended") return t.value.directReferral.networkRule;
  const rule = filter.value === "device_earning" ? p.deviceEarning : p.purchase;
  if (p.settlementMode === "SEVEN_V2" && filter.value === "direct" && (p.purchaseSplitConfigured === false || p.sevenLayerReference?.baseRatePct === null || p.sevenLayerReference?.coolingDays === null)) return t.value.directReferral.purchaseUnconfigured;
  if (p.settlementMode === "SEVEN_V2" && filter.value === "direct") return p.purchaseSplit?.enabled
    ? fmt(t.value.directReferral.purchaseSplitRule, { usdt: formatHowNumber(p.purchaseSplit.usdtSharePct, dateLocale()), nex: formatHowNumber(100 - p.purchaseSplit.usdtSharePct, dateLocale()) })
    : t.value.directReferral.originalPurchaseRule;
  return rule.enabled ? fmt(t.value.directReferral.rule, { rate: formatHowNumber(rule.totalRatePct, dateLocale()), usdt: formatHowNumber(rule.usdtSharePct, dateLocale()), nex: formatHowNumber(100 - rule.usdtSharePct, dateLocale()), days: rule.coolingDays }) : t.value.directReferral.disabled;
});
const periodOptions = computed(() => (["today", "week", "month", "all"] as const).map(value => ({ value, label: t.value.unilevel.periods[value] })));
const filterOptions = computed(() => [
  { value: "direct", label: t.value.directReferral.purchase },
  { value: "extended", label: t.value.directReferral.networkPurchase },
  { value: "device_earning", label: t.value.directReferral.deviceEarning },
]);
function amount(value: number | null | undefined) { return formatAmount(value); }
function wideAmount(value: number) { return amount(value).length > 12; }
function sourceReference(event: DirectReferralEvent | TeamUnilevelEvent) { return event.sourceRef ?? ("orderId" in event ? event.orderId : null) ?? "—"; }
function statusText(event: DirectReferralEvent | TeamUnilevelEvent) {
  const { statusUSDT, statusNEX } = event as TeamUnilevelEvent;
  return statusUSDT && statusNEX && statusUSDT !== statusNEX ? `USDT ${statusLabel(event, statusUSDT)} · UVT ${statusLabel(event, statusNEX)}` : statusLabel(event);
}
function statusLabel(event: DirectReferralEvent | TeamUnilevelEvent, status = event.status) {
  if (status === "cooling") return fmt(t.value.commissions.coolingTag, { n: Math.max(0, Math.ceil((event.unlockAt - Date.now()) / 86400000)) });
  return status === "unlocked" ? t.value.commissions.readyTag
    : status === "waiting_calculation" ? t.value.directReferral.waitingCalculation
    : status === "withdrawn" ? t.value.commissions.withdrawnTag
    : status === "frozen" ? t.value.commissions.frozenTag
    : status === "reversed" ? t.value.commissions.reversedTag
    : status === "recovery_pending" ? t.value.directReferral.recoveryPending : t.value.commissions.rejectedTag;
}
function go(url: string) { navTo(url); }
function openRules() { go('/pages/team/unilevel-how'); }
</script>

<style scoped>
.nx-direct-amount { overflow-wrap: anywhere; }
.nx-royalty-totals { display: flex; flex-direction: column; gap: 4px; margin-top: var(--ui-space-row-y); }
.nx-royalty-totals > view:first-child > text { font-size: 32px !important; }
.nx-royalty-totals > view + view { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
.nx-royalty-totals > view + view > text:first-child { font-size: 16px !important; }

.nx-royalty-totals-large > view:first-child > text { font-size: 22px !important; }

.nx-royalty-event-large { flex-direction: column; }
.nx-royalty-event-large > view + view { max-width: 100% !important; text-align: left !important; font-size: var(--ui-type-list-subtitle); }
.nx-royalty-status { display: block; padding: 2px 0; font-size: 12px; color: var(--v5-ink-2); }
.nx-unilevel-focus:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.nx-unilevel-details-toggle { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); color: var(--v5-ink-2); font-size: 12px; }
.nx-unilevel-details { color: var(--v5-ink-3); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.nx-unilevel-details > text { margin-bottom: 8px; }
</style>
