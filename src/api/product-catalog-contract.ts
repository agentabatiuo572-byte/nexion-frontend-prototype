import type { Product, PurchaseGate } from "@/mock/products";
import type { PhaseId } from "@/store/product-phase";

export interface ProductCatalogSnapshot {
  source: string;
  serverCanonical: true;
  revision: string | null;
  products: Product[];
  sourceEnvironment?: "SANDBOX";
  runId?: string;
}

export class ProductCatalogContractError extends Error {
  constructor() {
    super("PRODUCT_CATALOG_RESPONSE_INVALID");
    this.name = "ProductCatalogContractError";
  }
}

const TIERS = new Set<Product["tier"]>(["Entry", "Pro", "Flagship", "Share"]);
const PHASES = new Set<PhaseId>(["P1", "P2", "P3", "P4", "P5", "P6"]);
const LIFECYCLES = new Set<NonNullable<Product["status"]>>(["active", "legacy"]);
const GATE_MODES = new Set<PurchaseGate["mode"]>(["all", "either"]);
const GATE_PERIODS = new Set<NonNullable<PurchaseGate["quotaPeriod"]>>(["month", "lifetime"]);
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/;

function invalid(): never {
  throw new ProductCatalogContractError();
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string") return invalid();
  return value;
}

function nonEmptyString(value: unknown): string {
  const normalized = requiredString(value).trim();
  if (!normalized) return invalid();
  return normalized;
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value !== "string") return invalid();
  return value;
}

function finiteNumber(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) return invalid();
  return value;
}

function optionalNumber(value: unknown, minimum = 0): number | undefined {
  if (value === null || value === undefined) return undefined;
  return finiteNumber(value, minimum);
}

function integer(value: unknown, minimum = 0): number {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < minimum) return invalid();
  return parsed;
}

/**
 * Server sentinel for "this spec has no certified value". A deliberate server
 * truth, never a client fallback — render it through a locale string, never raw.
 */
export const SPEC_UNAVAILABLE = "unavailable";

/**
 * Server-owned display spec. Absent / null / blank means "the server has no value
 * here" and degrades to a locale string at render time (see specText); a present
 * value of the wrong type is still a contract breach and fails the payload.
 *
 * 🔴 This used to be `nonEmptyString`, i.e. all eight spec fields were mandatory.
 * That was fatal rather than strict: the parser throws for the WHOLE payload, so
 * one absent spec emptied the entire store. And absence is the normal case —
 * `uptime` / `warranty` / `phoneDailyEarn` / `phoneDailyEarnNEX` have no column,
 * no operator input and no PRD entry on the server side at all, while the four
 * that do exist (`gpu` / `vram` / `power` / `datacenter`) are nullable there and
 * the console sends `undefined` for any field an operator leaves blank.
 * Spec incompleteness already has a graceful, purpose-built channel —
 * `purchaseBlocked` + `purchaseBlockedReason` — so hard-failing here was a second,
 * catastrophic implementation of the same concern.
 */
function displayString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = requiredString(value).trim();
  return normalized || undefined;
}

function booleanValue(value: unknown): boolean {
  if (typeof value !== "boolean") return invalid();
  return value;
}

function optionalInteger(value: unknown, minimum = 0): number | undefined {
  if (value === null || value === undefined) return undefined;
  return integer(value, minimum);
}

function purchaseGate(value: unknown): PurchaseGate | undefined {
  if (value === null || value === undefined) return undefined;
  const gate = record(value);
  if (!GATE_MODES.has(gate.mode as PurchaseGate["mode"]) || typeof gate.enforce !== "boolean") return invalid();
  const quotaPeriod = optionalString(gate.quotaPeriod);
  if (quotaPeriod && !GATE_PERIODS.has(quotaPeriod as NonNullable<PurchaseGate["quotaPeriod"]>)) return invalid();
  return {
    rankMin: optionalInteger(gate.rankMin),
    activeDirectMin: optionalInteger(gate.activeDirectMin),
    teamVolumeMin: optionalNumber(gate.teamVolumeMin),
    mode: gate.mode as PurchaseGate["mode"],
    quotaCap: optionalInteger(gate.quotaCap),
    quotaSold: optionalInteger(gate.quotaSold),
    quotaPeriod: quotaPeriod as PurchaseGate["quotaPeriod"],
    enforce: gate.enforce,
  };
}

