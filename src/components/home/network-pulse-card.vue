<!--
  NetworkPulseCard — ZONE 2 global-grid metrics(规格 FEAT-HOME02)。
  三格:注册用户 / 在线设备 / 你的排名 —— 全部由展示配置与真实派生驱动,零写死值。
-->
<template>
  <view>
    <view class="flex items-center justify-between" style="margin: 8px 2px 10px">
      <text style="font-family: var(--font-v5); font-weight: 600; font-size: 15px; color: var(--v5-ink); letter-spacing: -0.012em">{{ t.home.networkPulseTitle }}</text>
      <text class="font-mono-tabular" style="font-size: 12px; color: var(--v5-tech-cyan-ink)">{{ t.home.networkLive }}</text>
    </view>

    <view style="background: var(--v5-surface); border-radius: 16px; overflow: hidden">
      <view class="px-3.5 py-2.5 flex justify-between items-center font-mono-tabular" style="border-bottom: 1px solid var(--v5-border); background: var(--v5-surface-2); font-size: 12px; color: var(--v5-ink-3)">
        <view class="inline-flex items-center gap-1.5">
          <PulseDot color="var(--v5-tech-cyan)" />
          <text>{{ t.home.networkGlobalGrid }}</text>
        </view>
        <!-- 条头右侧刻意留空:实时支付流数字已删(FEAT-HOME02 定案,与「今日支付」同一笔钱两种表达)。 -->
      </view>

      <view class="grid grid-cols-3">
        <view
          v-for="(m, i) in metrics"
          :key="m.k"
          class="grid items-center gap-2"
          :class="m.tap ? 'active:opacity-70' : ''"
          :role="m.tap ? 'button' : undefined"
          :tabindex="m.tap ? 0 : undefined"
          :style="{ gridTemplateColumns: '1fr', padding: '12px', borderRight: i < metrics.length - 1 ? '1px solid var(--v5-border)' : 'none', minWidth: 0 }"
          v-on="m.tap ? { click: m.tap } : {}"
          @keydown.enter.stop.prevent="activate(m.tap)"
          @keydown.space.stop.prevent="activate(m.tap)"
        >
          <view class="min-w-0">
            <text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-ink-3)">{{ m.k }}</text>
            <!-- 骨架条:只属**占位格**(健康格有活数据,刷新期间保持旧值,不糊骨架 ——
                 R2 审计:下拉链 900ms 后 load 600ms,任何纯时长防抖都会被常量击穿,
                 「有值不换骨架」才是真防闪;300ms 防抖只管占位格自己的拉取显示)。 -->
            <view v-if="m.skeleton" class="mt-1.5" style="height: 18px; width: 72%; border-radius: 6px; background: var(--v5-surface-3)" />
            <text
              v-else
              class="block mt-0.5 tabular-nums"
              :style="{ fontFamily: 'var(--font-v5)', fontWeight: 600, fontSize: m.vSize ?? '20px', color: m.tone, letterSpacing: '-0.014em', lineHeight: 1.05, whiteSpace: 'nowrap' }"
            >{{ m.v }}</text>
            <!-- 可点副行(未上榜引导 CTA)才挂监听 + active 反馈;纯展示副行零监听 ——
                 无条件挂 handler 会让 tap-feedback 探针把不可点的格也计为 tap 目标(P-059 同轮抓的)。
                 热区:负 margin 抵消的 padding 把可点面拉到 ≥40px,视觉不变。 -->
            <text
              v-if="m.subTap"
              class="block mt-1 font-mono-tabular truncate active:opacity-70"
              role="button"
              tabindex="0"
              :style="{ fontSize: '12px', color: m.subTone ?? 'var(--v5-ink-4)', padding: '14px 0', margin: '-14px 0' }"
              @click.stop="m.subTap()"
              @keydown.enter.stop.prevent="activate(m.subTap)"
              @keydown.space.stop.prevent="activate(m.subTap)"
            >{{ m.sub }}</text>
            <text
              v-else
              class="block mt-1 font-mono-tabular truncate"
              :style="{ fontSize: '12px', color: m.subTone ?? 'var(--v5-ink-4)' }"
            >{{ m.sub }}</text>
          </view>
          <view style="height: 32px">
            <HomeSparkline v-if="m.data" :data="m.data" :color="m.color" :height="32" />
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useApp } from "@/store/app";
import { useConfig } from "@/store/config";
import { useRankSnapshot } from "@/store/rank-snapshot";
import { useNetworkRank } from "@/store/network-rank";
import { remoteApiEnabled } from "@/api/runtime";
import { computeRank } from "@/lib/network-rank";
import { derivedRegisteredUsers, publicStatsHealth, compactNumber as compact } from "@/lib/platform-stats";
import { toast } from "@/store/ui";
import { navTo } from "@/lib/route";
import PulseDot from "./pulse-dot.vue";
import HomeSparkline from "./home-sparkline.vue";

