<!--
  PurchaseTicker — rotating recent-purchase social proof (ported from
  store/page.tsx PurchaseTickerV5). Cycles through a fixed list every 3.4s:
  avatar (initial on a colored dot) · "<who> · <country> bought <product>" ·
  "<t> ago". Names/products are dense mock data kept faithful (proper nouns);
  only the avatar accent colors are decorative.
-->
<template>
  <view v-if="remoteApiEnabled && remoteCurrent" class="flex items-center gap-2.5" :style="rootStyle">
    <view class="flex-1 min-w-0 overflow-hidden" style="font-size: 13px">
      <text style="color: var(--v5-ink-3)">{{ t.store.tickerBought }} </text>
      <text style="color: var(--v5-brand); font-weight: 500">{{ remoteCurrent.productName }}</text>
    </view>
    <text class="font-mono-tabular whitespace-nowrap" style="font-size: 12px; color: var(--v5-ink-4)">{{ verifiedHour }}</text>
  </view>
  <view v-else-if="!remoteApiEnabled" class="flex items-center gap-2.5" :style="rootStyle">
    <view class="grid place-items-center" :style="avatarStyle">
      <text>{{ initial }}</text>
    </view>
    <view class="flex-1 min-w-0 overflow-hidden" style="font-size: 13px">
      <text style="color: var(--v5-ink); font-weight: 500">{{ cur.who }} · {{ cur.co }}</text>
      <text style="color: var(--v5-ink-3)"> {{ t.store.tickerBought }} </text>
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

interface Purchase { who: string; co: string; prod: string; t: string; color: string }

// 头像底色走 token(2026-07-23 B1 修)。原为硬编码 hex,且是**亮色主题 token 值的
// 字面副本** → 暗色主题下底色不跟随、而文字用 var(--v5-ink) 跟随,双主题必失配。
// ⚠️ 原注释自陈「Alex 的蓝特意挪到 #1A4FD0,使其不触发 verify 的硬编码色哨兵」——
// 这是绕哨兵而非解决问题的先例;哨兵覆盖面待横切批次补全(见 B1 verdicts 未闭合项)。
const purchases: Purchase[] = [
  { who: "Maya", co: "ID", prod: "NexGridBox S1", t: "3m", color: "var(--v5-warning-ink)" },
  { who: "cypher.eth", co: "US", prod: "NexGridRack P1", t: "7m", color: "var(--v5-brand-deep)" },
  { who: "Hideo", co: "JP", prod: "NexGridBox Pro", t: "12m", color: "var(--v5-success-ink)" },
  { who: "Alex", co: "DE", prod: "NexGridBox S1", t: "14m", color: "var(--v5-brand)" },
  { who: "Layla", co: "AE", prod: "NexGridBox S1 ×2", t: "21m", color: "var(--v5-danger)" },
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
const initial = computed(() => cur.value.who[0]);

const rootStyle: CSSProperties = {
  padding: "10px 14px",
  background: "var(--v5-surface)",
  borderRadius: "12px",
};

const avatarStyle = computed<CSSProperties>(() => ({
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  background: cur.value.color,
  // 底色是随主题翻转的语义 token(亮色深/暗色浅)→ 首字母必须用同样翻转的
  // --v5-on-brand;此前留着 --v5-ink 与底色同向变化,暗主题实测 1.41:1(独立验收)。
  color: "var(--v5-on-brand)",
  fontFamily: "var(--font-v5)",
  fontWeight: 600,
  fontSize: "13px",
  flexShrink: 0,
}));
</script>
