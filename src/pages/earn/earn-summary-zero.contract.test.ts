// Execute the production SFC script against confirmed snapshots and changing
// remote read states; fixture expectations do not reimplement its computeds.
// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { compile } from "@vue/compiler-dom";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import ts from "typescript";
import * as Vue from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { fmt } from "@/i18n/format";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

const source = readFileSync(new URL("./earn.vue", import.meta.url), "utf8");
const { descriptor } = parse(source, { filename: "earn.vue" });
const script = compileScript(descriptor, { id: "earn-summary-read-state" });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2018, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const render = new Function("Vue", compile(descriptor.template!.content, { mode: "function", prefixIdentifiers: true }).code)(Vue);
const scopes: Vue.EffectScope[] = [];
afterEach(() => { for (const scope of scopes.splice(0)) scope.stop(); });
type Range = "Today" | "Week" | "Month" | "All";
type Status = "idle" | "loading" | "ready" | "error";
const ranges = ["Today", "Week", "Month", "All"] as const;

function hero(range: Range, homeTruth: unknown, realized: { usdt: number; nex: number } | null,
  status: Status = "ready", copy = en, remoteApiEnabled = true) {
  const app = Vue.reactive({ accountKey: "user:3778", homeTruth, homeTruthStatus: status, remoteRealizedToday: realized,
    remoteFleetStatus: "ready", remoteFleetHasSnapshot: true, visibleDevices: [], slotCap: 1,
    earnings: { today: 9, todayNEX: 3, thisWeek: 18, thisMonth: 27, total: 36 },
    refreshHomeTruth: async () => true, refreshRemoteFleet: async () => true });
  const load = (id: string) => {
    if (id === "vue") return { ...Vue, onUnmounted: () => {} };
    if (id === "@dcloudio/uni-app") return { onShow: () => {}, onHide: () => {} };
    if (id === "@/store/app") return { useApp: () => app };
    if (id === "@/i18n/use-t") return { useT: () => Vue.ref(copy) };
    if (id === "@/i18n/format") return { fmt };
    if (id === "@/store/free-trial") return { useFreeTrial: () => ({ refreshRemote: async () => {} }) };
    if (id === "@/composables/use-capacity-explainer") return { useCapacityExplainer: () => ({ open() {} }) };
    if (id === "@/api/runtime") return { remoteApiEnabled };
    if (id === "@/lib/device-slot-policy") return { isActiveSlotDevice: () => false };
    if (id === "@/lib/account-scope" || id === "@/lib/authenticated-page-observation") return {};
    if (id.endsWith(".vue")) return { __esModule: true, default: {} };
    throw new Error(`Unexpected Earn script import: ${id}`);
  };
  const exports = {};
  const scope = Vue.effectScope();
  scopes.push(scope);
  const view = scope.run(() => new Function("require", "module", "exports",
    `${code}; return module.exports.default.setup({}, { expose() {} });`,
  )(load, { exports }, exports));
  view.range.value = range;
  return { ...view, app };
}

const emptyPeriod = { usdt: null, nex: null, jobCount: null };
const emptyTruth = { earnings: { today: emptyPeriod, week: emptyPeriod, month: emptyPeriod, all: emptyPeriod } };

