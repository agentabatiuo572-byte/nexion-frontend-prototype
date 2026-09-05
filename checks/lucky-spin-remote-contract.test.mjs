import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");

test("events api exposes server wheel state and command", () => {
  const source = read("src/api/events-api.ts");
  assert.match(source, /spinState\(eventCode: string\)/);
  assert.match(source, /\/api\/events\/\$\{code\(eventCode\)\}\/spin\/state/);
  assert.match(source, /\/api\/events\/\$\{code\(eventCode\)\}\/spin/);
});

test("remote wheel path cannot roll or credit locally", () => {
  const store = read("src/store/lucky-spin.ts");
  const sheet = read("src/components/lucky-spin-sheet.vue");
  assert.match(store, /remoteApiEnabled/);
  assert.match(store, /eventsApi\.state\(\)/);
  assert.match(store, /eventsApi\.spinState/);
  assert.match(store, /eventsApi\.spin/);
  assert.match(sheet, /remoteApiEnabled/);
  assert.doesNotMatch(sheet, /if\s*\(remoteApiEnabled\)[\s\S]{0,120}creditPrize/);
  assert.match(sheet, /if\s*\(!remoteApiEnabled\s*&&\s*Math\.random\(\)/);
});

test("account rebinding clears the authoritative remote wheel snapshot", () => {
  const store = read("src/store/lucky-spin.ts");
  assert.match(
    store,
    /function bindAccount\(rawAccountKey: string\)\s*\{[\s\S]*?remoteGeneration \+= 1;[\s\S]*?remoteState\.value = null;[\s\S]*?remoteSegments\.value = \[\];[\s\S]*?remoteHistory\.value = \[\];/
  );
});

test("late remote state responses are discarded after an account switch", () => {
  const store = read("src/store/lucky-spin.ts");
  assert.match(store, /const generation = remoteGeneration;/);
  assert.match(store, /await eventsApi\.spinState\(eventCode\);\s*if \(generation !== remoteGeneration\) return false;/);
});

test("late remote spin responses cannot mutate the new account", () => {
  const store = read("src/store/lucky-spin.ts");
  assert.match(store, /const generation = remoteGeneration;[\s\S]*?await eventsApi\.spin\(eventCode, idempotencyKey\);/);
  assert.match(store, /if \(generation !== remoteGeneration\) return \{ ok: false, prizeId: null, stale: true \};/);
});

test("the wheel sheet drops stale spin outcomes before settle or success toast", () => {
  const sheet = read("src/components/lucky-spin-sheet.vue");
  assert.match(sheet, /let accountGeneration = 0;/);
  assert.match(sheet, /function settleSpin\(expectedGeneration = accountGeneration\)/);
  assert.match(sheet, /if \(expectedGeneration !== accountGeneration\) return;/);
  assert.match(sheet, /const generation = accountGeneration;[\s\S]*?await spin\.spinRemote\("evt-spring-spin", key\);[\s\S]*?if \(generation !== accountGeneration\) return;/);
  assert.match(sheet, /if \(result\.stale\) return;/);
});

test("remote wheel hides mock winner counts and uses the server reset timestamp", () => {
  const sheet = read("src/components/lucky-spin-sheet.vue");
  const store = read("src/store/lucky-spin.ts");
  assert.match(sheet, /v-if="!remoteApiEnabled" class="lss-social"/);
  assert.match(sheet, /spin\.nextResetAtUtc\(\)/);
  assert.match(store, /nextResetAtUtc: next\.nextResetAtUtc/);
});
