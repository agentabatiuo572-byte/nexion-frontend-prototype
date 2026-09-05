import { defineStore } from "pinia";
import { ref } from "vue";
import type { VRank } from "./v-rank";

/**
 * Ported from Nexion-prototype/lib/v3/leadership-pool.ts (zustand → Pinia).
 * ⚠️ MOCK-ONLY canon (V_VOTES + GLOBAL_V_DISTRIBUTION + GMV base).
 * Production (backend-replaceable, 字段 1:1):
 *   GET /api/config/leadership-pool → { poolRatio, weeklyGmvUsdt, monthlyCapUsdt, unlockRank, voteWeights }  (PRD §9.11c.1)
 *   GET /api/pool/state            → { globalVDistribution, currentWeekPoolUsdt, history }  (PRD §8.5.2)
 * Client display only; server computes the authoritative mySharePct + payouts.
 *
 * 玩法 — 全球领导奖池(头部集中虹吸,真派生):
 *   每周平台 GMV 的 poolRatio(默认 5%) 注入池子 → poolUSDT = weeklyGmv × ratio。
 *   V3+ 领袖按指数票权(V3=1 … V12=512, 每升一阶翻倍)分配,share = myVotes / totalVotes。
 *   头部集中是「真事实」而非文案: 高阶领袖稀少但指数票权碾压,顶部 10 名领袖
 *   (恰为 V8 星上将及以上)凭票权分走约 topConcentrationPct(当前 seed ≈61%) 奖池。
 *   该集中度由 (分布 × 票权) 运行时派生,永不硬编码 —— 调 seed/权重即同步变。
 * 结算: 周日 23:59 UTC 快照 → 周一 00:00 UTC 自动派发(周界对齐周一)。
 * 纯派生 store(无 mutation)→ 直接 seed,不需持久化。
 */

const ONE_DAY = 86400 * 1000;
const ONE_WEEK = 7 * ONE_DAY;

/** ===== 单源 canon(运营可配项的前端镜像;真后台从 /api/config/leadership-pool 派生) ===== */
/** 周平台 GMV 基数(USDT)。池额由它 × 比例派生,不再三处硬编码。 */
export const WEEKLY_GMV_USDT = 9_746_420;
/** 奖池比例(周 GMV)。运营可配 F.pool.ratio。 */
export const POOL_RATIO = 0.05;
/** 月度预留上限(运营预算护栏)。运营可配 F.pool.monthlyCap。当前月池 ~$2.11M < cap,非约束。 */
export const MONTHLY_CAP_USDT = 2_600_000;
/** 参与门槛 = 票权首个非零 = V3。运营经 F1 配 V3 晋升门槛。 */
export const UNLOCK_RANK: VRank = 3;
/** 集中度展示口径:顶部 N 名领袖占池比(派生)。 */
export const POOL_TOP_N = 10;

/** V 级 → 票数(指数翻倍)。单源 = v-rank.ts 各阶 leadershipVotes,二者必一致。 */
export const V_VOTES: Record<VRank, number> = {
  0: 0, 1: 0, 2: 0,
  3: 1, 4: 2, 5: 4, 6: 8, 7: 16, 8: 32, 9: 64, 10: 128, 11: 256, 12: 512,
};

/**
 * 全网 V 级人口分布(seed)。真实领袖金字塔:高阶稀少但存在,让指数票权真正集中到头部。
 * 实算(node 验证): 合格领袖 498 · 总票 2100 · 顶部 10 名(=V8+ 10 人)分走 ≈61% 奖池。
 */
const GLOBAL_V_DISTRIBUTION: Record<VRank, number> = {
  0: 84231,   // 大多数(学员)
  1: 12483,
  2: 3247,
  3: 360,     // ↓ 以下为 V3+ 合格领袖(共 498)
  4: 84,
  5: 27,
  6: 11,
  7: 6,
  8: 4,
  9: 2,
  10: 2,
  11: 1,
  12: 1,
};