describe("BUG 249 earn hero: confirmed empty periods vs failed read", () => {
  it("keeps a ready empty Today at zero even when the fleet witness is nonzero", () => {
    const view = hero("Today", emptyTruth, { usdt: 19, nex: 7 });
    expect(view.total.value).toBe(0);
    expect(view.totalKnown.value).toBe(true);
    expect(view.totalInt.value).toBe("0");
    expect(view.nexTotal.value).toBe(0);
    expect(view.jobsCount.value).toBe(0);
    expect(view.jobsText.value).toBe(fmt(en.earn.jobsCount, { n: "0" }));
  });

  it("renders successful empty Week, Month, and All periods as zero", () => {
    for (const range of ["Week", "Month", "All"] as const) {
      const view = hero(range, emptyTruth, null);
      expect(view.total.value).toBe(0);
      expect(view.nexTotal.value).toBe(0);
      expect(view.jobsCount.value).toBe(0);
      expect(view.jobsText.value).toBe(fmt(en.earn.jobsCount, { n: "0" }));
    }
  });

  it("keeps values unknown when the overview request has no confirmed snapshot", () => {
    const view = hero("Week", null, null, "error");
    expect(view.total.value).toBeNull();
    expect(view.totalKnown.value).toBe(false);
    expect(view.totalInt.value).toBe("—");
    expect(view.nexTotal.value).toBeNull();
    expect(view.jobsCount.value).toBeNull();
    expect(view.jobsText.value).toBe("—");
  });

  it("keeps a non-zero server figure authoritative over the fleet witness", () => {
    const view = hero("Today", { earnings: { today: { usdt: 12.5, nex: 3, jobCount: 4 }, week: emptyPeriod, month: emptyPeriod, all: emptyPeriod } }, { usdt: 0, nex: 0 });
    expect(view.total.value).toBe(12.5);
    expect(view.jobsCount.value).toBe(4);
  });

  it("does not borrow today's device snapshot for a partially unavailable Week range", () => {
    const partialTruth = { earnings: { ...emptyTruth.earnings, week: { usdt: null, nex: null, jobCount: 2 } } };
    const view = hero("Week", partialTruth, { usdt: 0, nex: 0 });
    expect(view.total.value).toBeNull();
    expect(view.jobsCount.value).toBe(2);
  });
});

function expectUnknown(view: ReturnType<typeof hero>) {
  expect(view.total.value).toBeNull();
  expect(view.totalKnown.value).toBe(false);
  expect(view.totalInt.value).toBe("—");
  expect(view.totalCents.value).toBe("");
  expect(view.nexTotal.value).toBeNull();
  expect(view.nexFmt.value).toBe("—");
  expect(view.jobsCount.value).toBeNull();
  expect(view.jobsText.value).toBe("—");
}

async function rendered(view: ReturnType<typeof hero>) {
  const app = Vue.createSSRApp({ render, setup: () => Vue.proxyRefs(view) });
  const wrapper = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("main", [slots.pageTop?.(), slots.default?.()]) });
  for (const name of ["AppChassis", "CardStagger", "TrialHeroBanner", "TrialGhostSlot", "DeviceCardPC",
    "CapacityExplainerSheet", "MissedIncomeBanner", "ComputeShareEntry", "EmptySlotsHint", "MarketBoard", "TaskCenter"]) {
    app.component(name, wrapper);
  }
  return renderToString(app);
}

const zeroPeriod = { usdt: 0, nex: 0, jobCount: 0 };
const zeroTruth = { earnings: { today: zeroPeriod, week: zeroPeriod, month: zeroPeriod, all: zeroPeriod } };
const nonzeroTruth = { earnings: {
  today: { usdt: 12.5, nex: 3, jobCount: 4 }, week: { usdt: 25.25, nex: 6, jobCount: 8 },
  month: { usdt: 50.5, nex: 12, jobCount: 16 }, all: { usdt: 101, nex: 24, jobCount: 32 },
} };
const expectedNonzero = [
  { usdt: 12.5, nex: 3, jobs: 4 }, { usdt: 25.25, nex: 6, jobs: 8 },
  { usdt: 50.5, nex: 12, jobs: 16 }, { usdt: 101, nex: 24, jobs: 32 },
];

