<template>
  <view class="team-ledger nx-viz-press" :aria-busy="loading && !failed">
    <view class="team-ledger__header">
      <text class="team-ledger__title">{{ copy.monthIncome }}</text>
      <DataVisibilityToggle />
      <view class="nx-team-commissions-link team-ledger__details" role="link" tabindex="0" @click="goCommissions" @keydown.enter.prevent="goCommissions">
        <text>{{ copy.details }}</text><text aria-hidden="true">›</text>
      </view>
    </view>
    <view class="team-ledger__amount tabular-nums"><text v-if="!visibility.hidden && monthUSDTParts" class="team-ledger__currency">{{ monthUSDTParts.prefix }}</text><text>{{ visibility.mask(intPart) }}</text><text v-if="!visibility.hidden && monthUSDTParts" class="team-ledger__fraction">.{{ fracPart }}</text></view>
    <text class="team-ledger__nex tabular-nums">{{ visibility.mask(hasAmounts ? '+' + formatAmount(monthNEX) : '—') }} UVT</text>
    <view class="team-ledger__settlement" :aria-label="copy.settlementScope">
      <view><view class="team-ledger__settlement-label"><view class="team-ledger__dot" aria-hidden="true" /><text>{{ t.teamV3.settled }}</text></view><text class="tabular-nums">{{ visibility.mask(hasAmounts ? formatUsd(unlockedUSDT) : '—') }}</text></view>
      <view><view class="team-ledger__settlement-label"><view class="team-ledger__dot team-ledger__dot--cooling" aria-hidden="true" /><text>{{ t.teamV3.coolingDown }}</text></view><text class="tabular-nums">{{ visibility.mask(hasAmounts ? formatUsd(coolingUSDT) : '—') }}</text></view>
    </view>
    <view class="team-ledger__control">
      <!-- Lifetime composition stays open; data-state says whether its figures are current. -->
      <view class="team-ledger__breakdown" :class="{ 'is-hidden': (loading && !hasAmounts) || failed, 'is-unknown': !hasAmounts }" :data-state="failed ? 'failed' : loading ? 'loading' : hasAmounts ? 'ready' : 'unknown'" :aria-hidden="(loading && !hasAmounts) || failed">
        <view class="team-ledger__lifetime"><text>{{ copy.lifetimeBreakdown }} · {{ visibility.mask(hasAmounts ? contributors : '—') }} {{ t.teamV3.contributors }}</text><text class="team-ledger__lifetime-total">{{ visibility.mask(hasAmounts ? formatUsd(totalUSDTLifetime) : '—') }}</text></view>
        <view ref="barEl" class="team-ledger__bar" aria-hidden="true">
          <template v-if="!visibility.hidden && hasAmounts">
          <view :style="{ width: barInView === false ? '0%' : directPct + '%', transition: barInView === false ? 'none' : PROGRESS_GROW_TRANSITION, background: 'var(--v5-brand)' }" />
          <view :style="{ width: barInView === false ? '0%' : extendedPct + '%', transition: barInView === false ? 'none' : PROGRESS_GROW_TRANSITION, transitionDelay: barInView === false ? '0ms' : vizStagger(1), background: 'var(--ui-device-ink)' }" />
          </template>
        </view>
        <view class="team-ledger__split">
          <view class="team-ledger__label"><view class="team-ledger__dot" aria-hidden="true" /><text>{{ copy.friendRewards }}</text><text class="team-ledger__value">{{ visibility.mask(hasAmounts ? formatUsd(directUSDT) : '—') }}</text></view>
          <view class="team-ledger__label"><view class="team-ledger__dot team-ledger__dot--extended" aria-hidden="true" /><text>{{ copy.teamRewards }}</text><text class="team-ledger__value">{{ visibility.mask(hasAmounts ? formatUsd(extendedUSDT) : '—') }}</text></view>
        </view>
      </view>
      <!-- Feedback shares the composition cell, so a failure replaces it without a second row. -->
      <view class="team-ledger__feedback" role="status" aria-live="polite" aria-atomic="true">
        <view class="team-ledger__feedback-item" :class="{ 'is-active': failed }" :aria-hidden="!failed">
          <text>{{ t.network.projectionErrorDesc }}</text>
          <view class="team-ledger__retry" role="button" :tabindex="failed ? 0 : -1" :aria-disabled="!failed" @click="retry" @keydown.enter.prevent="retry" @keydown.space.prevent="retry">{{ t.network.retry }}</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { formatAmount } from "@/lib/amount-display";
import { formatUsd, formatUsdOverviewParts } from '@/lib/usd-display';
import { navTo } from "@/lib/route";
import { computed } from "vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from '@/store/locale';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { useDataVisibility } from '@/store/data-visibility';
import DataVisibilityToggle from '@/components/ui/data-visibility-toggle.vue';
import { useScrollGrowProgress, PROGRESS_GROW_TRANSITION, vizStagger } from '@/composables/use-scroll-grow-progress';

const props = withDefaults(defineProps<{
  available?: boolean;
  loading?: boolean;
  failed?: boolean;
  totalUSDTLifetime: number;
  contributors: number;
  directUSDT: number;
  extendedUSDT: number;
  monthUSDT: number;
  monthNEX: number;
  unlockedUSDT: number;
  coolingUSDT: number;
}>(), { available: true, loading: false, failed: false });
const emit = defineEmits<{ (event: 'retry'): void }>();

const t = useT();
const visibility = useDataVisibility();
const locale = useLocaleStore();
const copy = computed(() => teamRedesignCopy(locale.code));
const { elRef: barEl, inView: barInView } = useScrollGrowProgress();
const hasAmounts = computed(() => props.available);

function retry() {
  if (props.failed) emit('retry');
}