const t = useT();
const app = useApp();
const cfg = useConfig();
const snap = useRankSnapshot();
const remoteRank = useNetworkRank();

// 🔴 时间锚的真实机制(2026-08-06 审计纠正,上一版注释说的「下拉刷新带动重渲」不成立):
//   挂载取一次 + **配置重拉完成沿再取一次**(下拉刷新会触发 cfg.load,见 store/refresh.ts)。
//   两个刷新点之间冻结 —— 名次确定性正来自于此;秒级时钟属于创世倒计时,不属于这里。
const nowTs = ref(Date.now());
// 🔴 24h 前进量:**冻结成普通 ref,再提交**(第二次结构反思·族A)。
//   R1 是「computed 里落盘」,R2 证明「先读后滚」照样死 —— commit 写快照源,
//   展示 computed 追踪着它,paint 前被失效重算成 null。响应式系统里「顺序」不是「隔离」;
//   真隔离 = 展示值在时点定格进普通 ref(它不追踪任何源),提交爱怎么写怎么写。
const displayDelta = ref<number | null>(null);
function refreshRankMoment() {
  if (remoteApiEnabled) {
    void remoteRank.refresh();
    displayDelta.value = remoteRank.snapshot?.rankChange24h ?? null;
    return;
  }
  nowTs.value = Date.now();
  const r = rank.value;
  if (r.kind === "ranked") {
    displayDelta.value = snap.preview(r.rank, nowTs.value); // 先冻结
    snap.commit(r.rank, nowTs.value);                       // 后滚动,写不回展示值
  } else {
    displayDelta.value = null;
  }
}
onMounted(refreshRankMoment);
watch(() => remoteRank.snapshot, (next) => {
  if (remoteApiEnabled) displayDelta.value = next?.rankChange24h ?? null;
});
watch(() => app.accountKey, (accountKey) => {
  if (!remoteApiEnabled) return;
  // Defensive rebind for direct session restore/account mutations; the central
  // account scope also binds this store, and the epoch makes duplicate binds safe.
  remoteRank.bindAccount(accountKey);
  refreshRankMoment();
});
watch(() => cfg.loading, (l, was) => {
  if (was && !l) refreshRankMoment();
});

// 🔴 骨架防闪的真机制(R2 审计后改):**有活数据的格永不切骨架**(stale-while-revalidate,
//   下拉链 await 900ms 后 load 600ms,600>300 恒成立,纯时长防抖必被击穿)。
//   本防抖只服务**占位格**自己的「拉取中」显示:>300ms 才亮,免得点重试闪一下(规格 ⑤)。
const showSkeleton = ref(false);
let skeletonTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => cfg.loading, (l) => {
  if (l) {
    skeletonTimer = setTimeout(() => { showSkeleton.value = true; }, 300);
  } else {
    if (skeletonTimer !== null) { clearTimeout(skeletonTimer); skeletonTimer = null; }
    showSkeleton.value = false;
  }
});
onUnmounted(() => { if (skeletonTimer !== null) clearTimeout(skeletonTimer); }); // R3 P2 卫生债
/** 装饰性走势(确定性,从当前值倒推 8 点缓坡;不声称历史数据,只是视觉纹理)。 */
const ramp = (v: number) => Array.from({ length: 8 }, (_, i) => v * (0.997 + i * 0.0004));

// 健康度共享一份(三格 + 排名入参守卫同源)
const health = computed(() => publicStatsHealth(cfg.config.publicStats));
// ── 格 1:注册用户(公布基数按月增速从锚点推算，仅作展示)──
const registered = computed(() => derivedRegisteredUsers(cfg.config.publicStats, nowTs.value));
// ── 格 3:名次(每次渲染由当下算力 + 当下配置现算,禁缓存名次)──
//   🔴 入参守卫(R2 P2):分母吃服务端真实账号数，营销公布基数不参与资格排名。
//   是它自己的输入坏了,同判 unavailable;ps 整段缺席(机器门最小桩)同理,不裸解引。
const rank = computed(() => {
  if (remoteApiEnabled) {
    if (remoteRank.status !== "ready" || remoteRank.snapshot === null) return { kind: "unavailable" } as const;
    return remoteRank.snapshot.currentRank === null
      ? { kind: "unranked" } as const
      : { kind: "ranked", rank: remoteRank.snapshot.currentRank } as const;
  }
  const ps = cfg.config.publicStats;
  const h = health.value;
  if (!ps || !h.membersOk || !h.rankOk) return { kind: "unavailable" } as const;
  return computeRank({
    myTotalHashrate: app.myTotalHashrateAt(nowTs.value),
    table: ps.hashratePercentileTable,
    realPopulation: ps.realUserCount,
    virtualPopulation: ps.virtualUserCount,
  });
});
// R3 降级 P2:rank 会随设备增减在已挂载页面上活翻(6s 订单 tick 在任意页发货)——
// **kind 一迁移**就重取时刻(补落基线/清滞留值)。只盯 kind 不盯名次值:名次里掺着
// 时间派生的人口,盯值会让 refreshRankMoment 的 nowTs 触发自转;displayDelta 是普通 ref、
// commit 不在展示读路径,kind-watch 不会重开族A写读环。必须放在 rank 声明之后
// (watch 源 getter 创建即求值,放前面是 TDZ 崩页 —— 首跑实锤,5 个浏览器齿轮全灭)。
watch(() => rank.value.kind, (k, was) => { if (k !== was) refreshRankMoment(); });

