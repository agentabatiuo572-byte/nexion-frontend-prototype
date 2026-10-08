<!--
  Product detail — ported from Nexion-prototype/app/(main)/store/[productId]/
  {page.tsx + _client.tsx}. Dynamic [productId] → `?id=` query (onLoad).

  Wrapped in <AppChassis active="store">. Top→bottom:
    in-page header (back + product name) → Hero (ProductRender + ribbon +
    LiveSocialProof + name/tagline/mult + trust chips) → Vs-phone strip →
    ROI (qty stepper + 4-cell grid) → Hardware spec → AI perf spec →
    Trust badges → FAQ accordion → sticky bottom Buy CTA.

  Phase-gated products (unlocksAtPhase not yet reached) render the shared
  <LockedProductCard> in place of the full page (mirrors ProductDetailGate).
  Spec-sheet labels and the FAQ are i18n copy. Trust material uses published
  disclosures; unavailable material is shown as unavailable.
-->
<template>
  <AppChassis active="store">
    <!-- Chassis-nav pages (useSetPageHeader) don't get sub-page-header.vue's global
         24px .spv gap, so the nav→content breathing is supplied here once. -->
    <view style="color: var(--v5-ink); padding-top: 24px">
      <!-- Back + product name now live in the sticky chassis nav header
           (useSetPageHeader below) so they pin on scroll + frost content,
           mirroring the prototype's SetPageHeader. -->

      <view v-if="publicOnly" class="promotion promotion-main" data-testid="promotion-public-detail">
        <text class="promotion-title">{{ activity?localized(activity.title,locale.code):t.promotion.events }}</text>
        <text v-if="promotionStatus==='loading'||promotionStatus==='idle'" class="promotion-copy" role="status">{{ t.promotion.loading }}</text>
        <view v-else-if="promotionStatus==='error'" role="alert"><text class="promotion-copy">{{ t.promotion.errorNote }}</text><view class="promotion-link" role="button" tabindex="0" @click="refreshPromotion"><text>{{ t.promotion.retry }}</text></view></view>
        <text v-else-if="!promotionAvailable" class="promotion-copy">{{ localized(activity?.eligibilityMessage,locale.code)||t.promotion.disabledNote }}</text>
        <PromotionProduct v-if="activity" :activity="activity" :product-no="id" expanded public-only />
        <view class="promotion-action primary" role="button" tabindex="0" @click="navTo('/pages/login/login?return='+encodeURIComponent(promotionDetailHref(id,activityId)))"><text>{{ t.promotion.signIn }}</text></view>
      </view>
      <view v-else-if="catalogStatus === 'loading'" class="text-center" style="padding: 40px 16px">
        <text style="font-size: 13px; color: var(--v5-ink-3)">{{ t.store.catalogLoadingTitle }}</text>
      </view>

      <view v-else-if="catalogStatus === 'error'" class="text-center" style="padding: 40px 16px">
        <text class="block" style="font-size: 13px; color: var(--v5-ink-3); margin-bottom: 12px">{{ t.store.catalogErrorTitle }}</text>
        <view data-testid="detail-catalog-retry" class="inline-flex items-center justify-center active:opacity-90" :style="catalogRetryStyle" role="button" tabindex="0" :aria-disabled="catalogRetrying" @click.stop="retryCatalog">
          <text>{{ catalogRetrying ? t.store.catalogLoadingTitle : t.store.catalogRetry }}</text>
        </view>
      </view>

      <!-- Product not found — plain floor text (matches checkout / order-detail). -->
      <view v-else-if="!product" class="text-center" style="padding: 40px 16px">
        <text style="font-size: 13px; color: var(--v5-ink-3)">{{ t.store.coProductNotFound }}</text>
      </view>

      <!-- Phase-gated → coming-soon lock card -->
      <template v-else-if="isLocked">
        <LockedProductCard :product="product" />
        <view aria-hidden style="height: 32px" />
      </template>

      <!-- The server has not certified the managed-service specification. Keep
           the detail readable, but never expose a purchase CTA for it. -->
      <template v-else-if="purchaseUnavailable">
        <view class="mx-4 rounded-2xl border" style="padding: 24px; border-color: var(--v5-border); background: var(--v5-surface)">
          <text class="block" style="font-size: 15px; font-weight: 600; color: var(--v5-ink)">{{ nexGridBrandText(product.name) }}</text>
          <text class="block" style="margin-top: 8px; font-size: 13px; line-height: 1.6; color: var(--v5-ink-3)">{{ t.store.specUnavailable }}</text>
        </view>
        <view aria-hidden style="height: 32px" />
      </template>

      <!-- Full detail -->
      <template v-else>
        <!-- Remote purchase qualification is server-owned. Keep the detail
             readable, but never imply that a loading/error response is a buy
             decision. Error state has an explicit retry and remains blocked. -->
        <view v-if="remoteApiEnabled && eligibility.status !== 'ready'" data-testid="detail-purchase-eligibility" class="mx-4 mb-3 rounded-2xl" :style="purchaseEligibilityCardStyle">
          <text class="block" :style="purchaseEligibilityTitleStyle">{{ eligibility.status === 'error' ? t.store.purchaseEligibilityError : t.store.purchaseEligibilityLoading }}</text>
          <text class="block" style="margin-top: 5px; font-size: 12px; color: var(--v5-ink-3)">{{ t.store.purchaseEligibilityFailClosed }}</text>
          <view v-if="eligibility.status === 'error'" class="inline-flex items-center justify-center active:opacity-90" :style="catalogRetryStyle" role="button" tabindex="0" @click.stop="retryEligibility">
            <text>{{ t.store.purchaseEligibilityRetry }}</text>
          </view>
        </view>
        <view v-else-if="remoteApiEnabled && !eligibility.eligible" data-testid="detail-purchase-ineligible" class="mx-4 mb-3 rounded-2xl" :style="purchaseEligibilityCardStyle">
          <text class="block" :style="purchaseEligibilityTitleStyle">{{ eligibilityDenyTitle }}</text>
          <text class="block" style="margin-top: 5px; font-size: 12px; color: var(--v5-ink-3)">{{ eligibilityDenyBody }}</text>
          <view v-if="purchaseEligibilityMessage === 'error'" class="inline-flex items-center justify-center active:opacity-90" :style="catalogRetryStyle" role="button" tabindex="0" @click.stop="retryEligibility">
            <text>{{ t.store.purchaseEligibilityRetry }}</text>
          </view>
        </view>
        <view v-if="remoteApiEnabled && eligibility.status === 'ready' && eligibility.snapshot" data-testid="detail-purchase-policy-facts" class="mx-4 mb-3 rounded-2xl" :style="purchaseEligibilityCardStyle">
          <view v-for="(policy, policyIndex) in eligibility.snapshot.policies" :key="`${policy.policy}-${policyIndex}`" style="padding: 4px 0">
            <text class="block" :style="purchaseEligibilityTitleStyle">{{ eligibilityPolicyTitle(policy) }}</text>
            <text v-if="eligibilityQualificationConditions(policy).length > 1" class="block" style="margin-top: 3px; font-size: 12px; color: var(--v5-ink-3)">{{ eligibilityPolicyMode(policy) }}</text>
            <text v-for="condition in eligibilityQualificationConditions(policy)" :key="condition.kind" class="block font-mono-tabular" style="margin-top: 3px; font-size: 12px; color: var(--v5-ink-3)">{{ eligibilityConditionText(condition) }}</text>
            <text v-if="eligibilityMonthlyStockCondition(policy)" class="block font-mono-tabular" style="margin-top: 3px; font-size: 12px; color: var(--v5-ink-3)">{{ eligibilityConditionText(eligibilityMonthlyStockCondition(policy)!) }}</text>
            <text v-if="eligibilityPolicyHasFacts(policy)" class="block" style="margin-top: 3px; font-size: 12px" :style="eligibilityPolicyResultStyle(policy)">{{ policy.eligible ? t.store.purchaseEligibilityPolicyMet : t.store.purchaseEligibilityPolicyUnmet }}</text>
            <text v-else-if="eligibilityPolicyHasNoRestriction(policy)" class="block" style="margin-top: 3px; font-size: 12px; color: var(--v5-ink-3)">{{ t.store.purchaseEligibilityNoExtraRestriction }}</text>
            <text v-else class="block" style="margin-top: 3px; font-size: 12px; color: var(--v5-ink-3)">{{ t.store.purchaseEligibilityNoFacts }}</text>
          </view>
        </view>
        <!-- === Section 1: Hero === -->
        <view class="mx-4 nx-glass-card overflow-hidden relative">
          <view aria-hidden :style="auroraStyle" />

          <view class="relative border-b" style="border-color: var(--v5-border)">
            <ProductRender :product-id="product.id" :tier="product.tier" :image-url="product.imageUrl" :video-url="product.videoUrl" />
            <!-- Folded-corner ribbon -->
            <view v-if="copy.badge" class="absolute" :style="ribbonStyle">
              <text>{{ copy.badge }}</text>
            </view>
            <!-- Live activity danmaku -->
            <LiveSocialProof :product="product" />
          </view>

          <view class="relative" style="padding: 20px">
            <!-- name + tagline + mult-badge -->
            <view class="flex items-start justify-between" style="gap: 12px">
              <view class="min-w-0">
                <text class="block truncate" :style="nameStyle">{{ nexGridBrandText(product.name) }}</text>
                <text class="block" style="margin-top: 4px; font-size: 13px; color: var(--v5-ink-3)">{{ copy.tagline }}</text>
              </view>
              <text v-if="!isShare && speedup > 0" class="shrink-0 tabular-nums" :style="multBadgeStyle">{{ speedup }}×</text>
            </view>

            <!-- trust chips -->
            <view class="flex flex-wrap" style="margin-top: 14px; gap: 8px">
              <text class="font-mono-tabular" :style="codeChip('success')">✓ {{ soldText }} {{ t.store.liveProof.cumulativeSalesLabel }}</text>
              <text v-if="stockUnavailable" class="font-mono-tabular" :style="codeChip('amber')">{{ t.store.temporarilyOutOfStock }}</text>
              <text v-if="stockLow" class="font-mono-tabular" :style="codeChip('amber')">🔥 {{ product.stock }} {{ t.store.onlyXLeft }}</text>
            </view>
          </view>
        </view>

        <view v-if="activityId" class="mx-4 mt-3 promotion promotion-flat" data-testid="detail-promotion">
          <text class="promotion-title">{{ t.promotion.gift }}</text>
          <text v-if="promotionStatus==='loading'||promotionStatus==='idle'" class="promotion-copy" role="status">{{ t.promotion.loading }}</text>
          <view v-else-if="promotionStatus==='error'" role="alert"><text class="promotion-copy">{{ t.promotion.errorNote }}</text><view class="promotion-link" role="button" tabindex="0" @click="refreshPromotion"><text>{{ t.promotion.retry }}</text></view></view>
          <text v-else-if="!promotionAvailable||!activity?.productNos.includes(product.id)" class="promotion-copy">{{ localized(activity?.eligibilityMessage,locale.code)||t.promotion.disabledNote }}</text>
          <PromotionProduct v-if="activity" :activity="activity" :product-no="product.id" expanded />
          <view class="promotion-summary" style="align-items:center;margin-top:16px">
            <text>{{ t.promotion.quantity }}</text>
            <view class="promotion-quantity-stepper">
              <view role="button" :tabindex="qty<=1?-1:0" :aria-disabled="qty<=1" :aria-label="t.uiChrome.decreaseQty" @click="dec">−</view>
              <text aria-live="polite">{{ qty }}</text>
              <view role="button" :aria-label="t.uiChrome.increaseQty" :tabindex="qty>=100?-1:0" :aria-disabled="qty>=100" @click="inc">+</view>
            </view>
          </view>
          <view class="promotion-link" role="button" tabindex="0" @click="navTo(promotionBundleHref(activityId,[{productNo:product.id,quantity:qty}]))"><text>{{ t.promotion.bundle }}</text></view>
          <view class="promotion-link" role="button" tabindex="0" @click="navTo(promotionDetailHref(id))"><text>{{ t.promotion.ordinary }}</text></view>
        </view>

        <!-- === Cloud Share E1 annual reference and NEX allocation === -->
        <view v-if="isShare" class="mx-4 mt-3 nx-glass-card" style="padding: 16px 18px">
          <view class="font-mono-tabular inline-flex items-center" style="gap: 6px; font-size: 12px; font-weight: 500; letter-spacing: 0.08em; color: var(--v5-warning)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6" /><path d="m22 7-8.5 8.5-5-5L2 17" /></svg>
            <text>{{ t.store.shareReferenceAnnual }}</text>
          </view>
          <view class="flex items-baseline flex-wrap" style="margin-top: 6px; gap: 8px">
            <text class="tabular-nums" style="font-family: var(--font-v5); font-weight: 600; font-size: 34px; color: var(--v5-warning); letter-spacing: -0.022em; line-height: 1">{{ shareYieldText }}</text>
            <text class="font-mono-tabular tabular-nums" style="margin-left: auto; font-size: 13px; color: var(--v5-warning); font-weight: 500">{{ fmt(t.store.cardNexPerDay, { n: product.dailyEarnNEX }) }}{{ t.store.cardPerDaySuffix }}</text>
          </view>
          <text class="block" style="margin-top: 8px; font-size: 12px; line-height: 1.4; color: var(--v5-ink-4)">{{ t.store.shareYieldDisclaimer }}</text>
        </view>

        <!-- === Section 2: Vs phone strip === -->
        <view v-if="!isShare && phoneDailyEarnValue > 0" class="mx-4 mt-3 nx-glass-card flex items-center" :style="vsStripStyle">
          <view class="flex items-center min-w-0" style="gap: 6px; font-size: 12px; color: var(--v5-ink-3)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></svg>
            <text class="truncate">{{ t.store.detYourPhone }}</text>
            <text class="tabular-nums" style="font-family: var(--font-v5); color: var(--v5-warning)">{{ phoneDailyEarnText }}</text>
          </view>
          <text class="shrink-0" style="font-size: 12px; color: var(--v5-ink-4)">↔</text>
          <view class="flex-1 flex items-center justify-end min-w-0" style="gap: 6px; font-size: 12px; color: var(--v5-warning)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
            <text class="tabular-nums" style="font-family: var(--font-v5); font-weight: 600">${{ dailyEarnText }}/d</text>
          </view>
          <text v-if="speedup > 0" class="shrink-0" :style="vsMultChipStyle">{{ speedup }}×</text>
        </view>

        <!-- === Section 4: ROI calc — qty stepper + 4-cell grid === -->
        <template v-if="!isShare&&!activityId">
          <view style="padding: 22px 16px 4px"><SectionHeader :title="t.store.detEstReturns" :count="t.store.detEstReturnsMeta" /></view>
          <view class="mx-4 nx-glass-card" :style="roiCardStyle">
            <!-- qty stepper -->
            <view class="flex items-center justify-between">
              <text style="font-size: 13px; color: var(--v5-ink-3)">{{ t.store.detQuantity }}</text>
              <view class="flex items-center" :style="stepperStyle">
                <view class="grid place-items-center active:scale-[0.95] transition-transform" :style="qtyBtnStyle(qty <= 1)" role="button" :tabindex="qty <= 1 ? -1 : 0" :aria-disabled="qty <= 1" :aria-label="t.uiChrome.decreaseQty" @click.stop="dec">
                  <text>−</text>
                </view>
                <text class="tabular-nums text-center" :style="qtyNumStyle">{{ qty }}</text>
                <view class="grid place-items-center active:scale-[0.95] transition-transform" :style="qtyBtnStyle(qty >= 6)" role="button" :tabindex="qty >= 6 ? -1 : 0" :aria-disabled="qty >= 6" :aria-label="t.uiChrome.increaseQty" @click.stop="inc">
                  <text>+</text>
                </view>
              </view>
            </view>

            <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 8px">{{ t.store.detQuantityHint }}</text>
            <!-- Daily and monthly estimates from the current catalog; no hardware payback promise. -->
            <view class="grid" style="margin-top: 16px; grid-template-columns: 1fr 1fr">
              <view :style="roiCellStyle(0)">
                <text class="block font-mono-tabular" :style="roiLabelStyle">{{ t.store.detDaily }}</text>
                <text class="block tabular-nums" :style="roiValStyle('success')">${{ dailyYieldText }}</text>
                <text v-if="phoneDailyEarnValue > 0" class="block" :style="roiSubStyle">{{ vsPhoneSubText }}</text>
              </view>
              <view :style="roiCellStyle(1)">
                <text class="block font-mono-tabular" :style="roiLabelStyle">{{ t.store.detMonthly }}</text>
                <text class="block tabular-nums" :style="roiValStyle('success')">${{ monthlyYieldText }}</text>
              </view>
            </view>
          </view>
        </template>

        <!-- === Section 5: Hardware spec === -->
        <view style="padding: 22px 16px 4px"><SectionHeader :title="t.store.detHardware" /></view>
        <SpecTable :rows="hardwareSpecs" />

        <!-- === Section 6: AI performance spec === -->
        <template v-if="aiPerfRows.length > 0">
          <view style="padding: 22px 16px 4px"><SectionHeader :title="t.store.detAiPerf" /></view>
          <SpecTable :rows="aiPerfRows" brand-value />
        </template>

        <!-- === Section 7: Trust material === -->
        <template v-if="!remoteApiEnabled">
          <view style="padding: 22px 16px 4px"><SectionHeader :title="t.store.detTrustedBy" /></view>
          <view class="mx-4 nx-glass-card" :style="trustCardStyle">
            <text class="block" :style="trustBodyStyle">{{ t.trust.errorUnavailable }}</text>
          </view>
        </template>
        <template v-else>
          <view style="padding: 22px 16px 4px"><SectionHeader :title="productTrustTitle" /></view>
          <view class="mx-4 nx-glass-card" :style="trustCardStyle" data-testid="product-trust-material">
            <text v-if="trustStatus === 'loading' || trustStatus === 'idle'" class="block" :style="trustBodyStyle">{{ t.trust.loadingDisclosure }}</text>
            <template v-else-if="trustStatus === 'ready' && productAuditRows.length">
              <view v-for="row in productAuditRows" :key="row.Primary" class="active:opacity-70" :style="trustDisclosureRowStyle"
                role="link" tabindex="0" :aria-label="row.Primary"
                @click="openTrustUrl(row.Url)" @keydown.enter.prevent="openTrustUrl(row.Url)">
                <text class="block" :style="trustDisclosureTitleStyle">{{ row.Primary }}</text>
                <text class="block" :style="trustBodyStyle">{{ row.Secondary }}</text>
                <text class="block" :style="trustLinkStyle">{{ t.trust.latest }} ↗</text>
              </view>
            </template>
            <template v-else>
              <text class="block" :style="trustBodyStyle">{{ t.trust.errorUnavailable }}</text>
              <text class="block active:opacity-70" :style="trustRetryStyle" role="button" tabindex="0" :aria-label="t.ui.retry" @click="refreshTrustMaterial">{{ t.ui.retry }}</text>
            </template>
          </view>
        </template>

        <!-- === Section 8: FAQ accordion === -->
        <view style="padding: 22px 16px 4px"><SectionHeader :title="t.store.detFaq" /></view>
        <view class="mx-4" :style="faqCardStyle">
          <view v-for="(f, i) in faqs" :key="i" :style="faqItemStyle(i)">
            <view class="w-full flex items-center justify-between text-left active:opacity-80" :style="faqQStyle" role="button" tabindex="0" :aria-label="f.q" :aria-expanded="openFaq === i" @click.stop="toggleFaq(i)">
              <text class="flex-1" style="padding-right: 8px">{{ f.q }}</text>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" :style="{ transform: openFaq === i ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }"><path d="m9 18 6-6-6-6" /></svg>
            </view>
            <view v-if="openFaq === i" style="padding-bottom: 12px; padding-right: 24px; margin-top: -4px">
              <text style="font-size: 13px; color: var(--v5-ink-3); line-height: 1.625">{{ f.a }}</text>
            </view>
          </view>
        </view>

        <!-- Bottom spacer — clears the chassis-level <StickyCtaBar> (driven by
             useStickyCTA below; renders inside the bezel, absolute not fixed). -->
        <view aria-hidden style="height: 96px" />
      </template>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { navTo, takeNavigationQuery } from "@/lib/route";
