<!--
  Checkout — ported from Nexion-prototype/app/(main)/store/checkout/page.tsx.
  Reads ?product=<id> (default stellarbox-s1) &/or ?id= via onLoad. Buy flow
  state machine, top→bottom: stepper → AnimatePresence step card.

  Steps: select-payment → confirm → pay-instructions (chain QR / card form) →
  awaiting → confirmed → activating → live. On entering "confirmed" the order is
  persisted ONCE (debit balance incl. card fee → orders.createOrder → postReceiptOnly),
  with first-order celebration. framer AnimatePresence → CSS @keyframes fade.

  Batch C trade-in intercept (ported): on first mount, for purchasable DEVICE
  products only, open the trade-in Choice sheet if the user owns a tradeable
  device, else the slot-full Replace sheet when active slots are capped, else
  fall through to the normal payment flow. Cross-store composition (eligibility
  reads app/v-rank/network) lives here at the page layer via the
  useDeviceEligibility composable (stores never import each other, P-031/032).
  Wrapped in <AppChassis active="store">; the back + "Checkout" title live in the
  sticky chassis nav header via useSetPageHeader (mirrors the prototype's
  <SetPageHeader backHref={`/store/${product.id}`}/>, where the chassis Header
  fills in the route title headerTitles.storeCheckout).
-->
<template>
  <AppChassis active="store">
    <!-- Chassis-nav pages (useSetPageHeader) don't get sub-page-header.vue's global
         24px .spv gap, so the nav→content breathing is supplied here once. -->
    <view style="color: var(--v5-ink); padding-top: 24px">
      <!-- Back + title now live in the sticky chassis nav header
           (useSetPageHeader below) so they pin on scroll, mirroring the
           prototype's <SetPageHeader>. -->

      <view v-if="catalogStatus === 'loading'" class="text-center" style="padding: 20px">
        <text class="block" style="font-size: 13px; color: var(--v5-ink-3); margin-bottom: 12px">{{ t.store.catalogLoadingTitle }}</text>
      </view>

      <view v-else-if="catalogStatus === 'error'" class="text-center" style="padding: 20px">
        <text class="block" style="font-size: 13px; color: var(--v5-ink-3); margin-bottom: 12px">{{ t.store.catalogErrorTitle }}</text>
        <view class="inline-flex items-center justify-center active:opacity-90" :style="notFoundBtnStyle" role="button" tabindex="0" @click.stop="goStore">
          <text>{{ t.store.coBackToStore }}</text>
        </view>
      </view>

      <!-- Product not found -->
      <view v-else-if="!product" class="text-center" style="padding: 20px">
        <text class="block" style="font-size: 13px; color: var(--v5-ink-3); margin-bottom: 12px">{{ t.store.coProductNotFound }}</text>
        <view class="inline-flex items-center justify-center active:opacity-90" :style="notFoundBtnStyle" role="button" tabindex="0" @click.stop="goStore">
          <text>{{ t.store.coBackToStore }}</text>
        </view>
      </view>

      <template v-else>
        <!-- Stepper bars -->
        <view class="flex items-center" :style="stepperRowStyle">
          <view v-for="(s, i) in stepLabels" :key="s.key" class="flex-1">
            <view class="rounded-full overflow-hidden" style="height: 4px; background: var(--v5-surface-2)">
              <view class="h-full" :style="stepFillStyle(i)" />
            </view>
          </view>
        </view>
        <view class="flex justify-between" :style="stepLabelRowStyle">
          <text v-for="(s, i) in stepLabels" :key="s.key" :style="{ color: i <= stepDisplay ? 'var(--v5-brand)' : 'var(--v5-ink-3)', fontSize: '12px' }">{{ s.label }}</text>
        </view>

        <!-- A receipt-only write is a recoverable post-order failure. Keep the
             checkout on this explicit state; the timer chain must not announce
             activation while the bill is still missing.
             不许盖住本页正在展示的活票(地址 / 金额 / 倒计时 / 取消都在被它压掉的那一支里):
             恢复行是持久行,resume 进来的票会被它整页遮蔽而全站失联(审计 R5 P0)—— 有活票先付票,
             票结清 / 作废后这张卡再露出来。 -->
        <view v-if="receiptWriteFailure && !activeSession" class="mx-4 rounded-2xl text-center nx-step-in" :style="receiptFailureCardStyle">
          <text class="block" :style="centerTitleStyle">{{ t.errors.billMissingTitle }}</text>
          <text class="block" style="margin-top: 6px; font-size: 12px; line-height: 1.5; color: var(--v5-ink-3)">{{ t.errors.billMissingMsg }}</text>
          <view class="inline-flex items-center justify-center active:opacity-80" :style="doneBtnStyle" role="button" tabindex="0" style="margin-top: 16px" :aria-disabled="receiptRetrying" @click.stop="retryReceiptWrite">
            <text>{{ receiptRetrying ? t.store.catalogLoadingTitle : t.store.catalogRetry }}</text>
          </view>
        </view>

        <!-- === select-payment === -->
        <view v-else-if="step === 'select-payment'" class="mx-4 rounded-2xl overflow-hidden nx-step-in" :style="surfaceCardStyle">
          <view class="border-b" :style="payHeadStyle">
            <view class="flex items-center justify-between">
              <text style="font-size: 13px; color: var(--v5-ink-3)">{{ t.store.coTotal }}</text>
              <text class="tabular-nums" :style="payTotalStyle">${{ netPriceText }}</text>
            </view>
            <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px">{{ paybackLine }}</text>
            <!-- FEAT-TRIAL02: conversion credit chips (promo + accrued credit) -->
            <view v-if="promoDiscount > 0" class="flex items-center" style="gap: 5px; margin-top: 6px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
              <text style="font-size: 12px; color: var(--v5-tech-cyan)">{{ promoRowLabel }} −${{ promoDiscountText }}</text>
            </view>
            <view v-if="trialOffsetView.offsetUSD > 0" class="flex items-center" style="gap: 5px; margin-top: 6px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 7v5l3.5 2" /></svg>
              <text style="font-size: 12px; color: var(--v5-tech-cyan)">{{ t.store.coRowTrialOffset }} −${{ trialOffsetText }}</text>
            </view>
            <text v-if="trialZeroDue" class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 6px; text-wrap: pretty">{{ t.store.coTrialZeroNote }}</text>
            <view v-if="hasVoucher" class="flex items-center" style="gap: 5px; margin-top: 6px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v14" /></svg>
              <text style="font-size: 12px; color: var(--v5-brand)">{{ t.voucher.checkoutRowLabel }} −${{ voucherDiscountText }}</text>
            </view>
            <view v-else-if="expiredVoucherForSku" class="flex items-center" style="gap: 5px; margin-top: 6px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v14" /></svg>
              <text style="font-size: 12px; color: var(--v5-ink-4)">{{ t.voucher.expiredNote }}</text>
            </view>
            <!-- FEAT-DEV02:旧机抵扣行 + 移除出口(移除即恢复原价);移除后给找回入口 -->
            <view v-if="hasTradein" class="flex items-center" style="gap: 5px; margin-top: 6px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m16 12-4-4-4 4" /><path d="M12 16V8" /></svg>
              <text class="flex-1" style="font-size: 12px; color: var(--v5-success)">{{ tradeinChipText }}</text>
              <text v-if="!remoteTradeinRecoveryRequired" style="font-size: 12px; color: var(--v5-ink-3); text-decoration: underline; padding: 14px 4px 14px 14px" @click="removeTradein">{{ t.tradein.checkoutRemove }}</text>
            </view>
            <view v-else-if="removedTradein" class="flex items-center" style="gap: 5px; margin-top: 6px">
              <text style="font-size: 12px; color: var(--v5-brand); text-decoration: underline; padding: 10px 4px 10px 0" @click="reAddTradein">{{ t.tradein.checkoutReAdd }}</text>
            </view>
          </view>
          <view style="padding: 12px">
            <text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3); padding: 0 8px 8px">{{ t.store.coPaymentMethod }}</text>
            <view
              v-for="m in PAYMENT_METHODS"
              :key="m.id"
              class="w-full flex items-center rounded-xl border active:opacity-90"
              :style="methodRowStyle(payment === m.id)"
              role="button"
              tabindex="0"
              @click.stop="selectPayment(m.id)"
            >
              <view class="grid place-items-center shrink-0" :style="methodIconStyle(payment === m.id)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="payment === m.id ? 'var(--v5-brand)' : 'var(--v5-ink-3)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="m.iconPath" /><template v-if="m.iconPath2"><path :d="m.iconPath2" /></template></svg>
              </view>
              <view class="flex-1 min-w-0">
                <text class="block" style="font-size: 13px; font-weight: 500; color: var(--v5-ink)">{{ m.label }}</text>
                <text class="block" style="font-size: 12px; color: var(--v5-ink-3)">{{ m.hint }}</text>
              </view>
              <svg v-if="payment === m.id" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M20 6 9 17l-5-5" /></svg>
            </view>
          </view>
          <view class="border-t" :style="payFootStyle">
            <view v-if="capped" class="flex items-start rounded-lg" :style="cappedNoteStyle">
              <text style="margin-top: 1px">⚠</text>
              <text class="flex-1" style="margin-left: 6px">{{ slotsFullText }}</text>
            </view>
            <view class="w-full grid place-items-center active:opacity-90 active:scale-[0.98]" :style="primaryBtnStyle" role="button" tabindex="0" :aria-label="t.store.coContinue" @click.stop="goConfirm">
              <text @click.stop="goConfirm">{{ t.store.coContinue }}</text>
            </view>
            <!-- Explicit exit before any commitment — ghost weight (conversion Cancel must
                 stay visibly weaker than the primary CTA); goes back to the product. -->
            <view class="w-full grid place-items-center active:opacity-70" :style="ghostCancelStyle" role="button" tabindex="0" :aria-label="t.store.coCancel" @click.stop="cancelCheckout">
              <text>{{ t.store.coCancel }}</text>
            </view>
          </view>
        </view>

        <!-- === confirm === -->
        <view v-else-if="step === 'confirm'" class="mx-4 rounded-2xl nx-step-in" :style="confirmCardStyle">
          <text class="block font-mono-tabular" style="font-size: 13px; color: var(--v5-ink-3)">{{ t.store.coReviewOrder }}</text>
          <view style="margin-top: 12px">
            <CheckoutRow :label="t.store.coRowProduct" :value="product.name" />
            <CheckoutRow :label="t.store.coRowQuantity" value="1" />
            <CheckoutRow :label="t.store.coRowPayment" :value="paymentLabel" />
            <CheckoutRow :label="t.store.coRowShipping" :value="t.store.coShippingValue" />
            <!-- Subtotal revealed when any deduction applies (to anchor the
                 discount rows) or when a card fee applies. -->
            <CheckoutRow v-if="hasVoucher || isCard || hasTradein || trialConversionMode" :label="t.store.coRowSubtotal" :value="`$${priceText}`" />
            <CheckoutRow v-if="promoDiscount > 0" :label="promoRowLabel" :value="`−$${promoDiscountText}`" />
            <CheckoutRow v-if="trialOffsetView.offsetUSD > 0" :label="t.store.coRowTrialOffset" :value="`−$${trialOffsetText}`" />
            <CheckoutRow v-if="hasVoucher" :label="t.voucher.checkoutRowLabel" :value="`−$${voucherDiscountText}`" />
            <CheckoutRow v-if="hasTradein" :label="t.tradein.checkoutRowLabel" :value="`−$${tradeinCreditText}`" />
            <CheckoutRow v-if="isCard" :label="fmt(t.store.coRowCardFee, { rate: cardFeeRateLabel() })" :value="`$${cardFeeText}`" />
            <CheckoutRow v-else :label="t.store.coRowNetworkFee" :value="t.store.coFeeFree" />
            <view style="height: 1px; background: var(--v5-border); margin: 4px 0" />
            <CheckoutRow :label="t.store.coRowTotal" :value="`$${confirmTotalText}`" big />
            <!-- 异常4: $0 due keeps the explicit confirm; surplus never refunds -->
            <text v-if="trialZeroDue" class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 6px; text-wrap: pretty">{{ t.store.coTrialZeroNote }}</text>
          </view>
          <view class="w-full grid place-items-center active:opacity-90 active:scale-[0.98]" :style="confirmCtaStyle" role="button" tabindex="0" :aria-label="isCard ? t.store.coContinueToPayment : t.store.coPayNow" @click.stop="onConfirmPay">
            <text @click.stop="onConfirmPay">{{ isCard ? t.store.coContinueToPayment : t.store.coPayNow }}</text>
          </view>
          <view class="w-full grid place-items-center active:bg-[var(--v5-surface-3)]" :style="changePayBtnStyle" role="button" tabindex="0" :aria-label="t.store.coChangePayment" @click.stop="goSelectPayment">
            <text @click.stop="goSelectPayment">{{ t.store.coChangePayment }}</text>
          </view>
        </view>

        <!-- === pay-instructions === -->
        <view v-else-if="step === 'pay-instructions'" class="mx-4 nx-step-in">
          <CardPayment v-if="isCard" :amount="netPrice" @complete="goAwaiting" @cancel="goConfirm" />
          <ChainPayment v-else-if="activeSession" :session="activeSession" @complete="goAwaiting" @cancel="onChainCancel" @restart="onChainRestart" />
        </view>

        <!-- === awaiting === -->
        <view v-else-if="step === 'awaiting'" class="mx-4 rounded-2xl text-center nx-step-in" :style="centerCardStyle">
          <view v-if="!remoteOrderFailure" class="mx-auto grid place-items-center nx-spin" :style="spinnerWrapStyle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          </view>
          <text class="block" :style="centerTitleStyle">{{ remoteOrderFailure ? t.tradein.errPurchaseFailed : t.store.coAwaiting }}</text>
          <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3); line-height: 1.4; padding: 0 8px">{{ remoteOrderFailure ? orderStatusText(t.orders, remoteOrderFailure) : remoteApiEnabled ? t.store.coAwaitingServer : isCard ? t.store.coAwaitingCard : t.store.coAwaitingChain }}</text>
          <view v-if="remoteApiEnabled && remoteOrderPollError && !remoteOrderFailure" class="inline-flex items-center justify-center active:opacity-80" :style="doneBtnStyle" role="button" tabindex="0" style="margin-top: 14px" @click.stop="restartRemoteOrderPolling">
            <text>{{ t.store.coRetryStatus }}</text>
          </view>
          <view v-if="orderId" class="inline-flex items-center justify-center active:opacity-80" :style="doneBtnStyle" role="button" tabindex="0" style="margin-top: 14px" :aria-label="t.store.coTrackOrder" @click.stop="goTrack">
            <text>{{ t.store.coTrackOrder }}</text>
          </view>
        </view>

        <!-- === confirmed === -->
        <view v-else-if="step === 'confirmed'" class="mx-4 rounded-2xl text-center relative overflow-hidden nx-pop-in" :style="centerCardStyle">
          <template v-if="firstOrderCelebrating">
            <view aria-hidden :style="celebrateGlowStyle" />
            <view class="relative">
              <view class="mx-auto grid place-items-center nx-pop-in" :style="medalStyle">
                <text style="font-size: 26px">🏅</text>
              </view>
              <text class="block" :style="centerTitleStyle" style="margin-top: 12px">{{ t.store.firstOrderTitle }}</text>
              <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-2); line-height: 1.4">{{ t.store.firstOrderBody }}</text>
              <view class="inline-flex items-center justify-center" style="margin-top: 8px; gap: 4px; font-size: 12px; color: var(--v5-brand)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.94 14.34 12 22l2.06-7.66L22 12l-7.94-2.34L12 2 9.94 9.66 2 12z" /></svg>
                <text>{{ t.store.firstOrderAchievement }}</text>
              </view>
            </view>
          </template>
          <template v-else>
            <view class="mx-auto grid place-items-center" :style="spinnerWrapStyle">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </view>
            <text class="block" :style="centerTitleStyle" style="color: var(--v5-brand)">{{ t.store.coPaymentConfirmed }}</text>
            <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ t.store.coConfirmedSub }}</text>
          </template>
        </view>

        <!-- === activating === -->
        <view v-else-if="step === 'activating'" class="mx-4 rounded-2xl text-center nx-step-in" :style="centerCardStyle">
          <view class="mx-auto grid place-items-center nx-spin" :style="spinnerWrapStyle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          </view>
          <text class="block" :style="centerTitleStyle">{{ t.store.coActivating }}</text>
          <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3)">{{ activatingSubText }}</text>
          <view class="mx-auto rounded-full overflow-hidden" style="margin-top: 16px; max-width: 200px; height: 6px; background: var(--v5-surface-2)">
            <view class="h-full nx-progress-fill" style="background: var(--v5-brand)" />
          </view>
          <view v-if="orderId" class="inline-flex items-center justify-center active:opacity-80" :style="doneBtnStyle" role="button" tabindex="0" style="margin-top: 16px" :aria-label="t.store.coTrackOrder" @click.stop="goTrack">
            <text>{{ t.store.coTrackOrder }}</text>
          </view>
        </view>

        <!-- === live === -->
        <view v-else-if="step === 'live'" class="mx-4 rounded-2xl text-center nx-pop-in" :style="liveCardStyle">
          <view class="mx-auto grid place-items-center" :style="liveSpinnerWrapStyle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
          </view>
          <text class="block" :style="liveTitleStyle">{{ t.store.coOrderPlaced }}</text>
          <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3); line-height: 1.45; padding: 0 4px">{{ orderPlacedBody }}</text>
          <view class="flex" style="margin-top: 20px; gap: 8px">
            <view class="flex-1 grid place-items-center active:opacity-90" :style="trackBtnStyle" role="button" tabindex="0" :aria-label="t.store.coTrackOrder" @click.stop="goTrack">
              <text @click.stop="goTrack">{{ t.store.coTrackOrder }}</text>
            </view>
            <view class="grid place-items-center active:opacity-80" :style="doneBtnStyle" role="button" tabindex="0" :aria-label="t.store.coDone" @click.stop="goStore">
              <text @click.stop="goStore">{{ t.store.coDone }}</text>
            </view>
          </view>
        </view>
      </template>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, type CSSProperties } from "vue";
