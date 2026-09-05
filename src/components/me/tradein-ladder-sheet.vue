<!--
  TradeinLadderSheet(W-TIL1)— FEAT-DEV02 置换抵扣阶梯说明弹层。
  入口:设备列表「可抵 $X」chip。纯展示:阶梯表(当前档高亮)+ 合规说明,不写任何状态。
  数据全派生自 TRADEIN_CREDIT_LADDER 单源(改后台阶梯此表即变)。
-->
<template>
  <view v-if="device" class="fixed inset-0" style="z-index: 900">
    <view class="absolute inset-0" style="background: var(--v5-bg-color-mask)" @click="emit('close')" />
    <view class="absolute left-0 right-0 bottom-0" :style="sheetStyle">
      <view class="flex items-center justify-between">
        <text style="font-family: var(--font-v5); font-size: 15px; font-weight: 650; color: var(--v5-ink)">{{ t.tradein.ladderTitle }}</text>
        <view class="grid place-items-center active:opacity-70" :style="closeBtnStyle" @click.stop="emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>
      <view style="margin-top: 6px"><text style="font-size: 12px; color: var(--v5-ink-3); line-height: 1.6">{{ t.tradein.ladderIntro }}</text></view>

      <view style="margin-top: 14px">
        <view class="flex items-center" :style="tableHeadStyle">
          <text class="flex-1">{{ t.tradein.ladderColRatio }}</text>
          <text style="width: 72px; text-align: right">{{ t.tradein.ladderColCredit }}</text>
        </view>
        <view v-for="(row, i) in ladderRows" :key="i" class="flex items-center" :style="rowStyle(i === currentBand)">
          <text class="flex-1">{{ row.rangeText }}</text>
          <text class="tabular-nums" style="width: 72px; text-align: right; font-family: var(--font-v5); font-weight: 600">{{ row.creditPct }}%</text>
        </view>
      </view>

      <view style="margin-top: 12px"><text style="font-size: 12px; color: var(--v5-ink-3); line-height: 1.65">{{ deviceLine }}</text></view>
      <view style="margin-top: 4px"><text style="font-size: 12px; color: var(--v5-ink-4); line-height: 1.6">{{ t.tradein.ladderFootnote }}</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import type { Device } from "@/store/types";
import { TRADEIN_CREDIT_LADDER } from "@/mock/tradein-config";
import { useT } from "@/i18n/use-t";
import { deviceName } from "@/lib/device-copy";
import { fmt } from "@/i18n/format";
import { deviceE3Api, remoteApiEnabled } from "@/api/runtime";
import type { CanonicalTradeinConfig } from "@/api/device-e3-api";
import { useApp } from "@/store/app";

const props = defineProps<{ device: Device | null }>();
const emit = defineEmits<{ (e: "close"): void }>();
const t = useT();
const app = useApp();
const canonicalConfig = ref<CanonicalTradeinConfig | null>(null);

async function refreshCanonicalConfig(): Promise<void> {
  if (!remoteApiEnabled) return;
  const accountKey = app.accountKey;
  canonicalConfig.value = null;
  try {
    const snapshot = await deviceE3Api.tradeinConfig();
    if (accountKey === app.accountKey) canonicalConfig.value = snapshot;
  } catch {
    if (accountKey === app.accountKey) canonicalConfig.value = null;
  }
}

watch(() => app.accountKey, () => { void refreshCanonicalConfig(); }, { immediate: true });

const ladderModel = computed(() => {
  if (!remoteApiEnabled) return TRADEIN_CREDIT_LADDER;
  const config = canonicalConfig.value;
  if (!config?.enabled) return [];
  return config.creditRatesPct.map((creditPct, index) => ({
    minRatioPct: index === 0 ? 0 : config.outputRatioCutsPct[index - 1],
    maxRatioPct: index < config.outputRatioCutsPct.length ? config.outputRatioCutsPct[index] : null,
    creditPct,
  }));
});

const ratioPct = computed(() => {
  const d = props.device;
  const paid = d?.paidPriceUsdt ?? 0;
  if (!d || paid <= 0) return 0;
  return (Math.max(0, d.cumulativeEarningsUsdt ?? 0) / paid) * 100;
});
const currentBand = computed(() =>
  ladderModel.value.findIndex(
    (r) => ratioPct.value >= r.minRatioPct && (r.maxRatioPct === null || ratioPct.value < r.maxRatioPct),
  ),
);
const ladderRows = computed(() =>
  ladderModel.value.map((r) => ({
    rangeText:
      r.maxRatioPct === null
        ? fmt(t.value.tradein.ladderRangeTop, { min: r.minRatioPct })
        : r.minRatioPct === 0
          ? fmt(t.value.tradein.ladderRangeFirst, { max: r.maxRatioPct })
          : fmt(t.value.tradein.ladderRangeMid, { min: r.minRatioPct, max: r.maxRatioPct }),
    creditPct: r.creditPct,
  })),
);
const deviceLine = computed(() => {
  const d = props.device;
  if (!d) return "";
  return fmt(t.value.tradein.ladderDeviceLine, {
    name: deviceName(t.value, d),
    earned: (d.cumulativeEarningsUsdt ?? 0).toFixed(2),
    ratio: ratioPct.value.toFixed(1),
    band: currentBand.value + 1,
  });
});

function rowStyle(current: boolean): CSSProperties {
  return {
    padding: "9px 10px",
    borderRadius: "10px",
    fontSize: "13px",
    color: current ? "var(--v5-success)" : "var(--v5-ink-2)",
    background: current ? "var(--v5-success-soft)" : "transparent",
    fontWeight: current ? 600 : 400,
  };
}
const tableHeadStyle: CSSProperties = {
  padding: "0 10px 6px",
  fontSize: "12px",
  color: "var(--v5-ink-4)",
};
const sheetStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "24px 24px 0 0",
  padding: "18px 18px 30px",
  boxShadow: "var(--v5-card-shadow-lift-strong)",
};
// 44×44 点按区(移动端最小触控标准;PR-D 债 #4)。
const closeBtnStyle: CSSProperties = {
  width: "44px",
  height: "44px",
  borderRadius: "12px",
  background: "var(--v5-surface-2)",
  border: "1px solid var(--v5-border)",
};
</script>
