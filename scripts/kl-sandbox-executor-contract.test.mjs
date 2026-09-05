import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("the formal App cannot compile a static-credential Janus Sandbox executor", () => {
  const serviceUrl = new URL("../src/services/janus-c2.ts", import.meta.url);
  const source = readFileSync(serviceUrl, "utf8");
  assert.equal(existsSync(new URL("../src/services/janus-sandbox-executor.ts", import.meta.url)), false);
  assert.doesNotMatch(source, /VITE_JANUS_(?:EXECUTOR_MODE|SANDBOX_(?:AUTHORIZATION|SUBJECTS|TARGETS|TOKEN))/);
  assert.doesNotMatch(source, /createJanusExecutor/);
  assert.doesNotMatch(source, /(?:start|stop|sync)JanusC2|runJanusC2|defaultCoordinator/);
  assert.match(source, /NX1\.0-Janus alone owns Sandbox enrollment[\s\S]*production native/);
});
