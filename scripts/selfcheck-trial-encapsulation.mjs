#!/usr/bin/env node
/**
 * 🔴 试用状态封装门(2026-08-04 结构性反思产物,见 docs/changes/2026-08-04-structural-reflection.md)
 *
 * 为什么存在:R1 把试用时间边界收敛成单一纯函数 resolveTrialAt,只扫了「定义面」
 * (free-trial.ts 内无残留手写边界比对),没扫「消费面」(谁还在直接读原始 status)。
 * R2 的 P0 就是漏网的消费者(checkout.vue 一半读原始 status、一半读解析器,
 * 拼出用户没见过的净额并扣款)。同型跨两轮复发 → 根因是**封装未被机器强制**。
 *
 * 判据(两条正交):
 *   ① 消费者台账:直接读原始 status 的文件必须在下方 ALLOWLIST 里逐条登记理由;
 *      新增未登记消费者 → 红。台账**写在本门脚本里,不写在被查文件里** —— 否则
 *      「删消费者时顺手删掉台账那行」就能静默绕过(踩坑出处 2026-08-03 防删除门)。
 *   ② 钱路径禁令:MONEY_PATHS 里的文件即便被登记进白名单也一律红 ——
 *      钱只认解析器,不认原始状态。这条覆盖「未来有人给白名单加一行就放行」的方向。
 *
 * 自破坏保护:扫描命中数为 0(说明匹配模式失效或目录改名)一律 exit 1,不许「找不到 = 全过」。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

/** 解析器自身 —— 它们**定义**状态,不算消费者。 */
const RESOLVER_FILES = ["src/store/trial-boundary.ts", "src/store/free-trial.ts"];

/**
 * 登记在册的消费者。key = 相对路径,value = 为什么允许直接读原始状态。
 * 🔴 新增消费者必须在此登记理由;钱路径一律不许登记(见 MONEY_PATHS)。
 */
const ALLOWLIST = {
  "src/App.vue":
    "轮询编排:在 pollTrial 前后各取一次状态以判定「本 tick 是否发生迁移」,读的是 poll 推进**之后**的值,不参与任何金额计算",
  "src/pages/me/trial.vue":
    "纯展示:试用页五态渲染,≤4s 视觉滞后由下一次 poll 自愈,不参与任何金额计算",
};

/**
 * 钱路径 —— 出现在消费者名单里一律红,即便被加进 ALLOWLIST。
 * 金额必须来自解析器的单次解析结果(见 checkout.vue trialQuoteAt / wallet-withdraw.vue snap)。
 */
const MONEY_PATHS = [
  "src/pages/store/checkout.vue",
  "src/pages/me/wallet-withdraw.vue",
  "src/store/orders.ts",
  "src/store/app.ts",
  "src/store/bills.ts",
  "src/store/account-cloud.ts",
];

/** 直接读原始状态的形态。注释行会先被剥掉,避免注释里的说明文字哄红。 */
const RAW_READ = /\bfreeTrial\s*\.\s*status\b|\buseFreeTrial\s*\(\s*\)\s*\.\s*status\b/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(vue|ts)$/.test(name)) out.push(full);
  }
  return out;
}

/** 剥掉 // 行注释与 /* *\/ 块注释,防「注释里提到就算命中」的假阳性。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const files = walk(SRC);
const consumers = new Map(); // rel -> [lineNo...]
let scannedHits = 0;

for (const full of files) {
  const rel = path.relative(ROOT, full).replace(/\\/g, "/");
  const raw = readFileSync(full, "utf8");
  const body = stripComments(raw);
  const lines = body.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, i) => {
    if (RAW_READ.test(line)) hits.push(i + 1);
  });
  if (!hits.length) continue;
  scannedHits += hits.length;
  if (RESOLVER_FILES.includes(rel)) continue; // 定义面,不算消费者
  consumers.set(rel, hits);
}

const fails = [];

// 判据① 未登记消费者
for (const [rel, lines] of consumers) {
  if (!(rel in ALLOWLIST)) {
    fails.push(
      `未登记的原始状态消费者:${rel}(行 ${lines.join(",")})—— ` +
        `金额相关必须改走解析器(resolveTrialAt);纯展示请在 scripts/selfcheck-trial-encapsulation.mjs 的 ALLOWLIST 登记理由`,
    );
  }
}

// 判据② 钱路径禁令(与①正交:即便登记了也红)
for (const rel of consumers.keys()) {
  if (MONEY_PATHS.includes(rel)) {
    fails.push(
      `钱路径直接读原始试用状态:${rel} —— 金额只认解析器单次解析结果,` +
        `禁止混源(R2 P0 事故形态:一半原始状态一半解析器,拼出用户没见过的净额)`,
    );
  }
}

// 自破坏保护:扫不到任何命中 = 判据失效,不许静默全过
if (scannedHits === 0) {
  console.error(
    `FAIL 试用封装门判据失效:扫了 ${files.length} 个源文件却 0 命中 —— ` +
      `解析器自身也应至少出现一次;疑似匹配模式或目录结构已变更`,
  );
  process.exit(1);
}

if (fails.length) {
  for (const f of fails) console.error(`FAIL ${f}`);
  process.exit(1);
}

const listed = [...consumers.keys()];
console.log(
  `PASS trial state encapsulation: 消费者 ${listed.length} 处均已登记且非钱路径` +
    `(${listed.join(" · ") || "无"});扫 ${files.length} 个源文件 / ${scannedHits} 处原始状态读取 / ` +
    `钱路径禁令覆盖 ${MONEY_PATHS.length} 个文件`,
);
