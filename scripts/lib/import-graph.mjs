// src/ 静态 import 图(包 ax,2026-08-17 主人拍板 A+B):给 verify 范围化算「一个页面/探针到底依赖哪些文件」。
//
// 为什么:gates.manifest 里手写 `src/store/**` 太粗 —— 碰任何 store 都让几乎所有运行时门全跑(tester-A P2)。
// 业界(Nx/Jest --findRelatedTests)都是按依赖图取 dependents;这里反向用:门声明它驱动的**页面**,
// 页面的 import 闭包 = 门的真实输入集;改动集 ∩ 闭包 ≠ ∅ 才跑,改了共享组件自然命中所有引用它的页面。
//
// 只做静态 import(`import x from "@/…"` / 相对路径 / `import("…")` / `require("…")`),不解析运行时字符串路由;
// 解析不到的说明符(裸包名 / 别名外)一律忽略;解析得到但文件不存在 → 忽略(保守方向由调用方兜:未声明照跑)。
// 也不理解 uni 条件编译 —— 条件编译块里的 import 一样算进闭包(宁多勿少)。
import fs from "node:fs";
import path from "node:path";

const EXTS = [".ts", ".vue", ".js", ".mjs", ".json", ".tsx"];
const SRC_RE = /\.(vue|ts|tsx|js|mjs)$/;
const IMPORT_RE = /(?:^|[^\w$])(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?["']([^"']+)["']|(?:import|require)\(\s*["']([^"']+)["']\s*\)/g;

export function listSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (SRC_RE.test(e.name)) out.push(p);
    }
  };
  walk(path.join(root, "src"));
  return out;
}

function resolveSpec(root, fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(root, "src", spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.resolve(path.dirname(fromFile), spec);
  else if (spec.startsWith("/src/")) base = path.join(root, spec.slice(1));
  else return null; // 裸包名 / 其它别名:不进图
  const cands = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => path.join(base, "index" + e))];
  for (const c of cands) { try { if (fs.statSync(c).isFile()) return c; } catch { /* next */ } }
  return null;
}

/** 建图:Map<相对路径(/ 分隔), Set<相对路径>>。 */
export function buildGraph(root) {
  const files = listSourceFiles(root);
  const rel = (p) => path.relative(root, p).replace(/\\/g, "/");
  const graph = new Map();
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const deps = new Set();
    let m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(src))) {
      const spec = m[1] || m[2];
      const r = resolveSpec(root, f, spec);
      if (r) deps.add(rel(r));
    }
    graph.set(rel(f), deps);
  }
  return graph;
}

/** 闭包:从若干入口出发,静态 import 能到达的全部文件(含入口)。 */
export function closure(graph, entries) {
  const seen = new Set(); const stack = [...entries].map((e) => e.replace(/\\/g, "/"));
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of graph.get(f) || []) if (!seen.has(d)) stack.push(d);
  }
  return seen;
}

/** pages.json 全部路由 → 页面文件(相对路径)。返回 [{route:"/pages/x/y", file:"src/pages/x/y.vue"}]。 */
export function pageRoutes(root) {
  const pj = JSON.parse(fs.readFileSync(path.join(root, "src/pages.json"), "utf8"));
  const out = [];
  for (const p of pj.pages || []) out.push({ route: "/" + p.path, file: `src/${p.path}.vue` });
  for (const g of pj.subPackages || []) for (const p of g.pages || []) out.push({ route: `/${g.root}/${p.path}`, file: `src/${g.root}/${p.path}.vue` });
  return out;
}

/** 受影响路由:页面闭包 ∩ 改动集 ≠ ∅ 的路由(改动集为 null → 全部)。 */
export function affectedRoutes(root, changedFiles, graph = buildGraph(root)) {
  const all = pageRoutes(root);
  if (!changedFiles) return { all: all.map((r) => r.route), affected: all.map((r) => r.route), reason: "改动集不可用 → 全部路由" };
  const changed = new Set(changedFiles.map((f) => f.replace(/\\/g, "/")));
  const affected = [];
  for (const r of all) {
    const cl = closure(graph, [r.file]);
    for (const f of cl) if (changed.has(f)) { affected.push(r.route); break; }
  }
  return { all: all.map((r) => r.route), affected, reason: `${affected.length}/${all.length} 路由的 import 闭包命中改动集` };
}

if (process.argv[1] && /import-graph\.mjs$/.test(process.argv[1])) {
  const root = process.argv[2] || path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..");
  const g = buildGraph(root);
  const entries = process.argv.slice(3);
  if (!entries.length) { console.log(`graph: ${g.size} files, ${[...g.values()].reduce((a, s) => a + s.size, 0)} edges`); process.exit(0); }
  const cl = closure(g, entries);
  console.log(JSON.stringify({ entries, closureSize: cl.size, files: [...cl].sort() }, null, 1));
}
