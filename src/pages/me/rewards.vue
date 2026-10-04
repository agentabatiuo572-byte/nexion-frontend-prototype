<!--
  My Rewards L1 (我的奖励 · 类别汇总) — me sub-page. OKX-rewards-hub-style
  stat cards (owner-directed 2026-07-09): hero benefit line, then one big
  surface card per category — category name, LARGE value (vouchers = available
  count; USDT/NEX = reward totals), one-line purpose description, and a
  round arrow affordance. Whole card taps into the L2 records page
  /me/rewards/list?cat=… (pages/me/rewards-list).

  Opening this page writes the rewards-seen watermark (clears the reward half
  of the Me-entry unread dot; the voucher half stays until used/expired).

  Voucher counts come from the voucher store. Remote reward totals come from
  GET /api/app/wallet/bills/summary; only mock mode sums local reward bills.
  All-zero keeps the three cards (big zeros) + hint line.
  Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink); padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" :title="t.rewards.title" />

      <text class="block" :style="heroStyle">{{ t.rewards.heroTitle }}</text>

      <view v-if="summaryFailed" class="flex items-center justify-between" :style="summaryErrorStyle">
        <text>{{ t.walletV3.submitReasonServiceUnavailable }}</text>
        <view class="shrink-0 active:opacity-70" :style="retryBtnStyle" role="button" tabindex="0" @click="refreshRewardSummary"><text>{{ t.store.catalogRetry }}</text></view>
      </view>

      <view
        v-for="c in cats"
        :key="c.key"
        class="nx-glass-card flex items-center active:opacity-80"
        :style="cardStyle"
        role="button"
        tabindex="0"
        :aria-label="c.label"
        @click="openCat(c.key)"
      >
        <view class="flex-1 min-w-0">
          <text class="block truncate" :style="catTitleStyle">{{ c.label }}</text>
          <view class="flex items-baseline" style="white-space: nowrap; margin-top: 10px; gap: 6px">
            <text class="font-mono-tabular" :style="bigNumStyle">{{ c.big }}</text>
            <text :style="unitStyle">{{ c.unit }}</text>
          </view>
          <text class="block truncate" :style="descStyle">{{ c.desc }}</text>
        </view>
        <view class="grid place-items-center shrink-0" :style="circleStyle">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-bg)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </view>
      </view>

      <!-- All-zero guidance — cards stay rendered (stable IA), hint explains where rewards come from. -->
      <text v-if="allZero" class="block" :style="hintStyle">{{ t.rewards.emptyHint }}</text>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch, type CSSProperties } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useVoucher } from "@/store/voucher";
import { useBills, isRewardBill } from "@/store/bills";
import { useRewardsSeen } from "@/store/rewards-seen";
import { useApp } from "@/store/app";
import { navTo } from "@/lib/route";
import { fundsServerEnabled, remoteApiEnabled } from "@/api/runtime";
import { remoteAccountScope } from "@/lib/remote-account-epoch";

// L2 category param — mirrored by pages/me/rewards-list.vue (invalid → voucher).
type RewardsCat = "voucher" | "usdt" | "nex";

const t = useT();
const voucher = useVoucher();
const bills = useBills();
const rewardsSeen = useRewardsSeen();
const app = useApp();
let rewardViewActive = true;
let rewardViewRequest = 0;
function invalidateRewardView() { rewardViewActive = false; rewardViewRequest++; }
onHide(invalidateRewardView);
onUnmounted(invalidateRewardView);

async function refreshRewardSummary() {
  const accountKey = app.accountKey;
  const accountScope = remoteAccountScope.snapshot();
  const request = ++rewardViewRequest;
  if (remoteApiEnabled) void voucher.refreshRemote();
  if (!fundsServerEnabled) {
    rewardsSeen.markSeen();
    return;
  }
  try { await bills.refreshSummary(); } catch { return; /* failed or superseded reads never acknowledge a later summary */ }
  if (rewardViewActive && request === rewardViewRequest && remoteAccountScope.isCurrent(accountScope)
      && accountKey === app.accountKey && bills.summaryStatus === "ready") rewardsSeen.markSeen();
}
onShow(() => { rewardViewActive = true; void refreshRewardSummary(); });

const voucherReady = computed(() => !remoteApiEnabled || voucher.remoteStatus === "ready");
const remoteAvailableCount = computed<number | null>(() => voucherReady.value ? voucher.claimedUnused.length : null);
const remoteExpiredCount = computed<number | null>(() => voucherReady.value ? voucher.expiredVouchers.length : null);
// Voucher re-reads happen on every return from a detail page. Keep the last
// successful counts so the cards never flash "--" for values already known.
const lastAvailableCount = ref<number | null>(null);
const lastExpiredCount = ref<number | null>(null);
watch(remoteAvailableCount, (value) => { if (value !== null) lastAvailableCount.value = value; }, { immediate: true });
watch(remoteExpiredCount, (value) => { if (value !== null) lastExpiredCount.value = value; }, { immediate: true });
const availableCount = computed(() => remoteAvailableCount.value ?? lastAvailableCount.value);
const expiredCount = computed(() => remoteExpiredCount.value ?? lastExpiredCount.value);

