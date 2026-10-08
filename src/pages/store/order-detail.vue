<!--
  Order detail — ported from Nexion-prototype/app/(main)/store/orders/[id]/
  page.tsx. Dynamic [id] → ?id= query (onLoad). Single-order tracking:
    hero status (color-keyed by status) → activated→Earn jump → order summary →
    4-stage deployment timeline → cancel action (only while "placed").

  While on this page, advanceOrder(id) ticks every 3s so the provisioning bar
  moves visibly. Cancel uses confirm() from the ui store (danger). Wrapped in
  <AppChassis active="store">; back + order-id title/subtitle live in the sticky
  chassis nav header via useSetPageHeader (mirrors the prototype's
  <SetPageHeader title={order.id} subtitle={t.orders.orderId} backHref="/store/orders"/>).

  Status-color opacity tints use color-mix(... transparent) since uni can't do
  the source's `${color}10` hex-suffix on a CSS variable.
-->
<template>
  <AppChassis active="store">
    <OrderRewards v-if="remoteApiEnabled && id" :order-no="id" />
    <!-- Chassis-nav pages (useSetPageHeader) don't get sub-page-header.vue's global
         24px .spv gap, so the nav→content breathing is supplied here once. -->
    <view style="color: var(--v5-ink); padding-top: 24px">
      <view v-if="remoteOrderError" class="mx-4 rounded-2xl" :style="remoteErrorStyle">
        <view class="flex items-center justify-between" style="gap: 12px">
          <text :style="{ color: 'var(--v5-warning)', fontSize: '12px', lineHeight: '1.5' }">{{ t.orders.refreshFailed }}</text>
          <view class="shrink-0 active:opacity-70" :style="retryBtnStyle" :aria-disabled="remoteOrderRefreshing ? 'true' : 'false'" role="button" tabindex="0" @click="refreshOrder">
            <text>{{ t.store.catalogRetry }}</text>
          </view>
        </view>
      </view>

      <view v-if="showRemoteOrderLoading" class="text-center" role="status" aria-live="polite" style="padding: 20px">
        <text class="block" style="font-size: 13px; color: var(--v5-ink-3)">{{ t.orders.refreshing }}</text>
      </view>

      <!-- Order not found only after the scoped remote read settles. -->
      <view v-else-if="showOrderNotFound" class="text-center" style="padding: 20px">
        <text class="block" style="font-size: 13px; color: var(--v5-ink-3); margin-bottom: 12px">{{ t.orders.notFound }}</text>
        <view class="inline-flex items-center justify-center active:opacity-90" :style="notFoundBtnStyle" role="button" tabindex="0" :aria-label="t.orders.title" @click.stop="goOrders">
          <text>{{ t.orders.title }} →</text>
        </view>
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
              <text class="block truncate" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 2px">{{ nexGridBrandText(order.productName) }}</text>
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

        <!-- Order summary -->
        <view class="nx-glass-card mx-4 rounded-2xl" :style="summaryCardStyle" style="margin-top: 12px">
          <text class="block" :style="sectionLabelStyle">{{ t.orders.orderSummary }}</text>
          <DetailRow :label="t.orders.orderIdLabel" :value="order.id" mono />
          <DetailRow :label="t.orders.quantity" :value="`${order.itemCount ?? order.quantity}`" />
          <view v-if="order.lineItems?.length" style="margin: 8px 0; padding: 8px 0; border-top: 1px solid var(--v5-border); border-bottom: 1px solid var(--v5-border)">
            <view v-for="item in order.lineItems" :key="item.sku" class="flex items-center justify-between" style="padding: 4px 0; gap: 12px">
              <view class="flex-1 min-w-0">
                <text class="block truncate" style="font-size: 12px; color: var(--v5-ink)">{{ nexGridBrandText(item.name) }}</text>
                <text class="block tabular-nums" style="font-size: 12px; color: var(--v5-ink-4)">{{ item.sku }} · {{ item.quantity }} × ${{ item.unitPriceUsdt.toLocaleString() }}</text>
              </view>
              <text class="shrink-0 tabular-nums" style="font-size: 12px; color: var(--v5-ink-2)">${{ item.lineAmountUsdt.toLocaleString() }}</text>
            </view>
          </view>
          <DetailRow v-if="(order.itemCount ?? 1) === 1" :label="t.orders.unitPrice" :value="`$${order.unitPrice.toLocaleString()}`" />
          <DetailRow v-if="order.discount > 0" :label="t.orders.discount" :value="`-$${order.discount.toLocaleString()}`" brand />
          <!-- FEAT-TRIAL02 conversion order: promo + trial credit as their own
               rows (never folded into the voucher line). -->
          <DetailRow v-if="(order.promoDiscountUSD ?? 0) > 0" :label="t.orders.trialDiscount" :value="`-$${(order.promoDiscountUSD ?? 0).toLocaleString()}`" brand />
          <DetailRow v-if="(order.trialOffsetUSD ?? 0) > 0" :label="t.orders.trialOffset" :value="`-$${(order.trialOffsetUSD ?? 0).toLocaleString()}`" brand />
          <DetailRow :label="t.orders.subtotal" :value="`$${order.subtotal.toLocaleString()}`" />
          <DetailRow :label="t.orders.total" :value="`$${order.total.toLocaleString()}`" big />
          <template v-if="order.status === 'refunded'">
            <DetailRow v-if="order.refundAmountUsdt != null" :label="t.orders.refundAmount" :value="`$${order.refundAmountUsdt.toLocaleString()}`" brand />
            <DetailRow v-if="order.refundChannel" :label="t.orders.refundChannel" :value="refundChannelLabel" />
            <DetailRow v-if="order.refundBillNo" :label="t.orders.refundBillNo" :value="order.refundBillNo" mono />
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
        <view v-if="cancellable" class="mx-4" style="margin-top: 12px; margin-bottom: 24px">
          <view
            v-if="canPayFromWallet"
            class="w-full grid place-items-center active:opacity-80"
            :style="walletPaymentBtnStyle"
            role="button"
            tabindex="0"
            :aria-disabled="payingFromWallet ? 'true' : 'false'"
            :aria-label="t.store.coPayNow"
            @click.stop="handleWalletPayment"

            @keydown.enter.prevent.stop="handleWalletPayment" @keydown.space.prevent.stop="handleWalletPayment"
          >
            <text @click.stop="handleWalletPayment">{{ t.store.coPayNow }}</text>
          </view>
          <view
            class="w-full grid place-items-center active:opacity-80"
            :style="cancelBtnStyle"
            role="button"
            tabindex="0"
            :aria-label="t.orders.cancelOrder"
            @click.stop="handleCancel"

            @keydown.enter.prevent.stop="handleCancel" @keydown.space.prevent.stop="handleCancel"
          >
            <text>{{ t.orders.cancelOrder }}</text>
          </view>
        </view>
        <view v-else style="height: 24px" />
      </template>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import OrderRewards from '@/components/promotion/order-rewards.vue';
