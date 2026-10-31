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
        <!-- Hero status — filled status-tint tile (accent border dropped). -->
        <view class="mx-4 rounded-2xl" :style="heroStyle">
          <view class="flex items-center" style="gap: 12px">
            <view class="grid place-items-center" :style="heroIconStyle">
              <svg v-if="isProvisioning" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nx-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" :stroke="statusColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(d, di) in statusIcon" :key="di" :d="d" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <text class="block" :style="heroLabelStyle">{{ statusLabel(order.status) }}</text>
              <text class="block" style="overflow-wrap:anywhere; line-height:1.5; font-size: 12px; color: var(--v5-ink-3); margin-top: 2px">{{ commerceOrderTitle(order,locale.code) }}</text>
            </view>
          </view>

          <view v-if="order.status !== 'cancelled'" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--v5-border)">
            <view class="flex items-center justify-between" style="font-size: 12px">
              <text style="color: var(--v5-ink-3)">{{ t.orders.dataCenter }}</text>
              <text class="tabular-nums" style="color: var(--v5-ink)">{{ dataCenterLabel }}</text>
            </view>
            <text v-if="order.status === 'provisioning'" class="block" :style="{ fontSize: '12px', marginTop: '8px', lineHeight: '1.5', color: statusColor }">{{ dynamicHint }}</text>
          </view>
        </view>

        <view v-if="needsRecovery" class="nx-glass-card mx-4 rounded-2xl" :style="summaryCardStyle" style="margin-top: 12px" data-testid="order-recovery">
          <text class="block" style="font-size: var(--ui-type-list-subtitle); line-height: 1.6; color: var(--v5-ink-2)">{{ recoveryHint }}</text>
          <view class="order-recovery-actions">
            <view role="button" tabindex="0" :aria-disabled="remoteOrderRefreshing" :style="notFoundBtnStyle" @click="refreshOrder" @keydown.enter.prevent="refreshOrder" @keydown.space.prevent="refreshOrder"><text style="font: 600 13px/20px var(--font-v5)">{{ t.store.catalogRetry }}</text></view>
            <view role="button" tabindex="0" :style="notFoundBtnStyle" @click="contactOrderSupport" @keydown.enter.prevent="contactOrderSupport" @keydown.space.prevent="contactOrderSupport"><text>{{ t.orders.copyAndSupport }}</text></view>
          </view>
        </view>
        <view v-if="canBuyAgain" class="mx-4" style="margin-top: 12px">
          <view class="grid place-items-center" role="button" tabindex="0" :style="notFoundBtnStyle" @click="goStore" @keydown.enter.prevent="goStore" @keydown.space.prevent="goStore"><text>{{ t.promotion.buyAgain }}</text></view>
        </view>
        <OrderRewards v-if="remoteApiEnabled && id" :order-no="id" :payment-allowed="order.status === 'placed' && !paymentExpired && !remoteOrderError && !remoteOrderRefreshing" />

        <!-- Activated → Earn jump -->
        <view v-if="order.status === 'activated'" class="nx-glass-card mx-4 rounded-2xl" :style="summaryCardStyle" style="margin-top: 12px">
          <view class="flex items-center" style="gap: 12px">
            <view class="grid place-items-center" :style="earnIconStyle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2" /><rect width="6" height="6" x="9" y="9" rx="1" /><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <text class="block" style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ activatedHint }}</text>
            </view>
          </view>
          <view class="block text-center active:opacity-85" :style="earnBtnStyle" role="button" tabindex="0" :aria-label="t.uiChrome.viewOnEarn" @click.stop="goEarn">
            <text>{{ t.uiChrome.viewOnEarn }} →</text>
          </view>
        </view>

        <view v-if="order.status === 'inventory'" class="nx-glass-card mx-4 rounded-2xl" :style="summaryCardStyle" style="margin-top: 12px">
          <text class="block" style="font-size: 13px; color: var(--v5-ink)">{{ t.orders.inventoryToast }}</text>
          <view role="button" tabindex="0" :style="earnBtnStyle" @click="navTo('/pages/me/devices')" @keydown.enter.prevent="navTo('/pages/me/devices')"><text>{{ t.myDevices.inventoryTitle }} →</text></view>
        </view>
        <!-- Order summary -->
        <view class="order-summary nx-glass-card mx-4 rounded-2xl" :style="summaryCardStyle" style="margin-top: 12px">
          <text class="block" :style="sectionLabelStyle">{{ t.orders.orderSummary }}</text>
          <DetailRow :label="t.orders.orderIdLabel" :value="order.id" mono copyable />
          <DetailRow :label="t.orders.quantity" :value="`${orderQuantity}`" />
          <view v-if="order.lineItems?.length" style="margin: 8px 0; padding: 8px 0; border-top: 1px solid var(--v5-border); border-bottom: 1px solid var(--v5-border)">
            <view v-for="item in order.lineItems" :key="item.sku" class="flex items-center justify-between" style="padding: 4px 0; gap: 12px">
              <view class="flex-1 min-w-0">
                <text class="block truncate" style="font-size: 12px; color: var(--v5-ink)">{{ (item.name) }}</text>
                <text class="block tabular-nums" style="font-size: 12px; color: var(--v5-ink-4)">{{ item.sku }} · {{ item.quantity }} × {{ summaryMoney(item.unitPriceUsdt) }}</text>
              </view>
              <text class="shrink-0 tabular-nums" style="font-size: 12px; color: var(--v5-ink-2)">{{ summaryMoney(item.lineAmountUsdt) }}</text>
            </view>
          </view>
          <DetailRow v-if="(order.itemCount ?? 1) === 1" :label="t.orders.unitPrice" :value="summaryMoney(order.unitPrice)" />
          <DetailRow :label="t.orders.subtotal" :value="summaryMoney(order.subtotal, true)" />
          <DetailRow v-if="order.discount > 0" :label="t.orders.discount" :value="`−${summaryMoney(order.discount)}`" brand />
          <!-- Trial conversion orders: each checkout discount on its own row (never folded into the voucher line). -->
          <DetailRow v-if="(order.promoDiscountUSD ?? 0) > 0" :label="t.orders.trialDiscount" :value="`−${summaryMoney(order.promoDiscountUSD ?? 0)}`" brand />
          <DetailRow v-if="(order.trialOffsetUSD ?? 0) > 0" :label="t.orders.trialOffset" :value="`−${summaryMoney(order.trialOffsetUSD ?? 0)}`" brand />
          <DetailRow v-if="(order.earlyDiscountUSD ?? 0) > 0" :label="trialLifecycle.earlyDiscountLabel" :value="`−${summaryMoney(order.earlyDiscountUSD ?? 0)}`" brand />
          <DetailRow :label="order.trialReward ? purchaseCopy.orderPaid : t.orders.total" :value="summaryMoney(order.total, true)" big />
          <DetailRow v-if="trialRewardText && order.status !== 'refunded'" :label="purchaseCopy.orderTrialReward" :value="trialRewardText" brand />
          <DetailRow v-if="order.closeReasonCode && CLOSED_STATUSES.includes(order.status)" :label="t.orders.closeReason" :value="t.orders.closeReasons[order.closeReasonCode]" />
          <template v-if="order.status === 'refunded'">
            <DetailRow v-if="order.refundReasonCode" :label="t.orders.refundReason" :value="t.orders.refundReasons[order.refundReasonCode]" />
            <DetailRow v-if="order.refundAmountUsdt != null" :label="t.orders.refundAmount" :value="usdt(order.refundAmountUsdt)" brand />
            <DetailRow v-if="order.refundChannel" :label="t.orders.refundChannel" :value="refundChannelLabel" />
            <DetailRow v-if="order.refundBillNo" :label="t.orders.refundBillNo" :value="order.refundBillNo" mono copyable />
            <text v-if="order.trialReward?.reversedOnRefund && trialRewardText" class="block" style="padding: 6px 0; font-size: var(--ui-type-meta); line-height: var(--ui-type-meta-lh); color: var(--v5-ink-3)">{{ purchaseCopy.orderRewardsReversed }}</text>
            <view v-if="!order.refundedAt && order.refundAmountUsdt == null && !order.refundBillNo" role="status" style="padding: 8px 0; color: var(--v5-ink-3); font-size: 12px">
              <text>{{ t.orders.refundDetailsUnavailable }}</text>
            </view>
          </template>
          <view v-if="fullyVoucherSettled" role="status" aria-live="polite" style="margin-top: 8px; padding: 10px 12px; border-radius: 10px; background: var(--v5-brand-soft); color: var(--v5-ink-2)">
            <text class="block" style="font-size: 12px; line-height: 1.5">{{ t.orders.voucherSettledNoWalletDebit }}</text>
          </view>
          <view class="grid" :style="tsGridStyle">
            <view>
              <text class="block" style="font-size: 12px; color: var(--v5-ink-4)">{{ t.orders.placedAt }}</text>
              <text class="block" style="font-size: 12px; color: var(--v5-ink-2); margin-top: 2px">{{ dt(order.placedAt) }}</text>
            </view>
            <view v-if="order.status === 'placed' && order.expiresAt">
              <text class="block" style="font-size: 12px; color: var(--v5-ink-4)">{{ t.orders.expiresAt }}</text>
              <text class="block" style="font-size: 12px; color: var(--v5-warning); margin-top: 2px">{{ dt(order.expiresAt) }}</text>
            </view>
            <view v-if="order.paidAt">
              <text class="block" style="font-size: 12px; color: var(--v5-ink-4)">{{ t.orders.paidAt }}</text>
              <text class="block" style="font-size: 12px; color: var(--v5-ink-2); margin-top: 2px">{{ dt(order.paidAt) }}</text>
            </view>
            <view v-if="order.activatedAt">
              <text class="block" style="font-size: 12px; color: var(--v5-ink-4)">{{ t.orders.activatedAt }}</text>
              <text class="block" style="font-size: 12px; color: var(--v5-ink-2); margin-top: 2px">{{ dt(order.activatedAt) }}</text>
            </view>
            <view v-if="order.refundedAt">
              <text class="block" style="font-size: 12px; color: var(--v5-ink-4)">{{ t.orders.refundedAt }}</text>
              <text class="block" style="font-size: 12px; color: var(--v5-ink-2); margin-top: 2px">{{ dt(order.refundedAt) }}</text>
            </view>
          </view>
        </view>

        <!-- Timeline -->
        <view class="nx-glass-card mx-4 rounded-2xl" :style="summaryCardStyle" style="margin-top: 12px">
          <text class="block" :style="sectionLabelStyle">{{ t.orders.timelineTitle }}</text>
          <view class="relative" :style="timelineWrapStyle">
            <view v-for="(stage, i) in stages" :key="stage" :style="{ marginTop: i !== 0 ? '12px' : '0' }">
              <view class="absolute rounded-full" :style="dotStyle(i)" />
              <view class="flex items-center" style="gap: 8px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="i <= currentIdx && order.status !== 'cancelled' ? 'var(--v5-brand)' : 'var(--v5-ink-4)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(d, di) in stageIcon(stage)" :key="di" :d="d" /></svg>
                <text :style="{ fontSize: '12px', color: i <= currentIdx && order.status !== 'cancelled' ? 'var(--v5-ink)' : 'var(--v5-ink-4)' }">{{ statusLabel(stage) }}</text>
              </view>
              <text v-if="eventFor(stage)" class="block" style="font-size: 12px; color: var(--v5-ink-4); margin-top: 2px; margin-left: 22px">{{ eventText(stage) }}</text>
            </view>
          </view>
        </view>

        <!-- Pending remote orders can retry only the idempotent UVEL wallet debit. -->
        <view v-if="orderAction || orderCommandUnavailable" class="nx-glass-card mx-4 rounded-2xl" style="padding:var(--v5-space-4);margin-top:var(--v5-space-3)" role="status">
          <text class="block">{{ orderAction?.kind==='cancel' ? recoveryCopy.cancelPending : recoveryCopy.paymentPending }}</text>
          <view class="flex flex-wrap gap-2 mt-3">
            <NxButton variant="secondary" size="small" :label="recoveryCopy.query" :busy="orderCommandQuerying" :disabled="payingFromWallet || cancellingOrder" @click="recoverOrderAction(false)" />
            <NxButton v-if="orderAction?.kind==='cancel'" variant="secondary" size="small" :label="recoveryCopy.retryCancel" :disabled="orderCommandQuerying || cancellingOrder" @click="recoverOrderAction(true)" />
            <NxButton v-if="orderAction?.kind==='pay' && resumePaymentAllowed && canPayFromWallet" size="small" :label="recoveryCopy.resume" :disabled="orderCommandQuerying || payingFromWallet" @click="handleWalletPayment" />
          </view>
        </view>
        <view v-if="pendingOrderActionsVisible" class="mx-4" style="margin-top: 12px; margin-bottom: 24px">
          <view
            v-if="remoteApiEnabled && !paymentExpired"
            class="w-full grid place-items-center active:opacity-80"
            :style="walletPaymentBtnStyle"
            role="button"
            tabindex="0"
            :aria-disabled="!canPayFromWallet || payingFromWallet ? 'true' : 'false'"
            :aria-label="t.store.coPayNow"
            @click.stop="requestPendingPayment()"

            @keydown.enter.prevent.stop="requestPendingPayment()" @keydown.space.prevent.stop="requestPendingPayment()"
          >
            <text>{{ pendingPaymentChecking ? pendingCopy.checking : t.orders.pendingContinue }}</text>
          </view>
          <view
            class="w-full grid place-items-center active:opacity-80"
            :style="cancelBtnStyle"
            role="button"
            tabindex="0"
            :aria-label="t.orders.cancelOrder"
            :aria-disabled="!cancellable"
            @click.stop="handleCancel"

            @keydown.enter.prevent.stop="handleCancel" @keydown.space.prevent.stop="handleCancel"
          >
            <text>{{ t.orders.cancelOrder }}</text>
          </view>
        </view>
        <view v-else style="height: 24px" />
      </template>
    </view>
    <template #pageFixed>
      <view v-if="paymentNotice" class="pending-notice-mask">
        <view class="pending-order-notice" role="dialog" aria-modal="true" :aria-label="paymentNotice === 'query' ? pendingCopy.queryFailed : pendingCopy.cannotPay">
          <view class="pending-notice-head"><text class="pending-notice-title" tabindex="-1" role="heading">{{ paymentNotice === 'query' ? pendingCopy.queryFailed : pendingCopy.cannotPay }}</text><NxButton variant="text" :label="t.store.coCancel" :disabled="cancellingOrder" @click="paymentNotice = ''" /></view>
          <text class="pending-notice-body">{{ paymentNoticeReason }}</text>
          <text v-if="noticeCancelFailed" class="pending-notice-error" role="alert">{{ pendingCopy.cancelFailed }}</text>
          <NxButton :label="paymentNotice === 'query' ? pendingCopy.retry : orderAction?.kind === 'cancel' ? recoveryCopy.retryCancel : orderAction || orderCommandUnavailable ? recoveryCopy.query : liveOrder?.status === 'placed' ? pendingCopy.cancelOrder : pendingCopy.viewDetails" :busy="pendingPaymentChecking || cancellingOrder || orderCommandQuerying" @click="runPaymentNoticeAction" />
        </view>
      </view>
    </template>
  </AppChassis>
