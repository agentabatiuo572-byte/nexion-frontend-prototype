#!/usr/bin/env node
// 「资金 ⊗ 收据」不变量自检 — node 直跑,不起浏览器:
//   node scripts/selfcheck-money-receipt.mjs
//
// 背景(2026-08-04 R4 ·「钱动了、账没记上」缺陷族,≥3 次同型复发):
//   落盘失败在这一层是**静默**的 —— account-cloud 写不进去只是 persisted:false,
//   bills.add 写不进去只是 return null,两者都不抛异常;而调用方一律按「一定成功」
//   继续铸货、写账单、弹成功提示。实测四处同型:app.ts 四个资金原语丢弃 persist 结果、
//   创世购买 / 结算 / 复投三处丢弃 bills.add 返回值。最惨的一格是近 $15k 已扣、席位已铸、
//   弹「购买成功」,账单页查无此单。
//
// 🔴 守的不变量(编号对应红测文档 docs/changes/2026-08-04-receipt-invariant-redtest.md):
//   ① 资金原语落盘失败 → 返回 false 且**内存不脏**(内存与磁盘不许不对称)。
//   ② bills 写失败 → 收口点整笔回滚 + 报失败:不许出现「钱动了、账没记上」。
//   ③ 退款把 withdrawableUsdt 还原到扣款前(裸 creditBalance 只加总余额 = 可提额永久压低)。
//   ④ 成功路径与改前等价(负控:金额 / 舍入 / clamp / 守卫拒绝 一个不变)。
//   ⑤ 接线门:三处调用点真的走了收口点(判定对不对 / 有没有被接上是两道门)。
//   ⑥ 迁移棘轮:仍在裸调 bills.add 的存量点只许减不许增(收口点已就位,新代码没有借口)。
//   ⑦ 多腿交易(兑换一进一出)原子性:两条分录**一次落盘**,失败时两腿资金一起还原,
//     账上零残留 —— 尤其不许只剩一条(半边账)。
//
// 方法:行为断言用 esbuild 载**真 store + 真收口点**跑真代码(不抄判据副本),假 uni storage
// 可定点注入写失败;结构断言跑在**剥注释后的正主源码**上(注释里出现判定式文本不得哄绿)。
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { atAliasResolver } from "./lib/at-alias.mjs";
import { VUE_STUB_NXREF, runtimeStub } from "./lib/harness-stubs.mjs";
import { strip } from "./lib/strip-code.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");
const read = (...p) => readFileSync(path.join(root, ...p), "utf8");

// primitives 从 PRIMS.length 取,不写死 —— 原来写死 5 而实跑只有 4 个原语,
// 收尾行报的是记忆里的数;而这个脚本自己别处正反对「写死数字」。
const samples = { primitives: 0, targets: 0, scanned: 0, ledgerFiles: 0, locales: 0 };
// ⑤ 的接线名单要给 ⑥ 的反向入册门用,而两者各在自己的块作用域里 —— 用模块级变量传递,
// 不复制一份(复制的那份会和真名单漂移,门就变成对着旧名单判)。
let wiredFiles = [];
let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
/** 从 needle 起花括号配对抠出整块原文。抠不到 = 实现被改名/删除,直接炸(不许静默放行)。 */
function grabBlock(src, needle) {
  const start = src.indexOf(needle);
  if (start < 0) throw new Error(`selfcheck-money-receipt: 源码里找不到 \`${needle}\`(实现被改名或删除?)`);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`selfcheck-money-receipt: \`${needle}\` 括号不闭合`);
}

