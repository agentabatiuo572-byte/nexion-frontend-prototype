<!--
  Order detail — ported from Nexion-prototype/app/(main)/store/orders/[id]/
  page.tsx. Dynamic [id] → ?id= query (onLoad). Single-order tracking:
    hero status (color-keyed by status) → activated→Earn jump → order summary →
    4-stage deployment timeline → cancel action (only while "placed").

  While on this page, advanceOrder(id) ticks every 3s so the provisioning bar
  moves visibly. Cancel uses confirm() from the ui store (danger). Wrapped in
  <AppChassis active="store">; back + "Order details" title live in the sticky
  chassis nav header via useSetPageHeader.

  Status-color opacity tints use color-mix(... transparent) since uni can't do
  the source's `${color}10` hex-suffix on a CSS variable.
-->
<template>
  <AppChassis active="store">
    <!-- Chassis-nav pages (useSetPageHeader) don't get sub-page-header.vue's global
         24px .spv gap, so the nav→content breathing is supplied here once. -->
    <view style="color: var(--v5-ink); padding-top: 24px">
      <view v-if="remoteOrderError" class="mx-4 rounded-2xl" :style="remoteErrorStyle">
        <view class="flex items-center justify-between" style="gap: 12px">
          <text :style="{ color: 'var(--v5-warning)', fontSize: '12px', lineHeight: '1.5' }">{{ t.orders.refreshFailed }}</text>
          <view class="shrink-0 active:opacity-70 nx-card-recovery-action nx-card-recovery-action--quiet nx-card-recovery-action--inline" :aria-disabled="remoteOrderRefreshing ? 'true' : 'false'" role="button" tabindex="0" @click="refreshOrder">
            <text>{{ t.store.catalogRetry }}</text>
          </view>
        </view>
      </view>

      <view v-if="showRemoteOrderLoading" class="text-center" role="status" aria-live="polite" style="padding: 20px">
        <text class="block" style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3)">{{ t.orders.refreshing }}</text>
        <text class="block" :style="sectionLabelStyle" style="margin-top: 24px">{{ t.orders.orderSummary }}</text>
        <text class="block" :style="sectionLabelStyle" style="margin-top: 24px">{{ t.orders.timelineTitle }}</text>
      </view>

      <!-- Order not found only after the scoped remote read settles. -->
      <view v-else-if="showOrderNotFound" class="text-center" style="padding: 20px">
        <text class="block" style="font-size: var(--ui-type-list-subtitle); color: var(--v5-ink-3); margin-bottom: 12px">{{ t.orders.notFound }}</text>
        <view class="inline-flex items-center justify-center active:opacity-90" :style="notFoundBtnStyle" role="button" tabindex="0" :aria-label="t.orders.title" @click.stop="goOrders">
          <text>{{ t.orders.title }} →</text>
        </view>
      </view>

      <!-- FEAT-TRIAL05 purchase result: shown once right after a trial purchase. -->
      <view v-else-if="resultOrder && (showTrialResult || paymentResultVisible)" class="order-payment-result" data-testid="trial-purchase-result">
        <CheckoutResult :state="paymentResultState" :product-name="commerceOrderTitle(resultOrder,locale.code)" :product-image="getProductMedia(resultOrder.productId)?.src" :amount="resultOrder.total" :error="paymentResultState === 'error' ? t.orders.refreshFailed : ''" @devices="goDevices" @retry="refreshOrder">
        <text v-if="showTrialResult && paymentResultState === 'activated'" class="trial-result-body">{{ resultRunningText }}</text>
        <view v-if="showTrialResult && resultOrder.trialReward && (resultOrder.trialReward.usdt > 0 || resultOrder.trialReward.nex > 0)" class="trial-result-credit" role="group" :aria-label="purchaseCopy.resultCredited">
          <text class="trial-result-credit-label">{{ purchaseCopy.resultCredited }}</text>
          <view v-if="resultOrder.trialReward.usdt > 0" class="trial-result-row"><text>{{ purchaseCopy.resultUsdt }}</text><text class="trial-result-usdt">+{{ formatAmount(resultOrder.trialReward.usdt) }} USDT</text></view>
          <view v-if="resultOrder.trialReward.nex > 0" class="trial-result-row"><text>{{ purchaseCopy.resultUvt }}</text><text class="trial-result-uvt">+{{ formatAmount(resultOrder.trialReward.nex) }} UVT</text></view>
        </view>
        <view v-if="showTrialResult && orderSaved > 0" class="trial-result-summary">
          <view class="trial-result-line"><text>{{ purchaseCopy.resultSaved }}</text><text class="trial-result-saved">{{ formatAmount(orderSaved) }} USDT</text></view>
        </view>
        <view class="trial-result-actions">
          <view class="trial-result-secondary active:opacity-85" role="button" tabindex="0" :aria-label="purchaseCopy.resultOrder" @click="showTrialResult = false; paymentResultVisible = false"><text>{{ purchaseCopy.resultOrder }}</text></view>
        </view>
        </CheckoutResult>
      </view>

      <template v-else-if="order">
        <!-- Status hero (DS-28): the progress track is the page's main visual;
             the card's next step sits at its foot. -->
        <view class="order-hero" :style="{ '--order-tone': statusColor }" data-testid="order-hero">
          <view class="order-hero__top">
            <view class="order-hero__text">
              <NxTag :tone="statusTone" :label="statusLabel(order.status)" />
              <text class="order-hero__title">{{ commerceOrderTitle(order,locale.code) }}</text>
              <text v-if="order.status === 'provisioning'" class="order-hero__hint">{{ dynamicHint }}</text>
              <text v-if="order.status === 'activated'" class="order-hero__hint">{{ activatedHint }}</text>
              <view v-else-if="heroHint" class="order-hero__hint" :class="{ 'order-hero__hint--warning': order.status === 'placed' }">
                <svg v-if="order.status === 'placed'" class="order-hero__hint-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                <text>{{ heroHint }}</text>
              </view>
            </view>
            <view class="order-hero__art" aria-hidden="true">
              <image v-if="heroImage" class="order-hero__image" :src="heroImage" mode="aspectFit" />
              <view v-else class="order-hero__icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" :stroke="statusColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(d, di) in statusIcon" :key="di" :d="d" /></svg>
              </view>
            </view>
          </view>

          <view v-if="trackSteps.length" class="order-track" :style="{ gridTemplateColumns: `repeat(${trackSteps.length}, minmax(0, 1fr))` }" role="list" :aria-label="t.orders.timelineTitle">
            <view v-for="(step, i) in trackSteps" :key="step.stage" class="order-track__step" role="listitem" :aria-hidden="step.state === 'todo' ? 'true' : undefined">
              <view v-if="i < trackSteps.length - 1" class="order-track__segment"><view v-if="step.segmentDone" class="order-track__fill nx-viz-grow" /></view>
              <view class="order-track__dot" :class="[`order-track__dot--${step.state}`, { 'order-track__dot--live': step.state === 'current' && (isProvisioning || order.status === 'paid') }]">
                <svg v-if="step.state === 'done'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                <svg v-else-if="step.state === 'failed' || step.state === 'stopped'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
              </view>
              <!-- Steps not reached yet show only their dot; the label appears once the order gets there. -->
              <text v-if="step.state !== 'todo'" class="order-track__label" :class="[`order-track__label--${step.state}`, { 'order-track__label--waiting': step.state === 'current' && order.status === 'placed' }]">{{ step.label }}</text>
            </view>
          </view>

          <text v-if="needsRecovery" class="order-hero__note" data-testid="order-recovery">{{ recoveryHint }}</text>
        </view>

        <!-- Pending remote orders can retry only the idempotent UVEL wallet debit. -->
        <view v-if="(orderAction || orderCommandUnavailable) && !externalPayment" class="order-block" role="status">
          <text class="block">{{ orderAction?.kind==='cancel' ? recoveryCopy.cancelPending : recoveryCopy.paymentPending }}</text>
          <view class="flex flex-wrap gap-2 mt-3">
            <NxButton variant="secondary" size="small" :label="recoveryCopy.query" :busy="orderCommandQuerying" :disabled="payingFromWallet || cancellingOrder" @click="recoverOrderAction(false)" />
            <NxButton v-if="orderAction?.kind==='cancel'" variant="secondary" size="small" :label="recoveryCopy.retryCancel" :disabled="orderCommandQuerying || cancellingOrder" @click="recoverOrderAction(true)" />
            <NxButton v-if="orderAction?.kind==='pay' && resumePaymentAllowed && canPayFromWallet" size="small" :label="recoveryCopy.resume" :disabled="orderCommandQuerying || payingFromWallet" @click="handleWalletPayment" />
          </view>
        </view>

        <!-- Order summary: the total leads, then only the lines that explain it, then the record. -->
        <view class="order-summary order-block">
          <text class="order-summary__title">{{ t.orders.orderSummary }}</text>
          <view class="order-summary__total">
            <text class="order-summary__total-label">{{ order.trialReward ? purchaseCopy.orderPaid : t.orders.total }}</text>
            <CheckoutAmount class="order-summary__amount" :value="order.total" :currency="order.paidAt == null ? 'USD' : 'USDT'" />
          </view>
          <DetailRow :label="t.orders.quantity" :value="`${orderQuantity}`" />
          <view v-if="order.lineItems?.length" class="order-summary__lines">
            <view v-for="item in order.lineItems" :key="item.sku" class="order-summary__line">
              <view class="flex-1 min-w-0">
                <text class="order-summary__line-name">{{ (item.name) }}</text>
                <text class="order-summary__line-meta">{{ item.sku }} · {{ item.quantity }} × {{ summaryMoney(item.unitPriceUsdt) }}</text>
              </view>
              <text class="order-summary__line-amount">{{ summaryMoney(item.lineAmountUsdt) }}</text>
            </view>
          </view>
          <DetailRow v-if="(order.itemCount ?? 1) === 1 && orderQuantity > 1" :label="t.orders.unitPrice" :value="summaryMoney(order.unitPrice)" />
          <DetailRow v-if="Number(order.subtotal) !== Number(order.total)" :label="t.orders.subtotal" :value="summaryMoney(order.subtotal, true)" />
          <DetailRow v-if="order.discount > 0" :label="t.orders.discount" :value="`−${summaryMoney(order.discount)}`" brand />
          <!-- Trial conversion orders: each checkout discount on its own row (never folded into the voucher line). -->
          <DetailRow v-if="(order.promoDiscountUSD ?? 0) > 0" :label="t.orders.trialDiscount" :value="`−${summaryMoney(order.promoDiscountUSD ?? 0)}`" brand />
          <DetailRow v-if="(order.trialOffsetUSD ?? 0) > 0" :label="t.orders.trialOffset" :value="`−${summaryMoney(order.trialOffsetUSD ?? 0)}`" brand />
          <DetailRow v-if="(order.earlyDiscountUSD ?? 0) > 0" :label="trialLifecycle.earlyDiscountLabel" :value="`−${summaryMoney(order.earlyDiscountUSD ?? 0)}`" brand />
          <DetailRow v-if="trialRewardText && order.status !== 'refunded'" :label="purchaseCopy.orderTrialReward" :value="trialRewardText" brand />
          <template v-if="order.status === 'refunded'">
            <DetailRow v-if="order.refundAmountUsdt != null" :label="t.orders.refundAmount" :value="usdt(order.refundAmountUsdt)" brand />
            <DetailRow v-if="order.refundChannel" :label="t.orders.refundChannel" :value="refundChannelLabel" />
            <DetailRow v-if="order.refundBillNo" :label="t.orders.refundBillNo" :value="order.refundBillNo" mono copyable />
            <text v-if="order.trialReward?.reversedOnRefund && trialRewardText" class="order-summary__note">{{ purchaseCopy.orderRewardsReversed }}</text>
            <view v-if="!order.refundedAt && order.refundAmountUsdt == null && !order.refundBillNo" role="status" class="order-summary__note">
              <text>{{ t.orders.refundDetailsUnavailable }}</text>
            </view>
          </template>
          <view v-if="fullyVoucherSettled" role="status" aria-live="polite" class="order-summary__settled">
            <text class="block">{{ t.orders.voucherSettledNoWalletDebit }}</text>
          </view>
          <view class="order-summary__divider" />
          <DetailRow :label="t.orders.orderIdLabel" :value="order.id" mono copyable />
          <DetailRow v-if="showDataCenter" :label="t.orders.dataCenter" :value="dataCenterLabel" />
          <DetailRow :label="t.orders.placedAt" :value="dt(order.placedAt)" />
          <DetailRow v-if="order.status === 'placed' && order.expiresAt" :label="t.orders.expiresAt" :value="dt(order.expiresAt)" warning />
          <DetailRow v-if="order.paidAt" :label="t.orders.paidAt" :value="dt(order.paidAt)" />
          <DetailRow v-if="order.activatedAt" :label="t.orders.activatedAt" :value="dt(order.activatedAt)" />
          <DetailRow v-if="order.refundedAt" :label="t.orders.refundedAt" :value="dt(order.refundedAt)" />
        </view>

        <OrderRewards v-if="remoteApiEnabled && id" :order-no="id" :payment-allowed="order.status === 'placed' && !paymentExpired && !remoteOrderError && !remoteOrderRefreshing" />
        <view :style="{ height: stickyActionsVisible ? '120px' : '24px' }" />
      </template>
    </view>
    <template #pageFixed>
      <!-- The order's next actions sit in the thumb zone at the bottom of the page (DS-30), whatever its state. -->
      <view v-if="order && stickyActionsVisible" class="order-sticky">
        <template v-if="pendingOrderActionsVisible">
          <NxButton class="order-hero__cancel" variant="secondary" :label="t.orders.cancelOrder" :busy="cancellingOrder" @click="handleCancel" />
          <NxButton v-if="remoteApiEnabled && !paymentExpired" class="order-hero__pay" variant="primary" :label="pendingPaymentChecking ? pendingCopy.checking : externalPayment ? t.orders.paymentInProgressContinue : t.orders.pendingContinue" :busy="pendingPaymentChecking || payingFromWallet" @click="requestPendingPayment()" />
        </template>
        <template v-else-if="needsRecovery">
          <NxButton v-if="canBuyAgain" variant="brand" :label="t.promotion.buyAgain" @click="goStore" />
          <NxButton variant="secondary" :label="t.orders.copyAndSupport" @click="contactOrderSupport" />
        </template>
        <template v-else-if="order.status === 'activated' || order.status === 'inventory'">
          <NxButton v-if="canBuyAgain" variant="secondary" :label="t.promotion.buyAgain" @click="goStore" />
          <NxButton v-if="order.status === 'activated'" variant="brand" :label="t.uiChrome.viewOnEarn" @click="goEarn"><text>{{ t.uiChrome.viewOnEarn }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg></NxButton>
          <NxButton v-else variant="brand" :label="t.myDevices.inventoryTitle" @click="navTo('/pages/me/devices')"><text>{{ t.myDevices.inventoryTitle }}</text><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg></NxButton>
        </template>
        <NxButton v-else-if="canBuyAgain" variant="brand" :label="t.promotion.buyAgain" @click="goStore" />
      </view>
      <NxNoticeDialog class="pending-order-notice" :open="!!paymentNotice" :title="paymentNotice === 'query' ? pendingCopy.queryFailed : pendingCopy.cannotPay" :body="paymentNoticeReason"
        :icon="paymentNotice === 'query' ? 'alert' : 'info'" :primary="paymentNotice === 'query' ? pendingCopy.retry : orderAction?.kind === 'cancel' ? recoveryCopy.retryCancel : orderAction || orderCommandUnavailable ? recoveryCopy.query : liveOrder?.status === 'placed' ? pendingCopy.cancelOrder : pendingCopy.viewDetails"
        :secondary="t.store.coCancel" :busy="pendingPaymentChecking || cancellingOrder || orderCommandQuerying" @primary="runPaymentNoticeAction" @secondary="paymentNotice = ''">
        <text v-if="noticeCancelFailed" class="pending-notice-error" role="alert">{{ pendingCopy.cancelFailed }}</text>
      </NxNoticeDialog>
    </template>
  </AppChassis>
</template>

<script setup lang="ts">
import { dateLocale } from "@/i18n/format";
import { commerceOrderTitle, commerceCopy } from "@/lib/commerce-review";
import { useLocaleStore } from "@/store/locale";
import { formatAmount as formatPlainAmount } from "@/lib/amount-display";
import OrderRewards from '@/components/promotion/order-rewards.vue';
import { ref, computed, watch, onUnmounted, type CSSProperties } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import NxButton from "@/components/ui/nx-button.vue";
import NxTag from "@/components/ui/nx-tag.vue";
import NxNoticeDialog from "@/components/ui/nx-notice-dialog.vue";
import { pendingOrderPayment, usePurchasePayment } from "@/store/purchase-payment";
import CheckoutAmount from "@/components/checkout/CheckoutAmount.vue";
import DetailRow from "@/components/store/order-detail-row.vue";
import CheckoutPaymentSheet from "@/components/checkout/CheckoutPaymentSheet.vue";
import CheckoutResult from "@/components/checkout/CheckoutResult.vue";
import { checkoutFlowCopy } from "@/lib/checkout-flow-copy";
import { orderPaymentRejection } from '@/lib/order-payment-rejection';
import { getProductMedia } from "@/lib/product-media";
import { useT } from "@/i18n/use-t";
import { useTrialPurchaseCopy } from "@/i18n/trial-purchase";
import { fmt } from "@/i18n/format";
import { useTrialLifecycleCopy } from "@/i18n/trial-lifecycle";
import { formatTrialDateTime } from "@/lib/trial-date";
import { useOrders, type OrderStatus, type Order, timelineFor } from "@/store/orders";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { trialReservesSlotNow } from "@/store/free-trial";
import { confirm as uiConfirm, toast } from "@/store/ui";
import { useSetPageHeader } from "@/composables/use-page-header";
import { navReset, navTo, takeNavigationQuery } from "@/lib/route";
import { apiClient,orderApi,purchaseEligibilityApi, remoteApiEnabled, apiRuntimeConfig } from "@/api/runtime";
import { advisorChatRoute } from "@/lib/advisor-chat-route";
import { useConversations } from "@/store/conversations";
import { asApiError } from "@/api/errors";
import { executeSelectedPurchase } from "@/lib/selected-purchase-payment";
import { paidOrderReceipt } from "@/api/order-api";
import { readPaymentCommand } from '@/api/payment-command-api';
import { beginOrderAction,readOrderAction,markOrderActionPaid,clearOrderAction,type PendingOrderAction } from '@/lib/order-command-fence';
import { purchaseRecoveryCopy } from '@/lib/purchase-recovery-copy';
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";

const t = useT();
const locale = useLocaleStore();
const orders = useOrders();
const conversations = useConversations();
const app = useApp();
const auth = useAuth();

const id = ref("");
const autoPayRequested = ref(false);
let pendingPaymentIntentAccount = '';
// FEAT-TRIAL05: `?result=trial` (set by checkout) opens the purchase result once; the order view is one tap away.
const showTrialResult = ref(false);
const paymentResultVisible = ref(false);
const orderOrigin = ref("");
const ordersBackHref = ref("/store/orders");
let detailMounted = true;
let detailVisible = false;
let detailEpoch = 0;
let pendingPaymentSequence = 0;

interface DetailRequestScope {
  pageEpoch: number;
  orderNo: string;
  accountScope: ReturnType<typeof captureAccountScope>;
  runtimeScope: ReturnType<typeof captureRuntimeRevision>;
}

function captureDetailScope(): DetailRequestScope {
  return { pageEpoch: detailEpoch, orderNo: id.value, accountScope: captureAccountScope(), runtimeScope: captureRuntimeRevision() };
}

function isCurrentDetailScope(scope: DetailRequestScope): boolean {
  return detailMounted
    && detailVisible
    && detailEpoch === scope.pageEpoch
    && id.value === scope.orderNo
    && isCurrentAccountScope(scope.accountScope)
    && isCurrentRuntimeRevision(scope.runtimeScope);
}

onLoad((options) => {
  const o = (options || {}) as Record<string, string>;
  const query = new URLSearchParams(takeNavigationQuery("/pages/store/order-detail"));
  const queryIds = query.getAll("id");
  id.value = o.id || (queryIds.length === 1 ? queryIds[0] : "");
  const queryMatchesOrder = Boolean(id.value) && queryIds.length === 1 && queryIds[0] === id.value;
  const from = o.from ?? (queryMatchesOrder && query.getAll("from").length === 1 ? query.get("from") : "");
  showTrialResult.value = (o.result ?? (queryMatchesOrder && query.getAll("result").length === 1 ? query.get("result") : "")) === "trial";
  autoPayRequested.value = (o.pay ?? (queryMatchesOrder && query.getAll('pay').length === 1 ? query.get('pay') : '')) === '1';
  orderOrigin.value = from === "me" || from === "store" ? from : "";
  ordersBackHref.value = orderOrigin.value ? `/store/orders?from=${orderOrigin.value}` : "/store/orders";
  preserveOrderOriginInH5();
  remoteOrderAttempted.value = false;
  remoteOrderError.value = false;
});

function preserveOrderOriginInH5() {
  // A delayed lifecycle may meet another detail's hash; only update this order.
  if (typeof window !== "undefined") {
    try {
      const hash = window.location.hash;
      if (!/^#\/pages\/store\/order-detail(?:\?|$)/.test(hash)) return;
      const question = hash.indexOf("?");
      const query = new URLSearchParams(question < 0 ? "" : hash.slice(question + 1));
      if (!id.value || query.getAll("id").length !== 1 || query.get("id") !== id.value) return;
      if (!orderOrigin.value || (query.getAll("from").length === 1 && query.get("from") === orderOrigin.value)) return;
      query.set("from", orderOrigin.value);
      const path = question < 0 ? hash : hash.slice(0, question);
      window.history.replaceState(window.history.state, "", `${window.location.href.slice(0, -hash.length)}${path}?${query}`);
    } catch { /* Native runtimes have no browser history. */ }
  }
}

const remoteOrderError = ref(false);
const remoteOrderRefreshing = ref(false);
const remoteOrderAttempted = ref(false);
let remoteOrderRefreshSequence = 0;
let activeRemoteOrderScope: DetailRequestScope | null = null;
let pendingPaymentReadScope: DetailRequestScope | null = null;
const walletRefreshing = ref(false);
let walletRefreshSequence = 0;
async function refreshOrderWallet(): Promise<boolean> {
  if (!remoteApiEnabled) return true;
  const scope = captureDetailScope();
  const sequence = ++walletRefreshSequence;
  walletRefreshing.value = true;
  try {
    return await app.refreshRemoteFleet(scope.accountScope);
  } catch {
    return false;
  } finally {
    if (sequence === walletRefreshSequence) walletRefreshing.value = false;
  }
}
async function refreshOrder() {
  if (!remoteApiEnabled || !id.value.trim() || !remoteOrderBoundAccount.value) return;
  if (remoteOrderRefreshing.value && activeRemoteOrderScope
    && isCurrentDetailScope(activeRemoteOrderScope)) return;
  const scope = captureDetailScope();
  const sequence = ++remoteOrderRefreshSequence;
  activeRemoteOrderScope = scope;
  remoteOrderAttempted.value = true;
  remoteOrderRefreshing.value = true;
  remoteOrderError.value = false;
  try {
    const result = await orders.ensureRemoteOrder(id.value);
    if (sequence === remoteOrderRefreshSequence && isCurrentDetailScope(scope)) orderPresentation.value = result ?? null;
  } catch {
    if (sequence !== remoteOrderRefreshSequence || !isCurrentDetailScope(scope)) return;
    remoteOrderError.value = true;
    orderPresentation.value = null;
  } finally {
    if (sequence === remoteOrderRefreshSequence && isCurrentDetailScope(scope)) {
      remoteOrderRefreshing.value = false;
      activeRemoteOrderScope = null;
      if (autoPayRequested.value) {
        if (remoteOrderError.value) {
          autoPayRequested.value = false;
          pendingPaymentIntentAccount = '';
          pendingPaymentReadScope = null;
          paymentNoticeReason.value = pendingCopy.value.queryFailed;
          paymentNotice.value = 'query';
        } else {
          pendingPaymentReadScope = scope;
          void requestPendingPayment(true);
        }
      }
    }
  }
}
onShow(() => {
  if (detailVisible) return;
  detailMounted = true;
  detailVisible = true;
  detailEpoch += 1;
  restoreOrderAction();
  void recoverOrderAction(false);
  preserveOrderOriginInH5();
  void refreshOrder();
  void refreshOrderWallet();
});
onHide(() => {
  detailVisible = false;
  detailEpoch += 1;
  paymentSheetOpen.value = false;
  paymentNotice.value = '';
  pendingPaymentChecking.value = false;
  autoPayRequested.value = false;
  pendingPaymentIntentAccount = '';
  pendingPaymentReadScope = null;
});

const liveOrder = computed(() => orders.orders.find((o) => o.id === id.value));
const orderPresentation = ref<Order | null>(null);
const orderEnvironmentInvalidated = ref(false);
watch(() => apiRuntimeConfig?.environment, () => { orderEnvironmentInvalidated.value = true; orderPresentation.value = null; }, { flush: 'sync' });
watch(() => [app.accountKey, app.accountBindingEpoch, auth.accountId, id.value, locale.code], () => { orderPresentation.value = null; }, { flush: 'sync' });
watch(() => [app.accountKey, app.accountBindingEpoch, auth.accountId, id.value], () => {
  paymentResultOrder.value = null; paymentResultVisible.value = false;
  paymentSheetOpen.value = false; paymentNotice.value = '';
  pendingPaymentChecking.value = false;
  pendingPaymentReadScope = null;
}, { flush: 'sync' });
watch(liveOrder, value => {
  if (value && !orderEnvironmentInvalidated.value) orderPresentation.value = value;
}, { immediate: true, flush: 'sync' });
// Runtime invalidation still clears the shared store and every command uses liveOrder.
const order = computed(() => orderEnvironmentInvalidated.value || remoteOrderError.value ? undefined : liveOrder.value ?? orderPresentation.value ?? undefined);
const orderQuantity = computed(() => order.value?.lineItems?.reduce((total, item) => total + item.quantity, 0) ?? order.value?.quantity ?? 0);
const refundChannelLabel = computed(() => order.value?.refundChannel === "WALLET"
  ? t.value.promotion.wallet : t.value.orders.refundDetailsUnavailable);
const hasOrderId = computed(() => Boolean(id.value.trim()));
const remoteOrderBinding = computed(() => {
  const accountKey = auth.isAuthenticated ? auth.accountId : "";
  const boundAccountKey = orders.currentAccountKey();
  return {
    accountKey: remoteApiEnabled && accountKey !== "default" && boundAccountKey === accountKey
      ? accountKey
      : "",
    revision: orders.currentAccountBindingRevision(),
  };
});
const remoteOrderBoundAccount = computed(() => remoteOrderBinding.value.accountKey);
const showRemoteOrderLoading = computed(() => remoteApiEnabled
  && hasOrderId.value
  && !order.value
  && (!remoteOrderBoundAccount.value || !remoteOrderAttempted.value || remoteOrderRefreshing.value));
const showOrderNotFound = computed(() => !order.value && (!remoteApiEnabled
  || !hasOrderId.value
  || (remoteOrderBoundAccount.value && remoteOrderAttempted.value
    && !remoteOrderRefreshing.value && !remoteOrderError.value)));
watch(remoteOrderBinding, (binding, previousBinding) => {
  if (!detailVisible || !binding.accountKey || binding.revision === previousBinding.revision || !id.value.trim()) return;
  remoteOrderAttempted.value = false;
  remoteOrderError.value = false;
  void refreshOrder();
});
// Catalogue refresh clears the shared remote orders without rebinding the
// account. The visible detail must read again under the new runtime revision.
const unsubscribeRuntimeRevision = subscribeRuntimeRevision(() => {
  if (!detailMounted || !detailVisible || !remoteOrderBoundAccount.value || !id.value.trim()) return;
  remoteOrderAttempted.value = false;
  remoteOrderError.value = false;
  void refreshOrder();
});
const fullyVoucherSettled = computed(() => order.value != null
  && order.value.total === 0
  && order.value.paymentMethod?.toUpperCase() === "VOUCHER"
  && order.value.status !== "placed");

// Sticky chassis nav header — back + "Order details" title. The order number
// stays in the summary card; a long id is not a page title. Getter form: falls
// back to "not found" before the order loads / for a bad id.
useSetPageHeader(() => ({
  title: showTrialResult.value || paymentResultVisible.value ? checkoutFlowCopy(locale.code).resultTitle : order.value
    ? t.value.orders.detailTitle
    : (showRemoteOrderLoading.value || remoteOrderError.value ? t.value.orders.title : t.value.orders.notFound),
  backHref: ordersBackHref.value,
}));

// While on this page, tick orders every 3s so the provisioning bar moves
// visibly. The global ORDER_TICK loop (App.vue, 6s) also advances orders; this
// faster local tick just gives the detail view a tighter feel.
let tickTimer: ReturnType<typeof setInterval> | undefined;
const detailNow = ref(Date.now());
const reservedSlots = computed(() => (trialReservesSlotNow() ? 1 : 0));
function startTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    detailNow.value = Date.now();
    if (id.value) orders.advanceOrder(id.value, reservedSlots.value);
    if (remoteApiEnabled && detailVisible && liveOrder.value?.status === 'placed'
        && liveOrder.value.expiresAt != null && liveOrder.value.expiresAt <= detailNow.value
        && !payingFromWallet.value && !cancellingOrder.value) {
      paymentSheetOpen.value = false;
      void refreshOrder();
    }
  }, 3000);
}
startTick();

