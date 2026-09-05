import { describe, expect, it } from "vitest";
import type { PublishedTrustSection } from "@/api/trust-section-api";
import type { Product } from "@/mock/products";
import {
  buildHomepageTrustSummary,
  selectHomepageProductTrust,
} from "./home-data-presenters";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "box-1",
  name: "Box 1",
  tier: "Pro",
  tagline: "Managed compute",
  dailyEarn: 1,
  dailyEarnNEX: 1,
  price: 100,
  sold: 1,
  features: [],
  available: true,
  datacenter: "Virginia DC",
  warranty: "24 months",
  gpu: "H100",
  ...overrides,
});

const section = (
  sectionKey: PublishedTrustSection["sectionKey"],
  fields: Array<{ key: string; value: string }>,
): PublishedTrustSection => ({
  sectionKey,
  version: "v1",
  description: sectionKey,
  structure: "fields",
  fields: fields.map((field) => ({ ...field, label: field.key })),
});

describe("homepage real-data presenters", () => {
  it("prefers an available purchasable product with the most server-owned trust fields", () => {
    const selected = selectHomepageProductTrust([
      product({ id: "blocked", purchaseBlocked: true, warranty: "60 months" }),
      product({ id: "thin", warranty: undefined, datacenter: undefined }),
      product({ id: "trusted", warranty: "36 months", datacenter: "Singapore DC" }),
    ]);
    expect(selected?.product.id).toBe("trusted");
    expect(selected).toMatchObject({ datacenter: "Singapore DC", warranty: "36 months", gpu: "H100" });
  });

  it("treats the server unavailable sentinel as missing instead of a trust claim", () => {
    const selected = selectHomepageProductTrust([product({ datacenter: "unavailable", warranty: "unavailable" })]);
    expect(selected).toMatchObject({ datacenter: null, warranty: null, gpu: "H100" });
  });

  it("builds a locale-safe trust summary only from published server fields", () => {
    const summary = buildHomepageTrustSummary([
      section("nexNarrative", [
        { key: "hero.zh", value: "算力需求支持的 NEX" },
        { key: "hero.en", value: "Demand-backed NEX" },
      ]),
      section("financials", [
        { key: "tvlOnChain", value: "$128.4M" },
        { key: "devicesOnlineValue", value: "72,640" },
      ]),
      section("complianceBadges", [
        { key: "badge1Label.zh", value: "Sandbox 合规演示" },
        { key: "badge1Label.en", value: "Sandbox compliance demo" },
        { key: "badge1Body.zh", value: "非生产资质，仅用于验收" },
      ]),
      section("auditsReserves", [
        { key: "document1Primary.zh", value: "Sandbox 储备审计报告" },
        { key: "document1Secondary.zh", value: "服务器持有的隔离测试资料" },
      ]),
    ], "zh");

    expect(summary).toEqual({
      hero: "算力需求支持的 NEX",
      tvl: "$128.4M",
      activeNodes: "72,640",
      complianceLabel: "Sandbox 合规演示",
      complianceBody: "非生产资质，仅用于验收",
      auditTitle: "Sandbox 储备审计报告",
      auditBody: "服务器持有的隔离测试资料",
    });
  });

  it.each(["en", "vi"] as const)("does not borrow zh trust claims for the %s locale", (locale) => {
    const summary = buildHomepageTrustSummary([
      section("nexNarrative", [{ key: "hero.zh", value: "算力需求支持的 NEX" }]),
      section("financials", [{ key: "tvlOnChain", value: "$128.4M" }]),
      section("complianceBadges", [{ key: "badge1Label.zh", value: "Sandbox 合规演示" }]),
      section("auditsReserves", [{ key: "document1Primary.zh", value: "Sandbox 储备审计报告" }]),
    ], locale);

    expect(summary).toMatchObject({
      hero: null,
      tvl: "$128.4M",
      complianceLabel: null,
      auditTitle: null,
    });
  });
});