import { onHide, onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import CheckoutRow from "@/components/store/checkout-row.vue";
import ChainPayment from "@/components/store/chain-payment.vue";
import CardPayment from "@/components/store/card-payment.vue";
import { useT } from "@/i18n/use-t";
import { deviceName } from "@/lib/device-copy";
import { fmt } from "@/i18n/format";
import { cardFeeRateLabel, cardFeeUsd } from "@/store/deposits-core";
import { getProduct, type Product } from "@/mock/products";
import { computeTradeInCredit, DEFAULT_TRADEIN_CONFIG } from "@/mock/tradein-config";
import { isDeviceTaskBlocked } from "@/mock/eligibility";
import { getMonthsSince, tradeInEarlyWindowOk } from "@/store/product-phase";
import { useProductPhase } from "@/composables/use-product-phase";
import { voucherAppliesToSku } from "@/mock/vouchers";
import { useApp } from "@/store/app";
import { useOrders, type Order, type OrderStatus } from "@/store/orders";
import { orderStatusText } from "@/components/store/order-status-copy";
import { useAuth } from "@/store/auth";
import { readAccountRow, writeAccountRow } from "@/store/account-scoped-storage";
import { postMoneyBill, postReceiptOnce, postReceiptOnly, reportStuckFunds, type ReceiptDraft } from "@/lib/money-receipt";
import { useVoucher } from "@/store/voucher";
import { useTradeinSheet } from "@/store/tradein-sheet";
import type { PurchaseEligibilitySnapshot } from "@/api/purchase-eligibility-api";
import { trialReservesSlotNow, useFreeTrial } from "@/store/free-trial";
import { useTrialConfig, computeDiscountedPrice, computeTrialOffset } from "@/store/trial-config";
import { resolveTrialAt, accruedShadow } from "@/store/trial-boundary";
import { mockServerNow } from "@/store/server-time";
import { useDeviceEligibility } from "@/composables/use-device-eligibility";
import { usePurchaseGate } from "@/composables/use-purchase-gate";
import { useSetPageHeader } from "@/composables/use-page-header";
import { navBack, navTo } from "@/lib/route";
import type { DeviceKind } from "@/store/types";
import { confirm, toast, useUI } from "@/store/ui";
import { commercePaymentApi, deviceE3Api, mockFundsEnabled, orderApi, purchaseEligibilityApi, remoteApiEnabled } from "@/api/runtime";
import { isCanonicalPaidOrder } from "@/api/order-readback";
import { asApiError } from "@/api/errors";
import { resolvePurchaseEligibilityMessage } from "@/lib/purchase-eligibility-copy";
import { completeVerifiedMutation, handleNoActiveDeviceDecision, RemoteCapacityGate, StableCommandKey } from "@/domain/e20-capacity-coordinator";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { productCatalogState, refreshProductCatalog } from "@/store/product-catalog";
import { refreshServerProductPhase } from "@/store/server-product-phase";
import { isProductAvailable } from "@/store/product-availability";
import { usePendingCheckout } from "@/store/pending-checkout";
import { formatCountdown, PENDING_CHECKOUT_WINDOW_MIN, reconcileInvoiceQuote, type PendingCheckoutMethod, type PendingCheckoutSession } from "@/store/pending-checkout-core";

// cap applies to ACTIVE slots, not inventory (source Sprint #146-1).
const MAX_DEVICES = 6;

type Step =
  | "select-payment"
  | "confirm"
  | "pay-instructions"
  | "awaiting"
  | "confirmed"
  | "activating"
  | "live";

interface PaymentMethod {
  id: string;
  label: string;
  hint: string;
  iconPath: string;
  iconPath2?: string;
}

const t = useT();
const app = useApp();
const auth = useAuth();
const orders = useOrders();
const voucher = useVoucher();

// wallet icon path (lucide Wallet), credit-card path
// 平台支付收窄裁决:USDT 三网络 + 卡。
const WALLET_PATH = "M21 12V7H5a2 2 0 0 1 0-4h14v4";
const WALLET_PATH2 = "M3 5v14a2 2 0 0 0 2 2h16v-5";
const PAYMENT_METHODS = computed<PaymentMethod[]>(() => {
  if (mockFundsEnabled) {
    return [{ id: "sandbox-wallet", label: t.value.store.coSandboxWallet,
      hint: t.value.store.coHintSandboxWallet, iconPath: WALLET_PATH, iconPath2: WALLET_PATH2 }];
  }
  const methods: PaymentMethod[] = [
    { id: "usdt-trc20", label: "USDT (TRC20)", hint: t.value.store.coHintTrc20, iconPath: WALLET_PATH, iconPath2: WALLET_PATH2 },
    { id: "usdt-bep20", label: "USDT (BEP20)", hint: t.value.store.coHintBep20, iconPath: WALLET_PATH, iconPath2: WALLET_PATH2 },
    { id: "usdt-erc20", label: "USDT (ERC20)", hint: t.value.store.coHintErc20, iconPath: WALLET_PATH, iconPath2: WALLET_PATH2 },
  ];
  // The current hosted card vault emits mock tokens. Keep Card strictly inside
  // the isolated frontend mock; production cannot advertise a route the server
  // intentionally rejects.
  if (!remoteApiEnabled) methods.push({ id: "card", label: "Card",
    hint: fmt(t.value.store.coCardHint, { rate: cardFeeRateLabel() }),
    iconPath: "M2 5h20a0 0 0 0 1 0 0v14a0 0 0 0 1 0 0H2a0 0 0 0 1 0 0V5a0 0 0 0 1 0 0z M2 10h20" });
  return methods;
});

const tradein = useTradeinSheet();
// 上架节奏门判定与商城正门同源(含 demo pin)。
const phase = useProductPhase();

// ─── 待支付会话(链上付款的「发票」)───────────────────────────────────────
// 进扫码步开票(金额 / 地址 / 截止冻结),用户离开再回来仍是同一笔;到点作废。
// 本页只持有「正在展示的那张」;持久与账号隔离在 store。
const pending = usePendingCheckout();
const activeSession = ref<PendingCheckoutSession | null>(null);
let resumeSessionId: string | null = null;
// 页面卸载后禁止任何「等弹框回来再动状态」的路径继续执行(弹框是全局层,页面死了它还活着)。
let pageAlive = true;
let dialogsOpen = 0;
// 本页开的确认框都带这个 owner:卸载 / 换号时只收自己的,不碰别人排队中的框。
const dialogOwner = `checkout:${mintDialogOwner()}`;
function mintDialogOwner(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const productId = ref("stellarbox-s1");
const remotePurchaseEligibility = ref<PurchaseEligibilitySnapshot | null>(null);
const remotePurchaseEligibilityStatus = ref<"idle" | "loading" | "ready" | "error">("idle");

async function refreshPurchaseEligibility(): Promise<boolean> {
  if (!remoteApiEnabled) return !purchaseGate.value.blocked;
  remotePurchaseEligibilityStatus.value = "loading";
  try {
    const snapshot = await purchaseEligibilityApi.get(productId.value);
    remotePurchaseEligibility.value = snapshot;
    remotePurchaseEligibilityStatus.value = "ready";
    return snapshot.eligible;
  } catch {
    remotePurchaseEligibility.value = null;
    remotePurchaseEligibilityStatus.value = "error";
    return false;
  }
}

function remotePurchaseEligibilityFailureCopy(): string {
  switch (resolvePurchaseEligibilityMessage(
    remotePurchaseEligibilityStatus.value,
    remotePurchaseEligibility.value,
  )) {
    case "quotaDepleted": return t.value.store.gateSoldOutToast;
    case "ineligible": return t.value.store.gateBlockedToast;
    default: return t.value.store.purchaseEligibilityError;
  }
}

function purchaseEligibilityFailureCopy(): string {
  if (remoteApiEnabled) return remotePurchaseEligibilityFailureCopy();
  return purchaseGate.value.soldOut
    ? t.value.store.gateSoldOutToast
    : t.value.store.gateBlockedToast;
}

onLoad(async (options) => {
  const o = (options || {}) as Record<string, string>;
  // accept ?product= (canonical) or ?id= (per task spec)
  if (o.product) productId.value = o.product;
  else if (o.id) productId.value = o.id;
  resumeSessionId = o.resume || null;
  const [catalogReady] = await Promise.all([
    refreshProductCatalog(true),
    refreshServerProductPhase(true),
  ]);
  // Remote 商品授权只取 catalog.available；H1 节奏镜像失败不能跳过商城发布门。
  if (!catalogReady) return;
  // 上架节奏门(FEAT-DEV02b,深链防线,先于购买门):未正式上架 SKU 仅当
  // 「携置换上下文 + 抢先购窗口(开关默认关)」才放行;商城正门不受抢先购影响。
  const pp = getProduct(productId.value);
  // 三道跳转门任一命中且带 ?resume=:这张票在这个 SKU 上暂时付不了。**不销毁**它 —— 用户可能已经按地址转账,
  // 静默删票 = 地址与金额从本地消失、资金孤儿化(审计 R9 P1;R3 曾为断「浮动条→门→弹回」循环而删票,方向反了)。
  // 处置:票保留在册,明确告知「待支付订单已保留 / 已转账请联系客服」;到点自然作废,或用户从扫码步取消。
  const dropResumeInvoice = () => {
    if (!resumeSessionId) return;
    if (pending.get(resumeSessionId)?.productId === productId.value) toast.warn(t.value.store.pendingResumeBlocked);
    resumeSessionId = null;
  };
  if (pp?.purchaseBlocked) {
    dropResumeInvoice();
    uni.showToast({ title: t.value.store.specUnavailable, icon: "none" });
    navTo("/store");
    return;
  }
  if (pp && !isProductAvailable(pp, phase.value)) {
    const viaTradeIn = tradein.appliedTradein?.targetKind === pp.id;
    const mockEarlyWindow = pp.available === undefined && pp.unlocksAtPhase
      && viaTradeIn && tradeInEarlyWindowOk(pp.unlocksAtPhase, getMonthsSince(app.user.joinedAt));
    if (!mockEarlyWindow) {
      dropResumeInvoice();
      uni.showToast({ title: t.value.store.releaseComingToast, icon: "none" });
      navTo("/store");
      return;
    }
  }
  // Hard purchase gate (等级门/锁额): refuse checkout for ineligible / sold-out
  // SKUs — deep-link defense (store cards & detail already redirect blocked users
  // to /team/quota). Server re-checks on POST /api/orders (server-canonical).
  if (!(await refreshPurchaseEligibility())) {
    dropResumeInvoice();
    uni.showToast({
      title: purchaseEligibilityFailureCopy(),
      icon: "none",
    });
    navTo("/pages/team/quota");
    return;
  }
  // Resuming a pending session (floating bar / collision "continue that one")
  // is not a new checkout: no trade-in intercept, straight back to the pay step.
  if (resumeSessionId && resumePendingSession(resumeSessionId)) return;
  // Trade-in intercept must run AFTER productId resolves (so the eligibility
  // composable gets the real device kind). onLoad fires before onMounted in
  // uni pages, so this is the single earliest point the kind is known.
  fireTradeinIntercept();
});

const catalogStatus = computed(() => productCatalogState.status);
const product = computed<Product | undefined>(() => getProduct(productId.value));
const purchaseUnavailable = computed(() => product.value?.purchaseBlocked === true);
// Hard purchase gate (等级门 + 锁额) — single source via usePurchaseGate.
const { gate: purchaseGate } = usePurchaseGate(product);

// ─── FEAT-TRIAL02 trial conversion quote — 单一解析 ───────────────────────
// The mode derives from STORE STATE (trial ∈ active|grace ∧ this SKU is the
// trial product) — deliberately NO URL marker: a trial user reaching this
// checkout through ANY entry (trial page CTA, store grid, deep link) gets the
// credit rows, so the capability is never silently withheld; once the trial
// has ended the same link falls back to the plain flow (spec ⑥ — post-grace
// CTA is a plain purchase).
//
// 🔴 R2 P0 根治(2026-08-04):本页曾一半读 store 里未推进的原始 `status` ref
// (模式 / 促销 / 抵扣行),一半读 `liveShadow*` 的实时解析器 —— 宽限期刚过、
// 4s poll 未到的窗口里两边给出互斥答案(模式说「还能转化」而影子说「已结束」),
// 净额被拼成一个报价页从未展示过的数字并直接扣款。修法:本页所有试用派生值
// (是否适用 / 促销 / 抵扣 / 余额返还 / NEX)只有 `trialQuoteAt(now)` 一个出处
// —— 一个时间戳、一次 resolveTrialAt,其余全部从这次解析结果派生;本页任何位置
// 都不再读原始 `freeTrial.status`。展示侧按 1s ticker 解析,越界后 ≤1s 自动收回
// 抵扣行;支付侧按 mockServerNow() 重解一次只用于「还能不能按这份报价成交」。
const freeTrial = useFreeTrial();
const trialCfg = computed(() => useTrialConfig().config);
// 1s ticker — the credit keeps accruing during active (display freshness).
const nowTick = ref(mockServerNow());
let trialTicker: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  trialTicker = setInterval(() => { nowTick.value = mockServerNow(); }, 1000);
});

