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
import { formatTrialDateTime } from "@/lib/trial-date";
import { navBack } from "@/lib/route";
import { remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { TeamLeadershipPoolSnapshot } from "@/api/team-insights-api";
import { useApp } from "@/store/app";
import { useVRank } from "@/store/v-rank";
import { leadershipPoolFailureState } from "@/lib/leadership-pool-state";
import { leadershipHowFacts } from "@/lib/leadership-how-facts";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";

const t = useT();
const w = computed(() => t.value.poolHowItWorks);
const app = useApp();
const vState = useVRank();
const remotePool = ref<TeamLeadershipPoolSnapshot | null>(null);
const remoteState = ref<"loading" | "ready" | "error" | "hold">(remoteApiEnabled ? "loading" : "ready");
let remoteRequest = 0;
let mounted = true;
const facts = computed(() => remotePool.value ? leadershipHowFacts(remotePool.value) : null);
const currentRulesText = computed(() => facts.value
  ? fmt(w.value.currentRules, { rank: facts.value.unlockRank })
  : w.value.localRules);
const nextPayoutText = computed(() => {
  if (!facts.value) return "";
  const timestamp = facts.value.nextPayoutAt ? new Date(facts.value.nextPayoutAt).getTime() : NaN;
  return fmt(w.value.nextPayout, { time: Number.isFinite(timestamp) ? formatTrialDateTime(timestamp) : "—" });
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
const ctaStyle: CSSProperties = { gap: "6px", height: "50px", borderRadius: "999px", background: "var(--v5-brand)", boxShadow: "var(--v5-spotlight-brand)" };
const ctaTextStyle: CSSProperties = { color: "var(--v5-on-brand)", fontFamily: "var(--font-v5)", fontWeight: 500, fontSize: "15px", letterSpacing: "-0.005em" };
</script>
