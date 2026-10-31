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
  <AppChassis active="store" class="product-detail-page">
    <!-- Chassis-nav pages (useSetPageHeader) don't get sub-page-header.vue's global
         24px .spv gap, so the nav→content breathing is supplied here once. -->
    <view style="color: var(--v5-ink); padding-top: 24px">
      <!-- Back + product name now live in the sticky chassis nav header
           (useSetPageHeader below) so they pin on scroll + frost content,
           mirroring the prototype's SetPageHeader. -->

      <view v-if="publicOnly" class="promotion promotion-main" data-testid="promotion-public-detail">
        <text class="promotion-title">{{ activity?localized(activity.title,locale.code):promotionStatus==='ready'?t.promotion.disabled:promotionStatus==='error'?t.promotion.error:t.promotion.loading }}</text>
        <text v-if="!activity&&(promotionStatus==='loading'||promotionStatus==='idle')" class="promotion-copy" role="status">{{ t.promotion.loading }}</text>
        <view v-else-if="promotionStatus==='error'" class="nx-inline-recovery" role="alert"><text class="promotion-copy nx-inline-recovery__copy">{{ t.promotion.errorNote }}</text><view class="promotion-link nx-inline-recovery__action" role="button" tabindex="0" @click="refreshPromotion"><text>{{ t.promotion.retry }}</text></view></view>
        <text v-else-if="activity&&promotionStatus==='ready'&&!promotionAvailable" class="promotion-copy">{{ localized(activity.eligibilityMessage,locale.code)||t.promotion.disabledNote }}</text>
        <PromotionProduct v-if="activity" :activity="activity" :product-no="id" expanded public-only />
        <view v-if="activity||voucherContext.voucherId" class="promotion-action primary" role="button" tabindex="0" @click="navTo('/pages/login/login?return='+encodeURIComponent(promotionDetailHref(id,activityId,voucherContext)))"><text>{{ t.promotion.signIn }}</text></view>
        <view class="promotion-link" role="button" tabindex="0" @click="navTo(promotionStoreHref())"><text>{{ t.promotion.allProducts }}</text></view>
      </view>
      <view v-else-if="catalogStatus === 'loading'" class="text-center" style="padding: var(--v5-space-10) var(--v5-space-4)">
        <text style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3)">{{ t.store.catalogLoadingTitle }}</text>
      </view>

      <view v-else-if="catalogStatus === 'error'" class="text-center" style="padding: var(--v5-space-10) var(--v5-space-4)">
        <text class="block" style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3); margin-bottom: var(--v5-space-3)">{{ t.store.catalogErrorTitle }}</text>
        <view data-testid="detail-catalog-retry" class="inline-flex items-center justify-center active:opacity-90" :style="catalogRetryStyle" role="button" tabindex="0" :aria-disabled="catalogRetrying" @click.stop="retryCatalog">
          <text>{{ catalogRetrying ? t.store.catalogLoadingTitle : t.store.catalogRetry }}</text>
        </view>
      </view>

      <!-- Product not found — plain floor text (matches checkout / order-detail). -->
      <view v-else-if="!product" class="text-center" style="padding: var(--v5-space-10) var(--v5-space-4)">
        <text style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3)">{{ t.store.coProductNotFound }}</text>
      </view>

      <!-- Phase-gated → coming-soon lock card -->
      <template v-else-if="isLocked">
        <LockedProductCard :product="product" />
        <view aria-hidden style="height: 32px" />
      </template>

      <!-- The server has not certified the managed-service specification. Keep
           the detail readable, but never expose a purchase CTA for it. -->
      <template v-else-if="purchaseUnavailable">
        <view class="mx-4 rounded-2xl border" style="padding: var(--v5-space-6); border-color: var(--v5-border); background: var(--v5-surface)">
          <text class="block" style="font-size: 15px; font-weight: 600; color: var(--v5-ink)">{{ (product.name) }}</text>
          <text class="block" style="margin-top: var(--v5-space-2); font-size: var(--ui-type-list-subtitle); line-height: 1.6; color: var(--v5-ink-3)">{{ t.store.specUnavailable }}</text>
        </view>
        <view aria-hidden style="height: 32px" />
      </template>

      <!-- Full detail -->
      <template v-else>
        <!-- === Section 1: Hero === -->
        <view class="mx-4 nx-glass-card overflow-hidden relative detail-hero">
          <view aria-hidden :style="auroraStyle" />

          <view class="relative border-b" style="border-color: var(--v5-border)">
            <ProductRender class="detail-product-render" :product-id="product.id" :tier="product.tier" :image-url="product.imageUrl" :video-url="product.videoUrl" />
            <!-- Folded-corner ribbon -->
            <view v-if="copy.badge" class="absolute" :style="ribbonStyle">
              <text>{{ copy.badge }}</text>
            </view>
            <!-- Live activity danmaku -->
            <LiveSocialProof :product="product" />
          </view>

          <view class="detail-summary relative">
            <text class="detail-summary__name" :style="nameStyle">{{ product.name }}</text>
            <text class="detail-summary__tagline">{{ copy.tagline }}</text>

            <view class="detail-sales-proof">
              <view class="detail-sales-stat detail-sales-stat--sold">
                <view class="detail-sales-stat__value-row">
                  <text class="detail-sales-stat__value font-mono-tabular">{{ soldText }}</text>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
                </view>
                <text class="detail-sales-stat__label">{{ t.store.liveProof.cumulativeSalesLabel }}</text>
              </view>
              <view v-if="stockUnavailable || (!isShare && product.stock != null && product.stock > 0)" class="detail-sales-stat detail-sales-stat--stock">
                <text v-if="stockUnavailable" class="detail-sales-stat__status">{{ t.store.temporarilyOutOfStock }}</text>
                <template v-else>
                  <text class="detail-sales-stat__value font-mono-tabular">{{ product.stock }}</text>
                  <text class="detail-sales-stat__label">{{ t.store.weeklyStockLabel }}</text>
                </template>
              </view>
            </view>
          </view>
        </view>

        <view v-if="voucherContext.voucherId" class="mx-4 mt-3 promotion promotion-flat"><text class="promotion-title">{{ t.promotion.eventVoucher }}</text><text class="promotion-copy">{{ t.promotion.eventVoucherTerms }}</text></view>
        <view v-if="activityId" class="mx-4 mt-3 promotion promotion-flat" data-testid="detail-promotion">
          <text class="promotion-title">{{ activity?t.promotion.gift:promotionStatus==='ready'?t.promotion.disabled:promotionStatus==='error'?t.promotion.error:t.promotion.loading }}</text>
          <text v-if="!activity&&(promotionStatus==='loading'||promotionStatus==='idle')" class="promotion-copy" role="status">{{ t.promotion.loading }}</text>
          <view v-else-if="promotionStatus==='error'" class="nx-inline-recovery" role="alert"><text class="promotion-copy nx-inline-recovery__copy">{{ t.promotion.errorNote }}</text><view class="promotion-link nx-inline-recovery__action" role="button" tabindex="0" @click="refreshPromotion"><text>{{ t.promotion.retry }}</text></view></view>
          <text v-else-if="activity&&promotionStatus==='ready'&&(!promotionAvailable||!activity.productNos.includes(product.id))" class="promotion-copy">{{ localized(activity.eligibilityMessage,locale.code)||t.promotion.disabledNote }}</text>
          <PromotionProduct v-if="activity" :activity="activity" :product-no="product.id" expanded />
          <view v-if="bundleActivityVisible" :aria-disabled="!canBundleActivity" class="promotion-link" role="button" tabindex="0" @click="canBundleActivity && navTo(promotionBundleHref(activityId,[{productNo:product.id,quantity:qty}]))"><text>{{ t.promotion.bundle }}</text></view>
          <view class="promotion-link" role="button" tabindex="0" @click="navTo(promotionDetailHref(id))"><text>{{ t.promotion.ordinary }}</text></view>
        </view>

        <!-- Cloud Share daily estimates follow the selected quantity. -->
        <view v-if="isShare" class="mx-4 mt-3 nx-glass-card share-returns">
          <text class="share-returns__title">{{ t.bundle.estimatedDaily }}</text>
          <text class="share-returns__description">{{ t.store.shareFlexibleDescription }}</text>
          <view class="share-returns__metrics">
            <view class="share-returns__row">
              <text class="share-returns__currency">USDT</text>
              <view v-if="shareDailyUsdt" class="share-returns__value font-mono-tabular">
                <text>{{ shareDailyUsdt.min }}</text>
                <text v-if="shareDailyUsdt.min !== shareDailyUsdt.max">– {{ shareDailyUsdt.max }}</text>
              </view>
              <text v-else class="share-returns__unavailable">{{ t.store.specValueUnavailable }}</text>
            </view>
            <view class="share-returns__row">
              <text class="share-returns__currency">UVT</text>
              <text class="share-returns__value font-mono-tabular">{{ shareDailyUvtText }}</text>
            </view>
          </view>
          <view class="share-returns__reference">
            <text>{{ t.store.shareReferenceAnnual }}</text>
            <text class="font-mono-tabular">{{ shareYieldText }}</text>
          </view>
          <text class="share-returns__note">{{ t.store.shareDailyEstimateNote }}</text>
        </view>

        <!-- === Section 2: Vs phone strip === -->
        <view v-if="!isShare && phoneDailyEarnValue > 0" class="mx-4 mt-3 nx-glass-card flex items-center" :style="vsStripStyle">
          <view class="flex items-center min-w-0" style="gap: 6px; font-size: 12px; color: var(--v5-ink-3)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><rect width="14" height="20" x="5" y="2" rx="2" ry="2" /><path d="M12 18h.01" /></svg>
            <text class="truncate">{{ t.store.detYourPhone }}</text>
            <text class="tabular-nums" style="font-family: var(--font-v5); color: var(--v5-brand)">{{ phoneDailyEarnText }}</text>
          </view>
          <text class="shrink-0" style="font-size: 12px; color: var(--v5-ink-4)">↔</text>
          <view class="flex-1 flex items-center justify-end min-w-0" style="gap: 6px; font-size: 12px; color: var(--v5-brand)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
            <text class="tabular-nums" style="font-family: var(--font-v5); font-weight: 600">${{ dailyEarnText }}{{ t.store.cardPerDaySuffix }}</text>
          </view>
          <text v-if="speedup > 0" class="shrink-0" :style="vsMultChipStyle">{{ locale.code === 'zh' ? '预估' : locale.code === 'vi' ? 'Ước tính' : 'Est.' }} {{ speedup }}×</text>
        </view>

        <!-- === Section 4: ROI calc — qty stepper + 4-cell grid === -->
        <template v-if="!isShare&&!activityId">
          <view style="padding: 22px 16px 4px"><SectionHeader :title="t.store.detEstReturns" :count="t.store.detEstReturnsMeta" /></view>
          <view class="mx-4 nx-glass-card" :style="roiCardStyle">
            <!-- Daily and monthly estimates from the current catalog; no cost-recovery estimate. -->
            <view class="grid" style="grid-template-columns: 1fr 1fr">
              <view :style="roiCellStyle(0)">
                <text class="block font-mono-tabular" :style="roiLabelStyle">{{ t.bundle.estimatedDaily }}</text>
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
        <template v-if="aiPerfRows.length">
          <view style="padding: 22px 16px 4px"><SectionHeader :title="t.store.detAiPerf" /></view>
          <SpecTable :rows="aiPerfRows" brand-value />
        </template>

        <!-- === Section 7: Trust material === -->
        <template v-if="!remoteApiEnabled">
          <view style="padding: 22px 16px 4px"><SectionHeader :title="t.store.detTrustedBy" /></view>
          <view class="mx-4 nx-glass-card" :style="trustCardStyle">
            <text class="block" :style="trustBodyStyle">{{ t.store.relatedMaterialsEmpty }}</text>
          </view>
        </template>
        <template v-else>
          <view style="padding: 22px 16px 4px"><SectionHeader :title="productTrustTitle" /></view>
          <view class="mx-4 nx-glass-card" :style="trustCardStyle" data-testid="product-trust-material">
            <view v-if="productSpecDocument" class="active:opacity-70" :style="trustDisclosureRowStyle"
              role="link" tabindex="0" :aria-label="productSpecDocument.title"
              @click="openTrustUrl(productSpecDocument.url)" @keydown.enter.prevent="openTrustUrl(productSpecDocument.url)">
              <text class="block" :style="trustDisclosureTitleStyle">{{ productSpecDocument.title }}</text>
              <text class="block" :style="trustLinkStyle">{{ t.store.viewRelatedMaterial }} ↗</text>
            </view>
            <text v-else-if="trustStatus === 'loading' || trustStatus === 'idle'" class="block" :style="trustBodyStyle">{{ t.trust.loadingDisclosure }}</text>
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
              <text class="block" :style="trustBodyStyle">{{ trustStatus === 'error' ? t.store.relatedMaterialsLoadFailed : t.store.relatedMaterialsEmpty }}</text>
              <view v-if="trustStatus === 'error'" class="product-material-retry" role="button" tabindex="0" @click="refreshTrustMaterial" @keydown.enter.prevent="refreshTrustMaterial" @keydown.space.prevent="refreshTrustMaterial"><text class="product-material-retry__label">{{ t.network.retry }}</text><text aria-hidden="true">→</text></view>
            </template>
          </view>
        </template>

        <!-- === Section 8: FAQ accordion === -->
        <view class="detail-faq mx-4" :style="faqCardStyle">
          <text class="block" style="padding-top: 14px; font-size: 13px; font-weight: 400; color: var(--v5-ink-2)">{{ t.store.detFaq }}</text>
          <view v-for="(f, i) in faqs" :key="i" :style="faqItemStyle(i)">
            <view class="w-full flex items-center justify-between text-left active:opacity-80" :style="faqQStyle" role="button" tabindex="0" :aria-label="f.q" :aria-expanded="openFaq === i" @click.stop="toggleFaq(i)">
              <text class="flex-1" style="padding-right: 8px">{{ f.q }}</text>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" :style="{ transform: openFaq === i ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }"><path d="m9 18 6-6-6-6" /></svg>
            </view>
            <view v-if="openFaq === i" style="padding-bottom: 12px; padding-right: 24px; margin-top: -4px">
              <text style="font-size: 12px; font-weight: 400; color: var(--v5-ink-2); line-height: 1.625; white-space: pre-line">{{ f.a }}</text>
            </view>
          </view>
        </view>

        <!-- Bottom spacer — clears the chassis-level <StickyCtaBar> (driven by
             useStickyCTA below; renders inside the bezel, absolute not fixed). -->
        <view aria-hidden data-testid="detail-cta-clearance" style="height: calc(180px + env(safe-area-inset-bottom)); flex-shrink: 0" />
      </template>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
