// verify 范围化共用库(包 ar,2026-08-17 主人拍板 Q1A)——三档制的「算范围」那一半。
//
// 为什么是机器算、不是模型判(提案 §3 不变量③):范围由 `git 改动集 ∩ 门声明的输入文件集` 决定,
// 可审计、可红测;模型「觉得只改了 X」不算数。失败方向偏保守:算不出改动集 → 全量;
// 门没在 manifest 声明 → 照跑;改动命中全局不变量清单 → 自动升 full 并说明。
//
// 三个消费者共用同一份判定,不许各抄一份(单源):
//   · scripts/verify-chain.mjs   —— 18 步链的 runner(步骤级 + h5 子探针级)
//   · scripts/verify.sh          —— 通过 `plan --format shell` 拿到 SCOPE_RUN[id] 表(门级)
//   · hooks(verify-on-stop / verify-fresh-before-merge)—— 读树指纹判「上次绿还算不算数」
//
// CLI:
//   node scripts/lib/verify-scope.mjs fingerprint            → JSON {headTree,dirty,fingerprint,dirtyFiles}
//   node scripts/lib/verify-scope.mjs changed [--base REF]   → JSON {base,files,reason}
//   node scripts/lib/verify-scope.mjs plan --mode scoped|static|full [--format json|shell]
//   node scripts/lib/verify-scope.mjs lint                    → manifest ↔ verify.sh 接线一致性(门的门)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildGraph, closure, pageRoutes, affectedRoutes } from "./import-graph.mjs";
/** app 壳根:它们的静态 import 闭包作用于每一页(自身在 manifest.globals;下游靠这里兜)。 */
export const APP_SHELL_ROOTS = ["src/App.vue", "src/main.ts", "src/components/app-chassis.vue", "src/components/global-ui.vue"];

export const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const MANIFEST_PATH = path.join(ROOT, "scripts", "gates.manifest.json");
export const CACHE_DIR = path.join(ROOT, ".verify-cache");
export const LAST_RUN_PATH = path.join(CACHE_DIR, "last-run.json");
export const MODES = ["full", "scoped", "static"];

export function git(args, opts = {}) {
  try {
    return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], ...opts }).replace(/\r?\n$/, "");
  } catch {
    return null;
  }
}

const norm = (p) => p.replace(/\\/g, "/").replace(/^\.\//, "");

/** `git status --porcelain=v1 -z` 解析 → [{code, path}](重命名取新路径;不含 ignored)。 */
export function workingStatus() {
  const raw = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (raw === null) return null;
  const out = [];
  const parts = raw.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e) continue;
    const code = e.slice(0, 2);
    let p = e.slice(3);
    if (/^(R|C)/.test(code)) { /* v1 -z:重命名的原路径跟在下一个字段 */ i += 1; }
    out.push({ code, path: norm(p) });
  }
  return out;
}

/**
 * 树指纹 = HEAD 树对象 + 工作树里每个改动文件的内容哈希(git hash-object,与 git 同口径)。
 * 干净工作树 → fingerprint === headTree(合并守卫据此比对分支 tip 树)。
 * 算不出(非 git 目录)→ null,调用方按「不能复用任何缓存」处理。
 */
export function treeFingerprint() {
  const headTree = git(["rev-parse", "HEAD^{tree}"]);
  if (!headTree) return null;
  const status = workingStatus();
  if (status === null) return null;
  const files = status.map((s) => s.path).filter(Boolean).sort();
  const existing = files.filter((f) => fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isFile());
  let hashes = {};
  if (existing.length) {
    const out = execFileSync("git", ["-C", ROOT, "hash-object", "--stdin-paths"], { input: existing.join("\n") + "\n", encoding: "utf8" });
    out.trim().split(/\r?\n/).forEach((h, i) => { hashes[existing[i]] = h; });
  }
  const lines = files.map((f) => `${f}:${hashes[f] || "deleted"}`);
  const dirty = files.length > 0;
  const fingerprint = dirty
    ? crypto.createHash("sha256").update(headTree + "\n" + lines.join("\n")).digest("hex")
    : headTree;
  return { headTree, dirty, fingerprint, dirtyFiles: files, head: git(["rev-parse", "HEAD"]) };
}

