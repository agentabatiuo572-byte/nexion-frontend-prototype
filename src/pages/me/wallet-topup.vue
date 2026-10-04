<!--
  WalletTopup — 充值页(PAY-规格 [FEAT-PAY01] ⑤ 信息架构,参照 pay-vn-rails.html)。
  正式模式提供 USDT-BEP20 与银行转账两个入口；本地非正式模式仍可展示旧卡片原型。

  Wrapped in <AppChassis active="me">. Header is the shared sticky <SubPageHeader>
  (back=/pages/me/wallet).
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/wallet" :title="t.wallet.addFunds" :subtitle="t.wallet.topUp" />

      <GlassSegments :label="t.wallet.chooseMethod" v-model="seg" :options="segmentOptions" style="margin: 0 16px 16px"  />

      <DepositUsdtPane v-if="seg === 'crypto'" />
      <DepositBankPane v-else-if="seg === 'bank'" />
      <TopupCardForm v-else @change-channel="seg = 'crypto'" />
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, nextTick, type CSSProperties, computed } from "vue";
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
    fontSize: "13px",
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