const stages = computed(() => order.value?.status === "inventory" ? ["placed", "paid", "inventory"] as OrderStatus[]
  : order.value ? timelineFor(order.value.productId) : []);
// Cancellable ONLY before payment settles ("placed"). Checkout settles to
// "paid", so in practice no order rests at "placed" — kept faithful to source.
const walletPaymentConfirmed = ref(false);
const paymentSheetOpen = ref(false);
const paymentSheetAmount = ref<number|string>(0);
const paymentSheetError = ref('');
const pendingPaymentChecking = ref(false);
const paymentNotice = ref<''|'query'|'blocked'>('');
const paymentNoticeReason = ref('');
const noticeCancelFailed = ref(false);
const paymentResultOrder = ref<Order|null>(null);
const resultOrder = computed(() => order.value ?? paymentResultOrder.value);
const pendingCopy = computed(() => checkoutFlowCopy(locale.code));
const paymentResultState = computed<'activated'|'inventory'|'processing'|'error'>(() => remoteOrderError.value ? 'error' : resultOrder.value?.status === 'activated'
  ? 'activated' : resultOrder.value?.status === 'inventory' ? 'inventory' : walletPaymentConfirmed.value || resultOrder.value?.status === 'paid' || resultOrder.value?.status === 'provisioning' ? 'processing' : 'error');