/** 主线名:VERIFY_MAINLINE > origin/UniApp > origin/main > origin/master > 本地同名。 */
export function mainlineRef() {
  const env = process.env.VERIFY_MAINLINE;
  const candidates = env ? [env, `origin/${env}`] : ["origin/UniApp", "origin/main", "origin/master", "UniApp", "main", "master"];
  for (const c of candidates) if (git(["rev-parse", "--verify", "--quiet", `${c}^{commit}`])) return c;
  return null;
}

/**
 * 改动集 = 提交层(merge-base(HEAD, 主线)..HEAD)∪ 暂存 ∪ 未暂存 ∪ 未跟踪。
 * base 可用 SCOPE_BASE / --base 覆盖。算不出 → null(调用方升 full)。
 */
export function changedSet({ base } = {}) {
  const ml = mainlineRef();
  let baseRef = base || process.env.SCOPE_BASE || null;
  let reason;
  if (!baseRef) {
    if (!ml) return null;
    baseRef = git(["merge-base", "HEAD", ml]);
    if (!baseRef) return null;
    reason = `merge-base(HEAD, ${ml})`;
  } else {
    reason = `SCOPE_BASE=${baseRef}`;
  }
  const committed = git(["diff", "--name-only", "--diff-filter=ACMRTD", `${baseRef}...HEAD`]);
  if (committed === null) return null;
  const status = workingStatus();
  if (status === null) return null;
  const files = new Set();
  committed.split(/\r?\n/).filter(Boolean).forEach((f) => files.add(norm(f)));
  status.forEach((s) => files.add(s.path));
  return { base: baseRef, baseReason: reason, mainline: ml, files: [...files].sort() };
}

export function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

export function matchAny(file, globs) {
  return (globs || []).some((g) => path.matchesGlob(file, g));
}

/**
 * 出跑单。mode: full → 全跑;scoped → 按输入交集(命中全局清单升 full);static → 不起 server、不跑测试套件,其余静态门按输入交集(命中全局清单则静态门全跑)。
 * 返回 { mode(生效), requested, upgraded(升档原因|null), changed, gates:{id:{run,reason}}, steps:{...}, h5Probes:{...} }
 */
