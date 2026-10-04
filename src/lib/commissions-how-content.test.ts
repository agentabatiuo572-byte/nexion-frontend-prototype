import { describe, expect, it, vi } from "vitest";
// @ts-expect-error App TypeScript excludes Node declarations; this runs in Vitest's Node process.
import { spawnSync } from "node:child_process";
import { buildCommissionsHowContent, createCommissionsHowResource, COMMISSIONS_HOW_SLOTS, type CommissionsHowSnapshot } from "./commissions-how-content";

const snapshot = (): CommissionsHowSnapshot => ({
  document: { contentKey: "team-commissions-how", version: "p2", versionSource: "ENTRY", status: "PUBLISHED", source: "server", sourceEnvironment: "PRODUCTION", runId: "", locale: "zh", blocks: [
    { id: "network", kind: "text", title: "网络", body: "{networkRates} {networkNex} {networkGate} {exitCap}" },
    { id: "binary", kind: "text", title: "双轨", body: "{binaryRules}" },
    { id: "cooling", kind: "text", title: "冷却", body: "{coolingDays}" },
    { id: "peer", kind: "text", title: "平级", body: "{peerRules} {peerStatus}" },
    { id: "cultivation", kind: "text", title: "培育", body: "{cultivationRules}" },
    { id: "leadership", kind: "text", title: "领导池", body: "{leadershipRules} {leadershipVotes}" },
    { id: "genesis", kind: "text", title: "创世", body: "{genesisStatus}" },
    ...COMMISSIONS_HOW_SLOTS.filter(id => !["network", "binary", "cooling", "peer", "cultivation", "leadership", "genesis"].includes(id))
      .map(id => ({ id, kind: "text" as const, title: id, body: id })),
  ] },
  rates: { unilevelUsdt: { 1: .123456, 2: .025 }, unilevelNex: { 1: 2.5, 2: 1 } },
  guide: { source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: null, coolingDays: 17, network: { depthGateLayer: 5, depthGateRank: 4, exitCapRate: .21 }, binary: { threshold: 876.123456, matchRate: .1375, dailyCap: 6789, settlePeriod: "weekly", residualPolicy: "carryForward", paused: false }, leadership: null, capabilities: { peer: false, genesis: false } },
  ranks: [{ v: 4, title: "Live", cnTitle: "Live", directBonus: .123456, unilevelDepth: 7, peerBonus: .0375, leadershipVotes: 9, cultivationBonus: 321.123456, rewards: [], visible: true }],
});
describe("commissions-how presentation", () => {
  it.each([
    ["zh", "6,789", "876.123456", "12.3456%"],
    ["en", "6,789", "876.123456", "12.3456%"],
    ["vi", "6.789", "876,123456", "12,3456%"],
  ])("preserves localized server values with Intl available in %s", (locale, cap, threshold, rate) => {
    expect(typeof Intl.NumberFormat).toBe("function");
    const view = buildCommissionsHowContent(snapshot(), locale);
    expect(view.section("binary").body).toContain(`${cap} USDT`);
    expect(view.section("binary").body).toContain(`${threshold} USDT`);
    expect(view.section("network").body).toContain(rate);
    expect(view.incomplete).toBe(false);
  });
  it.each([
    ["zh", "6,789", "876.123456", "12.3456%", "16.666667 NEX"],
    ["en", "6,789", "876.123456", "12.3456%", "16.666667 NEX"],
    ["vi", "6.789", "876,123456", "12,3456%", "16,666667 NEX"],
  ])("renders rules and recovers in a native process with Intl deleted in %s", (locale, cap, threshold, rate, rounded) => {
    const moduleUrl = new URL("./commissions-how-content.ts", import.meta.url).href;
    const loader = new URL("../../scripts/lib/ts-ext-resolve.mjs", import.meta.url).href;
    const script = `
      import assert from "node:assert/strict";
      delete globalThis.Intl;
      assert.equal("Intl" in globalThis, false);
      Number.prototype.toLocaleString = () => { throw new Error("Native localized numbers unavailable"); };
      const { buildCommissionsHowContent: build, createCommissionsHowResource: resource } = await import(${JSON.stringify(moduleUrl)});
      const facts = ${JSON.stringify(snapshot())};
      const locale = ${JSON.stringify(locale)};
      const view = build(facts, locale);
      assert.equal(view.incomplete, false);
      assert.ok(view.section("binary").body.includes(${JSON.stringify(`${cap} USDT`)}));
      assert.ok(view.section("binary").body.includes(${JSON.stringify(`${threshold} USDT`)}));
      assert.ok(view.section("network").body.includes(${JSON.stringify(rate)}));
      facts.rates.unilevelUsdt[1] = .11111111;
      facts.rates.unilevelNex[1] = 1.5;
      assert.ok(build(facts, locale).amounts.network.endsWith(${JSON.stringify(rounded)}));
      facts.guide.coolingDays = 0;
      facts.guide.binary.threshold = 0;
      facts.guide.binary.dailyCap = 0;
      facts.guide.binary.matchRate = 0;
      facts.rates.unilevelUsdt[1] = 0;
      facts.rates.unilevelNex[1] = 0;
      const zero = build(facts, locale);
      assert.ok(zero.section("cooling").body.includes("0"));
      assert.ok(zero.section("binary").body.includes("0 USDT"));
      assert.ok(zero.section("binary").body.includes("0%"));
      assert.equal(zero.amounts.network, "0 USDT + 0 NEX");
      facts.guide.coolingDays = null;
      facts.guide.binary = null;
      const missing = build(facts, locale);
      assert.ok(missing.section("cooling").body.includes(missing.copy.missing));
      assert.ok(missing.section("binary").body.includes(missing.copy.missing));
      assert.ok(missing.section("leadership").body.includes(missing.copy.hold));
      const unavailable = build(null, locale);
      assert.equal(unavailable.incomplete, true);
      assert.deepEqual(Object.values(unavailable.amounts), ["—", "—", "—", "—"]);
      facts.document.blocks[0].body = "{unpublishedToken}";
      assert.equal(build(facts, locale).section("network").available, false);
      facts.document.blocks[0].body = "{networkRates}";
      let attempts = 0;
      const states = [];
      const reader = resource({
        async read() { if (++attempts === 1) throw new Error("503"); return facts; },
        apply(state) { states.push({ state, view: build(state.snapshot, locale) }); },
      });
      await reader.load(locale);
      assert.equal(states.at(-1).state.error, true);
      assert.equal(states.at(-1).view.incomplete, true);
      await reader.load(locale);
      assert.equal(states.at(-1).state.error, false);
      assert.equal(states.at(-1).view.incomplete, false);
      reader.dispose();
      console.log("native commissions rules, zero, missing and retry verified: " + locale);
    `;
    const nodeProcess = (globalThis as unknown as { process: { execPath: string } }).process;
    const child = spawnSync(nodeProcess.execPath, ["--experimental-strip-types", "--import", loader, "--input-type=module", "--eval", script], { encoding: "utf8" });
    expect(child.status, child.stderr || child.stdout).toBe(0);
    expect(child.stdout).toContain(`retry verified: ${locale}`);
  });
  it("uses changed canonical rates, cooldown and eligibility rather than prototype constants", () => {
    const view = buildCommissionsHowContent(snapshot(), "zh");
    expect(view.section("network").body).toContain("12.3456%");
    expect(view.section("network").body).toContain("L5");
    expect(view.section("network").body).toContain("V4");
    expect(view.section("binary").body).toContain("876.123456");
    expect(view.section("binary").body).toContain("13.75%");
    expect(view.section("binary").body).toContain("每周");
    expect(view.section("cooling").body).toContain("17");
    expect(view.section("cooling").body).not.toContain("30");
    expect(view.section("peer").body).toContain("3.75%");
    expect(view.section("cultivation").body).toContain("321.123456 NEX");
  });
  it("marks missing rules and unsupported payout paths explicitly", () => {
    const facts = snapshot(); facts.guide.coolingDays = null; facts.guide.binary = null;
    const view = buildCommissionsHowContent(facts, "zh");
    expect(view.section("cooling").body).toContain("未配置");
    expect(view.section("binary").body).not.toMatch(/10%|1,000/);
    expect(view.section("leadership").body).toContain("当前不开放结算");
    expect(view.section("peer").body).toContain("未开放");
    expect(view.section("genesis").body).toContain("未开放");
    expect(view.exampleTotal).not.toMatch(/79|2,000/);
  });
  it("distinguishes zero-day cooling from absent configuration and ignores hidden ranks", () => {
    const facts = snapshot(); facts.guide.coolingDays = 0; facts.ranks[0].visible = false;
    const view = buildCommissionsHowContent(facts, "zh");
    expect(view.section("cooling").body).toContain("0");
    expect(view.section("cultivation").body).not.toContain("321.123456");
  });
  it("does not render missing or unknown published tokens, or treat HTML as markup", () => {
    const facts = snapshot(); facts.document.blocks[0].body = "<b>{unknown}</b>";
    expect(buildCommissionsHowContent(facts, "zh").section("network").available).toBe(false);
    expect(buildCommissionsHowContent(null, "zh").section("network").body).not.toContain("10%");
  });
  it("renders valid leadership, paused monthly binary and six-place example arithmetic", () => {
    const facts = snapshot();
    facts.guide.leadership = { rate: .0375, minRank: 4, monthlyCap: 4500.123456 };
    facts.guide.binary!.paused = true; facts.guide.binary!.settlePeriod = "monthly";
    const view = buildCommissionsHowContent(facts, "zh");
    expect(view.section("leadership").body).toContain("3.75%");
    expect(view.section("leadership").body).toContain("4,500.123456");
    expect(view.section("leadership").body).toContain("9 票");
    expect(view.section("binary").body).toContain("已暂停");
    expect(view.amounts.network).toBe("12.3456 USDT + 30.864 NEX");
    expect(view.amounts.cultivation).toContain("配置额");
    expect(view.exampleTotal).toBe("非实际收益合计");
  });
  it("handles nullable gate facts, missing benefit tiers, capabilities and unsupported locales", () => {
    const facts = snapshot();
    facts.guide.network = { depthGateLayer: null, depthGateRank: null, exitCapRate: null };
    facts.guide.capabilities = { peer: true, genesis: true };
    facts.guide.leadership = { rate: 0, minRank: 12, monthlyCap: 0 };
    facts.ranks = []; facts.rates.unilevelUsdt = {}; facts.rates.unilevelNex = {};
    const view = buildCommissionsHowContent(facts, "fr");
    expect(view.section("network").body).toContain("Missing or invalid");
    expect(view.section("leadership").body).toContain("No configured benefits");
    expect(view.amounts.network).toBe("—");
    expect(view.amounts.peer).toBe("Requires settlement");
    expect(view.section("peer").body).toContain("actual events");
  });
  it.each([
    ["zh", "深度门槛", "总出口上限", "当前不开放结算"],
    ["en", "Depth gate", "Total payout cap", "settlement is not open"],
    ["vi", "Ngưỡng chiều sâu", "Giới hạn tổng chi", "chưa mở quyết toán"],
  ])("labels unavailable network facts and gives one leadership hold in %s", (locale, gate, exitCap, leadershipHold) => {
    const facts = snapshot();
    facts.guide.network = { depthGateLayer: null, depthGateRank: null, exitCapRate: null };
    const body = buildCommissionsHowContent(facts, locale).section("network").body;
    const leadership = buildCommissionsHowContent(facts, locale).section("leadership").body;
    expect(body).toContain(gate);
    expect(body).toContain(exitCap);
    expect(leadership.match(new RegExp(leadershipHold, "g"))?.length).toBe(1);
    expect(`${body} ${leadership}`).not.toMatch(/team\.ui|configVersion|INVALID_RATE/);
  });
  it.each([
    ["zh", "结算周期", "剩余业绩处理", "每月", "每月清零"],
    ["en", "Settlement period", "Remaining volume", "monthly", "monthly reset"],
    ["vi", "Chu kỳ quyết toán", "Xử lý doanh số còn lại", "hằng tháng", "xóa theo tháng"],
  ])("names the independent monthly period and residual handling in %s", (locale, period, residual, monthly, reset) => {
    const facts = snapshot();
    facts.guide.binary!.settlePeriod = "monthly";
    facts.guide.binary!.residualPolicy = "monthlyClear";
    const body = buildCommissionsHowContent(facts, locale).section("binary").body;
    expect(body).toContain(period);
    expect(body).toContain(residual);
    expect(body).toContain(monthly);
    expect(body).toContain(reset);
  });
  it.each([
    ["zh", "按合格周期业务量形成奖池，并依据参与等级、票权及个人上限分配。当前规则：{leadershipRules}。票权：{leadershipVotes}。配置完整不等于已结算，最终份额须等待当期结算记录。", "按合格周期业务量形成奖池，并依据参与等级、票权及个人上限分配。当前规则：领导池当前不开放结算。配置完整不等于已结算，最终份额须等待当期结算记录。"],
    ["en", "Qualifying period volume funds a pool distributed by eligibility, votes and individual caps. Current rules: {leadershipRules}. Votes: {leadershipVotes}. Complete configuration is not completed settlement; actual shares require the period's settlement records.", "Qualifying period volume funds a pool distributed by eligibility, votes and individual caps. Current rules: Leadership pool settlement is not open. Complete configuration is not completed settlement; actual shares require the period's settlement records."],
    ["vi", "Doanh số hợp lệ theo kỳ tạo quỹ, chia theo điều kiện, phiếu và giới hạn cá nhân. Quy tắc: {leadershipRules}. Phiếu: {leadershipVotes}. Cấu hình đầy đủ không có nghĩa đã quyết toán; phần thực nhận cần bản ghi của kỳ.", "Doanh số hợp lệ theo kỳ tạo quỹ, chia theo điều kiện, phiếu và giới hạn cá nhân. Quy tắc: Quỹ lãnh đạo hiện chưa mở quyết toán. Cấu hình đầy đủ không có nghĩa đã quyết toán; phần thực nhận cần bản ghi của kỳ."],
  ])("removes the empty leadership vote clause from the published %s paragraph", (locale, template, expected) => {
    const facts = snapshot();
    facts.document.blocks.find(block => block.id === "leadership")!.body = template;
    const body = buildCommissionsHowContent(facts, locale).section("leadership").body;
    expect(body).toBe(expected);
    expect(body).not.toMatch(/票权：。|Votes: \./u);
  });
  it("rounds example amounts half-up at six places like network settlement", () => {
    const facts = snapshot(); facts.rates.unilevelUsdt[1] = .11111111; facts.rates.unilevelNex[1] = 1.5;
    expect(buildCommissionsHowContent(facts, "en").amounts.network).toBe("11.111111 USDT + 16.666667 NEX");
  });
  it("hides all example amounts when the publication is missing context", () => {
    const facts = snapshot(); facts.document.blocks = facts.document.blocks.filter(block => block.id !== "example-note");
    const view = buildCommissionsHowContent(facts, "zh");
    expect(view.incomplete).toBe(true);
    expect(Object.values(view.amounts)).toEqual(["—", "—", "—", "—"]);
  });
  it("does not push just-below-half examples across the rounding boundary", () => {
    const facts = snapshot(); facts.rates.unilevelUsdt[1] = .1000000049999999; facts.rates.unilevelNex[1] = 0;
    expect(buildCommissionsHowContent(facts, "en").amounts.network).toBe("10 USDT + 0 NEX");
  });
  it("handles scientific decimals and hides examples outside exact display precision", () => {
    const facts = snapshot(); facts.rates.unilevelUsdt[1] = 1e-9; facts.rates.unilevelNex[1] = 2;
    expect(buildCommissionsHowContent(facts, "en").amounts.network).toBe("0 USDT + 0 NEX");
    facts.rates.unilevelUsdt[1] = .1; facts.rates.unilevelNex[1] = Number.MAX_SAFE_INTEGER;
    expect(buildCommissionsHowContent(facts, "en").amounts.network).toBe("—");
  });
  it.each(["en", "vi"])("renders localized configuration status in %s", locale => {
    expect(buildCommissionsHowContent(snapshot(), locale).section("leadership").body).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
describe("commissions-how resource lifecycle", () => {
  const deferred = <T>() => { let resolve!: (x: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
  it("merges retries, clears facts on errors, retries and ignores stale locale completions", async () => {
    const gate = deferred<CommissionsHowSnapshot>(); const apply = vi.fn();
    const read = vi.fn().mockReturnValueOnce(gate.promise).mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce(snapshot());
    const resource = createCommissionsHowResource({ read, apply });
    const old = resource.load("zh"); expect(resource.load("zh")).toBe(old);
    await resource.load("en"); gate.resolve(snapshot()); await old;
    expect(apply.mock.lastCall?.[0]).toEqual({ loading: false, error: true, snapshot: null });
    await resource.load("en"); expect(apply.mock.lastCall?.[0].snapshot).toEqual(snapshot());
    resource.dispose(); await resource.load("zh"); expect(read).toHaveBeenCalledTimes(3);
  });
  it("does not apply an in-flight result after unmount", async () => {
    const gate = deferred<CommissionsHowSnapshot>(); const apply = vi.fn();
    const resource = createCommissionsHowResource({ read: () => gate.promise, apply });
    const pending = resource.load("zh"); resource.dispose(); gate.resolve(snapshot()); await pending;
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
