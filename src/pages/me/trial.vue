<!--
  Free-trial dashboard — FEAT-TRIAL02 cardless five-state page (spec ⑤):
    · none      → claim intro (CTA opens the claim sheet; ineligible = disabled
                  CTA + concrete reason, 异常2)
    · active    → countdown hero + accrued credit + "buy now (credit applies)"
                  CTA → checkout (conversion mode derives from store state)
    · grace     → stopped state: dimmed hero + "production stopped" + credit
                  amount + expiry time + buy CTA (异常1 surface)
    · ended     → terminal: credit expired (time + reason) + plain buy CTA
    · converted → terminal: owned — link to device inventory
  A "how the credit works" entry opens the in-page rules sheet (spec ⑥).
  Conversion money/order all live in checkout — this page never debits.
  Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" :title="t.trial.pageTitle" :subtitle="t.trial.pageHeaderSubtitle" />

      <view v-if="authorityUnavailable" class="mx-4 trial-read-state" role="status" :aria-busy="freeTrial.authorityStatus === 'loading'">
        <view v-if="freeTrial.authorityStatus === 'loading'" class="trial-read-skeleton" aria-hidden="true"><view/><view/><view/></view>
        <text>{{ freeTrial.authorityStatus === 'loading' ? lifecycle.loading : lifecycle.unavailable }}</text>
        <view v-if="freeTrial.authorityStatus !== 'loading'" role="button" tabindex="0" class="trial-read-retry" @click="freeTrial.refreshRemote(true)"><text>{{ lifecycle.retry }}</text></view>
      </view>
      <view v-else class="mx-4" style="display: flex; flex-direction: column; gap: 12px">
        <!-- ═══ active / grace — running cycle ═══ -->
        <template v-if="isActiveCycle">
          <CountdownHero
            :status="status"
            :extended="freeTrial.authorityServerState === 'EXTENDED'"
            :now="now"
            :remaining-ms="remainingMsValue"
            :shadow-u-s-d="shadowUSD"
            :shadow-n-e-x="shadowNEX"
            :started-at="freeTrial.startedAt"
            :expires-at="freeTrial.expiresAt"
            :grace-ends-at="freeTrial.graceEndsAt"
          />

          <!-- Grace: stopped note — device dimmed above; here the plain words -->
          <view v-if="status === 'grace' && freeTrial.authorityServerState === 'EXTENDED'" :style="stoppedRowStyle">
            <view class="flex items-center" style="gap: 6px">
              <view style="width: 8px; height: 8px; border-radius: 50%; background: var(--v5-warning); flex-shrink: 0" />
              <text style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ freeTrial.authorityServerState === 'EXTENDED' ? t.trial.extendedNote : t.trial.stoppedNote }}</text>
            </view>
            <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3); line-height: 1.625">{{ offsetUsableUntilText }}</text>
          </view>

          <!-- FEAT-TRIAL05: every amount below is the server quote convert() will settle. -->
          <view v-if="purchaseQuote" class="trial-buy" data-testid="trial-credit-summary">
            <view>
              <text class="trial-buy-title" data-testid="trial-buy-title">{{ buyTitle }}</text>
              <view v-if="earlyDeadline" class="trial-buy-deadline" data-testid="trial-early-deadline">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                <text>{{ earlyDeadline }}</text>
              </view>
            </view>
            <view class="trial-buy-card" role="group" :aria-label="purchase.payGroup">
              <text class="trial-buy-card-label">{{ purchase.payGroup }}</text>
              <view class="trial-buy-row"><text>{{ purchase.unitPrice }}</text><text>{{ usdt(purchaseQuote.priceUSD) }}</text></view>
              <view v-if="purchaseQuote.promoDiscountUSD > 0" class="trial-buy-row trial-buy-row--discount"><text>{{ promoLabel }}</text><text>−{{ usdt(purchaseQuote.promoDiscountUSD) }}</text></view>
              <view v-if="purchaseQuote.offsetUSD > 0" class="trial-buy-row trial-buy-row--discount"><text>{{ t.store.coRowTrialOffset }}</text><text>−{{ usdt(purchaseQuote.offsetUSD) }}</text></view>
              <view v-if="purchaseQuote.earlyDiscountUSD > 0" class="trial-buy-row trial-buy-row--discount"><text>{{ lifecycle.earlyDiscountLabel }}</text><text>−{{ usdt(purchaseQuote.earlyDiscountUSD) }}</text></view>
              <view class="trial-buy-divider" />
              <view class="trial-buy-total"><text>{{ purchase.amountDue }}</text><text data-testid="trial-amount-due">{{ usdt(purchaseQuote.amountUSD) }}</text></view>
            </view>
            <view class="trial-buy-credit" role="group" :aria-label="purchase.creditGroup">
              <view class="trial-buy-credit-row">
                <text>{{ purchase.creditGroup }}</text>
                <view class="trial-buy-credit-value" data-testid="trial-credit-after">
                  <text v-if="purchaseQuote.remainderUSD > 0" class="trial-buy-usdt">{{ usdt(purchaseQuote.remainderUSD) }}</text>
                  <text v-if="purchaseQuote.remainderUSD > 0" class="trial-buy-sep">·</text>
                  <text class="trial-buy-uvt">{{ formatGroupedAmount(purchaseQuote.rewardNEX) }} UVT</text>
                </view>
              </view>
              <text v-if="creditNote" class="trial-buy-note">{{ creditNote }}</text>
            </view>
            <text v-if="earlyEndedNote" class="trial-buy-note">{{ earlyEndedNote }}</text>
            <view
              class="w-full flex items-center justify-center"
              :class="trialProductUnavailable ? '' : 'active:scale-[0.98] active:opacity-85'"
              :style="trialProductUnavailable && !trialCatalogLoading ? buyBtnDisabledStyle : buyBtnStyle"
              role="button"
              :tabindex="trialProductUnavailable ? -1 : 0"
              :aria-label="trialBuyCtaText"
              :aria-disabled="trialProductUnavailable ? 'true' : 'false'"
              :aria-busy="trialCatalogLoading ? 'true' : 'false'"
              @click="goCheckout"

              @keydown.enter.prevent="goCheckout" @keydown.space.prevent="goCheckout"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
              <text style="margin-left: 6px">{{ trialBuyCtaText }}</text>
            </view>
            <text v-if="trialProductUnavailable && productCatalogState.status === 'ready'" class="block" :style="reasonNoteStyle">{{ t.store.trialProductUnavailable }}</text>
          </view>
          <!-- Older servers without a quote keep the accrued-only presentation. -->
          <view v-else :style="creditWrapStyle" data-testid="trial-credit-summary">
            <view class="flex items-center justify-between">
              <text style="font-size: var(--ui-type-meta); color: var(--v5-ink-3)">{{ lifecycle.availableOffsetLabel }}</text>
              <text class="font-mono-tabular" style="font-size: var(--ui-type-list-title); font-weight: 600; color: var(--v5-brand); white-space: nowrap">{{ usdt(trialOffset.offsetUSD) }}</text>
            </view>
            <view class="trial-estimate-row"><text>{{ lifecycle.estimateTotalLabel }}</text><text>≈ {{ usdt(estimatedOffsetUSD) }}</text></view>
            <text class="trial-buy-note">{{ lifecycle.earlyPurchaseNote }}</text>
            <text v-if="trialOffset.remainderUSD > 0" class="block" :style="remainderNoteStyle">{{ offsetRemainderNote }}</text>
            <view class="w-full flex items-center justify-center" :class="trialProductUnavailable ? '' : 'active:scale-[0.98] active:opacity-85'" :style="trialProductUnavailable && !trialCatalogLoading ? buyBtnDisabledStyle : buyBtnStyle" role="button" :tabindex="trialProductUnavailable ? -1 : 0" :aria-label="trialBuyCtaText" :aria-disabled="trialProductUnavailable ? 'true' : 'false'" :aria-busy="trialCatalogLoading ? 'true' : 'false'" @click="goCheckout" @keydown.enter.prevent="goCheckout" @keydown.space.prevent="goCheckout">
              <text>{{ trialBuyCtaText }}</text>
            </view>
            <text v-if="trialProductUnavailable && productCatalogState.status === 'ready'" class="block" :style="reasonNoteStyle">{{ t.store.trialProductUnavailable }}</text>
          </view>

          <!-- Rules entry -->
          <view class="w-full flex items-center justify-between active:opacity-70" :style="rulesEntryStyle" role="button" tabindex="0" :aria-label="purchase.rulesEntry" @click="rulesOpen = true">
            <text style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-2)">{{ purchase.rulesEntry }}</text>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </view>

          <view class="w-full flex items-center justify-center active:opacity-90" :style="goEarnStyle" role="button" tabindex="0" :aria-label="t.trial.goEarnCta" @click="goEarn">
            <text>{{ t.trial.goEarnCta }} →</text>
          </view>
        </template>

        <!-- ═══ none — claim intro ═══ -->
        <view v-else-if="status === 'none' || (status === 'ended' && canStartNow)" :style="idleCardStyle">
          <view class="grid place-items-center" :style="idleIconBoxStyle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
          </view>
          <text class="block" :style="idleTitleStyle">{{ t.trial.idleTitleNew }}</text>
          <text v-if="idleBody" class="block" :style="idleBodyStyle">{{ idleBody }}</text>
          <view
            class="inline-flex items-center justify-center"
            :class="canStartNow ? 'active:scale-[0.98]' : ''"
            :style="canStartNow ? idleCtaStyle : idleCtaDisabledStyle"
            role="button"
            :tabindex="canStartNow ? 0 : -1"
            :aria-label="t.trial.idleCta"
            :aria-disabled="canStartNow ? 'false' : 'true'"
            @click="claim"

            @keydown.enter.prevent="claim" @keydown.space.prevent="claim"
          >
            <text>{{ t.trial.idleCta }}</text>
          </view>
          <!-- Ineligible → concrete reason under the disabled CTA (异常2) -->
          <text v-if="!canStartNow" class="block" :style="reasonNoteStyle">{{ ineligibleReasonText }}</text>
        </view>

        <!-- ═══ ended — credit expired terminal ═══ -->
        <view class="nx-glass-card" v-else-if="status === 'ended'" :style="terminalCardStyle" data-testid="trial-ended">
          <view class="trial-ended-art" aria-hidden="true">
            <CatalogMachineImage class="trial-ended-machine" :sku="trialProductId" :image-url="productCatalogState.status === 'ready' ? trialProduct?.imageUrl : undefined" scope-key="trial-ended" />
            <view class="trial-ended-status">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
            </view>
          </view>
          <text class="block" :style="idleTitleStyle">{{ t.trial.endedTitle }}</text>
          <text class="block" :style="idleBodyStyle">{{ t.trial.endedDesc }}</text>
          <view class="inline-flex items-center justify-center" :class="trialProductUnavailable ? '' : 'active:scale-[0.98]'" :style="trialProductUnavailable && !trialCatalogLoading ? idleCtaDisabledStyle : idleCtaStyle" role="button" :tabindex="trialProductUnavailable ? -1 : 0" :aria-label="trialBuyCtaText" :aria-disabled="trialProductUnavailable ? 'true' : 'false'" :aria-busy="trialCatalogLoading ? 'true' : 'false'" @click="goCheckout"  @keydown.enter.prevent="goCheckout" @keydown.space.prevent="goCheckout">
            <text>{{ trialBuyCtaText }}</text>
          </view>
          <text v-if="trialProductUnavailable && productCatalogState.status === 'ready'" class="block" :style="reasonNoteStyle">{{ t.store.trialProductUnavailable }}</text>
        </view>

        <!-- ═══ converted, then refunded: the device is gone, say so ═══ -->
        <template v-else-if="conversionRefunded">
          <view class="nx-glass-card" :style="terminalCardStyle" data-testid="trial-refunded">
            <view class="grid place-items-center" :style="terminalIconBoxStyle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" /></svg>
            </view>
            <text class="block" :style="idleTitleStyle">{{ purchase.refundedTitle }}</text>
            <text class="block" :style="idleBodyStyle">{{ purchase.refundedBody }}</text>
            <text v-if="freeTrial.authoritativeConversion?.rewardsReversed" class="block" :style="reasonNoteStyle">{{ purchase.refundedRewards }}</text>
          </view>
          <view class="w-full flex items-center justify-center active:scale-[0.98]" :style="buyBtnStyle" role="button" tabindex="0" :aria-label="purchase.shopCta" @click="goStore"><text>{{ purchase.shopCta }}</text></view>
          <view v-if="freeTrial.authoritativeConversion?.orderNo" class="w-full flex items-center justify-center active:opacity-90" :style="goEarnStyle" role="button" tabindex="0" :aria-label="purchase.refundOrderCta" @click="goRefundedOrder"><text>{{ purchase.refundOrderCta }}</text></view>
        </template>

        <!-- ═══ converted — owned terminal ═══ -->
        <view class="nx-glass-card" v-else :style="terminalCardStyle">
          <view class="grid place-items-center" :style="terminalIconBoxStyle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>
          </view>
          <text class="block" :style="idleTitleStyle">{{ t.trial.convertedTitle }}</text>
          <text class="block" :style="idleBodyStyle">{{ t.trial.convertedDesc }}</text>
          <view class="inline-flex items-center justify-center active:opacity-70" :style="cooldownLinkStyle" role="button" tabindex="0" :aria-label="t.trial.convertedDevicesCta" @click="goDevices">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px"><rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" /></svg>
            <text>{{ t.trial.convertedDevicesCta }}</text>
          </view>
        </view>
        <view v-if="(isActiveCycle || status === 'ended') && productCatalogState.status === 'error'" class="inline-flex items-center justify-center active:opacity-70" :style="goEarnStyle" role="button" tabindex="0" @click="retryCatalog" @keydown.enter.prevent="retryCatalog" @keydown.space.prevent="retryCatalog">
          <text>{{ t.store.catalogRetry }}</text>
        </view>
      </view>
    </view>

    <!-- ═══ Rules half-sheet (spec ⑥「查看抵扣规则」) ═══ -->
    <view v-if="rulesOpen" class="trs-root" role="dialog" aria-modal="true">
      <view class="trs-backdrop" role="button" tabindex="0" @click="rulesOpen = false" />
      <view class="nx-glass-sheet trs-panel" @click.stop>
        <view class="flex items-center justify-between">
          <text style="font-family: var(--font-v5); font-size: var(--ui-type-section); font-weight: 600; color: var(--v5-ink)">{{ t.trial.rulesTitle }}</text>
          <view class="grid place-items-center active:opacity-70" style="width: 44px; height: 44px; border-radius: 999px; flex-shrink: 0" role="button" tabindex="0" :aria-label="t.trial.sheetCloseAria" @click="rulesOpen = false">
            <view class="rounded-full grid place-items-center" style="width: 36px; height: 36px; background: var(--v5-surface-2)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </view>
          </view>
        </view>
        <view style="margin-top: 14px; display: flex; flex-direction: column; gap: 10px">
          <view v-for="(line, i) in rulesLines" :key="i" class="flex items-start" style="gap: 8px">
            <view style="width: 6px; height: 6px; border-radius: 50%; background: var(--v5-brand); margin-top: 6px; flex-shrink: 0" />
            <text style="flex: 1; font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-2); line-height: 1.625; text-wrap: pretty">{{ line }}</text>
          </view>
        </view>
        <view class="w-full flex items-center justify-center active:scale-[0.98]" :style="rulesGotStyle" role="button" tabindex="0" :aria-label="t.trial.rulesGotCta" @click="rulesOpen = false">
          <text>{{ t.trial.rulesGotCta }}</text>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatAmount, formatGroupedAmount } from "@/lib/amount-display";
