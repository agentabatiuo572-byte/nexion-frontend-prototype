<!--
  Bundle checkout — ported from Nexion-prototype/app/(main)/store/bundle/page.tsx.
  Multi-product bundle builder for tiered discounts (2 items 5% / 3 items 8% /
  4+ items 12%). Sits parallel to /store/checkout (single-product flow).

  Top→bottom: in-page back header → Hero (tier-discount ladder, active tiers
  light up) → Items list (remove / clear) → Suggestions (tap to add) → Total
  summary (subtotal / discount / total / combined daily + checkout CTA).
  Reuses the bundle cart store (persisted) + products mock.

  Wrapped in <AppChassis active="store">; back + "Bundle" title live in the sticky
  chassis nav header via useSetPageHeader (mirrors the prototype's
  <SetPageHeader backHref="/store"/>, whose chassis Header fills in the route
  title headerTitles.storeBundle).

  结算分两档:
  - mock:余额直付——保留原型体验。
  - 远端:POST /api/orders/bundle，由服务端锁库存、计算阶梯折扣并创建一张 BUNDLE 订单；
    客户端只展示预估，最终金额以服务器回执为准，结果未知时复用同一幂等键。
-->
<template>
  <AppChassis active="store">
    <!-- Chassis-nav pages (useSetPageHeader) don't get sub-page-header.vue's global
         24px .spv gap, so the nav→content breathing is supplied here once. -->
    <view class="pb-6" style="color: var(--v5-ink); padding-top: 24px">
      <!-- Back + "Bundle" title now live in the sticky chassis nav header
           (useSetPageHeader below), mirroring the prototype's <SetPageHeader>. -->

      <!-- Remote and explicit sandbox catalogs start empty. Do not render the
           compatibility PRODUCTS array until the authoritative snapshot is
           ready; a cold first frame must never look like a real quote. -->
      <view v-if="catalogStatus === 'loading'" data-testid="bundle-catalog-loading" class="mx-4" :style="catalogStateStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.store.catalogLoadingTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.store.catalogLoadingBody }}</text>
      </view>
      <view v-else-if="catalogStatus === 'error'" data-testid="bundle-catalog-error" class="mx-4" :style="catalogStateStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.store.catalogErrorTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.store.catalogErrorBody }}</text>
        <view class="inline-flex mt-3 active:opacity-70" role="button" tabindex="0" :style="catalogRetryStyle" @click="retryCatalog">
          <text>{{ t.store.catalogRetry }}</text>
        </view>
      </view>
      <template v-else>

      <view v-if="receiptWriteFailure" class="mx-4 rounded-2xl text-center" :style="receiptFailureCardStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.errors.billMissingTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.errors.billMissingMsg }}</text>
        <view class="inline-flex mt-3 active:opacity-70" role="button" tabindex="0" :style="catalogRetryStyle" :aria-disabled="receiptRetrying" @click="retryReceiptWrite">
          <text>{{ receiptRetrying ? t.store.catalogLoadingTitle : t.store.catalogRetry }}</text>
        </view>
      </view>
      <template v-else>

      <!-- Hero — filled commercial spotlight (border dropped; aurora stays clipped
           inside the surface + overflow-hidden, so it's not a page-floor glow). -->
      <view class="mx-4 relative overflow-hidden" :style="heroStyle">
        <view aria-hidden :style="heroAuroraStyle" />
        <view class="relative">
          <view class="flex items-center" style="gap: 6px; margin-bottom: 8px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>
            <text :style="heroLabelStyle">{{ t.bundle.heroLabel }}</text>
          </view>
          <text class="block" :style="heroTitleStyle">{{ t.bundle.heroTitle }}</text>
          <view class="grid grid-cols-3 gap-2" style="margin-top: 14px">
            <view v-for="tier in tiersReversed" :key="tier.minItems" class="p-2 text-center" :style="tierCellStyle(tier)">
              <text class="block" :style="tierLabelStyle(tier)">{{ tierText(tier) }}</text>
              <text class="block tabular-nums" :style="tierPctStyle(tier)">−{{ (tier.pct * 100).toFixed(0) }}%</text>
            </view>
          </view>
        </view>
      </view>

      <!-- Items -->
      <view class="mx-4 mt-3 overflow-hidden" :style="cardStyle">
        <view class="px-4 py-2.5 flex items-center justify-between" style="border-bottom: 1px solid var(--v5-border)">
          <text :style="itemsHeadingStyle">{{ t.bundle.itemsHeading }}</text>
          <text v-if="products.length > 0" class="active:opacity-70" style="font-size: 12px; color: var(--v5-ink-3)" role="button" tabindex="0" :aria-label="t.bundle.clear" @click.stop="clear">{{ t.bundle.clear }}</text>
        </view>

        <!-- Empty state -->
        <EmptyState v-if="products.length === 0" kind="empty-list" :title="t.empty.listTitle" :desc="t.empty.listDesc" />

        <!-- Item rows -->
        <view
          v-for="(p, i) in products"
          v-else
          :key="p.id"
          class="px-4 py-2.5 flex items-center gap-3"
          :style="{ borderBottom: i === products.length - 1 ? 'none' : '1px solid var(--v5-border)' }"
        >
          <view class="flex-1 min-w-0">
            <text class="block truncate" :style="itemNameStyle">{{ p.name }}</text>
            <text class="block" :style="itemMetaStyle">
              <text style="color: var(--v5-ink-4)">{{ t.uiChrome.price }} </text>${{ p.price.toLocaleString() }}<text style="color: var(--v5-ink-4)"> · </text><text style="color: var(--v5-success)">{{ fmt(t.uiChrome.earnsPerDay, { amount: `+$${p.dailyEarn.toFixed(2)}` }) }}</text>
            </text>
          </view>
          <view class="shrink-0 rounded-full grid place-items-center active:opacity-70" style="width: 28px; height: 28px; background: var(--v5-surface-2)" role="button" tabindex="0" :aria-label="fmt(t.uiChrome.removeItem, { name: p.name })" @click.stop="remove(p.id)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </view>
        </view>
      </view>

      <!-- Suggestions -->
      <view v-if="suggestions.length > 0" class="mx-4 mt-3">
        <text class="block" :style="suggestionsHeadingStyle">{{ t.bundle.suggestionsHeading }}</text>
        <view class="overflow-hidden" :style="cardStyle">
          <view
            v-for="(p, i) in suggestions"
            :key="p.id"
            class="w-full flex items-center gap-3 active:opacity-80"
            :style="suggestionRowStyle(i === suggestions.length - 1)"
            role="button"
            tabindex="0"
            :aria-label="fmt(t.uiChrome.addItem, { name: p.name })"
            @click.stop="onAddSuggestion(p)"
          >
            <view class="flex-1 min-w-0 text-left">
              <text class="block truncate" :style="suggestionNameStyle">{{ p.name }}</text>
              <text class="block" :style="itemMetaStyle">
                <text style="color: var(--v5-ink-4)">{{ t.uiChrome.price }} </text>${{ p.price.toLocaleString() }}<text style="color: var(--v5-ink-4)"> · </text><text style="color: var(--v5-success)">{{ fmt(t.uiChrome.earnsPerDay, { amount: `+$${p.dailyEarn.toFixed(2)}` }) }}</text>
              </text>
            </view>
            <view class="shrink-0 rounded-full grid place-items-center" style="width: 28px; height: 28px; background: var(--v5-brand-soft); color: var(--v5-brand)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
            </view>
          </view>
        </view>
      </view>

      <!-- Total summary -->
      <view v-if="products.length > 0" class="mx-4 mt-3 relative overflow-hidden" :style="heroStyle">
        <view aria-hidden :style="totalAuroraStyle" />
        <view class="relative">
          <!-- Subtotal -->
          <view class="flex items-center justify-between" style="min-height: 24px">
            <text :style="rowLabelStyle(false)">{{ t.bundle.subtotal }}</text>
            <text class="tabular-nums" :style="rowValueStyle()">${{ subtotal.toLocaleString() }}</text>
          </view>
          <!-- Discount -->
          <view v-if="discountPct > 0" class="flex items-center justify-between" style="min-height: 24px">
            <text :style="rowLabelStyle(false)">{{ discountLabel }}</text>
            <text class="tabular-nums" :style="rowValueStyle('var(--v5-success)')">−${{ discountUSD.toFixed(0) }}</text>
          </view>
          <!-- Divider -->
          <view style="height: 1px; background: var(--v5-border); margin-top: 10px; margin-bottom: 10px" />
          <!-- Total -->
          <view class="flex items-center justify-between" style="min-height: 24px">
            <text :style="rowLabelStyle(true)">{{ t.bundle.total }}</text>
            <text class="tabular-nums" :style="rowValueStyle(undefined, true)">${{ totalText }}</text>
          </view>
          <!-- Combined daily -->
          <view class="flex items-center justify-between" style="min-height: 24px">
            <text :style="rowLabelStyle(false)">{{ t.bundle.combinedDaily }}</text>
            <text class="tabular-nums" :style="rowValueStyle('var(--v5-success)')">+${{ cumulativeDailyEarn.toFixed(2) }}/d</text>
          </view>
          <!-- Checkout CTA — 结算不可用时置灰 + 换文案(禁用原因),下一步走 CTA 下方那句 hint。
               箭头 / 上传图标一并撤掉:禁用态上留着「向前」的箭头是反语义的。 -->
          <view
            class="w-full flex items-center justify-center"
            :class="checkoutUnavailable ? '' : 'active:scale-[0.98]'"
            :style="ctaStyle"
            role="button"
            tabindex="0"
            :aria-disabled="checkoutUnavailable"
            :aria-label="ctaText"
            @click.stop="onCheckout"
          >
            <svg v-if="!checkoutUnavailable" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18" /><path d="M5 10l7-7 7 7" /><path d="M5 21h14" /></svg>
            <text :style="ctaLabelStyle">{{ ctaText }}</text>
            <svg v-if="!checkoutUnavailable" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
          </view>
          <!-- 禁用原因 + 下一步(项目不变量:业务链必须有下一步 / 禁用原因)。 -->
          <text v-if="checkoutUnavailable" class="block" :style="ctaHintStyle">{{ checkoutHint }}</text>
        </view>
      </view>
      </template>
      </template>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useCart, bundleDiscountForCount, BUNDLE_DISCOUNT_TIERS, type BundleDiscountTier } from "@/store/cart";
