<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.directReferral.title" />
      <view class="px-4" style="display: flex; flex-direction: column; gap: 16px">
        <view class="flex items-center justify-between" style="gap: 8px">
          <text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.directReferral.subtitle }}</text>
          <view class="nx-unilevel-focus shrink-0" role="button" tabindex="0" style="min-height: 44px; display: flex; align-items: center; color: var(--v5-brand-2)" @click="go('/pages/team/unilevel-how')"><text>{{ t.unilevel.howItWorksEntry }}</text></view>
        </view>
        <GlassSegments :label="t.directReferral.period" v-model="period" :options="periodOptions" layout="scroll" />
        <view v-if="policyState === 'error'" role="alert">
          <text class="block">{{ t.directReferral.policyError }}</text>
          <view role="button" tabindex="0" class="nx-unilevel-focus" style="min-height: 44px; display: flex; align-items: center; color: var(--v5-brand)" @click="retryRemote"><text>{{ t.network.retry }}</text></view>
        </view>
        <view v-else-if="policyState !== 'ready'" role="status" aria-busy="true"><text>{{ t.network.projectionLoadingTitle }}</text></view>
        <view v-else-if="policy" style="display: flex; flex-direction: column; gap: 12px">
          <text v-if="!policy.configured" class="block" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.directReferral.unconfigured }}</text>
          <text v-else-if="policy.nexUsdtPrice === null" class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.directReferral.priceUnavailable }}</text>
          <view v-for="rule in ruleRows" :key="rule.key" style="padding: 14px; border-radius: 14px; background: var(--v5-surface)">
            <text class="block" style="font-size: 13px; font-weight: 600">{{ rule.title }}</text>
            <text class="block" style="margin-top: 6px; font-size: 12px; line-height: 1.6; color: var(--v5-ink-3)">{{ rule.enabled ? rule.description : t.directReferral.disabled }}</text>
          </view>
          <text class="block" style="font-size: 12px; line-height: 1.6; color: var(--v5-ink-3)">{{ t.directReferral.platformPays }}</text>
        </view>
        <EmptyState v-if="remoteState === 'error'" kind="recoverable-error" :title="t.network.projectionErrorTitle" :desc="t.network.projectionErrorDesc" :cta-label="t.network.retry" @cta="retryRemote" />
        <view v-else-if="remoteState !== 'ready'" role="status" aria-busy="true"><text>{{ t.network.projectionLoadingTitle }}</text></view>
        <template v-else-if="remoteState === 'ready' && remoteSnapshot">
          <view>
            <text class="block" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.directReferral.total }}</text>
            <text class="block font-display tabular-nums nx-direct-amount" style="font-size: 26px; font-weight: 600">{{ amount(remoteTotalUSDT) }} USDT</text>
            <text class="block font-mono-tabular nx-direct-amount" style="margin-top: 4px; color: var(--v5-brand-2)">{{ amount(remoteTotalNEX) }} NEX</text>
          </view>
          <view v-for="row in summaryRows" :key="row.kind" style="display: flex; justify-content: space-between; gap: 12px; font-size: 12px">
            <text style="flex: 1; min-width: 0">{{ row.title }} · {{ row.count }}</text>
            <view style="max-width: 58%; text-align: right">
              <text class="block font-mono-tabular nx-direct-amount">{{ amount(row.amountUSDT) }} USDT</text>
              <text class="block font-mono-tabular nx-direct-amount">{{ amount(row.amountNEX) }} NEX</text>
            </view>
          </view>
          <GlassSegments :label="t.directReferral.source" v-model="filter" :options="filterOptions" layout="wrap" />
          <view style="border-top: 1px solid var(--v5-border)">
            <view v-for="event in remoteFilteredEvents" :key="event.id" class="nx-direct-event" style="padding: 14px 0; border-bottom: 1px solid var(--v5-border)">
              <view style="display: flex; justify-content: space-between; gap: 10px">
                <view style="flex: 1; min-width: 0">
                  <text class="block" style="font-size: 13px; overflow-wrap: anywhere">{{ event.sourceUserName }}</text>
                  <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ t.commissions.kind[event.kind] }}</text>
                </view>
                <view style="max-width: 58%; text-align: right">
                  <text class="block font-mono-tabular nx-direct-amount" style="color: var(--v5-brand)">{{ amount(event.amountUSDT) }} USDT</text>
                  <text class="block font-mono-tabular nx-direct-amount" style="color: var(--v5-brand-2)">{{ amount(event.amountNEX) }} NEX</text>
                </view>
              </view>
              <text class="block" style="margin-top: 6px; font-size: 12px; overflow-wrap: anywhere; color: var(--v5-ink-3)">{{ sourceLabel(event) }} · {{ event.sourceRef }}</text>
              <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-2)">{{ statusLabel(event) }}</text>
              <text v-if="event.status === 'recovery_pending'" class="block nx-direct-amount" style="margin-top: 4px; font-size: 12px; color: var(--v5-warning)">{{ fmt(t.directReferral.pendingAmounts, { usdt: amount(event.recoveryPendingUSDT), nex: amount(event.recoveryPendingNEX) }) }}</text>
            </view>
            <EmptyState v-if="remoteFilteredEvents.length === 0" :kind="filter === 'all' ? 'empty-list' : 'no-filter-results'" :title="t.directReferral.empty" :desc="t.directReferral.emptyDesc" />
            <view v-if="remoteSnapshot.totalRows === 0" role="button" tabindex="0" class="nx-unilevel-focus" style="min-height: 44px; display: flex; align-items: center; justify-content: center; color: var(--v5-brand)" @click="go('/pages/team/team')"><text>{{ t.directReferral.invite }}</text></view>
            <view v-if="remoteSnapshot.events.length < remoteSnapshot.totalRows" class="nx-unilevel-load-more nx-unilevel-focus" role="button" tabindex="0" :aria-disabled="remoteLoadMoreStatus === 'loading'" style="min-height: 44px; display: flex; align-items: center; justify-content: center" @click="loadMoreRemote"><text>{{ remoteLoadMoreStatus === 'loading' ? t.network.projectionLoadingTitle : remoteLoadMoreStatus === 'error' ? t.network.retry : t.unilevel.loadMore }}</text></view>
          </view>
        </template>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import EmptyState from "@/components/empty-state.vue";
