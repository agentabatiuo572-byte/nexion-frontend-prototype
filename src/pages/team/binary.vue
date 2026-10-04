<!--
  Binary — ported from Nexion-prototype/app/(main)/team/binary/page.tsx.
  Balance Match (Track A vs Track B): remote amounts and rates come from the canonical projection. Demo daily cap from
  phase (P1-P3 $5K → P4+ $2K). Blocked if either track < $1,000/mo. De-carded:
  floor hero → tint block warning → 2 filled wing columns (top member + VBadge)
  → transparent gap block → auto-placement tint row → recent matches
  (transparent hairline group). Sub-page → <AppChassis active="team"> with
  in-page back row. Reuses network + commission stores + use-product-phase.
  De-MLM'd copy preserved (Track A/B / 平衡匹配, no "binary leg"/"spillover" in UI).
-->
<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.headerTitles.teamBinary" :subtitle="t.headerSubtitles.teamBinary" />

        <view class="px-4" style="display: flex; flex-direction: column; gap: 12px; padding-top: 10px">
          <EmptyState
            v-if="remoteApiEnabled && pageState.primary === 'error'"
            kind="recoverable-error"
            :title="t.network.projectionErrorTitle"
            :desc="t.network.projectionErrorDesc"
            :cta-label="t.network.retry"
            compact
            @cta="retryCanonicalData"
          />
          <view
            v-else-if="remoteApiEnabled && pageState.primary === 'loading'"
            class="rounded-2xl"
            style="height: 184px; background: color-mix(in srgb, var(--v5-surface-2) 65%, transparent)"
            role="status"
            aria-live="polite"
            aria-busy="true"
          />
          <template v-if="pageState.primary === 'ready'">
        <!-- match hero — de-carded: the number sits on the page floor. Rules-intro
             pill rides the cap row (owner 2026-07-09: kill the empty gap above the hero). -->
        <view :style="heroStyle">
          <view class="flex items-center justify-between" style="gap: 8px">
            <text class="block font-mono-tabular" :style="heroCapStyle">{{ estimateText }}</text>
            <view class="inline-flex items-center shrink-0 active:scale-[0.98]" :style="howItWorksStyle" role="button" tabindex="0" @click="go('/pages/team/binary-how')"  @keydown.enter.prevent="go('/pages/team/binary-how')" @keydown.space.prevent="go('/pages/team/binary-how')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
              <text>{{ t.binary.howItWorksEntry }}</text>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </view>
          </view>
          <text class="block font-display tabular-nums" :style="heroAmtStyle">+${{ periodMatch.toFixed(2) }}</text>
        </view>

        <!-- blocked warning -->
        <view v-if="blocked" class="rounded-2xl flex items-start" :style="blockedStyle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <view style="font-size: 12px; line-height: 1.375">
            <text class="block" :style="{ color: 'var(--v5-ink)', fontWeight: 600 }">{{ t.binary.blocked }}</text>
            <text class="block" :style="{ color: 'var(--v5-ink-3)', marginTop: '4px' }">{{ blockedRecoveryText }}</text>
            <view v-if="showGrowthRecoveryCta" class="inline-flex items-center active:opacity-70" :style="inviteCtaStyle" @click="go('/pages/team/team')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg>
              <text>{{ t.binary.inviteCta }}</text>
            </view>
          </view>
        </view>

        <!-- two wings -->
        <view class="grid grid-cols-2" style="gap: 10px">
          <view v-for="wing in wings" :key="wing.key" class="nx-glass-card rounded-2xl" :style="wingStyle(wing.isWeak)">
            <view class="flex items-center justify-between">
              <text class="font-display" :style="{ fontSize: '13px', fontWeight: 600, color: wing.color }">{{ wing.name }}</text>
              <text v-if="wing.isWeak" class="font-mono-tabular" :style="weakBadgeStyle">{{ t.binary.weakBadge }}</text>
            </view>
            <text class="block font-display tabular-nums" :style="wingVolStyle">${{ wing.monthVol.toLocaleString() }}</text>
            <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '4px' }">{{ wingMembersText(wing.count) }}</text>
            <view v-if="wing.top" class="flex items-center border-t" :style="topMemberStyle">
              <text :style="{ fontSize: '15px' }">{{ wing.top.avatar }}</text>
              <view class="flex-1 min-w-0">
                <text class="block truncate" :style="{ fontSize: '12px' }">{{ wing.top.name }}</text>
                <view class="flex items-center" style="gap: 4px; margin-top: 2px">
                  <VBadge :v="wing.top.vRank" size="sm" :show-title="false" />
                  <text class="font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)' }">${{ wing.top.monthVolumeUSD }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view v-if="remoteApiEnabled && pageState.memberDetails === 'error'" class="rounded-xl flex items-center justify-between" :style="memberReadErrorStyle">
          <text :style="{ fontSize: '12px', color: 'var(--v5-ink-2)' }">{{ t.binary.memberDetailsUnavailable }}</text>
          <view role="button" tabindex="0" class="active:opacity-70" :style="memberReadRetryStyle" @click="retryNetworkMembers"  @keydown.enter.prevent="retryNetworkMembers" @keydown.space.prevent="retryNetworkMembers">
            <text>{{ t.network.retry }}</text>
          </view>
        </view>

        <!-- recent matches — transparent hairline group -->
        <view v-if="recentBinaries.length > 0" :style="recentBlockStyle">
          <text class="block font-mono-tabular" :style="recentCapStyle">{{ t.binary.recentMatches }}</text>
          <view :style="recentGroupStyle">
          <view
            v-for="(e, i) in recentBinaries"
            :key="e.id"
            class="flex items-center"
            :style="recentRowStyle(i === recentBinaries.length - 1)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0"><path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" /></svg>
            <view class="flex-1 min-w-0">
              <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink)' }">{{ e.sourceUserName }}</text>
              <text class="block font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ new Date(e.ts).toLocaleDateString(dateLocale()) }}</text>
            </view>
            <text class="font-mono-tabular tabular-nums" :style="{ fontSize: '13px', color: binaryAmountColor(e.status), fontWeight: 600 }">{{ binaryAmountLabel(e) }}</text>
          </view>
          </view>
        </view>
          </template>
        </view>
      </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onMounted, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import EmptyState from "@/components/empty-state.vue";
