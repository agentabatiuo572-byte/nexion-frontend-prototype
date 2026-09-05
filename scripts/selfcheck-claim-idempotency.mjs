#!/usr/bin/env node
// 「领奖」族的幂等与顺序自检 — node 直跑:
//   node scripts/selfcheck-claim-idempotency.mjs
//
// 背景(2026-08-04 对抗审计 B-P1-3 / B-P1-4 / P1-4③):
//   「领奖」要同时满足两件互斥的事 —— 资格只能消费一次(防重复领),奖必须发到(不能领了没发)。
//   两种顺序各有一个失效面:
//     · 先消费资格 → 发钱失败,资格没了、奖归零(5 处现状,用户白损失);
//     · 先发钱 → 消费资格失败,下一拍再发一次(里程碑那处实况,平台重复出钱)。
//   只要发钱这一步**可以安全重放**,第二种顺序就没有失效面。postMoneyBillsOnce 按 ref 判重。
//
// 🔴 守的不变量:
//   ① 同一个 ref 重放**不动钱、不写第二条分录**,且返回 "ok"(调用方据此继续消费资格)。
//   ② 首次调用与 postMoneyBills 行为等价(不因判重逻辑改变正常路径)。
//   ③ 空 ref **直接抛错**,不静默降级 —— 静默降级 = 一个看起来幂等其实不幂等的调用点。
//   ④ 各调用点的 ref **不带时间戳**:带时间戳判重永不命中,幂等出口退化成普通出口。
//   ⑤ 顺序门:能反序的四处必须「先发钱后消费资格」;反不过来的两处(签到 / 里程碑,
//      金额由消费动作自己决定)必须有自愈补发。
//
// 方法:①②③ 用 esbuild 载**真收口点 + 真 store** 跑真代码;④⑤ 是结构断言,跑在正主源码上。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { atAliasResolver } from "./lib/at-alias.mjs";
import { VUE_STUB_NXREF, runtimeStub } from "./lib/harness-stubs.mjs";
import { strip } from "./lib/strip-code.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

// ④⑤ 与反向入册门共用这份名单 —— 复制三份的话它们会各自漂移,
// 门就变成对着不同的旧名单判(名单本身也是判据的一部分)。
// ⚠️ 2026-08-13:周任务两个组件**已移出本名单** —— 领奖整体改成服务端发放
// (`questApi.claim(questCode, key)` + 回读确认 `status === "CLAIMED"`),客户端不再记账。
// 实测:两文件的 postMoneyBill / addMany 命中数均为 0。
// 幂等由「传幂等键 + 回读权威状态」保证,**比原来的客户端排序保护更强** —— 判据过期,不是回归。
// 🔴 但不是简单删掉就完事:删了以后有人在这两个文件里重新加发钱代码就没人管了。
//    但仓里**已有**⑤「反向入册」那一格接管:它扫全仓,凡用了记账出口却不在名单里的文件即判红。
//    本轮顺带把它的出口集补全(原先只扫一个出口,换个出口发钱它就看不见)。
const SITES = [
  "src/pages/events/events.vue",
  "src/pages/me/achievements.vue",
  "src/pages/daily/daily.vue",
  // quest 族三处 —— 独立验收指出它们与领奖族同型却漏改,现已统一(先发钱后消费 + 稳定 ref)
  "src/App.vue",
  "src/lib/share.ts",
  "src/pages/me/wallet-cards-new.vue",
  // 包 E(2026-08-06):迁移期中途换绑单 $1 一律返还(主人拍板),稳定 ref=legacy-rebind-refund:<账号>
  "src/store/payout-address.ts",
  // ⚠️ 2026-08-13 我一度把 src/store/genesis.ts 加进来 —— **加错门了**:
  //   本门 ④ 扫的是「记账分录的 ref」,而创世购买用的是**接口幂等键**(函数实参),载体不同,
  //   于是扫不到任何 ref、判据空转判红。同一条不变量、不同的载体,应该分门管。
  //   接口幂等键那一族已另建 scripts/api-idempotency-key-gate.mjs。
];

console.log("selfcheck-claim-idempotency — 领奖族:发钱可重放,资格只消费一次");

// ── 假 storage ──────────────────────────────────────────────────────────────
const disk = new Map();
const uni = {
  getStorageSync(k) { const r = disk.get(k); return r === undefined ? "" : JSON.parse(r); },
  setStorageSync(k, v) { disk.set(k, JSON.stringify(v)); },
  removeStorageSync(k) { disk.delete(k); },
  getSystemInfoSync() { return { language: "en" }; },
};
globalThis.uni = uni;

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
    contents: `export { postMoneyBills, postMoneyBillsOnce } from "@/lib/money-receipt";
export { useApp } from "@/store/app";
export { useBills } from "@/store/bills";`,
    resolveDir: root, loader: "ts",
  },
  bundle: true, write: false, format: "esm",
  define: { "import.meta.env": JSON.stringify({ PROD: false, DEV: true, MODE: "selfcheck" }) },
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
      b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
      b.onResolve({ filter: /^@\/api\/runtime$/ }, () => ({ path: "runtime-stub", namespace: "stub" }));
      b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "selfcheck-claim-idempotency"));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js" }));
    },
  }],
});
const { postMoneyBills, postMoneyBillsOnce, useApp, useBills } =
  await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64"));

