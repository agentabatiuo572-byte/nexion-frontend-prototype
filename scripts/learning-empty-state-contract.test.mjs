import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the remote learning center renders an explicit empty state", () => {
  const source = readFileSync(new URL("../src/pages/learn/courses.vue", import.meta.url), "utf8");
  // The empty state sits inside the loaded-overview branch, so it reads overview directly.
  assert.match(source, /<EmptyState v-if="overview\.courses\.length === 0"/);
  assert.match(source, /<EmptyState/);
});
