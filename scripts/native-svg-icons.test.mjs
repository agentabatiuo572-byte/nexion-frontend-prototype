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
    assert.equal((transformed.match(/<NxNativeSvg/g) ?? []).length, 6);

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
