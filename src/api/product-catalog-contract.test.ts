import { describe, expect, it } from "vitest";
import { parseProductCatalogPayload } from "./product-catalog-contract";

const product = {
  id: "sku-1", name: "Box", tier: "Pro", tagline: "managed", badge: null,
  gpu: "H100", vram: "80GB", power: "700W", datacenter: "Singapore DC",
  warranty: "36 months", hashRate: null, dailyEarn: 13, dailyEarnNEX: 80,
  price: 1000, sold: 0, stock: 1, features: [], ai: null, status: "active",
  available: true, releaseState: null, releasePhaseId: null, unlocksAtPhase: null,
  purchaseGate: null,
};

describe("product catalog strict specification contract", () => {
  it("accepts complete remote specs and preserves them for detail pages", () => {
    const result = parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [product] });
    expect(result.products[0]).toMatchObject({ gpu: "H100", datacenter: "Singapore DC", warranty: "36 months" });
  });

  it("accepts explicit unavailable values", () => {
    const unavailable = { ...product, gpu: "unavailable", vram: "unavailable", power: "unavailable", datacenter: "unavailable" };
    expect(() => parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [unavailable] })).not.toThrow();
  });

  // 🔴 这一格以前不存在,而它才是真后端的常态:`gpu` / `vram` / `power` / `datacenter` 后端可空,
  // 运营在后台表单留空即不下发。旧契约把规格字段全设成必填,于是**少一个规格 = 整份目录抛错
  // = 商城一件商品都没有**(P-110)。缺失必须降级,不能作废全量。
  const SPEC_FIELDS = ["gpu", "vram", "power", "datacenter", "warranty"] as const;

  // 🔴 后端从来没有这四列(admin-ops 全仓零命中、数据字典无此列、前后台 PRD 均未承诺)。
  // 它们已各归其位:在线率=平台统一承诺走 i18n 文案;手机日收益=平台手机档位配置;
  // 质保是后端 nx_admin_device_sku.warranty 的现成 SKU 文案；其余三项仍不是商品字段。
  const PHANTOM_FIELDS = ["uptime", "phoneDailyEarn", "phoneDailyEarnNEX"] as const;

  it("does not resurrect specs the server never had", () => {
    const parsed = parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [product] });
    for (const f of PHANTOM_FIELDS) expect(parsed.products[0]).not.toHaveProperty(f);
    // 就算服务端硬塞,也不该被投影进商品模型
    const stuffed = { ...product, uptime: "99.9%", phoneDailyEarn: "$0.06", phoneDailyEarnNEX: "10 NEX/day" };
    const forced = parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [stuffed] });
    for (const f of PHANTOM_FIELDS) expect(forced.products[0]).not.toHaveProperty(f);
  });

  it("preserves the server-authored warranty text and never substitutes a phantom month field", () => {
    const parsed = parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [{ ...product, warranty: "5 years limited" }] });
    expect(parsed.products[0].warranty).toBe("5 years limited");
    expect(parsed.products[0]).not.toHaveProperty("warrantyMonths");
    for (const bad of [0, -1, 1.5, {}]) {
      expect(() => parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [{ ...product, warranty: bad }] }),
        `warranty = ${JSON.stringify(bad)} must be rejected`).toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
    }
    expect(parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [{ ...product, warranty: null }] })
      .products[0].warranty).toBeUndefined();
  });

  it("keeps the catalog alive when the server omits display specs", () => {
    const serverShaped: Record<string, unknown> = { ...product };
    for (const f of SPEC_FIELDS) delete serverShaped[f];
    const parsed = parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [serverShaped] });
    expect(parsed.products).toHaveLength(1);
    for (const f of SPEC_FIELDS) expect(parsed.products[0][f]).toBeUndefined();
  });

  it("treats every absent / null / blank spec as missing rather than fatal", () => {
    for (const f of SPEC_FIELDS) {
      for (const blank of [undefined, null, "", "   "]) {
        const one = { ...product, [f]: blank };
        expect(() => parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [one] }),
          `${f} = ${JSON.stringify(blank)} must not void the whole catalog`).not.toThrow();
      }
    }
  });

  it("still rejects a spec of the wrong type", () => {
    for (const bad of [42, {}, []]) {
      expect(() => parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [{ ...product, gpu: bad }] }))
        .toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
    }
  });

  it("requires a reason when the server blocks purchase", () => {
    expect(() => parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [{ ...product, purchaseBlocked: true }] })).toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
    expect(parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [{ ...product, purchaseBlocked: true, purchaseBlockedReason: "PRODUCT_SPECS_UNAVAILABLE" }] }).products[0].purchaseBlocked).toBe(true);
  });

  it("rejects an untagged mock catalog", () => {
    expect(() => parseProductCatalogPayload({ source: "mock", serverCanonical: true, revision: null, products: [product] }))
      .toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
  });

  it("requires the server canonical authority marker", () => {
    expect(() => parseProductCatalogPayload({ source: "nx_product", revision: null, products: [product] }))
      .toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
    expect(() => parseProductCatalogPayload({ source: "nx_product", serverCanonical: false, revision: null, products: [product] }))
      .toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
    expect(() => parseProductCatalogPayload({ source: "replica_cache", serverCanonical: true, revision: null, products: [product] }))
      .toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
  });
});
