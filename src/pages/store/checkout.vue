<!-- Checkout review presentation. Transaction quotes, confirmation and recovery remain server-authoritative. -->
<template>
  <AppChassis active="store">
    <template #pageTop><SubPageHeader class="checkout-header" design :back="checkoutBackHref" :back-action="requestCheckoutBack" :title="checkoutResultVisible ? flowCopy.resultTitle : auditCopy.review" /></template>
    <PromotionCheckout class="checkout-promotion" :class="{ 'checkout-promotion--result': checkoutResultVisible }" v-if="promotionRoute" :key="app.accountKey+':'+app.accountBindingEpoch" ref="promotionCheckout" :activity-id="promotionRoute.activityId" :items="promotionRoute.items" :order-no="promotionRoute.orderNo" :voucher-id="promotionRoute.voucherId" :upgrade-activity-id="promotionRoute.upgradeActivityId">
      <template #review-footer>
        <CheckoutLegal @navigate="openCheckoutLegal" />
      </template>
    </PromotionCheckout>
    <view v-else class="checkout-content" :class="{ 'checkout-content--result': checkoutResultVisible }">

      <view v-if="pendingCheckoutCreate && !createdCheckoutOrder && !paymentFlowBusy" class="checkout-exit-error" role="status">
        <text>{{ t.store.coRecoverOriginalOrder }}</text><NxButton :label="t.store.catalogRetry" :busy="checkoutLeaving" @click="recoverCheckoutCreation" />
      </view>
      <view v-else-if="keepCheckoutTarget" class="text-center" role="status" style="padding:var(--v5-space-5)">
        <text class="block">{{ keepCheckoutReadError ? t.tradein.keepRecoveryReadError : t.tradein.keepRecoveryPending }}</text>
        <NxButton :label="t.tradein.keepRecoveryAction" @click="recoverKeepBeforePurchase([keepCheckoutTarget])" />
      </view>
      <view v-else-if="remoteTradeinRecoveryError" class="text-center" role="status" style="padding:var(--v5-space-5)">
        <text class="block" style="font-size:13px;color:var(--v5-ink-2);margin-bottom:var(--v5-space-3)">{{ t.tradein.recoveryPending }}</text>
        <NxButton :label="t.store.catalogRetry" :busy="remoteTradeinRecoveryBusy" @click="resumePendingRemoteTradein(captureCheckoutRoute(), true, true)" />
      </view>
      <view v-else-if="catalogStatus === 'loading'" class="text-center" style="padding: var(--v5-space-5)">
        <text class="block" style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3); margin-bottom: var(--v5-space-3)">{{ t.store.catalogLoadingTitle }}</text>
      </view>

      <view v-else-if="catalogStatus === 'error'" class="text-center" style="padding: var(--v5-space-5)">
        <text class="block" style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3); margin-bottom: var(--v5-space-3)">{{ t.store.catalogErrorTitle }}</text>
        <view class="inline-flex items-center justify-center active:opacity-90" :style="notFoundBtnStyle" role="button" tabindex="0" @click.stop="goStore">
          <text>{{ t.store.coBackToStore }}</text>
        </view>
      </view>

      <view v-else-if="trialQuoteScreenUnavailable" class="text-center" role="status" style="padding: var(--v5-space-6) var(--v5-space-4)">
        <text class="block" style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3)">{{ freeTrial.authorityStatus === 'loading' ? t.trial.entryChecking : t.trial.entryUnavailable }}</text>
        <NxButton variant="secondary" :label="t.trial.entryRetry" :busy="freeTrial.authorityStatus === 'loading'" @click="freeTrial.refreshRemote(true)" />
      </view>

      <!-- Product not found -->
      <view v-else-if="!product" class="text-center" style="padding: var(--v5-space-5)">
        <text class="block" style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3); margin-bottom: var(--v5-space-3)">{{ t.store.coProductNotFound }}</text>
        <view class="inline-flex items-center justify-center active:opacity-90" :style="notFoundBtnStyle" role="button" tabindex="0" @click.stop="goStore">
          <text>{{ t.store.coBackToStore }}</text>
        </view>
      </view>

      <template v-else>
        <view v-if="!remoteApiEnabled" class="checkout-steps" :aria-label="auditCopy.review">
          <view v-for="(s, i) in stepLabels" :key="s.key" :aria-current="i === stepDisplay ? 'step' : undefined">
            <view class="checkout-step-track"><view class="checkout-step-fill" :style="stepFillStyle(i)" /></view>
            <text class="checkout-step-label" :class="{ 'checkout-step-label--active': i <= stepDisplay }">{{ i + 1 }} {{ s.label }}</text>
          </view>
        </view>

        <view v-if="step === 'select-payment' || step === 'confirm'" class="checkout-product checkout-group">
          <view class="checkout-product-art"><image v-if="checkoutImage" :src="checkoutImage" mode="aspectFit" aria-hidden="true" @error="checkoutImageError" /></view>
          <view class="checkout-product-copy"><text class="checkout-product-name">{{ (product.name) }}</text><text v-if="product.tagline" class="checkout-product-meta">{{ product.tagline }}</text><CheckoutAmount class="checkout-product-price" :value="purchaseSubtotal" currency="USD" /></view>
          <view class="checkout-quantity"><text class="checkout-product-meta">{{ t.store.coRowQuantity }}</text><view class="checkout-quantity-controls">
            <button class="checkout-quantity-button" disabled :aria-label="t.uiChrome.decreaseQty">−</button>
            <text class="checkout-quantity-value" aria-live="polite">1</text>
            <view class="checkout-quantity-button" data-testid="checkout-quantity-increase" role="button" :tabindex="canIncreaseCheckoutQuantity() ? 0 : -1" :aria-disabled="!canIncreaseCheckoutQuantity()" :aria-label="t.uiChrome.increaseQty" @click.stop="increaseCheckoutQuantity" @keydown.enter.prevent.stop="onKeyboardActivate($event, increaseCheckoutQuantity)" @keydown.space.prevent.stop="onKeyboardActivate($event, increaseCheckoutQuantity)">+</view>
          </view></view>
        </view>

        <!-- A receipt-only write is a recoverable post-order failure. Keep the
             checkout on this explicit state; the timer chain must not announce
             activation while the bill is still missing.
             不许盖住本页正在展示的活票(地址 / 金额 / 倒计时 / 取消都在被它压掉的那一支里):
             恢复行是持久行,resume 进来的票会被它整页遮蔽而全站失联(审计 R5 P0)—— 有活票先付票,
             票结清 / 作废后这张卡再露出来。 -->
        <view v-if="receiptWriteFailure && !activeSession" class="nx-glass-card mx-4 rounded-2xl text-center nx-step-in" :style="receiptFailureCardStyle">
          <text class="block" :style="centerTitleStyle">{{ t.errors.billMissingTitle }}</text>
          <text class="block" style="margin-top: 6px; font-size: 12px; line-height: 1.5; color: var(--v5-ink-3)">{{ t.errors.billMissingMsg }}</text>
          <view class="inline-flex items-center justify-center active:opacity-80" :style="doneBtnStyle" role="button" tabindex="0" style="margin-top: var(--v5-space-4)" :aria-disabled="receiptRetrying" @click.stop="retryReceiptWrite">
            <text>{{ receiptRetrying ? t.store.catalogLoadingTitle : t.store.catalogRetry }}</text>
          </view>
        </view>

        <!-- Review uses the existing quote, redemption and explicit confirmation flow. -->
        <template v-else-if="step === 'select-payment' || step === 'confirm'">
          <view class="checkout-section">
            <view class="checkout-section-heading"><text>{{ t.promotion.discount }}</text></view>
            <view class="checkout-group">
              <view class="checkout-option checkout-voucher" role="button" tabindex="0" :aria-expanded="voucherDetailsOpen" @click="voucherDetailsOpen = !voucherDetailsOpen" @keydown.enter.prevent="voucherDetailsOpen = !voucherDetailsOpen" @keydown.space.prevent="voucherDetailsOpen = !voucherDetailsOpen">
                <view class="checkout-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" /><path d="M14 6v2m0 3v2m0 3v2" /></svg></view>
                <view class="checkout-option-copy"><text class="checkout-row-title">{{ t.voucher.checkoutRowLabel }}</text><text class="checkout-row-description">{{ remoteApiEnabled && trialConversionMode ? trialCopy.voucherUnavailable : hasVoucher ? auditCopy.autoApplyVoucher : !voucherAutomatic ? t.promotion.noVoucher : expiredVoucherForSku ? t.voucher.expiredNote : t.voucher.noneAvailable }}</text></view>
                <text v-if="hasVoucher" class="checkout-discount">{{ reviewMoney(voucherDiscount, true) }}</text><svg class="checkout-chevron" :class="{ 'checkout-chevron--open': voucherDetailsOpen }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
              </view>
              <view v-if="voucherDetailsOpen" class="checkout-voucher-details">
                <text v-if="voucherMatch" class="checkout-row-description checkout-voucher-match">{{ voucherMatch.def.name }}</text>
                <view class="checkout-voucher-choices" role="radiogroup" :aria-label="t.promotion.voucher">
                  <view v-for="choice in [{ automatic: true, label: reviewCopy.automaticVoucher }, { automatic: false, label: t.promotion.noVoucher }]" :key="String(choice.automatic)" class="checkout-voucher-choice" role="radio" :aria-checked="voucherAutomatic === choice.automatic" :aria-disabled="!canChangeVoucher()" :tabindex="canChangeVoucher() ? 0 : -1" @click="canChangeVoucher() && selectAutomaticVoucher(choice.automatic)">
                    <text class="checkout-voucher-choice__label">{{ choice.label }}</text>
                    <view class="checkout-voucher-radio" :class="{ 'checkout-voucher-radio--on': voucherAutomatic === choice.automatic }" aria-hidden="true"><svg v-if="voucherAutomatic === choice.automatic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7" /></svg></view>
                  </view>
                </view>
                <view class="checkout-voucher-link" role="link" tabindex="0" @click="navTo('/pages/me/rewards-list?cat=voucher')"><text>{{ auditCopy.vouchers }}</text><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></view>
              </view>
              <view v-if="promoDiscount > 0" class="checkout-option"><view class="checkout-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12v9h16v-9M2 7h20v5H2zM12 7v14M12 7C3 8 4 0 8 2c3 1 4 5 4 5s1-4 4-5c4-2 5 6-4 5" /></svg></view><view class="checkout-option-copy"><text class="checkout-row-title">{{ promoRowLabel }}</text></view><text class="checkout-discount">{{ reviewMoney(promoDiscount, true) }}</text></view>
              <view v-if="trialOffsetView.offsetUSD > 0" class="checkout-option"><view class="checkout-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></view><view class="checkout-option-copy"><text class="checkout-row-title">{{ t.store.coRowTrialOffset }}</text></view><text class="checkout-discount">{{ reviewMoney(trialOffsetView.offsetUSD, true) }}</text></view>
              <view v-if="trialOffsetView.earlyDiscountUSD > 0" class="checkout-option" data-testid="checkout-trial-early-discount"><view class="checkout-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg></view><view class="checkout-option-copy"><text class="checkout-row-title">{{ trialCopy.earlyDiscountLabel }}</text></view><text class="checkout-discount">{{ reviewMoney(trialOffsetView.earlyDiscountUSD, true) }}</text></view>
              <!-- Trade-in remains a separate, reversible action, never a payment switch. -->
              <view v-if="hasTradein || removedTradein || tradeinAvailable" class="checkout-option checkout-tradein">
                <view class="checkout-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 4-4 4 4 4M3 8h13m1 12 4-4-4-4M21 16H8" /></svg></view>
                <view class="checkout-option-copy"><text class="checkout-row-title">{{ t.tradein.checkoutRowLabel }}</text><text v-if="hasTradein" class="checkout-row-description">{{ tradeinChipText }}</text></view>
                <NxButton v-if="hasTradein && !remoteTradeinRecoveryRequired" variant="text" size="small" :label="t.tradein.checkoutRemove" @click="removeTradein" />
                <NxButton v-else-if="!hasTradein" variant="text" size="small" :disabled="reAddingTradein || remoteTradeinRecoveryRequired" :busy="reAddingTradein" :label="t.tradein.checkoutReAdd" @click="reAddTradein" />
              </view>
            </view>
          </view>

          <view v-if="!remoteApiEnabled" class="checkout-section">
            <view class="checkout-section-heading"><text>{{ t.store.coPaymentMethod }}</text></view>
            <view class="checkout-group" role="group" :aria-label="t.store.coPaymentMethod">
              <view v-for="m in PAYMENT_METHODS" :key="m.id" class="checkout-option checkout-payment" :class="{ 'checkout-payment--active': payment === m.id }" role="button" tabindex="0" :aria-pressed="payment === m.id" @click.stop="selectPayment(m.id)">
                <view class="checkout-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="m.iconPath" /><path v-if="m.iconPath2" :d="m.iconPath2" /></svg></view>
                <view class="checkout-option-copy"><text class="checkout-row-title">{{ m.label }}</text><text class="checkout-row-description">{{ m.hint }}</text></view>
                <view class="checkout-radio" :class="{ 'checkout-radio--active': payment === m.id }" aria-hidden="true" />
              </view>
            </view>
          </view>

          <view class="checkout-section">
            <view class="checkout-section-heading"><text>{{ t.store.coReviewOrder }}</text></view>
            <view class="checkout-group checkout-fees">
              <CheckoutRow :label="t.store.coRowSubtotal" :value="reviewMoney(purchaseSubtotal, false, true)" class="checkout-fee" />
              <CheckoutRow v-if="promoDiscount > 0" :label="promoRowLabel" :value="reviewMoney(promoDiscount, true)" class="checkout-fee checkout-fee--discount" />
              <CheckoutRow v-if="trialOffsetView.offsetUSD > 0" :label="t.store.coRowTrialOffset" :value="reviewMoney(trialOffsetView.offsetUSD, true)" class="checkout-fee checkout-fee--discount" />
              <CheckoutRow v-if="trialOffsetView.earlyDiscountUSD > 0" :label="trialCopy.earlyDiscountLabel" :value="reviewMoney(trialOffsetView.earlyDiscountUSD, true)" class="checkout-fee checkout-fee--discount" />
              <CheckoutRow v-if="hasVoucher" :label="t.voucher.checkoutRowLabel" :value="reviewMoney(voucherDiscount, true)" class="checkout-fee checkout-fee--discount" />
              <CheckoutRow v-if="hasTradein" :label="t.tradein.checkoutRowLabel" :value="reviewMoney(tradeinCredit, true)" class="checkout-fee checkout-fee--discount" />
              <CheckoutRow v-if="isCard" :label="fmt(t.store.coRowCardFee, { rate: cardFeeRateLabel() })" :value="reviewMoney(cardFee)" class="checkout-fee" />
              <CheckoutRow v-else-if="!remoteApiEnabled" :label="t.store.coRowNetworkFee" :value="t.store.coFeeFree" class="checkout-fee" />
              <CheckoutRow v-if="!remoteApiEnabled" :label="t.store.coRowShipping" :value="t.store.coShippingValue" class="checkout-fee" />
              <view class="checkout-fee checkout-fee--total checkout-summary-total"><text>{{ flowCopy.paymentTotal }}</text><CheckoutAmount :value="netPrice + cardFee" currency="USD" /></view>
            </view>
            <view v-if="trialCreditText" class="checkout-trial-credit" data-testid="checkout-trial-credit">
              <text>{{ trialCopy.afterPurchaseLabel }}</text>
              <text class="checkout-trial-credit-value">{{ trialCreditText }}</text>
            </view>
            <text v-if="trialZeroDue" class="checkout-note">{{ t.store.coTrialZeroNote }}</text>
            <view v-if="tradeinPlacementText" class="checkout-note"><text>{{ tradeinPlacementText }}</text></view>
            <view v-if="checkoutCapacityRequired && !hasTradein && !remoteCapacityGate.canConfirm(false)" class="checkout-note checkout-note--warning" role="status" data-testid="checkout-capacity-notice">
              <text>{{ checkoutCapacityMessage }}</text>
              <view class="checkout-capacity-actions">
                <NxButton variant="text" size="small" :label="t.store.catalogRetry" :busy="remoteCapacityGate.pending" @click="retryCheckoutCapacity" />
                <NxButton v-if="remoteCapacityGate.decision === 'REPLACE_REQUIRED'" variant="text" size="small" :label="t.tradein.checkoutReAdd" :busy="reAddingTradein" @click="reAddTradein" />
                <NxButton v-if="remoteCapacityGate.decision" variant="text" size="small" :label="t.myDevices.inventoryTitle" @click="navTo('/pages/me/devices')" />
              </view>
            </view>
            <view v-else-if="!remoteApiEnabled && capped" class="checkout-note checkout-note--warning"><text>{{ slotsFullText }}</text></view>
            <CheckoutLegal @navigate="openCheckoutLegal" />
          </view>
        </template>

        <!-- === pay-instructions === -->
        <view v-else-if="step === 'pay-instructions'" class="mx-4 nx-step-in">
          <CardPayment v-if="isCard" :amount="netPrice" @complete="goAwaiting" @cancel="goConfirm" />
          <ChainPayment v-else-if="activeSession" :session="activeSession" @complete="goAwaiting" @cancel="onChainCancel" @restart="onChainRestart" />
        </view>

        <!-- === awaiting === -->
        <view v-else-if="step === 'awaiting'" class="nx-glass-card mx-4 rounded-2xl text-center nx-step-in" :style="centerCardStyle">
          <view v-if="!remoteOrderFailure" class="mx-auto grid place-items-center nx-spin" :style="spinnerWrapStyle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          </view>
          <text class="block" :style="centerTitleStyle">{{ remoteOrderFailure ? t.tradein.errPurchaseFailed : t.store.coAwaiting }}</text>
          <text class="block" style="margin-top: var(--v5-space-1); font-size: 12px; color: var(--v5-ink-3); line-height: 1.4; padding: 0 8px">{{ remoteOrderFailure ? t.store.coRecoverOriginalOrder : remoteApiEnabled ? t.store.coAwaitingServer : isCard ? t.store.coAwaitingCard : t.store.coAwaitingChain }}</text>
          <view v-if="orderId" class="inline-flex items-center justify-center active:opacity-80" :style="doneBtnStyle" role="button" tabindex="0" style="margin-top: 14px" :aria-label="t.store.coTrackOrder" @click.stop="goTrack">
            <text>{{ t.store.coTrackOrder }}</text>
          </view>
        </view>

        <CheckoutResult v-else-if="remoteApiEnabled && settledResultReplay" :state="checkoutResultState" :product-name="product.name" :product-image="checkoutImage ?? undefined" :amount="completedOrder?.total ?? netPrice" @devices="viewPurchasedDevices" @retry="refreshCheckoutResult" />

        <!-- === confirmed === -->
        <view v-else-if="step === 'confirmed'" class="nx-glass-card mx-4 rounded-2xl text-center relative overflow-hidden nx-pop-in" :style="centerCardStyle">
          <template v-if="firstOrderCelebrating">
            <view aria-hidden :style="celebrateGlowStyle" />
            <view class="relative">
              <view class="mx-auto grid place-items-center nx-pop-in" :style="medalStyle">
                <text style="font-size: 26px">🏅</text>
              </view>
              <text class="block" :style="centerTitleStyle" style="margin-top: var(--v5-space-3)">{{ t.store.firstOrderTitle }}</text>
              <text class="block" style="margin-top: var(--v5-space-1); font-size: 12px; color: var(--v5-ink-2); line-height: 1.4">{{ t.store.firstOrderBody }}</text>
              <!-- No server grants a first-hardware reward, so the achievement line stays in the local demo only. -->
              <view v-if="!remoteApiEnabled" class="inline-flex items-center justify-center" style="margin-top: var(--v5-space-2); gap: var(--v5-space-1); font-size: 12px; color: var(--v5-brand)">
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
            <text class="block" style="margin-top: var(--v5-space-1); font-size: 12px; color: var(--v5-ink-3)">{{ t.store.coConfirmedSub }}</text>
          </template>
        </view>

        <!-- === activating === -->
        <view v-else-if="step === 'activating'" class="nx-glass-card mx-4 rounded-2xl text-center nx-step-in" :style="centerCardStyle">
          <view class="mx-auto grid place-items-center nx-spin" :style="spinnerWrapStyle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
          </view>
          <text class="block" :style="centerTitleStyle">{{ t.store.coActivating }}</text>
          <text class="block" style="margin-top: var(--v5-space-1); font-size: 12px; color: var(--v5-ink-3)">{{ activatingSubText }}</text>
          <view class="mx-auto rounded-full overflow-hidden" style="margin-top: var(--v5-space-4); max-width: 200px; height: 6px; background: var(--v5-surface-2)">
            <view class="h-full nx-progress-fill" style="background: var(--v5-brand)" />
          </view>
          <view v-if="orderId" class="inline-flex items-center justify-center active:opacity-80" :style="doneBtnStyle" role="button" tabindex="0" style="margin-top: var(--v5-space-4)" :aria-label="t.store.coTrackOrder" @click.stop="goTrack">
            <text>{{ t.store.coTrackOrder }}</text>
          </view>
        </view>

        <!-- === live === -->
        <view v-else-if="step === 'live'" class="nx-glass-card mx-4 rounded-2xl text-center nx-pop-in" :style="liveCardStyle">
          <view class="mx-auto grid place-items-center" :style="liveSpinnerWrapStyle">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
          </view>
          <text class="block" :style="liveTitleStyle">{{ completedOrderTitle }}</text>
          <text class="block" style="margin-top: var(--v5-space-1); font-size: 12px; color: var(--v5-ink-3); line-height: 1.45; padding: 0 4px">{{ orderPlacedBody }}</text>
          <view class="flex" style="margin-top: var(--v5-space-5); gap: var(--v5-space-2)">
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
    <NxSheet :open="purchasePolicyOpen" :title="policyCopy.entry" @close="purchasePolicyOpen=false">
      <view class="checkout-policy-body">
        <view v-if="policyHasDevice" class="checkout-policy-section"><text class="checkout-policy-title">{{ policyCopy.deviceScope }}{{ t.store.faq.refund.q }}</text><text>{{ t.store.faq.refund.a }}</text></view>
        <view v-for="section in [t.store.faq.location,t.store.faq.demand]" :key="section.q" class="checkout-policy-section"><text class="checkout-policy-title">{{ section.q }}</text><text>{{ section.a }}</text></view>
        <text class="checkout-policy-section">{{ policyCopy.review }}</text>
        <text v-if="promotionRoute && promotionCheckout?.hasRewardTerms" class="checkout-policy-section">{{ policyCopy.rewards }}</text>
        <view class="checkout-policy-links"><button class="checkout-policy-link" @click="navTo('/pages/onboarding/terms')">{{ auditCopy.terms }}</button><button class="checkout-policy-link" @click="navTo('/pages/me/risk-disclosure')">{{ t.me.riskRow }}</button></view>
      </view>
    </NxSheet>
    <template #pageFixed>
      <view v-if="promotionRoute && promotionCheckout?.footer" class="checkout-sticky">
        <view class="checkout-sticky-copy"><CheckoutAmount class="checkout-total" :value="promotionCheckout.footer.amountValue" :currency="promotionCheckout.footer.currency" /><text class="checkout-product-meta">{{ flowCopy.paymentTotal }}</text></view>
        <NxButton variant="primary" :disabled="promotionCheckout.footer.disabled" :label="promotionCheckout.footer.label" @click="promotionCheckout.footer.action" />
      </view>
      <view v-if="!promotionRoute && !keepCheckoutTarget && !pendingCheckoutCreate && !remoteTradeinRecoveryError && product && !trialQuoteScreenUnavailable && !receiptWriteFailure && (step === 'select-payment' || step === 'confirm')" class="checkout-sticky">
        <view class="checkout-sticky-copy"><CheckoutAmount class="checkout-total" :value="netPrice + cardFee" currency="USD" /><text class="checkout-product-meta">{{ flowCopy.paymentTotal }}</text></view>
        <NxButton variant="primary" :disabled="checkoutWalletRefreshing || (remoteApiEnabled && !checkoutWalletReadable) || purchaseUnavailable || quantitySwitching || paymentFlowBusy || checkoutLeaving" :busy="checkoutWalletRefreshing || quantitySwitching || paymentFlowBusy || checkoutLeaving" :label="isCard ? t.store.coContinueToPayment : t.store.coPayNow" @click="submitReview" />
      </view>
    </template>
    <NxSheet :open="checkoutLeaveError !== ''" :title="flowCopy.cancelFailed" @close="checkoutLeaveError = ''"><view class="checkout-exit-error"><text>{{ checkoutLeaveError }}</text><NxButton :label="t.store.catalogRetry" :busy="checkoutLeaving" @click="cancelCheckout" /></view></NxSheet>
    <NxSheet :open="paymentBlocked !== ''" :title="flowCopy.cannotPay" @close="paymentBlocked = ''"><view class="checkout-exit-error"><text>{{ paymentBlocked }}</text><NxButton :label="flowCopy.cancelOrder" :busy="checkoutLeaving" @click="paymentBlocked = ''; cancelCheckout()" /></view></NxSheet>
  </AppChassis>
