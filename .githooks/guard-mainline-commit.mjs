#!/usr/bin/env node
// 用户 2026-09-11 授权：本机验证通过后自动提交，不再逐笔要求人工例外。
// main 和 detached 候选工作树均验证；pre-push 的最终提交 full 门保持独立。
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureCommitCandidate } from "./commit-verification.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const git = (args, cwd) => execFileSync("git", args, {
  cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();

export function judgeCommit(repoDir) {
  let record;
  try { record = JSON.parse(readFileSync(path.join(repoDir, ".verify-cache", "last-run.json"), "utf8")); }
  catch { return { ok: false, why: "缺少可读取的本机验证记录，请运行 npm run verify" }; }
  if (record.mode !== "full" || record.verdict !== "pass" || record.treeMoved !== false) {
    return { ok: false, why: "最近一次验证不是稳定的 full 通过记录" };
  }
  const current = captureCommitCandidate(repoDir);
  if (!current) return { ok: false, why: "工作树与暂存树不一致或 Git 状态不可读取，请隔离本任务改动后验证" };
  const proof = record.commitCandidate;
  if (!proof || proof.head !== current.head || proof.tree !== current.tree) {
    return { ok: false, why: "待提交代码与本机验证记录不匹配，请暂存最终改动后运行 npm run verify" };
  }
  return { ok: true, why: "本机 full 验证通过，自动提交 tree " + current.tree.slice(0, 10), candidate: current, at: record.at };
}

function main() {
  try {
    const top = git(["rev-parse", "--show-toplevel"]);
    const config = JSON.parse(readFileSync(path.join(HERE, "config.json"), "utf8"));
    const mainline = process.env.PRE_COMMIT_MAINLINE || config.mainline || "main";
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], top);
    if (branch !== mainline && branch !== "HEAD") return;
    const result = judgeCommit(top);
    if (!result.ok) throw new Error(result.why);
    mkdirSync(path.join(top, ".verify-cache"), { recursive: true });
    appendFileSync(path.join(top, ".verify-cache", "commit-verified.log"), JSON.stringify({
      at: new Date().toISOString(), branch, ...result.candidate, verifiedAt: result.at,
    }) + "\n");
    process.stderr.write("[pre-commit] ✓ " + result.why + "；无需人工再次授权\n");
  } catch (error) {
    process.stderr.write("[pre-commit] 提交暂停：" + error.message + "\n验证通过后会自动放行，无须申请 ALLOW_MAIN_COMMIT。\n");
    process.exitCode = 1;
  }
}

if (process.argv[1] && /guard-mainline-commit\.mjs$/.test(process.argv[1]) && !process.argv.includes("--as-module")) main();
