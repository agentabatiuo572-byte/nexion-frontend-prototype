<!-- The latest income bills (same ledger as the bills page, direction IN) for the home earnings tab. -->
<template>
  <view v-if="rows.length" class="nx-feed-list">
    <view v-for="bill in rows" :key="bill.id" class="nx-feed-row" data-home-income-row="true" role="link" tabindex="0" @click="goIncome(bill)" @keydown.enter.stop.prevent="goIncome(bill)">
      <view class="nx-feed-icon" :style="{ background: walletBillTypeTint(bill.type) }" aria-hidden="true">
        <BillTypeIcon :type="bill.type" :color="WALLET_BILL_TYPE_COLOR[bill.type]" />
      </view>
      <view class="nx-feed-copy">
        <view class="nx-feed-title-row">
          <text class="nx-feed-title">{{ typeLabel(bill.type) }}</text>
          <NxTag v-if="bill.status === 'pending'" tone="warning" :label="t.bills.statusPending" />
        </view>
        <text class="nx-feed-sub">{{ resolveWalletBillMemo(bill, t.bills.memo as Record<string, string>) }} · {{ walletBillShortTime(bill.ts, dateLocale(), mockServerNow(), t.bills.dayYesterday) }}</text>
      </view>
      <view class="nx-feed-amount font-mono-tabular">
        <text>{{ visibility.mask(`+${formatWalletBillDecimal(bill.amountExact, bill.amount, bill.symbol, dateLocale())}`) }}</text>
        <text class="nx-feed-unit">{{ platformDisplayText(bill.symbol) }}</text>
      </view>
    </view>
  </view>
  <view v-else class="nx-feed-state">
    <text>{{ stateText }}</text>
    <text v-if="pager.status === 'error'" class="nx-feed-retry" role="button" tabindex="0" @click="refresh" @keydown.enter.stop.prevent="refresh">{{ t.ui.retry }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useT } from "@/i18n/use-t";
import { dateLocale } from "@/i18n/format";
import { useBills, type Bill, type BillType } from "@/store/bills";
import { useDataVisibility } from "@/store/data-visibility";
import { fundsServerEnabled } from "@/api/runtime";
import { navTo } from "@/lib/route";
import { platformDisplayText } from "@/lib/brand-copy";
import { runPassiveTabRead } from "@/lib/passive-tab-read";
import { WALLET_BILL_TYPE_COLOR, formatWalletBillDecimal, resolveWalletBillMemo, walletBillTypeTint } from "@/lib/wallet-bill-display";
import { walletBillShortTime } from "@/lib/wallet-bill-date";
import { mockServerNow } from "@/store/server-time";
import { onShow } from "@/composables/use-tab-page-lifecycle";
import BillTypeIcon from "@/components/me/bill-type-icon.vue";
import NxTag from "@/components/ui/nx-tag.vue";

const props = defineProps<{ active: boolean }>();
const ROWS = 5;
const t = useT();
const visibility = useDataVisibility();
const billsStore = useBills();
const pager = billsStore.getLedger({ direction: "IN" });
const rows = computed(() => (fundsServerEnabled ? pager.rows : billsStore.bills.filter(bill => bill.amount > 0)).slice(0, ROWS));
const stateText = computed(() => fundsServerEnabled && (pager.status === "idle" || pager.status === "loading") ? t.value.home.networkStatUpdating
  : fundsServerEnabled && pager.status === "error" ? t.value.uiChrome.unavailable : t.value.home.incomeEmpty);
function typeLabel(type: BillType): string {
  return t.value.bills[`type${type.charAt(0).toUpperCase()}${type.slice(1)}` as keyof typeof t.value.bills] as string;
}
function refresh() {
  if (fundsServerEnabled) void runPassiveTabRead("bills-income", () => pager.refresh(), undefined, () => pager.status === "ready").catch(() => undefined);
}
// The bills page shows one asset at a time, so open it on the tapped row's asset.
function goIncome(bill: Bill) {
  navTo(`/pages/me/wallet-bills?filter=in&asset=${bill.symbol}`);
}
// Read the bills only while the earnings tab is open, not on every home visit.
onShow(() => { if (props.active) refresh(); });
watch(() => props.active, active => { if (active) refresh(); });
</script>
