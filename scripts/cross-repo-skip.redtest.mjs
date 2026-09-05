#!/usr/bin/env node
// 红测:证明「缺兄弟仓 → skip」这条降级没有把真失败洗成绿。node scripts/cross-repo-skip.redtest.mjs
//
// 为什么必须有:把 ENOENT 硬红改成 skip,等于给门开了一个「没跑也不红」的口子。铁律禁的是
// 「依赖缺席就静默跳过」——危险的不是 skip 本身,是「绿 = 已验证」的误读。放行的前提有三条,
// 本文件逐条钉死(全部用真 spawn 跑真文件,不 mock):
//   A 仓在场 → 断言真跑、真能红:拿一个**内容全错**的假仓喂进去,缺仓时 skip 的那批必须
//     一条不剩地变成 fail。少一条 = 那条断言在仓到场时也没真验,skip 就是在掩护它。
//   B 仓缺席 → 只 skip 跨仓那些:纯本仓断言必须照跑(不连坐),且每条 skip 都带得出理由。
//   C 显式配了 env 却指向空气 = 配置错,必须硬抛,不许降级成 skip(否则「我明明配了仓」拿到假绿)。
//
// A 的假仓按下面 FAKE_FILES 铺;某个路径日后漂了、假仓里没这个文件,该断言会以 ENOENT 落进
// fail 集 —— 结论(skip 的那条到场就会跑)仍然成立,只是它红在读文件而不是红在比对。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const TARGETS = [
  "scripts/funds-run-scoped-isolation-contract.test.mjs",
  "scripts/funds-server-sandbox-contract.test.mjs",
  "scripts/h8-run-scoped-referral-projection-contract.test.mjs",
  "scripts/behavior-analytics-active-route-catalog-contract.test.mjs",
];
const FAKE_BACKEND_FILES = [
  "src/main/java/ffdd/opsconsole/finance/mapper/FundsSandboxMapper.java",
  "src/main/java/ffdd/opsconsole/finance/application/FundsSandboxService.java",
  "src/main/java/ffdd/opsconsole/finance/application/AppWithdrawalService.java",
  "src/main/java/ffdd/opsconsole/finance/mapper/AppWithdrawalMapper.java",
  "src/main/java/ffdd/opsconsole/growth/application/AppReferralRewardService.java",
  "src/main/java/ffdd/opsconsole/growth/mapper/ReferralRewardMapper.java",
  "scripts/migrations/20260811_funds_persistent_sandbox.sql",
  "scripts/migrations/20260812_funds_sandbox_run_scope.sql",
  "scripts/migrations/20260811_l6_h5_active_route_catalog.sql",
  "scripts/apply_startup_schema_migrations.ps1",
];
const FAKE_PC_FILES = ["lib/admin/h-client.ts"];
const WRONG = "// 假兄弟仓:内容故意全错,任何真跑的跨仓断言都必须在这里判红\n";

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`ok    ${m}`); };
const bad = (m) => { fail++; console.log(`FAIL  ${m}`); };

