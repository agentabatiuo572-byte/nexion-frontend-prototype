import { runPassiveTabRead, invalidatePassiveTabRead, invalidateBeforePassiveTabRead, rememberPassiveTabRead } from "@/lib/passive-tab-read";
import { defineStore } from "pinia";
import { onScopeDispose, ref, watch } from "vue";
import { apiRuntimeConfig, remoteApiEnabled, vRankApi } from "@/api/runtime";
import type { CanonicalVRankLadder, CanonicalVRankState } from "@/api/v-rank-api";
import { asApiError } from "@/api/errors";
import { isHttpReadRateLimit, isTransientReadFailure } from "@/lib/remote-read-failure";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";
import { normalizeAccountKey } from "@/store/account-cloud";
import { readAccountRow, writeAccountRow } from "@/store/account-scoped-storage";
import { captureRuntimeRevision, isCurrentRuntimeRevision, subscribeRuntimeRevision, type RuntimeRevisionScope } from "@/api/order-api";

/**
 * Ported from Nexion-prototype/lib/v3/v-rank.ts (zustand persist → Pinia + uni storage).
 * ⚠️ MOCK-ONLY V_RANKS table (9-tier preview ladder, conditions + bonuses + prizes).
 * Production: GET /api/config/v-ranks returns server-authoritative ladder.
 * Promotion judging (nextRankProgress / nextRankGap) is preview-only; server is
 * the sole canonical authority for V-rank promotion (PRD §13.2).
 *
 * V0→V8 9 阶,每升一阶解锁 unilevel 深度 +1 / 平级奖(V3+) / 领导池权重 / 培育奖 NEX。
 * 晋级条件、权益与奖励应完整展示；正式等级以服务端发布的阶梯为准。
 * 奖励为可配 NEX(cultivationBonus);实物奖品已删(与运营后台 F1 同步,2026-06)。
 */

/** Rank IDs are validated at the API boundary; never clamp an existing account rank. */
export type VRank = number;

export interface VRankConditions {
  selfComputePoints?: number; // 自购算力点
  teamComputePoints?: number; // 团队算力点
  directRefs?: number;        // 直推数
  vDownlines?: Record<VRank, number>; // 下面需要 N 个 V 级
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
  rewards: VRankReward[];     // F1 权威奖励投影；只展示，不触发派发
}

export interface MonetaryVRankReward {
  type: "USDT" | "UVT";
  amount: number;
  voucherId?: string;
  skuId?: string;
  customLabel?: string;
}

export interface EntitlementVRankReward {
  type: "VOUCHER" | "SKU" | "CUSTOM";
  amount?: number;
  voucherId?: string;
  skuId?: string;
  customLabel?: string;
  displayName?: string;
}

export type VRankReward = MonetaryVRankReward | EntitlementVRankReward;

export const V_RANKS: VRankDef[] = [
  {
    v: 0, title: "Cadet", cnTitle: "学员",
    conditions: {}, directBonus: 0.05, unilevelDepth: 1,
    peerBonus: 0, leadershipVotes: 0,
    cultivationBonus: 0, rewards: [],
  },
  {
    v: 1, title: "Pilot", cnTitle: "飞行员",
    conditions: { selfComputePoints: 2990, directRefs: 3 },
    directBonus: 0.10, unilevelDepth: 2,
    peerBonus: 0, leadershipVotes: 0,
    cultivationBonus: 500, rewards: [],
  },
  {
    v: 2, title: "Operator", cnTitle: "操作员",
    conditions: { teamComputePoints: 50_000 },
    directBonus: 0.10, unilevelDepth: 3,
    peerBonus: 0, leadershipVotes: 0,
    cultivationBonus: 2000, rewards: [],
  },
  {
    v: 3, title: "Captain", cnTitle: "舰长",
    conditions: { teamComputePoints: 200_000, vDownlines: { 1: 2 } },
    directBonus: 0.10, unilevelDepth: 4,
    peerBonus: 0.05, leadershipVotes: 1,
    cultivationBonus: 10_000, rewards: [],
  },
  {
    v: 4, title: "Commander", cnTitle: "指挥官",
    conditions: { teamComputePoints: 500_000, vDownlines: { 2: 3 } },
    directBonus: 0.10, unilevelDepth: 5,
    peerBonus: 0.05, leadershipVotes: 2,
    cultivationBonus: 50_000, rewards: [],
  },
  {
    v: 5, title: "Wing Leader", cnTitle: "翼领",
    conditions: { teamComputePoints: 1_500_000, vDownlines: { 3: 4 } },
    directBonus: 0.10, unilevelDepth: 6,
    peerBonus: 0.05, leadershipVotes: 4,
    cultivationBonus: 200_000, rewards: [],
  },
  {
    v: 6, title: "Squadron", cnTitle: "中队长",
    conditions: { teamComputePoints: 5_000_000, vDownlines: { 4: 5 } },
    directBonus: 0.10, unilevelDepth: 7,
    peerBonus: 0.05, leadershipVotes: 8,
    cultivationBonus: 800_000, rewards: [],
  },
  {
    v: 7, title: "Fleet Cmdr", cnTitle: "舰队司令",
    conditions: { teamComputePoints: 10_000_000, vDownlines: { 5: 6 } },
    directBonus: 0.10, unilevelDepth: 8,
    peerBonus: 0.05, leadershipVotes: 16,
    cultivationBonus: 3_200_000, rewards: [],
  },
  {
    v: 8, title: "Star Admiral", cnTitle: "星上将",
    conditions: { teamComputePoints: 30_000_000, vDownlines: { 6: 7 } },
    directBonus: 0.10, unilevelDepth: 9,
    peerBonus: 0.05, leadershipVotes: 32,
    cultivationBonus: 10_000_000, rewards: [],
  },

];

