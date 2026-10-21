import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const hooks = dirname(fileURLToPath(import.meta.url));
const mainline = JSON.parse(readFileSync(join(hooks, "config.json"), "utf8")).mainline;
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "task-validation-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  mkdirSync(repo);
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q", "-b", mainline);
  git("config", "user.email", "hook-test@example.invalid");
  git("config", "user.name", "Hook test");
  cpSync(hooks, join(repo, ".githooks"), { recursive: true });
  chmodSync(join(repo, ".githooks/pre-commit"), 0o755);
  chmodSync(join(repo, ".githooks/pre-push"), 0o755);
  execFileSync(process.execPath, [join(repo, ".githooks/verify-before-push.mjs"), "--install"], { cwd: repo });
  writeFileSync(join(repo, ".gitignore"), ".verify-cache/\n");
  git("add", ".githooks", ".gitignore");
  git("commit", "-q", "-m", "initial without full record");
  return { root, repo, git };
}

test("正常提交不再要求 full 记录，保留未暂存业务改动", (t) => {
  const { repo, git } = fixture(t);
  mkdirSync(join(repo, ".verify-cache"));
  writeFileSync(join(repo, ".verify-cache/last-run.json"), JSON.stringify({ mode: "full", verdict: "fail" }));
  writeFileSync(join(repo, "task.txt"), "task\n");
  git("add", "task.txt");
  writeFileSync(join(repo, "task.txt"), "unrelated WIP\n");
  git("commit", "-q", "-m", "task without repeated full");
  assert.equal(git("show", "HEAD:task.txt"), "task");
  assert.equal(readFileSync(join(repo, "task.txt"), "utf8"), "unrelated WIP\n");
  assert.equal(git("status", "--porcelain").trim(), "M task.txt");
});
