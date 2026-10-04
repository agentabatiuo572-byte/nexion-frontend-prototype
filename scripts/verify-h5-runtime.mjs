#!/usr/bin/env node
// H5 运行时门:隔离起服 + 22 场景 / 6 直接探针(development),或单探针档:
//   --server-session-reload-recovery(development server)/ --remote-withdraw(production server)。
//
// 包 ar(2026-08-17)两处扩展,行为不变、只加两个入口:
//   ① 复用 server:env H5_RUNTIME_REUSE_DEV_URL / _PROD_URL 指向 runner 已起的 server 时,
//      先核身份(本树 + 构建环境,与 verify.sh [2.5] 同判据),通过才复用;不通过照旧自己起(lib/dev-server-pool.mjs)。
//   ② 子探针缩范围:env H5_RUNTIME_ONLY="a.mjs,b.mjs"(runner 按 gates.manifest h5Probes 算出)→ 只跑列出的探针,
//      其余按 SCOPED-SKIP 逐个点名;不设该 env = 全跑。两道路由守卫探针仍串行、其余并行(见下方注释)。
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureServer } from "./lib/dev-server-pool.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverSessionReloadRecoveryOnly = process.argv.includes("--server-session-reload-recovery");
// --remote-withdraw:给「提现账单行 runtime」门起一台 production 隔离 server。
// verify.sh 在 REMOTE_BASE_URL 未给时走这条,不再依赖手动多传环境变量(2026-08-17 主人拍板)。
const remoteWithdrawOnly = process.argv.includes("--remote-withdraw");
const environment = remoteWithdrawOnly ? "production" : "development";
const reuseUrl = environment === "production" ? process.env.H5_RUNTIME_REUSE_PROD_URL : process.env.H5_RUNTIME_REUSE_DEV_URL;
const onlyList = (process.env.H5_RUNTIME_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
const only = (script) => !onlyList.length || onlyList.includes(script);
const skippedProbes = [];
// 路由级范围(包 ax):H5_PROBE_ROUTES = {"<script>.mjs": "a,b" | "*"}(runner / verify.sh 按 gates.manifest pages 闭包算);
//   有条目且不是 "*" 才给该子进程设 PROBE_ROUTES,否则删掉(父环境残留不许下渗)。
let h5ProbeRoutes = {};
try { h5ProbeRoutes = process.env.H5_PROBE_ROUTES ? JSON.parse(process.env.H5_PROBE_ROUTES) : {}; } catch { h5ProbeRoutes = {}; }
function probeEnv(script, baseUrl) {
  const env = { ...process.env, BASE_URL: baseUrl };
  delete env.PROBE_ROUTES;
  const r = h5ProbeRoutes[script];
  if (r && r !== "*") env.PROBE_ROUTES = r;
  return env;
}

function runGate(script, baseUrl, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", script), ...args], {
      cwd: root,
      env: probeEnv(script, baseUrl),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve(output.trim())
      : reject(new Error(`${script} failed (${code})\n${output}`)));
  });
}
/** 缩范围时被跳过的探针:点名 + 记账,输出格式与真跑的最后一行同位(供 verify.sh 的 tail -1 读)。 */
function skipGate(script) {
  skippedProbes.push(script);
  return Promise.resolve(`SCOPED-SKIP ${script}(输入未变,H5_RUNTIME_ONLY 未列出)`);
}
const gate = (script, baseUrl, args) => (only(script) ? runGate(script, baseUrl, args) : skipGate(script));

const server = await ensureServer({ root, environment, reuseUrl, timeoutMs: 45_000, log: (m) => console.log(`h5-runtime: ${m}`) });
const baseUrl = server.baseUrl;
const port = new URL(baseUrl).port;

try {
  // The two route-guard suites deliberately keep pages open across several
  // one-second guard ticks. Running them beside eight Chromium-heavy probes can
  // starve those timers on Windows and create a false red even though the same
  // witness passes immediately in isolation. Keep the security-critical route
  // suites deterministic, then parallelise only the independent DOM probes.
  const outputs = remoteWithdrawOnly
    ? [await runGate("withdraw-bill-runtime.mjs", baseUrl)]
    : serverSessionReloadRecoveryOnly
    ? [await runGate("server-session-reload-recovery-runtime.mjs", baseUrl)]
    : [
      // 每条都保留字面量 runGate("<探针>") —— scripts/probe-safety-contract.test.mjs 以此为接线证据(缩范围只挡执行,不动接线)
      only("guard-liveness-runtime.mjs") ? await runGate("guard-liveness-runtime.mjs", baseUrl) : await skipGate("guard-liveness-runtime.mjs"),
      only("auth-guard-verify.mjs") ? await runGate("auth-guard-verify.mjs", baseUrl) : await skipGate("auth-guard-verify.mjs"),
      ...await Promise.all([
        only("business-loop-liveness-runtime.mjs") ? runGate("business-loop-liveness-runtime.mjs", baseUrl) : skipGate("business-loop-liveness-runtime.mjs"),
        only("spec6-entry-surface-runtime.mjs") ? runGate("spec6-entry-surface-runtime.mjs", baseUrl) : skipGate("spec6-entry-surface-runtime.mjs"),
        only("trial-check.mjs") ? runGate("trial-check.mjs", baseUrl) : skipGate("trial-check.mjs"),
        only("sticky-check.mjs") ? runGate("sticky-check.mjs", baseUrl) : skipGate("sticky-check.mjs"),
        only("backnav-check.mjs") ? runGate("backnav-check.mjs", baseUrl) : skipGate("backnav-check.mjs"),
        only("profile-identity-check.mjs") ? runGate("profile-identity-check.mjs", baseUrl) : skipGate("profile-identity-check.mjs"),
        only("pending-checkout-runtime.mjs") ? runGate("pending-checkout-runtime.mjs", baseUrl) : skipGate("pending-checkout-runtime.mjs"),
        only("page-check.mjs") ? runGate("page-check.mjs", baseUrl, [
          "/#/pages/index/index",
          "h5-runtime-home",
          ".home-earnings-cluster",
        ]) : skipGate("page-check.mjs"),
      ]),
    ];
  for (const output of outputs) console.log(output.split(/\r?\n/).at(-1));
  const where = `${server.reused ? "reused" : "isolated"} server ${port}`;
  const scopedNote = onlyList.length ? ` · scoped: ran ${outputs.length - skippedProbes.length}/${outputs.length} probes, SCOPED-SKIP ${skippedProbes.length}` : "";
  console.log(remoteWithdrawOnly
    ? `withdraw-bill runtime: PASS (${server.reused ? "reused" : "isolated"} production server ${port})`
    : serverSessionReloadRecoveryOnly
    ? `H5 server-session reload recovery: PASS (${where}, returning + fresh flows)`
    : `H5 runtime gates: PASS (${where}, 22 scenarios + 6 direct probes${scopedNote})`);
} finally {
  server.stop();
}