/**
 * Data fields the pure progress functions read. The Pinia store is structurally
 * compatible (exposes these as unwrapped properties), so `nextRankProgress(store)`
 * / `nextRankGap(store)` work directly.
 */
export interface VRankData {
  myRank: VRank;
  selfComputePoints?: number;
  teamComputePoints?: number;
  directRefs: number;
  vDownlineCounts: Record<VRank, number>;
}

export type VRankProgressPatch = Partial<Omit<VRankData, "myRank">>;

const EMPTY_V_RANK: VRankDef = {
  v: 0, title: "", cnTitle: "", conditions: {}, directBonus: 0,
  unilevelDepth: 0, peerBonus: 0, leadershipVotes: 0, cultivationBonus: 0, rewards: [],
};

function canonicalRank(row: Awaited<ReturnType<typeof vRankApi.ladder>>["ranks"][number]): VRankDef {
  const conditions: VRankConditions = {};
  if (row.selfComputePoints !== undefined) conditions.selfComputePoints = row.selfComputePoints;
  if (row.teamComputePoints !== undefined) conditions.teamComputePoints = row.teamComputePoints;
  if (row.directRefs !== undefined) conditions.directRefs = row.directRefs;
  if (row.requiredDownlineRank !== undefined && row.requiredDownlineCount !== undefined) {
    conditions.vDownlines = { [row.requiredDownlineRank as VRank]: row.requiredDownlineCount };
  }
  return {
    v: row.v as VRank, title: row.title, cnTitle: row.cnTitle, conditions,
    directBonus: row.directBonus, unilevelDepth: row.unilevelDepth, peerBonus: row.peerBonus,
    leadershipVotes: row.leadershipVotes, cultivationBonus: row.cultivationBonus, rewards: row.rewards,
  };
}

// 等级是账号资产:per-account 行表(P2-8 设备级泄漏修复)。旧设备级单键
// "nexgrid-v-rank-v1" 不迁移 —— 存量无账号归属,迁给任何账号都是臆断,就地废弃。
const ACCOUNTS_KEY = "nexgrid-v-rank-accounts-v1"; // { [accountKey]: VRankData }

const DEFAULT_V_RANK: VRankData = {
  // 新账号 seed 人设:V2 Operator(刚到,正冲 V3)—— 与 account-cloud
  // createSeedSnapshot 的统一 seed 口径一致。
  myRank: 2,
  selfComputePoints: 11_980, // S1 + Pro 已买
  directRefs: 5,
  teamComputePoints: 52_400, // 刚过 V2 门槛
  vDownlineCounts: { 1: 3 }, // 下面有 3 个 V1
};

type VRankRemoteRequest = RemoteAccountRequest;

