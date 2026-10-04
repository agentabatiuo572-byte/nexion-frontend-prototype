<template>
  <AppChassis active="team">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/leadership-pool" />
      <HowHero :label="w.heroLabel" :title="w.heroTitle" :sub="w.heroSub" accent="purple" />

      <view v-if="remoteState !== 'ready' || (remoteApiEnabled && !vState.remoteReady)" class="text-center" style="padding: 48px 20px">
        <text class="block" :style="{ color: 'var(--v5-ink-2)', fontSize: '13px' }">{{ remoteState === 'hold' ? t.pool.settlementHold : remoteState === 'error' || vState.remoteError ? t.pool.loadError : t.pool.loading }}</text>
        <view v-if="remoteState === 'hold' || remoteState === 'error' || vState.remoteError" class="inline-flex items-center justify-center active:opacity-70" style="margin-top: 14px; min-height: 44px; padding: 0 18px; border-radius: 999px; background: var(--v5-brand)" role="button" tabindex="0" @click="loadRemotePool" @keydown.enter.prevent="loadRemotePool" @keydown.space.prevent="loadRemotePool">
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

        <HowSection :title="w.s2Title" accent="purple">
          <template #icon>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4" /><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z" /><path d="M22 19H2" /></svg>
          </template>
          <text class="block" :style="captionStyle">{{ w.s2Intro }}</text>
          <view v-if="voteRows.length" class="rounded-xl border overflow-hidden" :style="tableCardStyle">
            <view class="flex items-center" :style="tableHeadStyle">
              <text :style="thLeftStyle">{{ w.colRank }}</text>
              <text :style="thRightStyle">{{ w.colVotes }}</text>
              <text :style="thRightStyle">{{ w.colShare }}</text>
            </view>
            <view v-for="(row, index) in voteRows" :key="row.r" class="flex items-center" :style="tableRowStyle(index === 0)">
              <text class="font-display" :style="rankCellStyle">{{ row.r }}</text>
              <text class="font-display" :style="votesCellStyle">{{ row.v }}</text>
              <text :style="shareCellStyle">{{ row.s }}</text>
            </view>
          </view>
          <text v-else class="block" :style="bodyStyle">{{ w.noVoteRows }}</text>
          <text class="block" :style="footnoteStyle">{{ w.s2Footnote }}</text>
        </HowSection>

        <view class="mx-4 mt-6">
          <view class="flex items-center justify-center active:scale-[0.98] transition-transform" :style="ctaStyle" role="button" tabindex="0" @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack">
            <text :style="ctaTextStyle">{{ w.ctaBack }}</text>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </view>
        </view>
      </template>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import HowHero from "@/components/how/how-hero.vue";
import HowSection from "@/components/how/how-section.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { dateLocale } from "@/i18n/format";
import { navBack } from "@/lib/route";
import { remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { TeamLeadershipPoolSnapshot } from "@/api/team-insights-api";
import { useApp } from "@/store/app";
import { useLeadershipPool, V_VOTES } from "@/store/leadership-pool";
import { useVRank, type VRank } from "@/store/v-rank";
import { leadershipHowRows } from "@/lib/leadership-pool-remote";
import { leadershipPoolFailureState } from "@/lib/leadership-pool-state";
import { leadershipHowFacts, leadershipHowRanks } from "@/lib/leadership-how-facts";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";

const t = useT();
const w = computed(() => t.value.poolHowItWorks);
const app = useApp();
const pool = useLeadershipPool();
const vState = useVRank();
const remotePool = ref<TeamLeadershipPoolSnapshot | null>(null);
const remoteState = ref<"loading" | "ready" | "error" | "hold">(remoteApiEnabled ? "loading" : "ready");
let remoteRequest = 0;
let mounted = true;
const localVotes: Record<number, number> = V_VOTES;
const localDistribution: Record<number, number> = pool.globalVDistribution;
const configuredVotes = computed(() => new Map(vState.ladder.map((row) => [row.v, row.leadershipVotes])));

const facts = computed(() => remotePool.value ? leadershipHowFacts(remotePool.value) : null);
const currentRulesText = computed(() => facts.value
  ? fmt(w.value.currentRules, { rank: facts.value.unlockRank, rate: facts.value.injectRatePct.toLocaleString() })
  : w.value.localRules);
const nextPayoutText = computed(() => facts.value
  ? fmt(w.value.nextPayout, { time: new Date(facts.value.nextPayoutAt).toLocaleString(dateLocale()) })
  : "");
const voteRows = computed(() => {
  const ranks = remoteApiEnabled
    ? leadershipHowRanks(remotePool.value ?? { injectRate: 0, unlockRank: 0, nextPayoutAt: "", distribution: [] }, vState.ladder.map((row) => row.v))
    : Object.keys(V_VOTES).map(Number).filter((rank): rank is VRank => rank >= 0 && rank <= 12).sort((left, right) => left - right);
  const snapshot = remoteApiEnabled
    ? remotePool.value ?? { totalVotes: 0, distribution: [] }
    : { totalVotes: pool.totalVotes(), distribution: ranks.map((vRank) => ({ vRank, people: localDistribution[vRank] ?? 0, votes: localVotes[vRank] ?? 0 })) };
  return leadershipHowRows(snapshot, ranks, remoteApiEnabled ? configuredVotes.value : new Map(Object.entries(localVotes).map(([rank, votes]) => [Number(rank), votes]))).map((row) => ({
    r: `V${row.rank}`,
    v: row.votes === null ? "—" : row.votes,
    s: row.sharePct === null ? "—" : `≈ ${row.sharePct.toFixed(2)}%`,
  }));
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
const captionStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginBottom: "14px", lineHeight: 1.6 };
const footnoteStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-ink-3)" };
const tableCardStyle: CSSProperties = { background: "var(--v5-surface)", borderColor: "var(--v5-border)", borderRadius: "12px" };
const tableHeadStyle: CSSProperties = { padding: "8px 12px", fontFamily: "var(--font-jet-mono), ui-monospace, monospace", fontSize: "12px", fontWeight: 500, color: "var(--v5-ink-3)", letterSpacing: "0.06em" };
const thLeftStyle: CSSProperties = { flex: "1", textAlign: "left" };
const thRightStyle: CSSProperties = { flex: "1", textAlign: "right" };
function tableRowStyle(isFirst: boolean): CSSProperties { return { padding: "8px 12px", borderTop: isFirst ? "1px solid var(--v5-border)" : "1px solid color-mix(in srgb, var(--v5-border) 60%, transparent)", fontSize: "12px" }; }
const rankCellStyle: CSSProperties = { flex: "1", fontWeight: 600, color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)" };
const votesCellStyle: CSSProperties = { flex: "1", textAlign: "right", color: "var(--v5-brand-2)" };
const shareCellStyle: CSSProperties = { flex: "1", textAlign: "right", color: "var(--v5-brand)" };
const ctaStyle: CSSProperties = { gap: "6px", height: "50px", borderRadius: "999px", background: "var(--v5-brand)", boxShadow: "var(--v5-spotlight-brand)" };
const ctaTextStyle: CSSProperties = { color: "var(--v5-on-brand)", fontFamily: "var(--font-v5)", fontWeight: 500, fontSize: "15px", letterSpacing: "-0.005em" };
</script>