function formatAmount(value: Parameters<typeof formatPlainAmount>[0]): string {
  return formatPlainAmount(value).replace(/\B(?=(\d{3})+\.)/g, ",");
}
import { formatAmount as formatPlainAmount } from "@/lib/amount-display";
import { navTo, takeNavigationQuery } from "@/lib/route";
import { ref, computed, watch, onActivated, onDeactivated, onUnmounted, nextTick, type CSSProperties } from "vue";
import { onLoad, onHide, onShow, onUnload } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SectionHeader from "@/components/store/section-header.vue";
import ProductRender from "@/components/store/product-render.vue";
import PromotionProduct from '@/components/promotion/promotion-product.vue';
import { usePromotionContext } from '@/composables/use-promotion-context';
import { promotionBundleHref,promotionCheckoutHref,promotionDetailHref,promotionStoreHref,canPreviewPromotion,voucherEntryContext,type VoucherEntryContext } from '@/lib/promotion-entry';
import { localized } from '@/lib/promotion-display';
import LiveSocialProof from "@/components/store/live-social-proof.vue";
import SpecTable from "@/components/store/spec-table.vue";
import LockedProductCard from "@/components/store/locked-product-card.vue";
import { useT } from "@/i18n/use-t";
import { useEarnConfig } from "@/store/earn-config";
import { useLocaleStore } from "@/store/locale";
import { fmt, fmtMoney } from "@/i18n/format";
import { getProduct, type Product } from "@/mock/products";
import { useProductPhase } from "@/composables/use-product-phase";
import { isProductAvailable } from "@/store/product-availability";
import { useSetPageHeader } from "@/composables/use-page-header";
import { useStickyCTA } from "@/store/sticky-cta-bar";
import { productCopy, specRow, specText, type SpecRow } from "@/lib/product-copy";
import { getPhoneTierYields } from "@/mock/phone-tiers";
import { activePhoneDailyRate, storeYieldMultiplier } from "@/lib/store-upgrade";
import { productCatalogPresentation, productCatalogState, refreshProductCatalog } from "@/store/product-catalog";
import { useApp } from "@/store/app";
import { refreshServerProductPhase } from "@/store/server-product-phase";
import { dayOnePageObservationApi, h3ObservationApi, remoteApiEnabled, sessionVault } from "@/api/runtime";
import { toast } from "@/store/ui";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { authenticatedPageObservationReporter } from "@/lib/authenticated-page-observation";
import { reportDayOnePageObservation } from "@/lib/day-one-page-observation";
import { usePurchaseGate } from "@/composables/use-purchase-gate";
import { useRemotePurchaseEligibility } from "@/store/purchase-eligibility";
import { purchaseEligibilityUnlockHref, resolvePurchaseEligibilityMessage } from "@/lib/purchase-eligibility-copy";
import type { TrustLocale } from "@/api/trust-section-api";
import { trustNumberedRows } from "@/lib/trust-fields";
import { usePublishedTrust } from "@/composables/use-published-trust";