import GlassSegments from "@/components/glass-segments.vue";
import { useT } from "@/i18n/use-t";
import { fmt, dateLocale } from "@/i18n/format";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { apiClient, expectedApiEnvironment, remoteApiEnabled, sessionVault } from "@/api/runtime";
import { createDirectReferralApi, type DirectReferralPolicy, type DirectReferralSnapshot, type DirectReferralEvent, type DirectReferralPeriod, type DirectReferralKind } from "@/api/direct-referral-api";
import { binarySessionReady as accountSessionReady } from "@/lib/binary-session-ready";
import { createScopedReadCoalescer } from "@/lib/binary-read-coalescer";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import { navTo } from "@/lib/route";
import { formatHowNumber } from "@/lib/rank-how-content";

const t = useT();
const app = useApp();
const auth = useAuth();
const directApi = createDirectReferralApi(apiClient, expectedApiEnvironment);
const readCoalescer = createScopedReadCoalescer();
const period = ref<DirectReferralPeriod>("month");
const filter = ref<"all" | DirectReferralKind>("all");
const remoteSnapshot = ref<DirectReferralSnapshot | null>(null);
const policy = ref<DirectReferralPolicy | null>(null);
const remoteState = ref<"loading" | "ready" | "error">("loading");
const policyState = ref<"loading" | "ready" | "error">("loading");
const remoteLoadMoreStatus = ref<"idle" | "loading" | "error">("idle");
let remoteRequest = 0;
let mounted = true;
const remoteSessionReady = computed(() => accountSessionReady({
  remote: remoteApiEnabled, authenticated: auth.isAuthenticated, accountId: auth.accountId,
  appAccountKey: app.accountKey, sessionUserId: sessionVault.read()?.user.userId ?? null,
}));
async function loadRemote() {
  if (!remoteSessionReady.value || !mounted) return;
  const request = ++remoteRequest, accountKey = app.accountKey, selectedPeriod = period.value;
  const accountScope = captureAccountScope(), runScope = captureRuntimeRevision();
  remoteState.value = "loading"; policyState.value = "loading"; remoteLoadMoreStatus.value = "idle";
  remoteSnapshot.value = null; policy.value = null;
  const current = () => mounted && request === remoteRequest && accountKey === app.accountKey && selectedPeriod === period.value
    && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope);
  await Promise.all([
    directApi.snapshot(selectedPeriod).then(snapshot => { if (current()) { remoteSnapshot.value = snapshot; remoteState.value = "ready"; } })
      .catch(() => { if (current()) remoteState.value = "error"; }),
    directApi.policy().then(snapshot => { if (current()) { policy.value = snapshot; policyState.value = "ready"; } })
      .catch(() => { if (current()) policyState.value = "error"; }),
  ]);
}
async function loadMoreRemote() {
  const snapshot = remoteSnapshot.value;
  if (!mounted || !remoteSessionReady.value || remoteState.value !== "ready" || !snapshot
    || remoteLoadMoreStatus.value === "loading" || snapshot.events.length >= snapshot.totalRows) return;
  const request = remoteRequest, accountKey = app.accountKey, accountScope = captureAccountScope(), runScope = captureRuntimeRevision();
  const current = () => mounted && request === remoteRequest && remoteSnapshot.value === snapshot && accountKey === app.accountKey
    && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope);
  remoteLoadMoreStatus.value = "loading";
  try {
    const next = await directApi.snapshot(snapshot.period, snapshot.page + 1, snapshot.pageSize, snapshot.snapshotAt);
    if (!current()) return;
    if (next.page !== snapshot.page + 1 || next.snapshotAt !== snapshot.snapshotAt) throw new Error("DIRECT_REFERRAL_PAGE_MISMATCH");
    const seen = new Set(snapshot.events.map(event => event.id));
    remoteSnapshot.value = { ...next, events: [...snapshot.events, ...next.events.filter(event => !seen.has(event.id))] };
    remoteLoadMoreStatus.value = "idle";
  } catch { if (current()) remoteLoadMoreStatus.value = "error"; }
}
function retryRemote() {
  if (!remoteSessionReady.value || !mounted) return;
  void readCoalescer.run({ accountKey: app.accountKey, accountBindingEpoch: app.accountBindingEpoch, runtime: captureRuntimeRevision() }, loadRemote);
}
function invalidate() {
  remoteRequest++; remoteSnapshot.value = null; policy.value = null; remoteState.value = "loading"; policyState.value = "loading"; remoteLoadMoreStatus.value = "idle";
}
watch(() => [app.accountKey, app.accountBindingEpoch] as const, () => { invalidate(); retryRemote(); }, { flush: "sync" });
watch(remoteSessionReady, ready => { if (ready) retryRemote(); else invalidate(); }, { immediate: true, flush: "post" });
watch(period, () => { invalidate(); void loadRemote(); });
const unsubscribeRuntimeRevision = subscribeRuntimeRevision(() => { invalidate(); retryRemote(); });
onMounted(retryRemote);
onShow(retryRemote);
onUnmounted(() => { mounted = false; invalidate(); unsubscribeRuntimeRevision(); });
const remoteFilteredEvents = computed(() => (remoteSnapshot.value?.events ?? []).filter(event => filter.value === "all" || event.kind === filter.value));
const summaryRows = computed(() => remoteSnapshot.value ? [
  { ...remoteSnapshot.value.split.purchase, kind: "direct_purchase", title: t.value.directReferral.purchase },
  { ...remoteSnapshot.value.split.deviceEarning, kind: "direct_device_earning", title: t.value.directReferral.deviceEarning },
] : []);
const remoteTotalUSDT = computed(() => summaryRows.value.reduce((sum, row) => sum + row.amountUSDT, 0));
const remoteTotalNEX = computed(() => summaryRows.value.reduce((sum, row) => sum + row.amountNEX, 0));
const ruleRows = computed(() => policy.value ? [
  { key: "purchase", title: t.value.directReferral.purchase, ...policy.value.purchase },
  { key: "deviceEarning", title: t.value.directReferral.deviceEarning, ...policy.value.deviceEarning },
].map(rule => ({ ...rule, description: fmt(t.value.directReferral.rule, { rate: amount(rule.totalRatePct), usdt: amount(rule.usdtSharePct), nex: amount(100 - rule.usdtSharePct), days: rule.coolingDays }) })) : []);
const periodOptions = computed(() => (["today", "week", "month", "all"] as const).map(value => ({ value, label: t.value.unilevel.periods[value] })));
const filterOptions = computed(() => [
  { value: "all", label: t.value.commissions.all },
  { value: "direct_purchase", label: t.value.directReferral.purchase },
  { value: "direct_device_earning", label: t.value.directReferral.deviceEarning },
]);
function amount(value: number) { return formatHowNumber(value, dateLocale()); }
function sourceLabel(event: DirectReferralEvent) { return event.kind === "direct_purchase" ? t.value.directReferral.order : t.value.directReferral.receipt; }
function statusLabel(event: DirectReferralEvent) {
  if (event.status === "cooling") return fmt(t.value.commissions.coolingTag, { n: Math.max(0, Math.ceil((event.unlockAt - Date.now()) / 86400000)) });
  return event.status === "unlocked" ? t.value.commissions.readyTag
    : event.status === "frozen" ? t.value.commissions.frozenTag
    : event.status === "reversed" ? t.value.commissions.reversedTag
    : event.status === "recovery_pending" ? t.value.directReferral.recoveryPending : t.value.commissions.rejectedTag;
}
function go(url: string) { navTo(url); }
</script>

<style scoped>
.nx-direct-amount { overflow-wrap: anywhere; }
.nx-unilevel-focus:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
</style>
