import { defineStore } from "pinia";
import { ref } from "vue";
import { normalizeAccountKey } from "@/store/account-cloud";

/**
 * 首页排名的 24h 快照(规格 FEAT-HOME02 ③ `rankSnapshot24h`)。
 *
 * 只为一件事存在:排名格副文本的「24h +{n} 名」。规格异常4 明写 ——
 * **无快照就不显示变化,禁编造「↑12」**。远程模式由服务端按账号投影；本 store
 * 仅为 sandbox mock 保留进程内预览，不写设备存储，也不会让换号用户继承旧行。
 *
 * 滚动语义:快照存「≈24h 前的名次」。首次见到名次 → 只落盘不显示;
 * 快照满 24h → 用旧快照算一次前进量,同时滚动成当前名次。
 * 前进量 ≤ 0 不显示(名次单调由分位表保证,倒退只可能来自运营改配置 —— 那不叫「上升」)。
 *
 * PROD: 快照改由服务端按账号存取；本 store 只保留 Mock 进程内预览，绝不把排名事实
 * 写入设备存储。真实模式由 network-rank store 消费 `/api/app/network/rank`。
 */

interface Snap {
  rank: number;
  at: number;
}

const DAY_MS = 24 * 3_600_000;

export const useRankSnapshot = defineStore("rankSnapshot", () => {
  const memory = new Map<string, Snap>();
  let boundKey = normalizeAccountKey("");
  const snap = ref<Snap | null>(null);

  /** 账号切换重绑(与 weekly-quest 同范式;account-scope.ts 统一调度)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    snap.value = memory.get(boundKey) ?? null;
  }

  /**
   * 🔴 读写分离(2026-08-06 独立审计 P1:滚动写在 computed 读路径里,双求值时
   * 第二次求值读到刚滚完的新快照 → delta 变 null → **paint 前被自我覆盖**,
   * 「隔天回访看到 ↑n」这个主场景永不可见)。
   *   preview = 纯读,给 computed 用,零副作用;
   *   commit  = mock 进程内滚动,只在挂载 / 刷新沿显式调一次。
   */

  /** 纯读:该显示的 24h 前进量(null = 不显示)。基线超 48h 视为过期,不拿 N 天进步冒充 24h。 */
  function preview(currentRank: number, now: number): number | null {
    if (!Number.isFinite(currentRank) || currentRank < 1) return null;
    const s = snap.value;
    if (s === null) return null; // 无快照不显示(规格异常4)
    const age = now - s.at;
    if (age < 0 || age > 2 * DAY_MS) return null; // 时钟回拨 / 长离线基线过期
    const delta = s.rank - currentRank;
    return delta > 0 ? delta : null;
  }

  /** mock 进程内提交:首见建立基线;基线满 24h 滚动成当前名次。 */
  function commit(currentRank: number, now: number): void {
    if (!Number.isFinite(currentRank) || currentRank < 1) return;
    const s = snap.value;
    if (s === null || now - s.at >= DAY_MS || now - s.at < 0) {
      snap.value = { rank: currentRank, at: now };
      memory.set(boundKey, snap.value);
    }
  }

  return { snap, bindAccount, preview, commit };
});
