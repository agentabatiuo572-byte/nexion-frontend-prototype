<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.pool.pageTitle" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px">
        <view v-if="remoteApiEnabled && remoteState !== 'ready'" class="text-center" style="padding: 48px 20px">
          <text class="block" :style="{ color: 'var(--v5-ink-2)', fontSize: '13px' }">{{ remoteState === 'loading' ? t.pool.loading : t.pool.loadError }}</text>
          <view v-if="remoteState === 'error'" class="inline-flex items-center justify-center active:opacity-70" style="margin-top: 14px; min-height: 44px; padding: 0 18px; border-radius: 999px; background: var(--v5-brand)" @click="loadRemotePool">
            <text :style="{ color: 'var(--v5-on-brand)', fontSize: '13px', fontWeight: 600 }">{{ t.pool.retry }}</text>
          </view>
        </view>
        <template v-else>
        <!-- Week pool hero — de-carded: big number sits directly on the page
             floor (card gradient/radial would be a floor aura → deleted per
             owner call 2026-07-08, accent border dropped with it). Rules-intro
             pill rides the cap row (owner 2026-07-09: kill the empty gap above). -->
        <view class="text-center" :style="heroStyle">
          <view class="flex items-center justify-between" style="gap: 8px">
            <view class="flex items-center justify-center font-mono-tabular" :style="heroCapStyle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" /><path d="M5 21h14" /></svg>
              <text>{{ t.pool.weekPool }}</text>
            </view>
            <view class="inline-flex items-center shrink-0 active:scale-[0.98] transition-transform" :style="howEntryStyle" @click="go('/pages/team/leadership-pool-how')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
              <text>{{ t.pool.howItWorksEntry }}</text>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </view>
          </view>
          <text class="block font-display tabular-nums" :style="heroBigStyle">${{ (currentWeekPoolUSDT / 1000).toFixed(1) }}K</text>
          <text class="block" :style="heroDescStyle">{{ weeklyDescText }}</text>
        </view>

        <!-- My status — frosted-glass card (owner 2026-07-09), fill only /
             zero border; both unlocked & locked variants share the shell. -->
        <view :style="statusStyle">
          <template v-if="unlocked">
            <view class="flex items-center justify-between">
              <text class="font-mono-tabular" :style="statusCapStyle('var(--v5-brand)')">{{ t.pool.projectedDividend }}</text>
              <VBadge :v="myRank" size="sm" />
            </view>
            <text class="block font-display tabular-nums" :style="projectedStyle">${{ projectedPayout.toFixed(2) }}</text>
          </template>
          <template v-else>
            <text class="block font-mono-tabular" :style="statusCapStyle('var(--v5-ink-3)')">{{ t.pool.locked }}</text>
            <text class="block" :style="lockedHeadStyle">{{ t.publicCopy.participationUnavailable }}</text>
            <view class="inline-flex items-center active:scale-[0.97] transition-transform" :style="pathCtaStyle" @click="go('/pages/support/messages')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
              <text>{{ t.publicCopy.contactSupport }}</text>
            </view>
          </template>
        </view>

        <!-- Past pools — transparent hairline group (form a, ledger idiom). -->
        <view v-if="poolHistory.length > 0" :style="pastGroupStyle">
          <text class="block font-mono-tabular" :style="pastHeadStyle">{{ t.pool.pastPools }}</text>
          <view
            v-for="(h, i) in poolHistory"
            :key="h.weekId"
            class="flex items-center justify-between"
            :style="historyRowStyle(i === poolHistory.length - 1)"
          >
            <view>
              <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink)' }">{{ h.weekId }}</text>
            </view>
            <text class="font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: h.payoutUSDT > 0 ? 'var(--v5-brand)' : 'var(--v5-ink-3)' }">{{ h.payoutUSDT > 0 ? `+$${h.payoutUSDT.toFixed(2)}` : "—" }}</text>
          </view>
        </view>
        </template>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VBadge from "@/components/team/v-badge.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useLeadershipPool } from "@/store/leadership-pool";
