#!/usr/bin/env node
// 契约测试登记门 + 执行器 —— node 直跑:
//   node scripts/run-contract-suite.mjs
//
// 背景(z1 判决包 P0-1,2026-08-10 独立审计抓出):c37e642 新增了 8 个契约测试文件,
// **两条门链一个都没接**;而本包的判决表还把其中 hard-block-k1 当成「删门后的替代防线」
// 引用 —— 空头支票。根因不是「谁忘了接」,而是**这个仓的测试文件天然可以变成孤儿**:
// 建一个新文件不需要任何登记动作,谁也不会红。
//
// 🔴 守的不变量:scripts/*.test.mjs 的**每一个文件**必须在下面的 REGISTRY 里显式登记
//   归属;登记不了就判红。新建测试文件而不登记 = 门红,不会静默成孤儿。
//   三种归属:
//     chain    — 由本执行器跑(接进 npm run verify)
//     elsewhere— 已由别的入口跑(写明是哪个,便于回查)
//     excluded — 明确不跑,必须写清原因(如依赖本机不存在的兄弟仓)
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCRIPTS = path.join(root, "scripts");

const REGISTRY = {
  // ── chain:本执行器跑(原孤儿,z1 接入)──
  "hard-block-auth-contract.test.mjs": { how: "chain" },
  "hard-block-d5-runtime-contract.test.mjs": { how: "chain" },
  "hard-block-h9-runtime-contract.test.mjs": { how: "chain" },
  "hard-block-k1-runtime-contract.test.mjs": { how: "chain" },
  "hard-block-k6-runtime-contract.test.mjs": { how: "chain" },
  "g-remote-authority-contract.test.mjs": { how: "chain" },
  "g-remote-authority-behavior.test.mjs": { how: "chain" },
  "frontend-mock-mode-contract.test.mjs": { how: "chain" },
  "final-trust-market-contract.test.mjs": { how: "chain" },
  "keyboard-submit-contract.test.mjs": { how: "chain" },
  "leadership-pool-consumers.test.mjs": { how: "chain" },
  "withdraw-terminal-reason-parity.test.mjs": { how: "chain" },
  "withdraw-idempotency-contract.test.mjs": { how: "chain" },
  "gen2-withdraw-closure-contract.test.mjs": { how: "chain" },
  "purchase-eligibility-ui-contract.test.mjs": { how: "chain" },
  "purchase-eligibility-checkout-contract.test.mjs": { how: "chain" },
  "final-commerce-closure-contract.test.mjs": { how: "chain" },
  "remote-journey-closure-contract.test.mjs": { how: "chain" },
  "remote-truth-boundary-contract.test.mjs": { how: "chain" },
  "remote-config-merge-contract.test.mjs": { how: "chain" },
  "remaining-feature-authority-contract.test.mjs": { how: "chain" },
  "nova-local-ai-contract.test.mjs": { how: "chain" },
  "compute-share-server-enrollment-contract.test.mjs": { how: "chain" },
  "remaining-feature-closure-contract.test.mjs": { how: "chain" },
  "phase-isolation-contract.test.mjs": { how: "chain" },
  "server-product-phase-catalog-contract.test.mjs": { how: "chain" },
  "social-facts-authority-contract.test.mjs": { how: "chain" },
  "store-catalog-deeplink-contract.test.mjs": { how: "chain" },
  "tradein-account-switch-contract.test.mjs": { how: "chain" },
  "tradein-remote-authority-contract.test.mjs": { how: "chain" },
  "oauth-sandbox-contract.test.mjs": { how: "chain" },
  "risk-disclosure-sandbox-contract.test.mjs": { how: "chain" },
  "external-market-removal-contract.test.mjs": { how: "chain" },
  "remote-external-data-hold-contract.test.mjs": { how: "chain" },
  "withdraw-p0-contract.test.mjs": { how: "chain" },
  "auth-entry-ui-contract.test.mjs": { how: "chain" },
  "identity-device-sandbox-contract.test.mjs": { how: "chain" },
  // ── 同事 2026-08-12 批次新增(收口会话据实登记:29 进链 · 1 缺兄弟仓)──
  "country-code-selector-contract.test.mjs": { how: "chain" },
  "e18-e20-runtime-consumer-contract.test.mjs": { how: "chain" },
  "g2-swap-idempotency-behavior.test.mjs": { how: "chain" },
  "g2-swap-idempotency-contract.test.mjs": { how: "chain" },
  "h2-h3-m-runtime-acceptance-contract.test.mjs": { how: "chain" },
  "h2-trial-enum-contract.test.mjs": { how: "chain" },
  "h2-trial-remote-api.test.mjs": { how: "chain" },
  "h3-h8-server-authority-contract.test.mjs": { how: "chain" },
  "h3-quest-race.test.mjs": { how: "chain" },
  "h5-api-proxy-contract.test.mjs": { how: "chain" },
  "i-nova-notification-runtime.test.mjs": { how: "chain" },
  "product-catalog-visible-entry-contract.test.mjs": { how: "chain" },
  "server-login-identity-projection-contract.test.mjs": { how: "chain" },
  "weekly-quest-race.test.mjs": { how: "chain" },
  // ── 2026-08-12 同事第二批新增(收口据实登记:4 进链 · 2 缺兄弟仓 · 1 与拍板相反)──
  "remote-registration-unknown-result-contract.test.mjs": { how: "chain" },
  // 🔴 这批「跨仓」文件不是「缺仓就整份不跑」:兄弟仓缺席时只有跨仓那几条 test 带理由 skip,
  //    同文件里纯本仓的断言照跑(不连坐)。skip 不掩护真失败由 scripts/cross-repo-skip.redtest.mjs
  //    钉死(仓在场 → 那批 skip 必须逐条真跑真红),它挂在 test:cross-repo 末尾。
  "funds-run-scoped-isolation-contract.test.mjs": {
    how: "elsewhere",
    by: "npm run test:cross-repo(NEXGRID_BACKEND_ROOT 或兄弟仓 nexion-backend;缺仓 → 跨仓断言可见 skip,本仓断言照跑)",
  },
  "h8-run-scoped-referral-projection-contract.test.mjs": {
    how: "elsewhere",
    by: "npm run test:cross-repo(NEXGRID_BACKEND_ROOT/NEXGRID_PC_ROOT 或标准兄弟仓;两仓各自独立判缺席,缺谁 skip 谁)",
  },
  "funds-production-withdrawal-hold-contract.test.mjs": {
    how: "excluded",
    why: "该门断言「生产提现必须在发出请求前停住(HOLD)」,与主人 2026-08-12 拍板 B 相反 —— 拍板保留真实提现、用「同一笔意图冻结同一把幂等键」防重试变二次出账(其前提「本 App 没有可靠的订单终态回读契约」经回源核实不成立:GET /api/withdrawals/{单号} 存在,withdraw-status-mirror 门 25/0 端到端验证可用)。2026-08-16 复核补记:拍板的实现(16bddf0)已把 FUNDS_PRODUCTION_WITHDRAWAL_HOLD 从 src 删干净(全仓 0 命中),本门现在是**被测对象已不存在**的死门,单跑必红 —— 不是「能跑但结论相反」。若日后改回 HOLD,连同该常量一起恢复再移回 chain;否则按删除纪律 Move 到 .trash 更干净(留着待主人裁决)。",
  },
  "funds-sandbox-immediate-closure-contract.test.mjs": {
    how: "excluded",
    why: "旧多模式资金页面契约要求已删除的 frontend sandbox switch；高保真现已固定 local mock，不能再用该断言裁决运行轨。",
  },
  // ── elsewhere:已有入口在跑 ──
  "behavior-analytics-active-route-catalog-contract.test.mjs": {
    how: "elsewhere",
    by: "npm run test:cross-repo(NEXGRID_BACKEND_ROOT 或兄弟仓 nexion-backend;缺仓 → 目录 parity 那条可见 skip,路由归一那条照跑)",
  },
  "behavior-analytics-auth-lifecycle-contract.test.mjs": { how: "elsewhere", by: "npm run test:real-backend-integration" },
  "e20-device-e3-api-behavior.test.mjs": { how: "elsewhere", by: "npm run test:real-backend-integration" },
  "funds-mutation-key-behavior.test.mjs": { how: "elsewhere", by: "npm run test:production-boundaries" },
  "funds-recoverable-operation-behavior.test.mjs": { how: "elsewhere", by: "npm run test:production-boundaries" },
  "funds-sandbox-ledger-behavior.test.mjs": { how: "elsewhere", by: "npm run test:production-boundaries" },
  "funds-sandbox-visible-label-contract.test.mjs": { how: "elsewhere", by: "npm run test:production-boundaries" },
  "funds-sandbox-withdrawal-contract.test.mjs": { how: "elsewhere", by: "npm run test:production-boundaries" },
  "funds-server-sandbox-contract.test.mjs": {
    how: "elsewhere",
    by: "npm run test:cross-repo(支持 NEXGRID_BACKEND_ROOT 或兄弟仓 nexion-backend)",
  },
  "funds-server-sandbox-regression.test.mjs": { how: "elsewhere", by: "npm run test:production-boundaries" },
  "h8-first-user-truth-contract.test.mjs": { how: "elsewhere", by: "npm run test:production-boundaries" },
  "h8-sandbox-referral-bill-contract.test.mjs": { how: "elsewhere", by: "npm run test:production-boundaries" },
  "janus-h5-executor-hold-contract.test.mjs": { how: "elsewhere", by: "npm run test:production-boundaries" },
  "kl-sandbox-executor-contract.test.mjs": { how: "elsewhere", by: "npm run test:production-boundaries" },
  "m-support-authority-contract.test.mjs": { how: "elsewhere", by: "npm run test:real-backend-integration" },
  "server-auth-config-authority-contract.test.mjs": { how: "elsewhere", by: "npm run test:real-backend-integration" },
  "server-session-reload-recovery-contract.test.mjs": { how: "elsewhere", by: "npm run test:session-reload-recovery" },
  "kyc-removal-contract.test.mjs": { how: "elsewhere", by: "npm run test:kyc-removal" },
  "probe-safety-contract.test.mjs": { how: "elsewhere", by: "npm run test:probe-safety" },
  "static-review-routes.test.mjs": { how: "elsewhere", by: "npm run test:probe-safety" },
  "verify-scope-lib.test.mjs": { how: "elsewhere", by: "npm run test:probe-safety(包 ax:import 图 / 路由归一 / 范围决策已知答案)" },
  "earnings-accrual-contract.test.mjs": { how: "elsewhere", by: "npm run test:earnings-accrual(需 --experimental-strip-types)" },
  "janus-stop-cancellation.test.mjs": { how: "elsewhere", by: "npm run test:janus-stop-cancellation + verify.sh" },
  "a11y-activate-behavior.test.mjs": { how: "elsewhere", by: "npm run test:a11y-activate + verify.sh 的 a11y_activate_gate(import .ts 源,需 type stripping)" },
  "learning-submission.test.mjs": { how: "elsewhere", by: "npm run test:learning-contracts(import .ts 源,需 type stripping)" },
  // ── excluded:写清原因 ──
  "learning-api-contract.test.mjs": {
    how: "excluded",
    why: "该旧 Node-ESM 副本无法解析 learning-api.ts 的无扩展名相对导入；等价且更新的 src/api/learning-api-contract.test.ts 已由 npm run test:real-backend-integration 通过 Vitest 执行。",
  },
  "h-remote-authority-contract.test.mjs": {
    how: "excluded",
    why: "旧 H8 断言要求注册页直接调用 authApi.register；当前注册已收口到 completeRemoteRegistration 编排并由更新的 registration 合约覆盖。其余 H3-H7 判据已有 chain/production-boundaries 等价覆盖，待拆除过期 H8 断言后再入链。",
  },
};

