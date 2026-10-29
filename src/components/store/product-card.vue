<!--
  ProductCard — the store's primary conversion unit (ported from store/page.tsx
  ProductCardV5 + ProductRender + ProductRibbon). The whole card taps to the
  detail page; the footer Buy/Stake CTA taps to checkout (stops propagation).

  Top→bottom:
    · SKU-specific product artwork, including the Cloud Share resource pool,
      with folded-corner badge ribbon + tier-code chip + Legacy chip overlay.
    · Body: name, ROI hero (daily earn / trade-in). Specs and AI throughput
      stay on the detail page.
    · Footer: price + frosted Buy CTA.
-->
<template>
  <!-- 《08》§2:tap 反馈 active:scale+opacity(禁 hover 做移动端反馈) -->
  <view ref="cardRef" class="product-card relative overflow-hidden block" :class="{ 'promotion-catalog-card': marketingPromotion, 'product-card--in-view': cardInView, 'product-card--compact': compact, 'product-card--entered': entered }" :style="marketingPromotion ? promotionCardStyle : cardStyle" :role="compact ? 'link' : undefined" :tabindex="compact ? 0 : -1" :aria-label="compact ? (product.name) : undefined" @click="goDetail">

    <!-- ───── Catalog photo or neutral placeholder ───── -->
    <view class="product-media relative overflow-hidden" :style="renderWrapStyle" :role="compact ? undefined : 'button'" :tabindex="compact ? -1 : 0" :aria-label="compact ? undefined : (product.name)" @click.stop="goDetail"  @keydown.enter.prevent.stop="goDetail" @keydown.space.prevent.stop="goDetail">
      <view v-if="photo" class="product-art-entry"><image class="product-art" :style="{viewTransitionName:'catalog-'+product.id.replace(/[^a-zA-Z0-9_-]/g,'-')}" :key="photo.src" :src="photo.src" mode="aspectFit" style="position: absolute; inset: 0; width: 100%; height: 100%" @error="fallbackProductImage" /></view>
      <view v-else class="absolute inset-0 grid place-items-center" style="color: var(--v5-ink-3)">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
      </view>

      <!-- Badge ribbon -->
      <view v-if="copy.badge" class="product-ribbon absolute" :style="ribbonStyle">
        <text>{{ copy.badge }}</text>
      </view>


    </view>

    <!-- ───── Body ───── -->
    <view v-if="!compact" class="relative" style="padding: 14px 16px">
      <view>
        <view class="min-w-0">
          <text class="block" :style="nameStyle">{{ (product.name) }}</text>
        </view>
      </view>

      <!-- ROI 4-line hero -->
      <!-- 去线(主人 2026-08-17 全站令):mt-6 = 原 mt-3 + pt-3 的总间距 -->
      <view v-if="!marketingPromotion" class="mt-3">
        <!-- Eyebrow -->
        <view class="font-mono-tabular inline-flex items-center gap-1.5" :style="earnEyebrowStyle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
          <text>{{ isShare ? t.store.shareReferenceAnnual : t.store.cardYouEarn }}</text>
        </view>

        <!-- Line 1: daily earn -->
        <view class="mt-1 flex items-baseline gap-2 flex-wrap">
          <text v-if="isShare" class="tabular-nums" :style="bigEarnStyle">{{ shareYieldText }}</text>
          <text v-else class="tabular-nums" :style="bigEarnStyle">${{ dailyEarnText }}<text style="font-size: var(--ui-type-list-title); color: var(--v5-ink-3); font-weight: 500">{{ t.store.cardPerDaySuffix }}</text></text>
          <!-- 「/天」单位后缀恒用弱化色,不跟数字的强调色走 —— 与同行美元侧同一档 ink-3
               (主人 2026-08-17:两侧 /天 字色必须一致) -->
          <text class="font-mono-tabular tabular-nums" style="font-size: 13px; color: var(--v5-quest-violet-ink); font-weight: 500">{{ nexPerDayText }}<text style="color: var(--v5-ink-3)">{{ t.store.cardPerDaySuffix }}</text></text>
          <text v-if="stockLow" class="font-mono-tabular tabular-nums" :style="stockHintStyle">{{ stockHintText }}</text>
        </view>
        <text class="block mt-1.5" style="font-size: 12px; line-height: 1.5; color: var(--v5-ink-3)">{{ isShare ? t.store.shareYieldDisclaimer : t.store.cardEstimateNote }}</text>

        <!-- FEAT-DEV01: 高阶任务能力线(算力越高可接任务面越大 · 数据取 SKU 解锁算力池) -->
        <view v-if="copy.unlocks" class="mt-1.5 flex items-center gap-1.5">
          <svg class="shrink-0" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan-ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
          <text class="min-w-0 truncate" style="font-size: 12px; color: var(--v5-ink-3)">{{ fmt(t.store.cardHighTierLine, { pool: copy.unlocks }) }}</text>
        </view>

        <!-- Purchase gate — remote mode is server-authoritative and fail-closed. -->
        <view v-if="gateLockedView" class="mt-2.5 active:opacity-70" :style="gateBoxStyle" role="button" tabindex="0" @click.stop="toggleGateDetails">
          <view class="flex items-center justify-between">
            <view class="flex items-center gap-1.5" :style="gateEyebrowStyle">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              <text>{{ gateLabel }}</text>
            </view>
            <!-- 🔴 remote 模式没有可展开内容,别用「展开箭头」暗示它会展开(zentao #239):
                 那里点它是**去详情页**看条件,所以画一个前进箭头。 -->
            <view v-if="!gate.soldOut" class="grid place-items-center" :style="gateToggleStyle">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </view>
          </view>
          <text v-if="remoteApiEnabled && eligibility.status === 'error'" class="block" :style="gateMetaStyle">{{ t.store.purchaseEligibilityError }}</text>
        </view>

        <!-- Trade-in callout (legacy) -->
        <view v-if="showTradein" class="mt-2.5 flex items-center justify-between gap-2 font-mono-tabular" :style="tradeinBoxStyle">
          <text>{{ t.store.cardTradeUp }} · <text style="color: var(--v5-success-ink); font-weight: 500">{{ tradeCreditText }}</text></text>
          <text class="whitespace-nowrap active:opacity-70" style="color: var(--v5-brand); font-weight: 500; font-family: var(--font-v5); min-height: 44px; display: flex; align-items: center" role="button" tabindex="0" @click.stop="goDevices">{{ t.store.cardTradeInCta }}</text>
        </view>
      </view>
      <PromotionProduct v-if="marketingPromotion" :activity="marketingPromotion" :product-no="product.id" />
    </view>

    <view v-if="compact" class="product-compact-body">
      <text class="product-compact-name">{{ (product.name) }}</text>
      <text class="product-compact-tagline">{{ copy.tagline }}</text>
      <view class="product-compact-bottom">
        <text class="product-compact-price">{{ fmtMoney(product.price).replace(/\.00$/, '') }}</text>
        <text class="product-compact-estimate" :aria-label="(isShare ? t.store.shareReferenceAnnual : t.store.cardYouEarn) + ' · ' + (isShare ? shareYieldText : fmtMoney(product.dailyEarn) + t.store.cardPerDaySuffix)">{{ isShare ? t.store.shareReferenceAnnual + ' · ' + shareYieldText : estimateLabel + ' · ' + fmtMoney(product.dailyEarn).replace(/\.00$/, '') + t.store.cardPerDaySuffix }}</text>
      </view>
      <text v-if="stockUnavailable || catalogUnavailable || (remoteApiEnabled && eligibility.status === 'ready' && !eligibility.eligible)" class="product-compact-status">{{ buyLabel }}</text>
    </view>

    <!-- ───── Footer: price + Buy CTA ───── -->
    <view v-if="!compact" class="product-footer grid items-center gap-3" :style="footerStyle">
      <view class="min-w-0">
        <text class="block font-mono-tabular" :style="priceEyebrowStyle">{{ t.store.cardPriceLabel }}</text>
        <view class="tabular-nums flex items-baseline" :style="priceRowStyle">
          <text style="font-size: var(--ui-type-list-title); color: var(--v5-ink-3); font-weight: 500">$</text>
          <text style="font-family: var(--font-amount); font-size: 26px; font-weight: 600">{{ priceText }}</text>
        </view>
      </view>
      <!-- 品牌填充按钮:opacity 取 85(《08》§2 状态派生公式) -->
      <view class="inline-flex items-center justify-center whitespace-nowrap active:scale-[0.97] active:opacity-85" :class="{'promotion-buy nx-frosted-button':!!marketingPromotion}" :style="buyBtnDynStyle" role="button" :tabindex="buyUnavailable ? -1 : 0" :aria-disabled="buyUnavailable ? 'true' : 'false'" @click.stop="onBuy"  @keydown.enter.prevent.stop="onBuy" @keydown.space.prevent.stop="onBuy">
        <svg v-if="gateLockedView" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; opacity: 0.9"><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        <text>{{ buyLabel }}</text>
        <svg v-if="!gateLockedView" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 6px; opacity: 0.9"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { formatAmount } from "@/lib/amount-display";
import { computed, ref, watch, type CSSProperties } from "vue";
import type { Product } from "@/mock/products";
import type { DeviceKind } from "@/store/types";
import { useDeviceEligibility } from "@/composables/use-device-eligibility";
import { computeTradeInCredit } from "@/mock/tradein-config";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { fmt, fmtMoney } from "@/i18n/format";
import { navTo } from "@/lib/route";
import { usePurchaseGate } from "@/composables/use-purchase-gate";
import { productCopy } from "@/lib/product-copy";
import { prepareEarnConfig, useEarnConfig } from "@/store/earn-config";
import { productTierCode } from "@/lib/product-image";
import { useProductImage } from "@/composables/use-product-image";
import { remoteApiEnabled } from "@/api/runtime";
import { useRemotePurchaseEligibility } from "@/store/purchase-eligibility";
import { useScrollGrowProgress } from "@/composables/use-scroll-grow-progress";
import { productCatalogState } from "@/store/product-catalog";
import type { PublicPromotion } from '@/api/promotion-contracts';
import PromotionProduct from '@/components/promotion/promotion-product.vue';

import { canPreviewPromotion,isPromotionActive,promotionCheckoutHref,promotionDetailHref,type VoucherEntryContext } from '@/lib/promotion-entry';

const props = withDefaults(defineProps<{ product: Product; featured?: boolean; compact?: boolean; promotion?:PublicPromotion|null; activityId?:string; promotionReady?:boolean; voucherContext?:VoucherEntryContext }>(), {
  featured: false,
});
const t = useT();
const locale = useLocaleStore();
const estimateLabel = computed(() => locale.code === 'zh' ? '预估' : locale.code === 'vi' ? 'Ước tính' : 'Est.');
const earnConfig = useEarnConfig();
prepareEarnConfig();
const copy = computed(() => productCopy(t.value, props.product, remoteApiEnabled, locale.code, earnConfig.taskPricing.value?.taskClasses));

const isShare = computed(() => props.product.productType === "SHARE");
const catalogUnavailable = computed(() => remoteApiEnabled && productCatalogState.status !== "ready");
const marketingPromotion=computed(()=>isPromotionActive(props.promotion)?props.promotion:null);
const promotionUnavailable=computed(()=>!!props.activityId&&(!props.promotionReady||!canPreviewPromotion(props.promotion??null)||!props.promotion?.productNos.includes(props.product.id)));
// The catalog supplies a scoped retained activity only for read-only labels.
const promotionPresentationReady=computed(()=>!!props.activityId&&canPreviewPromotion(props.promotion??null)&&!!props.promotion?.productNos.includes(props.product.id));
const promotionPresentationSignIn=computed(()=>promotionPresentationReady.value&&props.promotion?.eligibility==='SIGN_IN_REQUIRED');
const promotionSignIn=computed(()=>!!props.activityId&&!promotionUnavailable.value&&props.promotion?.eligibility==='SIGN_IN_REQUIRED');
const stockUnavailable = computed(() => props.product.inventoryMode === "FINITE"
  && props.product.stock === 0);
const { imageSrc, imageError: fallbackProductImage } = useProductImage(() => props.product.imageUrl);
const photo = computed(() => {
  const imageUrl = imageSrc.value;
  return imageUrl ? { src: imageUrl, tierCode: productTierCode(props.product.id, props.product.tier) } : null;
});


const stockLow = computed(
  () => !isShare.value && props.product.stock != null && props.product.stock < 50,
);
// FEAT-DEV02:动态置换角标——用户任一设备可抵本卡时展示「最高可抵 $X」(取
// 可抵额最高的设备,阶梯实时派生,无固定映射)。
const { tradeInSources: cardTradeinDevices } = useDeviceEligibility(props.product.id as DeviceKind);
const bestTradeinCredit = computed(() => {
  const d = cardTradeinDevices.value[0];
  if (!d) return 0;
  return computeTradeInCredit(d.paidPriceUsdt ?? 0, d.cumulativeEarningsUsdt ?? 0, props.product.price);
});
const showTradein = computed(() => !remoteApiEnabled && bestTradeinCredit.value > 0);

// ── Purchase gate ──────────────────────────────────────────────────────────
// Remote mode never evaluates the local V-rank/team snapshot. The server
// eligibility response is the only source that can unlock this card.
const localPurchaseGate = remoteApiEnabled ? null : usePurchaseGate(() => props.product);
const { elRef: cardRef, inView: cardInView } = useScrollGrowProgress({ threshold: 0.01, fallbackInView: false });
const entered = ref(false);
watch(cardInView, visible => { if (visible) entered.value = true; });
const { eligibility, retry: retryEligibility } = useRemotePurchaseEligibility(() => props.product.id, cardInView);
const gate = computed(() => stockUnavailable.value
  ? {
      gated: true,
      eligible: false,
      soldOut: true,
      blocked: true,
      remaining: 0,
      conditions: [],
      unmet: [],
      progressPct: 0,
    }
  : remoteApiEnabled
  ? {
      gated: true,
      eligible: eligibility.value.status === "ready" && eligibility.value.eligible,
      soldOut: eligibility.value.status === "ready"
        && !eligibility.value.eligible
        && /SOLD_OUT|OUT_OF_STOCK|STOCK/.test(eligibility.value.snapshot?.decisionCode ?? ""),
      blocked: eligibility.value.status !== "ready" || !eligibility.value.eligible,
      remaining: null,
      conditions: [],
      unmet: [],
      progressPct: eligibility.value.status === "ready" && eligibility.value.eligible ? 1 : 0,
    }
  : localPurchaseGate!.gate.value);
const gateDetailsOpen = ref(false);
let lastGateToggleAt = 0;
const gateLockedView = computed(() => gate.value.gated && gate.value.blocked);
const buyUnavailable = computed(() => promotionUnavailable.value || stockUnavailable.value || catalogUnavailable.value
  || (!promotionSignIn.value&&remoteApiEnabled && (gate.value.soldOut || eligibility.value.status === "loading")));
const gateLabel = computed(() => {
  if (stockUnavailable.value) return t.value.store.temporarilyOutOfStock;
  if (!remoteApiEnabled) return gate.value.soldOut ? t.value.store.gateSoldOut : t.value.store.gateLockedEyebrow;
  if (eligibility.value.status === "loading") return t.value.store.purchaseEligibilityLoading;
  if (eligibility.value.status === "idle") return t.value.store.purchaseEligibilityProductPolicy;
  if (eligibility.value.status === "error") return t.value.store.purchaseEligibilityRetry;
  return gate.value.soldOut ? t.value.store.gateSoldOut : t.value.store.purchaseEligibilityIneligible;
});
const gateCondTexts = computed(() =>
  gate.value.conditions.map((c) => {
    if (c.kind === "rank") return fmt(t.value.store.gateCondRank, { n: c.need });
    if (c.kind === "activeDirect") return fmt(t.value.store.gateCondDirect, { n: c.need });
    return fmt(t.value.store.gateCondVolume, { n: formatAmount(c.need) });
  }),
);
const gateModeText = computed(() =>
  gate.value.conditions.length > 1
    ? props.product.purchaseGate?.mode === "all"
      ? t.value.store.gateModeAll
      : t.value.store.gateModeAny
    : "",
);
const gateProgressText = computed(() =>
  fmt(t.value.store.gateProgress, { pct: Math.round(gate.value.progressPct * 100) }),
);
const buyLabel = computed(() =>
  promotionPresentationSignIn.value ? t.value.promotion.signIn : promotionUnavailable.value && !promotionPresentationReady.value ? t.value.promotion.unavailable : catalogUnavailable.value
    ? productCatalogState.status === "loading" ? t.value.store.catalogLoadingTitle : t.value.store.catalogErrorTitle
    : stockUnavailable.value
    ? t.value.store.temporarilyOutOfStock
    : remoteApiEnabled && eligibility.value.status === "idle"
    ? t.value.store.purchaseEligibilityCheck
    : remoteApiEnabled && eligibility.value.status === "loading"
    ? t.value.store.purchaseEligibilityLoading
    : remoteApiEnabled && eligibility.value.status === "error"
      ? t.value.store.purchaseEligibilityRetry
      : gate.value.soldOut
    ? t.value.store.gateSoldOut
    : gate.value.blocked
      ? t.value.store.gateLockedEyebrow
      : t.value.store.cardBuyNow,
);
function onBuy() {
  if (buyUnavailable.value) return;
  if(promotionSignIn.value){navTo('/pages/login/login?return='+encodeURIComponent(promotionCheckoutHref([{productNo:props.product.id,quantity:1}],props.activityId)));return;}
  if (remoteApiEnabled) {
    if (eligibility.value.status === "idle" || eligibility.value.status === "error") void retryEligibility();
    else if (eligibility.value.status === "ready" && eligibility.value.eligible) goCheckout();
    else if (eligibility.value.status === "ready") goDetail();
    return;
  }
  if (gate.value.blocked) {
    navTo("/pages/team/quota");
    return;
  }
  goCheckout();
}
/**
 * 点「解锁后购买」这一块。
 *
 * 🔴 zentao #239:remote 模式下**本卡没有可展开的内容** —— 展开区那两处渲染都带
 * `!remoteApiEnabled` 前置条件,于是点了只翻转一个不可见的开关、箭头转一下,
 * 用户拿不到任何实质反馈。而未满足的条件其实**已经在商品详情页渲染**
 * (detail.vue 用服务端 policies),本卡点击本身也是去详情页。
 * 所以 remote 模式直接把这一下交给详情页;local 模式才在原地展开。
 */
function toggleGateDetails() {
  if (stockUnavailable.value) return;
  const now = Date.now();
  if (now - lastGateToggleAt < 120) return;
  lastGateToggleAt = now;
  if (remoteApiEnabled) {
    // 资格读取失败时先重试(原行为保留),否则去详情页看具体条件。
    if (eligibility.value.status === "error") { void retryEligibility(); return; }
    goDetail();
    return;
  }
  if (!gate.value.soldOut) goDetail();
}

// Text helpers (toFixed / toLocaleString / fmt) — kept out of template for clarity
const dailyEarnText = computed(() => formatAmount(props.product.dailyEarn));
const shareYieldText = computed(() => props.product.shareYieldMin != null && props.product.shareYieldMax != null
  ? `${props.product.shareYieldMin}%–${props.product.shareYieldMax}%`
  : t.value.store.shareAnnualUnavailable);
const nexPerDayText = computed(() => fmt(t.value.store.cardNexPerDay, { n: formatAmount(props.product.dailyEarnNEX) }));
const tradeCreditText = computed(() =>
  fmt(t.value.store.cardTradeCredit, { n: formatAmount(bestTradeinCredit.value) }),
);
const priceText = computed(() => fmtMoney(props.product.price).replace(/^\$/, ""));
const stockHintText = computed(() => fmt(t.value.store.cardStockCompact, { n: props.product.stock ?? 0 }));

function goDetail() {
  // #ifdef H5
  const transitionDocument = typeof document === 'undefined' ? undefined : document as Document & {
    startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> };
  };
  if(typeof transitionDocument?.startViewTransition === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const transition=transitionDocument.startViewTransition(async()=>{await navTo(promotionDetailHref(props.product.id,props.activityId,props.voucherContext));});
    void transition.finished.catch(()=>{}); // Unsupported snapshots must never cancel navigation.
    return;
  }
  // #endif
  navTo(promotionDetailHref(props.product.id,props.activityId,props.voucherContext));
}
function goCheckout() {
  navTo(props.activityId||props.voucherContext?.voucherId ? promotionCheckoutHref([{productNo:props.product.id,quantity:1}],props.activityId,props.voucherContext) : `/pages/store/checkout?product=${encodeURIComponent(props.product.id)}`);
}
function goDevices() {
  navTo("/pages/me/devices");
}

