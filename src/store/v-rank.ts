import { defineStore } from "pinia";
import { ref } from "vue";
import { remoteApiEnabled, vRankApi } from "@/api/runtime";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";
import { normalizeAccountKey } from "@/store/account-cloud";
import { readAccountRow, writeAccountRow } from "@/store/account-scoped-storage";

/**
 * Ported from Nexion-prototype/lib/v3/v-rank.ts (zustand persist → Pinia + uni storage).
 * ⚠️ MOCK-ONLY V_RANKS table (13-tier ladder, conditions + bonuses + prizes).
 * Production: GET /api/config/v-ranks returns server-authoritative ladder.
 * Promotion judging (nextRankProgress / nextRankGap) is preview-only; server is
 * the sole canonical authority for V-rank promotion (PRD §13.2).
 *
 * V0→V12 13 阶,每升一阶解锁 unilevel 深度 +1 / 平级奖(V3+) / 领导池权重 / 培育奖 NEX。
 * 心理设计:V0→V3 易("上钩"),V3→V6 拼命,V7+ 画大饼,V12 永远没人到。
 * 奖励为可配 NEX(cultivationBonus);实物奖品已删(与运营后台 F1 同步,2026-06)。
 */

export type VRank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface VRankConditions {
  selfBuyUSD?: number;        // 自买设备累计
  directRefs?: number;        // 直推数
  teamVolumeUSD?: number;     // 团队总业绩
  vDownlines?: Partial<Record<VRank, number>>; // 下面需要 N 个 V 级
}

export interface VRankDef {
  v: VRank;
  title: string;              // 英文头衔
  cnTitle: string;            // 中文头衔
  conditions: VRankConditions;
  directBonus: number;        // L1 直推奖比例
  unilevelDepth: number;      // unilevel 覆盖深度 (1=只有L1, 7=L1-L7)
  peerBonus: number;          // 平级奖比例
  leadershipVotes: number;    // 领导池票数(单源,与 leadership-pool.ts V_VOTES 一致)
  cultivationBonus: number;   // 培育至此 V,上线拿 NEX
}

export const V_RANKS: VRankDef[] = [
  {
    v: 0, title: "Cadet", cnTitle: "学员",
    conditions: {}, directBonus: 0.05, unilevelDepth: 1,
    peerBonus: 0, leadershipVotes: 0,
    cultivationBonus: 0,
  },
  {
    v: 1, title: "Pilot", cnTitle: "飞行员",
    conditions: { selfBuyUSD: 299, directRefs: 3 },
    directBonus: 0.10, unilevelDepth: 2,
    peerBonus: 0, leadershipVotes: 0,
    cultivationBonus: 500,
  },
  {
    v: 2, title: "Operator", cnTitle: "操作员",
    conditions: { teamVolumeUSD: 5000 },
    directBonus: 0.10, unilevelDepth: 3,
    peerBonus: 0, leadershipVotes: 0,
    cultivationBonus: 2000,
  },
  {
    v: 3, title: "Captain", cnTitle: "舰长",
    conditions: { teamVolumeUSD: 20_000, vDownlines: { 1: 2 } },
    directBonus: 0.10, unilevelDepth: 4,
    peerBonus: 0.05, leadershipVotes: 1,
    cultivationBonus: 10_000,
  },
  {
    v: 4, title: "Commander", cnTitle: "指挥官",
    conditions: { teamVolumeUSD: 50_000, vDownlines: { 2: 3 } },
    directBonus: 0.10, unilevelDepth: 5,
    peerBonus: 0.05, leadershipVotes: 2,
    cultivationBonus: 50_000,
  },
  {
    v: 5, title: "Wing Leader", cnTitle: "翼领",
    conditions: { teamVolumeUSD: 150_000, vDownlines: { 3: 4 } },
    directBonus: 0.10, unilevelDepth: 6,
    peerBonus: 0.05, leadershipVotes: 4,
    cultivationBonus: 200_000,
  },
  {
    v: 6, title: "Squadron", cnTitle: "中队长",
    conditions: { teamVolumeUSD: 500_000, vDownlines: { 4: 5 } },
    directBonus: 0.10, unilevelDepth: 7,
    peerBonus: 0.05, leadershipVotes: 8,
    cultivationBonus: 800_000,
  },
  {
    v: 7, title: "Fleet Cmdr", cnTitle: "舰队司令",
    conditions: { teamVolumeUSD: 1_000_000, vDownlines: { 5: 6 } },
    directBonus: 0.10, unilevelDepth: 8,
    peerBonus: 0.05, leadershipVotes: 16,
    cultivationBonus: 3_200_000,
  },
  {
    v: 8, title: "Star Admiral", cnTitle: "星上将",
    conditions: { teamVolumeUSD: 3_000_000, vDownlines: { 6: 7 } },
    directBonus: 0.10, unilevelDepth: 9,
    peerBonus: 0.05, leadershipVotes: 32,
    cultivationBonus: 10_000_000,
  },
  {
    v: 9, title: "Galaxy Lord", cnTitle: "星河领主",
    conditions: { teamVolumeUSD: 10_000_000 },
    directBonus: 0.10, unilevelDepth: 10,
    peerBonus: 0.05, leadershipVotes: 64,
    cultivationBonus: 0,
  },
  {
    v: 10, title: "NexGrid Founder", cnTitle: "联合创始",
    conditions: { teamVolumeUSD: 30_000_000 },
    directBonus: 0.10, unilevelDepth: 99,
    peerBonus: 0.05, leadershipVotes: 128,
    cultivationBonus: 0,
  },
  {
    v: 11, title: "Cosmic Sovereign", cnTitle: "宇宙至尊",
    conditions: { teamVolumeUSD: 100_000_000 },
    directBonus: 0.10, unilevelDepth: 99,
    peerBonus: 0.05, leadershipVotes: 256,
    cultivationBonus: 0,
  },
  {
    v: 12, title: "Singularity", cnTitle: "奇点",
    conditions: { teamVolumeUSD: 500_000_000 },
    directBonus: 0.10, unilevelDepth: 99,
    peerBonus: 0.05, leadershipVotes: 512,
    cultivationBonus: 0,
  },
];

