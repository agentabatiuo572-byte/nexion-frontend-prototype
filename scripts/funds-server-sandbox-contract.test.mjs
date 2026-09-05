import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { resolveSiblingRepo } from "./lib/sibling-repo.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
// 原先 8 条本仓断言和 2 个后端文件读取全挤在**模块顶层**,缺兄弟仓时文件第 17 行就 ENOENT ——
// 本仓那 8 条被连坐,一条都没跑,而报出来的只是一句 ENOENT。改成 test() 分层:后端缺席只
// skip 跨仓那条(理由由 node reporter 打出来),本仓断言照跑。
const { root: backendRoot, missing: backendMissing } = resolveSiblingRepo("nexion-backend", "NEXGRID_BACKEND_ROOT");
const readBackend = (relative) => fs.readFileSync(path.join(backendRoot, relative), "utf8");

test("App keeps server funds modes authoritative and never finalizes funds in the browser", () => {
  const runtimeConfig = read("src/api/runtime-config.ts");
  const runtime = read("src/api/runtime.ts");
  const appStore = read("src/store/app.ts");
  const api = read("src/api/funds-sandbox-api.ts");
  assert.match(runtimeConfig, /"mock"\s*\|\s*"sandbox"\s*\|\s*"remote"/);
  assert.match(runtime, /fundsSandboxEnabled\s*=\s*apiRuntimeConfig\.mode\s*===\s*["']sandbox["']\s*&&\s*apiRuntimeConfig\.modeExplicit/);
  assert.match(api, /sourceEnvironment:\s*["']SANDBOX["']/);
  assert.match(api, /source:\s*["']mock["']/);
  assert.match(api, /Idempotency-Key|idempotencyKey/);
  assert.match(api, /expectedVersion/);
  assert.match(appStore, /if\s*\(fundsServerEnabled\)\s*return\s*\[\]/,
    "server funds modes must never let the client ETA promote withdrawals to confirmed");
  assert.doesNotMatch(api, /localStorage|uni\.setStorage|setTimeout/,
    "sandbox API must not persist or finalize funds in the browser");
});

test("backend withdrawal path keeps sandbox subjects out of real payouts", { skip: backendMissing }, () => {
  const withdrawalService = readBackend("src/main/java/ffdd/opsconsole/finance/application/AppWithdrawalService.java");
  const withdrawalMapper = readBackend("src/main/java/ffdd/opsconsole/finance/mapper/AppWithdrawalMapper.java");
  assert.match(withdrawalMapper, /Integer isSandboxUser/);
  assert.match(withdrawalMapper, /COALESCE\(sandbox,0\)=1/);
  const productionGuard = withdrawalService.slice(
    withdrawalService.indexOf("requireProductionWithdrawalSubject(userId);"),
    withdrawalService.indexOf("if (userId == null || mapper.lockActiveUser(userId)"),
  );
  assert.match(productionGuard, /requireProductionWithdrawalSubject\(userId\)/);
  assert.match(withdrawalService, /WITHDRAWAL_PRODUCTION_PROFILE_REQUIRED/);
  assert.match(withdrawalService, /WITHDRAWAL_SANDBOX_USER_FORBIDDEN/);
  assert.match(withdrawalService, /profiles\.length == 0[\s\S]*"production"\.equals\(profiles\[0\]\)/,
    "only default or an exact production profile can reach a real withdrawal");
});
