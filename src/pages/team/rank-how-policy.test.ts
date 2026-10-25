import { describe, expect, it } from "vitest";
import {
  formatCanonicalRankConditions,
  rankHowPresentation,
} from "@/lib/v-rank-how-policy";

const labels = {
  selfBuy: "Self-buy ≥ ${n}",
  directRefs: "Direct refs ≥ {n}",
  teamVol: "Team ${n}",
  register: "Register immediately",
  vDownlines: "{n}× V{v}",
};

describe("rank-how server policy boundary", () => {
  it("formats canonical points independently of legacy dollar labels", () => {
    expect(formatCanonicalRankConditions({ v: 1, conditions: { selfBuyUSD: 299, teamVolumeUSD: 5000, selfComputePoints: 2000, teamComputePoints: 20000 } }, labels, "zh"))
      .toEqual(["自购算力 ≥ 2,000 算力点", "团队算力 ≥ 20,000 算力点"]);
    expect(formatCanonicalRankConditions({ v: 1, conditions: { selfComputePoints: 0 } }, labels, "vi"))
      .toEqual(["Năng lực tự mua ≥ 0 điểm tính toán"]);
  });
  it("uses the canonical ladder in both development and production", () => {
    expect(rankHowPresentation("prod", true)).toBe("canonical-ladder");
    expect(rankHowPresentation("dev", true)).toBe("canonical-ladder");
    expect(rankHowPresentation("prod", false)).toBe("hold");
    expect(rankHowPresentation("dev", false)).toBe("hold");
  });

  it("formats only server-provided ladder conditions", () => {
    expect(formatCanonicalRankConditions({
      v: 4,
      conditions: { selfBuyUSD: 299, teamVolumeUSD: 50_000, vDownlines: { 2: 3 } },
    }, labels)).toEqual(["Own compute · Compute requirements pending", "Team compute · Compute requirements pending", "3× V2"]);
    expect(formatCanonicalRankConditions({ v: 0, conditions: {} }, labels))
      .toEqual(["Register immediately"]);
  });
});

describe("rank-how page source contract", () => {
  const source = (import.meta.glob("./rank-how.vue", {
    query: "?raw",
    import: "default",
    eager: true,
  })["./rank-how.vue"] ?? "") as string;

  it("keeps published rules, the dynamic ladder and examples in the flat layout", () => {
    for (const binding of ['content.ladder', 'phases', 'requirements', 'unlocks', 'results', 'faqs', 'sectionId.protection', 'sectionId.stepwise']) expect(source).toContain(binding);
    for (const component of ['TeamArt', 'VBadgeIcon']) expect(source).toContain(`<${component}`);
    expect(source).not.toContain('v-if="!remoteApiEnabled"');
    expect(source).toContain("buildRankHowContent");
  });

  it("must not use prototype stories, account requests or unsafe HTML", () => {
    expect(source).not.toMatch(/\bw\.(?:value\.)?(req\d\w*|s1Para\d|s5\w*|faqA\d)|useVRank|v-html|\.current\(/);
    expect(source).toContain("createRankHowResource");
    expect(source).toContain('@click="goBack"');
    expect(source).toContain('@keydown.enter.prevent="toggleRule(group.id)"');
    expect(source).toContain('@keydown.space.prevent="toggleRule(group.id)"');
  });
});