</template>

<script setup lang="ts">
import { dateLocale } from "@/i18n/format";
import { commerceOrderTitle, commerceCopy } from "@/lib/commerce-review";
import { useLocaleStore } from "@/store/locale";
import { formatAmount as formatPlainAmount } from "@/lib/amount-display";
import OrderRewards from '@/components/promotion/order-rewards.vue';
import { ref, computed, watch, onUnmounted, nextTick, type CSSProperties } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import NxButton from "@/components/ui/nx-button.vue";
import DetailRow from "@/components/store/order-detail-row.vue";
import CheckoutPaymentSheet from "@/components/checkout/CheckoutPaymentSheet.vue";
import CheckoutResult from "@/components/checkout/CheckoutResult.vue";
import { checkoutFlowCopy } from "@/lib/checkout-flow-copy";
import { orderPaymentRejection } from '@/lib/order-payment-rejection';
import { useDialogA11y } from "@/composables/use-dialog-a11y";
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
const currentIdx = computed(() => (order.value ? stages.value.indexOf(order.value.status) : -1));
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
const cancellable = computed(() => canCancelCurrentOrder()
  && !cancellingOrder.value);
const paymentExpired = computed(() => order.value?.expiresAt != null
  && order.value.expiresAt <= detailNow.value);
const canPayFromWallet = computed(() => remoteApiEnabled
  && currentOrderPayable()&&!cancellingOrder.value&&!orderCommandQuerying.value&&!orderCommandUnavailable.value
  && (!orderAction.value || (orderAction.value.kind==='pay'&&resumePaymentAllowed.value))
  && !walletRefreshing.value && !paymentExpired.value);