import VBadge from "@/components/team/v-badge.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { useNetwork, type NetworkMember } from "@/store/network";
import { useCommission } from "@/store/commission";
import { useProductPhase } from "@/composables/use-product-phase";
import { BINARY_SETTLE_PERIOD, SETTLE_PERIOD_DAYS } from "@/lib/binary-settlement";
import { remoteApiEnabled, sessionVault } from "@/api/runtime";
import { onShow } from "@dcloudio/uni-app";
import { navTo } from "@/lib/route";
import { binaryPageState } from "@/lib/binary-page-state";
import { binaryBlockedGuidance } from "@/lib/binary-blocked-guidance";
import { binarySessionReady } from "@/lib/binary-session-ready";
import { createScopedReadCoalescer } from "@/lib/binary-read-coalescer";
import { captureRuntimeRevision } from "@/api/order-api";
import { useAuth } from "@/store/auth";
import { useApp } from "@/store/app";

const t = useT();
const network = useNetwork();
const commission = useCommission();
const phase = useProductPhase();
const auth = useAuth();
const app = useApp();
const canonicalReadCoalescer = createScopedReadCoalescer();

const snapshot = computed(() => commission.binarySnapshot);
const remoteSessionReady = computed(() => binarySessionReady({
  remote: remoteApiEnabled,
  authenticated: auth.isAuthenticated,
  accountId: auth.accountId,
  appAccountKey: app.accountKey,
  sessionUserId: sessionVault.read()?.user.userId ?? null,
}));
const pageState = computed(() => binaryPageState({
  remote: remoteApiEnabled,
  binaryStatus: commission.binaryStatus,
  networkStatus: network.remoteStatus,
}));
const remoteTrackA = computed(() => commission.binarySnapshot?.trackA ?? 0);
const remoteTrackB = computed(() => commission.binarySnapshot?.trackB ?? 0);
const settlePeriod = computed(() => remoteApiEnabled ? snapshot.value?.settlePeriod ?? "monthly" : BINARY_SETTLE_PERIOD);
const settleDays = computed(() => SETTLE_PERIOD_DAYS[settlePeriod.value]);
const MIN_THRESHOLD = computed(() => remoteApiEnabled ? snapshot.value?.threshold ?? 0 : 1000);
const MATCH_RATE = computed(() => remoteApiEnabled ? snapshot.value?.matchRate ?? 0 : 0.1);
const DAILY_CAP = computed(() => remoteApiEnabled ? snapshot.value?.dailyCap ?? 0 : phase.value.binaryDailyCapUSD);
const sides = computed(() => network.byBinary());
const leftMonthVol = computed(() => remoteApiEnabled ? remoteTrackA.value : network.leftVolumeMonth());
const rightMonthVol = computed(() => remoteApiEnabled ? remoteTrackB.value : network.rightVolumeMonth());
const weakSide = computed(() => (leftMonthVol.value <= rightMonthVol.value ? "left" : "right"));
const weakVol = computed(() => Math.min(leftMonthVol.value, rightMonthVol.value));
const strongVol = computed(() => Math.max(leftMonthVol.value, rightMonthVol.value));
// 非远端演示估算按周期业绩和配置比例计算，封顶 = 日封顶 × 周期天数。
// 正式远端直接读取服务端估算；公式比例来自同一快照，不在页面重算奖金。
const periodMatch = computed(() => {
  if (remoteApiEnabled) return snapshot.value?.estimatedAmountUsdt ?? 0;
  const factor = settleDays.value / 30;
  return Math.min(weakVol.value * factor * MATCH_RATE.value, DAILY_CAP.value * settleDays.value);
});
const blocked = computed(() => remoteApiEnabled
  ? Boolean(snapshot.value?.blockedReason)
  : leftMonthVol.value < MIN_THRESHOLD.value || rightMonthVol.value < MIN_THRESHOLD.value);

