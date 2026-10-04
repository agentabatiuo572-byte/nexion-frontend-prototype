#!/usr/bin/env node
// verify 链 runner(包 ar,2026-08-17 主人拍板 Q1A):`npm run verify` 的执行体。
//
//   node scripts/verify-chain.mjs [--full|--scoped|--static] [--only a,b] [--force-typecheck] [--keep-going]
//
// 取代原来 package.json 里 18 步 `&&` 串联的三件事:
//   ① 不 fail-fast:一步红,后面的照跑;收尾把 PASS / FAIL / CACHED / SCOPED-SKIP / NOT-RUN 分开列
//      (跑批门必须区分「失败」与「没跑」—— feedback_gate_chain_silently_stopped);
//   ② 三档:full 全跑 · scoped 按 gates.manifest 的输入交集跑 · static 不起 server 只跑静态门
//      (改动集由 git 算,不由模型判;算不出/命中全局清单 → 自动升 full 并说明);
//   ③ 去重:vue-tsc 走指纹缓存壳;h5-runtime 探针跑一遍后把树指纹交给 verify.sh 末尾同名门复用(省 ~7 min);
//      dev server **默认各步各起**(与从前一致)。2026-08-17 三轮全量实测:h5-runtime 首跑在有/无共享 server 下都抖过
//      (run#2 pool 下 backnav 红、run#3 无 pool 下 guard-liveness 红;同一脚本单跑三次全绿)—— 抖动来自同机负载,
//      不是 pool;但把 h5-runtime + verify.sh 的全部探针压在同一对 server 上有 P-097 拥塞退化风险(实测那轮 legacy 慢 3 分钟),
//      收益只有 ~10s 起服,所以默认关;`--pool` 可选(各步先核树身份再复用)。runtime 类步骤失败重跑 1 次(见下)。
// 步骤清单仍声明在 package.json `verify:steps`(`&&` 串,可直接裸跑作对照)—— 门是否在链上的契约测试
// 读那一行,不读本文件;本文件只负责「怎么跑」。
// 产物:.verify-cache/last-run.json(mode/tree/steps/verdict,给 Stop hook / 合并守卫读)、
//       .verify-chain.code(第 1 行退出码,第 2 行摘要;老读法一个字不用改)、.verify-cache/logs/<step>.log。
//       同一时间只允许一条链写这些固定路径；后来者在写入前以 exit 2 退出，避免假绿/假红。
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, CACHE_DIR, LAST_RUN_PATH, loadManifest, plan, treeFingerprint, h5ProbeRoutesMap } from "./lib/verify-scope.mjs";
import { ensureServer } from "./lib/dev-server-pool.mjs";
import { findBash } from "./lib/find-bash.mjs";
import { acquireVerifyRunLock } from "./lib/verify-run-lock.mjs";
import { loadKnownRed, applyKnownRedToSteps } from "./lib/known-red.mjs";
import { captureCommitCandidate, verifiedCommitCandidate } from "../.githooks/commit-verification.mjs";

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const requestedMode = flag("--static") ? "static" : flag("--scoped") ? "scoped" : "full";
const only = (opt("--only") || "").split(",").map((s) => s.trim()).filter(Boolean);
const forceTypecheck = flag("--force-typecheck");
const usePool = flag("--pool"); // 默认关:见头注释 ③
const runLock = acquireVerifyRunLock(ROOT);
if (!runLock.acquired) {
  const owner = runLock.owner;
  console.error(`VERIFY_CHAIN_BUSY: 已有 verify-chain 正在持有互斥锁${owner ? ` (pid=${owner.pid}, startedAt=${owner.startedAt || "?"})` : ""}；为防止覆写 .verify-cache/last-run.json、.verify-chain.code 与 logs，本次未执行。`);
  process.exit(2);
}
// exit 回调是同步的；SIGKILL/断电留下的锁会由下一次基于已死 PID 的恢复逻辑接管。
process.once("exit", () => runLock.release());
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => process.exit(130));
}
const LOG_DIR = path.join(CACHE_DIR, "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", c: "\x1b[36m", d: "\x1b[2m", n: "\x1b[0m" };
const say = (m) => console.log(m);

