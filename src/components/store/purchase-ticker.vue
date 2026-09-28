<!--
  PurchaseTicker — rotating recent-purchase social proof (ported from
  store/page.tsx PurchaseTickerV5). Cycles through a fixed list every 3.4s:
  "<who> · <country> bought <product>" · "<t> ago".
-->
<template>
  <view v-if="remoteApiEnabled && remoteCurrent" class="nx-glass-card flex items-center gap-2.5" :style="rootStyle">
    <view class="flex-1 min-w-0 overflow-hidden" style="font-size: 13px">
      <text style="color: var(--v5-ink-3)">{{ t.store.tickerBought }} </text>
      <text style="color: var(--v5-brand); font-weight: 500">{{ remoteCurrent.productName }}</text>
    </view>
    <text class="font-mono-tabular whitespace-nowrap" style="font-size: 12px; color: var(--v5-ink-4)">{{ verifiedHour }}</text>
  </view>
  <view v-else-if="!remoteApiEnabled" class="nx-glass-card flex items-center gap-2.5" :style="rootStyle">
    <view class="flex-1 min-w-0 overflow-hidden" style="font-size: 13px">
      <text style="color: var(--v5-ink); font-weight: 500">{{ cur.who }} · {{ cur.co }}</text>
      <text style="color: var(--v5-ink-3)">&nbsp;{{ t.store.tickerBought }} </text>
      <text style="color: var(--v5-brand); font-weight: 500">{{ cur.prod }}</text>
    </view>
    <text class="font-mono-tabular whitespace-nowrap" style="font-size: 12px; color: var(--v5-ink-4)">{{ cur.t }} {{ t.store.tickerAgo }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { remoteApiEnabled, storefrontActivityApi } from "@/api/runtime";
import type { StorefrontActivityItem } from "@/api/storefront-activity-api";
import { useApp } from "@/store/app";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";

const t = useT();
const app = useApp();
const remoteItems = ref<StorefrontActivityItem[]>([]);
const remoteIndex = ref(0);
const remoteCurrent = computed(() => remoteItems.value[remoteIndex.value] ?? null);
const verifiedHour = computed(() => remoteCurrent.value?.occurredAt.replace("T", " ") ?? "");
const remoteEpoch = createRemoteAccountEpoch(app.accountKey);

interface Purchase { who: string; co: string; prod: string; t: string }

const purchases: Purchase[] = [
  { who: "Maya", co: "ID", prod: "UVELBox S1", t: "3m" },
  { who: "cypher.eth", co: "US", prod: "UVELRack P1", t: "7m" },
  { who: "Hideo", co: "JP", prod: "UVELBox Pro", t: "12m" },
  { who: "Alex", co: "DE", prod: "UVELBox S1", t: "14m" },
  { who: "Layla", co: "AE", prod: "UVELBox S1 ×2", t: "21m" },
];

const i = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

function clearRemoteActivity(): void {
  remoteItems.value = [];
  remoteIndex.value = 0;
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

function loadRemoteActivity(request = remoteEpoch.snapshot()): void {
  void storefrontActivityApi.activity(8).then((snapshot) => {
    if (!remoteEpoch.isCurrent(request)) return;
    remoteItems.value = snapshot.items;
    if (snapshot.items.length > 1) {
      timer = setInterval(() => {
        if (!remoteEpoch.isCurrent(request)) return;
        remoteIndex.value = (remoteIndex.value + 1) % remoteItems.value.length;
      }, 3400);
    }
  }).catch(() => {
    if (remoteEpoch.isCurrent(request)) clearRemoteActivity();
  });
}

onMounted(() => {
  if (remoteApiEnabled) {
    remoteEpoch.bind(app.accountKey);
    clearRemoteActivity();
    loadRemoteActivity();
    return;
  }
  timer = setInterval(() => {
    i.value = (i.value + 1) % purchases.length;
  }, 3400);
});
watch(() => app.accountKey, (accountKey) => {
  if (!remoteApiEnabled) return;
  remoteEpoch.bind(accountKey);
  clearRemoteActivity();
  loadRemoteActivity();
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const cur = computed(() => purchases[i.value]);

const rootStyle: CSSProperties = { boxShadow: "var(--nx-glass-edge)",
  padding: "10px 14px",
  background: "var(--nx-glass-fill)",
  borderRadius: "var(--nx-glass-radius)",
};

</script>