import { ref, computed, watch, onUnmounted, type CSSProperties } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import DetailRow from "@/components/store/order-detail-row.vue";
import { useT } from "@/i18n/use-t";
import { formatTrialDateTime } from "@/lib/trial-date";
import { nexGridBrandText } from "@/lib/brand-copy";
import { useOrders, type OrderStatus, timelineFor } from "@/store/orders";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { trialReservesSlotNow } from "@/store/free-trial";
import { confirm as uiConfirm, toast } from "@/store/ui";
import { useSetPageHeader } from "@/composables/use-page-header";
import { navTo } from "@/lib/route";
import { orderApi, remoteApiEnabled } from "@/api/runtime";
import { asApiError } from "@/api/errors";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";

const t = useT();
const orders = useOrders();
const app = useApp();
const auth = useAuth();

const id = ref("");
let detailMounted = true;
let detailVisible = false;
let detailEpoch = 0;

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
  id.value = o.id || "";
  remoteOrderAttempted.value = false;
  remoteOrderError.value = false;
});
const remoteOrderError = ref(false);
const remoteOrderRefreshing = ref(false);
const remoteOrderAttempted = ref(false);
let remoteOrderRefreshSequence = 0;
let activeRemoteOrderScope: DetailRequestScope | null = null;
const walletRefreshing = ref(false);
let walletRefreshSequence = 0;
async function refreshOrderWallet() {
  if (!remoteApiEnabled) return;
  const scope = captureDetailScope();
  const sequence = ++walletRefreshSequence;
  walletRefreshing.value = true;
  try {
    await app.refreshRemoteFleet(scope.accountScope);
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
    await orders.ensureRemoteOrder(id.value);
  } catch {
    if (sequence !== remoteOrderRefreshSequence || !isCurrentDetailScope(scope)) return;
    remoteOrderError.value = true;
  } finally {
    if (sequence === remoteOrderRefreshSequence && isCurrentDetailScope(scope)) {
      remoteOrderRefreshing.value = false;
      activeRemoteOrderScope = null;
    }
  }
}
onShow(() => {
  detailMounted = true;
  detailVisible = true;
  detailEpoch += 1;
  void refreshOrder();
  void refreshOrderWallet();
});
onHide(() => {
  detailVisible = false;
  detailEpoch += 1;
});