import { ref, computed, watch, onUnmounted, nextTick, type CSSProperties } from "vue";
import { onLoad, onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SectionHeader from "@/components/store/section-header.vue";
import ProductRender from "@/components/store/product-render.vue";
import PromotionProduct from '@/components/promotion/promotion-product.vue';
import { usePromotionContext } from '@/composables/use-promotion-context';
import { promotionBundleHref,promotionCheckoutHref,promotionDetailHref } from '@/lib/promotion-entry';
import { localized } from '@/lib/promotion-display';
import LiveSocialProof from "@/components/store/live-social-proof.vue";
import SpecTable from "@/components/store/spec-table.vue";
import LockedProductCard from "@/components/store/locked-product-card.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { fmt } from "@/i18n/format";
import { nexGridBrandText } from "@/lib/brand-copy";
import { getProduct, type Product } from "@/mock/products";
import { useProductPhase } from "@/composables/use-product-phase";
import { isProductAvailable } from "@/store/product-availability";
import { useSetPageHeader } from "@/composables/use-page-header";
import { useStickyCTA } from "@/store/sticky-cta-bar";
import { localizedDatacenterValue, productCopy, specRow, specText, type SpecRow } from "@/lib/product-copy";
import { estimatePaybackDays } from "@/lib/product-payback";
import { getPhoneTierYields } from "@/mock/phone-tiers";
import { activePhoneDailyRate, storeYieldMultiplier } from "@/lib/store-upgrade";
import { productCatalogPresentation, productCatalogState, refreshProductCatalog } from "@/store/product-catalog";
import { useApp } from "@/store/app";
import { refreshServerProductPhase } from "@/store/server-product-phase";
import { dayOnePageObservationApi, h3ObservationApi, remoteApiEnabled, sessionVault } from "@/api/runtime";
import { toast } from "@/store/ui";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { authenticatedPageObservationReporter } from "@/lib/authenticated-page-observation";
import { usePurchaseGate } from "@/composables/use-purchase-gate";
import { useRemotePurchaseEligibility } from "@/store/purchase-eligibility";
import type { PurchaseEligibilityCondition, PurchaseEligibilityPolicy } from "@/api/purchase-eligibility-api";
import { purchaseEligibilityPolicyHasNoRestriction as eligibilityPolicyHasNoRestriction, purchaseEligibilityUnlockHref, resolvePurchaseEligibilityMessage } from "@/lib/purchase-eligibility-copy";
import type { TrustLocale } from "@/api/trust-section-api";
import { trustNumberedRows } from "@/lib/trust-fields";
import { recordPublishedTrustViews, usePublishedTrust } from "@/composables/use-published-trust";

const t = useT();
const locale = useLocaleStore();
const phase = useProductPhase();
const trustLanguage = computed<TrustLocale>(() => ["zh", "vi", "en"].includes(locale.code) ? locale.code as TrustLocale : "en");
const { sections: trustSections, status: trustStatus, refresh: refreshTrust } = usePublishedTrust();

const app = useApp();
const id = ref("");
const activityId=ref('');
const publicOnly=computed(()=>{void app.accountKey;void app.accountBindingEpoch;return !sessionVault.read();});
const {activity,status:promotionStatus,available:promotionAvailable,refresh:refreshPromotion}=usePromotionContext(activityId);
const catalogRetrying = ref(false);
let detailPageVisible = false;
let detailObservationEpoch = 0;
let detailFactsEpoch = 0;

function invalidateDetailFacts(): void {
  detailFactsEpoch += 1;
}

async function refreshDetailFacts(): Promise<void> {
  if(publicOnly.value)return;
  const readEpoch = ++detailFactsEpoch;
  const accountScope = captureAccountScope();
  // A forced catalog result advances the commerce runtime on both success and
  // failure. Trust must begin after that boundary or its valid public response
  // is discarded by the Trust generation fence.
  await refreshProductCatalog(true);
  if (readEpoch !== detailFactsEpoch || !isCurrentAccountScope(accountScope)) return;
  await Promise.all([
    refreshServerProductPhase(true),
    remoteApiEnabled ? refreshTrust(true) : Promise.resolve(true),
  ]);
  if (readEpoch !== detailFactsEpoch || !isCurrentAccountScope(accountScope)) return;
  void observeCanonicalProductDetail();
}

onLoad(async (options) => {
  const o = (options || {}) as Record<string, string>;
  const fallback = new URLSearchParams(takeNavigationQuery("/pages/store/detail"));
  id.value = (o.id || fallback.get('id') || "").trim();
  activityId.value=(o.activityId||fallback.get('activityId')||'').trim();
  await refreshDetailFacts();
});

onShow(() => {
  detailPageVisible = true;
  void refreshDetailFacts();
});

watch([() => app.accountKey, () => app.accountBindingEpoch], () => {
  invalidateDetailFacts();
  if (detailPageVisible && remoteApiEnabled && app.accountKey !== "default") void refreshDetailFacts();
});

async function retryCatalog() {
  if (catalogRetrying.value) return;
  catalogRetrying.value = true;
  try {
    await refreshDetailFacts();
  } finally {
    catalogRetrying.value = false;
  }
}

const catalogStatus = computed(() => productCatalogState.status);
// PRODUCTS is a plain compatibility array: its server replacement cannot
// invalidate a computed that first ran while the cold-start catalog was empty.
const product = computed<Product | undefined>(() => publicOnly.value || !id.value || (remoteApiEnabled && catalogStatus.value !== "ready") ? undefined
  : remoteApiEnabled
    ? productCatalogPresentation.value?.products.find((entry) => entry.id === id.value)
    : getProduct(id.value));

async function observeCanonicalProductDetail(): Promise<void> {
  const canonicalProduct = product.value;
  if (!remoteApiEnabled || !detailPageVisible || catalogStatus.value !== "ready" || !canonicalProduct?.id) return;

  const scope = captureAccountScope();
  const pageEpoch = detailObservationEpoch;
  await nextTick();
  if (
    !detailPageVisible
    || pageEpoch !== detailObservationEpoch
    || catalogStatus.value !== "ready"
    || product.value !== canonicalProduct
  ) return;

  void authenticatedPageObservationReporter.report({
    subject: `store-detail:${canonicalProduct.id}`,
    scope,
    session: sessionVault.read(),
    visible: () => detailPageVisible && pageEpoch === detailObservationEpoch,
    isCurrent: isCurrentAccountScope,
    submit: () => h3ObservationApi.productDetail(canonicalProduct.id),
  });
  if (canonicalProduct.id !== "stellarbox-s1" || canonicalProduct.productType === "SHARE"
    || !Number.isFinite(canonicalProduct.price) || canonicalProduct.price <= 0
    || !Number.isFinite(canonicalProduct.dailyEarn) || canonicalProduct.dailyEarn <= 0) return;
  void authenticatedPageObservationReporter.report({
    subject: "day-one:view-product-roi:stellarbox-s1",
    scope,
    session: sessionVault.read(),
    visible: () => detailPageVisible && pageEpoch === detailObservationEpoch,
    isCurrent: isCurrentAccountScope,
    submit: () => dayOnePageObservationApi.s1Roi(),
    accepted: (result) => result.recorded,
  });
}

watch([catalogStatus, () => product.value?.id], () => {
  void observeCanonicalProductDetail();
});

const isShare = computed(() => product.value?.productType === "SHARE");
const stockUnavailable = computed(() => !isShare.value
  && product.value?.inventoryMode === "FINITE"
  && (product.value.stock ?? 0) <= 0);
// Localized SKU copy (tagline / ribbon badge). Empty strings until `id` resolves —
// both consumers are inside `v-if="product"`, so the blanks never render.
const copy = computed(() =>
  product.value
    ? remoteApiEnabled
      ? productCopy(t.value, product.value, true, locale.code)
      : productCopy(t.value, product.value, false, locale.code)
    : { tagline: "", badge: "", unlocks: "" },
);

const purchaseUnavailable = computed(() => product.value?.purchaseBlocked === true
  && product.value.purchaseBlockedReason !== "PRODUCT_OUT_OF_STOCK");

// Phase gate: a product with unlocksAtPhase not yet reached shows the lock card.
const isLocked = computed(() => {
  const p = product.value;
  if (!p || purchaseUnavailable.value) return false;
  return !isProductAvailable(p, phase.value);
});

// Per-user purchase gate — local V-rank/team snapshots are mock-only. Remote
// mode consumes only the account-scoped server eligibility response.
const localPurchaseGate = remoteApiEnabled ? null : usePurchaseGate(product);
const { eligibility, retry: retryEligibility } = useRemotePurchaseEligibility(() => product.value?.id ?? "");
const purchaseEligibilityMessage = computed(() => resolvePurchaseEligibilityMessage(
  eligibility.value.status,
  eligibility.value.snapshot,
));
const eligibilityDenyTitle = computed(() => purchaseEligibilityMessage.value === "quotaDepleted"
  ? t.value.store.purchaseEligibilityQuotaDepleted
  : purchaseEligibilityMessage.value === "ineligible"
    ? t.value.store.purchaseEligibilityIneligible
    : t.value.store.purchaseEligibilityError);
const eligibilityDenyBody = computed(() => purchaseEligibilityMessage.value === "error"
  ? t.value.store.purchaseEligibilityFailClosed
  : t.value.store.purchaseEligibilityConditionsUnmet);
const purchaseGate = computed(() => remoteApiEnabled
  ? {
      gated: true,
      eligible: eligibility.value.status === "ready" && eligibility.value.eligible,
      soldOut: false,
      blocked: eligibility.value.status !== "ready" || !eligibility.value.eligible,
      remaining: null,
      conditions: [],
      unmet: [],
      progressPct: eligibility.value.status === "ready" && eligibility.value.eligible ? 1 : 0,
    }
  : localPurchaseGate!.gate.value);

// Sticky chassis nav header (back + centered product name) — replaces the old
// in-page back row so it pins on scroll + frosts content (mirrors prototype
// SetPageHeader). Getter form: title resolves once the product loads (onLoad).
useSetPageHeader(() => ({
  title: publicOnly.value ? (activity.value ? localized(activity.value.title,locale.code) : t.value.promotion.events)
    : catalogStatus.value === "loading" ? t.value.store.catalogLoadingTitle
    : catalogStatus.value === "error" ? t.value.store.catalogErrorTitle
      : product.value?.name ?? t.value.store.coProductNotFound,
  backHref: activityId.value ? '/pages/store/store?activityId='+encodeURIComponent(activityId.value) : "/store",
}));

// ── derived ROI math (mirrors page.tsx + _client.tsx) ──
const qty = ref(1);
const openFaq = ref(0);

// "Your phone" uses the same activated fleet rate as the Store overview.
// Without a confirmed fleet, hide the personal comparison instead of using a
// global tier as if it described this handset.
const phoneDailyEarnValue = computed(() => remoteApiEnabled
  ? app.remoteFleetHasSnapshot ? activePhoneDailyRate(app.visibleDevices) : 0
  : getPhoneTierYields().find((row) => row.tier === 3)?.baseRateUsdt ?? 0);
const speedup = computed(() =>
  product.value && !isShare.value
    && phoneDailyEarnValue.value > 0
    ? storeYieldMultiplier(product.value.dailyEarn, phoneDailyEarnValue.value)
    : 0,
);
const dailyYield = computed(() => (product.value?.dailyEarn ?? 0) * qty.value);
const monthlyYield = computed(() => dailyYield.value * 30);
const annualYield = computed(() => dailyYield.value * 365);
const totalPrice = computed(() => (product.value?.price ?? 0) * qty.value);
const paybackDays = computed(() => product.value && !isShare.value
  ? estimatePaybackDays(totalPrice.value, dailyYield.value)
  : null);
const paybackLabel = computed(() => {
  const days = paybackDays.value;
  if (days === null) return product.value && !isShare.value ? t.value.store.detPaybackUnavailable : "";
  return days >= 60
    ? fmt(t.value.store.detPaybackMonths, { n: (days / 30).toFixed(1) })
    : fmt(t.value.store.detPaybackDays, { n: days });
});

// Hardware spec rows — per-SKU values are server-owned and optional, so labels
// localise while values render as authored upstream, and a row with nothing to
// say is dropped rather than filled with a placeholder. Uptime is a platform-wide
// promise. Warranty is server-authored per SKU and is rendered without changing
// its unit or terms.
const hardwareSpecs = computed<SpecRow[]>(() => {
  const p = product.value;
  if (!p) return [];
  const s = t.value.store;
  return [
    specRow(s.specGpu, p.gpu),
    specRow(s.specVram, p.vram),
    specRow(s.specPower, p.power),
    specRow(s.specDatacenter, localizedDatacenterValue(p.datacenter, locale.code) ?? undefined),
    // 在线率不是商品字段:服务端只有 nx_admin_device_sku.uptime 这一列自由文本,
    // 没有口径/统计周期/例外/补偿条款,也没有适用 SKU 的已发布 SLA。没有权威条款时
    // 不得对购买决策作出量化服务承诺(zentao #207),整行不出现 —— 与质保同一判据:
    // 「没得说就不说」,而不是填一个占位符。
    specRow(s.specWarranty, p.warranty),
  ].filter((r): r is SpecRow => r !== null);
});

// AI perf rows from product.ai. `unlocks` is per-SKU marketing copy → resolved
// through productCopy() alongside tagline/badge, not read raw off the mock.
const aiPerfRows = computed<{ k: string; v: string }[]>(() => {
  const ai = remoteApiEnabled ? null : product.value?.ai;
  if (!ai) return [];
  const s = t.value.store;
  const rows: { k: string; v: string }[] = [];
  if (ai.imageGenPerMin) rows.push({ k: s.aiRowImageGen, v: `${ai.imageGenPerMin} ${s.aiUnitImgMin}` });
  if (ai.llmTokensPerSec) rows.push({ k: s.aiRowLlm, v: `${(ai.llmTokensPerSec / 1000).toFixed(1)}${s.aiUnitTokSec}` });
  if (ai.videoMinPerHour) rows.push({ k: s.aiRowVideo, v: `${ai.videoMinPerHour} ${s.aiUnitMinHour}` });
  if (ai.fineTuneMins) rows.push({ k: s.aiRowFineTune, v: `~${ai.fineTuneMins} ${s.aiUnitMin}` });
  if (copy.value.unlocks) rows.push({ k: s.aiRowUnlocks, v: copy.value.unlocks });
  return rows;
});

// Trust marks are proper nouns — publications and certification schemes keep
// their registered names in every locale.
const featuredMedia = ["Forbes", "CoinDesk", "TechCrunch", "The Block"];
const compliance = ["SOC 2 Type II", "ISO 27001", "CE / FCC"];
const productAuditSection = computed(() => trustSections.value.find((section) => section.sectionKey === "auditsReserves"));
const productTrustTitle = computed(() => t.value.store.detEvidenceDocuments);
const productAuditRows = computed(() => trustNumberedRows(productAuditSection.value?.fields ?? [], "document", ["Primary", "Secondary", "Url"] as const, trustLanguage.value)
  .filter((row) => safeTrustUrl(row.Url)));

async function refreshTrustMaterial() {
  if (await refreshTrust(true)) recordPublishedTrustViews(["auditsReserves"], trustLanguage.value);
}

function safeTrustUrl(raw: string): string | null {
  const value = raw.trim();
  if (/^\/pages\/[A-Za-z0-9/_-]+$/.test(value)) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch { return null; }
}
function openTrustUrl(raw: string) {
  const href = safeTrustUrl(raw);
  if (!href) { toast.error(t.value.trust.linkUnavailable); return; }
  if (href.startsWith("/")) { navTo(href); return; }
  let opened = false;
  // #ifdef H5
  opened = !!window.open(href, "_blank");
  // #endif
  // #ifndef H5
  const runtime = (globalThis as { plus?: { runtime?: { openURL: (url: string) => void } } }).plus?.runtime;
  if (runtime) { runtime.openURL(href); opened = true; }
  // #endif
  if (!opened) toast.error(t.value.trust.openFailed);
}
const faqs = computed(() => {
  const f = t.value.store.faq;
  const datacenter = specText(t.value, localizedDatacenterValue(product.value?.datacenter, locale.code));
  return [{ ...f.location, a: datacenter }, f.withdraw, f.demand, f.refund];
});

// ── text helpers (toFixed / toLocaleString / fmt out of template) ──
const stockLow = computed(
  () => !isShare.value && product.value?.stock != null && product.value.stock > 0 && product.value.stock < 50,
);
const soldText = computed(() => (product.value?.sold ?? 0).toLocaleString());
const phoneDailyEarnText = computed(() => (phoneDailyEarnValue.value > 0
  ? `${phoneDailyEarnValue.value.toFixed(2)}`
  : t.value.store.specValueUnavailable));
// Same server figure the vs-phone strip shows. It used to be baked into the copy
// as "$0.06", which contradicted the strip whenever the server said otherwise —
// or said nothing at all (strip degraded, this line still claimed $0.06).
const vsPhoneSubText = computed(() => fmt(t.value.store.detVsPhone, { n: phoneDailyEarnText.value }));
const dailyEarnText = computed(() => (product.value?.dailyEarn ?? 0).toFixed(2));
const shareYieldText = computed(() => product.value?.shareYieldMin != null && product.value?.shareYieldMax != null
  ? `${product.value.shareYieldMin}%–${product.value.shareYieldMax}%`
  : t.value.store.shareAnnualUnavailable);
const dailyYieldText = computed(() => dailyYield.value.toFixed(2));
const monthlyYieldText = computed(() => monthlyYield.value.toFixed(0));
const annualYieldText = computed(() => annualYield.value.toFixed(0));
const monthlyPctText = computed(() =>
  totalPrice.value > 0 ? ((monthlyYield.value / totalPrice.value) * 100).toFixed(1) : "0",
);
const annualPctText = computed(() =>
  totalPrice.value > 0 ? ((annualYield.value / totalPrice.value) * 100).toFixed(0) : "0",
);
const priceText = computed(() => (product.value?.price ?? 0).toLocaleString());

function eligibilityPolicyTitle(policy: PurchaseEligibilityPolicy): string {
  return policy.policy === "F4B"
    ? t.value.store.purchaseEligibilityQuotaPolicy
    : t.value.store.purchaseEligibilityProductPolicy;
}
function eligibilityPolicyMode(policy: PurchaseEligibilityPolicy): string {
  if (policy.policy === "F4B") {
    return policy.mode === "EITHER"
      ? t.value.store.purchaseEligibilityQuotaEitherAndStock
      : t.value.store.purchaseEligibilityQuotaAllAndStock;
  }
  return policy.mode === "EITHER"
    ? t.value.store.purchaseEligibilityModeEither
    : t.value.store.purchaseEligibilityModeAll;
}
function eligibilityQualificationConditions(policy: PurchaseEligibilityPolicy): PurchaseEligibilityCondition[] {
  return policy.conditions.filter((condition) => condition.kind !== "monthlyQuota");
}
function eligibilityMonthlyStockCondition(policy: PurchaseEligibilityPolicy): PurchaseEligibilityCondition | undefined {
  return policy.conditions.find((condition) => condition.kind === "monthlyQuota");
}
function eligibilityPolicyHasFacts(policy: PurchaseEligibilityPolicy): boolean {
  return policy.conditions.length > 0;
}
function eligibilityPolicyResultStyle(policy: PurchaseEligibilityPolicy): CSSProperties {
  return { color: policy.eligible ? "var(--v5-success)" : "var(--v5-warning)" };
}
function eligibilityNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
}
function eligibilityConditionText(condition: PurchaseEligibilityCondition): string {
  const values = {
    current: eligibilityNumber(condition.current),
    required: eligibilityNumber(condition.required),
    gap: eligibilityNumber(condition.gap),
  };
  const copy = condition.kind === "rank"
    ? fmt(t.value.store.purchaseEligibilityRank, values)
    : condition.kind === "activeDirect"
      ? fmt(t.value.store.purchaseEligibilityActiveDirect, values)
      : condition.kind === "teamVolumeUsd"
        ? fmt(t.value.store.purchaseEligibilityTeamVolume, values)
        : condition.kind === "lifetimeQuota"
          ? fmt(t.value.store.purchaseEligibilityLifetimeQuota, values)
          : fmt(t.value.store.purchaseEligibilityMonthlyQuota, values);
  if (condition.kind === "monthlyQuota" || condition.kind === "lifetimeQuota") return copy;
  return `${copy} · ${condition.met
    ? t.value.store.purchaseEligibilityConditionMet
    : fmt(t.value.store.purchaseEligibilityConditionGap, values)}`;
}