export function plan({ mode = "full", manifest = loadManifest(), changed = undefined } = {}) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode ${mode}`);
  const requested = mode;
  let upgraded = null;
  let changedInfo = null;
  // static 与 scoped 都按改动集缩范围;区别只在 static 一律不碰需要 server 的门。
  // static 下改动集算不出 / 命中全局清单 → 「静态门全跑」(staticAll),仍不起 server(保守方向,不升 full)。
  let staticAll = false;
  if (mode === "scoped" || mode === "static") {
    changedInfo = changed === undefined ? changedSet() : changed;
    if (!changedInfo) {
      if (mode === "scoped") { upgraded = "改动集算不出(非 git / 无主线 / merge-base 失败)→ 升 full(保守方向)"; mode = "full"; }
      else { upgraded = "改动集算不出 → 静态门全跑(不起 server)"; staticAll = true; }
    } else {
      const hit = changedInfo.files.filter((f) => matchAny(f, manifest.globals));
      if (hit.length) {
        const list = `${hit.slice(0, 5).join(", ")}${hit.length > 5 ? " …" : ""}`;
        if (mode === "scoped") { upgraded = `改动命中全局不变量清单:${list} → 升 full`; mode = "full"; }
        else { upgraded = `改动命中全局不变量清单:${list} → 静态门全跑(不起 server)`; staticAll = true; }
      }
    }
  }
  // pages 声明(包 ax):门/探针驱动的页面 → 页面文件的静态 import 闭包 = 真实输入集(改共享组件/store 自然命中引用它的页面);
  //   "*" = pages.json 全部页面。图 0.5s 建一次;闭包按需算并缓存。scoped 时另算「受影响路由」交给 route 类探针做路由级缩范围。
  let graph = null; const closureCache = new Map();
  const allPages = pageRoutes(ROOT);
  const pagesOf = (entry) => expandPages(entry, allPages);
  // 已删除的 src 文件不在图里(闭包算不到它) → 保守:所有 pages 类门都视为命中,路由全开;tsc/build 另守断链。
  const deletedSrc = changedInfo ? changedInfo.files.filter((f) => f.startsWith("src/") && !fs.existsSync(path.join(ROOT, f))) : [];
  // app 壳闭包(tester-F F-01/F-02):App.vue / main.ts / app-chassis / global-ui 本身在 globals 里,但**只被它们引用**的下游
  //   (retired-route-migrations / a11y-activate / spec7-dev-bridge、App 层编排的 auth / session / theme 等 store)不在任何页面闭包里,
  //   却作用于每一页(P-031:store 不互 import,跨 store 编排放 App 层)。命中壳闭包 = 全部路由受影响、所有 pages 类门都跑。
  const shellHits = (() => {
    if (!changedInfo || deletedSrc.length) return [];
    graph = graph || buildGraph(ROOT);
    const shell = closure(graph, APP_SHELL_ROOTS.filter((r) => graph.has(r)));
    return changedInfo.files.filter((f) => shell.has(f));
  })();
  const closureHit = (entry) => {
    const pages = pagesOf(entry); if (!pages.length || !changedInfo) return null;
    if (deletedSrc.length) return deletedSrc;
    if (shellHits.length) return shellHits;
    graph = graph || buildGraph(ROOT);
    const roots = [...pages, ...probeScriptRoots(entry)];
    const key = roots.join("|");
    if (!closureCache.has(key)) closureCache.set(key, closure(graph, roots));
    const cl = closureCache.get(key);
    const hits = changedInfo.files.filter((f) => cl.has(f));
    return hits;
  };
  let routes = null; // scoped 时:{all, affected, reason}
  if ((mode === "scoped" || mode === "static") && changedInfo) {
    if (deletedSrc.length) routes = { all: allPages.map((p) => p.route), affected: allPages.map((p) => p.route), reason: `改动集含已删除的 src 文件(${deletedSrc[0]}${deletedSrc.length > 1 ? ` +${deletedSrc.length - 1}` : ""})→ 全部路由` };
    else if (shellHits.length) routes = { all: allPages.map((p) => p.route), affected: allPages.map((p) => p.route), reason: `改动命中 app 壳闭包(${shellHits[0]}${shellHits.length > 1 ? ` +${shellHits.length - 1}` : ""};App/main/chassis/global-ui 的下游作用于每一页)→ 全部路由` };
    else { graph = graph || buildGraph(ROOT); routes = affectedRoutes(ROOT, changedInfo.files, graph); }
  }
  const decide = (entry, id) => {
    if (mode === "full") return { run: true, reason: "full" };
    if (entry.fullOnly) return { run: false, reason: "full-only(只在全量档跑)" };
    const needsServer = entry.kind === "runtime" || entry.kind === "server";
    if (mode === "static" && needsServer) return { run: false, reason: "static:需要 dev server" };
    if (mode === "static" && entry.kind === "test") return { run: false, reason: "static:测试套件留给 scoped/full" };
    if (entry.always) return { run: true, reason: "always" };
    if (mode === "static" && staticAll) return { run: true, reason: "static:全跑" };
    // scoped / static:按输入交集(inputs glob)∪ 页面闭包交集(pages)
    const hasInputs = entry.inputs && entry.inputs.length; const hasPages = pagesOf(entry).length;
    if (!hasInputs && !hasPages) return { run: true, reason: "no-inputs-declared(照跑)" };
    const hits = hasInputs ? changedInfo.files.filter((f) => matchAny(f, entry.inputs)) : [];
    const pageHits = hasPages ? (closureHit(entry) || []) : [];
    if (hits.length) return { run: true, reason: `hit:${hits[0]}${hits.length > 1 ? ` +${hits.length - 1}` : ""}`, routes: "*" }; // 探针/基线/台账自己变了 → 全扫
    if (pageHits.length) {
      const more = pageHits.length > 1 ? ` +${pageHits.length - 1}` : "";
      if (deletedSrc.length) return { run: true, reason: `deleted-src(保守全开):${pageHits[0]}${more}`, routes: "*" };
      if (shellHits.length) return { run: true, reason: `app-shell-closure-hit(全部路由):${pageHits[0]}${more}`, routes: "*" };
      // 路由级缩范围只给 routeScoped 的门(读 PROBE_ROUTES 的 7 个 route 类探针);其它门 routes 恒 "*"(tester-F F-09:别产出没人消费的假缩范围信息)。
      // 交集为空(命中只来自探针脚本 import 的模块、页面本身没变)→ "*" 全扫,绝不下发 0 条(tester-F F-03:该保守的地方不许给 0)。
      if (!entry.routeScoped) return { run: true, reason: `page-closure-hit:${pageHits[0]}${more}`, routes: "*" };
      const mine = new Set(pagesOf(entry)); const affected = routes && Array.isArray(routes.affected) ? routes.affected : null;
      const scopedRoutes = affected ? allPages.filter((p) => mine.has(p.file) && affected.includes(p.route)).map((p) => p.route) : [];
      return { run: true, reason: `page-closure-hit:${pageHits[0]}${more}${scopedRoutes.length ? "" : "(路由交集空 → 全扫)"}`, routes: scopedRoutes.length ? scopedRoutes : "*" };
    }
    return { run: false, reason: `${mode}:输入与页面闭包均未变` };
  };
  const table = (obj) => Object.fromEntries(Object.entries(obj || {}).map(([id, e]) => [id, decide(e, id)]));
  const h5Table = table(manifest.h5Probes);
  const anyH5 = Object.values(h5Table).some((d) => d.run);
  const withUmbrella = (obj) => Object.fromEntries(Object.entries(obj || {}).map(([id, e]) => {
    const d = decide(e, id);
    if (e.runIfAny === "h5Probes" && mode !== "full" && !e.always) {
      if (d.run && d.reason.startsWith("hit:")) return [id, d]; // 伞门自己的输入(脚本)变了照跑
      return [id, anyH5 ? { run: true, reason: "runIfAny:h5Probes 有子探针要跑" } : { run: false, reason: `${mode}:h5Probes 全部跳过,伞门不起服` }];
    }
    return [id, d];
  }));
  return {
    requested, mode, upgraded,
    changed: changedInfo ? { base: changedInfo.base, baseReason: changedInfo.baseReason, files: changedInfo.files } : null,
    routes: mode === "full" ? { all: allPages.map((p) => p.route), affected: "*", reason: "full:全部路由" } : (routes || { all: allPages.map((p) => p.route), affected: "*", reason: "改动集不可用:全部路由" }),
    gates: withUmbrella(manifest.gates), steps: withUmbrella(manifest.steps), h5Probes: h5Table,
    cells: Object.fromEntries(Object.entries(manifest.gates || {}).map(([id, e]) => [id, Number.isInteger(e.cells) && e.cells >= 1 ? e.cells : 1])), // 每门在 verify.sh 里出几格(跳过时按格计数,deep 判据 ③ 守恒)
  };
}

/** pages 声明展开:"*" → 全部页面文件;含 * 的条目按 glob 匹配 pages.json 页面文件;其余按字面。 */
export function expandPages(entry, allPages = pageRoutes(ROOT)) {
  if (entry.pages === "*") return allPages.map((p) => p.file);
  if (!Array.isArray(entry.pages)) return [];
  const out = new Set();
  for (const pg of entry.pages) {
    if (pg.includes("*")) for (const p of allPages) { if (path.matchesGlob(p.file, pg)) out.add(p.file); }
    else out.add(pg.replace(/\\/g, "/"));
  }
  return [...out];
}

/** 探针脚本(inputs 里的 scripts/*.mjs)在页面上下文里 import("/src/…") 的模块 —— 不在页面闭包里,自动并入闭包根。 */
export function probeScriptRoots(entry) {
  const roots = new Set();
  for (const inp of entry.inputs || []) {
    if (!/^scripts\/[^*?]+\.mjs$/.test(inp)) continue;
    let src = ""; try { src = fs.readFileSync(path.join(ROOT, inp), "utf8"); } catch { continue; }
    for (const m of src.matchAll(/["'`]\/src\/([^"'`]+)["'`]/g)) roots.add("src/" + m[1]);
  }
  return [...roots];
}

