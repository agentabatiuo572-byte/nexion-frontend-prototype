import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { DeviceKind, TaskCategory } from "@/store/types";
import type { ApiEnvironment } from "./runtime-config";

/** Server projection consumed by the authenticated Home/Earn surfaces. */
export interface AppHomePeriod {
  usdt: number | null;
  nex: number | null;
  jobCount: number | null;
}

export interface AppHomeWorkload {
  code: TaskCategory;
  name: string | null;
  unit: string | null;
  price: number | null;
  deltaPct: number | null;
  sparkline: number[] | null;
  flagshipDeltaPct: number | null;
}

export interface AppHomeDeviceRanking {
  rank: number;
  name: string | null;
  kind: DeviceKind | null;
  bestFor: string | null;
  dailyUsdt: number | null;
}

export interface AppHomeOnGridClient {
  id: string;
  name: string | null;
  model: string | null;
  city: string | null;
  gpus: number | null;
}

export interface AppHomeDoTheMath {
  basis: "OWNED_DEVICE_TO_NEXT_CATALOG_PRODUCT";
  base: { kind: DeviceKind; name: string; dailyUsdt: number };
  target: { productNo: string; kind: DeviceKind; name: string; dailyUsdt: number; priceUsdt: number };
  multiplier: number;
  paybackDays: number;
}

export interface AppHomeEarningsLedgerRow {
  id: string;
  client: string;
  model: string;
  rewardUsdt: number;
  completedAt: string;
  synthetic: boolean;
}

export interface AppHomeOverview {
  sourceEnvironment: "PRODUCTION";
  runId: string;
  generatedAt: string;
  accountScope: string;
  earnings: {
    today: AppHomePeriod;
    todayVsYesterdayPct: number | null;
    week: AppHomePeriod;
    month: AppHomePeriod;
    all: AppHomePeriod;
  };
  earningsLedgerMode: "SETTLED";
  earningsLedger: AppHomeEarningsLedgerRow[];
  marketBoard: { workloads: AppHomeWorkload[]; deviceRankings: AppHomeDeviceRanking[] };
  doTheMath: AppHomeDoTheMath | null;
  weeklyPromo: {
    status: "active" | "paused";
    rewardNex: number | null;
    multiplier: number | null;
    endAt: string | null;
    product: { kind: string | null; name: string | null; dailyUsdt: number | null; priceUsdt: number | null };
  } | null;
  onboarding: { cumulativePaidUsdt: number | null; activeDevices: number | null };
  onGrid: { clients: AppHomeOnGridClient[]; activeDevices: number | null; activeJobs: number | null; perSecUsdt: number | null };
  source: string;
}

