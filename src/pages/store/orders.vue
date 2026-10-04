<!--
  Orders list — ported from Nexion-prototype/app/(main)/store/orders/page.tsx.
  Order list from the orders store: empty state (browse-store CTA) or a list of
  status-badged cards, each navigating to order-detail (?id=). Wrapped in
  <AppChassis active="store">; back + "Orders" title live in the sticky
  chassis nav header via useSetPageHeader (title-only — no subtitle: the
  platform is IDC-hosted colocation, nothing is physically shipped to the
  user, so a "track your shipment" line doesn't apply — see 更新日志 2026-07-08).
-->
<template>
  <AppChassis active="store">
    <!-- Chassis-nav pages (useSetPageHeader) don't get sub-page-header.vue's global
         24px .spv gap, so the nav→content breathing is supplied here once. -->
    <view style="color: var(--v5-ink); padding-top: 24px">
      <view v-if="orderPanels.mainPresentation === 'loading'" class="mx-4 rounded-2xl" :style="remoteErrorStyle">
        <text :style="{ color: 'var(--v5-ink-3)', fontSize: '12px', lineHeight: '1.5' }">{{ t.store.catalogLoadingTitle }}</text>
      </view>

      <view v-if="orderPanels.showSourceOutage" class="mx-4 rounded-2xl" :style="remoteErrorStyle">
        <view v-for="source in unavailableOrderSources" :key="source.label" class="flex items-center justify-between" style="gap: 12px">
          <text :style="{ color: 'var(--v5-warning)', fontSize: '12px', lineHeight: '1.5' }">{{ source.label }} · {{ source.message }}</text>
          <view class="shrink-0 active:opacity-70" :style="retryBtnStyle" :aria-disabled="remoteOrdersRefreshing ? 'true' : 'false'" role="button" tabindex="0" @click.stop="requestOrdersRefresh" @keydown.enter.prevent="requestOrdersRefresh" @keydown.space.prevent="requestOrdersRefresh">
            <text>{{ t.store.catalogRetry }}</text>
          </view>
        </view>
      </view>

      <!-- An empty claim requires every order source to have loaded successfully. -->
      <EmptyState v-if="orderPanels.mainPresentation === 'empty'" kind="empty-list" :title="t.empty.ordersTitle" :desc="t.empty.ordersDesc" :cta-label="t.empty.ordersCta" @cta="goStore" />

      <!-- Order list — transparent hairline group (row cards flattened; the
           container border-top opens the group, each row keeps a divider). -->
      <view v-if="orderPanels.mainPresentation === 'list'" class="mx-4" style="padding: 0 2px; border-top: 1px solid var(--v5-border)">
        <view
          v-for="(o, i) in orderList"
          :key="o.id"
          class="block active:opacity-90"
          :style="orderRowStyle(i === orderList.length - 1)"
          role="button"
          tabindex="0"
          :aria-label="`${nexGridBrandText(o.productName)} ${o.id}`"
          @click.stop="goOrder(o)"
        >
          <view class="flex items-start" style="gap: 12px">
            <view class="grid place-items-center shrink-0" :style="iconBoxStyle(o.status)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" :stroke="badge(o.status).color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(d, di) in badge(o.status).icon" :key="di" :d="d" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <view class="flex items-center justify-between" style="gap: 8px">
                <text class="truncate" style="font-size: 13px; font-weight: 600; color: color-mix(in srgb, var(--v5-ink) 95%, transparent)">{{ nexGridBrandText(o.productName) }}</text>
                <text class="shrink-0" :style="statusChipStyle(o.status)">{{ badge(o.status).label }}</text>
              </view>
              <text class="block truncate" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px">{{ t.orders.orderId }} <text class="font-mono">{{ o.id }}</text></text>
              <text v-if="o.meta" class="block truncate" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 3px">{{ o.meta }}</text>
              <view class="flex items-center justify-between" style="margin-top: 6px">
                <text style="font-size: 12px; color: var(--v5-ink-4)">{{ dateText(o.placedAt) }}</text>
                <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 13px; font-weight: 600; color: var(--v5-ink)">${{ o.total.toLocaleString() }}</text>
              </view>
            </view>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="margin-top: 8px"><path d="m9 18 6-6-6-6" /></svg>
          </view>
        </view>
        <view
          v-if="remoteApiEnabled && orders.nextCursor"
          class="grid place-items-center active:opacity-80"
          :style="loadMoreBtnStyle"
          role="button"
          tabindex="0"
          :aria-disabled="orders.loadingMore ? 'true' : 'false'"
          @click.stop="loadMoreOrders"
          @keydown.enter.prevent.stop="loadMoreOrders"
          @keydown.space.prevent.stop="loadMoreOrders"
        >
          <text>{{ t.orders.loadMore }}{{ orders.loadingMore ? '…' : '' }}</text>
        </view>
        <view v-if="remoteApiEnabled && genesis.orderPage.cursor" class="active:opacity-70" :style="loadMoreBtnStyle" role="button" tabindex="0" :aria-disabled="genesis.orderPage.busy ? 'true' : 'false'" :aria-busy="genesis.orderPage.busy ? 'true' : 'false'" @click="!genesis.orderPage.busy && genesis.loadMoreGenesisOrders()">
          <text>{{ genesis.orderPage.error ? t.orders.retry : t.orders.loadMore }} · {{ t.me.genesisNode }}</text>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import { useT } from "@/i18n/use-t";
import { formatTrialDate } from "@/lib/trial-date";
import { nexGridBrandText } from "@/lib/brand-copy";
import { useOrders, type Order, type OrderStatus } from "@/store/orders";
import { useGenesis } from "@/store/genesis";
import { genesisOrderListItems, type GenesisOrderListItem } from "@/lib/genesis-order-list";
import { useSetPageHeader } from "@/composables/use-page-header";
import { navTo, takeNavigationQuery } from "@/lib/route";
import { onHide, onLoad, onShow } from "@dcloudio/uni-app";
import { remoteApiEnabled, sessionVault } from "@/api/runtime";
import { useApp } from "@/store/app";
import { useAuth } from "@/store/auth";
import { binarySessionReady } from "@/lib/binary-session-ready";
import {
  createRemoteOrdersRefresh,
  isInitialOrderReadLoading,
  orderListPanels,
  remoteCommerceRequestCurrent,
  type OrderSourceAvailability,
} from "@/lib/remote-commerce-refresh";

const t = useT();
const app = useApp();
const auth = useAuth();
const orders = useOrders();
const genesis = useGenesis();
// Cold H5 loads restore the bearer through the refresh cookie. A protected
// order read started before that returns AUTH_REQUIRED, which is what left the
// commerce and genesis panels on "暂时无法确认账号状态" until a reload.
const remoteSessionReady = computed(() => binarySessionReady({
  remote: remoteApiEnabled,
  authenticated: auth.isAuthenticated,
  accountId: auth.accountId,
  appAccountKey: app.accountKey,
  sessionUserId: sessionVault.read()?.user.userId ?? null,
}));
type CommerceOrderListItem = Order & { kind: "commerce"; meta?: string };
type OrderListItem = CommerceOrderListItem | GenesisOrderListItem;
const orderList = computed<OrderListItem[]>(() => [
  ...orders.orders.map((order): CommerceOrderListItem => ({ ...order, kind: "commerce" })),
  ...genesisOrderListItems(genesis.remoteOrders, t.value.me.genesisNode, t.value.orders.quantity),
].sort((a, b) => b.placedAt - a.placedAt));
const remoteOrderAvailability = ref<OrderSourceAvailability>("ready");
const remoteOrdersRefreshing = ref(remoteApiEnabled);
const remoteOrdersResolved = ref(false);
const commerceOrdersUnavailable = ref(false);
const genesisOrdersUnavailable = ref(false);
const unavailableOrderSources = computed(() => [
  ...(commerceOrdersUnavailable.value ? [{ label: t.value.headerTitles.storeOrders, message: t.value.orders.refreshFailed }] : []),
  // Order history and Genesis eligibility are separate reads. An order-source
  // failure must not display the series opening status on the orders page.
  ...(genesisOrdersUnavailable.value ? [{
    label: t.value.me.genesisNode,
    message: t.value.orders.refreshFailed,
  }] : []),
]);
const orderPanels = computed(() => orderListPanels({
  loading: isInitialOrderReadLoading({
    loading: remoteOrdersRefreshing.value,
    hasResolved: remoteOrdersResolved.value,
  }),
  availability: remoteOrderAvailability.value,
  orderCount: orderList.value.length,
}));
let refreshEpoch = 0;
let ordersPageActive = true;
async function refreshOrders() {
  if (!remoteApiEnabled || !remoteSessionReady.value) return;
  const request = { accountKey: app.accountKey, epoch: app.accountBindingEpoch };
  const currentRefresh = ++refreshEpoch;
  const current = () => ordersPageActive && currentRefresh === refreshEpoch && remoteCommerceRequestCurrent(request, {
    accountKey: app.accountKey,
    epoch: app.accountBindingEpoch,
  });
  remoteOrdersRefreshing.value = true;
  // During a retry, leave the prior per-source failure and its retry control
  // visible. Reset only for a genuinely new first read (including account
  // rebind), where an empty list would otherwise be misleading.
  if (!remoteOrdersResolved.value) {
    remoteOrderAvailability.value = "ready";
    commerceOrdersUnavailable.value = false;
    genesisOrdersUnavailable.value = false;
  }
  const outcome = await createRemoteOrdersRefresh({
    commerce: () => orders.refreshRemote(),
    genesis: () => genesis.syncRemote(),
    // BUG 174: Genesis 订单行来自**账号投影** (GET /api/genesis/account),
    // 不是资格判定。资格不可用(Genesis 未开放)时账号投影照常可读,
    // 订单源必须判「已读」;只有账号投影真的读失败才算这一源不可用 ——
    // 这样重试成功后错误能真正消失,而不是被资格状态永久钉住。
    genesisAccountUnavailable: () => genesis.remoteAccountReadState !== "ready",
    isCurrent: current,
  })();
  if (outcome.availability === "stale") return;
  commerceOrdersUnavailable.value = outcome.commerceUnavailable;
  genesisOrdersUnavailable.value = outcome.genesisUnavailable;
  remoteOrderAvailability.value = outcome.availability;
  remoteOrdersResolved.value = true;
  remoteOrdersRefreshing.value = false;
}
function requestOrdersRefresh() {
  if (remoteOrdersRefreshing.value) return;
  void refreshOrders();
}
async function loadMoreOrders() {
  if (orders.loadingMore || !orders.nextCursor) return;
  const request = { accountKey: app.accountKey, epoch: app.accountBindingEpoch };
  const requestedRefresh = refreshEpoch;
  try {
    await orders.loadMoreRemote();
  } catch {
    if (!ordersPageActive || requestedRefresh !== refreshEpoch || !remoteCommerceRequestCurrent(request, {
      accountKey: app.accountKey,
      epoch: app.accountBindingEpoch,
    })) return;
    commerceOrdersUnavailable.value = true;
    remoteOrderAvailability.value = "partial";
  }
}
onShow(() => {
  ordersPageActive = true;
  preserveOrdersOriginInH5();
  void refreshOrders();
});
onHide(() => {
  ordersPageActive = false;
  refreshEpoch += 1;
  remoteOrdersRefreshing.value = false;
});
onUnmounted(() => {
  ordersPageActive = false;
  refreshEpoch += 1;
});
watch(() => app.accountBindingEpoch, () => {
  remoteOrdersResolved.value = false;
  if (ordersPageActive) void refreshOrders();
});
// onShow can land before the cookie restore binds the account. The deferred
// read starts here instead, so the page never settles on an account-state error.
watch(remoteSessionReady, (ready, wasReady) => {
  if (ready && !wasReady && ordersPageActive) void refreshOrders();
});

const ordersBackHref = ref("/store");
onLoad((options) => {
  const query = new URLSearchParams(takeNavigationQuery("/pages/store/orders"));
  const from = options?.from === "me" || options?.from === "store" ? options.from : query.get("from");
  ordersBackHref.value = from === "me" ? "/me" : "/store";
  preserveOrdersOriginInH5();
});

function preserveOrdersOriginInH5() {
  // Uni H5 can drop navigateTo's query from the visible hash. Keep the source
  // in this history entry so a refresh retains the correct cold-open fallback.
  if (typeof window !== "undefined") {
    try {
      const hash = window.location.hash;
      if (!/^#\/pages\/store\/orders(?:\?|$)/.test(hash)) return;
      const question = hash.indexOf("?");
      const query = new URLSearchParams(question < 0 ? "" : hash.slice(question + 1));
      const from = ordersBackHref.value === "/me" ? "me" : "store";
      if (query.get("from") === from || (from === "store" && !query.has("from"))) return;
      query.set("from", from);
      const path = question < 0 ? hash : hash.slice(0, question);
      window.history.replaceState(window.history.state, "", `${window.location.href.slice(0, -hash.length)}${path}?${query}`);
    } catch { /* Native runtimes have no browser history. */ }
  }
}

// Sticky chassis nav header — back + "Orders" title, no subtitle (IDC-hosted
// colocation, nothing ships to the user, so the old "track your hardware
// shipments" subtitle was retired — deliberate product decision, see
// docs/前端产品更新日志.md 2026-07-08).
useSetPageHeader(() => ({
  title: t.value.headerTitles.storeOrders,
  backHref: ordersBackHref.value,
}));

// lucide outline paths per status (Clock / CheckCircle2 / Server / Cpu / XCircle)
interface Badge {
  label: string;
  color: string;
  bg: string;
  icon: string[];
}
function badge(status: OrderStatus): Badge {
  switch (status) {
    case "placed":
      return { label: t.value.orders.statusPlaced, color: "var(--v5-ink-3)", bg: "var(--v5-surface-2)", icon: ["M12 6v6l4 2", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"] };
    case "paid":
      return { label: t.value.orders.statusPaid, color: "var(--v5-brand)", bg: "color-mix(in srgb, var(--v5-brand) 15%, transparent)", icon: ["M22 11.08V12a10 10 0 1 1-5.93-9.14", "m9 11 3 3L22 4"] };
    case "provisioning":
      return { label: t.value.orders.statusProvisioning, color: "var(--v5-warning)", bg: "color-mix(in srgb, var(--v5-warning) 15%, transparent)", icon: ["M5 2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z", "M5 14h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z", "M6 6h.01", "M6 18h.01"] };
    case "activated":
      return { label: t.value.orders.statusActivated, color: "var(--v5-brand)", bg: "color-mix(in srgb, var(--v5-brand) 15%, transparent)", icon: ["M12 20v2", "M12 2v2", "M17 20v2", "M17 2v2", "M2 12h2", "M2 17h2", "M2 7h2", "M20 12h2", "M20 17h2", "M20 7h2", "M7 20v2", "M7 2v2", "M4 8h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z", "M8 12h8"] };
    case "cancelled":
      return { label: t.value.orders.cancelStatus, color: "var(--v5-brand-2)", bg: "color-mix(in srgb, var(--v5-brand-2) 15%, transparent)", icon: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "m15 9-6 6", "m9 9 6 6"] };
    case "payment_failed":
    case "provisioning_failed":
      return { label: t.value.orders.statusFailedShort, color: "var(--v5-danger)", bg: "color-mix(in srgb, var(--v5-danger) 15%, transparent)", icon: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "m15 9-6 6", "m9 9 6 6"] };
    case "expired":
      return { label: t.value.orders.statusExpired, color: "var(--v5-warning)", bg: "color-mix(in srgb, var(--v5-warning) 15%, transparent)", icon: ["M12 6v6l4 2", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"] };
    case "refunded":
      return { label: t.value.orders.statusRefunded, color: "var(--v5-brand)", bg: "color-mix(in srgb, var(--v5-brand) 15%, transparent)", icon: ["M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4"] };
    case "chargeback":
      return { label: t.value.orders.statusChargeback, color: "var(--v5-danger)", bg: "color-mix(in srgb, var(--v5-danger) 15%, transparent)", icon: ["M12 2v12m0 4v4m-7-5 3 3m11-3-3 3"] };
  }
}

function dateText(ts: number): string {
  return Number.isFinite(ts) && Number.isFinite(new Date(ts).getTime())
    ? formatTrialDate(ts)
    : "—";
}

function goStore() {
  navTo("/store");
}
function goOrder(order: OrderListItem) {
  navTo(order.kind === "genesis" ? "/pages/genesis/holder" : `/pages/store/order-detail?id=${order.id}`);
}

const remoteErrorStyle: CSSProperties = {
  marginBottom: "12px",
  padding: "10px 12px",
  background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)",
};
const retryBtnStyle: CSSProperties = {
  minHeight: "32px",
  padding: "0 10px",
  borderRadius: "999px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink)",
  fontSize: "12px",
};
const loadMoreBtnStyle: CSSProperties = {
  minHeight: "44px",
  marginTop: "8px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
  color: "var(--v5-ink-2)",
  fontSize: "13px",
  fontWeight: 600,
};

// ─── styles ───
// Empty state — dashed outline on the page floor, no fill (whitelist idiom).
const emptyCardStyle: CSSProperties = {
  border: "1px dashed var(--v5-border-strong)",
  padding: "32px",
};
const browseBtnStyle: CSSProperties = {
  marginTop: "16px",
  height: "48px",
  padding: "0 20px",
  borderRadius: "999px",
  background: "var(--v5-brand)",
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontSize: "13px",
  fontWeight: 600,
};
function orderRowStyle(isLast: boolean): CSSProperties {
  return {
    padding: "14px 0",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
function iconBoxStyle(status: OrderStatus): CSSProperties {
  return {
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    background: badge(status).bg,
  };
}
function statusChipStyle(status: OrderStatus): CSSProperties {
  const b = badge(status);
  return {
    fontSize: "12px",
    padding: "2px 6px",
    borderRadius: "4px",
    background: b.bg,
    color: b.color,
  };
}
</script>
