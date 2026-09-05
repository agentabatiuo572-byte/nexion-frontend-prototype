import { defineStore } from "pinia";
import { ref } from "vue";
import { normalizeAccountKey } from "./account-cloud";
import { accountRowRev, readAccountRow, writeAccountRowCas } from "./account-scoped-storage";
import { mockServerId } from "./mock-id";
import { stakingApi, remoteApiEnabled } from "@/api/runtime";
import type { StakingPool } from "@/api/staking-api";

/**
 * Ported from Nexion-prototype/lib/v3/staking.ts (zustand persist → Pinia + uni storage).
 * v3 玩法 — 质押锁仓:4 档 USDT 锁仓产品。
 *   30 天   12% APY  提前赎回罚 5%
 *   90 天   35% APY  提前赎回罚 15%
 *   180 天  80% APY  提前赎回罚 30%
 *   365 天 180% APY  提前赎回罚 50%
 *
 * ⚠️ MOCK-ONLY: APY/penalty tables + interest formula are client-side.
 * PRODUCTION: GET /api/config/staking/pools returns a unified
 * {poolId, currency, term, apy, penalty, enabled} list; claim()/earlyWithdraw()
 * route via POST /api/staking/:id/{claim|early-withdraw} (PRD §9.11e; one server transaction
 * returning canonical {balance, billId, receiptId}). Any client-hardcoded APY
 * must be deleted when wiring the backend.
 */

const ONE_DAY = 86400 * 1000;

export type StakingTerm = 30 | 90 | 180 | 365;

export const STAKING_APY: Record<StakingTerm, number> = {
  30: 0.12,
  90: 0.35,
  180: 0.8,
  365: 1.8,
};

export const STAKING_PENALTY: Record<StakingTerm, number> = {
  30: 0.05,
  90: 0.15,
  180: 0.3,
  365: 0.5,
};

// Minimum stake per position (USDT). Single-source here (was duplicated as a
// hardcoded const in stake-sheet.vue + staking.vue — violated 单源铁律). Flat $20
// across all terms (主人 2026-06-17). Backend-replaceable: admin G1 staking.min.*
// (admin side to be synced to match in a separate session).
export const STAKING_MIN: Record<StakingTerm, number> = {
  30: 20,
  90: 20,
  180: 20,
  365: 20,
};

export interface StakingPosition {
  id: string;
  amountUSDT: number;
  termDays: StakingTerm;
  apy: number;
  startTs: number;
  unlockTs: number;
  status: "pending-lock" | "active" | "matured" | "early-withdrawn" | "claimed" | "slashed" | "refunded";
}

// 旧设备级单键 "nexgrid-v3-staking-v1" 废弃(存量无账号归属,mock 可重建);持仓按账号分行。
const ACCOUNTS_KEY = "nexgrid-v3-staking-accounts-v1"; // { [accountKey]: { positions: StakingPosition[] } }

function seedPositions(): StakingPosition[] {
  const now = Date.now();
  return [
    {
      id: "stk-1",
      amountUSDT: 500,
      termDays: 90,
      apy: 0.35,
      startTs: now - 30 * ONE_DAY,
      unlockTs: now + 60 * ONE_DAY,
      status: "active",
    },
  ];
}

interface StakingSnapshot {
  positions: StakingPosition[];
  rev: number;
}

/** 磁盘上的当前持仓 + 版本号。行不存在 / storage 读不出来 → null(与「行是空数组」区分:
 *  前者要退回内存态或种子,后者是真的一笔都没有)。 */
function readSnapshot(accountKey: string): StakingSnapshot | null {
  const row = readAccountRow<{ positions?: StakingPosition[]; rev?: number }>(ACCOUNTS_KEY, accountKey);
  if (row && Array.isArray(row.positions)) return { positions: row.positions, rev: accountRowRev(row) };
  return null;
}

function hydrate(accountKey: string): StakingSnapshot {
  return readSnapshot(accountKey) ?? { positions: seedPositions(), rev: 0 };
}