import { PRODUCTS, getProduct, evaluatePurchaseGate, type Product } from "@/mock/products";
import { useSetPageHeader } from "@/composables/use-page-header";
import { isProductAvailable } from "@/store/product-availability";
import { useProductPhase } from "@/composables/use-product-phase";
import { productCatalogState, refreshProductCatalog } from "@/store/product-catalog";
import { bundleCatalogReady } from "@/store/bundle-catalog-guard";
import { refreshServerProductPhase } from "@/store/server-product-phase";
import { toast } from "@/store/ui";
import { bundleOrderApi, commercePaymentApi, mockFundsEnabled, orderApi, remoteApiEnabled } from "@/api/runtime";
import { isCanonicalPaidOrder } from "@/api/order-readback";
import { isAmbiguousOutcome } from "@/api/errors";
import { useApp } from "@/store/app";
import { useOrders, type Order } from "@/store/orders";
import { usePendingCheckout } from "@/store/pending-checkout";
import { postReceiptOnce, postReceiptOnly, reportStuckFunds, type ReceiptDraft } from "@/lib/money-receipt";
import { navTo } from "@/lib/route";
import { useVRank } from "@/store/v-rank";
import { useNetwork } from "@/store/network";
import { readAccountRow, writeAccountRow } from "@/store/account-scoped-storage";

