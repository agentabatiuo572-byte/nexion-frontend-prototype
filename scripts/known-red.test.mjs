#!/usr/bin/env node
/* 已知红清单红测(node --test;npm run test:verify-harness)。
 * 证明:① lint 对坏清单真会红(缺 why / 坏日期 / 超 90 天 / 重复);② 未到期 = KNOWN-RED,到期 = 回红;③ 前缀匹配只认前缀;
 *       ④ verify-chain 的判定接线:FAIL 步命中未到期条目 → 不进 verdict;到期 → 进 verdict。 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadKnownRed, stepKnownRed, cellKnownRed, lint, applyKnownRedToSteps, KNOWN_RED_PATH } from "./lib/known-red.mjs";

const dir = mkdtempSync(join(tmpdir(), "known-red-"));
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });
const file = (name, obj) => { const p = join(dir, name); writeFileSync(p, JSON.stringify(obj)); return p; };
const good = { steps: [{ step: "test:x", why: "环境缺件:需要 127.0.0.1:8110 服务", since: "2026-09-01", until: "2026-09-30" }], cells: [{ prefix: "SPEC-7 parity: admin main 活源缺失", why: "兄弟仓缺席时的跨仓半边,待改 SKIP", since: "2026-09-01", until: "2026-09-30" }] };

test("正常清单 lint PASS,条目可读", () => {
  const r = lint(file("good.json", good), "2026-09-02");
  assert.equal(r.ok, true); assert.equal(r.count, 2); assert.equal(r.expired.length, 0);
});
test("缺 why / why 太短 → lint FAIL", () => {
  const r = lint(file("nowhy.json", { steps: [{ step: "a", why: "短", since: "2026-09-01", until: "2026-09-30" }] }), "2026-09-02");
  assert.equal(r.ok, false); assert.match(r.problems.join("\n"), /why/);
});
test("坏日期 / until 早于 since / 超 90 天 → lint FAIL", () => {
  const bad = { steps: [
    { step: "a", why: "理由足够长足够长", since: "2026-13-01", until: "2026-09-30" },
    { step: "b", why: "理由足够长足够长", since: "2026-09-10", until: "2026-09-01" },
    { step: "c", why: "理由足够长足够长", since: "2026-01-01", until: "2026-12-31" },
  ] };
  const r = lint(file("dates.json", bad), "2026-09-02");
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /since 不是合法日期/); assert.match(r.problems.join("\n"), /until 必须晚于 since/); assert.match(r.problems.join("\n"), /90 天上限/);
});
test("重复 step → lint FAIL;非法 JSON → 不可用", () => {
  const r = lint(file("dup.json", { steps: [good.steps[0], good.steps[0]] }), "2026-09-02");
  assert.equal(r.ok, false); assert.match(r.problems.join("\n"), /重复/);
  const p = join(dir, "broken.json"); writeFileSync(p, "{ not json");
  assert.equal(loadKnownRed(p).problems.length, 1);
});
test("清单文件不存在 = 0 条,lint PASS(没有清单不是错,是没登记)", () => {
  const r = lint(join(dir, "nope.json"), "2026-09-02");
  assert.equal(r.ok, true); assert.equal(r.count, 0); assert.equal(r.missing, true);
});
test("未到期 → active;到期次日 → expired;lint 把到期条目点名但不判 FAIL", () => {
  const kr = loadKnownRed(file("good2.json", good));
  assert.equal(stepKnownRed("test:x", kr.steps, "2026-09-30").status, "active");
  assert.equal(stepKnownRed("test:x", kr.steps, "2026-10-01").status, "expired");
  assert.equal(stepKnownRed("test:y", kr.steps, "2026-09-02"), null);
  const r = lint(file("good3.json", good), "2026-10-05");
  assert.equal(r.ok, true); assert.equal(r.expired.length, 2);
});
test("格标题按固定前缀匹配:前缀命中 / 中间出现不算 / 大小写敏感", () => {
  const kr = loadKnownRed(file("good4.json", good));
  assert.ok(cellKnownRed("SPEC-7 parity: admin main 活源缺失(k-client:MISS h-client:MISS)at X", kr.cells, "2026-09-02"));
  assert.equal(cellKnownRed("xx SPEC-7 parity: admin main 活源缺失", kr.cells, "2026-09-02"), null);
  assert.equal(cellKnownRed("spec-7 parity: admin main 活源缺失", kr.cells, "2026-09-02"), null);
});
test("applyKnownRedToSteps:FAIL 命中未到期 → KNOWN-RED 不进 failed;到期 → 仍 FAIL 且带理由;PASS 不动", () => {
  const kr = loadKnownRed(file("good5.json", good));
  const results = [
    { step: "test:x", status: "FAIL", ms: 1 }, { step: "test:y", status: "FAIL", ms: 1 }, { step: "test:z", status: "PASS", ms: 1 },
  ];
  const a = applyKnownRedToSteps(results.map((r) => ({ ...r })), kr.steps, "2026-09-02");
  assert.deepEqual(a.map((r) => r.status), ["KNOWN-RED", "FAIL", "PASS"]);
  assert.match(a[0].reason, /已知红/);
  const b = applyKnownRedToSteps(results.map((r) => ({ ...r })), kr.steps, "2026-10-02");
  assert.deepEqual(b.map((r) => r.status), ["FAIL", "FAIL", "PASS"]);
  assert.match(b[0].reason, /已到期/);
});
test("CLI:lint 对本仓真实清单 PASS;cells 输出 TSV;check-step 认识清单里的步", () => {
  const cli = (...a) => spawnSync(process.execPath, ["scripts/lib/known-red.mjs", ...a], { cwd: join(KNOWN_RED_PATH, "..", ".."), encoding: "utf8" });
  const l = cli("lint"); assert.equal(l.status, 0, l.stderr); assert.match(l.stdout, /lint PASS/);
  const c = spawnSync(process.execPath, ["scripts/lib/known-red.mjs", "cells"], { cwd: join(KNOWN_RED_PATH, "..", ".."), encoding: "utf8", env: { ...process.env, KNOWN_RED_FILE: file("good6.json", good) } });
  assert.equal(c.status, 0); assert.match(c.stdout, /^SPEC-7 parity: admin main 活源缺失\t2026-09-30\t/);
  const s = spawnSync(process.execPath, ["scripts/lib/known-red.mjs", "check-step", "test:x"], { cwd: join(KNOWN_RED_PATH, "..", ".."), encoding: "utf8", env: { ...process.env, KNOWN_RED_FILE: file("good7.json", good), KNOWN_RED_TODAY: "2026-09-02" } });
  assert.match(s.stdout, /^active\t2026-09-30/);
});
