import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { resolveSiblingRepo } from "./lib/sibling-repo.mjs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

// 兄弟仓解析收口到 scripts/lib/sibling-repo.mjs(原先这里手写一份)。原始病灶是三处后端文件写死
// `D:/workspace/nexion-backend/...`、App 文件写死 `D:/workspace/NX1.0-UniApp/...`(该文件其实就在
// 本仓),且读取在**模块顶层** —— 换台机器整个文件顶层就崩,连纯本仓的那两条断言都跑不了(连坐)。
// 搬进 helper 又多修一层:linked worktree 里 `<appRoot>/..` 落在 .claude/worktrees/,仓在工作区根
// 也判成缺席 → 永久 skip;helper 用 git common-dir 反推主 checkout 兜底。语义不变:显式配了却指向
// 空气仍硬抛;缺仓 → 只让跨仓断言 skip,本仓断言照跑。
const { root: backendRoot, missing: backendMissing } = resolveSiblingRepo("nexion-backend", "NEXGRID_BACKEND_ROOT");
const readBackend = (relative) => fs.readFileSync(path.join(backendRoot, "src/main/java/ffdd/opsconsole/content", relative), "utf8");

const appApi = read("src/api/risk-disclosure-api.ts");

test("risk disclosure backend exposes explicit provenance and only local-sandbox may use mock", { skip: backendMissing }, () => {
  const service = readBackend("application/AppRiskDisclosureService.java");
  const view = readBackend("domain/AppRiskDisclosureView.java");
  const initializer = readBackend("application/RiskDisclosureLocalSandboxInitializer.java");
  assert.match(service, /getActiveProfiles\(\)[\s\S]*length == 1[\s\S]*local-sandbox/);
  assert.match(service, /localSandbox \? "SANDBOX"/);
  assert.match(service, /localSandbox \? "mock"/);
  assert.match(initializer, /@Profile\("local-sandbox"\)/);
  assert.match(initializer, /active\.length == 1 && "local-sandbox"\.equals\(active\[0\]\)/);
  // 生产/默认档 fail-closed:辖区没配就报错,不许 fallback 到任何本地文案。
  assert.match(service, /RISK_DISCLOSURE_JURISDICTION_NOT_CONFIGURED/);
  assert.match(view, /String source,/);
  assert.match(view, /String sourceEnvironment,/);
});

test("App parser accepts only server/production or explicit mock/sandbox provenance", () => {
  assert.match(appApi, /source: "server" \| "mock"/);
  assert.match(appApi, /sourceEnvironment: "PRODUCTION" \| "SANDBOX"/);
  assert.match(appApi, /source !== "server" && source !== "mock"/);
  assert.match(appApi, /source === "mock" && sourceEnvironment !== "SANDBOX"/);
  assert.match(appApi, /source === "server" && sourceEnvironment !== "PRODUCTION"/);
});

test("App has no local disclosure fallback and reads the server surface", () => {
  assert.match(appApi, /GET/);
  assert.doesNotMatch(appApi, /localStorage|mock.*fallback|fallback.*mock/i);
});
