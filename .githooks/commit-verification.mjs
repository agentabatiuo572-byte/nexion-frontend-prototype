// verify-chain 与 pre-commit 共用：工作区与暂存区一致时才可签发候选树记录。
import { spawnSync } from "node:child_process";

function git(repoDir, args) {
  const result = spawnSync("git", ["-C", repoDir, ...args], { encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

export function captureCommitCandidate(repoDir) {
  // Git diff 会跳过这两类标记；拒绝它们以免测试隐藏改动后签发另一棵树。
  // 只读检查，不能自动清除用户的索引标记或刷新其暂存内容。
  const entries = git(repoDir, ["ls-files", "-v", "-z"]);
  if (entries === null || entries.split("\0").some((entry) => /^[a-zS] /.test(entry))) return null;
  // 不将混合工作树的测试结果归给仅暂存了部分内容的提交。
  if (git(repoDir, ["diff", "--no-ext-diff", "--quiet", "--ignore-submodules=none"]) === null) return null;
  if (git(repoDir, ["ls-files", "--others", "--exclude-standard", "-z"]) !== "") return null;
  const head = git(repoDir, ["rev-parse", "--verify", "HEAD"]);
  const tree = git(repoDir, ["write-tree"]);
  return head && tree ? { head: head.trim(), tree: tree.trim() } : null;
}

export function verifiedCommitCandidate(start, end, { mode, verdict, treeMoved }) {
  return mode === "full" && verdict === "pass" && treeMoved === false &&
    start && end && start.head === end.head && start.tree === end.tree ? end : null;
}
