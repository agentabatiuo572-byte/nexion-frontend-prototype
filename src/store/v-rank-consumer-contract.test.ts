// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const consumers = [
  ["../pages/team/rank.vue", "vState"],
  ["../pages/team/team.vue", "vrank"],
  ["../pages/team/agent.vue", "vrank"],
  ["../pages/team/leadership-pool.vue", "vState"],
  ["../pages/team/network.vue", "vRank"],
  ["../pages/me/proof.vue", "vRank"],
  ["../components/team/v-badge.vue", "vRank"],
  ["../components/home/vrank-card.vue", "vrank"],
  ["../components/me/network-card.vue", "vrank"],
] as const;

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), "utf8");
}

describe("V-rank remote consumer authority", () => {
  it("does not import or read the mock V_RANKS table", () => {
    for (const [file] of [...consumers, ["../pages/team/rank-how.vue"]]) {
      const text = source(file);
      expect(text, file).not.toMatch(/\bV_RANKS\b/);
    }
  });

  it("gates remote consumers on the canonical store ladder readiness", () => {
    for (const [file, storeName] of consumers) {
      const text = source(file);
      expect(text, file).toContain(`${storeName}.remoteReady`);
      expect(text, file).toContain(`${storeName}.ladder`);
    }
  });

  it("reads public rank documentation through the canonical API, not an account-scoped store", () => {
    const text = source("../pages/team/rank-how.vue");
    expect(text).toContain("ladder: vRankApi.ladder");
    expect(text).toContain("createRankHowResource");
    expect(text).toContain("buildRankHowContent(state.value.policy, state.value.ranks, state.value.capabilities");
    expect(text).not.toContain("useVRank");
  });
});