/**
 * Data fields the pure progress functions read. The Pinia store is structurally
 * compatible (exposes these as unwrapped properties), so `nextRankProgress(store)`
 * / `nextRankGap(store)` work directly.
 */
export interface VRankData {
  myRank: VRank;
  selfBuyUSD: number;
  directRefs: number;
  teamVolumeUSD: number;
  vDownlineCounts: Partial<Record<VRank, number>>;
}

export type VRankProgressPatch = Partial<Omit<VRankData, "myRank">>;

const EMPTY_V_RANK: VRankDef = {
  v: 0, title: "", cnTitle: "", conditions: {}, directBonus: 0,
  unilevelDepth: 0, peerBonus: 0, leadershipVotes: 0, cultivationBonus: 0,
};

function canonicalRank(row: Awaited<ReturnType<typeof vRankApi.ladder>>["ranks"][number]): VRankDef {
  const conditions: VRankConditions = {};
  if (row.selfBuyUSD !== undefined) conditions.selfBuyUSD = row.selfBuyUSD;
  if (row.directRefs !== undefined) conditions.directRefs = row.directRefs;
  if (row.teamVolumeUSD !== undefined) conditions.teamVolumeUSD = row.teamVolumeUSD;
  if (row.requiredDownlineRank !== undefined && row.requiredDownlineCount !== undefined) {
    conditions.vDownlines = { [row.requiredDownlineRank as VRank]: row.requiredDownlineCount };
  }
  return {
    v: row.v as VRank, title: row.title, cnTitle: row.cnTitle, conditions,
    directBonus: row.directBonus, unilevelDepth: row.unilevelDepth, peerBonus: row.peerBonus,
    leadershipVotes: row.leadershipVotes, cultivationBonus: row.cultivationBonus,
  };
}

// 等级是账号资产:per-account 行表(P2-8 设备级泄漏修复)。旧设备级单键
// "nexgrid-v-rank-v1" 不迁移 —— 存量无账号归属,迁给任何账号都是臆断,就地废弃。
const ACCOUNTS_KEY = "nexgrid-v-rank-accounts-v1"; // { [accountKey]: VRankData }

