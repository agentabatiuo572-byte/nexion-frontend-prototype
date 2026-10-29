import { describe, expect, it, vi } from "vitest";
import type { CanonicalVRankRow } from "@/api/v-rank-api";
import type { RankHowPolicy } from "@/api/rank-how-policy-api";
import { buildRankHowContent, createRankHowResource } from "./rank-how-content";
import { teamRedesignCopy } from "@/i18n/team-redesign";
import { formatComputePoints } from "@/i18n/compute-points";

const labels = { selfBuy: "自购 ${n}", directRefs: "合格直推 {n}", teamVol: "团队 ${n}", register: "注册", vDownlines: "{n} 个 V{v}" };
const rank = (v: number, patch: Partial<CanonicalVRankRow> = {}): CanonicalVRankRow => ({ v, title: `Title ${v}`, cnTitle: `头衔${v}`, directBonus: .123456, unilevelDepth: 99, peerBonus: .0275, leadershipVotes: 17, cultivationBonus: 321.123456, rewards: [], visible: true, ...patch });
const ranks = [rank(0), rank(1, { selfComputePoints: 7891, directRefs: 8 }), rank(2, { selfComputePoints: 9870, directRefs: 9, teamComputePoints: 456781, requiredDownlineRank: 1, requiredDownlineCount: 6 })];
const pointless = ranks.map(({ selfComputePoints: _self, teamComputePoints: _team, ...row }) => row as CanonicalVRankRow);
const enabled = { peer: true, genesis: false } as const;
const unavailable = { peer: false, genesis: false } as const;
const policy: RankHowPolicy = { version: "p1", locale: "zh", hero: "Published hero", source: "server", sourceEnvironment: "PRODUCTION", runId: "", rules: { permanentProtection: false, qualifiedReferralSelfComputePoints: 7891, leadershipConfigured: false }, sections: [
  { id: "example", title: "{fromRank} → {toRank}", body: "{selfComputePoints} / {directRefs} / {teamComputePoints} / {rankLegs}", order: 1 },
  { id: "rewards", title: "奖励", body: "{directRate} / {peerRate} / {votes} / {cultivation} / {leadershipStatus}", order: 2 },
  { id: "protection", title: "保级", body: "{protection}", order: 3 },
  { id: "requirement-direct", title: "合格直推", body: "{referralThreshold}", order: 4 },
] };

