import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../src/pages/compute-share/download.vue", import.meta.url), "utf8");

test("remote compute share creates a server pairing enrollment instead of a local device", () => {
  assert.match(page, /computeShareApi\.create/);
  assert.match(page, /remoteApiEnabled/);
  assert.match(page, /status\s*===\s*["']CONNECTED["']/);
  assert.doesNotMatch(page, /if\s*\(remoteApiEnabled\)[\s\S]{0,500}connectComputeShareDevice/);
});
