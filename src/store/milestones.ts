import { defineStore } from "pinia";
import { ref } from "vue";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";

/**
 * Earnings milestone store. Ported from
 * Nexion-prototype/lib/store/milestones.ts (zustand persist → Pinia + uni
 * storage) and Nexion-prototype/app/components/milestone-watcher.tsx (the
 * celebration overlay state moved into this store so a global overlay host can
 * drive it).
 *
 * Tracks which lifetime-earnings thresholds the user has already crossed so
 * each one fires a celebration exactly once. `firedIds` is persisted across
 * reloads — milestones do not re-fire after refresh.
 *
 * ⚠️ MOCK-ONLY thresholds + reward table. backend-replaceable structure:
 *   - Production: GET /api/config/milestones for threshold + reward
 *     (PRD §9.11c.1), POST /api/me/milestones/:id/claim for server-validated
 *     payout with idempotency key (PRD §9.11e atomic pattern).
 *   - This store only mirrors fired ids + drives the overlay; the NEX payout +
 *     bill-ledger write are composed by the caller (App.vue) so this store
 *     stays import-free of creditNex / bills (cross-store orchestration rule).
 */

export interface MilestoneStep {
  id: string;             // e.g. "earn-100"
  thresholdUSD: number;   // life-to-date earnings to cross
  label: string;          // i18n key resolved by caller, e.g. "milestones.earn100"
  nexReward: number;      // NEX bonus credited on first fire
}

export const EARNINGS_MILESTONES: ReadonlyArray<MilestoneStep> = [
  { id: "earn-100",   thresholdUSD: 100,    label: "earn100",   nexReward: 100 },
  { id: "earn-500",   thresholdUSD: 500,    label: "earn500",   nexReward: 250 },
  { id: "earn-1000",  thresholdUSD: 1_000,  label: "earn1000",  nexReward: 500 },
  { id: "earn-5000",  thresholdUSD: 5_000,  label: "earn5000",  nexReward: 1_500 },
  { id: "earn-10000", thresholdUSD: 10_000, label: "earn10000", nexReward: 3_000 },
];

/** Active celebration payload driving the overlay (session-only, not persisted). */
export interface ActiveMilestone {
  id: string;
  threshold: number;
  nexReward: number;
  label: string;
}

/**
 * 钱链路路由白名单 — 这些页面上庆祝弹层**挂起**(只压 UI,不压发奖励/记账):
 * 结算、提现(含 tracking)、试用。前缀匹配,路由形态 = getCurrentPages().route
 * (无前导斜杠,见 App.vue readCurrentRoute / global-ui.vue readRoute)。
 * 三路走查同族缺陷(2026-08-03):.ms-overlay 盖住支付按钮/宽限提示/提现表单并吞点击。
 */
export const MONEY_FLOW_ROUTE_PREFIXES: ReadonlyArray<string> = [
  "pages/store/checkout",
  "pages/me/wallet-withdraw", // 前缀同时盖 pages/me/wallet-withdraw-tracking
  "pages/me/trial",
];

/** Pure — true when the given route is inside a money flow (celebrations defer). */
export function isMoneyFlowRoute(route: string): boolean {
  if (!route) return false;
  return MONEY_FLOW_ROUTE_PREFIXES.some((p) => route.startsWith(p));
}

// 旧设备级单键 "nexgrid-milestones-v1" 废弃(存量无账号归属,mock 可重建);里程碑 fired 态按账号分行。
// 🔴 spec6-entry-surface-runtime.mjs 的反泄漏护栏键同步改为 nexgrid-milestones-accounts-v1。
const ACCOUNTS_KEY = "nexgrid-milestones-accounts-v1"; // { [accountKey]: { firedIds: string[] } }

function hydrate(accountKey: string): string[] {
  const row = readAccountRow<{ firedIds?: string[] }>(ACCOUNTS_KEY, accountKey);
  if (row && Array.isArray(row.firedIds)) return row.firedIds;
  return [];
}

/**
 * Pure selector — returns the lowest unfired milestone the given life-to-date
 * earnings has crossed, or null. App.vue polls this every 4s and, when it
 * returns a step, composes markFired + creditNex + bills.add + show().
 *
 * `firedIds` is passed in (not read off the store) so this stays a pure
 * function callable from anywhere without coupling.
 */
export function nextUnfired(
  lifeToDate: number,
  firedIds: ReadonlyArray<string>,
): MilestoneStep | null {
  for (const m of EARNINGS_MILESTONES) {
    if (firedIds.includes(m.id)) continue;
    if (lifeToDate >= m.thresholdUSD) return m;
  }
  return null;
}