const t = useT();
const locale = useLocaleStore();
const phase = useProductPhase();
const trustLanguage = computed<TrustLocale>(() => ["zh", "vi", "en"].includes(locale.code) ? locale.code as TrustLocale : "en");
const { sections: trustSections, status: trustStatus, refresh: refreshTrust } = usePublishedTrust();
function refreshTrustMaterial() { if (trustStatus.value === 'error') void refreshTrust(true); }

const app = useApp();
const id = ref("");
const activityId=ref('');
const voucherContext=ref<VoucherEntryContext>({});
const publicOnly=computed(()=>{void app.accountKey;void app.accountBindingEpoch;return !sessionVault.read();});
const {activity,status:promotionStatus,available:promotionAvailable,refresh:refreshPromotion}=usePromotionContext(activityId, true);
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
  await nextTick();
  if (readEpoch !== detailFactsEpoch || !isCurrentAccountScope(accountScope)) return;
  if (remoteApiEnabled && (eligibility.value.status === "error"
    || eligibility.value.status === "ready" && purchaseEligibilityMessage.value === "error")) {
    void retryEligibility();
  }
  await Promise.all([
    remoteApiEnabled ? app.refreshRemoteFleet(app.captureRemoteAccountRequest(), { coalesce: true }) : Promise.resolve(true),
    earnConfig.refresh(),
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
  voucherContext.value=voucherEntryContext({voucherId:o.voucherId||fallback.get('voucherId')||undefined,upgradeActivityId:o.upgradeActivityId||fallback.get('upgradeActivityId')||undefined});
  if(voucherContext.value.voucherId)activityId.value='';
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
  void reportDayOnePageObservation("view_product_roi", {
    scope,
    session: sessionVault.read(),
    visible: () => detailPageVisible && pageEpoch === detailObservationEpoch,
    isCurrent: isCurrentAccountScope,
    submit: () => dayOnePageObservationApi.s1Roi(),
  });
}

watch([catalogStatus, () => product.value?.id], () => {
  void observeCanonicalProductDetail();
});

const isShare = computed(() => product.value?.productType === "SHARE");
const earnConfig = useEarnConfig();
const stockUnavailable = computed(() => product.value?.inventoryMode === "FINITE"
  && product.value.stock === 0);
// Localized SKU copy (tagline / ribbon badge). Empty strings until `id` resolves —
// both consumers are inside `v-if="product"`, so the blanks never render.
const copy = computed(() =>
  product.value
    ? remoteApiEnabled
      ? productCopy(t.value, product.value, true, locale.code, earnConfig.taskPricing.value?.taskClasses)
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
  subtitle: undefined,
  backHref: activityId.value||voucherContext.value.voucherId ? promotionStoreHref(activityId.value,voucherContext.value) : "/store",
}));