// Reward totals per symbol — same reward-family predicate as the dot and
// the L2 records (bills.ts isRewardBill, single source).
function creditedTotal(symbol: "USDT" | "NEX"): number {
  return bills.bills.reduce((sum, b) => (isRewardBill(b) && b.symbol === symbol ? sum + b.amount : sum), 0);
}
const usdtTotal = computed(() => creditedTotal("USDT"));
const nexTotal = computed(() => creditedTotal("NEX"));
const summaryReady = computed(() => !fundsServerEnabled || bills.summaryStatus === "ready");
const summaryFailed = computed(() => (fundsServerEnabled && bills.summaryStatus === "error")
  || (remoteApiEnabled && voucher.remoteStatus === "error"));
const remoteUsdtTotal = computed<number | null>(() => summaryReady.value ? bills.summary?.rewardsUsdt ?? null : null);
const remoteNexTotal = computed<number | null>(() => summaryReady.value ? bills.summary?.rewardsNex ?? null : null);
// A background refresh (this page re-shows on every return from a detail page)
// must not blank out totals the user already saw. The store drops its snapshot
// to null only on a failed read, so keep the last successful figures while a
// re-read is in flight, and surface the failure through summaryFailed instead of
// replacing known values with "--".
const lastUsdtTotal = ref<number | null>(null);
const lastNexTotal = ref<number | null>(null);
watch(remoteUsdtTotal, (value) => { if (value !== null) lastUsdtTotal.value = value; }, { immediate: true });
watch(remoteNexTotal, (value) => { if (value !== null) lastNexTotal.value = value; }, { immediate: true });
const displayUsdtTotal = computed(() =>
  fundsServerEnabled ? (remoteUsdtTotal.value ?? lastUsdtTotal.value) : usdtTotal.value,
);
const displayNexTotal = computed(() =>
  fundsServerEnabled ? (remoteNexTotal.value ?? lastNexTotal.value) : nexTotal.value,
);

const allZero = computed(
  () => summaryReady.value && voucherReady.value && availableCount.value === 0 && expiredCount.value === 0 && displayUsdtTotal.value === 0 && displayNexTotal.value === 0,
);

interface CatCard {
  key: RewardsCat;
  label: string;
  big: string;
  unit: string;
  desc: string;
}

const cats = computed<CatCard[]>(() => [
  {
    key: "voucher",
    label: t.value.rewards.catVouchers,
    big: availableCount.value === null ? "--" : String(availableCount.value),
    unit: t.value.rewards.unitVouchers,
    // Expired stock replaces the purpose line — the more actionable fact.
    desc: expiredCount.value !== null && expiredCount.value > 0 ? fmt(t.value.rewards.expiredCount, { n: expiredCount.value }) : t.value.rewards.catVouchersDesc,
  },
  {
    key: "usdt",
    label: t.value.rewards.catUsdt,
    big: displayUsdtTotal.value === null ? "--" : `$${displayUsdtTotal.value.toFixed(2)}`,
    unit: "USDT",
    desc: t.value.rewards.catUsdtDesc,
  },
  {
    key: "nex",
    label: t.value.rewards.catNex,
    big: displayNexTotal.value === null ? "--" : displayNexTotal.value.toLocaleString(),
    unit: "NEX",
    desc: t.value.rewards.catNexDesc,
  },
]);

function openCat(cat: RewardsCat) {
  navTo(`/me/rewards/list?cat=${cat}`);
}

// ── styles ── (stat-card identity — filled surface, no border, big value as
// the visual hero; round ink circle = the rest-state affordance, OKX idiom)
const heroStyle: CSSProperties = {
  margin: "2px 16px 18px",
  fontFamily: "var(--font-v5)",
  fontSize: "26px",
  fontWeight: 600,
  lineHeight: 1.3,
  letterSpacing: "-0.02em",
  color: "var(--v5-ink)",
};
const cardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  margin: "0 16px 12px",
  padding: "16px",
  gap: "12px",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
};
const catTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 550,
  color: "var(--v5-ink)",
};
const bigNumStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "34px",
  fontWeight: 600,
  lineHeight: 1.1,
  letterSpacing: "-0.02em",
  color: "var(--v5-ink)",
};
const unitStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
};
const descStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  textWrap: "pretty",
} as CSSProperties;
// Inverted ink circle — theme-safe high-contrast affordance (bg token flips
// with the theme, so dark = light circle / light = dark circle, OKX-style).
const circleStyle: CSSProperties = {
  width: "38px",
  height: "38px",
  borderRadius: "999px",
  background: "var(--v5-ink)",
};
const hintStyle: CSSProperties = {
  margin: "8px 24px 0",
  textAlign: "center",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  lineHeight: 1.6,
};
const summaryErrorStyle: CSSProperties = { margin: "0 16px 12px", padding: "10px 12px", borderRadius: "12px", background: "color-mix(in srgb, var(--v5-danger) 10%, transparent)", color: "var(--v5-danger)", fontSize: "12px", gap: "12px" };
const retryBtnStyle: CSSProperties = { minHeight: "32px", padding: "0 10px", borderRadius: "999px", background: "var(--v5-surface-2)", color: "var(--v5-ink)", fontSize: "12px" };


</script>
