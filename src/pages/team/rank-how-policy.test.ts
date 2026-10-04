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
    }, labels)).toEqual(["Self-buy ≥ $299", "Team $50,000", "3× V2"]);
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

  it("restores all six shared layout sections for the formal app", () => {
    expect((source.match(/<HowSection\b/g) ?? []).length).toBe(6);
    for (const component of ["HowHero", "HowCalloutBox", "HowIconRow", "HowStepRow", "HowFaqRow", "VBadgeIcon"]) expect(source).toContain(`<${component}`);
    expect(source).not.toContain('v-if="!remoteApiEnabled"');
    expect(source).toContain("buildRankHowContent");
  });

  it("must not use prototype stories, account requests or unsafe HTML", () => {
    expect(source).not.toMatch(/w\.value\.(req\dBody|s5Phase\dBody|faqA\d)|w\.(s1Para\d|s5StartBody|s5Unlock\d)|useVRank|v-html|\.current\(/);
    expect(source).toContain("createRankHowResource");
    expect(source).toContain('@keydown.enter.prevent="goBack"');
    expect(source).toContain('@keydown.space.prevent="goBack"');
  });
});
