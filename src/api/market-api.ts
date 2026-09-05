import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiResponseEnvironment } from "./runtime-config";
import type { ServerSourceEnvironment } from "./runtime-provenance";
import { captureCommerceSandboxRun } from "./order-api";

export interface NexMarketSnapshot {
  currentPrice: number;
  costBasis: number;
  sparkline: number[];
  history24h: Array<{ price: number; sampledAt: string }>;
  source: string;
  sourceEnvironment: ServerSourceEnvironment;
  runId: string;
}

function invalid(message = "NEX_MARKET_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function row(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positive(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sampledAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  // Backend DATETIME projections are deliberately zone-less. Validate that
  // exact wire format component-by-component instead of delegating it to
  // Date.parse(), whose handling differs between Android WebView and iOS.
  const local = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/.exec(normalized);
  if (local) {
    const [, year, month, day, hour, minute, second] = local.map(Number);
    const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1
        && candidate.getUTCDate() === day && candidate.getUTCHours() === hour
        && candidate.getUTCMinutes() === minute && candidate.getUTCSeconds() === second) {
      return normalized;
    }
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(normalized)
      || !Number.isFinite(Date.parse(normalized))) return null;
  return normalized;
}

function expectedSource(mode: ApiResponseEnvironment, production: string): string {
  return mode === "dev" ? "mock" : production;
}

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,95}$/;

function provenance(data: Record<string, unknown>, mode: ApiResponseEnvironment, productionSource: string): boolean {
  if (data.serverCanonical !== true || mode === "mock" || data.source !== expectedSource(mode, productionSource)) return false;
  if (mode === "prod") return data.sourceEnvironment === "PRODUCTION" && data.runId === "";
  if (data.sourceEnvironment !== "SANDBOX" || typeof data.runId !== "string" || !RUN_ID.test(data.runId)) return false;
  const currentRun = captureCommerceSandboxRun().runId;
  return currentRun !== null && currentRun === data.runId;
}

export function parseNexMarketSnapshot(value: unknown, mode: ApiResponseEnvironment = "prod"): NexMarketSnapshot {
  const data = row(value);
  const currentPrice = positive(data?.currentPrice);
  const costBasis = positive(data?.costBasis);
  if (!data || data.asset !== "NEX" || data.currency !== "USDT"
      || !provenance(data, mode, "G3 weekly_curve + nx_price_index 24h history")
      || currentPrice === null || costBasis === null
      || !Array.isArray(data.sparkline) || !Array.isArray(data.history24h)) {
    return invalid();
  }
  const sparkline = data.sparkline.map(positive);
  if (sparkline.some((point) => point === null) || sparkline.length !== 7) return invalid();
  const history24h = data.history24h.map((item) => {
    const point = row(item);
    const price = positive(point?.price);
    const at = sampledAt(point?.sampledAt);
    if (!point || price === null || !at) return invalid();
    return { price, sampledAt: at };
  });
  return {
    currentPrice,
    costBasis,
    sparkline: sparkline as number[],
    history24h,
    source: data.source as string,
    sourceEnvironment: data.sourceEnvironment as ServerSourceEnvironment,
    runId: data.runId as string,
  };
}

export function createMarketApi(client: ApiClient, mode: ApiResponseEnvironment = "prod") {
  return {
    fetch: async () => parseNexMarketSnapshot(await client.request({
      method: "GET", path: "/api/config/market/nex", authenticated: false,
    }), mode),
  };
}