import { computed, ref, watch, onMounted, onUnmounted, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import CountdownHero from "@/components/earn/trial-progress-hero.vue";
import CatalogMachineImage from "@/components/catalog-machine-image.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { formatTrialDateTime, formatTrialDeadline } from "@/lib/trial-date";
import { geoPolicyErrorKind, geoPolicyUserMessage } from "@/api/geo-policy-error";
import { useFreeTrial, liveShadowUSD, liveShadowNEX, remainingMs } from "@/store/free-trial";
import { useTrialConfig, computeTrialOffset, resolveTrialCheckoutProductId } from "@/store/trial-config";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { getProduct } from "@/mock/products";
import { productCatalogState, refreshProductCatalog } from "@/store/product-catalog";
import { navTo } from "@/lib/route";
import { useDialogA11y } from "@/composables/use-dialog-a11y";
import { remoteApiEnabled } from "@/api/runtime";
import { useTrialLifecycleCopy } from "@/i18n/trial-lifecycle";
import { useTrialPurchaseCopy } from "@/i18n/trial-purchase";

const t = useT();
const freeTrial = useFreeTrial();
const trialConfig = useTrialConfig();
const lifecycle = useTrialLifecycleCopy();
const purchase = useTrialPurchaseCopy();
const authorityUnavailable = computed(() => remoteApiEnabled && (freeTrial.authorityStatus !== "ready"
  || ((freeTrial.status === "active" || freeTrial.status === "grace")
    && (freeTrial.authoritativeOffsetUSD === null || freeTrial.authoritativeRemainderUSD === null))));

const cfg = computed(() => trialConfig.config);
const status = computed(() => freeTrial.status);

const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  void refreshProductCatalog(true);
  ticker = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (ticker) clearInterval(ticker);
  ticker = null;
});