const order = computed(() => orders.orders.find((o) => o.id === id.value));
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

// Sticky chassis nav header — back + order-id title + "Order ID" subtitle
// (mirrors the prototype's <SetPageHeader title={order.id} subtitle={t.orders.orderId}
// backHref="/store/orders"/>). Getter form: title resolves once the order loads
// (onLoad); falls back to "not found" before then / for a bad id.
useSetPageHeader(() => ({
  title: order.value
    ? order.value.id
    : (showRemoteOrderLoading.value || remoteOrderError.value ? t.value.orders.title : t.value.orders.notFound),
  subtitle: order.value ? t.value.orders.orderId : undefined,
  backHref: "/store/orders",
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
  }, 3000);
}
startTick();

const stages = computed(() => (order.value ? timelineFor(order.value.productId) : []));
const currentIdx = computed(() => (order.value ? stages.value.indexOf(order.value.status) : -1));
// Cancellable ONLY before payment settles ("placed"). Checkout settles to
// "paid", so in practice no order rests at "placed" — kept faithful to source.
const walletPaymentConfirmed = ref(false);
const payingFromWallet = ref(false);
const cancellingOrder = ref(false);
let cancelAttemptSequence = 0;
function canCancelCurrentOrder(): boolean {
  return order.value?.status === "placed"
    && !order.value.promotionQuoteId
    && !walletPaymentConfirmed.value
    && !payingFromWallet.value;
}
const cancellable = computed(() => canCancelCurrentOrder()
  && !cancellingOrder.value);
const paymentExpired = computed(() => order.value?.expiresAt != null
  && order.value.expiresAt <= detailNow.value);
const canPayFromWallet = computed(() => remoteApiEnabled
  && cancellable.value && !walletRefreshing.value && !paymentExpired.value);
const isProvisioning = computed(() => order.value?.status === "provisioning");
const STATUS_COLORS: Record<OrderStatus, string> = {
  placed: "var(--v5-ink-3)",
  paid: "var(--v5-brand)",
  provisioning: "var(--v5-warning)",
  activated: "var(--v5-brand)",
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
  const tmpl = o.status === "provisioning" ? t.value.orders.provisioningHint : t.value.orders.activatedHint;
  return tmpl.replace("{dc}", () => dataCenterLabel.value);
});
const activatedHint = computed(() =>
  order.value ? t.value.orders.activatedHint.replace("{dc}", () => dataCenterLabel.value) : "",
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
    ? formatTrialDateTime(ts)
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
    if (!ok || !canCancelCurrentOrder() || !isCurrentDetailScope(scope) || !order.value) return;
    const orderNo = order.value.id;
    const cancelled = remoteApiEnabled
      ? await orders.cancelOrderRemote(orderNo)
      : orders.cancelOrder(orderNo);
    if (!isCurrentDetailScope(scope)) return;
    if (cancelled) {
      toast.warn(t.value.orders.cancelDoneToast);
    } else {
      toast.warn(t.value.orders.cancelPendingServer);
    }
  } finally {
    if (cancelAttempt === cancelAttemptSequence) cancellingOrder.value = false;
  }
}