// ── derived ROI math (mirrors page.tsx + _client.tsx) ──
const qty = ref(1);
const maxQuantity = computed(() => Math.min(activityId.value ? 100 : 6,
  remoteApiEnabled && app.remoteSlotsUsed != null ? Math.max(0, app.slotCap - app.remoteSlotsUsed) : Infinity));
watch(maxQuantity, max => { if (max > 0 && qty.value > max) qty.value = max; });
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

// Preserve the prototype's four spec slots while taking values from E1.
// An operator-authored uptime is displayed as online rate, not an SLA guarantee.
const hardwareSpecs = computed<SpecRow[]>(() => {
  const p = product.value;
  if (!p) return [];
  const s = t.value.store;
  return [
    { k: s.specGpu, v: specText(t.value, p.gpu, "-") },
    { k: s.specVram, v: specText(t.value, p.vram, "-") },
    { k: s.specPower, v: specText(t.value, p.power, "-") },
    { k: s.specOnlineRate, v: specText(t.value, p.uptime, "-") },
    specRow(s.specWarranty, p.warranty),
  ].filter((r): r is SpecRow => r !== null);
});

// AI perf rows from product.ai. `unlocks` is per-SKU marketing copy → resolved
// through productCopy() alongside tagline/badge, not read raw off the mock.
const aiPerfRows = computed<{ k: string; v: string }[]>(() => {
  const ai = product.value?.ai;
  if (isShare.value && !ai) return [];
  const s = t.value.store;
  const rows: { k: string; v: string }[] = [];
  const metric = (value: number | undefined, unit: string, scale = 1) => value == null
    ? "-" : `${value / scale} ${unit}`;
  if (!isShare.value) {
    rows.push({ k: s.aiRowImageGen, v: metric(ai?.imageGenPerMin, s.aiUnitImgMin) });
    rows.push({ k: s.aiRowLlm, v: metric(ai?.llmTokensPerSec, s.aiUnitTokSec, 1000) });
    rows.push({ k: s.aiRowVideo, v: metric(ai?.videoMinPerHour, s.aiUnitMinHour) });
    rows.push({ k: s.aiRowFineTune, v: metric(ai?.fineTuneMins, s.aiUnitMin) });
  }
  rows.push({ k: s.aiRowUnlocks, v: copy.value.unlocks || "-" });
  return rows;
});
const bundleActivityVisible = computed(()=>(productCatalogPresentation.value?.products??[]).filter(p=>p.productType!=='SHARE'&&activity.value?.productNos.includes(p.id)&&isProductAvailable(p,phase.value)).length>=2);
const canBundleActivity = computed(() => promotionAvailable.value && bundleActivityVisible.value);