const isActiveCycle = computed(() => status.value === "active" || status.value === "grace");
const trialProductId = computed(() => resolveTrialCheckoutProductId(cfg.value.trialProductId));
const trialProduct = computed(() => (trialProductId.value ? getProduct(trialProductId.value) : undefined));
const trialCatalogLoading = computed(() => productCatalogState.status !== "ready" && productCatalogState.status !== "error");
const trialProductUnavailable = computed(() => {
  if (productCatalogState.status !== "ready") return true;
  const product = trialProduct.value;
  if (!product || product.purchaseBlocked === true) return true;
  return product.productType !== "SHARE"
    && product.inventoryMode === "FINITE"
    && (product.stock ?? 0) <= 0;
});
const shadowUSD = computed(() => liveShadowUSD(now.value));
const shadowNEX = computed(() => liveShadowNEX(now.value));
const remainingMsValue = computed(() => remainingMs(now.value));
const trialOffset = computed(() => remoteApiEnabled
  ? { offsetUSD: freeTrial.authoritativeOffsetUSD ?? 0, remainderUSD: freeTrial.authoritativeRemainderUSD ?? 0 }
  : computeTrialOffset(cfg.value, shadowUSD.value));
const estimatedOffsetUSD = computed(() => computeTrialOffset(cfg.value, cfg.value.shadowDailyUSD * cfg.value.trialDays).offsetUSD);
// FEAT-TRIAL05: the server quote convert() will settle. An early quote is shown only while
// the original term is still running; once its end passes it is stale, so hide it and re-read.
const earlyQuoteLapsed = computed(() => {
  const quote = freeTrial.authoritativeQuote;
  return !!quote?.earlyPurchase && quote.earlyEndsAt !== null && now.value >= quote.earlyEndsAt;
});
const purchaseQuote = computed(() => remoteApiEnabled && isActiveCycle.value && !earlyQuoteLapsed.value
  ? freeTrial.authoritativeQuote : null);
