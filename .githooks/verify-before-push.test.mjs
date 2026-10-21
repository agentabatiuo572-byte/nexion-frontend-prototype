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

test("正常推送不再要求 full 记录；仍保留 Git 非快进保护和既有 hooksPath", (t) => {
  const { root, repo, git } = fixture(t);
  const bare = join(root, "origin.git");
  execFileSync("git", ["init", "--bare", "-q", "-b", mainline, bare]);
  git("remote", "add", "origin", bare);
  git("push", "origin", mainline);
  const initial = git("rev-parse", "HEAD");
  mkdirSync(join(repo, ".verify-cache"));
  writeFileSync(join(repo, ".verify-cache/last-run.json"), "{stale");
  writeFileSync(join(repo, "next.txt"), "next\n");
  git("add", "next.txt");
  git("commit", "-q", "-m", "next");
  git("push", "origin", mainline);
  assert.equal(execFileSync("git", ["--git-dir", bare, "rev-parse", mainline], { encoding: "utf8" }).trim(), git("rev-parse", "HEAD"));
  assert.throws(() => git("push", "origin", `${initial}:refs/heads/${mainline}`), /non-fast-forward|fetch first/);
  git("config", "core.hooksPath", ".existing-hooks");
  execFileSync(process.execPath, [join(repo, ".githooks/verify-before-push.mjs"), "--install"], { cwd: repo });
  assert.equal(git("config", "--get", "core.hooksPath"), ".existing-hooks");
});
