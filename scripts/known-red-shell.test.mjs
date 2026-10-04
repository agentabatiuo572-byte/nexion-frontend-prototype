#!/usr/bin/env node
/* verify.sh 侧已知红接线红测(node --test;npm run test:verify-harness)。
 * 从 verify.sh 正文抠出 known_red_match / ok / bad / skipped 四个函数,在 bash 里喂假 TSV 跑,证明:
 *   未到期前缀命中 → 打 KNOWN-RED、known+1、fail 不动;到期 → FAIL、fail+1;不命中 → FAIL;TSV 缺失 → 一律 FAIL(不会静默变绿)。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync, spawn } from "node:child_process";
import { findBash } from "./lib/find-bash.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sh = readFileSync(join(ROOT, "scripts", "verify.sh"), "utf8");
const grab = (startRe, endRe) => { const s = sh.search(startRe); assert.ok(s >= 0, `verify.sh 里找不到 ${startRe}`); const e = sh.slice(s).search(endRe); return sh.slice(s, s + e); };
const fnMatch = grab(/^known_red_match\(\) \{/m, /\n\}\n/) + "\n}\n";
const fnBad = grab(/^bad\(\)  \{/m, /\n\}\n/) + "\n}\n";
const dir = mkdtempSync(join(tmpdir(), "known-red-sh-")).replace(/\\/g, "/");
process.on("exit", () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });
const bash = findBash();
const run = (tsvLines, titles) => {
  const tsv = `${dir}/kr.tsv`; writeFileSync(tsv, tsvLines.join("\n") + (tsvLines.length ? "\n" : ""));
  const script = [
    "G=''; R=''; Y=''; N=''; pass=0; fail=0; skip=0; retried=0; known=0; PROBE_RETRIED_LAST=0",
    `KNOWN_RED_TSV="${tsv}"`, fnMatch, fnBad,
    ...titles.map((t) => `bad ${JSON.stringify(t)}`),
    'echo "COUNTS fail=$fail known=$known"',
  ].join("\n");
  const r = spawnSync(bash, ["-c", script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};
const T = (prefix, until, why, status) => [prefix, until, why, status].join("\t");

test("未到期前缀命中 → KNOWN-RED,known+1,fail 不动", () => {
  const out = run([T("SPEC-7 parity: admin main 活源缺失", "2026-10-01", "兄弟仓缺席", "active")], ["SPEC-7 parity: admin main 活源缺失(k-client:MISS)at X"]);
  assert.match(out, /KNOWN-RED  SPEC-7 parity: admin main 活源缺失/); assert.match(out, /到期 2026-10-01:兄弟仓缺席/); assert.match(out, /COUNTS fail=0 known=1/);
});
test("到期条目 → FAIL 且写明已到期,fail+1", () => {
  const out = run([T("SPEC-7 parity: admin main 活源缺失", "2026-08-01", "兄弟仓缺席", "expired")], ["SPEC-7 parity: admin main 活源缺失(k-client:MISS)"]);
  assert.match(out, /FAIL  SPEC-7 parity/); assert.match(out, /已知红已到期 2026-08-01/); assert.match(out, /COUNTS fail=1 known=0/);
});
test("不命中(前缀不同 / 只在中间出现)→ 普通 FAIL", () => {
  const out = run([T("SPEC-7 parity: admin main 活源缺失", "2026-10-01", "x y z", "active")], ["xx SPEC-7 parity: admin main 活源缺失", "别的门红了"]);
  assert.match(out, /COUNTS fail=2 known=0/); assert.doesNotMatch(out, /KNOWN-RED/);
});
test("TSV 为空(清单缺失 / 取不到)→ 一律 FAIL,不会静默变绿", () => {
  const out = run([], ["随便哪个门红了"]);
  assert.match(out, /FAIL  随便哪个门红了/); assert.match(out, /COUNTS fail=1 known=0/);
});
test("多条命中各自计数;标题里有 % 和引号也不炸 printf", () => {
  const out = run([T("A 门", "2026-10-01", "a", "active"), T("B 门", "2026-10-01", "b", "active")], ["A 门 100% 'q'", "B 门", "C 门"]);
  assert.match(out, /COUNTS fail=1 known=2/); assert.match(out, /KNOWN-RED  A 门 100% 'q'/);
});

test("并行 Bash 验证日志隔离，含空格的 TMPDIR 和子 shell 读回", { timeout: 15000 }, async () => {
  const prefix = sh.match(/^VERIFY_LOG_PREFIX=.*$/m)?.[0];
  const logPath = sh.match(/"\$\{VERIFY_LOG_PREFIX\}-uni-scope-lint\.log"/)?.[0];
  assert.ok(prefix && logPath, "must use the actual verifier log namespace");
  assert.equal((sh.match(/\/tmp\//g) || []).length, 0, "no shared hardcoded logs may remain");
  const logDir = join(dir, "parallel logs");
  mkdirSync(logDir);
  const children = [];
  const launch = (label) => {
    let ready;
    const readyPromise = new Promise((resolve) => { ready = resolve; });
    const child = spawn(bash, ["-c", [prefix, `log=${logPath}`,
      'printf "%s" "$0" > "$log"', 'printf "READY:%s\\n" "$log"',
      'read -r proceed', 'printf "RESULT:%s\\n" "$(cat "$log")"',
    ].join("\n"), label], { env: { ...process.env, TMPDIR: logDir.replace(/\\/g, "/") }, timeout: 10000 });
    children.push(child);
    let output = "", errors = "";
    child.stdout.on("data", (data) => { output += data; if (output.includes("\n")) ready(); });
    child.stderr.on("data", (data) => { errors += data; });
    const done = new Promise((resolve, reject) => {
      child.on("error", (error) => { ready(); reject(error); });
      child.on("close", (code) => { ready(); resolve({ code, output, errors }); });
    });
    return { child, readyPromise, done };
  };
  try {
    const runs = [launch("first"), launch("second")];
    await Promise.all(runs.map((run) => run.readyPromise));
    // Both writers have completed before either is allowed to read.
    for (const run of runs) run.child.stdin.end("continue\n");
    const results = await Promise.all(runs.map((run) => run.done));
    results.forEach((result) => assert.equal(result.code, 0, result.errors));
    assert.match(results[0].output, /RESULT:first\r?\n/);
    assert.match(results[1].output, /RESULT:second\r?\n/);
    assert.notEqual(results[0].output.split("\n")[0], results[1].output.split("\n")[0]);
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
  }
});