interface TrialQuote {
  /** 该时刻试用可转化 ∧ 本单就是试用机 → 促销/抵扣行生效 */
  applied: boolean;
  promo: number;
  offsetUSD: number;
  remainderUSD: number;
  shadowNEX: number;
}
const NO_TRIAL: TrialQuote = { applied: false, promo: 0, offsetUSD: 0, remainderUSD: 0, shadowNEX: 0 };

/** 单一解析:给定时刻解析一次试用状态机,派生本页全部试用金额(纯函数,零落盘)。 */
function trialQuoteAt(now: number): TrialQuote {
  const cfg = trialCfg.value;
  const r = resolveTrialAt(freeTrial.snapshot(), now, cfg);
  if ((r.status !== "active" && r.status !== "grace") || productId.value !== cfg.trialProductId) return NO_TRIAL;
  // 影子口径与 free-trial.liveShadow* 同一条规则(active 按冻结窗口累计 /
  // grace 取边界定格值),但锚在本次解析出的行上,不再各读各的时钟。
  const acc = accruedShadow(r, now, cfg);
  const split = computeTrialOffset(cfg, r.status === "active" ? acc.usd : r.shadowFrozenAtUSD);
  return {
    applied: true,
    promo: computeDiscountedPrice(cfg).discount,
    offsetUSD: split.offsetUSD,
    remainderUSD: split.remainderUSD,
    shadowNEX: r.status === "active" ? acc.nex : r.shadowFrozenAtNEX,
  };
}

/** 展示侧的那一次解析 —— 确认页渲染的每个数字都出自它。 */
const trialView = computed(() => trialQuoteAt(nowTick.value));
const trialConversionMode = computed(() => trialView.value.applied);
const promoDiscount = computed(() => trialView.value.promo);
const trialOffsetView = computed(() => trialView.value);
const promoDiscountText = computed(() => promoDiscount.value.toFixed(2));
const trialOffsetText = computed(() => trialOffsetView.value.offsetUSD.toFixed(2));
const promoRowLabel = computed(() => fmt(t.value.store.coRowTrialDiscount, { pct: (trialCfg.value.discountRate * 100).toFixed(0) }));

// ─── Voucher redemption ──────────────────────────────────────────────────
// Best claimed-unused voucher applicable to this SKU at its base price. The
// discount applies to the device subtotal; the card fee (if any) is then
// computed on the discounted subtotal. The voucher is marked used once the
// order persists (single-use). bestVoucherFor returns null when none applies.
// Stacking/性质 policy (后台可配,见 OpsVoucher): in trial conversion mode only
// stackWithTrial vouchers participate (bestVoucherFor filter — non-stackable
// ones neither appear nor apply); voucher math stays on the base price, the
// promo + trial-credit rows subtract alongside it. 不可提现 is inherent — the
// discount only reduces price, never credits the balance; 不可拆分 is inherent —
// one voucher applied whole, then markUsed.
// Real backend: redemption is server-side & atomic — the checkout sends `voucherId`
// in the POST /api/orders body; the server re-validates (claimed/unused/applicable/
// stacking) + marks it redeemed in the same transaction as order creation. The
// markUsed() below is the mock's optimistic mirror of that server effect.
const voucherMatch = computed(() => {
  const p = product.value;
  if (!p) return null;
  // Canonical E3 submit owns the complete quote and wallet debit. Client-side
  // voucher stacking is not part of that command and therefore fails closed.
  if (remoteApiEnabled && (tradein.appliedTradein?.canonicalQuote || mockFundsEnabled)) return null;
  return voucher.bestVoucherFor(p.id, p.price, trialConversionMode.value ? { stackWithTrial: true } : undefined);
});
const voucherDiscount = computed(() => voucherMatch.value?.discountUSD ?? 0);
const hasVoucher = computed(() => voucherDiscount.value > 0);
const voucherDiscountText = computed(() => voucherDiscount.value.toLocaleString());

// ─── FEAT-DEV02 旧机抵扣 ─────────────────────────────────────────────────
// retire 流(设备页下架)或本页 choice 弹层确认后,tradein.appliedTradein 携带
// {oldDeviceId, targetKind};仅当目标与本单 SKU 匹配且旧机仍在、无运行中任务时
// 生效。抵扣只减应付,永不入余额;真值 server-authoritative(POST /api/orders
// 服务端同事务复算+下架)。
const appliedTradeinView = computed(() => {
  if (!remoteApiEnabled && !DEFAULT_TRADEIN_CONFIG.enabled) return null;
  // 试用转化单不叠加旧机抵扣(规格未定义四重叠加,intercept 早就不弹);展示 / 结算两条解析路径同一条闸,
  // 别处挂进来的抵扣上下文在转化单上一律不生效(审计 R7 P1:护栏只焊在 intercept)。
  if (trialConversionMode.value) return null;
  const a = tradein.appliedTradein;
  const p = product.value;
  if (!a || !p || a.targetKind !== p.id) return null;
  const device = app.devices.find((d) => d.id === a.oldDeviceId);
  if (!device || isDeviceTaskBlocked(device)) return null;
  const quote = a.canonicalQuote;
  if (remoteApiEnabled && (!quote || quote.sourceDeviceId !== Number(device.id)
      || quote.targetProductNo !== p.id)) return null;
  const credit = quote?.discountUsdt ?? computeTradeInCredit(
      device.paidPriceUsdt ?? 0,
      Math.max(0, device.cumulativeEarningsUsdt ?? 0),
      p.price,
    );
  // canonicalQuote 只随通过了上面四道校验的视图外露:净额 / 卡费 / 容量闸都读这里,不再直读全局槽
  // (审计 R6 P1:抵扣行因设备失效消失后,总额却仍按槽里的折后价展示、卡费仍归 0)。
  return credit > 0 ? { device, credit, canonicalQuote: quote ?? null } : null;
});
/** 支付时刻用:按**本页报价快照**里的那台设备解析抵扣,不看全局槽(兄弟实例 / 报价后的变化都不影响这一单)。 */
function resolveQuotedTradeIn(): { device: (typeof app.devices)[number]; credit: number } | null {
  const p = product.value;
  if (!quotedTradeIn || !p || trialConversionMode.value) return null;
  const device = app.devices.find((d) => d.id === quotedTradeIn!.deviceId);
  if (!device || isDeviceTaskBlocked(device)) return null;
  const credit = computeTradeInCredit(device.paidPriceUsdt ?? 0, Math.max(0, device.cumulativeEarningsUsdt ?? 0), p.price);
  return credit > 0 ? { device, credit } : null;
}
const tradeinCredit = computed(() => appliedTradeinView.value?.credit ?? 0);
const hasTradein = computed(() => tradeinCredit.value > 0);
// toFixed(2) 与其余六个抵扣展示面统一(strip/弹层/横幅均两位小数)。
const tradeinCreditText = computed(() => tradeinCredit.value.toFixed(2));
const tradeinChipText = computed(() => {
  const ti = appliedTradeinView.value;
  if (!ti) return "";
  return fmt(t.value.tradein.checkoutCreditChip, {
    name: deviceName(t.value, ti.device),
    credit: tradeinCreditText.value,
  });
});
const removedTradein = ref(false);
function removeTradein() {
  if (remoteApiEnabled && remoteTradeinRecoveryRequired.value) {
    toast.warn(t.value.tradein.errPleaseRetry);
    return;
  }
  tradein.clearApplied();
  removedTradein.value = true;
}
// 移除后的找回入口(PR-D 债 #2:intercept 一次性,移除后本页原无恢复路径)。
function reAddTradein() {
  if (remoteApiEnabled && remoteTradeinRecoveryRequired.value) {
    toast.warn(t.value.tradein.errPleaseRetry);
    return;
  }
  removedTradein.value = false;
  interceptFired = false;
  fireTradeinIntercept();
  if (tradein.state.kind === "none") toast.warn(t.value.tradein.errPleaseRetry);
}

const netPrice = computed(() => {
  const canonical = remoteApiEnabled ? appliedTradeinView.value?.canonicalQuote ?? null : null;
  if (canonical) return canonical.payableUsdt;
  return Math.max(
    0,
    +(
      ((product.value?.price ?? 0) -
        voucherDiscount.value -
        tradeinCredit.value -
        promoDiscount.value -
        trialOffsetView.value.offsetUSD)
    ).toFixed(2),
  );
});
// 异常4: credit ≥ amount due → $0 payable, the explicit confirm step stays and
// the page states the surplus is never refunded.
const trialZeroDue = computed(() => trialConversionMode.value && netPrice.value === 0);
// P2-1: if the user CLAIMED a voucher that applies to this SKU but it has expired
// (so bestVoucherFor skipped it), surface a muted "已过期" note instead of silently
// showing no discount. Only when no active voucher applies.
const expiredVoucherForSku = computed(() => {
  const p = product.value;
  if (!p || hasVoucher.value) return null;
  return voucher.expiredVouchers.some((def) => voucherAppliesToSku(def, p.id));
});

// ─── Trade-in intercept (one-shot) ───────────────────────────────────────
// FEAT-DEV02: every catalog SKU is a real DeviceKind now (v2/P2 included), so
// all device checkouts intercept. Fire on first mount only: skip when a retire
// context already targets this SKU (arrived from the devices-page flow) →
// choice (owns ≥1 retirable device) → slot-full replace → normal payment.
const KNOWN_KINDS: DeviceKind[] = [
  "phone",
  "stellarbox-s1",
  "stellarbox-pro",
  "stellarbox-pro-v2",
  "stellarrack-p1",
  "stellarrack-p2",
  "cloud-share",
];
let interceptFired = false;
const remoteCapacityGate = new RemoteCapacityGate();
watch(() => app.accountKey, () => {
  interceptFired = false;
  remoteCapacityGate.reset();
  // Checkout progress is money state owned by one account. Clear every
  // projection immediately so a late response cannot expose account A's order
  // after the session has switched to account B.
  stopRemoteOrderPolling();
  confirming = false;
  orderId.value = null;
  remoteOrderFailure.value = null;
  receiptWriteFailure.value = null;
  receiptRetrying.value = false;
  restoreReceiptRecovery();
  remoteOrderPollError.value = false;
  remoteTradeinRecoveryRequired.value = false;
  remoteOrderCommandKey.clear();
  activeSession.value = null;
  // 正开着的确认框渲染的是上一个账号的商品名与金额 —— 一并收掉。
  if (dialogsOpen > 0) useUI().clearConfirmsBy(dialogOwner);
  step.value = "select-payment";
});
function fireTradeinIntercept() {
  if (interceptFired) return;
  interceptFired = true;
  // FEAT-TRIAL02: the trial conversion checkout doesn't intercept with trade-in —
  // promo + credit + trade-in + voucher quad-stacking is undefined by spec, and
  // the conversion order is the trial device itself (slot exchange), not an
  // upgrade off an old unit. Normal (non-trial) checkouts intercept as before.
  if (trialConversionMode.value) return;
  const p = getProduct(productId.value);
  if (!p || !KNOWN_KINDS.includes(p.id as DeviceKind)) return;
  const kind = p.id as DeviceKind;
  if (tradein.appliedTradein?.targetKind === kind) return;
  if (remoteApiEnabled) {
    const requestScope = captureAccountScope();
    void Promise.all([
      deviceE3Api.eligibility(kind),
      remoteCapacityGate.resolve(
        () => deviceE3Api.capacityQuote(kind),
        () => {},
        () => isCurrentAccountScope(requestScope),
      ),
    ]).then(async ([eligibility, quote]) => {
      if (!isCurrentAccountScope(requestScope)) return;
      const sourceIds = eligibility.sources.filter((source) => source.eligible)
        .map((source) => String(source.sourceDeviceId));
      if (quote.decision === "REPLACE_REQUIRED") {
        if (eligibility.eligible && sourceIds.length > 0) {
          tradein.showChoice(kind, p.price, sourceIds);
        } else {
          tradein.showCanonicalReplace(kind, quote.payableUsdt, quote);
        }
        return;
      }
      if (quote.decision === "NO_ACTIVE_DEVICE") {
        await handleNoActiveDeviceDecision({
          notify: () => {
            if (isCurrentAccountScope(requestScope)) toast.warn(t.value.tradein.errNoActiveDevice);
          },
          refreshFleet: async () => {
            if (!isCurrentAccountScope(requestScope)) return;
            await app.refreshRemoteFleet();
          }, // best-effort:失败自吞
        });
        return;
      }
      // CAPACITY_AVAILABLE: server says the checkout is not capped; continue
      // through the ordinary server order path without opening a local sheet.
      if (eligibility.eligible && sourceIds.length > 0) {
        if (!isCurrentAccountScope(requestScope)) return;
        tradein.showChoice(kind, p.price, sourceIds);
      }
    }).catch(() => {
      if (!isCurrentAccountScope(requestScope)) return;
      toast.warn(t.value.tradein.errPleaseRetry);
    });
    return;
  }
  // Mock/demo keeps the isolated local eligibility composer.
  const { canTradeIn, tradeInSources, capped } = useDeviceEligibility(kind);
  // Local/demo mode retains its isolated composer. Remote mode above never
  // reaches browser-owned replacement or order/device writes.
  if (canTradeIn.value && tradeInSources.value.length > 0) {
    tradein.showChoice(kind, p.price, tradeInSources.value.map((d) => d.id));
    return;
  }
  if (capped.value) {
    tradein.showReplace(kind, p.price);
  }
}
// Sticky chassis nav header — back + "Checkout" title (mirrors the prototype's
// <SetPageHeader backHref={`/store/${product.id}`}/>, whose chassis Header
// resolves the route title headerTitles.storeCheckout). Getter form so backHref
// re-resolves once productId loads (onLoad). Back goes to the product detail
// page (uni: /pages/store/detail?id=) to match the source backHref, falling
// back to the store grid before the product resolves.
useSetPageHeader(() => ({
  title: t.value.headerTitles.storeCheckout,
  backHref: product.value ? `/pages/store/detail?id=${product.value.id}` : "/store",
}));

