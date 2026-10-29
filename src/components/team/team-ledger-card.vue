<template>
  <view class="team-ledger" :aria-busy="loading && !failed">
    <view class="team-ledger__header">
      <text class="team-ledger__title">{{ copy.monthIncome }}</text>
      <DataVisibilityToggle />
    </view>
    <view class="team-ledger__amount tabular-nums"><text v-if="!visibility.hidden && monthUSDTParts" class="team-ledger__currency">{{ monthUSDTParts.prefix }}</text><text>{{ visibility.mask(intPart) }}</text><text v-if="!visibility.hidden && monthUSDTParts" class="team-ledger__fraction">.{{ fracPart }}</text></view>
    <view class="team-ledger__secondary">
    <text class="team-ledger__nex tabular-nums">{{ visibility.mask(hasAmounts ? '+ ' + formatAmount(monthNEX) : '—') }} UVT</text>
    <view class="nx-team-commissions-link team-ledger__details" role="link" tabindex="0" @click="goCommissions" @keydown.enter.prevent="goCommissions" @keydown.space.prevent="goCommissions">
      <text>{{ t.teamV3.viewDetails }}</text>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
    </view>
    </view>
    <text class="team-ledger__scope">{{ copy.settlementScope }}</text>
    <view class="team-ledger__settlement">
      <view><view class="team-ledger__settlement-icon" aria-hidden="true"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M19 7V4H6a3 3 0 0 0 0 6h15v11H6a3 3 0 0 1-3-3V7M21 12h-5v5h5"/><path d="M17 14.5h1"/></svg></view><view class="team-ledger__settlement-copy"><text>{{ t.teamV3.settled }}</text><text class="tabular-nums">{{ visibility.mask(hasAmounts ? formatUsd(unlockedUSDT) : '—') }}</text></view></view>
      <view><view class="team-ledger__settlement-icon" aria-hidden="true"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg></view><view class="team-ledger__settlement-copy"><text>{{ t.teamV3.coolingDown }}</text><text class="tabular-nums">{{ visibility.mask(hasAmounts ? formatUsd(coolingUSDT) : '—') }}</text></view></view>
    </view>
    <view class="team-ledger__control">
      <view class="team-ledger__breakdown" :class="{ 'is-hidden': (loading && !hasAmounts) || failed, 'is-unknown': !hasAmounts }" role="button" :tabindex="hasAmounts && !loading && !failed ? 0 : -1" :aria-disabled="!hasAmounts || loading || failed" :aria-hidden="(loading && !hasAmounts) || failed" :aria-expanded="breakdownOpen" @click="toggleBreakdown" @keydown.enter.prevent="toggleBreakdown" @keydown.space.prevent="toggleBreakdown"><text>{{ copy.lifetimeBreakdown }}</text><text aria-hidden="true">{{ breakdownOpen ? '−' : '+' }}</text></view>
      <!-- Feedback shares the existing control row; the ready state does not
           reserve a second empty row. Localized errors can grow naturally. -->
      <view class="team-ledger__feedback" role="status" aria-live="polite" aria-atomic="true">
        <view class="team-ledger__feedback-item" :class="{ 'is-active': failed }" :aria-hidden="!failed">
          <text>{{ t.network.projectionErrorDesc }}</text>
          <view class="team-ledger__retry" role="button" :tabindex="failed ? 0 : -1" :aria-disabled="!failed" @click="retry" @keydown.enter.prevent="retry" @keydown.space.prevent="retry">{{ t.network.retry }}</view>
        </view>
      </view>
    </view>
    <view v-if="breakdownOpen">
    <text class="team-ledger__lifetime">{{ t.teamV3.lifetime }} {{ visibility.mask(hasAmounts ? formatUsd(totalUSDTLifetime) : '—') }} · {{ visibility.mask(hasAmounts ? contributors : '—') }} {{ t.teamV3.contributors }}</text>
    <view class="team-ledger__bar" aria-hidden="true">
      <template v-if="!visibility.hidden">
      <view :style="{ width: directPct + '%', background: 'var(--v5-brand)' }" />
      <view :style="{ width: extendedPct + '%', background: 'var(--v5-ink-3)' }" />
      </template>
    </view>
    <view class="team-ledger__split">
      <view>
        <view class="team-ledger__label"><view class="team-ledger__dot" /><text>{{ t.teamV3.directLabel }} · {{ visibility.mask(hasAmounts ? directPct + '%' : '—') }}</text></view>
        <text class="team-ledger__value tabular-nums">{{ visibility.mask(hasAmounts ? formatUsd(directUSDT) : '—') }}</text>
      </view>
      <view>
        <view class="team-ledger__label"><view class="team-ledger__dot team-ledger__dot--extended" /><text>{{ t.teamV3.extendedLabel }} · {{ visibility.mask(hasAmounts ? extendedPct + '%' : '—') }}</text></view>
        <text class="team-ledger__value tabular-nums">{{ visibility.mask(hasAmounts ? formatUsd(extendedUSDT) : '—') }}</text>
      </view>
    </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { formatAmount } from "@/lib/amount-display";
import { formatUsd, formatUsdOverviewParts } from '@/lib/usd-display';
import { navTo } from "@/lib/route";
import { computed, ref } from "vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from '@/store/locale';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { useDataVisibility } from '@/store/data-visibility';
import DataVisibilityToggle from '@/components/ui/data-visibility-toggle.vue';

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
const breakdownOpen = ref(false);
const hasAmounts = computed(() => props.available);