const productAuditSection = computed(() => trustSections.value.find((section) => section.sectionKey === "auditsReserves"));
const productTrustTitle = computed(() => t.value.store.detTrustedBy);
const productAuditRows = computed(() => trustNumberedRows(productAuditSection.value?.fields ?? [], "document", ["Primary", "Secondary", "Url"] as const, trustLanguage.value)
  .filter((row) => safeTrustUrl(row.Url)));

const productSpecDocument = computed(() => {
  const title = product.value?.specDocumentTitle?.trim();
  const url = safeTrustUrl(product.value?.specDocumentUrl ?? "");
  return title && url ? { title, url } : null;
});

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
  return [f.location, f.withdraw, f.demand, ...(!isShare.value ? [f.refund] : [])];
});

// ── text helpers (toFixed / toLocaleString / fmt out of template) ──
const stockLow = computed(
  () => !isShare.value && product.value?.stock != null && product.value.stock > 0 && product.value.stock < 50,
);
const soldText = computed(() => (product.value?.sold ?? 0).toLocaleString());
const phoneDailyEarnText = computed(() => (phoneDailyEarnValue.value > 0
  ? formatAmount(phoneDailyEarnValue.value)
  : t.value.store.specValueUnavailable));
// Same server figure the vs-phone strip shows. It used to be baked into the copy
// as "$0.06", which contradicted the strip whenever the server said otherwise —
// or said nothing at all (strip degraded, this line still claimed $0.06).
const vsPhoneSubText = computed(() => fmt(t.value.store.detVsPhone, { n: phoneDailyEarnText.value }));
const dailyEarnText = computed(() => formatAmount(product.value?.dailyEarn ?? 0));
const shareYieldText = computed(() => product.value?.shareYieldMin != null && product.value?.shareYieldMax != null
  ? `${product.value.shareYieldMin}%–${product.value.shareYieldMax}%`
  : t.value.store.shareAnnualUnavailable);