const step = ref<Step>("select-payment");
const payment = ref<string>(mockFundsEnabled ? "sandbox-wallet" : "usdt-trc20");
const orderId = ref<string | null>(null);
const remoteOrderFailure = ref<OrderStatus | null>(null);
const remoteOrderPollError = ref(false);
const CHECKOUT_RECEIPT_RECOVERY_KEY = "nexgrid-checkout-receipt-recovery-v1";
type CheckoutReceiptRecovery = { accountKey: string; draft: ReceiptDraft; orderId: string; productId?: string };
const receiptWriteFailure = ref<CheckoutReceiptRecovery | null>(null);
const receiptRetrying = ref(false);
// Re-entry guard for the confirm→pay tap (mirrors source confirmingRef) —
// prevents a double-tap from racing the step transition.
let confirming = false;
// Retries of one visible confirmation must resolve to the same server command;
// navigating back to payment selection intentionally starts a new checkout.
const remoteOrderCommandKey = new StableCommandKey();
const REMOTE_CHECKOUT_COMMANDS_KEY = "nexgrid-remote-checkout-commands-v1";
type RemoteCheckoutCommands = { commands?: Record<string, string> };
// Freeze the canonical quote and endpoint after any remote mutation attempt;
// an ambiguous-success retry must never switch from trade-in to /api/orders.
const remoteTradeinRecoveryRequired = ref(false);
// Snapshot "was empty before this checkout" BEFORE createOrder increments it.
const wasEmptyBefore = ref(orders.orders.length === 0);
const firstOrderCelebrating = ref(false);

function restoreReceiptRecovery() {
  const accountKey = orders.currentAccountKey();
  const row = readAccountRow<CheckoutReceiptRecovery>(CHECKOUT_RECEIPT_RECOVERY_KEY, accountKey);
  // 恢复行只属于它那笔结算的商品页(老行没有 productId → 兼容放行);别的商品的结算页不被它劫持。
  const diskRow = row?.accountKey === accountKey && row.orderId === row.draft?.ref
      && (!row.productId || row.productId === productId.value)
    ? row
    : null;
  // 磁盘没有行时,内存里同账号的卡**保留**:恢复行自己也可能写不进去(它与收据走同一层 storage),
  // 那张卡是用户手上唯一的补写入口,不能被一次 onShow 抹掉(审计 R6 P0)。换号 → 别人的卡才清。
  const memRow = receiptWriteFailure.value?.accountKey === accountKey ? receiptWriteFailure.value : null;
  receiptWriteFailure.value = diskRow ?? memRow;
}

function persistReceiptRecovery(failure: CheckoutReceiptRecovery) {
  receiptWriteFailure.value = failure;
  // 恢复行也写不进去 = 连补写入口都留不住:登记待对账 + 给交易号(钱与单都对,只缺凭据)。
  if (!writeAccountRow<CheckoutReceiptRecovery>(CHECKOUT_RECEIPT_RECOVERY_KEY, failure.accountKey, failure)) {
    reportStuckFunds(app.captureMoney(), failure.orderId, "receipt");
  }
}

function clearReceiptRecovery(accountKey = orders.currentAccountKey()) {
  // persist-verdict-ok: 清不掉最多让卡多露一次;补写走 postReceiptOnce 按 ref 幂等,不会写出第二条收据
  writeAccountRow<CheckoutReceiptRecovery | null>(CHECKOUT_RECEIPT_RECOVERY_KEY, accountKey, null);
}

function retryReceiptWrite() {
  const failure = receiptWriteFailure.value;
  if (!failure || receiptRetrying.value) return;
  if (failure.accountKey !== orders.currentAccountKey()) {
    restoreReceiptRecovery();
    return;
  }
  receiptRetrying.value = true;
  try {
    if (!postReceiptOnce(failure.draft)) return; // 按 ref 幂等:恢复行清不掉再点一次也不会写出第二条
    receiptWriteFailure.value = null;
    clearReceiptRecovery(failure.accountKey);
    // 补写成功接续的是那笔已成交的订单;本页若还持有一张新开的发票,不能让它绕过咽喉活成孤儿票。
    dropActiveSession();
    orderId.value = failure.orderId;
    step.value = "activating";
  } finally {
    receiptRetrying.value = false;
  }
}

const isCard = computed(() => payment.value === "card");
const reservedSlots = computed(() => (trialReservesSlotNow() ? 1 : 0));
const cappedRaw = computed(() => app.activeSlotCount + reservedSlots.value >= MAX_DEVICES);
// Conversion order = the trial's own reserved slot converts into the real
// device (slot exchange) — don't scare the user with a slots-full warning that
// counts the very slot this purchase frees (only warn when real actives cap).
const capped = computed(() =>
  trialConversionMode.value ? app.activeSlotCount >= MAX_DEVICES : cappedRaw.value,
);

// ── derived text ──
const priceText = computed(() => (product.value?.price ?? 0).toLocaleString());
// Header "Total" = device price after voucher (still excludes card fee, matching
// the pre-voucher convention). Card fee is computed on the discounted subtotal.
const netPriceText = computed(() => netPrice.value.toLocaleString());
// 算法也单源:整数域(cent × bps)与入金同一套。浮点直乘再 toFixed 会在半分边界
// 被 IEEE754 压低一分(实测 14 个金额少收 1 分),同一笔费率两种算法两个答案。
const cardFee = computed(() => (remoteApiEnabled && appliedTradeinView.value?.canonicalQuote
  ? 0 : isCard.value ? cardFeeUsd(netPrice.value) : 0));
const cardFeeText = computed(() => cardFee.value.toLocaleString());
const confirmTotalText = computed(() => (netPrice.value + cardFee.value).toLocaleString());
const paymentLabel = computed(() => PAYMENT_METHODS.value.find((m) => m.id === payment.value)?.label ?? "");
const paybackLine = computed(() => {
  const p = product.value;
  if (!p) return "";
  return fmt(t.value.store.coEstPayback, {
    days: Math.round(p.price / p.dailyEarn),
  });
});
const slotsFullText = computed(() => fmt(t.value.store.coSlotsFull, { max: MAX_DEVICES }));
const activatingSubText = computed(() => {
  const p = product.value;
  const dc = p?.tier === "Flagship" ? t.value.store.coDcFrankfurt : t.value.store.coDcSingapore;
  return fmt(t.value.store.coActivatingSub, { dc });
});
const orderPlacedBody = computed(() => fmt(t.value.store.coOrderPlacedBody, { name: product.value?.name ?? "" }));

// ── stepper ──
const stepLabels = computed(() => [
  { key: "select-payment", label: t.value.store.coStepPayment },
  { key: "confirm", label: t.value.store.coStepConfirm },
  { key: "pay-instructions", label: t.value.store.coStepPay },
  { key: "activating", label: t.value.store.coStepActivate },
  { key: "live", label: t.value.store.coStepLive },
]);
const stepDisplay = computed(() => {
  if (step.value === "awaiting" || step.value === "confirmed") return 2;
  const idx = stepLabels.value.findIndex((s) => s.key === step.value);
  return idx < 0 ? 0 : idx;
});

function selectPayment(id: string) {
  payment.value = id;
}

function goConfirm() {
  if (purchaseUnavailable.value) {
    toast.warn(t.value.store.specUnavailable);
    navTo("/store");
    return;
  }
  if (step.value === "pay-instructions" || step.value === "confirm") {
    step.value = "confirm";
    return;
  }
  if (step.value !== "select-payment") return;
  const hasCanonicalTradein = Boolean(appliedTradeinView.value?.canonicalQuote);
  if (remoteApiEnabled && !remoteCapacityGate.canConfirm(hasCanonicalTradein)) {
    toast.warn(t.value.tradein.errPleaseRetry);
    return;
  }
  step.value = "confirm";
}

function goSelectPayment() {
  // Remote retries keep the same server command key even if the user revisits
  // payment selection after a transient readback failure. A new key is minted
  // only after the previous command has been durably verified and committed.
  if (!remoteApiEnabled) remoteOrderCommandKey.clear();
  step.value = "select-payment";
}

async function goAwaiting() {
  if (step.value !== "pay-instructions") return;
  // A dead invoice can never be "completed" (component hides the button; this is the second gate).
  if (activeSession.value && !pending.isLive(activeSession.value)) return;
  // 别处(另一个页面实例 / 标签页)已结算或取消了这张票 → 本页不能再推进它(先回灌再判)。
  if (activeSession.value) pending.refreshFromDisk();
  if (activeSession.value && !pending.get(activeSession.value.id)) {
    toast.warn(t.value.store.pendingSettledElsewhere);
    dropActiveSession();
    goConfirm();
    return;
  }
  // Explicit local-sandbox payment is a server command: only the backend may
  // debit the run-scoped sandbox wallet and issue the durable payment number.
  // Remote/production deliberately remains provider-backed and never falls
  // back to this mock rail.
  if (mockFundsEnabled) {
    const orderNo = orderId.value;
    if (!orderNo) {
      step.value = "confirm";
      toast.warn(t.value.tradein.errPurchaseFailed);
      return;
    }
    try {
      const account = auth.accountId;
      const receipt = await commercePaymentApi.confirm(orderNo, `payment:${orderNo}`);
      if (account !== auth.accountId || receipt.orderNo !== orderNo) return;
      step.value = "awaiting";
      restartRemoteOrderPolling();
    } catch {
      step.value = "confirm";
      toast.warn(t.value.tradein.errPurchaseFailed);
    }
    return;
  }
  step.value = "awaiting";
}

// FEAT-TRIAL02 quote snapshot: what the user committed to on the confirm step.
// 快照 = 确认页此刻渲染的那一次解析(trialView),不是「支付时再算一遍」的第二份
// 数字 —— 扣款金额只认这份快照(展示与扣款同源);支付时刻的重新解析只用来决定
// 「还能不能按这份报价成交」,不能就拒单回报价步(grace 可能在结账途中到点,全局
// 4s TRIAL_TICK 不会停),绝不改数字静默扣款。
let trialQuote: TrialQuote = NO_TRIAL;
/** 确认页展示过的应付总额(净额 + 卡费)—— 实际扣款不得超过它。 */
let quotedTotal = 0;
// Voucher context joins the quote snapshot (audit P1): the confirmed step used
// to LIVE-read voucherMatch — a voucher expiring/being redeemed mid-checkout
// silently charged the un-discounted price the confirm step never showed.
let voucherQuote: { id: string | null; discount: number } = { id: null, discount: 0 };
// Trade-in context the confirm step actually showed (or the invoice recorded). A device that only
// becomes eligible after the quote must NOT be retired at pay time — the user never saw that row
// (审计 R3 P1:确认页无抵扣行、发票按全价开,支付瞬间设备任务结束 → 抵扣现算生效 → 静默下架一台)。
let quotedTradeIn: { deviceId: string } | null = null;
/** 上一次结算尝试里核销了却没放回的券 id(storage 抖动);下一次尝试开头先补放回。 */
let pendingVoucherRelease: string | null = null;