const monthUSDTParts = computed(() => hasAmounts.value ? formatUsdOverviewParts(props.monthUSDT) : null);
const intPart = computed(() => monthUSDTParts.value?.integer ?? '—');
const fracPart = computed(() => monthUSDTParts.value?.fraction ?? '');
const splitTotal = computed(() => hasAmounts.value ? Math.max(0, props.directUSDT + props.extendedUSDT) : 0);
const directPct = computed(() => splitTotal.value === 0 ? 0 : Math.round((props.directUSDT / splitTotal.value) * 100));
const extendedPct = computed(() => splitTotal.value === 0 ? 0 : 100 - directPct.value);

function goCommissions() {
  navTo("/pages/team/commissions");
}

</script>

<style scoped>
.team-ledger { display: flex; flex-direction: column; gap: var(--ui-space-inline); padding: var(--v5-space-5); border-radius: 28px; background: radial-gradient(120% 90% at 85% 0%, color-mix(in srgb, var(--v5-brand) 9%, transparent), transparent 60%), var(--v5-surface); box-shadow: inset 0 0 0 1px var(--v5-border); }
.team-ledger__header { display: flex; align-items: center; gap: var(--v5-space-1); min-height: 32px; }
.team-ledger__title { font: 500 13px/18px var(--font-v5); color: var(--v5-ink-2); }
.team-ledger__details { display: flex; align-items: center; gap: var(--v5-space-1); min-height: 32px; margin-left: auto; padding: 0 var(--ui-space-inline); border-radius: 999px; background: var(--v5-surface-3); color: var(--v5-ink-2); font: 600 12px/16px var(--font-v5); white-space: nowrap; }
.team-ledger__details:active { opacity: .7; }
.team-ledger__details:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.team-ledger__amount { display: flex; align-items: baseline; gap: 2px; flex-wrap: nowrap; min-height: 1.1em; font-family: var(--font-amount); font-size: 48px; line-height: 1.1; font-weight: 600; letter-spacing: -.03em; white-space: nowrap; overflow-x: auto; }
.team-ledger__amount > text { flex: none; }
.team-ledger__currency { font-size: 20px; color: var(--v5-ink-3); }
.team-ledger__fraction { color: var(--v5-ink-4); }
.team-ledger__nex { display: block; margin-top: calc(var(--v5-space-2) * -1); font: 500 15px/20px var(--font-metric); color: var(--v5-brand); white-space: nowrap; overflow-x: auto; }
.team-ledger__settlement { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-inline); }
.team-ledger__settlement > view { display: flex; flex-direction: column; gap: var(--v5-space-1); min-width: 0; padding: var(--ui-space-inline); border-radius: 16px; background: color-mix(in srgb, var(--v5-ink) 4%, transparent); }
.team-ledger__settlement-label { display: flex; align-items: center; gap: 6px; font: 400 12px/16px var(--font-v5); color: var(--v5-ink-3); }
.team-ledger__settlement .tabular-nums { display: block; max-width: 100%; color: var(--v5-ink); font: 600 18px/24px var(--font-metric); font-variant-numeric: tabular-nums; white-space: nowrap; overflow-x: auto; min-width: 0; }
.team-ledger__dot { display: inline-block; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--v5-brand); }
.team-ledger__dot--cooling { background: var(--v5-warning); }
.team-ledger__dot--extended { background: var(--ui-device-ink); }
.team-ledger__control { display: grid; }
.team-ledger__breakdown,.team-ledger__feedback { grid-area: 1 / 1; }
.team-ledger__breakdown { display: flex; flex-direction: column; gap: var(--v5-space-2); min-width: 0; }
.team-ledger__breakdown.is-unknown { opacity: .6; }
.team-ledger__breakdown.is-hidden { visibility: hidden; pointer-events: none; }
.team-ledger__lifetime { display: flex; justify-content: space-between; gap: var(--ui-space-inline); font: 400 12px/16px var(--font-v5); color: var(--v5-ink-3); }
.team-ledger__lifetime-total { flex: none; font-family: var(--font-metric); color: var(--v5-ink-2); }
.team-ledger__bar { display: flex; gap: 3px; height: 8px; overflow: hidden; border-radius: 999px; background: var(--v5-surface-3); }
.team-ledger__bar > view { height: 100%; border-radius: 999px; }
.team-ledger__split { display: flex; flex-wrap: wrap; gap: var(--v5-space-1) var(--v5-space-4); }
.team-ledger__label { display: flex; align-items: center; gap: 6px; min-width: 0; font: 400 12px/16px var(--font-v5); color: var(--v5-ink-3); }
.team-ledger__value { font: 600 12px/16px var(--font-metric); color: var(--v5-ink); }
.team-ledger__feedback { display: grid; pointer-events: none; }
.team-ledger__feedback-item { grid-area: 1 / 1; min-width: 0; min-height: 44px; display: flex; align-items: center; gap: 12px; visibility: hidden; pointer-events: none; color: var(--v5-ink-3); font: 400 12px/1.5 var(--font-v5); }
.team-ledger__feedback-item > text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.team-ledger__feedback-item.is-active { visibility: visible; pointer-events: auto; }
.team-ledger__retry { flex: none; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; color: var(--v5-brand); font: 600 13px/20px var(--font-v5); white-space: nowrap; cursor: pointer; }
.team-ledger__retry:active { opacity: .7; }
.team-ledger__retry:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.team-ledger__amount,.team-ledger__nex,.team-ledger__settlement .tabular-nums { overflow-y: hidden; scrollbar-width: none; }
.team-ledger__amount::-webkit-scrollbar,.team-ledger__nex::-webkit-scrollbar,.team-ledger__settlement .tabular-nums::-webkit-scrollbar { display: none; }
</style>
