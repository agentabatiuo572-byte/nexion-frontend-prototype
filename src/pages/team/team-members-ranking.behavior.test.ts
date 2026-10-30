import { teamPrivacyFixture } from './team-privacy.test-support';
import * as displayDate from "@/lib/display-date";
import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, test, vi } from "vitest";
import { mountEntry, all, text, flush, slot, type Host } from "@/lib/entry-review.test-support";
import rosterSource from "@/components/team/team-roster-section.vue?raw";
import leaderboardSource from "./leaderboard.vue?raw";
import { displayNickname } from "@/lib/brand-copy";
import { formatAmount } from "@/lib/amount-display";
import { leaderboardPointsCopy } from "@/i18n/leaderboard-points-copy";
import buttonSource from "@/components/ui/nx-button.vue?raw";
import { formatComputePoints } from "@/i18n/compute-points";
import { networkReauditCopy } from "@/i18n/network-reaudit";
import { rankLabel } from "@/lib/v-rank-copy";
import { fmt } from "@/i18n/format";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import type { NetworkMember } from "@/store/network";
import type { TeamLeaderboardSnapshot } from "@/api/team-insights-api";

const dictionaries = { en, zh, vi: vietnamese };
const disposers: Array<() => void> = [];
afterEach(() => disposers.splice(0).forEach(dispose => dispose()));
function press(node: Host, key = "Enter") {
  const handlers = Array.isArray(node.props.onKeydown) ? node.props.onKeydown : [node.props.onKeydown];
  for (const handler of handlers) handler({ key, preventDefault() {}, stopPropagation() {} });
}
function compileComponent(source: string, dependencies: Record<string, unknown>) {
  const compiled = compileScript(parse(source).descriptor, { id: "team-roster-behavior", inlineTemplate: true });
  const code = ts.transpileModule(compiled.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = { default: {} as Vue.Component };
  new Function("require", "exports", code)((id: string) => {
    if (id === "vue") return Vue;
    if (!(id in dependencies)) throw new Error("Missing roster dependency: " + id);
    return dependencies[id];
  }, exports);
  return { default: exports.default };
}
function member(id: string, points: number | null): NetworkMember {
  return { id, name: "Member " + id, avatar: "M", vRank: 2, layer: 1, status: "active", binary: "unassigned", isSpillover: false,
    joinedAt: Date.now() - 86400000, monthVolumeUSD: 90, totalVolumeUSD: null, monthComputePoints: points, lifetimeComputePoints: null, city: "City " + id };
}
test.each(["en", "zh", "vi"] as const)("flat roster expands actual member facts by keyboard and clears removed selection in %s", async language => {
  const copy = dictionaries[language];
  const state = Vue.reactive({
    color: "var(--v5-brand)", title: copy.tree.directTitle, subtitle: "", accentBg: "transparent", accentText: "var(--v5-ink)", badge: "",
    members: [member("unknown", null), member("zero", 0), member("active", 320)], isOpen: true, emptyLabel: copy.tree.emptyDirect, kind: "direct", showContribution: false,
  });
  const before = JSON.stringify(state.members);
  const roster = compileComponent(rosterSource, {
    "@/lib/brand-copy": { displayNickname }, "@/lib/amount-display": { formatAmount },
    "@/i18n/compute-points": { formatComputePoints }, "@/i18n/network-reaudit": { networkReauditCopy },
    "@/lib/v-rank-copy": { rankLabel }, "@/store/data-visibility": teamPrivacyFixture().dependency, "@/store/locale": { useLocaleStore: () => ({ code: language }) },
    "./team-rank-emblem.vue": slot, "@/store/commission": { UNILEVEL_USDT: {} },
    "@/i18n/use-t": { useT: () => Vue.ref(copy) }, "@/lib/display-date": displayDate, "@/i18n/format": { fmt },
  });
  const page = mountEntry('<template><Roster v-bind="state" @toggle="state.isOpen = !state.isOpen" /></template><script setup lang="ts">import Roster from "./roster.vue"; import { state } from "./state";</script>',
    { "./roster.vue": roster, "./state": { state } });
  disposers.push(page.unmount);
  const triggers = () => page.nodes("member-trigger");
  expect(triggers().map(node => text(node).match(/Member (active|zero|unknown)/)?.[1])).toEqual(["active", "zero", "unknown"]);
  expect(text(triggers()[1])).toContain(formatComputePoints(0, language));
  expect(text(triggers()[2])).toContain("—");
  expect(page.nodes("member-details")).toHaveLength(0);
  press(triggers()[0]); await flush();
  expect(triggers()[0].props["aria-expanded"]).toBe(true);
  expect(text(page.nodes("member-details")[0])).toContain("City active");
  expect(text(page.nodes("member-details")[0])).toContain("—");
  expect(text(page.root)).not.toContain("$");
  expect(JSON.stringify(state.members)).toBe(before);
  press(triggers()[0], " "); await flush();
  expect(page.nodes("member-details")).toHaveLength(0);
  press(triggers()[0]); await flush();
  state.members = []; await flush();
  expect(page.nodes("member-details")).toHaveLength(0);
  expect(text(page.root)).toContain(copy.tree.emptyDirect);
  state.members = [member("active", 10)]; await flush();
  expect(page.nodes("member-details")).toHaveLength(0);
  press(page.nodes("roster-heading")[0]); await flush();
  expect(triggers()).toHaveLength(0);
});

function snapshot(overrides: Partial<TeamLeaderboardSnapshot> = {}): TeamLeaderboardSnapshot {
  return { period: "week", paused: false, snapshotState: "LIVE", dataAvailable: true,
    rows: [{ rank: 1, handle: "Compute leader", flag: "", cc: "", directs: 1, teamSize: 3, computePoints: 8125, earnedUSDT: 81.25, delta: 0, vRank: 3, hasDevice: false },
      { rank: 2, handle: "More invites", flag: "", cc: "", directs: 25, teamSize: 30, computePoints: 0, earnedUSDT: 0, delta: 0, vRank: 1, hasDevice: false },
      { rank: 3, handle: "Third member", flag: "", cc: "", directs: 2, teamSize: 2, computePoints: 0, earnedUSDT: 0, delta: 0, vRank: 1, hasDevice: false },
      { rank: 4, handle: "Fourth member", flag: "", cc: "", directs: 1, teamSize: 1, computePoints: 0, earnedUSDT: 0, delta: 0, vRank: 1, hasDevice: false }],
    rankingMetric: "COMPUTE_POINTS", gapToNextComputePoints: null, myRank: null, gapToNext: 0, poolUsd: 0, topN: 0, page: 1, pageSize: 20, totalRows: 4,
    generatedAt: "2026-10-25T00:00:00Z", snapshotAt: null, snapshotVersion: null,
    source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true, ...overrides };
}
test.each(["en", "zh", "vi"] as const)("ranking keeps server order, independent compute points and one invite action through read failure/retry in %s", async language => {
  const shown: Array<() => void> = [];
  const navTo = vi.fn(), read = vi.fn().mockRejectedValueOnce(new Error("503")).mockResolvedValue(snapshot());
  const page = mountEntry(leaderboardSource, {
    "@/i18n/compute-points": { formatComputePoints }, "@/i18n/leaderboard-points-copy": { leaderboardPointsCopy },
    "@/components/ui/nx-button.vue": compileComponent(buttonSource, { "@/components/liquid-glass.vue": slot }),
    "@/lib/amount-display": { formatAmount }, "@/lib/route": { navTo }, "@dcloudio/uni-app": { onShow: (fn: () => void) => shown.push(fn), onHide: vi.fn() },
    "@/components/app-chassis.vue": slot, "@/components/sub-page-header.vue": slot,
    "@/components/team/team-art.vue": slot, "@/components/team/team-rank-emblem.vue": slot,
    "@/lib/v-rank-copy": { rankLabel }, "@/store/data-visibility": teamPrivacyFixture().dependency, "@/store/locale": { useLocaleStore: () => ({ code: language }) },
    "@/i18n/use-t": { useT: () => Vue.ref(dictionaries[language]) }, "@/lib/display-date": displayDate, "@/i18n/format": { fmt },
    "@/mock/leaderboard": { LEADERBOARD: {}, MY_RANK: {} }, "@/api/runtime": { apiRuntimeConfig: { environment: "prod", baseUrl: "https://fixture.invalid" }, remoteApiEnabled: true, teamInsightsApi: { leaderboard: read } },
    "@/store/auth": { useAuth: () => Vue.reactive({ isAuthenticated: true }) },
    "@/api/errors": { asApiError: (error: unknown) => error }, "@/store/app": { useApp: () => Vue.reactive({ accountKey: "account" }) },
    "@/lib/account-scope": { captureAccountScope: () => "account", isCurrentAccountScope: () => true },
    "@/api/order-api": { captureRuntimeRevision: () => 1, isCurrentRuntimeRevision: () => true, subscribeRuntimeRevision: () => () => {} },
    "@/components/glass-segments.vue": slot,
  });
  disposers.push(page.unmount);
  shown.forEach(fn => fn()); await flush();
  expect(text(page.root)).toContain(dictionaries[language].leaderboard.loadError);
  expect(page.nodes("leader-row")).toHaveLength(0);
  press(page.nodes("leader-cta")[0]); await flush();
  expect(read).toHaveBeenCalledTimes(2);
  expect(page.nodes("leader-row").map(node => node.props["data-rank"])).toEqual([1, 2, 3, 4]);
  expect(page.nodes("leader-podium")).toHaveLength(1);
  expect(all(page.nodes("leader-podium")[0]).filter(node => node.props["data-rank"]).map(node => node.props["data-rank"])).toEqual([1, 2, 3]);
  expect(all(page.nodes("leader-flat")[0]).filter(node => node.props["data-rank"]).map(node => node.props["data-rank"])).toEqual([4]);
  expect(text(page.nodes("leader-row")[0])).toContain("Compute leader");
  expect(text(page.nodes("leader-row")[0])).toContain(formatComputePoints(8125, language));
  expect(text(page.nodes("leader-row")[1])).toContain(formatComputePoints(0, language));
  const invite = page.nodes("leader-share");
  expect(invite).toHaveLength(1);
  expect(text(invite[0])).toContain(dictionaries[language].leaderboard.cta.share);
  press(invite[0], " "); expect(navTo).toHaveBeenCalledExactlyOnceWith("/pages/team/team?intent=share");
  expect(text(page.root)).not.toContain(dictionaries[language].leaderboard.myRank.climb);
  expect(all(page.root).some(node => String(node.props.style?.background).includes("var(--v5-brand)"))).toBe(false);
  read.mockResolvedValue(snapshot({ rows: [], totalRows: 0 }));
  shown.forEach(fn => fn()); await flush();
  expect(page.nodes("leader-podium")).toHaveLength(0);
  expect(page.nodes("leader-row")).toHaveLength(0);
});