const earlyQuote = computed(() => status.value === "active" && purchaseQuote.value?.earlyPurchase ? purchaseQuote.value : null);
watch(earlyQuoteLapsed, (lapsed) => { if (lapsed) void freeTrial.refreshRemote(true); });
const usdt = (value: number) => `${formatGroupedAmount(value)} USDT`;
const buyTitle = computed(() => {
  if (earlyQuote.value) return fmt(purchase.value.earlyTitle, { discount: formatGroupedAmount(earlyQuote.value.earlyDiscountUSD) });
  return status.value === "grace" ? purchase.value.graceTitle : purchase.value.accruedTitle;
});
const earlyDeadline = computed(() => earlyQuote.value?.earlyEndsAt
  ? fmt(purchase.value.earlyDeadline, { time: formatTrialDeadline(earlyQuote.value.earlyEndsAt, dateLocale()) }) : "");
const creditNote = computed(() => {
  if (earlyQuote.value) return fmt(purchase.value.creditNoteFull, { days: String(cfg.value.trialDays) });
  return status.value === "active" ? purchase.value.creditNoteAccrued : "";
});
const earlyEndedNote = computed(() => status.value === "grace" && (purchaseQuote.value?.earlyDiscountConfiguredUSD ?? 0) > 0
  ? fmt(purchase.value.earlyEnded, { discount: formatGroupedAmount(purchaseQuote.value!.earlyDiscountConfiguredUSD) }) : "");
