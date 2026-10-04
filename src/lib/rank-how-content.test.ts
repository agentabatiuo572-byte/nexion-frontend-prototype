import { describe, expect, it, vi } from "vitest";
import type { CanonicalVRankRow } from "@/api/v-rank-api";
import type { RankHowPolicy } from "@/api/rank-how-policy-api";
import { buildRankHowContent, createRankHowResource } from "./rank-how-content";

const labels = { selfBuy: "自购 ${n}", directRefs: "合格直推 {n}", teamVol: "团队 ${n}", register: "注册", vDownlines: "{n} 个 V{v}" };
const rank = (v: number, patch: Partial<CanonicalVRankRow> = {}): CanonicalVRankRow => ({ v, title: `Title ${v}`, cnTitle: `头衔${v}`, directBonus: .123456, unilevelDepth: 99, peerBonus: .0275, leadershipVotes: 17, cultivationBonus: 321.123456, rewards: [], visible: true, ...patch });
const ranks = [rank(0), rank(1, { selfBuyUSD: 789.123456, directRefs: 8 }), rank(2, { selfBuyUSD: 987, directRefs: 9, teamVolumeUSD: 45678.123456, requiredDownlineRank: 1, requiredDownlineCount: 6 })];
const enabled = { peer: true, genesis: false } as const;
const unavailable = { peer: false, genesis: false } as const;
const policy: RankHowPolicy = { version: "p1", locale: "zh", hero: "Published hero", source: "server", sourceEnvironment: "PRODUCTION", runId: "", rules: { permanentProtection: false, qualifiedReferralSelfBuyUSD: 789.123456, leadershipConfigured: false }, sections: [
  { id: "example", title: "{fromRank} → {toRank}", body: "{selfBuy} / {directRefs} / {teamVolume} / {rankLegs}", order: 1 },
  { id: "rewards", title: "奖励", body: "{directRate} / {peerRate} / {votes} / {cultivation} / {leadershipStatus}", order: 2 },
  { id: "protection", title: "保级", body: "{protection}", order: 3 },
  { id: "requirement-direct", title: "合格直推", body: "{referralThreshold}", order: 4 },
] };