export interface LeadershipPayout {
  weekId: string;
  weekStartTs: number;
  poolUSDT: number;
  myVotes: number;
  totalVotes: number;
  mySharePct: number;
  payoutUSDT: number;
}

const now = Date.now();

/**
 * 本周一 00:00 UTC 的时间戳(领导奖池周期锚点)。
 * ⚠️ 不可用 now - (now % ONE_WEEK):Unix 纪元 1970-01-01 是周四,
 * 该式会把周界对齐到周四 00:00 UTC。v3 领导奖池周期是
 * 周一 00:00 UTC 开新池 → 周日 23:59 UTC 快照(PRD §8.5.3)。
 */
function weekStartMondayUTC(ts: number): number {
  const d = new Date(ts);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // 周一→0 ... 周日→6
  const midnightUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnightUTC - daysSinceMonday * ONE_DAY;
}

const weekStart = weekStartMondayUTC(now);

export const useLeadershipPool = defineStore("leadershipPool", () => {
  const globalVDistribution = ref<Record<VRank, number>>(GLOBAL_V_DISTRIBUTION);
  /** 周池额 = 周 GMV × 比例(派生,单源)。 */
  const currentWeekPoolUSDT = ref(Math.round(WEEKLY_GMV_USDT * POOL_RATIO)); // 487_321
  const history = ref<LeadershipPayout[]>([
    {
      weekId: "w-2026-25",
      weekStartTs: weekStart - 1 * ONE_WEEK,
      poolUSDT: 471_540,
      myVotes: 0, totalVotes: 2_064,
      mySharePct: 0, payoutUSDT: 0,
    },
    {
      weekId: "w-2026-24",
      weekStartTs: weekStart - 2 * ONE_WEEK,
      poolUSDT: 458_902,
      myVotes: 0, totalVotes: 2_018,
      mySharePct: 0, payoutUSDT: 0,
    },
  ]);

  function totalVotes() {
    const dist = globalVDistribution.value;
    let sum = 0;
    for (let v = UNLOCK_RANK; v <= 12; v++) {
      sum += (dist[v as VRank] ?? 0) * V_VOTES[v as VRank];
    }
    return sum;
  }

  function myVotes(myRank: VRank) {
    return V_VOTES[myRank];
  }

  function mySharePct(myRank: VRank) {
    const total = totalVotes();
    if (total === 0) return 0;
    return myVotes(myRank) / total;
  }

  function myProjectedPayout(myRank: VRank) {
    return currentWeekPoolUSDT.value * mySharePct(myRank);
  }

  /** 合格领袖人数(V≥UNLOCK_RANK 全网人头)。 */
  function qualifierCount() {
    const dist = globalVDistribution.value;
    let n = 0;
    for (let v = UNLOCK_RANK; v <= 12; v++) n += dist[v as VRank] ?? 0;
    return n;
  }

  /**
   * 顶部 N 名领袖占池比(0-1,派生)。高阶 → 高票,从最高阶向下取满 N 人即得真实头部集中度。
   * 这是「头部集中」叙事的真值来源,随 seed/票权变,绝不硬编码。
   */
  function topConcentrationPct(topN: number = POOL_TOP_N) {
    const dist = globalVDistribution.value;
    const total = totalVotes();
    if (total === 0) return 0;
    let remaining = topN;
    let sum = 0;
    for (let v = 12; v >= UNLOCK_RANK; v--) {
      const c = dist[v as VRank] ?? 0;
      if (c <= 0) continue;
      const take = Math.min(c, remaining);
      sum += take * V_VOTES[v as VRank];
      remaining -= take;
      if (remaining <= 0) break;
    }
    return sum / total;
  }

  function nextPayoutTs() {
    return weekStart + ONE_WEEK;
  }

  return {
    globalVDistribution, currentWeekPoolUSDT, history,
    totalVotes, myVotes, mySharePct, myProjectedPayout,
    qualifierCount, topConcentrationPct, nextPayoutTs,
  };
});