async function onConfirmPay() {
  if (confirming || step.value !== "confirm") return;
  confirming = true;
  trialQuote = trialView.value;
  quotedTotal = +(netPrice.value + cardFee.value).toFixed(2);
  voucherQuote = { id: voucherMatch.value?.def.id ?? null, discount: voucherDiscount.value };
  quotedTradeIn = appliedTradeinView.value ? { deviceId: appliedTradeinView.value.device.id } : null;
  if (remoteApiEnabled) {
    // Trial conversion is already a backend transaction (trial lock + wallet
    // debit + order creation). It must run before the ordinary order path;
    // otherwise an explicit local-sandbox session would create a second,
    // permanently pending order and never close the trial.
    if (trialQuote.applied) {
      const confirmationScope = captureAccountScope();
      const p = product.value;
      const payQuote = trialQuoteAt(mockServerNow());
      if (!p || !payQuote.applied) {
        confirming = false;
        toast.warn(t.value.store.coTrialQuoteChanged);
        step.value = "select-payment";
        return;
      }
      if (!Number.isFinite(quotedTotal) || quotedTotal < 0) {
        confirming = false;
        toast.warn(t.value.store.coTotalQuoteChanged);
        step.value = "select-payment";
        return;
      }
      const conversion = await freeTrial.convert(p.id, quotedTotal);
      if (!isCurrentAccountScope(confirmationScope)) return;
      confirming = false;
      if (!conversion.ok || !conversion.orderNo) {
        toast.warn(t.value.store.coTrialQuoteChanged);
        step.value = "select-payment";
        return;
      }
      if (mockFundsEnabled) {
        try {
          const readback = (await orderApi.list()).orders.find((order) => order.orderNo === conversion.orderNo);
          if (!isCurrentAccountScope(confirmationScope)) {
            confirming = false;
            return;
          }
          if (!isCanonicalPaidOrder(readback, conversion.orderNo)) {
            confirming = false;
            toast.warn(t.value.tradein.errPleaseRetry);
            step.value = "select-payment";
            return;
          }
        } catch {
          confirming = false;
          toast.warn(t.value.tradein.errPleaseRetry);
          step.value = "select-payment";
          return;
        }
      }
      orderId.value = conversion.orderNo;
      // Replace checkout with the canonical order URL. A browser refresh now
      // reloads the paid server order instead of reopening a fresh purchase.
      uni.redirectTo({ url: `/pages/store/order-detail?id=${encodeURIComponent(conversion.orderNo)}` });
      return;
    }
    await submitRemoteOrder();
    return;
  }
  // $0 due (credits cover the displayed total, 异常4) → nothing to transfer:
  // the chain QR / card form would solicit a 0-USDT payment with no executable
  // action (and a real backend would invite a 0-value on-chain transfer). All
  // money/order side effects hang on the step==='confirmed' watch below, so
  // skipping pay-instructions + awaiting is pure navigation; non-zero totals
  // keep the exact pre-existing path. 判据取快照总额,与下面扣款同一个数。
  if (quotedTotal === 0 || isCard.value) {
    step.value = quotedTotal === 0 ? "confirmed" : "pay-instructions";
    setTimeout(() => { confirming = false; }, 0);
    return;
  }
  // Chain payment = open an invoice (pending session). An older live invoice is
  // never silently replaced — the user chooses (openChainSession asks).
  // 远端档在上面的分支里已经 return;这里再钉一次:本地发票腿(伪地址 / 本地 30 分钟窗)只属于 mock 档,
  // 远端分支哪天落到公共尾巴上也不许开票 —— 否则支付步是一块空白 + 「请重试」死循环。
  if (remoteApiEnabled) { confirming = false; return; }
  const opened = await openChainSession();
  confirming = false;
  if (opened) step.value = "pay-instructions";
}

/** 恢复一张仍在窗内的发票:按发票复位报价上下文,回到扫码步。 */
function adoptSession(s: PendingCheckoutSession) {
  payment.value = s.method;
  // 🔴 信任边界:发票行来自 localStorage,任何人开 devtools 就能改。持久化的报价分项
  // (券折扣 / 试用促销与抵扣)**不能原样当扣款算术**(审计 R3 P0:篡改 voucher.discount 成 648
  // 可用 $1 买 $649 设备)。规则 = **逐项取 min(此刻现算值, 发票记录值)**:
  //   · 现算值封顶 → 发票改大没用(扣的不超过现算);
  //   · 发票值封顶 → 窗内新到的券 / 多累计的试用收益不参与这一单 —— 二维码告诉用户转 X,
  //     本单就恰好按 X 成交(支付时刻另有「实扣 = 票面」闸;审计 R4 P1:此前现算值可低于票面,
  //     QR 说转 649 却按 600 入账,差额无账目落点)。
  //   · 现算比发票少(券失效 / 试用结束 / 试用未再挂上)→ 实扣高于票面 → 支付时刻拒单重报价。
  // 发票的应付总额同时仍是「不得高于」的天花板(quotedTotal)。
  quotedTotal = s.quote.total;
  quotedTradeIn = s.quote.tradeIn;
  // 旧机抵扣上下文是内存态(离开结算页即清),凭发票记录重新挂上;抵扣额在支付瞬间
  // 由 confirmed 步按现值复算并受「不得高于确认页总额」族级闸保护。发票没有抵扣时必须
  // 清掉本页可能残留的抵扣上下文。
  if (s.quote.tradeIn) tradein.applyTradein(s.quote.tradeIn.deviceId, s.productId as DeviceKind, undefined, tradeinOwner);
  else tradein.clearApplied();
  // 逐项对账(纯函数,vitest 钉住):现算与记录值取 min;券只认「就是发票那张」。
  const reconciled = reconcileInvoiceQuote(
    { trial: trialView.value, voucher: { id: voucherMatch.value?.def.id ?? null, discount: voucherDiscount.value } },
    s.quote,
  );
  trialQuote = reconciled.trial;
  voucherQuote = reconciled.voucher;
  interceptFired = true;
  activeSession.value = s;
  pending.setViewing(s.id);
  step.value = "pay-instructions";
}

function resumePendingSession(id: string): boolean {
  pending.refreshFromDisk(); // 别的标签页可能已结算 / 取消了它 —— 先回灌再判
  const s = pending.get(id);
  if (!s || !pending.isLive(s) || s.productId !== productId.value) {
    // 票不在册 = 已在别处结算或取消;票在但过期 / 商品对不上 = 付款时间已过(重新下单)。
    toast.warn(!s ? t.value.store.pendingSettledElsewhere : t.value.store.pendingResumeGone);
    return false;
  }
  adoptSession(s);
  return true;
}

/**
 * 开票。已有一张在途发票 → 确认框二选一:confirm(true)=「放弃它,开始新的」(danger),
 * cancel / 点遮罩(false)=「继续那一笔」—— 安全默认落在保留旧单那边(用户可能已转账)。
 * 返回 true 表示本页新开了一张发票;原地恢复旧票时 step 已由 adoptSession 切好,返回 false。
 */
async function openChainSession(): Promise<boolean> {
  const p = product.value;
  if (!p) return false;
  const method = payment.value as PendingCheckoutMethod;
  // 任何一张在窗内的发票都要先问 —— 包括本页自己曾经开出的那张(支付时刻守卫回弹会把页面
  // 送回这里;发票在回弹那一刻已由 watch(step) 作废,能走到这一步说明还有一张活票就得问)。
  const existing = pending.current;
  let replaceId: string | null = null;
  if (existing) {
    dialogsOpen += 1;
    const dropOld = await confirm({
      title: t.value.store.pendingCollisionTitle,
      message: fmt(t.value.store.pendingCollisionBody, {
        name: getProduct(existing.productId)?.name ?? existing.productId,
        amount: existing.amountUsdt.toLocaleString(),
        left: formatCountdown(pending.secondsLeft(existing)),
      }),
      confirmLabel: t.value.store.pendingCollisionDrop,
      cancelLabel: t.value.store.pendingCollisionKeep,
      danger: true,
      icon: "warn",
      owner: dialogOwner,
    });
    dialogsOpen -= 1;
    // 弹框期间页面已卸载 / 离开 confirm 步(换号 / 返回)→ 什么都不做:页面死了不许再动全局态。
    if (!pageAlive || step.value !== "confirm") return false;
    // 「保留它」(含点遮罩)= 什么都不动:旧发票原样在,浮动条就在本页顶上,想回去点它即可;
    // 不在这里替用户跳页 —— 一个「关掉」手势不该把人带到另一商品的付款页。
    if (!dropOld) return false;
    replaceId = existing.id; // 与开新票同一次提交(store 内销旧开新,没有半执行窗口)
  }
  const s = pending.begin({
    productId: p.id,
    method,
    // 链上付款无卡费:要求转账的金额 = 确认页展示过的应付总额(同一份快照)。
    amountUsdt: quotedTotal,
    quote: {
      total: quotedTotal,
      voucher: { ...voucherQuote },
      trial: { ...trialQuote },
      // 与其余分项同一份确认页快照(quotedTradeIn),不是撞单确认框 await 之后的实时读数。
      tradeIn: quotedTradeIn ? { ...quotedTradeIn } : null,
    },
    replaceId,
  });
  if (!s) {
    // 远端模式 / 入参非法 / 磁盘最新行里还有别的活票(另一个标签页开的):store 已把最新行同步
    // 进内存,浮动条会露出那张票;这里只提示重试,不再铸第二张。
    toast.warn(t.value.tradein.errPleaseRetry);
    return false;
  }
  activeSession.value = s;
  pending.setViewing(s.id);
  return true;
}

/** 扫码步「取消」= 作废这张发票。确认框防误触:若已转账,销毁 = 孤儿化他的钱。 */
async function onChainCancel() {
  const s = activeSession.value;
  if (!s) { goConfirm(); return; }
  dialogsOpen += 1;
  const ok = await confirm({
    title: t.value.store.pendingCancelTitle,
    message: t.value.store.pendingCancelBody,
    confirmLabel: t.value.store.pendingCancelConfirm,
    cancelLabel: t.value.store.pendingCancelKeep,
    danger: true,
    icon: "warn",
    owner: dialogOwner,
  });
  dialogsOpen -= 1;
  if (!pageAlive || !ok || activeSession.value !== s) return;
  // 取消 = 磁盘上那张票必须真的没了;删不掉就别宣布已取消(票还在、浮动条还会催,页面若丢了引用用户就找不回它)。
  if (!pending.remove(s.id)) {
    toast.warn(t.value.tradein.errPleaseRetry);
    return;
  }
  activeSession.value = null;
  toast.info(t.value.store.pendingCancelledToast);
  goConfirm();
}

/** 超时态唯一出口:回 confirm 步重新报价,下一次「Pay now」开新票(新地址、新 30 分钟)。 */
function onChainRestart() {
  dropActiveSession();
  goConfirm();
}

function dropActiveSession() {
  const s = activeSession.value;
  if (!s) return;
  // persist-verdict-ok: 回弹 / 重开时作废本页那张票;删不掉 = 票留在磁盘,浮动条会继续露出它、用户仍能回去处理,本页只是不再展示
  pending.remove(s.id);
  activeSession.value = null;
}

/**
 * 离开结算页(返回 / 刷新前卸载):发票静默保留 —— 不弹确认框(用户可能已经转账,
 * 销毁 = 孤儿化他的钱);首次离开给一次性提示,浮动条接手提醒。
 */
function releaseSessionOnLeave() {
  const s = activeSession.value;
  if (!s) return;
  activeSession.value = null;
  if (pending.viewingId === s.id) pending.setViewing(null);
  if (pending.isLive(s) && pending.markLeftNotice(s.id)) {
    // 报的是这张票**真实**剩余分钟(与浮动条倒计时同源),不是编译期的 30(审计 R9 P1:剩 3 分钟却说保留 30 分钟)。
    toast.info(fmt(t.value.store.pendingKeptToast, { min: String(Math.max(1, Math.ceil(pending.secondsLeft(s) / 60))) }));
  }
}

function cancelCheckout() {
  navBack(product.value ? `/pages/store/detail?id=${product.value.id}` : "/store");
}

// IDEMPOTENCY-FRESH-OK: 下面 738-740 行先读**持久化**的 durable 键(readAccountRow),命中就直接返回 ——
// 这把钥匙跨 App 重启都稳,是全仓最强的一处;现铸分支只在「这个 intent 头一次」时走到。
function remoteOrderKey(): string {
  const p = product.value;
  const intent = [p?.id ?? "unknown", voucherQuote.id ?? "", payment.value,
    tradein.appliedTradein?.canonicalQuote?.sourceDeviceId ?? "ordinary"].join("|");
  const accountKey = orders.currentAccountKey();
  const persisted = readAccountRow<RemoteCheckoutCommands>(REMOTE_CHECKOUT_COMMANDS_KEY, accountKey);
  const durable = persisted?.commands?.[intent];
  if (durable) return durable;
  const key = remoteOrderCommandKey.get(() => {
    const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `h7-order:${suffix}`;
  });
  // persist-verdict-ok: 远端命令键的耐久性归远端幂等设计(页内内存键仍在;跨刷新丢键须服务端按 intent 幂等,见 HANDOFF U-21)
  writeAccountRow<RemoteCheckoutCommands>(REMOTE_CHECKOUT_COMMANDS_KEY, accountKey, {
    commands: { ...(persisted?.commands ?? {}), [intent]: key },
  });
  return key;
}

function retireRemoteOrderKey(): void {
  const p = product.value;
  const intent = [p?.id ?? "unknown", voucherQuote.id ?? "", payment.value,
    tradein.appliedTradein?.canonicalQuote?.sourceDeviceId ?? "ordinary"].join("|");
  const accountKey = orders.currentAccountKey();
  const persisted = readAccountRow<RemoteCheckoutCommands>(REMOTE_CHECKOUT_COMMANDS_KEY, accountKey);
  if (persisted?.commands?.[intent]) {
    const commands = { ...persisted.commands };
    delete commands[intent];
    // persist-verdict-ok: 退役旧键失败只会让下一次同 intent 复用旧键(服务端幂等回同一单),不铸新单
    writeAccountRow<RemoteCheckoutCommands>(REMOTE_CHECKOUT_COMMANDS_KEY, accountKey, { commands });
  }
  remoteOrderCommandKey.clear();
}