const shareDailyUsdt = computed(() => {
  const current = product.value;
  if (!current || current.shareYieldMin == null || current.shareYieldMax == null) return null;
  const dailyBase = current.price * qty.value / 100 / 365;
  return {
    min: formatPlainAmount(dailyBase * current.shareYieldMin, 6),
    max: formatPlainAmount(dailyBase * current.shareYieldMax, 6),
  };
});
const shareDailyUvtText = computed(() => formatPlainAmount((product.value?.dailyEarnNEX ?? 0) * qty.value, 6));
const dailyYieldText = computed(() => formatAmount(dailyYield.value));
const monthlyYieldText = computed(() => formatAmount(monthlyYield.value));
const annualYieldText = computed(() => formatAmount(annualYield.value));
const monthlyPctText = computed(() =>
  totalPrice.value > 0 ? ((monthlyYield.value / totalPrice.value) * 100).toFixed(1) : "0",
);
const annualPctText = computed(() =>
  totalPrice.value > 0 ? ((annualYield.value / totalPrice.value) * 100).toFixed(0) : "0",
);
const priceText = computed(() => fmtMoney(product.value ? product.value.price * qty.value : null));

function dec() {
  if (qty.value > 1) qty.value -= 1;
}
function inc() {
  if (qty.value < maxQuantity.value) qty.value += 1;
}
function toggleFaq(i: number) {
  openFaq.value = openFaq.value === i ? -1 : i;
}
// Chassis-level sticky bottom Buy CTA (replaces the old page-level fixed-position
// bar, which positioned against the viewport — wrong inside the bezel). useStickyCTA
// → the chassis-mounted <StickyCtaBar> renders it correctly (absolute). Re-syncs as
// product/qty resolve; cached deactivation and Uni unload also clear this page's CTA.
const sticky = useStickyCTA();
const stickyOwner = Symbol("store-detail");
const stickyPageVisible = ref(true);
sticky.activate(stickyOwner);
function publishStickyCTA() {
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
        const warming = promotionStatus.value === 'loading' && canPreviewPromotion(activity.value) && !!activity.value?.productNos.includes(product.value.id);
        const label = warming ? activity.value?.eligibility === 'SIGN_IN_REQUIRED' ? t.value.promotion.signIn : t.value.store.cardBuyNow : t.value.promotion.unavailable;
        sticky.show({href:'/pages/store/detail?id='+encodeURIComponent(product.value.id),amount:`${priceText.value}`,amountSubtext:warming ? isShare.value ? undefined : `${t.value.bundle.estimatedDaily}: $${dailyYieldText.value}` : t.value.promotion.disabledNote,buttonLabel:label,disabled:true,showTabBar:false},stickyOwner);
        return;
      }
      if(activity.value?.eligibility==='SIGN_IN_REQUIRED'){
        sticky.show({href:'/pages/login/login?return='+encodeURIComponent(promotionCheckoutHref([{productNo:product.value.id,quantity:qty.value}],activityId.value)),amount:`${priceText.value}`,buttonLabel:t.value.promotion.signIn,showTabBar:false},stickyOwner);
        return;
      }
    }
    if (remoteApiEnabled && (eligibility.value.status !== "ready" || purchaseEligibilityMessage.value === "error")) {
      sticky.show({
        href: `/pages/store/detail?id=${product.value.id}`,
        amount: `${priceText.value}`,
        buttonLabel: eligibility.value.status === "loading" || eligibility.value.status === "idle"
          ? t.value.store.purchaseEligibilityLoading
          : t.value.store.cardBuyNow,
        disabled: true,
        showTabBar: false,
      }, stickyOwner);
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
    if (maxQuantity.value === 0) {
      sticky.show({ href: '/pages/me/devices', amount: priceText.value,
        amountSubtext: t.value.promotion.capacityUnavailable, buttonLabel: t.value.home.fleetManage, showTabBar: false }, stickyOwner);
      return;
    }
    sticky.show({
      href: isShare.value || activityId.value || voucherContext.value.voucherId || qty.value > 1 ? promotionCheckoutHref([{productNo:product.value.id,quantity:qty.value}],activityId.value,voucherContext.value) : `/pages/store/checkout?product=${product.value.id}`,
      quantity: { value:qty.value,min:1,max:maxQuantity.value,decrease:dec,increase:inc },
      amount: `${priceText.value}`,
      amountSubtext: isShare.value ? undefined : `${t.value.bundle.estimatedDaily}: $${dailyYieldText.value}`,
      buttonLabel: t.value.store.cardBuyNow,
      showTabBar: false,
    }, stickyOwner);
}
watch(
  [stickyPageVisible, catalogStatus, product, isShare, isLocked, purchaseUnavailable, stockUnavailable, priceText, dailyEarnText, purchaseGate, eligibility, purchaseEligibilityMessage,activityId,promotionStatus,promotionAvailable,activity,qty,maxQuantity,voucherContext],
  publishStickyCTA,
  { immediate: true },
);
watch(
  () => remoteApiEnabled && stickyPageVisible.value
    && (eligibility.value.status === "error"
      || eligibility.value.status === "ready" && purchaseEligibilityMessage.value === "error"),
  (failed, wasFailed) => { if (failed && !wasFailed) toast.error(t.value.store.purchaseEligibilityError); },
  { immediate: true },
);
function showDetailStickyCTA() {
  detailPageVisible = true;
  sticky.activate(stickyOwner);
  stickyPageVisible.value = true;
  publishStickyCTA();
}
function hideDetailStickyCTA() {
  detailPageVisible = false;
  detailObservationEpoch += 1;
  invalidateDetailFacts();
  stickyPageVisible.value = false;
  sticky.hide(stickyOwner);
}
onShow(showDetailStickyCTA);
onActivated(showDetailStickyCTA);
onHide(hideDetailStickyCTA);
onUnload(hideDetailStickyCTA);
onDeactivated(hideDetailStickyCTA);
onUnmounted(hideDetailStickyCTA);

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
const heroCardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderColor: "var(--v5-border)",
};
const auroraStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(40% 50% at 80% 20%, var(--v5-tech-cyan-soft) 0%, transparent 60%)," +
    "radial-gradient(40% 50% at 10% 80%, var(--v5-brand-soft) 0%, transparent 60%)," +
    "radial-gradient(35% 45% at 70% 90%, rgba(255,203,148,0.18) 0%, transparent 60%)",
  pointerEvents: "none",
  opacity: 0.7,
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
// De-carded to a filled tile (no border) — keeps the phone-vs-device commercial
// comparison punch without the boxed weight.
const vsStripStyle: CSSProperties = {
  padding: "var(--v5-space-3) 14px",
  gap: "var(--v5-space-3)",
};
const vsMultChipStyle: CSSProperties = {
  padding: "var(--v5-space-1) 10px",
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
  padding: "var(--v5-space-4)",
  background: "var(--v5-surface)",
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
  };
}
const roiLabelStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-4)" };
function roiValStyle(tone: "success" | "brand" | "ink"): CSSProperties {
  const color =
    tone === "success" ? "var(--v5-brand)" : tone === "brand" ? "var(--v5-brand)" : "var(--v5-ink)";
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
const trustCardStyle: CSSProperties = { padding: "var(--v5-space-4)" };
const mediaStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "var(--ui-type-list-subtitle)",
  color: "var(--v5-ink-2)",
};
const complianceChipStyle: CSSProperties = {
  padding: "var(--v5-space-1) 10px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-2)",
  letterSpacing: "-0.005em",
};
const trustDisclosureRowStyle: CSSProperties = { padding: "var(--v5-space-3) 0", borderBottom: "1px solid var(--v5-border)" };
const trustDisclosureTitleStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-ink)" };
const trustBodyStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", lineHeight: 1.5, color: "var(--v5-ink-3)" };
const trustLinkStyle: CSSProperties = { marginTop: "6px", fontSize: "12px", fontWeight: 600, color: "var(--v5-brand)" };
const faqCardStyle: CSSProperties = {
  marginTop: "20px",
  padding: "0 16px",
  borderRadius: "var(--ui-radius-surface)",
  background: "var(--v5-surface)",
};
function faqItemStyle(i: number): CSSProperties {
  return { borderBottom: i < faqs.value.length - 1 ? "1px solid var(--v5-border)" : "none" };
}
const faqQStyle: CSSProperties = {
  padding: "var(--v5-space-3) 0",
  minHeight: "44px",
  boxSizing: "border-box",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  fontWeight: 400,
  color: "var(--v5-ink-2)",
  letterSpacing: "-0.005em",
};


