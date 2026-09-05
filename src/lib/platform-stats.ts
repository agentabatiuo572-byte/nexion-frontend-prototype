// Platform-level display stats — the SINGLE-SOURCE anchor for every
// platform-wide money/fleet figure rendered anywhere in the app
// (home pulse card, on-grid footer, ref social proof, onboarding intro,
// store global seed). Hand-written literals elsewhere are a regression;
// verify.sh `platform_stats_anchor` sentinel enforces this.
//
// Backend-replaceable: mock of `GET /api/platform/stats`. PROD returns the
// same accounting identity ({ activeDevices, totalPaidUsd, … }) server-side;
// the client keeps rendering the derived expressions below.
// Rework record: docs/changes/2026-07-24-platform-stats-single-anchor.md.

/** Fleet anchor — the ONLY platform device-count model (intro/trust/globe/home). */
export const FLEET_DEVICES = 28_432;

/** Published credible average yield tier, ~$24/device/day (PRD Q1–Q17 remediation). */
export const FLEET_AVG_DAILY_USD = 24;

/** Daily payout anchor: 28,432 × $24 = $682,368/day. */
export const DAILY_PAYOUT_USD = FLEET_DEVICES * FLEET_AVG_DAILY_USD;

/** ≈ $7.9/sec — live rate displays wobble around this, never accumulate. */
export const PAYOUT_PER_SEC_USD = DAILY_PAYOUT_USD / 86_400;

/* ────────────────────────────────────────────────────────────────────────────
 * 配置驱动的派生层(2026-08-06 独立审计 P1:「可配未接通派生链」)。
 *
 * 🔴 架构口径(以此为准,别信旧注释):上面的 const 是**编译期种子锚** ——
 *   mock 种子(platform-config.ts)从它取值,保证开箱两侧恒等;
 *   **运行时消费一律走下面的 *Of(ps) 函数**,读的是配置本体。
 *   运营改 fleetDevices 后,公布日产 / 每秒支付流 / 累计支付 / 各页舰队数字
 *   必须一起动(规格 ③/⑦「所有派生量继续从它派生,必须继续等值」)——
 *   谁绕开 *Of 直读 const,谁就是在同一屏造两套口径(审计实锤:设备数活着、$/sec 死钉)。
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PublicStatsShape {
  fleetDevices: number;
  onlineRatePct: number;
  onlineJitter: number;
  registeredUsersBase: number;
  registeredUsersMonthlyGrowthPct: number;
  registeredUsersAnchorAt: number;
  realUserCount: number;
  virtualUserCount: number;
  hashratePercentileTable: ReadonlyArray<{ tops: number; cumPct: number }>;
}

/**
 * 🔴 逐字段健康度(规格异常3:「负数/非数值→该项判不可用走异常2 占位」+「单项坏不拖垮」)。
 * 信任边界校验,仿 config.ts 的 feeConfigValid —— 判定收在这一处,消费点只问结论。
 * 合法域逐字段取自规格 [FEAT-HOME02b] ③ 的表,别在这儿自造更严限制(上一轮后台就栽在自造 ≤8 档)。
 */
export function publicStatsHealth(ps: PublicStatsShape | undefined | null): {
  fleetOk: boolean; rateOk: boolean; jitterOk: boolean;
  membersOk: boolean; devicesOk: boolean; rankOk: boolean;
} {
  if (!ps) return { fleetOk: false, rateOk: false, jitterOk: false, membersOk: false, devicesOk: false, rankOk: false };
  const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const inRange = (v: unknown, lo: number, hi: number) => fin(v) && v >= lo && v <= hi;
  // 🔴 逐字段拆开(R2 P2:钱链回退只该看 fleet,jitter 越域不该把合法舰队值拖回种子)。
  const fleetOk = inRange(ps.fleetDevices, 1_000, 1_000_000);
  const rateOk = inRange(ps.onlineRatePct, 50, 100);
  const jitterOk = inRange(ps.onlineJitter, 0, 500);
  const devicesOk = fleetOk && rateOk && jitterOk;
  const membersOk = inRange(ps.registeredUsersBase, 0, 100_000_000)
    && inRange(ps.registeredUsersMonthlyGrowthPct, 0, 50)
    && fin(ps.registeredUsersAnchorAt);
  const rankOk = inRange(ps.realUserCount, 0, 100_000_000)
    && inRange(ps.virtualUserCount, 0, 10_000_000);
  return { fleetOk, rateOk, jitterOk, membersOk, devicesOk, rankOk };
}