type Row = Record<string, unknown>;
const APP_HOME_SOURCE = "server:nx_compute_receipt,nx_compute_task,nx_user_device,nx_compute_datacenter,nx_product,nx_growth_promo_banner";
const APP_HOME_ACCOUNT_SCOPE = "authenticated-account";
const TASKS = new Set<TaskCategory>(["IG", "VG", "LL", "FT", "EM", "SP"]);
const DEVICE_KINDS = new Set<DeviceKind>(["phone", "cloud-share", "pc-gpu", "stellarbox-s1", "stellarbox-pro", "stellarbox-pro-v2", "stellarrack-p1", "stellarrack-p2"]);
const isRow = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string | null => typeof v === "string" && v.trim() ? v.trim() : null;
const nonNegative = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const integer = (v: unknown): number | null => {
  const n = nonNegative(v);
  return n !== null && Number.isSafeInteger(n) ? n : null;
};
const finiteNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const nullableIso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = text(v);
  return s && Number.isFinite(Date.parse(s)) ? s : null;
};
function invalid(): never { throw new ApiError({ kind: "protocol", message: "APP_HOME_OVERVIEW_INVALID" }); }
function period(v: unknown): AppHomePeriod {
  if (!isRow(v)) return invalid();
  const jobCount = v.jobCount === null || v.jobCount === undefined ? null : integer(v.jobCount);
  const usdt = v.usdt === null || v.usdt === undefined ? null : nonNegative(v.usdt);
  const nex = v.nex === null || v.nex === undefined ? null : nonNegative(v.nex);
  if ((v.jobCount != null && jobCount === null) || (v.usdt != null && usdt === null) || (v.nex != null && nex === null)) return invalid();
  return { usdt, nex, jobCount };
}
function nullableSeries(v: unknown): number[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) || v.length < 2) return invalid();
  const values = v.map(nonNegative);
  if (values.some((n) => n === null)) return invalid();
  return values as number[];
}
function workload(v: unknown): AppHomeWorkload {
  if (!isRow(v) || typeof v.code !== "string" || !TASKS.has(v.code as TaskCategory)) return invalid();
  const optional = (key: string) => v[key] === null || v[key] === undefined ? null : nonNegative(v[key]);
  const result = { code: v.code as TaskCategory, name: text(v.name), unit: text(v.unit), price: optional("price"), deltaPct: v.deltaPct == null ? null : (typeof v.deltaPct === "number" && Number.isFinite(v.deltaPct) ? v.deltaPct : invalid()), sparkline: nullableSeries(v.sparkline), flagshipDeltaPct: v.flagshipDeltaPct == null ? null : (typeof v.flagshipDeltaPct === "number" && Number.isFinite(v.flagshipDeltaPct) ? v.flagshipDeltaPct : invalid()) };
  return result;
}
function ranking(v: unknown): AppHomeDeviceRanking {
  if (!isRow(v)) return invalid();
  const rank = integer(v.rank);
  const kind = v.kind == null ? null : (typeof v.kind === "string" && DEVICE_KINDS.has(v.kind as DeviceKind) ? v.kind as DeviceKind : null);
  const dailyUsdt = v.dailyUsdt == null ? null : nonNegative(v.dailyUsdt);
  if (rank === null || rank < 1 || (v.kind != null && kind === null) || (v.dailyUsdt != null && dailyUsdt === null)) return invalid();
  return { rank, name: text(v.name), kind, bestFor: text(v.bestFor), dailyUsdt };
}
function client(v: unknown): AppHomeOnGridClient {
  if (!isRow(v)) return invalid();
  const gpus = v.gpus == null ? null : integer(v.gpus);
  if (!text(v.id) || (v.gpus != null && gpus === null)) return invalid();
  return { id: text(v.id)!, name: text(v.name), model: text(v.model), city: text(v.city), gpus };
}
function doTheMath(v: unknown): AppHomeDoTheMath | null {
  if (v === null || v === undefined) return null;
  if (!isRow(v) || v.basis !== "OWNED_DEVICE_TO_NEXT_CATALOG_PRODUCT"
      || !isRow(v.base) || !isRow(v.target)) return invalid();
  const baseKind = typeof v.base.kind === "string" && DEVICE_KINDS.has(v.base.kind as DeviceKind)
    ? v.base.kind as DeviceKind : null;
  const targetKind = typeof v.target.kind === "string" && DEVICE_KINDS.has(v.target.kind as DeviceKind)
    ? v.target.kind as DeviceKind : null;
  const baseName = text(v.base.name); const targetName = text(v.target.name);
  const productNo = text(v.target.productNo);
  const baseDaily = nonNegative(v.base.dailyUsdt); const targetDaily = nonNegative(v.target.dailyUsdt);
  const priceUsdt = nonNegative(v.target.priceUsdt);
  const multiplier = integer(v.multiplier); const paybackDays = integer(v.paybackDays);
  if (!baseKind || !targetKind || !baseName || !targetName || !productNo
      || baseDaily === null || baseDaily <= 0 || targetDaily === null || targetDaily <= baseDaily
      || priceUsdt === null || priceUsdt <= 0 || multiplier === null || multiplier < 1
      || paybackDays === null || paybackDays < 1
      || multiplier !== Math.round(targetDaily / baseDaily)
      || paybackDays !== Math.round(priceUsdt / targetDaily)) return invalid();
  return {
    basis: v.basis,
    base: { kind: baseKind, name: baseName, dailyUsdt: baseDaily },
    target: { productNo, kind: targetKind, name: targetName, dailyUsdt: targetDaily, priceUsdt },
    multiplier, paybackDays,
  };
}

function ledgerRow(v: unknown): AppHomeEarningsLedgerRow {
  if (!isRow(v)) return invalid();
  const id = text(v.id);
  const clientName = text(v.client);
  const model = text(v.model);
  const rewardUsdt = nonNegative(v.rewardUsdt);
  const completedAt = nullableIso(v.completedAt);
  if (!id || !clientName || !model || rewardUsdt === null || !completedAt || typeof v.synthetic !== "boolean") return invalid();
  return { id, client: clientName, model, rewardUsdt, completedAt, synthetic: v.synthetic };
}

