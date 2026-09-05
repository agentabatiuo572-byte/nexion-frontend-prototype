#!/usr/bin/env node
/**
 * h2-trial-remote-api 里「远端档不落盘 / 不本地推进」三条判据的红测。
 *
 * 为什么存在(2026-08-17 包 at):这道门的原判据 `/if \(remoteApiEnabled\) return;/`
 * 写于 5d3c92e —— 那时 persist() 还是 void。da445ec(审计 R5)把 persist() 改成返回
 * 落盘判决(convert 据此决定终态算不算落定),判据自那时起**恒红**,一直红到今天。
 *
 * 恒红的门不是「白红一条」:它的红绿方向是**奖励回退** —— 谁把 persist() 改回 void,
 * 它就转绿。也就是说,拆掉审计 R5/R6/R7 焊进来的落盘判决,门会给正反馈
 * (踩坑同型:stale-gate-rewards-regression)。
 *
 * 新判据锚在函数头上,守的是「短路必须是函数第一句」+「落盘口唯一」。锚定形态换来的
 * 代价是**对改写敏感**:重命名 remoteApiEnabled、给 persist 换返回形状,这道门都会红。
 * 那是有意为之 —— 钱路 / 试用状态机的守卫被改写时,必须惊动一个人回来重读,而不是
 * 靠一条宽松正则替他判「大概还行」。
 *
 * 🔴 每条变异**单独隔离**注入:多条一起注入时,只要有一条能让门变红,其余几条完全
 *    失效也看不出来(合取项互相掩护)。
 * 🔴 注入不生效必须当场炸(mutated === original 直接 throw)—— 否则「变异没落地」
 *    和「门抓到了」在输出上长得一模一样,红测自己变成假绿的来源。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const TARGET = path.join(ROOT, "src", "store", "free-trial.ts");
const GATE = path.join(ROOT, "scripts", "h2-trial-remote-api.test.mjs");

/** 中断不走 finally:SIGINT 落在写入窗口内会在仓里留下一个被改坏的钱路 store。 */
const pending = new Map();
const restore = () => {
  for (const [p, original] of pending) { try { writeFileSync(p, original); } catch { /* 尽力还原 */ } }
  pending.clear();
};
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { restore(); process.exit(130); });
process.on("exit", restore);
process.on("uncaughtException", (e) => { restore(); console.error(e); process.exit(2); });

