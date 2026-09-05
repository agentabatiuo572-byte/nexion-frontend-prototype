import { defineStore } from "pinia";
import { ref } from "vue";
import { useApp } from "./app";
import { trialReservesSlotNow } from "./free-trial";
import { tickOrders } from "./orders";
import { useExchange } from "./exchange";
import { useConfig } from "./config";
import { useGenesisConfig } from "./genesis-config";

/**
 * Pull-to-refresh store. Ported from Nexion-prototype/lib/store/refresh.ts
 * (zustand → Pinia). The prototype drove a custom document-touch gesture +
 * pullY/dragging tracking because it ran in a plain web H5; on uni the
 * `<scroll-view refresher-enabled>` owns the gesture + indicator natively on
 * BOTH H5 and App, so this store only needs `isRefreshing` + `refresh()`.
 *
 * `refresh()` advances the same mock simulators the prototype ticked: the app
 * earnings/devices sim, order incubation, and the $NEX exchange rate. A
 * synthetic ~900ms latency gives the native spinner time to feel like a real
 * network fetch. Safe to call concurrently — a second call while one is in
 * flight is a no-op.
 */

const REFRESH_LATENCY_MS = 900;

export const useRefresh = defineStore("refresh", () => {
  const isRefreshing = ref(false);

  async function refresh(): Promise<void> {
    if (isRefreshing.value) return;
    isRefreshing.value = true;
    try {
      await new Promise<void>((r) => setTimeout(r, REFRESH_LATENCY_MS));
      useApp().tick(3500);
      tickOrders(trialReservesSlotNow() ? 1 : 0);
      useExchange().refreshRate();
      // 🔴 下拉刷新在用户心智里就是「重新拉数据」,创世配置(市场开关 / 文案变体)必须一并重读
      //   —— 否则运营已关市场,用户下拉了也纠正不过来,而这正是他会做的第一个自救动作
      //   (独立验收 P1)。config 是共享 store,一处刷新全消费者的 computed 同步更新。
      useGenesisConfig().refresh();
      // 🔴 平台展示配置同理(2026-08-06 审计 P2 同型):脉搏三格 / 页脚 $/sec 的失败态,
      //   用户第一自救动作就是下拉 —— 不重拉配置,占位态永远刷不回来。fire-and-forget:
      //   load 自带合成延迟与 loading 态,卡片骨架去闪由 300ms 防抖门管。
      void useConfig().load();
    } finally {
      isRefreshing.value = false;
    }
  }

  return { isRefreshing, refresh };
});