/**
 * 连播间隙(主人 2026-08-06 拍板包 G P2#1 选项 a):一条看完到下一条弹出之间留 2.5s
 * 空窗,让首页内容(尤其「未上榜→激活设备」引导,给零设备用户的购买入口)有露出时机。
 * 只在 dismiss(看完/点掉)后生效;钱链路 park 是中断不是看完,不设冷却。
 * 导出供 selfcheck-milestone-queue.mjs 引用同一值(间隙已是机器不变量)。
 */
export const CELEBRATION_GAP_MS = 2_500;

export const useMilestones = defineStore("milestones", () => {
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  let boundKey = "default";
  // ── persisted (cross-session) ──
  const firedIds = ref<string[]>(hydrate(boundKey));

  // ── session-only (drives the celebration overlay) ──
  // `active` = the one currently on screen; `pendingCelebrations` = FIFO queue
  // behind it. 队列不是单槽:同一次结算连跨两级($100 → $500)必须两条都保留、
  // 离开钱链路后逐条补发(单槽会被第二条覆盖 → 前一级永久丢通知)。
  const active = ref<ActiveMilestone | null>(null);
  const pendingCelebrations = ref<ActiveMilestone[]>([]);

  function persist() {
    writeAccountRow<{ firedIds: string[] }>(ACCOUNTS_KEY, boundKey, { firedIds: firedIds.value });
  }

  /** 账号切换重绑:装载该账号的里程碑 fired 态;清掉会话庆祝弹窗与待发队列(别把 A 的庆祝弹给 B)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    firedIds.value = hydrate(boundKey);
    active.value = null;
    pendingCelebrations.value = [];
  }

  function isFired(id: string): boolean {
    return firedIds.value.includes(id);
  }

  function markFired(id: string) {
    if (firedIds.value.includes(id)) return;
    firedIds.value = [...firedIds.value, id];
    persist();
  }

  function reset() {
    firedIds.value = [];
    active.value = null;
    pendingCelebrations.value = [];
    persist();
  }

  /**
   * Queue a celebration for a crossed milestone. **UI-only** — the reward/bill
   * composition stays in the caller (App.vue) and is NEVER gated here: 钱链路
   * 期间照发奖励照记账,只有「弹不弹」由 advance() 按路由决定。
   */
  function show(milestone: ActiveMilestone) {
    pendingCelebrations.value = [...pendingCelebrations.value, milestone];
  }

  /**
   * Promote the next queued celebration onto the screen — the ONLY path from
   * queue → `active`. Two independent suspension axes: money-flow routes
   * (checkout / withdraw / trial), and `screenBusy` (another auto-popup holds
   * the screen — see store/popup-arbiter). On a money-flow route an
   * already-showing overlay is parked back at the FRONT of the queue
   * (programmatic redirect edge) so it replays in full after leaving; a busy
   * screen only blocks NEW promotions and never yanks a showing one.
   * Called on a short interval by milestone-celebration.vue with the current
   * route. Returns true when a celebration was promoted.
   */
  // dismiss 后的连播冷却时刻(CELEBRATION_GAP_MS 见模块顶部);park 路径不设值。
  let coolUntil = 0;

  function advance(route: string, screenBusy = false): boolean {
    if (isMoneyFlowRoute(route)) {
      if (active.value) {
        pendingCelebrations.value = [active.value, ...pendingCelebrations.value];
        active.value = null;
      }
      return false;
    }
    // 🔴 别的自动弹层正占着屏(store/popup-arbiter 的令牌)→ 与钱链路同样挂起。
    // 主人 2026-08-16 拍板 C1「永不顶替」:这里**只拦上屏,不收回已上屏的那条** ——
    // 已经在放的庆祝不该被后来的领取弹层打断(收回是钱链路 park 的语义,不是这里的)。
    // 实测缺陷:庆祝浮层 z 8900 画在领取弹层 z 790/800 之上并模糊背景数十秒,
    // 根因就是它此前只按路由挂起、对「屏上有没有别人」完全无感。
    // 判据由调用方(宿主组件)传入而不是本 store 自己去读 —— 保持 store 不互 import(P-031)。
    if (screenBusy) return false;
    if (active.value || pendingCelebrations.value.length === 0) return false;
    if (Date.now() < coolUntil) return false;
    const [next, ...rest] = pendingCelebrations.value;
    active.value = next;
    pendingCelebrations.value = rest;
    return true;
  }

  /** Close the celebration overlay (auto-called after the duration, or on tap). */
  function dismiss() {
    if (active.value) coolUntil = Date.now() + CELEBRATION_GAP_MS;
    active.value = null;
  }

  return {
    firedIds,
    active,
    pendingCelebrations,
    isFired,
    markFired,
    reset,
    show,
    advance,
    dismiss,
    bindAccount,
  };
});
