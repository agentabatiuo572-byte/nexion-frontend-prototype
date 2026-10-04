import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";
import { readGenesisHistoryPages } from "./genesis-history-pages";

export type GenesisSourceEnvironment = "PRODUCTION";

export interface GenesisSalePolicy {
  available: boolean;
  eligibilityEnabled: boolean;
  maxPerUser: number;
  minAccountAgeDays: number;
  presaleEnabled: boolean;
  showCountdown: boolean;
  unitPriceUsdt: number;
  startAt: number | null;
  endAt: number | null;
  open: boolean;
}

export interface GenesisEligibility {
  sourceEnvironment: GenesisSourceEnvironment;
  runId: string;
  eligible: boolean;
  reasons: string[];
  ownedCount: number;
  maxPerUser: number;
  remainingCap: number;
  minAccountAgeDays: number;
  accountAgeDays: number;
  halted?: boolean;
  holderStatus: "READY" | "NOT_ELIGIBLE" | "CONFIG_UNAVAILABLE" | "NOT_EFFECTIVE";
  reservedAllocation: number | null;
  reservedAllocationUnit: "NEX";
  priorityRank: number | null;
  priorityTier: "TOP_1" | "TOP_3" | "TOP_5" | "STANDARD" | "NONE";
  qualificationReasonCodes: string[];
  policyVersion: string | null;
  effectiveAt: number | null;
  asOf: number;
  serverTime: number;
  provenance: { source: string; environment: GenesisSourceEnvironment; runId: string };
}

export interface GenesisSeries {
  seriesCode: string;
  name: string;
  totalSupply: number;
  soldSupply: number;
  remainingSupply: number;
  priceUsdt: number;
  royaltyPct: number;
  dailyEmissionRatePct: number;
}

export interface GenesisHolding {
  holdingNo: string;
  seriesCode: string;
  acquiredPriceUsdt: number;
  status: "ACTIVE" | "LISTED";
  listingPriceUsdt: number | null;
  acquiredAt: number;
  listedAt: number | null;
}

export interface GenesisEmission {
  batchNo: string;
  holdingNo: string;
  amountUsdt: number;
  status: "PENDING" | "PAID" | "FAILED";
  paidAt: number | null;
}

export interface GenesisListing {
  holdingNo: string;
  seriesCode: string;
  askPriceUsdt: number;
  listedAt: number;
  seller: string;
}

export interface GenesisTransaction {
  orderNo: string;
  orderType: "PRIMARY" | "SECONDARY";
  quantity: number;
  unitPriceUsdt: number;
  amountUsdt: number;
  royaltyUsdt: number;
  completedAt: number;
}

export interface GenesisTier {
  id: string;
  from: number;
  to: number;
  priceUSDT: number;
}

export interface GenesisPublicState {
  secondaryCommandProtocol?: number;
  sourceEnvironment: GenesisSourceEnvironment;
  runId: string;
  halted: boolean;
  revision: string;
  source: string;
  series: GenesisSeries;
  sale: GenesisSalePolicy;
  marketEnabled: boolean;
  emissionOpen: boolean;
  listings: GenesisListing[];
  transactions: GenesisTransaction[];
  transactionsNextCursor?: string | null;
  tiers: GenesisTier[];
  tiersVersion: number;
  marketOpenState: "open" | "closed";
  marketOpenStateVersion: number;
  showcaseEnabled: boolean;
  closedNoticeKey: string;
  catalogAvailable: boolean;
  tradeAvailable: boolean;
  tradeBlockedReason: string;
  marketStats: GenesisMarketStats;
}

export interface GenesisMarketStats {
  floorUsdt: number | null;
  volume24hUsdt: number | null;
  owners: number | null;
  floorDeltaPct: number | null;
  lastSaleUsdt: number | null;
}

export type GenesisCommandStatus = "SUCCEEDED" | "FAILED" | "PROCESSING" | "UNKNOWN" | "NOT_FOUND" | "MISMATCH";