export function parseAppHomeOverview(value: unknown, mode: ApiEnvironment = "prod"): AppHomeOverview {
  const row = isRow(value) ? value : invalid();
  const generatedAt = nullableIso(row.generatedAt);
  const accountScope = text(row.accountScope);
  const source = text(row.source);
  const e = isRow(row.earnings) ? row.earnings : null;
  const market = isRow(row.marketBoard) ? row.marketBoard : null;
  const calculator = doTheMath(row.doTheMath);
  const onboarding = isRow(row.onboarding) ? row.onboarding : null;
  const grid = isRow(row.onGrid) ? row.onGrid : null;
  const production = (mode === "prod" || mode === "dev") && row.sourceEnvironment === "PRODUCTION"
    && row.runId === "" && source === APP_HOME_SOURCE;
  const ledgerMode = row.earningsLedgerMode;
  const todayVsYesterdayPct = e?.todayVsYesterdayPct === null
    ? null
    : finiteNumber(e?.todayVsYesterdayPct);
  if (!generatedAt || !production
      || accountScope !== APP_HOME_ACCOUNT_SCOPE
      || row.serverCanonical !== true || !e || !market || !onboarding || !grid
      || ledgerMode !== "SETTLED"
      || !isRow(e.today) || !isRow(e.week) || !isRow(e.month) || !isRow(e.all)
      || (e.todayVsYesterdayPct !== null && todayVsYesterdayPct === null)
      || !Array.isArray(row.earningsLedger) || row.earningsLedger.length > 20
      || !Array.isArray(market.workloads) || !Array.isArray(market.deviceRankings) || !Array.isArray(grid.clients)) return invalid();
  const promoRow = row.weeklyPromo;
  let weeklyPromo: AppHomeOverview["weeklyPromo"] = null;
  if (promoRow !== null && promoRow !== undefined) {
    if (!isRow(promoRow) || !["active", "paused"].includes(String(promoRow.status))) return invalid();
    const product = isRow(promoRow.product) ? promoRow.product : null;
    if (!product) return invalid();
    const optional = (v: unknown) => v == null ? null : nonNegative(v);
    const rewardNex = optional(promoRow.rewardNex); const multiplier = optional(promoRow.multiplier);
    const dailyUsdt = optional(product.dailyUsdt); const priceUsdt = optional(product.priceUsdt);
    if ((promoRow.rewardNex != null && rewardNex === null) || (promoRow.multiplier != null && multiplier === null)
      || (product.dailyUsdt != null && dailyUsdt === null) || (product.priceUsdt != null && priceUsdt === null)) return invalid();
    weeklyPromo = { status: promoRow.status as "active" | "paused", rewardNex, multiplier, endAt: nullableIso(promoRow.endAt), product: { kind: text(product.kind), name: text(product.name), dailyUsdt, priceUsdt } };
  }
  const onboardingPaid = onboarding.cumulativePaidUsdt == null ? null : nonNegative(onboarding.cumulativePaidUsdt);
  const onboardingDevices = onboarding.activeDevices == null ? null : integer(onboarding.activeDevices);
  const activeDevices = grid.activeDevices == null ? null : integer(grid.activeDevices);
  const activeJobs = grid.activeJobs == null ? null : integer(grid.activeJobs);
  const perSecUsdt = grid.perSecUsdt == null ? null : nonNegative(grid.perSecUsdt);
  if ((onboarding.cumulativePaidUsdt != null && onboardingPaid === null) || (onboarding.activeDevices != null && onboardingDevices === null)
      || (grid.activeDevices != null && activeDevices === null) || (grid.activeJobs != null && activeJobs === null) || (grid.perSecUsdt != null && perSecUsdt === null)) return invalid();
  const earningsLedger = row.earningsLedger.map(ledgerRow);
  if (earningsLedger.some((entry) => entry.synthetic)) return invalid();
  return {
    sourceEnvironment: row.sourceEnvironment as AppHomeOverview["sourceEnvironment"],
    runId: row.runId as string, generatedAt, accountScope,
    earnings: {
      today: period(e.today), todayVsYesterdayPct,
      week: period(e.week), month: period(e.month), all: period(e.all),
    },
    earningsLedgerMode: ledgerMode as AppHomeOverview["earningsLedgerMode"], earningsLedger,
    marketBoard: { workloads: market.workloads.map(workload), deviceRankings: market.deviceRankings.map(ranking) },
    doTheMath: calculator,
    weeklyPromo, onboarding: { cumulativePaidUsdt: onboardingPaid, activeDevices: onboardingDevices },
    onGrid: { clients: grid.clients.map(client), activeDevices, activeJobs, perSecUsdt }, source,
  };
}

export function createAppHomeApi(client: ApiClient, mode: ApiEnvironment = "prod") {
  return {
    fetch: async () => {
      return parseAppHomeOverview(
        await client.request({ method: "GET", path: "/api/app/home/overview" }), mode,
      );
    },
  };
}
