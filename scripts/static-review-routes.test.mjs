import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

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
  assert.match(app, /uni\.reLaunch\(\{\s*url:\s*canonicalUrl/);
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
