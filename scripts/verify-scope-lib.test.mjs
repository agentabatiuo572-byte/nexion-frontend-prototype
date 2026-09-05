// verify 范围化库的已知答案测试(包 ax,tester-F F-11:闭包/路由归一/决策一旦算窄,所有门静默缩范围,lint 测不到)。
//   ① import-graph:五种 import 写法 + 四种说明符解析 + 闭包 + pages.json 路由(合成 fixture,不碰真仓)
//   ② probe-routes:PROBE_ROUTES 归一(前导 / 与 query)、__none__ / * / 空串、并发数解析
//   ③ verify-scope 决策(真仓 + 注入改动集):单页 → 只该页;app 壳下游 → 全路由;交集空 → "*";已删 src → 全开;routeScoped 之外 routes 恒 "*"
// 挂在 test:probe-safety 步骤里(node --test),不另开链步骤。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGraph, closure, pageRoutes, affectedRoutes } from "./lib/import-graph.mjs";
import { normRoute, scopeRoutes, concurrencyFromEnv } from "./lib/probe-routes.mjs";
import { plan, routesOfDecision, expandPages, APP_SHELL_ROOTS, ROOT } from "./lib/verify-scope.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vscope-"));
  const w = (p, c) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), c); };
  w("src/pages.json", JSON.stringify({ pages: [{ path: "pages/a/a" }, { path: "pages/b/b" }], subPackages: [{ root: "sub", pages: [{ path: "c/c" }] }] }));
  w("src/pages/a/a.vue", `<script setup lang="ts">\r\nimport X from "@/components/x.vue";\r\nimport { l } from "./local";\r\nimport "../../styles/a.css";\r\nexport { z } from "/src/lib/z";\r\nconst lazy = () => import("@/lib/lazy");\r\nconst r = require("@/lib/req.js");\r\n</script>`);
  w("src/pages/a/local.ts", "export const l = 1;");
  w("src/pages/b/b.vue", `<script setup>import { s } from "@/store/s";</script>`);
  w("src/sub/c/c.vue", `<template><view/></template>`);
  w("src/components/x.vue", `<script setup>import { s } from "@/store/s"; import { d } from "@/lib/dir";</script>`); // dir → index 解析
  w("src/store/s.ts", `import { api } from "@/api/api"; export const s = 1;`);
  w("src/api/api.ts", "export const api = 1;");
  w("src/lib/z.ts", "export const z = 1;");
  w("src/lib/lazy.ts", "export default 1;");
  w("src/lib/req.js", "module.exports = 1;");
  w("src/lib/dir/index.ts", "export const d = 1;");
  w("src/styles/a.css", ".a{}");
  w("src/App.vue", `<script setup>import { shell } from "@/lib/shell-only";</script>`);
  w("src/lib/shell-only.ts", "export const shell = 1;");
  w("src/lib/orphan.ts", "export const o = 1;"); // 没人 import
  return root;
}

test("import-graph:五种 import 写法 + @/ ./ ../ /src/ + 目录 index 解析都进闭包", () => {
  const root = fixture();
  const g = buildGraph(root);
  const cl = closure(g, ["src/pages/a/a.vue"]);
  for (const f of ["src/components/x.vue", "src/pages/a/local.ts", "src/styles/a.css", "src/lib/z.ts", "src/lib/lazy.ts", "src/lib/req.js", "src/store/s.ts", "src/api/api.ts", "src/lib/dir/index.ts"]) {
    assert.ok(cl.has(f), `闭包应含 ${f},实际 ${[...cl].join(",")}`);
  }
  assert.ok(!cl.has("src/lib/orphan.ts"), "无人 import 的文件不在闭包里");
  assert.ok(!cl.has("src/App.vue"), "页面闭包不含 App.vue(壳另算)");
});

test("import-graph:pageRoutes 含 subPackages;affectedRoutes 只标闭包命中的路由", () => {
  const root = fixture();
  const routes = pageRoutes(root);
  assert.deepEqual(routes.map((r) => r.route), ["/pages/a/a", "/pages/b/b", "/sub/c/c"]);
  assert.equal(routes[2].file, "src/sub/c/c.vue");
  const g = buildGraph(root);
  assert.deepEqual(affectedRoutes(root, ["src/store/s.ts"], g).affected, ["/pages/a/a", "/pages/b/b"], "s.ts 被 a(经 x.vue)与 b 引用");
  assert.deepEqual(affectedRoutes(root, ["src/pages/a/local.ts"], g).affected, ["/pages/a/a"]);
  assert.deepEqual(affectedRoutes(root, ["src/lib/shell-only.ts"], g).affected, [], "壳下游不在任何页面闭包里 —— 这正是 plan() 里 APP_SHELL_ROOTS 要兜的缝");
  assert.deepEqual(affectedRoutes(root, null, g).affected.length, 3, "改动集不可用 → 全部");
});