/** 门级路由范围 → env 串:"*" 全扫;[] 也回 "*"(交集空 = 全扫,绝不下发 0 扫描;F-03);否则逗号串(无前导 /)。 */
export function routesOfDecision(d) {
  if (!d || d.routes === undefined || d.routes === "*") return "*";
  // 🔴 去掉前导 "/":Git Bash(MSYS)会把以 / 开头的 env 值当 POSIX 路径改写成 C:/Program Files/Git/pages/…(实测 PROBE_ROUTES 整串被改,探针 0 命中);
  //   probe-routes.normRoute 两边都忽略前导斜杠,不影响匹配。
  return Array.isArray(d.routes) && d.routes.length ? d.routes.map((r) => String(r).replace(/^\/+/, "")).join(",") : "*"; // 空 = 全扫,不产出 __none__(F-03)
}
/** h5 子探针路由映射(verify-h5-runtime.mjs 给每个子探针单独设 PROBE_ROUTES):{ "spec6-entry-surface-runtime.mjs": "a,b" | "*" }。 */
export function h5ProbeRoutesMap(p) {
  const out = {};
  for (const [id, d] of Object.entries(p.h5Probes || {})) if (d.run) out[`${id}.mjs`] = routesOfDecision(d);
  return out;
}
/** verify.sh 用的 shell 片段:SCOPE_MODE / SCOPE_UPGRADED / SCOPE_RUN[id]=1|0 SCOPE_WHY[id] SCOPE_ROUTES_FOR[id]。 */
export function planToShell(p) {
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const routesEnv = !p.routes || p.routes.affected === "*" ? "*" : p.routes.affected.map((r) => String(r).replace(/^\/+/, "")).join(","); // 无前导 /(MSYS 路径改写,见 routesOfDecision)
  const lines = [`SCOPE_MODE=${q(p.mode)}`, `SCOPE_REQUESTED=${q(p.requested)}`, `SCOPE_UPGRADED=${q(p.upgraded || "")}`,
    `SCOPE_CHANGED_COUNT=${p.changed ? p.changed.files.length : -1}`, `SCOPE_BASE_USED=${q(p.changed ? p.changed.base : "")}`,
    `SCOPE_ROUTES=${q(routesEnv)}`, `SCOPE_ROUTES_NOTE=${q(p.routes ? p.routes.reason : "")}`,
    `SCOPE_H5_PROBE_ROUTES_JSON=${q(JSON.stringify(h5ProbeRoutesMap(p)))}`];
  for (const [id, d] of Object.entries(p.gates)) {
    lines.push(`SCOPE_RUN[${q(id)}]=${d.run ? 1 : 0}`);
    lines.push(`SCOPE_WHY[${q(id)}]=${q(d.reason)}`);
    lines.push(`SCOPE_ROUTES_FOR[${q(id)}]=${q(routesOfDecision(d))}`);
    lines.push(`SCOPE_CELLS[${q(id)}]=${Number.isInteger(p.cells?.[id]) ? p.cells[id] : 1}`);
  }
  return lines.join("\n") + "\n";
}

