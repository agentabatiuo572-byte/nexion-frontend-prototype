import type { EarnPhoneTier } from "@/api/earn-config-api";
import type { Product } from "@/mock/products";

export interface YieldAmount {
  usd: number;
  nex: number;
}

export interface StoreYieldLadderRow {
  id: "phone" | "entry" | "pro" | "rack";
  amount: YieldAmount | null;
  widthPct: number;
}

export interface StoreYieldAuthority {
  phone: YieldAmount | null;
  entry: YieldAmount | null;
  pro: YieldAmount | null;
  rack: YieldAmount | null;
  multiplier: number | null;
  complete: boolean;
  ladder: StoreYieldLadderRow[];
}

export interface StoreYieldCatalogProof {
  source: string;
  sourceEnvironment: string;
  runId: string;
  serverCanonical: boolean;
}

const LADDER_PRODUCT_IDS = {
  entry: "stellarbox-s1",
  pro: "stellarbox-pro",
  rack: "stellarrack-p1",
} as const;

function productAmount(products: readonly Product[], productId: string): YieldAmount | null {
  const candidates = products.filter((product) => product.id === productId
    && Number.isFinite(product.dailyEarn) && product.dailyEarn > 0
    && Number.isFinite(product.dailyEarnNEX) && product.dailyEarnNEX >= 0);
  if (candidates.length !== 1) return null;
  return { usd: candidates[0].dailyEarn, nex: candidates[0].dailyEarnNEX };
}

export function buildStoreYieldAuthority(
  products: readonly Product[],
  phoneTiers: readonly EarnPhoneTier[],
  proof: StoreYieldCatalogProof,
): StoreYieldAuthority {
  const canonicalProducts = proof.source === "nx_product" && proof.sourceEnvironment === "PRODUCTION"
    && proof.runId === "" && proof.serverCanonical ? products : [];
  const typicalPhone = phoneTiers.find((row) => row.tier === 3);
  const phone = typicalPhone ? { usd: typicalPhone.baseRateUsdt, nex: typicalPhone.baseRateNex } : null;
  const entry = productAmount(canonicalProducts, LADDER_PRODUCT_IDS.entry);
  const pro = productAmount(canonicalProducts, LADDER_PRODUCT_IDS.pro);
  const rack = productAmount(canonicalProducts, LADDER_PRODUCT_IDS.rack);
  const complete = [phone, entry, pro, rack].every((amount) => amount !== null);
  const multiplier = phone && entry && phone.usd > 0 ? Math.round(entry.usd / phone.usd) : null;
  const maximum = Math.max(0, ...[phone, entry, pro, rack].map((amount) => amount?.usd ?? 0));
  const rows: Array<[StoreYieldLadderRow["id"], YieldAmount | null]> = [
    ["phone", phone], ["entry", entry], ["pro", pro], ["rack", rack],
  ];
  return {
    phone, entry, pro, rack, multiplier, complete,
    ladder: rows.map(([id, amount]) => ({
      id,
      amount,
      widthPct: amount && maximum > 0 ? Math.max(1, Math.round((amount.usd / maximum) * 100)) : 0,
    })),
  };
}

export function storefrontUsd(amount: YieldAmount | null): string {
  if (!amount) return "—";
  if (amount.usd >= 1_000_000_000) return `$${(amount.usd / 1_000_000_000).toFixed(1)}B`;
  if (amount.usd >= 1_000_000) return `$${(amount.usd / 1_000_000).toFixed(1)}M`;
  if (amount.usd >= 1_000) return `$${(amount.usd / 1_000).toFixed(1)}K`;
  return `$${amount.usd.toFixed(2)}`;
}

export function storefrontUsdFull(amount: YieldAmount | null): string {
  return amount ? `$${amount.usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

export function storefrontNex(amount: YieldAmount | null): string {
  if (!amount) return "—";
  if (amount.nex >= 1_000_000_000) return `${(amount.nex / 1_000_000_000).toFixed(1)}B`;
  if (amount.nex >= 1_000_000) return `${(amount.nex / 1_000_000).toFixed(1)}M`;
  if (amount.nex >= 1_000) return `${(amount.nex / 1_000).toFixed(1)}K`;
  return amount.nex.toLocaleString();
}

export function storefrontNexFull(amount: YieldAmount | null): string {
  return amount ? `${amount.nex.toLocaleString()} NEX` : "— NEX";
}
