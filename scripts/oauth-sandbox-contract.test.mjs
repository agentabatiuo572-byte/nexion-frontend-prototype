import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { resolveSiblingRepo } from "./lib/sibling-repo.mjs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

// 兄弟仓解析收口到 scripts/lib/sibling-repo.mjs(原先这里手写一份:env 优先 + 退兄弟位 + 缺仓转
// skip)。搬走的原因是那份手写解析在 linked worktree 里 `<appRoot>/..` 落在 .claude/worktrees/,
// 仓明明在工作区根也判成缺席 → 永久 skip;helper 用 git common-dir 反推主 checkout 兜底。
// 语义不变:显式配了却指向空气仍然硬抛(降级成 skip 会让「我明明配了仓」的人拿到假绿);
// 缺仓 → 只让跨仓断言 skip,本仓断言照跑(不连坐),理由随 reporter 打出来。
const { root: backendRoot, missing: backendMissing } = resolveSiblingRepo("nexion-backend", "NEXGRID_BACKEND_ROOT");
const readBackend = (relative) => fs.readFileSync(path.join(backendRoot, relative), "utf8");

test("OAuth exchange is a server call and the App rejects loose mock provenance", () => {
  const api = read("src/api/auth-api.ts");
  assert.match(api, /path: "\/auth\/users\/oauth\/sandbox\/challenge"/);
  assert.match(api, /path: "\/auth\/users\/oauth\/exchange"/);
  assert.match(api, /data\.source !== "mock" \|\| data\.sandbox !== true/);
});

test("OAuth sandbox backend keeps the explicit exchange endpoint and strict mock provenance", { skip: backendMissing }, () => {
  const backendController = readBackend("src/main/java/ffdd/opsconsole/auth/web/AppUserAuthController.java");
  const backendService = readBackend("src/main/java/ffdd/opsconsole/auth/application/AppUserOAuthService.java");
  const challengeService = readBackend("src/main/java/ffdd/opsconsole/auth/application/OAuthSandboxChallengeService.java");
  assert.match(backendController, /@PostMapping\("\/oauth\/sandbox\/challenge"\)/);
  assert.match(backendController, /@PostMapping\("\/oauth\/exchange"\)/);
  assert.match(backendService, /SANDBOX_MOCK/);
  assert.match(backendService, /OAUTH_PROVIDER_NOT_CONFIGURED/);
  assert.match(backendService, /OAUTH_PROVIDER_UNAVAILABLE/);
  assert.match(backendService, /userMapper\.ensureRegisteredUserWallet/);
  assert.match(backendService, /sandboxChallengeService\.consume/);
  assert.match(backendService, /auth\.oauth_sandbox_(account_created|login)/);
  assert.match(challengeService, /ConcurrentHashMap/);
  assert.match(challengeService, /AtomicReference/);
});

test("OAuth UI buttons invoke the server API and never persist provider subjects", () => {
  const providerGrid = read("src/components/auth-provider-grid.vue");
  assert.match(providerGrid, /emit\("select", provider\)/);
  assert.match(providerGrid, /@click="activate\('Passkey'\)"/);
  for (const file of ["src/pages/login/login.vue", "src/pages/register/register.vue"]) {
    const page = read(file);
    assert.match(page, /<AuthProviderGrid[^>]+@select="startOauth"/);
    assert.match(page, /authApi\.oauthExchange/);
    assert.doesNotMatch(page, /externalSubject|oauthSubject/);
    assert.doesNotMatch(page, /localStorage|sessionStorage/);
  }
});
