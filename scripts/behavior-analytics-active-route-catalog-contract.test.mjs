import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveSiblingRepo } from "./lib/sibling-repo.mjs";

const pages = JSON.parse(readFileSync(new URL("../src/pages.json", import.meta.url), "utf8"));
// 原先兄弟仓写死 `../nexion-backend`,连 NEXGRID_BACKEND_ROOT 都不认;缺仓时整条目录门 ENOENT。
const { root: backendRoot, missing: backendMissing } = resolveSiblingRepo("nexion-backend", "NEXGRID_BACKEND_ROOT");
// Published migration checksums are immutable. New routes belong in additive migrations.
function catalogMigrations() {
  const installer = readFileSync(resolve(backendRoot, "scripts", "apply_startup_schema_migrations.ps1"), "utf8");
  const names = [...installer.matchAll(/scripts\\migrations\\([^"\r\n]+\.sql)/g)].map(([, name]) => name);
  assert.equal(new Set(names).size, names.length, "startup migrations must be registered once");
  const baseline = names.indexOf("20260811_l6_h5_active_route_catalog.sql");
  assert.ok(baseline >= 0, "the active catalog baseline must remain registered");
  return names.slice(baseline).map((name) => readFileSync(resolve(backendRoot, "scripts", "migrations", name), "utf8"));
}

function manifestRoutes() {
  // The native container reports its active business route, never a sixth analytics page.
  return pages.pages.filter(({ path }) => path !== "pages/tabs/tabs").map(({ path }) => `/${path}`).sort();
}

function catalogRoutes(sql) {
  const active = new Map();
  for (const [statement] of sql.matchAll(/(?:INSERT INTO|UPDATE)\s+nx_behavior_page_catalog\b[\s\S]*?;/gi)) {
    if (/^INSERT/i.test(statement)) {
      assert.match(statement, /ON DUPLICATE KEY UPDATE[\s\S]*tracked=1[\s\S]*is_deleted=0/);
      const rows = [...statement.matchAll(/\('(\/pages\/[^']+)'[^\n]*?\)/g)];
      assert.ok(rows.length > 0, "catalog inserts must expose their literal routes");
      for (const [, route] of rows) active.set(route, true);
    } else {
      assert.match(statement, /SET tracked=0,is_deleted=0,[\s\S]*WHERE route IN \(/);
      for (const [, route] of statement.matchAll(/'(\/pages\/[^']+)'/g)) {
        assert.ok(active.has(route), `retirement must retain an existing row: ${route}`);
        active.set(route, false);
      }
    }
  }
  return [...active].filter(([, tracked]) => tracked).map(([route]) => route).sort();
}

test("every normalized UniApp business page route has one tracked backend catalog row", { skip: backendMissing }, () => {
  const migration = catalogMigrations().join("\n");
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
