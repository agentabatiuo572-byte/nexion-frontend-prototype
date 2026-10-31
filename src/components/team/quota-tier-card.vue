<template>
  <view class="quota-tier nx-viz-press nx-viz-motion" :aria-busy="pending">
    <view class="quota-tier__top">
      <text class="quota-product__qualification" :class="{ 'quota-product__qualification--met': !visibility.hidden && !pending && unlocked }"><svg v-if="!visibility.hidden && !pending && unlocked" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>{{ visibility.mask(pending ? '—' : unlocked ? t.quota.unlocked : t.quota.locked) }}</text>
      <view ref="stockBarRef" class="quota-stock" :aria-label="`${fmt(t.quota.leftLabel, { n: pending ? '—' : stockLeft })} · ${fmt(t.quota.soldPct, { pct: pending ? '—' : Math.round(stockPct * 100) })}`">
        <view class="quota-stock__ring" :style="stockRingStyle"><view class="quota-stock__hole nx-num-metric"><text>{{ pending ? '—' : stockLeft }}</text></view></view>
      </view>
    </view>
    <view class="quota-product" role="link" tabindex="0" :aria-label="displayName" @click="openProduct" @keydown.enter.prevent="openProduct" @keydown.space.prevent="openProduct">
      <image v-if="productImage" :src="productImage" mode="aspectFit" class="quota-product__image" :alt="displayName" />
      <view class="quota-product__copy"><text class="quota-product__name">{{ displayName }}</text><view class="quota-product__price nx-num-amount"><text class="quota-price-symbol">$</text><text>{{ priceParts[0] }}</text><text v-if="priceParts[1]" class="quota-price-fraction">.{{ priceParts[1] }}</text></view></view>
      <svg class="quota-product__arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
    </view>
    <view class="quota-actions" :class="{ 'quota-pending-action': actionBlocked }">
      <NxButton v-if="pending" class="quota-pending-action" variant="secondary" :label="fmt(t.quota.buyCta, { name: displayName })" :disabled="true"><text>{{ fmt(t.quota.buyCta, { name: displayName }) }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></NxButton>
      <NxButton v-else-if="unlocked && stockLeft > 0 && tier.available !== false" class="quota-buy" variant="primary" :label="fmt(t.quota.buyCta, { name: displayName })" :disabled="actionBlocked" @click="openAction"><text>{{ t.quota.buy }}</text></NxButton>
      <text v-else-if="stockLeft <= 0" class="quota-unavailable" aria-disabled="true">{{ t.quota.stockUnavailable }}</text>
      <text v-else-if="unlocked && tier.available === false" class="quota-unavailable" aria-disabled="true">{{ auditCopy.quotaUnavailable }}</text>
      <NxButton v-else variant="secondary" :label="t.store.purchaseEligibilityIneligible" :disabled="actionBlocked" @click="openAction"><text>{{ t.store.purchaseEligibilityIneligible }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></NxButton>
    </view>
    <view v-if="tier.conditions.length" class="quota-conditions">
      <text class="quota-section-label">{{ tier.unlockKind === 'either' ? t.quota.unlockEither : t.quota.unlockAll }}</text>
      <view v-for="(condition, index) in tier.conditions" :key="index" class="quota-condition">
        <view class="quota-stat-line"><text>{{ conditionLabel(condition) }}</text><text class="quota-condition__values nx-num-metric" :aria-label="conditionValue(condition)">{{ conditionValue(condition, true) }}</text></view>
        <QuotaConditionBar v-if="!visibility.hidden" :pct="pending ? 0 : condition.required > 0 ? Math.min(1, Math.max(0, condition.current / condition.required)) : 1" :met="!pending && condition.current >= condition.required" :tint="tier.tint" :label="conditionLabel(condition)" :value-text="conditionValue(condition)" />
      </view>
    </view>
    <view v-if="tier.perks.length" class="quota-perks"><text v-for="(perk, index) in tier.perks" :key="index">{{ perk }}</text></view>
  </view>
</template>
<script setup lang="ts">
import { useDataVisibility } from "@/store/data-visibility";
import { computed } from 'vue';
import { formatFinanceAmount } from '@/lib/finance-amount-display';
import { formatComputePoints } from '@/i18n/compute-points';
import { useLocaleStore } from '@/store/locale';
import { networkReauditCopy } from '@/i18n/network-reaudit';
import QuotaConditionBar from './quota-condition-bar.vue';
import NxButton from '@/components/ui/nx-button.vue';
import { useT } from '@/i18n/use-t';
import { fmt } from '@/i18n/format';
import { getProductMedia } from '@/lib/product-media';
import { useScrollGrowProgress, VIZ_RING_TRANSITION } from '@/composables/use-scroll-grow-progress';
export interface QuotaCondition {
  label: string;
  current: number;
  required: number;
  kind: "invites" | "volume";
}
export interface QuotaTier {
  available?: boolean;
  productId: string;
  imageUrl?: string;
  name: string;
  price: number;
  monthlyStock: number;
  soldThisMonth: number;
  unlockKind: "either" | "all";
  conditions: QuotaCondition[];
  perks: string[];
  tint: string;
  /**
   * 年化 ROI 的**推导输入**。zentao #221:此前只写「约 N% 年化(按美元日收益/售价)」,
   * 而参与计算的两个数(美元日收益、售价)页面上一分都没露 —— 用户复核不了比例来源。
   * 目录读到时由页面填上;缺失(旧服务端/目录未落地)则整行不渲染,而不是显示占位 0。
   */
  roiBasis?: { dailyEarn: number; price: number; roi: number; revision?: string | null };
}


const props = defineProps<{ tier: QuotaTier; pending?: boolean; actionBlocked?: boolean }>();
const emit = defineEmits<{ navigate: [url: string] }>();
const t = useT();
const visibility = useDataVisibility();
const locale = useLocaleStore();
const auditCopy = computed(() => networkReauditCopy(locale.code));
const displayName = computed(() => (props.tier.name));
const productImage = computed(() => getProductMedia(props.tier.productId)?.src ?? props.tier.imageUrl);
const { elRef: stockBarRef, inView: stockBarInView } = useScrollGrowProgress();
const unlocked = computed(() => {
  const met = props.tier.conditions.map(condition => condition.current >= condition.required);
  return met.length === 0 || (props.tier.unlockKind === 'either' ? met.some(Boolean) : met.every(Boolean));
});
const stockPct = computed(() => props.tier.monthlyStock > 0 ? Math.min(1, props.tier.soldThisMonth / props.tier.monthlyStock) : 1);
const stockLeft = computed(() => Math.max(0, props.tier.monthlyStock - props.tier.soldThisMonth));
const priceParts = computed(() => formatFinanceAmount(props.tier.price).split('.'));
const stockRingStyle = computed(() => ({ '--nx-viz-ring': props.pending || stockBarInView.value === false ? 0 : stockPct.value * 100, transition: props.pending || stockBarInView.value === false ? 'none' : VIZ_RING_TRANSITION }));
function conditionLabel(condition: QuotaCondition) {
  return condition.label;
}
// Compact values drop the points unit on screen; the accessible label keeps it.
function conditionValue(condition: QuotaCondition, compact = false) {
  if (props.pending) return `${visibility.mask("—")} / —`;
  return condition.kind === 'volume'
    ? compact
      ? `${visibility.mask(formatComputePoints(condition.current, locale.code).split(' ')[0])} / ${formatComputePoints(condition.required, locale.code).split(' ')[0]}`
      : `${visibility.mask(formatComputePoints(condition.current, locale.code))} / ${formatComputePoints(condition.required, locale.code)}`
    : `${visibility.mask(condition.current)} / ${condition.required}`;
}
function openProduct() { emit('navigate', `/pages/store/detail?id=${encodeURIComponent(props.tier.productId)}`); }
function openAction() { if (!props.pending && !props.actionBlocked) openProduct(); }
</script>
<style scoped>
.quota-pending-action :deep(.nx-button--disabled), .quota-pending-action { opacity: 1; }
.quota-tier { padding:var(--ui-space-section) 18px 22px;margin-bottom:18px;border:1px solid var(--v5-border);border-radius:24px;background:var(--v5-surface);color:var(--v5-ink); }
.quota-product { display:flex;align-items:center;gap:14px;min-height:80px;cursor:pointer; }
.quota-product__image { width:76px;height:80px;flex:none; }.quota-product__copy { min-width:0;flex:1; }
.quota-product__name { display:block;font:600 17px/1.4 var(--font-v5);overflow-wrap:anywhere; }.quota-product__price { display:block;margin-top:var(--v5-space-1);font:500 14px/1.5 var(--font-v5);color:var(--v5-ink-2); }
.quota-product__qualification { display:block;margin-top:6px;font:500 11px/1.5 var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }.quota-product__qualification--met { color:var(--v5-brand); }.quota-product__arrow { flex:none;color:var(--v5-ink-3); }
.quota-stock { margin-top:18px; }.quota-stat-line { display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px 14px;font:400 12px/1.6 var(--font-v5);color:var(--v5-ink-2);overflow-wrap:anywhere; }
.quota-stock__track { height:3px;background:var(--v5-surface-3);border-radius:9px;overflow:hidden;margin-top:var(--v5-space-2); }.quota-stock__track > view { height:100%;background:var(--v5-ink-3);border-radius:inherit; }
.quota-conditions { margin-top:22px; }.quota-section-label { display:block;font:600 13px/1.5 var(--font-v5); }.quota-condition { margin-top:var(--ui-space-inset); }.quota-condition__values { margin-left:auto;font:500 13px/18px var(--font-metric);color:var(--v5-brand);font-variant-numeric:tabular-nums;text-align:right; }
.quota-perks { display:flex;flex-direction:column;gap:6px;margin-top:18px;color:var(--v5-ink-3);font:400 12px/1.6 var(--font-v5);overflow-wrap:anywhere; }.quota-actions { margin-top:var(--ui-space-section); }.quota-actions :deep(.nx-button) { width:100%;box-sizing:border-box; }
.quota-unavailable { display:block;font:400 var(--ui-type-list-subtitle)/1.6 var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }
.quota-product:focus-visible { outline:2px solid var(--v5-brand);outline-offset:4px; }
.quota-tier__top { display:flex; align-items:flex-start; justify-content:space-between; gap:var(--v5-space-3); margin-bottom:var(--v5-space-3); }
.quota-tier__top .quota-product__qualification { display:inline-flex; align-items:center; gap:var(--v5-space-1); margin:0; padding:var(--v5-space-1) var(--ui-space-row-y); border-radius:999px; background:var(--v5-surface-3); }
.quota-tier__top .quota-product__qualification--met { background:color-mix(in srgb,var(--v5-brand) 16%,transparent); }
.quota-tier__top .quota-stock { flex:none; margin:0; }
.quota-stock__ring { display:grid; place-items:center; width:48px; height:48px; border-radius:50%; background:conic-gradient(var(--v5-brand) calc(var(--nx-viz-ring) * 1%),var(--v5-surface-3) 0); }
.quota-stock__hole { display:grid; place-items:center; width:38px; height:38px; border-radius:50%; background:var(--v5-surface); color:var(--v5-ink); font:600 13px/18px var(--font-metric); }
.quota-product .quota-product__price { display:flex; align-items:baseline; gap:0; font:550 18px/24px var(--font-amount); color:var(--v5-ink-2); letter-spacing:-.03em; }
.quota-price-symbol { font-size:12px; margin-right:2px; color:var(--v5-ink-3); }
.quota-price-fraction { color:var(--v5-ink-3); }
.quota-actions :deep(.quota-buy:not(.nx-button--disabled) > .nx-button__surface) { box-shadow:0 8px 24px color-mix(in srgb,var(--v5-brand) 25%,transparent); }
@media(max-width:350px) { .quota-product { gap:var(--ui-space-row-y); }.quota-product__image { width:64px;height:72px; } }
</style>