/** 舰队规模(配置本体;非法回种子由调用方按各自面的规矩决定,这里不吞)。 */
export function fleetDevicesOf(ps: PublicStatsShape): number { return ps.fleetDevices; }
/** 公布日产(USD/日)= 配置舰队 × 公布档。 */
export function dailyPayoutUsdOf(ps: PublicStatsShape): number { return ps.fleetDevices * FLEET_AVG_DAILY_USD; }
/** 每秒支付流(USD/s)。 */
export function payoutPerSecUsdOf(ps: PublicStatsShape): number { return dailyPayoutUsdOf(ps) / 86_400; }
/** 月支付额(USD/月)。 */
export function monthlyPayoutUsdOf(ps: PublicStatsShape): number { return dailyPayoutUsdOf(ps) * 30; }

/**
 * 注册用户展示值:从锚点按月增速**推算**,不累加、不回退(规格 FEAT-HOME02 ③,
 * 与上面 PAYOUT 同范式)。刷新页面得到同一时刻同一值;运营改基数即重置锚点。
 * 该值只用于营销展示；排名分母使用服务端 realUserCount，避免公布基数影响真实资格口径。
 */
export function derivedRegisteredUsers(
  ps: { registeredUsersBase: number; registeredUsersMonthlyGrowthPct: number; registeredUsersAnchorAt: number },
  now: number,
): number {
  const months = Math.max(0, (now - ps.registeredUsersAnchorAt) / (30 * 24 * 3_600_000));
  const v = ps.registeredUsersBase * Math.pow(1 + ps.registeredUsersMonthlyGrowthPct / 100, months);
  return Number.isFinite(v) ? Math.floor(v) : Number.NaN;
}

/** ≈ $20.5M — the "this month" round expression (30-day anchor month). */
export const MONTHLY_PAYOUT_USD = DAILY_PAYOUT_USD * 30;

/** This-month new joiners — people-role mock (ref page + share poster ×3
 *  locales). Deliberately NOT the fleet figure: 28,432 is devices-only. */
export const MONTHLY_NEW_JOINERS = 41_286;

// Cumulative payout, time-anchored (moved verbatim from intro.vue; see
// docs/changes/2026-07-24-intro-stats-cumulative.md). Seed = growth-curve
// integral (~187 equivalent days at today's rate), NOT fleet × age.
const PAID_ANCHOR_MS = Date.UTC(2026, 6, 24);
const PAID_CUMULATIVE_SEED_USD = 127_438_905;
const PAID_RATE_PER_MS = DAILY_PAYOUT_USD / 86_400_000;

/** All-time paid out — recomputed from the time anchor (derive, don't
 *  accumulate) so the total can never regress across visits/reloads. */
export function paidCumulativeNow(): number {
  return Math.round(PAID_CUMULATIVE_SEED_USD + Math.max(0, Date.now() - PAID_ANCHOR_MS) * PAID_RATE_PER_MS);
}

// 🔴 这里**刻意没有** paidCumulativeNowOf(第二次结构反思·族B):累计支付是时间积分,
//   背着历史 —— 按「当前配置 × 全段 elapsed」派生,运营调低舰队它就整段回退(R2 审计 C5
//   实锤,上一版就这么写的)。积分类 = 已沉淀段 + 当前参数 × 增量段;mock 无参数变更
//   时点存储,沉淀段以编译期锚斜率计(paidCumulativeNow),PROD 由服务端累计。
//   谁想加回配置版,先回答「参数变更时点存在哪」。

/**
 * 紧凑缩写(规格异常6):超长数字不撑破值槽、不换行断字。
 * 🔴 边界经独立审计校正(R2 二次校正口径):旧写法在 999,950–999,999 输出「1000.0K」。
 *   换档阈值取 999_500/999_500_000 —— 即「按上一档显示会 ≥999.5 从而肉眼四舍五入进位」
 *   的最小值,自该点起提前进 M/B 档;≥1e9 补 B 档。阈值=实现,别再按 999,950 复述。
 */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n >= 999_500_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 999_500) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 99_950) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
