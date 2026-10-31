<!--
  WalletTopup — 充值页(PAY-规格 [FEAT-PAY01] ⑤ 信息架构,参照 pay-vn-rails.html)。
  正式模式提供 USDT-BEP20 与银行转账两个入口；本地非正式模式仍可展示旧卡片原型。

  Wrapped in <AppChassis active="me">. Header is the shared sticky <SubPageHeader>
  (back=/pages/me/wallet).
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/me" :title="t.wallet.addFunds" :subtitle="t.wallet.topUp" />

      <!-- Topping up for an unpaid order: what is missing, when the order closes, and the way back once funds arrive. -->
      <view v-if="orderTopup" class="topup-order" :class="{ 'is-done': orderTopupLeft <= 0 }" role="status">
        <view class="topup-order__t"><view class="topup-order__dot" aria-hidden="true" /><text>{{ orderTopupLeft > 0 ? payCopy.topupFor : payCopy.topupDone }}</text></view>
        <text v-if="orderTopupLeft > 0 && balanceKnown" class="topup-order__d">{{ fillCopy(payCopy.topupNeed, { name: orderTopup.name }) }}<text class="topup-order__b">{{ formatGroupedAmount(orderTopupLeft) }} USDT</text>{{ payCopy.topupNeedTail }}</text>
        <text v-else-if="orderTopupLeft <= 0" class="topup-order__d">{{ fillCopy(payCopy.topupEnough, { amt: formatGroupedAmount(app.user.usdtBalance) }) }}</text>
        <view v-if="orderTopupLeft > 0 && orderCloseLeft !== null" class="topup-order__cd">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          <text>{{ fillCopy(payCopy.topupCloses, { t: orderCloseLeft }) }}</text>
        </view>
      </view>

      <GlassSegments :label="t.wallet.chooseMethod" v-model="seg" :options="segmentOptions" style="margin: 0 16px 16px"  />

      <DepositUsdtPane v-if="seg === 'crypto'" />
      <DepositBankPane v-else-if="seg === 'bank'" />
      <TopupCardForm v-else @change-channel="seg = 'crypto'" />
      <view v-if="orderFunded" style="height: 120px" />
    </view>
    <!-- Once the order is covered, the way back is the page's main action, in the thumb zone (DS-30). -->
    <template #pageFixed>
      <view v-if="orderFunded" class="topup-sticky"><NxButton class="topup-sticky__btn" variant="primary" :label="payCopy.backToPay" @click="backToOrder" /></view>
    </template>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, nextTick, type CSSProperties, computed } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { takeNavigationQuery, navTo } from "@/lib/route";
import NxButton from "@/components/ui/nx-button.vue";
import { useApp } from "@/store/app";
import { useLocaleStore } from "@/store/locale";
import { useVisibleInterval } from "@/composables/use-tab-page-lifecycle";
import { purchasePaymentCopy, fillCopy } from "@/lib/purchase-payment-copy";
import { formatGroupedAmount } from "@/lib/amount-display";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import TopupCardForm from "@/components/me/topup-card-form.vue";
import DepositUsdtPane from "@/components/me/deposit-usdt-pane.vue";
import DepositBankPane from "@/components/me/deposit-bank-pane.vue";
import { useT } from "@/i18n/use-t";
import { remoteApiEnabled } from "@/api/runtime";
import { useDeposits } from "@/store/deposits";

// ── 通道 segmented(USDT 链上 / 银行转账 / 银行卡)──
type Seg = "crypto" | "bank" | "card";
const SEGMENTS: { id: Seg }[] = [{ id: "crypto" }, { id: "bank" }, { id: "card" }];
const segments = remoteApiEnabled ? SEGMENTS.filter((item) => item.id !== "card") : SEGMENTS;
const seg = ref<Seg>(remoteApiEnabled ? "bank" : "crypto");
onLoad((query) => {
  const pending = new URLSearchParams(takeNavigationQuery('/pages/me/wallet-topup'));
  const channel = query?.channel ?? pending.get('channel');
  const allowed = segments.find(item => item.id === channel);
  if (allowed) seg.value = allowed.id;
  const orderNo = query?.orderNo ?? pending.get('orderNo'), amount = Number(query?.amount ?? pending.get('amount')), deadline = Number(query?.deadline ?? pending.get('deadline'));
  if (orderNo && Number.isFinite(amount) && amount > 0) orderTopup.value = { orderNo, amount, name: query?.name ?? pending.get('name') ?? '', deadlineAt: Number.isFinite(deadline) && deadline > 0 ? deadline : null };
});
const app = useApp();
const payCopy = computed(() => purchasePaymentCopy(locale.code));
const orderTopup = ref<{ orderNo: string; amount: number; name: string; deadlineAt: number | null } | null>(null);
const topupNow = ref(Date.now());
useVisibleInterval(() => { if (orderTopup.value) topupNow.value = Date.now(); }, 1000);
// Until the wallet snapshot arrives the shortfall is unknown, so the banner shows only the order and its deadline.
const balanceKnown = computed(() => Number.isFinite(app.user.usdtBalance) && app.user.usdtBalance >= 0 && app.remoteFleetHasSnapshot);
const orderTopupLeft = computed(() => !orderTopup.value ? 0 : balanceKnown.value ? Math.max(0, orderTopup.value.amount - app.user.usdtBalance) : orderTopup.value.amount);
const orderCloseLeft = computed(() => {
  const left = orderTopup.value?.deadlineAt ? Math.max(0, Math.ceil((orderTopup.value.deadlineAt - topupNow.value) / 1000)) : null;
  return left === null ? null : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
});
const orderFunded = computed(() => !!orderTopup.value && balanceKnown.value && orderTopupLeft.value <= 0);
function backToOrder() { if (orderTopup.value) void navTo(`/pages/store/order-detail?id=${encodeURIComponent(orderTopup.value.orderNo)}&pay=1`); }
function segLabel(id: Seg): string {
  const tc = t.value.topupChrome;
  if (id === "crypto") return tc.segUsdt;
  if (id === "bank") return t.value.bankPane.segBank;
  return tc.segCard;
}
/**
 * 通道 tablist 的左右方向键:移一格并选上,焦点跟到新选中项(roving tabindex 的标准行为)。
 *
 * 这里比别处多一道必要判断:通道切换会**卸载/挂载不同的 pane 组件**(USDT/银行/银行卡
 * 三段是 v-if/v-else-if/v-else),所以方向键移过去之后原焦点节点可能已被移除。
 * 若不在下一帧重新聚焦新选中的 tab,焦点会掉到 body,键盘用户被踢回页面开头 ——
 * 这恰恰是「方向键动了但焦点没动」那类复验失败的成因,必须在 nextTick 之后聚焦。
 */