async function submitRemoteOrder(): Promise<void> {
  const submissionScope = captureAccountScope();
  const scopeIsCurrent = () => isCurrentAccountScope(submissionScope);
  const p = product.value;
  const requestedVoucherId = voucherQuote.id;
  if (!p || purchaseUnavailable.value) {
    confirming = false;
    return;
  }
  if (!(await refreshPurchaseEligibility())) {
    confirming = false;
    toast.warn(purchaseEligibilityFailureCopy());
    step.value = "select-payment";
    return;
  }
  try {
    const tradeinContext = appliedTradeinView.value;
    if (tradein.appliedTradein && !tradeinContext) {
      throw new Error("E3_TRADEIN_QUOTE_REQUIRED");
    }
    if (tradeinContext) {
      await completeVerifiedMutation({
        submit: () => {
          if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
          remoteTradeinRecoveryRequired.value = true;
          return deviceE3Api.submit(
            Number(tradeinContext.device.id),
            p.id,
            remoteOrderKey().replace("h7-order:", "e3-tradein:"),
            tradein.appliedTradein!.canonicalQuote!,
          );
        },
        readback: async (submitted) => {
          if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
          const rows = (await orderApi.list()).orders;
          if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
          return rows.find((order) => order.orderNo === submitted.orderNo);
        },
        verifyOrder(submitted, persisted) {
          if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
          if (!persisted || persisted.tradeinNo !== submitted.tradeinNo
              || persisted.sourceDeviceId !== submitted.sourceDeviceId
              || persisted.targetDeviceId !== submitted.targetDeviceId
              || persisted.canonicalStatus !== "activated"
              || persisted.paymentStatus.toUpperCase() !== "PAID"
              || persisted.orderStatus.toUpperCase() !== "COMPLETED"
              || persisted.activationStatus.toUpperCase() !== "ACTIVATED"
              || Math.abs(persisted.amountUsdt - submitted.walletDebitUsdt) > 0.000001
              || Math.abs(persisted.discountUsdt - submitted.discountUsdt) > 0.000001) {
            throw new Error("E3_TRADEIN_READBACK_MISMATCH");
          }
        },
        refreshOrders: async () => {
          if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
          await orders.refreshRemote();
          if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
        },
        // refreshRemoteFleet 自吞不 reject(resilience 门);verified mutation 靠 reject
        // 中断验证链,适配层把 false 升回 throw,保住「fleet 刷新失败 ≠ READBACK_MISMATCH」的语义。
        refreshFleet: async () => {
          if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
          if (!(await app.refreshRemoteFleet())) throw new Error("E3_FLEET_REFRESH_UNAVAILABLE");
          if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
        },
        verifyFleet(submitted) {
          if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
          const target = app.devices.find((device) => device.id === String(submitted.targetDeviceId));
          const source = app.devices.find((device) => device.id === String(submitted.sourceDeviceId));
          if (!target || target.activatedAt == null || (source && source.activatedAt != null)) {
            throw new Error("E3_TRADEIN_FLEET_READBACK_MISMATCH");
          }
        },
        commit(submitted) {
          if (!scopeIsCurrent()) return;
          orderId.value = submitted.orderNo;
          tradein.clearApplied();
          retireRemoteOrderKey();
          remoteTradeinRecoveryRequired.value = false;
          step.value = "live";
        },
      });
      return;
    }
    const created = await orderApi.create({
      productNo: p.id,
      quantity: 1,
      voucherId: requestedVoucherId,
      idempotencyKey: remoteOrderKey(),
    });
    if (!scopeIsCurrent()) return;
    const receipt = created.voucherRedemption;
    // A claimed voucher changes its UI state only after the order's explicit,
    // server-issued redemption receipt. Missing/mismatched receipts fail closed.
    if (requestedVoucherId
      ? created.voucherId !== requestedVoucherId
        || !receipt
        || receipt.voucherId !== requestedVoucherId
        || receipt.status !== "REDEEMED"
        || receipt.discountUsdt !== created.discountUsdt
      : receipt !== null) {
      throw new Error("H7_VOUCHER_REDEMPTION_RECEIPT_INVALID");
    }
    const persisted = (await orderApi.list()).orders.find((order) => order.orderNo === created.orderNo);
    if (!scopeIsCurrent()) return;
    const sandboxPaidReplay = mockFundsEnabled && persisted?.canonicalStatus === "paid"
      && persisted.paymentStatus.toUpperCase() === "PAID"
      && persisted.orderStatus.toUpperCase() === "PAID";
    if (!persisted || persisted.productNo !== p.id || persisted.quantity !== 1
        || (!sandboxPaidReplay && (persisted.canonicalStatus !== "placed"
          || persisted.paymentStatus.toUpperCase() !== "PENDING"
          || persisted.orderStatus.toUpperCase() !== "PENDING_PAYMENT"))
        || persisted.activationStatus.toUpperCase() !== (sandboxPaidReplay ? "WAITING_PROVISIONING" : "WAITING_PAYMENT")
        || created.paymentStatus.toUpperCase() !== "PENDING"
        || created.orderStatus.toUpperCase() !== "PENDING_PAYMENT"
        || Math.abs(persisted.amountUsdt - created.amountUsdt) > 0.000001
        || Math.abs(persisted.discountUsdt - created.discountUsdt) > 0.000001) {
      throw new Error("E20_CAPACITY_AVAILABLE_ORDER_READBACK_MISMATCH");
    }
    orderId.value = created.orderNo;
    remoteOrderFailure.value = null;
    remoteOrderPollError.value = false;
    if (requestedVoucherId) await voucher.refreshRemote();
    if (!scopeIsCurrent()) return;
    await orders.refreshRemote();
    if (!scopeIsCurrent()) return;
    // PENDING_PAYMENT has not created or activated a device yet. Fleet refresh
    // is authoritative only after the ACTIVATED readback below; making it part
    // of order creation turns an unrelated fleet outage into a false purchase
    // failure after the server has already committed the order.
    // Retire the durable key only after the server order readback above and
    // account-scoped order refresh both succeeded; unknown outcomes reuse it.
    if (mockFundsEnabled) {
      // The user's confirm click is the explicit payment action in
      // local-sandbox. Settlement remains entirely server-side and is accepted
      // only after both the mock provenance receipt and canonical order readback
      // agree. Production never enters this branch.
      const paymentReceipt = await commercePaymentApi.confirm(created.orderNo, `payment:${created.orderNo}`);
      if (!scopeIsCurrent()) return;
      if (paymentReceipt.orderNo !== created.orderNo) throw new Error("COMMERCE_PAYMENT_ORDER_MISMATCH");
      const paidSnapshot = await orderApi.list();
      if (!scopeIsCurrent()) return;
      const paidOrder = paidSnapshot.orders.find((order) => order.orderNo === created.orderNo);
      if (!paidOrder || paidOrder.canonicalStatus !== "paid"
          || paidOrder.paymentStatus.toUpperCase() !== "PAID"
          || paidOrder.orderStatus.toUpperCase() !== "PAID") {
        throw new Error("COMMERCE_PAYMENT_READBACK_MISMATCH");
      }
      await orders.refreshRemote();
      if (!scopeIsCurrent()) return;
      retireRemoteOrderKey();
      uni.redirectTo({ url: `/pages/store/order-detail?id=${encodeURIComponent(created.orderNo)}` });
    } else {
      // A canonical PENDING_PAYMENT receipt proves only creation. It is not
      // provisioning or activation; wait for a real provider callback/readback.
      retireRemoteOrderKey();
      step.value = "awaiting";
    }
  } catch (error) {
    if (!scopeIsCurrent()) return;
    // Keep only outcome-unknown errors: transport, malformed response, 5xx and
    // the server's explicit unknown-result fence. Structured API facts—not text
    // matching—decide whether a business rejection can mint a new attempt.
    const apiError = asApiError(error);
    const keepForReadback = apiError.kind === "network" || apiError.kind === "protocol"
      || (apiError.kind === "http" && (apiError.status ?? 0) >= 500)
      || apiError.message === "IDEMPOTENCY_RESULT_UNKNOWN";
    if (!keepForReadback) retireRemoteOrderKey();
    // No local order, balance debit, or voucher redemption mirror in remote mode.
    step.value = "confirm";
    toast.warn(t.value.tradein.errPurchaseFailed);
  } finally {
    confirming = false;
  }
}

// Remote checkout follows only the canonical server state. The recursive
// timeout is single-flight for one page epoch; hide/account changes invalidate
// late responses before they can mutate the visible checkout.
let remoteOrderPollTimer: ReturnType<typeof setTimeout> | undefined;
let remoteOrderPollEpoch = 0;
let remoteOrderPageVisible = false;

function stopRemoteOrderPolling() {
  remoteOrderPollEpoch += 1;
  if (remoteOrderPollTimer) {
    clearTimeout(remoteOrderPollTimer);
    remoteOrderPollTimer = undefined;
  }
}

function scheduleRemoteOrderPoll(requestEpoch: number, delayMs: number) {
  if (requestEpoch !== remoteOrderPollEpoch || !remoteOrderPageVisible) return;
  remoteOrderPollTimer = setTimeout(() => { void pollRemoteOrder(requestEpoch); }, delayMs);
}

async function pollRemoteOrder(requestEpoch: number) {
  const requestOrderNo = orderId.value;
  const requestAccount = auth.accountId;
  if (!remoteApiEnabled || !remoteOrderPageVisible || !requestOrderNo
      || requestEpoch !== remoteOrderPollEpoch) return;
  try {
    const snapshot = await orderApi.list();
    if (requestAccount !== auth.accountId || requestEpoch !== remoteOrderPollEpoch
        || requestOrderNo !== orderId.value || !remoteOrderPageVisible) return;
    const authoritative = snapshot.orders.find((row) => row.orderNo === requestOrderNo);
    if (!authoritative) throw new Error("REMOTE_ORDER_READBACK_NOT_FOUND");
    remoteOrderPollError.value = false;
    switch (authoritative.canonicalStatus) {
      case "placed":
        scheduleRemoteOrderPoll(requestEpoch, 5000);
        return;
      case "paid":
        step.value = "confirmed";
        return;
      case "provisioning":
        step.value = "activating";
        return;
      case "activated":
        stopRemoteOrderPolling();
        step.value = "live";
        void orders.refreshRemote().catch(() => undefined); // orders 契约保持 reject;此处纯展示刷新
        void app.refreshRemoteFleet();
        return;
      case "payment_failed":
      case "expired":
      case "provisioning_failed":
      case "refunded":
      case "chargeback":
      case "cancelled":
        remoteOrderFailure.value = authoritative.canonicalStatus;
        stopRemoteOrderPolling();
        return;
    }
  } catch {
    if (requestAccount !== auth.accountId || requestEpoch !== remoteOrderPollEpoch
        || requestOrderNo !== orderId.value || !remoteOrderPageVisible) return;
    remoteOrderPollError.value = true;
    scheduleRemoteOrderPoll(requestEpoch, 5000);
  }
}

function restartRemoteOrderPolling() {
  stopRemoteOrderPolling();
  remoteOrderPollError.value = false;
  if (!remoteApiEnabled || !remoteOrderPageVisible || !orderId.value
      || !["awaiting", "confirmed", "activating"].includes(step.value)
      || remoteOrderFailure.value) return;
  const requestEpoch = remoteOrderPollEpoch;
  scheduleRemoteOrderPoll(requestEpoch, 0);
}

// ── 抵扣上下文的页级镜像(审计 R5 P0)──
// tradein.appliedTradein 是全局单槽,而浮动条 / 绑卡返回会让两个结算页实例同时在栈上:上层实例的
// adoptSession / cleanup 会改写它。本页只在**可见**时把槽的变化收进自己的镜像(用户在本页做的选择),
// 重新可见时把镜像挂回去(P-044 页头同款「onShow 重设」),卸载时只清自己 owner 的那份(P-116 同款)。
const tradeinOwner = Symbol("checkout-tradein");
let pageVisible = true;
let tradeinMirror: NonNullable<typeof tradein.appliedTradein> | null = null;
watch(() => tradein.appliedTradein, (v) => {
  if (!pageVisible) return;
  tradeinMirror = v ? { ...v } : null;
  // 置换 sheet 写进来的是无主的:本页认领,别的实例的 owner 清法就动不了它。
  if (v && !tradein.appliedBy(tradeinOwner)) tradein.applyTradein(v.oldDeviceId, v.targetKind, v.canonicalQuote, tradeinOwner);
}, { immediate: true });
function reassertTradeinContext() {
  if (tradeinMirror) tradein.applyTradein(tradeinMirror.oldDeviceId, tradeinMirror.targetKind, tradeinMirror.canonicalQuote, tradeinOwner);
  else tradein.clearApplied(tradeinOwner);
}

onShow(() => {
  remoteOrderPageVisible = true;
  pageVisible = true;
  reassertTradeinContext();
  // 页面重新可见 → 先回灌磁盘:这张票若已在别处结算 / 取消,本页不能继续展示一张死票。
  if (activeSession.value) {
    pending.refreshFromDisk();
    if (!pending.get(activeSession.value.id) && pending.isLive(activeSession.value)) {
      toast.warn(t.value.store.pendingSettledElsewhere);
      dropActiveSession();
      if (step.value === "pay-instructions" || step.value === "awaiting") step.value = "confirm";
    } else {
      pending.setViewing(activeSession.value.id); // 它展示的那张发票不需要浮动条重复提醒
    }
  }
  void refreshServerProductPhase(true);
  void refreshProductCatalog(true);
  restoreReceiptRecovery();
  restartRemoteOrderPolling();
});
onHide(() => {
  remoteOrderPageVisible = false;
  pageVisible = false;
  // 页面被别的页压住(前向导航)时,让浮动条在上面那页露出这张发票;回来 onShow 再收起。
  if (activeSession.value && pending.viewingId === activeSession.value.id) pending.setViewing(null);
  stopRemoteOrderPolling();
});

// ── state-machine timers (mirror source useEffect auto-advance chain) ──
let advanceTimer: ReturnType<typeof setTimeout> | undefined;
function clearAdvance() {
  if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = undefined; }
}