interface Cell {
  k: string;
  v: string;
  vSize?: string;
  tone: string;
  sub: string;
  subTone?: string;
  data?: number[] | null;
  color?: string;
  skeleton?: boolean; // 只属占位格:健康格有活数据,刷新期间保持旧值(stale-while-revalidate),不糊骨架
  tap?: () => void;
  subTap?: () => void;
}

function activate(action?: () => void) {
  action?.();
}

/** 配置失败的占位格(规格异常2:骨架→「数据更新中」+ 重试;禁回退写死数字)。 */
function placeholderCell(label: string): Cell {
  return {
    k: label,
    v: t.value.home.networkStatUpdating,
    vSize: "12.5px",
    tone: "var(--v5-ink-3)",
    sub: t.value.home.networkStatRetry,
    subTone: "var(--v5-tech-cyan-ink)",
    data: null,
    skeleton: showSkeleton.value,
    tap: () => { void cfg.load(); },
  };
}

const metrics = computed<Cell[]>(() => {
  const ps = cfg.config.publicStats;
  const failed = cfg.syncFailed;
  // 🔴 逐字段健康度(审计 P1「异常3 半缺」):判定收在 publicStatsHealth 单处,
  //   在线率越域 / 增速为负 / 虚拟人口为负都算非法 → 对应格占位,禁拿回退锚冒充真数据。
  const h = health.value;

  // 格 1 注册用户 —— 单项非法只坏本格(规格异常3)
  const membersBad = failed || !h.membersOk || !Number.isFinite(registered.value) || registered.value < 0;
  const members: Cell = membersBad
    ? placeholderCell(t.value.home.networkMembers)
    : {
        k: t.value.home.networkMembers,
        v: compact(registered.value),
        tone: "var(--v5-ink)",
        sub: fmt(t.value.home.networkMembersSub, { n: ps.registeredUsersMonthlyGrowthPct }),
        data: ramp(registered.value),
        color: "var(--v5-brand)",
      };

  // 格 2 在线设备 —— 值来自 store 的呼吸态(基线与带宽都由配置驱动,见 app.ts)
  const devicesBad = failed || !h.devicesOk;
  const devices: Cell = devicesBad
    ? placeholderCell(t.value.home.networkDevices)
    : {
        k: t.value.home.networkDevices,
        v: compact(app.global.activeDevices),
        tone: "var(--v5-ink)",
        sub: t.value.home.networkDevicesSub,
        data: ramp(app.global.activeDevices),
        color: "var(--v5-tech-cyan-ink)",
      };

  // 格 3 你的排名 —— 三态(规格 ⑤/异常1/异常2);rankOk 缺失同走占位
  const r = rank.value;
  let rankCell: Cell;
  if (failed || !h.rankOk || r.kind === "unavailable") {
    rankCell = placeholderCell(t.value.home.networkYourRank);
  } else if (r.kind === "unranked") {
    rankCell = {
      k: t.value.home.networkYourRank,
      // 未上榜整态降档(槽位契约:vi 全称 20px 放不下,≤12px 才进 89.3px 槽 —— 见 en.ts 注)
      v: t.value.home.networkRankUnranked,
      vSize: "12.5px",
      tone: "var(--v5-ink-2)",
      sub: t.value.home.networkRankUnrankedHint,
      subTone: "var(--v5-brand)",
      data: null,
      tap: () => toast.info(t.value.home.networkRankTipUnranked),
      subTap: () => navTo("/store"), // 引导整条即 CTA(规格 ⑥:设备/商城既有入口)
    };
  } else {
    rankCell = {
      k: t.value.home.networkYourRank,
      v: `#${compact(r.rank)}`,
      tone: "var(--v5-brand)",
      sub: displayDelta.value !== null ? fmt(t.value.home.networkRankUp24h, { n: displayDelta.value }) : "",
      // 名次越小越好:走势画成向下缓坡(视觉「在前进」),数据仍是确定性装饰
      data: Array.from({ length: 8 }, (_, i) => -r.rank * (1 + (7 - i) * 0.0004)),
      color: "var(--v5-brand)",
      tap: () => toast.info(t.value.home.networkRankTipRanked),
    };
  }

  return [members, devices, rankCell];
});
</script>
