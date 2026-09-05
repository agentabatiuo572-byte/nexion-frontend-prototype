import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("a refreshed server-mode account trace goes to login with a recoverable explanation", () => {
  const app = read("src/App.vue");
  const auth = read("src/store/auth.ts");
  const login = read("src/pages/login/login.vue");
  const zh = read("src/i18n/messages/zh.ts");
  const packageJson = JSON.parse(read("package.json"));

  assert.match(app, /function hasServerAuthenticatedAccountTrace\([\s\S]*?auth\.isAuthenticated[\s\S]*?auth\.accountId !== "default"/);
  assert.match(app, /function readServerAuthenticatedAccountTrace\([\s\S]*?uni\.getStorageSync\("nexgrid-auth-v1"\)[\s\S]*?isAuthenticated === true[\s\S]*?startsWith\("user:"\)/);
  assert.match(app, /hasPersistedServerAuthenticatedAccountTrace/);
  assert.match(auth, /export function hasPersistedServerAuthenticatedAccountTrace\(\): boolean/);
  assert.match(auth, /isAuthenticated === true[\s\S]*?startsWith\("user:"\)/);
  assert.match(auth, /"data" in record/);
  assert.match(app, /if \(remoteApiEnabled && \(!serverSession[\s\S]*?hasServerAuthenticatedAccountTrace\(auth\)[\s\S]*?\/pages\/login\/login\?notice=server-session-reload/);
  assert.match(app, /setRemoteUnauthorizedHandler\([\s\S]*?!sessionVault\.read\(\)[\s\S]*?hasServerAuthenticatedAccountTrace\(auth\)[\s\S]*?\/pages\/login\/login\?notice=server-session-reload/);
  assert.match(app, /let pendingServerSessionRecovery = false/);
  assert.match(app, /pendingServerSessionRecovery = requiresServerSessionRecovery/);
  assert.match(app, /if \(remoteApiEnabled && pendingServerSessionRecovery\)[\s\S]*?\/pages\/login\/login\?notice=server-session-reload/);
  assert.match(app, /if \(remoteApiEnabled && pendingServerSessionRecovery\)[\s\S]*?serverSession[\s\S]*?auth\.isAuthenticated[\s\S]*?auth\.accountId === `user:\$\{serverSession\.user\.userId\}`[\s\S]*?pendingServerSessionRecovery = false/,
    "a successful re-login must consume a stale recovery latch before its next guard tick");
  assert.match(app, /route\.startsWith\("pages\/login\/"\)\) pendingServerSessionRecovery = false/);
  assert.match(app, /if \(isAuthWhitelisted\(route\)\)[\s\S]*?route\.startsWith\("pages\/login\/"\)[\s\S]*?if \(remoteApiEnabled && pendingServerSessionRecovery\)/,
    "login must consume the recovery latch before any retrying redirect can run");
  assert.doesNotMatch(app, /sessionVault\.read\(\)[\s\S]{0,500}localStorage/);
  assert.match(login, /data-qa="server-session-reload-notice"/);
  assert.match(login, /notice === "server-session-reload"/);
  assert.match(login, /t\.login\.serverSessionReloadNotice/);
  assert.match(zh, /数据在服务端安全保存，重新登录即可恢复/);
  // 🔴 语言面三语齐点(门的门 ① 判据):只点一种语言时,另两种可以随意漂移而本门全绿。
  // 实测过的失败形态:语言豁免表不带语言维 → vi 真丢了占位符照样绿。
  // 中文钉原文(话术是产品决定),英/越钉**键存在** —— 这条是掉线后唯一的恢复指引,缺哪种语言哪种语言的用户就无路可走。
  for (const [loc, src] of [["en", read("src/i18n/messages/en.ts")], ["vi", read("src/i18n/messages/vi.ts")]]) {
    assert.match(src, /serverSessionReloadNotice:/, `${loc}.ts 缺 serverSessionReloadNotice`);
  }
  assert.match(packageJson.scripts["test:session-reload-recovery"] ?? "", /server-session-reload-recovery-contract\.test\.mjs/,
    "the recovery contract must have a named formal verification gear");
  assert.match(packageJson.scripts["test:session-reload-recovery"] ?? "", /verify-h5-runtime\.mjs --server-session-reload-recovery/,
    "the formal gear must execute its browser runtime proof against an isolated H5 server");
  // 包 ar(2026-08-17):npm run verify 改由 scripts/verify-chain.mjs 执行,步骤清单声明在 verify:steps(&& 串)。
  // 三段缺一不可:清单里有它 · verify 真的走 runner · runner 真的读这份清单 —— 少任何一段,门就成孤儿。
  assert.match(packageJson.scripts["verify:steps"] ?? "", /npm run test:production-boundaries && npm run test:session-reload-recovery && npm run test:guard-liveness/,
    "verify:steps must include recovery before the existing guard/build/runtime gates");
  assert.match(packageJson.scripts.verify ?? "", /scripts\/verify-chain\.mjs/, "npm run verify must execute the chain runner");
  assert.match(read("scripts/verify-chain.mjs"), /scripts\["verify:steps"\]/, "the chain runner must read its step list from verify:steps");
});
