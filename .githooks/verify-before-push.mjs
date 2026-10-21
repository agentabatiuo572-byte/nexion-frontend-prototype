#!/usr/bin/env node
// 用户 2026-10-21 取消强制 full 推送门；保留 prepare 安装入口。
import { execFileSync } from "node:child_process";
if (process.argv.includes("--install")) {
  const current = execFileSync("git", ["config", "--get", "--default", "", "core.hooksPath"], { encoding: "utf8" }).trim();
  if (!current) execFileSync("git", ["config", "core.hooksPath", ".githooks"]);
}