import { useVRank, type VRank } from "@/store/v-rank";
import { remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { TeamLeadershipPoolSnapshot } from "@/api/team-insights-api";
import { useApp } from "@/store/app";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import {
  captureCommerceSandboxRun,
  isCurrentCommerceSandboxScope,
  subscribeCurrentCommerceSandboxRun,
} from "@/api/order-api";

const t = useT();
const app = useApp();
const vState = useVRank();
const pool = useLeadershipPool();
const remotePool = ref<TeamLeadershipPoolSnapshot | null>(null);
const remoteState = ref<"loading" | "ready" | "error">(remoteApiEnabled ? "loading" : "ready");
let remoteRequest = 0;
let mounted = true;

const myRank = computed(() => (remoteApiEnabled ? remotePool.value?.myRank ?? 0 : vState.myRank) as VRank);
const unlocked = computed(() => myRank.value >= 3);
const currentWeekPoolUSDT = computed(() => remoteApiEnabled ? remotePool.value?.currentWeekPoolUSDT ?? 0 : pool.currentWeekPoolUSDT);
const projectedPayout = computed(() => remoteApiEnabled ? remotePool.value?.projectedPayoutUSDT ?? 0 : pool.myProjectedPayout(vState.myRank));
const nextPayoutTs = computed(() => remoteApiEnabled ? Date.parse(remotePool.value?.nextPayoutAt ?? "") || Date.now() : pool.nextPayoutTs());
const poolHistory = computed(() => remoteApiEnabled ? remotePool.value?.history ?? [] : pool.history);
const daysToPayout = computed(() => Math.max(0, Math.ceil((nextPayoutTs.value - Date.now()) / 86400000)));
const hoursToPayout = computed(() => Math.max(0, Math.ceil((nextPayoutTs.value - Date.now()) / 3600000)));

const weeklyDescText = computed(() => {
  const n = daysToPayout.value > 0 ? `${daysToPayout.value}${t.value.pool.daysShort}` : `${hoursToPayout.value}${t.value.pool.hoursShort}`;
  return fmt(t.value.publicCopy.nextSettlement, { n });
});
function go(url: string) {
  uni.navigateTo({ url, fail: () => {} });
}

async function loadRemotePool() {
  if (!remoteApiEnabled) return;
  const request = ++remoteRequest;
  const accountKey = app.accountKey;
  const accountScope = captureAccountScope();
  const runScope = captureCommerceSandboxRun();
  remoteState.value = "loading";
  remotePool.value = null;
  const current = () => mounted && request === remoteRequest && accountKey === app.accountKey
    && isCurrentAccountScope(accountScope) && isCurrentCommerceSandboxScope(runScope);
  try {
    const snapshot = await teamInsightsApi.leadershipPool();
    if (!current()) return;
    remotePool.value = snapshot;
    remoteState.value = "ready";
  } catch {
    if (!current()) return;
    remotePool.value = null;
    remoteState.value = "error";
  }
}

watch(() => app.accountKey, () => {
  if (!remoteApiEnabled) return;
  remotePool.value = null;
  void loadRemotePool();
});
const unsubscribePoolRun = subscribeCurrentCommerceSandboxRun(() => {
  if (!remoteApiEnabled || !mounted) return;
  remoteRequest += 1;
  remotePool.value = null;
  remoteState.value = "loading";
  void loadRemotePool();
});
onShow(() => { if (remoteApiEnabled) void loadRemotePool(); });
onUnmounted(() => {
  unsubscribePoolRun();
  mounted = false;
  remoteRequest += 1;
  remotePool.value = null;
});

// ─── styles ───
// Soft tint only — pills carry no border (chip/pill whitelist rule).
const howEntryStyle: CSSProperties = {
  gap: "6px",
  padding: "0 12px",
  height: "34px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
};

// De-carded hero: no surface/border/glow — the big number sits directly on the
// page floor with a 2px optical inset (leaderboard.vue prize-hero idiom).
const heroStyle: CSSProperties = { padding: "10px 2px 0" };
const heroCapStyle: CSSProperties = { gap: "6px", fontSize: "12px", letterSpacing: "0.16em", color: "var(--v5-brand-2)" };
const heroBigStyle: CSSProperties = { marginTop: "8px", fontSize: "56px", fontWeight: 600, lineHeight: 1, color: "var(--v5-ink)" };
const heroDescStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-ink-3)" };

// Frosted-glass status card (owner 2026-07-09) — chassis glass-tile token,
// fill only / zero border (bg-filled cards carry no border line).
const statusStyle: CSSProperties = {
  padding: "16px",
  borderRadius: "16px",
  background: "var(--v5-glass-bg)",
  backdropFilter: "blur(18px) saturate(180%)",
};
function statusCapStyle(color: string): CSSProperties {
  return { fontSize: "12px", letterSpacing: "0.16em", color };
}
const projectedStyle: CSSProperties = { marginTop: "8px", fontSize: "34px", fontWeight: 600, lineHeight: 1, color: "var(--v5-brand)" };
const lockedHeadStyle: CSSProperties = { marginTop: "8px", fontSize: "15px", color: "var(--v5-ink)" };
const pathCtaStyle: CSSProperties = {
  marginTop: "12px",
  gap: "6px",
  padding: "0 16px",
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontSize: "13px",
  fontWeight: 600,
};
// Transparent hairline group (form a) — border-top opens the group, rows keep
// their hairlines, content sits on the 2px optical inset.
const pastGroupStyle: CSSProperties = { marginTop: "12px", padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
const pastHeadStyle: CSSProperties = { padding: "12px 0 8px", fontSize: "12px", letterSpacing: "0.16em", color: "var(--v5-ink-3)" };
function historyRowStyle(isLast: boolean): CSSProperties {
  return { padding: "12px 0", borderBottom: isLast ? "none" : "1px solid var(--v5-border)" };
}
</script>
