<template>
  <AppChassis active="team">
    <RewardPageSurface>
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.directReferral.title" :action-label="t.unilevel.howItWorksEntry" :action="openRules" plain />
      <view class="px-4" style="display: flex; flex-direction: column; gap: 16px">
        <EmptyState v-if="remoteState === 'error'" kind="recoverable-error" :title="updateRequired ? t.directReferral.updateRequired : t.network.projectionErrorTitle" :desc="updateRequired ? t.directReferral.updateHint : t.network.projectionErrorDesc" :cta-label="t.network.retry" @cta="retryRemote" />
        <view v-else-if="remoteState !== 'ready' && !remoteSnapshot" role="status" aria-busy="true"><text>{{ t.network.projectionLoadingTitle }}</text></view>
        <template v-else-if="remoteSnapshot">
          <RewardHero class="nx-unilevel-hero nx-viz-press" kind="members">
            <text class="block nx-unilevel-hero-title">{{ filter === 'device_earning' ? t.directReferral.deviceEarning : t.directReferral.purchaseTotal }} · {{ visibility.mask(remoteGroupCount) }} {{ t.directReferral.settlementGroups }}</text>
            <view class="nx-royalty-totals" :class="{ 'nx-royalty-totals-large': wideAmount(remoteTotalUSDT) || wideAmount(remoteTotalNEX) }">
              <view><text class="block nx-num-amount nx-direct-amount nx-unilevel-main-amount"><text class="nx-unilevel-dollar">$</text>{{ totalAmountParts[0] }}<text v-if="totalAmountParts[1]" class="nx-unilevel-decimals">.{{ totalAmountParts[1] }}</text></text></view>
              <view><text class="block font-display tabular-nums nx-direct-amount" :style="{ fontSize: amount(remoteTotalNEX).length > 18 ? '20px' : '26px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ visibility.mask(((remoteTotalNEX ?? 0) > 0 ? '+' : '') + formatAmount(remoteTotalNEX)) }}</text><text>UVT</text></view>
            </view>
          </RewardHero>
        </template>
        <view class="nx-unilevel-filters">
          <GlassSegments :label="t.directReferral.period" v-model="period" :options="periodOptions" layout="equal" surface="glass" selection="flat" />
          <view class="nx-unilevel-sources" role="group" :aria-label="t.directReferral.source">
            <view v-for="option in filterOptions" :key="option.value" role="button" tabindex="0" class="nx-unilevel-source nx-unilevel-focus" :class="{ 'nx-unilevel-source--selected': filter === option.value }" :aria-pressed="filter === option.value" @click="filter = option.value" @keydown.enter.prevent="filter = option.value" @keydown.space.prevent="filter = option.value"><text>{{ option.label }}</text></view>
          </view>
        </view>
        <view v-if="(remoteState === 'ready' || remoteState === 'loading') && remoteSnapshot" class="nx-unilevel-ledger">
          <view v-for="day in eventDays" :key="day.key" class="nx-unilevel-day">
            <text class="nx-unilevel-day-label">{{ day.label }}</text>
            <view class="nx-unilevel-day-card">
            <view v-for="event in day.events" :key="event.id" class="nx-direct-event nx-viz-press">
                <view class="nx-unilevel-record-head">
                  <view class="nx-unilevel-icon" :class="`nx-unilevel-icon--${filter}`" aria-hidden="true"><svg v-if="filter === 'device_earning'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg><svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg></view>
                  <view class="nx-unilevel-record-copy">
                    <view class="nx-unilevel-member-line"><text class="nx-unilevel-member">{{ event.sourceUserName }}</text><text v-if="event.status !== 'unlocked' || ('statusUSDT' in event && event.statusUSDT !== event.statusNEX)" class="nx-royalty-status" :class="{ 'nx-royalty-status--cooling': event.status === 'cooling' }">{{ statusText(event) }}</text></view>
                    <text class="nx-unilevel-source-label">{{ filter === 'device_earning' ? t.directReferral.deviceEarning : filter === 'direct' ? t.directReferral.purchase : t.directReferral.networkPurchase }} · {{ recordTime(event.ts) }}</text>
                  </view>
                  <view class="nx-unilevel-record-amounts">
                    <text class="nx-direct-amount nx-unilevel-currency-row">{{ visibility.mask((event.amountUSDT > 0 ? '+' : '') + '$' + formatAmount(event.amountUSDT)) }}</text>
                    <text class="nx-direct-amount nx-unilevel-uvt">{{ visibility.mask((event.amountNEX > 0 ? '+' : '') + formatAmount(event.amountNEX)) }} UVT</text>
                  </view>
                </view>
                <text v-if="event.status === 'recovery_pending'" class="nx-unilevel-recovery nx-direct-amount">{{ fmt(auditCopy.pendingRecovery, { usdt: '$' + amount(event.recoveryPendingUSDT), uvt: amount(event.recoveryPendingNEX) }) }}</text>
              </view>
            </view>
          </view>
          <EmptyState v-if="remoteSnapshot.totalRows === 0" kind="no-filter-results" :title="t.directReferral.empty" :desc="t.directReferral.emptyDesc" />
          <view v-if="remoteSnapshot.totalRows === 0" role="button" tabindex="0" class="nx-unilevel-focus reward-cta" @click="go('/pages/team/team')" @keydown.enter.prevent="go('/pages/team/team')" @keydown.space.prevent="go('/pages/team/team')"><text>{{ t.directReferral.invite }}</text></view>
          <view v-if="remoteSnapshot.events.length < remoteSnapshot.totalRows" class="nx-unilevel-load-more nx-unilevel-focus reward-cta reward-cta--wide" role="button" :tabindex="remoteState !== 'ready' || remoteLoadMoreStatus === 'loading' ? -1 : 0" :aria-disabled="remoteState !== 'ready' || remoteLoadMoreStatus === 'loading'"  @click="loadMoreRemote" @keydown.enter.prevent="loadMoreRemote" @keydown.space.prevent="loadMoreRemote"><text>{{ remoteLoadMoreStatus === 'error' ? t.network.retry : t.unilevel.loadMore }}</text></view>
        </view>
        <view v-if="policyState === 'error'" role="alert">
          <text class="block">{{ t.directReferral.policyError }}</text>
          <view role="button" tabindex="0" class="nx-unilevel-focus nx-card-recovery-action" @click="retryRemote" @keydown.enter.prevent="retryRemote" @keydown.space.prevent="retryRemote"><text>{{ t.network.retry }}</text></view>
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
import { useDataVisibility } from "@/store/data-visibility";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { teamRuleGuideCopy } from "@/components/team/team-rule-guide-copy";
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
const visibility = useDataVisibility();
const logicCopy = computed(() => teamLogicCopy(locale.code));
const auditCopy = computed(() => networkReauditCopy(locale.code));
const showSettlementDetails = ref(false);
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
  showSettlementDetails.value = false;
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
  if (filter.value === "extended") return teamRuleGuideCopy(locale.code).networkRule;
  const rule = filter.value === "device_earning" ? p.deviceEarning : p.purchase;
  if (p.settlementMode === "SEVEN_V2" && filter.value === "direct" && (p.purchaseSplitConfigured === false || p.sevenLayerReference?.baseRatePct === null || p.sevenLayerReference?.coolingDays === null)) return t.value.directReferral.purchaseUnconfigured;
  if (p.settlementMode === "SEVEN_V2" && filter.value === "direct") return p.purchaseSplit?.enabled
    ? fmt(t.value.directReferral.purchaseSplitRule, { usdt: formatHowNumber(p.purchaseSplit.usdtSharePct, dateLocale()), nex: formatHowNumber(100 - p.purchaseSplit.usdtSharePct, dateLocale()) })
    : t.value.directReferral.originalPurchaseRule;
  return rule.enabled ? fmt(t.value.directReferral.rule, { rate: formatHowNumber(rule.totalRatePct, dateLocale()), usdt: formatHowNumber(rule.usdtSharePct, dateLocale()), nex: formatHowNumber(100 - rule.usdtSharePct, dateLocale()), days: rule.coolingDays }) : t.value.directReferral.disabled;
});
// Records grouped by local calendar day, newest group first (events arrive newest first).
const eventDays = computed(() => {
  const days: { key: string; label: string; events: (DirectReferralEvent | TeamUnilevelEvent)[] }[] = [];
  (remoteSnapshot.value?.events ?? []).forEach(event => {
    const date = new Date(event.ts);
    const key = event.ts > 0 ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : 'unknown';
    let day = days.find(day => day.key === key);
    if (!day) {
      day = { key, label: event.ts > 0 ? `${date.toLocaleDateString(dateLocale(), { month: "numeric", day: "numeric" })} · ${date.toLocaleDateString(dateLocale(), { weekday: "short" })}` : logicCopy.value.dateUnavailable, events: [] };
      days.push(day);
    }
    day.events.push(event);
  });
  return days;
});
const periodOptions = computed(() => (["today", "week", "month", "all"] as const).map(value => ({ value, label: t.value.unilevel.periods[value] })));
const filterOptions = computed(() => [
  { value: "direct", label: t.value.directReferral.purchase },
  { value: "extended", label: t.value.directReferral.networkPurchase },
  { value: "device_earning", label: t.value.directReferral.deviceEarning },
] as const);
function amount(value: number | null | undefined) { return visibility.mask(formatAmount(value)); }
const totalAmountParts = computed(() => amount(remoteTotalUSDT.value).split('.'));
function wideAmount(value: number) { return amount(value).length > 12; }
function recordTime(ts: number) { return ts > 0 ? new Date(ts).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit', hour12: false }) : logicCopy.value.dateUnavailable; }
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
/* Hero (P-41): flat surface with a faint brand tint; USDT total in the amount font, UVT in metric. */
:deep(.nx-unilevel-hero) { padding: var(--v5-space-5); border: 0; border-radius: 28px; background: radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, var(--v5-brand) 9%, transparent), transparent 60%), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.nx-unilevel-hero-title { font-size: 13px; line-height: 18px; font-weight: 500; color: var(--v5-ink-2); }
:deep(.nx-unilevel-hero .reward-hero__art) { display: none; }
.nx-royalty-totals { display: flex; flex-direction: column; gap: 2px; margin-top: var(--ui-space-row-y); }
.nx-unilevel-main-amount { font-size: 40px; line-height: 48px; font-weight: 550; letter-spacing: -0.03em; }
.nx-unilevel-dollar { margin-right: 2px; font-size: 22px; color: var(--v5-ink-3); }
.nx-unilevel-decimals { color: var(--v5-ink-3); }
.nx-royalty-totals > view + view { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; }
.nx-royalty-totals > view + view > text { font-family: var(--font-metric); color: var(--v5-brand) !important; }
.nx-royalty-totals > view + view > text { font-size: 14px !important; font-weight: 500 !important; }
.nx-royalty-totals-large > view:first-child > text { font-size: 26px !important; line-height: 34px; }