const payingFromWallet = ref(false);
const cancellingOrder = ref(false);
const orderAction = ref<PendingOrderAction|null>(null);
const orderCommandUnavailable = ref(false);
const orderCommandQuerying = ref(false);
const resumePaymentAllowed = ref(false);
const recoveryCopy = computed(()=>purchaseRecoveryCopy(locale.code));
let cancelAttemptSequence = 0;
function currentOrderPayable(): boolean {
  return !orderEnvironmentInvalidated.value && liveOrder.value?.status === "placed"
    && !liveOrder.value.promotionQuoteId
    && !remoteOrderRefreshing.value && !remoteOrderError.value
    && !walletPaymentConfirmed.value
    && !payingFromWallet.value;
}
function canCancelCurrentOrder():boolean {return currentOrderPayable()&&!orderAction.value&&!orderCommandUnavailable.value;}
function restoreOrderAction():void {
  resumePaymentAllowed.value=false;
  try {
    orderAction.value=remoteApiEnabled?readOrderAction(orders.currentAccountKey(),id.value):null;
    walletPaymentConfirmed.value=orderAction.value?.phase==='paid';
    orderCommandUnavailable.value=false;
  } catch { orderCommandUnavailable.value=true; }
}
watch(()=>[auth.accountId,id.value],restoreOrderAction,{flush:'sync'});
async function recoverOrderAction(retryCancel=false):Promise<void> {
  if (!remoteApiEnabled||orderCommandQuerying.value||payingFromWallet.value||cancellingOrder.value) return;
  const scope=captureDetailScope(),accountKey=orders.currentAccountKey();
  const receiptScope=app.captureRemoteAccountRequest();
  orderCommandQuerying.value=true;resumePaymentAllowed.value=false;
  try {
    const action=readOrderAction(accountKey,id.value);orderAction.value=action;orderCommandUnavailable.value=false;
    if (!action) return;
    if (action.kind==='cancel') {
      if (retryCancel) await orders.cancelOrderRemote(action.orderNo);
      if (!isCurrentDetailScope(scope)) return;
      await refreshOrder();
      if (!isCurrentDetailScope(scope)) return;
      if (!remoteOrderError.value&&liveOrder.value&&liveOrder.value.status!=='placed') clearOrderAction(accountKey,action.orderNo,action.key);
      orderAction.value=readOrderAction(accountKey,action.orderNo);return;
    }
    if (action.phase!=='paid') {
      const result=await readPaymentCommand(apiClient,'order-pay',action.key);
      if (!isCurrentDetailScope(scope)) return;
      if (result.status==='SUCCEEDED') {
        const receipt=paidOrderReceipt(result.receipt);
        if (receipt.orderNo!==action.orderNo||receipt.amountUsdt!==action.amount) throw new Error('PAYMENT_COMMAND_RECEIPT_MISMATCH');
        markOrderActionPaid(accountKey,action.orderNo);walletPaymentConfirmed.value=true;
        orderAction.value=readOrderAction(accountKey,action.orderNo);
        if (receipt.paymentMethod==='WALLET'&&(receipt.walletBalanceAfterUsdt===null
            || !app.adoptCommerceWallet(receipt.walletBalanceAfterUsdt,receiptScope))) throw new Error('PAYMENT_COMMAND_WALLET_UNAVAILABLE');
      } else if (result.status==='REJECTED') {
        await refreshOrder();
        if (isCurrentDetailScope(scope)&&!remoteOrderError.value&&!remoteOrderRefreshing.value&&liveOrder.value)
          clearOrderAction(accountKey,action.orderNo,action.key,true);
        if (isCurrentDetailScope(scope)) orderAction.value=readOrderAction(accountKey,action.orderNo);
        return;
      } else if (result.status==='NOT_SEEN'&&result.canResumeSameKey) {
        await refreshOrder();
        if (isCurrentDetailScope(scope)) resumePaymentAllowed.value=!remoteOrderError.value&&!remoteOrderRefreshing.value
          &&liveOrder.value?.status==='placed'&&liveOrder.value.total===action.amount;
        return;
      } else return;
    }
    walletPaymentConfirmed.value=true;
    await refreshOrder();
    if (isCurrentDetailScope(scope)&&!remoteOrderError.value&&liveOrder.value?.status==='activated') {
      clearOrderAction(accountKey,action.orderNo,action.key);orderAction.value=null;
      void app.refreshRemoteFleet(receiptScope);
    }
  } catch {
    if (isCurrentDetailScope(scope)) {orderCommandUnavailable.value=true;toast.warn(recoveryCopy.value.paymentPending);}
  } finally { orderCommandQuerying.value=false; }
}
const pendingOrderActionsVisible = computed(() => order.value?.status === "placed" && !order.value.promotionQuoteId && !walletPaymentConfirmed.value);
// Any state with a next action gets the bottom action bar.
const stickyActionsVisible = computed(() => !!order.value && (pendingOrderActionsVisible.value || needsRecovery.value
  || order.value.status === 'activated' || order.value.status === 'inventory' || canBuyAgain.value));
