import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const detail = fs.readFileSync(new URL("../src/pages/store/detail.vue", import.meta.url), "utf8");
const checkout = fs.readFileSync(new URL("../src/pages/store/checkout.vue", import.meta.url), "utf8");
const bundle = fs.readFileSync(new URL("../src/pages/store/bundle.vue", import.meta.url), "utf8");

test("remote product detail resolves the canonical catalog before looking up a deep-linked SKU", () => {
  assert.match(detail, /onLoad\(async \(options\) => \{[\s\S]*refreshProductCatalog\(true\)/);
  assert.match(detail, /catalogStatus === 'loading'/);
  assert.match(detail, /catalogStatus === 'error'/);
});

test("remote checkout resolves the canonical catalog before evaluating purchase gates", () => {
  assert.match(checkout, /onLoad\(async \(options\) => \{[\s\S]*refreshProductCatalog\(true\)[\s\S]*if \(!catalogReady\) return;[\s\S]*const pp = getProduct/);
  assert.match(checkout, /catalogStatus === 'loading'/);
  assert.match(checkout, /catalogStatus === 'error'/);
});

test("bundle refreshes the canonical catalog on cold load and account return", () => {
  assert.match(bundle, /onLoad\(async \(\) => \{[\s\S]*refreshProductCatalog\(true\)/);
  assert.match(bundle, /onShow\(\(\) => \{[\s\S]*refreshProductCatalog\(true\)/);
});

test("bundle drops persisted products that the server no longer releases", () => {
  assert.match(bundle, /cart\.items[\s\S]*getProduct\(id\)[\s\S]*isProductAvailable\(p, phase\.value\)/);
});