function toggleBreakdown() {
  if (hasAmounts.value && !props.loading && !props.failed) breakdownOpen.value = !breakdownOpen.value;
}
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
.team-ledger { background: transparent; box-shadow: none; border-radius: 0; padding: 0; }
.team-ledger__header { display: flex; align-items: center; gap: 4px; }
.team-ledger__title { font-size: var(--ui-type-card-title); font-weight: var(--ui-type-card-title-weight); }
.team-ledger__secondary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
.team-ledger__details { display: flex; align-items: center; justify-content: flex-end; width: fit-content; max-width: 48%; margin-left: auto; gap: 5px; min-width: 44px; min-height: 44px; color: var(--v5-ink-3); font-size: 12px; flex-shrink: 0; }
.team-ledger__details > text { min-width: 0; text-align: right; overflow-wrap: anywhere; }
.team-ledger__details > svg { flex: none; }
.team-ledger__details:active { opacity: .7; }
.team-ledger__details:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.team-ledger__amount { display: flex; align-items: baseline; gap: 3px; flex-wrap: nowrap; min-height: 1.25em; font-family: var(--font-v5); font-size: 52px; line-height: 1.25; font-weight: 600; letter-spacing: -.03em; white-space: nowrap; overflow-x: auto; }
.team-ledger__amount > text { flex: none; }
.team-ledger__currency { font-size: 24px; color: var(--v5-ink-3); }
.team-ledger__fraction { font-size: 36px; color: var(--v5-ink-2); }
.team-ledger__nex { display: block; flex: 1; min-width: 0; font: 600 18px/1.4 var(--font-v5); color: var(--v5-brand); white-space: nowrap; overflow-x: auto; }
.team-ledger__breakdown { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-inline); min-height: 44px; font: 400 12px/1.5 var(--font-v5); color: var(--v5-ink-3); }
.team-ledger__breakdown:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.team-ledger__breakdown.is-unknown { opacity: .6; }
.team-ledger__control { display: grid; }
.team-ledger__breakdown,.team-ledger__feedback { grid-area: 1 / 1; }
.team-ledger__breakdown.is-hidden { visibility: hidden; pointer-events: none; }
.team-ledger__feedback { display: grid; pointer-events: none; }
.team-ledger__feedback-item { grid-area: 1 / 1; min-width: 0; min-height: 44px; display: flex; align-items: center; gap: 12px; visibility: hidden; pointer-events: none; color: var(--v5-ink-3); font: 400 12px/1.5 var(--font-v5); }
.team-ledger__feedback-item > text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.team-ledger__feedback-item.is-active { visibility: visible; pointer-events: auto; }
.team-ledger__retry { flex: none; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; color: var(--v5-brand); font: 600 13px/20px var(--font-v5); white-space: nowrap; cursor: pointer; }
.team-ledger__retry:active { opacity: .7; }
.team-ledger__retry:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.team-ledger__lifetime { display: block; margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--v5-ink-3); }
.team-ledger__bar { display: flex; height: 6px; margin-top: 8px; border-radius: 999px; overflow: hidden; background: var(--v5-surface-2); }
.team-ledger__bar > view { height: 100%; }
.team-ledger__split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-inset); margin-top: var(--ui-space-inline); }
.team-ledger__split > view { min-width: 0; }
.team-ledger__label { display: flex; align-items: center; gap: 7px; font-size: 12px; line-height: 1.4; color: var(--v5-ink-3); }
.team-ledger__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--v5-brand); }
.team-ledger__dot--extended { background: var(--v5-ink-3); }
.team-ledger__value { display: block; margin: 2px 0 0 15px; font-size: 20px; font-weight: 600; line-height: 1.1; overflow-wrap: anywhere; }
.team-ledger__scope { display:block;margin-top:8px;font:400 12px/1.5 var(--font-v5);color:var(--v5-ink-3); }
.team-ledger__settlement { margin-top: 8px; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); border: 1px solid var(--v5-border); border-radius: 18px; background: var(--v5-surface); padding: var(--ui-space-inline) 0; }
.team-ledger__settlement > view { display: flex; align-items: center; gap: 8px; padding: 0 var(--ui-space-inline); min-width: 0; font: 400 12px/1.4 var(--font-v5); color: var(--v5-ink-3); }
.team-ledger__settlement-icon { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; color: var(--v5-brand); background: var(--v5-brand-soft); }
.team-ledger__settlement-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; overflow-wrap: anywhere; }
.team-ledger__settlement > view + view { border-left: 1px solid var(--v5-border); }
.team-ledger__settlement .tabular-nums { display: block; max-width: 100%; color: var(--v5-ink); font: 600 20px/1.25 var(--font-v5); font-variant-numeric: tabular-nums; white-space: nowrap; overflow-x: auto; min-width: 0; }
.team-ledger__amount,.team-ledger__nex,.team-ledger__settlement .tabular-nums { overflow-y: hidden; scrollbar-width: none; }
.team-ledger__amount::-webkit-scrollbar,.team-ledger__nex::-webkit-scrollbar,.team-ledger__settlement .tabular-nums::-webkit-scrollbar { display: none; }
</style>