describe("rank-how published presentation", () => {
  it.each([
    ["zh", "不要求自购算力点"],
    ["en", "No self compute-point minimum"],
    ["vi", "Không yêu cầu điểm tính toán tự mua"],
  ])("R1-R01 shows the referral threshold in points and distinguishes zero from unavailable in %s", (locale, zero) => {
    const shown = buildRankHowContent(policy, ranks, enabled, locale, labels);
    const configured = buildRankHowContent({ ...policy, rules: { ...policy.rules, qualifiedReferralSelfComputePoints: 0 } }, ranks, enabled, locale, labels);
    const absent = buildRankHowContent({ ...policy, rules: { ...policy.rules, qualifiedReferralSelfComputePoints: null } }, ranks, enabled, locale, labels);
    expect(shown.section("requirement-direct")).toMatchObject({ available: true, body: formatComputePoints(7891, locale) });
    expect(configured.section("requirement-direct")).toMatchObject({ available: true, body: zero });
    expect(absent.section("requirement-direct").available).toBe(false);
    expect(shown.section("requirement-direct").body).not.toMatch(/USD|\$/);
  });
  it.each(['zh', 'en', 'vi'])('uses the %s incentive-pool term while retaining the settlement gate and published wording', locale => {
    const input = { ...policy, sections: [
      { id: 'status', title: 'Published leadership title', body: '{leadershipStatus}', order: 1 },
      { id: 'plain', title: 'Published title', body: 'Leadership pool: published wording', order: 2 },
    ] };
    const held = buildRankHowContent(input, ranks, enabled, locale, labels);
    const ready = buildRankHowContent({ ...input, rules: { ...input.rules, leadershipConfigured: true } }, ranks, enabled, locale, labels);
    const pool = teamRedesignCopy(locale).teamIncentivePool.toLowerCase();
    expect(held.section('status').body.toLowerCase()).toContain(pool);
    expect(ready.section('status').body.toLowerCase()).toContain(pool);
    expect(held.section('status').body).toMatch(/暂未开放发放|aren’t open yet|chưa mở chi trả/);
    expect(held.section('status').body).toMatch(/票数不代表奖励已到账|Votes do not mean rewards have been received|Phiếu bầu không đồng nghĩa với phần thưởng đã nhận/);
    expect(ready.section('status').body).toMatch(/实际发放|actual payout|chi trả thực tế/);
    expect(held.section('plain')).toMatchObject({ title: 'Published title', body: 'Leadership pool: published wording' });
  });
  it.each([
    ["zh", "自购算力", "团队算力", "2,000 算力点", "20,000 算力点"],
    ["en", "Own compute", "Team compute", "2,000 compute pts", "20,000 compute pts"],
    ["vi", "Điểm cá nhân", "Điểm của nhóm", "2.000 điểm tính toán", "20.000 điểm tính toán"],
  ])("renders published point requirements and examples without legacy dollars in %s", (locale, self, team, ownValue, teamValue) => {
    const pointsPolicy = { ...policy, sections: [
      { id: "requirement-self", title: self, body: "{selfComputePoints}", order: 1 },
      { id: "requirement-team", title: team, body: "{teamComputePoints}", order: 2 },
      { id: "example-self", title: self, body: "{fromRank} → {toRank}: {selfComputePoints}", order: 3 },
      { id: "example-team", title: team, body: "{fromRank} → {toRank}: {teamComputePoints}", order: 4 },
    ] };
    const changed = ranks.map(row => row.v === 2 ? { ...row, selfComputePoints: 2000, teamComputePoints: 20000 } : row);
    vi.stubGlobal("Intl", undefined);
    try {
      const content = buildRankHowContent(pointsPolicy, changed, enabled, locale, labels);
      expect(content.section("requirement-self")).toMatchObject({ available: true, body: ownValue });
      expect(content.section("requirement-team")).toMatchObject({ available: true, body: teamValue });
      expect(content.section("example-self").body).toBe(`V1 → V2: ${ownValue}`);
      expect(content.section("example-team").body).toBe(`V1 → V2: ${teamValue}`);
      for (const { id } of pointsPolicy.sections) {
        expect(content.section(id).body).not.toMatch(/\$|USD/);
        const missing = buildRankHowContent(pointsPolicy, pointless, enabled, locale, labels).section(id);
        expect(missing.available).toBe(false);
        expect(missing.body).not.toMatch(/\$|USD/);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("binds point policy tokens only to canonical point fields", () => {
    const pointsPolicy = { ...policy, sections: [{ id: "points", title: "Points", body: "{selfComputePoints} / {teamComputePoints}", order: 1 }, ...policy.sections] };
    const changed = ranks.map(r => r.v === 2 ? { ...r, selfComputePoints: 2000, teamComputePoints: 20000 } : r);
    const content = buildRankHowContent(pointsPolicy, changed, enabled, "zh", labels);
    expect(content.section("points")).toMatchObject({ available: true, body: "2,000 算力点 / 20,000 算力点" });
    expect(content.section("rewards").body).toContain("321.12 UVT");
    const missing = buildRankHowContent(pointsPolicy, pointless, enabled, "zh", labels);
    expect(missing.section("points").available).toBe(false);
  });
  it("selects a point-only example", () => {
    const p = { ...policy, sections: [{ id: "points", title: "{fromRank} → {toRank}", body: "{selfComputePoints} / {teamComputePoints}", order: 1 }] };
    const content = buildRankHowContent(p, [rank(0), rank(1, { selfComputePoints: 0, teamComputePoints: 20000.125 })], enabled, "vi", labels);
    expect(content.section("points")).toMatchObject({ available: true, title: "V0 → V1", body: "0 điểm tính toán / 20.000,125 điểm tính toán" });
  });
  it("formats example thresholds in points without changing reward and rate formatting", () => {
    const content = buildRankHowContent(policy, ranks, enabled, "zh", labels);
    expect(content.section("example").title).toBe("V1 → V2");
    expect(content.section("example").body).toContain("456,781 算力点");
    expect(content.section("example").body).toContain("6 个 V1");
    expect(content.section("example").body).not.toMatch(/USD|\$/);
    expect(content.section("rewards").body).toContain("12.3456%");
    expect(content.section("rewards").body).toContain("2.75%");
    expect(content.section("rewards").body).toContain("321.12 UVT");
    expect(content.section("rewards").body).toContain("暂未开放发放");
    expect(content.section("requirement-direct").body).toBe("7,891 算力点");
    expect(content.section("protection").body).toContain("可能调整");
  });
  it.each(["zh", "en", "vi"])("renders large point thresholds in %s when native Intl is absent", locale => {
    const expected = formatComputePoints(1234567, locale);
    vi.stubGlobal("Intl", undefined);
    try {
      const changed = ranks.map(row => row.v === 2 ? { ...row, teamComputePoints: 1234567 } : row);
      const content = buildRankHowContent(policy, changed, enabled, locale, labels);
      expect(content.section("example").body).toContain(expected);
      expect(content.section("rewards").body).toContain("321.12 UVT");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("recomputes values after PC configuration changes", () => {
    const changed = ranks.map(r => r.v === 2 ? { ...r, teamComputePoints: 123, leadershipVotes: 29 } : r);
    const content = buildRankHowContent({ ...policy, rules: { ...policy.rules!, permanentProtection: true, leadershipConfigured: true } }, changed, enabled, "zh", labels);
    expect(content.section("example").body).toContain("123 算力点");
    expect(content.section("rewards").body).toContain("29");
    expect(content.section("protection").body).toContain("会保留");
  });
  it("distinguishes a configured zero referral minimum from unavailable configuration", () => {
    const content = buildRankHowContent({ ...policy, rules: { ...policy.rules, qualifiedReferralSelfComputePoints: 0 } }, ranks, enabled, "zh", labels);
    expect(content.section("requirement-direct").body).toBe("不要求自购算力点");
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
    const content = buildRankHowContent(policy, [rank(0), rank(1, { selfComputePoints: 0, directRefs: 0 }), rank(2, { visible: false })], enabled, "zh", labels);
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
    expect(off.section("result-peer").body).toContain("暂未开放");
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
