import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { directAppUrl } from "./lib/direct-app-url.mjs";
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
    excessiveEncodingFailsClosed: witness("/pages/onboarding/intro"),
    aboveRootTraversalFailsClosed: witness("/pages/onboarding/intro"),
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