// ── 步骤清单:package.json verify:steps 的 `&&` 串 ─────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const chain = String(pkg.scripts["verify:steps"] || "");
if (!chain) { console.error("package.json 缺 scripts[\"verify:steps\"](`npm run a && npm run b …` 串)"); process.exit(2); }
const STEPS = chain.split("&&").map((s) => s.trim()).map((s) => s.replace(/^npm run\s+/, "")).filter(Boolean);
const bad = STEPS.filter((s) => !pkg.scripts[s]);
if (bad.length) { console.error(`verify:steps 里有 package.json 不认识的脚本:${bad.join(", ")}`); process.exit(2); }

const manifest = loadManifest();
const P = plan({ mode: requestedMode, manifest });
const mode = P.mode;
const fpStart = treeFingerprint();
const commitStart = captureCommitCandidate(ROOT);
// 🔴 开跑即写 verdict:"running" 占位:半路崩掉时,守卫不许拿**上一轮**的 pass 记录放行(headTree 没变时完全对得上)。
try { fs.writeFileSync(LAST_RUN_PATH, JSON.stringify({ mode, verdict: "running", startedAt: new Date().toISOString(), tree: null, headTree: null, dirty: fpStart?.dirty ?? null, head: fpStart?.head || null, steps: [] }, null, 1)); } catch { /* 写不了占位不影响跑 */ }
say(`${C.c}━━ verify-chain · mode=${mode}${P.upgraded ? `(请求 ${P.requested} → ${P.upgraded})` : ""} · ${STEPS.length} 步 · tree ${fpStart ? fpStart.fingerprint.slice(0, 10) : "?"}${fpStart?.dirty ? "(dirty)" : ""} ━━${C.n}`);
if (P.changed) say(`${C.d}  改动集 ${P.changed.files.length} 个文件(base ${P.changed.base.slice(0, 10)} · ${P.changed.baseReason})${P.changed.files.length ? ":" + P.changed.files.slice(0, 12).join(", ") + (P.changed.files.length > 12 ? " …" : "") : ""}${C.n}`);
if (P.additiveExempt && P.additiveExempt.length) say(`${C.d}  全局清单命中但只增不删(globalsAdditiveOk,i18n 纯加 key):${P.additiveExempt.join(", ")} → 不升档,只跑声明了它们为输入的门${C.n}`);

// ── 子探针缩范围(h5Probes)────────────────────────────────────────────────────
const h5Only = mode === "scoped"
  ? Object.entries(P.h5Probes).filter(([, d]) => d.run).map(([id]) => `${id}.mjs`)
  : [];
// 路由级范围(包 ax):scoped 时 h5 子探针各自的 PROBE_ROUTES 由 H5_PROBE_ROUTES(JSON,脚本名 → 路由串)下发,
//   verify-h5-runtime.mjs 起子进程时逐个设;verify.sh 里的 route 类门由它自己的 plan 算(SCOPE_ROUTES_FOR[id])。
//   PROBE_ROUTES 本身一律清空 —— 外层 shell 残留的 PROBE_ROUTES 绝不能让 full 悄悄变半量。
const h5OnlyEnv = mode === "scoped"
  ? { H5_RUNTIME_ONLY: h5Only.join(",") || "__none__", H5_PROBE_ROUTES: JSON.stringify(h5ProbeRoutesMap(P)), PROBE_ROUTES: "" }
  : { H5_PROBE_ROUTES: "", PROBE_ROUTES: "" };
if (mode === "scoped" && P.routes) say(`${C.d}  路由范围 ${P.routes.affected === "*" ? "全部" : `${P.routes.affected.length}/${P.routes.all.length}`}(${P.routes.reason});route 类探针只扫「这些 ∩ 探针射程」,门自身输入变了仍全扫${P.routes.affected !== "*" && P.routes.affected.length ? ":" + P.routes.affected.slice(0, 8).join(", ") + (P.routes.affected.length > 8 ? " …" : "") : ""}${C.n}`);

// ── 起服(只在需要时、只起一对)────────────────────────────────────────────────
const NEEDS_SERVER = new Set(["test:h5-runtime", "test:legacy-suite"]);
let pool = null;
async function ensurePool() {
  if (pool || mode === "static" || !usePool) return pool;
  const t0 = Date.now();
  const [development, production] = await Promise.all([
    ensureServer({ root: ROOT, environment: "development", log: (m) => say(`${C.d}  pool: ${m}${C.n}`) }),
    ensureServer({ root: ROOT, environment: "production", log: (m) => say(`${C.d}  pool: ${m}${C.n}`) }),
  ]);
  pool = { development, production, bootMs: Date.now() - t0 };
  say(`${C.d}  pool: development ${development.baseUrl} · production ${production.baseUrl}(起服 ${(pool.bootMs / 1000).toFixed(1)}s)${C.n}`);
  return pool;
}
const poolEnv = () => pool ? {
  H5_RUNTIME_REUSE_DEV_URL: pool.development.baseUrl, H5_RUNTIME_REUSE_PROD_URL: pool.production.baseUrl,
  LEGACY_SUITE_REUSE_DEV_URL: pool.development.baseUrl, LEGACY_SUITE_REUSE_PROD_URL: pool.production.baseUrl,
} : {};

