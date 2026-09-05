import assert from "node:assert/strict";
import test from "node:test";
import { parseProductCatalogPayload } from "../src/api/product-catalog-contract.ts";

// Captured from the authenticated 5173 -> /api/store/catalog response. The
// fixture intentionally keeps server names and nullable fields unchanged.
const authenticatedCatalog = {
  source: "nx_admin_device_sku",
  revision: "2026-07-20T20:12:56",
  products: [
    {
      id: "stellarrack-p2", name: "StellarRack P2", tier: "Flagship", tagline: "8 卡旗舰机柜", badge: "旗舰",
      gpu: "8× RTX 4090", vram: "192GB", hashRate: "5600 TH/s", power: "3500W", dailyEarn: 75, dailyEarnNEX: 500,
      price: 7499, sold: 0, stock: 30, features: ["二代旗舰机柜", "8 卡顶级阵列", "企业级算力巅峰", "专属代际发布门"],
      ai: { imageGenPerMin: 120, llmTokensPerSec: 3000, videoMinPerHour: 40, fineTuneMins: 900, unlocks: null },
      status: "active", available: false, releaseState: "E1_PHASE_NOT_REACHED", releasePhaseId: "52", unlocksAtPhase: null, purchaseGate: null,
    },
    {
      id: "stellarbox-pro-v2", name: "StellarBox Pro v2", tier: "Pro", tagline: "升级款 · 能效 +15%", badge: "新品",
      gpu: "RTX 4070 SUPER", vram: "12GB", hashRate: "520 TH/s", power: "250W", dailyEarn: 14, dailyEarnNEX: 90,
      price: 1319, sold: 0, stock: 200, features: ["二代升级架构", "能效提升 15%", "AI 算力翻倍", "专属代际发布门"],
      ai: { imageGenPerMin: 10, llmTokensPerSec: 240, videoMinPerHour: 3, fineTuneMins: 80, unlocks: null },
      status: "active", available: false, releaseState: "E1_GENERATION_RELEASE_MONTH_NOT_REACHED", releasePhaseId: "4", unlocksAtPhase: null, purchaseGate: null,
    },
    {
      id: "stellarbox-pro", name: "StellarBox Pro", tier: "Pro", tagline: "中端主力 · AI 推理 + 挖掘", badge: "热销",
      gpu: "RTX 4070", vram: "12GB", hashRate: "480 TH/s", power: "250W", dailyEarn: 13, dailyEarnNEX: 80,
      price: 1199, sold: 180, stock: 300, features: ["中端主力机型", "AI 推理 + 算力挖掘", "12GB 大显存", "稳定高收益"],
      ai: { imageGenPerMin: 8, llmTokensPerSec: 200, videoMinPerHour: 2, fineTuneMins: 60, unlocks: null },
      status: "active", available: true, releaseState: "AVAILABLE", releasePhaseId: "2", unlocksAtPhase: null, purchaseGate: null,
    },
    {
      id: "stellarrack-p1", name: "StellarRack P1", tier: "Flagship", tagline: "机柜级 · 4 卡阵列", badge: null,
      gpu: "4× RTX 4070", vram: "48GB", hashRate: "1920 TH/s", power: "1500W", dailyEarn: 45, dailyEarnNEX: 300,
      price: 4499, sold: 42, stock: 80, features: ["机柜级部署", "4 卡并行阵列", "高并发 AI 推理", "企业级稳定"],
      ai: { imageGenPerMin: 40, llmTokensPerSec: 1000, videoMinPerHour: 12, fineTuneMins: 300, unlocks: null },
      status: "active", available: false, releaseState: "E1_GENERATION_ELIGIBILITY_REQUIRED", releasePhaseId: "3", unlocksAtPhase: null, purchaseGate: null,
    },
    {
      id: "cloud-share", name: "Cloud Share", tier: "Share", tagline: "云算力份额 · 低门槛", badge: "低门槛",
      gpu: "", vram: "", hashRate: null, power: null, dailyEarn: 0.19, dailyEarnNEX: 3,
      price: 19.9, sold: 1240, stock: null, features: ["云算力份额", "低至 $19.9 起", "无需托管硬件", "随买随用"],
      ai: { imageGenPerMin: null, llmTokensPerSec: 30, videoMinPerHour: null, fineTuneMins: null, unlocks: null },
      status: "active", available: true, releaseState: "AVAILABLE", releasePhaseId: null, unlocksAtPhase: null, purchaseGate: null,
    },
    {
      id: "stellarbox-s1", name: "StellarBox S1", tier: "Entry", tagline: "入门算力盒 · 开机即挖", badge: "入门",
      gpu: "NPU 算力盒", vram: "", hashRate: "120 TH/s", power: "65W", dailyEarn: 7, dailyEarnNEX: 40,
      price: 649, sold: 320, stock: 500, features: ["开机即挖 · 零配置", "7×24 全托管运维", "低门槛入门首选", "稳定日产收益"],
      ai: { imageGenPerMin: 2, llmTokensPerSec: 50, videoMinPerHour: null, fineTuneMins: null, unlocks: null },
      status: "active", available: true, releaseState: "AVAILABLE", releasePhaseId: "2", unlocksAtPhase: null, purchaseGate: null,
    },
  ],
};

test("authenticated server catalog preserves authoritative names and server release decisions", () => {
  const snapshot = parseProductCatalogPayload(authenticatedCatalog);

  assert.equal(snapshot.source, "nx_admin_device_sku");
  assert.deepEqual(snapshot.products.map((product) => product.name), [
    "StellarRack P2", "StellarBox Pro v2", "StellarBox Pro", "StellarRack P1", "Cloud Share", "StellarBox S1",
  ]);
  assert.deepEqual(snapshot.products.map((product) => product.tier), ["Flagship", "Pro", "Pro", "Flagship", "Share", "Entry"]);
  assert.deepEqual(snapshot.products.map((product) => product.available), [false, false, true, false, true, true]);
  assert.deepEqual(snapshot.products.map((product) => product.releaseState), [
    "E1_PHASE_NOT_REACHED", "E1_GENERATION_RELEASE_MONTH_NOT_REACHED", "AVAILABLE",
    "E1_GENERATION_ELIGIBILITY_REQUIRED", "AVAILABLE", "AVAILABLE",
  ]);
  assert.deepEqual(snapshot.products.map((product) => product.releasePhaseId), ["52", "4", "2", "3", undefined, "2"]);
  assert.deepEqual(snapshot.products.map((product) => product.unlocksAtPhase), [undefined, undefined, undefined, undefined, undefined, undefined]);
  assert.deepEqual(snapshot.products.find((product) => product.id === "cloud-share")?.ai, {
    imageGenPerMin: undefined, llmTokensPerSec: 30, videoMinPerHour: undefined, fineTuneMins: undefined, unlocks: undefined,
  });
});

test("catalog parser remains fail-closed for unknown server enums and coercions", () => {
  const unknownPhase = structuredClone(authenticatedCatalog);
  unknownPhase.products[0].unlocksAtPhase = "P7";
  assert.throws(() => parseProductCatalogPayload(unknownPhase), /PRODUCT_CATALOG_RESPONSE_INVALID/);

  const unknownTier = structuredClone(authenticatedCatalog);
  unknownTier.products[0].tier = "Ultra";
  assert.throws(() => parseProductCatalogPayload(unknownTier), /PRODUCT_CATALOG_RESPONSE_INVALID/);

  const numericString = structuredClone(authenticatedCatalog);
  numericString.products[0].price = "7499";
  assert.throws(() => parseProductCatalogPayload(numericString), /PRODUCT_CATALOG_RESPONSE_INVALID/);
});
