#!/usr/bin/env node
/*
 * 已知红清单(Tier 1-C,主人 2026-09-02 拍板 C):把「已登记、有理由、有到期日的红」和「新翻的红」分开计。
 *
 * 为什么存在:verify 的二元制(任一格红 = 整链红 = 合并守卫不放行)逼着人开逃生阀 —— 2026-07 至 09-02 的会话记录里
 *   逃生阀写了 250+ 次;一条挂了三周的老红把新红埋在噪音里,门的红被训练成背景音(WF-17)。
 * 规则:
 *   · 每条必须有 why(≥8 字)+ since + until(YYYY-MM-DD,until ≤ since + 90 天,没有到期日的白名单会变坟场);
 *   · 未到期:链步骤记 KNOWN-RED、verify.sh 格记 KNOWN-RED,不进 fail,不改退出码;
 *   · 到期未清:自动回红(FAIL 行带「已知红已到期」),逼人处理 —— 要么修,要么主人续期(改 until 必须写新理由);
 *   · 本文件自带 lint(格式 / 到期 / 重复),挂在 verify.sh 静态段,清单坏了整链红。
 * 清单:scripts/known-red.json —— steps[]: { step, why, since, until, owner? };cells[]: { prefix, why, since, until, owner? }
 *   step = package.json verify:steps 里的脚本名(整步已知红,粒度粗,只给「一整步因环境缺件而红」的场合);
 *   prefix = verify.sh 里 FAIL 行标题的**固定前缀**(从日志复制,不是正则),命中即视为该格已知红。
 * 用法:node scripts/lib/known-red.mjs lint | steps | cells | check-step <id> | check-cell "<title>"
 *   cells 输出 TSV(prefix \t until \t why \t active|expired)给 verify.sh 的 bad() 读。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const KNOWN_RED_PATH = path.join(ROOT, "scripts", "known-red.json");
const MAX_DAYS = 90;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayLocal(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function validDate(s) { if (!DATE_RE.test(s)) return false; const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; }
function daysBetween(a, b) { return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000); }

/** 读 + 校验。返回 { steps, cells, problems[] }(problems 非空 = 清单不可用,调用方应判红)。 */
export function loadKnownRed(file = KNOWN_RED_PATH) {
  const problems = [];
  if (!fs.existsSync(file)) return { steps: [], cells: [], problems: [], missing: true };
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return { steps: [], cells: [], problems: [`known-red.json 不是合法 JSON:${e.message}`] }; }
  const check = (list, kind, keyName) => {
    const out = [];
    const seen = new Set();
    for (const [i, e] of (Array.isArray(list) ? list : []).entries()) {
      const tag = `${kind}[${i}]`;
      const key = e?.[keyName];
      if (typeof key !== "string" || !key.trim()) { problems.push(`${tag}: 缺 ${keyName}`); continue; }
      if (seen.has(key)) problems.push(`${tag}: ${keyName} 重复「${key}」`);
      seen.add(key);
      if (typeof e.why !== "string" || e.why.trim().length < 8) problems.push(`${tag}(${key}): why 缺失或太短(≥8 字,写清楚为什么红、修在哪)`);
      if (!validDate(String(e.since))) problems.push(`${tag}(${key}): since 不是合法日期 YYYY-MM-DD`);
      if (!validDate(String(e.until))) problems.push(`${tag}(${key}): until 不是合法日期 YYYY-MM-DD`);
      if (validDate(String(e.since)) && validDate(String(e.until))) {
        const span = daysBetween(e.since, e.until);
        if (span <= 0) problems.push(`${tag}(${key}): until 必须晚于 since`);
        if (span > MAX_DAYS) problems.push(`${tag}(${key}): until − since = ${span} 天 > ${MAX_DAYS} 天上限(要续期改 since 并写新理由)`);
      }
      out.push({ ...e, [keyName]: key });
    }
    return out;
  };
  const steps = check(raw.steps, "steps", "step");
  const cells = check(raw.cells, "cells", "prefix");
  return { steps, cells, problems };
}

