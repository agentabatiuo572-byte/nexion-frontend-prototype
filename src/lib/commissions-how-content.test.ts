import { describe, expect, it, vi } from "vitest";
// @ts-expect-error Native compatibility witness executes in Node.
import { spawnSync } from "node:child_process";
import { buildCommissionsHowContent, createCommissionsHowResource, COMMISSIONS_HOW_SLOTS, type CommissionsHowSnapshot } from "./commissions-how-content";
const snapshot = (): CommissionsHowSnapshot => ({
  document: { contentKey: "team-commissions-how", version: "2026.10.05-direct-referral", versionSource: "ENTRY", status: "PUBLISHED",
    source: "server", sourceEnvironment: "PRODUCTION", runId: "", locale: "en",
    blocks: COMMISSIONS_HOW_SLOTS.map(id => ({ id, kind: "text", title: id,
      body: id === "network" ? "{directPurchaseRules} {directDeviceRules} {directScope} {directPrice}"
        : id === "binary" ? "{binaryRules}" : id === "leadership" ? "{leadershipRules}" : id === "cultivation" ? "{cultivationRules}" : id })) },
  directPolicy: { configured: true, policyVersion: 2, effectiveAt: "2026-10-01T00:00:00Z", nexUsdtPrice: .01,
    purchase: { enabled: true, totalRatePct: 12.3456, usdtSharePct: 60, coolingDays: 7 },
    deviceEarning: { enabled: true, totalRatePct: 5, usdtSharePct: 70, coolingDays: 0 } },
  guide: { source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: null, coolingDays: 17,
    network: { depthGateLayer: 5, depthGateRank: 4, exitCapRate: .21 },
    binary: { threshold: 876.123456, matchRate: .1375, dailyCap: 6789, settlePeriod: "weekly", residualPolicy: "carryForward", paused: false },
    leadership: null, capabilities: { peer: false, genesis: false } },
  ranks: [{ v: 4, title: "Live", cnTitle: "Live", directBonus: .123456, unilevelDepth: 7, peerBonus: .0375, leadershipVotes: 9, cultivationBonus: 321.123456, rewards: [], visible: true }],
});
describe("published direct and independent reward explanations", () => {
  it.each([["en", "12.3456%", "6,789"], ["zh", "12.3456%", "6,789"], ["vi", "12,3456%", "6.789"]])("renders configured direct splits and preserves public limits in %s", (locale, rate, cap) => {
    const view = buildCommissionsHowContent(snapshot(), locale);
    expect(view.incomplete).toBe(false);
    expect(view.section("network").body).toContain(rate); expect(view.section("network").body).toContain("60%");
    expect(view.section("network").body).toContain("40%"); expect(view.section("network").body).toContain("70%");
    expect(view.section("binary").body).toContain(`${cap} USDT`);
    expect(view.section("binary").body).not.toMatch(/876[.,]123456|13[.,]75%/);
    expect(view.section("cultivation").body).toBe(view.copy.cultivation);
    expect(view.section("network").body).not.toMatch(/L[1-7]|V4/);
  });
  it("refuses old seven-layer publications without overwriting the CMS", () => {
    const facts = snapshot(); facts.document.blocks.find(b => b.id === "network")!.body = "Seven layers {networkRates}";
    const view = buildCommissionsHowContent(facts, "en");
    expect(view.incomplete).toBe(true); expect(view.section("network").body).not.toContain("Seven layers");
    expect(view.amounts.network).toBe("—");
  });
  it("handles disabled, unconfigured and absent-price rules without numeric income promises", () => {
    const facts = snapshot(); facts.directPolicy.configured = false;
    let view = buildCommissionsHowContent(facts, "en"); expect(view.section("network").body).toContain("Not configured");
    facts.directPolicy.configured = true; facts.directPolicy.purchase.enabled = false; facts.directPolicy.nexUsdtPrice = null;
    view = buildCommissionsHowContent(facts, "en"); expect(view.section("network").body).toContain("paused");
    expect(view.section("network").body).toContain("NEX price unavailable"); expect(view.amounts.network).toBe("Not configured");
  });
  it("does not call configuration examples actual earnings or replace missing tokens", () => {
    let view = buildCommissionsHowContent(snapshot(), "en");
    expect(view.exampleTotal).toBe("Not an earnings total"); expect(view.amounts.network).toBe("Requires settlement");
    const facts = snapshot(); facts.document.blocks.find(b => b.id === "binary")!.body = "{unknown}";
    view = buildCommissionsHowContent(facts, "en"); expect(view.incomplete).toBe(true);
    expect(Object.values(view.amounts)).toEqual(["—", "—", "—", "—"]);
  });
  it("renders native rules when Intl and locale number methods are unavailable", () => {
    const moduleUrl = new URL("./commissions-how-content.ts", import.meta.url).href;
    const loader = new URL("../../scripts/lib/ts-ext-resolve.mjs", import.meta.url).href;
    const code = `import assert from "node:assert/strict"; delete globalThis.Intl;
      Number.prototype.toLocaleString = () => { throw new Error("unsupported"); };
      const {buildCommissionsHowContent:build} = await import(${JSON.stringify(moduleUrl)});
      const view=build(${JSON.stringify(snapshot())},"vi");
      assert.equal(view.incomplete,false); assert.ok(view.section("network").body.includes("12,3456%"));
      assert.ok(view.section("binary").body.includes("6.789 USDT"));
      assert.ok(!view.section("binary").body.includes("876,123456"));`;
    const process = (globalThis as unknown as { process: { execPath: string } }).process;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--import", loader, "--input-type=module", "--eval", code], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });
  it("coalesces current reads, rejects old language responses and retries failure", async () => {
    let resolveOld!: (value: CommissionsHowSnapshot) => void;
    const old = new Promise<CommissionsHowSnapshot>(resolve => { resolveOld = resolve; });
    const read = vi.fn().mockReturnValueOnce(old).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(snapshot());
    const apply = vi.fn(); const resource = createCommissionsHowResource({ read, apply });
    const first = resource.load("en"); expect(resource.load("en")).toBe(first);
    await resource.load("vi"); resolveOld(snapshot()); await first;
    expect(apply.mock.calls.at(-1)?.[0]).toMatchObject({ error: true, snapshot: null });
    await resource.load("vi"); expect(apply.mock.calls.at(-1)?.[0]).toMatchObject({ error: false, snapshot: snapshot() });
    resource.dispose(); await resource.load("zh"); expect(read).toHaveBeenCalledTimes(3);
  });
});
