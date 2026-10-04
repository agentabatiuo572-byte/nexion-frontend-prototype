// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { computed, ref } from "vue";
import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";

/**
 * zentao #206:团队页「本周领导池」的摘要行是**紧凑行**,却把整段错误说明
 * (「领导池结算暂未开放,请等待平台完成规则配置。这不是网络故障。」)直接塞进第二行,
 * 文本在窄区域多行挤压,还留下悬空的「/」。
 *
 * 契约:摘要行只放一句短状态;完整原因属于点进去的详情页。第二段只承载真实数据
 * (占比 / 周池比例),非就绪态一律留空 —— 于是分隔符也不会孤立出现。
 * 另外,error 态此前把 t.network.retry(「重新加载」)放进状态位,那是动作标签,不是状态。
 */
const source = readFileSync(new URL("./team.vue", import.meta.url), "utf8");

function binding(name: string, deps: string[]) {
  const block = source.match(new RegExp(`const ${name} = computed\\(\\(\\) =>[\\s\\S]*?\\n\\);`))?.[0];
  if (!block) throw new Error(`Missing binding: ${name}`);
  return new Function(...deps, `${block}; return ${name};`);
}

describe("team page leadership-pool summary row stays compact", () => {
  it("names USDT in A/B volume and estimated rewards while missing binary data remains unknown", () => {
    const names = ["leftVolText", "rightVolText", "binaryMatchText"];
    const declarations = names.map(name => source.split("\n").find((line: string) => line.startsWith(`const ${name} = computed(`)));
    expect(declarations.every(Boolean)).toBe(true);
    const binary = ref<{ leftVol: number; rightVol: number; binaryMatch: number } | null>(null);
    const text = new Function("computed", "binary", `${declarations.join("\n")}; return { ${names.join(",")} };`)(computed, binary);
    expect(names.map(name => text[name].value)).toEqual(["—", "—", "—"]);
    binary.value = { leftVol: 0, rightVol: 0, binaryMatch: 0 };
    expect(names.map(name => text[name].value)).toEqual(["0 USDT", "0 USDT", "+0.00 USDT"]);
    binary.value = { leftVol: 125, rightVol: 75, binaryMatch: 7.5 };
    expect(names.map(name => text[name].value)).toEqual(["125 USDT", "75 USDT", "+7.50 USDT"]);
  });

  it("names USDT in the ready weekly pool or projected payout without showing unavailable money", () => {
    const state = ref("ready"), unlocked = ref(false);
    const primary = binding("leadershipPoolPrimary", ["computed", "remoteApiEnabled", "remotePoolState", "leadershipPoolUnlocked", "projectedPayout", "leadershipPoolKText"])
      (computed, true, state, unlocked, ref(12.5), ref(0));
    expect(primary.value).toBe("0.0K USDT");
    unlocked.value = true; expect(primary.value).toBe("+12.50 USDT");
    for (const status of ["loading", "error", "hold"]) {
      state.value = status; expect(primary.value).toBe("—");
    }
  });

  it("uses the short hold state in the summary line, not the full explanation", () => {
    const lineA = binding("leadershipPoolLineA", ["computed", "remoteApiEnabled", "remotePoolState", "t", "leadershipPoolUnlocked", "myVotes", "leadershipUnlockRank"]);
    const state = ref("hold");
    const build = (dict: unknown) => lineA(computed, true, state, ref(dict), ref(false), ref(0), ref(3));
    for (const [locale, dict] of [["zh-CN", zh], ["en-US", en], ["vi-VN", vi]] as const) {
      const text = build(dict).value;
      expect(text).toBe(dict.pool.settlementHoldShort);
      // 完整说明(带句号的长句)不得出现在摘要行。
      expect(text).not.toContain(dict.pool.settlementHold);
      expect(text.length).toBeLessThanOrEqual(12);
      void locale;
    }
  });

  it("keeps the second segment data-only so the separator cannot dangle", () => {
    const lineB = binding("leadershipPoolLineB", ["computed", "remoteApiEnabled", "remotePoolState", "leadershipPoolUnlocked", "myShare", "poolThisWeekText"]);
    for (const state of ["hold", "loading", "error"] as const) {
      const value = lineB(computed, true, ref(state), ref(false), ref(0), ref("")).value;
      expect(value, `state=${state} 时第二段必须为空`).toBe("");
    }
    // 就绪态仍要给出真实数据。
    expect(lineB(computed, true, ref("ready"), ref(true), ref(0.1234), ref("")).value).toBe("12.34%");
  });

  it("renders the separator only when both segments have content", () => {
    // 渲染表达式必须按 lineB 是否存在决定是否拼接分隔符,而不是无条件输出「/」。
    expect(source).toMatch(/leadershipPoolLineB\s*\?\s*`\$\{leadershipPoolLineA\}[^`]*\/[^`]*\$\{leadershipPoolLineB\}`\s*:\s*leadershipPoolLineA/);
  });

  it("keeps the full explanation available in all three locales for the detail page", () => {
    for (const dict of [zh, en, vi]) {
      expect(dict.pool.settlementHold.length).toBeGreaterThan(dict.pool.settlementHoldShort.length);
      expect(dict.pool.settlementHoldShort.trim().length).toBeGreaterThan(0);
    }
  });

  it("never puts an action label in the status segment", () => {
    expect(source).not.toMatch(/remotePoolState\.value === "error"\s*\?\s*t\.value\.network\.retry/);
  });

  void fmt;
});
