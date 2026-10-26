import { describe, expect, it } from "vitest";
import { rankEntitlementLabel } from "./rank-entitlement-label";
import { trialCycleDurationMs } from "./trial-cycle-duration";
import { teamLogicCopy } from "../i18n/team-logic-copy";
const sources = import.meta.glob("../pages/developer/developer.vue", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("audit display contracts", () => {
  it("keeps monetary rank requirements without internal migration labels in all languages", () => {
    for (const [locale, own, team] of [
      ['zh', '自购金额', '团队购买金额'],
      ['en', 'Own purchase amount', 'Team purchase amount'],
      ['vi', 'Số tiền tự mua', 'Số tiền mua của đội'],
    ]) {
      const copy = teamLogicCopy(locale);
      expect(copy.legacySelf).toBe(own);
      expect(copy.legacyTeam).toBe(team);
      expect(copy.legacyNeedSelf).toContain('{amount}');
      expect(copy.legacyNeedTeam).toContain('{amount}');
      expect(JSON.stringify(copy)).not.toMatch(/旧规则|Legacy rule|Quy tắc cũ/);
    }
  });
  it("uses the final server deadline for an extended trial progress bar", () => {
    const day = 86_400_000;
    const total = trialCycleDurationMs(0, 13 * day, 10);
    expect(total).toBe(13 * day);
    expect(10 * day / total * 100).toBeLessThan(100);
    expect(trialCycleDurationMs(null, null, 10)).toBe(10 * day);
    expect(trialCycleDurationMs(null, null, 0)).toBe(day);
  });
  it("shows a catalog name or an explicit unavailable label, never an internal ID", () => {
    const labels = { voucher: "Voucher details unavailable", sku: "Item details unavailable", custom: "Reward details unavailable" };
    expect(rankEntitlementLabel({ type: "VOUCHER", voucherId: "VC-1", displayName: "Welcome voucher" }, labels)).toBe("Welcome voucher");
    expect(rankEntitlementLabel({ type: "SKU", skuId: "SKU-1" }, labels)).toBe(labels.sku);
    expect(rankEntitlementLabel({ type: "VOUCHER", voucherId: "VC-1" }, labels)).toBe(labels.voucher);
    expect(rankEntitlementLabel({ type: "CUSTOM", customLabel: "Priority support" }, labels)).toBe("Priority support");
  });
  it("withholds test-harness reward labels from the public rank page", () => {
    const labels = { voucher: "Voucher details unavailable", sku: "Item details unavailable", custom: "Reward details unavailable" };
    for (const customLabel of [
      "F1ENGINE custom reward",
      "F1ENGINE V2 custom",
      "F-A1REVERIFY-20260721132132-custom-reward",
    ]) {
      expect(rankEntitlementLabel({ type: "CUSTOM", customLabel }, labels)).toBe(labels.custom);
    }
  });
  it("removes TEST voucher decorations without losing the reward or ordinary names", () => {
    const labels = { voucher: "Voucher details unavailable", sku: "Item details unavailable", custom: "Reward details unavailable" };
    for (const [displayName, expected] of [
      ["UVEL TEST TEAM18 晋升满减券 20261017", "晋升满减券"],
      ["UVEL TEST 团队晋升满减券", "团队晋升满减券"],
      ["Welcome voucher 20261017", "Welcome voucher 20261017"],
      ["Contest voucher", "Contest voucher"],
      ["UVEL TEST TEAM18", labels.voucher],
      ["UVEL TEST TEAM18 20261017", labels.voucher],
      ["UVEL TEST TEAM18Discount voucher", "TEAM18Discount voucher"],
    ]) {
      const reward = { type: "VOUCHER" as const, voucherId: "VC-1", displayName };
      expect(rankEntitlementLabel(reward, labels)).toBe(expected);
      expect(reward).toEqual({ type: "VOUCHER", voucherId: "VC-1", displayName });
    }
    expect(rankEntitlementLabel({ type: "SKU", skuId: "SKU-1", displayName: "UVEL TEST Device" }, labels)).toBe("UVEL TEST Device");
  });
  it("renders each endpoint method and path from the published document", () => {
    const source = sources["../pages/developer/developer.vue"];
    expect(source).toContain('v-for="(endpoint, index) in docs.endpoints"');
    expect(source).toContain("endpoint.method");
    expect(source).toContain("endpoint.path");
  });
});
