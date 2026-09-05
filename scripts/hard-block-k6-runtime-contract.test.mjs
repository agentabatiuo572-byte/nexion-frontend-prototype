import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");

test("K6 never treats launcher acceptance as verified handoff", () => {
  const runtime = read("src/services/janus-runtime.ts");
  assert.match(runtime, /JANUS_HANDOFF_PROOF_UNAVAILABLE/);
  assert.match(runtime, /if \(!evidence\?\.handoffReceipt\?\.trim\(\)\)/);
  assert.match(runtime, /JANUS_STALE_COMMAND_REJECTED/);
  assert.match(runtime, /JANUS_COMMAND_VERSION_COLLISION/);
  assert.match(runtime, /uni\.setStorageSync\(JANUS_RUNTIME_KEY, next\)/);
});

test("K6 success traverses every handoff phase with exact target evidence", () => {
  const coordinator = read("src/services/janus-c2.ts");
  for (const phase of ["HANDOFF_FETCHING", "HANDOFF_MERGING", "HANDOFF_ACKED", "SUCCEEDED"]) {
    assert.match(coordinator, new RegExp(`phase: "${phase}"`));
  }
  for (const field of ["actualTargetVersion", "actualTargetCatalogVersion", "deviceAppliedVersion", "handoffReceipt"]) {
    assert.match(coordinator, new RegExp(field));
  }
  assert.match(coordinator, /if \(applied\.commandVersion !== command\.commandVersion[\s\S]*\) return;/);
  assert.doesNotMatch(coordinator,
    /phase: "SUCCEEDED"[\s\S]{0,600}actualTargetId: applied\.remoteUrlKey \|\| "none"/,
    "a verified handoff must not invent target evidence; the legacy non-handoff ACK may still encode RESET as none");
});
