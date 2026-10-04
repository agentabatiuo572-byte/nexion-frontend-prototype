import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the remote learning center renders an explicit empty state", () => {
  const source = readFileSync(new URL("../src/pages/learn/courses.vue", import.meta.url), "utf8");
  assert.match(source, /overview\?\.courses\.length === 0/);
  assert.match(source, /<EmptyState/);
});