function ai(value: unknown): Product["ai"] {
  if (value === null || value === undefined) return undefined;
  const source = record(value);
  return {
    imageGenPerMin: optionalNumber(source.imageGenPerMin),
    llmTokensPerSec: optionalNumber(source.llmTokensPerSec),
    videoMinPerHour: optionalNumber(source.videoMinPerHour),
    fineTuneMins: optionalNumber(source.fineTuneMins),
    unlocks: optionalString(source.unlocks),
  };
}

function phase(value: unknown): PhaseId | undefined {
  const raw = optionalString(value);
  if (!raw) return undefined;
  // nx_admin_device_sku historically stores phases as 1..6; map exactly those
  // server enum values to the App's P1..P6 model. Unknown values stay invalid.
  const canonical = /^[1-6]$/.test(raw) ? `P${raw}` : raw;
  if (!PHASES.has(canonical as PhaseId)) return invalid();
  return canonical as PhaseId;
}

function product(value: unknown): Product {
  const source = record(value);
  const tier = nonEmptyString(source.tier);
  if (!TIERS.has(tier as Product["tier"])) return invalid();
  const lifecycle = optionalString(source.status);
  if (lifecycle && !LIFECYCLES.has(lifecycle as NonNullable<Product["status"]>)) return invalid();
  const unlocksAtPhase = phase(source.unlocksAtPhase);
  if (!Array.isArray(source.features) || !source.features.every((entry) => typeof entry === "string")) return invalid();
  const purchaseBlocked = source.purchaseBlocked === undefined ? false : booleanValue(source.purchaseBlocked);
  const purchaseBlockedReason = optionalString(source.purchaseBlockedReason);
  if (purchaseBlocked && !purchaseBlockedReason) return invalid();

  return {
    id: nonEmptyString(source.id),
    name: nonEmptyString(source.name),
    tier: tier as Product["tier"],
    tagline: requiredString(source.tagline),
    badge: optionalString(source.badge),
    gpu: displayString(source.gpu),
    vram: displayString(source.vram),
    hashRate: optionalString(source.hashRate),
    power: displayString(source.power),
    datacenter: displayString(source.datacenter),
    // 质保直接消费 nx_admin_device_sku.warranty 的服务端原文；它可能是月数、年数或
    // 限定条款，客户端不得改造成并不存在的 warrantyMonths 再猜单位。
    warranty: displayString(source.warranty),
    dailyEarn: finiteNumber(source.dailyEarn),
    dailyEarnNEX: finiteNumber(source.dailyEarnNEX),
    price: finiteNumber(source.price, Number.EPSILON),
    sold: integer(source.sold),
    stock: optionalInteger(source.stock),
    features: [...source.features],
    ai: ai(source.ai),
    status: lifecycle as Product["status"],
    available: booleanValue(source.available),
    releaseState: optionalString(source.releaseState),
    releasePhaseId: optionalString(source.releasePhaseId),
    unlocksAtPhase,
    purchaseGate: purchaseGate(source.purchaseGate),
    purchaseBlocked,
    purchaseBlockedReason,
  };
}

export function parseProductCatalogPayload(payload: unknown): ProductCatalogSnapshot {
  const source = record(payload);
  const catalogSource = nonEmptyString(source.source);
  if (source.serverCanonical !== true) return invalid();
  if (source.revision !== null && typeof source.revision !== "string") return invalid();
  if (!Array.isArray(source.products)) return invalid();
  const sourceEnvironment = source.sourceEnvironment;
  const runId = source.runId;
  const isSandbox = sourceEnvironment !== undefined || runId !== undefined;
  // Mock data is valid only when the caller explicitly identifies a sandbox run.
  if (catalogSource === "mock" && !isSandbox) return invalid();
  if (isSandbox && (catalogSource !== "mock" || sourceEnvironment !== "SANDBOX"
      || typeof runId !== "string" || !RUN_ID.test(runId))) return invalid();
  if (!isSandbox && catalogSource !== "nx_product") return invalid();
  return {
    source: catalogSource,
    serverCanonical: true,
    revision: source.revision as string | null,
    products: source.products.map(product),
    ...(isSandbox ? { sourceEnvironment: "SANDBOX" as const, runId: runId as string } : {}),
  };
}
