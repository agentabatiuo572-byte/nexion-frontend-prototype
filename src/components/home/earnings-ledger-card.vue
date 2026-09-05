<!--
  EarningsLedgerCard — ZONE 5 recent micro-earnings ledger (ported from
  mission-control.tsx EarningsLedgerCard). Header (Earnings ledger · N of total)
  + 5 rows (model · client · amount · age). Remote/Sandbox rows come from the
  Home canonical projection; only the local demo uses mock rows.
-->
<template>
  <view data-home-section="earnings-ledger" :data-ledger-mode="app.homeTruth?.earningsLedgerMode ?? 'UNAVAILABLE'">
    <view class="flex items-center justify-between" style="margin: 8px 2px 10px">
      <text style="font-family: var(--font-v5); font-weight: 600; font-size: 15px; color: var(--v5-ink); letter-spacing: -0.012em">{{ ledgerTitle }} <text v-if="app.homeTruth?.sourceEnvironment === 'SANDBOX'" class="font-mono-tabular" style="font-size: 10px; color: var(--v5-ink-4)">· SANDBOX</text></text>
      <text v-if="isQuoteExample" data-home-ledger-disclaimer="true" class="font-mono-tabular" style="font-size: 11px; color: var(--v5-warning-ink)">{{ t.home.sandboxQuoteNoCredit }}</text>
      <text v-else class="font-mono-tabular inline-flex items-center active:opacity-70" style="min-height: 44px; padding-left: 12px; font-size: 13px; color: var(--v5-brand); font-weight: 500" role="link" tabindex="0" data-home-action="earnings-ledger-all" @click="goAll" @keydown.enter.stop.prevent="goAll" @keydown.space.stop.prevent="goAll">{{ t.home.earningsLedgerViewAll }} →</text>
    </view>

    <view style="padding: 0 2px; border-top: 1px solid var(--v5-border)">
      <view
        v-for="(r, i) in rows"
        :key="r.id"
        data-home-ledger-row="true"
        class="grid items-center gap-2.5"
        :style="{ gridTemplateColumns: '1fr auto 48px', padding: '10px 0', borderBottom: i < rows.length - 1 ? '1px solid var(--v5-border)' : 'none' }"
      >
        <view class="min-w-0">
          <text class="block truncate" style="font-family: var(--font-v5); font-weight: 500; font-size: 13px; color: var(--v5-ink)">{{ r.model }}<text style="color: var(--v5-ink-3)"> · {{ r.who }}</text></text>
        </view>
        <text class="font-mono-tabular tabular-nums" style="font-size: 12px; color: var(--v5-success-ink); font-weight: 500">{{ r.amt }}</text>
        <text class="font-mono-tabular text-right" style="font-size: 12px; color: var(--v5-ink-4)">{{ r.t }}</text>
      </view>
      <view v-if="remoteApiEnabled && rows.length === 0" class="flex items-center justify-between px-2 py-3" style="gap: 12px">
        <text style="font-size: 12px; color: var(--v5-ink-3)">{{ ledgerStatusText }}</text>
        <text v-if="app.homeTruthStatus === 'error'" class="font-mono-tabular active:opacity-70" role="button" tabindex="0" data-home-action="earnings-ledger-retry" style="font-size: 12px; color: var(--v5-brand); font-weight: 600" @click="retryHome" @keydown.enter.stop.prevent="retryHome" @keydown.space.stop.prevent="retryHome">{{ t.ui.retry }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useT } from "@/i18n/use-t";
import { dateLocale } from "@/i18n/format";
import { remoteApiEnabled } from "@/api/runtime";
import { useApp } from "@/store/app";

const t = useT();
const app = useApp();
const isQuoteExample = computed(() => app.homeTruth?.earningsLedgerMode === "SANDBOX_QUOTE_EXAMPLES");
const ledgerTitle = computed(() => isQuoteExample.value ? t.value.home.sandboxQuoteLedgerTitle : t.value.home.earningsLedgerTitle);

const ROWS = [
  { id: 1, who: "Pocket Studios", model: "SDXL Turbo", amt: "+$0.00032", t: "2s" },
  { id: 2, who: "Echo Earbuds", model: "Whisper tiny", amt: "+$0.00005", t: "14s" },
  { id: 3, who: "Helix Labs", model: "Llama 3.2 3B", amt: "+$0.00021", t: "38s" },
  { id: 4, who: "Mosaic Studios", model: "Flux Schnell", amt: "+$0.00048", t: "52s" },
  { id: 5, who: "Vector Foundry", model: "MobileBERT", amt: "+$0.00009", t: "1m" },
];

const remoteRows = computed(() => (app.homeTruth?.earningsLedger ?? [])
  .slice()
  .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
  .slice(0, 5)
  .map((entry) => ({
    id: entry.id,
    who: entry.client,
    model: entry.model,
    amt: `${entry.synthetic ? "" : "+"}$${entry.rewardUsdt.toFixed(5)}`,
    t: new Date(entry.completedAt).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit", hour12: false }),
  })));
const rows = computed(() => remoteApiEnabled ? remoteRows.value : ROWS);
const ledgerStatusText = computed(() => {
  if (app.homeTruthStatus === "loading" || app.homeTruthStatus === "idle") return t.value.home.networkStatUpdating;
  if (app.homeTruthStatus === "error") return t.value.uiChrome.unavailable;
  return t.value.home.ledgerEmpty;
});

function retryHome() {
  void app.refreshHomeTruth();
}

function goAll() {
  uni.navigateTo({ url: "/pages/me/wallet-bills", fail: () => {} });
}
</script>
