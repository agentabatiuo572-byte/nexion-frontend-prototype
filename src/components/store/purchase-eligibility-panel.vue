<template>
  <view class="purchase-panel" :class="{ 'purchase-panel--blocking': blockingOnly }" aria-live="polite" :aria-busy="status === 'loading'">
    <text v-if="!blockingOnly" class="purchase-panel__title">{{ t.store.purchaseEligibilityProductPolicy }}</text>
    <text v-if="!blockingOnly || message !== 'ineligible'" class="purchase-panel__note" :role="message === 'error' ? 'alert' : 'status'">{{ statusText }}</text>
    <template v-if="status === 'ready' && snapshot && message !== 'error'">
      <text v-if="(!blockingOnly && snapshot.policies.length > 1) || blockingOnly && visiblePolicies.length > 1" class="purchase-panel__note">{{ t.tradein.purchasePoliciesAll }}</text>
      <view v-for="(policy, index) in visiblePolicies" :key="`${policy.policy}-${index}`" class="purchase-panel__policy">
        <view v-if="!blockingOnly" class="purchase-panel__row"><text class="purchase-panel__title">{{ policy.policy === 'E1' ? t.tradein.purchaseProductPolicy : t.tradein.purchaseHardwarePolicy }}</text><text>{{ policy.eligible ? t.tradein.purchaseMet : policy.conditions.length ? t.tradein.purchaseUnmet : t.store.purchaseEligibilityError }}</text></view>
        <text v-if="policy.conditions.filter(condition => !isQuota(condition)).length > (blockingOnly ? 1 : 0)" class="purchase-panel__note">{{ policy.mode === 'EITHER' ? t.quota.unlockEither : t.quota.unlockAll }}</text>
        <view v-for="condition in policy.conditions.filter(condition => !isQuota(condition))" :key="condition.kind" class="purchase-panel__condition">
          <view class="purchase-panel__row"><text>{{ conditionLabel(condition) }}</text><text class="purchase-panel__values">{{ conditionValues(condition) }}</text></view>
          <QuotaConditionBar v-if="!visibility.hidden" :pct="conditionRatio(condition)" :met="condition.met" tint="var(--v5-brand)" :label="conditionLabel(condition)" :value-text="conditionValues(condition)" />
          <text class="purchase-panel__note">{{ condition.met ? t.tradein.purchaseMet : fmt(t.tradein.purchaseGap, { amount: condition.kind === 'rank' ? visibility.mask(fmt(t.tradein.purchaseRanks, { n: condition.gap })) : conditionAmount(condition, condition.gap, true) }) }}</text>
        </view>
        <!-- Quota is an independent remaining-capacity check, never part of EITHER unlock conditions. -->
        <text v-if="!blockingOnly && policy.conditions.some(isQuota)" class="purchase-panel__note">{{ t.tradein.purchaseQuotaRequired }}</text>
        <view v-for="condition in policy.conditions.filter(isQuota)" :key="condition.kind" class="purchase-panel__condition">
          <view class="purchase-panel__row"><text>{{ conditionLabel(condition) }}</text><text class="purchase-panel__values">{{ conditionValues(condition) }}</text></view>
          <QuotaConditionBar v-if="!visibility.hidden" :pct="conditionRatio(condition)" :met="condition.met" tint="var(--v5-brand)" :label="conditionLabel(condition)" :value-text="conditionValues(condition)" />
          <text class="purchase-panel__note">{{ fmt(t.tradein.purchaseRemaining, { amount: conditionAmount(condition, condition.gap, true) }) }}</text>
        </view>
      </view>
    </template>
  </view>
</template>
<script setup lang="ts">
import { computed } from "vue";
import type { PurchaseEligibilityCondition, PurchaseEligibilitySnapshot } from "@/api/purchase-eligibility-api";
import { resolvePurchaseEligibilityMessage, type PurchaseEligibilityRequestStatus } from "@/lib/purchase-eligibility-copy";
import { formatComputePoints } from "@/i18n/compute-points";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useLocaleStore } from "@/store/locale";
import { useDataVisibility } from "@/store/data-visibility";
import QuotaConditionBar from "@/components/team/quota-condition-bar.vue";
const props = defineProps<{ status: PurchaseEligibilityRequestStatus; snapshot: PurchaseEligibilitySnapshot | null; blockingOnly?: boolean }>();
const t = useT();
const locale = useLocaleStore();
const visibility = useDataVisibility();
const message = computed(() => resolvePurchaseEligibilityMessage(props.status, props.snapshot));
const visiblePolicies = computed(() => !props.blockingOnly ? props.snapshot?.policies ?? []
  : (props.snapshot?.policies ?? []).filter(policy => !policy.eligible).map(policy => {
    const eitherMet = policy.mode === "EITHER" && policy.conditions.some(condition => !isQuota(condition) && condition.met);
    return { ...policy, conditions: policy.conditions.filter(condition => !condition.met && (isQuota(condition) || !eitherMet)) };
  }).filter(policy => policy.conditions.length > 0));
const statusText = computed(() => props.status === "idle" || props.status === "loading" ? t.value.store.purchaseEligibilityLoading
  : message.value === "eligible" ? t.value.tradein.purchaseEligible
  : message.value === "ineligible" ? t.value.store.purchaseEligibilityIneligible
  : message.value === "quotaDepleted" ? t.value.tradein.purchaseQuotaDepleted : t.value.store.purchaseEligibilityError);
function isQuota(condition: PurchaseEligibilityCondition): boolean {
  return condition.kind === "lifetimeQuota" || condition.kind === "monthlyQuota";
}
function conditionLabel(condition: PurchaseEligibilityCondition): string {
  return t.value.tradein.purchaseConditions[condition.kind];
}
function conditionAmount(condition: PurchaseEligibilityCondition, value: number, hidden = false): string {
  const count = condition.kind === "teamComputePoints" ? formatComputePoints(value, locale.code)
    : condition.kind === "rank" ? `V${value}`
    : fmt(condition.kind === "activeDirect" ? t.value.tradein.purchasePeople : t.value.tradein.purchaseUnits, { n: value });
  return hidden ? visibility.mask(count) : count;
}
function conditionValues(condition: PurchaseEligibilityCondition): string {
  return `${conditionAmount(condition, condition.current, true)} / ${conditionAmount(condition, condition.required)}`;
}
function conditionRatio(condition: PurchaseEligibilityCondition): number {
  return condition.required > 0 ? Math.max(0, Math.min(1, condition.current / condition.required)) : 0;
}
</script>
<style scoped>
.purchase-panel { margin:12px 0; padding:12px; border-radius:12px; background:var(--v5-surface-2); color:var(--v5-ink-2); font:400 12px/1.6 var(--font-v5); overflow-wrap:anywhere; }
.purchase-panel__title { font-weight:600; color:var(--v5-ink); }
.purchase-panel__note { display:block; margin-top:6px; color:var(--v5-ink-3); }
.purchase-panel__policy { margin-top:16px; }
.purchase-panel__row { display:flex; justify-content:space-between; align-items:baseline; gap:8px 16px; flex-wrap:wrap; }
.purchase-panel__condition { margin-top:12px; }
.purchase-panel__values { margin-left:auto; color:var(--v5-ink); font-variant-numeric:tabular-nums; text-align:right; }
.purchase-panel--blocking .purchase-panel__policy:first-child,
.purchase-panel--blocking .purchase-panel__condition:first-child { margin-top:0; }
</style>