export const useStaking = defineStore("staking", () => {
  const isMockMode = !remoteApiEnabled;
  const pools = ref<StakingPool[]>([]);
  const walletBalanceUsdt = ref(0);
  const remoteError = ref<string | null>(null);
  const remoteReady = ref(isMockMode);
  // 账号维度。boot 期落 "default";账号确定后由 lib/account-scope 的
  // rebindAccountScopedStores 统一重绑(P-031 store 不互 import)。
  let boundKey = "default";
  // Remote mode must not expose the prototype position while the authority
  // request is pending. An empty snapshot is the only honest initial state.
  const boot = remoteApiEnabled ? { positions: [], rev: 0 } : hydrate(boundKey);
  let boundRev = boot.rev;
  const positions = ref<StakingPosition[]>(boot.positions);

  function clearRemoteState() {
    pools.value = [];
    positions.value = [];
    walletBalanceUsdt.value = 0;
    remoteReady.value = false;
  }

  function applyRemoteSnapshot(snapshot: Awaited<ReturnType<typeof stakingApi.fetchStakingPositions>>) {
    positions.value = snapshot.positions.map((position) => ({
      id: position.id,
      amountUSDT: position.amountUSDT,
      termDays: position.termDays,
      apy: position.apy,
      startTs: position.startTs,
      unlockTs: position.unlockTs,
      status: position.status,
    }));
    walletBalanceUsdt.value = snapshot.walletBalanceUsdt;
    remoteError.value = null;
    remoteReady.value = true;
  }

  // 权威不可达是常态输入,不 reject(resilience 门);失败信号走返回值/remoteError。
  async function syncRemote(): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    try {
      const [nextPools, snapshot] = await Promise.all([
        stakingApi.fetchStakingPools(),
        stakingApi.fetchStakingPositions(),
      ]);
      pools.value = nextPools;
      applyRemoteSnapshot(snapshot);
      return true;
    } catch {
      clearRemoteState();
      remoteError.value = "G1_REMOTE_AUTHORITY_UNAVAILABLE";
      return false;
    }
  }

  async function openRemote(tierKey: string, amountUsdt: number, idempotencyKey: string) {
    // A remote order may only be submitted against the exact, successfully
    // parsed server product snapshot. Never reconstruct a tier or minimum from
    // the mock table after a config/network failure.
    if (!remoteReady.value) throw new Error("G1_REMOTE_AUTHORITY_UNAVAILABLE");
    const pool = pools.value.find((row) => row.tierKey === tierKey && row.enabled);
    if (!pool || amountUsdt < pool.minAmountUsdt) throw new Error("G1_REMOTE_AUTHORITY_UNAVAILABLE");
    try {
      const snapshot = await stakingApi.openStakingPosition(tierKey, amountUsdt, idempotencyKey);
      applyRemoteSnapshot(snapshot);
      return snapshot;
    } catch {
      clearRemoteState();
      remoteError.value = "G1_REMOTE_AUTHORITY_UNAVAILABLE";
      throw new Error(remoteError.value);
    }
  }

  async function claimRemote(positionNo: string, idempotencyKey: string) {
    try {
      const snapshot = await stakingApi.claimStakingPosition(positionNo, idempotencyKey);
      applyRemoteSnapshot(snapshot);
      return snapshot;
    } catch {
      clearRemoteState();
      remoteError.value = "G1_REMOTE_AUTHORITY_UNAVAILABLE";
      throw new Error(remoteError.value);
    }
  }

  async function earlyWithdrawRemote(positionNo: string, idempotencyKey: string) {
    try {
      const snapshot = await stakingApi.earlyWithdrawStakingPosition(positionNo, idempotencyKey);
      applyRemoteSnapshot(snapshot);
      return snapshot;
    } catch {
      clearRemoteState();
      remoteError.value = "G1_REMOTE_AUTHORITY_UNAVAILABLE";
      throw new Error(remoteError.value);
    }
  }

  /**
   * 乐观并发提交(CAS)。read-modify-write 三步都收在这里:
   *   ① 基准取**磁盘最新**持仓,而不是本标签页可能已经陈旧几小时的内存副本;
   *   ② apply 在新鲜状态上重新校验前置条件 —— 别处已经领走/赎回的仓位返回 null,
   *      调用方拿到 ok:false,绝不会第二次入账(这是双花的根);
   *   ③ 带 rev 做 CAS 落盘;rev 被推进过说明 ①→③ 之间又被插了一脚,重跑一轮(有界 3 次)。
   *
   * conflict=true 专指「期间被别处改过」,与「仓位状态本来就不满足」分开,页面据此提示
   * 「数据已更新」而不是点了没反应。任何一种失败都不写盘、不改内存 = 绝不静默覆盖。
   */
  function commit<R>(
    apply: (current: StakingPosition[]) => { next: StakingPosition[]; result: R } | null,
  ): { ok: true; result: R } | { ok: false; conflict: boolean } {
    let raced = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const disk = readSnapshot(boundKey);
      // 读不出行 = 该账号还没写过 / storage 不可用 → 退回内存态当基准(保持既有行为)。
      const base = disk ? disk.positions : positions.value;
      const baseRev = disk ? disk.rev : boundRev;
      raced = raced || baseRev !== boundRev;
      const applied = apply(base);
      if (!applied) {
        positions.value = base; // 前置条件不成立:把别处的最新结果同步到 UI,再回报失败
        boundRev = baseRev;
        return { ok: false, conflict: raced };
      }
      const w = writeAccountRowCas<{ positions: StakingPosition[] }>(
        ACCOUNTS_KEY,
        boundKey,
        { positions: applied.next },
        baseRev,
      );
      if (w.ok) {
        positions.value = applied.next;
        boundRev = w.rev;
        return { ok: true, result: applied.result };
      }
      if (!w.conflict) return { ok: false, conflict: false }; // storage 写不进去:内存不动,按失败处理
      raced = true;
    }
    return { ok: false, conflict: true };
  }

  /** 账号切换重绑:装载该账号的持仓行(变更处处即时 persist,旧账号无需先落盘)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    if (remoteApiEnabled) {
      clearRemoteState();
      void syncRemote();
      return;
    }
    const row = hydrate(boundKey);
    positions.value = row.positions;
    boundRev = row.rev;
  }

  function totalLocked() {
    return positions.value
      .filter((p) => p.status === "active")
      .reduce((s, p) => s + p.amountUSDT, 0);
  }

  function totalEarnedSoFar() {
    const t = Date.now();
    return positions.value
      .filter((p) => p.status === "active" || p.status === "matured")
      .reduce((s, p) => {
        const elapsed = Math.min(t, p.unlockTs) - p.startTs;
        const yrs = elapsed / (365 * ONE_DAY);
        return s + p.amountUSDT * p.apy * yrs;
      }, 0);
  }

  function todayAccruedUSDT() {
    return positions.value
      .filter((p) => p.status === "active")
      .reduce((s, p) => s + (p.amountUSDT * p.apy) / 365, 0);
  }

  function activeCount() {
    return positions.value.filter((p) => p.status === "active").length;
  }

  /**
   * 返回形状对齐 earlyWithdraw / claim 的 `{ ok, …, conflict? }` —— 建仓和它们一样**会失败**,
   * 而调用方在此之前已经 debitBalance 扣过钱了。此前签名是 `: StakingPosition`,无论成没成都
   * 返回一个对象,调用方**拿不到失败信号**:3 次版本冲突全失败时仓位既没落盘也没进内存,
   * 而钱已经扣了、账单已经写了 —— 刷新后钱没了、收据成孤儿。
   */
  function stake(
    amount: number,
    termDays: StakingTerm,
  ): { ok: boolean; position: StakingPosition | null; conflict?: boolean } {
    const t = Date.now();
    const pos: StakingPosition = {
      // 🔴 不能用 `stk-${t}`:同一毫秒内建的两笔仓位 id 完全相同。CAS 之前这条被
      // last-write-wins 掩盖(其中一笔本来就会被顶掉),现在两笔都留得住,重号仓位会让
      // find(id) 永远只命中第一笔 —— 第二笔从此领不出来。走全仓统一的 mock id 单点。
      id: mockServerId("STK"),
      amountUSDT: amount,
      termDays,
      apy: STAKING_APY[termDays],
      startTs: t,
      unlockTs: t + termDays * ONE_DAY,
      status: "active",
    };
    // 追加型变更:冲突时在**别处写完的最新列表**上重放这次追加,两个标签页各自建的仓都留得住
    // (与领取/赎回不同,新建仓位有唯一 id,天然可合并,不存在「同一笔被建两次」)。
    const r = commit((current) => ({ next: [pos, ...current], result: pos }));
    if (r.ok) return { ok: true, position: pos };
    // 🔴 两条失败分支同等对待(2026-08-04 R5:此前本分支自相矛盾)。
    // storage 写不进去(配额满 / 隐私模式)时曾把仓位塞进内存并**照报成功** —— 而下面那条
    // 注释早就写明这么做的后果:本标签页看得见、磁盘上没有,刷新即人间蒸发,而钱已经扣了、
    // 账单已经写了,调用方拿着 ok:true 不会冲正。失败就是失败,如实回报,由调用方退款。
    // `conflict` 区分归因:false = 存储写不进去(重试也白搭,要提示换个环境),
    // true = 别处正在改这个账号(刷新后重试有意义)。调用方据此给不同文案。
    if (!r.conflict) return { ok: false, position: null, conflict: false };
    // 🔴 3 次版本冲突全耗尽:既没落盘、也不进内存 —— 这笔仓位**根本不存在**。
    // 唯一正确的处置是把失败如实回报给调用方,由它把刚扣的钱退回去;
    // 这里跟着做内存兜底反而更糟:本标签页看得见、磁盘上没有,刷新即人间蒸发。
    return { ok: false, position: null, conflict: true };
  }

  function earlyWithdraw(id: string): { ok: boolean; refund: number; penalty: number; conflict?: boolean } {
    const r = commit((current) => {
      const p = current.find((x) => x.id === id);
      // 🔴 前置条件复核跑在磁盘最新状态上:别处已经赎回过的仓位在这里就被挡住,不会二次退款。
      if (!p || p.status !== "active") return null;
      const penaltyRate = STAKING_PENALTY[p.termDays];
      const penalty = p.amountUSDT * penaltyRate;
      return {
        next: current.map((x) => (x.id === id ? { ...x, status: "early-withdrawn" as const } : x)),
        result: { refund: p.amountUSDT - penalty, penalty },
      };
    });
    if (!r.ok) return { ok: false, refund: 0, penalty: 0, conflict: r.conflict };
    return { ok: true, refund: r.result.refund, penalty: r.result.penalty };
  }

  // ⚠️ MOCK-ONLY: interest computed client-side via simple APY formula.
  // PRODUCTION: POST /api/staking/:id/claim (PRD §9.11e) returns {principal, interest}.
  function claim(id: string): { ok: boolean; principal: number; interest: number; conflict?: boolean } {
    const r = commit((current) => {
      const p = current.find((x) => x.id === id);
      // 🔴 同 earlyWithdraw:领取资格按磁盘最新状态判,别处领过就不再放行(双花的闸在这一行)。
      if (!p || (p.status !== "active" && p.status !== "matured")) return null;
      if (Date.now() < p.unlockTs) return null;
      return {
        next: current.map((x) => (x.id === id ? { ...x, status: "claimed" as const } : x)),
        result: { principal: p.amountUSDT, interest: p.amountUSDT * p.apy * (p.termDays / 365) },
      };
    });
    if (!r.ok) return { ok: false, principal: 0, interest: 0, conflict: r.conflict };
    return { ok: true, principal: r.result.principal, interest: r.result.interest };
  }

  // 页面每 4s 调一次。无到期仓位时 apply 返回 null,commit 顺手把磁盘最新态同步进内存 ——
  // 于是打开着质押页的标签页会自动跟上别处的变更(此前永远看不到)。
  function markMatured() {
    const t = Date.now();
    commit((current) => {
      let changed = false;
      const next = current.map((p) => {
        if (p.status === "active" && p.unlockTs <= t) {
          changed = true;
          return { ...p, status: "matured" as const };
        }
        return p;
      });
      return changed ? { next, result: true as const } : null;
    });
  }

  return {
    isMockMode,
    pools,
    walletBalanceUsdt,
    remoteError,
    remoteReady,
    positions,
    totalLocked,
    totalEarnedSoFar,
    todayAccruedUSDT,
    activeCount,
    stake,
    earlyWithdraw,
    claim,
    markMatured,
    bindAccount,
    syncRemote,
    openRemote,
    claimRemote,
    earlyWithdrawRemote,
  };
});
