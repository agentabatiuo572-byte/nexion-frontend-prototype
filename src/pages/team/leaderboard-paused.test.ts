// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";

const source = readFileSync(new URL("./leaderboard.vue", import.meta.url), "utf8");
const template = parse(source).descriptor.template!.content;
const compiled = compile(template, { mode: "function", prefixIdentifiers: true }).code;
const render = new Function("Vue", compiled)(Vue);
const pausedExpression = source.match(/const paused = computed\(\(\) => (.*)\);/)?.[1];
if (!pausedExpression) throw new Error("Missing leaderboard pause projection");
const readPaused = new Function("remoteApiEnabled", "remoteSnapshot", "period", `return (${pausedExpression});`);

async function page(paused: boolean, period: string, t: typeof en, poolUSD = 0, snapshotAvailable = true) {
  const styles = Object.fromEntries([...compiled.matchAll(/_ctx\.(\w+)/g)].map(match => [match[1], {}]));
  const app = Vue.createSSRApp({ render, setup: () => ({
    ...styles, paused, period, t, remoteApiEnabled: true, remoteState: "ready", snapshotAvailable,
    pauseCapturedAt: "2026-10-08T12:30:00Z",
    heroCapStyle: () => ({}), fmtCompactUSD: () => `$${poolUSD}`, prize: { poolUSD, topN: poolUSD > 0 ? 21 : 0 },
    payoutToText: "PAYOUT_TO_FROZEN_21",
    totalRows: 0, myRankDisplay: "—", gapText: t.leaderboard.myRank.notRanked,
    podiumDisplay: [], visibleRest: [], hasMore: false, periodOptions: [],
    go() {}, selectPeriod() {}, loadRemote() {},
  }) });
  const wrapper = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("section", slots.default?.()) });
  for (const component of ["AppChassis", "SubPageHeader", "GlassSegments"]) app.component(component, wrapper);
  return renderToString(app);
}

describe("leaderboard paused presentation", () => {
  for (const t of [en, zh, vi]) {
    it(`hides unknown values during a legacy pause in ${t.leaderboard.pausedTitle}`, async () => {
      const html = await page(true, "week", t, 900, false);
      expect(html).toContain(t.leaderboard.snapshotUnavailable);
      expect(html).not.toContain("$900");
      expect(html).not.toContain("2026-10-08T12:30:00Z");
    });
  }
  it("labels a factual frozen value with its durable capture time", async () => {
    const html = await page(true, "week", en, 900, true);
    expect(html).toContain("$900");
    expect(html).toContain("2026-10-08T12:30:00Z");
    expect(html).not.toContain(en.leaderboard.snapshotUnavailable);
  });
  for (const period of ["today", "week", "month", "all"]) {
    for (const t of [en, zh, vi]) {
      it(`${period} shows maintenance and hides ranking prompts in ${t.leaderboard.pausedTitle}`, async () => {
        const html = await page(true, period, t);
        expect(html).toContain(t.leaderboard.pausedTitle);
        expect(html).toContain(t.leaderboard.pausedBody);
        expect(html).toContain('role="status"');
        expect(html).not.toContain(t.leaderboard.cta.share);
        expect(html).not.toContain(t.leaderboard.myRank.climb);
        expect(html).not.toContain(t.leaderboard.note);
        expect(html).not.toContain(t.leaderboard.noteAllTime);
      });
    }
  }
  it("keeps a zero-pool active empty board distinct from maintenance", async () => {
    const html = await page(false, "week", en);
    expect(html).toContain(en.leaderboard.cta.share);
    expect(html).toContain(en.leaderboard.note);
    expect(html).not.toContain(en.leaderboard.pausedTitle);
  });
  for (const period of ["today", "week", "month", "all"]) {
    it(`${period} hides the frozen snapshot payout prompt when current pause becomes true`, async () => {
      const html = await page(true, period, en, 100);
      expect(html).toContain(en.leaderboard.pausedTitle);
      expect(html).toContain("$100");
      expect(html).not.toContain("PAYOUT_TO_FROZEN_21");
      expect(html).not.toContain(en.leaderboard.cta.share);
      expect(html).not.toContain(en.leaderboard.note);
    });
  }
  it("keeps the payout prompt on an active positive-pool snapshot", async () => {
    const html = await page(false, "week", en, 100);
    expect(html).toContain("PAYOUT_TO_FROZEN_21");
  });
  it("does not use another period or a local fixture as a paused server fact", () => {
    expect(readPaused(true, { value: { period: "week", paused: true } }, { value: "week" })).toBe(true);
    expect(readPaused(true, { value: { period: "today", paused: true } }, { value: "week" })).toBe(false);
    expect(readPaused(false, { value: { period: "week", paused: true } }, { value: "week" })).toBe(false);
    expect(readPaused(true, { value: { period: "week" } }, { value: "week" })).toBe(false);
  });
});