</template>

<script setup lang="ts">
import { formatAmount as formatPlainAmount, formatGroupedAmount } from "@/lib/amount-display";
import { formatCheckoutReviewAmount } from '@/lib/checkout-review-amount';
import { ref, reactive, nextTick, computed, watch, onMounted, onUnmounted, type CSSProperties } from "vue";
import NxButton from "@/components/ui/nx-button.vue";
import NxSheet from "@/components/ui/nx-sheet.vue";
import CheckoutAmount from '@/components/checkout/CheckoutAmount.vue';
import CheckoutPaymentSheet from '@/components/checkout/CheckoutPaymentSheet.vue';
import CheckoutResult from '@/components/checkout/CheckoutResult.vue';
import CheckoutLegal from '@/components/checkout/CheckoutLegal.vue';
import { checkoutFlowCopy } from '@/lib/checkout-flow-copy';
import type { CreatedOrder } from '@/api/order-api';
import { useAuditUiCopy } from "@/i18n/audit-ui";
import { onHide, onLoad, onShow, onUnload, onBackPress } from "@dcloudio/uni-app";
import PromotionCheckout from '@/components/promotion/promotion-checkout.vue';
import { readPendingKeepCommand } from '@/lib/keep-command-recovery';
import { validatePromotionItems, type PromotionItem } from '@/api/promotion-api';
import { takeNavigationQuery } from '@/lib/route';
import { promotionCheckoutHref,promotionStoreHref,voucherEntryContext,type VoucherEntryContext } from '@/lib/promotion-entry';
import AppChassis from "@/components/app-chassis.vue";
import CheckoutRow from "@/components/store/checkout-row.vue";
import ChainPayment from "@/components/store/chain-payment.vue";
import CardPayment from "@/components/store/card-payment.vue";
import { useT } from "@/i18n/use-t";
import { commerceCopy } from '@/lib/commerce-review';
import { purchaseRecoveryCopy } from '@/lib/purchase-recovery-copy';
import { useLocaleStore } from "@/store/locale";
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
import { useOrders, type Order } from "@/store/orders";
import { useAuth } from "@/store/auth";
import { acquireAccountCommandKey, readAccountRow, writeAccountRow, releaseAccountCommandKey } from "@/store/account-scoped-storage";
import { rememberCheckoutOrder, recoverCheckoutOrder, forgetCheckoutOrder, readCheckoutTradein, finishCheckoutTradein, type CheckoutTradeinRecovery } from "@/lib/checkout-order-recovery";
import { readCheckoutCreate, rememberCheckoutCreate, forgetCheckoutCreate, type PendingCheckoutCreate } from '@/lib/checkout-create-recovery';
import { orderPaymentRejection } from '@/lib/order-payment-rejection';
import { CheckoutRouteFence, type CheckoutRouteScope } from "@/lib/checkout-route-fence";
import { postMoneyBill, postReceiptOnce, postReceiptOnly, reportStuckFunds, type ReceiptDraft } from "@/lib/money-receipt";
import { useVoucher } from "@/store/voucher";
import { useTradeinSheet } from "@/store/tradein-sheet";
import type { PurchaseEligibilitySnapshot } from "@/api/purchase-eligibility-api";
import { trialReservesSlotNow, useFreeTrial } from "@/store/free-trial";
import { useTrialLifecycleCopy } from "@/i18n/trial-lifecycle";
import { useTrialPurchaseCopy } from "@/i18n/trial-purchase";
import { useTrialConfig, computeDiscountedPrice, computeTrialOffset, resolveTrialCheckoutProductId } from "@/store/trial-config";
import { resolveTrialAt, accruedShadow } from "@/store/trial-boundary";
import { mockServerNow } from "@/store/server-time";
import { useDeviceEligibility } from "@/composables/use-device-eligibility";
import { usePurchaseGate } from "@/composables/use-purchase-gate";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useProductImage } from "@/composables/use-product-image";
import { navReplace, navReset, navBack, navTo } from "@/lib/route";
import type { DeviceKind } from "@/store/types";
import { confirm, toast, useUI } from "@/store/ui";
import { deviceE3Api, orderApi, purchaseEligibilityApi, remoteApiEnabled } from "@/api/runtime";
import { asApiError, isSettledRejection } from "@/api/errors";
import { executeSelectedPurchase } from "@/lib/selected-purchase-payment";
import { paidOrderReceipt } from "@/api/order-api";
import { parseTrialConvertReceipt } from "@/api/trial-api";
import { purchasePrincipalUsdt } from "@/api/device-e3-api";
import { beginOrderAction, clearOrderAction, markOrderActionPaid, readOrderAction } from "@/lib/order-command-fence";
import { readPaymentCommand } from "@/api/payment-command-api";
import { apiClient } from "@/api/runtime";
import { parseCanonicalTradeinResult } from "@/api/device-e3-api";
import type { CanonicalTradeinEligibility, CanonicalTradeinResult } from "@/api/device-e3-api";
import { resolvePurchaseEligibilityMessage } from "@/lib/purchase-eligibility-copy";
import { completeVerifiedMutation, handleNoActiveDeviceDecision, RemoteCapacityGate, StableCommandKey } from "@/domain/e20-capacity-coordinator";
import { resolveTradeinCheckoutPreflight } from "@/domain/tradein-checkout-preflight";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { productCatalogPresentation, productCatalogState, refreshProductCatalog } from "@/store/product-catalog";
import { refreshServerProductPhase } from "@/store/server-product-phase";
import { isProductAvailable } from "@/store/product-availability";
import { usePendingCheckout } from "@/store/pending-checkout";
import { formatCountdown, PENDING_CHECKOUT_WINDOW_MIN, reconcileInvoiceQuote, type PendingCheckoutMethod, type PendingCheckoutSession } from "@/store/pending-checkout-core";

// cap applies to ACTIVE slots, not inventory (source Sprint #146-1).

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
function formatAmount(value: Parameters<typeof formatPlainAmount>[0]): string {
  return formatGroupedAmount(value);
}
const locale = useLocaleStore();
const flowCopy = computed(() => checkoutFlowCopy(locale.code));
const createdCheckoutOrder = ref<CreatedOrder | null>(null);
const pendingCheckoutCreate = ref<PendingCheckoutCreate | null>(null);
// A definitive server refusal of this payment: shown with its reason and a cancel-order exit.
const paymentBlocked = ref('');
const hasOriginalCheckout = computed(() => !!createdCheckoutOrder.value || !!pendingCheckoutCreate.value);
const purchasePolicyOpen = ref(false);
function openCheckoutLegal(kind: 'aftersales' | 'terms' | 'risk') {
  if (kind === 'aftersales') purchasePolicyOpen.value = true;
  else navTo(kind === 'terms' ? '/pages/onboarding/terms' : '/pages/me/risk-disclosure');
}
// Reuse the published store FAQ verbatim; this sheet introduces no refund or
// warranty promises. Reward-specific recovery terms remain in PromotionTerms.
const policyCopy = computed(() => locale.code === 'zh'
  ? { entry:'购买、退款与售后说明', deviceScope:'设备商品（不含 Cloud Share）：', review:'请在付款前阅读用户协议及风险提示，确认所选商品的购买与售后条件。', rewards:'活动奖励的退款与回收条件，请查看结算页的「活动说明」。' }
  : locale.code === 'vi'
    ? { entry:'Mua hàng, hoàn tiền và hậu mãi', deviceScope:'Thiết bị (không gồm Cloud Share): ', review:'Trước khi thanh toán, hãy đọc thỏa thuận người dùng và thông tin rủi ro, đồng thời xác nhận điều kiện mua hàng và hậu mãi của sản phẩm đã chọn.', rewards:'Xem điều khoản ưu đãi tại trang thanh toán để biết cách xử lý và thu hồi phần thưởng khi hoàn tiền.' }
    : { entry:'Purchase, refund and after-sales information', deviceScope:'Devices (excluding Cloud Share): ', review:'Before paying, read the user agreement and risk disclosure and confirm the purchase and after-sales conditions for your selected products.', rewards:'See the offer terms on checkout for reward refund and recovery conditions.' });