const cancellable = computed(() => canCancelCurrentOrder()
  && !cancellingOrder.value);
const paymentExpired = computed(() => order.value?.expiresAt != null
  && order.value.expiresAt <= detailNow.value);
const canPayFromWallet = computed(() => remoteApiEnabled
  && currentOrderPayable()&&!cancellingOrder.value&&!orderCommandQuerying.value&&!orderCommandUnavailable.value
  // An external payment already underway resumes its own intent; it never debits the wallet again.
  && (!orderAction.value || (orderAction.value.kind==='pay'&&(resumePaymentAllowed.value||externalPayment.value)))
  && !walletRefreshing.value && !paymentExpired.value);
const isProvisioning = computed(() => order.value?.status === "provisioning");
// Orders that closed without completing; their close reason is shown when the backend sent one.
const CLOSED_STATUSES: OrderStatus[] = ['cancelled', 'expired', 'payment_failed', 'provisioning_failed', 'chargeback'];
const needsRecovery = computed(() => !!order.value && ['payment_failed','provisioning_failed','chargeback','expired'].includes(order.value.status));
const recoveryHint = computed(() => order.value?.status === 'expired' ? t.value.orders.expiredNext : t.value.orders.recoveryNext);
const canBuyAgain = computed(() => !!order.value && ['activated','inventory','cancelled','expired','refunded'].includes(order.value.status)
  && !payingFromWallet.value && !cancellingOrder.value && !remoteOrderRefreshing.value && !remoteOrderError.value);
