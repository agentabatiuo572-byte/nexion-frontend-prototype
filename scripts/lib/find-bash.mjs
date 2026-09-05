// Git Bash 定位(单源;run-legacy-suite / verify-chain 共用)。
// 🔴 Windows 上裸 `bash` 可能解析到 System32 的 WSL bash(env 不透传、路径变 /mnt/d、sed 行为有差,
//    同一 verify 两个 bash 跑出不同红名单 —— env_windows_shell 记过),所以一律显式找 Git 的 bin/bash.exe。
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function findBash() {
  if (process.platform !== "win32") return "bash";
  const candidates = [process.env.BASH_EXE];
  const locatedGit = spawnSync("where.exe", ["git"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  for (const gitExe of String(locatedGit.stdout || "").split(/\r?\n/).filter(Boolean)) {
    candidates.push(path.resolve(path.dirname(gitExe), "..", "bin", "bash.exe"));
  }
  candidates.push(
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Git", "bin", "bash.exe"),
  );
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}