// 🔴 METHODS 必须与 bills store 的**写入原语导出面**同步 —— 从 `bills.ts` 的 `return { … }`
// 解析出 ground truth,不手写(z4 R1 两路独立审计 P0:手写清单对新增原语默认失明,
// `addManyForAccountOnce` 就是活样本 —— 加进 store 那天,⑥ 裸调门与反向入册门同时对它全盲)。
//
// 🔴 顺序无关,别再写「长的排前面」那种注释:三处用法都带后缀锚(`\s*\(` / `^…$` / `\s*[;\r\n]`),
// JS 交替会回溯,短名排头也命得中。实测(scratchpad 探针)短在前 / 长在前均 4/4,
// 唯一命不中的是**名字压根不在集合里**那一档(3/4)。上一版把成因归给顺序,是错的。
const BILL_WRITE_METHODS = (() => {
  const src = strip(readFileSync(path.join(root, "src/store/bills.ts"), "utf8"));
  // setup store 的导出面 = 那个同时含 `bills` 与 `bindAccount` 的 `return { … }`。
  // 不能取「第一个 return {」—— 函数体里的 `return { ...b, id }` 会先命中(实测取到 0 个原语)。
  const ret = [...src.matchAll(/return \{([^{}]*)\};/g)]
    .map((m) => m[1])
    .find((body) => /(?<![\w$])bills(?![\w$])/.test(body) && /bindAccount/.test(body));
  if (!ret) throw new Error("selfcheck-money-receipt: 解析不到 bills store 的导出面(结构变了?)");
  const writers = ret.split(",").map((s) => s.trim()).filter((n) => /^add/.test(n));
  if (writers.length < 3) throw new Error(`selfcheck-money-receipt: 写入原语只解析到 ${writers.length} 个,判据已失效`);
  return writers;
})();
const METHODS = BILL_WRITE_METHODS.join("|");
//
// 🔴 判据换口径(2026-08-04 对抗审计):原来判的是「**丢弃返回值**的裸调」,靠
// 「调用处在语句位」的前缀字符串识别。实测那条判据有三族逃逸,而且每族都是零成本触发:
//   ① **按行匹配** —— 真实 draft 都是多字段对象,`bills.add(` 后换行即逃(仓里无 .prettierrc,
//      而 purchase-sheet / stake-sheet / marketplace / wallet-repurchase 四处 `postMoneyBill(`
//      正是这种「首行只有 (、对象另起」的写法,同形迁到 bills.add( 就整族看不见);
//   ② **receiver 白名单只认三个名字** —— `const s = useBills(); s.add(…)` / `billStore.add(…)` /
//      `bills?.add(…)` / 解构后裸调 / `this.bills.add(…)` 全逃;
//   ③ **语句位前缀** —— void / await / 无花括号 else / 箭头体 / .then / 三元 / && / || /
//      .vue 内联 handler,10 种丢弃形态实测 10/10 逃逸。
//
// 换成:**任何对 bills 写入原语的调用都算,不再判返回值有没有被用**。
// 更简单、也严格更强 —— 合法的直调有且只有下面 ALLOW 里那几处,显式列出比逐处判语义可靠。
// (台账已清零,「丢弃 vs 接住」的区分本来就没有存在价值了。)
const ALLOW = {
  // 收口点自己 —— 它就是唯一该调 bills 写入的地方。额度是**等式**(多一处 / 少一处都红,
  // 见下方 ⑥ 的两条判据),所以这里多出一处丢弃式写入、或者删掉一处都会被看见。
  "src/lib/money-receipt.ts": 4,
  // 注册赠礼两条分录(addOnce ×2)。收口点目前没有「多腿 + 幂等」的出口(addMany 无 Once 变体),
  // 补齐前保留直调;两条分开写本身是半边账风险,已登记为 P2 欠账。
  "src/pages/register/register.vue": 2,
  // 测试专门直击 mock ledger 原语，验证分页改造后本地兼容、账号隔离和整组回滚。
  // 仅 Vitest 文件可达；精确 3 次调用，多一处或少一处同样会触发下面的等式门。
  "src/store/bills-mock-compatibility.test.ts": 3,
  // `businessTimeouts.add(handle)`(App.vue:76,Set.add 存定时器句柄,与 bills 无关)。
  // 判据是**有意的过近似**(见 billsWriteHits 头注):文件跟 bills 有关系后,任何 `.add(`
  // 成员调用都计入,多算的这一处按机制在额度里精确登记 —— 宁可过近似再逐个登记。
  // (该条目在 2026-08-12 双向分叉合并里丢过一次,合并算法按「只有一边改」取了没有它的那侧。)
  "src/App.vue": 1,
};
/** 找出一个文件里全部 bills 写入调用的位置(跨行、认别名、认解构、认可选链)。 */
function billsWriteHits(src) {
  // 🔴 判据翻转(2026-08-04 独立验收:枚举 receiver 名字的版本被实测出 **10 条逃逸**)。
  //
  // 上一版在枚举「哪些名字是 bills」——而名字是**开放集合**:改名导入、局部别名、
  // 先声明后赋值(`let s; s = useBills()`)、多声明符、计算成员、解构改名
  // (上一版拿**别名**去比方法名,永远比不中)、方法引用、本地 wrapper、可选调用、
  // 形参注入 —— 每加一个名字,就漏掉下一种写法。其中「解构改名」与「先声明后赋值」
  // 是**正常人会写出来的形状**,不是刁钻构造。
  //
  // 换成两段式:① 这文件**跟 bills store 有没有关系**(import / useBills 出现过);
  // ② 有关系的话,**任何形式的写入方法调用都算**,不再判 receiver 叫什么。
  // 这是**有意的过近似**:同一文件里不相干的 `foo.add(` 也会计入。可接受 ——
  // 与 bills 有关系的文件本来就只有 WIRED ∪ ALLOW 那十几个,而 ALLOW 钉的是**精确条数**,
  // 多算的那次会以「额度对不上」暴露出来,不会被静默吞掉。
  // 宁可过近似再逐个登记,也不要欠近似而永远看不见。
  if (!/useBills|@\/store\/bills|["']\.\/bills["']/.test(src)) return 0;
  let count = 0;
  // ① 任意 receiver 的成员调用(可选链 / 跨行 / 形参注入 / wrapper 全覆盖)
  count += [...src.matchAll(new RegExp(`\\??\\.\\s*(?:${METHODS})\\s*\\(`, "g"))].length;
  // ①b 计算成员 —— **不判方括号里写的是什么**:`useBills()["add"]` 的字符串内容被 strip
  // 抹掉了(那是 strip 的正确行为),而 `bills[m]` 的方法名**运行期才知道**,静态判据
  // 原理上判不出来。所以只判形状。receiver 仍判一层(名字含 bills 或 useBills() 的返回),
  // 否则会误伤同文件里任何一张查表(实测 `QUEST_ROUTE_MEMO_TASK[id](t)` 被算了进来)。
  count += [...src.matchAll(/(?:useBills\s*\??\s*\(\)|[\w$]*[Bb]ills[\w$]*)\s*\??\s*\[\s*[^\]\r\n]{1,40}\]\s*\(/g)].length;
  // ② 解构出来的裸调 —— **按 key 判、按 alias 找**(改名是上一版漏掉的那族)
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=\s*[^;\n]*useBills\s*\??\s*\(\)/g)) {
    for (const part of m[1].split(",")) {
      const seg = part.split(":");
      const key = (seg[0] ?? "").trim();
      const alias = (seg[1] ?? seg[0] ?? "").trim();
      if (!alias || !new RegExp(`^(?:${METHODS})$`).test(key)) continue;
      count += [...src.matchAll(new RegExp(`(?<![\\w$.])${alias}\\s*\\(`, "g"))].length;
    }
  }
  // ③ 方法引用后再调:`const f = b.add;` → 之后的裸 `f(`
  for (const m of src.matchAll(new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*[\\w$.?]+\\.\\s*(?:${METHODS})\\s*[;\\r\\n]`, "g"))) {
    count += [...src.matchAll(new RegExp(`(?<![\\w$.])${m[1]}\\s*\\(`, "g"))].length;
  }
  return count;
}
/** 🔴 `.vue` 要分区段扫:`<template>` 里引号内是**表达式**(`@tap="bills.add(…)"` 实测能逃),
 *  `<script>` 里引号内是**数据**(文案里出现 `bills.add(` 是常事)。同一份口径必错一边。 */
function scanSource(rel, raw) {
  if (!rel.endsWith(".vue")) return billsWriteHits(strip(raw));
  let total = 0;
  let last = 0;
  for (const m of raw.matchAll(/<script[\s\S]*?<\/script>/g)) {
    total += billsWriteHits(strip(raw.slice(last, m.index), true)); // 模板段:保留引号内容
    total += billsWriteHits(strip(m[0]));                            // 脚本段:抹掉引号内容
    last = m.index + m[0].length;
  }
  total += billsWriteHits(strip(raw.slice(last), true));
  return total;
}

console.log("selfcheck-money-receipt — 资金变更 ⊗ 收据:落盘失败不许静默");

// ── 假 uni storage:JSON 序列化(与 localStorage 同语义);写失败可按 key 定点注入 ──
const disk = new Map();
let failKey = null; // (key, nthWriteToThatKey) => boolean;命中即抛,模拟配额撑满 / storage 不可用
const writes = []; // 落盘次数台账 —— 「两条分录一次落盘」这条不变量只有数写入次数才证得出来
const uni = {
  getStorageSync(key) {
    const raw = disk.get(key);
    return raw === undefined ? "" : JSON.parse(raw);
  },
  setStorageSync(key, value) {
    writes.push(key);
    if (failKey && failKey(key, writes.filter((k) => k === key).length)) throw new Error("QuotaExceededError (injected)");
    disk.set(key, JSON.stringify(value));
  },
  removeStorageSync(key) { disk.delete(key); },
  getSystemInfoSync() { return { language: "en" }; },
};
globalThis.uni = uni;

const CLOUD_KEY = "nexgrid-account-cloud-v1";
const BILLS_KEY = "nexgrid-bills-accounts-v1";

// ── 载真代码。pinia stub 必须复刻两条真语义,否则测的不是线上那条路径:
//    ① 记忆化:一个 id 一个实例(否则收口点里的 useApp() 每次新建,状态对不上);
//    ② **自动解包 ref**:store 上的 `app.user` 在真 pinia 里就是 UserState,不是 {value}。
//       少了这条,收口点里 `app.user.usdtBalance` 恒 undefined —— 判据会静默走错分支而全绿。 ──
const STUBS = {
  "pinia-stub": `const cache = new Map();
const unwrap = (v) => (v && typeof v === "object" && v.__nxRef === true);
export const defineStore = (id, setup) => () => {
  if (!cache.has(id)) cache.set(id, new Proxy(setup(), {
    get(t, k) { const v = Reflect.get(t, k); return unwrap(v) ? v.value : v; },
    set(t, k, val) { const v = Reflect.get(t, k); if (unwrap(v)) { v.value = val; return true; } return Reflect.set(t, k, val); },
  }));
  return cache.get(id);
};`,
  "vue-stub": VUE_STUB_NXREF,
  "runtime-stub": runtimeStub(root),
};
const bundle = await build({
  stdin: {
    contents: `export { postMoneyBill, postMoneyBills, postReceiptOnly, postReceiptOnce, postReceiptForAccount } from "@/lib/money-receipt";
export { useApp } from "@/store/app";
export { useBills } from "@/store/bills";
export { useUI } from "@/store/ui";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true, write: false, format: "esm",
  // vite 注入的编译期常量;node 里没有 import.meta.env,不 define 会在模块顶层直接炸。
  define: { "import.meta.env": JSON.stringify({ PROD: false, DEV: true, MODE: "selfcheck" }) },
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
      b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
      b.onResolve({ filter: /^@\/api\/runtime$/ }, () => ({ path: "runtime-stub", namespace: "stub" }));
      b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "selfcheck-money-receipt"));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js" }));
    },
  }],
});
const { postMoneyBill, postMoneyBills, postReceiptOnly, postReceiptOnce, postReceiptForAccount, useApp, useBills, useUI } =
  await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64"));

const app = useApp();
const bills = useBills();
const ui = useUI();
const ACCT = "receipt-invariant@nexgrid.test";