function formatAmount(value: Parameters<typeof formatPlainAmount>[0]): string {
  return formatPlainAmount(value).replace(/\B(?=(\d{3})+\.)/g, ',');
}
function goStore() { if(canBuyAgain.value)void navTo('/store'); }
function contactOrderSupport() {
  if(!needsRecovery.value||!order.value)return;
  const scope=captureDetailScope();
  uni.setClipboardData({data:order.value.id,success:async()=>{
    if(!isCurrentDetailScope(scope))return;
    const route=await advisorChatRoute(conversations);
    if(isCurrentDetailScope(scope))void navTo(route);
  }});
}
// Hero glow, fallback icon and the current track step share the status tag's tone (design system 03 §3.8).
const STATUS_COLORS: Record<OrderStatus, string> = {
  placed: "var(--v5-warning-ink)",
  paid: "var(--v5-brand)",
  provisioning: "var(--v5-brand)",
  activated: "var(--v5-success-ink)",
  inventory: "var(--v5-success-ink)",
  cancelled: "var(--v5-ink-3)",
  payment_failed: "var(--v5-danger)",
  expired: "var(--v5-ink-3)",
  provisioning_failed: "var(--v5-danger)",
  refunded: "var(--v5-ink-3)",
  chargeback: "var(--v5-danger)",
};
const STATUS_TONES: Record<OrderStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  placed: "warning",
  paid: "brand",
  provisioning: "brand",
  activated: "success",
  inventory: "success",
  cancelled: "neutral",
  payment_failed: "danger",
  expired: "neutral",
  provisioning_failed: "danger",
  refunded: "neutral",
  chargeback: "danger",
};
const statusColor = computed(() => (order.value ? STATUS_COLORS[order.value.status] : "var(--v5-ink-3)"));
const statusTone = computed(() => (order.value ? STATUS_TONES[order.value.status] : "neutral"));
// An external payment for this order is underway: the hero says so and resumes it.
const purchasePaymentState = usePurchasePayment().state;
const externalPayment = computed(() => { purchasePaymentState.revision; return order.value?.status === 'placed' && !!pendingOrderPayment(app.accountKey, id.value); });
const heroImage = computed(() => order.value
  ? (getProductMedia(order.value.productId) ?? getProductMedia(order.value.lineItems?.[0]?.sku))?.src
  : undefined);

// lucide outline paths per status (Clock / CheckCircle2 / Server / Cpu / XCircle)
function iconFor(status: OrderStatus): string[] {
  switch (status) {
    case "placed": return ["M12 6v6l4 2", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"];
    case "paid": return ["M22 11.08V12a10 10 0 1 1-5.93-9.14", "m9 11 3 3L22 4"];
    case "provisioning": return ["M5 2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z", "M5 14h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z", "M6 6h.01", "M6 18h.01"];
    case "inventory":
    case "activated": return ["M12 20v2", "M12 2v2", "M17 20v2", "M17 2v2", "M2 12h2", "M2 17h2", "M2 7h2", "M20 12h2", "M20 17h2", "M20 7h2", "M7 20v2", "M7 2v2", "M4 8h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z", "M8 12h8"];
    case "cancelled": return ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "m15 9-6 6", "m9 9 6 6"];
    case "payment_failed":
    case "provisioning_failed": return ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "m15 9-6 6", "m9 9 6 6"];
    case "expired": return ["M12 6v6l4 2", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"];
    case "refunded": return ["M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4"];
    case "chargeback": return ["M12 2v12m0 4v4m-7-5 3 3m11-3-3 3"];
  }
}
const statusIcon = computed(() => (order.value ? iconFor(order.value.status) : []));

function statusLabel(s: OrderStatus): string {
  switch (s) {
    case "placed": return t.value.orders.statusPlaced;
    case "paid": return t.value.orders.statusPaid;
    case "provisioning": return t.value.orders.statusProvisioning;
    case "activated": return t.value.orders.statusActivated;
    case "inventory": return t.value.orders.statusInventory;
    case "cancelled": return t.value.orders.cancelStatus;
    case "payment_failed": return t.value.orders.statusPaymentFailed;
    case "expired": return t.value.orders.statusExpired;
    case "provisioning_failed": return t.value.orders.statusProvisioningFailed;
    case "refunded": return t.value.orders.statusRefunded;
    case "chargeback": return t.value.orders.statusChargeback;
  }
}

const dataCenterLabel = computed(() => {
  const dc = order.value?.dataCenter?.trim();
  if (!dc) return "—";
  const name = dc.toLowerCase();
  if (name === "frankfurt" || name === "frankfurt dc") return t.value.store.coDcFrankfurt;
  if (name === "singapore" || name === "singapore dc") return t.value.store.coDcSingapore;
  return dc;
});
const dynamicHint = computed(() => {
  const o = order.value;
  if (!o) return "";
  if (!o.dataCenter?.trim()) return o.status === "provisioning" ? commerceCopy(locale.code).provisioningLocationPending : commerceCopy(locale.code).activatedLocationPending;
  const tmpl = o.status === "provisioning" ? t.value.orders.provisioningHint : t.value.orders.activatedHint;
  return tmpl.replace("{dc}", () => dataCenterLabel.value);
});
const activatedHint = computed(() =>
  !order.value ? "" : !order.value.dataCenter?.trim() ? commerceCopy(locale.code).activatedLocationPending : t.value.orders.activatedHint.replace("{dc}", () => dataCenterLabel.value),
);

// One line under the title: the countdown while unpaid, otherwise the result the
// server recorded (provisioning and activation carry their own hints above).
const heroHint = computed(() => {
  const current = order.value;
  if (!current) return "";
  if (current.status === "placed") {
    const left = current.expiresAt == null ? 0 : current.expiresAt - detailNow.value;
    return left > 0 ? fmt(externalPayment.value ? t.value.orders.paymentInProgress : t.value.orders.pendingCloseIn, { min: Math.ceil(left / 60000) }) : "";
  }
  if (current.status === "inventory") return t.value.orders.inventoryToast;
  if (current.status === "refunded") return current.refundReasonCode ? t.value.orders.refundReasons[current.refundReasonCode] : "";
  return current.closeReasonCode && CLOSED_STATUSES.includes(current.status) ? t.value.orders.closeReasons[current.closeReasonCode] : "";
});
// An order closed before payment never reached a data center.
const showDataCenter = computed(() => !!order.value && !["payment_failed", "expired", "cancelled"].includes(order.value.status));

type TrackState = "done" | "current" | "todo" | "failed" | "stopped";
// Progress track: steps done so far, the one in progress, and where a closed order stopped.
// Refunds and disputes leave the deployment flow, so they show no track.
const trackSteps = computed(() => {
  const current = order.value;
  if (!current || current.status === "refunded" || current.status === "chargeback") return [];
  const stopAt = ["payment_failed", "expired", "cancelled"].includes(current.status) ? 1
    : current.status === "provisioning_failed" ? 2 : -1;
  const reached = stopAt >= 0 ? stopAt
    : current.status === "placed" ? 1
    : current.status === "paid" || current.status === "provisioning" ? 2
    : stages.value.length;
  const steps = stages.value.map((stage, index) => {
    const state: TrackState = index === stopAt
      ? (current.status === "payment_failed" || current.status === "provisioning_failed" ? "failed" : "stopped")
      : index < reached ? "done" : index === reached && stopAt < 0 ? "current" : "todo";
    return { stage, state, label: index === stopAt ? statusLabel(current.status) : statusLabel(stage), segmentDone: false };
  });
  steps.forEach((step, index) => {
    const next = steps[index + 1];
    step.segmentDone = !!next && (next.state === "done" || next.state === "current");
  });
  return steps;
});