// ───── styles ─────
const promotionCardStyle: CSSProperties = { background:'var(--ui-content-surface)',borderRadius:'22px' };
const cardStyle: CSSProperties = {
  background: "var(--ui-content-surface)",
  borderRadius: "22px",
};
const renderWrapStyle: CSSProperties = {
  width: "100%",
  aspectRatio: "1.45",
  background: "radial-gradient(70% 22% at 50% 86%, color-mix(in srgb, var(--ui-lime-soft) 30%, transparent), transparent 70%), radial-gradient(90% 85% at 50% 58%, var(--ui-content-surface-3), var(--ui-content-surface-2) 55%, var(--ui-content-surface) 100%)",
};
const vignetteStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.28) 78%, rgba(0,0,0,0.32) 88%)",
  pointerEvents: "none",
};
const fadeStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, transparent 78%, var(--v5-surface) 100%)",
  pointerEvents: "none",
};
const ribbonStyle: CSSProperties = {
  top: 0,
  left: "16px",
  padding: "3px 10px 4px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontVariantNumeric: "tabular-nums",
  fontSize: "12px",
  fontWeight: 500,
  borderRadius: "0 0 6px 6px",
  letterSpacing: "-0.005em",
  zIndex: 2,
  pointerEvents: "none",
};
const tierChipStyle: CSSProperties = {
  fontSize: "12px",
  letterSpacing: "0.22em",
  color: "rgba(255,255,255,0.88)",
  lineHeight: 1,
  background: "rgba(0,0,0,0.55)",
  padding: "5px 9px",
  borderRadius: "4px",
};
const legacyChipStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-warning-ink)",
  lineHeight: 1.4,
  background: "rgba(0,0,0,0.55)",
  padding: "3px 8px",
  borderRadius: "4px",
};
const nameStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "22px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.022em",
  lineHeight: 1.15,
};
const earnEyebrowStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.02em",
  color: "var(--v5-ink-3)",
};
const bigEarnStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 400,
  fontSize: "24px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.022em",
  lineHeight: 1,
};
const stockHintStyle: CSSProperties = {
  marginLeft: "auto",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-4)",
  letterSpacing: "-0.005em",
  lineHeight: 1,
  whiteSpace: "nowrap",
};
const tradeinBoxStyle: CSSProperties = {
  minHeight: "44px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};
const footerStyle: CSSProperties = {
  padding: "16px",
  borderTop: "1px solid var(--v5-border)",
  gridTemplateColumns: "1fr auto",
};
const priceEyebrowStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.08em",
  color: "var(--v5-ink-3)",
  lineHeight: 1,
};
const priceRowStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  letterSpacing: "-0.018em",
  lineHeight: 1,
  marginTop: "3px",
  color: "var(--v5-ink)",
};
const buyBtnStyle: CSSProperties = {
  position: 'relative',
  isolation: 'isolate',
  overflow: 'hidden',
  height: "44px",
  padding: "0 18px",
  gap: "6px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  borderRadius: "999px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  letterSpacing: "-0.005em",
};
// Locked Buy CTA = muted (soft surface, no brand) when gate blocks purchase.
// 用 surface-3 不用 surface-2 —— 按钮就落在 footerStyle 上,而 footer 本身是 surface-2,
// 同值会让「解锁后购买」整颗按钮隐形(双主题实测 ΔE=0)。muted 的本意是弱化,不是消失。
const buyBtnDynStyle = computed<CSSProperties>(() =>
  gate.value.blocked || catalogUnavailable.value
    ? { ...buyBtnStyle, background: "var(--v5-surface-3)", color: "var(--v5-ink-3)" }
    : buyBtnStyle,
);
const gateBoxStyle: CSSProperties = {
  padding: "8px 0",
  minHeight: "44px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};
const gateToggleBaseStyle: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "999px",
  color: "var(--v5-warning-ink)",
  background: "color-mix(in srgb, var(--v5-warning) 10%, transparent)",
  transition: "transform 160ms ease",
};
const gateToggleStyle = computed<CSSProperties>(() => ({
  ...gateToggleBaseStyle,
  transform: gateDetailsOpen.value ? "rotate(180deg)" : "rotate(0deg)",
}));
const gateEyebrowStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--v5-warning-ink)",
  letterSpacing: "0.02em",
};
const gateCondStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
  background: "var(--v5-surface-2)",
  padding: "2px 8px",
  borderRadius: "6px",
};
const gateMetaStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};