function dec() {
  if (qty.value > 1) qty.value -= 1;
}
function inc() {
  if (qty.value < (activityId.value?100:6)) qty.value += 1;
}
function toggleFaq(i: number) {
  openFaq.value = openFaq.value === i ? -1 : i;
}
// Chassis-level sticky bottom Buy CTA (replaces the old page-level fixed-position
// bar, which positioned against the viewport — wrong inside the bezel). useStickyCTA
// → the chassis-mounted <StickyCtaBar> renders it correctly (absolute). Re-syncs as
// product/qty resolve; cleared on hide/unmount so it never bleeds to the next page.
const sticky = useStickyCTA();
const stickyOwner = Symbol("store-detail");
const stickyPageVisible = ref(true);
sticky.activate(stickyOwner);
watch(
  [stickyPageVisible, catalogStatus, product, isShare, isLocked, purchaseUnavailable, stockUnavailable, priceText, dailyEarnText, paybackLabel, purchaseGate, eligibility, purchaseEligibilityMessage,activityId,promotionStatus,promotionAvailable,activity,qty],
  () => {
    if (!stickyPageVisible.value || (remoteApiEnabled && catalogStatus.value !== "ready")) {
      sticky.hide(stickyOwner);
      return;
    }
    if (!product.value || isLocked.value || purchaseUnavailable.value) {
      sticky.hide(stickyOwner);
      return;
    }
    if (stockUnavailable.value) {
      sticky.show({
        href: `/pages/store/detail?id=${product.value.id}`,
        amount: `${priceText.value}`,
        amountSubtext: t.value.store.temporarilyOutOfStock,
        buttonLabel: t.value.store.temporarilyOutOfStock,
        disabled: true,
        showTabBar: false,
      }, stickyOwner);
      return;
    }
    if(activityId.value){
      const allowed=promotionAvailable.value&&activity.value?.productNos.includes(product.value.id);
      if(!allowed){
        sticky.show({href:'/pages/store/detail?id='+encodeURIComponent(product.value.id),amount:`${priceText.value}`,amountSubtext:t.value.promotion.disabledNote,buttonLabel:t.value.promotion.unavailable,disabled:true,showTabBar:false},stickyOwner);
        return;
      }
      if(activity.value?.eligibility==='SIGN_IN_REQUIRED'){
        sticky.show({href:'/pages/login/login?return='+encodeURIComponent(promotionCheckoutHref([{productNo:product.value.id,quantity:qty.value}],activityId.value)),amount:`${priceText.value}`,buttonLabel:t.value.promotion.signIn,showTabBar:false},stickyOwner);
        return;
      }
    }
    if (remoteApiEnabled && eligibility.value.status !== "ready") {
      sticky.hide(stickyOwner);
      return;
    }
    if (remoteApiEnabled && !eligibility.value.eligible) {
      const quotaDepleted = purchaseEligibilityMessage.value === "quotaDepleted";
      sticky.show({
        // A rank-only product has no quota tier; take the user to rank progression.
        href: quotaDepleted ? `/pages/store/detail?id=${product.value.id}` : purchaseEligibilityUnlockHref(eligibility.value.snapshot!, product.value.id),
        amount: `${priceText.value}`,
        amountSubtext: quotaDepleted
          ? t.value.store.purchaseEligibilityQuotaDepleted
          : t.value.store.purchaseEligibilityIneligible,
        buttonLabel: quotaDepleted
          ? t.value.store.purchaseEligibilityQuotaDepleted
          : t.value.store.gateLockedCta,
        disabled: quotaDepleted,
        showTabBar: false,
      }, stickyOwner);
      return;
    }
    // Purchase gate blocks → CTA routes to /team/quota with locked label, not checkout.
    if (purchaseGate.value.blocked) {
      sticky.show({
        href: `/pages/team/quota?product=${encodeURIComponent(product.value.id)}`,
        amount: `${priceText.value}`,
        amountSubtext: purchaseGate.value.soldOut
          ? t.value.store.gateSoldOut
          : t.value.store.purchaseEligibilityIneligible,
        buttonLabel: purchaseGate.value.soldOut
          ? t.value.store.gateSoldOut
          : t.value.store.gateLockedCta,
        showTabBar: false,
      }, stickyOwner);
      return;
    }
    sticky.show({
      href: activityId.value ? promotionCheckoutHref([{productNo:product.value.id,quantity:qty.value}],activityId.value) : `/pages/store/checkout?product=${product.value.id}`,
      amount: `${priceText.value}`,
      amountSubtext: isShare.value ? undefined : `${t.value.store.detDaily}: ${dailyEarnText.value}`,
      buttonLabel: t.value.store.cardBuyNow,
      showTabBar: false,
    }, stickyOwner);
  },
  { immediate: true },
);
onShow(() => {
  sticky.activate(stickyOwner);
  stickyPageVisible.value = true;
});
onHide(() => {
  detailPageVisible = false;
  detailObservationEpoch += 1;
  invalidateDetailFacts();
  stickyPageVisible.value = false;
  sticky.hide(stickyOwner);
});
onUnmounted(() => {
  detailPageVisible = false;
  detailObservationEpoch += 1;
  invalidateDetailFacts();
  stickyPageVisible.value = false;
  sticky.hide(stickyOwner);
});

