<!--
  LiveFeedCard — ZONE 1 dual-tab live ticker (ported from mission-control.tsx
  LiveFeedCard). Activity tab = platform-wide job feed (3.2s); Earnings tab =
  peer purchase feed (6.5s, taps through to /team/commissions). Segmented tab
  switch + top-right see-all affordance. FEED_POOL mock data; names/job strings are proper nouns
  (untranslated, like the source). Chrome labels keyed for bilingual parity.
-->
<template>
  <view v-if="remoteApiEnabled">
    <view class="px-0.5 pt-1 pb-2.5">
      <text style="font-family: var(--font-v5); font-weight: 600; font-size: 15px; color: var(--v5-ink)">{{ t.home.liveFeedTitle }}</text>
    </view>
    <view v-if="remoteTaskRows.length" class="font-mono-tabular" style="padding: 0 2px 6px; font-size: 12px">
      <view v-for="(r, i) in remoteTaskRows" :key="r.id" class="grid items-center gap-2.5 py-2" :style="{ gridTemplateColumns: '44px 1fr auto', borderBottom: i < remoteTaskRows.length - 1 ? '1px solid var(--v5-border)' : 'none' }">
        <text class="tabular-nums" style="font-size: 12px; color: var(--v5-ink-4)">{{ r.time }}</text>
        <text class="truncate" style="font-family: var(--font-v5); color: var(--v5-ink-2)">{{ r.client }} · {{ r.model }}</text>
        <text class="tabular-nums" style="color: var(--v5-success); font-weight: 500">+${{ r.reward.toFixed(5) }}</text>
      </view>
    </view>
    <text v-else class="block px-1 py-3" style="font-size: 12px; color: var(--v5-ink-3)">{{ t.home.liveFeedEmpty }}</text>
  </view>
  <view v-else>
    <!-- Tab switcher + see-all shortcut -->
    <view class="px-0.5 pt-1 pb-2.5 flex items-center justify-between gap-2">
      <!-- 轨道贴页面底:原 surface-2 与页面底同色不可辨(亮色 ΔE 2.2),改 L1。
           配套把选中 pill 从「白底+投影」换成 brand-soft 底(见 tabStyle),
           否则轨道和选中 pill 都是白的,等于修掉隐形又弄丢选中态。 -->
      <view class="flex gap-0.5" style="padding: 3px; background: var(--v5-surface); border-radius: 9px">
        <!-- 《08》§2 反馈恒定:选中态原先是空 class,按下去零反馈。
             切到自己虽然不改变什么,但用户仍需要「点到了」的确认。 -->
        <view
          v-for="tb in tabs"
          :key="tb.id"
          class="active:opacity-70 transition-opacity"
          :style="tabStyle(tb.id)"
          @click="tab = tb.id"
        >
          <text :style="{ color: tab === tb.id ? 'var(--v5-brand)' : 'var(--v5-ink-3)', fontWeight: tab === tb.id ? 600 : 500, fontFamily: 'var(--font-v5)', fontSize: '12px', letterSpacing: '-0.005em' }">{{ tb.label }}</text>
        </view>
      </view>
      <view v-if="tab === 'earnings'" class="inline-flex items-center gap-1 font-mono-tabular active:opacity-70 transition-opacity" style="min-height: 32px; font-size: 12px; color: var(--v5-ink-3)" @click.stop="goCommissions">
        <text style="color: var(--v5-ink-3)">{{ t.home.liveFeedSeeAll }}</text>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </view>
    </view>

    <!-- Activity tab -->
    <view v-if="tab === 'activity'" class="font-mono-tabular" style="padding: 0 2px 6px; font-size: 12px">
      <view
        v-for="(r, i) in activityRows"
        :key="r.k"
        class="grid items-center gap-2.5 py-2 whitespace-nowrap"
        :style="{ gridTemplateColumns: whoColTemplate, borderBottom: i < activityRows.length - 1 ? '1px solid var(--v5-border)' : 'none', animation: i === 0 ? 'v5-ledger-fade 0.5s ease' : 'none' }"
      >
        <text class="tabular-nums" style="font-size: 12px; color: var(--v5-ink-4)">{{ r.ts }}</text>
        <text class="text-center" :style="whoBadgeStyle(r)">{{ whoLabel(r.who) }}</text>
        <!-- 《02》§4 判定线:动态流是「浏览型」内容且设计上单行截断,归 caption 12
             (原 12.5→13 迁移使截断加剧,溢出探针实测 +6px,数据驱动回到 12) -->
        <text class="truncate" style="font-family: var(--font-v5); font-weight: 400; font-size: 12px; line-height: 16px; color: var(--v5-ink-2)">{{ r.msg }}</text>
        <text class="tabular-nums text-right" style="font-weight: 500" :style="{ color: valColor(r) }">{{ r.val === 'locked' ? t.home.feedValLocked : r.val }}</text>
      </view>
    </view>

    <!-- Earnings tab -->
    <view v-else class="block active:opacity-90 transition-opacity" @click="goCommissions">
      <view>
        <view
          v-for="(it, i) in earningsItems"
          :key="it.id"
          class="px-0.5 py-2 flex items-center gap-2"
          :style="{ fontSize: '12px', borderBottom: i < earningsItems.length - 1 ? '1px solid var(--v5-border)' : 'none', animation: i === 0 ? 'v5-ledger-fade 0.5s ease' : 'none' }"
        >
          <view style="width: 5px; height: 5px; border-radius: 50%; background: var(--v5-success); flex-shrink: 0" />
          <text style="font-family: var(--font-v5); font-weight: 600; color: var(--v5-ink)">{{ it.name }}</text>
          <text class="truncate flex-1" style="color: var(--v5-ink-3)">{{ boughtText(it) }}</text>
          <text class="font-mono-tabular tabular-nums whitespace-nowrap" style="color: var(--v5-success-ink); font-weight: 500">+${{ it.amount.toFixed(2) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { useLocaleStore } from "@/store/locale";
import { remoteApiEnabled } from "@/api/runtime";
import { useApp } from "@/store/app";

interface FeedRow {
  k: number;
  lvl: "ok" | "live" | "warn";
  who: string;
  msg: string;
  val: string;
  ts: string;
}
interface CommissionItem {
  id: number;
  name: string;
  product: string;
  amount: number;
}

const FEED_POOL: Omit<FeedRow, "k" | "ts">[] = [
  { lvl: "ok", who: "You", msg: "SDXL Turbo @ Pocket Studios", val: "+$0.00032" },
  { lvl: "live", who: "Peer", msg: "Maya · ID — Llama 70B @ Helix Labs", val: "+$0.247" },
  { lvl: "live", who: "Peer", msg: "cypher.eth — Sora 8s @ Atrium AI", val: "+$0.612" },
  { lvl: "ok", who: "You", msg: "Whisper tiny @ Echo Earbuds", val: "+$0.00009" },
  { lvl: "live", who: "Peer", msg: "Hideo · JP — Flux dev @ Mosaic", val: "+$0.182" },
  { lvl: "live", who: "Peer", msg: "Layla · AE — Llama 405B @ Conduit AI", val: "+$1.204" },
  { lvl: "warn", who: "Lock", msg: "Llama 70B LoRA @ Vector — needs 192GB", val: "locked" },
  { lvl: "ok", who: "You", msg: "MobileBERT @ Vector Foundry", val: "+$0.00007" },
];

const t = useT();
const app = useApp();
const tab = ref<"activity" | "earnings">("activity");

const remoteTaskRows = computed(() => app.visibleDevices
  .flatMap((device) => [
    ...(device.currentTask ? [{ ...device.currentTask, eventAt: device.currentTask.startedAt }] : []),
    ...device.recentTasks.map((task) => ({ ...task, eventAt: task.completedAt })),
  ])
  .filter((task) => Number.isFinite(task.eventAt))
  .sort((a, b) => b.eventAt - a.eventAt)
  .slice(0, 6)
  .map((task) => ({ id: task.id, client: task.client, model: task.model, reward: task.reward, time: new Date(task.eventAt).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit", hour12: false }) })));

const tabs = computed(() => [
  { id: "activity" as const, label: t.value.home.liveFeedTabActivity },
  { id: "earnings" as const, label: t.value.home.liveFeedTabEarnings },
]);

const activityRows = ref<FeedRow[]>(
  FEED_POOL.slice(0, 6).map((r, i) => ({
    ...r,
    k: i + 1,
    ts: `+${Math.floor((i * 4) / 60)}:${String((i * 4) % 60).padStart(2, "0")}`,
  })),
);
let activityCounter = 100;

const earningsItems = ref<CommissionItem[]>([
  { id: 1, name: "Tom Wang", product: "NexGridBox Pro", amount: 89.9 },
  { id: 2, name: "Lisa Park", product: "NexGridBox S1", amount: 29.9 },
  { id: 3, name: "Sara L.", product: "NexGridRack P1", amount: 349.9 },
]);
let earningsId = 100;

let actTimer: ReturnType<typeof setInterval> | null = null;
let earnTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  if (remoteApiEnabled) return;
  actTimer = setInterval(() => {
    const next = FEED_POOL[Math.floor(Math.random() * FEED_POOL.length)];
    activityCounter += 1;
    activityRows.value = [{ ...next, k: activityCounter, ts: "+0:00" }, ...activityRows.value.slice(0, 5)];
  }, 3200);
  const names = ["Sarah K.", "Tom Wang", "Lisa Park", "Diego P.", "Yuki H.", "Mehmet A.", "Mila V."];
  const products = [
    { p: "NexGridBox S1", a: 29.9 },
    { p: "NexGridBox Pro", a: 89.9 },
    { p: "NexGridRack P1", a: 349.9 },
  ];
  earnTimer = setInterval(() => {
    const n = names[Math.floor(Math.random() * names.length)];
    const pr = products[Math.floor(Math.random() * products.length)];
    earningsId += 1;
    earningsItems.value = [{ id: earningsId, name: n, product: pr.p, amount: pr.a }, ...earningsItems.value.slice(0, 2)];
  }, 6500);
});
onUnmounted(() => {
  if (actTimer) clearInterval(actTimer);
  if (earnTimer) clearInterval(earnTimer);
});

function tabStyle(id: "activity" | "earnings"): CSSProperties {
  const on = tab.value === id;
  return {
    // 《07》tap≥44:原 3px 纵向 padding 实测盒高仅 28px。用 min-height 撑热区,
    // 视觉高度靠 flex 居中维持紧凑观感(《03》§2 圆角上阶梯 6→12)。
    minHeight: "44px",
    display: "inline-flex",
    alignItems: "center",
    padding: "0 12px",
    borderRadius: "12px",
    // 选中态改用 brand-soft 底 + brand 文字 —— 与本仓库同类分段/排序控件一致
    // (genesis/marketplace 的 sortPillStyle、home/device-slot 的在线态)。
    // 原「白底 + 投影」在轨道提到 L1(白)之后会与轨道撞色,只剩一层淡投影可辨;
    // 且靠 box-shadow 表达选中本就违反《03》「不用 box-shadow 做层级」。
    background: on ? "var(--v5-brand-soft)" : "transparent",
    boxShadow: "none",
  };
}
// 身份徽章列宽按语言取值(包 G P2#2 选项 a):en「Peer」/zh「同伴」进 38px,
// vi「Thành viên」实测 ~62px,固定 38px 溢出 5px+;列宽仍是常量 → 跨行对齐不破。
const localeStore = useLocaleStore();
const whoColTemplate = computed(() => `44px ${localeStore.code === "vi" ? "66px" : "38px"} 1fr auto`);

function whoBadgeStyle(r: FeedRow): CSSProperties {
  const bg = r.lvl === "ok" ? "var(--v5-success-soft)" : r.lvl === "live" ? "var(--v5-tech-cyan-soft)" : "var(--v5-warning-soft)";
  const color = r.lvl === "ok" ? "var(--v5-success)" : r.lvl === "live" ? "var(--v5-tech-cyan)" : "var(--v5-warning)";
  return { fontSize: "12px", fontWeight: 500, padding: "1px 5px", borderRadius: "3px", letterSpacing: "0.04em", background: bg, color };
}
function valColor(r: FeedRow): string {
  return r.val === "locked" ? "var(--v5-ink-4)" : r.who === "You" ? "var(--v5-ink-3)" : "var(--v5-success)";
}
function whoLabel(who: string): string { return who === "You" ? t.value.home.feedWhoYou : who === "Peer" ? t.value.home.feedWhoPeer : who === "Lock" ? t.value.home.feedWhoLock : who; }
function boughtText(it: CommissionItem): string {
  return fmt(t.value.home.liveFeedBought, { product: it.product });
}
function goCommissions() {
  uni.navigateTo({ url: "/pages/team/commissions", fail: () => {} });
}
</script>
