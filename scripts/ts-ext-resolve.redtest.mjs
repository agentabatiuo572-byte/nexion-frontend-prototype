#!/usr/bin/env node
// scripts/lib/ts-ext-resolve.mjs 的红测:证明那个兜底解析**只补扩展名,不吞真缺失**。
//
// why:兜底解析天生有「把真缺的模块也糊过去」的风险 —— 那样最坏:模块真没了,门却绿着。
// 本红测先证起点(靶真的进了兜底分支),再证结果(该绿的绿、该红的红)。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const HOOK = pathToFileURL(path.join(SCRIPTS, "lib", "ts-ext-resolve.mjs")).href;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexgrid-ts-ext-"));

// 靶① 无扩展名相对导入,目标 .ts 真实存在 → 兜底应补上并跑通
fs.writeFileSync(path.join(dir, "leaf.ts"), "export const answer: number = 42;\n");
fs.writeFileSync(path.join(dir, "mid.ts"), 'import { answer } from "./leaf";\nexport const doubled = answer * 2;\n');
fs.writeFileSync(path.join(dir, "ok.mjs"), 'import { doubled } from "./mid.ts";\nif (doubled !== 84) { throw new Error("bad"); }\nconsole.log("OK");\n');

// 靶② 无扩展名相对导入,任何候选都不存在 → 必须原样红,不许被兜底吞掉
fs.writeFileSync(path.join(dir, "missing.mjs"), 'import "./definitely-not-here";\nconsole.log("SHOULD NOT REACH");\n');

const run = (file, withHook) => spawnSync(
  process.execPath,
  withHook ? ["--import", HOOK, path.join(dir, file)] : [path.join(dir, file)],
  { encoding: "utf8" },
);

// 起点证明:不挂 hook 时靶① 必须是红的(否则它压根没走兜底分支,后面的绿说明不了任何事)
const baseline = run("ok.mjs", false);
assert.notEqual(baseline.status, 0, "靶①在无 hook 时就能过 —— 说明它没进兜底分支,本红测失效");
assert.match(`${baseline.stderr}`, /ERR_MODULE_NOT_FOUND/);

const resolved = run("ok.mjs", true);
assert.equal(resolved.status, 0, `挂上 hook 后靶①仍失败:${resolved.stderr}`);
assert.match(`${resolved.stdout}`, /OK/);

const missing = run("missing.mjs", true);
assert.notEqual(missing.status, 0, "真缺模块被兜底吞掉了 —— 这正是本红测要防的最坏情况");
assert.match(`${missing.stderr}`, /ERR_MODULE_NOT_FOUND/);
assert.doesNotMatch(`${missing.stdout}`, /SHOULD NOT REACH/);

fs.rmSync(dir, { recursive: true, force: true }); // ALLOW-HARD-DELETE:本红测自建的临时靶,非仓内文件
console.log("ts-ext-resolve redtest PASS — 补扩展名生效(靶①无 hook 红/有 hook 绿)· 真缺模块照红(靶②)");
