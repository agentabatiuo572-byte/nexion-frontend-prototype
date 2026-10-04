import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { createDayOnePageObservationApi } from "../api/day-one-page-observation-api";
import { createH3ObservationApi } from "../api/h3-observation-api";
import type { ApiClient } from "../api/api-client";
import { createAuthenticatedPageObservationReporter } from "../lib/authenticated-page-observation";
import { readGenesisRemoteFacts } from "../lib/genesis-remote-sync";

const pageSources = import.meta.glob(
  ["./earn/earn.vue", "./store/store.vue", "./store/detail.vue", "./genesis/marketplace.vue"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;
const genesisSources = import.meta.glob("../store/genesis.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const pages = [
  { file: "earn/earn.vue", fn: "observeDayOneEarnPage", visible: "earnPageVisible", epoch: "earnObservationEpoch", paths: ["/api/growth/day-one/page-observations/earn"] },
  { file: "store/store.vue", fn: "observeDayOneStorePage", visible: "storePageVisible", epoch: "storeObservationEpoch", paths: ["/api/growth/day-one/page-observations/store"] },
  { file: "store/detail.vue", fn: "observeCanonicalProductDetail", visible: "detailPageVisible", epoch: "detailObservationEpoch", paths: ["/api/store/products/stellarbox-s1/detail-observation", "/api/growth/day-one/page-observations/s1-roi"] },
  { file: "genesis/marketplace.vue", fn: "refreshMarketplaceFacts", visible: "marketplacePageVisible", epoch: "marketplaceObservationEpoch", paths: ["/api/genesis/secondary-market/observation"] },
];
type Page = typeof pages[number];

function harness(page: Page, options: { remote?: boolean; recorded?: boolean } = {}) {
  const source = parse(pageSources[`./${page.file}`]).descriptor.scriptSetup!.content;
  const ast = ts.createSourceFile(page.file + ".ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === page.fn);
  if (!fn) throw new Error(`actual observer missing: ${page.file} ${page.fn}`);
  const lifecycle = (name: string) => ast.statements.filter(node => ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === name)
    .map(node => (node as ts.ExpressionStatement).expression as ts.CallExpression)
    .map(node => node.arguments[0].getText(ast));
  let currentScope = { accountKey: "user:7", epoch: 3 };
  let session: { accessToken: string; user: { userId: number } } | null = { accessToken: "fixture-token", user: { userId: 7 } };
  let now = Date.parse("2026-09-08T02:00:00Z");
  const request = vi.fn().mockResolvedValue({ accepted: true, recorded: options.recorded ?? true });
  const reporter = createAuthenticatedPageObservationReporter({ now: () => now });
  const pending: Promise<void>[] = [];
  const deps = {
    remoteApiEnabled: options.remote ?? true,
    app: { homeTruthStatus: "ready", remoteFleetStatus: "ready", homeTruth: {} as object | null },
    catalogStatus: { value: "ready" },
    product: { value: { id: "stellarbox-s1", productType: "HARDWARE", price: 100, dailyEarn: 1 } },
    genesis: { remotePublicReadState: "ready", syncRemote: vi.fn().mockResolvedValue(true) },
    nextTick: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    captureAccountScope: () => ({ ...currentScope }),
    isCurrentAccountScope: (scope: typeof currentScope) => scope.accountKey === currentScope.accountKey && scope.epoch === currentScope.epoch,
    sessionVault: { read: () => session },
    authenticatedPageObservationReporter: { report: (input: Parameters<typeof reporter.report>[0]) => { const promise = reporter.report(input); pending.push(promise); return promise; } },
    behaviorTracker: { viewStore: vi.fn(async () => true) },
    createStoreViewEvent: vi.fn(() => ({ clientEventId: "e".repeat(32), eventName: "store.viewed", sessionId: "s".repeat(32), route: "/pages/store/store", clientTs: 1_700_000_000_000, deviceType: "H5", locale: "zh-CN" })),
    dayOnePageObservationApi: createDayOnePageObservationApi({ request } as unknown as ApiClient),
    h3ObservationApi: createH3ObservationApi({ request } as unknown as ApiClient),
    invalidateDetailFacts: () => {}, stickyPageVisible: { value: true }, sticky: { hide: () => {} }, stickyOwner: "fixture",
    releaseActiveRefresh: () => {},
    listingPageScope: { visible: false, epoch: 0 },
    // store.vue clears the goal-recommendation arrival context on hide/unmount.
    focusProductId: { value: "" }, focusProductName: { value: "" },
  };
  const js = ts.transpileModule(`
    const { ${Object.keys(deps).join(",")} } = deps;
    let ${page.visible} = true, ${page.epoch} = 0;
    let storeViewReportedScope = "";
    let storeViewAttempt = null;
    ${fn.getText(ast)}
    return {
      run: ${page.fn}, hide: () => [${lifecycle("onHide").join(",")}].forEach(fn => fn()),
      unmount: () => [${lifecycle("onUnmounted").join(",")}].forEach(fn => fn()),
      show: () => { ${page.visible} = true; }
    };
  `, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const actual = new Function("deps", js)(deps) as { run(): Promise<void>; hide(): void; unmount(): void; show(): void };
  return { deps, request, actual, setSession: (value: typeof session) => { session = value; },
    rebind: () => { currentScope = { ...currentScope, epoch: currentScope.epoch + 1 }; },
    advance: (ms: number) => { now += ms; },
    run: async () => { await actual.run(); await Promise.all(pending); },
  };
}

describe("actual App page observers through the real API adapters and reporter", () => {
  it("store conversion records once per visible entry after the catalog is ready", async () => {
    const h = harness(pages[1]);
    await h.run(); await h.run();
    expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(1);
    h.actual.hide(); h.actual.show();
    await h.run();
    expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(2);
    h.deps.catalogStatus.value = "loading";
    h.actual.hide(); h.actual.show();
    await h.run();
    expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(2);
  });
  it("store conversion retries a failed request with the same event, then stops after a duplicate receipt", async () => {
    vi.useFakeTimers();
    try {
      const h = harness(pages[1]);
      h.deps.behaviorTracker.viewStore.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      await h.run();
      await Promise.resolve();
      expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(2);
      const sent = h.deps.behaviorTracker.viewStore.mock.calls as unknown as Array<[unknown]>;
      expect(sent[1][0]).toEqual(sent[0][0]);
      await h.run();
      expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(2);
      h.actual.hide();
      await vi.advanceTimersByTimeAsync(3000);
      expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it("store conversion bounds failed attempts and resets only on a new visible entry", async () => {
    vi.useFakeTimers();
    try {
      const h = harness(pages[1]);
      h.deps.behaviorTracker.viewStore.mockResolvedValue(false);
      await h.run();
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(10_000);
      await h.run();
      expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(3);
      h.actual.hide(); h.actual.show();
      await h.run();
      expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(4);
      h.actual.hide();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
  it("store conversion never retries an old event under a changed token identity", async () => {
    vi.useFakeTimers();
    try {
      const h = harness(pages[1]);
      h.deps.behaviorTracker.viewStore.mockResolvedValue(false);
      await h.run();
      expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(1);
      h.setSession({ accessToken: "new-user-token", user: { userId: 99 } });
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.deps.behaviorTracker.viewStore).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  for (const page of pages) {
    it(`${page.file}: emits fixed authenticated requests after rendering, deduplicates triggers, and never claims`, async () => {
      const h = harness(page);
      await h.run(); await h.run();
      expect(h.request.mock.calls.map(([args]) => args.path)).toEqual(page.paths);
      for (const [args] of h.request.mock.calls) expect(args).toEqual({ method: "POST", path: args.path, authenticated: true });
    });
    it(`${page.file}: missing authentication and mock mode cannot emit`, async () => {
      const anonymous = harness(page); anonymous.setSession(null); await anonymous.run(); expect(anonymous.request).not.toHaveBeenCalled();
      const mismatch = harness(page); mismatch.setSession({ accessToken: "fixture", user: { userId: 8 } }); await mismatch.run(); expect(mismatch.request).not.toHaveBeenCalled();
      const mock = harness(page, { remote: false }); await mock.run(); expect(mock.request).not.toHaveBeenCalled();
    });
    it(`${page.file}: hide, unmount and same-account rebind before render cancel observations`, async () => {
      for (const cancel of ["hide", "unmount", "rebind"] as const) {
        const h = harness(page);
        h.deps.nextTick.mockImplementation(async () => { if (cancel === "rebind") h.rebind(); else h.actual[cancel](); });
        await h.run(); expect(h.request).not.toHaveBeenCalled();
      }
    });
    it(`${page.file}: unavailable source data cannot become a completed page view`, async () => {
      const h = harness(page);
      h.deps.app.homeTruthStatus = "unavailable"; h.deps.catalogStatus.value = "unavailable"; h.deps.genesis.remotePublicReadState = "unavailable";
      await h.run(); expect(h.request).not.toHaveBeenCalled();
    });
  }
  it("marketplace cannot use an obsolete successful read after nextTick or emit in mock mode", async () => {
    const h = harness(pages[3]);
    h.deps.nextTick.mockImplementation(async () => { h.deps.genesis.remotePublicReadState = "unavailable"; });
    await h.run(); expect(h.request).not.toHaveBeenCalled();
  });
  it("marketplace transport failure remains a page-read failure without an unhandled observer rejection", async () => {
    const h = harness(pages[3]); h.deps.genesis.syncRemote.mockRejectedValue(new Error("offline"));
    await expect(h.run()).resolves.toBeUndefined(); expect(h.request).not.toHaveBeenCalled();
  });
  it("invalid S1 ROI values and a replacement product snapshot cannot emit a Day-One ROI fact", async () => {
    for (const patch of [{ price: 0 }, { price: -1 }, { dailyEarn: 0 }, { dailyEarn: -1 }, { dailyEarn: Infinity }, { price: NaN }, { productType: "SHARE" }, { id: "stellarbox-pro" }]) {
      const h = harness(pages[2]); Object.assign(h.deps.product.value, patch); await h.run();
      expect(h.request.mock.calls.some(([args]) => args.path.endsWith("/s1-roi"))).toBe(false);
    }
    const h = harness(pages[2]);
    h.deps.nextTick.mockImplementation(async () => { h.deps.product.value = { ...h.deps.product.value, price: NaN }; });
    await h.run(); expect(h.request).not.toHaveBeenCalled();
  });
  it("a server no-op or offline request permits a later visit without retrying in the background", async () => {
    for (const fail of [false, true]) {
      const h = harness(pages[0], { recorded: false });
      if (fail) h.request.mockRejectedValueOnce(new Error("offline"));
      await h.run(); await h.run(); expect(h.request).toHaveBeenCalledTimes(1);
      h.advance(30_000); h.request.mockResolvedValue({ accepted: true, recorded: true });
      await h.run(); await h.run(); expect(h.request).toHaveBeenCalledTimes(2);
    }
  });
});

it("actual Genesis sync separates public readiness from account-only success and fences overlapping reads", async () => {
  const source = genesisSources["../store/genesis.ts"];
  const ast = ts.createSourceFile("genesis.ts", source, ts.ScriptTarget.Latest, true);
  const functions = new Map<string, ts.FunctionDeclaration>();
  const walk = (node: ts.Node) => { if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node); ts.forEachChild(node, walk); };
  walk(ast);
  const publicState = { series: { totalSupply: 100, soldSupply: 1 }, emissionOpen: false, transactions: [], marketStats: {}, halted: false, listings: [], secondaryCommandProtocol: 2 };
  const api = { state: vi.fn().mockResolvedValue(publicState), account: vi.fn().mockResolvedValue({}), eligibility: vi.fn().mockResolvedValue({}) };
  const pager = () => ({ state: { items: [] }, reset: () => {} });
  const ref = (value: unknown = null) => ({ value });
  const deps = {
    remoteApiEnabled: true, genesisApi: api, readGenesisRemoteFacts,
    remoteAccountEpoch: { snapshot: () => ({ accountKey: "user:7", epoch: 3 }) },
    captureRuntimeRevision: () => ({}), remoteScopeCurrent: () => true,
    sessionVault: { read: () => ({}) }, hasGenesisAuthorityForAccount: () => true, boundKey: "user:7",
    activityPager: pager(), orderPager: pager(), emissionPager: pager(),
    applyAccountState: () => {}, clearRemoteAccountFacts: () => {},
    totalSlots: ref(), soldSlots: ref(), nexListed: ref(), remoteMarketStats: ref(), remoteHalted: ref(),
    remoteListings: ref(), listingNoByTokenId: ref(), tokenIdFor: (id: string) => id,
    remoteEligibility: ref(), remoteEligibilityError: ref(), remotePublicError: ref(),
    remoteSupplyKnown: ref(), remoteRoyaltyPct: ref(), remoteAccountReadState: ref(),
    remoteSecondaryCommandProtocol: ref(), nexListedAt: ref(),
  };
  const js = ts.transpileModule(`
    const { ${Object.keys(deps).join(",")} } = deps;
    let remoteReadGeneration = 0;
    const remotePublicReadState = { value: "loading" };
    ${functions.get("clearRemotePublicFacts")!.getText(ast)}
    const clearRemoteFacts = clearRemotePublicFacts;
    ${functions.get("applyPublicState")!.getText(ast)}
    ${functions.get("syncRemote")!.getText(ast)}
    return { syncRemote, remotePublicReadState, remoteSecondaryCommandProtocol };
  `, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const actual = new Function("deps", js)(deps) as { syncRemote(): Promise<boolean>; remotePublicReadState: { value: string }; remoteSecondaryCommandProtocol: { value: number } };
  await actual.syncRemote(); expect(actual.remotePublicReadState.value).toBe("ready"); expect(actual.remoteSecondaryCommandProtocol.value).toBe(2);
  api.state.mockRejectedValueOnce(new Error("public unavailable"));
  expect(await actual.syncRemote()).toBe(true); // Account success is insufficient for a market observation.
  expect(actual.remotePublicReadState.value).toBe("unavailable"); expect(actual.remoteSecondaryCommandProtocol.value).toBe(0);
  let release!: (value: typeof publicState) => void;
  api.state.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const old = actual.syncRemote(); expect(actual.remotePublicReadState.value).toBe("loading");
  await actual.syncRemote(); expect(actual.remotePublicReadState.value).toBe("ready"); expect(actual.remoteSecondaryCommandProtocol.value).toBe(2);
  release(publicState); expect(await old).toBe(false);
  expect(actual.remotePublicReadState.value).toBe("ready");
});