const promoLabel = computed(() => fmt(t.value.store.coRowTrialDiscount, {
  pct: (cfg.value.discountRate * 100).toFixed(0), cap: String(Number(cfg.value.discountCapUSD)),
}));
const conversionRefunded = computed(() => remoteApiEnabled && status.value === "converted"
  && freeTrial.authoritativeConversion?.refunded === true);

const w = computed(() => t.value.trial);
const idleBody = computed(() => freeTrial.authorityStatus === "mock" || freeTrial.authorityServerState !== null
  ? fmt(w.value.idleBody, { n: String(cfg.value.trialDays) })
  : "");
const offsetRemainderNote = computed(() => fmt(w.value.offsetRemainderNote, { remainder: formatAmount(trialOffset.value.remainderUSD) }));
const offsetUsableUntilText = computed(() =>
  fmt(w.value.offsetUsableUntil, {
    time: freeTrial.graceEndsAt !== null ? formatTrialDateTime(freeTrial.graceEndsAt, dateLocale()) : w.value.countdownDateEmpty,
  }),
);
const trialBuyCtaText = computed(() => {
  if (productCatalogState.status === "error") return t.value.store.catalogErrorTitle;
  if (trialCatalogLoading.value) return w.value.buyCtaPlain;
  if (trialProductUnavailable.value) return t.value.store.temporarilyOutOfStock;
  if (purchaseQuote.value) return fmt(purchase.value.buyCta, { amount: formatGroupedAmount(purchaseQuote.value.amountUSD) });
  return w.value.buyCtaPlain;
});
// none-state eligibility (异常2 — concrete reason, never a generic error).
const canStartNow = computed(() => {
  void now.value; // re-evaluate each tick (eligibility isn't reactive on config alone)
  return freeTrial.canStart();
});
const ineligibleReasonText = computed(() => {
  const r = freeTrial.eligibility().reason;
  // PROD: this reason is served by GET /api/trial/eligibility, so a region
  // refusal arrives here as the reason code. Translate it first; `null` means an
  // ordinary reason, which the named branches below still handle unchanged.
  // 本页没有重试控件；读取失败只说明暂不可用，不推断活动关闭。
  const geo = geoPolicyUserMessage(r, t.value.geoPolicy);
  if (geo) return geoPolicyErrorKind(r) === "unavailable" ? w.value.eligReasonClosed : geo;
  if (r === "converted") return w.value.eligReasonConverted;
  if (r === "used") return w.value.eligReasonUsed;
  if (r === "in-progress") return w.value.eligReasonInProgress;
  if (r === "risk") return w.value.eligReasonRisk;
  if (r === "quota-exhausted") return w.value.eligReasonQuota;
  if (r === "product-unavailable") return t.value.store.trialProductUnavailable;
  if (r === "capacity-full") return lifecycle.value.capacityFull;
  return w.value.eligReasonClosed;
});

