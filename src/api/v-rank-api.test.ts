import { describe, expect, it, vi } from "vitest";
import { createVRankApi } from "./v-rank-api";

const row = (v: number) => ({
  v, title: `V${v}`, cnTitle: `V${v}`, directBonus: 0.1, unilevelDepth: 1,
  peerBonus: 0, leadershipVotes: 0, cultivationBonus: 0, rewards: [], visible: true,
});

it("keeps canonical entitlement names in the App contract", async () => {
  const request = vi.fn().mockResolvedValue({ source: "nx_v_rank_config", serverCanonical: true,
    sourceEnvironment: "PRODUCTION", runId: "", prizeName: "Ranks", capabilities: { peer: false, genesis: false },
    ranks: ladder().map((item) => ({ ...item, rewards: [{ type: "VOUCHER", voucherId: "VC-1", displayName: "Welcome voucher" }] })) });
  const result = await createVRankApi({ request } as never).ladder();
  expect(result.ranks[0].rewards[0]).toMatchObject({ displayName: "Welcome voucher" });
});

it("preserves every configured reward type for App display without issuing a reward", async () => {
  const request = vi.fn().mockResolvedValue({
    source: "nx_v_rank_config", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
    prizeName: "NexGrid V-Rank", capabilities: { peer: false, genesis: false },
    ranks: ladder().map((item) => item.v === 3 ? { ...item, rewards: [
      { type: "USDT", amount: 10 }, { type: "VOUCHER", voucherId: "WELCOME-10" },
      { type: "SKU", skuId: "SKU-PRO" }, { type: "CUSTOM", customLabel: "Event access" },
    ] } : item),
  });

  const result = await createVRankApi({ request } as never).ladder();
  expect(result.ranks.find((item) => item.v === 3)?.rewards.map((item) => item.type))
    .toEqual(["USDT", "VOUCHER", "SKU", "CUSTOM"]);
  expect(result.ranks.find((item) => item.v === 3)?.rewards.slice(1))
    .toEqual([{ type: "VOUCHER", voucherId: "WELCOME-10", skuId: undefined, customLabel: undefined },
      { type: "SKU", voucherId: undefined, skuId: "SKU-PRO", customLabel: undefined },
      { type: "CUSTOM", voucherId: undefined, skuId: undefined, customLabel: "Event access" }]);
});
const ladder = () => Array.from({ length: 13 }, (_, v) => row(v));
const current = {
  source: "nx_team_member + server VRankPerformanceRepository",
  serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
  rankCode: "V2", progress: { selfBuyUSD: 100, directRefs: 2, teamVolumeUSD: 300, vDownlineCounts: {} },
};

describe("v-rank API authority provenance", () => {
  it("keeps the server capability alongside the configured peer rate", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_v_rank_config", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", prizeName: "NexGrid V-Rank",
      capabilities: { peer: false, genesis: false },
      ranks: ladder().map(item => item.v === 3 ? { ...item, peerBonus: .05 } : item),
    });
    const result = await createVRankApi({ request } as never, "prod").ladder();
    expect(result.capabilities.peer).toBe(false);
    expect(result.ranks[3].peerBonus).toBe(.05);
  });

  it("fails closed to no dispatch when an older server omits capabilities", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_v_rank_config", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", prizeName: "NexGrid V-Rank", ranks: ladder(),
    });
    const result = await createVRankApi({ request } as never, "prod").ladder();
    expect(result.capabilities).toEqual({ peer: false, genesis: false });
    expect(result.ranks).toHaveLength(13);
  });

  it("rejects non-boolean capability values", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_v_rank_config", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", prizeName: "NexGrid V-Rank",
      capabilities: { peer: "false", genesis: false }, ranks: ladder(),
    });
    await expect(createVRankApi({ request } as never, "prod").ladder())
      .rejects.toMatchObject({ message: "V_RANK_RESPONSE_INVALID" });
  });

  it("requires canonical production provenance in remote mode", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_v_rank_config", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", prizeName: "NexGrid V-Rank", capabilities: { peer: false, genesis: false }, ranks: ladder(),
    });
    await expect(createVRankApi({ request } as never, "prod").ladder()).resolves.toMatchObject({
      serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
    });
  });

  it("rejects missing canonical marker or a cross-environment response", async () => {
    const request = vi.fn().mockResolvedValue({
      source: "nx_v_rank_config", sourceEnvironment: "SANDBOX", runId: "sandbox-run-20260816", prizeName: "NexGrid V-Rank", capabilities: { peer: false, genesis: false }, ranks: ladder(),
    });
    await expect(createVRankApi({ request } as never, "prod").ladder())
      .rejects.toMatchObject({ message: "V_RANK_RESPONSE_INVALID" });
  });

  it("uses the Java production authority rail in development mode", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ source: "nx_v_rank_config", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "", prizeName: "NexGrid V-Rank", capabilities: { peer: false, genesis: false }, ranks: ladder() })
      .mockResolvedValueOnce(current);
    const api = createVRankApi({ request } as never, "dev");

    await expect(api.ladder()).resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
    await expect(api.current()).resolves.toMatchObject({ sourceEnvironment: "PRODUCTION", runId: "" });
  });

  it("rejects retired sandbox responses in development mode", async () => {
    const request = vi.fn().mockResolvedValue({
      ...current, sourceEnvironment: "SANDBOX", runId: "sandbox-run-20260816",
    });
    await expect(createVRankApi({ request } as never, "dev").current())
      .rejects.toMatchObject({ message: "V_RANK_RESPONSE_INVALID" });
  });
});