const ACCT = "claim-idem@nexgrid.test";
const app = useApp();
const bills = useBills();
function reset() {
  disk.clear();
  app.bindAccount(ACCT);
  bills.bindAccount(ACCT);
  const u = app.user;
  app.user = { ...u, usdtBalance: 1000, nexBalance: 500 };
  app.persistAccountSnapshot();
  bills.bills = [];
}
const draft = (ref) => [{ type: "bonus", symbol: "NEX", amount: 30, status: "posted", memo: "probe", ref }];

// ── ① 重放不动钱、不写第二条,且返回 ok ───────────────────────────────────────
{
  reset();
  const nexBefore = app.user.nexBalance;
  const r1 = postMoneyBillsOnce(draft("PROBE-STABLE"));
  const nexAfter1 = app.user.nexBalance;
  const count1 = bills.bills.length;
  const r2 = postMoneyBillsOnce(draft("PROBE-STABLE"));
  const nexAfter2 = app.user.nexBalance;
  const count2 = bills.bills.length;
  check("① 首次调用正常发钱 + 写分录", r1 === "ok" && nexAfter1 === nexBefore + 30 && count1 === 1,
    `r1=${r1} nex=${nexBefore}→${nexAfter1} bills=${count1}`);
  check("① 🔴 同 ref 重放:返回 ok 但**钱一分没动、分录一条没加**", r2 === "ok" && nexAfter2 === nexAfter1 && count2 === count1,
    `r2=${r2} nex=${nexAfter1}→${nexAfter2} bills=${count1}→${count2}`);
  // 反向靶:换个 ref 就该真发 —— 证明上面那条不是「什么都没做」的空转
  const r3 = postMoneyBillsOnce(draft("PROBE-OTHER"));
  check("① 反向靶:换 ref 照常发(证明判重不是一律拒绝)",
    r3 === "ok" && app.user.nexBalance === nexAfter2 + 30 && bills.bills.length === count2 + 1);
}

// ── ② 首次路径与 postMoneyBills 等价 ─────────────────────────────────────────
{
  reset();
  const a = postMoneyBills(draft("EQ-A"));
  const nexA = app.user.nexBalance;
  reset();
  const b = postMoneyBillsOnce(draft("EQ-B"));
  const nexB = app.user.nexBalance;
  check("② 首次路径与 postMoneyBills 等价(结果与余额都一致)", a === b && nexA === nexB, `${a}/${b} ${nexA}/${nexB}`);
}

// ── ③ 空 ref 直接抛错,不静默降级 ────────────────────────────────────────────
{
  reset();
  let threw = false;
  try { postMoneyBillsOnce([{ type: "bonus", symbol: "NEX", amount: 1, status: "posted", memo: "x" }]); }
  catch { threw = true; }
  check("③ 🔴 空 ref 直接抛错(静默降级 = 看起来幂等其实不幂等的调用点)", threw);
}