async function offerWalletTopup(requiredUsdt: number): Promise<void> {
  const scope = captureDetailScope();
  const accepted = await uiConfirm({
    title: t.value.errors.insufficientBalanceTitle,
    message: t.value.errors.insufficientBalanceMsg.replace("{amt}", requiredUsdt.toLocaleString()),
    confirmLabel: t.value.me.topup,
    cancelLabel: t.value.store.coCancel,
    icon: "warn",
  });
  if (accepted && isCurrentDetailScope(scope)) navTo("/pages/me/wallet-topup");
}

async function handleWalletPayment() {
  if (!canPayFromWallet.value || payingFromWallet.value || !order.value) return;
  if (typeof order.value.total !== 'number') return; // Promoted orders resume through their original-command checkout above.
  const scope = captureDetailScope();
  const requestOrderNo = order.value.id;
  const requestAmountUsdt = order.value.total;
  const receiptScope = app.captureRemoteAccountRequest();
  if (app.user.usdtBalance + 0.000001 < requestAmountUsdt) {
    await offerWalletTopup(requestAmountUsdt);
    return;
  }
  payingFromWallet.value = true;
  let paymentConfirmed = false;
  try {
    const receipt = await orderApi.pay(requestOrderNo, `wallet-pay:${requestOrderNo}`);
    if (!isCurrentDetailScope(scope)) return;
    if (receipt.orderNo !== requestOrderNo) {
      throw new Error("WALLET_PAYMENT_RECEIPT_ORDER_MISMATCH");
    }
    if (receipt.paymentMethod === "WALLET"
        && (receipt.walletBalanceAfterUsdt === null
          || !app.adoptCommerceWallet(receipt.walletBalanceAfterUsdt, receiptScope))) {
      throw new Error("WALLET_PAYMENT_RECEIPT_ACCOUNT_MISMATCH");
    }
    paymentConfirmed = true;
    walletPaymentConfirmed.value = true;
    await orders.ensureRemoteOrder(requestOrderNo);
    if (!isCurrentDetailScope(scope)) return;
    if (order.value?.status !== "activated") {
      throw new Error("WALLET_PAYMENT_ORDER_READBACK_MISMATCH");
    }
    void app.refreshRemoteFleet(receiptScope);
  } catch (error) {
    if (!isCurrentDetailScope(scope)) return;
    if (paymentConfirmed) {
      remoteOrderError.value = true;
      toast.warn(t.value.orders.walletPaymentConfirmedRefreshPending);
    } else if (asApiError(error).message === "ORDER_WALLET_INSUFFICIENT") {
      await offerWalletTopup(requestAmountUsdt);
    } else if (["ORDER_MONTHLY_QUOTA_PAUSED", "ORDER_MONTHLY_QUOTA_EXHAUSTED"].includes(asApiError(error).message)) {
      toast.warn(t.value.quota.stockUnavailable);
    } else if (asApiError(error).message === "ORDER_PAYMENT_EXPIRED") {
      toast.warn(t.value.orders.statusExpired);
      await orders.ensureRemoteOrder(requestOrderNo);
    } else {
      toast.warn(t.value.tradein.errPurchaseFailed);
    }
  } finally {
    // This handler owns the private lock; stale results still finish its attempt.
    payingFromWallet.value = false;
  }
}

function goOrders() {
  navTo("/store/orders");
}
function goEarn() {
  navTo("/earn");
}

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
  fontSize: "15px",
  fontWeight: 600,
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
const retryBtnStyle: CSSProperties = { minHeight: "32px", padding: "0 10px", borderRadius: "999px", background: "var(--v5-surface-2)", color: "var(--v5-ink)", fontSize: "12px" };


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