// Rules sheet (spec ⑥: pre-purchase offset / no cash-out / post-purchase
// remainder → balance / expiry).
const rulesOpen = ref(false);
const rulesLines = computed(() => [
  fmt(w.value.rulesBefore, { cap: formatGroupedAmount(cfg.value.trialOffsetCapUSD) }),
  w.value.rulesNoCash,
  w.value.rulesAfter,
  ...(earlyQuote.value ? [
    fmt(lifecycle.value.rulesEarly, { discount: formatGroupedAmount(earlyQuote.value.earlyDiscountConfiguredUSD) }),
    lifecycle.value.rulesRefund,
  ] : []),
  w.value.rulesExpiry,
]);

function claim() {
  if (!canStartNow.value) return; // disabled CTA — reason line explains why
  useTrialClaimSheet().show();
}

// Conversion CTA → checkout. Trial pricing still derives from authoritative
// state (status ∈ active|grace ∧ product = trialProductId); the URL marker only
// controls safe return copy when the canonical catalogue omits the trial SKU.
function goCheckout() {
  if (authorityUnavailable.value || trialProductUnavailable.value) return;
  const productId = trialProductId.value;
  if (!productId) return; // applyAuthoritative already rejects unknown policy ids
  navTo(`/pages/store/checkout?product=${productId}&source=trial`);
}
function retryCatalog() {
  if (productCatalogState.status !== "error") return;
  void refreshProductCatalog(true);
}
function goEarn() {
  navTo("/pages/earn/earn");
}
function goDevices() {
  navTo("/pages/me/devices");
}
function goStore() {
  navTo("/store");
}
function goRefundedOrder() {
  const orderNo = freeTrial.authoritativeConversion?.orderNo;
  if (orderNo) navTo(`/pages/store/order-detail?id=${encodeURIComponent(orderNo)}`);
}