watch(step, async (s) => {
  clearAdvance();
  // 🔴 回到报价前的步骤 = 这张发票作废(支付时刻任一守卫回弹 / 换支付方式 / 撞单放弃):
  // 发票绑的是那份报价,报价既然要重来,票就不能活着 —— 否则下一次 Pay now 会再开一张,
  // 两个地址同时催付、落单后旧票成孤儿继续拉人二次付款(独立审计 P0 族)。单一咽喉,
  // 不在十来处回弹点各写一遍。
  if ((s === "select-payment" || s === "confirm") && activeSession.value) dropActiveSession();
  // Remote checkout is a server-state machine. Never turn elapsed time into a
  // payment, provisioning, or activation result; only authoritative readback
  // may advance it. Local mock retains the guided timer demonstration.
  if (remoteApiEnabled && (s === "awaiting" || s === "confirmed" || s === "activating")) {
    restartRemoteOrderPolling();
    return;
  }
  if (s === "awaiting") {
    advanceTimer = setTimeout(() => { step.value = "confirmed"; }, 2400);
    return;
  }
  if (s === "confirmed") {
    const p = product.value;
    if (!p) return;
    // Persist order + spend bill — only ONCE per checkout (orderId guard).
    if (!orderId.value) {
      // 到点即死的发票在真正花钱的这一刻也要有判据(扫码页的守卫与这里隔着 2.4s)。
      if (activeSession.value && !pending.isLive(activeSession.value)) {
        toast.warn(t.value.store.pendingExpiredTitle);
        step.value = "select-payment";
        return;
      }
      // 上一次结算里券放回失败(storage 抖动)→ 这次先把它放回,否则下面的券一致性闸会把这一单拒回报价步、
      // 顺手销掉那张用户可能已转账的发票(审计 R10 P1:「请重试」的重试反而销票)。
      if (pendingVoucherRelease && voucher.release(pendingVoucherRelease)) pendingVoucherRelease = null;
      // ── Voucher pay-time revalidation(与 trade-in/trial 失效守卫同构)──
      // 快照里带券时,券可能在结算途中失效/被核销:live match 与确认页快照(voucherQuote)
      // 不一致 → 拒单回报价步,绝不按确认页没展示过的净额静默扣款;相等才用冻结值继续。
      // 快照里**没有券**(确认页 / 发票按全价报,或恢复发票时对账清空)→ 这一单不依赖任何券:窗内新到
      // 的券不参与、也不该把单拒掉 —— 实扣仍是用户看到的那个数(审计 R5 P1:此前 null ≠ 新券 id 就拒单,
      // 一张合法发票因为用户去领了张券而永久付不掉、还被销票)。
      if (voucherQuote.id !== null && (voucherMatch.value?.def.id ?? null) !== voucherQuote.id) {
        toast.warn(t.value.voucher.quoteChanged);
        step.value = "select-payment";
        return;
      }
      const discount = voucherQuote.discount;
      const usedVoucherId = voucherQuote.id;
      // FEAT-DEV02:先快照抵扣上下文(clearApplied 会把 computed 归零),再走
      // 扣款→下架的同步原子块。抵扣只减应付;新机由订单履约管线 addDevice
      // 未激活入库,本块不生成设备。
      // 只承认确认页(或发票)当时就有的那台抵扣设备:报价后才变得可抵扣的设备不参与,否则会按
      // 用户没见过的净额少扣、并静默下架一台确认页从未提及的设备。
      // 由本页快照解析,不读全局槽:兄弟结算页实例改了槽、或本实例在隐藏态被定时器推进,都不影响这一单
      // (审计 R6 P1:此前用槽的 targetKind 当前件,全价单被误拒并销票,还顺手清掉兄弟实例的抵扣)。
      const ti = resolveQuotedTradeIn();
      // 抵扣在支付瞬间失效(设备消失/任务开始/开关关闭)→ 拒单重报价,
      // 绝不按确认页没展示过的全价静默扣款。
      if (quotedTradeIn && !ti) {
        tradein.clearApplied(tradeinOwner);
        toast.warn(t.value.tradein.errPleaseRetry);
        step.value = "select-payment";
        return;
      }
      // 上架节奏门支付时复验(与 onLoad 同谓词):未正式上架 SKU 必须在支付
      // 瞬间仍「携有效抵扣上下文 ∧ 抢先购窗口」——堵住「过门后移除抵扣 →
      // 全价买未上架机」的旁路(对抗审查 F1)。
      if (!isProductAvailable(p, phase.value)) {
        const mockEarlyWindow = p.available === undefined && p.unlocksAtPhase
          && ti && tradeInEarlyWindowOk(p.unlocksAtPhase, getMonthsSince(app.user.joinedAt));
        if (!mockEarlyWindow) {
          toast.warn(t.value.store.releaseComingToast);
          step.value = "select-payment";
          return;
        }
      }
      // 购买门支付时复验(同构纵深):onLoad 拦截后若经返回键回到留栈实例,
      // 支付时刻仍按门拒单(对抗审查 F4b)。
      // Remote mode already refreshed the server decision at the start of this
      // submit. Do not let a stale client rank/team snapshot overrule that
      // authority; the order endpoint performs the final transactional check.
      const purchaseBlockedNow = remoteApiEnabled
        ? remotePurchaseEligibility.value?.eligible !== true
        : purchaseGate.value.blocked;
      if (purchaseBlockedNow) {
        toast.warn(purchaseEligibilityFailureCopy());
        step.value = "select-payment";
        return;
      }
      // ── FEAT-TRIAL02 支付时刻单一解析(R2 P0 根治)──
      // 一个时间戳、一次 resolveTrialAt:`applyTrial` 与全部试用金额都出自这条
      // 链,不再「模式读原始 ref、影子读解析器」拼出一个没人展示过的净额。解析
      // 说已不可转化 → 拒单回报价步重新确认(与 voucher / trade-in 守卫同构),
      // 绝不静默扣款。整段同步执行,poll 无法在守卫与 convert 之间插入。
      const payNow = mockServerNow();
      const payQuote = trialQuoteAt(payNow);
      if (trialQuote.applied && !payQuote.applied) {
        toast.warn(t.value.store.coTrialQuoteChanged);
        step.value = "select-payment";
        return;
      }
      const applyTrial = trialQuote.applied;
      // 金额一律取确认页那份报价快照(展示与扣款同源);支付时刻的解析只做闸不
      // 改数字 —— 期间多累计的影子收益按「所见即所付」让渡,绝不反向多扣。
      const promo = applyTrial ? trialQuote.promo : 0;
      const trialOffsetUSD = applyTrial ? trialQuote.offsetUSD : 0;
      const trialRemainderUSD = applyTrial ? trialQuote.remainderUSD : 0;
      const shadowNEXNow = applyTrial ? trialQuote.shadowNEX : 0;
      const tradeInCredit = ti?.credit ?? 0;
      const net = Math.max(0, +(p.price - discount - tradeInCredit - promo - trialOffsetUSD).toFixed(2));
      // Card payment charges the displayed total INCLUDING the card fee
      // (chain payments have no fee). Mock approximation of server-side PSP
      // debit — production: POST /api/orders does authorize+capture atomically.
      const fee = isCard.value ? cardFeeUsd(net) : 0;
      const chargeTotal = +(net + fee).toFixed(2);
      // 族级兜底闸:任何一项在确认页之后变差(如旧机抵扣随累计收益跌档),差额
      // 都不许静默扣到用户头上 —— 超过展示过的总额一律拒单重报价。反向(变便宜)
      // 放行:少收不伤用户,拒单反而白丢一单。
      if (chargeTotal > quotedTotal) {
        toast.warn(t.value.store.coTotalQuoteChanged);
        step.value = "select-payment";
        return;
      }
      // 链上发票按票面成交:二维码让用户转 X,本地只承认恰好 X 的结算 —— 差一分都拒单重报价
      // (审计 R4 P1:恢复发票后现算值与票面分家,QR 说 649 却按 600 入账,差额无账目落点)。
      // adoptSession 的逐项 min 规则保证正常恢复时二者恰好相等;不等 = 报价环境真变了。
      if (activeSession.value && Math.abs(chargeTotal - activeSession.value.amountUsdt) > 0.000001) {
        toast.warn(t.value.store.coTotalQuoteChanged);
        step.value = "select-payment";
        return;
      }
      // 🔴 非数值金额必须在**任何终态副作用之前**拦掉(R3 P1)。NaN 参与比较恒为假 ——
      // 上面的族级兜底闸(`chargeTotal > quotedTotal`)与下面的余额预检(`余额 < chargeTotal`)
      // **两道都会静默放行**,于是 convert() 把试用打成 converted(不可逆终态),而随后的
      // debitBalance(NaN) 被 store 侧的 Number.isFinite 守卫拒掉 —— 净结果是「单没下、钱没扣、
      // 试用永久没了」。app.ts 的余额三函数早已为同一类污染加了守卫,这里是对称的调用侧缺口。
      // 一条闸收全族:入账两项(试用剩余 / NEX)虽有 `> 0` 挡着不会污染余额,但 NaN 会让它们
      // **静默漏发**给用户 —— 同一处判掉,不留「一个金额一道守卫」的散点。
      if (![chargeTotal, net, fee, trialRemainderUSD, shadowNEXNow].every((v) => Number.isFinite(v) && v >= 0)) {
        toast.warn(t.value.store.coTotalQuoteChanged);
        step.value = "select-payment";
        return;
      }
      // Production conversion is one server transaction: the server locks the
      // trial and catalogue row, creates the order, and closes the trial. Do
      // not debit local mock money or mint a second local order in this branch.
      if (applyTrial && remoteApiEnabled) {
        const conversion = await freeTrial.convert(p.id);
        if (!conversion.ok) {
          toast.warn(t.value.store.coTrialQuoteChanged);
          step.value = "select-payment";
          return;
        }
        orderId.value = conversion.orderNo ?? null;
        step.value = "awaiting";
        return;
      }
      // 🔴 扣款排在 convert() **之前**(2026-08-04 R5 改序)。原顺序是「只读预检 → convert
      // → 扣款」,理由是"预检使 convert 成功后扣款必成功" —— 但预检堵不住 debitBalance 的
      // 另一条失败路径:**落盘失败**。那时试用已被打成 converted(不可逆终态且已持久化)、
      // 余额被回滚、用户只看到「余额不足」,充值重试才发现试用永久没了 —— 不可恢复。
      // 反过来排之后:扣款失败 → 试用一根汗毛没动(余额不足与落盘失败共用同一条退出);
      // convert() 仍是状态机的最终裁决(自取 server now 再解析一次),只是挪到钱确实扣住
      // 之后再问。PRODUCTION:两步本就是 POST /api/orders 的同一个事务,不存在先后。
      // 🔴 先原子消费发票再花钱:CAS 在磁盘最新行上要求这张票仍在册且在窗内,删成功才算本实例抢到
      // 结算权。别的页面实例 / 标签页已结算或取消了它 → false → 拒单回报价步。花钱动作只许排在它之后
      // (审计 R2 P0 族:此前只验「过期」不验「还在不在」,同一张票被两处各结算一次、取消后仍能扣)。
      // 余额预检排在消费发票之前:钱不够就别先把付款指令销掉(consume 不可逆)。
      if (app.user.usdtBalance < chargeTotal) {
        toast.warn(fmt(t.value.errors.insufficientBalanceMsg, { amt: chargeTotal.toFixed(2) }));
        step.value = "select-payment";
        return;
      }
      // 🔴 单次券与发票同款「先占后花」:核销走 CAS(磁盘最新账本要求「已领且未用」),抢不到 = 别的标签页 /
      // 页面实例已经用掉这张券 → 拒单重报价。排在一切不可逆动作之前;之后任何失败面都把券放回(releaseVoucher)。
      // (审计 R5 P0:此前核销排在建单之后且返回 void,两处各结算一次同一张券,后到者的 CAS 失败被吞,双花不留痕。)
      const voucherClaimed = discount > 0 && !!usedVoucherId && voucher.markUsed(usedVoucherId);
      if (discount > 0 && usedVoucherId && !voucherClaimed) {
        toast.warn(t.value.voucher.quoteChanged);
        step.value = "select-payment";
        return;
      }
      /** 券放回:true = 已放回或本就没占;false = 放不回(storage 又坏了)→ 调用方按响亮终态处理。 */
      const releaseVoucher = (): boolean => (voucherClaimed && usedVoucherId ? voucher.release(usedVoucherId) : true);
      const invoice = activeSession.value;
      if (invoice) {
        const taken = pending.consume(invoice.id);
        if (taken !== "consumed") {
          if (!releaseVoucher()) {
            reportStuckFunds(app.captureMoney(), invoice.id, "voucher");
            if (usedVoucherId) pendingVoucherRelease = usedVoucherId; // 下一次结算尝试先补放回
          }
          if (taken === "failed") {
            // storage 故障:票还活着、地址还在,用户可能已转账 —— 留在扫码步,让他重试,别谎称「已在别处结算」。
            toast.error(t.value.errors.txNotSavedTitle, t.value.errors.txNotSavedMsg);
            step.value = "pay-instructions";
            return;
          }
          toast.warn(t.value.store.pendingSettledElsewhere);
          activeSession.value = null;
          step.value = "select-payment";
          return;
        }
        activeSession.value = null; // 票已消费;下面任何失败都回报价步重开新票,不再回到它
      }
      const beforePay = app.captureMoney();
      const ok = app.debitBalance(chargeTotal);
      if (!ok) {
        // 余额预检已经在上面过了、金额也过了数值闸,这里 false 只剩一种可能:落盘失败(store 已把内存拨回,
        // 余额没动)。那是系统故障,不许说成「余额不足」把用户支去充值(审计 R8 P1)。
        if (!releaseVoucher()) reportStuckFunds(beforePay, "", "voucher");
        toast.error(t.value.errors.txNotSavedTitle, t.value.errors.txNotSavedMsg);
        step.value = "select-payment";
        return;
      }
      if (applyTrial && !(await freeTrial.convert(p.id)).ok) {
        // 扣款与 convert 之间跨过宽限终点的极窄窗口:把刚扣的钱按增量精确退回
        // (含 withdrawableUsdt);退不回去 = 钱真扣着,走响亮终态(交易号 + 待对账队列),
        // 绝不再弹一句"报价已变"了事。
        const voucherBack = releaseVoucher();
        const moneyBack = app.restoreMoney(beforePay);
        // 钱没退回永远是第一优先级(券的文案宣称「余额没有变化」,钱真扣着时不许说这句)。
        if (moneyBack && voucherBack) toast.warn(t.value.store.coTrialQuoteChanged);
        else reportStuckFunds(beforePay, "", moneyBack ? "voucher" : "funds");
        step.value = "select-payment";
        return;
      }
      // 扣款成功后同步移除旧机(下架),再清抵扣上下文——全程同步无 await,
      // 不存在半执行窗口;失败路径(上面 return)未动任何状态。
      let retiredByMe = false;
      if (ti) {
        // 只在设备此刻仍在册时下架(store 内断言 + 落盘):别的结算实例已经拿它抵扣过 → "absent" → 这一单不许
        // 再吃一次抵扣(审计 R9 P0:页面直写 filter 对不在册设备是 no-op,同一台旧机两处各抵扣一次)。
        const retired = app.retireDevice(ti.device.id);
        retiredByMe = retired === "retired";
        if (retired !== "retired") {
          // "absent":抵扣的前提不成立(设备已被别处消费);"unpersisted":下架没落盘(内存已拨回,设备仍在)。
          // 两种都不能按抵扣价成交:钱按快照精确冲正;冲不回去 = 响亮终态。
          tradein.clearApplied(tradeinOwner);
          const voucherBack = releaseVoucher();
          const moneyBack = app.restoreMoney(beforePay);
          if (moneyBack && voucherBack && !applyTrial) toast.error(t.value.errors.txNotSavedTitle, t.value.errors.txNotSavedMsg);
          else reportStuckFunds(beforePay, applyTrial ? p.id : "", !moneyBack ? "funds" : !voucherBack ? "voucher" : "trial");
          step.value = "select-payment";
          return;
        }
        tradein.clearApplied(tradeinOwner);
      }
      const ord = orders.createOrder({
        productId: p.id as Order["productId"],
        productName: p.name,
        unitPrice: p.price,
        paymentMethod: payment.value,
        discount,
        ...(ti && { tradeInCredit, tradeInDeviceId: ti.device.id }),
        ...(applyTrial && { promoDiscountUSD: promo, trialOffsetUSD }),
      });
      if (!ord) {
        // 单子没落盘(store 已把内存那条撤掉):把上面已做掉的两件事按原路退回 —— 旧机重新上架、
        // 资金精确冲正;任一退不回去 = 响亮终态(交易号 + 待对账),绝不静默让「钱扣了 / 设备没了 /
        // 单子查无」并存(审计 R4 P1)。试用 convert 已落终态,与上面 convert 之后各失败面同一残余。
        // 三件都做(不短路):设备回架(只还**本实例**下架的那台 —— 别处合法抵扣掉的不许被本实例复活)、资金冲正、券放回;
        // 任一没成 → 响亮终态。试用已被 convert 打成终态(不可逆)→ 单独一档告知 + 登记,不许说「没有产生任何记录」。
        const deviceBack = !retiredByMe || app.restoreDevice(ti!.device);
        const moneyBack = app.restoreMoney(beforePay);
        const voucherBack = releaseVoucher();
        if (deviceBack && moneyBack && voucherBack && !applyTrial) toast.error(t.value.errors.txNotSavedTitle, t.value.errors.txNotSavedMsg);
        // 优先级 钱 > 设备 > 券 > 试用;设备卡住时 ref 带上设备 id,对账端才知道该还哪一台。
        else if (!moneyBack) reportStuckFunds(beforePay, "", "funds");
        else if (!deviceBack) reportStuckFunds(beforePay, ti ? ti.device.id : "", "device");
        else if (!voucherBack) reportStuckFunds(beforePay, "", "voucher");
        else reportStuckFunds(beforePay, p.id, "trial");
        step.value = "select-payment";
        return;
      }
      orderId.value = ord.id;
      // 链上腿的票已在扣款前被 consume(见上);卡 / $0 直付腿从不碰票 —— 这一单成交 = 该商品的购买意图已兑现,
      // 同账号仍在窗内的那张链上旧票一并作废,否则浮动条继续催第二笔(审计 R8 P0)。
      // persist-verdict-ok: 作废不掉 = 票留在磁盘,浮动条继续露出;用户回去看到的是可取消的旧票,不会二次扣款(consume 仍要 CAS)
      pending.settleProduct(p.id);
      // ── FEAT-TRIAL02 conversion side effects(订单落盘同笔,同步块内)──
      // convert() 已在扣款前裁决并落 converted(见上);这里只做返还入账。设备由
      // 既有订单履约管线生成(tickOrders → advanceOrder → addDevice,吃 order.total
      // 作置换基数),这里绝不直插。金额全部来自确认页那份报价快照。
      if (applyTrial) {
        const convRef = `${ord.id}-TRIAL`;
        // 🔴 入账 ⊗ 收据走同一个收口点(2026-08-04 R4)。原实现是「creditBalance / creditNex →
        // 裸 bills.add」,收据写失败时返回 null 没人接:钱加了、账单没有,而下面的 toast 还
        // 照旧宣布「你到手了 $X」。收口后收据落不了盘 = 入账原样退回、这一项不进 toast。
        // silentFailure:通用文案「余额没有变化,也没有产生任何记录,请重试」在这条路径上是假的(订单 / 扣款 / 转化都已记,
        // 且这一单不可能再跑一次);返还没到账 = 平台欠用户的钱,登记待对账 + 交易号(审计 R10 P1)。
        const usdtCredited =
          trialRemainderUSD > 0 &&
          postMoneyBill({
            type: "bonus",
            symbol: "USDT",
            amount: trialRemainderUSD,
            status: "posted",
            memo: fmt(t.value.store.coBillTrialRemainderMemo, { name: p.name }),
            ref: `${convRef}-EARN-USDT`,
          }, { silentFailure: true }) === "ok";
        const nexCredited =
          shadowNEXNow > 0 &&
          postMoneyBill({
            type: "bonus",
            symbol: "NEX",
            amount: shadowNEXNow,
            status: "posted",
            memo: fmt(t.value.store.coBillTrialNexMemo, { name: p.name }),
            ref: `${convRef}-EARN-NEX`,
          }, { silentFailure: true }) === "ok";
        if ((trialRemainderUSD > 0 && !usdtCredited) || (shadowNEXNow > 0 && !nexCredited)) {
          reportStuckFunds(app.captureMoney(), convRef, "payout");
        }
        // 只报**真的到账**的那几项 —— 报了没到账的钱等于二次欺骗。
        const earnParts: string[] = [];
        if (usdtCredited) earnParts.push(fmt(t.value.store.coTrialEarnUsdtPart, { amount: trialRemainderUSD.toFixed(2) }));
        if (nexCredited) earnParts.push(fmt(t.value.store.coTrialEarnNexPart, { n: shadowNEXNow.toLocaleString() }));
        if (earnParts.length) toast.success(fmt(t.value.store.coTrialEarnToast, { parts: earnParts.join(" · ") }));
      }
      // 券已在扣款前核销(先占后花,见上);到这里订单已落盘,核销就是终态。
      // 账单 memo 走 i18n(用户账单页直接渲染,禁硬编码英文)。
      const memoParts: string[] = [];
      if (discount > 0) memoParts.push(fmt(t.value.store.coBillVoucherPart, { amount: discount }));
      // 设备名经 device-copy 解析(存档只认 kind,显示随语言切换);试用促销/抵扣两行为 FEAT-TRIAL02 转化单分项。
      if (ti) memoParts.push(fmt(t.value.store.coBillTradeinPart, { name: deviceName(t.value, ti.device), amount: tradeInCredit }));
      if (promo > 0) memoParts.push(fmt(t.value.store.coBillTrialDiscountPart, { amount: promo.toFixed(2) }));
      if (applyTrial && trialOffsetUSD > 0) memoParts.push(fmt(t.value.store.coBillTrialOffsetPart, { amount: trialOffsetUSD.toFixed(2) }));
      if (fee > 0) memoParts.push(fmt(t.value.store.coBillCardFeePart, { amount: fee, rate: cardFeeRateLabel() }));
      // 🔴 主账单走 postReceiptOnly 而不是 postMoneyBill(2026-08-04 R4)。这一笔的扣款发生在
      // 上面(必须先扣款才建单),中间夹着 createOrder + 旧机下架 + voucher 核销 —— 全都没有
      // undo。收据写失败时回滚资金 = 只还钱、还不回已经进入履约管线的设备,等于白送一台;
      // 所以这里的既定处置是**让用户明确看见收据没记上**(与提现页同口径),而不是像原来那样
      // 丢弃 bills.add 的返回值、静默吞掉。
      const receiptDraft: ReceiptDraft = {
        type: "purchase",
        symbol: "USDT",
        amount: -chargeTotal,
        status: "posted",
        memo: memoParts.length
          ? fmt(t.value.store.coBillMemoWithParts, { name: p.name, parts: memoParts.join(" · ") })
          : fmt(t.value.store.coBillMemoBase, { name: p.name }),
        ref: ord.id,
      };
      if (!postReceiptOnly(receiptDraft)) {
        persistReceiptRecovery({
          accountKey: orders.currentAccountKey(),
          draft: receiptDraft,
          orderId: ord.id,
          productId: p.id, // 读侧按商品作用域过滤(restoreReceiptRecovery);不写 = 那道过滤永远放行
        });
        return;
      }
      if (wasEmptyBefore.value) firstOrderCelebrating.value = true;
    }
    // Timer lives OUTSIDE the !orderId guard, else the re-render from setting
    // orderId clears it and confirmed → activating never fires.
    advanceTimer = setTimeout(() => { step.value = "activating"; }, 1500);
    return;
  }
  if (s === "activating") {
    advanceTimer = setTimeout(() => { step.value = "live"; }, 3000);
    return;
  }
  if (s === "live" && product.value && orderId.value) {
    toast.success(t.value.store.coOrderPlaced, orderPlacedBody.value);
  }
});

