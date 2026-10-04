import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { normalizeAccountKey } from "@/store/account-cloud";
import { readAccountRow, writeAccountRow } from "@/store/account-scoped-storage";
import {
  useGenesisConfig,
  tierForSold,
  genesisPurchaseBlock,
  genesisSecondaryBlock,
  GENESIS_TIERS_DEFAULT as GENESIS_TIERS,
  type GenesisTier,
} from "@/store/genesis-config";
import { genesisApi, remoteApiEnabled, sessionVault } from "@/api/runtime";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";
import { hasGenesisAuthorityForAccount } from "@/lib/genesis-auth-scope";
import { captureRuntimeRevision, isCurrentRuntimeRevision, type RuntimeRevisionScope } from "@/api/order-api";
import { resolveRemoteGenesisPurchase } from "@/lib/genesis-remote-purchase";
import { readGenesisRemoteFacts } from "@/lib/genesis-remote-sync";
import { genesisHoldingId } from "@/lib/genesis-holding-id";
import { requireCryptoUuid } from "@/lib/secure-command-id";
import { parseGenesisListingPrice } from "@/lib/genesis-listing-price";
import { withGenesisCommandLock } from "@/lib/genesis-command-lock";
import { hydrateGenesisMarketCommands, type GenesisMarketCommand, type GenesisMarketOperation,
  type GenesisCommandOutcome } from "@/lib/genesis-market-command";
import type {
  GenesisAccountState,
  GenesisEmission,
  GenesisHolding,
  GenesisEligibility,
  GenesisMarketStats,
  GenesisPublicState,
} from "@/api/genesis-api";

// 阶梯档位类型 + 默认值现定义在 genesis-config.ts(叶子,避免 TDZ 循环);
// re-export 兼容既有 import 方(canon-sentinel 改读 genesis-config,见 Step 5)。
export { GENESIS_TIERS, type GenesisTier };

/** Projection read state stays separate from the fact values: an empty list is
 * only a real empty market/account after its corresponding remote read is ready. */
export type GenesisRemoteReadState = "loading" | "ready" | "unavailable";

/**
 * Genesis Node 创世节点 — 高价稀缺 OG 席位（1000 限量）。
 *
 * 改造（分红延期 → 上所排放权益化，规格 FEAT-GEN-dividend-defer-emission）：
 *  - 定价：单一 $9,999 → 3 档阶梯，累计售出决定当前档，售罄硬跳价。
 *  - 收益：每日分红（挂平台交易量）→ NEX 协议排放，**上所后才开阀**（nexListed，
 *    fail-closed）；上所前只有「预留额度 + 排放优先权」，无 live 排放/无可领余额。
 *  - 排放：一次性空投 → vesting 曲线（TGE 解锁 + 线性 + 每 N 月减半）。
 *  所有值 backend-replaceable：nexListed/tier 价/排放曲线在真后台是 server-canonical，
 *  这里用可序列化 mock；运营可配对应 admin G4（G.genesis.*）。
 */

const TOTAL_SLOTS = 1000;

// 阶梯档位(GENESIS_TIERS)+ tierForSold 现在是运营可配的,单源在 genesis-config
// store(admin G4 `G.genesis.tiers`)。累计售出决定当前档,售罄硬跳价——派生逻辑
// 见下方 currentTier/unitPriceUSDT/tierRemaining,全部读 live config。

/** 上所后排放曲线。运营可配 → admin G4 `G.genesis.emissionCurve` / `airdropPct`。
 *  nominalPerNodeNEX = 每节点名义预留额度（NEX），展示为「预留额度」非保证死数。
 *  🔴 前低后高（back-loaded）:TGE 解锁一小部分,其余在 vesting 窗口内**早慢后快**释放——
 *  刻意延后负债 + 不在上所(M7-8)当口放大卖压（圆桌操盘手设计意图）。 */
export const GENESIS_EMISSION = {
  tgeUnlockPct: 0.1, // TGE 先释放 10%
  vestMonths: 18, // 上所后 vesting 窗口(月)
  backloadExp: 1.6, // 前低后高指数(>1 = 早期慢、后期快)
  nominalPerNodeNEX: 80_000,
} as const;

const MONTH_MS = 30 * 86400_000;

/** 上所后 vesting 累计释放比例（0..1，单调增）。t=0 → TGE 10%；其余 90% 在 vestMonths 内
 *  按 `t^backloadExp` 前低后高释放（早期慢、后期快），t=vestMonths 时释放完。 */
export function emissionReleasedFraction(monthsSinceListing: number): number {
  if (monthsSinceListing <= 0) return GENESIS_EMISSION.tgeUnlockPct;
  const t = Math.min(1, monthsSinceListing / GENESIS_EMISSION.vestMonths);
  return Math.min(1, GENESIS_EMISSION.tgeUnlockPct + (1 - GENESIS_EMISSION.tgeUnlockPct) * Math.pow(t, GENESIS_EMISSION.backloadExp));
}

/** 排放快照（server-canonical mock）。页面据此渲染上所后 NEX 计价收益。 */
export interface EmissionSnapshot {
  pctReleased: number; // 0..1
  emittedNEX: number;
  lockedNEX: number;
  nextReleaseAt: number; // ms epoch
  monthsSinceListing: number;
}

/** 当前创世认购资格策略。生产环境只接受服务端投影；此对象仅供 5174/离线演示镜像。 */
export interface GenesisEligibilityPolicy {
  enabled: boolean;
  maxPerUser: number;
  minAccountAgeDays: number;
}
export const GENESIS_ELIGIBILITY_POLICY: GenesisEligibilityPolicy = Object.freeze({
  enabled: true,
  maxPerUser: 5,
  minAccountAgeDays: 0,
});

export interface GenesisEligibilityContext {
  accountAgeDays: number;
  myOwned: number;
}

export interface GenesisGateResult {
  eligible: boolean;
  reasons: string[];
  capReached: boolean;
  capRemaining: number;
}

