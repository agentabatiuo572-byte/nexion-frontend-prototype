#!/usr/bin/env node
/* verify-on-stop 红测(⓪ 会话作用域):
 *   把 hook 复制进一棵**没有 runner** 的临时树:过了足迹关必在①处以「没有 scripts/verify-chain.mjs」放行 ——
 *   两条路径都秒测,不会真跑 3 分钟 static。判据:
 *   A 纯问答会话(无写足迹)→ exit 0 + 「无写足迹」;
 *   B 本会话 Edit 落在本树 → 走旧路径(runner 提示,**不出现**「无写足迹」);
 *   C 没给 transcript_path → 判不了 → 旧路径;
 *   D 足迹库不在 → 判不了 → 旧路径,不崩;
 *   E shell 里 git commit → 有足迹 → 旧路径。
 * 用法:node .claude/hooks/test-verify-on-stop.mjs
 */
"use strict";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const base = mkdtempSync(join(tmpdir(), "verify-on-stop-")).replace(/\\/g, "/");
process.on("exit", () => { try { rmSync(base, { recursive: true, force: true }); } catch {} });
mkdirSync(`${base}/.claude/hooks`, { recursive: true });
copyFileSync(join(HERE, "verify-on-stop.mjs"), `${base}/.claude/hooks/verify-on-stop.mjs`);
const HOOK = `${base}/.claude/hooks/verify-on-stop.mjs`;
const SID = "vos-sess";
const T = `${base}/${SID}.jsonl`;
const tline = (name, input) => JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t", name, input }] } });
const writeT = (lines) => writeFileSync(T, lines.join("\n") + "\n", "utf8");
const run = (input, env = {}) => {
  const r = spawnSync(process.execPath, [HOOK], { input: input == null ? "" : JSON.stringify(input), encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status, err: r.stderr || "" };
};
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` — ${detail}`}`); ok ? pass++ : fail++; };
const SKIP = /无写足迹/, LEGACY = /没有 scripts\/verify-chain\.mjs/;

writeT([tline("Read", { file_path: `${base}/src/a.vue` }), tline("Bash", { command: `git -C ${base} status --short && git branch --merged origin/UniApp` }), tline("Edit", { file_path: "C:/Users/x/.claude/projects/p/memory/MEMORY.md", old_string: "a", new_string: "b" })]);
let h = run({ session_id: SID, cwd: base, transcript_path: T });
check("A 纯问答会话 → exit 0 + 无写足迹提示,不算树指纹", h.code === 0 && SKIP.test(h.err) && !LEGACY.test(h.err), `code=${h.code} err=${h.err.slice(0, 200)}`);

writeT([tline("Edit", { file_path: `${base}\\src\\pages\\a.vue`, old_string: "a", new_string: "b" })]);
h = run({ session_id: SID, cwd: base, transcript_path: T });
check("B 本会话 Edit 落在本树 → 过足迹关走旧路径(runner 提示)", h.code === 0 && LEGACY.test(h.err) && !SKIP.test(h.err), `code=${h.code} err=${h.err.slice(0, 200)}`);

h = run({ session_id: SID, cwd: base });
check("C 没给 transcript_path → 判不了 → 旧路径", h.code === 0 && LEGACY.test(h.err) && !SKIP.test(h.err), `code=${h.code} err=${h.err.slice(0, 200)}`);

writeT([tline("Read", { file_path: "x" })]);
h = run({ session_id: SID, cwd: base, transcript_path: T }, { SESSION_FOOTPRINT_LIB: `${base}/nope/session-footprint.mjs` });
check("D 足迹库不在 → 判不了 → 旧路径,不崩", h.code === 0 && LEGACY.test(h.err) && !SKIP.test(h.err), `code=${h.code} err=${h.err.slice(0, 200)}`);

writeT([tline("Bash", { command: `git add -A && git commit -m "feat: x"` })]);
h = run({ session_id: SID, cwd: base, transcript_path: T });
check("E shell 里 git commit(不带路径)→ 有足迹 → 旧路径(过包含不漏)", h.code === 0 && LEGACY.test(h.err) && !SKIP.test(h.err), `code=${h.code} err=${h.err.slice(0, 200)}`);

writeT([tline("Agent", { prompt: "implement", subagent_type: "general-purpose" })]);
mkdirSync(`${base}/${SID}/subagents`, { recursive: true });
writeFileSync(`${base}/${SID}/subagents/agent-1.jsonl`, tline("Write", { file_path: `${base}/src/new.ts`, content: "x" }) + "\n", "utf8");
h = run({ session_id: SID, cwd: base, transcript_path: T });
check("F 写足迹只在子 agent 记录里 → 也算有足迹 → 旧路径", h.code === 0 && LEGACY.test(h.err) && !SKIP.test(h.err), `code=${h.code} err=${h.err.slice(0, 200)}`);

console.log(`test-verify-on-stop: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