// ── styles — hairline-separated blocks on the page floor ──
const stoppedRowStyle: CSSProperties = { padding: "13px 2px 0", borderTop: "1px solid var(--v5-border)" };
const creditWrapStyle: CSSProperties = { padding: "13px 2px 0", borderTop: "1px solid var(--v5-border)" };
const remainderNoteStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-4)", marginTop: "6px", lineHeight: 1.625, textWrap: "pretty" };
const buyBtnStyle: CSSProperties = { marginTop: "4px", width: "100%", height: "48px", borderRadius: "999px", background: "var(--v5-brand)", color: "var(--v5-on-brand)", fontSize: "var(--ui-type-button)", lineHeight: "var(--ui-type-button-lh)", fontWeight: 600 };
const buyBtnDisabledStyle: CSSProperties = { ...buyBtnStyle, background: "var(--v5-surface-2)", color: "var(--v5-ink-4)" };
const rulesEntryStyle: CSSProperties = { minHeight: "44px", padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
const goEarnStyle: CSSProperties = { width: "100%", height: "44px", borderRadius: "999px", background: "var(--v5-surface-2)", fontSize: "var(--ui-type-list-subtitle)", color: "var(--v5-ink-2)" };
const idleCardStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px dashed var(--v5-border-strong)",
  background: "color-mix(in srgb, var(--v5-surface) 40%, transparent)",
  padding: "32px 20px",
  textAlign: "center",
};
const idleIconBoxStyle: CSSProperties = { width: "48px", height: "48px", borderRadius: "999px", background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)", margin: "0 auto" };
const idleTitleStyle: CSSProperties = { marginTop: "12px", fontSize: "var(--ui-type-section)", fontWeight: 600, color: "var(--v5-ink)" };
const idleBodyStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.375, padding: "0 8px", textWrap: "pretty" };
const idleCtaStyle: CSSProperties = { marginTop: "16px", height: "48px", padding: "0 24px", borderRadius: "999px", background: "var(--v5-brand)", color: "var(--v5-on-brand)", fontSize: "13px", fontWeight: 600 };
const idleCtaDisabledStyle: CSSProperties = { marginTop: "16px", height: "48px", padding: "0 24px", borderRadius: "999px", background: "var(--v5-surface-2)", color: "var(--v5-ink-4)", fontSize: "13px", fontWeight: 600 };
const reasonNoteStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.625, textWrap: "pretty" };
const terminalCardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)", borderRadius: "var(--nx-glass-radius)", background: "var(--nx-glass-fill)", padding: "24px 20px", textAlign: "center" };
const terminalIconBoxStyle: CSSProperties = { width: "48px", height: "48px", borderRadius: "999px", background: "var(--v5-surface-2)", margin: "0 auto" };
const cooldownLinkStyle: CSSProperties = { marginTop: "16px", minHeight: "44px", fontSize: "13px", color: "var(--v5-ink-2)" };
const rulesGotStyle: CSSProperties = { marginTop: "18px", height: "48px", borderRadius: "999px", background: "var(--v5-brand)", color: "var(--v5-on-brand)", fontSize: "13px", fontWeight: 600 };

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => rulesOpen.value), ".trs-root", () => { rulesOpen.value = false; });


</script>

