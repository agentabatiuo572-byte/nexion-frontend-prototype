import { describe, expect, it } from "vitest";
import { parseProductCatalogPayload } from "./product-catalog-contract";

const product = {
  id: "sku-1", name: "Box", tier: "Pro", tagline: "managed", badge: null,
  productType: "DEVICE", inventoryMode: "FINITE",
  gpu: "H100", vram: "80GB", power: "700W", datacenter: "Singapore DC",
  warranty: "36 months", hashRate: null, dailyEarn: 13, dailyEarnNEX: 80,
  price: 1000, sold: 0, stock: 1, features: [], ai: null, status: "active",
  available: true, releaseState: null, releasePhaseId: null, unlocksAtPhase: null,
  purchaseGate: null,
};
const proof = { sourceEnvironment: "PRODUCTION", runId: "" } as const;

describe("product catalog strict specification contract", () => {
  it("accepts complete remote specs and preserves them for detail pages", () => {
    const result = parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [product] });
    expect(result.products[0]).toMatchObject({ gpu: "H100", datacenter: "Singapore DC", warranty: "36 months" });
  });

  it("accepts explicit unavailable values", () => {
    const unavailable = { ...product, gpu: "unavailable", vram: "unavailable", power: "unavailable", datacenter: "unavailable" };
    expect(() => parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [unavailable] })).not.toThrow();
  });

  // 🔴 这一格以前不存在,而它才是真后端的常态:`gpu` / `vram` / `power` / `datacenter` 后端可空,
  // 运营在后台表单留空即不下发。旧契约把规格字段全设成必填,于是**少一个规格 = 整份目录抛错
  // = 商城一件商品都没有**(P-110)。缺失必须降级,不能作废全量。
  const SPEC_FIELDS = ["gpu", "vram", "power", "datacenter", "warranty", "uptime"] as const;

  // Uptime is now an E1-authored display value, not a fabricated SLA guarantee.
  // Phone yield still comes from phone tiers, not a hardware SKU.
  const PHANTOM_FIELDS = ["phoneDailyEarn", "phoneDailyEarnNEX"] as const;

  it("preserves optional E1 uptime and AI performance without prototype defaults", () => {
    const snapshot = { source: "nx_product", ...proof, serverCanonical: true, revision: null,
      products: [{ ...product, uptime: " 99.5% ", ai: { imageGenPerMin: 2, llmTokensPerSec: 50, videoMinPerHour: 0, fineTuneMins: null, unlocks: "LL" } }] };
    const actual = parseProductCatalogPayload(snapshot).products[0];
    expect(actual.uptime).toBe("99.5%");
    expect(actual.ai).toEqual({ imageGenPerMin: 2, llmTokensPerSec: 50, videoMinPerHour: 0, fineTuneMins: undefined, unlocks: "LL" });
    expect(() => parseProductCatalogPayload({ ...snapshot, products: [{ ...product, uptime: 99.5 }] })).toThrow();
  });

  it("does not resurrect specs that cannot back a quantified claim", () => {
    const parsed = parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [product] });
    for (const f of PHANTOM_FIELDS) expect(parsed.products[0]).not.toHaveProperty(f);
    // 就算服务端硬塞,也不该被投影进商品模型
    const stuffed = { ...product, uptime: "99.9%", phoneDailyEarn: "$0.06", phoneDailyEarnNEX: "10 NEX/day" };
    const forced = parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [stuffed] });
    for (const f of PHANTOM_FIELDS) expect(forced.products[0]).not.toHaveProperty(f);
  });

  it("preserves the server-authored warranty text and never substitutes a phantom month field", () => {
    const parsed = parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [{ ...product, warranty: "5 years limited" }] });
    expect(parsed.products[0].warranty).toBe("5 years limited");
    expect(parsed.products[0]).not.toHaveProperty("warrantyMonths");
    for (const bad of [0, -1, 1.5, {}]) {
      expect(() => parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [{ ...product, warranty: bad }] }),
        `warranty = ${JSON.stringify(bad)} must be rejected`).toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
    }
    expect(parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [{ ...product, warranty: null }] })
      .products[0].warranty).toBeUndefined();
  });

  it("keeps the catalog alive when the server omits display specs", () => {
    const serverShaped: Record<string, unknown> = { ...product };
    for (const f of SPEC_FIELDS) delete serverShaped[f];
    const parsed = parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [serverShaped] });
    expect(parsed.products).toHaveLength(1);
    for (const f of SPEC_FIELDS) expect(parsed.products[0][f]).toBeUndefined();
  });

  it("treats every absent / null / blank spec as missing rather than fatal", () => {
    for (const f of SPEC_FIELDS) {
      for (const blank of [undefined, null, "", "   "]) {
        const one = { ...product, [f]: blank };
        expect(() => parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [one] }),
          `${f} = ${JSON.stringify(blank)} must not void the whole catalog`).not.toThrow();
      }
    }
  });

  it("still rejects a spec of the wrong type", () => {
    for (const bad of [42, {}, []]) {
      expect(() => parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [{ ...product, gpu: bad }] }))
        .toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
    }
  });

  it("requires a reason when the server blocks purchase", () => {
    expect(() => parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [{ ...product, purchaseBlocked: true }] })).toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
    expect(parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [{ ...product, purchaseBlocked: true, purchaseBlockedReason: "PRODUCT_SPECS_UNAVAILABLE" }] }).products[0].purchaseBlocked).toBe(true);
  });

  it("rejects an untagged mock catalog", () => {
    expect(() => parseProductCatalogPayload({ source: "mock", serverCanonical: true, revision: null, products: [product] }))
      .toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
  });

  it("accepts a Cloud Share with unlimited non-physical inventory", () => {
    const cloudShare = {
      ...product,
      id: "cloud-share",
      name: "Cloud Share",
      tier: "Share",
      productType: "SHARE",
      inventoryMode: "UNLIMITED",
      stock: null,
      gpu: null,
      vram: null,
      power: null,
      datacenter: null,
      dailyEarn: 0,
      shareYieldMin: 8,
      shareYieldMax: 12,
    };
    const parsed = parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [cloudShare] });
    expect(parsed.products[0]).toMatchObject({ id: "cloud-share", productType: "SHARE", inventoryMode: "UNLIMITED", stock: undefined, dailyEarn: 0, shareYieldMin: 8, shareYieldMax: 12 });
    const withoutRange = { ...cloudShare, shareYieldMin: null, shareYieldMax: null };
    expect(parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [withoutRange] }).products[0].shareYieldMin).toBeUndefined();
    expect(() => parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: true, revision: null, products: [{ ...cloudShare, shareYieldMax: null }] })).toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
  });

  it("rejects unlimited inventory for a physical device", () => {
    expect(() => parseProductCatalogPayload({
      source: "nx_product", ...proof, serverCanonical: true, revision: null,
      products: [{ ...product, inventoryMode: "UNLIMITED", stock: null }],
    })).toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
  });

  it("accepts a server-issued product image URL and drops unsafe media URLs without voiding the catalog", () => {
    const signedImage = "https://minio.example.test/nexgrid/admin/e/sku-image/20260831/product.webp?X-Amz-Signature=token";
    expect(parseProductCatalogPayload({
      source: "nx_product", ...proof, serverCanonical: true, revision: null,
      products: [{ ...product, imageUrl: signedImage }],
    }).products[0].imageUrl).toBe(signedImage);

    for (const imageUrl of ["javascript:alert(1)", "data:image/png;base64,AAAA", "https://user:pass@example.test/image.png"]) {
      expect(parseProductCatalogPayload({
        source: "nx_product", ...proof, serverCanonical: true, revision: null,
        products: [{ ...product, imageUrl }],
      }).products[0].imageUrl).toBeUndefined();
    }
  });

  it("keeps a separately typed server-issued product video URL and drops unsafe video URLs", () => {
    const signedVideo = "https://minio.example.test/nexgrid/admin/e/sku-video/20260831/product.mp4?X-Amz-Signature=token";
    expect(parseProductCatalogPayload({
      source: "nx_product", ...proof, serverCanonical: true, revision: null,
      products: [{ ...product, videoUrl: signedVideo }],
    }).products[0].videoUrl).toBe(signedVideo);

    expect(parseProductCatalogPayload({
      source: "nx_product", ...proof, serverCanonical: true, revision: null,
      products: [{ ...product, videoUrl: "javascript:alert(1)" }],
    }).products[0].videoUrl).toBeUndefined();
  });

  it("requires the Java production provenance and rejects sandbox catalogs", () => {
    expect(() => parseProductCatalogPayload({ source: "nx_product", serverCanonical: true, revision: null, products: [product] }))
      .toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
    expect(() => parseProductCatalogPayload({ source: "mock", sourceEnvironment: "SANDBOX", runId: "sandbox-run-20260822", serverCanonical: true, revision: null, products: [product] }))
      .toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
  });

  it("requires the server canonical authority marker", () => {
    expect(() => parseProductCatalogPayload({ source: "nx_product", ...proof, revision: null, products: [product] }))
      .toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
    expect(() => parseProductCatalogPayload({ source: "nx_product", ...proof, serverCanonical: false, revision: null, products: [product] }))
      .toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
    expect(() => parseProductCatalogPayload({ source: "replica_cache", serverCanonical: true, revision: null, products: [product] }))
      .toThrow("PRODUCT_CATALOG_RESPONSE_INVALID");
  });
});
