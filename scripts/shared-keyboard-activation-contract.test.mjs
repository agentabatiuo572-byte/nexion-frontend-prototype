import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../src/components/${file}`, import.meta.url), "utf8");

describe("shared keyboard activation guards", () => {
  it("ignores held-key repeats in the shared sub-page header", () => {
    const source = read("sub-page-header.vue");
    assert.match(source, /event\.repeat/);
    assert.match(source, /onKeyboardActivate\(\$event, goBack\)/);
    assert.match(source, /onKeyboardActivate\(\$event, goBell\)/);
  });

  it("prevents duplicate or disabled EmptyState CTA activation", () => {
    const source = read("empty-state.vue");
    assert.match(source, /ctaDisabled\?: boolean/);
    assert.match(source, /ctaBusy\?: boolean/);
    assert.match(source, /event\?\.repeat \|\| props\.ctaDisabled \|\| props\.ctaBusy/);
  });

  it("makes every trade-in sheet action keyboard reachable and suppresses held-key repeats", () => {
    const source = read("tradein-sheets.vue");
    assert.match(source, /function onKeyboardActivate\(event: KeyboardEvent/);
    assert.match(source, /if \(event\.repeat\) return/);
    assert.match(source, /class="tis-cta"[^>]*role="button"[^>]*@keydown\.enter\.prevent/);
    assert.match(source, /class="tis-warn-ghost"[^>]*role="button"[^>]*@keydown\.space\.prevent/);
    assert.match(source, /class="tis-ghost"[^>]*role="button"[^>]*@keydown\.enter\.prevent/);
    assert.match(source, /:aria-busy="confirming"/);
  });
});
