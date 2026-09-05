#!/usr/bin/env node
// store 不可达代码门 —— node scripts/store-unreachable-code-gate.mjs
//
// 🔴 守的不变量:**`src/store/**` 里不许有不可达代码。**
//
// 事故现场(2026-08-13 对齐轮):8-10 的 `feat: align app remote business flows` 把创世
// 业务流迁到服务端权威时,**漏写了 `if (remoteApiEnabled)` 守卫** —— 远端调用被无条件执行,
// try/catch 两条路都 return,于是它下面那整套本地实现(mock 期的 server 同构面)成了死代码:
//   purchase · listNode · cancelListing · acquireSecondary · tickSales,五个动作全中。
// 后果:mock 模式(CLAUDE.md 明写本仓是「mock 驱动高保真原型,无真后端」,verify 也强制
// mock 靶)下创世**买不了、挂不了、售出数不动**,还谎报「市场暂未开放」。
//
// 🔴 为什么必须是机器门:
//  ① 死代码**长得完全正常** —— 它有完整的守卫、注释、甚至配套的 P0 修复记录,
//     肉眼审查、grep、单测全都发现不了「它根本没被执行」;
//  ② 更阴的是它会**把别的门哄绿**:selfcheck-genesis-gate 断言「purchase 必须问过
//     genesisPurchaseBlock」,而那句 `genesisPurchaseBlock(...)` 就躺在死代码里 ——
//     判据在文本上成立,在运行时是空的。**文本判据无法自己发现宿主已经不可达。**
//  ③ TypeScript 自己就能精确判定(TS7027),不用我另写一套控制流分析。
//
// 判据:用项目自己的 tsconfig 跑 `tsc --allowUnreachableCode false`,
// `src/store/**` 的 TS7027 计数必须为 0。仓外目录不管(lib/ 有 uni 条件编译 `#endif`
// 之后的兜底 return、mock/receipt.ts 有穷尽 switch 的兜底,都是良性的)。
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let out = "";
try {
  out = execFileSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.json", "--allowUnreachableCode", "false"],
    { cwd: root, encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  out = `${e.stdout ?? ""}${e.stderr ?? ""}`;   // 有诊断时 tsc 退出码非 0,输出在 stdout
}

let bad = 0, total = 0;
const check = (name, cond, detail) => {
  total++;
  if (cond) console.log(`  PASS  ${name}`);
  else { bad++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

// 🔴 起点先证:tsc 真跑起来了吗?跑不起来(输出空 / 全是环境错)会让下面的
//    「命中 0 处」变成假绿 —— 这正是「候选集为 0 必须自己判红」的那条。
const ranOk = /error TS\d+|\bFound \d+ error/.test(out) || out.trim() === "";
const envBroken = /TS6046|TS5\d{3}|Cannot find module 'typescript'|not recognized/.test(out);
check("① tsc 真的跑起来了(不是环境炸了,否则「0 处」是假绿)", ranOk && !envBroken,
  envBroken ? `环境错:${out.split(/\r?\n/).find((l) => /TS6046|TS5\d{3}|not recognized/.test(l))}`
    : `输出 ${out.length} 字节,认不出 tsc 诊断格式`);

const unreachable = [...out.matchAll(/^(\S+?)\((\d+),\d+\): error TS7027:/gm)]
  .map((m) => ({ file: m[1].replaceAll("\\", "/"), line: m[2] }));
// 全仓命中数为 0 也要警惕:可能 --allowUnreachableCode 这个开关没被吃进去。
// 仓外已知有 4 处良性不可达(lib 条件编译 ×3 + mock 穷尽 switch ×1),拿它们当**活体探针**:
// 一处都扫不到,说明开关没生效或诊断格式变了,判红而不是报「全仓干净」。
check(`② 判据活着:仓外已知的良性不可达仍能被扫到(实测 ${unreachable.length} 处)`,
  unreachable.some((u) => !u.file.startsWith("src/store/")),
  `全仓一处不可达都没扫到 —— --allowUnreachableCode 多半没生效,判红(不许当成「干净」)`);

const inStore = unreachable.filter((u) => u.file.startsWith("src/store/"));
check(`🔴 src/store/** 无不可达代码(越界 ${inStore.length} 处)`, inStore.length === 0,
  inStore.map((u) => `${u.file}:${u.line}`).join(" | "));

console.log(bad === 0
  ? `store-unreachable-code PASS —— ${total}/${total}(全仓 ${unreachable.length} 处不可达,store 内 0 处)`
  : `store-unreachable-code FAIL —— ${bad}/${total} 格`);
process.exit(bad === 0 ? 0 : 1);