function moveSeg(index: number, delta: number): void {
  const next = segments[(index + delta + segments.length) % segments.length];
  if (!next || next.id === seg.value) return;
  seg.value = next.id;
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>('.nx-topup-seg[tabindex="0"]')?.focus();
  });
}

const t = useT();
const locale = useLocaleStore();
const dep = useDeposits();

// ── styles ──
// Segmented pill tabs — wallet-bills / SegmentedControl idiom.
const segWrapStyle: CSSProperties = {
  margin: "0 16px 16px",
  // 轨道贴页面底:surface-2 与页面底同色不可辨(亮色 ΔE 2.2),改 L1 surface;选中 pill 是 brand 实底,不撞色
  background: "var(--v5-surface)",
  borderRadius: "16px",
  padding: "4px",
  gap: "2px",
};
function segPillStyle(id: Seg): CSSProperties {
  return {
    height: "44px",
    borderRadius: "10px",
    background: seg.value === id ? "var(--v5-brand)" : "transparent",
    // 收款账户池无可用账户 → 银行转账 chip 置灰([FEAT-PAY02] ⑤;可点进,pane 给维护说明)
    opacity: id === "bank" && !dep.bankRailAvailable ? 0.45 : 1,
  };
}
function segLabelStyle(id: Seg): CSSProperties {
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "var(--ui-type-list-subtitle)",
    fontWeight: seg.value === id ? 600 : 500,
    color: seg.value === id ? "var(--v5-on-brand)" : "var(--v5-ink-3)",
  };
}

import GlassSegments from "@/components/glass-segments.vue";
const segmentOptions = computed(() => segments.map(({ id }) => ({
  value: id, label: segLabel(id), className: `nx-topup-seg-${id}`,
  dimmed: id === "bank" && !dep.bankRailAvailable,
})));
</script>
<style scoped>
.topup-order { margin: 0 16px 16px; padding: var(--v5-space-4); border-radius: var(--ui-radius-surface); background: radial-gradient(240px 160px at 100% 0%, color-mix(in srgb, var(--v5-warning) 9%, transparent), transparent 72%), var(--v5-surface); }
.topup-order.is-done { background: radial-gradient(240px 160px at 100% 0%, color-mix(in srgb, var(--v5-brand) 9%, transparent), transparent 72%), var(--v5-surface); }
.topup-order__t { display: flex; align-items: center; gap: var(--v5-space-2); font: 500 var(--ui-type-list-title)/var(--ui-type-list-title-lh) var(--font-v5); color: var(--v5-ink); }
.topup-order__dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--v5-warning); }
.topup-order.is-done .topup-order__dot { background: var(--v5-brand); }
.topup-order__d { display: block; margin-top: 6px; color: var(--v5-ink-3); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.topup-order__b { font-weight: 500; color: var(--v5-ink); }
.topup-order__cd { display: flex; align-items: center; gap: 6px; margin-top: var(--v5-space-2); color: var(--v5-warning); font: var(--ui-type-description-weight) var(--ui-type-description)/var(--ui-type-description-lh) var(--font-v5); }
.topup-sticky { position: absolute; left: 0; right: 0; bottom: 0; z-index: 36; display: flex; padding: var(--v5-space-3) var(--v5-space-4) calc(30px + env(safe-area-inset-bottom)); background: linear-gradient(180deg, color-mix(in srgb, var(--ui-ticket-top) 70%, transparent), color-mix(in srgb, var(--ui-ticket-bottom) 94%, transparent)); border-top: 1px solid color-mix(in srgb, var(--v5-ink) 5%, transparent); backdrop-filter: blur(18px) saturate(160%); -webkit-backdrop-filter: blur(18px) saturate(160%); }
.topup-sticky__btn { display: flex; flex: 1; }
</style>
