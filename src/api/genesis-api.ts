import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

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
  eligible: boolean;
  reasons: string[];
  ownedCount: number;
  maxPerUser: number;
  remainingCap: number;
  minAccountAgeDays: number;
  accountAgeDays: number;
  halted?: boolean;
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
  series: GenesisSeries;
  sale: GenesisSalePolicy;
  marketEnabled: boolean;
  emissionOpen: boolean;
  listings: GenesisListing[];
  transactions: GenesisTransaction[];
  tiers: GenesisTier[];
  tiersVersion: number;
  marketOpenState: "open" | "closed";
  marketOpenStateVersion: number;
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

export interface GenesisAccountState {
  series: GenesisSeries;
  sale: GenesisSalePolicy;
  marketEnabled: boolean;
  emissionOpen: boolean;
  holdings: GenesisHolding[];
  emissions: GenesisEmission[];
  eligibility: GenesisEligibility;
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

function timestamp(value: unknown, nullable = false): number | null {
  if (value == null && nullable) return null;
  const raw = text(value);
  if (!raw) return nullable ? null : invalid();
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

function parseEligibility(value: unknown): GenesisEligibility {
  const row = record(value);
  const ownedCount = integer(row?.ownedCount);
  const maxPerUser = integer(row?.maxPerUser);
  const remainingCap = integer(row?.remainingCap);
  const minAccountAgeDays = integer(row?.minAccountAgeDays);
  const accountAgeDays = integer(row?.accountAgeDays);
  if (!row || row.serverCanonical !== true || typeof row.eligible !== "boolean"
      || !Array.isArray(row.reasons) || !row.reasons.every((reason) => typeof reason === "string")
      || ownedCount === null || maxPerUser === null || remainingCap === null
      || minAccountAgeDays === null || accountAgeDays === null) return invalid();
  return {
    eligible: row.eligible,
    reasons: [...row.reasons] as string[],
    ownedCount,
    maxPerUser,
    remainingCap,
    minAccountAgeDays,
    accountAgeDays,
    halted: typeof row.halted === "boolean" ? row.halted : undefined,
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
  const acquiredPriceUsdt = number(row?.acquiredPriceUsdt, 0.000001);
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

export function parseGenesisPublicState(value: unknown): GenesisPublicState {
  const row = record(value);
  const market = record(row?.market);
  const emission = record(row?.emission);
  const marketOpenState = text(row?.marketOpenState);
  const tiersVersion = integer(row?.tiersVersion);
  const marketOpenStateVersion = integer(row?.marketOpenStateVersion);
  const closedNoticeKey = text(row?.closedNoticeKey);
  const tradeBlockedReason = typeof row?.tradeBlockedReason === "string" ? row.tradeBlockedReason : null;
  if (!row || row.serverCanonical !== true || !market || !emission
      || typeof market.enabled !== "boolean" || typeof emission.open !== "boolean"
      || !Array.isArray(row.listings) || !Array.isArray(row.transactions) || !Array.isArray(row.tiers)
      || (marketOpenState !== "open" && marketOpenState !== "closed")
      || tiersVersion === null || marketOpenStateVersion === null || !closedNoticeKey
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
    closedNoticeKey,
    catalogAvailable: row.catalogAvailable,
    tradeAvailable: row.tradeAvailable,
    tradeBlockedReason,
    marketStats: parseMarketStats(row.marketStats),
  };
}

export function parseGenesisAccountState(value: unknown): GenesisAccountState {
  const row = record(value);
  const series = parseSeries(row?.series);
  const sale = parseSale(row?.sale);
  const walletBalanceUsdt = number(row?.walletBalanceUsdt);
  if (!row || row.serverCanonical !== true || typeof row.marketEnabled !== "boolean"
      || typeof row.emissionOpen !== "boolean" || !Array.isArray(row.holdings)
      || !Array.isArray(row.emissions) || walletBalanceUsdt === null) return invalid();
  return {
    series,
    sale,
    marketEnabled: row.marketEnabled,
    emissionOpen: row.emissionOpen,
    holdings: row.holdings.map(parseHolding),
    emissions: row.emissions.map(parseEmission),
    eligibility: parseEligibility(row.eligibility),
    walletBalanceUsdt,
    billNo: text(row.billNo) ?? undefined,
    receiptId: text(row.receiptId) ?? undefined,
  };
}

export function createGenesisApi(client: ApiClient) {
  return {
    state: async () => parseGenesisPublicState(await client.request({
      method: "GET", path: "/api/genesis/state", authenticated: false,
    })),
    account: async () => parseGenesisAccountState(await client.request({
      method: "GET", path: "/api/genesis/account",
    })),
    eligibility: async () => parseEligibility(await client.request({
      method: "GET", path: "/api/genesis/eligibility",
    })),
    purchase: async (quantity: number, idempotencyKey: string) => parseGenesisAccountState(await client.request({
      method: "POST", path: "/api/genesis/purchase", idempotencyKey, body: { quantity },
    })),
    list: async (holdingNo: string, askPriceUsdt: number, idempotencyKey: string) =>
      parseGenesisAccountState(await client.request({
        method: "POST",
        path: `/api/genesis/holdings/${encodeURIComponent(holdingNo)}/listing`,
        idempotencyKey,
        body: { askPriceUsdt },
      })),
    cancel: async (holdingNo: string, idempotencyKey: string) => parseGenesisAccountState(await client.request({
      method: "DELETE",
      path: `/api/genesis/holdings/${encodeURIComponent(holdingNo)}/listing`,
      idempotencyKey,
    })),
    buy: async (holdingNo: string, idempotencyKey: string) => parseGenesisAccountState(await client.request({
      method: "POST",
      path: `/api/genesis/listings/${encodeURIComponent(holdingNo)}/buy`,
      idempotencyKey,
    })),
  };
}