const recentBinaries = computed(() =>
  remoteApiEnabled
    ? (snapshot.value?.recentMatches ?? []).map((match) => ({
      id: match.id, sourceUserName: match.id, amountUSDT: match.amountUsdt, ts: match.createdAt, status: match.status,
    }))
    : commission.events.filter((e) => e.kind === "binary").slice(0, 5),
);
const spilloverCount = computed(() => remoteApiEnabled ? snapshot.value?.autoPlacedMembers ?? 0 : network.members.filter((m) => m.isSpillover).length);

function topOf(members: NetworkMember[]): NetworkMember | undefined {
  return [...members].sort((a, b) => b.monthVolumeUSD - a.monthVolumeUSD)[0];
}

interface Wing {
  key: string;
  name: string;
  count: number;
  monthVol: number;
  isWeak: boolean;
  color: string;
  top: NetworkMember | undefined;
}
const wings = computed<Wing[]>(() => [
  {
    key: "left",
    name: t.value.binary.leftWing,
    count: remoteApiEnabled && pageState.value.memberDetails !== "ready"
      ? snapshot.value?.trackAMembers ?? 0 : sides.value.left.length,
    monthVol: leftMonthVol.value,
    isWeak: weakSide.value === "left",
    color: "var(--v5-brand)",
    top: pageState.value.memberDetails === "ready" ? topOf(sides.value.left) : undefined,
  },
  {
    key: "right",
    name: t.value.binary.rightWing,
    count: remoteApiEnabled && pageState.value.memberDetails !== "ready"
      ? snapshot.value?.trackBMembers ?? 0 : sides.value.right.length,
    monthVol: rightMonthVol.value,
    isWeak: weakSide.value === "right",
    color: "var(--v5-tech-cyan)",
    top: pageState.value.memberDetails === "ready" ? topOf(sides.value.right) : undefined,
  },
]);

