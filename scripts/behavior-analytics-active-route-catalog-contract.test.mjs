import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveSiblingRepo } from "./lib/sibling-repo.mjs";

const pages = JSON.parse(readFileSync(new URL("../src/pages.json", import.meta.url), "utf8"));
// 原先兄弟仓写死 `../nexion-backend`,连 NEXGRID_BACKEND_ROOT 都不认;缺仓时整条目录门 ENOENT。
const { root: backendRoot, missing: backendMissing } = resolveSiblingRepo("nexion-backend", "NEXGRID_BACKEND_ROOT");
const migrationPath = resolve(backendRoot, "scripts", "migrations", "20260811_l6_h5_active_route_catalog.sql");

function manifestRoutes() {
  return pages.pages.map(({ path }) => `/${path}`).sort();
}

function catalogRoutes(sql) {
  return [...sql.matchAll(/^\('\/pages\/[^']+'(?:,[^\n]*)?\),?$/gm)]
    .map(([line]) => line.match(/^\('([^']+)'/)[1])
    .sort();
}

test("every normalized UniApp business page route has one tracked backend catalog row", { skip: backendMissing }, () => {
  const migration = readFileSync(migrationPath, "utf8");
  assert.deepEqual(catalogRoutes(migration), manifestRoutes());
  assert.match(migration, /ON DUPLICATE KEY UPDATE[\s\S]*tracked=1[\s\S]*is_deleted=0/);
});

test("runtime route normalization accepts exactly the pages.json route form", () => {
  const tracker = readFileSync(new URL("../src/services/behavior-analytics.ts", import.meta.url), "utf8");
  assert.ok(tracker.includes("return /^\\/pages\\/[a-z0-9-]+\\/[a-z0-9-]+$/.test(route) ? route : \"\";"));
  // 空集自查留在本仓这条:跨仓那条 skip 掉时,「pages.json 解析出 0 条路由」仍然必须判红,
  // 否则空清单会让上面的 deepEqual 在仓到场的那天变成「两个空数组相等」的假绿。
  const routes = manifestRoutes();
  assert.ok(routes.length > 0, "pages.json 必须解析出至少一条业务路由(禁空集全过)");
  assert.ok(routes.every((route) => /^\/pages\/[a-z0-9-]+\/[a-z0-9-]+$/.test(route)));
});