const t = useT();
const cart = useCart();
const phase = useProductPhase();
const app = useApp();
const orders = useOrders();
const pending = usePendingCheckout();

const catalogStatus = computed(() => productCatalogState.status);
const catalogReady = computed(() => bundleCatalogReady(remoteApiEnabled, catalogStatus.value));

onLoad(async () => {
  await Promise.all([refreshProductCatalog(true), refreshServerProductPhase(true)]);
});

onShow(() => {
  void refreshProductCatalog(true);
  void refreshServerProductPhase(true);
  restoreReceiptRecovery();
});

// Sticky chassis nav header — back + "Bundle" title (mirrors the prototype's
// <SetPageHeader backHref="/store"/>, whose chassis Header resolves the route
// title headerTitles.storeBundle).
useSetPageHeader(() => ({
  title: t.value.headerTitles.storeBundle,
  backHref: "/store",
}));

const products = computed<Product[]>(() =>
  catalogReady.value
    ? cart.items
      .map((id) => getProduct(id))
      .filter((p): p is Product => !!p)
      .filter((p) => isProductAvailable(p, phase.value))
    : [],
);
const subtotal = computed(() => products.value.reduce((s, p) => s + p.price, 0));
const discountPct = computed(() => bundleDiscountForCount(products.value.length));
const discountUSD = computed(() => subtotal.value * discountPct.value);
const total = computed(() => subtotal.value - discountUSD.value);
const cumulativeDailyEarn = computed(() => products.value.reduce((s, p) => s + p.dailyEarn, 0));

