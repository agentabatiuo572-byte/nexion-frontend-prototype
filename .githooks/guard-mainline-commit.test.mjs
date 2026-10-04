// 自动提交门：临时 Git 仓库中的行为测试，不修改业务数据。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { captureCommitCandidate, verifiedCommitCandidate } from "./commit-verification.mjs";

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HOOK_DIR, "guard-mainline-commit.mjs");
const MAINLINE = JSON.parse(readFileSync(join(HOOK_DIR, "config.json"), "utf8")).mainline;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "verified-commit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const write = (file, text) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  git("init", "-q", "-b", MAINLINE);
  git("config", "user.email", "hook-test@example.invalid");
  git("config", "user.name", "Hook test");
  write(".gitignore", ".verify-cache/\n");
  write("a.txt", "original\n");
  git("add", ".gitignore", "a.txt");
  git("commit", "-q", "-m", "initial");
  const stage = (file = "a.txt", text = "changed\n") => { write(file, text); git("add", "--", file); };
  const record = (over = {}) => {
    const value = {
      mode: "full", verdict: "pass", treeMoved: false,
      commitCandidate: captureCommitCandidate(root), at: new Date().toISOString(), ...over,
    };
    write(".verify-cache/last-run.json", JSON.stringify(value));
    return value;
  };
  const run = (env = {}) => spawnSync(process.execPath, [HOOK], {
    cwd: root, encoding: "utf8", env: { ...process.env, ...env },
  });
  const install = () => {
    for (const file of ["pre-commit", "guard-mainline-commit.mjs", "commit-verification.mjs", "config.json"]) {
      mkdirSync(join(root, ".githooks"), { recursive: true });
      copyFileSync(join(HOOK_DIR, file), join(root, ".githooks", file));
    }
    if (process.platform !== "win32") chmodSync(join(root, ".githooks/pre-commit"), 0o755);
    git("add", ".githooks");
    git("config", "core.hooksPath", ".githooks");
  };
  const commit = () => spawnSync("git", ["-C", root, "commit", "-q", "-m", "verified change"], { encoding: "utf8" });
  return { root, git, write, stage, record, run, install, commit };
}

test("缺少记录时阻止提交；旧 ALLOW_MAIN_COMMIT 不能代替测试", (t) => {
  const f = fixture(t); f.stage();
  const result = f.run({ ALLOW_MAIN_COMMIT: "historical authorization" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /缺少可读取的本机验证记录/);
});

test("多文件、docs/changes 及已有未推提交都在验证匹配后自动放行并留痕", (t) => {
  const f = fixture(t);
  for (let i = 0; i < 68; i++) f.stage("docs/changes/" + i + ".md", "content\n");
  f.install();
  const proof = f.record().commitCandidate;
  const result = f.commit();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git("rev-parse", "HEAD^{tree}"), proof.tree);
  const log = JSON.parse(readFileSync(join(f.root, ".verify-cache/commit-verified.log"), "utf8").trim());
  assert.equal(log.tree, proof.tree);
  assert.equal(log.branch, MAINLINE);
  f.stage("second.txt", "second\n");
  assert.notEqual(f.commit().status, 0, "旧验证不能放行下一笔提交");
  f.record();
  assert.equal(f.commit().status, 0, "重新验证后无需人工授权");
});

for (const [label, over] of [
  ["失败", { verdict: "fail" }], ["仍在运行", { verdict: "running" }],
  ["static", { mode: "static" }], ["scoped", { mode: "scoped" }],
  ["树移动", { treeMoved: true }], ["缺少树稳定证据", { treeMoved: undefined }],
  ["没有候选树", { commitCandidate: null }],
]) {
  test(label + "记录不能自动提交", (t) => {
    const f = fixture(t); f.stage(); f.record(over);
    assert.equal(f.run().status, 1);
  });
}

test("JSON 损坏时失败关闭", (t) => {
  const f = fixture(t); f.stage(); f.write(".verify-cache/last-run.json", "{bad");
  assert.equal(f.run().status, 1);
});