/** 新策略的离线镜像求值；生产环境始终以 GET /api/genesis/eligibility 为准。 */
export function evaluateGenesisSalePolicy(
  policy: GenesisEligibilityPolicy,
  ctx: GenesisEligibilityContext,
): GenesisGateResult {
  const ageEligible = Number.isFinite(ctx.accountAgeDays)
    && ctx.accountAgeDays >= policy.minAccountAgeDays;
  const eligible = policy.enabled === false || ageEligible;
  const capRemaining = Math.max(0, policy.maxPerUser - ctx.myOwned);
  return {
    eligible,
    reasons: eligible ? [] : ["ACCOUNT_AGE_REQUIRED"],
    capReached: capRemaining <= 0,
    capRemaining,
  };
}

/** A user's active secondary-market listing */
export interface MyListing {
  tokenId: string | number;
  askPriceUSDT: number;
  listedAt: number;
}

/** 全平台市场态(账号无关,设备共享):售出进度 + 上所信号。 */
interface GenesisGlobalData {
  soldSlots: number;
  /** 全平台一次性上所信号（server-canonical mock）。fail-closed：默认 false = 上所前。 */
  nexListed: boolean;
  nexListedAt: number | null;
}

/** 用户持仓片(per-account 行,随账号走;P2-8 设备级泄漏修复)。 */
interface GenesisUserData {
  myOwned: number;
  ownedTokenIds: Array<string | number>;
  myListings: MyListing[];
  idempotencyKeys?: Record<string, string>;
  marketCommands?: Record<string, GenesisMarketCommand>;
}

const STORAGE_KEY = "nexgrid-genesis"; // 仅全平台片
const ACCOUNTS_KEY = "nexgrid-genesis-accounts-v1"; // { [accountKey]: GenesisUserData }

function globalDefaults(): GenesisGlobalData {
  return {
    soldSlots: 847, // 启动状态 → 当前处 T2 尾盘档
    nexListed: false, // fail-closed：未上所，排放未开阀
    nexListedAt: null,
  };
}

function userDefaults(): GenesisUserData {
  return { myOwned: 0, ownedTokenIds: [], myListings: [], idempotencyKeys: {} };
}

// 旧全局键里的存量 myOwned/ownedTokenIds/myListings 不迁移:设备级数据无账号
// 归属,迁给任何账号都是臆断(mock 可重建);下次 persist 全局片时自然清除。
function hydrateGlobal(): GenesisGlobalData {
  try {
    const s = uni.getStorageSync(STORAGE_KEY) as Partial<GenesisGlobalData> | "";
    if (s && typeof s === "object" && typeof s.soldSlots === "number") {
      return {
        soldSlots: s.soldSlots,
        // fail-closed：老 schema 无 nexListed → 视为未上所。
        nexListed: s.nexListed === true,
        nexListedAt: typeof s.nexListedAt === "number" ? s.nexListedAt : null,
      };
    }
  } catch {
    // first run
  }
  return globalDefaults();
}

function hydrateUser(accountKey: string, soldSlots: number): GenesisUserData {
  const row = readAccountRow<Partial<GenesisUserData>>(ACCOUNTS_KEY, accountKey);
  if (!row || typeof row.myOwned !== "number") return userDefaults();
  const owned = row.myOwned;
  const ids = Array.isArray(row.ownedTokenIds) ? [...row.ownedTokenIds] : [];
  // Backfill missing token IDs (partial/seeded rows) so owned nodes still
  // render in Mine — sequential IDs from the soldSlots range.
  for (let i = ids.length; i < owned; i++) {
    ids.push(soldSlots - (owned - i - 1));
  }
  return {
    myOwned: owned,
    ownedTokenIds: ids,
    myListings: Array.isArray(row.myListings) ? row.myListings : [],
    idempotencyKeys: row.idempotencyKeys && typeof row.idempotencyKeys === "object"
      ? { ...row.idempotencyKeys } : {},
    marketCommands: row.marketCommands,
  };
}

function remoteDefaults(): GenesisGlobalData {
  // Remote mode starts unknown, never with the mock's seeded 847 slots.
  return { soldSlots: 0, nexListed: false, nexListedAt: null };
}

function purchaseIntentScope(accountKey: string, n: number, tokenIds?: number[]): string {
  return `${accountKey}|purchase|${n}|${(tokenIds ?? []).join(",")}`;
}

function purchaseSequenceScope(accountKey: string): string {
  return `${accountKey}|purchase-sequence`;
}

export function claimGenesisPurchaseIntent(
  keys: Record<string, string>,
  accountKey: string,
  n: number,
  tokenIds?: number[],
): { key: string; keys: Record<string, string> } {
  const pendingScope = purchaseIntentScope(accountKey, n, tokenIds);
  const pending = keys[pendingScope];
  if (pending) return { key: pending, keys: { ...keys } };

  const sequenceScope = purchaseSequenceScope(accountKey);
  const storedSequence = keys[sequenceScope];
  const sequence = storedSequence && /^\d+$/.test(storedSequence) ? Number(storedSequence) : 0;
  if (!Number.isSafeInteger(sequence) || sequence >= Number.MAX_SAFE_INTEGER) {
    throw new Error("GENESIS_PURCHASE_SEQUENCE_INVALID");
  }
  const nextSequence = sequence + 1;
  const sig = `${accountKey}|${n}|${(tokenIds ?? []).join(",")}`;
  const key = `genesis-purchase:${sig}:${nextSequence}`;
  return {
    key,
    keys: { ...keys, [sequenceScope]: String(nextSequence), [pendingScope]: key },
  };
}

export function retireGenesisPurchaseIntent(
  keys: Record<string, string>,
  accountKey: string,
  n: number,
  tokenIds?: number[],
): Record<string, string> {
  const pendingScope = purchaseIntentScope(accountKey, n, tokenIds);
  if (!(pendingScope in keys)) return { ...keys };
  const next = { ...keys };
  delete next[pendingScope];
  return next;
}

import { createGenesisActivityPager } from "@/lib/genesis-activity-pager";