// 未正式上架的 SKU 不进组合建议(bundle 是可购组合面,走商城正门口径;审查 F12)。
const suggestions = computed(() =>
  catalogReady.value
    ? PRODUCTS.filter(
      (p) =>
        !cart.items.includes(p.id) &&
        p.tier !== "Share" &&
        isProductAvailable(p, phase.value),
    ).slice(0, 3)
    : [],
);

function retryCatalog() {
  void refreshProductCatalog(true);
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
    if (!postReceiptOnce(failure.draft)) return; // 按 ref 幂等
    receiptWriteFailure.value = null;
    clearReceiptRecovery(failure.accountKey);
    cart.clear();
    toast.success(
      t.value.bundle.checkoutSuccessTitle,
      fmt(t.value.bundle.checkoutSuccessBody, { count: failure.orderIds.length }),
    );
    navTo("/pages/store/orders");
  } finally {
    receiptRetrying.value = false;
  }
}

const tiersReversed = computed(() => BUNDLE_DISCOUNT_TIERS.slice().reverse());

const totalText = computed(() => total.value.toLocaleString(undefined, { maximumFractionDigits: 0 }));
const discountLabel = computed(() => fmt(t.value.bundle.bundleDiscount, { pct: (discountPct.value * 100).toFixed(0) }));
const checkoutCtaText = computed(() => fmt(t.value.bundle.checkoutCta, { total: totalText.value }));
const submitting = ref(false);
const checkoutUnavailable = computed(() => submitting.value || products.value.length < 2);
const ctaText = computed(() => (
  submitting.value ? "…" : products.value.length < 2 ? t.value.bundle.checkoutUnavailableCta : checkoutCtaText.value
));
const checkoutHint = computed(() => products.value.length < 2 ? t.value.bundle.checkoutUnavailableHint : "");
const BUNDLE_RECEIPT_RECOVERY_KEY = "nexgrid-bundle-receipt-recovery-v1";
type BundleReceiptRecovery = { accountKey: string; draft: ReceiptDraft; orderIds: string[] };
const receiptWriteFailure = ref<BundleReceiptRecovery | null>(null);
const receiptRetrying = ref(false);

function restoreReceiptRecovery() {
  const accountKey = orders.currentAccountKey();
  const row = readAccountRow<BundleReceiptRecovery>(BUNDLE_RECEIPT_RECOVERY_KEY, accountKey);
  // 磁盘没有行时保留内存里同账号的卡(恢复行自己也可能写不进去,那张卡是唯一补写入口);换号才清。
  const memRow = receiptWriteFailure.value?.accountKey === accountKey ? receiptWriteFailure.value : null;
  receiptWriteFailure.value = (row?.accountKey === accountKey ? row : null) ?? memRow;
}

function persistReceiptRecovery(failure: BundleReceiptRecovery) {
  receiptWriteFailure.value = failure;
  if (!writeAccountRow<BundleReceiptRecovery>(BUNDLE_RECEIPT_RECOVERY_KEY, failure.accountKey, failure)) {
    reportStuckFunds(app.captureMoney(), failure.orderIds.join(","), "receipt");
  }
}

function clearReceiptRecovery(accountKey = orders.currentAccountKey()) {
  // persist-verdict-ok: 清不掉最多让卡多露一次;补写走 postReceiptOnce 按 ref 幂等
  writeAccountRow<BundleReceiptRecovery | null>(BUNDLE_RECEIPT_RECOVERY_KEY, accountKey, null);
}

watch(() => app.accountKey, restoreReceiptRecovery);

function tierIsActive(tier: BundleDiscountTier): boolean {
  return products.value.length >= tier.minItems;
}
function tierText(tier: BundleDiscountTier): string {
  return fmt(t.value.bundle.tier, { n: tier.minItems });
}

