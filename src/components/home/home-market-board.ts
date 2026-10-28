import type { AppHomeWorkload } from "@/api/app-home-api";
import type { TaskCategory } from "@/store/types";
import type { Messages } from "@/i18n/messages/en";
import { compactMarketUnit, marketWorkloadCopy } from "@/lib/workload-label";
import { formatUsd } from "@/lib/usd-display";

export type HomeMarketDeltaTone = "positive" | "negative" | "neutral";

export interface HomeMarketDisplayRow {
  tag: string;
  name: string;
  priceText: string;
  unitText: string;
  deltaText: string;
  deltaTone: HomeMarketDeltaTone;
  sparkline: number[] | null;
}

const MARKET_TAGS: Record<TaskCategory, string> = {
  IG: "IMG",
  VG: "VID",
  LL: "LLM",
  FT: "FT",
  EM: "EMB",
  SP: "STT",
};

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  return formatUsd(price, 'detail');
}

export function presentHomeMarketWorkload(row: AppHomeWorkload, t: Messages): HomeMarketDisplayRow {
  const deltaTone: HomeMarketDeltaTone = row.deltaPct === null
    ? "neutral"
    : row.deltaPct >= 0 ? "positive" : "negative";
  const copy = marketWorkloadCopy(t, row.code, row.name, row.unit);

  return {
    tag: Object.prototype.hasOwnProperty.call(MARKET_TAGS, row.code) ? MARKET_TAGS[row.code] : row.code,
    name: copy.name,
    priceText: formatPrice(row.price),
    unitText: compactMarketUnit(row.code, copy.unit),
    deltaText: row.deltaPct === null
      ? "—"
      : `${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct.toFixed(1)}%`,
    deltaTone,
    sparkline: row.sparkline,
  };
}
