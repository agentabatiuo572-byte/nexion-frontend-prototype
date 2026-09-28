<template>
  <view class="nx-glass-card team-ledger">
    <view class="team-ledger__header">
      <text class="team-ledger__title">{{ t.teamV3.thisMonth }}</text>
      <view class="nx-team-commissions-link team-ledger__details" role="link" tabindex="0" @click="goCommissions">
        <text>{{ t.teamV3.viewDetails }}</text>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
      </view>
    </view>
    <text class="team-ledger__amount tabular-nums">{{ '$' + monthUSDT.toFixed(2) }}</text>
    <text class="team-ledger__nex tabular-nums">+ {{ monthNEX.toLocaleString() }} NEX</text>
    <text class="team-ledger__lifetime">{{ t.teamV3.lifetime }} ${{ totalUSDTLifetime.toFixed(2) }} · {{ contributors }} {{ t.teamV3.contributors }}</text>

    <view class="team-ledger__bar" aria-hidden="true">
      <view :style="{ width: directPct + '%', background: 'var(--v5-brand)' }" />
      <view :style="{ width: extendedPct + '%', background: 'var(--v5-brand-2)' }" />
    </view>
    <view class="team-ledger__split">
      <view>
        <view class="team-ledger__label"><view class="team-ledger__dot" /><text>{{ t.teamV3.directLabel }} · {{ directPct }}%</text></view>
        <text class="team-ledger__value tabular-nums">${{ directUSDT.toFixed(2) }}</text>
      </view>
      <view>
        <view class="team-ledger__label"><view class="team-ledger__dot team-ledger__dot--extended" /><text>{{ t.teamV3.extendedLabel }} · {{ extendedPct }}%</text></view>
        <text class="team-ledger__value tabular-nums">${{ extendedUSDT.toFixed(2) }}</text>
      </view>
    </view>
    <view class="team-ledger__settlement">
      <view><text>{{ t.teamV3.settled }}</text><text class="tabular-nums">${{ unlockedUSDT.toFixed(2) }}</text></view>
      <view><text>{{ t.teamV3.coolingDown }}</text><text class="tabular-nums">${{ coolingUSDT.toFixed(2) }}</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useT } from "@/i18n/use-t";

const props = defineProps<{
  totalUSDTLifetime: number;
  contributors: number;
  directUSDT: number;
  extendedUSDT: number;
  monthUSDT: number;
  monthNEX: number;
  unlockedUSDT: number;
  coolingUSDT: number;
}>();
const t = useT();
const splitTotal = computed(() => props.directUSDT + props.extendedUSDT);
const directPct = computed(() => splitTotal.value > 0 ? Math.round(props.directUSDT / splitTotal.value * 100) : 0);
const extendedPct = computed(() => splitTotal.value > 0 ? 100 - directPct.value : 0);
function goCommissions() {
  uni.navigateTo({ url: "/pages/team/commissions", fail: () => {} });
}
</script>

<style scoped>
.team-ledger { padding: 8px 20px 16px; }
.team-ledger__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.team-ledger__title { font-size: 15px; font-weight: 600; }
.team-ledger__details { display: flex; align-items: center; justify-content: flex-end; gap: 5px; min-height: 44px; color: var(--v5-ink-3); font-size: 12px; flex-shrink: 0; }
.team-ledger__details:active { opacity: .7; }
.team-ledger__details:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.team-ledger__amount { display: block; font-family: var(--font-v5); font-size: 34px; line-height: 1.1; font-weight: 600; letter-spacing: -.03em; overflow-wrap: anywhere; }
.team-ledger__nex { display: block; font-size: 14px; line-height: 18px; font-weight: 500; color: var(--v5-tech-cyan-ink); overflow-wrap: anywhere; }
.team-ledger__lifetime { display: block; margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--v5-ink-3); }
.team-ledger__bar { display: flex; height: 6px; margin-top: 8px; border-radius: 999px; overflow: hidden; background: var(--v5-surface-2); }
.team-ledger__bar > view { height: 100%; }
.team-ledger__split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 12px; }
.team-ledger__split > view { min-width: 0; }
.team-ledger__label { display: flex; align-items: center; gap: 7px; font-size: 12px; line-height: 1.4; color: var(--v5-ink-3); }
.team-ledger__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--v5-brand); }
.team-ledger__dot--extended { background: var(--v5-brand-2); }
.team-ledger__value { display: block; margin: 2px 0 0 15px; font-size: 18px; font-weight: 600; line-height: 1.1; overflow-wrap: anywhere; }
.team-ledger__settlement { margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--v5-border); display: flex; flex-direction: column; }
.team-ledger__settlement > view { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; font-size: 13.5px; line-height: 1.5; color: var(--v5-ink-3); }
.team-ledger__settlement .tabular-nums { color: var(--v5-ink); text-align: right; overflow-wrap: anywhere; min-width: 0; }
</style>
