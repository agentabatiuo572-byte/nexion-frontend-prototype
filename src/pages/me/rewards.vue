<!--
  My Rewards L1 (我的奖励 · 类别汇总) — me sub-page. OKX-rewards-hub-style
  stat cards (owner-directed 2026-07-09): hero benefit line, then one big
  surface card per category — category name, LARGE value (vouchers = available
  count; USDT/NEX = credited totals), one-line purpose description, and a
  round arrow affordance. Whole card taps into the L2 records page
  /me/rewards/list?cat=… (pages/me/rewards-list).

  Opening this page writes the rewards-seen watermark (clears the reward half
  of the Me-entry unread dot; the voucher half stays until used/expired).

  Backend-replaceable: voucher counts from the voucher store
  (GET /api/me/vouchers), credited totals derived from the bills ledger reward family
  (GET /api/me/bills — isRewardBill, single source shared with the dot and
  the L2 lists). All-zero keeps the three cards (big zeros) + hint line.
  Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink); padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" :title="t.rewards.title" />

      <text class="block" :style="heroStyle">{{ t.rewards.heroTitle }}</text>

      <view
        v-for="c in cats"
        :key="c.key"
        class="flex items-center active:opacity-80"
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
import { computed, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useVoucher } from "@/store/voucher";
import { useBills, isRewardBill } from "@/store/bills";
import { useRewardsSeen } from "@/store/rewards-seen";
import { navTo } from "@/lib/route";

// L2 category param — mirrored by pages/me/rewards-list.vue (invalid → voucher).
type RewardsCat = "voucher" | "usdt" | "nex";

const t = useT();
const voucher = useVoucher();
const bills = useBills();
const rewardsSeen = useRewardsSeen();

// Opening L1 reads everything posted so far — clears the reward half of the
// Me-entry dot (the voucher half stays until vouchers are used/expired).
onShow(() => rewardsSeen.markSeen());

const availableCount = computed(() => voucher.claimedUnused.length);
const expiredCount = computed(() => voucher.expiredVouchers.length);

// Credited totals per symbol — same reward-family predicate as the dot and
// the L2 records (bills.ts isRewardBill, single source).
function creditedTotal(symbol: "USDT" | "NEX"): number {
  return bills.bills.reduce((sum, b) => (isRewardBill(b) && b.symbol === symbol ? sum + b.amount : sum), 0);
}
const usdtTotal = computed(() => creditedTotal("USDT"));
const nexTotal = computed(() => creditedTotal("NEX"));

const allZero = computed(
  () => availableCount.value === 0 && expiredCount.value === 0 && usdtTotal.value === 0 && nexTotal.value === 0,
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
    big: String(availableCount.value),
    unit: t.value.rewards.unitVouchers,
    // Expired stock replaces the purpose line — the more actionable fact.
    desc: expiredCount.value > 0 ? fmt(t.value.rewards.expiredCount, { n: expiredCount.value }) : t.value.rewards.catVouchersDesc,
  },
  {
    key: "usdt",
    label: t.value.rewards.catUsdt,
    big: `$${usdtTotal.value.toFixed(2)}`,
    unit: "USDT",
    desc: t.value.rewards.catUsdtDesc,
  },
  {
    key: "nex",
    label: t.value.rewards.catNex,
    big: nexTotal.value.toLocaleString(),
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
const cardStyle: CSSProperties = {
  margin: "0 16px 12px",
  padding: "16px",
  gap: "12px",
  background: "var(--v5-surface)",
  borderRadius: "16px",
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
</script>