import { getProductMedia } from "@/lib/product-media";
</script>
<style scoped>
.product-card { transition: transform 180ms ease; }
.product-card:active { transform: scale(.99); }
.product-media:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: -3px; }
.product-art-entry { position: absolute; inset: 0; }
.product-card--entered .product-art-entry { animation: product-enter 420ms ease-out both; }
@keyframes product-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.product-media::after { content:''; position:absolute; inset:0 auto 0 -45%; width:38%; pointer-events:none; background:linear-gradient(100deg,transparent,rgba(255,255,255,.16),transparent); opacity:0; transform:translateX(0) skewX(-12deg); animation:product-auto-sheen 6.8s ease-out var(--product-sheen-delay, .6s) infinite; animation-play-state:paused; }
.product-card--in-view .product-media::after { animation-play-state:running; }
.product-card:nth-child(4n + 2) { --product-sheen-delay:1.7s; }
.product-card:nth-child(4n + 3) { --product-sheen-delay:2.8s; }
.product-card:nth-child(4n + 4) { --product-sheen-delay:3.9s; }
@keyframes product-auto-sheen { 0% { transform:translateX(0) skewX(-12deg); opacity:0; } 2% { opacity:.85; } 15% { transform:translateX(480%) skewX(-12deg); opacity:0; } 100% { transform:translateX(480%) skewX(-12deg); opacity:0; } }
.product-card:nth-child(even) .product-art { animation-delay: -1.5s; }
.product-art { transform-origin: 50% 55%; animation: product-float 4s ease-in-out infinite; animation-play-state: paused; }
.product-card--in-view .product-art { animation-play-state: running; }
@keyframes product-float { 0%, 100% { transform: translateY(2px) scale(1); } 50% { transform: translateY(-4px) scale(1.015); } }
@media (prefers-reduced-motion: reduce) { .product-card { transition: none; } .product-art, .product-card--entered .product-art-entry { animation: none; } .product-media::after { display: none; } }