function dt(ts: number): string {
  return Number.isFinite(ts) && Number.isFinite(new Date(ts).getTime())
    ? formatTrialDateTime(ts, dateLocale())
    : "—";
}

async function handleCancel() {
  if (!cancellable.value) return;
  const scope = captureDetailScope();
  const cancelAttempt = ++cancelAttemptSequence;
  cancellingOrder.value = true;
  try {
    const ok = await uiConfirm({
      title: t.value.orders.cancelOrder,
      message: t.value.orders.cancelConfirm,
      danger: true,
      icon: "warn",
    });
    if (!ok || !canCancelCurrentOrder() || !isCurrentDetailScope(scope) || !liveOrder.value) return;
    const orderNo = liveOrder.value.id;
    const cancelled = remoteApiEnabled
      ? await orders.cancelOrderRemote(orderNo)
      : orders.cancelOrder(orderNo);
    if (!isCurrentDetailScope(scope)) return;
    restoreOrderAction();
    if (cancelled) {
      toast.warn(t.value.orders.cancelDoneToast);
    } else {
      toast.warn(t.value.orders.cancelPendingServer);
    }
  } catch {
    restoreOrderAction();toast.warn(recoveryCopy.value.cancelPending);
  } finally {
    if (cancelAttempt === cancelAttemptSequence) cancellingOrder.value = false;
  }
}

async function offerWalletTopup(requiredUsdt: number): Promise<void> {
  const scope = captureDetailScope();
  const accepted = await uiConfirm({
    title: t.value.errors.insufficientBalanceTitle,
    message: t.value.errors.insufficientBalanceMsg.replace("{amt}", formatAmount(requiredUsdt)),
    confirmLabel: t.value.me.topup,
    cancelLabel: t.value.store.coCancel,
    icon: "warn",
  });
  if (accepted && isCurrentDetailScope(scope)) navTo("/pages/me/wallet-topup");
}

/** Re-read the original order and its eligibility before the payment sheet opens; the server rechecks everything at pay. */
async function requestPendingPayment(originalJustRead = false): Promise<void> {
  if (!remoteApiEnabled || pendingPaymentChecking.value || payingFromWallet.value || cancellingOrder.value || orderCommandQuerying.value) return;
  const scope = captureDetailScope();
  if (originalJustRead && pendingPaymentIntentAccount && pendingPaymentIntentAccount !== scope.accountScope.accountKey) {
    autoPayRequested.value = false;
    pendingPaymentIntentAccount = '';
    pendingPaymentReadScope = null;
    return;
  }
  const attempt = ++pendingPaymentSequence;
  autoPayRequested.value = true;
  pendingPaymentIntentAccount = scope.accountScope.accountKey;
  pendingPaymentReadScope = null;
  pendingPaymentChecking.value = true;
  paymentSheetError.value = '';
  paymentNotice.value = '';
  noticeCancelFailed.value = false;
  try {
    if (!originalJustRead) await refreshOrder();
    if (!isCurrentDetailScope(scope)) return;
    pendingPaymentReadScope = null;
    if (remoteOrderError.value || remoteOrderRefreshing.value || !liveOrder.value) throw new Error('ORDER_READ_UNAVAILABLE');
    let original = liveOrder.value;
    restoreOrderAction();
    if ((orderAction.value || orderCommandUnavailable.value) && !externalPayment.value) {
      await recoverOrderAction(false);
      if (!isCurrentDetailScope(scope) || orderAction.value || orderCommandUnavailable.value) return;
      if (!liveOrder.value) throw new Error('ORDER_READ_UNAVAILABLE');
      original = liveOrder.value;
    }
    if (original.status === 'activated' || original.status === 'inventory' || original.status === 'paid' || original.status === 'provisioning') {
      paymentResultVisible.value = true;
      return;
    }
    if (original.status !== 'placed' || original.expiresAt == null || original.expiresAt <= Date.now()) {
      paymentNoticeReason.value = original.status === 'placed' ? pendingCopy.value.expiredPending : pendingCopy.value.closed;
      paymentNotice.value = 'blocked';
      return;
    }
    if (original.promotionQuoteId) {
      autoPayRequested.value = false;
      pendingPaymentIntentAccount = '';
      await navTo(`/pages/store/checkout?orderNo=${encodeURIComponent(original.id)}`);
      return;
    }
    // The backend owns ALL/EITHER qualification semantics; do not recompute
    // its overall decision from individual policy conditions.
    const purchaseItems = original.lineItems?.map(item => ({ productNo: item.sku, quantity: item.quantity }))
      ?? [{ productNo: original.productId, quantity: original.quantity }];
    const eligibility = await Promise.all([...new Set(purchaseItems.map(item => item.productNo))]
      .map(productNo => purchaseEligibilityApi.get(productNo)));
    if (!isCurrentDetailScope(scope)) return;
    if (eligibility.some(item => !item.eligible)) {
      paymentNoticeReason.value = t.value.store.gateBlockedToast;
      paymentNotice.value = 'blocked';
      return;
    }
    const walletReady = await refreshOrderWallet();
    if (!isCurrentDetailScope(scope)) return;
    // A wallet snapshot is optional for choosing an external payment method.
    if (!canPayFromWallet.value || liveOrder.value?.id !== original.id || liveOrder.value?.total !== original.total
        || liveOrder.value?.quantity !== original.quantity) {
      paymentNoticeReason.value = recoveryCopy.value.changed;
      paymentNotice.value = 'query';
      return;
    }
    paymentSheetAmount.value = original.total;
    paymentSheetOpen.value = true;
    void handleWalletPayment();
  } catch (error) {
    if (isCurrentDetailScope(scope)) {
      paymentNoticeReason.value = pendingCopy.value.queryFailed;
      paymentNotice.value = 'query';
    }
  } finally {
    // Data authority may expire during bootstrap; the attempt still owns its
    // local lock, but must never unlock a newer attempt after hide/re-entry.
    if (attempt === pendingPaymentSequence) {
      pendingPaymentChecking.value = false;
      if (isCurrentDetailScope(scope) && (paymentSheetOpen.value || payingFromWallet.value || paymentResultVisible.value || paymentNotice.value || orderAction.value || orderCommandUnavailable.value)) {
        autoPayRequested.value = false;
        pendingPaymentIntentAccount = '';
        pendingPaymentReadScope = null;
      }
      // A newer authoritative read may have finished while this obsolete
      // attempt was busy. Consume that read once; never start a retry timer.
      if (autoPayRequested.value && pendingPaymentReadScope && isCurrentDetailScope(pendingPaymentReadScope)) void requestPendingPayment(true);
    }
  }
}

function topupPendingOrder(): void {
  paymentSheetOpen.value = false;
  void navTo('/pages/me/wallet-topup');
}

async function runPaymentNoticeAction(): Promise<void> {
  if (pendingPaymentChecking.value || cancellingOrder.value || orderCommandQuerying.value) return;
  if (paymentNotice.value === 'query') { await requestPendingPayment(); return; }
  if (orderAction.value?.kind === 'pay' || orderCommandUnavailable.value) { await recoverOrderAction(false); return; }
  const scope = captureDetailScope();
  noticeCancelFailed.value = false;
  if (orderAction.value?.kind === 'cancel') {
    await recoverOrderAction(true);
    if (!isCurrentDetailScope(scope)) return;
    if (liveOrder.value?.status === 'cancelled') paymentNotice.value = '';
    else noticeCancelFailed.value = true;
    return;
  }
  if (!canCancelCurrentOrder()) { paymentNotice.value = ''; return; }
  cancellingOrder.value = true;
  try {
    const cancelled = await orders.cancelOrderRemote(id.value);
    if (!isCurrentDetailScope(scope)) return;
    restoreOrderAction();
    if (cancelled) paymentNotice.value = '';
    else noticeCancelFailed.value = true;
  } catch {
    if (isCurrentDetailScope(scope)) { restoreOrderAction(); noticeCancelFailed.value = true; }
  } finally { cancellingOrder.value = false; }
}