/** stdout + stderr 都取:node --test 的失败诊断分散在两条流上,只看一条会把活门判成死门。 */
function runGate() {
  const r = spawnSync(process.execPath, ["--test", GATE], { encoding: "utf8", cwd: ROOT });
  return { failed: r.status !== 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/**
 * 注入一条变异 → 断言门变红 → 断言红的是**指定那条判据**(靠 assert 的自定义消息 tag,
 * 不靠行号:行号会随本轮编辑漂移,而 tag 不会)。
 */
function redtest(name, tag, mutate) {
  const original = readFileSync(TARGET, "utf8");
  let verdict;
  try {
    const mutated = mutate(original);
    if (mutated === original) {
      // 锚点没命中。这不是「门抓到了」,是本条红测什么都没测。
      return `✗ ${name}: 注入无效 —— free-trial.ts 内容一字未变(锚点漂了,本条红测在测一个不存在的改动)`;
    }
    pending.set(TARGET, original);   // 先登记到中断还原表,再写盘
    writeFileSync(TARGET, mutated);
    const { failed, out } = runGate();
    const delta = mutated.length - original.length;
    const hit = `锚点命中(${delta >= 0 ? "+" : ""}${delta} 字节)`;
    if (!failed) verdict = `✗ ${name}: ${hit},但门仍然是绿的 —— [${tag}] 是死判据`;
    else if (!out.includes(`[${tag}]`)) verdict = `✗ ${name}: ${hit},门红了但报的不是 [${tag}](被别的判据顺带抓到,本条仍未被验证)`;
    else verdict = `✓ ${name}: ${hit} → 门红,命中 [${tag}]`;
  } finally {
    writeFileSync(TARGET, original);
    pending.delete(TARGET);
    if (readFileSync(TARGET, "utf8") !== original) {
      console.error(`\n  🔴 致命:${TARGET} 还原失败,请手动检查\n`);
      process.exit(2);
    }
  }
  return verdict;
}

const baseline = runGate();
if (baseline.failed) {
  console.error("  ✗ 基线不绿,红测无意义。先让门通过:\n" + baseline.out.slice(0, 2000));
  process.exit(1);
}

// 本仓源文件是 CRLF,跨行锚点一律 \r?\n(家法;line-ending-detection-lies 同型)。
const PERSIST_GUARD = /(\r?\n\s+)if \(remoteApiEnabled\) return true;/;
const ADVANCE_GUARD = /(\r?\n\s+)if \(remoteApiEnabled\) return snapshot\(\);/;
const WRITE_CALL = "return writeAccountRow<FreeTrialState>(ACCOUNTS_KEY, boundKey, snapshot());";

const results = [
  // ── [persist-guard] 远端档不落本地盘 ──
  // 🔴 头号变异:这正是旧判据**奖励**的方向 —— 把 persist() 退回 void,拆掉审计 R5 的落盘判决。
  redtest("persist 退回 void 形状(旧判据会给它开绿灯)", "persist-guard",
    (s) => s.replace(/function persist\(\): boolean \{(\r?\n\s+)if \(remoteApiEnabled\) return true;/,
      "function persist() {$1if (remoteApiEnabled) return;")),
  redtest("persist 守卫被删", "persist-guard", (s) => s.replace(PERSIST_GUARD, "")),
  redtest("persist 守卫被取反", "persist-guard",
    (s) => s.replace(PERSIST_GUARD, "$1if (!remoteApiEnabled) return true;")),
  redtest("persist 守卫被注释掉(装饰性保留)", "persist-guard",
    (s) => s.replace(PERSIST_GUARD, "$1// if (remoteApiEnabled) return true;")),
  // 挪位:守卫字符串**原样还在文件里**,旧的无锚点判据对它完全失明 —— 而写盘已经发生了。
  redtest("persist 守卫挪到写盘之后(字符串仍在,写盘已发生)", "persist-guard",
    (s) => s.replace(PERSIST_GUARD, "$1const wrote = writeAccountRow<FreeTrialState>(ACCOUNTS_KEY, boundKey, snapshot());$1if (remoteApiEnabled) return true;")
      .replace(WRITE_CALL, "return wrote;")),

  // ── [advance-guard] 远端档不本地推进状态机(测试名承诺过、原先零断言的那一半)──
  redtest("advanceTo 守卫被删", "advance-guard", (s) => s.replace(ADVANCE_GUARD, "")),
  redtest("advanceTo 守卫被取反", "advance-guard",
    (s) => s.replace(ADVANCE_GUARD, "$1if (!remoteApiEnabled) return snapshot();")),
  redtest("advanceTo 守卫挪到边界推进之后", "advance-guard",
    (s) => s.replace(ADVANCE_GUARD, "$1const row = snapshot();$1if (remoteApiEnabled) return snapshot();")
      .replace(/(\r?\n\s+)const row = snapshot\(\);(\r?\n\s+)const resolved = resolveTrialAt/, "$2const resolved = resolveTrialAt")),

  // ── [single-writer] 守卫在位 ≠ 绕不过去 ──
  // 两条守卫**全都原样健在**,只是在远端分支里另开了一条写盘口 —— 只有落盘口唯一性判据抓得住。
  redtest("convert 远端分支另开第二条写盘口(两条守卫都还在)", "single-writer",
    (s) => s.replace("const expectedClaimNo = authorityClaimNo.value;",
      "writeAccountRow<FreeTrialState>(ACCOUNTS_KEY, boundKey, snapshot());\n      const expectedClaimNo = authorityClaimNo.value;")),
];

for (const r of results) console.log(`  ${r}`);
const bad = results.filter((r) => r.startsWith("✗"));

// 收尾复跑:证明还原完整、门回到绿(否则「红测跑完仓是坏的」会被下一道门当成新缺陷)。
const after = runGate();
if (after.failed) {
  console.error("\n  🔴 红测结束后门是红的 —— 还原不完整\n" + after.out.slice(0, 2000));
  process.exit(2);
}

if (bad.length) {
  console.error(`\n  h2-trial-remote gate REDTEST FAILED: ${bad.length}/${results.length} 条变异未证明判据有效\n`);
  process.exit(1);
}
console.log(`  ✓ h2-trial-remote gate redtest: ${results.length}/${results.length} 条变异均让门变红,且还原后门复绿`);
