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
      <view v-if="remoteOrdersError" class="mx-4 rounded-2xl" :style="remoteErrorStyle">
        <view class="flex items-center justify-between" style="gap: 12px">
          <text :style="{ color: 'var(--v5-warning)', fontSize: '12px', lineHeight: '1.5' }">{{ t.authOtp.errorServiceUnavailable }}</text>
          <view class="shrink-0 active:opacity-70" :style="retryBtnStyle" :aria-disabled="remoteOrdersRefreshing ? 'true' : 'false'" role="button" tabindex="0" @click="refreshOrders">
            <text>{{ t.store.catalogRetry }}</text>
          </view>
        </view>
      </view>

      <!-- Empty state -->
      <EmptyState v-if="!remoteOrdersError && orderList.length === 0" kind="empty-list" :title="t.empty.ordersTitle" :desc="t.empty.ordersDesc" :cta-label="t.empty.ordersCta" @cta="goStore" />

      <!-- Order list — transparent hairline group (row cards flattened; the
           container border-top opens the group, each row keeps a divider). -->
      <view v-else-if="!remoteOrdersError" class="mx-4" style="padding: 0 2px; border-top: 1px solid var(--v5-border)">
        <view
          v-for="(o, i) in orderList"
          :key="o.id"
          class="block active:opacity-90"
          :style="orderRowStyle(i === orderList.length - 1)"
          role="button"
          tabindex="0"
          :aria-label="`${o.productName} ${o.id}`"
          @click.stop="goDetail(o.id)"
        >
          <view class="flex items-start" style="gap: 12px">
            <view class="grid place-items-center shrink-0" :style="iconBoxStyle(o.status)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" :stroke="badge(o.status).color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(d, di) in badge(o.status).icon" :key="di" :d="d" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <view class="flex items-center justify-between" style="gap: 8px">
                <text class="truncate" style="font-size: 13px; font-weight: 600; color: color-mix(in srgb, var(--v5-ink) 95%, transparent)">{{ o.productName }}</text>
                <text class="shrink-0" :style="statusChipStyle(o.status)">{{ badge(o.status).label }}</text>
              </view>
              <text class="block truncate" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px">{{ t.orders.orderId }} <text class="font-mono">{{ o.id }}</text></text>
              <view class="flex items-center justify-between" style="margin-top: 6px">
                <text style="font-size: 12px; color: var(--v5-ink-4)">{{ dateText(o.placedAt) }}</text>
                <text class="tabular-nums" style="font-family: var(--font-v5); font-size: 13px; font-weight: 600; color: var(--v5-ink)">${{ o.total.toLocaleString() }}</text>
              </view>
            </view>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" style="margin-top: 8px"><path d="m9 18 6-6-6-6" /></svg>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale } from "@/i18n/format";
import { useOrders, type OrderStatus } from "@/store/orders";
import { useSetPageHeader } from "@/composables/use-page-header";
import { navTo } from "@/lib/route";
import { onShow } from "@dcloudio/uni-app";
import { remoteApiEnabled } from "@/api/runtime";

const t = useT();
const orders = useOrders();
const orderList = computed(() => orders.orders);
const remoteOrdersError = ref(false);
const remoteOrdersRefreshing = ref(false);
async function refreshOrders() {
  if (!remoteApiEnabled || remoteOrdersRefreshing.value) return;
  remoteOrdersRefreshing.value = true;
  remoteOrdersError.value = false;
  try {
    await orders.refreshRemote();
  } catch {
    remoteOrdersError.value = true;
  } finally {
    remoteOrdersRefreshing.value = false;
  }
}
onShow(() => { void refreshOrders(); });

// Sticky chassis nav header — back + "Orders" title, no subtitle (IDC-hosted
// colocation, nothing ships to the user, so the old "track your hardware
// shipments" subtitle was retired — deliberate product decision, see
// docs/前端产品更新日志.md 2026-07-08).
useSetPageHeader(() => ({
  title: t.value.headerTitles.storeOrders,
  backHref: "/store",
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
  return new Date(ts).toLocaleDateString(dateLocale());
}

function goStore() {
  navTo("/store");
}
function goDetail(id: string) {
  navTo(`/pages/store/order-detail?id=${id}`);
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
