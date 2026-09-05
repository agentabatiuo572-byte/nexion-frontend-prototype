// 跨仓契约测试的兄弟仓解析 —— 单源,勿在各测试文件里再抄一份。
//
// 三条不变量(缺一条就会出假绿/假红):
//  1. 显式配了 env 却指向空气 = 配置错,**硬抛**。降级成 skip 会让「我明明配了仓」的人拿到假绿。
//  2. 仓真不在 → 返回 missing 理由串,由调用方喂给 `test(..., { skip: reason })`:
//     只让跨仓断言 skip,同文件里纯本仓的断言照跑(不连坐),理由随 node reporter 打出来。
//  3. linked worktree(.claude/worktrees/*)里 `<appRoot>/..` 落到 worktrees 目录,不是工作区根 ——
//     裸拼兄弟位会**永远**判成缺仓,于是仓明明在场却一路 skip(P-102 同型)。用 git common-dir
//     反推主 checkout 再取同级兜底,idiom 与 scripts/verify.sh:72-82 的 ADMIN_ROOT 解析一致。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP_ROOT = path.resolve(import.meta.dirname, "..", "..");

function mainCheckoutRoot() {
  try {
    const commonDir = execFileSync(
      "git", ["-C", APP_ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return commonDir ? path.dirname(commonDir) : null;
  } catch {
    return null; // git 不可用 / 独立打包:退回裸兄弟位,行为不变
  }
}

/**
 * @returns {{ root: string, missing: false | string }} missing 为 false 时 root 一定存在;
 *   否则 root 是「本该在哪」的首选路径,missing 是给 test skip 用的人话理由。
 */
export function resolveSiblingRepo(name, envVar) {
  const configured = process.env[envVar]?.trim();
  if (configured) {
    const root = path.resolve(configured);
    if (!fs.existsSync(root)) throw new Error(`${envVar} 指向的兄弟仓不存在: ${root}`);
    return { root, missing: false };
  }
  const tried = [path.join(APP_ROOT, "..", name)];
  const mainRoot = mainCheckoutRoot();
  if (mainRoot) {
    const viaMain = path.join(mainRoot, "..", name);
    if (!tried.includes(viaMain)) tried.push(viaMain);
  }
  const root = tried.find((candidate) => fs.existsSync(candidate));
  if (root) return { root, missing: false };
  return {
    root: tried[0],
    missing: `跨仓断言未运行 —— 兄弟仓 ${name} 不在 ${tried.join(" 也不在 ")}(设 ${envVar} 或克隆到兄弟位后才真跑)`,
  };
}