export const useGenesis = defineStore("genesis", () => {
  const cfg = useGenesisConfig(); // 单向读配置(档位定价);同 free-trial→trial-config 先例
  const initGlobal = remoteApiEnabled ? remoteDefaults() : hydrateGlobal();
  // 账号维度。boot 期与 app store 同款落 "default";账号确定后由
  // lib/account-scope 的 rebindAccountScopedStores 统一重绑(P-031 store 不互 import)。
  let boundKey = "default";
  const initUser = remoteApiEnabled ? userDefaults() : hydrateUser(boundKey, initGlobal.soldSlots);
  const totalSlots = ref(remoteApiEnabled ? 0 : TOTAL_SLOTS);
  const soldSlots = ref(initGlobal.soldSlots);
  // A numeric zero is a valid server fact. Keep its availability separately so
  // pages never present the remote bootstrap/failure sentinel as a sale count.
  const remoteSupplyKnown = ref(!remoteApiEnabled);
  const myOwned = ref(initUser.myOwned);
  const ownedTokenIds = ref<Array<string | number>>(initUser.ownedTokenIds);
  const myListings = ref<MyListing[]>(initUser.myListings);
  const nexListed = ref(initGlobal.nexListed);
  const nexListedAt = ref<number | null>(initGlobal.nexListedAt);
  const lastTickTs = ref(0);
  const holdingNoByTokenId = ref<Record<string, string>>({});
  const listingNoByTokenId = ref<Record<string, string>>({});
  const remoteListings = ref<Array<{ tokenId: string; holdingNo: string; priceUSDT: number; seller: string; listedAt: number }>>([]);
  const activityPager = createGenesisActivityPager((cursor) => genesisApi.transactionPage(cursor));
  const remoteTransactions = computed(() => activityPager.state.items);
  const orderPager = createGenesisActivityPager((cursor) => genesisApi.orderPage(cursor));
  const remoteOrders = computed(() => orderPager.state.items);
  const remoteMarketStats = ref<GenesisMarketStats>({
    floorUsdt: null, volume24hUsdt: null, owners: null, floorDeltaPct: null, lastSaleUsdt: null,
  });
  // The active series projects this rate from the same canonical source that settles trades.
  // Null means the public projection is unavailable; pages must not replace it with 0%.
  const remoteRoyaltyPct = ref<number | null>(null);
  const remoteEligibility = ref<GenesisEligibility | null>(null);
  const remoteEligibilityError = ref<string | null>(null);
  const remotePublicError = ref<string | null>(null);
  const remotePublicReadState = ref<GenesisRemoteReadState>(remoteApiEnabled ? "loading" : "ready");
  const remoteAccountReadState = ref<GenesisRemoteReadState>(remoteApiEnabled ? "loading" : "ready");
  const remoteHalted = ref(remoteApiEnabled);
  const remoteHoldings = ref<GenesisHolding[]>([]);
  const emissionPager = createGenesisActivityPager((cursor) => genesisApi.emissionPage(cursor), (item) => `${item.batchNo}:${item.holdingNo}`);
  const remoteEmissions = computed(() => emissionPager.state.items);
  const remoteEmissionTotals = ref<GenesisAccountState["emissionTotals"]>(null);
  const intentKeys = ref<Record<string, string>>(initUser.idempotencyKeys ?? {});
  const marketCommands = ref<Record<string, GenesisMarketCommand>>({});
  let marketJournalReady = true;
  const marketLocks = new Map<string, symbol>();
  const remoteSecondaryCommandProtocol = ref(0);
  const remoteAccountEpoch = createRemoteAccountEpoch(boundKey);
  let remoteReadGeneration = 0;

  const tokenIdFor = genesisHoldingId;

  function applyPublicState(state: GenesisPublicState): void {
    remotePublicError.value = null;
    remoteSecondaryCommandProtocol.value = state.secondaryCommandProtocol === 2 ? 2 : 0;
    remotePublicReadState.value = "ready";
    totalSlots.value = state.series.totalSupply;
    soldSlots.value = state.series.soldSupply;
    remoteSupplyKnown.value = true;
    nexListed.value = state.emissionOpen;
    activityPager.reset(state.transactions, state.transactionsNextCursor ?? null);
    remoteMarketStats.value = state.marketStats;
    remoteRoyaltyPct.value = state.series.royaltyPct;
    remoteHalted.value = state.halted;
    const listingMap: Record<string, string> = Object.create(null);
    remoteListings.value = state.listings.map((listing) => {
      const tokenId = tokenIdFor(listing.holdingNo);
      listingMap[tokenId] = listing.holdingNo;
      return { tokenId, holdingNo: listing.holdingNo, priceUSDT: listing.askPriceUsdt, seller: listing.seller, listedAt: listing.listedAt };
    });
    listingNoByTokenId.value = listingMap;
  }

  function applyAccountState(state: GenesisAccountState): void {
    remoteAccountReadState.value = "ready";
    // Account responses are canonical development/production facts. Supply is
    // still owned by GET /api/genesis/state; account reads cannot replace it.
    const holdingMap: Record<string, string> = Object.create(null);
    remoteRoyaltyPct.value = state.series?.royaltyPct ?? null;
    const ids = state.holdings.map((holding) => {
      const tokenId = tokenIdFor(holding.holdingNo);
      holdingMap[tokenId] = holding.holdingNo;
      return tokenId;
    });
    holdingNoByTokenId.value = holdingMap;
    remoteHoldings.value = [...state.holdings];
    emissionPager.reset(state.emissions, state.emissionsNextCursor ?? null);
    orderPager.reset(state.orders, state.ordersNextCursor ?? null);
    remoteEmissionTotals.value = state.emissionTotals ?? null;
    ownedTokenIds.value = ids;
    myOwned.value = ids.length;
    remoteEligibility.value = state.eligibility;
    remoteEligibilityError.value = null;
    myListings.value = state.holdings
      .filter((holding) => holding.status === "LISTED" && holding.listingPriceUsdt !== null)
      .map((holding) => ({ tokenId: tokenIdFor(holding.holdingNo), askPriceUSDT: holding.listingPriceUsdt!, listedAt: holding.listedAt ?? Date.now() }));
  }

  /** A successful mutation response is the canonical committed receipt. Apply
   * both its account facts and supply before any later readback can fail. */
  function applyCommittedPurchaseReceipt(state: GenesisAccountState): void {
    if (state.series) {
      totalSlots.value = state.series.totalSupply;
      soldSlots.value = state.series.soldSupply;
    }
    applyAccountState(state);
  }

  function applySecondaryCommandReceipt(state: GenesisAccountState, request: RemoteAccountRequest, runScope: RuntimeRevisionScope): void {
    // Invalidate older reads before applying the committed account receipt.
    // Only market facts need refreshing: a failed GET must not erase the
    // holding/listing that the successful command has just confirmed.
    const generation = ++remoteReadGeneration;
    applyAccountState(state);
    remotePublicReadState.value = "loading";
    void genesisApi.state().then((publicState) => {
      if (generation === remoteReadGeneration && remoteScopeCurrent(request, runScope)) applyPublicState(publicState);
    }).catch(() => {
      if (generation === remoteReadGeneration && remoteScopeCurrent(request, runScope)) clearRemotePublicFacts();
    });
  }

  function clearRemoteAccountFacts(): void {
    remoteAccountReadState.value = "unavailable";
    remoteHoldings.value = [];
    emissionPager.reset([], null);
    orderPager.reset([], null);
    remoteEmissionTotals.value = null;
    holdingNoByTokenId.value = {};
    ownedTokenIds.value = [];
    myListings.value = [];
    myOwned.value = 0;
    remoteEligibility.value = null;
    remoteEligibilityError.value = null;
  }

  function clearRemotePublicFacts(): void {
    remotePublicError.value = null;
    remoteSecondaryCommandProtocol.value = 0;
    remotePublicReadState.value = "unavailable";
    // Zero means the public supply is unknown. Do not render the local 1,000-slot
    // fallback as if it were a server fact after a failed public-state hydrate.
    totalSlots.value = 0;
    soldSlots.value = 0;
    remoteSupplyKnown.value = false;
    nexListed.value = false;
    nexListedAt.value = null;
    remoteListings.value = [];
    activityPager.reset([], null);
    listingNoByTokenId.value = {};
    remoteHalted.value = true;
    remoteMarketStats.value = { floorUsdt: null, volume24hUsdt: null, owners: null, floorDeltaPct: null, lastSaleUsdt: null };
    remoteRoyaltyPct.value = null;
  }

  function clearRemoteFacts(): void {
    clearRemotePublicFacts();
    clearRemoteAccountFacts();
  }

  function remoteScopeCurrent(request: RemoteAccountRequest, runScope: RuntimeRevisionScope): boolean {
    return remoteAccountEpoch.isCurrent(request) && isCurrentRuntimeRevision(runScope);
  }

  async function syncRemote(
    request: RemoteAccountRequest = remoteAccountEpoch.snapshot(),
    runScope: RuntimeRevisionScope = captureRuntimeRevision(),
  ): Promise<boolean> {
    if (!remoteApiEnabled) return true;
    if (!remoteScopeCurrent(request, runScope)) return false;
    const readGeneration = ++remoteReadGeneration;
    remotePublicReadState.value = "loading";
    remoteAccountReadState.value = "loading";
    activityPager.reset(activityPager.state.items, null);
    orderPager.reset(orderPager.state.items, null);
    emissionPager.reset(emissionPager.state.items, null);
    // Public supply/market facts are readable without a user session. The
    // orchestrator independently fences protected account/eligibility reads
    // by bearer authority and account/RunID epoch.
    const loaded = await readGenesisRemoteFacts(genesisApi, {
      hasAuthority: () => hasGenesisAuthorityForAccount(sessionVault.read(), boundKey),
      isCurrent: () => readGeneration === remoteReadGeneration && remoteScopeCurrent(request, runScope),
      clear: clearRemoteFacts,
      clearPublic: clearRemotePublicFacts,
      clearAccount: clearRemoteAccountFacts,
      applyEligibilityError: (reason) => {
        // BUG 174: 资格不可用 ≠ 账号投影不可用。把前者写进
        // remoteAccountReadState 会让持仓页/订单页把「Genesis 未开放」
        // 误报成「账号数据读取失败」,并连带清空已经读到的订单。
        remoteEligibilityError.value = reason;
      },
      applyPublicError: (reason) => { remotePublicError.value = reason; },
      applyPublicState,
      applyAccount: applyAccountState,
      applyEligibility: (eligibility) => {
        remoteEligibility.value = eligibility;
        remoteEligibilityError.value = null;
      },
    });
    if (readGeneration === remoteReadGeneration && remoteScopeCurrent(request, runScope)) {
      if (remotePublicReadState.value === "loading") remotePublicReadState.value = "unavailable";
      if (remoteAccountReadState.value === "loading") remoteAccountReadState.value = "unavailable";
    }
    return loaded;
  }

  let commandStorageOwned = false;

  function reloadCommandJournal(): boolean {
    try {
      const table = uni.getStorageSync(ACCOUNTS_KEY);
      if (table && (typeof table !== "object" || Array.isArray(table))) throw new Error("GENESIS_COMMAND_JOURNAL_INVALID");
      const row = table?.[boundKey] as Partial<GenesisUserData> | undefined;
      if (row && (typeof row !== "object" || Array.isArray(row))) throw new Error("GENESIS_COMMAND_JOURNAL_INVALID");
      const keys = row?.idempotencyKeys ?? {};
      if (typeof keys !== "object" || Array.isArray(keys)
        || Object.values(keys).some((key) => typeof key !== "string")) throw new Error("GENESIS_COMMAND_JOURNAL_INVALID");
      const commands = hydrateGenesisMarketCommands(row?.marketCommands, keys, boundKey);
      // A failed terminal-marker write is still known in this context. Keep it
      // only while the corresponding durable pending record still exists.
      for (const [id, command] of Object.entries(commands)) {
        const known = marketCommands.value[id];
        if (known?.state === "confirmed" && known.key === command.key
          && known.operation === command.operation && known.holdingNo === command.holdingNo
          && known.priceUsdt === command.priceUsdt) commands[id] = { ...command, state: "confirmed" };
      }
      intentKeys.value = { ...keys };
      marketCommands.value = commands;
      marketJournalReady = true;
      return true;
    } catch {
      marketJournalReady = false;
      return false;
    }
  }

  function persist(): boolean {
    if (!marketJournalReady || (remoteApiEnabled && !commandStorageOwned)) return false;
    try {
      uni.setStorageSync(STORAGE_KEY, {
        soldSlots: soldSlots.value,
        nexListed: nexListed.value,
        nexListedAt: nexListedAt.value,
      });
    } catch {
      // storage unavailable
    }
    return writeAccountRow<GenesisUserData>(ACCOUNTS_KEY, boundKey, {
      myOwned: myOwned.value,
      ownedTokenIds: ownedTokenIds.value,
      myListings: myListings.value,
      idempotencyKeys: intentKeys.value,
      marketCommands: marketCommands.value,
    });
  }

  /** 账号切换重绑:装载该账号的持仓行,全平台片顺带刷新(多端可能已推进)。
   *  业务变更处处即时 persist,旧账号无需先落盘。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    if (remoteApiEnabled) {
      remoteAccountEpoch.bind(boundKey);
      const hydrated = hydrateUser(boundKey, 0);
      intentKeys.value = hydrated.idempotencyKeys ?? {};
      marketLocks.clear();
      try {
        marketCommands.value = hydrateGenesisMarketCommands(hydrated.marketCommands, intentKeys.value, boundKey);
        marketJournalReady = true;
      } catch {
        marketJournalReady = false;
        marketCommands.value = {};
      }
      clearRemoteFacts();
      void syncRemote(remoteAccountEpoch.snapshot());
      return;
    }
    const g = hydrateGlobal();
    soldSlots.value = g.soldSlots;
    nexListed.value = g.nexListed;
    nexListedAt.value = g.nexListedAt;
    const u = hydrateUser(boundKey, g.soldSlots);
    myOwned.value = u.myOwned;
    ownedTokenIds.value = u.ownedTokenIds;
    myListings.value = u.myListings;
    intentKeys.value = u.idempotencyKeys ?? {};
    void syncRemote();
  }

  function remaining() {
    return Math.max(0, totalSlots.value - soldSlots.value);
  }
  function soldPct() {
    return totalSlots.value > 0 ? soldSlots.value / totalSlots.value : 0;
  }

  // ── 阶梯定价（单源派生，售罄硬跳价；档位读 live config，运营 G4 可配）──
  const currentTier = computed(() => tierForSold(cfg.config.tiers, soldSlots.value));
  /** 当前档单价。兼容旧读法 `genesis.unitPriceUSDT`（原为固定 $9,999，现随档位）。 */
  const unitPriceUSDT = computed(() => currentTier.value.priceUSDT);
  /** 某档剩余席位（售罄档 = 0）。 */
  function tierRemaining(id: GenesisTier["id"]): number {
    const tier = cfg.config.tiers.find((t) => t.id === id);
    if (!tier) return 0;
    return Math.max(0, tier.to - Math.max(tier.from, soldSlots.value));
  }

  // ── 上所开阀门（全平台一次性事件；fail-closed）──
  /** 派生门：仅 nexListed === true 才开；脏/未知数据默认不开（不误显 live 排放）。 */
  const dividendsOpen = computed(() => nexListed.value === true);
  /**
   * 翻转上所信号。真后台为 server-canonical（GET /api/config/genesis），此处 mock。
   * 幂等记录首次上所时间锚，排放 vesting 从此刻起算。
   */
  function setNexListed(v: boolean) {
    if (remoteApiEnabled) return;
    nexListed.value = v;
    if (v && nexListedAt.value == null) nexListedAt.value = Date.now();
    if (!v) nexListedAt.value = null;
    persist();
  }

  // ── 排放快照（上所后；backend-replaceable mock）──
  function emissionSnapshot(): EmissionSnapshot {
    const listedAt = nexListedAt.value;
    const months = dividendsOpen.value && listedAt != null ? Math.max(0, (Date.now() - listedAt) / MONTH_MS) : 0;
    const pct = dividendsOpen.value ? emissionReleasedFraction(months) : 0;
    const nominal = myOwned.value * GENESIS_EMISSION.nominalPerNodeNEX;
    const emitted = nominal * pct;
    const nextRelease = listedAt != null ? listedAt + (Math.floor(months) + 1) * MONTH_MS : Date.now() + MONTH_MS;
    return {
      pctReleased: pct,
      emittedNEX: emitted,
      lockedNEX: nominal - emitted,
      nextReleaseAt: nextRelease,
      monthsSinceListing: months,
    };
  }
  /** 每节点名义预留额度（NEX）—— 展示为「预留额度」，非保证。 */
  function reservedAllocationNEX() {
    return myOwned.value * GENESIS_EMISSION.nominalPerNodeNEX;
  }

  /**
   * 🔴🔴 同一笔创世购买意图的幂等键 —— **跨重试复用,不是每次现造**。
   *
   * 缺陷现场(2026-08-13 对齐轮回源发现):原写法是
   *   `genesis-purchase:${boundKey}:${Date.now()}:${Math.random()…}`
   * —— 每调一次就是一把新键,**服务端的幂等去重永远命中不了**。
   * 于是「购买超时 / 断网(而服务端其实已经成交)→ 用户再点一次」= 服务端当成新请求 = **真买两笔**。
   * 这正是本仓幂等门 ④ 明令禁止的形态(「带时间戳判重永不命中,幂等出口退化成普通出口」),
   * 只是本 store 当时不在那道门的名单里,所以一直没人管。
   *
   * 判据:**换了任何一样「用户在要什么」的东西,才是另一笔意图**。
   * 签名 = 账号 | 数量 | 指定的 tokenId 集合。意图不变则重试沿用同一把键;
   * 成交后作废(下一次点购买是新的一笔意图)。
   *
   * ⚠️ 故意不带时间 / 随机数 / 价格:
   * · 时间与随机数会让重试变成新请求(就是上面那个缺陷);
   * · 价格是**平台状态**不是「用户在要什么」—— 把它放进签名,行情一动键就换,
   *   正好在最不该换键的那一刻换掉(与提现那条 policyVersion 的教训同型)。
   */
  // 键体只用账号、购买意图与持久化单调序号。pending 键先落账号行再发请求：
  // 未知结果跨刷新复用；收到成功回执后只清 pending，保留序号，下一次同数量购买必然换键。
  function purchaseIdempotencyKey(n: number, tokenIds?: number[]): string | null {
    const previous = intentKeys.value;
    const claimed = claimGenesisPurchaseIntent(previous, boundKey, n, tokenIds);
    intentKeys.value = claimed.keys;
    if (persist()) return claimed.key;
    intentKeys.value = previous;
    return null;
  }
  /** 成交后作废 pending；序号继续持久化，避免重启后撞上已完成订单。 */
  function clearPurchaseIntent(n: number, tokenIds?: number[]): boolean {
    const previous = intentKeys.value;
    intentKeys.value = retireGenesisPurchaseIntent(previous, boundKey, n, tokenIds);
    if (persist()) return true;
    intentKeys.value = previous;
    return false;
  }

  function claimMarketCommand(operation: GenesisMarketOperation, holdingNo: string, priceUsdt: number | null): GenesisMarketCommand | null {
    const previousKeys = intentKeys.value;
    const previousCommands = marketCommands.value;
    const sequenceScope = `${boundKey}|market-command-sequence`;
    const stored = previousKeys[sequenceScope];
    const sequence = stored === undefined ? 0 : /^\d+$/.test(stored) ? Number(stored) : NaN;
    if (!Number.isSafeInteger(sequence) || sequence >= Number.MAX_SAFE_INTEGER) return null;
    const namespaceScope = `${boundKey}|market-command-namespace`;
    const namespace = previousKeys[namespaceScope] || requireCryptoUuid();
    const key = `genesis:v2:${namespace}:${sequence + 1}`;
    const command: GenesisMarketCommand = { version: 2, key, holdingNo, operation, priceUsdt,
      createdAt: Date.now(), state: "pending" };
    intentKeys.value = { ...previousKeys, [namespaceScope]: namespace, [sequenceScope]: String(sequence + 1) };
    marketCommands.value = { ...previousCommands, [key]: command };
    if (persist()) return command;
    intentKeys.value = previousKeys;
    marketCommands.value = previousCommands;
    return null;
  }

  function settleMarketCommand(id: string): boolean {
    const command = marketCommands.value[id];
    if (!command) return true;
    // Save a terminal marker before deletion. If either storage write fails,
    // retain the in-memory marker and lock; a later attempt is storage-only.
    marketCommands.value = { ...marketCommands.value, [id]: { ...command, state: "confirmed" } };
    if (!persist()) return false;
    const previousCommands = marketCommands.value;
    const previousKeys = intentKeys.value;
    const commands = { ...previousCommands };
    const keys = { ...previousKeys };
    delete commands[id];
    if (command.legacySlot && keys[command.legacySlot] === command.key) delete keys[command.legacySlot];
    marketCommands.value = commands;
    intentKeys.value = keys;
    if (persist()) return true;
    marketCommands.value = previousCommands;
    intentKeys.value = previousKeys;
    return false;
  }

  async function runMarketCommand(operation: GenesisMarketOperation, holdingNo: string, priceUsdt: number | null,
    execute: (key: string) => Promise<GenesisAccountState>): Promise<GenesisCommandOutcome> {
    if (remoteSecondaryCommandProtocol.value !== 2 || marketLocks.has(holdingNo)) return false;
    const owner = Symbol(holdingNo);
    marketLocks.set(holdingNo, owner);
    const request = remoteAccountEpoch.snapshot();
    const runScope = captureRuntimeRevision();
    const current = () => remoteScopeCurrent(request, runScope);
    try {
      return await withGenesisCommandLock<GenesisCommandOutcome>(async () => {
        if (!current() || !reloadCommandJournal()) return false;
        commandStorageOwned = true;
        try {
          const previous = Object.entries(marketCommands.value).filter(([, row]) => row.holdingNo === holdingNo);
          if (previous.length) {
            for (const [id, command] of previous) {
              if (command.state !== "confirmed") {
                const status = await genesisApi.commandStatus(command.operation, holdingNo, command.key, command.priceUsdt);
                if (!current()) return false;
                // Missing/unknown/in-progress records never authorize a second mutation.
                if (status !== "SUCCEEDED" && status !== "FAILED") return false;
              }
              if (!settleMarketCommand(id)) return "local-retirement-pending";
            }
            // The lookup establishes only the historical outcome. Render fresh account
            // facts, never an old replay response or a success for this new button press.
            await syncRemote(request, runScope);
            return current() && remoteAccountReadState.value === "ready" ? "recovered" : false;
          }
          const command = claimMarketCommand(operation, holdingNo, priceUsdt);
          if (!command) return false;
          const state = await execute(command.key);
          if (!current()) return false;
          applySecondaryCommandReceipt(state, request, runScope);
          return settleMarketCommand(command.key) ? true : "local-retirement-pending";
        } finally { commandStorageOwned = false; }
      }, false);
    } finally {
      if (marketLocks.get(holdingNo) === owner) marketLocks.delete(holdingNo);
    }
  }

  async function purchase(
    n: number,
    tokenIds?: number[],
  ): Promise<{ ok: boolean; cost: number; walletBalanceUsdt?: number; walletReceiptSourceEnvironment?: GenesisAccountState["sourceEnvironment"]; reason?: "sold-out" | "cap" | "not-eligible" | "market-closed" | "insufficient-funds" | "run-conflict" | "unavailable" }> {
    // 🔴🔴 2026-08-13:这道 `if (remoteApiEnabled)` 曾经**漏写**,后果是下面整段本地实现
    //   (mock 的 server 同构面)成了死代码 —— TypeScript 开 allowUnreachableCode:false
    //   直接点名本文件 5 处不可达(purchase / listNode / cancelListing / acquireSecondary /
    //   tickSales)。实测 mock 模式下点购买必然失败,还谎报「市场暂未开放」。
    //   同批迁移的其它 store 都是「守卫 ≥ 远端调用」(app.ts 11/8 · cards 7/1),创世是唯一例外。
    //   机器门:verify.sh 的 `store-unreachable-code` 哨兵钉死 src/store/** 不可达数 = 0。
    if (remoteApiEnabled) {
      const request = remoteAccountEpoch.snapshot();
      const runScope = captureRuntimeRevision();
      return withGenesisCommandLock(async () => {
        if (!remoteScopeCurrent(request, runScope) || !reloadCommandJournal()) return { ok: false, cost: 0, reason: "unavailable" as const };
        commandStorageOwned = true;
        try {
          const beforePrice = unitPriceUSDT.value;
          const idempotencyKey = purchaseIdempotencyKey(n, tokenIds);
          if (!idempotencyKey) return { ok: false, cost: 0, reason: "unavailable" as const };
          const resolution = await resolveRemoteGenesisPurchase({
            execute: () => genesisApi.purchase(n, idempotencyKey),
            isCurrent: () => remoteScopeCurrent(request, runScope),
            applyReceipt: applyCommittedPurchaseReceipt,
            retireIntent: () => clearPurchaseIntent(n, tokenIds),
            recoverUnknown: () => syncRemote(request, runScope),
          });
          if (!resolution.ok) return { ok: false, cost: 0, reason: resolution.reason };
          const state = resolution.state;
          return {
            ok: true,
            cost: n * beforePrice,
            walletBalanceUsdt: state.walletBalanceUsdt,
            walletReceiptSourceEnvironment: state.sourceEnvironment,
          };
        } finally { commandStorageOwned = false; }
      }, { ok: false, cost: 0, reason: "unavailable" as const });
    }

    // ↓↓ mock 模式(remoteApiEnabled=false)走这里:本仓的 server 同构面,不是遗留死码。
    // 🔴 **服务端侧拒单**(规格 FEAT-GEN10 异常1/异常4)。前端置灰只挡住「正常点」,
    //   挡不住深链直达结算、也挡不住「用户已打开购买半屏、运营此刻切关闭」。
    //   这一层是 mock 的 server 同构面:**不管谁调、从哪调,关闭态一律拒**。
    //   判定复用 genesisPurchaseBlock 同一条链 —— 页面与 store 不是两套规则。
    const cfgStore = useGenesisConfig();
    // 🔴 动钱前重读权威源(独立验收 P0→P1「hydrate-once」):不 refresh 的话,判定读的是
    //   store 构造时的内存快照 —— 运营切关闭后,已打开的会话照样买(实测 $23,998)。
    //   真后台此行即「下单前服务端校验」,mock 期读盘就是读 server。
    // 🔴 必须 await:不 await 的话这句只是发出一个 promise 就往下走,下面读到的仍是**旧**快照 ——
    //    「动钱前重读权威源」这个 P0 修法整整一直是空转。三处同型(purchase/listNode/acquireSecondary)。
    await cfgStore.refresh();
    const blocked = genesisPurchaseBlock({
      configLoaded: cfgStore.loaded,
      marketOpenState: cfgStore.config.marketOpenState,
      halted: false, // 熔断槽位;见 genesis-config.ts 的 GenesisPurchaseInput.halted
      remaining: remaining(),
      saleStartAt: cfgStore.config.saleStartAt,
      now: Date.now(),
    });
    // sold-out / cap 沿用下方原有的更精确回执;这里只拦「不该卖」的那几种。
    if (blocked === "marketClosed" || blocked === "halted" || blocked === "configUnavailable") {
      return { ok: false, cost: 0, reason: "market-closed" };
    }
    const rem = remaining();
    if (n > rem) return { ok: false, cost: 0, reason: "sold-out" };
    // 5174 离线镜像上限；生产认购由服务端配置再次原子校验。
    if (myOwned.value + n > GENESIS_ELIGIBILITY_POLICY.maxPerUser) return { ok: false, cost: 0, reason: "cap" };
    // 按下单时当前档价结算（跨档时以起始档价，简化：整单同价）。
    const cost = n * unitPriceUSDT.value;
    const requestedIds = tokenIds ?? [];
    const ids: number[] =
      requestedIds.length === n
        ? [...requestedIds]
        : Array.from({ length: n }, (_, i) => soldSlots.value + 1 + i);
    soldSlots.value = Math.min(TOTAL_SLOTS, soldSlots.value + n);
    myOwned.value = myOwned.value + n;
    ownedTokenIds.value = [...ownedTokenIds.value, ...ids];
    persist();
    return { ok: true, cost };
  }

  async function listNode(tokenId: string | number, askPriceUSDT: number): Promise<GenesisCommandOutcome> {
    if (parseGenesisListingPrice(String(askPriceUSDT)) === null) return false;
    // 🔴 守卫必须在 holdingNo 之前:holdingNo 由服务端状态派生,mock 下恒空 ——
    //   守卫放在 lookup 之后的话,本地路径照样被 `if (!holdingNo) return false` 挡死。
    if (remoteApiEnabled) {
    const holdingNo = holdingNoByTokenId.value[tokenId];
    if (!holdingNo) return false;
    const request = remoteAccountEpoch.snapshot();
    const runScope = captureRuntimeRevision();
    try {
      return await runMarketCommand("list", holdingNo, askPriceUSDT, (key) => genesisApi.list(holdingNo, askPriceUSDT, key));
    } catch { await syncRemote(request, runScope); return false; }
    }

    // ↓↓ mock 模式走这里(本仓的 server 同构面)。
    // 🔴 挂单出售与承接走**同一个**关闭闸(规格 FEAT-GEN10 ② 明写要锁的两个入口是
    //   「购买 / 二级市场挂单」;「挂单」在本产品词汇表里是卖方动作,买方叫「承接」)。
    //   不接闸的后果不是「少拦一次」,而是关闭态下产出一批**谁也接不了的死单**:
    //   卖家以为在等买家,运营以为已停市而挂单数还在涨,客服查不出这单从一开始就无效。
    //   用 genesisSecondaryBlock 而非 genesisPurchaseBlock:挂单是二级动作,
    //   主售售罄 / 未开售都不该妨碍转让,只有「市场关闭 / 熔断 / 配置未知」才拦。
    const cfgStore = useGenesisConfig();
    await cfgStore.refresh(); // 动状态前重读权威源,同 purchase(hydrate-once 修复;必须 await)
    if (
      genesisSecondaryBlock({
        loaded: cfgStore.loaded,
        marketOpenState: cfgStore.config.marketOpenState,
        now: Date.now(),
      }) !== null
    ) {
      return false;
    }
    if (!ownedTokenIds.value.includes(tokenId)) return false;
    if (myListings.value.some((l) => l.tokenId === tokenId)) return false;
    if (askPriceUSDT <= 0) return false;
    myListings.value = [...myListings.value, { tokenId, askPriceUSDT, listedAt: Date.now() }];
    persist();
    return true;
  }

  // 🔴 **撤单刻意不接闸** —— 它是**离场手段**,不是市场参与入口。
  //   规格 ② 点名要锁的是「购买 / 挂单」两个**入口**,撤单不在其中。
  //   若关闭态连撤单也拦,用户的席位就被困在一张永远卖不掉的单里,既不能撤回也无人承接
  //   —— 那是拿「停止交易」当借口没收用户的处置权,比漏拦一次严重得多。
  //   (同理由已登记进机器门 selfcheck-genesis-gate.mjs 的豁免台账,不是漏做。)
  async function cancelListing(tokenId: string | number): Promise<GenesisCommandOutcome> {
    if (remoteApiEnabled) {                                   // 同 listNode:守卫必须在 holdingNo 之前
    const holdingNo = holdingNoByTokenId.value[tokenId];
    if (!holdingNo) return false;
    const request = remoteAccountEpoch.snapshot();
    const runScope = captureRuntimeRevision();
    try {
      return await runMarketCommand("cancel", holdingNo, null, (key) => genesisApi.cancel(holdingNo, key));
    } catch { await syncRemote(request, runScope); return false; }
    }

    // ↓↓ mock 模式走这里(本仓的 server 同构面)。
    if (!myListings.value.some((l) => l.tokenId === tokenId)) return false;
    myListings.value = myListings.value.filter((l) => l.tokenId !== tokenId);
    persist();
    return true;
  }

  /**
   * 二级市场承接:买入一个**已存在**的 token（转让,非铸造）。
   * 🔴 不动 soldSlots（该 token 早已计入一级「已铸」+ 派生档价）、不走售罄门 —— 二级承接
   * 与一级供应无关。已持有该 token 则 no-op 返 false（调用方须退款）。
   * 新资格策略固定覆盖一级与二级交易；生产端在原子成交事务内再次校验。
   * 真后台 = POST /api/genesis/secondary/fulfill（原子:校验挂单+资格→扣买家→贷卖家扣版税→转 token）。
   */
  async function acquireSecondary(tokenId: string | number, expectedPriceUsdt: number): Promise<GenesisCommandOutcome> {
    if (parseGenesisListingPrice(String(expectedPriceUsdt)) === null) return false;
    if (remoteApiEnabled) {                                   // 同 listNode:守卫必须在 holdingNo 之前
    const holdingNo = listingNoByTokenId.value[tokenId];
    if (!holdingNo) return false;
    const request = remoteAccountEpoch.snapshot();
    const runScope = captureRuntimeRevision();
    try {
      return await runMarketCommand("buy", holdingNo, expectedPriceUsdt, (key) => genesisApi.buy(holdingNo, expectedPriceUsdt, key));
    } catch (error) {
      await syncRemote(request, runScope);
      // Preserve the backend policy/error token for the visible purchase surface.
      // Treating every rejection as "insufficient funds" hides geo-policy and
      // fail-closed responses and makes the user retry an action that cannot pass.
      throw error;
    }
    }

    // ↓↓ mock 模式走这里(本仓的 server 同构面)。
    // 🔴 二级市场与主售用**同一个**关闭闸(规格 FEAT-GEN10 ⑥)。只锁前端入口不锁这里,
    //   深链照样能承接。
    //   注意:这里**不**看 soldOut / preSale —— 二级卖的是别人手里的存量,
    //   主售售罄或未开售都不妨碍转让;只有「市场关闭 / 熔断 / 配置未知」才拦。
    //
    // 🔴 判定必须**走同一个纯函数**,不许在这手写条件(独立验收 P1-5):
    //   上一版这里写的是 `!loaded || marketOpenState === "closed"`,而注释却声称
    //   「熔断也拦」—— 注释与代码不符,且熔断接线当天二级承接会漏。
    //   现改为喂给 genesisPurchaseBlock,再按「与二级相关的阻断原因」筛,
    //   这样将来往优先级链里加档,这里自动跟上。
    const cfgStore = useGenesisConfig();
    await cfgStore.refresh(); // 动钱前重读权威源,同 purchase(hydrate-once 修复;必须 await)
    const blocked = genesisSecondaryBlock({
      loaded: cfgStore.loaded,
      marketOpenState: cfgStore.config.marketOpenState,
      now: Date.now(),
    });
    if (blocked !== null) return false;
    if (ownedTokenIds.value.includes(tokenId)) return false;
    // 单人限购同样约束二级承接（持有增长的另一唯一入口）。
    if (myOwned.value + 1 > GENESIS_ELIGIBILITY_POLICY.maxPerUser) return false;
    ownedTokenIds.value = [...ownedTokenIds.value, tokenId];
    myOwned.value = myOwned.value + 1;
    persist();
    return true;
  }

  function tickSales() {
    // 接了服务端就以服务端的售出数为准,绝不本地瞎涨;mock 下才跑原型的售出模拟。
    if (remoteApiEnabled) { void syncRemote(); return; }
    const t = Date.now();
    if (t - lastTickTs.value < 30_000) return;
    const inc = 1 + Math.floor(Math.random() * 3); // 1-3
    soldSlots.value = Math.min(TOTAL_SLOTS, soldSlots.value + inc);
    lastTickTs.value = t;
    persist();
  }

  return {
    totalSlots, soldSlots, remoteSupplyKnown, myOwned, ownedTokenIds, myListings, unitPriceUSDT, lastTickTs,
    nexListed, nexListedAt, dividendsOpen, currentTier,
    remaining, soldPct, tierRemaining, setNexListed, emissionSnapshot, reservedAllocationNEX,
    remoteListings, remoteTransactions, remoteMarketStats, remoteRoyaltyPct, remoteEligibility, remoteEligibilityError, remotePublicError,
    remotePublicReadState, remoteAccountReadState, remoteHalted,
    activityPage: activityPager.state, loadMoreActivity: activityPager.more,
    orderPage: orderPager.state, loadMoreGenesisOrders: orderPager.more,
    emissionPage: emissionPager.state, loadMoreEmissions: emissionPager.more, remoteEmissionTotals,
    remoteHoldings, remoteEmissions, remoteOrders, syncRemote,
    purchase, listNode, cancelListing, acquireSecondary, tickSales, bindAccount,
  };
});