async function handleWalletPayment() {
  if (!canPayFromWallet.value || payingFromWallet.value || !liveOrder.value) return;
  if (paymentSheetOpen.value && paymentSheetAmount.value !== liveOrder.value.total) {
    paymentSheetOpen.value = false; paymentNoticeReason.value = recoveryCopy.value.changed; paymentNotice.value = 'query'; return;
  }
  if (typeof liveOrder.value.total !== 'number') return; // Promoted orders resume through their original-command checkout above.
  const scope = captureDetailScope();
  const requestOrderNo = liveOrder.value.id;
  const requestAmountUsdt = liveOrder.value.total;
  const requestItems = liveOrder.value.lineItems?.map(item => ({ productNo: item.sku, quantity: item.quantity }))
    ?? [{ productNo: liveOrder.value.productId, quantity: liveOrder.value.quantity }];
  function paymentOrderCurrent(): boolean {
    const current = liveOrder.value;
    if (!isCurrentDetailScope(scope) || !current || current.id !== requestOrderNo || current.total !== requestAmountUsdt
        || current.status !== 'placed' || current.expiresAt == null || current.expiresAt <= Date.now()
        || remoteOrderRefreshing.value || remoteOrderError.value || orderEnvironmentInvalidated.value) return false;
    const items = current.lineItems?.map(item => ({ productNo: item.sku, quantity: item.quantity }))
      ?? [{ productNo: current.productId, quantity: current.quantity }];
    return items.length === requestItems.length && items.every((item, index) => item.productNo === requestItems[index].productNo && item.quantity === requestItems[index].quantity);
  }
  const receiptScope = app.captureRemoteAccountRequest();
  payingFromWallet.value = true;
  paymentSheetOpen.value = false;
  let paymentConfirmed = false;
  try {
      const receipt = await executeSelectedPurchase({amount:requestAmountUsdt,currency:'USDT',summary:liveOrder.value?.productName??t.value.store.coConfirmPurchase},
        async authorization=>{
          if (!paymentOrderCurrent()) {
            if (isCurrentDetailScope(scope)) { paymentNoticeReason.value = recoveryCopy.value.changed; paymentNotice.value = 'query'; }
            return null;
          }
          const action=beginOrderAction(orders.currentAccountKey(),'pay',requestOrderNo,requestAmountUsdt,'WALLET');
          orderAction.value=action;resumePaymentAllowed.value=false;
          try {return await orderApi.pay(requestOrderNo,action.key,authorization);}
          catch(error){
            if (/^PAYMENT_PASSWORD_(INCORRECT|LOCKED|VERSION_CONFLICT|NOT_CONFIGURED|REQUIRED)$/.test(asApiError(error).message)) {
              clearOrderAction(scope.accountScope.accountKey,requestOrderNo,action.key);
              if (isCurrentDetailScope(scope)) orderAction.value=null;
            }
            throw error;
          }
        },
        paymentOrderCurrent,{kind:'ORDER_PAY',payload:{orderNo:requestOrderNo},commandKey:()=>{const action=beginOrderAction(orders.currentAccountKey(),'pay',requestOrderNo,requestAmountUsdt,'EXTERNAL');orderAction.value=action;return action.key;},parseReceipt:paidOrderReceipt,
          orderNo:requestOrderNo,deadlineAt:liveOrder.value.expiresAt??null,image:heroImage.value||undefined,reorder:()=>void navTo('/store')});
      if (!receipt) return;
    if (!isCurrentDetailScope(scope)) return;
    if (receipt.orderNo !== requestOrderNo) {
      throw new Error("WALLET_PAYMENT_RECEIPT_ORDER_MISMATCH");
    }
    paymentConfirmed = true;
    paymentResultOrder.value = liveOrder.value ?? null;
    paymentResultVisible.value = true;
    markOrderActionPaid(scope.accountScope.accountKey,requestOrderNo);
    orderAction.value=readOrderAction(scope.accountScope.accountKey,requestOrderNo);
    walletPaymentConfirmed.value = true;
    if (receipt.paymentMethod === "WALLET"
        && (receipt.walletBalanceAfterUsdt === null
          || !app.adoptCommerceWallet(receipt.walletBalanceAfterUsdt, receiptScope))) {
      throw new Error("WALLET_PAYMENT_RECEIPT_ACCOUNT_MISMATCH");
    }
    await orders.ensureRemoteOrder(requestOrderNo);
    if (!isCurrentDetailScope(scope)) return;
    if (liveOrder.value?.status !== "activated") {
      throw new Error("WALLET_PAYMENT_ORDER_READBACK_MISMATCH");
    }
    if(orderAction.value)clearOrderAction(scope.accountScope.accountKey,requestOrderNo,orderAction.value.key);orderAction.value=null;
    void app.refreshRemoteFleet(receiptScope);
  } catch (error) {
    if (!isCurrentDetailScope(scope)) return;
    if (paymentConfirmed) {
      remoteOrderError.value = true;
      toast.warn(t.value.orders.walletPaymentConfirmedRefreshPending);
    } else {
      // A definitive refusal leaves the order unpaid: retire this payment key so
      // the next attempt is a new command, and give the reason, not "confirming".
      const message = asApiError(error).message;
      const rejection = orderPaymentRejection(error, locale.code);
      if ((rejection || message === "ORDER_WALLET_INSUFFICIENT") && orderAction.value?.kind === 'pay') {
        clearOrderAction(scope.accountScope.accountKey, requestOrderNo, orderAction.value.key, true);
        orderAction.value = null;
      }
      if (message === "ORDER_WALLET_INSUFFICIENT") {
        await offerWalletTopup(requestAmountUsdt);
      } else if (rejection) {
        paymentNoticeReason.value = rejection;
        paymentNotice.value = 'blocked';
        if (message === "ORDER_NOT_PAYABLE" || message === "ORDER_PAYMENT_EXPIRED") await orders.ensureRemoteOrder(requestOrderNo);
      } else {
        restoreOrderAction();toast.warn(recoveryCopy.value.paymentPending);
      }
    }
  } finally {
    // This handler owns the private lock; stale results still finish its attempt.
    payingFromWallet.value = false;
  }
}

function goOrders() {
  navTo(ordersBackHref.value);
}
function goEarn() {
  navTo("/earn");
}
const purchaseCopy = useTrialPurchaseCopy();
const trialLifecycle = useTrialLifecycleCopy();
// Open the warehouse on a fresh stack: back returns to Me, never to this finished result.
function goDevices() {
  void navReset("/pages/me/devices");
}
const usdt = (value: number | string) => `${formatAmount(value)} USDT`;
// Unpaid orders read in dollars (1 USD = 1 USDT); a settled wallet payment reads in USDT.
// Only subtotal and total rows carry the unit.
function summaryMoney(value: number | string, unit = false): string {
  if (!unit) return formatAmount(value);
  return order.value?.paidAt == null ? `$${formatAmount(value)}` : usdt(value);
}
const trialRewardText = computed(() => {
  const reward = order.value?.trialReward;
  if (!reward || (reward.usdt <= 0 && reward.nex <= 0)) return "";
  const nex = `${formatAmount(reward.nex)} UVT`;
  return reward.usdt > 0 ? `${formatAmount(reward.usdt)} USDT · ${nex}` : nex;
});
const orderSaved = computed(() => {
  const current = order.value;
  if (!current) return 0;
  const saved = Number(current.subtotal) - Number(current.total);
  return Number.isFinite(saved) && saved > 0 ? +saved.toFixed(2) : 0;
});
const resultRunningText = computed(() => {
  const current = order.value;
  const device = current ? commerceOrderTitle(current, locale.code) : "";
  return current?.dataCenter?.trim()
    ? fmt(purchaseCopy.value.resultRunning, { device, dc: dataCenterLabel.value })
    : fmt(purchaseCopy.value.resultRunningNoDc, { device });
});

function cleanup() {
  detailMounted = false;
  detailVisible = false;
  detailEpoch += 1;
  unsubscribeRuntimeRevision();
  if (tickTimer) clearInterval(tickTimer);
}
onUnload(() => cleanup());
onUnmounted(() => cleanup());

// ─── styles ───
const notFoundBtnStyle: CSSProperties = {
  minHeight: "44px",
  padding: "0 20px",
  borderRadius: "999px",
  background: "var(--v5-surface)", // 空态 CTA 贴页面底:原 surface-2 与页面底同色不可辨,改 L1
  color: "var(--v5-ink)",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
};
const sectionLabelStyle: CSSProperties = {
  marginBottom: "12px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
const remoteErrorStyle: CSSProperties = {
  marginBottom: "12px",
  padding: "10px 12px",
  background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)",
};


</script>

