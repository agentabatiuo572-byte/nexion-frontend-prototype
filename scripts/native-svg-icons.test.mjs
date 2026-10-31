import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { nativeSvgIcons } from "./native-svg-icons.mjs";

test("native build converts tab and wallet icons while leaving large illustrations alone", () => {
  const previous = process.env.UNI_PLATFORM;
  process.env.UNI_PLATFORM = "app";
  try {
    const plugin = nativeSvgIcons();
    const tab = readFileSync(new URL("../src/components/app-chassis.vue", import.meta.url), "utf8");
    const transformed = plugin.transform(tab, "app-chassis.vue")?.code;
    assert.ok(transformed);
    assert.match(transformed, /<NxNativeSvg[^>]*\bwidth="22" height="22"/);
    assert.match(transformed, /<path :d="tab\.icon"\s*\/>/);
    // Includes both scanner header variants added to the chassis.
    assert.equal((transformed.match(/<NxNativeSvg/g) ?? []).length, 8);

    const mixed = '<template><svg width="24" height="24"><path d="M1" /></svg><svg width="248" height="248"><path d="M2" /></svg></template>';
    assert.equal(plugin.transform(mixed, "test.vue")?.code,
      '<template><NxNativeSvg width="24" height="24"><path d="M1" /></NxNativeSvg><svg width="248" height="248"><path d="M2" /></svg></template>');
    process.env.UNI_PLATFORM = "h5";
    assert.equal(plugin.transform(tab, "app-chassis.vue"), null);
  } finally {
    if (previous === undefined) delete process.env.UNI_PLATFORM;
    else process.env.UNI_PLATFORM = previous;
  }
});

test("native checkout completion check uses the supported view SVG bridge", () => {
  const previous = process.env.UNI_PLATFORM;
  process.env.UNI_PLATFORM = "app";
  try {
    const source = readFileSync(new URL("../src/components/checkout/CheckoutResult.vue", import.meta.url), "utf8");
    const transformed = nativeSvgIcons().transform(source, "CheckoutResult.vue")?.code ?? source;
    const badge = transformed.match(/class="checkout-result__check"[\s\S]*?<\/view>/)?.[0];
    assert.ok(badge, "production result completion badge must exist");
    assert.match(badge, /<NxNativeSvg width="24" height="24"/);
    assert.match(badge, /<path d="m5 12 4 4L19 6"\s*\/>/);
    assert.doesNotMatch(badge, /<svg\b/);
  } finally {
    if (previous === undefined) delete process.env.UNI_PLATFORM;
    else process.env.UNI_PLATFORM = previous;
  }
});
