import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { installProbeConversationRealtime } from "./lib/probe-conversation-realtime.mjs";

test("background realtime fixture requires a single-use ticket and never acknowledges unmodeled writes", async () => {
  let http, connect;
  const page = {
    async route(matches, handler) { assert.equal(matches(new URL("http://local/api/app/support/realtime-ticket")), true); http = handler; },
    async routeWebSocket(matches, handler) {
      assert.equal(matches(new URL("ws://local/ws/conversations")), true);
      assert.equal(matches(new URL("ws://local/?token=hmr")), false);
      connect = handler;
    },
  };
  await installProbeConversationRealtime(page);
  let response;
  await http({ request: () => ({ method: () => "POST" }), fulfill: (value) => { response = JSON.parse(value.body); } });
  const sent = []; let receive; let closed = false;
  const socket = { onMessage: (handler) => { receive = handler; }, send: (frame) => sent.push(JSON.parse(frame)), close: () => { closed = true; } };
  connect(socket);
  receive(JSON.stringify({ type: "auth", ticket: response.data.ticket }));
  receive(JSON.stringify({ type: "ping" }));
  receive(JSON.stringify({ type: "command", requestId: "write-1", operation: "send" }));
  assert.deepEqual(sent, [{ type: "ready" }, { type: "pong" }]);
  connect(socket);
  receive(JSON.stringify({ type: "auth", ticket: response.data.ticket }));
  assert.equal(sent.at(-1).code, 401);
  assert.equal(closed, true);
  await installProbeConversationRealtime(page, { authenticated: false });
  await http({ request: () => ({ method: () => "POST" }), fulfill: (value) => { response = JSON.parse(value.body); } });
  assert.equal(response.code, 401);
  assert.equal(response.data, null);
});

import { directAppUrl } from "./lib/direct-app-url.mjs";
import { captureTapRouteErrors, measureTapRoute } from "./lib/tap-route-coverage.mjs";
import {
  assertAuthGuardRoutes,
  assertCaptureCoverage,
  assertComparablePngCoverage,
  assertNoRuntimeErrors,
  assertSemanticSelectors,
  assertSweepCoverage,
  assertUniAppRuntimeIdentity,
} from "./lib/probe-coverage.mjs";

const DIRECT_PROBES = [
  "scripts/spec6-entry-surface-runtime.mjs",
  "scripts/trial-check.mjs",
  "scripts/sticky-check.mjs",
  "scripts/backnav-check.mjs",
  "scripts/page-check.mjs",
];

test("tap measurement rejects redirects before and during observation, and zero targets per route", async () => {
  const witness = (actualRoute) => ({ actualRoute, appChildren: 1, iframeCount: 0, bodyElements: 4, bodyTextLength: 20 });
  let measured = false;
  await assert.rejects(measureTapRoute({ evaluate: async () => witness("/pages/login/login") }, "pages/me/me", async () => {
    measured = true;
    return { targets: [{ i: 0 }] };
  }), /before measurement.*landed \/pages\/login\/login/);
  assert.equal(measured, false, "a redirected page is rejected before collecting its tap targets");

  let actualRoute = "/pages/me/me";
  const page = { evaluate: async () => witness(actualRoute) };
  await assert.rejects(measureTapRoute(page, "pages/me/me", async () => {
    actualRoute = "/pages/onboarding/terms";
    return { targets: [{ i: 0 }] };
  }), /after measurement.*landed \/pages\/onboarding\/terms/);

  actualRoute = "/pages/me/me";
  await assert.rejects(measureTapRoute(page, "pages/me/me", async () => ({ targets: [] })), /zero tap targets/);
  const result = await measureTapRoute(page, "pages/me/me", async () => ({ targets: [{ i: 0 }], tooSmall: [], noFeedback: [] }));
  assert.equal(result.coverage.before.actualRoute, actualRoute);
  assert.equal(result.coverage.after.actualRoute, actualRoute);
  assert.deepEqual(result.targets, [{ i: 0 }]);
});

