import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("remote runtime never hydrates or writes the local product phase override", () => {
  const source = read("src/store/product-phase.ts");
  assert.match(source, /if \(IS_PRODUCTION \|\| remoteApiEnabled\) return null;/);
  assert.match(source, /if \(IS_PRODUCTION \|\| remoteApiEnabled\) return;/);
});

test("locked product card keeps local progress and queue proof mock-only", () => {
  const source = read("src/components/store/locked-product-card.vue");
  assert.match(source, /props\.product\.available === undefined[\s\S]*?PHASE_TO_PROGRESS/);
  assert.match(source, /props\.product\.available === undefined[\s\S]*?PHASE_TO_QUEUE/);
});
