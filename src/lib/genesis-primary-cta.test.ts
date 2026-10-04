import { describe, expect, it } from "vitest";
import {
  resolveGenesisEligibilityCardCopy,
  resolveGenesisPrimaryCta,
  showGenesisPrimaryPrice,
} from "./genesis-primary-cta";
// @ts-expect-error Vitest runs this contract in Node; the App tsconfig omits Node globals.
import { readFileSync } from "node:fs";

const detailSource = readFileSync(new URL("../pages/genesis/genesis.vue", import.meta.url), "utf8");
const showcaseSource = readFileSync(new URL("../components/store/genesis-showcase-card.vue", import.meta.url), "utf8");

const copy = {
  blockedText: null,
  soldOut: "已售罄",
  comingSoon: "即将开售",
  reserve: "立即认购",
};

describe("Genesis primary-sale dock CTA", () => {
  it("keeps the 5174 immediate-subscription wording while the sale is available", () => {
    expect(resolveGenesisPrimaryCta({ block: null, ...copy })).toBe("立即认购");
    expect(showGenesisPrimaryPrice(null)).toBe(true);
  });

  it("still exposes sale-level blocking copy", () => {
    expect(resolveGenesisPrimaryCta({ block: "soldOut", ...copy })).toBe("已售罄");
    expect(resolveGenesisPrimaryCta({ block: "preSale", ...copy })).toBe("即将开售");
    expect(resolveGenesisPrimaryCta({ block: "marketClosed", ...copy, blockedText: "市场暂未开放" }))
      .toBe("市场暂未开放");
    for (const block of ["configUnavailable", "marketClosed", "halted", "soldOut", "preSale"] as const) {
      expect(showGenesisPrimaryPrice(block)).toBe(false);
    }
  });

  it("uses the same sale CTA on both the store module and Genesis detail page", () => {
    expect(detailSource).toContain("resolveGenesisPrimaryCta({");
    expect(detailSource).toContain("v-else-if=\"dockShowsPrice\"");
    expect(showcaseSource).toContain("resolveGenesisPrimaryCta({");
    const ctaStart = showcaseSource.indexOf("const ctaText = computed");
    const ctaEnd = showcaseSource.indexOf("function goGenesis", ctaStart);
    expect(showcaseSource.slice(ctaStart, ctaEnd)).not.toContain("cardCtaLocked");
    expect(showcaseSource).toContain("if (locked.value) {");
    expect(showcaseSource).toContain("eligSheetOpen.value = true;");
  });

  it("does not present protected-read failures as a policy rejection", () => {
    const eligibilityCopy = {
      policyRejected: "暂不符合平台当前认购策略",
      policyManaged: "后台统一配置",
      serviceUnavailable: "资格服务连接失败",
      policyUnavailable: "资格策略暂不可用",
    };
    expect(resolveGenesisEligibilityCardCopy(["GENESIS_ELIGIBILITY_UNAVAILABLE"], eligibilityCopy))
      .toEqual({ line: "资格服务连接失败", meta: "" });
    expect(resolveGenesisEligibilityCardCopy(["ACCOUNT_AGE_REQUIRED"], eligibilityCopy))
      .toEqual({ line: "暂不符合平台当前认购策略", meta: "后台统一配置" });
  });
});
