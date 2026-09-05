#!/usr/bin/env node
// Stop 门(包 ar 2026-08-17,主人拍板 Q2A):回合末跑 **static 档**(A 档),红就阻断。
//
// 以前(2026-08-11 版)这里每回合跑一整遍 `bash scripts/verify.sh all`(~20 分钟),且只在 BASE_URL 上恰好是
// 「本树 + mock」的 server 时才跑 —— 主 checkout 上是 20 分钟/回合,worktree 会话则前提不满足静默空转,两头都不对。
// 三档制后:回合末只跑不需要 dev server 的静态部分(vue-tsc 指纹缓存 + ~430 格静态哨兵,实测 ~3 分钟),
// 树没变就秒退;全量(full)不在回合末,而是焊在「合并主线」这个动作上(PLAN/.claude/hooks/verify-fresh-before-merge.mjs)。
//
// 判据顺序:
//   ⓪ 会话作用域(2026-08-19 主人拍板;PLAN CLAUDE.md 不变量「Stop 阻断门必须会话作用域」):本会话在**本树**没有写足迹
//     (Edit/Write 落在树内 · shell 跑过 git 改内容动词 / pkg.mjs · 写文件手段动过树内 / src)→ 放行,连树指纹都不算 ——
//     纯问答会话不该替仓库状态背 3 分钟静态门(此前 ②③ 只看仓状态:别的会话 / 一次 pull 动了树,路过的会话就得跑)。
//     足迹从 stdin 的 transcript_path(主记录 + 子 agent 记录)扫,谓词共用 PLAN/.claude/hooks/lib/session-footprint.mjs;
//     库不在 / 没给 transcript_path / 判不了 → 按旧行为(宁可多跑不漏跑)。
//   ① 不是 git 树 / runner 不存在 → 提示后放行(环境不满足 ≠ 代码有问题);
//   ② 当前树指纹 == .verify-cache/last-run.json 里最近一次绿(任一档)的树 → 秒退,不重跑;
//   ③ 相对上次记录只改了文档类(不在 src/scripts/配置面)→ 放行并说明(文档改动不触发静态门);
//   ④ 否则跑 `node scripts/verify-chain.mjs --static`;红 → 只回喂 FAIL 行 + result 行(SCOPED-SKIP 行是噪音,不回喂),exit 2;绿 → exit 0。
// 语义提醒:static 绿 ≠ 全量绿。宣布 done / 合并前仍须 `npm run verify`(full);合并守卫会查。
// 自测:node .claude/hooks/test-verify-on-stop.mjs(⓪ 两条 + 判不了兜底)。
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";

const PROJECT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNNER = join(PROJECT_DIR, "scripts", "verify-chain.mjs");
const SCOPE = join(PROJECT_DIR, "scripts", "lib", "verify-scope.mjs");
const LAST = join(PROJECT_DIR, ".verify-cache", "last-run.json");
const FUNCTIONAL = /^(src\/|scripts\/|package(-lock)?\.json$|tsconfig[^/]*\.json$|vite\.config\.ts$|vitest\.config\.ts$|uno\.config\.ts$|index\.html$|shims-uni\.d\.ts$|\.claude\/hooks\/)/;
const FOOTPRINT_LIB = process.env.SESSION_FOOTPRINT_LIB || "D:/WORKS/PLAN/.claude/hooks/lib/session-footprint.mjs";

const note = (m) => process.stderr.write(`[verify-on-stop] ${m}\n`);

// ⓪ 本会话在本树有没有写足迹:true / false / null(判不了 → 旧行为)
async function sessionFootprint() {
  if (process.stdin.isTTY) return null; // 手动裸跑没有 hook 输入
  let input = null;
  try { input = JSON.parse(fs.readFileSync(0, "utf8") || "null"); } catch { return null; }
  if (!input?.transcript_path) return null;
  try {
    const lib = await import(pathToFileURL(FOOTPRINT_LIB).href);
    return lib.sessionTouched(input.transcript_path, input.session_id, lib.repoPredicate(PROJECT_DIR));
  } catch { return null; }
}
if ((await sessionFootprint()) === false) { note("✓ 本会话没改本树(无写足迹),跳过静态门"); process.exit(0); }

if (!fs.existsSync(RUNNER) || !fs.existsSync(SCOPE)) { note("(提示)本树没有 scripts/verify-chain.mjs,跳过静态门"); process.exit(0); }
let fp = null;
try { fp = JSON.parse(execFileSync(process.execPath, [SCOPE, "fingerprint"], { cwd: PROJECT_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); } catch { /* 非 git 树 */ }
if (!fp) { note("(提示)算不出树指纹(非 git 树?),跳过静态门"); process.exit(0); }

let last = null;
try { last = JSON.parse(fs.readFileSync(LAST, "utf8")); } catch { /* 无记录 */ }
if (last && last.verdict === "pass" && !last.treeMoved && last.tree === fp.fingerprint) {
  note(`✓ 树未变(${fp.fingerprint.slice(0, 10)}),复用上次 ${last.mode} 绿(${last.at});${last.mode === "full" ? "" : "static/scoped 绿 ≠ 全量绿,合并前仍须 npm run verify"}`);
  process.exit(0);
}
// ③ 文档类改动不触发:相对上次记录的 head 与工作树的改动都不在功能面
if (last && last.head) {
  const files = new Set(fp.dirtyFiles || []);
  try {
    execFileSync("git", ["-C", PROJECT_DIR, "diff", "--name-only", `${last.head}..HEAD`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split(/\r?\n/).filter(Boolean).forEach((f) => files.add(f.replace(/\\/g, "/")));
    if (files.size && ![...files].some((f) => FUNCTIONAL.test(f))) {
      note(`✓ 相对上次绿(${last.at})只改了非功能面文件(${[...files].slice(0, 5).join(", ")}${files.size > 5 ? " …" : ""}),不触发静态门`);
      process.exit(0);
    }
  } catch { /* 上次 head 已不可达(rebase 等):按「树变了」处理,往下跑 */ }
}
// ④ 跑 static 档
const r = spawnSync(process.execPath, [RUNNER, "--static"], { cwd: PROJECT_DIR, encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
const out = (r.stdout || "") + (r.stderr || "");
if (r.status === 0) {
  const tail = out.trim().split(/\r?\n/).filter((l) => /verify-chain result|PASS \d+ · CACHED/.test(l)).slice(-2).join(" | ").replace(/\x1b\[[0-9;]*m/g, "");
  note(`✓ static 档绿(${tail});static ≠ 全量,宣布 done / 合并前仍须 npm run verify(full)`);
  process.exit(0);
}
const lines = out.split(/\r?\n/).map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
const verdicts = lines.filter((l) => /\bFAIL\b|✗|NOT-RUN|━━ result:|verify-chain result|PASS \d+ · CACHED/.test(l) && !/SCOPED-SKIP/.test(l));
process.stderr.write(
  "[verify-on-stop] ✗ static 档未通过,先修再收工(只回喂 FAIL 行 + 结果行;全文见 .verify-cache/logs/):\n" +
  (verdicts.length ? verdicts.slice(-40).join("\n") : out.slice(-4000)) + "\n",
);
process.exit(2);