// ── 单步执行 ─────────────────────────────────────────────────────────────────
const npmCli = [process.env.npm_execpath, path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")].find((c) => c && fs.existsSync(c));
function runCommand(cmd, args, env, logFile) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"], shell: false });
    // 日志边跑边落盘(长步骤如 legacy-suite 十几分钟,`tail -f .verify-cache/logs/<step>.log` 能看进度),内存里只留尾巴给摘要用
    const stream = fs.createWriteStream(logFile, { flags: "w" });
    let out = "";
    const onData = (c) => { const t = c.toString(); stream.write(t); out = (out + t).slice(-200_000); };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => { stream.end(); resolve({ code, out, ms: Date.now() - t0 }); });
    child.on("error", (e) => { out += String(e); stream.end(String(e)); resolve({ code: 1, out, ms: Date.now() - t0 }); });
  });
}
const npmRun = (script, env, logFile) => runCommand(
  npmCli ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm"),
  [...(npmCli ? [npmCli] : []), "run", script], env, logFile,
);

const results = [];
let h5RuntimeTree = null; // test:h5-runtime 跑过并 PASS 的树指纹 → 交给 verify.sh 末尾同名门复用
for (const step of STEPS) {
  const logFile = path.join(LOG_DIR, `${step.replace(/[:/]/g, "_")}.log`);
  const entry = manifest.steps[step];
  const decision = P.steps[step] || { run: true, reason: entry ? "?" : "未在 manifest 声明(照跑)" };
  if (only.length && !only.includes(step)) { results.push({ step, status: "NOT-RUN", ms: 0, reason: "--only 未列出" }); continue; }
  if (!decision.run) {
    results.push({ step, status: "SCOPED-SKIP", ms: 0, reason: decision.reason });
    say(`${C.y}↷ ${step}${C.n} ${C.d}SCOPED-SKIP(${decision.reason})${C.n}`);
    continue;
  }
  process.stdout.write(`${C.c}▶ ${step}${C.n} ${C.d}(log ${path.relative(ROOT, logFile).replace(/\\/g, "/")})${C.n} `);
  let r;
  if (step === "type-check:cached" || step === "type-check") {
    r = await runCommand(process.execPath, [path.join(ROOT, "scripts", "typecheck-cached.mjs"), ...(forceTypecheck ? ["--force"] : [])], {}, logFile);
    r.cached = /\(cached/.test(r.out);
  } else if (step === "test:legacy-suite" && mode === "static") {
    const bash = findBash();
    if (!bash) { r = { code: 1, out: "BASH_RUNTIME_NOT_FOUND", ms: 0 }; }
    else r = await runCommand(bash, ["scripts/verify.sh"], { VERIFY_MODE: "static", ...h5OnlyEnv }, logFile);
  } else if (NEEDS_SERVER.has(step)) {
    let poolErr = null;
    try { await ensurePool(); } catch (e) { poolErr = e; }
    if (poolErr) { r = { code: 1, out: `起服失败:${poolErr.message}`, ms: 0, notRun: true }; }
    else {
      const env = { ...poolEnv(), ...h5OnlyEnv, VERIFY_MODE: mode };
      if (step === "test:legacy-suite" && h5RuntimeTree) env.H5_RUNTIME_REUSED_TREE = h5RuntimeTree;
      r = await npmRun(step, env, logFile);
      // 🔴 runtime 类步骤失败自动重跑 1 次、以第二次为准(与 verify.sh probe_retry 族同款纪律,2026-08-17 实测三轮全量
      //   h5-runtime 首跑各抖一次不同探针:backnav / guard-liveness,单跑三次全绿 —— 是负载抖动不是代码红)。
      //   重试必须大声:状态标 PASS(after-retry ⚠)+ 首败日志留 *.attempt1;稳定红两跑仍红,不被洗绿。
      if (r.code !== 0 && manifest.steps[step]?.kind === "runtime") {
        try { fs.copyFileSync(logFile, logFile + ".attempt1"); } catch { /* 留痕失败不影响判定 */ }
        say(`${C.y}↻ 首跑红(runtime 类步骤),重跑 1 次,首败日志 ${path.relative(ROOT, logFile).replace(/\\/g, "/")}.attempt1${C.n}`);
        const r2 = await npmRun(step, env, logFile);
        r = { ...r2, ms: r.ms + r2.ms, retried: true, firstCode: r.code };
      }
      if (step === "test:h5-runtime" && r.code === 0) { const fp = treeFingerprint(); h5RuntimeTree = fp ? fp.fingerprint : null; }
    }
  } else {
    r = await npmRun(step, { VERIFY_MODE: mode, ...h5OnlyEnv }, logFile);
    if (r.code !== 0 && manifest.steps[step]?.kind === "runtime") {
      try { fs.copyFileSync(logFile, logFile + ".attempt1"); } catch { /* 同上 */ }
      say(`${C.y}↻ 首跑红(runtime 类步骤),重跑 1 次,首败日志 ${path.relative(ROOT, logFile).replace(/\\/g, "/")}.attempt1${C.n}`);
      const r2 = await npmRun(step, { VERIFY_MODE: mode, ...h5OnlyEnv }, logFile);
      r = { ...r2, ms: r.ms + r2.ms, retried: true, firstCode: r.code };
    }
  }
  const status = r.notRun ? "NOT-RUN" : r.code === 0 ? (r.cached ? "CACHED" : "PASS") : "FAIL";
  results.push({ step, status, ms: r.ms, code: r.code, retried: !!r.retried, reason: r.notRun ? r.out : (r.retried ? (r.code === 0 ? `after-retry ⚠(首跑 exit ${r.firstCode})` : `重跑仍红(首跑 exit ${r.firstCode},重跑 exit ${r.code})`) : undefined) });
  const secs = `${(r.ms / 1000).toFixed(1)}s`;
  if (status === "PASS") say(`${C.g}✓ PASS${C.n} ${C.d}${secs}${C.n}${r.retried ? ` ${C.y}(after-retry ⚠ 首跑 exit ${r.firstCode})${C.n}` : ""}`);
  else if (status === "CACHED") say(`${C.g}≡ CACHED${C.n} ${C.d}${secs} · ${r.out.trim().split(/\r?\n/).at(-1)}${C.n}`);
  else if (status === "NOT-RUN") say(`${C.y}⊘ NOT-RUN${C.n} ${r.out.trim().split(/\r?\n/)[0]}`);
  else {
    say(`${C.r}✗ FAIL${C.n} ${C.d}${secs} · exit ${r.code} · 日志 ${path.relative(ROOT, logFile)}${C.n}`);
    const tail = r.out.trim().split(/\r?\n/);
    const picked = tail.filter((l) => /FAIL|✗|Error|error TS|not ok|✖|✘/.test(l)).slice(-12);
    (picked.length ? picked : tail.slice(-12)).forEach((l) => say(`    ${C.d}${l.slice(0, 200)}${C.n}`));
  }
}
if (pool) { try { pool.development.stop(); } catch { /* 起服子进程可能已退出 */ } try { pool.production.stop(); } catch { /* 同上 */ } }

// ── 汇总 + 产物 ──────────────────────────────────────────────────────────────
// The sibling checkout can change without this repository's fingerprint moving.
// Recheck parity before publishing a full green receipt, using the same strong gate.
const syncResult = results.find((result) => result.step === "test:app-h5-sync");
if (mode === "full" && syncResult?.status === "PASS") {
  const parity = await runCommand(process.execPath, [path.join(ROOT, "scripts", "app-h5-sync.mjs"), "check"], {}, path.join(LOG_DIR, "app-h5-sync-final.log"));
  syncResult.ms += parity.ms;
  syncResult.finalParity = parity.code === 0 ? "PASS" : "FAIL";
  if (parity.code !== 0) {
    syncResult.status = "FAIL";
    syncResult.code = parity.code;
    syncResult.reason = `Final APP/H5 parity failed: ${parity.out.trim().split(/\r?\n/).at(-1)}`;
  }
}
const fpEnd = treeFingerprint();
const commitEnd = captureCommitCandidate(ROOT);
// 已知红(Tier 1-C):FAIL 步命中 scripts/known-red.json 未到期条目 → KNOWN-RED,不进 verdict;到期 → 仍 FAIL 并写明;清单本身坏了 → 追加一条 FAIL(门的门)。
const knownRed = loadKnownRed();
if (knownRed.problems.length) results.push({ step: "known-red.json", status: "FAIL", ms: 0, code: 2, reason: `已知红清单不可用:${knownRed.problems[0]}(node scripts/lib/known-red.mjs lint 看全部)` });
else applyKnownRedToSteps(results, knownRed.steps);
const count = (s) => results.filter((r) => r.status === s).length;
const totalMs = results.reduce((a, r) => a + r.ms, 0);
const treeMoved = !!(fpStart && fpEnd && fpStart.fingerprint !== fpEnd.fingerprint);
const failed = results.filter((r) => r.status === "FAIL" || r.status === "NOT-RUN");
const verdict = failed.length ? "fail" : "pass";
say(`\n${C.c}━━ verify-chain result · mode=${mode} · ${(totalMs / 1000 / 60).toFixed(1)} min ━━${C.n}`);
for (const r of results) {
  const col = r.status === "PASS" || r.status === "CACHED" ? C.g : r.status === "FAIL" || r.status === "NOT-RUN" ? C.r : C.y; // KNOWN-RED / SCOPED-SKIP 黄
  say(`  ${col}${r.status.padEnd(11)}${C.n} ${r.step.padEnd(34)} ${r.ms ? (r.ms / 1000).toFixed(1).padStart(7) + "s" : "".padStart(8)}${r.reason ? `  ${C.d}${String(r.reason).split(/\r?\n/)[0].slice(0, 120)}${C.n}` : ""}`);
}
say(`  ${C.g}PASS ${count("PASS")}${C.n} · ${C.g}CACHED ${count("CACHED")}${C.n} · ${C.r}FAIL ${count("FAIL")}${C.n} · ${C.y}KNOWN-RED ${count("KNOWN-RED")}${C.n} · ${C.y}SCOPED-SKIP ${count("SCOPED-SKIP")}${C.n} · ${C.r}NOT-RUN ${count("NOT-RUN")}${C.n} / ${STEPS.length} 步` +
    (count("KNOWN-RED") ? `${C.y} —— ${count("KNOWN-RED")} 步是已知红(scripts/known-red.json 有理由有到期日,不进 verdict;到期未清自动回红)${C.n}` : "") +
    (mode !== "full" ? `${C.y} —— 这是 ${mode} 档,不等于全量绿;宣布 done / 合并主线前仍须 full 一次${C.n}` : "") +
    (treeMoved ? `${C.r} —— ⚠ 跑的过程中工作树变了(${fpStart.fingerprint.slice(0, 10)} → ${fpEnd.fingerprint.slice(0, 10)}),本次结论不锚定任何一棵树,合并守卫不认${C.n}` : ""));

const record = {
  mode, requestedMode: P.requested, upgraded: P.upgraded, verdict, treeMoved,
  commitCandidate: verifiedCommitCandidate(commitStart, commitEnd, { mode, verdict, treeMoved }),
  startedTree: fpStart, endedTree: fpEnd,
  tree: !treeMoved && fpEnd ? fpEnd.fingerprint : null, headTree: !treeMoved && fpEnd ? fpEnd.headTree : null, dirty: fpEnd ? fpEnd.dirty : null,
  head: fpEnd?.head || null, at: new Date().toISOString(), totalMs,
  changed: P.changed ? { base: P.changed.base, count: P.changed.files.length } : null,
  knownRed: results.filter((r) => r.status === "KNOWN-RED").map((r) => ({ step: r.step, until: r.knownRed?.until, why: r.knownRed?.why })),
  steps: results,
};
fs.writeFileSync(LAST_RUN_PATH, JSON.stringify(record, null, 1));
const exitCode = verdict === "pass" ? 0 : 1;
fs.writeFileSync(path.join(ROOT, ".verify-chain.code"), `${exitCode}\nmode=${mode} pass=${count("PASS") + count("CACHED")} fail=${count("FAIL")} scoped_skip=${count("SCOPED-SKIP")} not_run=${count("NOT-RUN")} known_red=${count("KNOWN-RED")} tree=${record.tree || "moved"}\n`);
process.exit(exitCode);