</script>
<style src="@/components/promotion/promotion.css"></style>
<style scoped>
.detail-summary { padding: var(--v5-space-5); }
.detail-summary__name { display: block; overflow-wrap: anywhere; }
.detail-summary__tagline { display: block; margin-top: var(--v5-space-1); font-size: var(--ui-type-list-subtitle); line-height: var(--v5-type-body-s-lh); color: var(--v5-ink-3); }
.detail-sales-proof { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: var(--v5-space-6); margin-top: var(--v5-space-5); }
.detail-sales-stat { display: flex; flex-direction: column; gap: var(--v5-space-1); min-width: 0; }
.detail-sales-stat--sold { color: var(--v5-success); }
.detail-sales-stat--stock { align-items: flex-end; color: var(--v5-brand-2); text-align: right; }
.detail-sales-stat__value-row { display: flex; align-items: center; gap: var(--v5-space-2); min-width: 0; }
.detail-sales-stat__value-row svg { flex: none; }
.detail-sales-stat__value { font-size: var(--v5-type-h3); font-weight: 600; line-height: var(--v5-type-h3-lh); overflow-wrap: anywhere; }
.detail-sales-stat__label { color: var(--v5-ink-3); font: 400 var(--ui-type-list-subtitle)/var(--v5-type-body-s-lh) var(--font-v5); overflow-wrap: anywhere; }
.detail-sales-stat__status { font: 500 var(--ui-type-list-subtitle)/var(--v5-type-h3-lh) var(--font-v5); overflow-wrap: anywhere; }
.detail-sales-stat:only-child { grid-column: 1 / -1; flex-direction: row; align-items: center; justify-content: space-between; }
.share-returns { padding: var(--v5-space-5); }
.share-returns__title { display: block; font: 600 var(--ui-type-subheading)/var(--ui-type-subheading-lh) var(--font-v5); color: var(--v5-ink); }
.share-returns__description { display: block; margin-top: var(--v5-space-1); font: 400 var(--v5-type-body-s)/var(--v5-type-body-s-lh) var(--font-v5); color: var(--v5-ink-3); }
.share-returns__metrics { display: flex; flex-direction: column; gap: var(--v5-space-3); margin: var(--v5-space-5) 0; }
.share-returns__row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--v5-space-3); }
.share-returns__currency { flex: none; font: 500 var(--v5-type-body-s)/var(--v5-type-body-s-lh) var(--font-v5); color: var(--v5-ink-2); }
.share-returns__value { display: flex; flex-wrap: wrap; justify-content: flex-end; column-gap: var(--v5-space-1); min-width: 0; font-size: var(--v5-type-card-title); font-weight: 600; line-height: var(--v5-type-card-title-lh); color: var(--v5-brand); text-align: right; }
.share-returns__value text { white-space: nowrap; }
.share-returns__unavailable { font: 400 var(--v5-type-body-s)/var(--v5-type-body-s-lh) var(--font-v5); color: var(--v5-ink-3); }
.share-returns__reference { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--v5-space-2); padding-top: var(--v5-space-3); border-top: 1px solid var(--v5-border); font: 400 var(--v5-type-caption)/var(--v5-type-caption-lh) var(--font-v5); color: var(--v5-ink-3); }
.share-returns__note { display: block; margin-top: var(--v5-space-1); font: 400 var(--v5-type-caption)/var(--v5-type-caption-lh) var(--font-v5); color: var(--v5-ink-3); }
/* One outer corner clip; the catalog image and its pedestal keep their full size. */
.detail-hero :deep(.detail-product-render) { border-radius:0 !important; }
.detail-hero :deep(.detail-product-render > [aria-hidden]:not(:first-child)) {
  background:linear-gradient(to top, var(--v5-content-surface) 0%, color-mix(in srgb, var(--v5-content-surface) 60%, transparent) 50%, transparent 100%) !important;
}
.detail-hero :deep(.detail-product-render .text-right > :last-child) { color:var(--v5-ink-2) !important; }
.detail-hero :deep(.detail-product-render :is(image, uni-image)) { animation:detail-machine-float 5s ease-in-out infinite; }
@keyframes detail-machine-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
.product-detail-page[data-page-visible="false"] :deep(.detail-product-render :is(image, uni-image)),
.product-detail-page[data-scrolling="true"] :deep(.detail-product-render :is(image, uni-image)) { animation-play-state:paused; }
@media (prefers-reduced-motion:reduce) {
  .detail-hero :deep(.detail-product-render :is(image, uni-image)) { animation:none; transform:none; }
}
/* Keep the frosted glass on one stationary decoration layer, separate from
   price/quantity/button paints. The outer clip also bounds its sampling edge. */
