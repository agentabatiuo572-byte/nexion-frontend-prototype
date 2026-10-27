<template>
  <AppChassis active="team">
    <RewardPageSurface>
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/leadership-pool" />
      <HowHero kind="balance" :label="w.heroLabel" :title="w.heroTitle" :sub="w.heroSub" accent="purple" />

      <view v-if="remoteState !== 'ready'" class="text-center" style="padding: 48px 20px">
        <text class="block" :style="{ color: 'var(--v5-ink-2)', fontSize: '13px' }">{{ remoteState === 'hold' ? t.pool.settlementHold : remoteState === 'error' || vState.remoteError ? t.pool.loadError : t.pool.loading }}</text>
        <view v-if="remoteState === 'hold' || remoteState === 'error' || vState.remoteError" class="reward-cta" style="margin-top: 14px" role="button" tabindex="0" @click="loadRemotePool" @keydown.enter.prevent="loadRemotePool" @keydown.space.prevent="loadRemotePool">
          <text :style="{ color: 'var(--v5-on-brand)', fontSize: '13px', fontWeight: 600 }">{{ t.pool.retry }}</text>
        </view>
      </view>

      <template v-else>
        <HowSection :title="w.currentRulesTitle" accent="purple">
          <template #icon>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
          </template>
          <text class="block" :style="bodyStyle">{{ currentRulesText }}</text>
          <text v-if="nextPayoutText" class="block" :style="{ ...bodyStyle, marginTop: '10px' }">{{ nextPayoutText }}</text>
        </HowSection>

        <HowSection :title="w.s2Title">
          <text class="block" :style="bodyStyle">{{ w.s2Intro }}</text>
          <template v-if="vState.remoteReady">
            <view v-if="configuredVoteRows.length" class="pool-how-weight-list">
              <view class="pool-how-weight-heading"><text>{{ w.colRank }}</text><text>{{ w.colVotes }}{{ t.pool.eaShort }}</text></view>
              <view v-for="row in configuredVoteRows" :key="row.rank" class="pool-how-weight-row">
                <text>{{ row.label }}</text><text>{{ row.votes ?? '—' }}</text>
              </view>
            </view>
            <text v-else class="block" :style="bodyStyle">{{ w.noVoteRows }}</text>
          </template>
          <view v-else role="status" class="pool-how-config-state">
            <text class="block">{{ vState.remoteError ? t.pool.loadError : t.pool.loading }}</text>
            <view v-if="vState.remoteError" class="reward-cta" role="button" tabindex="0" @click="refreshRankConfig" @keydown.enter.prevent="refreshRankConfig" @keydown.space.prevent="refreshRankConfig"><text>{{ t.pool.retry }}</text></view>
          </view>
        </HowSection>

        <HowSection :title="auditCopy.poolFactsTitle">
          <view v-if="remotePool" class="pool-how-facts">
            <view><text>{{ auditCopy.votes }}</text><text>{{ remotePool.myVotes ?? '—' }}</text></view>
            <view><text>{{ auditCopy.totalVotes }}</text><text>{{ remotePool.totalVotes ?? '—' }}</text></view>
            <view><text>{{ auditCopy.share }}</text><text>{{ shareText }}</text></view>
          </view>
          <view v-if="distributionRows.length" class="pool-how-distribution">
            <view v-for="row in distributionRows" :key="row.vRank" class="pool-how-distribution-row">
              <text class="pool-how-distribution-rank">{{ row.label }}</text>
              <text>{{ fmt(t.pool.peopleVotesEa, { count: row.people, votes: row.votes }) }}</text>
              <text class="pool-how-distribution-total">{{ w.colVotes }}: {{ row.people * row.votes }}</text>
            </view>
          </view>
          <text v-else class="block" :style="bodyStyle">{{ w.noVoteRows }}</text>
          <text class="block" :style="bodyStyle">{{ auditCopy.poolFactsHint }}</text>
          <text class="block" :style="{ ...bodyStyle, marginTop: '10px' }">{{ auditCopy.poolRulesPending }}</text>
        </HowSection>

        <view class="mx-4 mt-6">
          <view class="reward-cta reward-cta--wide"  role="button" tabindex="0" @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack">
            <text >{{ auditCopy.poolRecords }}</text>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </view>
        </view>
      </template>
    </view>
    </RewardPageSurface>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import RewardPageSurface from "@/components/team/reward-page-surface.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import HowHero from "@/components/team/reward-compact-hero.vue";