const isProvisioning = computed(() => order.value?.status === "provisioning");
useDialogA11y(computed(() => Boolean(paymentNotice.value)), '.pending-order-notice', () => { if (!cancellingOrder.value) paymentNotice.value = ''; }, true, 5);
watch([cancellingOrder,orderCommandQuerying,pendingPaymentChecking], ([cancelling,querying,checking]) => {
  if (!paymentNotice.value || cancelling || querying || checking) return;
  void nextTick(() => {
    if (typeof document === 'undefined' || !paymentNotice.value) return;
    const notice = document.querySelector('.pending-order-notice');
    if (notice && !notice.contains(document.activeElement)) notice.querySelector<HTMLElement>('.pending-notice-title')?.focus();
  });
});
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
const STATUS_COLORS: Record<OrderStatus, string> = {
  placed: "var(--v5-ink-3)",
  paid: "var(--v5-brand)",
  provisioning: "var(--v5-warning)",
  activated: "var(--v5-brand)",
  inventory: "var(--v5-brand)",
  cancelled: "var(--v5-brand-2)",
  payment_failed: "var(--v5-danger)",
  expired: "var(--v5-warning)",
  provisioning_failed: "var(--v5-danger)",
  refunded: "var(--v5-brand)",
  chargeback: "var(--v5-danger)",
};
const statusColor = computed(() => (order.value ? STATUS_COLORS[order.value.status] : "var(--v5-ink-3)"));

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
function stageIcon(stage: OrderStatus): string[] {
  return iconFor(stage);
}

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