// 🔴 登记表自查:同名键写两遍时 JS **后写覆盖先写,不报错** —— 前面那份成了死声明。
// 现场(2026-08-12 收口):两次合并各自把一批测试登进来,合出 74 行登记、去重只有 56,
// 18 个键各有一份死声明躺在文件里;而本门用的是 Object.keys(REGISTRY),看到的是去重后的 56,
// 于是「56/56 全登记」报得理直气壮,没人知道其中 18 条的分类根本没生效。
// 判据只能扫**源文本**,不能扫解析后的对象 —— 对象里重复早就没了。
function assertNoDuplicateRegistryKeys() {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const lines = [...src.matchAll(/^\s{2}"([\w.-]+\.test\.mjs)":/gm)].map((m) => m[1]);
  if (lines.length < Object.keys(REGISTRY).length) {
    console.log(`FAIL  登记表源文本只扫出 ${lines.length} 行,少于对象里的 ${Object.keys(REGISTRY).length} 个键 —— 判据失效,判红`);
    process.exit(1);
  }
  const seen = new Set(); const dup = new Set();
  for (const k of lines) { if (seen.has(k)) dup.add(k); seen.add(k); }
  if (dup.size) {
    console.log(`FAIL  登记表有 ${dup.size} 个重复键(后写静默覆盖先写,前面那份是死声明):`);
    for (const k of dup) console.log(`        ${k}`);
    process.exit(1);
  }
}
assertNoDuplicateRegistryKeys();


