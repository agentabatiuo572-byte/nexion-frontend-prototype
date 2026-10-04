import { describe, expect, it } from "vitest";
import earnings from "./earnings-ledger-card.vue?raw";
import market from "./market-board-card.vue?raw";
import network from "./network-pulse-card.vue?raw";

describe("home snapshots remain visibly stale after a transient read failure", () => {
  it("labels retained Home and earnings facts as last confirmed", () => {
    expect(earnings).toContain("app.homeTruthStatus === 'error' && app.homeTruth");
    expect(market).toContain("app.homeTruthStatus === 'error' && app.homeTruth");
    expect(earnings).toContain("t.home.networkStale");
    expect(market).toContain("t.home.networkStale");
  });

  it("keeps a retained network rank visible while labeling its failed refresh", () => {
    expect(network).toContain('if (remoteRank.snapshot === null) return { kind: "unavailable" }');
    expect(network).toContain('remoteRank.status === "error" && remoteRank.snapshot !== null');
    expect(network).toContain("t.value.home.networkStale");
  });
});