// ── ④ 调用点的 ref 不带时间戳 ────────────────────────────────────────────────
{
  const bad = [];
  const empty = [];
  for (const rel of SITES) {
    // 🔴 过 strip:文件头注里常写着示例调用(实测 hero / achievements 的头注就有
    // `wq.claimTier1()` 与 `postMoneyBills`),不剥的话会拿文档当代码,报假阳性。
    const src = strip(readFileSync(path.join(root, rel), "utf8"));
    // 🔴 扫**整个文件**的 ref,不再只扫 `postMoneyBillsOnce(` 的实参块 ——
    // 独立验收实测:hero 与 achievements 的 drafts **建在调用之外**(`const drafts = [...]`
    // 再传进去),实参块里 `ref:` 命中 0 次,这两处的 ref 写成 `Date.now()` 门也全绿。
    // 这一族错误的通用形状是「判据只看它以为代码会长的那个样子」。
    // 🔴 ref 可能是**变量**(`ref: refId`,而 `const refId = ...` 在别处)——
    // 只扫 `ref:` 那一行的话,时间戳藏在变量定义里就永远看不见(红测实测:给 hero 的
    // refId 掺 Date.now(),门纹丝不动)。所以两头都要看:字面 ref 行 + 它引用的变量定义。
    const refs = [];
    const pushVarDef = (name) => {
      for (const d of src.matchAll(new RegExp(`(?:const|let|var)\\s+${name}\\s*=([^\\r\\n]*)`, "g"))) refs.push(d[1]);
    };
    for (const m of src.matchAll(/ref:([^\r\n]*)/g)) {
      const raw = m[1];
      refs.push(raw);
      // `ref: someVar` / `ref: someVar,` / `ref: someVar }` → 把那个变量的定义也拉进来判
      const varName = raw.match(/^\s*([A-Za-z_$][\w$]*)\s*[,}\r\n]?/)?.[1];
      if (varName) pushVarDef(varName);
    }
    // 🔴 **属性简写** `{ …, ref }` —— share.ts 就是这么写的,只认 `ref:` 的话整个文件
    // 一条都扫不到(空集断言当场抓住)。简写时变量名一定就叫 `ref`,直接取它的定义。
    if (/[,{]\s*ref\s*[,}]/.test(src)) pushVarDef("ref");
    // 🔴 空集必须判失败:一个在册的领奖文件**一条 ref 都扫不到**,只有两种可能 ——
    // 它其实没在用幂等出口(该从名单里去掉),或判据又对不上写法(该修判据)。
    // 两种都不该静默全过(哨兵假绿的经典形状:空集使全称命题恒真)。
    if (refs.length === 0) empty.push(rel);
    for (const r of refs) {
      // 判据不能用 `ref:[^,}]*` —— 模板串里的 `${ev.id}` 自带一个 `}`,字符类当场被挡住,
      // `ref: \`EVENT-${ev.id}-${Date.now()}\`` 这种真·假幂等一个都抓不到(红测实测漏判)。
      // 取到**本行结尾**再判:ref 一律写在一行内,足够且不会被 `}` 截断。
      if (/(Date\.now|mockServerNow|Math\.random)/.test(r)) {
        bad.push(`${rel}(ref 掺了时间戳/随机数:${r.trim().slice(0, 48)})`);
      }
    }
  }
  check(`④ 🔴 ${SITES.length} 个调用点的 ref 全部稳定(带时间戳 = 判重永不命中 = 假幂等)`,
    bad.length === 0 && empty.length === 0,
    [bad.join(" | "), empty.length ? `🔴 这些文件一条 ref 都没扫到(判据空转):${empty.join(",")}` : ""].filter(Boolean).join(" || "));
}