/** 门的门:manifest 里的 gate id ↔ verify.sh 里的 scope_hit 调用点一一对应;glob 至少命中一个存在文件。 */
export function lint({ manifest = loadManifest(), verifySh = fs.readFileSync(path.join(ROOT, "scripts", "verify.sh"), "utf8") } = {}) {
  const problems = [];
  const idsInSh = new Set([...verifySh.matchAll(/scope_hit\s+"?([A-Za-z0-9._-]+)"?/g)].map((m) => m[1]));
  const idsInManifest = new Set(Object.keys(manifest.gates || {}));
  for (const id of idsInSh) if (!idsInManifest.has(id)) problems.push(`verify.sh 调了 scope_hit ${id},manifest.gates 没有它(会按「未声明照跑」处理,但接线意图丢了)`);
  for (const id of idsInManifest) if (!idsInSh.has(id)) problems.push(`manifest.gates.${id} 在 verify.sh 里没有 scope_hit 调用点(声明了却没接线 = 空转)`);
  const allFiles = git(["ls-files"])?.split(/\r?\n/).filter(Boolean) || [];
  const checkGlobs = (owner, globs) => {
    for (const g of globs || []) {
      if (g.includes("*") ? !allFiles.some((f) => path.matchesGlob(f, g)) : !fs.existsSync(path.join(ROOT, g))) {
        problems.push(`${owner} 的输入 glob「${g}」在仓里一个文件都不命中(路径漂移?)`);
      }
    }
  };
  checkGlobs("globals", manifest.globals);
  // routeScoped 门 ↔ verify.sh 里的 route_scope <id> 必须双向配对(tester-F F-07:route_scope 漏调 = 探针跑在别的门的路由集里)
  const routeScopeCalls = new Set([...verifySh.matchAll(/(?:^|[;&|(\s])route_scope\s+([A-Za-z0-9_.:-]+)/gm)].map((m) => m[1]).filter((id) => id !== "<门id>"));
  for (const [k, e] of Object.entries(manifest.gates || {})) {
    if (e.routeScoped && !routeScopeCalls.has(k)) problems.push(`gates.${k} 标了 routeScoped,verify.sh 里却没有 route_scope ${k}(探针会继承别的门的 PROBE_ROUTES / 或全扫)`);
  }
  for (const id of routeScopeCalls) if (!(manifest.gates || {})[id]?.routeScoped) problems.push(`verify.sh 调了 route_scope ${id},但 manifest.gates.${id} 没标 routeScoped:true`);
  // R2-06:route_scope 必须排在同门 scope_hit 之后(scope_hit 入口会 unset PROBE_ROUTES,倒序 = 白设、门静默退回全扫)
  for (const [k, e] of Object.entries(manifest.gates || {})) {
    if (!e.routeScoped) continue;
    const hitAt = verifySh.search(new RegExp(`scope_hit\\s+${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`));
    const rsAt = verifySh.search(new RegExp(`route_scope\\s+${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`));
    if (hitAt >= 0 && rsAt >= 0 && rsAt < hitAt) problems.push(`gates.${k}: route_scope 排在 scope_hit 之前 —— scope_hit 会先 unset PROBE_ROUTES,倒序等于没缩范围`);
  }
  // R2-02:routeScoped 门声明的每一页,探针脚本里必须真的会扫(路由字面出现在探针脚本里);pages:"*" 的门探针从 pages.json 取,免查
  for (const [k, e] of Object.entries(manifest.gates || {})) {
    if (!e.routeScoped || e.pages === "*" || !Array.isArray(e.pages)) continue;
    let src = ""; for (const inp of e.inputs || []) if (/^scripts\/[^*?]+\.mjs$/.test(inp)) { try { src += fs.readFileSync(path.join(ROOT, inp), "utf8"); } catch { /* skip */ } }
    for (const pg of expandPages(e, pageRoutes(ROOT))) {
      const route = pg.replace(/^src\//, "").replace(/\.vue$/, "");
      if (!src.includes(route)) problems.push(`gates.${k}: pages 声明了 ${pg},但探针脚本里没有路由字面 ${route} —— 探针不会扫它,scoped 下会「跑了却扫 0 条」`);
    }
  }
  // R2-07:两个 h5 伞门的 inputs 必须 = verify-h5-runtime.mjs + h5Probes 全部子探针脚本(三处手抄会漂)
  {
    const expected = new Set(["scripts/verify-h5-runtime.mjs", ...Object.keys(manifest.h5Probes || {}).map((id) => `scripts/${id}.mjs`)]);
    for (const [sec, id] of [["gates", "h5-runtime-isolated"], ["steps", "test:h5-runtime"]]) {
      const e = (manifest[sec] || {})[id]; if (!e) continue;
      const got = new Set(e.inputs || []);
      const missing = [...expected].filter((x) => !got.has(x)); const extra = [...got].filter((x) => !expected.has(x));
      if (missing.length || extra.length) problems.push(`${sec}.${id}.inputs 必须恰好 = verify-h5-runtime.mjs + h5Probes 子探针脚本(缺 ${missing.join(",") || "-"};多 ${extra.join(",") || "-"})`);
    }
  }
  const allPagesL = pageRoutes(ROOT); const pageFilesL = new Set(allPagesL.map((p) => p.file));
  for (const [k, e] of Object.entries(manifest.gates || {})) checkGlobs(`gates.${k}`, e.inputs);
  for (const [k, e] of Object.entries(manifest.steps || {})) checkGlobs(`steps.${k}`, e.inputs);
  for (const [k, e] of Object.entries(manifest.h5Probes || {})) checkGlobs(`h5Probes.${k}`, e.inputs);
  for (const [k, e] of Object.entries({ ...(manifest.gates || {}), ...(manifest.steps || {}), ...(manifest.h5Probes || {}) })) {
    const hasPages = e.pages === "*" || (Array.isArray(e.pages) && e.pages.length);
    if (e.pages !== undefined && !hasPages) problems.push(`${k}.pages 必须是 "*" 或非空数组(现在是 ${JSON.stringify(e.pages)} —— 会被静默当成没声明)`);
    if (e.cells !== undefined && !(Number.isInteger(e.cells) && e.cells >= 1)) problems.push(`${k}.cells 必须是 ≥1 的整数(现在是 ${JSON.stringify(e.cells)})`);
    if (e.routeScoped && !hasPages) problems.push(`${k} 标了 routeScoped 却没有 pages —— 路由范围无从算起`);
    if (Array.isArray(e.pages)) {
      for (const pg of e.pages) {
        if (pg.includes("*")) { if (!expandPages({ pages: [pg] }, allPagesL).length) problems.push(`${k}.pages 的 glob 没匹配到任何 pages.json 页面:${pg}`); }
        else if (!fs.existsSync(path.join(ROOT, pg))) problems.push(`${k}.pages 里的页面文件不存在:${pg}`);
        else if (!pageFilesL.has(pg)) problems.push(`${k}.pages 里的文件不是 pages.json 登记的页面:${pg}`);
      }
      // 探针脚本里出现的路由字面(pages/x/y)必须被 pages 覆盖 —— 探针加了路由忘改清单会漂
      const declared = new Set(expandPages(e, allPagesL));
      for (const inp of e.inputs || []) {
        if (!/^scripts\/[^*?]+\.mjs$/.test(inp)) continue;
        let src = ""; try { src = fs.readFileSync(path.join(ROOT, inp), "utf8"); } catch { continue; }
        for (const m of src.matchAll(/["'`#/]pages\/([a-z0-9_-]+\/[a-z0-9_-]+)\b/g)) {
          const file = `src/pages/${m[1]}.vue`;
          if (pageFilesL.has(file) && !declared.has(file)) problems.push(`${k}: 探针 ${inp} 里出现路由 pages/${m[1]},但 pages 声明未覆盖 → 加进 pages`);
        }
      }
    }
    if (!e.always && !hasPages && (!e.inputs || !e.inputs.length)) problems.push(`${k} 既没 inputs / pages 也没 always —— 要么声明输入,要么显式 always:true`);
    if (e.kind && !["static", "runtime", "server", "test", "build", "meta"].includes(e.kind)) problems.push(`${k}.kind=${e.kind} 不认识`);
  }
  return problems;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && /verify-scope\.mjs$/.test(process.argv[1])) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (f) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : null; };
  if (cmd === "fingerprint") {
    const fp = treeFingerprint();
    if (!fp) { console.error("fingerprint: 不是 git 工作树"); process.exit(2); }
    console.log(JSON.stringify(fp));
  } else if (cmd === "changed") {
    const c = changedSet({ base: opt("--base") });
    if (!c) { console.error("changed: 算不出改动集"); process.exit(2); }
    console.log(JSON.stringify(c, null, 1));
  } else if (cmd === "plan") {
    const p = plan({ mode: opt("--mode") || "full" });
    const fmt = opt("--format") || "json";
    process.stdout.write(fmt === "shell" ? planToShell(p) : JSON.stringify(p, null, 1) + "\n");
  } else if (cmd === "lint") {
    const problems = lint();
    if (problems.length) { console.error("gates.manifest lint FAIL:\n  - " + problems.join("\n  - ")); process.exit(1); }
    const m = loadManifest();
    console.log(`gates.manifest lint PASS —— gates ${Object.keys(m.gates).length} · steps ${Object.keys(m.steps).length} · h5Probes ${Object.keys(m.h5Probes).length} · globals ${m.globals.length};全部接线一致、glob 均命中`);
  } else {
    console.error("usage: verify-scope.mjs fingerprint | changed [--base REF] | plan --mode full|scoped|static [--format json|shell] | lint");
    process.exit(2);
  }
}