function remove(id: string) {
  cart.remove(id);
}
function clear() {
  cart.clear();
}
function onAddSuggestion(p: Product) {
  cart.add(p.id);
  toast.success(fmt(t.value.bundle.addedToBundle, { name: p.name }));
}
interface PendingBundleCommands { commands: Record<string, string> }
const BUNDLE_COMMAND_KEY = "nexgrid-bundle-order-command-v1";
function bundleFingerprint(list: Product[]): string {
  return list.map((item) => item.id).sort().join("|");
}
function acquireBundleKey(list: Product[], accountKey: string): string {
  const fingerprint = bundleFingerprint(list);
  const row = readAccountRow<PendingBundleCommands>(BUNDLE_COMMAND_KEY, accountKey);
  const existing = row?.commands?.[fingerprint];
  if (existing) return existing;
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const key = `bundle:${suffix}`;
  // persist-verdict-ok: 远端命令键耐久性归远端幂等设计(见 HANDOFF U-21)
  writeAccountRow(BUNDLE_COMMAND_KEY, accountKey, {
    commands: { ...(row?.commands ?? {}), [fingerprint]: key },
  });
  return key;
}
function retireBundleKey(list: Product[], accountKey: string): void {
  const row = readAccountRow<PendingBundleCommands>(BUNDLE_COMMAND_KEY, accountKey);
  const commands = { ...(row?.commands ?? {}) };
  delete commands[bundleFingerprint(list)];
  // persist-verdict-ok: 远端命令键耐久性归远端幂等设计(见 HANDOFF U-21)
  writeAccountRow(BUNDLE_COMMAND_KEY, accountKey, { commands });
}

