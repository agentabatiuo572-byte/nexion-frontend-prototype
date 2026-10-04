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
  assert.match(page, /const catalogHasProducts = computed\(\(\) => displayProducts\.value\.length > 0\)/);
  assert.match(page, /catalogStatus === 'loading' && !catalogHasProducts/);
  assert.match(page, /catalogStatus === 'error' && !catalogHasProducts/);
  assert.match(page, /v-if="catalogHasProducts"/);
});

test("remote catalog replacement invalidates Store computed listings", () => {
  const page = read("src/pages/store/store.vue");

  assert.match(page, /productCatalogState\.status/);
  assert.match(page, /displayProducts\.value\.filter/);
  assert.match(page, /remoteApiEnabled \? productCatalogPresentation\.value : null/);
  const store = read("src/store/product-catalog.ts");
  assert.match(store, /presentation\.value = \{/);
  assert.match(store, /name: nexGridBrandText\(product\.name\)/);
  assert.match(store, /presentation\.value = null/);
  const card = read("src/components/store/product-card.vue");
  assert.match(card, /const buyUnavailable = computed\(\(\) => stockUnavailable\.value \|\| catalogUnavailable\.value/);
  assert.match(card, /function onBuy\(\) \{\s*if \(buyUnavailable\.value\) return/);
});

test("app launch does not consume the authenticated catalog before a user session exists", () => {
  const app = read("src/App.vue");

  assert.doesNotMatch(app, /prepareProductCatalog\(\);\s*void refreshProductCatalog\(\)/);
});