// 结算周期文案 + 数字据后台同源配置派生(默认每月),消除「页面暗示日结」与「每月结算」矛盾,
// 并让 hero 预计金额随结算周期联动(数字 periodMatch + 标签 {period} + 节奏 {freq} 三者一致)。
const periodFreqLabel = computed(() => t.value.binary.settlePeriodLabel[settlePeriod.value]);
const estimateText = computed(() =>
  fmt(t.value.binary.estimate, { period: t.value.binary.periodEstimateLabel[settlePeriod.value] }),
);
const gapHintText = computed(() => fmt(t.value.binary.gapHint, { freq: periodFreqLabel.value }));
const formulaText = computed(() =>
  fmt(t.value.binary.formula, {
    rate: (MATCH_RATE.value * 100).toLocaleString(dateLocale(), { maximumFractionDigits: 8 }),
    cap: DAILY_CAP.value.toLocaleString(),
    freq: periodFreqLabel.value,
  }),
);
const blockedDetailText = computed(() => {
  const blockedReason = snapshot.value?.blockedReason;
  if (remoteApiEnabled && blockedReason) {
    return t.value.binary.blockReasons[blockedReason as keyof typeof t.value.binary.blockReasons]
      ?? t.value.binary.blockReasons.UNKNOWN;
  }
  return fmt(t.value.binary.blockedDetail, {
    side: weakSide.value === "left" ? t.value.binary.left : t.value.binary.right,
    vol: weakVol.value.toFixed(0),
  });
});
const showGrowthRecoveryCta = computed(() => binaryBlockedGuidance({
  remote: remoteApiEnabled,
  blocked: blocked.value,
  reason: snapshot.value?.blockedReason,
}).showInviteOptions);
const blockedRecoveryText = computed(() => showGrowthRecoveryCta.value
  ? `${blockedDetailText.value} ${t.value.binary.blockedAction}`
  : blockedDetailText.value,
);
const spilloverTitleText = computed(() =>
  fmt(t.value.binary.spilloverTitle, { n: spilloverCount.value }),
);
function wingMembersText(n: number): string {
  return fmt(t.value.binary.monthVolMembers, { n });
}

function go(url: string) {
  navTo(url);
}

function binaryAmountLabel(event: { amountUSDT: number; status?: string }): string {
  const amount = `${event.amountUSDT.toFixed(2)}`;
  if (event.status === "reversed") return `−${amount}`;
  if (event.status === "frozen" || event.status === "rejected") return amount;
  return `+${amount}`;
}

function binaryAmountColor(status?: string): string {
  if (status === "rejected") return "var(--v5-danger)";
  if (status === "frozen") return "var(--v5-tech-cyan)";
  if (status === "reversed") return "var(--v5-ink-4)";
  return "var(--v5-warning)";
}

function retryCanonicalData(): void {
  if (!remoteSessionReady.value) return;
  const scope = {
    accountKey: app.accountKey,
    accountBindingEpoch: app.accountBindingEpoch,
    runtime: captureRuntimeRevision(),
  };
  void canonicalReadCoalescer.run(scope, () => Promise.all([
    commission.refreshCanonicalBinary(),
    network.refreshCanonicalNetwork(),
  ]).then(() => undefined));
}

function retryNetworkMembers(): void {
  if (!remoteSessionReady.value) return;
  void network.refreshCanonicalNetwork();
}

watch(remoteSessionReady, (ready, wasReady) => {
  if (ready && !wasReady) retryCanonicalData();
}, { immediate: true, flush: "post" });

onMounted(() => {
  // The projection owns rule/settlement aggregates; the network projection
  // owns the actual A/B members shown inside each wing.
  if (remoteApiEnabled) retryCanonicalData();
});
onShow(() => {
  if (remoteApiEnabled) retryCanonicalData();
});