function eventFor(stage: OrderStatus) {
  return order.value?.timeline.find((e) => e.status === stage);
}
function eventText(stage: OrderStatus): string {
  const evt = eventFor(stage);
  if (!evt) return "";
  return dt(evt.ts);
}

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
    if (orderAction.value || orderCommandUnavailable.value) {
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
        paymentOrderCurrent,{kind:'ORDER_PAY',payload:{orderNo:requestOrderNo},commandKey:()=>{const action=beginOrderAction(orders.currentAccountKey(),'pay',requestOrderNo,requestAmountUsdt,'EXTERNAL');orderAction.value=action;return action.key;},parseReceipt:paidOrderReceipt});
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
function tint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}
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
const heroStyle = computed<CSSProperties>(() => ({
  padding: "20px",
  background: tint(statusColor.value, 6),
}));
const heroIconStyle = computed<CSSProperties>(() => ({
  width: "48px",
  height: "48px",
  borderRadius: "50%",
  background: tint(statusColor.value, 12),
}));
const heroLabelStyle = computed<CSSProperties>(() => ({
  fontSize: "var(--ui-type-card-title)",
  fontWeight: "var(--ui-type-card-title-weight)",
  lineHeight: "1.2",
  color: statusColor.value,
}));
// Order summary / timeline / earn-jump — form-b single containers (surface, no
// border). Internal hairlines (timestamp divider, timeline rail) do the parceling.
const summaryCardStyle: CSSProperties = { borderRadius: "var(--nx-glass-radius)", boxShadow: "var(--nx-glass-edge)",
  background: "var(--nx-glass-fill)",
  padding: "16px",
};
const earnIconStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  background: "var(--v5-brand-soft)",
};
const earnBtnStyle: CSSProperties = {
  marginTop: "12px",
  height: "44px",
  lineHeight: "44px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "13px",
  letterSpacing: "-0.005em",
  boxShadow: "var(--v5-spotlight-brand)",
};
const sectionLabelStyle: CSSProperties = {
  marginBottom: "12px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
const tsGridStyle: CSSProperties = {
  marginTop: "12px",
  paddingTop: "12px",
  borderTop: "1px solid color-mix(in srgb, var(--v5-border) 70%, transparent)",
  gridTemplateColumns: "1fr 1fr",
  gap: "8px",
};
const timelineWrapStyle: CSSProperties = {
  paddingLeft: "20px",
  borderLeft: "1px solid color-mix(in srgb, var(--v5-border) 80%, transparent)",
};
function dotStyle(i: number): CSSProperties {
  const done = i <= currentIdx.value && order.value?.status !== "cancelled";
  const current = i === currentIdx.value && order.value?.status !== "cancelled";
  return {
    left: "-7px",
    width: "12px",
    height: "12px",
    marginTop: "5px",
    background: done ? "var(--v5-brand)" : "var(--v5-surface-2)",
    border: done ? "none" : "1px solid var(--v5-border)",
    boxShadow: current ? "0 0 0 4px color-mix(in srgb, var(--v5-brand) 15%, transparent)" : "none",
  };
}
const cancelBtnStyle: CSSProperties = {
  height: "40px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-brand-2)",
  fontSize: "13px",
  fontWeight: 500,
};
const walletPaymentBtnStyle: CSSProperties = {
  height: "44px",
  marginBottom: "8px",
  borderRadius: "12px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontSize: "13px",
  fontWeight: 600,
  boxShadow: "var(--v5-spotlight-brand)",
};
const remoteErrorStyle: CSSProperties = {
  marginBottom: "12px",
  padding: "10px 12px",
  background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)",
};


