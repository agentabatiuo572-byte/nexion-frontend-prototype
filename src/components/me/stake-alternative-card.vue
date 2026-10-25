<!-- Optional withdrawal-page disclosure. Pool eligibility remains canonical. -->
<template>
  <view v-if="config.isEnabled('stakingVisible') && hasEligiblePool" class="stake-alternative mx-4 mt-3">
    <view class="stake-alternative-toggle" role="button" tabindex="0" :aria-expanded="expanded" aria-controls="stake-alternative-details" @click="expanded = !expanded" @keydown.enter.prevent="expanded = !expanded" @keydown.space.prevent="expanded = !expanded">
      <text>{{ w.label }}</text>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" :style="{ transform: expanded ? 'rotate(180deg)' : undefined }"><path d="m6 9 6 6 6-6" /></svg>
    </view>
    <view v-if="expanded" id="stake-alternative-details" class="stake-alternative-details">
      <text class="block">{{ fmt(w.basis, { amount: formatGroupedAmount(amountNum) }) }}</text>
      <view v-for="tier in displayTiers" :key="tier.days" class="stake-alternative-row">
        <text>{{ fmt(w.term, { days: tier.days, rate: formatStakingPercentage(tier.apy) }) }}</text>
        <text class="tabular-nums">{{ fmt(w.estimate, { amount: formatGroupedAmount(tierDelta(tier)) }) }}</text>
      </view>
      <text class="block stake-alternative-note">{{ w.assumptions }}</text>
      <text class="block stake-alternative-note">{{ w.lockup }}</text>
      <view class="stake-alternative-link" role="button" tabindex="0" @click="goStaking" @keydown.enter.prevent="goStaking" @keydown.space.prevent="goStaking">
        <text>{{ w.rules }}</text>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 5 7 7-7 7" /></svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { formatGroupedAmount } from "@/lib/amount-display";
import { formatStakingPercentage } from "@/lib/staking-percentage";
import { navTo } from "@/lib/route";
import { computed, onMounted, ref } from "vue";
import { useLocaleStore } from "@/store/locale";
import { stakeAlternativeCopy } from "@/i18n/stake-alternative-copy";
import { fmt } from "@/i18n/format";
import { useStaking, STAKING_APY, STAKING_PENALTY, STAKING_MIN, type StakingTerm } from "@/store/staking";
import { useConfig } from "@/store/config";
import { canRecommendStakingPool, resolveStakingPool } from "@/lib/staking-canonical";

const props = defineProps<{ amountNum: number }>();
const locale = useLocaleStore();
const w = computed(() => stakeAlternativeCopy[locale.code === "zh" || locale.code === "vi" ? locale.code : "en"]);
const expanded = ref(false);
const staking = useStaking();
const config = useConfig();
onMounted(() => {
  if (!staking.isMockMode) void staking.syncRemote();
});

const tiers = computed(() => ([30, 90, 180] as StakingTerm[]).map(days => {
  const pool = resolveStakingPool(
    { isMockMode: staking.isMockMode, remoteReady: staking.remoteReady, pools: staking.pools },
    days,
    { apy: STAKING_APY[days], penalty: STAKING_PENALTY[days], minAmountUsdt: STAKING_MIN[days] },
  );
  return pool ? { days, apy: pool.apy, pool } : null;
}));
const displayTiers = computed(() => tiers.value.filter((tier): tier is NonNullable<typeof tier> =>
  tier !== null && canRecommendStakingPool(
    { isMockMode: staking.isMockMode, remoteReady: staking.remoteReady, pools: staking.pools },
    tier.days,
    props.amountNum,
    tier.pool,
  ),
));
const hasEligiblePool = computed(() => displayTiers.value.length > 0);
function tierDelta(tier: { days: number; apy: number }): number {
  return props.amountNum * tier.apy * tier.days / 365;
}
function goStaking() {
  if (!hasEligiblePool.value) return;
  navTo("/pages/staking/staking");
}
</script>

<style scoped>
.stake-alternative { border-top:1px solid var(--v5-border); color:var(--v5-ink-2); font-family:var(--font-v5); font-size:13px; line-height:1.6; }
.stake-alternative-toggle,.stake-alternative-link { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:44px; padding:8px 0; box-sizing:border-box; }
.stake-alternative-toggle svg,.stake-alternative-link svg { flex-shrink:0; }
.stake-alternative-details { padding-bottom:8px; }
.stake-alternative-row { display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px 12px; padding:8px 0; border-bottom:1px solid var(--v5-border); }
.stake-alternative-note { margin-top:10px; }
.stake-alternative-link { justify-content:flex-start; text-decoration:underline; text-underline-offset:3px; }
.stake-alternative-toggle:focus-visible,.stake-alternative-link:focus-visible { outline:2px solid var(--v5-ink-2); outline-offset:2px; }
</style>
