<!--
  Global Leadership Pool — ported from
  Nexion-prototype/app/(main)/team/leadership-pool/page.tsx.
  Week-pool hero de-carded (DECARD form c): $X K sits directly on the page floor
  (card gradient/radial + accent border deleted, not tuned). My-status block =
  frosted-glass card, zero border (owner 2026-07-09; unlocked: projected dividend
  + votes/share stats / locked: V3-gate + path CTA). V-rank vote-weight table = single surface
  container (form b, no border, mine-row tinted). Past-pools history = transparent
  hairline group (form a). Sub-page → <AppChassis active="team"> w/ back → /team.
  Reuses leadership-pool + v-rank stores + VBadge/VBadgeIcon. useMemo → computed.
  <Link>→<view @click>.
-->
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
            <view class="grid grid-cols-3 text-center" style="margin-top: 12px; gap: 8px">
              <view>
                <text class="block" :style="statLabelStyle">{{ t.pool.yourVotes }}</text>
                <text class="block font-display tabular-nums" :style="statValueStyle">{{ myVotes }}</text>
              </view>
              <view>
                <text class="block" :style="statLabelStyle">{{ t.pool.totalVotes }}</text>
                <text class="block font-display tabular-nums" :style="statValueStyle">{{ totalVotes.toLocaleString() }}</text>
              </view>
              <view>
                <text class="block" :style="statLabelStyle">{{ t.pool.yourShare }}</text>
                <text class="block font-display tabular-nums" :style="statValueStyle">{{ (myShare * 100).toFixed(2) }}%</text>
              </view>
            </view>
          </template>
          <template v-else>
            <text class="block font-mono-tabular" :style="statusCapStyle('var(--v5-ink-3)')">{{ t.pool.locked }}</text>
            <text class="block" :style="lockedHeadStyle">
              <text>{{ requiresV3Parts[0] }}</text>
              <text :style="{ color: 'var(--v5-brand)', fontWeight: 600 }">{{ requiresV3Parts[1] }}</text>
              <text>{{ requiresV3Parts[2] }}</text>
            </text>
            <text class="block" :style="lockedSubStyle">{{ currentlyVText }}</text>
            <view class="inline-flex items-center active:scale-[0.97] transition-transform" :style="pathCtaStyle" @click="go('/pages/team/rank')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
              <text>{{ t.pool.seePathV3 }}</text>
            </view>
          </template>
        </view>

        <!-- Top-concentration caption (derived, true) -->
        <view :style="concentrationStripStyle">
          <text :style="concentrationTextStyle">{{ concentrationText }}</text>
        </view>

        <!-- V-rank vote-weight table — single surface container (form b): outer
             border dropped, rows hairlined, my row tinted (clip needs overflow). -->
        <view class="rounded-2xl overflow-hidden" :style="tableCardStyle">
          <view class="flex items-center justify-between" :style="tableHeadStyle">
            <text class="font-mono-tabular" :style="tableHeadCapStyle">{{ t.pool.rankWeights }}</text>
            <text class="font-mono-tabular" :style="tableHeadCapStyle">{{ totalPeopleText }}</text>
          </view>
          <view
            v-for="(row, i) in voteRows"
            :key="row.v"
            class="flex items-center"
            :style="voteRowStyle(row.isMine, i === voteRows.length - 1)"
          >
            <VBadgeIcon :v="row.v" :size="32" />
            <view class="flex-1 min-w-0">
              <view class="flex items-center" style="gap: 6px">
                <text :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ row.label }}</text>
                <text v-if="row.isMine" class="font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-brand)' }">{{ t.pool.youTag }}</text>
              </view>
              <text class="block font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ row.peopleVotes }}</text>
            </view>
            <view class="text-right">
              <text class="block font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: 'var(--v5-ink)' }">{{ (row.shareOfPool * 100).toFixed(2) }}%</text>
              <text class="block font-mono-tabular tabular-nums" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">${{ row.perPerson }} {{ t.pool.eaShort }}</text>
            </view>
          </view>
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
              <text v-if="poolTotalText(h)" class="block font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">{{ poolTotalText(h) }}</text>
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
import VBadgeIcon from "@/components/team/v-badge-icon.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useLeadershipPool, V_VOTES, POOL_TOP_N, type LeadershipPayout } from "@/store/leadership-pool";
import { useVRank, V_RANKS, type VRank } from "@/store/v-rank";
import { rankLabel, rankTitle } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { remoteApiEnabled, teamInsightsApi } from "@/api/runtime";
import type { TeamLeadershipPoolSnapshot } from "@/api/team-insights-api";
import { useApp } from "@/store/app";
import { leadershipMainRows } from "@/lib/leadership-pool-main";
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
const dist = computed(() => {
  if (!remoteApiEnabled) return pool.globalVDistribution;
  const result = {} as Record<VRank, number>;
  for (let rank = 0; rank <= 12; rank += 1) result[rank as VRank] = 0;
  for (const row of remotePool.value?.distribution ?? []) result[row.vRank as VRank] = row.people;
  return result;
});
const remoteVotesByRank = computed(() => {
  const result: Record<number, number> = {};
  for (const row of remotePool.value?.distribution ?? []) result[row.vRank] = row.votes;
  return result;
});
const currentWeekPoolUSDT = computed(() => remoteApiEnabled ? remotePool.value?.currentWeekPoolUSDT ?? 0 : pool.currentWeekPoolUSDT);
const totalVotes = computed(() => remoteApiEnabled ? remotePool.value?.totalVotes ?? 0 : pool.totalVotes());
const myVotes = computed(() => remoteApiEnabled ? remotePool.value?.myVotes ?? 0 : pool.myVotes(vState.myRank));
const myShare = computed(() => remoteApiEnabled ? remotePool.value?.mySharePct ?? 0 : pool.mySharePct(vState.myRank));
const projectedPayout = computed(() => remoteApiEnabled ? remotePool.value?.projectedPayoutUSDT ?? 0 : pool.myProjectedPayout(vState.myRank));
const nextPayoutTs = computed(() => remoteApiEnabled ? Date.parse(remotePool.value?.nextPayoutAt ?? "") || Date.now() : pool.nextPayoutTs());
const poolHistory = computed<LeadershipPayout[]>(() => remoteApiEnabled
  ? (remotePool.value?.history ?? []).map((item) => ({ weekId: item.weekId, weekStartTs: 0,
      poolUSDT: 0, myVotes: myVotes.value, totalVotes: totalVotes.value,
      mySharePct: myShare.value, payoutUSDT: item.payoutUSDT }))
  : pool.history);
