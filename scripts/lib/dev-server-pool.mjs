// dev server 起服/复用共用库(包 ar,2026-08-17 提案 §3.2-5/6)。
//
// 为什么:一轮 `npm run verify` 里 dev server 被各步各自起了 6-7 次(session-reload / h5-runtime /
// withdraw-mirror / legacy-suite×2 / verify.sh 末尾 h5 门 / 提现账单行远端档),每次 10-40s。
// runner 起一对(development + production)传下去,各步骤**先核身份再复用**;身份不对就照旧自己起 ——
// 复用永远不许换来「验错对象」(树身份 + 构建环境判据与 verify.sh [2.5] / verify-on-stop 同源)。
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import path from "node:path";

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

export function stopTree(child) {
  if (!child || !child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

/** 与 verify.sh `_norm_tree_path` 同口径:小写、反斜杠→斜杠、去盘符冒号/前导斜杠/cygdrive/mnt、折叠多斜杠、去尾斜杠。 */
export function normTreePath(p) {
  return String(p).toLowerCase().replace(/\\\\/g, "/").replace(/\\/g, "/")
    .replace(/^\/cygdrive\//, "").replace(/^\/mnt\/([a-z])\//, "$1/").replace(/^\/mnt\/([a-z])$/, "$1")
    .replace(/^\//, "").replace(/^([a-z]):/, "$1").replace(/\/+/g, "/").replace(/\/$/, "");
}

const assertViteEnvironment = (environment) => {
  if (environment !== "development" && environment !== "production") {
    throw new Error(`不支持的 Vite environment:${environment};只允许 development/production`);
  }
  return environment;
};

/** 探一台 server 是不是「本树 + 指定 dev/prod 构建环境」的 Vite server。 */
export async function identify(baseUrl, { root, environment }) {
  let text = "";
  try {
    const res = await fetch(`${baseUrl}/src/api/runtime-config.ts`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, why: `${baseUrl} 回 ${res.status}` };
    text = (await res.text()).split("\n").slice(0, 2).join("\n");
  } catch (e) {
    return { ok: false, why: `${baseUrl} 连不上(${e?.message || e})` };
  }
  const servedRoot = (text.match(/"VITE_ROOT_DIR": *"([^"]*)"/) || [])[1] || "";
  const servedMode = (text.match(/"MODE": *"([^"]*)"/) || [])[1] || "";
  const expectedMode = assertViteEnvironment(environment);
  if (!servedRoot) return { ok: false, why: `${baseUrl} 的 env 里没有 VITE_ROOT_DIR` };
  if (normTreePath(servedRoot) !== normTreePath(root)) return { ok: false, why: `${baseUrl} 服的是别的树:${servedRoot}(本树 ${root})`, servedRoot, mode: servedMode };
  if (servedMode !== expectedMode) return { ok: false, why: `${baseUrl} 是 ${servedMode || "?"} 环境,要的是 ${expectedMode}`, servedRoot, mode: servedMode };
  return { ok: true, why: "identity ok", servedRoot, mode: servedMode };
}

async function waitForServer(url, child, tail, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`dev server 提前退出(code ${child.exitCode}):\n${tail()}`);
    try { const res = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (res.ok) return; } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server 在 ${timeoutMs / 1000}s 内没起来:\n${tail()}`);
}

/**
 * ensureServer({root, environment, reuseUrl}) → { baseUrl, reused, stop() }
 * reuseUrl 给了且身份核对通过 → 复用(stop 为空操作);否则以 environment 起本树的隔离 server。
 */
export async function ensureServer({ root, environment = "development", reuseUrl = null, timeoutMs = 180_000, log = () => {} }) {
  assertViteEnvironment(environment);
  if (reuseUrl) {
    const id = await identify(reuseUrl, { root, environment });
    if (id.ok) { log(`复用 ${environment} server ${reuseUrl}(身份核对通过:本树 + ${environment})`); return { baseUrl: reuseUrl, reused: true, stop() {} }; }
    log(`不复用 ${reuseUrl}:${id.why} → 自己起`);
  }
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const npmCli = [process.env.npm_execpath, path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")].find((c) => c && fs.existsSync(c));
  const child = spawn(
    npmCli ? process.execPath : (process.platform === "win32" ? "npm.cmd" : "npm"),
    [...(npmCli ? [npmCli] : []), "run", "dev:h5", "--", "--mode", environment,
      "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: root, env: { ...process.env }, shell: false, stdio: ["ignore", "pipe", "pipe"] },
  );
  let out = "";
  child.stdout.on("data", (c) => { out = (out + c).slice(-12_000); });
  child.stderr.on("data", (c) => { out = (out + c).slice(-12_000); });
  await waitForServer(`${baseUrl}/?nx_device=off`, child, () => out, timeoutMs);
  const id = await identify(baseUrl, { root, environment });
  if (!id.ok) { stopTree(child); throw new Error(`自起的 server 身份核对失败:${id.why}`); }
  log(`起 ${environment} server ${baseUrl}(本树隔离)`);
  return { baseUrl, reused: false, child, stop() { stopTree(child); } };
}
