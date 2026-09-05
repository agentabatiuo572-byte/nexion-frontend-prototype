<!--
  WalletTopup — 充值页(PAY-规格 [FEAT-PAY01] ⑤ 信息架构,参照 pay-vn-rails.html)。
  顶部 segmented 通道切换 —「USDT 链上」= <DepositUsdtPane>(三网络 chip + 专属地址
  QR + 最近入金);「银行转账」= <DepositBankPane>(VietQR 意向单流,[FEAT-PAY02]);
  「银行卡」= <TopupCardForm> 原样接入。

  Wrapped in <AppChassis active="me">. Header is the shared sticky <SubPageHeader>
  (back=/pages/me/wallet).
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/me/wallet" :title="t.wallet.addFunds" :subtitle="t.wallet.topUp" />
      <FundsSandboxBadge />

      <!-- Remote production: only VietQR has a real server authority. Explicit
           Sandbox exposes the isolated simulated chain/bank/card rails below. -->
      <DepositBankPane v-if="remoteApiEnabled && !mockFundsEnabled" />

      <!-- 通道 segmented(A4 在 SEGMENTS 中段插「银行转账」+ pane 分支) -->
      <view v-else class="flex" :style="segWrapStyle">
        <view
          v-for="s in SEGMENTS"
          :key="s.id"
          :class="['flex-1 grid place-items-center active:opacity-70', `nx-topup-seg-${s.id}`]"
          :style="segPillStyle(s.id)"
          role="tab" tabindex="0"
          :aria-selected="seg === s.id"
          @click="seg = s.id"
        >
          <text :style="segLabelStyle(s.id)">{{ segLabel(s.id) }}</text>
        </view>
      </view>

      <template v-if="!remoteApiEnabled || mockFundsEnabled">
        <!-- USDT 链上通道段 -->
        <DepositUsdtPane v-if="seg === 'crypto'" />

        <!-- 银行转账段(VietQR,[FEAT-PAY02]) -->
        <DepositBankPane v-else-if="seg === 'bank'" />

        <!-- 银行卡段 — 现有卡表单原样接入(Change → 回 USDT 段) -->
        <TopupCardForm v-else @change-channel="seg = 'crypto'" />
      </template>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import FundsSandboxBadge from "@/components/me/funds-sandbox-badge.vue";
import TopupCardForm from "@/components/me/topup-card-form.vue";
import DepositUsdtPane from "@/components/me/deposit-usdt-pane.vue";
import DepositBankPane from "@/components/me/deposit-bank-pane.vue";
import { useT } from "@/i18n/use-t";
import { mockFundsEnabled, remoteApiEnabled } from "@/api/runtime";
import { useDeposits } from "@/store/deposits";

// ── 通道 segmented(USDT 链上 / 银行转账 / 银行卡)──
type Seg = "crypto" | "bank" | "card";
const SEGMENTS: { id: Seg }[] = [{ id: "crypto" }, { id: "bank" }, { id: "card" }];
const seg = ref<Seg>(remoteApiEnabled && !mockFundsEnabled ? "bank" : "crypto");
function segLabel(id: Seg): string {
  const tc = t.value.topupChrome;
  if (id === "crypto") return tc.segUsdt;
  if (id === "bank") return t.value.bankPane.segBank;
  return tc.segCard;
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
</script>
