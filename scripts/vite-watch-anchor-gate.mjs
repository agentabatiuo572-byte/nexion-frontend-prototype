#!/usr/bin/env node
// vite server.watch.ignored 锚定门(P-100)。
//
// 不变量:拉黑 .claude 的那条 ignore 必须锚在**本配置文件所在树**的绝对路径。
// 写成通配的 `**/.claude/**` 时,worktree(整棵树住在 <主 checkout>/.claude/worktrees/<name>/)
// 的全部源码会被一起拉黑 → dev server 永不跟进改动,且完全静默:改完 curl 回来仍是旧转译
// 产物,红测因此跑出假绿。实测代价见 docs/PORT-PITFALLS.md P-100。
//
// 判据走 vite 自己的 loadConfigFromFile —— 读的是**求值后**的配置(顺带证明 __dirname
// 注入在 ESM 配置下确实可用),不是对源码做文本猜测。
//
// 用法:node scripts/vite-watch-anchor-gate.mjs [--config <path>]
//   --config 用于红测:指向一份改坏的配置副本,门必须变红。

import path from "node:path";
import process from "node:process";
import { loadConfigFromFile } from "vite";

const argv = process.argv.slice(2);
const configFlag = argv.indexOf("--config");
const configPath = path.resolve(
  configFlag >= 0 ? argv[configFlag + 1] : path.join(process.cwd(), "vite.config.ts"),
);

const norm = (p) => p.replace(/\\/g, "/");
// Windows 路径大小写不敏感;判等前统一小写,免得 D:/ 与 d:/ 造假红。
const cmp = (p) => (process.platform === "win32" ? norm(p).toLowerCase() : norm(p));

const fail = (msg) => {
  console.log(`FAIL ${msg}`);
  process.exit(1);
};

const loaded = await loadConfigFromFile(
  { command: "serve", mode: "development" },
  configPath,
);
if (!loaded) fail(`读不到配置:${configPath}`);

const ignored = loaded.config?.server?.watch?.ignored;
if (!Array.isArray(ignored)) {
  fail("server.watch.ignored 不是数组 —— 本门只认数组形式的 ignore 清单(改了写法就同步改门)");
}

const selfDir = path.dirname(configPath);
const wanted = `${norm(selfDir)}/.claude/**`;
const claudeEntries = ignored.filter(
  (entry) => typeof entry === "string" && entry.includes(".claude"),
);

if (claudeEntries.length !== 1) {
  fail(
    `拉黑 .claude 的条目应恰好 1 条,实际 ${claudeEntries.length} 条:${JSON.stringify(claudeEntries)}`,
  );
}
if (cmp(claudeEntries[0]) !== cmp(wanted)) {
  fail(
    `.claude 的 ignore 没锚在本树 —— 期望 ${wanted},实际 ${claudeEntries[0]}。` +
      "通配写法会把 worktree 的全部源码一起拉黑(P-100)",
  );
}

console.log(`PASS vite watch ignore 锚定本树:${claudeEntries[0]}`);