test("暂存代码在测试后变化，真实 pre-commit 阻止提交", (t) => {
  const f = fixture(t); f.stage(); f.install(); f.record(); f.stage("a.txt", "later\n");
  assert.notEqual(f.commit().status, 0);
});

test("未暂存改动和未跟踪源码不会混进已测试提交", (t) => {
  const f = fixture(t); f.stage(); f.record(); f.write("a.txt", "unstaged\n");
  assert.equal(captureCommitCandidate(f.root), null);
  assert.equal(f.run().status, 1);
  f.write("a.txt", "changed\n"); f.write("not-staged.ts", "export {};\n");
  assert.equal(captureCommitCandidate(f.root), null);
  assert.equal(f.run().status, 1);
});

test("HEAD 变化即使暂存树相同也必须重验", (t) => {
  const f = fixture(t); f.stage(); f.record();
  f.git("commit", "-q", "--allow-empty", "-m", "parent changed");
  assert.equal(f.run().status, 1);
});

for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
  test(flag + " 隐藏的工作树改动不能签发或复用验证记录", (t) => {
    const f = fixture(t);
    f.stage("hidden.txt", "original\n"); f.git("commit", "-q", "-m", "seed");
    f.stage(); const start = f.record().commitCandidate;
    f.git("update-index", flag, "hidden.txt"); f.write("hidden.txt", "hidden change\n");
    assert.equal(f.git("diff", "--quiet"), "", "复现 Git 普通 diff 看不到隐藏改动");
    const end = captureCommitCandidate(f.root);
    assert.equal(end, null);
    assert.equal(verifiedCommitCandidate(start, end, { mode: "full", verdict: "pass", treeMoved: false }), null);
    assert.equal(f.run().status, 1);
  });
}

test("文件重命名、删除和执行位按完整 Git 暂存树匹配", (t) => {
  const f = fixture(t);
  f.stage("remove.txt", "remove\n"); f.git("commit", "-q", "-m", "seed");
  f.git("mv", "a.txt", "renamed.txt"); f.git("rm", "-q", "remove.txt");
  f.record(); assert.equal(f.run().status, 0);
  f.git("update-index", "--chmod=+x", "renamed.txt");
  assert.equal(f.run().status, 1);
});

test("detached 隔离工作树同样需要验证，正常通过后无须例外", (t) => {
  const f = fixture(t); f.git("checkout", "-q", "--detach");
  f.stage(); f.install();
  assert.notEqual(f.commit().status, 0);
  f.record(); assert.equal(f.commit().status, 0);
});

test("未受保护分支维持既有范围，但不授予创建分支的权限", (t) => {
  const f = fixture(t); f.git("checkout", "-q", "-b", "test-only"); f.stage();
  assert.equal(f.run().status, 0);
});

test("写审计日志失败时不能报告已留痕放行", (t) => {
  const f = fixture(t); f.stage(); f.record();
  mkdirSync(join(f.root, ".verify-cache/commit-verified.log"));
  assert.equal(f.run().status, 1);
});

test("验证链仅在 full 通过且首尾候选相同时签发记录", (t) => {
  const f = fixture(t); f.stage();
  const start = captureCommitCandidate(f.root);
  const state = { mode: "full", verdict: "pass", treeMoved: false };
  assert.deepEqual(verifiedCommitCandidate(start, start, state), start);
  for (const altered of [{ mode: "scoped" }, { verdict: "fail" }, { treeMoved: true }]) {
    assert.equal(verifiedCommitCandidate(start, start, { ...state, ...altered }), null);
  }
  assert.equal(verifiedCommitCandidate(null, start, state), null);
  assert.equal(verifiedCommitCandidate(start, null, state), null);
  f.stage("a.txt", "new code\n");
  assert.equal(verifiedCommitCandidate(start, captureCommitCandidate(f.root), state), null);
});