describe("rank-how published presentation", () => {
  it("uses current canonical amounts with six decimals, not prototype values", () => {
    const content = buildRankHowContent(policy, ranks, enabled, "zh", labels);
    expect(content.section("example").title).toBe("V1 → V2");
    expect(content.section("example").body).toContain("45,678.123456 USDT");
    expect(content.section("example").body).toContain("6 个 V1");
    expect(content.section("rewards").body).toContain("12.3456%");
    expect(content.section("rewards").body).toContain("2.75%");
    expect(content.section("rewards").body).toContain("321.123456 NEX");
    expect(content.section("rewards").body).toContain("暂不可结算");
    expect(content.section("requirement-direct").body).toContain("789.123456 USDT");
    expect(content.section("protection").body).toContain("未开启");
    expect(content.section("example").body).not.toMatch(/50,000|52,300|22,000/);
  });
  it.each([
    ["zh", "1,234,567.987654 USDT", "1.234568 USDT"],
    ["en", "1,234,567.987654 USDT", "1.234568 USDT"],
    ["vi", "1.234.567,987654 USDT", "1,234568 USDT"],
  ])("renders server numbers in %s when native Intl is absent", (locale, large, rounded) => {
    vi.stubGlobal("Intl", undefined);
    try {
      const changed = ranks.map(row => row.v === 2 ? { ...row, teamVolumeUSD: 1234567.987654, selfBuyUSD: 1.23456789 } : row);
      const content = buildRankHowContent(policy, changed, enabled, locale, labels);
      expect(content.section("example").body).toContain(large);
      expect(content.section("example").body).toContain(rounded);
      expect(content.section("rewards").body).toContain(locale === "vi" ? "321,123456 NEX" : "321.123456 NEX");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each([
    ["zh", "1,000,000,000,000,000,000,000 USDT", "1.234566 USDT", "0.000001 USDT"],
    ["en", "1,000,000,000,000,000,000,000 USDT", "1.234566 USDT", "0.000001 USDT"],
    ["vi", "1.000.000.000.000.000.000.000 USDT", "1,234566 USDT", "0,000001 USDT"],
  ])("keeps extreme and half-micro server values accurate in %s without Intl", (locale, huge, rounded, tiny) => {
    vi.stubGlobal("Intl", undefined);
    try {
      const changed = ranks.map(row => row.v === 2 ? { ...row, teamVolumeUSD: 1e21, selfBuyUSD: 1.2345655 } : row);
      const changedPolicy = { ...policy, rules: { ...policy.rules, qualifiedReferralSelfBuyUSD: 0.0000005 } };
      const content = buildRankHowContent(changedPolicy, changed, enabled, locale, labels);
      expect(content.section("example").body).toContain(huge);
      expect(content.section("example").body).toContain(rounded);
      expect(content.section("requirement-direct").body).toContain(tiny);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("carries six-decimal rounding into the whole number without Intl", () => {
    vi.stubGlobal("Intl", undefined);
    try {
      const changed = ranks.map(row => row.v === 2 ? { ...row, selfBuyUSD: 9.9999995 } : row);
      expect(buildRankHowContent(policy, changed, enabled, "en", labels).section("example").body).toContain("10 USDT");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("recomputes values after PC configuration changes", () => {
    const changed = ranks.map(r => r.v === 2 ? { ...r, teamVolumeUSD: 123, leadershipVotes: 29 } : r);
    const content = buildRankHowContent({ ...policy, rules: { ...policy.rules!, permanentProtection: true, leadershipConfigured: true } }, changed, enabled, "zh", labels);
    expect(content.section("example").body).toContain("123 USDT");
    expect(content.section("rewards").body).toContain("29");
    expect(content.section("protection").body).toContain("已开启");
  });
  it("distinguishes a configured zero referral minimum from unavailable configuration", () => {
    const content = buildRankHowContent({ ...policy, rules: { ...policy.rules, qualifiedReferralSelfBuyUSD: 0 } }, ranks, enabled, "zh", labels);
    expect(content.section("requirement-direct").body).toContain("0 USDT（不要求正数自购）");
    expect(content.section("requirement-direct").available).toBe(true);
  });
  it("keeps the full ladder range independent of the example pair", () => {
    const content = buildRankHowContent({ ...policy, sections: [{ id: "ladder", title: "{rankCount} 阶", body: "{firstRank} 到 {lastRank}", order: 1 }] }, ranks, enabled, "zh", labels);
    expect(content.section("ladder")).toMatchObject({ title: "3 阶", body: "V0 到 V2", available: true });
  });
  it("does not invent missing policy, rules, or example thresholds", () => {
    const missing = buildRankHowContent(null, [], unavailable, "zh", labels);
    expect(missing.section("overview").available).toBe(false);
    const partial = buildRankHowContent({ ...policy, rules: undefined } as unknown as RankHowPolicy, [rank(0)], enabled, "zh", labels);
    expect(partial.section("example").available).toBe(false);
    expect(partial.section("protection").available).toBe(false);
    expect(partial.section("rewards").available).toBe(false);
  });
  it("ignores zero gates and hidden ranks; never fabricates an unlimited payout", () => {
    const content = buildRankHowContent(policy, [rank(0), rank(1, { selfBuyUSD: 0, directRefs: 0 }), rank(2, { visible: false })], enabled, "zh", labels);
    expect(content.ladder.map(r => r.v)).toEqual([0, 1]);
    expect(content.example).toBeNull();
    expect(content.section("example").body).not.toContain("99");
  });
  it("fails closed on unknown template tokens and does not evaluate HTML", () => {
    const content = buildRankHowContent({ ...policy, sections: [{ id: "overview", title: "HTML", body: "<b>{notPublished}</b>", order: 1 }] }, ranks, enabled, "zh", labels);
    expect(content.section("overview").available).toBe(false);
    expect(content.section("overview").body).not.toContain("{notPublished}");
  });
  it.each(["en", "vi"])("localizes explanatory status in %s", locale => {
    const content = buildRankHowContent(policy, ranks, enabled, locale, labels);
    expect(content.section("protection").body).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("states that peer rewards are unavailable instead of promising the configured rate", () => {
    const peerPolicy = { ...policy, sections: [
      { id: "unlock-peer", title: "平级奖励", body: "配置比例 {peerRate}", order: 1 },
      { id: "result-peer", title: "平级结果", body: "获得 {peerRate}", order: 2 },
    ] };
    const off = buildRankHowContent(peerPolicy, ranks, unavailable, "zh", labels);
    expect(off.section("unlock-peer").body).toContain("暂未开放");
    expect(off.section("result-peer").body).toContain("当前不派发");
    expect(`${off.section("unlock-peer").body} ${off.section("result-peer").body}`).not.toContain("2.75%");

    const on = buildRankHowContent(peerPolicy, ranks, enabled, "zh", labels);
    expect(on.section("unlock-peer").body).toContain("2.75%");
    expect(on.section("result-peer").body).toContain("2.75%");
  });
});

describe("rank-how public resource lifecycle", () => {
  const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
  it("deduplicates simultaneous page-show/retry reads without calling account endpoints", async () => {
    const gate = deferred<RankHowPolicy>();
    const published = vi.fn(() => gate.promise);
    const ladder = vi.fn(async () => ({ ranks, capabilities: unavailable }));
    const apply = vi.fn();
    const resource = createRankHowResource({ published, ladder, apply });
    const a = resource.load("zh"), b = resource.load("zh");
    gate.resolve(policy); await Promise.all([a, b]);
    expect(published).toHaveBeenCalledTimes(1); expect(ladder).toHaveBeenCalledTimes(1);
    expect(apply.mock.lastCall?.[0]).toMatchObject({ policy, ranks, capabilities: unavailable, loading: false });
  });
  it("discards a stale locale response and clears old policy on failure", async () => {
    const zh = deferred<RankHowPolicy>();
    const apply = vi.fn();
    const resource = createRankHowResource({ published: locale => locale === "zh" ? zh.promise : Promise.reject(new Error("offline")), ladder: async () => ({ ranks, capabilities: unavailable }), apply });
    const first = resource.load("zh"); await resource.load("en"); zh.resolve(policy); await first;
    expect(apply.mock.lastCall?.[0]).toMatchObject({ policy: null, ranks: [], error: true, loading: false });
  });
  it("can retry after an error and cannot apply after unmount", async () => {
    const gate = deferred<RankHowPolicy>(); const apply = vi.fn();
    const published = vi.fn().mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce(policy).mockReturnValueOnce(gate.promise);
    const resource = createRankHowResource({ published, ladder: async () => ({ ranks, capabilities: unavailable }), apply });
    await resource.load("zh"); await resource.load("zh"); expect(apply.mock.lastCall?.[0].policy).toBe(policy);
    const pending = resource.load("vi"); resource.dispose(); const count = apply.mock.calls.length; gate.resolve(policy); await pending;
    expect(apply).toHaveBeenCalledTimes(count);
  });
});
