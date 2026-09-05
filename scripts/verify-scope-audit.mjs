#!/usr/bin/env node
// 范围化的「元门」(包 ar,2026-08-17;提案 §3.2-7,业界对照 Azure TIA 自检法):
//   node scripts/verify-scope-audit.mjs            # 轻:manifest ↔ verify.sh 接线 lint(与 verify.sh 里那格同源)
//   node scripts/verify-scope-audit.mjs --deep     # 重:同一棵树先跑 scoped 再跑 full,比对失败集
//
// --deep 判据(任一不满足即红):
//   ① full 里 FAIL 的门 / 步骤,若在 scoped 里被 SCOPED-SKIP → 映射表漏配(该门的输入声明不完整,或它本来就该 always);
//   ② scoped 里 FAIL 而 full 里 PASS 的门 → 抖动或环境差(不是映射问题,但要点名);
//   ③ scoped 与 full 的 verify.sh 总格数(ran + scoped_skip)必须相等 —— 少了就是有门在 scoped 路径上根本没被点名。
//      (包 ax:多格门跳过时 scoped_skip 按 manifest `cells` 计;首跑抓出 7 格差 = theme/dom-qa/tap/orphan 各 2 格、spec7 3 格、spec4 2 格,已声明。)
// 何时跑:改 gates.manifest.json / 给 verify.sh 加减 scope_hit 之后必跑一次;平时按需(两遍很贵)。
// 结果落 .verify-cache/scope-audit.json;退出码 0/1。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, CACHE_DIR, LAST_RUN_PATH, lint, treeFingerprint } from "./lib/verify-scope.mjs";

const deep = process.argv.includes("--deep");
const problems = lint();
if (problems.length) { console.error("接线 lint FAIL:\n  - " + problems.join("\n  - ")); process.exit(1); }
console.log("接线 lint PASS");
if (!deep) process.exit(0);

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
function runMode(mode) {
  const fpBefore = treeFingerprint();
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "verify-chain.mjs"), `--${mode}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
  const rec = JSON.parse(fs.readFileSync(LAST_RUN_PATH, "utf8"));
  const legacyLog = path.join(CACHE_DIR, "logs", "test_legacy-suite.log");
  const lines = fs.existsSync(legacyLog) ? strip(fs.readFileSync(legacyLog, "utf8")).split(/\r?\n/) : [];
  const gateFails = lines.filter((l) => /^\s{2}FAIL\s/.test(l)).map((l) => l.trim().slice(5).trim());
  const gateSkips = lines.filter((l) => /^\s{2}SCOPED-SKIP\s/.test(l)).map((l) => l.trim().replace(/^SCOPED-SKIP\s+/, "").replace(/(.*?)\(.*$/, "$1").trim());
  const tally = (lines.find((l) => /^pass=\d+ fail=\d+ skip=\d+/.test(l)) || fs.readFileSync(path.join(ROOT, ".verify-exit.code"), "utf8").split(/\r?\n/)[1] || "");
  const m = tally.match(/pass=(\d+) fail=(\d+) skip=(\d+)(?: mode=\w+ scoped_skip=(\d+))?/);
  const fpAfter = treeFingerprint();
  return {
    mode, exit: r.status, rec, gateFails, gateSkips,
    ran: m ? +m[1] + +m[2] : null, scopedSkip: m && m[4] ? +m[4] : 0,
    stepFails: rec.steps.filter((s) => s.status === "FAIL" || s.status === "NOT-RUN").map((s) => s.step),
    stepSkips: rec.steps.filter((s) => s.status === "SCOPED-SKIP").map((s) => s.step),
    treeMoved: fpBefore && fpAfter && fpBefore.fingerprint !== fpAfter.fingerprint,
  };
}
console.log("deep:先跑 scoped …");
const S = runMode("scoped");
console.log(`  scoped:exit ${S.exit} · steps FAIL ${S.stepFails.length} · steps SCOPED-SKIP ${S.stepSkips.length} · gates FAIL ${S.gateFails.length} · gates SCOPED-SKIP ${S.gateSkips.length}`);
console.log("deep:再跑 full …");
const F = runMode("full");
console.log(`  full:exit ${F.exit} · steps FAIL ${F.stepFails.length} · gates FAIL ${F.gateFails.length}`);

const findings = [];
if (S.treeMoved || F.treeMoved) findings.push("跑的过程中工作树变了 —— 本次比对无效,静机重跑");
// ① full 红 & scoped 跳过 → 漏配。门以 verify.sh 里的 FAIL 行文本对应,步骤以 step 名对应
for (const st of F.stepFails) if (S.stepSkips.includes(st)) findings.push(`步骤「${st}」full 红、scoped 却 SCOPED-SKIP → manifest.steps 输入声明不完整`);
if (S.rec.mode === "scoped") {
  // gate 级:scoped 跳过的门 id 与 full 里 FAIL 的行做「id 是否被那条 FAIL 行的门包含」的近似匹配(FAIL 行文本里通常含门名或脚本名)
  for (const id of S.gateSkips) {
    const hit = F.gateFails.filter((l) => l.toLowerCase().includes(id.replace(/-runtime$|-redtest$/, "").toLowerCase().split("-")[0]));
    if (hit.length) findings.push(`门「${id}」scoped 被跳过,而 full 有相关 FAIL:${hit[0].slice(0, 100)} → 检查该门 inputs 是否漏了改动文件`);
  }
}
// ② scoped 红 & full 绿 → 抖动/环境
for (const st of S.stepFails) if (!F.stepFails.includes(st)) findings.push(`步骤「${st}」scoped 红、full 绿 → 抖动或环境差(非映射问题,但要追)`);
for (const g of S.gateFails) if (!F.gateFails.includes(g)) findings.push(`门「${g.slice(0, 80)}」scoped 红、full 绿 → 抖动或环境差`);
// ③ 总格数守恒
if (S.ran !== null && F.ran !== null && S.ran + S.scopedSkip !== F.ran + F.scopedSkip) findings.push(`verify.sh 总格数不守恒:scoped ${S.ran}+${S.scopedSkip} ≠ full ${F.ran}+${F.scopedSkip} → 有门在 scoped 路径上没被点名`);
if (S.rec.mode !== "scoped") findings.push(`注意:scoped 请求被升成 ${S.rec.mode}(${S.rec.upgraded}),本次比对退化为 full vs full —— 改动集命中全局清单时如此,换个只改业务文件的树再跑才有意义`);

const out = { at: new Date().toISOString(), scoped: { exit: S.exit, stepFails: S.stepFails, stepSkips: S.stepSkips, gateFails: S.gateFails, gateSkips: S.gateSkips, ran: S.ran, scopedSkip: S.scopedSkip, mode: S.rec.mode }, full: { exit: F.exit, stepFails: F.stepFails, gateFails: F.gateFails, ran: F.ran }, findings };
fs.writeFileSync(path.join(CACHE_DIR, "scope-audit.json"), JSON.stringify(out, null, 1));
if (findings.length) { console.error("scope-audit FAIL:\n  - " + findings.join("\n  - ")); process.exit(1); }
console.log(`scope-audit PASS —— scoped 与 full 失败集一致,总格数守恒(${F.ran}),映射表未见漏配`);
