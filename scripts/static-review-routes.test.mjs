import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const navigationAllowlist = new Set([
  "src/lib/route.ts",
  // Search owns a richer inline failure state with an explicit retry action.
  "src/pages/search/search.vue",
]);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(?:ts|vue)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [file] : [];
  });
}

function usesRawNavigateTo(source, fileName = "source.ts") {
  const scriptSource = fileName.endsWith(".vue")
    ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join("\n")
    : source;
  const parsed = ts.createSourceFile(fileName, scriptSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;
  function visit(node) {
    // Forbid the raw API symbol regardless of receiver/alias shape. This also
    // catches globalThis.uni, optional chains, destructuring and comment gaps.
    if (ts.isIdentifier(node) && node.text === "navigateTo") {
      found = true;
      return;
    }
    if (
      ts.isElementAccessExpression(node)
      && ts.isStringLiteralLike(node.argumentExpression)
      && node.argumentExpression.text === "navigateTo"
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return found;
}

const source = fs.readFileSync("src/lib/static-review-routes.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const commonJs = { exports: {} };
new Function("exports", "module", compiled)(commonJs.exports, commonJs);
const { canonicalH5RouteUrl, isStaticReviewRoute, normalizeRoute, routeFromH5Location } = commonJs.exports;

test("normal routes keep page-stack shape", () => {
  assert.equal(normalizeRoute("#/pages/entry-surfaces/index?entry=store"), "pages/entry-surfaces/index");
  assert.equal(normalizeRoute("/pages/me/me"), "pages/me/me");
  assert.equal(normalizeRoute("pages/team/rank"), "pages/team/rank");
});

test("dot segments are collapsed before whitelist checks", () => {
  assert.equal(normalizeRoute("#/pages/onboarding/../earn/earn"), "pages/earn/earn");
  assert.equal(normalizeRoute("#/pages/entry-surfaces/../earn/earn"), "pages/earn/earn");
  assert.equal(normalizeRoute("#/pages/entry-surfaces/%2e%2e/earn/earn"), "pages/earn/earn");
  assert.equal(normalizeRoute("#/pages/entry-surfaces/%252e%252e/earn/earn"), "pages/earn/earn");
  assert.equal(normalizeRoute("#/pages/entry-surfaces/%2525252e%2525252e/earn/earn"), "pages/earn/earn");
  assert.equal(normalizeRoute("#/pages/entry-surfaces\\..\\earn\\earn"), "pages/earn/earn");
  assert.equal(isStaticReviewRoute("#/pages/entry-surfaces/../earn/earn"), false);
});

test("H5 dot-segment hashes produce one canonical reLaunch target", () => {
  assert.equal(
    canonicalH5RouteUrl("#/pages/entry-surfaces/../earn/earn?source=guard"),
    "/pages/earn/earn?source=guard",
  );
  assert.equal(canonicalH5RouteUrl("#/pages/earn/earn"), "/pages/earn/earn");
  assert.equal(canonicalH5RouteUrl("#/../../pages/earn/earn"), "");
});

test("same-document H5 hash changes override a stale UniApp page stack", () => {
  assert.equal(routeFromH5Location("pages/me/me", "#/pages/me/kyc"), "pages/me/kyc");
  assert.equal(
    routeFromH5Location("pages/me/me", "#/pages/entry-surfaces/../earn/earn"),
    "pages/earn/earn",
  );
  assert.equal(routeFromH5Location("pages/me/me", "#/../../pages/earn/earn"), "");
  assert.equal(routeFromH5Location("pages/me/me", "#/"), "pages/me/me");
});

test("App repairs non-canonical H5 hashes instead of leaving an authenticated white screen", () => {
  const app = fs.readFileSync("src/App.vue", "utf8");
  assert.match(app, /canonicalH5RouteUrl\(/);
  assert.match(app, /routeFromH5Location\(/);
  assert.match(app, /pendingCanonicalRouteRepair/);
  assert.match(app, /navReset\(\{\s*url:\s*canonicalUrl/);
  assert.match(app, /ROUTE_REPAIR_RETRY_MS/);
  assert.match(app, /pendingCanonicalRouteRepairAt/);
  assert.match(app, /canonicalH5RouteUrl\(hashRoute\)\s*\|\|\s*INVALID_H5_ROUTE_FALLBACK/);
});

test("malformed or above-root paths fail closed", () => {
  assert.equal(normalizeRoute("#/../../pages/entry-surfaces/index"), "");
  assert.equal(normalizeRoute("#/pages/entry-surfaces/%E0%A4%A"), "");
  const excessiveEncoding = `%${"25".repeat(17)}2e`;
  assert.equal(normalizeRoute(`#/pages/entry-surfaces/${excessiveEncoding}${excessiveEncoding}/earn/earn`), "");
  assert.equal(isStaticReviewRoute("#/../../pages/entry-surfaces/index"), false);
  assert.equal(isStaticReviewRoute("#/pages/entry-surfaces/%E0%A4%A"), false);
});

test("exactly sixteen encoding layers are accepted while deeper input fails closed", () => {
  const encodedDotPair = (layers) => {
    const dot = `%${"25".repeat(layers - 1)}2e`;
    return `${dot}${dot}`;
  };
  assert.equal(
    normalizeRoute(`#/pages/entry-surfaces/${encodedDotPair(16)}/earn/earn`),
    "pages/earn/earn",
  );
  assert.equal(
    normalizeRoute(`#/pages/entry-surfaces/${encodedDotPair(17)}/earn/earn`),
    "",
  );
});

test("real static review routes remain whitelisted", () => {
  assert.equal(isStaticReviewRoute("#/pages/entry-surfaces/index"), true);
  assert.equal(isStaticReviewRoute("pages/entry-surfaces/white?entry=white-app"), true);
});

test("page navigation is routed through the shared failure-handling helper", () => {
  const offenders = sourceFiles("src")
    .filter((file) => !navigationAllowlist.has(file))
    .filter((file) => usesRawNavigateTo(fs.readFileSync(file, "utf8"), file));

  assert.deepEqual(offenders, []);
});

test("raw-navigation gate catches whitespace and bracket notation", () => {
  assert.equal(usesRawNavigateTo("uni . navigateTo({ url })"), true);
  assert.equal(usesRawNavigateTo("uni['navigateTo']({ url })"), true);
  assert.equal(usesRawNavigateTo("uni?.navigateTo({ url })"), true);
  assert.equal(usesRawNavigateTo("uni?.['navigateTo']({ url })"), true);
  assert.equal(usesRawNavigateTo("uni/* gap */.navigateTo({ url })"), true);
  assert.equal(usesRawNavigateTo("uni./* gap */navigateTo({ url })"), true);
  assert.equal(usesRawNavigateTo("globalThis.uni.navigateTo({ url })"), true);
  assert.equal(usesRawNavigateTo("globalThis.uni['navigateTo']({ url })"), true);
  assert.equal(usesRawNavigateTo("const { navigateTo } = uni; navigateTo({ url })"), true);
  assert.equal(usesRawNavigateTo("navTo(url)"), false);
});

test("search keeps its richer raw-navigation failure visible, retryable, and ordered", () => {
  const searchPage = fs.readFileSync("src/pages/search/search.vue", "utf8");
  assert.match(searchPage, /import \{ beginNavigationAttempt, completeNavigationAttempt \} from "@\/lib\/navigation-attempt"/);
  assert.match(searchPage, /const navigationState = ref\(\{ attempt: 0, pendingUrl: "", hasError: false \}\)/);
  assert.match(searchPage, /const navigationError = computed\(\(\) => navigationState\.value\.hasError\)/);
  assert.match(searchPage, /const started = beginNavigationAttempt\(navigationState\.value, url\);\s*navigationState\.value = started;/);
  assert.match(searchPage, /success:\s*\(\)\s*=>\s*\{\s*navigationState\.value = completeNavigationAttempt\(navigationState\.value, started\.attempt, "success"\);\s*\}/);
  assert.match(searchPage, /fail:\s*\(\)\s*=>\s*\{\s*navigationState\.value = completeNavigationAttempt\(navigationState\.value, started\.attempt, "failure"\);\s*\}/);
  assert.match(searchPage, /if \(pendingNavigationUrl\.value\) navigateWithFeedback\(pendingNavigationUrl\.value\)/);
  assert.match(searchPage, /v-if="navigationError"/);
  assert.match(searchPage, /retryNavigation/);
});
