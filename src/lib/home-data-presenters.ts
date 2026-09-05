import { SPEC_UNAVAILABLE } from "@/api/product-catalog-contract";
import type { PublishedTrustSection, TrustLocale } from "@/api/trust-section-api";
import type { Product } from "@/mock/products";
import { localizedTrustFieldValue, trustFieldValue, trustNumberedRows } from "./trust-fields";

export interface HomepageProductTrust {
  product: Product;
  gpu: string | null;
  datacenter: string | null;
  warranty: string | null;
}

export interface HomepageTrustSummary {
  hero: string | null;
  tvl: string | null;
  activeNodes: string | null;
  complianceLabel: string | null;
  complianceBody: string | null;
  auditTitle: string | null;
  auditBody: string | null;
}

function certifiedDisplayValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.toLowerCase() !== SPEC_UNAVAILABLE ? normalized : null;
}

export function selectHomepageProductTrust(products: readonly Product[]): HomepageProductTrust | null {
  const candidates = products.filter((product) => product.available !== false && !product.purchaseBlocked);
  const selected = candidates.map((product, index) => {
    const gpu = certifiedDisplayValue(product.gpu);
    const datacenter = certifiedDisplayValue(product.datacenter);
    const warranty = certifiedDisplayValue(product.warranty);
    return {
      index,
      score: Number(gpu !== null) + Number(datacenter !== null) + Number(warranty !== null),
      value: { product, gpu, datacenter, warranty },
    };
  }).sort((left, right) => right.score - left.score || left.index - right.index)[0];
  return selected?.value ?? null;
}

export function buildHomepageTrustSummary(
  sections: readonly PublishedTrustSection[],
  locale: TrustLocale,
): HomepageTrustSummary {
  const fields = (key: PublishedTrustSection["sectionKey"]) =>
    sections.find((section) => section.sectionKey === key)?.fields ?? [];
  const compliance = trustNumberedRows(fields("complianceBadges"), "badge", ["Label", "Body"] as const, locale)[0];
  const audit = trustNumberedRows(fields("auditsReserves"), "document", ["Primary", "Secondary"] as const, locale)[0];
  return {
    hero: localizedTrustFieldValue(fields("nexNarrative"), "hero", locale),
    tvl: trustFieldValue(fields("financials"), "tvlOnChain"),
    activeNodes: trustFieldValue(fields("financials"), "devicesOnlineValue"),
    complianceLabel: compliance?.Label || null,
    complianceBody: compliance?.Body || null,
    auditTitle: audit?.Primary || null,
    auditBody: audit?.Secondary || null,
  };
}