const reviewCopy = computed(()=>commerceCopy(locale.code));
const legalCopy = computed(() => locale.code === 'zh'
  ? { before: '支付前请阅读', join: '及', end: '。' }
  : locale.code === 'vi'
    ? { before: 'Trước khi thanh toán, hãy đọc ', join: ' và ', end: '.' }
    : { before: 'Before paying, review ', join: ' and ', end: '.' });
const app = useApp();
const promotionRoute=ref<({activityId:string;items:PromotionItem[];orderNo?:string}&VoucherEntryContext)|null>(null);
const keepCheckoutTarget = ref<string | null>(null), keepCheckoutReadError = ref(false);
const promotionCheckout=ref<InstanceType<typeof PromotionCheckout>|null>(null);
const checkoutResultVisible = computed(() => promotionRoute.value ? promotionCheckout.value?.resultVisible === true : remoteApiEnabled && settledResultReplay.value);
const policyHasDevice=computed(()=>promotionRoute.value ? promotionCheckout.value?.hasDevicePolicy===true : !!product.value&&product.value.productType!=='SHARE');
onBackPress(options => { if (options.from === 'navigateBack') return false; requestCheckoutBack(); return true; });
const auth = useAuth();
const orders = useOrders();
const voucher = useVoucher();

// wallet icon path (lucide Wallet), credit-card path
// 平台支付收窄裁决:USDT 三网络 + 卡。
const WALLET_PATH = "M21 12V7H5a2 2 0 0 1 0-4h14v4";
const WALLET_PATH2 = "M3 5v14a2 2 0 0 0 2 2h16v-5";
const PAYMENT_METHODS = computed<PaymentMethod[]>(() => {
  if (remoteApiEnabled) return [{
    id: "nexgrid-wallet",
    label: t.value.wallet.title,
    hint: walletBalanceHint.value,
    iconPath: WALLET_PATH,
    iconPath2: WALLET_PATH2,
  }];
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
const auditCopy = useAuditUiCopy(), tradeinAvailable = ref(false);
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
const checkoutRouteFence = new CheckoutRouteFence();
let purchaseEligibilityRequestSequence = 0;
let activeCheckoutLoad: CheckoutRouteScope | null = null;
let checkoutRouteInitialized = false;
type PurchaseEligibilityResult = "eligible" | "ineligible" | "stale";
let trialCheckoutSource = false;
const remotePurchaseEligibility = ref<PurchaseEligibilitySnapshot | null>(null);
const remotePurchaseEligibilityStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
const checkoutWalletRefreshing = ref(false);
let checkoutWalletRefreshSequence = 0;
// The wallet payment row must state the server-confirmed available USDT before
// the user continues, with the same readability rule the wallet page uses
// (a receipt-only balance stays readable). Server re-validates at submit.
const checkoutWalletReadable = computed(() => !remoteApiEnabled
  || app.remoteFleetHasSnapshot || app.remoteWalletReceiptHasSnapshot);
const walletBalanceHint = computed(() => {
  if (!remoteApiEnabled) return "";
  if (!checkoutWalletReadable.value) {
    return checkoutWalletRefreshing.value || app.remoteFleetStatus === "idle" || app.remoteFleetStatus === "loading"
      ? t.value.help.loadingMore : t.value.wallet.fundsUnavailableTitle;
  }
  return `${t.value.wallet.usdtBalance} · ${formatAmount(app.user.usdtBalance)}`;
});

function checkoutRouteIdentity() {
  const account = captureAccountScope();
  return { accountKey: account.accountKey, accountEpoch: account.epoch, productNo: productId.value };
}

function beginCheckoutRoute(): CheckoutRouteScope {
  return checkoutRouteFence.begin(checkoutRouteIdentity());
}

function captureCheckoutRoute(): CheckoutRouteScope {
  return checkoutRouteFence.capture(checkoutRouteIdentity());
}

function invalidateCheckoutRoute(): void {
  checkoutRouteFence.invalidate();
  activeCheckoutLoad = null;
  remoteTradeinRecoveryBusy.value = false;
}

function isCurrentCheckoutRoute(scope: CheckoutRouteScope): boolean {
  return pageAlive
    && pageVisible
    && checkoutRouteFence.isCurrent(scope, checkoutRouteIdentity());
}

function clearRemotePurchaseEligibility(): void {
  purchaseEligibilityRequestSequence += 1;
  remotePurchaseEligibility.value = null;
  remotePurchaseEligibilityStatus.value = "idle";
}

async function refreshCheckoutWallet(): Promise<void> {
  if (!remoteApiEnabled) return;
  const request = app.captureRemoteAccountRequest();
  const sequence = ++checkoutWalletRefreshSequence;
  checkoutWalletRefreshing.value = true;
  try {
    await app.refreshRemoteFleet(request);
  } finally {
    if (sequence === checkoutWalletRefreshSequence) checkoutWalletRefreshing.value = false;
  }
}

/** A stale response is not a denial and must not drive a navigation or mutation. */
async function refreshPurchaseEligibility(scope = captureCheckoutRoute()): Promise<PurchaseEligibilityResult> {
  if (!remoteApiEnabled) return purchaseGate.value.blocked ? "ineligible" : "eligible";
  const sequence = ++purchaseEligibilityRequestSequence;
  if (!isCurrentCheckoutRoute(scope)) return "stale";
  remotePurchaseEligibilityStatus.value = "loading";
  try {
    const snapshot = await purchaseEligibilityApi.get(scope.productNo);
    if (sequence !== purchaseEligibilityRequestSequence || !isCurrentCheckoutRoute(scope)) return "stale";
    remotePurchaseEligibility.value = snapshot;
    remotePurchaseEligibilityStatus.value = "ready";
    return snapshot.eligible ? "eligible" : "ineligible";
  } catch {
    if (sequence !== purchaseEligibilityRequestSequence || !isCurrentCheckoutRoute(scope)) return "stale";
    remotePurchaseEligibility.value = null;
    remotePurchaseEligibilityStatus.value = "error";
    return "ineligible";
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

function recoverKeepBeforePurchase(targets: string[]): boolean {
  keepCheckoutTarget.value = null; keepCheckoutReadError.value = false;
  if (!remoteApiEnabled) return false;
  for (const target of targets) {
    try { if (!readPendingKeepCommand(app.accountKey, target)) continue; }
    catch { keepCheckoutReadError.value = true; }
    keepCheckoutTarget.value = target;
    productId.value = target;
    tradein.showKeepRecovery(target as DeviceKind);
    return true;
  }
  return false;
}

onLoad(async (options) => {
  const pendingQuery=new URLSearchParams(takeNavigationQuery('/pages/store/checkout').replace(/^\?/,''));
  const navigationQuery:Record<string,string>={};pendingQuery.forEach((value,key)=>{navigationQuery[key]=value;});
  const o = { ...navigationQuery, ...(options || {}) } as Record<string, string>;
  if (o.items !== undefined || o.activityId || o.voucherId || o.promotion==='1') {
    try {
      const items:PromotionItem[]=o.items ? JSON.parse(o.items.trim().startsWith('%')?decodeURIComponent(o.items):o.items) : o.product ? [{productNo:o.product,quantity:Number(o.quantity??1)}] : [];
      if(!o.orderNo)validatePromotionItems(items);
      const context=voucherEntryContext(o);
      promotionRoute.value={activityId:context.voucherId?'':o.activityId??'',items,orderNo:o.orderNo,...context};
    } catch { toast.warn(t.value.promotion.errorNote);void navTo('/store'); }
    return;
  }
  trialCheckoutSource = o.source === "trial";
  // accept ?product= (canonical) or ?id= via the one canonical product resolver.
  if (o.product) productId.value = resolveTrialCheckoutProductId(o.product) ?? o.product;
  else if (o.id) productId.value = resolveTrialCheckoutProductId(o.id) ?? o.id;
  resumeSessionId = o.resume || null;
  const routeScope = beginCheckoutRoute();
  checkoutRouteInitialized = true;
  await initializeCheckout(routeScope);
});

async function initializeCheckout(routeScope: CheckoutRouteScope): Promise<void> {
  activeCheckoutLoad = routeScope;
  try {
    // A durable server order is a recovery route, never a fresh purchase. It has
    // priority over catalog/eligibility gates so a newly denied purchase cannot
    // hide an already committed original order.
    if (remoteApiEnabled && await resumeServerOrder(routeScope)) return;
    if (!isCurrentCheckoutRoute(routeScope)) return;

    const [catalogReady] = await Promise.all([
      refreshProductCatalog(true),
      refreshServerProductPhase(true),
    ]);
    // Remote 商品授权只取 catalog.available；H1 节奏镜像失败不能跳过商城发布门。
    if (!isCurrentCheckoutRoute(routeScope) || !catalogReady) return;
    // 上架节奏门(FEAT-DEV02b,深链防线,先于购买门):未正式上架 SKU 仅当
    // 「携置换上下文 + 抢先购窗口(开关默认关)」才放行;商城正门不受抢先购影响。
    const pp = getProduct(routeScope.productNo);
    // 三道跳转门任一命中且带 ?resume=:这张票在这个 SKU 上暂时付不了。**不销毁**它 —— 用户可能已经按地址转账,
    // 静默删票 = 地址与金额从本地消失、资金孤儿化(审计 R9 P1;R3 曾为断「浮动条→门→弹回」循环而删票,方向反了)。
    // 处置:票保留在册,明确告知「待支付订单已保留 / 已转账请联系客服」;到点自然作废,或用户从扫码步取消。
    const dropResumeInvoice = () => {
      if (!resumeSessionId) return;
      if (pending.get(resumeSessionId)?.productId === routeScope.productNo) toast.warn(t.value.store.pendingResumeBlocked);
      resumeSessionId = null;
    };
    if (!pp) {
      dropResumeInvoice();
      const unavailableCopy = trialCheckoutSource ? t.value.store.trialProductUnavailable : t.value.store.productUnavailable;
      if (trialCheckoutSource) navBack("/pages/me/trial");
      else navTo("/store");
      setTimeout(() => { uni.showToast({ title: unavailableCopy, icon: "none", duration: 2600 }); }, 120);
      return;
    }
    if (!hasOriginalCheckout.value && pp.inventoryMode === "FINITE" && (pp.stock ?? 0) <= 0) {
      dropResumeInvoice();
      const unavailableCopy = trialCheckoutSource ? t.value.store.trialProductUnavailable : t.value.store.temporarilyOutOfStock;
      if (trialCheckoutSource) navBack("/pages/me/trial");
      else navTo("/store");
      setTimeout(() => { uni.showToast({ title: unavailableCopy, icon: "none", duration: 2600 }); }, 120);
      return;
    }
    const trialConversion = trialQuoteAt(mockServerNow()).applied;
    if (!trialConversion && pp.purchaseBlocked) {
      dropResumeInvoice();
      uni.showToast({ title: t.value.store.specUnavailable, icon: "none" });
      navTo("/store");
      return;
    }
    if (!trialConversion && !isProductAvailable(pp, phase.value)) {
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
    const eligibility = trialConversion ? "eligible" : await refreshPurchaseEligibility(routeScope);
    if (!isCurrentCheckoutRoute(routeScope) || eligibility === "stale") return;
    if (eligibility === "ineligible") {
      dropResumeInvoice();
      uni.showToast({ title: purchaseEligibilityFailureCopy(), icon: "none" });
      if (resolvePurchaseEligibilityMessage(remotePurchaseEligibilityStatus.value, remotePurchaseEligibility.value) === "quotaDepleted") {
        navTo(`/pages/store/detail?id=${routeScope.productNo}`);
      } else {
        navTo("/pages/team/quota");
      }
      return;
    }
    // Resuming a local pending invoice is not a new checkout and remains after
    // the server-order recovery branch above.
    if (resumeSessionId && resumePendingSession(resumeSessionId)) return;
    if (!isCurrentCheckoutRoute(routeScope)) return;
    // New Share purchases use the ordinary server quote. Recovery above keeps
    // its original order/session rather than migrating a committed intent.
    if (remoteApiEnabled && pp.productType === 'SHARE' && !trialConversion) {
      promotionRoute.value = { activityId: '', items: [{ productNo: pp.id, quantity: 1 }] };
      return;
    }
    await fireTradeinIntercept();
  } finally {
    if (activeCheckoutLoad?.generation === routeScope.generation
      && activeCheckoutLoad.accountKey === routeScope.accountKey
      && activeCheckoutLoad.productNo === routeScope.productNo) {
      activeCheckoutLoad = null;
      quantityReady.value = true;
    }
  }
}

const catalogStatus = computed(() => productCatalogState.status);
const product = computed<Product | undefined>(() => !productId.value || (remoteApiEnabled && catalogStatus.value !== "ready") ? undefined
  : remoteApiEnabled
    ? productCatalogPresentation.value?.products.find((entry) => entry.id === productId.value)
    : getProduct(productId.value));
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
const trialCopy = useTrialLifecycleCopy();
const purchaseCopy = useTrialPurchaseCopy();
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
  /** FEAT-TRIAL05 (server quote only): fixed early discount and the quote version echoed to convert. */
  earlyDiscountUSD: number;
  quoteVersion: string | null;
}
const NO_TRIAL: TrialQuote = { applied: false, promo: 0, offsetUSD: 0, remainderUSD: 0, shadowNEX: 0, earlyDiscountUSD: 0, quoteVersion: null };

/** 单一解析:给定时刻解析一次试用状态机,派生本页全部试用金额(纯函数,零落盘)。 */
function trialQuoteAt(now: number): TrialQuote {
  const cfg = trialCfg.value;
  const r = resolveTrialAt(freeTrial.snapshot(), now, cfg);
  const trialProductId = resolveTrialCheckoutProductId(cfg.trialProductId);
  if ((r.status !== "active" && r.status !== "grace") || !trialProductId || productId.value !== trialProductId) return NO_TRIAL;
  // A server quote carries every amount convert() settles, including the
  // full-term rewards and the early discount; display it verbatim.
  const serverQuote = remoteApiEnabled ? freeTrial.authoritativeQuote ?? null : null;
  if (serverQuote) {
    return {
      applied: true,
      promo: serverQuote.promoDiscountUSD,
      offsetUSD: serverQuote.offsetUSD,
      remainderUSD: serverQuote.remainderUSD,
      shadowNEX: serverQuote.rewardNEX,
      earlyDiscountUSD: serverQuote.earlyDiscountUSD,
      quoteVersion: serverQuote.quoteVersion,
    };
  }
  // Remote credit is the same server projection shown by free-trial.liveShadow*.
  // Only local mode accrues by time; recomputing remote credit would quote a
  // different discount from the trial page and the conversion authority.
  const acc = remoteApiEnabled
    ? { usd: freeTrial.authoritativeShadowUSD, nex: freeTrial.authoritativeShadowNEX }
    : accruedShadow(r, now, cfg);
  const split = remoteApiEnabled
    ? { offsetUSD: freeTrial.authoritativeOffsetUSD ?? 0, remainderUSD: freeTrial.authoritativeRemainderUSD ?? 0 }
    : computeTrialOffset(cfg, r.status === "active" ? acc.usd : r.shadowFrozenAtUSD);
  return {
    applied: true,
    promo: computeDiscountedPrice(cfg).discount,
    offsetUSD: split.offsetUSD,
    remainderUSD: split.remainderUSD,
    shadowNEX: remoteApiEnabled || r.status === "active" ? acc.nex : r.shadowFrozenAtNEX,
    earlyDiscountUSD: 0,
    quoteVersion: null,
  };
}

/** 展示侧的那一次解析 —— 确认页渲染的每个数字都出自它。 */
const trialView = computed(() => hasOriginalCheckout.value ? NO_TRIAL : trialQuoteAt(nowTick.value));
// Until the claim snapshot has been read, an ordinary full-price order could
// accidentally bypass an existing trial. Keep review/payment closed on that read.
// An early quote past its original-term end is stale too: never show or pay a lapsed offer.
const trialEarlyQuoteLapsed = computed(() => {
  const quote = freeTrial.authoritativeQuote;
  return !!quote?.earlyPurchase && quote.earlyEndsAt !== null && nowTick.value >= quote.earlyEndsAt;
});
const trialQuoteIncomplete = computed(() => trialEarlyQuoteLapsed.value
  || ((freeTrial.status === "active" || freeTrial.status === "grace")
    && (freeTrial.authoritativeOffsetUSD === null || freeTrial.authoritativeRemainderUSD === null
      || freeTrial.authoritativePriceUSD === null)));
const trialQuoteUnavailable = computed(() => remoteApiEnabled && !hasOriginalCheckout.value && (freeTrial.authorityStatus !== "ready" || trialQuoteIncomplete.value));
// The 4s trial poll marks the authority loading while it re-reads. Keep the last confirmed quote on
// screen meanwhile instead of swapping the page out (which also threw the scroll back to the top);
// every action still waits on trialQuoteUnavailable.
const trialQuoteScreenUnavailable = computed(() => remoteApiEnabled && !hasOriginalCheckout.value && ((freeTrial.authorityStatus !== "ready"
  && !(freeTrial.authorityStatus === "loading" && freeTrial.authorityServerState !== null)) || trialQuoteIncomplete.value));
const trialConversionMode = computed(() => trialView.value.applied);
const purchaseSubtotal = computed(() => createdCheckoutOrder.value?.subtotalUsdt ?? pendingCheckoutCreate.value?.subtotal
  ?? (remoteApiEnabled && trialConversionMode.value ? freeTrial.authoritativePriceUSD ?? 0 : product.value?.price ?? 0));
const promoDiscount = computed(() => trialView.value.promo);
const trialOffsetView = computed(() => trialView.value);
const promoDiscountText = computed(() => formatAmount(promoDiscount.value));
const trialOffsetText = computed(() => formatAmount(trialOffsetView.value.offsetUSD));
const trialEarlyDiscountText = computed(() => formatAmount(trialOffsetView.value.earlyDiscountUSD));
watch(trialEarlyQuoteLapsed, (lapsed) => { if (lapsed) void freeTrial.refreshRemote(true); });
// What the trial purchase credits right after payment (server quote convert() settles).
const trialCreditText = computed(() => {
  const quote = remoteApiEnabled && trialConversionMode.value ? freeTrial.authoritativeQuote : null;
  if (!quote) return "";
  const nex = `${formatGroupedAmount(quote.rewardNEX)} UVT`;
  return quote.remainderUSD > 0 ? `${formatGroupedAmount(quote.remainderUSD)} USDT · ${nex}` : nex;
});
const promoRowLabel = computed(() => fmt(t.value.store.coRowTrialDiscount, {
  pct: (trialCfg.value.discountRate * 100).toFixed(0), cap: String(Number(trialCfg.value.discountCapUSD)),
}));

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
const VOUCHER_PREFERENCE_KEY = 'nexgrid-checkout-voucher-preference-v1';
const voucherAutomatic = ref(true);
const voucherSelecting = ref(false);
watch([()=>app.accountKey,()=>app.accountBindingEpoch,productId],()=>{
  try { voucherAutomatic.value=readAccountRow<Record<string,boolean>>(VOUCHER_PREFERENCE_KEY,app.accountKey,true)?.[productId.value]!==false; }
  catch { voucherAutomatic.value=false; }
},{immediate:true});
function canChangeVoucher():boolean {
  if (remoteApiEnabled && trialConversionMode.value) return false;
  return pageAlive&&pageVisible&&quantityReady.value&&checkoutRouteInitialized&&!activeCheckoutLoad
    &&!promotionRoute.value&&!!product.value&&!purchaseUnavailable.value
    &&(step.value==='select-payment'||step.value==='confirm')
    &&!voucherSelecting.value&&!quantitySwitching.value&&!confirming&&!purchaseConfirmationOpen&&dialogsOpen===0
    &&!remoteTradeinRecoveryRequired.value&&!activeSession.value&&!resumeSessionId&&!orderId.value
    &&!remoteOrderFailure.value&&!receiptWriteFailure.value&&!createdCheckoutOrder.value&&!pendingCheckoutCreate.value;
}
async function selectAutomaticVoucher(enabled:boolean):Promise<void> {
  if(!canChangeVoucher())return;
  const scope=captureCheckoutRoute();voucherSelecting.value=true;
  try {
    if(await resumeServerOrder(scope)||!isCurrentCheckoutRoute(scope))return;
    const commands=readAccountRow<RemoteCheckoutCommands>(REMOTE_CHECKOUT_COMMANDS_KEY,scope.accountKey,true);
    if(Object.keys(commands?.commands??{}).some(intent=>intent.split('|')[0]===scope.productNo)){
      toast.warn(t.value.store.coRecoverOriginalOrder);return;
    }
    if(enabled&&!await voucher.refreshRemote())throw new Error('VOUCHER_STATE_UNAVAILABLE');
    if(!isCurrentCheckoutRoute(scope))return;
    const preferences=readAccountRow<Record<string,boolean>>(VOUCHER_PREFERENCE_KEY,scope.accountKey,true)??{};
    if(!writeAccountRow(VOUCHER_PREFERENCE_KEY,scope.accountKey,{...preferences,[scope.productNo]:enabled}))throw new Error('STORAGE_UNAVAILABLE');
    voucherAutomatic.value=enabled;step.value='select-payment';
  }catch{if(isCurrentCheckoutRoute(scope))toast.warn(t.value.store.coRecoverOriginalOrder);}
  finally{voucherSelecting.value=false;}
}
const voucherMatch = computed(() => {
  if (remoteApiEnabled && trialConversionMode.value) return null;
  if(!voucherAutomatic.value)return null;
  const p = product.value;
  if (!p) return null;
  // Canonical E3 submit owns the complete quote and wallet debit. Client-side
  // voucher stacking is not part of that command and therefore fails closed.
  if (remoteApiEnabled && tradein.appliedTradein?.canonicalQuote) return null;
  return voucher.bestVoucherFor(p.id, p.price, trialConversionMode.value ? { stackWithTrial: true } : undefined);
});
const voucherDiscount = computed(() => createdCheckoutOrder.value?.discountUsdt ?? pendingCheckoutCreate.value?.discount ?? voucherMatch.value?.discountUSD ?? 0);
const hasVoucher = computed(() => voucherDiscount.value > 0);
const voucherDiscountText = computed(() => formatAmount(voucherDiscount.value));

// ─── FEAT-DEV02 旧机抵扣 ─────────────────────────────────────────────────
// retire 流(设备页下架)或本页 choice 弹层确认后,tradein.appliedTradein 携带
// {oldDeviceId, targetKind};目标与本单 SKU 匹配且旧机仍在时生效；远端旧任务由升级命令取消。
// Mock 路径继续要求无运行中任务。
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
  if (!device || (!remoteApiEnabled && isDeviceTaskBlocked(device))) return null;
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
  if (!device || (!remoteApiEnabled && isDeviceTaskBlocked(device))) return null;
  const credit = computeTradeInCredit(device.paidPriceUsdt ?? 0, Math.max(0, device.cumulativeEarningsUsdt ?? 0), p.price);
  return credit > 0 ? { device, credit } : null;
}
const tradeinCredit = computed(() => appliedTradeinView.value?.credit ?? 0);
const hasTradein = computed(() => tradeinCredit.value > 0);
// 抵扣展示面统一使用两位小数和相同的十进制舍入。
const tradeinCreditText = computed(() => formatAmount(tradeinCredit.value));
const tradeinChipText = computed(() => {
  const ti = appliedTradeinView.value;
  if (!ti) return "";
  return deviceName(t.value, ti.device) + ' · ' + reviewMoney(tradeinCredit.value, true);
});
const tradeinPlacementText = computed(() => !appliedTradeinView.value ? ""
  : (appliedTradeinView.value.canonicalQuote ? appliedTradeinView.value.canonicalQuote.targetDeviceStatus === "ACTIVE"
    : appliedTradeinView.value.device.activatedAt != null)
    ? t.value.tradein.inheritActiveHint : t.value.tradein.inheritInventoryHint);
const removedTradein = ref(false);
const reAddingTradein = ref(false);
function removeTradein() {
  if (remoteApiEnabled && remoteTradeinRecoveryRequired.value) {
    toast.warn(t.value.tradein.errPleaseRetry);
    return;
  }
  tradein.clearApplied();
  removedTradein.value = true;
}
// 移除后的找回入口(PR-D 债 #2:intercept 一次性,移除后本页原无恢复路径)。
async function reAddTradein() {
  if (reAddingTradein.value || (remoteApiEnabled && remoteCapacityGate.pending)) return;
  if (remoteApiEnabled && remoteTradeinRecoveryRequired.value) {
    toast.warn(t.value.tradein.errPleaseRetry);
    return;
  }
  const scope = captureCheckoutRoute();
  reAddingTradein.value = true;
  interceptFired = false;
  try {
    const opened = await fireTradeinIntercept(true);
    if (!isCurrentCheckoutRoute(scope)) return;
    if (opened) removedTradein.value = false;
    else if (opened === false) toast.warn(t.value.tradein.errPleaseRetry);
  } finally {
    reAddingTradein.value = false;
  }
}

const netPrice = computed(() => {
  if (createdCheckoutOrder.value) return createdCheckoutOrder.value.amountUsdt;
  if (pendingCheckoutCreate.value) return pendingCheckoutCreate.value.amount;
  const canonical = remoteApiEnabled ? appliedTradeinView.value?.canonicalQuote ?? null : null;
  if (canonical) return canonical.payableUsdt;
  return Math.max(
    0,
    +(
      (purchaseSubtotal.value -
        voucherDiscount.value -
        tradeinCredit.value -
        promoDiscount.value -
        trialOffsetView.value.offsetUSD -
        trialOffsetView.value.earlyDiscountUSD)
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
// FEAT-DEV02: physical catalog SKUs (v2/P2 included) use the device trade-in
// capacity preflight. SHARE products do not support physical-device trade-in;
// their ordinary purchase still obeys the shared activation cap. Fire on first mount only: skip when a retire
// context already targets this SKU (arrived from the devices-page flow) →
// choice (owns ≥1 retirable device) → slot-full replace → normal payment.
const KNOWN_KINDS: DeviceKind[] = [
  "phone",
  "stellarbox-s1",
  "stellarbox-pro",
  "stellarbox-pro-v2",
  "stellarrack-p1",
  "stellarrack-p2",
];
let interceptFired = false;
let checkoutCapacityRead: Promise<boolean | undefined> | null = null;
const remoteCapacityGate = reactive(new RemoteCapacityGate());
watch([() => app.accountKey, () => app.accountBindingEpoch], () => {
  interceptFired = false;
  tradeinAvailable.value = false;
  remoteCapacityGate.reset();
  checkoutCapacityRead = null;
  checkoutWalletRefreshSequence += 1;
  checkoutWalletRefreshing.value = false;
  quantityReady.value = false;
  invalidateCheckoutRoute();
  clearRemotePurchaseEligibility();
  // Checkout progress is money state owned by one account. Clear every
  // projection immediately so a late response cannot expose account A's order
  // after the session has switched to account B.
  confirming = false;
  orderId.value = null;
  createdCheckoutOrder.value = null;
  pendingCheckoutCreate.value = null;
  paymentBlocked.value = '';
  settledResultReplay.value = false;
  checkoutLeaveError.value = '';
  checkoutLeaving.value = false;
  closePaymentSheet();
  remoteOrderFailure.value = null;
  receiptWriteFailure.value = null;
  receiptRetrying.value = false;
  restoreReceiptRecovery();
  remoteTradeinRecoveryRequired.value = false;
  keepCheckoutTarget.value = null; keepCheckoutReadError.value = false;
  remoteTradeinRecoveryError.value = false;
  remoteTradeinRecoveryBusy.value = false;
  remoteOrderCommandKey.clear();
  activeSession.value = null;
  // 正开着的确认框渲染的是上一个账号的商品名与金额 —— 一并收掉。
  if (dialogsOpen > 0) useUI().clearConfirmsBy(dialogOwner);
  step.value = "select-payment";
  // Cookie restoration can invalidate onLoad's guest scope before its new-order
  // gates run. Resume the same full read path for the newly bound account;
  // initializeCheckout still recovers an original command before new quotes.
  if (remoteApiEnabled && checkoutRouteInitialized && pageAlive && pageVisible) void initializeCheckout(beginCheckoutRoute());
});
async function fireTradeinIntercept(interactive = false): Promise<boolean | undefined> {
  if (interceptFired) return;
  interceptFired = true;
  // FEAT-TRIAL02: the trial conversion checkout doesn't intercept with trade-in —
  // promo + credit + trade-in + voucher quad-stacking is undefined by spec, and
  // the conversion order is the trial device itself (slot exchange), not an
  // upgrade off an old unit. Normal (non-trial) checkouts intercept as before.
  if (trialConversionMode.value) return;
  const p = getProduct(productId.value);
  if (!p) return;
  if (p.productType === "SHARE") return;
  if (!KNOWN_KINDS.includes(p.id as DeviceKind)) return;
  const kind = p.id as DeviceKind;
  if (tradein.appliedTradein?.targetKind === kind) return;
  if (remoteApiEnabled) {
    const requestScope = captureCheckoutRoute();
    // Capacity is the mandatory server safety gate; trade-in eligibility is an
    // optional enhancement. A transient eligibility failure must not reject an
    // otherwise ordinary purchase, matching the prototype's local flow where
    // the absence of a trade-in candidate simply continues to payment.
    let eligibility: CanonicalTradeinEligibility | null = null;
    checkoutCapacityRead = remoteCapacityGate.resolve(
      async () => {
        const result = await resolveTradeinCheckoutPreflight(
          deviceE3Api.eligibility(kind), deviceE3Api.capacityQuote(kind),
        );
        eligibility = result.eligibility;
        return result.capacity;
      },
      () => {},
      () => isCurrentCheckoutRoute(requestScope),
    ).then(async (quote) => {
      if (!isCurrentCheckoutRoute(requestScope)) return;
      const sourceIds = eligibility?.sources.filter((source) => source.eligible)
        .map((source) => String(source.sourceDeviceId)) ?? [];
      if (quote.decision === "REPLACE_REQUIRED") {
        tradeinAvailable.value = true;
        if (!interactive) return true;
        if (eligibility?.eligible && sourceIds.length > 0) {
          tradein.showChoice(kind, p.price, sourceIds);
        } else {
          tradein.showCanonicalReplace(kind, quote.payableUsdt, quote);
        }
        return true;
      }
      if (quote.decision === "NO_ACTIVE_DEVICE") {
        await handleNoActiveDeviceDecision({
          notify: () => {
            if (isCurrentCheckoutRoute(requestScope)) toast.warn(t.value.tradein.errNoActiveDevice);
          },
          refreshFleet: async () => {
            if (!isCurrentCheckoutRoute(requestScope)) return;
            await app.refreshRemoteFleet();
          }, // best-effort:失败自吞
        });
        return;
      }
      // CAPACITY_AVAILABLE: server says the checkout is not capped; continue
      // through the ordinary server order path without opening a local sheet.
      if (eligibility?.eligible && sourceIds.length > 0) {
        tradeinAvailable.value = true;
        if (!interactive) return true;
        if (!isCurrentCheckoutRoute(requestScope)) return;
        tradein.showChoice(kind, p.price, sourceIds);
        return true;
      }
      return false;
    }).catch((): undefined => {
      if (!isCurrentCheckoutRoute(requestScope)) return;
      toast.warn(t.value.store.coCapacityUnavailable);
    });
    return checkoutCapacityRead;
  }
  // Mock/demo keeps the isolated local eligibility composer.
  const { canTradeIn, tradeInSources, capped } = useDeviceEligibility(kind);
  // Local/demo mode retains its isolated composer. Remote mode above never
  // reaches browser-owned replacement or order/device writes.
  if (canTradeIn.value && tradeInSources.value.length > 0) {
    tradeinAvailable.value = true;
    if (!interactive) return true;
    tradein.showChoice(kind, p.price, tradeInSources.value.map((d) => d.id));
    return true;
  }
  if (capped.value) {
    tradeinAvailable.value = true;
    if (!interactive) return true;
    tradein.showReplace(kind, p.price);
    return true;
  }
  return false;
}
async function retryCheckoutCapacity() {
  if (remoteCapacityGate.pending) { await checkoutCapacityRead; return; }
  interceptFired = false;
  await fireTradeinIntercept();
}
const checkoutBackHref = computed(() => promotionRoute.value
  ? promotionStoreHref(promotionRoute.value.activityId,promotionRoute.value)
  : product.value ? '/pages/store/detail?id=' + encodeURIComponent(product.value.id) : '/pages/store/store');
const { imageSrc: checkoutImage, imageError: checkoutImageError } = useProductImage(() => product.value?.imageUrl);
const voucherDetailsOpen = ref(false);

const step = ref<Step>("select-payment");
const payment = ref<string>(remoteApiEnabled ? "nexgrid-wallet" : "usdt-trc20");
const quantitySwitching = ref(false);
const quantityReady = ref(false);
const orderId = ref<string | null>(null);
const remoteOrderFailure = ref<string | null>(null);
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
const remoteTradeinRecoveryError = ref(false);
const remoteTradeinRecoveryBusy = ref(false);
// Snapshot "was empty before this checkout" BEFORE createOrder increments it.
const wasEmptyBefore = ref(orders.orders.length === 0);
const firstOrderCelebrating = ref(false);
// Remote purchases settle in one server transaction. Once the receipt and order
// readback prove payment and activation, replay the original confirmed →
// activating → live presentation (PRD §7.3.1/§7.3.4). Time only paces a result
// that is already settled; it never decides one.
const settledResultReplay = ref(false);
let forgetSettledOrder: (() => void) | null = null;
function presentSettledPurchase(firstHardwareOrder: boolean, onResultShown: (() => void) | null = null) {
  firstOrderCelebrating.value = firstHardwareOrder;
  forgetSettledOrder = onResultShown;
  settledResultReplay.value = true;
  step.value = "confirmed";
  // CheckoutResult renders the authoritative result and owns only its
  // presentation timing; the order status alone decides success.
  void nextTick(() => { if (pageAlive && settledResultReplay.value) { forgetSettledOrder?.(); forgetSettledOrder = null; } });
}
const checkoutResultState = computed(() => completedOrder.value?.status === 'activated' ? 'activated'
  : completedOrder.value?.status === 'inventory' ? 'inventory' : 'processing');
async function refreshCheckoutResult() {
  if (!orderId.value) return;
  await orders.ensureRemoteOrder(orderId.value);
}
// Open the warehouse on a fresh stack: back returns to Me, never to this finished result.
function viewPurchasedDevices() { void navReset('/pages/me/devices'); }
// First paid order and the item is hardware (Cloud Share is not a device).
function isFirstHardwareOrder(orderNo: string): boolean {
  return product.value?.productType !== "SHARE"
    && !orders.orders.some((order) => order.id !== orderNo && order.paidAt != null);
}

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
const cappedRaw = computed(() => (app.remoteSlotsUsed ?? app.activeSlotCount + reservedSlots.value) >= app.slotCap);
const checkoutCapacityRequired = computed(() => remoteApiEnabled && !trialConversionMode.value
  && !freeTrial.hasPendingConversion() && product.value?.productType !== "SHARE"
  && KNOWN_KINDS.includes(productId.value as DeviceKind));
const checkoutCapacityMessage = computed(() => remoteCapacityGate.pending || !quantityReady.value ? t.value.store.coCapacityChecking
  : remoteCapacityGate.decision === "REPLACE_REQUIRED" ? slotsFullText.value
  : remoteCapacityGate.decision === "NO_ACTIVE_DEVICE" ? t.value.tradein.errNoActiveDevice
  : t.value.store.coCapacityUnavailable);
// Conversion order = the trial's own reserved slot converts into the real
// device (slot exchange) — don't scare the user with a slots-full warning that
// counts the very slot this purchase frees (only warn when real actives cap).
const capped = computed(() => !hasTradein.value && (
  trialConversionMode.value ? (app.remoteSlotUsage ? app.remoteSlotUsage.slotsUsed - (app.remoteSlotUsage.trialSlotCount ?? reservedSlots.value) : app.activeSlotCount) >= app.slotCap : cappedRaw.value
));

// ── derived text ──
const priceText = computed(() => formatAmount(purchaseSubtotal.value));
// Header "Total" = device price after voucher (still excludes card fee, matching
// the pre-voucher convention). Card fee is computed on the discounted subtotal.
const netPriceText = computed(() => formatAmount(netPrice.value));
// 算法也单源:整数域(cent × bps)与入金同一套。浮点直乘再 toFixed 会在半分边界
// 被 IEEE754 压低一分(实测 14 个金额少收 1 分),同一笔费率两种算法两个答案。
const cardFee = computed(() => (remoteApiEnabled && appliedTradeinView.value?.canonicalQuote
  ? 0 : isCard.value ? cardFeeUsd(netPrice.value) : 0));
const cardFeeText = computed(() => formatAmount(cardFee.value));
// The legacy card debit is settled in cents; keep its sum's binary float noise
// out of the display while retaining canonical fee-free USDT precision.
const confirmTotalText = computed(() => cardFee.value > 0
  ? formatPlainAmount(netPrice.value + cardFee.value).replace(/\B(?=(\d{3})+\.)/g, ',')
  : formatAmount(netPrice.value));
const paymentLabel = computed(() => PAYMENT_METHODS.value.find((m) => m.id === payment.value)?.label ?? "");
const slotsFullText = computed(() => fmt(t.value.store.coSlotsFull, { max: app.slotCap }));
const activatingSubText = computed(() => {
  const raw = completedOrder.value?.dataCenter?.trim();
  if (!raw) return reviewCopy.value.provisioningLocationPending;
  const name = raw.toLowerCase();
  const dc = /^frankfurt(?: dc| data center)?$/.test(name) ? t.value.store.coDcFrankfurt : /^singapore(?: dc| data center)?$/.test(name) ? t.value.store.coDcSingapore : raw;
  return fmt(t.value.store.coActivatingSub, { dc });
});
const completedOrder = computed(() => orders.orders.find(order => order.id === orderId.value));
const completedOrderTitle = computed(() => completedOrder.value?.status === 'activated'
  ? t.value.orders.statusActivated : completedOrder.value?.status === 'inventory' ? t.value.orders.statusInventory : t.value.orders.title);
const orderPlacedBody = computed(() => completedOrder.value?.status === 'activated'
  ? t.value.orders.activatedToast : completedOrder.value?.status === 'inventory' ? t.value.orders.inventoryToast : t.value.orders.resultReadback);

// ── stepper ──
const stepLabels = computed(() => [
  { key: 'review', label: t.value.promotion.steps[0] }, { key: 'payment', label: t.value.promotion.steps[1] }, { key: 'activation', label: t.value.promotion.steps[2] },
]);
const stepDisplay = computed(() => ['confirmed','activating','live'].includes(step.value) ? 2 : ['pay-instructions','awaiting'].includes(step.value) ? 1 : 0);
async function submitReview() {
  const scope = captureCheckoutRoute();
  // A tap during the 4s trial re-read waits for that read, then goes on with the fresh authority.
  if (trialQuoteUnavailable.value && !trialQuoteScreenUnavailable.value) {
    const ready = await freeTrial.refreshRemote();
    if (!ready || !isCurrentCheckoutRoute(scope)) return;
  }
  if (trialQuoteUnavailable.value || quantitySwitching.value || (remoteApiEnabled && !checkoutWalletReadable.value)) return;
  // One tap joins the in-flight authority read (or retries its failed read),
  // then continues only for this same checkout. No second tap or timed delay.
  if (step.value === 'select-payment' && !createdCheckoutOrder.value && !pendingCheckoutCreate.value
      && checkoutCapacityRequired.value && !remoteCapacityGate.canConfirm(Boolean(appliedTradeinView.value?.canonicalQuote))) {
    await retryCheckoutCapacity();
    if (!isCurrentCheckoutRoute(scope)) return;
    if (!remoteCapacityGate.canConfirm(Boolean(appliedTradeinView.value?.canonicalQuote))) return;
  }
  if (step.value === 'select-payment') { goConfirm(); await nextTick(); if (!isCurrentCheckoutRoute(scope)) return; }
  if (step.value === 'confirm') await requestConfirmPay();
}

function selectPayment(id: string) {
  if (step.value === "confirm") step.value = "select-payment";
  payment.value = id;
}

function goConfirm() {
  if (trialQuoteUnavailable.value) return;
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
  if (checkoutCapacityRequired.value && !remoteCapacityGate.canConfirm(hasCanonicalTradein)) {
    toast.warn(checkoutCapacityMessage.value);
    if (!remoteCapacityGate.pending && !remoteCapacityGate.decision) void retryCheckoutCapacity();
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

let purchaseConfirmationOpen = false;
const paymentSheetOpen = ref(false);
const paymentSheetAmount = ref(0);
const paymentFlowBusy = ref(false);
// The review page stays in dollars; the payment sheet shows the chosen method's currency.
function reviewMoney(amount: Parameters<typeof formatCheckoutReviewAmount>[0], discount = false, unit = false) { return formatCheckoutReviewAmount(amount, 'USD', { discount, unit }); }
const checkoutLeaving = ref(false);
let checkoutLeaveAttempt = 0;
const checkoutLeaveError = ref('');
let settlePaymentSheet: ((accepted: boolean) => void) | null = null;
function closePaymentSheet() { paymentSheetOpen.value = false; settlePaymentSheet?.(false); settlePaymentSheet = null; }
function confirmPaymentSheet() { paymentFlowBusy.value = true; paymentSheetOpen.value = false; settlePaymentSheet?.(true); settlePaymentSheet = null; }
async function requestConfirmPay() {
  if (trialQuoteUnavailable.value && !createdCheckoutOrder.value && !pendingCheckoutCreate.value) return;
  if (voucherSelecting.value || purchaseConfirmationOpen || confirming || checkoutWalletRefreshing.value || step.value !== "confirm") return;
  const scope = captureCheckoutRoute();
  const amount = netPrice.value + cardFee.value;
  const reviewedTrialApplied = trialView.value.applied;
  const reviewedTrialQuoteVersion = trialView.value.quoteVersion;
  if (!Number.isFinite(amount) || amount < 0) return;
  purchaseConfirmationOpen = true;
  paymentBlocked.value = '';
  dialogsOpen += 1;
  try {
    paymentSheetAmount.value = amount;
    await nextTick();
    if (!isCurrentCheckoutRoute(scope) || ((!createdCheckoutOrder.value && !pendingCheckoutCreate.value) && trialQuoteScreenUnavailable.value) || step.value !== "confirm") return;
    if (amount !== netPrice.value + cardFee.value
        || (!createdCheckoutOrder.value && !pendingCheckoutCreate.value && !freeTrial.hasPendingConversion() && (reviewedTrialApplied !== trialView.value.applied
          || reviewedTrialQuoteVersion !== trialView.value.quoteVersion))) {
      toast.warn(t.value.store.coTotalQuoteChanged);
      step.value = "select-payment";
      return;
    }
    paymentFlowBusy.value = true;
    await onConfirmPay();
  } finally {
    confirming = false;
    paymentFlowBusy.value = false;
    closePaymentSheet();
    purchaseConfirmationOpen = false;
    dialogsOpen = Math.max(0, dialogsOpen - 1);
  }
}

async function onConfirmPay() {
  if (trialQuoteScreenUnavailable.value && !createdCheckoutOrder.value && !pendingCheckoutCreate.value) return;
  if (voucherSelecting.value || confirming || checkoutWalletRefreshing.value || step.value !== "confirm") return;
  confirming = true;
  if (remoteApiEnabled && (createdCheckoutOrder.value || pendingCheckoutCreate.value)) {
    quotedTotal = netPrice.value;
    voucherQuote = { id: createdCheckoutOrder.value?.voucherId ?? pendingCheckoutCreate.value?.request.voucherId ?? null, discount: voucherDiscount.value };
    await submitRemoteOrder();
    return;
  }
  const recoveryScope = captureCheckoutRoute();
  const confirmedAmount = netPrice.value + cardFee.value;
  const confirmedTrialApplied = trialView.value.applied;
  const confirmedTrialQuoteVersion = trialView.value.quoteVersion;
  if (remoteApiEnabled) {
    const recovering = createdCheckoutOrder.value ? false : await resumeServerOrder(recoveryScope);
    if (recovering || !isCurrentCheckoutRoute(recoveryScope)) { confirming = false; return; }
    // Background polls retain the reviewed page; only a fresh authority read can authorize payment.
    const trialReady = await freeTrial.refreshRemote();
    if (!trialReady || !isCurrentCheckoutRoute(recoveryScope)) { confirming = false; return; }
  }
  if (trialQuoteUnavailable.value) { confirming = false; return; }
  if (confirmedAmount !== netPrice.value + cardFee.value
      || (!freeTrial.hasPendingConversion() && (confirmedTrialApplied !== trialView.value.applied
        || confirmedTrialQuoteVersion !== trialView.value.quoteVersion))) {
    confirming = false;
    toast.warn(t.value.store.coTotalQuoteChanged);
    step.value = "select-payment";
    return;
  }
  trialQuote = trialView.value;
  quotedTotal = remoteApiEnabled ? netPrice.value + cardFee.value : +(netPrice.value + cardFee.value).toFixed(2);
  voucherQuote = { id: voucherMatch.value?.def.id ?? null, discount: voucherDiscount.value };
  quotedTradeIn = appliedTradeinView.value ? { deviceId: appliedTradeinView.value.device.id } : null;
  if (remoteApiEnabled) {
    // Trial conversion is already a backend transaction (trial lock + wallet
    // debit + order creation). It must run before the ordinary order path so
    // the checkout cannot create a second, permanently pending order.
    const recoveringTrial = freeTrial.hasPendingConversion();
    if (trialQuote.applied || recoveringTrial) {
      const confirmationScope = captureCheckoutRoute();
      const p = product.value;
      const payQuote = trialQuoteAt(mockServerNow());
      if (!p || (!recoveringTrial && !payQuote.applied)) {
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
      let conversion = await freeTrial.convert(p.id, quotedTotal, trialQuote.quoteVersion);
      if (conversion.reason === 'payment-required') {
        const authorized = await executeSelectedPurchase({amount:quotedTotal,currency:'USDT',summary:p.name},
          async authorization=>{
            if (!isCurrentCheckoutRoute(confirmationScope) || confirmedAmount!==netPrice.value+cardFee.value
                || confirmedTrialQuoteVersion!==trialView.value.quoteVersion) return null;
            return freeTrial.convert(p.id,quotedTotal,trialQuote.quoteVersion,authorization);
          },
          ()=>isCurrentCheckoutRoute(confirmationScope)&&!trialQuoteScreenUnavailable.value
            &&confirmedAmount===netPrice.value+cardFee.value&&confirmedTrialApplied===trialView.value.applied
            &&confirmedTrialQuoteVersion===trialView.value.quoteVersion,
          {kind:'TRIAL_CONVERT',payload:{productNo:p.id,expectedAmountUsdt:quotedTotal,quoteVersion:trialQuote.quoteVersion},
            commandKey:()=>freeTrial.conversionPaymentKey(p.id,quotedTotal,trialQuote.quoteVersion),
            parseReceipt:async raw=>{const receipt=parseTrialConvertReceipt(raw);const result=await freeTrial.convert(p.id,quotedTotal,trialQuote.quoteVersion);if(!result.ok||result.orderNo!==receipt.orderNo)throw new Error('TRIAL_CONVERT_RESULT_UNKNOWN');return result;}});
        if (!authorized) { confirming=false; return; }
        conversion = authorized;
      }
      if (!isCurrentCheckoutRoute(confirmationScope)) { confirming = false; return; }
      confirming = false;
      if (!conversion.ok || !conversion.orderNo) {
        if (conversion.reason === "insufficient-funds") {
          await offerWalletTopup(quotedTotal, confirmationScope);
        } else if (conversion.reason === "unknown" || (conversion.ok && !conversion.orderNo)) {
          toast.warn(t.value.store.coRecoverOriginalOrder);
        } else if (conversion.reason === "storage-unavailable") {
          toast.error(t.value.errors.txNotSavedTitle, t.value.errors.txNotSavedMsg);
        } else {
          toast.warn(conversion.reason === "quote-changed" ? t.value.store.coTrialQuoteChanged : t.value.tradein.errPurchaseFailed);
          step.value = "select-payment";
        }
        return;
      }
      orderId.value = conversion.orderNo;
      // Replace checkout with the canonical order URL. A browser refresh now
      // reloads the paid server order instead of reopening a fresh purchase.
      navReplace({ url: `/pages/store/order-detail?id=${encodeURIComponent(conversion.orderNo)}&result=trial` });
      return;
    }
    // Existing orders/conversions recover above before capacity can reject a
    // fresh purchase, including a confirmation retained across page hide/show.
    if (!createdCheckoutOrder.value && checkoutCapacityRequired.value && !remoteCapacityGate.canConfirm(Boolean(appliedTradeinView.value?.canonicalQuote))) {
      confirming = false;
      toast.warn(checkoutCapacityMessage.value);
      step.value = "select-payment";
      if (!remoteCapacityGate.pending && !remoteCapacityGate.decision) void retryCheckoutCapacity();
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
  //   · 发票值封顶 → 窗内新到的券 / 多累计的试用抵扣金不参与这一单 —— 二维码告诉用户转 X,
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
  // Invoices belong to the local payment leg; a server trial quote never reaches them.
  trialQuote = { ...reconciled.trial, earlyDiscountUSD: 0, quoteVersion: null };
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
        amount: formatAmount(existing.amountUsdt),
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

function requestCheckoutBack() {
  if (promotionRoute.value) { promotionCheckout.value?.back(); return; }
  if (paymentSheetOpen.value) { closePaymentSheet(); return; }
  void cancelCheckout();
}
async function recoverCheckoutCreation() {
  const pendingCreate = pendingCheckoutCreate.value;
  if (!pendingCreate || checkoutLeaving.value) return;
  const scope = captureCheckoutRoute();
  const attempt = ++checkoutLeaveAttempt;
  checkoutLeaving.value = true;
  try {
    const created = await orderApi.create(pendingCreate.request);
    if (!isCurrentCheckoutRoute(scope)) return;
    rememberCheckoutOrder(scope.accountKey, { productNo: scope.productNo, orderNo: created.orderNo, intent: pendingCreate.intent, commandKey: pendingCreate.request.idempotencyKey });
    createdCheckoutOrder.value = created;
    orderId.value = created.orderNo;
    forgetCheckoutCreate(scope.accountKey, pendingCreate);
    pendingCheckoutCreate.value = null;
    await navReplace(`/pages/store/order-detail?id=${encodeURIComponent(created.orderNo)}`);
  } catch {
    if (isCurrentCheckoutRoute(scope)) toast.warn(t.value.store.coRecoverOriginalOrder);
  } finally {
    if (attempt === checkoutLeaveAttempt) checkoutLeaving.value = false;
  }
}
async function cancelCheckout() {
  if (checkoutLeaving.value || paymentFlowBusy.value || confirming) return;
  let original = createdCheckoutOrder.value;
  const scope = captureCheckoutRoute();
  const attempt = ++checkoutLeaveAttempt;
  checkoutLeaving.value = true;
  checkoutLeaveError.value = '';
  try {
    const pendingCreate = pendingCheckoutCreate.value ?? readCheckoutCreate(scope.accountKey, scope.productNo);
    if ((!original && !pendingCreate) || settledResultReplay.value) { navBack(checkoutBackHref.value); return; }
    pendingCheckoutCreate.value = pendingCreate;
    if (!original && pendingCreate) {
      // The existing API has no create-command GET. Replay only the exact
      // persisted creation key/payload, then cancel that original order.
      original = await orderApi.create(pendingCreate.request);
      if (!isCurrentCheckoutRoute(scope)) return;
      createdCheckoutOrder.value = original;
      rememberCheckoutOrder(scope.accountKey, { productNo: scope.productNo, orderNo: original.orderNo, intent: pendingCreate.intent, commandKey: pendingCreate.request.idempotencyKey });
      forgetCheckoutCreate(scope.accountKey, pendingCreate);
      pendingCheckoutCreate.value = null;
    }
    const created = original;
    if (!created) return;
    const action = readOrderAction(scope.accountKey, created.orderNo);
    let unseenPaymentKey: string | null = null;
    if (action?.kind === 'pay') {
      const outcome = await readPaymentCommand(apiClient, 'order-pay', action.key);
      if (!isCurrentCheckoutRoute(scope)) return;
      if (outcome.status === 'REJECTED') clearOrderAction(scope.accountKey, created.orderNo, action.key, true);
      else if (outcome.status === 'NOT_SEEN' && outcome.canResumeSameKey && action.paymentMethod === 'WALLET') unseenPaymentKey = action.key;
      else if (outcome.status !== 'SUCCEEDED') throw new Error('ORIGINAL_ORDER_COMMAND_UNRESOLVED');
    }
    await orders.ensureRemoteOrder(created.orderNo);
    if (!isCurrentCheckoutRoute(scope)) return;
    const order = orders.orders.find(item => item.id === created.orderNo);
    if (!order) throw new Error('ORDER_READBACK_UNAVAILABLE');
    if (order.status === 'activated' || order.status === 'inventory') {
      if (action?.kind === 'pay') clearOrderAction(scope.accountKey, created.orderNo, action.key);
      orderId.value = created.orderNo;
      presentSettledPurchase(false);
      return;
    }
    if (order.status !== 'cancelled' && order.status !== 'expired') {
      if (order.status !== 'placed') throw new Error('ORIGINAL_ORDER_COMMAND_UNRESOLVED');
      if (unseenPaymentKey) clearOrderAction(scope.accountKey, created.orderNo, unseenPaymentKey, false);
      const cancellation = beginOrderAction(scope.accountKey, 'cancel', created.orderNo, null);
      const cancelled = await orders.cancelOrderRemote(created.orderNo);
      if (!isCurrentCheckoutRoute(scope)) return;
      if (!cancelled) {
        const latest = orders.orders.find(item => item.id === created.orderNo);
        if (latest?.status === 'activated' || latest?.status === 'inventory') {
          clearOrderAction(scope.accountKey, created.orderNo, cancellation.key);
          orderId.value = created.orderNo; presentSettledPurchase(false); return;
        }
        throw new Error('ORDER_CANCELLATION_UNCONFIRMED');
      }
      clearOrderAction(scope.accountKey, created.orderNo, cancellation.key);
    } else if (unseenPaymentKey) clearOrderAction(scope.accountKey, created.orderNo, unseenPaymentKey, false);
    forgetCheckoutOrder(scope.accountKey, scope.productNo, created.orderNo);
    retireRemoteOrderKey();
    createdCheckoutOrder.value = null;
    navBack(checkoutBackHref.value);
  } catch (error) {
    if (!original && pendingCheckoutCreate.value && isCurrentCheckoutRoute(scope) && isSettledRejection(error)) {
      const pendingCreate = pendingCheckoutCreate.value;
      forgetCheckoutCreate(scope.accountKey, pendingCreate);
      releaseAccountCommandKey(REMOTE_CHECKOUT_COMMANDS_KEY, scope.accountKey, pendingCreate.intent, pendingCreate.request.idempotencyKey);
      pendingCheckoutCreate.value = null;
      navBack(checkoutBackHref.value);
      return;
    }
    if (isCurrentCheckoutRoute(scope)) checkoutLeaveError.value = t.value.orders.resultReadback;
  } finally {
    // Hiding invalidates route writes, but must still release this attempt's UI.
    if (attempt === checkoutLeaveAttempt) checkoutLeaving.value = false;
  }
}

function canIncreaseCheckoutQuantity(): boolean {
  if(voucherSelecting.value)return false;
  if(app.remoteSlotsUsed != null && app.slotCap - app.remoteSlotsUsed < 2)return false;
  return pageAlive && pageVisible && quantityReady.value && checkoutRouteInitialized && !activeCheckoutLoad
    && !promotionRoute.value && !!product.value && !purchaseUnavailable.value
    && (step.value === 'select-payment' || step.value === 'confirm')
    && !quantitySwitching.value && !confirming && !purchaseConfirmationOpen && dialogsOpen === 0
    && !trialCheckoutSource && !trialConversionMode.value && !appliedTradeinView.value
    && !reAddingTradein.value && !remoteTradeinRecoveryRequired.value
    && !activeSession.value && !resumeSessionId && !orderId.value
    && !remoteOrderFailure.value && !receiptWriteFailure.value && !pendingCheckoutCreate.value;
}

async function increaseCheckoutQuantity(): Promise<void> {
  if (!canIncreaseCheckoutQuantity()) return;
  const scope = captureCheckoutRoute();
  quantitySwitching.value = true;
  try {
    // A quantity edit must never bypass an original single-item transaction.
    if (await resumeServerOrder(scope) || !isCurrentCheckoutRoute(scope)) return;
    const commands = readAccountRow<RemoteCheckoutCommands>(REMOTE_CHECKOUT_COMMANDS_KEY, scope.accountKey, true);
    if (Object.keys(commands?.commands ?? {}).some(intent => intent.split('|')[0] === scope.productNo)) {
      toast.warn(t.value.store.coRecoverOriginalOrder);
      return;
    }
    // Use the existing items contract and a new read-only quote. This action
    // neither creates an order nor pays; the normal confirmation remains next.
    await navReplace(promotionCheckoutHref([{ productNo: scope.productNo, quantity: 2 }]));
  } catch {
    if (isCurrentCheckoutRoute(scope)) toast.warn(t.value.store.purchaseEligibilityError);
  } finally {
    quantitySwitching.value = false;
  }
}

// IDEMPOTENCY-FRESH-OK: 下面 738-740 行先读**持久化**的 durable 键(readAccountRow),命中就直接返回 ——
// 这把钥匙跨 App 重启都稳,是全仓最强的一处;现铸分支只在「这个 intent 头一次」时走到。
function remoteOrderIntent(): string {
  const p = product.value;
  const intent = [p?.id ?? "unknown", voucherQuote.id ?? "", payment.value,
    tradein.appliedTradein?.canonicalQuote?.sourceDeviceId ?? "ordinary"].join("|");
  const sourceVersion = tradein.appliedTradein?.canonicalQuote?.sourceRowVersion;
  return sourceVersion == null ? intent : `${intent}|${sourceVersion}`;
}

function remoteOrderKey(): string {
  const intent = remoteOrderIntent();
  const accountKey = orders.currentAccountKey();
  return acquireAccountCommandKey(REMOTE_CHECKOUT_COMMANDS_KEY, accountKey, intent, "h7-order");
}

function retireRemoteOrderKey(): void {
  const intent = remoteOrderIntent();
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

async function completeRemoteTradein(recovery: CheckoutTradeinRecovery, submissionScope: CheckoutRouteScope, newSubmission = false, retainRecovery = false, allowResume = false): Promise<CanonicalTradeinResult | null> {
  const scopeIsCurrent = () => isCurrentCheckoutRoute(submissionScope);
  const reviewedQuote = { ...recovery.tradeinQuote };
  const authorizationIsCurrent = () => {
    if (!scopeIsCurrent()) return false;
    if (!newSubmission) return true;
    const current = appliedTradeinView.value?.canonicalQuote;
    return !!current && current.sourceDeviceId === reviewedQuote.sourceDeviceId
      && current.sourceRowVersion === reviewedQuote.sourceRowVersion
      && current.targetProductNo === reviewedQuote.targetProductNo
      && current.targetDeviceStatus === reviewedQuote.targetDeviceStatus
      && current.payableUsdt === reviewedQuote.payableUsdt
      && current.discountUsdt === reviewedQuote.discountUsdt;
  };
  const expectedActive = recovery.tradeinQuote.targetDeviceStatus === "ACTIVE";
  let recoveredResult = recovery.tradeinResult;
  if (!newSubmission && !recoveredResult) {
    if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
    const key = recovery.commandKey.replace("h7-order:", "e3-tradein:");
    const result = await readPaymentCommand(apiClient, 'trade-in', key);
    if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
    if (result.status === 'REJECTED') return null;
    if (result.status === 'SUCCEEDED') recoveredResult = parseCanonicalTradeinResult(result.receipt);
    else if (!(allowResume && result.status === 'NOT_SEEN' && result.canResumeSameKey)) throw new Error('PAYMENT_RESULT_UNRESOLVED');
  }
  return completeVerifiedMutation({
        submit: async () => {
          if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
          remoteTradeinRecoveryRequired.value = true;
          if (recoveredResult) return recoveredResult;
          let submitted: CanonicalTradeinResult | null = null;
          try {
            const key = recovery.commandKey.replace("h7-order:", "e3-tradein:");
            if (!submitted) {
              const paid = await executeSelectedPurchase({amount:recovery.tradeinQuote.payableUsdt,currency:'USDT',summary:product.value?.name??t.value.store.coConfirmPurchase},
                async authorization=>{
                  if (!authorizationIsCurrent()) return null;
                  return deviceE3Api.submit(recovery.tradeinQuote.sourceDeviceId,recovery.productNo,key,recovery.tradeinQuote,authorization);
                },authorizationIsCurrent,
                {kind:'TRADE_IN',payload:{sourceDeviceId:reviewedQuote.sourceDeviceId,expectedSourceVersion:reviewedQuote.sourceRowVersion,targetProductNo:recovery.productNo,expectedPayableUsdt:reviewedQuote.payableUsdt,expectedDiscountUsdt:reviewedQuote.discountUsdt},
                  commandKey:()=>recovery.commandKey.replace('h7-order:','e3-tradein:'),parseReceipt:parseCanonicalTradeinResult});
              if (!paid) {
                if (newSubmission) {
                  finishCheckoutTradein(submissionScope.accountKey, recovery);
                  remoteTradeinRecoveryRequired.value = false;
                }
                throw new Error('PAYMENT_CANCELLED');
              }
              submitted = paid;
            }
          } catch (cause) {
            if (newSubmission && scopeIsCurrent() && isSettledRejection(cause)
                && asApiError(cause).message !== "IDEMPOTENCY_RESULT_UNKNOWN") {
              finishCheckoutTradein(submissionScope.accountKey, recovery);
              remoteTradeinRecoveryRequired.value = false;
            }
            throw cause;
          }
          if (!scopeIsCurrent()) throw new Error("CHECKOUT_ACCOUNT_CHANGED");
          recovery = { ...recovery, orderNo: submitted.orderNo, tradeinResult: submitted };
          rememberCheckoutOrder(submissionScope.accountKey, recovery);
          return submitted;
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
              || persisted.canonicalStatus !== (expectedActive ? "activated" : "inventory")
              || persisted.paymentStatus.toUpperCase() !== "PAID"
              || persisted.orderStatus.toUpperCase() !== "COMPLETED"
              || persisted.activationStatus.toUpperCase() !== (expectedActive ? "ACTIVATED" : "INVENTORY")
              || typeof persisted.amountUsdt !== "number"
              || Math.abs(persisted.amountUsdt - purchasePrincipalUsdt(submitted)) > 0.000001
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
          if (!target || target.activationUnconfirmed || (newSubmission && (target.activatedAt != null) !== expectedActive)
              || (source && source.activatedAt != null)) {
            throw new Error("E3_TRADEIN_FLEET_READBACK_MISMATCH");
          }
        },
        commit(submitted) {
          if (!scopeIsCurrent()) return;
          if (!retainRecovery) finishCheckoutTradein(submissionScope.accountKey, recovery);
          orderId.value = submitted.orderNo;
          if (tradein.appliedTradein?.canonicalQuote?.sourceDeviceId === recovery.tradeinQuote.sourceDeviceId
              && tradein.appliedTradein.canonicalQuote.sourceRowVersion === recovery.tradeinQuote.sourceRowVersion) tradein.clearApplied();
          remoteTradeinRecoveryRequired.value = false;
          remoteTradeinRecoveryError.value = false;
          presentSettledPurchase(false);
        },
      });
}

async function resumePendingRemoteTradein(scope: CheckoutRouteScope, navigate = false, allowResume = false): Promise<boolean> {
  if (!remoteApiEnabled || !isCurrentCheckoutRoute(scope)) return false;
  let recovery: CheckoutTradeinRecovery | null;
  try { recovery = readCheckoutTradein(scope.accountKey, scope.productNo); }
  catch {
    remoteTradeinRecoveryRequired.value = true;
    remoteTradeinRecoveryError.value = true;
    return true;
  }
  if (!recovery) return false;
  remoteTradeinRecoveryRequired.value = true;
  if (remoteTradeinRecoveryBusy.value) return true;
  remoteTradeinRecoveryBusy.value = true;
  try {
    const result = await completeRemoteTradein(recovery, scope, false, navigate, allowResume);
    if (!result) {
      if (!isCurrentCheckoutRoute(scope)) return true;
      finishCheckoutTradein(scope.accountKey, recovery);
      remoteTradeinRecoveryRequired.value = false;
      remoteTradeinRecoveryError.value = false;
      step.value = "select-payment";
      if (tradein.appliedTradein?.canonicalQuote?.sourceDeviceId === recovery.tradeinQuote.sourceDeviceId
          && tradein.appliedTradein.canonicalQuote.sourceRowVersion === recovery.tradeinQuote.sourceRowVersion) tradein.clearApplied();
      toast.warn(purchaseRecoveryCopy(locale.code).rejected);
      await retryCheckoutCapacity();
      return true;
    }
    if (navigate && isCurrentCheckoutRoute(scope)) {
      const navigated = await navReplace(`/pages/store/order-detail?id=${encodeURIComponent(result.orderNo)}`);
      if (navigated && isCurrentAccountScope({ accountKey: scope.accountKey, epoch: scope.accountEpoch })) {
        const current = readCheckoutTradein(scope.accountKey, scope.productNo);
        if (current?.commandKey === recovery.commandKey) finishCheckoutTradein(scope.accountKey, current);
      } else if (isCurrentCheckoutRoute(scope)) {
        remoteTradeinRecoveryRequired.value = true;
        remoteTradeinRecoveryError.value = true;
      }
    }
  } catch {
    if (isCurrentCheckoutRoute(scope)) remoteTradeinRecoveryError.value = true;
  } finally {
    if (isCurrentCheckoutRoute(scope)) remoteTradeinRecoveryBusy.value = false;
  }
  return true;
}

let serverOrderRecovery: { key: string; promise: Promise<boolean> } | null = null;
function resumeServerOrder(routeScope = captureCheckoutRoute()): Promise<boolean> {
  if (!remoteApiEnabled || !isCurrentCheckoutRoute(routeScope)) return Promise.resolve(false);
  pendingCheckoutCreate.value = readCheckoutCreate(routeScope.accountKey, routeScope.productNo);
  // Unknown creation is an original-command recovery screen, before any new
  // catalogue/stock/eligibility gate. Recovery requires an explicit user action.
  if (pendingCheckoutCreate.value) return Promise.resolve(true);
  const key = JSON.stringify([routeScope.accountKey, routeScope.accountEpoch, routeScope.productNo, routeScope.generation]);
  if (serverOrderRecovery?.key === key) return serverOrderRecovery.promise;
  const promise = resumePendingRemoteTradein(routeScope, true).then(recovered => recovered ? true : recoverCheckoutOrder(routeScope.accountKey, routeScope.productNo, {
    list: orderApi.list,
    isCurrent: () => isCurrentCheckoutRoute(routeScope),
    isCurrentAccount: () => isCurrentAccountScope({ accountKey: routeScope.accountKey, epoch: routeScope.accountEpoch }),
    navigate: (url) => isCurrentCheckoutRoute(routeScope) ? navReplace(url) : Promise.resolve(false),
  })).then(recovered => recovered || (isCurrentCheckoutRoute(routeScope) && recoverKeepBeforePurchase([routeScope.productNo])))
    .finally(() => { if (serverOrderRecovery?.key === key) serverOrderRecovery = null; });
  serverOrderRecovery = { key, promise };
  return promise;
}

function onKeyboardActivate(event: KeyboardEvent, action: () => void) {
  if (event.repeat) return;
  action();
}

async function offerWalletTopup(requiredUsdt: number, routeScope = captureCheckoutRoute()): Promise<void> {
  dialogsOpen += 1;
  const accepted = await confirm({
    title: t.value.errors.insufficientBalanceTitle,
    message: fmt(t.value.errors.insufficientBalanceMsg, { amt: formatAmount(requiredUsdt) }),
    confirmLabel: t.value.me.topup,
    cancelLabel: t.value.store.coCancel,
    icon: "warn",
    owner: dialogOwner,
  });
  dialogsOpen = Math.max(0, dialogsOpen - 1);
  if (accepted && isCurrentCheckoutRoute(routeScope)) navTo("/pages/me/wallet-topup");
}

async function submitRemoteOrder(): Promise<void> {
  const submissionScope = captureCheckoutRoute();
  const scopeIsCurrent = () => isCurrentCheckoutRoute(submissionScope);
  const reviewedTotal = netPrice.value + cardFee.value;
  const reviewedTrialVersion = trialView.value.quoteVersion;
  if (await resumePendingRemoteTradein(submissionScope)) { confirming = false; return; }
  const walletReceiptScope = app.captureRemoteAccountRequest();
  const p = product.value;
  const requestedVoucherId = voucherQuote.id;
  if (!p || (!createdCheckoutOrder.value && !pendingCheckoutCreate.value && purchaseUnavailable.value)) {
    confirming = false;
    return;
  }
  if (!Number.isFinite(quotedTotal) || quotedTotal < 0) {
    confirming = false;
    toast.warn(t.value.store.coTotalQuoteChanged);
    step.value = "select-payment";
    return;
  }
  const eligibility = createdCheckoutOrder.value || pendingCheckoutCreate.value ? 'eligible' : await refreshPurchaseEligibility(submissionScope);
  if (eligibility !== "eligible") {
    confirming = false;
    if (eligibility === "ineligible" && scopeIsCurrent()) {
      toast.warn(purchaseEligibilityFailureCopy());
      step.value = "select-payment";
    }
    return;
  }
  // Eligibility is account/SKU/page scoped. A late result cannot create an
  // order after an account change, product change, or page exit.
  if (!scopeIsCurrent()) {
    confirming = false;
    return;
  }
  if (!createdCheckoutOrder.value && !pendingCheckoutCreate.value && (trialQuoteScreenUnavailable.value || trialView.value.applied || freeTrial.hasPendingConversion()
      || reviewedTrialVersion !== trialView.value.quoteVersion || reviewedTotal !== netPrice.value + cardFee.value)) {
    confirming = false;
    toast.warn(t.value.store.coTotalQuoteChanged);
    step.value = "select-payment";
    return;
  }
  let canonicalOrderCommitted = false;
  let recoveryOrderNo: string | null = null;
  let paymentKey: string | null = null;
  try {
    const tradeinContext = hasOriginalCheckout.value ? null : appliedTradeinView.value;
    if (!hasOriginalCheckout.value && tradein.appliedTradein && !tradeinContext) {
      throw new Error("E3_TRADEIN_QUOTE_REQUIRED");
    }
    if (tradeinContext) {
      const recovery: CheckoutTradeinRecovery = { productNo: p.id, orderNo: "", intent: remoteOrderIntent(),
        commandKey: remoteOrderKey(), tradeinQuote: { ...tradeinContext.canonicalQuote! } };
      rememberCheckoutOrder(submissionScope.accountKey, recovery);
      remoteTradeinRecoveryRequired.value = true;
      await completeRemoteTradein(recovery, submissionScope, true);
      return;
    }
    const existingOrder = createdCheckoutOrder.value;
    const creation = pendingCheckoutCreate.value ?? {
      request: { productNo: p.id, quantity: 1, voucherId: requestedVoucherId, idempotencyKey: remoteOrderKey() },
      intent: remoteOrderIntent(), subtotal: purchaseSubtotal.value, discount: voucherDiscount.value, amount: reviewedTotal,
    };
    if (!existingOrder) {
      rememberCheckoutCreate(submissionScope.accountKey, creation);
      pendingCheckoutCreate.value = creation;
    }
    const created = existingOrder ?? await orderApi.create(creation.request);
    if (!scopeIsCurrent()) return;
    createdCheckoutOrder.value = created;
    canonicalOrderCommitted = true;
    recoveryOrderNo = created.orderNo;
    // Persist the known server identity BEFORE payment. Refresh, lower balance,
    // consumed vouchers and full capacity must recover this order, not create another.
    rememberCheckoutOrder(orders.currentAccountKey(), {
      productNo: p.id, orderNo: created.orderNo, intent: creation.intent, commandKey: creation.request.idempotencyKey,
    });
    forgetCheckoutCreate(submissionScope.accountKey, creation);
    pendingCheckoutCreate.value = null;
    orderId.value = created.orderNo;
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
    const alreadySettled = persisted?.canonicalStatus === "activated"
      && persisted.paymentStatus.toUpperCase() === "PAID"
      && persisted.orderStatus.toUpperCase() === "COMPLETED"
      && persisted.activationStatus.toUpperCase() === "ACTIVATED";
    if (!persisted || persisted.productNo !== p.id || persisted.quantity !== 1
        || (!alreadySettled && (persisted.canonicalStatus !== "placed"
          || persisted.paymentStatus.toUpperCase() !== "PENDING"
          || persisted.orderStatus.toUpperCase() !== "PENDING_PAYMENT"
          || persisted.activationStatus.toUpperCase() !== "WAITING_PAYMENT"
          || created.paymentStatus.toUpperCase() !== "PENDING"
          || created.orderStatus.toUpperCase() !== "PENDING_PAYMENT"))
        || typeof persisted.amountUsdt !== "number"
        || Math.abs(persisted.amountUsdt - created.amountUsdt) > 0.000001
        || Math.abs(persisted.discountUsdt - created.discountUsdt) > 0.000001) {
      throw new Error("E20_CAPACITY_AVAILABLE_ORDER_READBACK_MISMATCH");
    }
    if (alreadySettled) { await resumeServerOrder(submissionScope); return; }
    if (created.amountUsdt !== reviewedTotal) {
      toast.warn(t.value.store.coTotalQuoteChanged);
      step.value = 'confirm';
      return;
    }
    canonicalOrderCommitted = true;
    const paymentCurrent = () => scopeIsCurrent()&&createdCheckoutOrder.value?.orderNo===created.orderNo
      &&createdCheckoutOrder.value.amountUsdt===created.amountUsdt&&reviewedTotal===netPrice.value
      &&(persisted.expiresAt===null || nowTick.value<persisted.expiresAt);
    const paid = await executeSelectedPurchase({amount:created.amountUsdt,currency:'USDT',summary:p.name},
      async authorization=>{
        if (!paymentCurrent()) return null;
        const action=beginOrderAction(submissionScope.accountKey,'pay',created.orderNo,created.amountUsdt,'WALLET');
        paymentKey=action.key;
        try {return await orderApi.pay(created.orderNo,action.key,authorization);}
        catch(error){
          if (/^PAYMENT_PASSWORD_(INCORRECT|LOCKED|VERSION_CONFLICT|NOT_CONFIGURED|REQUIRED)$/.test(asApiError(error).message))
            clearOrderAction(submissionScope.accountKey,created.orderNo,action.key);
          throw error;
        }
      },
      paymentCurrent,{kind:'ORDER_PAY',payload:{orderNo:created.orderNo},commandKey:()=>{const action=beginOrderAction(submissionScope.accountKey,'pay',created.orderNo,created.amountUsdt,'EXTERNAL');paymentKey=action.key;return action.key;},parseReceipt:paidOrderReceipt});
    if (!paid) { step.value='confirm'; return; }
    if (!scopeIsCurrent()) return;
    if (paid.orderNo !== created.orderNo) {
      throw new Error("WALLET_PAYMENT_RECEIPT_ORDER_MISMATCH");
    }
    markOrderActionPaid(submissionScope.accountKey,created.orderNo);
    if (paid.paymentMethod === "WALLET"
        && (paid.walletBalanceAfterUsdt === null
          || !app.adoptCommerceWallet(paid.walletBalanceAfterUsdt, walletReceiptScope))) {
      throw new Error("WALLET_PAYMENT_RECEIPT_ACCOUNT_MISMATCH");
    }
    orderId.value = created.orderNo;
    remoteOrderFailure.value = null;
    if (requestedVoucherId) await voucher.refreshRemote();
    if (!scopeIsCurrent()) return;
    await orders.refreshRemote();
    if (!scopeIsCurrent()) return;
    const settled = orders.orders.find((order) => order.id === created.orderNo);
    if (!settled || settled.status !== "activated") {
      throw new Error("WALLET_PAYMENT_ORDER_READBACK_MISMATCH");
    }
    if (paymentKey) clearOrderAction(submissionScope.accountKey,created.orderNo,paymentKey);
    // Fleet refresh is best effort after the authoritative paid receipt and
    // order readback. A temporary projection outage must not re-submit payment.
    void app.refreshRemoteFleet(walletReceiptScope);
    retireRemoteOrderKey();
    // Keep the durable original-order pointer until the result card is visible.
    // A reload during the replay still recovers this purchase before quoting.
    const accountKey = orders.currentAccountKey();
    presentSettledPurchase(isFirstHardwareOrder(created.orderNo), () => forgetCheckoutOrder(accountKey, p.id, created.orderNo));
  } catch (error) {
    if (!scopeIsCurrent()) return;
    if (error instanceof Error && error.message === 'PAYMENT_CANCELLED') { step.value='confirm'; return; }
    // A definitive refusal leaves the pending order unpaid; retire its payment key
    // so a later attempt is a new command, and say why instead of "confirming".
    const rejection = orderPaymentRejection(error, locale.code);
    const walletShort = recoveryOrderNo && asApiError(error).message === "ORDER_WALLET_INSUFFICIENT";
    if (rejection || walletShort) {
      if (recoveryOrderNo && paymentKey) clearOrderAction(submissionScope.accountKey, recoveryOrderNo, paymentKey, true);
      step.value = 'confirm';
      if (walletShort) await offerWalletTopup(quotedTotal, submissionScope);
      else paymentBlocked.value = rejection!;
      return;
    }
    if (recoveryOrderNo) {
      // A timeout is not a failed purchase. The canonical order page reads the
      // current status and the persisted original command before allowing another action.
      toast.warn(t.value.store.coRecoverOriginalOrder);
      step.value = "awaiting";
      if (!(await navReplace(`/pages/store/order-detail?id=${encodeURIComponent(recoveryOrderNo)}`)) && scopeIsCurrent()) {
        step.value = "confirm";
      }
      return;
    }
    // Keep only outcome-unknown errors: transport, malformed response, 5xx and
    // the server's explicit unknown-result fence. Structured API facts—not text
    // matching—decide whether a business rejection can mint a new attempt.
    const apiError = asApiError(error);
    const keepForReadback = apiError.kind === "network" || apiError.kind === "protocol"
      || (apiError.kind === "http" && (apiError.status ?? 0) >= 500)
      || apiError.message === "IDEMPOTENCY_RESULT_UNKNOWN";
    if (!remoteTradeinRecoveryRequired.value && !keepForReadback && !canonicalOrderCommitted) {
      if (pendingCheckoutCreate.value) forgetCheckoutCreate(submissionScope.accountKey, pendingCheckoutCreate.value);
      pendingCheckoutCreate.value = null;
      retireRemoteOrderKey();
    }
    if (remoteTradeinRecoveryRequired.value) remoteTradeinRecoveryError.value = true;
    if (apiError.message === "ACCOUNT_COMMAND_STORAGE_UNAVAILABLE") {
      toast.error(t.value.errors.txNotSavedTitle, t.value.errors.txNotSavedMsg);
    } else if (apiError.message === "ORDER_WALLET_INSUFFICIENT") {
      await offerWalletTopup(quotedTotal, submissionScope);
    } else if (["ORDER_MONTHLY_QUOTA_PAUSED", "ORDER_MONTHLY_QUOTA_EXHAUSTED"].includes(apiError.message)) {
      toast.warn(t.value.quota.stockUnavailable);
    } else {
      toast.warn(t.value.tradein.errPurchaseFailed);
    }
    // No local order, balance debit, or voucher redemption mirror in remote mode.
    step.value = "confirm";
  } finally {
    confirming = false;
  }
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
  if(promotionRoute.value){promotionCheckout.value?.show();return;}
  pageVisible = true;
  if (checkoutRouteInitialized && !activeCheckoutLoad && !settledResultReplay.value && !createdCheckoutOrder.value) void resumeServerOrder();
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
  void refreshCheckoutWallet();
  restoreReceiptRecovery();
});
onHide(() => {
  closePaymentSheet();
  purchasePolicyOpen.value = false;
  tradein.hide();
  if(promotionRoute.value){promotionCheckout.value?.hide();return;}
  pageVisible = false;
  invalidateCheckoutRoute();
  interceptFired = false;
  remoteCapacityGate.reset();
  checkoutCapacityRead = null;
  if (dialogsOpen > 0) useUI().clearConfirmsBy(dialogOwner);
  // 页面被别的页压住(前向导航)时,让浮动条在上面那页露出这张发票;回来 onShow 再收起。
  if (activeSession.value && pending.viewingId === activeSession.value.id) pending.setViewing(null);
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
  if (settledResultReplay.value && (s === "confirmed" || s === "activating")) {
    // CheckoutResult advances its rendered phases on animationend.
    return;
  }
  if (s === "live" && settledResultReplay.value) {
    settledResultReplay.value = false;
    forgetSettledOrder?.();
    forgetSettledOrder = null;
  }
  // Remote wallet payment is completed synchronously by the Java transaction;
  // only the local mock keeps the guided timer demonstration below.
  if (remoteApiEnabled && (s === "awaiting" || s === "confirmed" || s === "activating")) return;
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
      // Trial conversion is authorized by /api/trial/convert, not by the
      // Pro/Rack hardware-quota policy used for a new store purchase. Use the
      // confirmed quote snapshot here; the live quote is revalidated below.
      if (!trialQuote.applied && !isProductAvailable(p, phase.value)) {
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
      if (!trialQuote.applied && purchaseBlockedNow) {
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
        const conversion = await freeTrial.convert(p.id, chargeTotal);
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
        toast.warn(fmt(t.value.errors.insufficientBalanceMsg, { amt: formatAmount(chargeTotal) }));
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
            symbol: "UVT",
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
        if (usdtCredited) earnParts.push(fmt(t.value.store.coTrialEarnUsdtPart, { amount: formatAmount(trialRemainderUSD) }));
        if (nexCredited) earnParts.push(fmt(t.value.store.coTrialEarnNexPart, { n: formatAmount(shadowNEXNow) }));
        if (earnParts.length) toast.success(fmt(t.value.store.coTrialEarnToast, { parts: earnParts.join(" · ") }));
      }
      // 券已在扣款前核销(先占后花,见上);到这里订单已落盘,核销就是终态。
      // 账单 memo 走 i18n(用户账单页直接渲染,禁硬编码英文)。
      const memoParts: string[] = [];
      if (discount > 0) memoParts.push(fmt(t.value.store.coBillVoucherPart, { amount: formatAmount(discount) }));
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
  closePaymentSheet();
  clearAdvance();
  pageVisible = false;
  invalidateCheckoutRoute();
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
function stepFillStyle(i: number): CSSProperties {
  const w = i < stepDisplay.value ? "100%" : i === stepDisplay.value ? "100%" : "0%";
  return { width: w, background: "linear-gradient(90deg, var(--v5-brand-deep), var(--ui-lime-soft))", boxShadow: i <= stepDisplay.value ? "0 0 10px var(--v5-brand-border)" : "none", transition: "width 0.5s" };
}
const primaryBtnStyle: CSSProperties = {
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontSize: "var(--ui-type-button)",
  fontWeight: 600,
};
const confirmCtaStyle: CSSProperties = {
  marginTop: "20px",
  height: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontSize: "var(--ui-type-button)",
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
const centerCardStyle: CSSProperties = { borderRadius: "var(--nx-glass-radius)", boxShadow: "var(--nx-glass-edge)",
  background: "var(--nx-glass-fill)",
  padding: "var(--v5-space-6)",
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
  fontSize: "var(--ui-type-card-title)",
  fontWeight: "var(--ui-type-card-title-weight)",
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
const liveCardStyle: CSSProperties = { borderRadius: "var(--nx-glass-radius)", boxShadow: "var(--nx-glass-edge)",
  // Source: bg-gradient-to-br from-brand/15 via-#0F0F0F to-brand/10. Middle stop
  // uses --v5-surface (not the source's hardcoded #0F0F0F) for dual-theme safety.
  background:
    "var(--nx-glass-fill)",
  padding: "var(--v5-space-6)",
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
  fontSize: "var(--ui-type-button)",
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
const receiptFailureCardStyle: CSSProperties = { borderRadius: "var(--nx-glass-radius)", boxShadow: "var(--nx-glass-edge)",
  padding: "var(--v5-space-6) var(--v5-space-5)",
  background: "var(--nx-glass-fill)",
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

<style scoped>
.checkout-header { margin-bottom:0; }
.checkout-content { color:var(--v5-ink); padding-top:8px; padding-bottom:120px; }
.checkout-content--result { padding-block: 0; }
.checkout-steps { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--v5-space-2); margin:0 16px; }
.checkout-step-track { height:3px; border-radius:999px; background:var(--v5-surface-3); }
.checkout-step-fill { height:100%; border-radius:inherit; }
.checkout-step-label { display:block; margin-top:var(--v5-space-2); font:400 12.5px/18px var(--font-v5); color:var(--v5-ink-3); }
.checkout-step-label--active { color:var(--v5-brand); font-weight:600; }
.checkout-group { position:relative; overflow:hidden; border:1px solid var(--v5-border); border-radius:22px; background:var(--ui-content-surface); }
.checkout-product { display:flex; align-items:center; gap:var(--v5-space-3); min-height:90px; margin:var(--v5-space-5) var(--v5-space-4) 0; padding:10px 16px; }
.checkout-product-art { display:grid; place-items:center; flex:none; width:68px; height:68px; border-radius:16px; overflow:hidden; background:radial-gradient(60% 30% at 50% 84%,color-mix(in srgb,var(--ui-lime-soft) 35%,transparent),transparent 70%),linear-gradient(180deg,var(--ui-content-surface-3),var(--ui-content-surface-2)); }
.checkout-product-art image { width:74px; height:74px; }
.checkout-product-copy { flex:1; min-width:0; }
.checkout-product-name { display:block; font:500 var(--ui-type-list-title)/20px var(--font-v5); overflow-wrap:anywhere; }
.checkout-product-meta { display:block; margin-top:2px; font:400 var(--ui-type-list-subtitle)/18px var(--font-v5); color:var(--v5-ink-3); }
.checkout-product-price { display:block; margin-top:var(--v5-space-1); font:600 15px/20px var(--font-v5); font-variant-numeric:tabular-nums; }
.checkout-quantity { flex:none; text-align:center; }
.checkout-quantity-controls { display:flex; align-items:center; margin-top:var(--v5-space-1); border:1px solid var(--v5-border); border-radius:999px; background:var(--ui-content-surface-2); }
.checkout-quantity-button { display:grid; place-items:center; width:44px; min-height:44px; border-radius:999px; font:400 18px/20px var(--font-v5); cursor:pointer; }
.checkout-quantity-button[aria-disabled="true"],.checkout-quantity-button[disabled] { opacity:.35; cursor:default; }
button.checkout-quantity-button {margin:0;padding:0;background:transparent;color:inherit;border:0;}
button.checkout-quantity-button::after {border:0;}
.checkout-quantity-button:focus-visible { outline:2px solid var(--v5-brand); outline-offset:-2px; }
.checkout-quantity-value { display:block; min-width:20px; font:600 15px/20px var(--font-v5); font-variant-numeric:tabular-nums; }
@media(max-width:389px) {
  .checkout-product { display:grid;grid-template-columns:68px minmax(0,1fr);gap:10px 12px; }
  .checkout-quantity { grid-column:2;justify-self:start;text-align:left; }
}
.checkout-section { margin:var(--v5-space-5) var(--v5-space-4) 0; }
.checkout-section-heading { display:flex; align-items:center; min-height:44px; padding:0 2px; font:600 var(--ui-type-section)/20px var(--font-v5); letter-spacing:-.012em; }
.checkout-option { display:flex; align-items:center; gap:var(--v5-space-3); min-height:64px; padding:10px 16px; border-bottom:1px solid var(--v5-border); }
.checkout-option:last-child { border-bottom:0; }
.checkout-icon { display:grid; place-items:center; flex:none; width:36px; height:36px; border-radius:12px; color:var(--v5-ink-2); background:var(--ui-content-surface-2); }
.checkout-option-copy { flex:1; min-width:0; }
.checkout-row-title { display:block; font:500 var(--ui-type-list-title)/20px var(--font-v5); }
.checkout-row-description { display:block; margin-top:2px; font:400 var(--ui-type-list-subtitle)/18px var(--font-v5); color:var(--v5-ink-3); overflow-wrap:anywhere; }
.checkout-discount { flex:none; color:var(--v5-brand); font:600 15px/20px var(--font-v5); font-variant-numeric:tabular-nums; }
.checkout-chevron { flex:none; width:16px; height:16px; color:var(--v5-ink-4); transition:transform 180ms ease; }
.checkout-chevron--open { transform:rotate(90deg); }
.checkout-voucher { cursor:pointer; }
/* Voucher choice is a single-select list aligned with the row copy, then a muted link to the voucher list. */
.checkout-voucher-details { border-bottom:1px solid var(--v5-border); }
.checkout-voucher-match { padding:var(--v5-space-2) var(--v5-space-4) 0 64px; }
.checkout-voucher-choices { padding:var(--v5-space-1) var(--v5-space-4) var(--v5-space-1) 64px; }
.checkout-tradein :deep(.nx-button) { flex:none; max-width:42%; min-height:44px; padding:6px 0 6px 8px; color:var(--v5-brand); font-size:13px; }
.checkout-payment { cursor:pointer; transition:background 180ms ease; }
.checkout-payment--active { background:linear-gradient(90deg,color-mix(in srgb,var(--v5-brand) 12%,transparent),color-mix(in srgb,var(--v5-brand) 2%,transparent)); box-shadow:inset 3px 0 0 var(--v5-brand); }
.checkout-payment--active .checkout-icon { color:var(--v5-brand); }
.checkout-radio { flex:none; width:20px; height:20px; border-radius:50%; border:1.5px solid var(--v5-ink-4); background:var(--v5-ink); }
.checkout-radio--active { border-color:var(--v5-brand); background:radial-gradient(circle,var(--v5-brand) 0 55%,transparent 62%); }
.checkout-fees { padding:6px 0; }
.checkout-fee { gap:var(--v5-space-4); min-height:40px; padding:6px 16px; }
.checkout-fee :deep(uni-text),.checkout-fee :deep(text) { font-size:14px !important; line-height:20px; }
.checkout-fee :deep(.tabular-nums) { text-align:right; flex-shrink:0; max-width:65%; overflow-wrap:anywhere; }
.checkout-fee--discount :deep(.tabular-nums) { color:var(--v5-brand) !important; }
.checkout-fee--total { margin-top:var(--v5-space-1); padding-block:12px; min-height:55px; box-sizing:border-box; border-top:1px solid var(--v5-border); }
.checkout-fee--total > text,.checkout-fee--total > uni-text { font-weight:600; }
.checkout-fee--total :deep(.tabular-nums) { font-size:18px !important; }
.checkout-note { display:block; margin:var(--v5-space-3) 2px 0; font:400 12.5px/1.6 var(--font-v5); color:var(--v5-ink-3); }
.checkout-trial-credit { display:flex; justify-content:space-between; align-items:baseline; gap:var(--v5-space-3); margin-top:var(--v5-space-3); padding:var(--v5-space-3) var(--v5-space-4); border-radius:var(--v5-radius-m); background:color-mix(in srgb, var(--v5-brand) 10%, transparent); font-size:var(--ui-type-list-subtitle); line-height:var(--ui-type-list-subtitle-lh); font-weight:600; color:var(--v5-ink-2); }
.checkout-trial-credit-value { color:var(--v5-brand); text-align:right; font-variant-numeric:tabular-nums; }
.checkout-note--warning { padding:10px 12px; border-radius:12px; background:var(--v5-warning-soft); color:var(--v5-warning-ink); }
.checkout-capacity-actions { display:flex; flex-wrap:wrap; gap:var(--v5-space-1) var(--v5-space-3); margin-top:6px; }
.checkout-legal { margin:var(--v5-space-3) 2px 0; font:400 12.5px/20px var(--font-v5); color:var(--v5-ink-3); text-align:center; }
.checkout-legal-link { display:inline; color:var(--v5-brand); cursor:pointer; }
.checkout-legal-link:focus-visible { outline:2px solid var(--v5-brand); outline-offset:2px; border-radius:2px; }
.checkout-policy-notice { margin-top:var(--v5-space-3); font:400 var(--ui-type-list-subtitle)/20px var(--font-v5); color:var(--v5-ink-2); overflow-wrap:anywhere; }
button.checkout-policy-link { display:block; width:100%; min-height:44px; margin:0; padding:var(--v5-space-2) 0; border:0; border-radius:0; background:transparent; color:var(--v5-brand); font:500 13px/20px var(--font-v5); text-align:left; overflow-wrap:anywhere; }
.checkout-policy-notice > button.checkout-policy-link { text-align:center; }
button.checkout-policy-link::after { border:0; }
.checkout-policy-link:focus-visible { outline:2px solid var(--v5-brand); outline-offset:2px; }
.checkout-policy-body { color:var(--v5-ink-2); font:400 14px/22px var(--font-v5); overflow-wrap:anywhere; }
.checkout-policy-section { display:block; margin-bottom:var(--v5-space-5); }
.checkout-policy-title { display:block; margin-bottom:6px; color:var(--v5-ink); font-weight:600; }
.checkout-policy-links { border-top:1px solid var(--v5-border); }
.checkout-cancel { display:grid; place-items:center; min-height:44px; margin-top:var(--v5-space-1); font:400 var(--ui-type-list-subtitle)/18px var(--font-v5); color:var(--v5-ink-3); cursor:pointer; }
.checkout-sticky { position:absolute; bottom:0; left:0; right:0; z-index:36; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:var(--v5-space-3); min-height:100px; padding:var(--v5-space-3) var(--v5-space-4) calc(30px + env(safe-area-inset-bottom)); background:linear-gradient(180deg,color-mix(in srgb,var(--ui-ticket-top) 70%,transparent),color-mix(in srgb,var(--ui-ticket-bottom) 94%,transparent)); border-top:1px solid color-mix(in srgb,var(--v5-ink) 5%,transparent); backdrop-filter:blur(18px) saturate(160%); -webkit-backdrop-filter:blur(18px) saturate(160%); }
.checkout-sticky-copy { min-width:0; }
.checkout-total { display:block; font:600 20px/24px var(--font-amount); font-variant-numeric:tabular-nums; color:var(--v5-ink); white-space:nowrap; }
.checkout-sticky :deep(.nx-button) { flex:1 0 150px; min-width:150px; min-height:48px; font-size:var(--ui-type-button); box-shadow:0 8px 22px color-mix(in srgb,var(--v5-brand) 30%,transparent),inset 0 1px 0 var(--v5-liquid-highlight); }
.checkout-summary-total { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:var(--v5-space-2); }
.checkout-summary-total :deep(.checkout-amount) { font-size:var(--ui-type-section); }
.checkout-exit-error { display:grid; gap:var(--v5-space-5); color:var(--v5-ink-2); line-height:1.6; }
.checkout-promotion { padding:var(--v5-space-2) var(--v5-space-4) 120px; color:var(--v5-ink); }
.checkout-promotion--result { padding: 0; }
.checkout-promotion :deep(.promotion-flat) { border:1px solid var(--v5-border); border-radius:22px; background:var(--ui-content-surface); padding:var(--v5-space-4); }
.checkout-promotion :deep(.promotion-summary) { min-height:40px; font-size:14px; }
.checkout-promotion :deep(.promotion-summary.total) { min-height:55px; font-size:18px; }
.checkout-promotion :deep(.promotion-image) { width:74px; height:74px; border-radius:16px; flex:none; }
.checkout-promotion :deep(.promotion-price) { font-size:15px; font-weight:600; }
.checkout-voucher:focus-visible,.checkout-payment:focus-visible,.checkout-cancel:focus-visible { outline:2px solid var(--v5-brand); outline-offset:-2px; }
.checkout-voucher:active,.checkout-payment:active,.checkout-cancel:active { opacity:.8; }
@media(prefers-reduced-motion:reduce) { .checkout-step-fill { transition:none !important; }.checkout-payment,.checkout-chevron { transition:none; } }
</style>

<style scoped>
.checkout-voucher-choice { min-height:48px; display:flex; align-items:center; gap:var(--v5-space-3); border-bottom:1px solid var(--v5-border); cursor:pointer; }
.checkout-voucher-choice:last-child { border-bottom:0; }
.checkout-voucher-choice__label { flex:1; min-width:0; color:var(--v5-ink-2); font:400 var(--ui-type-subheading)/var(--ui-type-subheading-lh) var(--font-v5); }
.checkout-voucher-choice[aria-checked="true"] .checkout-voucher-choice__label { color:var(--v5-ink); font-weight:var(--ui-type-subheading-weight); }
.checkout-voucher-choice[aria-disabled="true"] { opacity:.45; pointer-events:none; }
.checkout-voucher-radio { width:22px; height:22px; flex:none; box-sizing:border-box; display:grid; place-items:center; border-radius:999px; border:1.5px solid var(--v5-ink-4); }
.checkout-voucher-radio--on { border:0; background:var(--v5-brand); color:var(--v5-on-brand); }
.checkout-voucher-link { min-height:48px; display:flex; align-items:center; justify-content:space-between; padding:0 16px 0 64px; border-top:1px solid var(--v5-border); color:var(--v5-ink-3); font:500 var(--ui-type-text-link)/var(--ui-type-text-link-lh) var(--font-v5); cursor:pointer; }
.checkout-voucher-choice:focus-visible,.checkout-voucher-link:focus-visible { outline:2px solid var(--v5-brand); outline-offset:-2px; }
</style>