// TAP 形状稳定(`ok N - 名字` / `not ok N - 名字` / `ok N - 名字 # SKIP 理由`),
// 不像 spec reporter 的记号字形会随 node 版本漂。
function runTargets(env) {
  const res = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...TARGETS],
    { cwd: root, encoding: "utf8", env: { ...process.env, ...env } });
  const out = `${res.stdout || ""}${res.stderr || ""}`;
  const skipped = new Map(), passed = new Set(), failed = new Set();
  for (const line of out.split("\n")) {
    const okLine = line.match(/^ok \d+ - (.*?)(?: # SKIP ?(.*))?$/);
    if (okLine) { okLine[2] === undefined ? passed.add(okLine[1]) : skipped.set(okLine[1], okLine[2]); continue; }
    const notOk = line.match(/^not ok \d+ - (.*)$/);
    if (notOk) failed.add(notOk[1]);
  }
  return { status: res.status, out, skipped, passed, failed };
}

function withFakeRepos(run) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nexgrid-crossrepo-redtest-"));
  try {
    const backend = path.join(tmp, "nexion-backend"), pc = path.join(tmp, "nexion-ops-console");
    for (const [base, files] of [[backend, FAKE_BACKEND_FILES], [pc, FAKE_PC_FILES]]) {
      for (const rel of files) {
        const target = path.join(base, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, WRONG);
      }
    }
    return run({ backend, pc });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ── B 仓缺席(本机现状):只 skip 跨仓那些,本仓断言照跑,每条 skip 都有理由 ──────────────
// 判据对「后端仓其实在场」的机器同样成立(那台机器 skipped 为空,A 段照样跑)。
const baseline = runTargets({ NEXGRID_BACKEND_ROOT: "", NEXGRID_PC_ROOT: "" });
baseline.status === 0
  ? ok(`B 缺仓基线不红(pass ${baseline.passed.size} · skip ${baseline.skipped.size})`)
  : bad(`B 缺仓基线应为 0 fail,实际退出码 ${baseline.status};失败项:${[...baseline.failed].join(" / ") || "(解析不到)"}`);
baseline.passed.size > 0
  ? ok(`B 纯本仓断言未被连坐,${baseline.passed.size} 条照跑`)
  : bad("B 一条本仓断言都没跑通 —— 缺仓把整文件带崩了(连坐),这正是本次要修的病");
const reasonless = [...baseline.skipped].filter(([, why]) => !why?.trim()).map(([name]) => name);
reasonless.length === 0
  ? ok(`B ${baseline.skipped.size} 条 skip 全部带原因(no silent caps)`)
  : bad(`B 有 ${reasonless.length} 条 skip 没有原因,读起来跟跑过一样:${reasonless.join(" / ")}`);

// ── A 假仓在场:缺仓时 skip 的那批必须一条不剩地真跑并判红 ────────────────────────────
const fake = withFakeRepos(({ backend, pc }) =>
  runTargets({ NEXGRID_BACKEND_ROOT: backend, NEXGRID_PC_ROOT: pc }));
fake.skipped.size === 0
  ? ok("A 仓在场后一条都不再 skip")
  : bad(`A 仓明明在场却仍有 ${fake.skipped.size} 条 skip(解析漂了或判据写死):${[...fake.skipped.keys()].join(" / ")}`);
fake.failed.size > 0
  ? ok(`A 内容全错的假仓喂进去,${fake.failed.size} 条跨仓断言判红 —— 断言有牙`)
  : bad("A 假仓内容全错却一条都没红 —— 跨仓断言是空判据,skip 掩护的是一批本来就不会红的门");
const stillGreen = [...baseline.skipped.keys()].filter((name) => !fake.failed.has(name));
stillGreen.length === 0
  ? ok(`A 缺仓时 skip 的 ${baseline.skipped.size} 条,到场后逐条真跑真红`)
  : bad(`A 有 ${stillGreen.length} 条 skip 在仓到场时依然没红 —— skip 正在掩护它们:${stillGreen.join(" / ")}`);

// ── C 显式配了却指向空气:硬抛,不许降级成 skip ──────────────────────────────────────
const air = path.join(os.tmpdir(), "nexgrid-this-backend-does-not-exist");
assert.ok(!fs.existsSync(air), "红测前提:该路径必须不存在");
const configured = runTargets({ NEXGRID_BACKEND_ROOT: air });
configured.status !== 0 && configured.out.includes("NEXGRID_BACKEND_ROOT 指向的兄弟仓不存在")
  ? ok("C 显式配了却指向空气 → 硬抛,没降级成 skip")
  : bad(`C 配错路径居然没炸(退出码 ${configured.status})—— 「我明明配了仓」的人会拿到假绿`);

console.log(`\nresult: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