function goStore() {
  navTo("/store");
}
function goTrack() {
  const url = orderId.value
    ? `/pages/store/order-detail?id=${orderId.value}`
    : "/pages/store/orders";
  navTo(url);
}

// 离开结算页即放弃未使用的抵扣上下文(内存态,无半执行风险)。
// 只跑一次:onUnload 与晚一拍的 onUnmounted 都挂着它,第二次已经在别的页面实例 onShow 之后 —— 那时再清
// 任何全局层都是在动别人的东西。
function cleanup() {
  if (!pageAlive) return;
  clearAdvance();
  remoteOrderPageVisible = false;
  pageVisible = false;
  stopRemoteOrderPolling();
  tradein.clearApplied(tradeinOwner); // 只清本页 owner 的那份;在世实例的上下文不动
  // 本页拉起的置换 / 槽位 sheet 是 chassis 级全局层,不随页面卸载自动收 —— 不收会跟到落地页,
  // 整屏 backdrop 把浮动条与页面一起挡死(T3 黑盒 P1-2)。
  tradein.hide();
  if (trialTicker) { clearInterval(trialTicker); trialTicker = undefined; }
  releaseSessionOnLeave();
  pageAlive = false;
  // 本页开着的确认框(撞单 / 取消支付)随页面一起收掉 —— 确认框是全局层,不收会跟着用户去下一页,
  // 而它的按钮回调指向的是一个已卸载的页面(实测:弹框全站阻断 + 「继续那一笔」点了没反应)。
  // 只收本页 owner 的,别人排队中的框不动。
  if (dialogsOpen > 0) useUI().clearConfirmsBy(dialogOwner);
}
onUnload(() => cleanup());
onUnmounted(() => cleanup());

// ─── styles ───
const notFoundBtnStyle: CSSProperties = {
  minHeight: "44px",
  padding: "0 20px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink)",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
};
const stepperRowStyle: CSSProperties = { margin: "0 16px 12px", gap: "6px" };
const stepLabelRowStyle: CSSProperties = { margin: "0 16px 12px" };
function stepFillStyle(i: number): CSSProperties {
  const w = i < stepDisplay.value ? "100%" : i === stepDisplay.value ? "50%" : "0%";
  return { width: w, background: "var(--v5-brand)", transition: "width 0.5s" };
}
const surfaceCardStyle: CSSProperties = { background: "var(--v5-surface)" };
const payHeadStyle: CSSProperties = { padding: "16px 20px", borderColor: "color-mix(in srgb, var(--v5-border) 70%, transparent)" };
const payTotalStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
function methodRowStyle(active: boolean): CSSProperties {
  return {
    marginTop: "8px",
    padding: "12px",
    gap: "12px",
    borderRadius: "12px",
    background: active ? "var(--v5-brand-soft)" : "var(--v5-surface-2)",
    borderColor: active ? "var(--v5-brand-border)" : "color-mix(in srgb, var(--v5-border) 70%, transparent)",
  };
}
function methodIconStyle(active: boolean): CSSProperties {
  return {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    // 两态原本都与所在行同色 → 图标框隐形:未选中 surface-2 撞未选中行的 surface-2,
    // 选中 brand-soft 撞选中行的 brand-soft(第一轮只修了未选中,复扫才抓出选中态也坏)。
    // 现在两态都从行里浮出来:选中用 L1 托住品牌色图标,未选中用 surface-3 内凹。
    background: active ? "var(--v5-surface)" : "var(--v5-surface-3)",
  };
}
const payFootStyle: CSSProperties = { padding: "16px", borderColor: "color-mix(in srgb, var(--v5-border) 70%, transparent)" };
const cappedNoteStyle: CSSProperties = {
  marginBottom: "8px",
  padding: "8px 12px",
  fontSize: "12px",
  color: "var(--v5-warning)",
  background: "color-mix(in srgb, var(--v5-warning) 10%, transparent)",
};
const primaryBtnStyle: CSSProperties = {
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
};
// Ghost cancel under the primary CTA — no fill, ink-3, 44px tap target.
const ghostCancelStyle: CSSProperties = {
  marginTop: "4px",
  height: "44px",
  color: "var(--v5-ink-3)",
  fontSize: "13px",
};
const confirmCardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  padding: "20px",
};
const confirmCtaStyle: CSSProperties = {
  marginTop: "20px",
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
};
const changePayBtnStyle: CSSProperties = {
  marginTop: "8px",
  height: "40px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink-2)",
  fontSize: "13px",
};
const centerCardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  padding: "24px",
};
// awaiting / activating / confirmed-check spinner — brand 15% (source).
const spinnerWrapStyle: CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "50%",
  background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)",
};
// live (rocket) spinner — brand 20% (source), matches the medal tier.
const liveSpinnerWrapStyle: CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "50%",
  background: "var(--v5-brand-soft)",
};
const centerTitleStyle: CSSProperties = {
  marginTop: "16px",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const celebrateGlowStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "radial-gradient(60% 70% at 50% 0%, var(--v5-brand-soft), transparent 70%)",
  pointerEvents: "none",
};
const medalStyle: CSSProperties = {
  width: "56px",
  height: "56px",
  borderRadius: "50%",
  background: "var(--v5-brand-soft)",
};
const liveCardStyle: CSSProperties = {
  // Source: bg-gradient-to-br from-brand/15 via-#0F0F0F to-brand/10. Middle stop
  // uses --v5-surface (not the source's hardcoded #0F0F0F) for dual-theme safety.
  background:
    "linear-gradient(to bottom right, color-mix(in srgb, var(--v5-brand) 15%, transparent), var(--v5-surface), color-mix(in srgb, var(--v5-brand) 10%, transparent))",
  padding: "24px",
};
const liveTitleStyle: CSSProperties = {
  marginTop: "16px",
  fontFamily: "var(--font-v5)",
  fontSize: "20px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const trackBtnStyle: CSSProperties = {
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontSize: "15px",
  fontWeight: 600,
};
const doneBtnStyle: CSSProperties = {
  height: "44px",
  padding: "0 16px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink-2)",
  fontSize: "13px",
};
const receiptFailureCardStyle: CSSProperties = {
  padding: "24px 20px",
  background: "var(--v5-surface)",
};
</script>

<style scoped>
.nx-step-in {
  animation: nx-step-in 0.28s var(--ease-out, ease-out) both;
}
@keyframes nx-step-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.nx-pop-in {
  animation: nx-pop-in 0.3s var(--ease-out, ease-out) both;
}
@keyframes nx-pop-in {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
.nx-spin {
  animation: nx-spin 1s linear infinite;
}
@keyframes nx-spin {
  to { transform: rotate(360deg); }
}
.nx-progress-fill {
  width: 0%;
  animation: nx-progress-fill 3s linear forwards;
}
@keyframes nx-progress-fill {
  to { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .nx-step-in, .nx-pop-in, .nx-spin, .nx-progress-fill { animation: none; }
  .nx-progress-fill { width: 100%; }
}
</style>