export interface GenesisAccountState {
  sourceEnvironment: GenesisSourceEnvironment;
  runId: string;
  series: GenesisSeries | null;
  sale: GenesisSalePolicy | null;
  marketEnabled: boolean;
  emissionOpen: boolean;
  holdings: GenesisHolding[];
  emissions: GenesisEmission[];
  orders: GenesisTransaction[];
  ordersNextCursor?: string | null;
  emissionsNextCursor?: string | null;
  emissionTotals?: { paidUsdt: number; pendingUsdt: number } | null;
  eligibility: GenesisEligibility | null;
  walletBalanceUsdt: number;
  billNo?: string;
  receiptId?: string;
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "GENESIS_RESPONSE_INVALID" });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown, min = 0): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : null;
}

function integer(value: unknown, min = 0): number | null {
  const parsed = number(value, min);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function validAuthority(
  row: Record<string, unknown> | null,
  _mode: ApiEnvironment,
): boolean {
  return Boolean(row && row.serverCanonical === true
    && row.sourceEnvironment === "PRODUCTION" && row.runId === "");
}

function timestamp(value: unknown, nullable = false): number | null {
  if (value == null && nullable) return null;
  const raw = text(value);
  if (!raw) return nullable ? null : invalid();
  // API timestamps must identify an instant. A timezone-less LocalDateTime is
  // ambiguous and made Shanghai rows render one hour early on Tokyo devices.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) return invalid();
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : invalid();
}

function parseSeries(value: unknown): GenesisSeries {
  const row = record(value);
  const seriesCode = text(row?.seriesCode);
  const name = text(row?.name);
  const totalSupply = integer(row?.totalSupply);
  const soldSupply = integer(row?.soldSupply);
  const remainingSupply = integer(row?.remainingSupply);
  const priceUsdt = number(row?.priceUsdt, 0.000001);
  const royaltyPct = number(row?.royaltyPct);
  const dailyEmissionRatePct = number(row?.dailyEmissionRatePct);
  if (!row || !seriesCode || !name || totalSupply === null || soldSupply === null
      || remainingSupply === null || soldSupply + remainingSupply !== totalSupply
      || priceUsdt === null || royaltyPct === null || dailyEmissionRatePct === null) return invalid();
  return { seriesCode, name, totalSupply, soldSupply, remainingSupply, priceUsdt, royaltyPct, dailyEmissionRatePct };
}

function parseSale(value: unknown): GenesisSalePolicy {
  const row = record(value);
  const maxPerUser = integer(row?.maxPerUser);
  const minAccountAgeDays = integer(row?.minAccountAgeDays);
  const unitPriceUsdt = number(row?.unitPriceUsdt, 0.000001);
  if (!row || row.serverCanonical !== true || typeof row.available !== "boolean"
      || typeof row.eligibilityEnabled !== "boolean"
      || maxPerUser === null || minAccountAgeDays === null
      || typeof row.presaleEnabled !== "boolean" || typeof row.showCountdown !== "boolean"
      || unitPriceUsdt === null || typeof row.open !== "boolean") return invalid();
  return {
    available: row.available,
    eligibilityEnabled: row.eligibilityEnabled,
    maxPerUser,
    minAccountAgeDays,
    presaleEnabled: row.presaleEnabled,
    showCountdown: row.showCountdown,
    unitPriceUsdt,
    startAt: timestamp(row.startAt, true),
    endAt: timestamp(row.endAt, true),
    open: row.open,
  };
}

function parseEligibility(value: unknown, mode: ApiEnvironment): GenesisEligibility {
  const row = record(value);
  const ownedCount = integer(row?.ownedCount);
  const maxPerUser = integer(row?.maxPerUser);
  const remainingCap = integer(row?.remainingCap);
  const minAccountAgeDays = integer(row?.minAccountAgeDays);
  const accountAgeDays = integer(row?.accountAgeDays);
  const holderStatus = text(row?.status);
  const reservedAllocation = row?.reservedAllocation == null ? null : number(row.reservedAllocation);
  const priorityRank = row?.priorityRank == null ? null : integer(row.priorityRank, 1);
  const priorityTier = text(row?.priorityTier);
  const policyVersion = row?.policyVersion == null ? null : text(row.policyVersion);
  const effectiveAt = row?.effectiveAt == null ? null : timestamp(row.effectiveAt, true);
  const asOf = timestamp(row?.asOf);
  const serverTime = timestamp(row?.serverTime);
  const provenance = record(row?.provenance);
  if (!row || !validAuthority(row, mode) || typeof row.eligible !== "boolean"
      || !Array.isArray(row.reasons) || !row.reasons.every((reason) => typeof reason === "string")
      || ownedCount === null || maxPerUser === null || remainingCap === null
      || minAccountAgeDays === null || accountAgeDays === null
      || !holderStatus || !["READY", "NOT_ELIGIBLE", "CONFIG_UNAVAILABLE", "NOT_EFFECTIVE"].includes(holderStatus)
      || (row.reservedAllocation != null && reservedAllocation === null)
      || (row.priorityRank != null && priorityRank === null)
      || !["TOP_1", "TOP_3", "TOP_5", "STANDARD", "NONE"].includes(priorityTier ?? "")
      || (row.policyVersion != null && !policyVersion)
      || asOf === null || serverTime === null || !provenance
      || text(provenance.source) === null
      || provenance.environment !== row.sourceEnvironment || provenance.runId !== row.runId
      || row.reservedAllocationUnit !== "NEX"
      || !Array.isArray(row.qualificationReasonCodes)
      || !row.qualificationReasonCodes.every((reason) => typeof reason === "string" && reason.trim())) return invalid();
  return {
    sourceEnvironment: row.sourceEnvironment as GenesisSourceEnvironment,
    runId: row.runId as string,
    eligible: row.eligible,
    reasons: [...row.reasons] as string[],
    ownedCount,
    maxPerUser,
    remainingCap,
    minAccountAgeDays,
    accountAgeDays,
    halted: typeof row.halted === "boolean" ? row.halted : undefined,
    holderStatus: holderStatus as GenesisEligibility["holderStatus"],
    reservedAllocation,
    reservedAllocationUnit: "NEX",
    priorityRank,
    priorityTier: priorityTier as GenesisEligibility["priorityTier"],
    qualificationReasonCodes: row.qualificationReasonCodes.map((reason) => String(reason).trim()),
    policyVersion,
    effectiveAt,
    asOf,
    serverTime,
    provenance: { source: text(provenance.source)!, environment: provenance.environment as GenesisSourceEnvironment, runId: provenance.runId as string },
  };
}

function parseMarketStats(value: unknown): GenesisMarketStats {
  const row = record(value);
  if (!row) return invalid();
  const nullable = (item: unknown, min = 0): number | null => {
    if (item === null || item === undefined || item === "") return null;
    return number(item, min) ?? invalid();
  };
  return {
    floorUsdt: nullable(row.floorUsdt),
    volume24hUsdt: nullable(row.volume24hUsdt),
    owners: nullable(row.owners),
    floorDeltaPct: nullable(row.floorDeltaPct, Number.NEGATIVE_INFINITY),
    lastSaleUsdt: nullable(row.lastSaleUsdt),
  };
}

function parseHolding(value: unknown): GenesisHolding {
  const row = record(value);
  const holdingNo = text(row?.holdingNo);
  const seriesCode = text(row?.seriesCode);
  // Sandbox acceptance fixtures may represent a server-confirmed holding
  // without a purchase price. Zero is a valid canonical value here; the
  // holder allocation/eligibility projection remains the authority for the
  // visible benefit, while negative prices are still rejected by `number`.
  const acquiredPriceUsdt = number(row?.acquiredPriceUsdt, 0);
  const status = text(row?.status);
  if (!row || !holdingNo || !seriesCode || acquiredPriceUsdt === null
      || (status !== "ACTIVE" && status !== "LISTED")) return invalid();
  return {
    holdingNo,
    seriesCode,
    acquiredPriceUsdt,
    status,
    listingPriceUsdt: row.listingPriceUsdt == null ? null : number(row.listingPriceUsdt, 0.000001) ?? invalid(),
    acquiredAt: timestamp(row.acquiredAt) ?? invalid(),
    listedAt: timestamp(row.listedAt, true),
  };
}

function parseEmission(value: unknown): GenesisEmission {
  const row = record(value);
  const batchNo = text(row?.batchNo);
  const holdingNo = text(row?.holdingNo);
  const amountUsdt = number(row?.amountUsdt, 0.000001);
  const status = text(row?.status);
  if (!row || !batchNo || !holdingNo || amountUsdt === null
      || (status !== "PENDING" && status !== "PAID" && status !== "FAILED")) return invalid();
  return {
    batchNo,
    holdingNo,
    amountUsdt,
    status,
    paidAt: timestamp(row.paidAt, true),
  };
}

function parseListing(value: unknown): GenesisListing {
  const row = record(value);
  const holdingNo = text(row?.holdingNo);
  const seriesCode = text(row?.seriesCode);
  const askPriceUsdt = number(row?.askPriceUsdt, 0.000001);
  const seller = text(row?.seller);
  if (!row || !holdingNo || !seriesCode || askPriceUsdt === null || !seller) return invalid();
  return { holdingNo, seriesCode, askPriceUsdt, seller, listedAt: timestamp(row.listedAt) ?? invalid() };
}

function parseTransaction(value: unknown): GenesisTransaction {
  const row = record(value);
  const orderNo = text(row?.orderNo);
  const orderType = text(row?.orderType);
  const quantity = integer(row?.quantity, 1);
  const unitPriceUsdt = number(row?.unitPriceUsdt, 0.000001);
  const amountUsdt = number(row?.amountUsdt, 0.000001);
  const royaltyUsdt = number(row?.royaltyUsdt);
  if (!row || !orderNo || (orderType !== "PRIMARY" && orderType !== "SECONDARY")
      || quantity === null || unitPriceUsdt === null || amountUsdt === null || royaltyUsdt === null) return invalid();
  return { orderNo, orderType, quantity, unitPriceUsdt, amountUsdt, royaltyUsdt,
    completedAt: timestamp(row.completedAt) ?? invalid() };
}

function parseTier(value: unknown): GenesisTier {
  const row = record(value);
  const id = text(row?.id);
  const from = integer(row?.from);
  const to = integer(row?.to, 1);
  const priceUSDT = number(row?.priceUSDT, 0.000001);
  if (!row || !id || from === null || to === null || to <= from || priceUSDT === null) return invalid();
  return { id, from, to, priceUSDT };
}

export function parseGenesisPublicState(value: unknown, mode: ApiEnvironment = "prod"): GenesisPublicState {
  const row = record(value);
  const market = record(row?.market);
  const emission = record(row?.emission);
  const marketOpenState = text(row?.marketOpenState);
  const tiersVersion = integer(row?.tiersVersion);
  const marketOpenStateVersion = integer(row?.marketOpenStateVersion);
  const closedNoticeKey = text(row?.closedNoticeKey);
  const tradeBlockedReason = typeof row?.tradeBlockedReason === "string" ? row.tradeBlockedReason : null;
  const revision = text(row?.revision);
  const source = text(row?.source);
  if (!row || !validAuthority(row, mode) || !market || !emission
      || typeof row.halted !== "boolean" || !revision || !source
      || typeof market.enabled !== "boolean" || typeof emission.open !== "boolean"
      || !Array.isArray(row.listings) || !Array.isArray(row.transactions) || !Array.isArray(row.tiers)
      || (marketOpenState !== "open" && marketOpenState !== "closed")
      || tiersVersion === null || marketOpenStateVersion === null || !closedNoticeKey
      || typeof row.showcaseEnabled !== "boolean"
      || typeof row.catalogAvailable !== "boolean" || typeof row.tradeAvailable !== "boolean"
      || tradeBlockedReason === null
      || (marketOpenState === "closed" && market.enabled)) return invalid();
  const series = parseSeries(row.series);
  const tiers = row.tiers.map(parseTier);
  let boundary = 0;
  for (const tier of tiers) {
    if (tier.from !== boundary) return invalid();
    boundary = tier.to;
  }
  if (row.catalogAvailable && (!tiers.length || boundary < series.soldSupply)) return invalid();
  if (!row.catalogAvailable && (tiers.length || market.enabled || row.tradeAvailable)) return invalid();
  return {
    sourceEnvironment: row.sourceEnvironment as GenesisSourceEnvironment,
    runId: row.runId as string,
    halted: row.halted,
    revision,
    source,
    series,
    sale: parseSale(row.sale),
    marketEnabled: market.enabled,
    emissionOpen: emission.open,
    listings: row.listings.map(parseListing),
    transactions: row.transactions.map(parseTransaction),
    tiers,
    tiersVersion,
    marketOpenState,
    marketOpenStateVersion,
    showcaseEnabled: row.showcaseEnabled,
    closedNoticeKey,
    catalogAvailable: row.catalogAvailable,
    tradeAvailable: row.tradeAvailable,
    tradeBlockedReason,
    secondaryCommandProtocol: row.secondaryCommandProtocol === 2 ? 2 : 0,
    marketStats: parseMarketStats(row.marketStats),
  };
}

export function parseGenesisAccountState(
  value: unknown,
  mode: ApiEnvironment = "prod",
): GenesisAccountState {
  const row = record(value);
  const noSeries = row?.series === null && row.sale === null && row.eligibility === null;
  const series = noSeries ? null : parseSeries(row?.series);
  const sale = noSeries ? null : parseSale(row?.sale);
  const walletBalanceUsdt = number(row?.walletBalanceUsdt);
  const orders = row?.orders;
  if (!row || !validAuthority(row, mode) || (noSeries && row.marketEnabled !== false)
      || typeof row.marketEnabled !== "boolean"
      || typeof row.emissionOpen !== "boolean" || !Array.isArray(row.holdings)
      || !Array.isArray(row.emissions) || !Array.isArray(orders) || walletBalanceUsdt === null) return invalid();
  return {
    sourceEnvironment: row.sourceEnvironment as GenesisSourceEnvironment,
    runId: row.runId as string,
    series,
    sale,
    marketEnabled: row.marketEnabled,
    emissionOpen: row.emissionOpen,
    holdings: row.holdings.map(parseHolding),
    emissions: row.emissions.map(parseEmission),
    orders: orders.map(parseTransaction),
    emissionTotals: row.emissionTotals == null ? null : {
      paidUsdt: number(record(row.emissionTotals)?.paidUsdt) ?? invalid(),
      pendingUsdt: number(record(row.emissionTotals)?.pendingUsdt) ?? invalid(),
    },
    eligibility: noSeries ? null : parseEligibility(row.eligibility, mode),
    walletBalanceUsdt,
    billNo: text(row.billNo) ?? undefined,
    receiptId: text(row.receiptId) ?? undefined,
  };
}

export function createGenesisApi(client: ApiClient, mode: ApiEnvironment = "prod") {
  async function accountHistoryPage<T>(kind: "orders" | "emissions", parser: (v: unknown) => T, cursor?: string) {
    if (cursor !== undefined && !/^[1-9][0-9]{0,18}$/.test(cursor)) return invalid();
    const row = record(await client.request({ method: "GET", authenticated: true,
      path: `/api/genesis/account?history=${kind}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}` }));
    if (!row || !validAuthority(row, mode) || !Array.isArray(row.items)
        || !(row.nextCursor === null || (typeof row.nextCursor === "string" && /^[1-9][0-9]{0,18}$/.test(row.nextCursor)))) return invalid();
    return { items: row.items.map(parser), nextCursor: row.nextCursor as string | null };
  }
  async function transactionPage(cursor?: string) {
    if (cursor !== undefined && !/^[1-9][0-9]{0,18}$/.test(cursor)) return invalid();
    const row = record(await client.request({ method: "GET", authenticated: false,
      path: `/api/genesis/state?history=transactions${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    }));
    if (!row || !validAuthority(row, mode) || !Array.isArray(row.items)
        || !(row.nextCursor === null || (typeof row.nextCursor === "string" && /^[1-9][0-9]{0,18}$/.test(row.nextCursor)))) return invalid();
    return { items: row.items.map(parseTransaction), nextCursor: row.nextCursor as string | null };
  }
  async function history<T>(kind: string, parser: (value: unknown) => T): Promise<T[]> {
    const authenticated = kind === "orders" || kind === "emissions";
    return readGenesisHistoryPages(async (cursor) => {
      const basePath = authenticated ? "/api/genesis/account" : "/api/genesis/state";
      const query = `?history=${kind}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const row = record(await client.request({ method: "GET", authenticated,
        path: basePath + query,
      }));
      if (!row || !validAuthority(row, mode) || !Array.isArray(row.items)
          || !(row.nextCursor === null || (typeof row.nextCursor === "string" && /^[1-9][0-9]{0,18}$/.test(row.nextCursor)))) return invalid();
      return { items: row.items.map(parser), nextCursor: row.nextCursor as string | null };
    });
  }
  return {
    transactionPage,
    orderPage: (cursor?: string) => accountHistoryPage("orders", parseTransaction, cursor),
    emissionPage: (cursor?: string) => accountHistoryPage("emissions", parseEmission, cursor),
    state: async () => {
      const state = parseGenesisPublicState(await client.request({
      method: "GET", path: "/api/genesis/state", authenticated: false,
      }), mode);
      const [listings, transactions] = await Promise.all([history("listings", parseListing), transactionPage()]);
      return { ...state, listings, transactions: transactions.items, transactionsNextCursor: transactions.nextCursor };
    },
    account: async () => {
      const state = parseGenesisAccountState(await client.request({
      method: "GET", path: "/api/genesis/account", authenticated: true,
      }), mode);
      const [orders, emissions] = await Promise.all([
        accountHistoryPage("orders", parseTransaction), accountHistoryPage("emissions", parseEmission)]);
      return { ...state, orders: orders.items, emissions: emissions.items,
        ordersNextCursor: orders.nextCursor, emissionsNextCursor: emissions.nextCursor };
    },
    eligibility: async () => parseEligibility(await client.request({
      method: "GET", path: "/api/genesis/eligibility", authenticated: true,
    }), mode),
    commandStatus: async (operation: "list" | "cancel" | "buy", holdingNo: string, idempotencyKey: string,
      priceUsdt: number | null): Promise<GenesisCommandStatus> => {
      const row = record(await client.request({ method: "GET", authenticated: true, idempotencyKey,
        path: `/api/genesis/holdings/${encodeURIComponent(holdingNo)}/commands/${operation}`
          + (priceUsdt === null ? "" : `?priceUsdt=${encodeURIComponent(priceUsdt.toFixed(6))}`),
      }));
      if (!row || row.secondaryCommandProtocol !== 2 || !["SUCCEEDED", "FAILED", "PROCESSING", "UNKNOWN", "NOT_FOUND", "MISMATCH"].includes(String(row.status))) return invalid();
      return row.status as GenesisCommandStatus;
    },
    purchase: async (quantity: number, idempotencyKey: string) => parseGenesisAccountState(await client.request({
      method: "POST", path: "/api/genesis/purchase", authenticated: true, idempotencyKey, body: { quantity },
    }), mode),
    list: async (holdingNo: string, askPriceUsdt: number, idempotencyKey: string) =>
      parseGenesisAccountState(await client.request({
        method: "POST",
        path: `/api/genesis/holdings/${encodeURIComponent(holdingNo)}/listing`,
        authenticated: true,
        idempotencyKey,
        body: { askPriceUsdt },
      }), mode),
    cancel: async (holdingNo: string, idempotencyKey: string) => parseGenesisAccountState(await client.request({
      method: "DELETE",
      path: `/api/genesis/holdings/${encodeURIComponent(holdingNo)}/listing`,
      authenticated: true,
      idempotencyKey,
    }), mode),
    buy: async (holdingNo: string, expectedPriceUsdt: number, idempotencyKey: string) => parseGenesisAccountState(await client.request({
      method: "POST",
      path: `/api/genesis/listings/${encodeURIComponent(holdingNo)}/buy`,
      authenticated: true,
      idempotencyKey,
      body: { expectedPriceUsdt },
    }), mode),
  };
}