const found = readdirSync(SCRIPTS).filter((f) => f.endsWith(".test.mjs")).sort();
if (found.length === 0) {
  console.error("FAIL 扫不到任何 *.test.mjs —— 判据失效必红(禁空集全过)");
  process.exit(1);
}
const unregistered = found.filter((f) => !REGISTRY[f]);
const stale = Object.keys(REGISTRY).filter((f) => !found.includes(f));
if (unregistered.length || stale.length) {
  if (unregistered.length) console.error(`FAIL 未登记的契约测试(新建即孤儿的根因):${unregistered.join(", ")}\n  → 在 scripts/run-contract-suite.mjs 的 REGISTRY 里登记归属(chain / elsewhere / excluded+原因)`);
  if (stale.length) console.error(`FAIL 登记表里有磁盘上不存在的文件(改名/删除未同步):${stale.join(", ")}`);
  process.exit(1);
}

const chain = found.filter((f) => REGISTRY[f].how === "chain");
const elsewhereN = found.filter((f) => REGISTRY[f].how === "elsewhere").length;
const excluded = found.filter((f) => REGISTRY[f].how === "excluded");
for (const f of excluded) console.log(`  SKIP(登记在案)${f} — ${REGISTRY[f].why}`);

// --import:给 chain 里那些 import 仓内 .ts 跑真实现的测试补「无扩展名相对导入」的兜底解析
// (Node 原生 ESM 不补全,Vite/vitest 补;详见 scripts/lib/ts-ext-resolve.mjs)。只在解析失败后兜底,
// 真缺模块照抛。Windows 上 --import 必须给 file:// URL,裸路径会 ERR_UNSUPPORTED_ESM_URL_SCHEME。
const tsExtResolve = pathToFileURL(path.join(SCRIPTS, "lib", "ts-ext-resolve.mjs")).href;
const res = spawnSync(process.execPath, ["--import", tsExtResolve, "--test", ...chain.map((f) => path.join("scripts", f))], {
  cwd: root, encoding: "utf8", stdio: "pipe",
});
const out = res.stdout || "";
// 🔴 skip 必须打出来。原过滤器只放行 pass/fail 汇总,`ℹ skipped N` 与逐条 skip 理由被吞掉 ——
// 于是「某条跨仓断言这台机器根本没验」在结果里看不见,读起来跟全验过一模一样(no silent caps)。
// 认 skip 行不靠 reporter 的记号字形(易随 node 版本漂),认「(耗时) # 理由」这个形状:pass 行没有 `# `。
const skipLines = out.split("\n").filter((l) => /\(\d[\d.]*ms\) # /.test(l));
const skippedN = Number((out.match(/^.{0,4}skipped (\d+)\s*$/m) || [])[1] || 0);
process.stdout.write(out.split("\n").filter((l) => /^. (pass|fail|skipped)|^not ok|^# Subtest|Error/.test(l)).join("\n") + "\n");
if (res.status !== 0) {
  process.stderr.write(out);
  process.stderr.write(res.stderr || "");
  console.error(`FAIL 契约测试套件失败(chain ${chain.length} 个)`);
  process.exit(1);
}
// 判据自查:数得出 N 条却打不出 N 行(或反之)= 解析漂了,报告在替它自己说谎 —— 按本文件既有风格判红。
if (skipLines.length !== skippedN) {
  console.log(`FAIL  skip 统计与明细对不上(汇总 ${skippedN} 条 / 明细 ${skipLines.length} 行)—— 判据失效,判红`);
  process.exit(1);
}
console.log(`contract-suite PASS — chain ${chain.length} 跑过 · elsewhere ${elsewhereN} 由别的入口跑 · excluded ${excluded.length} 登记在案 · 登记覆盖 ${found.length}/${found.length}${skippedN ? ` · ⚠ skip ${skippedN} 条(未验证)` : ""}`);
for (const l of skipLines) console.log(`  ⚠ SKIP ${l.trim()}`);
