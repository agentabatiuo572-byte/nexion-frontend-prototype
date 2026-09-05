import { ONE_DAY_MS } from "./server-time";
import type { TrialConfig } from "./trial-config";

/**
 * Trial time-boundary — the SINGLE invariant for FEAT-TRIAL02 clock decisions.
 *
 * 2026-08-03 缺陷族根治(1×P0 + 3×P1 同根:各调用点各自比对时间边界,口径漂移):
 * 所有「现在这一刻试用机器该处于什么状态」的判定收敛到 `resolveTrialAt` 一个纯函数,
 * poll / convert / eligibility / 影子累计全部改调它,任何调用点不得再自行比对边界。
 *
 * Invariant rules (每条都有 scripts/selfcheck-trial-boundary.mjs 固定靶):
 *  1. 级联:一次调用走完所有已越过的边界(active→grace→ended 一口气),不再一格一停
 *     —— 离线跨过宽限期很久的用户,第一次 resolve 就落到 ended(P0:越界转化关死)。
 *  2. 冻结窗口:影子累计上限 = 用户 start() 时冻结的 `expiresAt − startedAt`,
 *     永不读 live `cfg.trialDays` —— 后台改档不追溯影响存量用户(调大不多送/调小不少给)。
 *  3. 终态时刻:边界推进产生的 `finishedAt` = 真实越过的边界值(graceEndsAt),不是 now。
 *  4. 缺边界就地补齐:存量行 `graceEndsAt = null` 用 `expiresAt + graceDays` 补;
 *     补不出来(前置边界也缺)则 fail-closed 立即收敛到 ended —— 绝不留永久敞口。
 *  5. 终态不可变:converted / ended(以及 none)原样返回同一引用,一个字段都不动
 *     —— 调用方以 `resolved !== row` 判断是否需要落盘。
 *
 * 纯函数、零 vue/pinia/uni 依赖 —— scripts/selfcheck-trial-boundary.mjs 直接以
 * node 执行本模块跑全迁移矩阵固定靶(与 deposits-core.ts 同模式)。
 */

export type TrialStatus = "none" | "active" | "grace" | "ended" | "converted";

/** Full persisted row shape (= free-trial store 的 FreeTrialState,单源在此)。 */
export interface TrialRowSnapshot {
  status: TrialStatus;
  startedAt: number | null;
  /** Trial-period end (server-canonical name per spec ③; legacy rows stored `activeEndsAt`). */
  expiresAt: number | null;
  graceEndsAt: number | null;
  finishedAt: number | null;
  shadowFrozenAtUSD: number;
  shadowFrozenAtNEX: number;
  /** Legacy card-era trial migrated onto the cardless rules (spec 异常6) — page shows a notice. */
  legacyCardMigrated: boolean;
}

/** The config slice boundary math needs — full TrialConfig satisfies it structurally. */
export type TrialBoundaryConfig = Pick<
  TrialConfig,
  "trialDays" | "graceDays" | "shadowDailyUSD" | "shadowDailyNEX"
>;

/**
 * Shadow accrued at `now`, capped by the row's FROZEN window (`expiresAt − startedAt`)
 * — the one formula shared by live display, the active→grace freeze, and the
 * legacy-migration frozen-shadow backfill (规则 2 的唯一实现点)。
 * Rows missing either anchor accrue 0 (fail-closed: no invented credit).
 */
export function accruedShadow(
  row: Pick<TrialRowSnapshot, "startedAt" | "expiresAt">,
  now: number,
  cfg: TrialBoundaryConfig,
): { usd: number; nex: number } {
  if (row.startedAt === null || row.expiresAt === null) return { usd: 0, nex: 0 };
  const windowMs = Math.max(0, row.expiresAt - row.startedAt);
  const elapsedMs = Math.min(windowMs, Math.max(0, now - row.startedAt));
  return {
    usd: +(cfg.shadowDailyUSD * (elapsedMs / ONE_DAY_MS)).toFixed(2),
    nex: +(cfg.shadowDailyNEX * (elapsedMs / ONE_DAY_MS)).toFixed(0),
  };
}

/**
 * Resolve what the trial machine looks like at `now`. Pure: never persists,
 * never touches money/devices/bills (spec ④ poll 只翻状态在此同样成立)。
 * Returns the SAME reference when nothing changed(调用方据此决定要不要落盘);
 * otherwise a fresh row —— 输入行永不被就地修改。
 */
export function resolveTrialAt(
  row: TrialRowSnapshot,
  now: number,
  cfg: TrialBoundaryConfig,
): TrialRowSnapshot {
  // 规则 5:终态(converted/ended)与未开始(none)原样返回 —— resolver 永不改动。
  if (row.status !== "active" && row.status !== "grace") return row;

  const r: TrialRowSnapshot = { ...row };
  let changed = false;

  // ── 规则 4a:缺失边界从前置边界补齐(存量卡时代行)──
  if (r.status === "active" && r.expiresAt === null && r.startedAt !== null) {
    r.expiresAt = r.startedAt + cfg.trialDays * ONE_DAY_MS;
    changed = true;
  }
  if (r.graceEndsAt === null && r.expiresAt !== null) {
    r.graceEndsAt = r.expiresAt + cfg.graceDays * ONE_DAY_MS;
    changed = true;
  }

  // ── 规则 4b:fail-closed —— 本状态的推进边界补齐后仍不可知,立即收敛到 ended,
  //    绝不留「永远卡在计时态」的敞口(finishedAt 无真实边界可取,只能取 now)。──
  const boundaryKnown = r.status === "active" ? r.expiresAt !== null : r.graceEndsAt !== null;
  if (!boundaryKnown) {
    r.status = "ended";
    r.finishedAt = now;
    return r;
  }

  // ── 规则 1:级联走完所有已越过的边界(一次调用,不一格一停)──
  if (r.status === "active" && r.expiresAt !== null && now >= r.expiresAt) {
    // 规则 2:在边界时刻按冻结窗口定格影子值(active 行 frozen 恒为 0,在此一次写定)。
    const frozen = accruedShadow(r, r.expiresAt, cfg);
    r.status = "grace";
    r.shadowFrozenAtUSD = frozen.usd;
    r.shadowFrozenAtNEX = frozen.nex;
    changed = true;
  }
  if (r.status === "grace" && r.graceEndsAt !== null && now >= r.graceEndsAt) {
    r.status = "ended";
    // 规则 3:终态时刻 = 真实越过的边界值,不是调用时刻 now。
    r.finishedAt = r.graceEndsAt;
    changed = true;
  }

  return changed ? r : row;
}