const status = (e, today) => (today <= e.until ? "active" : "expired");

/** 链步骤是否已知红:返回 { entry, status } | null。 */
export function stepKnownRed(step, list, today = todayLocal()) {
  const e = list.find((x) => x.step === step);
  return e ? { entry: e, status: status(e, today) } : null;
}
/** verify.sh 格标题是否已知红(固定前缀匹配):返回 { entry, status } | null。 */
export function cellKnownRed(title, list, today = todayLocal()) {
  const e = list.find((x) => title.startsWith(x.prefix));
  return e ? { entry: e, status: status(e, today) } : null;
}

/** verify-chain 接线:FAIL 步命中未到期条目 → KNOWN-RED(不进 verdict);到期 → 仍 FAIL 并写明;其它不动。返回同一数组(原地改)。 */
export function applyKnownRedToSteps(results, steps, today = todayLocal()) {
  for (const r of results) {
    if (r.status !== "FAIL") continue;
    const k = stepKnownRed(r.step, steps, today);
    if (!k) continue;
    if (k.status === "active") { r.status = "KNOWN-RED"; r.knownRed = { until: k.entry.until, why: k.entry.why, owner: k.entry.owner || null }; r.reason = `已知红(到期 ${k.entry.until}):${k.entry.why}`; }
    else { r.reason = `${r.reason ? r.reason + " · " : ""}已知红已到期 ${k.entry.until},须处理:${k.entry.why}`; }
  }
  return results;
}

export function lint(file = KNOWN_RED_PATH, today = todayLocal()) {
  const kr = loadKnownRed(file);
  const expired = [...kr.steps, ...kr.cells].filter((e) => status(e, today) === "expired");
  return { ok: kr.problems.length === 0, problems: kr.problems, expired, count: kr.steps.length + kr.cells.length, missing: !!kr.missing };
}

function main() {
  const [cmd, arg] = process.argv.slice(2);
  const today = process.env.KNOWN_RED_TODAY || todayLocal();
  const file = process.env.KNOWN_RED_FILE || KNOWN_RED_PATH;
  if (cmd === "lint") {
    const r = lint(file, today);
    if (!r.ok) { console.error(`known-red.json lint FAIL:\n${r.problems.map((p) => `  - ${p}`).join("\n")}`); process.exit(1); }
    const exp = r.expired.length ? `;⚠ 已到期 ${r.expired.length} 条(${r.expired.map((e) => e.step || e.prefix).join(" / ")})—— 链上这些会回红` : "";
    console.log(`known-red.json lint PASS —— ${r.missing ? "清单不存在(视为 0 条)" : `${r.count} 条已知红`}${exp}`);
    process.exit(0);
  }
  const kr = loadKnownRed(file);
  if (kr.problems.length) { console.error(`known-red.json 不可用:${kr.problems.join("; ")}`); process.exit(2); }
  if (cmd === "cells") { for (const e of kr.cells) console.log([e.prefix, e.until, String(e.why).replace(/\s+/g, " "), status(e, today)].join("\t")); process.exit(0); }
  if (cmd === "steps") { for (const e of kr.steps) console.log([e.step, e.until, String(e.why).replace(/\s+/g, " "), status(e, today)].join("\t")); process.exit(0); }
  if (cmd === "check-step") { const r = stepKnownRed(arg || "", kr.steps, today); console.log(r ? `${r.status}\t${r.entry.until}\t${r.entry.why}` : "none"); process.exit(0); }
  if (cmd === "check-cell") { const r = cellKnownRed(arg || "", kr.cells, today); console.log(r ? `${r.status}\t${r.entry.until}\t${r.entry.why}` : "none"); process.exit(0); }
  console.error("用法:node scripts/lib/known-red.mjs lint | steps | cells | check-step <id> | check-cell \"<title>\""); process.exit(2);
}
if (process.argv[1] && /known-red\.mjs$/.test(process.argv[1].replace(/\\/g, "/"))) main();