.product-detail-page :deep(.scb-outer) { overflow:hidden; }
.product-detail-page :deep(.scb-bar) {
  position:relative;isolation:isolate;
  background:transparent !important;border-top-color:transparent !important;
  backdrop-filter:none !important;-webkit-backdrop-filter:none !important;
}
.product-detail-page :deep(.scb-bar::before) {
  content:"";position:absolute;inset:-1px 0 0;z-index:-1;pointer-events:none;
  background:color-mix(in srgb, var(--v5-surface) 76%, transparent);
  backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%);
  box-shadow:inset 0 1px 0 var(--v5-sticky-bar-border);
}
.product-material-retry { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: var(--v5-space-1) var(--v5-space-4); margin-top: var(--v5-space-3); border: 1px solid var(--v5-border); border-radius: 999px; color: var(--v5-ink); font-size: var(--ui-type-list-subtitle); }
.product-material-retry__label { font: 600 13px/20px var(--font-v5); }
.product-material-retry:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 3px; }
.promotion-quantity-stepper { display:flex;align-items:center;border:1px solid var(--v5-border);border-radius:999px;overflow:hidden; }
.promotion-quantity-stepper view { min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;font-size:20px;background:var(--v5-surface-2); }
.promotion-quantity-stepper text { min-width:36px;text-align:center;font-variant-numeric:tabular-nums; }
.promotion-quantity-stepper [aria-disabled=true] { opacity:.4; }
</style>