.nx-unilevel-filters { display: flex; flex-direction: column; gap: var(--ui-space-inline); }
.nx-unilevel-sources { display: flex; flex-wrap: wrap; gap: var(--v5-space-1); }
.nx-unilevel-source { min-height: 44px; display: flex; align-items: center; max-width: 100%; padding: 0 var(--v5-space-3); border-radius: 999px; color: var(--v5-ink-3); font-size: 13px; line-height: 18px; font-weight: 500; cursor: pointer; }
.nx-unilevel-source--selected { color: var(--v5-ink); background: color-mix(in srgb, var(--v5-ink) 10%, transparent); }
.nx-unilevel-ledger { display: flex; flex-direction: column; gap: var(--ui-space-inset); }
.nx-unilevel-day { display: flex; flex-direction: column; gap: var(--v5-space-2); }
.nx-unilevel-day-label { padding: 0 var(--v5-space-1); font: 500 var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); color: var(--v5-ink-4); }
.nx-unilevel-day-card { padding: 0 var(--ui-space-inset); border-radius: var(--ui-radius-surface); background: var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.nx-direct-event { padding: 12px 0; }
.nx-direct-event + .nx-direct-event { border-top: 1px solid var(--v5-border); }
.nx-unilevel-record-head { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: var(--ui-space-inline); align-items: center; }
.nx-unilevel-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 12px; color: var(--v5-brand); background: color-mix(in srgb, var(--v5-brand) 16%, transparent); }
.nx-unilevel-icon--extended { color: var(--ui-device-ink); background: color-mix(in srgb, var(--ui-device-ink) 16%, transparent); }
.nx-unilevel-icon--device_earning { color: var(--v5-nex); background: color-mix(in srgb, var(--v5-nex) 16%, transparent); }
.nx-unilevel-record-copy { min-width: 0; }
.nx-unilevel-member-line { display: flex; flex-wrap: wrap; align-items: center; gap: var(--v5-space-1) 6px; }
.nx-unilevel-member { min-width: 0; color: var(--v5-ink); font: var(--ui-type-message-title-weight) var(--ui-type-message-title)/var(--ui-type-message-title-lh) var(--font-v5); overflow-wrap: anywhere; }
.nx-unilevel-record-amounts { min-width: 0; text-align: right; font-variant-numeric: tabular-nums; }
.nx-unilevel-currency-row { display: block; font: 500 15px/20px var(--font-metric); color: var(--v5-brand); }
.nx-unilevel-uvt { display: block; margin-top: 2px; color: var(--v5-ink-3); font: 500 12px/16px var(--font-metric); }
.nx-unilevel-source-label { display: block; margin-top: 2px; color: var(--v5-ink-3); font-size: 12px; line-height: 18px; }
.nx-royalty-status { display: inline-flex; align-items: center; min-height: 20px; padding: 0 6px; border-radius: 999px; background: color-mix(in srgb, var(--v5-ink) 8%, transparent); color: var(--v5-ink-2); font: 500 11px/16px var(--font-v5); overflow-wrap: anywhere; }
.nx-royalty-status--cooling { color: var(--v5-warning); background: color-mix(in srgb, var(--v5-warning) 16%, transparent); }
.nx-unilevel-recovery { display: block; margin: var(--v5-space-2) 0 0 48px; color: var(--v5-ink-2); font-size: 12px; line-height: 1.6; }
.nx-unilevel-focus:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.nx-unilevel-details-toggle { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); color: var(--v5-ink-3); font-size: 12px; }
.nx-unilevel-details { color: var(--v5-ink-3); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.nx-unilevel-details > text { margin-bottom: var(--v5-space-2); }
</style>
