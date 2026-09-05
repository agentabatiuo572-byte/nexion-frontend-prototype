import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { resolveSiblingRepo } from "./lib/sibling-repo.mjs";

const root = resolve(import.meta.dirname, "..");
// 两个兄弟仓各自独立判缺席:后端喂前两条,PC 喂最后一条,本仓断言(appApi / card)谁都不依赖。
// 原先三个仓的读取全在模块顶层,缺任一仓 = 整个文件连本仓断言一起崩。
const { root: backend, missing: backendMissing } = resolveSiblingRepo("nexion-backend", "NEXGRID_BACKEND_ROOT");
const { root: pcRoot, missing: pcMissing } = resolveSiblingRepo("nexion-ops-console", "NEXGRID_PC_ROOT");
const readApp = (relative) => readFileSync(resolve(root, relative), "utf8");
const readBackend = (relative) => readFileSync(resolve(backend, relative), "utf8");

test("H8 sandbox referral snapshot is a current-RunID ledger projection, never a cumulative wallet projection", { skip: backendMissing }, () => {
  const service = readBackend("src/main/java/ffdd/opsconsole/growth/application/AppReferralRewardService.java");
  assert.match(service, /NEXION_ACCEPTANCE_RUN_ID/);
  assert.match(service, /H8AcceptanceSandboxProfileCondition\.isStrictIsolatedProfile/);
  assert.match(service, /appSandboxInvitedCount\(userId, effectiveAt, runId\)/);
  assert.match(service, /appSandboxPendingCount\(userId, effectiveAt, runId\)/);
  assert.match(service, /appSandboxPositiveSettlementCount\(userId, runId\)/);
  assert.match(service, /appSandboxSettlementCount\(userId, runId\)/);
  assert.match(service, /appVerifiedSandboxRewardSummary\(userId, runId\)/);
  assert.match(service, /appRecentVerifiedSandboxRewards\(userId, runId, limit\)/);
  assert.match(service, /sandbox \? lifetime : nz\(account\.walletNexAvailable\(\)\)/);
  assert.match(service, /sandbox \? runId : null/);
  assert.doesNotMatch(service, /SANDBOX_FACT_SOURCES = List\.of\([\s\S]*?nx_user_wallet/);
});

test("every App sandbox count, summary and history query is RunID-filtered", { skip: backendMissing }, () => {
  const mapper = readBackend("src/main/java/ffdd/opsconsole/growth/mapper/ReferralRewardMapper.java");
  for (const method of [
    "appSandboxInvitedCount", "appSandboxPendingCount", "appSandboxPositiveSettlementCount",
    "appSandboxSettlementCount", "appVerifiedSandboxRewardSummary", "appRecentVerifiedSandboxRewards",
  ]) assert.match(mapper, new RegExp(`${method}[\\s\\S]{0,170}@Param\\(\\\"runId\\\"\\)`));
  assert.match(mapper, /s\.run_id = #\{runId\}/);
  assert.match(mapper, /sandbox_ledger\.run_id = #\{runId\}/);
  assert.match(mapper, /PARTITION BY sandbox_ledger\.user_id, sandbox_ledger\.run_id/);
});

test("App validates and visibly labels the server-owned RunID", () => {
  const appApi = readApp("src/api/referral-reward-api.ts");
  const card = readApp("src/components/team/invite-earn-card.vue");
  assert.match(appApi, /runId: string \| null/);
  assert.match(appApi, /SANDBOX_FACTS = \["nx_h8_sandbox_referral_settlement", "nx_h8_sandbox_referral_ledger"\]/);
  assert.match(appApi, /sourceEnvironment === "SANDBOX"[\s\S]{0,700}runId/);
  assert.match(card, /RunID \{\{ sandboxRunId \}\}/);
});

test("PC rejects an overview whose RunID does not match the requested run", { skip: pcMissing }, () => {
  const pc = readFileSync(resolve(pcRoot, "lib/admin/h-client.ts"), "utf8");
  assert.match(pc, /overview\.runId !== runId/);
});
