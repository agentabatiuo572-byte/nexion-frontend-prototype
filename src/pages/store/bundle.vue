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
  - 远端:POST /api/orders/bundle 由服务端锁库存、计算阶梯折扣并创建一张 BUNDLE 订单；
    随后只能通过 UVEL 钱包扣款接口完成支付与设备激活，不拉起第三方收银台。
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
      <view v-if="catalogStatus === 'loading' || policyStatus === 'loading'" data-testid="bundle-catalog-loading" class="nx-glass-card mx-4" :style="catalogStateStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.store.catalogLoadingTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.store.catalogLoadingBody }}</text>
      </view>
      <view v-else-if="catalogStatus === 'error' || policyStatus === 'error'" data-testid="bundle-catalog-error" class="nx-glass-card mx-4" :style="catalogStateStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.store.catalogErrorTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.store.catalogErrorBody }}</text>
        <view class="inline-flex mt-3 active:opacity-70" role="button" tabindex="0" :style="catalogRetryStyle" @click="retryCatalog" @keydown="activate($event, retryCatalog)">
          <text>{{ t.store.catalogRetry }}</text>
        </view>
      </view>
      <template v-else>

      <view v-if="receiptWriteFailure" class="nx-glass-card mx-4 rounded-2xl text-center" :style="receiptFailureCardStyle">
        <text class="block" :style="catalogStateTitleStyle">{{ t.errors.billMissingTitle }}</text>
        <text class="block mt-1" :style="catalogStateBodyStyle">{{ t.errors.billMissingMsg }}</text>
        <view class="inline-flex mt-3 active:opacity-70" role="button" tabindex="0" :style="catalogRetryStyle" :aria-disabled="receiptRetrying" @click="retryReceiptWrite" @keydown="activate($event, retryReceiptWrite)">
          <text>{{ receiptRetrying ? t.store.catalogLoadingTitle : t.store.catalogRetry }}</text>
        </view>
      </view>
      <template v-else>

      <!-- Hero — filled commercial spotlight (border dropped; aurora stays clipped
           inside the surface + overflow-hidden, so it's not a page-floor glow). -->
      <view class="nx-glass-card mx-4 relative overflow-hidden" :style="heroStyle">
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
      <view class="nx-glass-card mx-4 mt-3 overflow-hidden" :style="cardStyle">
        <view class="px-4 py-2.5 flex items-center justify-between" style="border-bottom: 1px solid var(--v5-border)">
          <text :style="itemsHeadingStyle">{{ t.bundle.itemsHeading }}</text>
          <text v-if="products.length > 0" class="active:opacity-70" style="font-size: 12px; color: var(--v5-ink-3)" role="button" tabindex="0" :aria-label="t.bundle.clear" @click.stop="clear" @keydown="activate($event, clear)">{{ t.bundle.clear }}</text>
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
            <text class="block truncate" :style="itemNameStyle">{{ nexGridBrandText(p.name) }}</text>
            <text class="block" :style="itemMetaStyle">
              <text style="color: var(--v5-ink-4)">{{ t.uiChrome.price }} </text>${{ p.price.toLocaleString() }}<text style="color: var(--v5-ink-4)"> · </text><text style="color: var(--v5-success)">{{ bundleProductYieldText(p) }}</text>
            </text>
            <text v-if="p.productType === 'SHARE'" class="block" :style="itemMetaStyle">{{ t.store.shareYieldDisclaimer }}</text>
            <text v-if="remoteApiEnabled && purchaseEligibilityStore.state(p.id).status !== 'ready'" class="block" :style="itemMetaStyle">{{ purchaseEligibilityStore.state(p.id).status === 'error' ? t.store.purchaseEligibilityError : t.store.purchaseEligibilityLoading }}</text>
            <text v-else-if="remoteApiEnabled && !purchaseEligibilityStore.state(p.id).eligible" class="block" :style="itemMetaStyle">{{ t.store.purchaseEligibilityIneligible }}</text>
          </view>
          <view class="shrink-0 rounded-full grid place-items-center active:opacity-70" style="width: 28px; height: 28px; background: var(--v5-surface-2)" role="button" tabindex="0" :aria-label="fmt(t.uiChrome.removeItem, { name: nexGridBrandText(p.name) })" @click.stop="remove(p.id)" @keydown="activate($event, () => remove(p.id))">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </view>
        </view>
      </view>

      <!-- Suggestions -->
      <view v-if="suggestions.length > 0" class="mx-4 mt-3">
        <text class="block" :style="suggestionsHeadingStyle">{{ t.bundle.suggestionsHeading }}</text>
        <view class="nx-glass-card overflow-hidden" :style="cardStyle">
          <view
            v-for="(p, i) in suggestions"
            :key="p.id"
            class="w-full flex items-center gap-3 active:opacity-80"
            :style="suggestionRowStyle(i === suggestions.length - 1)"
            role="button"
            tabindex="0"
            :aria-label="remoteApiEnabled && purchaseEligibilityStore.state(p.id).status === 'ready' && !purchaseEligibilityStore.state(p.id).eligible
              ? `${nexGridBrandText(p.name)} · ${t.store.gateBlockedToast}` : fmt(t.uiChrome.addItem, { name: nexGridBrandText(p.name) })"
            @click.stop="onAddSuggestion(p)"
            @keydown="activate($event, () => onAddSuggestion(p))"
          >
            <view class="flex-1 min-w-0 text-left">
              <text class="block truncate" :style="suggestionNameStyle">{{ nexGridBrandText(p.name) }}</text>
              <text class="block" :style="itemMetaStyle">
                <text style="color: var(--v5-ink-4)">{{ t.uiChrome.price }} </text>${{ p.price.toLocaleString() }}<text style="color: var(--v5-ink-4)"> · </text><text style="color: var(--v5-success)">{{ fmt(t.uiChrome.earnsPerDay, { amount: `+$${p.dailyEarn.toFixed(2)}` }) }}</text>
              </text>
              <text v-if="remoteApiEnabled && purchaseEligibilityStore.state(p.id).status !== 'ready'" class="block" :style="itemMetaStyle">{{ purchaseEligibilityStore.state(p.id).status === 'error' ? t.store.purchaseEligibilityError : t.store.purchaseEligibilityLoading }}</text>
              <text v-else-if="remoteApiEnabled && !purchaseEligibilityStore.state(p.id).eligible" class="block" :style="itemMetaStyle">{{ t.store.gateBlockedToast }}</text>
            </view>
            <view class="shrink-0 rounded-full grid place-items-center" style="width: 28px; height: 28px; background: var(--v5-brand-soft); color: var(--v5-brand)">
              <svg v-if="remoteApiEnabled && purchaseEligibilityStore.state(p.id).status === 'ready' && !purchaseEligibilityStore.state(p.id).eligible" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
            </view>
          </view>
        </view>
      </view>

      <!-- Total summary -->
      <view v-if="products.length > 0" class="nx-glass-card mx-4 mt-3 relative overflow-hidden" :style="heroStyle">
        <view aria-hidden :style="totalAuroraStyle" />
        <view class="relative">
          <!-- Subtotal -->
          <view class="flex items-center justify-between" style="min-height: 24px">
            <text :style="rowLabelStyle(false)">{{ t.bundle.subtotal }}</text>
            <text class="tabular-nums" :style="rowValueStyle()">${{ formatBundleUsdt(subtotal) }}</text>
          </view>
          <!-- Discount -->
          <view v-if="discountPct > 0" class="flex items-center justify-between" style="min-height: 24px">
            <text :style="rowLabelStyle(false)">{{ discountLabel }}</text>
            <text class="tabular-nums" :style="rowValueStyle('var(--v5-success)')">−${{ formatBundleUsdt(discountUSD) }}</text>
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
            @keydown="activate($event, onCheckout)"
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
import { nexGridBrandText } from "@/lib/brand-copy";
import { useCart, bundleDiscountForCount, type BundleDiscountTier } from "@/store/cart";
import { PRODUCTS, getProduct, evaluatePurchaseGate, type Product } from "@/mock/products";
import { useSetPageHeader } from "@/composables/use-page-header";
// 🔴 zentao #244:线上模式必须问**服务端**资格,本地门仅 mock 用 —— 与 detail.vue 同一口径。
import { purchaseEligibilityStore } from "@/store/purchase-eligibility";
import { isProductAvailable } from "@/store/product-availability";
import { useProductPhase } from "@/composables/use-product-phase";
import { productCatalogState, refreshProductCatalog } from "@/store/product-catalog";
import { bundleCatalogReady } from "@/store/bundle-catalog-guard";
import { refreshServerProductPhase } from "@/store/server-product-phase";
import { confirm, toast } from "@/store/ui";
import { bundleDiscountApi, bundleOrderApi, orderApi, remoteApiEnabled } from "@/api/runtime";
import { matchesBundleQuote, normalizeBundleExpectedAmountUsdt } from "@/api/bundle-order-api";
import { quoteBundleAmountUsdt } from "@/api/bundle-quote";
import { restoreBundleCommand, type PendingBundleCommand } from "@/api/bundle-command";
import type { BundleDiscountSnapshot } from "@/api/bundle-discount-api";
import { ApiError, asApiError, isAmbiguousOutcome } from "@/api/errors";
import { useApp } from "@/store/app";
import { useOrders, type Order } from "@/store/orders";
import { usePendingCheckout } from "@/store/pending-checkout";
import { postReceiptOnce, postReceiptOnly, reportStuckFunds, type ReceiptDraft } from "@/lib/money-receipt";
import { navTo } from "@/lib/route";
import { useVRank } from "@/store/v-rank";
import { useNetwork } from "@/store/network";
import { acquireAccountCommandKey, readAccountRow, writeAccountRow } from "@/store/account-scoped-storage";
import { captureAccountScope, isCurrentAccountScope } from "@/lib/account-scope";

const t = useT();
const cart = useCart();
const phase = useProductPhase();
const app = useApp();
const orders = useOrders();
const pending = usePendingCheckout();

const catalogStatus = computed(() => productCatalogState.status);
const policy = ref<BundleDiscountSnapshot | null>(null);
const policyStatus = ref<"loading" | "ready" | "error">("loading");
const catalogReady = computed(() => bundleCatalogReady(remoteApiEnabled, catalogStatus.value)
  && policyStatus.value === "ready" && policy.value?.serverCanonical === true);

async function refreshBundlePolicy(): Promise<void> {
  policyStatus.value = "loading";
  try {
    policy.value = await bundleDiscountApi.current();
    policyStatus.value = "ready";
  } catch {
    policy.value = null;
    policyStatus.value = "error";
  }
}

onLoad(async () => {
  await Promise.all([refreshProductCatalog(true), refreshServerProductPhase(true), refreshBundlePolicy()]);
});

onShow(() => {
  void refreshProductCatalog(true);
  void refreshServerProductPhase(true);
  void refreshBundlePolicy();
  void refreshBundleWallet();
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
const activeDiscountTiers = computed<ReadonlyArray<BundleDiscountTier>>(() => policy.value?.tiers ?? []);
const discountPct = computed(() => bundleDiscountForCount(products.value.length, activeDiscountTiers.value));
const bundleQuote = computed(() => quoteBundleAmountUsdt(
  products.value.map((product) => product.price), discountPct.value,
));
const subtotal = computed(() => bundleQuote.value?.subtotalUsdt ?? Number.NaN);
const discountUSD = computed(() => bundleQuote.value?.discountUsdt ?? Number.NaN);
const total = computed(() => bundleQuote.value?.amountUsdt ?? Number.NaN);
const cumulativeDailyEarn = computed(() => products.value.reduce((s, p) => s + (p.productType === "SHARE" ? 0 : p.dailyEarn), 0));
function bundleProductYieldText(p: Product): string {
  if (p.productType !== "SHARE") return fmt(t.value.uiChrome.earnsPerDay, { amount: `+${p.dailyEarn.toFixed(2)}` });
  const range = p.shareYieldMin != null && p.shareYieldMax != null
    ? `${p.shareYieldMin}%–${p.shareYieldMax}%`
    : t.value.store.shareAnnualUnavailable;
  return `${t.value.store.shareReferenceAnnual}: ${range}`;
}

// 未正式上架的 SKU 不进组合建议(bundle 是可购组合面,走商城正门口径;审查 F12)。
const suggestions = computed(() =>
  catalogReady.value
    ? PRODUCTS.filter(
      (p) =>
        !cart.items.includes(p.id) &&
        p.productType !== "SHARE" &&
        isProductAvailable(p, phase.value),
    ).slice(0, 3)
    : [],
);
watch([() => products.value.map((p) => p.id).join("|"),
  () => suggestions.value.map((p) => p.id).join("|"), () => app.accountKey], () => {
  if (remoteApiEnabled) void Promise.all([...products.value, ...suggestions.value]
    .map((p) => purchaseEligibilityStore.ensure(p.id, true)));
}, { immediate: true });

function retryCatalog() {
  void refreshProductCatalog(true);
  void refreshServerProductPhase(true);
  void refreshBundlePolicy();
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

const tiersReversed = computed(() => activeDiscountTiers.value.slice().reverse());

function activate(event: KeyboardEvent, action: () => void | Promise<void>) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  void action();
}

function formatBundleUsdt(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}
const totalText = computed(() => formatBundleUsdt(total.value));
const discountLabel = computed(() => fmt(t.value.bundle.bundleDiscount, { pct: (discountPct.value * 100).toFixed(0) }));
const checkoutCtaText = computed(() => fmt(t.value.bundle.checkoutCta, { total: totalText.value }));
const submitting = ref(false);
const walletRefreshing = ref(false);
let walletRefreshSequence = 0;

async function refreshBundleWallet(): Promise<void> {
  if (!remoteApiEnabled) return;
  const request = app.captureRemoteAccountRequest();
  const sequence = ++walletRefreshSequence;
  walletRefreshing.value = true;
  try {
    await app.refreshRemoteFleet(request);
  } finally {
    if (sequence === walletRefreshSequence) walletRefreshing.value = false;
  }
}

const checkoutUnavailable = computed(() => submitting.value || walletRefreshing.value || products.value.length < 2
  || (remoteApiEnabled && products.value.some((p) => {
    const entry = purchaseEligibilityStore.state(p.id);
    return entry.status !== "ready" || !entry.eligible;
  })));
const ctaText = computed(() => (
  submitting.value || walletRefreshing.value ? "…" : checkoutUnavailable.value ? t.value.bundle.checkoutUnavailableCta : checkoutCtaText.value
));
const checkoutHint = computed(() => {
  if (products.value.length < 2) return t.value.bundle.checkoutUnavailableHint;
  if (!remoteApiEnabled) return "";
  const entries = products.value.map((p) => purchaseEligibilityStore.state(p.id));
  if (entries.some((entry) => entry.status === "error")) return t.value.store.purchaseEligibilityError;
  if (entries.some((entry) => entry.status !== "ready")) return t.value.store.purchaseEligibilityLoading;
  return entries.some((entry) => !entry.eligible) ? t.value.store.purchaseEligibilityIneligible : "";
});
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

watch(() => app.accountKey, () => {
  restoreReceiptRecovery();
  void refreshBundleWallet();
  // A direct H5 reload reaches onLoad/onShow before cookie session restore.
  // The account rebind clears the pre-auth failure back to "loading"; retry
  // these reads once the restored account owns a bearer session.
  if (remoteApiEnabled && app.accountKey !== "default") {
    void refreshProductCatalog(true);
    void refreshServerProductPhase(true);
    void refreshBundlePolicy();
  }
});

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
async function onAddSuggestion(p: Product) {
  if (remoteApiEnabled) {
    if (purchaseEligibilityStore.state(p.id).status === "ready" && !purchaseEligibilityStore.state(p.id).eligible) {
      navTo(`/pages/store/detail?id=${encodeURIComponent(p.id)}`);
      return;
    }
    const scope = captureAccountScope();
    const eligible = await purchaseEligibilityStore.ensure(p.id, true);
    if (!isCurrentAccountScope(scope)) return;
    if (!eligible) {
      if (purchaseEligibilityStore.state(p.id).status === "error") toast.warn(t.value.store.purchaseEligibilityError);
      else navTo(`/pages/store/detail?id=${encodeURIComponent(p.id)}`);
      return;
    }
  }
  if (!catalogReady.value || !isProductAvailable(p, phase.value) || cart.has(p.id)) return;
  cart.add(p.id);
  toast.success(fmt(t.value.bundle.addedToBundle, { name: nexGridBrandText(p.name) }));
}
interface PendingBundleCommands { commands: Record<string, PendingBundleCommand | string> }
const BUNDLE_COMMAND_KEY = "nexgrid-bundle-order-command-v1";
const BUNDLE_COMMAND_LEGACY_RECOVERY_REQUIRED = "BUNDLE_COMMAND_LEGACY_RECOVERY_REQUIRED";
function bundleFingerprint(list: Product[]): string {
  return list.map((item) => item.id).sort().join("|");
}
function acquireBundleCommand(list: Product[], accountKey: string, expectedAmountUsdt: number): PendingBundleCommand {
  const fingerprint = bundleFingerprint(list);
  const productNos = list.map((item) => item.id);
  const row = readAccountRow<PendingBundleCommands>(BUNDLE_COMMAND_KEY, accountKey, true);
  const existing = row?.commands?.[fingerprint];
  const restored = restoreBundleCommand(existing);
  if (restored && "recoveryKey" in restored) throw new Error(BUNDLE_COMMAND_LEGACY_RECOVERY_REQUIRED);
  if (restored) return restored.command;
  const normalizedAmount = normalizeBundleExpectedAmountUsdt(expectedAmountUsdt);
  if (normalizedAmount === null) throw new Error("BUNDLE_QUOTE_INVALID");
  // A legacy string is a prior durable command key. Reuse it for recovery, but
  // record the quote before issuing any request from this App version.
  const key = acquireAccountCommandKey(BUNDLE_COMMAND_KEY, accountKey, fingerprint, "bundle");
  const command = { key, expectedAmountUsdt: normalizedAmount, productNos };
  const commands = { ...(readAccountRow<PendingBundleCommands>(BUNDLE_COMMAND_KEY, accountKey, true)?.commands ?? {}), [fingerprint]: command };
  if (!writeAccountRow<PendingBundleCommands>(BUNDLE_COMMAND_KEY, accountKey, { commands })) {
    throw new Error("ACCOUNT_COMMAND_STORAGE_UNAVAILABLE");
  }
  const committed = readAccountRow<PendingBundleCommands>(BUNDLE_COMMAND_KEY, accountKey, true)?.commands?.[fingerprint];
  const committedCommand = restoreBundleCommand(committed);
  if (!committedCommand || "recoveryKey" in committedCommand || committedCommand.command.key !== command.key
      || committedCommand.command.expectedAmountUsdt !== command.expectedAmountUsdt
      || committedCommand.command.productNos.join("|") !== command.productNos.join("|")) {
    throw new Error("ACCOUNT_COMMAND_STORAGE_UNAVAILABLE");
  }
  return committedCommand.command;
}
function retireBundleKey(list: Product[], accountKey: string, expectedKey: string): void {
  const row = readAccountRow<PendingBundleCommands>(BUNDLE_COMMAND_KEY, accountKey);
  const commands = { ...(row?.commands ?? {}) };
  const current = commands[bundleFingerprint(list)];
  const currentKey = typeof current === "string"
    ? current
    : current && typeof current === "object" && typeof (current as PendingBundleCommand).key === "string"
      ? (current as PendingBundleCommand).key
      : undefined;
  if (currentKey !== expectedKey) return;
  delete commands[bundleFingerprint(list)];
  // persist-verdict-ok: 远端命令键耐久性归远端幂等设计(见 HANDOFF U-21)
  writeAccountRow(BUNDLE_COMMAND_KEY, accountKey, { commands });
}

async function offerBundleWalletTopup(requiredUsdt: number): Promise<void> {
  const accountScope = captureAccountScope();
  const accepted = await confirm({
    title: t.value.errors.insufficientBalanceTitle,
    message: fmt(t.value.errors.insufficientBalanceMsg, { amt: requiredUsdt.toLocaleString() }),
    confirmLabel: t.value.me.topup,
    cancelLabel: t.value.store.coCancel,
    icon: "warn",
  });
  if (accepted && isCurrentAccountScope(accountScope)) navTo("/pages/me/wallet-topup");
}

async function onCheckout() {
  const list = products.value;
  if (list.length < 2 || submitting.value || walletRefreshing.value) return;
  if (remoteApiEnabled) {
    const submissionScope = captureAccountScope();
    const accountKey = orders.currentAccountKey();
    const scopeIsCurrent = () => isCurrentAccountScope(submissionScope)
      && orders.currentAccountKey() === accountKey;
    const walletReceiptScope = app.captureRemoteAccountRequest();
    const quotedTotal = normalizeBundleExpectedAmountUsdt(total.value);
    if (quotedTotal === null) {
      toast.warn(t.value.store.coTotalQuoteChanged);
      return;
    }
    submitting.value = true;
    try {
      const decisions = await Promise.all(list.map((p) => purchaseEligibilityStore.ensure(p.id, true)));
      if (!scopeIsCurrent()) return;
      const firstBlocked = decisions.findIndex((eligible) => !eligible);
      if (firstBlocked >= 0) {
        toast.warn(purchaseEligibilityStore.state(list[firstBlocked].id).status === "error"
          ? t.value.store.purchaseEligibilityError : t.value.store.gateBlockedToast);
        return;
      }
      const latestPolicy = await bundleDiscountApi.current();
      if (!scopeIsCurrent()) return;
      if (!policy.value || latestPolicy.policyVersion !== policy.value.policyVersion) {
        policy.value = latestPolicy;
        policyStatus.value = "ready";
        toast.warn(t.value.bundle.policyChanged);
        return;
      }
      const command = acquireBundleCommand(list, accountKey, quotedTotal);
      if (app.user.usdtBalance + 0.000001 < command.expectedAmountUsdt) {
        await offerBundleWalletTopup(command.expectedAmountUsdt);
        return;
      }
      let canonicalOrderCommitted = false;
      let paymentConfirmed = false;
      let confirmedOrderNo = "";
      let createdOrderNo = "";
      try {
        const created = await bundleOrderApi.create(
          command.productNos, latestPolicy.policyVersion, command.expectedAmountUsdt, command.key);
        if (!scopeIsCurrent()) return;
        canonicalOrderCommitted = true;
        createdOrderNo = created.orderNo;
        if (!matchesBundleQuote(created, command.productNos, command.expectedAmountUsdt)) {
          throw new ApiError({ kind: "protocol", message: "BUNDLE_QUOTE_RECEIPT_MISMATCH" });
        }
        const paid = await orderApi.pay(created.orderNo, `wallet-pay:${created.orderNo}`);
        if (!scopeIsCurrent()) return;
        if (paid.orderNo !== created.orderNo
            || (paid.paymentMethod === "WALLET"
              && (paid.walletBalanceAfterUsdt === null
                || !app.adoptCommerceWallet(paid.walletBalanceAfterUsdt, walletReceiptScope)))) {
          throw new Error("BUNDLE_WALLET_PAYMENT_RECEIPT_INVALID");
        }
        paymentConfirmed = true;
        confirmedOrderNo = created.orderNo;
        retireBundleKey(list, accountKey, command.key);
        cart.clear();
        await orders.refreshRemote();
        if (!scopeIsCurrent()) return;
        const settled = orders.orders.find((order) => order.id === created.orderNo);
        if (!settled || settled.status !== "activated") {
          throw new Error("BUNDLE_WALLET_PAYMENT_READBACK_MISMATCH");
        }
        // Order + wallet receipt are already canonical. Fleet projection is
        // best effort and must never cause a second payment submission.
        void app.refreshRemoteFleet(walletReceiptScope);
        const successBody = t.value.bundle.checkoutSuccessBody;
        toast.success(t.value.bundle.checkoutSuccessTitle,
          fmt(successBody, { count: created.itemCount }));
        navTo("/pages/store/orders");
      } catch (error) {
        const policyStale = error instanceof ApiError && error.message === "BUNDLE_DISCOUNT_POLICY_STALE";
        const quoteStale = error instanceof ApiError && error.message === "BUNDLE_QUOTE_STALE";
        const idempotencyPayloadMismatch = error instanceof ApiError && error.message === "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH";
        const apiError = asApiError(error);
        if (!canonicalOrderCommitted && !idempotencyPayloadMismatch
            && (policyStale || quoteStale || !isAmbiguousOutcome(error))) {
          retireBundleKey(list, accountKey, command.key);
        }
        if (!scopeIsCurrent()) return;
        if (paymentConfirmed) {
          toast.warn(t.value.orders.walletPaymentConfirmedRefreshPending);
          if (confirmedOrderNo) navTo(`/pages/store/order-detail?id=${encodeURIComponent(confirmedOrderNo)}`);
          return;
        }
        if (policyStale || quoteStale) {
          await Promise.all([refreshBundlePolicy(), refreshProductCatalog(true)]);
          toast.warn(quoteStale ? t.value.store.coTotalQuoteChanged : t.value.bundle.policyChanged);
          return;
        }
        if (idempotencyPayloadMismatch) {
          toast.warn(t.value.bundle.checkoutOutcomeUnknown);
          navTo("/pages/store/orders");
          return;
        }
        if (apiError.message === "BUNDLE_QUOTE_RECEIPT_MISMATCH") {
          toast.warn(t.value.bundle.checkoutOutcomeUnknown);
          if (createdOrderNo) navTo(`/pages/store/order-detail?id=${encodeURIComponent(createdOrderNo)}`);
          else navTo("/pages/store/orders");
          return;
        }
        if (apiError.message === "ACCOUNT_COMMAND_STORAGE_UNAVAILABLE") {
          toast.error(t.value.errors.txNotSavedTitle, t.value.errors.txNotSavedMsg);
        } else if (apiError.message === "ORDER_WALLET_INSUFFICIENT") {
          await offerBundleWalletTopup(quotedTotal);
        } else if (["ORDER_MONTHLY_QUOTA_PAUSED", "ORDER_MONTHLY_QUOTA_EXHAUSTED"].includes(apiError.message)) {
          toast.warn(t.value.quota.stockUnavailable);
        } else {
          toast.warn(isAmbiguousOutcome(error)
            ? t.value.bundle.checkoutOutcomeUnknown
            : t.value.tradein.errPurchaseFailed);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === BUNDLE_COMMAND_LEGACY_RECOVERY_REQUIRED) {
        toast.warn(t.value.bundle.checkoutOutcomeUnknown);
        navTo("/pages/store/orders");
        return;
      }
      policyStatus.value = "error";
      toast.warn(t.value.store.catalogErrorBody);
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
const catalogStateStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  padding: "18px 16px",
  borderRadius: "var(--nx-glass-radius)",
  background: "var(--nx-glass-fill)",
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
const receiptFailureCardStyle: CSSProperties = { borderRadius: "var(--nx-glass-radius)", boxShadow: "var(--nx-glass-edge)",
  padding: "24px 20px",
  background: "var(--nx-glass-fill)",
};
const heroStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  padding: "18px",
  borderRadius: "var(--nx-glass-radius)",
  background: "var(--nx-glass-fill)",
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
const cardStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  borderRadius: "var(--nx-glass-radius)",
  background: "var(--nx-glass-fill)",
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