// ── ⑤ 顺序门 ────────────────────────────────────────────────────────────────
{
  // 能反序的四处:发钱必须排在消费资格之前
  const ORDERED = [
    // ⚠️ 周任务两个组件已移出(见上方 SITES 处说明:领奖改服务端发放,客户端不再记账,
    // 也就不存在「发钱与消费资格谁先谁后」这个问题了)。反向由本文件 ⑤「反向入册」那一格钉住:凡动钱却不在名单里的文件,当场判红。
    ["src/pages/events/events.vue", "eventQuest.claim("],
    ["src/pages/me/achievements.vue", "ach.claim("],
  ];
  const wrong = [];
  let checkedPairs = 0;
  for (const [rel, consume] of ORDERED) {
    const src = strip(readFileSync(path.join(root, rel), "utf8"));
    // 🔴 不能用 `indexOf` 只比**第一次出现**(独立验收实测:`weekly-quest-list.vue` 的
    // `onClaimBonus` 是同文件第二个调用点,于是它**从未被检查过**)。
    // 改成:每一处消费点,都要求它**前面**存在一次发钱调用 —— 逐个配对,不是全文件比大小。
    const posts = [...src.matchAll(/postMoneyBillsOnce\s*\(/g)].map((m) => m.index);
    const eats = [...src.matchAll(new RegExp(consume.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))].map((m) => m.index);
    if (!posts.length || !eats.length) { wrong.push(`${rel}(锚点找不到:post=${posts.length} consume=${eats.length})`); continue; }
    // 🔴 「之前有发钱」必须限定在**同一个函数体内**(红测实测:把 onClaimBonus 改回
    // 先消费,门纹丝不动 —— 因为同文件里 onClaimRow 的发钱调用位置更靠前,跨函数就满足了)。
    // 函数边界用「上一个顶格 `function ` / `const x = (` 」近似:本仓的 handler 都是顶层函数。
    const fnStarts = [...src.matchAll(/^(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\()/gm)].map((m) => m.index);
    const fnStartOf = (idx) => fnStarts.filter((f) => f <= idx).pop() ?? 0;
    for (const eat of eats) {
      const fn = fnStartOf(eat);
      // 🔴 只管**发钱的**领取路径。同一个 claim API 也被「不发钱」的路径用(实测
      // `events.vue` 的 handleCta 处理折扣券:只领券、不动钱,那里没有发钱调用是**对的**)。
      // 判据:该函数体内出现过发钱调用才纳入配对 —— 否则会把「本来就不发钱」误报成
      // 「该发钱却没发」,而误报会逼下一个人把门关小,最后什么都守不住。
      const fnEnd = fnStarts.find((f) => f > fn) ?? src.length;
      const postsInFn = posts.filter((p) => p >= fn && p < fnEnd);
      if (!postsInFn.length) continue;
      checkedPairs++;
      if (!postsInFn.some((p) => p < eat)) {
        wrong.push(`${rel}@${eat}(这处消费资格排在同函数体内的发钱调用之前)`);
      }
    }
  }
  check(`⑤ 可反序的 ${ORDERED.length} 个文件 / ${checkedPairs} 个消费点:发钱排在消费资格之前`,
    wrong.length === 0 && checkedPairs >= ORDERED.length, wrong.join(" | ") || `配对数 ${checkedPairs}`);

  // 🔴 反不过来的两处(签到 / 里程碑,金额由消费动作自己摇出)**刻意没有**自愈补发。
  //
  // 曾经加过一个,**实景走查当场证伪**:判据是「有领取状态、无对应账单行 ⇒ 补发」,
  // 它分不清 ①从没发过(该补)与 ②发过了但账单行丢了(不该补)。而 ② 是可达的 ——
  // 账单表走裸 writeAccountRow,另一标签页写一次就覆盖掉本页刚写的分录,而余额在账户快照里
  // 按增量合并幸存。浏览器实测:余额 11940 → 11943,凭空多发一次。
  // 少发是用户损失,多发是平台损失且不可追回;在拿到**权威的「已付」标记**之前这个判据
  // 不可能正确。
  //
  // 🔴 2026-08-05 更新:曾打算用存储层事务重构(「完全版 A」)让 ② 不可能发生,
  //   独立证伪判定**不可行**(6 条 P0,见 docs/changes/2026-08-04-change2-proposal.md),
  //   主人拍板不做,由真后端事务解决。**于是这条门不再有「重构落地就可以放开」的到期日 ——
  //   它是常设的。** 在真后端给出权威「已付」标记之前,任何「按账单缺失来补发」的自愈
  //   都是二次发钱的入口。
  const daily = strip(readFileSync(path.join(root, "src", "pages", "daily", "daily.vue"), "utf8"));
  const reAdded = daily.match(/function\s+(reconcile\w*)\s*\(/);
  check("⑤ 🔴 daily 没有「按账单缺失补发」的自愈(重构前加回来 = 二次发钱入口)",
    reAdded === null, reAdded ? `又出现了:${reAdded[1]}` : "");

  // 🔴 反向入册门(独立验收:SITES / ORDERED 都是**手工名单且无反向门**,新调用点对 ④⑤ 天然隐形)。
  // 判据:全站凡是调了 postMoneyBillsOnce 的文件,必须在 SITES 里 —— 名单漏一个就红。
  {
    const files = [];
    (function walk(d) {
      for (const e of readdirSync(d)) {
        const p = path.join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|vue)$/.test(e)) files.push(p);
      }
    })(SRC);
    const outside = [];
    for (const f of files) {
      const rel = path.relative(root, f).replace(/\\/g, "/");
      if (rel === "src/lib/money-receipt.ts" || SITES.includes(rel)) continue;
      // 🔴 只扫**幂等出口** `postMoneyBillsOnce` —— 这是本门的域。
      // 2026-08-13 我一度把 postMoneyBill / postReceiptForAccount 等也拉进来,想让
      // 「周任务组件移出名单后换个出口重新发钱」也被抓到。**扩错了**:实测册外立刻多出 8 个
      // (抽奖 / 质押 / 以旧换新 / 复购 / 提现 / 结算 / bills.ts)—— 它们都不是「领奖」族,
      // 各自的记账出口由 `selfcheck-money-receipt` 那道册子守(那边的问题是「谁能动钱」)。
      // 把别的域的出口拉进来,只会让本门报一堆与它无关的红。
      // 那个担心本身有覆盖:领奖族之外的记账由 money-receipt 反向入册接管(它扫 483 个源文件)。
      if (/postMoneyBillsOnce\s*\(/.test(strip(readFileSync(f, "utf8")))) outside.push(rel);
    }
    check(`⑤ 🔴 反向入册:用了幂等出口的文件必须在名单里(扫 ${files.length} 个,册外 ${outside.length} 个)`,
      outside.length === 0 && files.length > 100, outside.join(" | "));
  }
}

// 样本量从实跑数取,不写死 —— 名单从 5 涨到 8 时标签还报 5,「加了没加」在输出里看不出来。
console.log(`\n${pass} pass / ${fail} fail(样本:3 组行为固定靶(真收口点 + 真 store)· ${SITES.length} 个调用点扫 ref 稳定性 · 顺序门 + 自愈门 + 反向入册门)`);
process.exit(fail === 0 ? 0 : 1);
