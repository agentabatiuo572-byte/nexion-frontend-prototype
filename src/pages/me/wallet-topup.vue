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
      <GlassSegments v-else v-model="seg" :options="segmentOptions" style="margin: 0 16px 16px" />

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
import { ref, computed } from "vue";
import GlassSegments from "@/components/glass-segments.vue";
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

// Unavailable bank rails stay selectable so the existing pane explains maintenance.
const segmentOptions = computed(() => SEGMENTS.map(({ id }) => ({
  value: id, label: segLabel(id), className: `nx-topup-seg-${id}`,
  dimmed: id === "bank" && !dep.bankRailAvailable,
})));
</script>
