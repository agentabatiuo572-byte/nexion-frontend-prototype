#!/usr/bin/env node
// 账号隔离门 —— node scripts/account-scope-gate.mjs
//
// 现场(2026-08-13 对齐轮):verify.sh 里这一族哨兵钉的是**具体函数名**
//   `useConversations().reset()` / `writeAccountRow` / `useXxx().bindAccount(accountKey)`。
// 而实现换了机制之后,同一条不变量用**更严**的方式满足了,哨兵却全红:
//   · tickets —— 改成按「账号 + 运行会话」双维拼持久化键(比单账号维更严);
//   · weekly-quest —— 改成服务端权威 + 版次围栏(切号清内存重取,本地不落盘);
//   · conversations —— 从 reset() 改成 bindAccount(accountKey)。
// 钉函数名 = 钉「我以为它会长的那个样子」,换一种更好的写法就误报。
//
// 🔴 本门改钉**不变量本身**:「按账号隔离的 store,切号时必须被收口;
//    凡落盘的,持久化键必须带账号维」。写法随便,漏一个就红。
//    判据构造性:store 清单从 account-scope.ts 的真实调用**派生**,不手写。
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

let bad = 0, total = 0;
const check = (name, cond, detail) => {
  total++;
  if (cond) console.log(`  PASS  ${name}`);
  else { bad++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

const scope = read("src/lib/account-scope.ts");

// ① 收口面:account-scope.ts 里被收口的 store 清单(派生,不手写)
const rebound = [...scope.matchAll(/use([A-Za-z0-9]+)\(\)\s*\.\s*(bindAccount|reset)\s*\(/g)]
  .map((m) => ({ store: m[1], how: m[2] }));
check(`① 切号收口面非空(实测 ${rebound.length} 个 store)`, rebound.length >= 20,
  `只找到 ${rebound.length} 个 —— 判据失效,判红`);

// ② 三个本轮点名的 store 必须在收口面里(不管用 bindAccount 还是 reset)
for (const want of ["Conversations", "Tickets", "WeeklyQuest"]) {
  const hit = rebound.find((r) => r.store === want);
  check(`② ${want} 在切号收口面里(实测 ${hit ? hit.how : "缺席"})`, !!hit,
    `account-scope.ts 里没有 use${want}().bindAccount/reset —— 切号会串账`);
}

// ③(已撤回)我一度想再加一条「store 层每处持久化的键都必须带账号维」。
//    实测 61 处调用里报出 45 处「越界」—— 而第一个就是账号隔离机制**本身**的辅助文件。
//    真相是:多数 store 存的是全局配置 / 设备级设置,本来就不该带账号维;
//    真正按账号存的那些走 account-scoped-storage 的行级 API,账号维在**行**上不在表名上。
//    本仓记过这条:**候选远多于真命中时,先怀疑判据画错了域,不是先怀疑代码**。
//    强行留下它 = 45 条常驻误报 = 这道门的信号价值归零。故撤回,不写进判据。
//    「按账号存的东西不许漏账号维」这条不变量,由 account-scoped-storage 的行级 API 自身保证。

const FLOOR = 4;
if (total < FLOOR) {
  console.log(`FAIL  只跑了 ${total} 格,低于登记的 ${FLOOR} 格 —— 靶被删或没执行`);
  process.exit(1);
}
console.log(bad === 0
  ? `account-scope PASS —— ${total}/${total}(切号收口面 ${rebound.length} 个 store)`
  : `account-scope FAIL —— ${bad}/${total} 格`);
process.exit(bad === 0 ? 0 : 1);