test("probe-routes:normRoute 忽略前导 / 与 query;scopeRoutes 交集 / * / 空串 / __none__", () => {
  assert.equal(normRoute("/pages/x/y?a=1"), "pages/x/y");
  assert.equal(normRoute("pages/x/y/"), "pages/x/y");
  const all = ["/pages/x/y", "pages/z/z", "/#/pages/q/q?e=1"];
  const withEnv = (v, fn) => { const old = process.env.PROBE_ROUTES; if (v === undefined) delete process.env.PROBE_ROUTES; else process.env.PROBE_ROUTES = v; try { return fn(); } finally { if (old === undefined) delete process.env.PROBE_ROUTES; else process.env.PROBE_ROUTES = old; } };
  const key = (r) => r.replace(/^\/#/, "");
  assert.deepEqual(withEnv(undefined, () => scopeRoutes(all, "t", key)).routes, all, "未设 = 全量");
  assert.deepEqual(withEnv("", () => scopeRoutes(all, "t", key)).routes, all, "空串 = 全量");
  assert.deepEqual(withEnv("*", () => scopeRoutes(all, "t", key)).routes, all);
  assert.deepEqual(withEnv("pages/x/y,pages/q/q", () => scopeRoutes(all, "t", key)).routes, ["/pages/x/y", "/#/pages/q/q?e=1"], "无前导 / 的 env 也能对上带 / 与 #/ 的射程");
  assert.deepEqual(withEnv("__none__", () => scopeRoutes(all, "t", key)).routes, []);
  const oldC = process.env.PROBE_CONCURRENCY;
  process.env.PROBE_CONCURRENCY = "0"; assert.equal(concurrencyFromEnv(3), 3, "非法值回默认");
  process.env.PROBE_CONCURRENCY = "2.9"; assert.equal(concurrencyFromEnv(3), 2);
  delete process.env.PROBE_CONCURRENCY; assert.equal(concurrencyFromEnv(3), 3);
  if (oldC !== undefined) process.env.PROBE_CONCURRENCY = oldC;
});

test("verify-scope:routesOfDecision 空 / 缺省 / * 都回 *(绝不产出 0 扫描);expandPages 只认 * 与非空数组", () => {
  assert.equal(routesOfDecision({ run: true, routes: [] }), "*");
  assert.equal(routesOfDecision({ run: true }), "*");
  assert.equal(routesOfDecision({ run: true, routes: "*" }), "*");
  assert.equal(routesOfDecision({ run: true, routes: ["/pages/a/a", "pages/b/b"] }), "pages/a/a,pages/b/b", "去前导 /(MSYS 会改写以 / 开头的 env 值)");
  const pages = [{ route: "/pages/a/a", file: "src/pages/a/a.vue" }, { route: "/pages/b/b", file: "src/pages/b/b.vue" }];
  assert.deepEqual(expandPages({ pages: "*" }, pages), ["src/pages/a/a.vue", "src/pages/b/b.vue"]);
  assert.deepEqual(expandPages({ pages: ["src/pages/*/b.vue"] }, pages), ["src/pages/b/b.vue"]);
  assert.deepEqual(expandPages({ pages: "src/pages/a/a.vue" }, pages), [], "字符串不是合法声明(lint 会红)");
});

test("verify-scope.plan(真仓 + 注入改动集):单页 → 只该页;壳下游 → 全路由;已删 src → 全开;非 routeScoped 门 routes 恒 *", () => {
  const sim = (files) => ({ base: "sim", baseReason: "sim", files });
  const rank = "src/pages/team/rank.vue";
  assert.ok(fs.existsSync(path.join(ROOT, rank)), "已知答案页面存在");
  const p1 = plan({ mode: "scoped", changed: sim([rank]) });
  assert.equal(p1.mode, "scoped");
  assert.deepEqual(p1.routes.affected, ["/pages/team/rank"]);
  assert.equal(p1.gates["zero-border-runtime"].run, true);
  assert.deepEqual(p1.gates["zero-border-runtime"].routes, ["/pages/team/rank"]);
  assert.equal(p1.gates["dom-qa-runtime"].run, false, "rank 不在 dom-qa 射程(5 tab)内");
  assert.equal(p1.h5Probes["sticky-check"].run, true);
  // 壳下游:只被 App.vue 等壳根引用的模块 → 全路由 + 所有 pages 类门都跑。
  // 候选**动态**从图里找(tester-F R2-09:写死 retired-route-migrations.ts 一旦被删,整段断言静默消失);找不到候选就明说,不静默。
  {
    const g = buildGraph(ROOT);
    const shell = closure(g, APP_SHELL_ROOTS);
    const pageFiles = pageRoutes(ROOT).map((p) => p.file);
    const anyPage = closure(g, pageFiles);
    const shellOnly = [...shell].filter((f) => f.startsWith("src/lib/") && !anyPage.has(f) && !APP_SHELL_ROOTS.includes(f));
    assert.ok(shellOnly.length >= 1, "今天应存在「只被壳引用的 src/lib 模块」(如 retired-route-migrations / a11y-activate);若拓扑变了,请更新本断言而不是让它静默过");
    const p2 = plan({ mode: "scoped", changed: sim([shellOnly[0]]) });
    assert.equal(p2.routes.affected.length, p2.routes.all.length, `壳下游 ${shellOnly[0]} → 全部路由`);
    assert.equal(p2.h5Probes["auth-guard-verify"].run, true, "专测壳级行为的门必须跑(tester-F F-01)");
    assert.equal(p2.gates["dom-qa-runtime"].routes, "*");
  }
  for (const r of APP_SHELL_ROOTS) assert.ok(fs.existsSync(path.join(ROOT, r)), `壳根存在:${r}`);
  // 已删除的 src 文件 → 保守全开
  const p3 = plan({ mode: "scoped", changed: sim(["src/pages/gone/gone.vue"]) });
  assert.equal(p3.routes.affected.length, p3.routes.all.length);
  assert.equal(p3.gates["zero-border-runtime"].routes, "*");
  // 非 routeScoped 的门就算是 page-closure-hit,routes 也恒 *(F-09:不产出没人消费的假缩范围)
  const p4 = plan({ mode: "scoped", changed: sim(["src/pages/me/wallet-withdraw.vue"]) });
  assert.equal(p4.gates["withdraw-bill-runtime"].run, true);
  assert.equal(p4.gates["withdraw-bill-runtime"].routes, "*");
  assert.deepEqual(p4.gates["orphan-line-runtime"].routes, ["/pages/me/wallet-withdraw"]);
});