async function onCheckout() {
  const list = products.value;
  if (list.length < 2 || submitting.value) return;
  if (remoteApiEnabled) {
    const accountKey = orders.currentAccountKey();
    submitting.value = true;
    const key = acquireBundleKey(list, accountKey);
    try {
      const created = await bundleOrderApi.create(list.map((item) => item.id), key);
      if (mockFundsEnabled) {
        const payment = await commercePaymentApi.confirm(created.orderNo, `payment:${created.orderNo}`);
        if (payment.orderNo !== created.orderNo || payment.sourceEnvironment !== "SANDBOX") {
          throw new Error("COMMERCE_PAYMENT_READBACK_INVALID");
        }
        const readback = (await orderApi.list()).orders.find((order) => order.orderNo === created.orderNo);
        if (!isCanonicalPaidOrder(readback, created.orderNo, created.itemCount)) {
          throw new Error("COMMERCE_PAYMENT_READBACK_INVALID");
        }
      }
      retireBundleKey(list, accountKey);
      if (orders.currentAccountKey() !== accountKey) return;
      cart.clear();
      const successBody = mockFundsEnabled
        ? t.value.bundle.checkoutSuccessBody
        : t.value.bundle.checkoutPendingBody;
      toast.success(t.value.bundle.checkoutSuccessTitle,
        fmt(successBody, { count: created.itemCount }));
      navTo("/pages/store/orders");
    } catch (error) {
      if (!isAmbiguousOutcome(error)) retireBundleKey(list, accountKey);
      if (orders.currentAccountKey() !== accountKey) return;
      toast.warn(isAmbiguousOutcome(error)
        ? t.value.bundle.checkoutOutcomeUnknown
        : t.value.tradein.errPurchaseFailed);
    } finally {
      submitting.value = false;
    }
    return;
  }
  // 购买资格门(等级门/锁额/售罄)——镜像单品 checkout 的门:suggestions 只挡上架节奏门
  // (unlocksAtPhase)、挡不住资格门,组合内任一 SKU 不达标即整单拒,防授权旁路(深链防线)。
  // 真后台仍以 POST /api/orders 服务端复检为准。
  const vRank = useVRank();
  const network = useNetwork();
  const gateCtx = {
    rank: vRank.myRank,
    activeDirect: network.members.filter((m) => m.layer === 1 && m.status === "active").length,
    teamVolumeUSD: vRank.teamVolumeUSD,
  };
  const blocked = list.find((p) => evaluatePurchaseGate(p, gateCtx).blocked);
  if (blocked) {
    const g = evaluatePurchaseGate(blocked, gateCtx);
    toast.warn(g.soldOut ? t.value.store.gateSoldOutToast : t.value.store.gateBlockedToast);
    navTo("/pages/team/quota");
    return;
  }
  // 组合折扣已含在 total;一次扣平台余额(复用单品 checkout 的余额门),不足则拦截。
  const charge = total.value;
  // 与单品结算同一套两分支处置:数值闸 + 只读余额预检先出局(用户可自解),之后 debit 的 false 只剩落盘失败(系统故障)。
  if (!Number.isFinite(charge) || charge < 0) {
    toast.warn(t.value.store.coTotalQuoteChanged);
    return;
  }
  if (app.user.usdtBalance < charge) {
    toast.warn(fmt(t.value.errors.insufficientBalanceMsg, { amt: charge.toFixed(2) }));
    return;
  }
  const beforePay = app.captureMoney();
  if (!app.debitBalance(charge)) {
    toast.error(t.value.errors.txNotSavedTitle, t.value.errors.txNotSavedMsg);
    return;
  }
  const pct = discountPct.value;
  // 逐商品建单;组合折扣按单价比例分摊到各单(展示净额)。
  // ponytail: 账本单源 = debitBalance(total)+bills;各单 net 之和的四舍五入分差不入账。
  // 一批一次落盘(store 保证):要么全部建成,要么一单不留 —— 不存在「前几单落了、后几单没落」的半执行态。
  const created = orders.createOrders(list.map((p) => ({
    productId: p.id as Order["productId"],
    productName: p.name,
    unitPrice: p.price,
    paymentMethod: "balance" as const,
    discount: +(p.price * pct).toFixed(2),
  })));
  // 这批成交 = 这些商品的购买意图已兑现:同账号仍在窗内的链上旧票一并作废(否则浮动条继续催第二笔)。
  // persist-verdict-ok: 作废不掉 = 票留在磁盘,浮动条继续露出,用户回去看到的是可取消的旧票
  if (created) for (const p of list) pending.settleProduct(p.id);
  if (!created) {
    // 整批没落盘:钱按快照精确冲正,冲不回去走响亮终态。
    if (app.restoreMoney(beforePay)) toast.error(t.value.errors.txNotSavedTitle, t.value.errors.txNotSavedMsg);
    else reportStuckFunds(beforePay);
    return;
  }
  // 🔴 走 postReceiptOnly 而不是 postMoneyBill(与 checkout.vue 主账单同口径):扣款必须
  // 发生在建单之前,而单子已经建好并进入履约 —— 收据写失败时回滚资金只还钱、还不回那几台设备。
  // 既定处置是让用户明确看见收据没记上,而不是像原来那样丢弃返回值静默吞掉。
  const receiptDraft: ReceiptDraft = {
    type: "purchase",
    symbol: "USDT",
    amount: -charge,
    status: "posted",
    memo: fmt(t.value.bundle.checkoutBillMemo, { count: list.length }),
    ref: created[0]?.id ?? "BUNDLE",
  };
  if (!postReceiptOnly(receiptDraft)) {
    persistReceiptRecovery({
      accountKey: orders.currentAccountKey(),
      draft: receiptDraft,
      orderIds: created.map((order) => order.id),
    });
    return;
  }
  cart.clear();
  toast.success(
    t.value.bundle.checkoutSuccessTitle,
    fmt(t.value.bundle.checkoutSuccessBody, { count: list.length }),
  );
  navTo("/pages/store/orders");
}

// ───── style objects ─────
const catalogStateStyle: CSSProperties = {
  padding: "18px 16px",
  borderRadius: "16px",
  background: "var(--v5-surface)",
};
const catalogStateTitleStyle: CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: "var(--v5-ink)",
};
const catalogStateBodyStyle: CSSProperties = {
  fontSize: "13px",
  lineHeight: "19px",
  color: "var(--v5-ink-3)",
};
const catalogRetryStyle: CSSProperties = {
  minHeight: "36px",
  alignItems: "center",
  padding: "0 14px",
  borderRadius: "9999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontSize: "13px",
  fontWeight: 600,
};
const receiptFailureCardStyle: CSSProperties = {
  padding: "24px 20px",
  background: "var(--v5-surface)",
};
const heroStyle: CSSProperties = {
  padding: "18px",
  borderRadius: "16px",
  background: "var(--v5-surface)",
};
const heroAuroraStyle: CSSProperties = {
  position: "absolute",
  inset: "-20%",
  background:
    "radial-gradient(40% 50% at 80% 20%, var(--v5-brand-soft) 0%, transparent 60%)," +
    "radial-gradient(40% 50% at 10% 80%, var(--v5-success-soft) 0%, transparent 60%)",
  filter: "blur(8px)",
  pointerEvents: "none",
  opacity: 0.85,
};
const totalAuroraStyle: CSSProperties = {
  position: "absolute",
  top: "-40px",
  left: "-40px",
  width: "140px",
  height: "140px",
  borderRadius: "50%",
  background: "radial-gradient(circle, var(--v5-brand-2-soft), transparent 70%)",
  opacity: 0.6,
  pointerEvents: "none",
};
const heroLabelStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-brand)",
  letterSpacing: "0.06em",
};
const heroTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "20px",
  letterSpacing: "-0.014em",
  color: "var(--v5-ink)",
  lineHeight: 1.3,
};