// ─── styles ───
const catalogRetryStyle: CSSProperties = {
  minHeight: "36px",
  padding: "0 14px",
  borderRadius: "9999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontSize: "13px",
  fontWeight: 600,
};
const purchaseEligibilityCardStyle: CSSProperties = {
  padding: "14px 16px",
  background: "var(--v5-surface)",
  border: "1px solid var(--v5-border)",
};
const purchaseEligibilityTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const heroCardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderColor: "var(--v5-border)",
};
const auroraStyle: CSSProperties = {
  position: "absolute",
  inset: "-20%",
  background:
    "radial-gradient(40% 50% at 80% 20%, var(--v5-tech-cyan-soft) 0%, transparent 60%)," +
    "radial-gradient(40% 50% at 10% 80%, var(--v5-brand-soft) 0%, transparent 60%)," +
    "radial-gradient(35% 45% at 70% 90%, rgba(255,203,148,0.18) 0%, transparent 60%)",
  filter: "blur(10px)",
  pointerEvents: "none",
  opacity: 0.7,
  animation: "v5-aurora-drift 14s ease-in-out infinite",
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
const nameStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "26px",
  fontWeight: 600,
  letterSpacing: "-0.024em",
  color: "var(--v5-ink)",
};
const multBadgeStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.024em",
  color: "var(--v5-brand-2)",
  whiteSpace: "nowrap",
};
function codeChip(tone: "success" | "amber"): CSSProperties {
  const palette =
    tone === "success"
      ? { bg: "var(--v5-success-soft)", color: "var(--v5-success)" }
      : { bg: "var(--v5-brand-2-soft)", color: "var(--v5-brand-2)" };
  return {
    padding: "3px 9px",
    borderRadius: "4px",
    background: palette.bg,
    color: palette.color,
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
    fontSize: "12px",
    fontWeight: 500,
    letterSpacing: "-0.005em",
  };
}
// De-carded to a filled tile (no border) — keeps the phone-vs-device commercial
// comparison punch without the boxed weight.
const vsStripStyle: CSSProperties = {
  padding: "12px 14px",
  gap: "12px",
};
const vsMultChipStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: "999px",
  background: "var(--v5-brand-soft)",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "15px",
  color: "var(--v5-brand)",
  letterSpacing: "-0.014em",
  lineHeight: 1,
};
const roiCardStyle: CSSProperties = {
  padding: "16px",
};
const stepperStyle: CSSProperties = {
  borderRadius: "999px",
  border: "1px solid var(--v5-border)",
  background: "var(--v5-surface-2)",
  overflow: "hidden",
};
function qtyBtnStyle(disabled: boolean): CSSProperties {
  return {
    width: "36px",
    height: "36px",
    fontFamily: "var(--font-v5)",
    fontSize: "20px",
    fontWeight: 500,
    color: disabled ? "var(--v5-ink-4)" : "var(--v5-ink)",
    opacity: disabled ? 0.4 : 1,
  };
}
const qtyNumStyle: CSSProperties = {
  minWidth: "36px",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.014em",
};
function roiCellStyle(index: number): CSSProperties {
  return {
    padding: "14px 16px",
    borderRight: index % 2 === 0 ? "1px solid color-mix(in srgb, var(--v5-border) 50%, transparent)" : "none",
    borderBottom: index < 2 ? "1px solid color-mix(in srgb, var(--v5-border) 50%, transparent)" : "none",
  };
}
const roiLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-4)" };
function roiValStyle(tone: "success" | "brand" | "ink"): CSSProperties {
  const color =
    tone === "success" ? "var(--v5-warning)" : tone === "brand" ? "var(--v5-brand)" : "var(--v5-ink)";
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "20px",
    fontWeight: 600,
    color,
    letterSpacing: "-0.018em",
    lineHeight: 1,
    marginTop: "4px",
  };
}
// textWrap pretty: the vs-phone subline now carries a server-sized figure, so it
// can wrap in the half-width cell — keep the last line from stranding one char.
const roiSubStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", marginTop: "4px", textWrap: "pretty" };
const trustCardStyle: CSSProperties = { padding: "16px" };
const mediaStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  color: "var(--v5-ink-2)",
};
const complianceChipStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-2)",
  letterSpacing: "-0.005em",
};
const trustDisclosureRowStyle: CSSProperties = { padding: "12px 0", borderBottom: "1px solid var(--v5-border)" };
const trustDisclosureTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const trustBodyStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", lineHeight: 1.5, color: "var(--v5-ink-3)" };
const trustLinkStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", fontWeight: 600, color: "var(--v5-brand)" };
const trustRetryStyle: CSSProperties = { marginTop: "12px", fontSize: "13px", fontWeight: 600, color: "var(--v5-brand)" };
// FAQ de-carded to a transparent hairline group (spec: FAQ → floor). The
// container border-top opens the group; each item keeps its own row hairline.
const faqCardStyle: CSSProperties = {
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
function faqItemStyle(i: number): CSSProperties {
  return { borderBottom: i < faqs.value.length - 1 ? "1px solid var(--v5-border)" : "none" };
}
const faqQStyle: CSSProperties = {
  padding: "14px 0",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--v5-ink)",
  letterSpacing: "-0.005em",
};


</script>
<style src="@/components/promotion/promotion.css"></style>
<style scoped>
.promotion-quantity-stepper { display:flex;align-items:center;border:1px solid var(--v5-border);border-radius:999px;overflow:hidden; }
.promotion-quantity-stepper view { min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;font-size:20px;background:var(--v5-surface-2); }
.promotion-quantity-stepper text { min-width:36px;text-align:center;font-variant-numeric:tabular-nums; }
.promotion-quantity-stepper [aria-disabled=true] { opacity:.4; }
</style>
