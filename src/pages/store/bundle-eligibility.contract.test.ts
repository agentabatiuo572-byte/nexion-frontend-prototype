import { describe, expect, it } from "vitest";

/**
 * zentao #244:无购买资格的商品仍可加入套餐,并启用结算按钮。
 *
 * 成因:套餐页在 remote 模式下只跑**本地** `evaluatePurchaseGate`(V-Rank / 团队业绩取自
 * 本地快照),而线上权威门是**服务端**的账号维度资格判定。商品详情页早已按「本地门仅 mock、
 * remote 走服务端资格」分流,套餐页漏了这一步 —— 于是服务端判不合格的 SKU 照样能进套餐结算。
 */
const source = (import.meta.glob("./bundle.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["./bundle.vue"] ?? "") as string;

describe("bundle purchase gate consults the server in remote mode", () => {
  it("shows recommendation eligibility and guides a blocked SKU to its server-backed detail", () => {
    const suggestions = source.slice(source.indexOf("<!-- Suggestions -->"), source.indexOf("<!-- Total summary -->"));
    expect(suggestions).toContain("purchaseEligibilityStore.state(p.id).status !== 'ready'");
    expect(suggestions).toContain("t.store.gateBlockedToast");
    expect(suggestions).toContain("v-if=\"remoteApiEnabled && purchaseEligibilityStore.state(p.id).status === 'ready' && !purchaseEligibilityStore.state(p.id).eligible\"");
    expect(source).toMatch(/suggestions\.value\.map\(\(p\) => p\.id\)[\s\S]*?purchaseEligibilityStore\.ensure\(p\.id, true\)/);
    const add = source.slice(source.indexOf("async function onAddSuggestion"), source.indexOf("interface PendingBundleCommands"));
    expect(add).toMatch(/!purchaseEligibilityStore\.state\(p\.id\)\.eligible[\s\S]*?navTo\(`\/pages\/store\/detail\?id=/);
  });

  it("checks a suggestion before adding it to the cart", () => {
    expect(source).toContain("purchaseEligibilityStore");
    const add = source.slice(source.indexOf("async function onAddSuggestion"), source.indexOf("interface PendingBundleCommands"));
    expect(add).toMatch(/await purchaseEligibilityStore\.ensure\(p\.id, true\)/);
    expect(add).toMatch(/if \(!isCurrentAccountScope\(scope\)\) return/);
    expect(add.indexOf("if (!eligible)"), "reject before cart.add").toBeLessThan(add.indexOf("cart.add(p.id)"));
  });

  it("disables checkout while any cart SKU lacks a ready, eligible server decision", () => {
    const disabled = source.slice(source.indexOf("const checkoutUnavailable"), source.indexOf("const ctaText"));
    expect(disabled).toContain('entry.status !== "ready" || !entry.eligible');
    expect(source).toContain('tabindex="0"');
  });

  it("rechecks every SKU before remote order creation, then keeps the local gate in mock only", () => {
    const checkout = source.slice(source.indexOf("async function onCheckout"));
    const remote = checkout.slice(checkout.indexOf("if (remoteApiEnabled) {"), checkout.indexOf("  // 购买资格门"));
    expect(remote).toMatch(/Promise\.all\(list\.map\(\(p\) => purchaseEligibilityStore\.ensure\(p\.id, true\)\)\)/);
    expect(remote).toMatch(/const firstBlocked = decisions\.findIndex\(\(eligible\) => !eligible\)/);
    expect(remote.indexOf("if (firstBlocked >= 0)"), "reject before order create").toBeLessThan(remote.indexOf("bundleOrderApi.create("));
    expect(remote).not.toContain("evaluatePurchaseGate");
    expect(checkout.indexOf("evaluatePurchaseGate(p, gateCtx).blocked"), "mock gate follows remote return")
      .toBeGreaterThan(checkout.indexOf("    return;\n  }\n  // 购买资格门"));
  });
});