/** 把账号重置到一个干净的起点(总余额 = 可提额度 = usdt)。 */
function reset({ usdt = 10000, nex = 500, withdrawable = null } = {}) {
  failKey = null;
  disk.clear();
  app.bindAccount(ACCT);
  bills.bindAccount(ACCT);
  // 🔴 必须整体换新对象:user 与 lastCloudSnapshot.user 是同一个引用,原地改会把
  // 三路合并的 base 一起改掉 → delta 恒为 0,种子写不进去(种到一半比种不进去更难查)。
  const u = app.user;
  app.user = {
    ...u,
    usdtBalance: usdt,
    nexBalance: nex,
    earningBuckets: { ...u.earningBuckets, withdrawableUsdt: withdrawable === null ? usdt : withdrawable },
  };
  app.persistAccountSnapshot();
  bills.bills = []; // 丢掉 mock 种子的 30 天流水,账单条数断言才有意义
  ui.toasts = [];
  writes.length = 0;
  return money();
}
function money() {
  const u = app.user;
  return { usdt: u.usdtBalance, nex: u.nexBalance, withdrawable: u.earningBuckets.withdrawableUsdt };
}
/** 磁盘上那份(不是内存)—— 内存/磁盘不对称正是本族的病根,必须分开看。 */
function diskMoney() {
  const u = uni.getStorageSync(CLOUD_KEY)?.[ACCT]?.user;
  return u ? { usdt: u.usdtBalance, nex: u.nexBalance, withdrawable: u.earningBuckets?.withdrawableUsdt } : null;
}
function billCount() {
  return (uni.getStorageSync(BILLS_KEY)?.[ACCT]?.bills ?? []).length;
}
function writesTo(key) {
  return writes.filter((k) => k === key).length;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const draft = (over = {}) => ({ type: "purchase", symbol: "USDT", amount: -100, status: "posted", memo: "selfcheck", ...over });

// ── ① 资金原语落盘失败 → 返回 false 且内存不脏 ────────────────────────────────────
{
  const PRIMS = [
    ["debitBalance", () => app.debitBalance(250)],
    ["creditBalance", () => app.creditBalance(250)],
    ["debitNex", () => app.debitNex(60)],
    ["creditNex", () => app.creditNex(60)],
  ];
  samples.primitives = PRIMS.length;
  samples.targets += PRIMS.length;
  for (const [name, run] of PRIMS) {
    const before = reset();
    const beforeDisk = diskMoney();
    failKey = (k) => k === CLOUD_KEY; // 只让资金落盘失败
    const ok = run();
    check(`① ${name} 落盘失败时返回 false(不再"改了内存就当成功")`, ok === false, `返回 ${ok}`);
    check(`① 🔴 ${name} 落盘失败后**内存不脏**(与磁盘保持对称,刷新不会回退)`,
      same(money(), before), `内存 ${JSON.stringify(money())} vs 期望 ${JSON.stringify(before)}`);
    check(`① ${name} 落盘失败后磁盘原样未动`, same(diskMoney(), beforeDisk));
  }
}

// ── ② bills 写失败 → 整笔回滚 + 报失败(核心:不许"钱动了、账没记上")──────────────
{
  samples.targets += 2;
  const before = reset();
  failKey = (k) => k === BILLS_KEY; // 资金写得进去,收据写不进去
  const outcome = postMoneyBill(draft({ amount: -1500 }));
  check("② 收口点报失败(不再返回成功)", outcome === "failed", `outcome=${outcome}`);
  check("② 🔴 资金被整笔还原 —— 内存里钱没少", same(money(), before), JSON.stringify(money()));
  check("② 🔴 磁盘上钱也没少(内存假装回滚、磁盘还扣着 = 刷新即少钱)",
    same(diskMoney(), { usdt: before.usdt, nex: before.nex, withdrawable: before.withdrawable }),
    JSON.stringify(diskMoney()));
  check("② 账上一条记录都不留(内存 + 磁盘)", bills.bills.length === 0 && billCount() === 0);
  check("② 🔴 用户看得到失败提示(静默吞掉 = 用户以为成功)",
    ui.toasts.some((t) => t.kind === "error"), JSON.stringify(ui.toasts));
  // 反向断言:本族的病症形态 = 钱动了 && 账上无凭证。这一条为 false 才算病治好。
  const moneyMoved = !same(money(), before) || !same(diskMoney(), { usdt: before.usdt, nex: before.nex, withdrawable: before.withdrawable });
  check("② 🔴 病症形态不成立:「钱动了 && 没收据」为假", !(moneyMoved && billCount() === 0));

  // 入账方向同样收口(试用返还 / 奖励走的是这条)
  const before2 = reset();
  failKey = (k) => k === BILLS_KEY;
  const credited = postMoneyBill(draft({ type: "bonus", amount: 88 }));
  check("② 入账方向同样回滚(+88 收据写失败 → 余额没多出来)",
    credited === "failed" && same(money(), before2), `${credited} / ${JSON.stringify(money())}`);
  const beforeNex = reset();
  failKey = (k) => k === BILLS_KEY;
  const nexed = postMoneyBill(draft({ type: "bonus", symbol: "NEX", amount: 120 }));
  check("② NEX 方向同样回滚(symbol 决定动哪种币,回滚也按同一维度)",
    nexed === "failed" && same(money(), beforeNex), `${nexed} / ${JSON.stringify(money())}`);

  // 资金侧写失败时压根不该写收据(否则变成反向病症:账记了、钱没动)
  reset();
  failKey = (k) => k === CLOUD_KEY;
  const moneyFailed = postMoneyBill(draft({ amount: -300 }));
  check("② 资金写失败时收据也不落(反向病症:账记了、钱没动)",
    moneyFailed === "failed" && bills.bills.length === 0);
}

// ── ③ 退款把 withdrawableUsdt 还原到扣款前 ───────────────────────────────────────
{
  samples.targets += 1;
  // 审计场景:可提 $8000 的账号,扣掉 7999 后可提被 clamp 到 1;退款若只加总余额,
  // 可提额度就永久停在 1 —— 钱回来了却提不出去。
  const before = reset({ usdt: 8000, withdrawable: 8000 });
  const snapshot = app.captureMoney(); // 调用点拿到的就是这份(不是测试自己拼的形状)
  const paid = postMoneyBill(draft({ amount: -7999 }));
  check("③ 扣款成功,可提额度被 clamp 到剩余总余额(既有不变量,未改)",
    paid === "ok" && money().usdt === 1 && money().withdrawable === 1, JSON.stringify(money()));
  // applied = 本页自己动过多少钱的读数(R5 起冲正按它算增量,不写绝对值);三个绝对值仍在。
  check("③ captureMoney 返回资金三元组 + applied 读数(字段名与 restoreMoney 对得上)",
    same(Object.keys(snapshot).sort(), ["applied", "nexBalance", "usdtBalance", "withdrawableUsdt"])
    && same(Object.keys(snapshot.applied).sort(), ["nexBalance", "usdtBalance", "withdrawableUsdt"]),
    Object.keys(snapshot).join(","));

  const reversed = postMoneyBill(draft({ amount: 7999, memo: "reversal" }), { restoreTo: snapshot });
  check("③ 🔴 冲正后 withdrawableUsdt 恢复到扣款前(不是停在被 clamp 的 1)",
    reversed === "ok" && same(money(), before), JSON.stringify(money()));
  check("③ 冲正也落到磁盘(内存对、磁盘不对 = 刷新又变回去)",
    same(diskMoney(), { usdt: before.usdt, nex: before.nex, withdrawable: before.withdrawable }), JSON.stringify(diskMoney()));
  check("③ 冲正是**反向分录**不是改写原行:扣款行 + 退款行两条并存,净额为 0",
    bills.bills.length === 2
    && bills.bills.reduce((s, b) => s + b.amount, 0) === 0, JSON.stringify(bills.bills.map((b) => b.amount)));

  // 负控:证明「裸 creditBalance 退款」确实还不回可提额度 —— 不变量②的必要性不是臆想
  const before2 = reset({ usdt: 8000, withdrawable: 8000 });
  app.debitBalance(7999);
  app.creditBalance(7999);
  check("③ 负控:裸 creditBalance 退款**还不回**可提额度(所以退款必须走 restoreTo)",
    money().usdt === before2.usdt && money().withdrawable === 1, JSON.stringify(money()));
}

// ── ④ 成功路径负控:与改前逐项等价 ───────────────────────────────────────────────
{
  samples.targets += 1;
  // 用二进制可精确表示的金额下靶(0.25 / 0.5),再单独测「两位小数截断」这条属性,
  // 免得断言写成浮点噪声(0.005 那类值本身就落在 toFixed 的边界上,测不出语义)。
  reset({ usdt: 1000.25, nex: 300 });
  check("④ 成功路径:扣款金额与舍入不变(两位小数,与改前同一条表达式)",
    app.debitBalance(0.25) === true && app.user.usdtBalance === 1000, `${app.user.usdtBalance}`);
  check("④ 成功路径:入账金额与舍入不变",
    app.creditBalance(0.25) === true && app.user.usdtBalance === 1000.25, `${app.user.usdtBalance}`);
  check("④ 成功路径:两位小数截断照旧(0.001 级零头不进余额)",
    app.debitBalance(0.001) === true && app.user.usdtBalance === 1000.25, `${app.user.usdtBalance}`);
  check("④ 成功路径:NEX 双向不变",
    app.debitNex(0.5) === true && app.user.nexBalance === 299.5
    && app.creditNex(0.5) === true && app.user.nexBalance === 300, `${app.user.nexBalance}`);

  reset({ usdt: 100, nex: 10 });
  check("④ 守卫拒绝语义不变:NaN / Infinity / 负数 / 余额不足 一律 false 且零副作用",
    [app.debitBalance(NaN), app.debitBalance(Infinity), app.debitBalance(-1), app.debitBalance(101),
      app.creditBalance(NaN), app.creditBalance(-1),
      app.debitNex(NaN), app.debitNex(-1), app.debitNex(11), app.creditNex(NaN), app.creditNex(-1)].every((r) => r === false)
    && app.user.usdtBalance === 100 && app.user.nexBalance === 10);

  const start = reset({ usdt: 5000, withdrawable: 5000 });
  const ok = postMoneyBill(draft({ amount: -1234.56, ref: "SC-OK-1" }));
  check("④ 成功路径:收口点返回 ok,余额精确扣减,账上正好一条",
    ok === "ok" && money().usdt === +(start.usdt - 1234.56).toFixed(2) && bills.bills.length === 1);
  check("④ 成功路径:资金与收据都真落盘(不是只在内存里好看)",
    diskMoney().usdt === money().usdt && billCount() === 1);
  check("④ 收据字段原样透传(type / symbol / status / memo / ref 一个不改)",
    (() => { const b = bills.bills[0];
      return b.type === "purchase" && b.symbol === "USDT" && b.status === "posted" && b.memo === "selfcheck" && b.ref === "SC-OK-1"; })());
  check("④ 余额不足与落盘失败是两种结果(前者零副作用,调用点用自己的文案)",
    postMoneyBill(draft({ amount: -999999 })) === "insufficient" && bills.bills.length === 1);
  check("④ 金额非法(0 / NaN)零副作用",
    postMoneyBill(draft({ amount: 0 })) === "insufficient" && postMoneyBill(draft({ amount: NaN })) === "insufficient"
    && bills.bills.length === 1);

  // postReceiptOnly:资金已不可回滚时的既定处置 = 明确告知,绝不静默
  reset();
  check("④ postReceiptOnly 正常写入返回 true", postReceiptOnly(draft({ amount: -10, ref: "SC-RO" })) === true);
  ui.toasts = [];
  failKey = (k) => k === BILLS_KEY;
  check("④ 🔴 postReceiptOnly 写失败返回 false 且弹错(不可回滚场景也不许静默)",
    postReceiptOnly(draft({ amount: -10, ref: "SC-RO-2" })) === false
    && ui.toasts.some((t) => t.kind === "error"));
  failKey = null;

  // postReceiptOnce:同语义 + 按 ref 判重(三条入金轨的钱由 recordDeposit 落定且不可回滚,
  // 而到账回调会重投 —— 幂等与失败处置必须在同一个收口点里,不许调用点各写各的)
  reset();
  check("④ postReceiptOnce 正常写入返回 true", postReceiptOnce(draft({ amount: 30, ref: "SC-ONCE" })) === true);
  check("④ 🔴 同 ref 重放不写出第二条(入金回调重投是常态,判重丢了就是重复入账的账)",
    postReceiptOnce(draft({ amount: 30, ref: "SC-ONCE" })) === true && bills.bills.length === 1 && billCount() === 1);
  check("④ postReceiptOnce 换 ref 照常写入(判重是按 ref,不是把所有重复都吞掉)",
    postReceiptOnce(draft({ amount: 30, ref: "SC-ONCE-2" })) === true && bills.bills.length === 2);
  ui.toasts = [];
  failKey = (k) => k === BILLS_KEY;
  check("④ 🔴 postReceiptOnce 写失败返回 false 且弹错(幂等不等于可以静默)",
    postReceiptOnce(draft({ amount: 30, ref: "SC-ONCE-3" })) === false
    && ui.toasts.some((t) => t.kind === "error"));
  failKey = null;
}

// ── ⑦ 多腿交易(兑换:一进一出两腿 + 两条分录)原子性 ────────────────────────────────
// 设计裁决:两条分录**一次落盘**(bills.addMany 单次 persist)。因此「第一条落了、第二条
// 失败」的中间态不存在 —— 既不需要删第一条,也不需要补冲正分录(没有既成事实可冲)。
{
  samples.targets += 3;
  // (a) 成功路径:两腿资金都动、正好两条分录、且**只写了一次盘**(原子性的活体证明)
  const start = reset({ usdt: 1000, nex: 200 });
  const billWritesBefore = writesTo(BILLS_KEY);
  const ok = postMoneyBills([
    { type: "swap", symbol: "USDT", amount: -100, status: "posted", memo: "swap out", ref: "SW-1" },
    { type: "swap", symbol: "NEX", amount: 1176, status: "posted", memo: "swap in", ref: "SW-1" },
  ]);
  check("⑦ 一进一出成功:两腿资金都动(USDT −100 / NEX +1176)",
    ok === "ok" && money().usdt === start.usdt - 100 && money().nex === start.nex + 1176, JSON.stringify(money()));
  check("⑦ 🔴 两条分录**一次落盘**(写盘次数 = 1;循环调 add 会是 2,那才有半边账的中间态)",
    writesTo(BILLS_KEY) - billWritesBefore === 1, `写了 ${writesTo(BILLS_KEY) - billWritesBefore} 次`);
  check("⑦ 两条分录都在,且共用同一时刻(它们本来就是同一笔交易)",
    billCount() === 2 && bills.bills[0].ts === bills.bills[1].ts && bills.bills[0].id !== bills.bills[1].id);

  // (b) 分录写失败 → **两腿**资金都还原、账上零残留(绝不允许留半边账)
  const before = reset({ usdt: 1000, nex: 200 });
  failKey = (k) => k === BILLS_KEY;
  const failed = postMoneyBills([
    { type: "swap", symbol: "USDT", amount: -100, status: "posted", memo: "swap out", ref: "SW-2" },
    { type: "swap", symbol: "NEX", amount: 1176, status: "posted", memo: "swap in", ref: "SW-2" },
  ]);
  check("⑦ 🔴 分录写失败 → 两腿资金都还原(USDT 与 NEX 同时回到交易前)",
    failed === "failed" && same(money(), before), JSON.stringify(money()));
  check("⑦ 🔴 账上零残留 —— 尤其不许只剩一条(半边账比没有账更难对)",
    bills.bills.length === 0 && billCount() === 0, `${bills.bills.length} / ${billCount()}`);

  // (c) 第二腿资金落盘失败 → 第一腿也要退回来(资金原语只保证自己那一次的对称)
  const before2 = reset({ usdt: 1000, nex: 200 });
  const cloudWrites = writesTo(CLOUD_KEY);
  failKey = (k, n) => k === CLOUD_KEY && n === cloudWrites + 2; // 放行第一腿,炸第二腿
  const legFailed = postMoneyBills([
    { type: "swap", symbol: "USDT", amount: -100, status: "posted", memo: "swap out", ref: "SW-3" },
    { type: "swap", symbol: "NEX", amount: 1176, status: "posted", memo: "swap in", ref: "SW-3" },
  ]);
  failKey = null;
  check("⑦ 🔴 第二腿落盘失败 → 第一腿已扣的钱也退回(不留「扣了没换到」)",
    legFailed === "failed" && same(money(), before2), `${legFailed} / ${JSON.stringify(money())}`);
  check("⑦ 第二腿失败时一条分录都不写", bills.bills.length === 0 && billCount() === 0);

  // (d) 合计预检:两腿各自够、合计不够 —— 必须零副作用退出,不许扣了第一腿才发现
  reset({ usdt: 150, nex: 0 });
  const overdrawn = postMoneyBills([
    { type: "purchase", symbol: "USDT", amount: -100, status: "posted", memo: "a", ref: "SW-4" },
    { type: "purchase", symbol: "USDT", amount: -100, status: "posted", memo: "b", ref: "SW-4" },
  ]);
  check("⑦ 合计预检:单腿够 / 合计不够 → insufficient 且零副作用",
    overdrawn === "insufficient" && money().usdt === 150 && bills.bills.length === 0, `${overdrawn} / ${money().usdt}`);
}

// ── ⑧ 指定账号的收据补记(postReceiptForAccount)——「钱扣在 A、账记到 B」 ──────────
// 提现的钱由服务端在 POST /api/withdrawals 里扣,而那个请求带的是**发起时**那个账号的
// 会话;client 在这 30s 超时窗口里可能被换号(跨标签页登出 / 运营吊销 / 重新登录都会
// rebind)。此时按「当前绑定」记账 = 把别人的钱记到你账上,不记 = 被扣的账号有扣款无凭证。
// 判据跑真 store:换号后写回**目标账号**,当前账号一条不沾。
{
  samples.targets += 3;
  const OTHER = "other-account@nexgrid.test";
  const readBillsOf = (acct) => uni.getStorageSync(BILLS_KEY)?.[acct]?.bills ?? [];
  const wdDrafts = (ref) => [
    { type: "withdraw", symbol: "USDT", amount: -500, status: "pending", memo: "wd", ref },
    { type: "withdraw", symbol: "NEX", amount: -3, status: "posted", memo: "fee", ref },
  ];

  // (a) 提交后换号:两条分录必须落到**被扣款的那个账号**,当前账号零沾染
  reset();
  bills.bindAccount(OTHER); // 模拟 await 期间被 rebind 走
  const billWritesBefore = writesTo(BILLS_KEY);
  const wrote = postReceiptForAccount(ACCT, wdDrafts("WD-X-1"));
  check("⑧ 🔴 换号后写回被扣款的那个账号(不是当前绑定的)",
    wrote === true && readBillsOf(ACCT).filter((b) => b.ref === "WD-X-1").length === 2,
    `目标账号 ${readBillsOf(ACCT).length} 条`);
  // 内存侧按 **ref** 判、不按条数判:bindAccount 到一个空账号会水合出 mock 的 30 天种子
  // (实测 39 条),拿 length===0 当判据是把种子误当成污染 —— 判据要盯的是「这一笔有没有
  // 串到别人账上」。磁盘侧仍按条数判:种子不落盘,真串账会把种子一起写进去(41 条)。
  check("⑧ 🔴 当前绑定账号一条都不沾(否则就是把别人的流水记到你账上)",
    readBillsOf(OTHER).length === 0 && !bills.bills.some((b) => b.ref === "WD-X-1"),
    `盘 ${readBillsOf(OTHER).length} 条 / 内存命中 ${bills.bills.filter((b) => b.ref === "WD-X-1").length} 条`);
  check("⑧ 🔴 两条分录**一次落盘**(与 addMany 同纪律:不存在只落一条的半边账)",
    writesTo(BILLS_KEY) - billWritesBefore === 1, `写了 ${writesTo(BILLS_KEY) - billWritesBefore} 次`);

  // (b) 没换号:退化成 add —— 内存态要同步刷新,页面才立刻看得见
  reset();
  const wroteSelf = postReceiptForAccount(ACCT, wdDrafts("WD-X-2"));
  check("⑧ 目标即当前账号时内存立即可见(页面不用等下次水合)",
    wroteSelf === true && bills.bills.filter((b) => b.ref === "WD-X-2").length === 2,
    `内存 ${bills.bills.length} 条`);

  // (c) 落盘失败 → 返回 false + 盘上零残留 + **不弹通用提示**(由调用方给带下一步的专属文案;
  //     收口点一条 + 页面一条同屏正是 2026-08-04 修过的同型)
  reset();
  bills.bindAccount(OTHER);
  ui.toasts = [];
  failKey = (k) => k === BILLS_KEY;
  const failedWrite = postReceiptForAccount(ACCT, wdDrafts("WD-X-3"));
  failKey = null;
  check("⑧ 🔴 落盘失败 → 返回 false、盘上零残留、且**不**抢着弹通用提示(交底权在调用方)",
    failedWrite === false && readBillsOf(ACCT).length === 0 && ui.toasts.length === 0,
    `${failedWrite} / 盘 ${readBillsOf(ACCT).length} 条 / toast ${ui.toasts.length}`);

  // (d) 🔴 同 ref 重放只写一次 —— 歧义结局保留幂等键、服务端返回同一张单,这条链的现实形态。
  //     三路独立审计各自命中(z4 R1):没有这一格,账单上会出现两条同单号的 −$X。
  reset();
  bills.bindAccount(OTHER);
  postReceiptForAccount(ACCT, wdDrafts("WD-X-4"));
  const ofRef = () => readBillsOf(ACCT).filter((b) => b.ref === "WD-X-4").length;
  const firstCount = ofRef();
  const replayed = postReceiptForAccount(ACCT, wdDrafts("WD-X-4"));
  check("⑧ 🔴 同 ref 重放不写第二遍(仍返回 true —— 收据已在账上就是成功)",
    replayed === true && firstCount === 2 && ofRef() === 2,
    `该单号首轮 ${firstCount} 条 → 重放后 ${ofRef()} 条`);

  // (d2) 目标 == 当前绑定这条路也要判重(两条路不许各自漂移)
  reset();
  postReceiptForAccount(ACCT, wdDrafts("WD-X-5"));
  postReceiptForAccount(ACCT, wdDrafts("WD-X-5"));
  check("⑧ 🔴 绑定账号那条路同样按 ref 判重",
    bills.bills.filter((b) => b.ref === "WD-X-5").length === 2,
    `${bills.bills.filter((b) => b.ref === "WD-X-5").length} 条`);

  // (d3) 🔴 补记历史事件必须盖**事件时刻**,不是「现在」。
  //      自愈补写一笔三天前的提现时若盖当前时钟,那两行会落在账单页**今天**这一组的最上面 ——
  //      账本给自己的历史标错日期(账单页按 ts 分月分组、倒序排)。
  reset();
  const OLD_TS = Date.now() - 3 * 24 * 3600 * 1000;
  postReceiptForAccount(ACCT, wdDrafts("WD-X-7"), OLD_TS);
  const backfilled = bills.bills.filter((b) => b.ref === "WD-X-7");
  check("⑧ 🔴 补记历史事件盖的是事件时刻(不是现在)",
    backfilled.length === 2 && backfilled.every((b) => b.ts === OLD_TS),
    `ts=${JSON.stringify(backfilled.map((b) => b.ts))} 期望 ${OLD_TS}`);
  // 不传则仍取当前时钟 —— 正常提交路径不该被这个参数影响
  reset();
  const beforeNow = Date.now() - 1000;
  postReceiptForAccount(ACCT, wdDrafts("WD-X-8"));
  check("⑧ 不传事件时刻时仍取当前时钟(正常提交路径不受影响)",
    bills.bills.filter((b) => b.ref === "WD-X-8").every((b) => b.ts >= beforeNow),
    JSON.stringify(bills.bills.filter((b) => b.ref === "WD-X-8").map((b) => b.ts)));

  // (e) 目标账号**已有**分录时必须全部保留 —— 直写是「读盘 → 合并 → 整行写回」,
  //     合并写错会静默吞掉该账号的历史(独立审计指出 ⑧ 原来只验了空账号那一格)。
  reset();
  bills.bindAccount(ACCT);
  bills.add({ type: "bonus", symbol: "USDT", amount: 1, status: "posted", memo: "pre-existing", ref: "PRE-1" });
  // 先落一次盘,目标账号才有**稳定 id** 的既有行可比(种子每次 hydrate 都重新发 id,
  // 拿两次独立 hydrate 的 id 互比是比不出东西的 —— 这一条我第一版就写错了)。
  const before6 = readBillsOf(ACCT);
  const keptIds = before6.map((b) => b.id);
  bills.bindAccount(OTHER);
  postReceiptForAccount(ACCT, wdDrafts("WD-X-6"));
  const after = readBillsOf(ACCT);
  check("⑧ 🔴 直写不吞目标账号既有分录(原 N 条 id 全在 + 新增 2 条)",
    keptIds.length > 30 && after.length === keptIds.length + 2 && keptIds.every((id) => after.some((b) => b.id === id)),
    `原 ${keptIds.length} 条 → 现 ${after.length} 条,原 id 存活 ${keptIds.filter((id) => after.some((b) => b.id === id)).length}`);
  reset();
}

// ── ⑤ 接线门:判定对不对 / 有没有被接上,是两道门 ─────────────────────────────────
{
  const appSrc = strip(read("src", "store", "app.ts"));
  // 🔴 名单含 restoreMoney(R5 补漏):它和四个原语一样改余额、一样会落盘失败,漏在名单外
  // 就等于「冲正落盘失败」这一格没人守 —— 而那正是 R5 P0 的所在层。
  for (const fn of ["function creditBalance", "function debitBalance", "function creditNex", "function debitNex",
    "function restoreMoney"]) {
    const body = grabBlock(appSrc, fn);
    check(`⑤ app.ts ${fn.replace("function ", "")} 接了落盘结果 + 失败回滚`,
      /if \(!persistAccountSnapshot\(\)\)/.test(body) && /adoptAccountSnapshot\(previousSnapshot\)/.test(body),
      body.replace(/\s+/g, " ").slice(0, 100));
  }
  check("⑤ app.ts 暴露 captureMoney / restoreMoney(冲正的唯一正确基准)",
    /captureMoney,\s*restoreMoney/.test(appSrc) && /function restoreMoney\(/.test(appSrc));

  // 全站每一个动钱的调用点都在这张表上 —— 台账(⑥)清零只证明「没人裸调」,
  // 这张表证明「都接到收口点上了」。两件事分开守:漏接一个,⑥ 也是绿的。
  const WIRED = [
    // 🔴 本地冲正路径(staking / wallet-repurchase)都有「扣款 → 给货失败 → 冲正」
    // 这一格,所以除了「走没走收口点」,还要守住冲正的**正确形状**:captureMoney
    // 取基准 + restoreTo 还原。少了 restoreTo 的 `postMoneyBill(反向 draft)` 只是盲加一笔
    // credit —— 钱回来了、可提额度回不来($8000 → $1),而它照样能让「含 postMoneyBill(」
    // 这种粗判据全绿。
    // b023674 起周任务路由奖励并入 claim 族统一出口 postMoneyBillsOnce(claim-idempotency
    // 门对它全绿);postMoneyBill(退款冲正)这一针照旧。
    // 🔴 包 z6(2026-08-11)把 `postReceiptOnly` 换成 `postReceiptForAccount`:NEX 退还的冲正
    // 分录原本在 App.vue 里单写一段(走 postReceiptOnly),现已并进 ⓪ 的纯函数
    // `withdrawalBillDrafts`,由 ⓪ 既有的 `postReceiptForAccount` 一并落账 ——
    // 补分录这件事没消失,只是换了出口。顺带把它入册:它一直是 App.vue 的动账出口之一,
    // 却从没上过这张表(⓪ 的提现主行走的就是它),漏针的话这条路改坏了本门也不红。
    ["src/App.vue", ["postMoneyBill", "postMoneyBillsOnce", "postReceiptForAccount"]],
    // 🔴 2026-08-13 重新入册(此前按「已迁真实后端」移除):迁移把页面的本地扣款/冲正/记账
    //   整段删了,可 mock 模式没有服务端 —— 实测创世节点**白送**(铸了席位、余额分文未动、
    //   账单零行)。现按 `!remoteApiEnabled` 恢复,远端模式一行不走,但生产者确实回来了。
    //   三针与另外三条冲正路径同形:captureMoney 取基准 + restoreTo 还原可提额度,
    //   少了 restoreTo 就只是盲加一笔 credit(钱回来了、可提额度回不来)。
    ["src/components/genesis/purchase-sheet.vue", ["postMoneyBill", "captureMoney", "restoreTo:"]],
    // 二级交易(marketplace)仍在服务端原子资金链上,页面不本地动钱。
    // weekly-quest 两页的本地发奖已迁服务端(2026-08-12 批次),不再走收口点 —— 台账按事实移除。
    ["src/components/lucky-spin-sheet.vue", ["postMoneyBill"]],
    // R5 补登:与复投页同形的第二个建仓入口。三针 —— 它 `:166` 取基准、`:199` 冲正,
    // 与另三条冲正路径完全同形,却一直只上了 1 针(删掉 `{restoreTo}` 门照样绿)。
    ["src/components/staking/stake-sheet.vue", ["postMoneyBill", "captureMoney", "restoreTo:"]],
    ["src/components/tradein-sheets.vue", ["postMoneyBill"]],
    ["src/lib/share.ts", ["postMoneyBillsOnce"]],
    ["src/store/payout-address.ts", ["postMoneyBillsOnce"]],
    ["src/pages/daily/daily.vue", ["postMoneyBillsOnce"]],
    ["src/pages/events/events.vue", ["postMoneyBillsOnce"]],
    ["src/pages/me/achievements.vue", ["postMoneyBillsOnce"]],
    ["src/pages/me/wallet-cards-new.vue", ["postMoneyBillsOnce"]],
    ["src/pages/me/wallet-exchange.vue", ["postMoneyBills"]],
    ["src/pages/me/wallet-repurchase.vue", ["postMoneyBill", "captureMoney", "restoreTo:"]],
    // 提现:钱由服务端在 POST /api/withdrawals 里扣(本页零资金写),但收据必须落地 ——
    // 走 postReceiptForAccount(账号取提交快照,不看当前绑定)。
    ["src/pages/me/wallet-withdraw.vue", ["postReceiptForAccount"]],
    // wallet-topup.vue 已移出收口名单(2026-08-05 包 E):旧 $1 验证分录随机制删除,
    // 页面本身不再产生任何资金分录(常规充值记账在 deposits store / panes 收口)。
    // 下方零记账断言防它悄悄长回裸调。
    ["src/pages/staking/staking.vue", ["postMoneyBill"]],
    ["src/pages/store/bundle.vue", ["postReceiptOnly"]],
    ["src/pages/store/checkout.vue", ["postMoneyBill", "postReceiptOnly"]],
    ["src/store/deposits.ts", ["postReceiptOnce"]],
  ];
  samples.wired = WIRED.length;
  wiredFiles = WIRED.map(([f]) => f);
  /** 从 `needle(` 起按括号配对抠出**这一次调用的完整实参块**(跨行)。
   *  🔴 为什么要它:原来三针是 `src.includes(...)` 全文件共现即过 —— `captureMoney()` 写在
   *  页面顶部、`restoreTo:` 落在另一个无关对象里,冲正分支实际已被删,门照样绿(实测)。
   *  绑到同一次调用上,「有没有这个形状」才真的被守住。 */
  function callArgs(src, needle) {
    const out = [];
    let from = 0;
    for (;;) {
      const i = src.indexOf(`${needle}(`, from);
      if (i < 0) break;
      let depth = 0;
      let j = i + needle.length;
      for (; j < src.length; j++) {
        if (src[j] === "(") depth++;
        else if (src[j] === ")") { depth--; if (depth === 0) { j++; break; } }
      }
      out.push(src.slice(i, j));
      from = j;
    }
    return out;
  }
  for (const [rel, needles] of WIRED) {
    // keepStrings:⑤ 的 needle 含 import 路径与 `restoreTo:` 这类字面量,字符串内容要留;
    // ⑥ 判的是调用,字符串内容必须抹(见 strip 头注)。两档口径不同,不能共用一份。
    const src = strip(readFileSync(path.join(root, rel), "utf8"), true);
    const hasNeedles = needles.every((n) => src.includes(n.endsWith(":") ? n : `${n}(`));
    // 🔴 形状门:带 `restoreTo:` 的路径,那个属性必须真的落在某一次 postMoneyBill 的实参里,
    // 且同一文件确实取过基准(captureMoney)。三者散落三处 = 冲正已被拆掉,不算数。
    const shaped = !needles.includes("restoreTo:")
      || callArgs(src, "postMoneyBill").some((a) => a.includes("restoreTo"));
    check(`⑤ ${rel.split("/").pop()} 走收口点且不再裸调 bills.add`,
      // 以 `:` 收尾的 needle 是**对象属性**(restoreTo: before)不是调用,原样找;
      // 其余是调用点,补 `(` —— 否则光有 import 也算数。
      hasNeedles && shaped && src.includes('from "@/lib/money-receipt"')
      // 🔴 裸调禁令复用 ⑥ 的完整识别,不再只禁 `bills.add(` 这一种写法 —— 原判据下
      // `useBills().add(` / `bills.addMany(` / 别名 receiver / 跨行 全是合法的。
      // 🔴 口径必须与 ⑥ 同源(2026-08-12 合并收口):⑥ 已改成「≤ ALLOW 登记额度」,
      // 这里若仍写死 === 0,同一处过近似命中会被 ⑥ 放行、被 ⑤ 顶回,两条自相矛盾。
      && scanSource(rel, readFileSync(path.join(root, rel), "utf8")) <= (ALLOW[rel] ?? 0),
      needles.join("+") + (shaped ? "" : " ·🔴restoreTo 不在 postMoneyBill 实参里"));
  }

  // 包 E(2026-08-05):充值页零记账断言 —— 旧 $1 验证分录随机制删除后,
  // topup 页不得再出现任何记账调用(裸 bills 写入另由 ⑥ 零容忍门全站兜底)。
  {
    const src = readFileSync(path.join(root, "src/pages/me/wallet-topup.vue"), "utf8");
    check("⑤ wallet-topup.vue 零记账(旧验证分录已随机制删除,常规充值在 deposits 收口)",
      !src.includes("postMoneyBill") && !src.includes('from "@/lib/money-receipt"'));
  }

  const locales = ["en", "zh", "vi"];
  samples.locales = locales.length;
  check(`⑤ i18n 失败提示 ${locales.length} 语齐(txNotSaved + billMissing + fundsStuck + 三条冲正 memo)`,
    locales.every((l) => {
      const src = read("src", "i18n", "messages", `${l}.ts`);
      return ["txNotSavedTitle:", "txNotSavedMsg:", "billMissingTitle:", "billMissingMsg:",
        "fundsStuckTitle:", "fundsStuckMsg:",
        "genesisReversed:", "genesisSecondaryReversed:", "stakeReversed:"]
        .every((k) => src.includes(k));
    }));
}

// ── ⑥ 迁移棘轮:仍在裸调 bills 写入的存量点只许减不许增 ─────────────────────────────
{
  // 🔴 存量已清零(2026-08-04 迁移收官):16 个文件 / 29 处裸调全部接到收口点。
  // 台账留空不是把门拆了 —— 它现在是**零容忍**:任何文件冒出一处丢弃返回值的
  // bills 写入,`n > 0` 立刻判红。键是文件不是行号(行号会被并发编辑冲掉)。
  const LEDGER = {};
  const CHOKEPOINT = "src/lib/money-receipt.ts";
  const files = [];
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|vue|nvue|js|mjs)$/.test(e)) files.push(p);
      // 🔴 冒出没纳入扫描的代码后缀要**响亮报错**,不许静默跳过 —— 静默跳过等于那类文件
      // 对本门永久隐形(uni 工程的 .nvue 就是现成的例子)。先决定它该不该扫,别让它自己消失。
      else if (/\.(jsx|cjs|mts|cts)$/.test(e)) {
        throw new Error(`selfcheck-money-receipt: 出现未纳入扫描的代码后缀 ${p}`);
      }
    }
  })(SRC);
  samples.scanned = files.length;
  // 🔴 原语名单必须与 bills 的**全部**写入原语对齐(R5:漏了 addMany —— 而它正是「N 条分录
  // 一次落盘」的多腿原语、本族不变量的核心机制)。名单来源不是记忆:bills.ts 里对外暴露的
  // **建分录**函数(add / addMany / addOnce / addForAccount)。`settleByRef` 故意不在内 ——
  // 它改的是已有分录的状态,收口点不替代它。
  const found = {};
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, "/");
    const n = scanSource(rel, readFileSync(f, "utf8"));
    if (n > 0) found[rel] = n;
  }
  samples.ledgerFiles = Object.keys(ALLOW).length;
  // 双向判定:超出白名单额度 = 回潮;**低于**额度 = 白名单该收紧(删了调用却没删额度,
  // 等于给未来的新调用留了免检名额)。降数不报错但要显式提示,防止额度变成僵尸配额。
  const grown = Object.entries(found).filter(([f, n]) => n > (ALLOW[f] ?? 0));
  const shrunk = Object.entries(ALLOW).filter(([f, q]) => (found[f] ?? 0) < q);
  const total = Object.values(found).reduce((a, b) => a + b, 0);
  check(`⑥ 🔴 bills 写入原语只许在白名单内调用(扫 ${files.length} 个源文件,当前 ${total} 处 / ${Object.keys(found).length} 文件,白名单额度 ${Object.values(ALLOW).reduce((a, b) => a + b, 0)})`,
    grown.length === 0, grown.map(([f, n]) => `${f}: ${n} > ${ALLOW[f] ?? 0}`).join(" | "));
  // 🔴 额度**低于**实测同样判红(z4 R1 独立审计 P2-1):原来只打 INFO,于是这道门对
  //「删除向」全盲 —— 钱路径上删掉一处登记过的写入,门照绿,而额度变成留给未来新调用点的
  // 免检名额。门集体漏「删除」向是本仓踩过的族(见 memory feedback_gates_blind_to_deletion)。
  check(`⑥ 🔴 白名单额度必须与实测**相等**(不止是上界:少了 = 有登记过的写入被删掉没人看见)`,
    shrunk.length === 0, shrunk.map(([f, q]) => `${f} 实测 ${found[f] ?? 0} < 额度 ${q}`).join(" | "));
  // 🔴 反向入册门:WIRED 是**手工名单**,新页面自己调收口点(或直调 bills)时没人提醒入册,
  // 于是 ⑤ 不查(不在册)、⑥ 不响(在 ALLOW 里或走了收口点)—— 两道门同时失明。
  // 判据:全站「调了收口点导出符 或 调了 bills 写入原语」的文件集合,必须 ⊆ WIRED ∪ ALLOW。
  {
    // 🔴 postMoneyBillsOnce 必须在列(z1 2026-08-10):它是收口点真实导出面的一员
    // (lib/money-receipt.ts:227),漏了它,新页面只调它就整个绕过反向入册门。
    // 🔴 从收口点的**真实导出面**解析,不手写(z4 R1 独立审计:手写版漏了 `reportStuckFunds`
    // 与 `stuckFundsCases`,而前者会写 stuck 队列 + 弹终态提示,是资金路径的一员;
    // z1 补 `postMoneyBillsOnce` 时踩的是同一个坑,手写清单必然复发第二次)。
    const receiptSrc = strip(read("src", "lib", "money-receipt.ts"), true);
    const EXPORTS = [...receiptSrc.matchAll(/export function (\w+)\s*\(/g)].map((m) => m[1]);
    if (EXPORTS.length < 6) throw new Error(`selfcheck-money-receipt: 收口点导出面只解析到 ${EXPORTS.length} 个,反向入册门会失明`);
    if (!wiredFiles.length) throw new Error("selfcheck-money-receipt: ⑤ 的接线名单没传过来,反向入册门会空转");
    const enrolled = new Set([...wiredFiles, ...Object.keys(ALLOW)]);
    const outside = [];
    for (const f of files) {
      const rel = path.relative(root, f).replace(/\\/g, "/");
      if (enrolled.has(rel)) continue;
      const s = strip(readFileSync(f, "utf8"));
      const usesChokepoint = EXPORTS.some((e) => new RegExp(`(?<![\\w$.])${e}\\s*\\(`).test(s));
      if (usesChokepoint || scanSource(rel, readFileSync(f, "utf8")) > 0) outside.push(rel);
    }
    check(`⑤ 🔴 反向入册:动钱/记账的文件必须在 WIRED 或 ALLOW 里(扫 ${files.length} 个,册外 ${outside.length} 个)`,
      outside.length === 0, outside.join(" | "));
  }
  // 🔴 活体证明靠正控 + 负控,不靠「存量 total > 0」自证 —— 迁移做完 total 归零后,
  // 那种自证会**反过来判红**:把「欠账还完了」误报成回归,逼下一个人留一处不迁。
  //
  // 🔴 控制线必须**过 strip**(2026-08-04 对抗审计):原来是 `POS.filter(isBareWrite)`,
  // 直接把字符串喂给正则、**绕开了 strip**。判据是 `strip && 匹配` 两项串联,那样只证明了
  // 后一项活着,前一项(代码进不进得来)从没被测过 —— 违规若落在 strip 吞掉的区间里,
  // 门看不见、正控也测不出。合取项必须逐个隔离。
  // 控制线走**与全站扫同一条路径**(scanSource),而不是直接调 billsWriteHits ——
  // 否则 .vue 分区段那一支不会被任何控制线走到。
  // 🔴 控制线要带上 import —— 新判据第一关是「这文件跟 bills store 有没有关系」,
  // 裸片段不含 import 会被第一关直接放过(实测:换判据后 7 条正控当场漏判)。
  // 真实违规一定在一个 import 了 bills 的文件里,控制线也必须是那个形态。
  // `NO_IMPORT|` 前缀 = 这条专门测「与 bills 无关的文件」那一路,不加前缀。
  const IMPORT = 'import { useBills } from "@/store/bills";' + "\n";
  const run = (code, rel = "probe.ts") =>
    code.startsWith("NO_IMPORT|")
      ? scanSource(rel, code.slice("NO_IMPORT|".length))
      : scanSource(rel, IMPORT + code);
  const POS = [
    ['同行普通调用', '  bills.add({ type: "bonus" });'],
    ['useBills() 直调', '  useBills().addOnce({ type: "topup" });'],
    ['另一个 receiver 名', '  if (x) { billsStore.addManyForAccountOnce(k, [{ type: "withdraw" }]); }'],
    // addMany 是多腿写入原语,名单里加了一项却没有对应控制线 = 那一支从没被验证过
    ['多腿原语 addMany', '  bills.addMany([{ type: "bonus" }, { type: "fee" }]);'],
    // 🔴 addManyForAccount(指定账号 × 多腿)—— 前缀与 add / addMany 重叠,交替顺序写反就
    // 静默漏判(z4 实测)。常驻正控:METHODS 再排错序时当场红。
    ["指定账号多腿判重 addManyForAccountOnce", '  bills.addManyForAccountOnce(k, [{ type: "withdraw" }, { type: "withdraw" }]);'],
    // 以下四条是对抗审计实测逃逸的形态,逐个立成常驻正控
    ['跨行(调用与实参不同行)', '  bills.add(\n    { type: "bonus" },\n  );'],
    ['局部别名 receiver', '  const s = useBills();\n  s.add({ type: "bonus" });'],
    ['可选链', '  bills?.add({ type: "bonus" });'],
    ['丢弃形态 void / 箭头体', '  void bills.add({ type: "x" });\n  const f = () => bills.addOnce({ type: "y" });'],
    ['解构后裸调', '  const { addOnce } = useBills();\n  addOnce({ type: "topup" });'],
    // 🔴 导入改名 —— 这一族是本门**自己的红测**抓出来的:判据换成「任何调用都算」之后仍然
    // 只认 `const s = useBills()`,而 `import { useBills as X }` + `X().addMany(` 零成本逃逸。
    // 立成常驻正控,判据再退化时当场暴露。
    ['导入改名 + 跨行', '  import { useBills as rt } from "@/store/bills";\n  rt().addMany(\n    [{ type: "bonus" }],\n  );'],
    // .vue 模板内联 handler:引号内是**表达式**不是数据 —— 这是分区段扫描那一支的唯一控制线,
    // 少了它,scanSource 的 .vue 分支就没有任何控制线走到(名单里加了分支却没测 = 从没验证过)。
    ['.vue 模板内联 handler', '<template><view @tap="bills.add({ type: 1 })" /></template>', 'probe.vue'],
    // 🔴 以下 6 条来自 2026-08-04 独立验收 —— 它把上一版判据(枚举 receiver 名字)
    // 实测出 10 条逃逸,其中「解构改名」与「先声明后赋值」是正常人会写出来的形状。
    // 判据已翻转成「文件与 bills 有关 ⇒ 任何写入调用都算」,这些立成常驻正控防退化。
    ['解构改名', '  const { add: writeBill } = useBills();\n  writeBill({ type: 1 });'],
    ['方法引用后再调', '  const b = useBills();\n  const f = b.add;\n  f({ type: 1 });'],
    ['先声明后赋值', '  let s;\n  s = useBills();\n  s.add({ type: 1 });'],
    ['本地 wrapper', '  const billsOf = () => useBills();\n  billsOf().addOnce({ type: 1 });'],
    ['形参注入', '  function pay(store) { store.add({ type: 1 }); }'],
    ['计算方法名(运行期才知道)', '  const bills = useBills();\n  const m = 0;\n  bills[m]({ type: 1 });'],
  ];
  const NEG = [
    ['行尾注释里的调用(不许哄红)', '  doThing(); // 已不再 bills.add({ type: "x" }) 了'],
    ['块注释里的调用', '  /* 旧写法:bills.addMany([{...}]) */\n  postMoneyBills(d);'],
    ['字符串里的方法名', '  const doc = "bills.add(...) 已废弃";'],
    ['SFC 注释里的调用', '  <!-- 迁移前:bills.add({ type: "x" }) -->'],
    // 🔴 原来这里是「同名但非 bills 的 receiver 不该命中」。判据翻转后**有意过近似**:
    // 第一关过了就不再判 receiver 叫什么,于是同文件里的 `cart.add(` 也会计入 ——
    // 这是拿「多算再逐个登记」换「名字枚举漏一族就永久失明」,代价由 ALLOW 的精确条数兜住。
    // 改成守第一关:与 bills **无关**的文件必须完全不受影响。
    ['与 bills 无关的文件不受影响', 'NO_IMPORT|  cart.add({ id: 1 });\n  myBills.add({ x: 1 });'],
  ];
  const posMiss = POS.filter(([, code, rel]) => run(code, rel) === 0).map(([name]) => name);
  const negHit = NEG.filter(([, code, rel]) => run(code, rel) > 0).map(([name]) => name);
  // 条数从数组长度取,不写死 —— 写死的话往 POS/NEG 里加了控制线标签还报旧数字,
  // 「加了没加」在输出里看不出来(样本量必须是真数,不是记忆里的数)。
  check(`⑥ 扫描器没有空转:正控 ${POS.length} 条必中 / 负控 ${NEG.length} 条必不中(判据+strip 两项都过,不靠存量自证)`,
    posMiss.length === 0 && negHit.length === 0 && files.length > 100,
    `漏判=${posMiss.join(",") || "无"} 误判=${negHit.join(",") || "无"} files=${files.length}`);
}

console.log(`\n${pass} pass / ${fail} fail(样本:${samples.primitives} 个资金原语 × 3 断言 · `
  + `${samples.targets} 组固定靶(真 store + 真收口点,注入式落盘失败) · `
  + `${samples.scanned} 个源文件扫裸调 · ${samples.wired} 个调用点在接线门 · `
  + `${samples.ledgerFiles} 个文件欠迁移 · ${samples.locales} 语 i18n)`);
process.exit(fail ? 1 : 0);