<style scoped>
.trial-ended-art { position:relative;width:112px;height:104px;margin:0 auto; }
.trial-ended-machine { width:100%;height:100%; }
.trial-ended-status { position:absolute;right:0;bottom:0;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--v5-surface-2); }
.trial-read-state { display:flex;flex-direction:column;gap:16px;padding:24px 0;color:var(--v5-ink-3);font-size:13px; }
.trial-read-skeleton { display:flex;flex-direction:column;gap:14px; }
.trial-read-skeleton > view { height:24px;width:70%;border-radius:8px;background:var(--v5-surface-2); }
.trial-read-skeleton > view:first-child { height:100px;width:100%;border-radius:20px; }
.trial-read-retry { min-height:44px;display:flex;align-items:center;justify-content:center;border-radius:999px;background:var(--v5-surface-2);color:var(--v5-ink);font:600 13px/20px var(--font-v5); }
.trial-estimate-row { display:flex;justify-content:space-between;gap:var(--v5-space-3);margin-top:var(--v5-space-2);color:var(--v5-ink-3);font-size:var(--ui-type-meta);line-height:var(--ui-type-meta-lh); }
.trial-estimate-row > text:last-child { flex-shrink:0;font-variant-numeric:tabular-nums; }
.trial-buy { display:flex;flex-direction:column;gap:var(--v5-space-3);padding-top:var(--v5-space-2); }
.trial-buy-title { display:block;font-size:var(--ui-type-section);line-height:var(--ui-type-section-lh);font-weight:600;color:var(--v5-ink);text-wrap:pretty; }
.trial-buy-deadline { display:inline-flex;align-items:center;gap:var(--v5-space-1);margin-top:var(--v5-space-2);padding:var(--v5-space-1) var(--v5-space-3);border-radius:var(--v5-radius-full);background:var(--v5-brand-soft);color:var(--v5-brand);font-size:var(--ui-type-meta);line-height:var(--ui-type-meta-lh);font-weight:600; }
.trial-buy-card { display:flex;flex-direction:column;gap:var(--v5-space-2);padding:var(--v5-space-3) var(--v5-space-4);border-radius:var(--v5-radius-l);background:var(--v5-surface); }
.trial-buy-card-label { font-size:var(--ui-type-meta);line-height:var(--ui-type-meta-lh);font-weight:600;color:var(--v5-ink-3); }
.trial-buy-row { display:flex;justify-content:space-between;gap:var(--v5-space-3);font-size:var(--ui-type-list-subtitle);line-height:var(--ui-type-list-subtitle-lh);color:var(--v5-ink-3); }
.trial-buy-row > text:last-child { flex-shrink:0;color:var(--v5-ink-2);font-variant-numeric:tabular-nums; }
.trial-buy-row--discount > text:last-child { color:var(--v5-brand); }
.trial-buy-divider { height:1px;background:var(--v5-border); }
.trial-buy-total { display:flex;justify-content:space-between;align-items:baseline;gap:var(--v5-space-3);font-size:var(--ui-type-list-subtitle);color:var(--v5-ink-2); }
.trial-buy-total > text:last-child { font-size:var(--ui-type-list-title);line-height:var(--ui-type-list-title-lh);font-weight:600;color:var(--v5-ink);font-variant-numeric:tabular-nums; }
.trial-buy-credit { display:flex;flex-direction:column;gap:var(--v5-space-1);padding:var(--v5-space-3) var(--v5-space-4);border-radius:var(--v5-radius-l);background:color-mix(in srgb, var(--v5-brand) 10%, transparent);border:1px solid color-mix(in srgb, var(--v5-brand) 25%, transparent); }
.trial-buy-credit-row { display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;column-gap:var(--v5-space-3);row-gap:var(--v5-space-1);font-size:var(--ui-type-list-subtitle);line-height:var(--ui-type-list-subtitle-lh);font-weight:600;color:var(--v5-ink-2); }
.trial-buy-credit-value { display:flex;margin-left:auto;white-space:nowrap;gap:var(--v5-space-1);font-size:var(--ui-type-list-title);line-height:var(--ui-type-list-title-lh);font-variant-numeric:tabular-nums; }
.trial-buy-usdt { color:var(--v5-brand); }
.trial-buy-sep { color:var(--v5-ink-3); }
.trial-buy-uvt { color:var(--v5-nex); }
.trial-buy-note { display:block;font-size:var(--ui-type-meta);line-height:var(--ui-type-meta-lh);color:var(--v5-ink-3);text-wrap:pretty; }
.trs-root {
  position: fixed;
  inset: 0;
  z-index: 790;
}
.trs-backdrop {
  position: absolute;
  inset: 0;
  background: var(--v5-bg-color-mask);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  animation: trs-fade 0.24s ease-out;
}
.trs-panel { border-radius: var(--nx-glass-radius) var(--nx-glass-radius) 0 0;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 800;


  background: var(--nx-glass-fill); box-shadow: var(--nx-glass-edge);

  padding: 20px 16px;
  padding-bottom: calc(env(safe-area-inset-bottom) + 38px);
  box-sizing: border-box;
  max-height: calc(100% - var(--nx-overlay-top));
  overflow-y: auto;
  animation: trs-slide-up 0.36s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes trs-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes trs-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .trs-backdrop, .trs-panel { animation: none; }
}
</style>