describe("BUG 372 Earn read state with retained snapshots", () => {
  for (const status of ["error", "idle"] as const) {
    for (const [label, truth] of [["zero", zeroTruth], ["nonzero", nonzeroTruth]] as const) {
      it.each(ranges)(`hides cached ${label} values in ${status} for %s`, (range) => {
        const view = hero(range, truth, { usdt: 55, nex: 66 }, status);
        expectUnknown(view);
        expect(view.app.homeTruth).toEqual(truth);
      });
    }
  }

  it.each(ranges)("keeps a same-account confirmed %s snapshot during loading", (range) => {
    const view = hero(range, nonzeroTruth, { usdt: 0, nex: 0 }, "loading");
    const expected = expectedNonzero[ranges.indexOf(range)];
    expect(view.total.value).toBe(expected.usdt);
    expect(view.nexTotal.value).toBe(expected.nex);
    expect(view.jobsCount.value).toBe(expected.jobs);
  });

  for (const [label, truth] of [["zero", zeroTruth], ["empty", emptyTruth]] as const) {
    it.each(ranges)(`keeps a same-account confirmed ${label} %s snapshot during loading`, (range) => {
      const view = hero(range, truth, { usdt: 55, nex: 66 }, "loading");
      expect(view.total.value).toBe(0);
      expect(view.nexTotal.value).toBe(0);
      expect(view.jobsCount.value).toBe(0);
    });
  }

  for (const status of ["idle", "loading", "error"] as const) {
    it.each(ranges)(`keeps a first ${status} read unknown without a snapshot for %s`, (range) => {
      expectUnknown(hero(range, null, { usdt: 55, nex: 66 }, status));
    });
  }

  it.each(ranges)("restores ready zero and nonzero values after a failed %s read", (range) => {
    const view = hero(range, nonzeroTruth, null, "error");
    expectUnknown(view);
    view.app.homeTruth = zeroTruth;
    view.app.homeTruthStatus = "ready";
    expect(view.total.value).toBe(0);
    expect(view.nexTotal.value).toBe(0);
    expect(view.jobsCount.value).toBe(0);
    view.app.homeTruthStatus = "error";
    expectUnknown(view);
    view.app.homeTruth = nonzeroTruth;
    view.app.homeTruthStatus = "ready";
    const expected = expectedNonzero[ranges.indexOf(range)];
    expect(view.total.value).toBe(expected.usdt);
    expect(view.nexTotal.value).toBe(expected.nex);
    expect(view.jobsCount.value).toBe(expected.jobs);
  });

  it("keeps ready partial Today fleet fallback and hides it on failure", () => {
    const partial = { earnings: { ...emptyTruth.earnings, today: { usdt: null, nex: 9, jobCount: null } } };
    const view = hero("Today", partial, { usdt: 7, nex: 3 });
    expect(view.total.value).toBe(7);
    expect(view.nexTotal.value).toBe(9);
    expect(view.jobsCount.value).toBeNull();
    view.app.homeTruthStatus = "error";
    expectUnknown(view);
  });

  it.each(ranges)("keeps a rebound account's %s first read unknown until its snapshot is ready", (range) => {
    const view = hero(range, nonzeroTruth, { usdt: 7, nex: 3 });
    view.app.accountKey = "user:2002";
    view.app.homeTruthStatus = "idle";
    expectUnknown(view);
    // The actual store clears these on bindAccount. Its late-response fence is
    // separately exercised by app-remote-fleet-refresh-wiring.test.ts.
    view.app.homeTruth = null;
    view.app.remoteRealizedToday = null;
    view.app.homeTruthStatus = "loading";
    expectUnknown(view);
    view.app.homeTruth = zeroTruth;
    view.app.homeTruthStatus = "ready";
    expect(view.total.value).toBe(0);
    expect(view.nexTotal.value).toBe(0);
    expect(view.jobsCount.value).toBe(0);
  });

  it.each([en, zh, vietnamese])("renders existing error copy consistently with unknown hero values", async (copy) => {
    const view = hero("Today", zeroTruth, { usdt: 0, nex: 0 }, "error", copy);
    expectUnknown(view);
    const html = await rendered(view);
    const encodedBody = copy.earn.summaryUnavailableBody.replace(/'/g, "&#39;");
    expect(html).toContain(encodedBody);
    expect(html).toContain(copy.tradein.errPleaseRetry);
    expect(html).not.toContain(".00</text>");
    view.app.homeTruthStatus = "ready";
    expect((await rendered(view))).not.toContain(encodedBody);
  });

  it("preserves existing mock presentation independently of remote read errors", () => {
    const view = hero("Today", zeroTruth, null, "error", en, false);
    expect(view.total.value).toBe(9);
    expect(view.nexTotal.value).toBe(3);
    expect(view.jobsCount.value).toBe(14);
  });
});
