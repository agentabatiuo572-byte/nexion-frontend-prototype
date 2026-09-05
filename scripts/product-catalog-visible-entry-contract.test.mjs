import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("server catalog loading, failure, and empty states stay visible instead of rendering a blank purchase area", () => {
  const page = read("src/pages/store/store.vue");

  assert.match(page, /productCatalogState/);
  assert.match(page, /data-testid="store-catalog-loading"/);
  assert.match(page, /data-testid="store-catalog-error"/);
  assert.match(page, /data-testid="store-catalog-empty"/);
  assert.match(page, /return status === "ready" && PRODUCTS\.length > 0/);
});

test("remote catalog replacement invalidates Store computed listings", () => {
  const page = read("src/pages/store/store.vue");

  assert.match(page, /productCatalogState\.status/);
  assert.match(page, /PRODUCTS\.filter/);
});

test("app launch does not consume the authenticated catalog before a user session exists", () => {
  const app = read("src/App.vue");

  assert.doesNotMatch(app, /prepareProductCatalog\(\);\s*void refreshProductCatalog\(\)/);
});