const daysToPayout = computed(() => Math.max(0, Math.ceil((nextPayoutTs.value - Date.now()) / 86400000)));
const hoursToPayout = computed(() => Math.max(0, Math.ceil((nextPayoutTs.value - Date.now()) / 3600000)));

const weeklyDescText = computed(() => {
  const n = daysToPayout.value > 0 ? `${daysToPayout.value}${t.value.pool.daysShort}` : `${hoursToPayout.value}${t.value.pool.hoursShort}`;
  return fmt(t.value.pool.weeklyDesc, { n });
});
// 领导池解锁档位的头衔标签。🔴 权威源是 `V_RANKS`(与 network-card / rank-how 读 title/cnTitle 同源),
// 不再在模板和脚本里各写一份 "V3 Captain" 字面量 —— 原来两处各一份,改了一处另一处静默错位。
// 头衔是**数据**不是文案:三语的 pool.requiresV3 句子里嵌的就是这个英文权威值
//(中文镜像走 V_RANKS.cnTitle,与 cn-title-field 的口径一致)。
const POOL_UNLOCK_RANK: VRank = 3;
// 中文界面用中文头衔(主人 2026-08-17 拍板:V3 = 舰长),与 zh 词典里 requiresV3 那句的写法必须一致
const isZh = computed(() => useLocaleStore().code === "zh");
const poolUnlockRankLabel = computed(() => rankLabel(POOL_UNLOCK_RANK, isZh.value, vState.ladder));
const requiresV3Parts = computed(() => {
  // 🔴 「句子里必然包含这个头衔」是一条无门保护的不变量(独立审计点出):某天单侧改了译文,
  //    split 拿不到第二段,原来会渲染成「整句 + 重复头衔」。取不到就退化成整句 + 不高亮。
  const sentence = t.value.pool.requiresV3;
  const i = sentence.indexOf(poolUnlockRankLabel.value);
  if (i < 0) return [sentence, "", ""];
  return [sentence.slice(0, i), poolUnlockRankLabel.value, sentence.slice(i + poolUnlockRankLabel.value.length)];
});
const currentlyVText = computed(() => fmt(t.value.pool.currentlyV, { n: myRank.value, title: rankTitle(myRank.value, isZh.value, vState.ladder) }));
const totalPeopleText = computed(() =>
  fmt(t.value.pool.totalPeople, { n: Object.values(dist.value).reduce((a, b) => a + b, 0).toLocaleString() }),
);
// 头部集中度:派生真值(顶部 N 名领袖占池比),随 seed/票权变,非硬编码。
const topPct = computed(() => {
  if (!remoteApiEnabled) return Math.round(pool.topConcentrationPct() * 100);
  if (totalVotes.value <= 0) return 0;
  let remaining = POOL_TOP_N; let votes = 0;
  for (let rank = 12; rank >= 3 && remaining > 0; rank -= 1) {
    const count = dist.value[rank as VRank] ?? 0; const take = Math.min(count, remaining);
    votes += take * (remoteVotesByRank.value[rank] ?? 0); remaining -= take;
  }
  return Math.round((votes / totalVotes.value) * 100);
});
const concentrationText = computed(() => fmt(t.value.pool.concentrationHint, { n: POOL_TOP_N, pct: topPct.value }));