const DEFAULT_V_RANK: VRankData = {
  // 新账号 seed 人设:V2 Operator(刚到,正冲 V3)—— 与 account-cloud
  // createSeedSnapshot 的统一 seed 口径一致。
  myRank: 2,
  selfBuyUSD: 1198,        // S1 + Pro 已买
  directRefs: 5,
  teamVolumeUSD: 5_240,    // 刚过 V2 门槛
  vDownlineCounts: { 1: 3 }, // 下面有 3 个 V1
};

function hydrate(accountKey: string): VRankData {
  const row = readAccountRow<Partial<VRankData>>(ACCOUNTS_KEY, accountKey);
  if (row && typeof row.myRank === "number") {
    return { ...DEFAULT_V_RANK, ...row };
  }
  return { ...DEFAULT_V_RANK };
}

export const useVRank = defineStore("vRank", () => {
  // 账号维度。boot 期落 "default";账号确定后由 lib/account-scope 的
  // rebindAccountScopedStores 统一重绑(P-031 store 不互 import)。
  let boundKey = "default";
  const init = remoteApiEnabled ? { myRank: 0 as VRank, selfBuyUSD: 0, directRefs: 0, teamVolumeUSD: 0, vDownlineCounts: {} } : hydrate(boundKey);
  const myRank = ref<VRank>(init.myRank);
  const selfBuyUSD = ref(init.selfBuyUSD);
  const directRefs = ref(init.directRefs);
  const teamVolumeUSD = ref(init.teamVolumeUSD);
  const vDownlineCounts = ref<Partial<Record<VRank, number>>>(init.vDownlineCounts);
  const ladder = ref<VRankDef[]>(remoteApiEnabled ? [] : V_RANKS);
  const remoteAccountEpoch = createRemoteAccountEpoch(boundKey);

  function clearRemoteFacts(): void {
    myRank.value = 0;
    selfBuyUSD.value = 0;
    directRefs.value = 0;
    teamVolumeUSD.value = 0;
    vDownlineCounts.value = {};
    ladder.value = [];
  }

  function persist() {
    if (remoteApiEnabled) return;
    writeAccountRow<VRankData>(ACCOUNTS_KEY, boundKey, {
      myRank: myRank.value,
      selfBuyUSD: selfBuyUSD.value,
      directRefs: directRefs.value,
      teamVolumeUSD: teamVolumeUSD.value,
      vDownlineCounts: vDownlineCounts.value,
    });
  }

  /** 账号切换重绑:装载该账号的等级行(变更处处即时 persist,旧账号无需先落盘)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    if (remoteApiEnabled) {
      remoteAccountEpoch.bind(boundKey);
      clearRemoteFacts();
      void refreshCanonicalVRank(remoteAccountEpoch.snapshot());
      return;
    }
    const next = hydrate(boundKey);
    myRank.value = next.myRank;
    selfBuyUSD.value = next.selfBuyUSD;
    directRefs.value = next.directRefs;
    teamVolumeUSD.value = next.teamVolumeUSD;
    vDownlineCounts.value = next.vDownlineCounts;
  }

  async function refreshCanonicalVRank(request: RemoteAccountRequest = remoteAccountEpoch.snapshot()) {
    if (!remoteApiEnabled) return;
    try {
      const [remoteLadder, remoteCurrent] = await Promise.all([vRankApi.ladder(), vRankApi.current()]);
      if (!remoteAccountEpoch.isCurrent(request)) return;
      ladder.value = remoteLadder.ranks.map(canonicalRank);
      myRank.value = Number(remoteCurrent.rankCode.slice(1)) as VRank;
      selfBuyUSD.value = remoteCurrent.progress.selfBuyUSD;
      directRefs.value = remoteCurrent.progress.directRefs;
      teamVolumeUSD.value = remoteCurrent.progress.teamVolumeUSD;
      vDownlineCounts.value = Object.fromEntries(
        Object.entries(remoteCurrent.progress.vDownlineCounts).map(([rank, count]) => [Number(rank) as VRank, count]),
      ) as Partial<Record<VRank, number>>;
    } catch {
      if (remoteAccountEpoch.isCurrent(request)) clearRemoteFacts();
    }
  }

  function setMyRank(v: VRank) {
    if (remoteApiEnabled) return;
    myRank.value = v;
    persist();
  }
  function setProgress(p: VRankProgressPatch) {
    if (remoteApiEnabled) return;
    if (p.selfBuyUSD !== undefined) selfBuyUSD.value = p.selfBuyUSD;
    if (p.directRefs !== undefined) directRefs.value = p.directRefs;
    if (p.teamVolumeUSD !== undefined) teamVolumeUSD.value = p.teamVolumeUSD;
    if (p.vDownlineCounts !== undefined) vDownlineCounts.value = p.vDownlineCounts;
    persist();
  }

  return { myRank, selfBuyUSD, directRefs, teamVolumeUSD, vDownlineCounts, ladder, setMyRank, setProgress, bindAccount, refreshCanonicalVRank };
});

/**
 * 一条到下一阶的缺口。
 *
 * 🔴 返回**结构**不返回句子:原来这里直接拼英文(`Self-buy $299 more`),两个消费点原样渲染,
 * 于是中文 / 越南语界面直出英文,而 `t.rank.need*` 四条三语文案早写好却是死键(2026-08-17
 * 独立验收抓到)。同文件下面的 `PrimaryGap` 早就是这个形状 —— 措辞归 UI 层
 * (`src/lib/v-rank-copy.ts` 的 `rankGapText`),store 只给事实。
 */
export type RankGap =
  | { kind: "selfBuy"; amount: number }
  | { kind: "directRefs"; n: number }
  | { kind: "teamVolume"; amount: number }
  // 只给档位号,头衔名由 copy 层按语言解析(`lib/v-rank-copy` 的 rankTitle)——
  // store 存一份英文 title 就等于把「中文界面显示什么」定死在数据层。
  | { kind: "vDownlines"; n: number; vLevel: number };

/** 计算到下一阶的进度(0-1) */
export function nextRankProgress(state: VRankData, ladder: VRankDef[] = V_RANKS): {
  next: VRankDef | null;
  progressPct: number;
  missing: RankGap[];
} {
  const next = ladder[state.myRank + 1];
  if (!next) return { next: null, progressPct: 1, missing: [] };
  const c = next.conditions;
  const missing: RankGap[] = [];
  const checks: number[] = [];

  if (c.selfBuyUSD) {
    checks.push(Math.min(1, state.selfBuyUSD / c.selfBuyUSD));
    if (state.selfBuyUSD < c.selfBuyUSD) {
      missing.push({ kind: "selfBuy", amount: c.selfBuyUSD - state.selfBuyUSD });
    }
  }
  if (c.directRefs) {
    checks.push(Math.min(1, state.directRefs / c.directRefs));
    if (state.directRefs < c.directRefs) {
      missing.push({ kind: "directRefs", n: c.directRefs - state.directRefs });
    }
  }
  if (c.teamVolumeUSD) {
    checks.push(Math.min(1, state.teamVolumeUSD / c.teamVolumeUSD));
    if (state.teamVolumeUSD < c.teamVolumeUSD) {
      missing.push({ kind: "teamVolume", amount: c.teamVolumeUSD - state.teamVolumeUSD });
    }
  }
  if (c.vDownlines) {
    for (const [v, n] of Object.entries(c.vDownlines)) {
      const have = state.vDownlineCounts[Number(v) as VRank] ?? 0;
      checks.push(Math.min(1, have / n));
      if (have < n) missing.push({ kind: "vDownlines", n: n - have, vLevel: Number(v) });
    }
  }

  const progressPct = checks.length
    ? checks.reduce((a, b) => a + b, 0) / checks.length
    : 1;
  return { next, progressPct, missing };
}

export type PrimaryGap =
  | { kind: "teamVolume"; remaining: number; progress: number }
  | { kind: "selfBuy"; remaining: number; progress: number }
  | { kind: "directRefs"; remaining: number; progress: number }
  | { kind: "vDownlines"; remaining: number; progress: number; vLevel: VRank };

export type PerkUnlock =
  | { kind: "peerBonusUnlock"; rate: number }
  | { kind: "leadershipUnlock"; votes: number }
  | { kind: "cultivationJump"; from: number; to: number }
  | { kind: "directBonusUp"; from: number; to: number }
  | { kind: "unilevelDepthUp"; from: number; to: number };

export interface NextRankGapInfo {
  next: VRankDef | null;
  progressPct: number;
  primaryGap: PrimaryGap | null;
  unmetCount: number;
  topUnlocks: PerkUnlock[];
}

// Emotional weight per perk kind. Higher = surfaced sooner in the UI.
const PERK_WEIGHT: Record<PerkUnlock["kind"], number> = {
  peerBonusUnlock: 100,
  leadershipUnlock: 95,
  cultivationJump: 70,
  directBonusUp: 60,
  unilevelDepthUp: 30,
};

const TOP_UNLOCKS_CAP = 2; // UI keeps perk line single-line at 414w mobile

export function nextRankGap(state: VRankData, ladder: VRankDef[] = V_RANKS): NextRankGapInfo {
  const current = ladder[state.myRank] ?? EMPTY_V_RANK;
  const next = ladder[state.myRank + 1];
  if (!next) {
    return {
      next: null,
      progressPct: 1,
      primaryGap: null,
      unmetCount: 0,
      topUnlocks: [],
    };
  }

  const c = next.conditions;
  const gaps: PrimaryGap[] = [];
  const checks: number[] = [];

  if (c.selfBuyUSD) {
    const progress = Math.min(1, state.selfBuyUSD / c.selfBuyUSD);
    checks.push(progress);
    if (state.selfBuyUSD < c.selfBuyUSD) {
      gaps.push({ kind: "selfBuy", remaining: c.selfBuyUSD - state.selfBuyUSD, progress });
    }
  }
  if (c.directRefs) {
    const progress = Math.min(1, state.directRefs / c.directRefs);
    checks.push(progress);
    if (state.directRefs < c.directRefs) {
      gaps.push({ kind: "directRefs", remaining: c.directRefs - state.directRefs, progress });
    }
  }
  if (c.teamVolumeUSD) {
    const progress = Math.min(1, state.teamVolumeUSD / c.teamVolumeUSD);
    checks.push(progress);
    if (state.teamVolumeUSD < c.teamVolumeUSD) {
      gaps.push({ kind: "teamVolume", remaining: c.teamVolumeUSD - state.teamVolumeUSD, progress });
    }
  }
  if (c.vDownlines) {
    for (const [v, n] of Object.entries(c.vDownlines)) {
      const vLevel = Number(v) as VRank;
      const have = state.vDownlineCounts[vLevel] ?? 0;
      const progress = Math.min(1, have / n);
      checks.push(progress);
      if (have < n) {
        gaps.push({ kind: "vDownlines", remaining: n - have, progress, vLevel });
      }
    }
  }

  const progressPct = checks.length
    ? checks.reduce((a, b) => a + b, 0) / checks.length
    : 1;

  const primaryGap = gaps.length
    ? gaps.reduce((worst, g) => (g.progress < worst.progress ? g : worst))
    : null;

  const unlocks: PerkUnlock[] = [];
  if (current.peerBonus === 0 && next.peerBonus > 0) {
    unlocks.push({ kind: "peerBonusUnlock", rate: next.peerBonus });
  }
  if (current.leadershipVotes === 0 && next.leadershipVotes > 0) {
    unlocks.push({ kind: "leadershipUnlock", votes: next.leadershipVotes });
  }
  const cultivationNewUnlock = current.cultivationBonus === 0 && next.cultivationBonus > 0;
  const cultivationBigJump =
    current.cultivationBonus > 0 && next.cultivationBonus > current.cultivationBonus * 2;
  if (cultivationNewUnlock || cultivationBigJump) {
    unlocks.push({ kind: "cultivationJump", from: current.cultivationBonus, to: next.cultivationBonus });
  }
  if (next.directBonus > current.directBonus) {
    unlocks.push({ kind: "directBonusUp", from: current.directBonus, to: next.directBonus });
  }
  if (next.unilevelDepth > current.unilevelDepth && next.unilevelDepth < 90) {
    unlocks.push({ kind: "unilevelDepthUp", from: current.unilevelDepth, to: next.unilevelDepth });
  }

  const topUnlocks = [...unlocks]
    .sort((a, b) => PERK_WEIGHT[b.kind] - PERK_WEIGHT[a.kind])
    .slice(0, TOP_UNLOCKS_CAP);

  return { next, progressPct, primaryGap, unmetCount: gaps.length, topUnlocks };
}