test("tap probe authenticates each lane and warmup page and binds the actual measurement to route coverage", () => {
  const source = fs.readFileSync("scripts/tap-feedback-probe.mjs", "utf8");
  assert.match(source, /await installFormalProbeSession\(wp\)/);
  assert.match(source, /await installFormalProbeSession\(lane\)/);
  assert.match(source, /return measureTapRoute\(page, route, async \(\) => \{[\s\S]*?page\.evaluate\(markTargets/);
  assert.match(source, /routeCoverage: results\.map/);
  assert.match(source, /laneErrors\.set\(lane, captureTapRouteErrors\(lane, BASE\)\)/);
  assert.match(source, /probeRoute\(lane, c, r, allRoutes\.indexOf\(r\), laneErrors\.get\(lane\)\)/);
});

test("tap runtime errors fail even when the target hash and populated DOM remain unchanged", async () => {
  const listeners = new Map();
  const page = {
    on: (event, listener) => listeners.set(event, listener),
    evaluate: async () => ({ actualRoute: "/pages/me/me", appChildren: 1, iframeCount: 0, bodyElements: 4, bodyTextLength: 20 }),
  };
  const errors = captureTapRouteErrors(page, "http://candidate.test");
  listeners.get("pageerror")(new Error("render exploded"));
  await assert.rejects(measureTapRoute(page, "pages/me/me", async () => ({ targets: [{ i: 0 }] }), errors), /before measurement.*render exploded/);
  errors.pageErrors.length = 0;
  await assert.rejects(measureTapRoute(page, "pages/me/me", async () => {
    listeners.get("console")({ type: () => "error", text: () => "computed state exploded", location: () => ({ url: "http://candidate.test/src/main.ts" }) });
    return { targets: [{ i: 0 }] };
  }, errors), /after measurement.*computed state exploded/);
});

test("directAppUrl always renders the app document and preserves the hash route", () => {
  assert.equal(
    directAppUrl("http://localhost:5173", "/#/pages/entry-surfaces/white?entry=white-app"),
    "http://localhost:5173/?nx_device=off#/pages/entry-surfaces/white?entry=white-app",
  );
  assert.equal(
    directAppUrl("http://localhost:5173/", "#/pages/me/me"),
    "http://localhost:5173/?nx_device=off#/pages/me/me",
  );
  assert.equal(
    directAppUrl("http://localhost:5173", "/pages/team/rank"),
    "http://localhost:5173/?nx_device=off#/pages/team/rank",
  );
});

test("all five direct-DOM probes use the shared direct-app URL constructor", () => {
  for (const file of DIRECT_PROBES) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /from\s+["']\.\/lib\/direct-app-url\.mjs["']/, `${file} must import directAppUrl`);
    assert.match(source, /page\.goto\(directAppUrl\(/, `${file} must navigate through directAppUrl`);
  }
  const entrySurface = fs.readFileSync("scripts/spec6-entry-surface-runtime.mjs", "utf8");
  assert.match(entrySurface, /assertDirectPageCoverage\(/, "entry-surface probe needs a positive route/DOM witness");
});

test("all five direct-DOM probes fail closed on app runtime errors and prove semantic identity", () => {
  const entrySurface = fs.readFileSync("scripts/spec6-entry-surface-runtime.mjs", "utf8");
  assert.match(entrySurface, /collectAppConsoleErrors\(consoleErrors, baseUrl\)/);
  assert.match(entrySurface, /witness\.consoleErrors\s*=\s*consoleErrors/);
  assert.match(entrySurface, /requiredSelector/);

  for (const file of DIRECT_PROBES.slice(1)) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /assertNoRuntimeErrors\(/, `${file} must fail when its own page reports runtime errors`);
  }
  for (const file of DIRECT_PROBES) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /collectUniAppRuntimeIdentity\(/, `${file} must collect a module-backed runtime identity`);
    assert.match(source, /assertUniAppRuntimeIdentity\(/, `${file} must reject shallow semantic fixture HTML`);
    assert.match(source, /assertDirectPageCoverage\(/, `${file} must bind its assertion to the live address-bar route`);
  }

  const pageCheck = fs.readFileSync("scripts/page-check.mjs", "utf8");
  assert.match(pageCheck, /assertSemanticSelectors\(sels/);
});

test("module-backed runtime identity rejects shallow semantic fixture HTML", () => {
  assert.throws(() => assertUniAppRuntimeIdentity({
    marker: "NEXGRID_UNIAPP_RUNTIME_20260809_V1",
    sourceUrl: "http://fixture/app.js",
    sourceVerified: false,
    vueMounted: true,
    uniRuntime: true,
    pageStackRoute: "pages/index/index",
  }, "fixture"), /loaded application module/i);
  assert.doesNotThrow(() => assertUniAppRuntimeIdentity({
    marker: "NEXGRID_UNIAPP_RUNTIME_20260809_V1",
    sourceUrl: "http://candidate/src/main.ts",
    sourceVerified: true,
    vueMounted: true,
    uniRuntime: true,
    pageStackRoute: "pages/index/index",
  }, "candidate"));
});

test("the isolated H5 runtime gate executes all five direct-DOM probes", () => {
  const runtime = fs.readFileSync("scripts/verify-h5-runtime.mjs", "utf8");
  for (const file of DIRECT_PROBES) {
    assert.match(runtime, new RegExp(`runGate\\(\\"${file.replace("scripts/", "").replace(".", "\\.")}\\"`));
  }
});

test("runtime-error and semantic-selector helpers reject false-green witnesses", () => {
  assert.throws(() => assertNoRuntimeErrors(["fixture console error"], "fixture"), /runtime error/i);
  assert.doesNotThrow(() => assertNoRuntimeErrors([], "fixture"));
  for (const selectors of [[], ["#app"], ["body"], ["html"], ["*"]]) {
    assert.throws(() => assertSemanticSelectors(selectors, "fixture"), /semantic selector/i);
  }
  assert.doesNotThrow(() => assertSemanticSelectors([".entry-title"], "fixture"));
});

test("all three coverage probes are wired to fail-closed assertions", () => {
  const chrome = fs.readFileSync("scripts/chrome-baseline.mjs", "utf8");
  assert.match(chrome, /assertCaptureCoverage\(/);
  assert.match(chrome, /assertComparablePngCoverage\(/);

  const domQa = fs.readFileSync("scripts/dom-qa.mjs", "utf8");
  assert.match(domQa, /assertSweepCoverage\(\{ routes, completedRoutes, crashes, landings, witnesses, pageErrors \}\)/);
  assert.match(domQa, /if \(coverageFailed\)[\s\S]*?else if \(UPDATE\)/);

  const auth = fs.readFileSync("scripts/auth-guard-verify.mjs", "utf8");
  assert.match(auth, /assertAuthGuardRoutes\(result\)/);
  assert.match(auth, /page\.on\(["']pageerror["']/);
  assert.match(auth, /collectAppConsoleErrors/);
  assert.match(auth, /appChildren/);

  assert.doesNotMatch(domQa, /location\.hash\)\)\.replace\([^\n]+\|\|\s*route/);
});

test("capture coverage rejects empty, missing, or errored page captures", () => {
  const expected = ["home", "earn"];
  const covered = {
    home: { actualRoute: "/pages/index/index", appChildren: 1, iframeCount: 0, bodyElements: 2, bodyTextLength: 20, consoleErrors: [] },
    earn: { actualRoute: "/pages/earn/earn", appChildren: 1, iframeCount: 0, bodyElements: 2, bodyTextLength: 20, consoleErrors: [] },
  };
  const routes = { home: "/pages/index/index", earn: "/pages/earn/earn" };
  assert.throws(() => assertCaptureCoverage(expected, {}, []), /coverage/i);
  assert.throws(
    () => assertCaptureCoverage(expected, { home: covered.home, earn: { ...covered.earn, error: "connection refused" } }, ["home.png", "earn.png"], routes),
    /earn.*error/i,
  );
  assert.throws(
    () => assertCaptureCoverage(expected, covered, ["home.png"], routes),
    /earn\.png/i,
  );
  assert.throws(
    () => assertCaptureCoverage(expected, { ...covered, earn: { ...covered.earn, actualRoute: "/pages/onboarding/intro" } }, ["home.png", "earn.png"], routes),
    /earn.*route/i,
  );
  assert.throws(
    () => assertCaptureCoverage(expected, { ...covered, home: { ...covered.home, appChildren: 0, bodyTextLength: 0 } }, ["home.png", "earn.png"], routes),
    /home.*DOM|home.*document/i,
  );
  assert.throws(
    () => assertCaptureCoverage(expected, { ...covered, home: { ...covered.home, consoleErrors: ["render exploded"] } }, ["home.png", "earn.png"], routes),
    /home.*error/i,
  );
  assert.doesNotThrow(() => assertCaptureCoverage(expected, covered, ["home.png", "earn.png"], routes));
});

test("baseline comparison rejects zero images and missing counterparts", () => {
  assert.throws(() => assertComparablePngCoverage(["home.png"], [], []), /coverage/i);
  assert.throws(() => assertComparablePngCoverage(["home.png", "earn.png"], ["home.png", "earn.png"], ["home.png"]), /earn\.png/i);
  assert.doesNotThrow(() => assertComparablePngCoverage(["home.png"], ["home.png"], ["home.png"]));
});

test("DOM sweep coverage cannot enroll probe crashes or an empty route set", () => {
  assert.throws(() => assertSweepCoverage({ routes: [], completedRoutes: [], crashes: [] }), /route.*zero/i);
  assert.throws(
    () => assertSweepCoverage({ routes: ["pages/index/index"], completedRoutes: [], crashes: ["pages/index/index"] }),
    /crash/i,
  );
  assert.throws(
    () => assertSweepCoverage({ routes: ["a", "b"], completedRoutes: ["a"], crashes: [] }),
    /1\/2/i,
  );
  assert.throws(
    () => assertSweepCoverage({ routes: ["a"], completedRoutes: ["a"], crashes: [], landings: { a: "b" }, witnesses: { a: { appChildren: 1, iframeCount: 0, bodyElements: 2, bodyTextLength: 1 } }, pageErrors: {} }),
    /landed|route/i,
  );
  assert.throws(
    () => assertSweepCoverage({ routes: ["a"], completedRoutes: ["a"], crashes: [], landings: { a: "a" }, witnesses: { a: { appChildren: 0, bodyElements: 0 } }, pageErrors: {} }),
    /DOM|document/i,
  );
  assert.doesNotThrow(() => assertSweepCoverage({
    routes: ["a", "b"],
    completedRoutes: ["a", "b"],
    crashes: [],
    landings: { a: "a", b: "b" },
    witnesses: {
      a: { appChildren: 1, iframeCount: 0, bodyElements: 2, bodyTextLength: 1 },
      b: { appChildren: 1, iframeCount: 0, bodyElements: 2, bodyTextLength: 1 },
    },
    pageErrors: { a: [], b: [] },
  }));
});

test("auth guard probe asserts expected outcomes including traversal normalization", () => {
  const witness = (route) => ({
    actualRoute: route,
    appChildren: 1,
    iframeCount: 0,
    bodyElements: 2,
    bodyTextLength: 1,
    pageErrors: [],
    consoleErrors: [],
    toastText: "",
    retiredNoticeText: "",
  });
  const passing = {
    defaultAuthed_staysOnEarn: witness("/pages/earn/earn"),
    signedOut_redirectedFromEarn: witness("/pages/onboarding/intro"),
    unauthOnOnboarding_noLoop: witness("/pages/onboarding/intro"),
    traversalUnderWhitelist_redirected: witness("/pages/onboarding/intro"),
    defaultAuthed_traversalCanonicalized: witness("/pages/earn/earn"),
    retiredVerification_redirectedToSecurity: {
      ...witness("/pages/me/security?from=retired-flow"),
      toastText: "This flow has been retired.",
      retiredNoticeText: "This flow has been retired.",
    },
    sameDocumentTraversalCanonicalized: witness("/pages/earn/earn"),
    sameDocumentRetiredVerificationMigrated: {
      ...witness("/pages/me/security?from=retired-flow"),
      toastText: "This flow has been retired.",
      retiredNoticeText: "This flow has been retired.",
    },
    signedOutSameDocumentTraversalRedirected: witness("/pages/onboarding/intro"),
    signedOutSameDocumentRetiredRedirected: witness("/pages/onboarding/intro"),
    staticReviewSameDocumentTraversal1: witness("/pages/earn/earn"),
    staticReviewSameDocumentTraversal2: witness("/pages/earn/earn"),
    staticReviewSameDocumentTraversal3: witness("/pages/earn/earn"),
    excessiveEncodingFailsClosed: witness("/"),
    aboveRootTraversalFailsClosed: witness("/"),
  };
  assert.doesNotThrow(() => assertAuthGuardRoutes(passing));
  assert.throws(
    () => assertAuthGuardRoutes({ ...passing, signedOut_redirectedFromEarn: witness("/pages/earn/earn") }),
    /signedOut_redirectedFromEarn/,
  );
  assert.throws(
    () => assertAuthGuardRoutes({ ...passing, defaultAuthed_staysOnEarn: witness("/pages/earn/earn"), signedOut_redirectedFromEarn: { ...witness("/pages/onboarding/intro"), appChildren: 0, bodyTextLength: 0 } }),
    /signedOut_redirectedFromEarn.*DOM|signedOut_redirectedFromEarn.*document/i,
  );
  assert.throws(
    () => assertAuthGuardRoutes({ ...passing, traversalUnderWhitelist_redirected: { ...witness("/pages/onboarding/intro"), pageErrors: ["render exploded"] } }),
    /traversalUnderWhitelist_redirected.*error/i,
  );
});