</script>

<style scoped>
.nx-spin {
  animation: nx-spin 1s linear infinite;
}
@keyframes nx-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .nx-spin { animation: none; }
}
</style>

<style scoped>
.order-payment-result { display:flex; flex-direction:column; gap:var(--v5-space-3); }
.order-summary :deep(.copy-code-button) { width:44px; height:44px; margin:0; }
.pending-notice-mask { position:fixed; z-index:900; inset:0; display:flex; align-items:center; justify-content:center; padding:var(--nx-overlay-top) var(--v5-space-4) var(--nx-overlay-bottom); background:var(--v5-bg-color-mask); }
.pending-order-notice { width:100%; max-width:344px; max-height:100%; overflow:auto; padding:var(--v5-space-5); border-radius:var(--v5-radius-xl); background:var(--v5-surface); color:var(--v5-ink); display:flex; flex-direction:column; gap:var(--v5-space-4); }
.pending-notice-head { display:flex; align-items:center; justify-content:space-between; gap:var(--v5-space-3); font:600 var(--ui-type-subheading)/var(--ui-type-subheading-lh) var(--font-v5); }
.pending-notice-body { font:400 var(--ui-type-body)/var(--ui-type-body-lh) var(--font-v5); color:var(--v5-ink-2); overflow-wrap:anywhere; }
.pending-notice-error { font:400 var(--ui-type-meta)/var(--ui-type-meta-lh) var(--font-v5); color:var(--v5-danger); }
.order-recovery-actions { display:flex; flex-direction:column; gap:8px; margin-top:12px; }
.order-recovery-actions > view { display:flex; align-items:center; justify-content:center; text-align:center; line-height:1.5; }

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