function captureVRankRequest(epoch: ReturnType<typeof createRemoteAccountEpoch>): VRankRemoteRequest {
  return epoch.snapshot();
}

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
  const init: VRankData = remoteApiEnabled ? { myRank: 0 as VRank, directRefs: 0, vDownlineCounts: {} } : hydrate(boundKey);
  const myRank = ref<VRank>(init.myRank);
  const selfComputePoints = ref<number | undefined>(init.selfComputePoints);
  const teamComputePoints = ref<number | undefined>(init.teamComputePoints);
  const directRefs = ref(init.directRefs);
  const vDownlineCounts = ref<Record<VRank, number>>(init.vDownlineCounts);
  const ladder = ref<VRankDef[]>(remoteApiEnabled ? [] : V_RANKS);
  // 服务端能力位:某类收益今天是否真的会派发(与佣金指南同源)。等级阶梯里的
  // peerBonus 是「配置比例」,不是「已生效权益」—— 渲染时必须靠这个位区分(#79)。
  // 本地(mock)模式没有服务端能力位,按「会派发」处理,与 V_RANKS 的展示一致。
  const capabilities = ref<{ peer: boolean; genesis: boolean }>({ peer: true, genesis: true });
  const prizeName = ref(remoteApiEnabled ? "" : "UVEL V-Rank");
  const remoteReady = ref(!remoteApiEnabled);
  const remoteError = ref<string | null>(null);
  const remoteRateLimited = ref(false);
  const remoteTransientFailure = ref(false);
  let retryAt = 0;
  let environmentInvalidated = false;
  let inFlight: { account: VRankRemoteRequest; runtime: RuntimeRevisionScope; promise: Promise<void> } | null = null;
  const remoteAccountEpoch = createRemoteAccountEpoch(boundKey);

  function clearRemoteFacts(): void {
    myRank.value = 0;
    selfComputePoints.value = undefined;
    teamComputePoints.value = undefined;
    directRefs.value = 0;
    vDownlineCounts.value = {};
    ladder.value = [];
    capabilities.value = { peer: false, genesis: false };
    prizeName.value = "";
    remoteReady.value = false;
  }

  function persist() {
    if (remoteApiEnabled) return;
    writeAccountRow<VRankData>(ACCOUNTS_KEY, boundKey, {
      myRank: myRank.value,
      selfComputePoints: selfComputePoints.value,
      teamComputePoints: teamComputePoints.value,
      directRefs: directRefs.value,
      vDownlineCounts: vDownlineCounts.value,
    });
  }

  /** 账号切换重绑:装载该账号的等级行(变更处处即时 persist,旧账号无需先落盘)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    if (remoteApiEnabled) {
      remoteAccountEpoch.bind(boundKey);
      inFlight = null; retryAt = 0; remoteRateLimited.value = false; remoteTransientFailure.value = false;
      clearRemoteFacts();
      void refreshCanonicalVRank(captureVRankRequest(remoteAccountEpoch));
      return;
    }
    const next = hydrate(boundKey);
    myRank.value = next.myRank;
    selfComputePoints.value = next.selfComputePoints;
    teamComputePoints.value = next.teamComputePoints;
    directRefs.value = next.directRefs;
    vDownlineCounts.value = next.vDownlineCounts;
  }

  let refreshGeneration = 0;
  // H5 may read before local session binding. Retry that precondition once;
  // server authorization failures and rate limits do not use this timer.
  const SESSION_BIND_RETRY_MILLISECONDS = 500;
  function ensureCanonicalVRank(): Promise<void> {
    if (Date.now() < retryAt) return Promise.resolve();
    return runPassiveTabRead("v-rank", () => inFlight && remoteAccountEpoch.isCurrent(inFlight.account) && isCurrentRuntimeRevision(inFlight.runtime)
      ? inFlight.promise : refreshCanonicalVRank(), [remoteAccountEpoch.snapshot(), captureRuntimeRevision()], () => remoteReady.value);
  }

  function refreshCanonicalVRank(
    request: VRankRemoteRequest = captureVRankRequest(remoteAccountEpoch),
    runScope: RuntimeRevisionScope = captureRuntimeRevision(),
  ): Promise<void> {
    invalidateBeforePassiveTabRead("v-rank");
    if (environmentInvalidated || Date.now() < retryAt || !remoteAccountEpoch.isCurrent(request)
      || !isCurrentRuntimeRevision(runScope)) return Promise.resolve();
    const promise = readCanonicalVRank(request, runScope);
    rememberPassiveTabRead("v-rank", promise, [request, runScope], undefined, () => remoteReady.value);
    inFlight = { account: request, runtime: runScope, promise };
    const clear = () => { if (inFlight?.promise === promise) inFlight = null; };
    void promise.then(clear, clear);
    return promise;
  }

  async function readCanonicalVRank(
    request: VRankRemoteRequest = captureVRankRequest(remoteAccountEpoch),
    runScope: RuntimeRevisionScope = captureRuntimeRevision(),
  ) {
    if (!remoteApiEnabled) return;
    const generation = ++refreshGeneration;
    const isCurrent = () => generation === refreshGeneration
      && remoteAccountEpoch.isCurrent(request)
      && isCurrentRuntimeRevision(runScope);
    if (isCurrent()) {
      remoteReady.value = false;
      remoteError.value = null;
    }
    const apply = (remoteLadder: CanonicalVRankLadder, remoteCurrent: CanonicalVRankState) => {
      ladder.value = remoteLadder.ranks.map(canonicalRank);
      prizeName.value = remoteLadder.prizeName;
      capabilities.value = remoteLadder.capabilities;
      myRank.value = Number(remoteCurrent.rankCode.slice(1)) as VRank;
      selfComputePoints.value = remoteCurrent.progress.selfComputePoints;
      teamComputePoints.value = remoteCurrent.progress.teamComputePoints;
      directRefs.value = remoteCurrent.progress.directRefs;
      vDownlineCounts.value = Object.fromEntries(
        Object.entries(remoteCurrent.progress.vDownlineCounts).map(([rank, count]) => [Number(rank) as VRank, count]),
      ) as Record<VRank, number>;
      remoteReady.value = true;
      remoteError.value = null; retryAt = 0; remoteRateLimited.value = false; remoteTransientFailure.value = false;
    };
    let strictFailure = false, failureRecorded = false, pairGeneration = 0;
    const isLocalSessionPending = (cause: ReturnType<typeof asApiError>) => cause.kind === "auth"
      && cause.message === "AUTH_SESSION_REQUIRED" && cause.status === undefined && cause.code === undefined;
    const fail = (failure: unknown) => {
      if (!isCurrent()) return;
      const transient = isTransientReadFailure(failure), limited = isHttpReadRateLimit(failure);
      if (isHttpReadRateLimit(failure)) retryAt = Math.max(retryAt, Date.now() + (failure.retryAfterMs ?? 30_000));
      if (!transient) strictFailure = true;
      remoteRateLimited.value = limited && !strictFailure;
      remoteTransientFailure.value = transient && !strictFailure;
      clearRemoteFacts(); remoteError.value = "V_RANK_REMOTE_AUTHORITY_UNAVAILABLE";
      failureRecorded = true;
    };
    const readPair = () => {
      const pair = ++pairGeneration; failureRecorded = false;
      const observe = <T>(reading: Promise<T>): Promise<T> => reading.catch(error => {
        // A late strict denial must revoke this pair even if its other GET
        // already reported 429. A replaced retry pair cannot revoke newer facts.
        if (isCurrent() && pair === pairGeneration && !isLocalSessionPending(asApiError(error))) fail(error);
        throw error;
      });
      return Promise.all([observe(vRankApi.ladder()), observe(vRankApi.current())]);
    };
    try {
      const [remoteLadder, remoteCurrent] = await readPair();
      if (!isCurrent()) return;
      apply(remoteLadder, remoteCurrent);
    } catch (error) {
      if (!isCurrent()) return;
      let failure = error;
      if (isLocalSessionPending(asApiError(error)) && !strictFailure && Date.now() >= retryAt) {
        await new Promise<void>((resolve) => setTimeout(resolve, SESSION_BIND_RETRY_MILLISECONDS));
        if (!isCurrent() || strictFailure || Date.now() < retryAt) return;
        try {
          const [remoteLadder, remoteCurrent] = await readPair();
          if (!isCurrent()) return;
          apply(remoteLadder, remoteCurrent);
          return;
        } catch (retryError) {
          if (!isCurrent()) return;
          failure = retryError;
        }
      }
      if (!failureRecorded) fail(failure);
    }
  }

  // A catalogue refresh invalidates in-flight rank reads too. Start a read in
  // the new revision so discarding the old response cannot strand the loading
  // state. Keep the account/revision/generation fences on both success and error.
  const unsubscribeRuntime = subscribeRuntimeRevision(() => {
    if (remoteApiEnabled) void refreshCanonicalVRank();
  });
  onScopeDispose(unsubscribeRuntime);

  function invalidateReadOwner(): void {
    invalidatePassiveTabRead("v-rank");

    remoteTransientFailure.value = false;
    refreshGeneration += 1; remoteAccountEpoch.bind(boundKey); inFlight = null;
    clearRemoteFacts();
    remoteError.value = Date.now() < retryAt ? "V_RANK_REMOTE_AUTHORITY_UNAVAILABLE" : null;
  }

  watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl], () => {
    environmentInvalidated = true; retryAt = 0; remoteRateLimited.value = false; invalidateReadOwner();
  }, { flush: "sync" });

  function setMyRank(v: VRank) {
    if (remoteApiEnabled) return;
    myRank.value = v;
    persist();
  }
  function setProgress(p: VRankProgressPatch) {
    if (remoteApiEnabled) return;
    if ("selfComputePoints" in p) selfComputePoints.value = p.selfComputePoints;
    if ("teamComputePoints" in p) teamComputePoints.value = p.teamComputePoints;
    if (p.directRefs !== undefined) directRefs.value = p.directRefs;
    if (p.vDownlineCounts !== undefined) vDownlineCounts.value = p.vDownlineCounts;
    persist();
  }

  return {
    selfComputePoints, teamComputePoints,
    myRank, directRefs, vDownlineCounts, ladder, prizeName,
    capabilities,
    remoteReady, remoteError, remoteRateLimited, remoteTransientFailure,
    setMyRank, setProgress, bindAccount, refreshCanonicalVRank, ensureCanonicalVRank, invalidateReadOwner,
  };
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
  | { kind: "selfComputePoints" | "teamComputePoints"; amount: number | undefined }
  | { kind: "directRefs"; n: number }
  // 只给档位号,头衔名由 copy 层按语言解析(`lib/v-rank-copy` 的 rankTitle)——
  // store 存一份英文 title 就等于把「中文界面显示什么」定死在数据层。
  | { kind: "vDownlines"; n: number; vLevel: number };

/** 计算到下一阶的进度(0-1) */
export function nextRankProgress(state: VRankData, ladder: VRankDef[] = []): {
  next: VRankDef | null;
  progressPct: number;
  progressKnown: boolean;
  missing: RankGap[];
} {
  const next = ladder[state.myRank + 1];
  if (!next) return { next: null, progressPct: 1, progressKnown: true, missing: [] };
  const { progressPct, progressKnown, gaps } = rankConditionChecks(state, next.conditions);
  const missing: RankGap[] = gaps.map((gap): RankGap => {
    if (gap.kind === "directRefs") return { kind: gap.kind, n: gap.remaining };
    if (gap.kind === "vDownlines") return { kind: gap.kind, n: gap.remaining, vLevel: gap.vLevel };
    return { kind: gap.kind, amount: gap.remaining };
  });
  return { next, progressPct, progressKnown, missing };
}