import HowSection from "@/components/team/reward-rule-block.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { fmt } from "@/i18n/format";
import { formatDisplayDateTime } from "@/lib/display-date";
import { navBack } from "@/lib/route";
import { remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { TeamLeadershipPoolSnapshot } from "@/api/team-insights-api";
import { useApp } from "@/store/app";
import { useVRank, type VRank } from "@/store/v-rank";
import { rankLabel } from "@/lib/v-rank-copy";
import { leadershipPoolFailureState } from "@/lib/leadership-pool-state";
import { leadershipHowFacts } from "@/lib/leadership-how-facts";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";

const t = useT();
const locale = useLocaleStore();
const auditCopy = computed(() => networkReauditCopy(locale.code));
const w = computed(() => t.value.poolHowItWorks);
const app = useApp();
const vState = useVRank();
const remotePool = ref<TeamLeadershipPoolSnapshot | null>(null);
const remoteState = ref<"loading" | "ready" | "error" | "hold">(remoteApiEnabled ? "loading" : "ready");
let remoteRequest = 0;
let mounted = true;
const facts = computed(() => remotePool.value ? leadershipHowFacts(remotePool.value) : null);
// Published weights and this period's participation are separate facts. An
// absent distribution row is never synthesized from a configured rank.
const configuredVoteRows = computed(() => !vState.remoteReady || !facts.value ? [] : vState.ladder
  .filter(row => row.v >= facts.value!.unlockRank)
  .map(row => ({ rank: row.v, label: rankLabel(row.v, locale.code, vState.ladder),
    votes: Number.isFinite(row.leadershipVotes) && row.leadershipVotes >= 0 ? row.leadershipVotes : null }))
  .sort((a, b) => a.rank - b.rank));
const distributionRows = computed(() => (remotePool.value?.distribution ?? []).map(row => ({
  ...row, label: vState.remoteReady ? rankLabel(row.vRank as VRank, locale.code, vState.ladder) : `V${row.vRank}`,
})).sort((a, b) => a.vRank - b.vRank));
function refreshRankConfig() { void vState.refreshCanonicalVRank(); }
const shareText = computed(() => remotePool.value && remotePool.value.totalVotes > 0 && Number.isFinite(remotePool.value.mySharePct)
  ? `${(remotePool.value.mySharePct * 100).toLocaleString(locale.code, { maximumFractionDigits: 2 })}%` : '—');
const currentRulesText = computed(() => facts.value
  ? fmt(w.value.currentRules, { rank: facts.value.unlockRank })
  : w.value.localRules);
const nextPayoutText = computed(() => {
  if (!facts.value) return "";
  return fmt(w.value.nextPayout, { time: formatDisplayDateTime(facts.value.nextPayoutAt, locale.code, true) });
});
async function loadRemotePool() {
  if (!remoteApiEnabled) return;
  const request = ++remoteRequest;
  const accountKey = app.accountKey;
  const accountScope = captureAccountScope();
  const runScope = captureRuntimeRevision();
  void vState.refreshCanonicalVRank();
  remoteState.value = "loading";
  remotePool.value = null;
  const current = () => mounted && request === remoteRequest && accountKey === app.accountKey
    && isCurrentAccountScope(accountScope) && isCurrentRuntimeRevision(runScope);
  try {
    const snapshot = await teamInsightsApi.leadershipPool();
    if (!current()) return;
    remotePool.value = snapshot;
    remoteState.value = "ready";
  } catch (cause) {
    if (!current()) return;
    remotePool.value = null;
    remoteState.value = leadershipPoolFailureState(cause);
  }
}

watch(() => app.accountKey, () => { void loadRemotePool(); });
const unsubscribeRemotePoolRun = subscribeRuntimeRevision(() => { if (remoteApiEnabled) void loadRemotePool(); });
onShow(() => { void loadRemotePool(); });
onUnmounted(() => { mounted = false; remoteRequest += 1; remotePool.value = null; unsubscribeRemotePoolRun(); });
function goBack() { navBack("/pages/team/leadership-pool"); }

const bodyStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 };
</script>

<style scoped>
.pool-how-facts { display: flex; flex-direction: column; gap: var(--ui-space-row-y); margin-bottom: var(--ui-space-inset); }
.pool-how-facts > view { display: flex; justify-content: space-between; gap: var(--ui-space-inset); font-size: 13px; }
.pool-how-facts > view > text:last-child { font-variant-numeric: tabular-nums; font-weight: 600; }
.pool-how-weight-list { margin-top: var(--ui-space-inset); }
.pool-how-weight-heading, .pool-how-weight-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(60px,auto); gap: var(--ui-space-inset); padding: var(--ui-space-row-y) 0; border-bottom: 1px solid var(--v5-border); }
.pool-how-weight-heading { color: var(--v5-ink-3); font-size: 12px; }
.pool-how-weight-row > text:last-child, .pool-how-weight-heading > text:last-child { text-align: right; font-variant-numeric: tabular-nums; }
.pool-how-distribution { margin: var(--ui-space-inset) 0; }
.pool-how-distribution-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: var(--ui-space-inline) 0; border-bottom: 1px solid var(--v5-border); }
.pool-how-distribution-rank { flex-basis: 100%; color: var(--v5-ink); }
.pool-how-distribution-total { margin-left: auto; font-variant-numeric: tabular-nums; }
.pool-how-config-state { margin-top: var(--ui-space-inline); }
</style>