.promotion-buy { --v5-liquid-tint:transparent; }
.promotion-buy :deep(.nx-liquid-glass[data-glass-strategy="solid"]),
.promotion-buy :deep(.nx-liquid-glass[data-glass-strategy="solid"] .nx-liquid-optics) { background:inherit; }
.promotion-buy > text,.promotion-buy > svg { position:relative;z-index:1; }
</style>

<style scoped>
.product-card--compact { display:flex; flex-direction:column; min-width:0; border:1px solid var(--v5-border); border-radius:22px; background:var(--ui-content-surface); cursor:pointer; }
.product-card--compact:active { transform:scale(.98); }
.product-card--compact:focus-visible { outline:2px solid var(--v5-brand); outline-offset:3px; }
.product-card--compact .product-media { height:150px; aspect-ratio:auto !important; flex:none; }
.product-card--compact .product-art-entry { display:flex; align-items:center; justify-content:center; padding:0; }
.product-card--compact .product-art { position:relative !important; inset:auto !important; width:min(172px,100%) !important; height:auto !important; aspect-ratio:1; max-width:172px; margin:0; animation-name:product-compact-float; animation-duration:4.2s; }
@keyframes product-compact-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
.product-card--compact .product-ribbon { top:0 !important; left:0 !important; padding:2px 9px !important; border-radius:0 0 6px 0 !important; background:var(--v5-brand) !important; color:var(--v5-on-brand) !important; font:500 11px/16px var(--font-v5) !important; }
.product-compact-body { flex:1; display:flex; flex-direction:column; padding:10px 14px 14px; }
.product-compact-name { font:600 14px/19px var(--font-v5); color:var(--v5-ink); overflow-wrap:anywhere; }
.product-compact-tagline { margin-top:2px; font:400 12px/16px var(--font-v5); color:var(--v5-ink-3); }
.product-compact-bottom { display:grid; grid-template-columns:minmax(0,1fr); align-content:end; gap:3px; margin-top:auto; padding-top:10px; font-variant-numeric:tabular-nums; }
.product-compact-price { color:var(--v5-ink); font:600 16px/21px var(--font-v5); }
.product-compact-estimate { font:400 12px/16px var(--font-v5); color:var(--v5-brand); }
.product-compact-status { display:block; margin-top:8px; font:400 12px/17px var(--font-v5); color:var(--v5-warning-ink); }
.product-card--compact:nth-child(2n) .product-art { animation-delay:-1.1s; }
.product-card--compact:nth-child(3n) .product-art { animation-delay:-2.2s; }
.product-card--compact:nth-child(4n) .product-art { animation-delay:-3.1s; }
@media(prefers-reduced-motion:reduce) { .product-card--compact { transition:none; }.product-card:active,.product-card--compact:active,.product-footer [role="button"]:active { transform:none; }.product-card--compact .product-art,.product-card--compact .product-art-entry,.product-media::after { animation:none; } }
</style>