// ─── styles ───
// Soft tint pill — chip idiom, fill only (no border, single visual difference).
const howItWorksStyle: CSSProperties = {
  gap: "6px",
  padding: "0 12px",
  height: "44px",  // 《07》tap≥44(原 34)
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand-2)",
};
// De-carded hero — cap + number + formula on the page floor. The old radial
// glow card was a page-floor aura → deleted outright (owner call 2026-07-08).
const heroStyle: CSSProperties = { padding: "6px 2px 0" };
const heroCapStyle: CSSProperties = { fontSize: "12px", fontWeight: 500, letterSpacing: "0.06em", color: "var(--v5-warning)" };
const heroAmtStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "34px",
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: "-0.022em",
  color: "var(--v5-warning)",
};
const heroFormulaStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "6px" };

// Status callout — tint fill only, border chrome dropped (single difference).
const blockedStyle: CSSProperties = {
  padding: "14px",
  gap: "10px",
  background: "color-mix(in srgb, var(--v5-brand-2) 12%, transparent)",
};
const inviteCtaStyle: CSSProperties = {
  marginTop: "8px",
  gap: "4px",
  fontSize: "12px",
  color: "var(--v5-brand)",
  textDecoration: "underline",
};

// Filled wing columns (podium idiom) — weak side takes the warning-soft fill;
// single visual difference, no borders, no hardcoded hex.
function wingStyle(isWeak: boolean): CSSProperties {
  return {
    padding: "14px",
    // 非弱侧原用 surface-2,与页面底同色(亮色 ΔE 2.2)不可辨,改 L1 surface。
    background: isWeak ? "var(--v5-warning-soft)" : "var(--v5-surface)",
  };
}
const weakBadgeStyle: CSSProperties = {
  fontSize: "12px",
  background: "color-mix(in srgb, var(--v5-warning) 20%, transparent)",
  color: "var(--v5-warning)",
  padding: "2px 6px",
  borderRadius: "4px",
};
const wingVolStyle: CSSProperties = { marginTop: "8px", fontSize: "20px", fontWeight: 600, lineHeight: 1 };
const topMemberStyle: CSSProperties = {
  marginTop: "10px",
  paddingTop: "10px",
  borderColor: "var(--v5-border)",
  gap: "6px",
};
const memberReadErrorStyle: CSSProperties = {
  padding: "10px 12px",
  gap: "12px",
  background: "var(--v5-surface-2)",
};
const memberReadRetryStyle: CSSProperties = {
  minHeight: "36px",
  padding: "0 10px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-brand) 12%, transparent)",
  color: "var(--v5-brand)",
  fontSize: "12px",
  fontWeight: 600,
};

// Frosted-glass gap block (owner 2026-07-09) — chassis glass-tile token,
// fill only / zero border; +12px top margin keeps the 24px section rhythm.
const gapBlockStyle: CSSProperties = {
  marginTop: "12px",
  padding: "16px",
  borderRadius: "16px",
  background: "var(--v5-glass-bg)",
  backdropFilter: "blur(18px) saturate(180%)",
};
const gapCapStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-ink-3)",
  marginBottom: "10px",
};
const gapBarTrackStyle: CSSProperties = { height: "8px", background: "color-mix(in srgb, var(--v5-surface-2) 50%, transparent)" };

// Nav row tile — soft tint fill only, border chrome dropped.
const spilloverStyle: CSSProperties = {
  padding: "14px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
};
const spilloverIconStyle: CSSProperties = {
  width: "36px",
  height: "36px",
  background: "color-mix(in srgb, var(--v5-brand-2) 20%, transparent)",
};

// Transparent hairline group — cap label outside, border-top opens the rows.
const recentBlockStyle: CSSProperties = { marginTop: "12px" };
const recentCapStyle: CSSProperties = {
  padding: "0 2px",
  marginBottom: "8px",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-ink-3)",
};
const recentGroupStyle: CSSProperties = { padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
function recentRowStyle(isLast: boolean): CSSProperties {
  return {
    padding: "11px 0",
    gap: "10px",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}


</script>