export type PrimaryGap =
  | { kind: "selfComputePoints" | "teamComputePoints"; remaining: number | undefined; progress: number }
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
  progressKnown: boolean;
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

/** Display-only estimates; never changes the server-authoritative myRank. */

function rankConditionChecks(state: VRankData, c: VRankConditions) {
  const gaps: PrimaryGap[] = [];
  const checks: number[] = [];
  let progressKnown = true;
  const points = (kind: "selfComputePoints" | "teamComputePoints", required: number | undefined) => {
    const have = state[kind];
    const known = required !== undefined && have !== undefined;
    const progress = known ? required === 0 ? 1 : Math.min(1, Math.max(0, have / required)) : 0;
    checks.push(progress);
    if (!known || progress < 1) gaps.push({ kind, remaining: known ? Math.max(0, required - have) : undefined, progress });
    if (!known) progressKnown = false;
  };
  if (c.selfComputePoints !== undefined) points("selfComputePoints", c.selfComputePoints);
  if (c.directRefs) {
    const progress = Math.min(1, state.directRefs / c.directRefs);
    checks.push(progress);
    if (progress < 1) gaps.push({ kind: "directRefs", remaining: c.directRefs - state.directRefs, progress });
  }
  if (c.teamComputePoints !== undefined) points("teamComputePoints", c.teamComputePoints);
  for (const [rank, required] of Object.entries(c.vDownlines ?? {})) {
    if (!required) continue;
    const vLevel = Number(rank);
    const have = state.vDownlineCounts[vLevel] ?? 0;
    const progress = Math.min(1, have / required);
    checks.push(progress);
    if (progress < 1) gaps.push({ kind: "vDownlines", remaining: required - have, progress, vLevel });
  }
  return { gaps, progressKnown, progressPct: checks.length ? checks.reduce((sum, value) => sum + value, 0) / checks.length : 1 };
}

export function nextRankGap(state: VRankData, ladder: VRankDef[] = []): NextRankGapInfo {
  const current = ladder[state.myRank] ?? EMPTY_V_RANK;
  const next = ladder[state.myRank + 1];
  if (!next) {
    return {
      next: null,
      progressPct: 1,
      progressKnown: true,
      primaryGap: null,
      unmetCount: 0,
      topUnlocks: [],
    };
  }

  const { gaps, progressPct, progressKnown } = rankConditionChecks(state, next.conditions);

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

  return { next, progressPct, progressKnown, primaryGap, unmetCount: gaps.length, topUnlocks };
}