function tierCellStyle(tier: BundleDiscountTier): CSSProperties {
  const active = tierIsActive(tier);
  return {
    borderRadius: "12px",
    background: active ? "var(--v5-brand-soft)" : "var(--v5-surface-2)",
  };
}
function tierLabelStyle(_tier: BundleDiscountTier): CSSProperties {
  return {
    fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
    fontSize: "12px",
    fontWeight: 500,
    color: "var(--v5-ink-3)",
    letterSpacing: "0.06em",
  };
}
function tierPctStyle(tier: BundleDiscountTier): CSSProperties {
  const active = tierIsActive(tier);
  return {
    marginTop: "2px",
    fontFamily: "var(--font-v5)",
    fontWeight: 600,
    fontSize: "15px",
    letterSpacing: "-0.014em",
    color: active ? "var(--v5-brand)" : "var(--v5-ink)",
  };
}

// Shared form-b container (items list + suggestions list): surface, no border,
// internal hairline rows. overflow-hidden on the element clips the row corners.
const cardStyle: CSSProperties = {
  borderRadius: "16px",
  background: "var(--v5-surface)",
};
const itemsHeadingStyle: CSSProperties = {
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
const emptyTitleStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};
const itemNameStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};
const itemMetaStyle: CSSProperties = {
  marginTop: "2px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};

const suggestionsHeadingStyle: CSSProperties = {
  marginBottom: "10px",
  padding: "0 4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--v5-ink-3)",
  letterSpacing: "0.06em",
};
// Suggestion rows now live in one form-b container → hairline-separated rows.
function suggestionRowStyle(isLast: boolean): CSSProperties {
  return {
    padding: "12px 14px",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
const suggestionNameStyle: CSSProperties = {
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  color: "var(--v5-ink)",
  letterSpacing: "-0.008em",
};

function rowLabelStyle(big: boolean): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "13px",
    fontWeight: big ? 600 : 500,
    color: big ? "var(--v5-ink)" : "var(--v5-ink-3)",
  };
}
function rowValueStyle(tint?: string, big = false): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontWeight: 600,
    fontSize: big ? "18px" : "13px",
    letterSpacing: big ? "-0.014em" : "-0.008em",
    color: tint ?? "var(--v5-ink)",
  };
}

// disabled 态按设计系统的状态派生公式:填充降 surface 系 + 文字/图标降 ink-4 + 去掉 glow。
const ctaStyle = computed<CSSProperties>(() => ({
  marginTop: "14px",
  gap: "6px",
  height: "50px",
  borderRadius: "999px",
  background: checkoutUnavailable.value ? "var(--v5-surface-2)" : "var(--v5-brand)",
  boxShadow: checkoutUnavailable.value ? "none" : "var(--v5-spotlight-brand)",
  color: checkoutUnavailable.value ? "var(--v5-ink-4)" : "var(--v5-on-brand)",
}));
const ctaLabelStyle = computed<CSSProperties>(() => ({
  fontFamily: "var(--font-v5)",
  fontWeight: 500,
  fontSize: "15px",
  letterSpacing: "-0.005em",
  color: checkoutUnavailable.value ? "var(--v5-ink-4)" : "var(--v5-on-brand)",
}));
// 禁用原因 + 下一步那句。text-wrap: pretty 走排版铁律(禁末行孤字)。
const ctaHintStyle: CSSProperties = {
  marginTop: "10px",
  fontFamily: "var(--font-v5)",
  fontSize: "12px",
  lineHeight: 1.5,
  color: "var(--v5-ink-3)",
  textWrap: "pretty",
};
</script>
