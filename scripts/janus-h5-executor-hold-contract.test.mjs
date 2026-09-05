import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const coordinator = readFileSync(new URL("../src/services/janus-c2.ts", import.meta.url), "utf8");

test("the formal App is held on every platform and has no Janus execution lifecycle", () => {
  assert.match(coordinator, /export type JanusSyncAvailability[\s\S]*HOLD/);
  assert.match(coordinator, /JANUS_NATIVE_EXECUTOR_REQUIRED/);
  assert.match(coordinator, /function janusSyncAvailability\(\): JanusSyncAvailability/);
  assert.match(coordinator, /function janusSyncAvailability\(\): JanusSyncAvailability \{[\s\S]*return \{ state: "HOLD", code: "JANUS_NATIVE_EXECUTOR_REQUIRED" \};[\s\S]*\}/);
  assert.doesNotMatch(coordinator, /uniPlatform|state: "READY"/);
  assert.doesNotMatch(coordinator, /(?:start|stop|sync)JanusC2|runJanusC2|defaultCoordinator/);
  assert.match(coordinator, /export function currentJanusSyncAvailability\(\): JanusSyncAvailability/);
});