const voteRows = computed(() => {
  const ranks: VRank[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const canonicalRows = remoteApiEnabled
    ? leadershipMainRows(remotePool.value ?? { totalVotes: 0, distribution: [] }, myRank.value, ranks)
    : [];
  const canonicalByRank = new Map(canonicalRows.map((row) => [row.rank, row]));
  return ranks.map((v) => {
    const canonical = canonicalByRank.get(v);
    const count = remoteApiEnabled ? canonical?.people ?? 0 : dist.value[v] ?? 0;
    const votes = remoteApiEnabled ? canonical?.votes ?? 0 : V_VOTES[v];
    const shareOfPool = remoteApiEnabled
      ? (canonical?.sharePct ?? 0) / 100
      : totalVotes.value > 0 ? (count * votes) / totalVotes.value : 0;
    return {
      v,
      label: rankLabel(v, isZh.value, vState.ladder),
      isMine: remoteApiEnabled ? canonical?.isMine === true : v === vState.myRank,
      peopleVotes: fmt(t.value.pool.peopleVotesEa, { count: count.toLocaleString(), votes }),
      shareOfPool,
      perPerson: ((currentWeekPoolUSDT.value * shareOfPool) / Math.max(count, 1)).toFixed(0),
    };
  });
});

function poolTotalText(h: LeadershipPayout): string {
  if (remoteApiEnabled && h.poolUSDT <= 0) return "";
  return fmt(t.value.pool.poolTotalShort, { k: (h.poolUSDT / 1000).toFixed(1), n: h.totalVotes.toLocaleString() });
}

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
const statLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)" };
const statValueStyle: CSSProperties = { fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)", marginTop: "2px" };
const lockedHeadStyle: CSSProperties = { marginTop: "8px", fontSize: "15px", color: "var(--v5-ink)" };
// SKILL leading-snug = 1.375 (原版 .mt-1.5 text-[12px] leading-snug; was 1.45)
const lockedSubStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.375 };
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

const concentrationStripStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-brand-2) 9%, transparent)",
};
const concentrationTextStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-brand-2)", lineHeight: 1.45 };

// Form b container — no border (fill is the single visual difference);
// overflow-hidden stays: the tinted mine-row must clip to the radius.
const tableCardStyle: CSSProperties = { background: "var(--v5-surface)", borderRadius: "16px" };
const tableHeadStyle: CSSProperties = { padding: "14px 16px 8px" };
const tableHeadCapStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.16em", color: "var(--v5-ink-3)" };
function voteRowStyle(isMine: boolean, isLast: boolean): CSSProperties {
  return {
    padding: "10px 16px",
    gap: "12px",
    background: isMine ? "color-mix(in srgb, var(--v5-brand) 5%, transparent)" : "transparent",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
// Transparent hairline group (form a) — border-top opens the group, rows keep
// their hairlines, content sits on the 2px optical inset.
const pastGroupStyle: CSSProperties = { marginTop: "12px", padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
const pastHeadStyle: CSSProperties = { padding: "12px 0 8px", fontSize: "12px", letterSpacing: "0.16em", color: "var(--v5-ink-3)" };
function historyRowStyle(isLast: boolean): CSSProperties {
  return { padding: "12px 0", borderBottom: isLast ? "none" : "1px solid var(--v5-border)" };
}
</script>