<style scoped>
/* Status hero (DS-28): solid surface with one 9% tone glow behind the machine art. */
.order-hero { position: relative; overflow: hidden; margin: 0 16px; padding: var(--ui-space-inset-hero); border-radius: var(--ui-radius-surface); background: radial-gradient(260px 220px at 100% 0%, color-mix(in srgb, var(--order-tone) 9%, transparent), transparent 72%), var(--v5-content-surface); }
.order-block { margin: var(--ui-space-card-gap) 16px 0; padding: var(--ui-space-inset); border-radius: var(--ui-radius-surface); background: var(--v5-content-surface); color: var(--v5-ink); }
[data-theme="light"] .order-hero, [data-theme="light"] .order-block { box-shadow: var(--v5-glass-shadow); }
.order-hero__top { display: flex; align-items: center; gap: 12px; }
.order-hero__text { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; }
.order-hero__title { margin-top: 8px; color: var(--v5-ink); overflow-wrap: anywhere; font: var(--ui-type-hero-title-weight) var(--ui-type-hero-title)/var(--ui-type-hero-title-lh) var(--font-v5); }
.order-hero__hint { display: flex; align-items: flex-start; gap: 6px; margin-top: 4px; color: var(--v5-ink-3); overflow-wrap: anywhere; font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.order-hero__hint--warning { color: var(--v5-warning-ink); }
.order-hero__hint-icon { flex: none; margin-top: 3px; }
.order-hero__art { position: relative; flex: none; width: 116px; height: 116px; margin: -8px -6px -8px 0; }
.order-hero__art::before { content: ""; position: absolute; left: 18px; right: 18px; bottom: 12px; height: 16px; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in srgb, #000 55%, transparent), transparent); }
[data-theme="light"] .order-hero__art::before { background: radial-gradient(closest-side, rgba(20,16,8,.16), transparent); }
.order-hero__image { position: relative; width: 116px; height: 116px; }
.order-hero__icon { position: relative; display: grid; place-items: center; width: 72px; height: 72px; margin: 22px; border-radius: 50%; background: color-mix(in srgb, var(--order-tone) 12%, transparent); }
.order-hero__note { display: block; margin-top: 20px; color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
/* Buttons sit side by side while their labels fit, otherwise each takes a full row. */
/* 40px basis = the L button's side padding, so a 1:2 pair splits the remaining width like the design. */
.order-hero__pay { flex-grow: 2; }
.order-sticky { position: absolute; left: 0; right: 0; bottom: 0; z-index: 36; display: flex; flex-wrap: wrap; gap: var(--v5-space-3); padding: var(--v5-space-3) var(--v5-space-4) calc(30px + env(safe-area-inset-bottom)); background: linear-gradient(180deg, color-mix(in srgb, var(--ui-ticket-top) 70%, transparent), color-mix(in srgb, var(--ui-ticket-bottom) 94%, transparent)); border-top: 1px solid color-mix(in srgb, var(--v5-ink) 5%, transparent); backdrop-filter: blur(18px) saturate(160%); -webkit-backdrop-filter: blur(18px) saturate(160%); }
.order-sticky > * { flex: 1 1 40px; min-width: fit-content; }
.order-sticky :deep(.nx-button__surface) { padding-inline: 16px; }
/* Paired buttons share a card row, so they take the M side padding (16px) to fit two labels. */
.order-hero__cancel { --ui-button-ink: var(--v5-danger); }
/* Progress track: 24px steps joined by 2px segments; done segments grow in (DS-29). */
.order-track { display: grid; margin-top: 20px; }
.order-track__step { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; text-align: center; }
.order-track__segment { position: absolute; top: 11px; left: calc(50% + 16px); width: calc(100% - 32px); height: 2px; overflow: hidden; border-radius: 2px; background: var(--v5-surface-3); }
.order-track__fill { width: 100%; height: 100%; background: var(--v5-brand); }
.order-track__dot { position: relative; box-sizing: border-box; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--v5-surface-3); color: var(--v5-ink-3); }
.order-track__dot--done { background: var(--v5-brand); color: var(--v5-on-brand); }
.order-track__dot--current { background: transparent; border: 2px solid var(--order-tone); box-shadow: 0 0 0 4px color-mix(in srgb, var(--order-tone) 18%, transparent); }
.order-track__dot--current::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--order-tone); }
.order-track__dot--live { animation: order-track-pulse 1.8s ease-in-out infinite; }
.order-track__dot--failed { background: var(--v5-danger); color: var(--v5-on-brand); }
[data-theme="light"] .order-track__dot--failed { color: #fff; }
/* Break between words; a single word wider than its column is hyphenated (the page sets <html lang>). */
.order-track__label { max-width: 100%; padding: 0 2px; color: var(--v5-ink); overflow-wrap: break-word; -webkit-hyphens: auto; hyphens: auto; font: 500 var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); }
/* A step that waits on the user (unpaid) reads as not done yet; server-side progress stays in primary ink. */
.order-track__label--stopped, .order-track__label--waiting { color: var(--v5-ink-3); font-weight: 400; }
.order-track__label--failed { color: var(--v5-danger); }
@keyframes order-track-pulse { 50% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--order-tone) 8%, transparent); } }
@media (prefers-reduced-motion: reduce) { .order-track__dot--live { animation: none; } }
/* Order summary: total first (DS-27 amount), then field rows; one divider before the record. */
.order-summary__title { display: block; color: var(--v5-ink); font: var(--ui-type-card-title-weight) var(--ui-type-card-title)/var(--ui-type-card-title-lh) var(--font-v5); }
.order-summary__total { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-top: 12px; padding-bottom: 4px; }
.order-summary__total-label { flex: none; color: var(--v5-ink-3); font: 400 var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.order-summary__amount { min-width: 0; color: var(--v5-ink); font-size: 28px; line-height: 34px; letter-spacing: -.02em; }
.order-summary__amount :deep(.checkout-amount__symbol) { font-size: 16px; }
.order-summary__amount :deep(.checkout-amount__unit) { margin-left: 6px; font: 500 12px/16px var(--font-v5); letter-spacing: 0; }
.order-summary__lines { margin: 4px 0; padding: 8px 0; border-top: 1px solid var(--v5-border); border-bottom: 1px solid var(--v5-border); }
.order-summary__line { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0; }
.order-summary__line-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--v5-ink); font: 500 var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); }
.order-summary__line-meta { display: block; color: var(--v5-ink-3); font-variant-numeric: tabular-nums; font: 400 var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); }
.order-summary__line-amount { flex: none; color: var(--v5-ink); font-variant-numeric: tabular-nums; font: 500 var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); }
.order-summary__note { display: block; padding: 6px 0; color: var(--v5-ink-3); font: 400 var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); }
.order-summary__settled { margin-top: 8px; padding: 10px 12px; border-radius: 12px; background: var(--v5-brand-soft); color: var(--v5-ink); font: 400 var(--ui-type-note)/var(--ui-type-note-lh) var(--font-v5); }
.order-summary__divider { height: 1px; margin: 8px 0; background: var(--v5-border); }
</style>

<style scoped>
.order-payment-result { display:flex; flex-direction:column; gap:var(--v5-space-3); }
.order-summary :deep(.copy-code-button) { width:44px; height:44px; margin:-6px -12px -6px -4px; }
.order-summary :deep(.copy-code-button svg) { width:16px; height:16px; }
.pending-notice-error { display:block; margin-top:var(--v5-space-3); font:400 var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); color:var(--v5-danger); }

.trial-result { display:flex;flex-direction:column;gap:var(--v5-space-3); }
.trial-result-head { display:flex;flex-direction:column;align-items:center;gap:var(--v5-space-2);padding:var(--v5-space-4) 0;text-align:center; }
.trial-result-icon { width:64px;height:64px;border-radius:var(--v5-radius-full);background:var(--v5-brand-soft);color:var(--v5-brand); }
.trial-result-title { font-size:var(--ui-type-page-title);line-height:var(--ui-type-page-title-lh);font-weight:600;color:var(--v5-ink); }
.trial-result-body { font-size:var(--ui-type-body);line-height:var(--ui-type-body-lh);color:var(--v5-ink-2);overflow-wrap:anywhere; }
.trial-result-credit { display:flex;flex-direction:column;gap:var(--v5-space-2);padding:var(--v5-space-4);border-radius:var(--v5-radius-l);background:color-mix(in srgb, var(--v5-brand) 10%, transparent);border:1px solid color-mix(in srgb, var(--v5-brand) 25%, transparent); }
.trial-result-credit-label { font-size:var(--ui-type-list-subtitle);line-height:var(--ui-type-list-subtitle-lh);font-weight:600;color:var(--v5-ink-2); }
.trial-result-row, .trial-result-line { display:flex;justify-content:space-between;align-items:baseline;gap:var(--v5-space-3);font-size:var(--ui-type-list-subtitle);line-height:var(--ui-type-list-subtitle-lh);color:var(--v5-ink-3); }
.trial-result-row > text:last-child { font-size:var(--ui-type-list-title);line-height:var(--ui-type-list-title-lh);font-weight:600;font-variant-numeric:tabular-nums; }
.trial-result-usdt, .trial-result-saved { color:var(--v5-brand); }
.trial-result-uvt { color:var(--v5-nex); }
.trial-result-summary { display:flex;flex-direction:column;gap:var(--v5-space-2);padding:var(--v5-space-3) var(--v5-space-4);border-radius:var(--v5-radius-l);background:var(--v5-surface); }
.trial-result-line > text:last-child { color:var(--v5-ink-2);font-variant-numeric:tabular-nums; }
.trial-result-actions { display:flex;flex-direction:column;gap:var(--v5-space-3);margin-top:var(--v5-space-2); }
.trial-result-primary, .trial-result-secondary { display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:var(--v5-radius-full);font-size:var(--ui-type-button);line-height:var(--ui-type-button-lh);font-weight:600; }
.trial-result-primary { background:var(--v5-brand);color:var(--v5-on-brand); }
.trial-result-secondary { border:1px solid var(--v5-border-strong);color:var(--v5-ink); }
</style>
