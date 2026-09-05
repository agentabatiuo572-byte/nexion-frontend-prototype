#!/usr/bin/env node
// 质押持仓写入「乐观并发(CAS)」自检 — node 直跑,不起浏览器:
//   node scripts/selfcheck-staking-cas.mjs
//
// 背景(2026-08-04 存量 P1 · 跨标签页竞态双记账):
//   staking 的 earlyWithdraw / claim 是裸 find → map → persist,persist 走
//   writeAccountRow(纯覆盖式 last-write-wins);全仓又没有任何 storage 事件重新水合持仓。
//   H5 端 uni storage 就是 localStorage,同源多标签页共享同一份 —— 于是窗口不是几毫秒的
//   传播延迟,而是「两个标签页只要都打开过质押页,状态就永久不同步」。同一笔仓位被两边
//   各领一次,而 usdtBalance 在 account-cloud 的 ADDITIVE_NUMBER_KEYS 里(按增量三路合并)
//   → 两次入账都记 = 真·双花。
//
// 🔴 守的不变量(编号对应红测文档 docs/changes/2026-08-04-staking-cas-redtest.md):
//   ① 变更的前置条件在**磁盘最新状态**上复核 —— 别处已经领走的仓位不再放行(一笔只入账一次)。
//   ①b 「读完到写之间被插队」也拦得住 —— rev 版本号 CAS(单纯的写前复读挡不住这一格)。
//   ② 正常单标签页路径不受影响(建仓 / 领取 / 提前赎回照常成交并落盘)。
//   ③ 失败可区分:版本冲突 conflict=true,「本来就不该成交」conflict=false(页面据此决定
//      是提示「已刷新」还是静默)。
//   ④ 向后兼容:不传版本的老调用方(writeAccountRow,28 处在用)行为与 CAS 上线前一致。
//   ⑤ 追加型变更(建仓)冲突时重放到最新列表上,两个标签页各自建的仓都留得住。
//   ⑥ 接线门:staking 真的走了 CAS(判定对不对 / 有没有被接上是两道门)。
//
// 方法:结构断言跑在**剥注释后的正主源码**上(注释里出现判定式文本不得哄绿);行为断言
// esbuild 载**真 store + 真 account-scoped-storage**跑真代码(不是抄一份判据副本),两个
// store 实例 = 两个标签页,共享同一份 JSON 序列化的假 storage(与 localStorage 同语义:
// 跨标签页不共享对象引用)。
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build, transformSync } from "esbuild";
import { atAliasResolver } from "./lib/at-alias.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STORE_DIR = path.join(root, "src", "store");
const storageRaw = readFileSync(path.join(STORE_DIR, "account-scoped-storage.ts"), "utf8");
const stakingRaw = readFileSync(path.join(STORE_DIR, "staking.ts"), "utf8");
const pageRaw = readFileSync(path.join(root, "src", "pages", "staking", "staking.vue"), "utf8");

const samples = { tabs: 2, targets: 6, storeFiles: 0, locales: 0 };
let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

/** 行首 // 与块注释一起剥 —— 只剥「整行就是注释」的,不碰 url 里的 //。 */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** 从 needle 起花括号配对抠出整块原文。抠不到 = 实现被改名/删除,直接炸(不许静默放行)。 */
function grabBlock(src, needle) {
  const start = src.indexOf(needle);
  if (start < 0) throw new Error(`selfcheck-staking-cas: 源码里找不到 \`${needle}\`(实现被改名或删除?)`);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`selfcheck-staking-cas: \`${needle}\` 括号不闭合`);
}

/** 取两个锚点之间的原文。任一锚点消失 = 实现被改名/删除,直接炸(不许静默放行)。 */
function grabBetween(src, from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error(`selfcheck-staking-cas: 取不到 \`${from}\` → \`${to}\` 之间的实现`);
  return src.slice(a, b);
}

console.log("selfcheck-staking-cas — 质押持仓写入乐观并发 + 跨标签页双记账");

// ── 假 uni storage:JSON 序列化,与 localStorage 同语义(两个标签页拿不到同一个对象引用) ──
const store = new Map();
let interleave = null; // 一次性钩子:模拟「A 读完、还没写」的那一瞬别的标签页抢先写入
let onEveryRead = null; // 常驻钩子:每次读盘之间都有别处写入 → 3 次 CAS 重试全部撞版本(耗尽)
const uni = {
  getStorageSync(key) {
    const raw = store.get(key);
    const value = raw === undefined ? "" : JSON.parse(raw);
    if (interleave) { const fn = interleave; interleave = null; fn(); }
    if (onEveryRead) onEveryRead(key);
    return value;
  },
  setStorageSync(key, value) { store.set(key, JSON.stringify(value)); },
};
globalThis.uni = uni;

// ── 载真 store(只 stub 掉 pinia/vue 两个运行时外壳,storage 层是被测对象,绝不 stub) ──
const STUBS = {
  "pinia-stub": `export const defineStore = (_id, setup) => setup;`,
  "vue-stub": `export const ref = (v) => ({ value: v });`,
  "runtime-stub": `export const remoteApiEnabled = false; export const stakingApi = {};`,
};
async function loadStore(rel) {
  const out = await build({
    entryPoints: [path.join(STORE_DIR, rel)],
    bundle: true, write: false, format: "esm",
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
        b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
        b.onResolve({ filter: /^@\/api\/runtime$/ }, () => ({ path: "runtime-stub", namespace: "stub" }));
        b.onResolve({ filter: /^@\// }, atAliasResolver(path.join(root, "src"), "selfcheck-staking-cas"));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js" }));
      },
    }],
  });
  return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text, "utf8").toString("base64"));
}
const ts2js = (src) => transformSync(src, { loader: "ts" }).code;
const { useStaking, STAKING_MIN, STAKING_APY } = await loadStore("staking.ts");
const { readAccountRow, writeAccountRow, writeAccountRowCas, accountRowRev } =
  await loadStore("account-scoped-storage.ts");

const LANGS = ["en", "zh", "vi"];
/** 值必须是**非空字符串**。undefined / null / "" / 全空白一律不算有文案 —— 用户看到的是空白提示。 */
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
/** 真解析:bundle 出 locale 模块取**值**,不是在文件文本里找 key 名(注释能骗过子串扫描)。 */
async function loadLocale(l) {
  const out = await build({
    entryPoints: [path.join(root, "src", "i18n", "messages", `${l}.ts`)],
    bundle: true, write: false, format: "esm",
  });
  const mod = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text, "utf8").toString("base64"));
  return mod[l] ?? mod.default ?? Object.values(mod)[0];
}
const LOCALES = Object.fromEntries(await Promise.all(LANGS.map(async (l) => [l, await loadLocale(l)])));
const EN = LOCALES.en;

/** 真解析:bundle 出 src 下的模块取**实现**。 */
async function loadSrcModule(...rel) {
  const out = await build({
    entryPoints: [path.join(root, "src", ...rel)],
    bundle: true, write: false, format: "esm",
  });
  return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text, "utf8").toString("base64"));
}
// 复投页在拒单前先试译地区策略回执。这里注入**真实现**而不是桩。
// ⚠️ 2026-08-07 审计订正:原注释说「两种桩都让断言失去判别力」——只有一半成立。
// 本场景 START=5000 / AMT=200 恒够钱,postMoneyBill 只可能返回 "ok",
// 所以「永远 null」的桩与真实现**逐位同行为**,并不削弱判别力;
// 真正会出事的是「永远有值」的桩(把普通失败吞成地区受限),而那种桩现有断言
// 本来就抓得住(它比对的是精确 toast 标题)。注入真实现仍是对的选择——
// 它让这条分支跟着真实现走,不必在实现变化时同步维护桩。
const { geoPolicyUserMessage } = await loadSrcModule("api", "geo-policy-error.ts");

const ACCOUNTS_KEY = "nexgrid-v3-staking-accounts-v1";
const ONE_DAY = 86400 * 1000;
const ACCT = "tab-race@nexgrid.test";

/** 一笔**已到期**的持仓(claim 的资格门要求 now >= unlockTs)。 */
function maturedPosition(id, amountUSDT) {
  const now = Date.now();
  return {
    id, amountUSDT, termDays: 90, apy: 0.35,
    startTs: now - 120 * ONE_DAY, unlockTs: now - 30 * ONE_DAY, status: "active",
  };
}
/** 用**老调用方**写盘(不带 rev)= 真实存量行的形态,顺便证明老行能被 CAS 直接接管。 */
function seedDisk(positions) {
  store.clear();
  writeAccountRow(ACCOUNTS_KEY, ACCT, { positions });
}
function diskPositions() {
  return readAccountRow(ACCOUNTS_KEY, ACCT).positions;
}
/** 开一个「标签页」:独立 store 实例,共享同一份 storage。 */
function openTab() {
  const s = useStaking();
  s.bindAccount(ACCT);
  return s;
}
/** 页面 handleClaim 的入账语义(app.creditBalance 是 ADDITIVE 的,ok 才加)。 */
function creditIfOk(ledger, r) {
  if (r.ok) ledger.usdt = +(ledger.usdt + r.principal + r.interest).toFixed(2);
  return r;
}
/** 把磁盘上该账号行的版本号推进一格 = 别的标签页刚写过一次。直接动底层 Map,不经 uni(不递归)。 */
function bumpDiskRev() {
  const raw = store.get(ACCOUNTS_KEY);
  if (raw === undefined) return;
  const table = JSON.parse(raw);
  for (const k of Object.keys(table)) table[k] = { ...table[k], rev: accountRowRev(table[k]) + 1 };
  store.set(ACCOUNTS_KEY, JSON.stringify(table));
}
function diskRev() {
  return accountRowRev(readAccountRow(ACCOUNTS_KEY, ACCT));
}

// ── ① 双标签页领同一笔:余额只增加一次 ──────────────────────────────────────────
{
  seedDisk([maturedPosition("stk-race", 500)]);
  const tabA = openTab();               // A 打开页面(读到 active),之后一直没再刷新
  const tabB = openTab();
  const ledger = { usdt: 0 };

  const rB = creditIfOk(ledger, tabB.claim("stk-race"));
  check("① B 标签页正常领取成功(先手不受影响)", rB.ok === true && rB.principal === 500);
  const afterB = ledger.usdt;

  const rA = creditIfOk(ledger, tabA.claim("stk-race"));
  check("① 🔴 A 标签页拿着陈旧状态再领 → 被拒(这一笔已经在别处领走)",
    rA.ok === false && rA.principal === 0 && rA.interest === 0);
  check("① 🔴 余额只增加一次(双花的核心断言)",
    ledger.usdt === afterB && afterB > 0, `afterB=${afterB} final=${ledger.usdt}`);
  check("① 拒单归因为版本冲突(conflict=true),页面据此提示已刷新", rA.conflict === true);
  check("① 磁盘上该仓位只有一个终态 claimed,不会被 A 的陈旧数组覆盖回 active",
    diskPositions().filter((p) => p.id === "stk-race").every((p) => p.status === "claimed"));
  check("① A 的内存态被刷新到最新(UI 立刻看到别处的结果,不再永久陈旧)",
    tabA.positions.value.find((p) => p.id === "stk-race").status === "claimed");
}

// ── ①b 「读完到写之间被插队」:写前复读挡不住,rev 版本号 CAS 才挡得住 ────────────
{
  seedDisk([maturedPosition("stk-interleave", 800)]);
  const tabA = openTab();
  const tabB = openTab();
  const ledger = { usdt: 0 };

  // A 读到最新的 active 状态之后、写回之前,B 完成一次完整的领取(真实多标签页里就是另一个
  // 进程插队;localStorage 没有锁,这一格是「写前复读校验」永远补不上的)。
  interleave = () => { creditIfOk(ledger, tabB.claim("stk-interleave")); };
  const rA = creditIfOk(ledger, tabA.claim("stk-interleave"));

  check("①b 插队确实发生了(B 在 A 的读与写之间成交,固定靶不是空转)",
    ledger.usdt > 0 && diskPositions()[0].status === "claimed");
  check("①b 🔴 A 的写入被版本号挡下 → 被拒", rA.ok === false && rA.conflict === true);
  check("①b 🔴 余额仍只增加一次(800 本金 + 一次利息)",
    ledger.usdt > 800 && ledger.usdt < 1600, `ledger=${ledger.usdt}`);
}

// ── ② 正常单标签页路径不受影响 ────────────────────────────────────────────────
{
  seedDisk([maturedPosition("stk-solo", 300)]);
  const tab = openTab();

  const opened = tab.stake(1000, 180);
  check("② 建仓成功并落盘(ok=true + id / 金额 / APY / 解锁时刻都对)",
    opened.ok === true && opened.position.amountUSDT === 1000 && opened.position.termDays === 180
    && diskPositions().some((p) => p.id === opened.position.id && p.amountUSDT === 1000));

  const rEarly = tab.earlyWithdraw(opened.position.id);
  check("② 提前赎回成功:退款 = 本金 − 罚金(180 天档罚 30%)",
    rEarly.ok === true && rEarly.penalty === 300 && rEarly.refund === 700);
  check("② 提前赎回落盘为 early-withdrawn",
    diskPositions().find((p) => p.id === opened.position.id).status === "early-withdrawn");

  const rClaim = tab.claim("stk-solo");
  check("② 到期领取成功:本金 300 + 利息按 APY×期限",
    rClaim.ok === true && rClaim.principal === 300 && +rClaim.interest.toFixed(4) === +(300 * 0.35 * (90 / 365)).toFixed(4));
  check("② 领取落盘为 claimed,且正常路径 0 次 conflict",
    diskPositions().find((p) => p.id === "stk-solo").status === "claimed"
    && !rEarly.conflict && !rClaim.conflict);

  const tabReload = openTab(); // 关掉再打开 = 重新水合
  check("② 重新水合读回同一份持仓(2 笔,状态与磁盘一致)",
    tabReload.positions.value.length === 2
    && tabReload.positions.value.find((p) => p.id === "stk-solo").status === "claimed");

  const rAfterMature = tabReload.claim("stk-solo");
  check("② 同一标签页重复领取被拒(既有语义未变)", rAfterMature.ok === false);
  check("② 🔴 重复领取不是版本冲突(conflict=false)—— 别把「本来就不该成交」误报成「数据已更新」",
    rAfterMature.conflict === false);
}

// ── ③ 失败可区分:三种失败各自的返回值 ────────────────────────────────────────
{
  seedDisk([{ ...maturedPosition("stk-live", 200), unlockTs: Date.now() + 30 * ONE_DAY }]);
  const tab = openTab();

  const unknown = tab.claim("stk-does-not-exist");
  check("③ 不存在的仓位:ok=false / conflict=false / 金额 0",
    unknown.ok === false && unknown.conflict === false && unknown.principal === 0);

  const notDue = tab.claim("stk-live");
  check("③ 未到期领取:ok=false / conflict=false(既有语义,原样保留)",
    notDue.ok === false && notDue.conflict === false);

  const notActive = (() => {
    tab.earlyWithdraw("stk-live");
    return tab.earlyWithdraw("stk-live");
  })();
  check("③ 已赎回的仓位再赎回:ok=false / conflict=false / refund=penalty=0",
    notActive.ok === false && notActive.conflict === false
    && notActive.refund === 0 && notActive.penalty === 0);

  check("③ 成功路径不带 conflict 噪声(ok=true 时 conflict 恒为 undefined)",
    tab.stake(50, 30).ok && tab.earlyWithdraw(tab.positions.value[0].id).conflict === undefined);

  // 返回形状不变:页面既有 `if (r.ok)` 分支一个字不用改
  const shape = tab.claim("stk-nope");
  check("③ 对外返回形状未变(claim: ok/principal/interest;earlyWithdraw: ok/refund/penalty)",
    "ok" in shape && "principal" in shape && "interest" in shape
    && ["ok", "refund", "penalty"].every((k) => k in tab.earlyWithdraw("stk-nope")));
}

// ── ④ 向后兼容:不传版本的老调用方行为与 CAS 上线前一致 ──────────────────────────
{
  const TBL = "compat-table-v1";
  store.clear();

  const wrote = writeAccountRow(TBL, "Alice@x.com", { a: 1, list: [1, 2] });
  const back = readAccountRow(TBL, "alice@x.com");
  check("④ 老写法:返回 true,大小写归一后可读回,内容逐字节相同",
    wrote === true && JSON.stringify(back) === JSON.stringify({ a: 1, list: [1, 2] }));
  check("④ 🔴 老写法不注入 rev 字段(写进去什么就是什么,键集合不变)",
    Object.keys(back).join(",") === "a,list" && !("rev" in back));

  writeAccountRow(TBL, "bob@x.com", { a: 9 });
  writeAccountRow(TBL, "alice@x.com", { a: 2 });
  check("④ 老写法仍是覆盖式 last-write-wins(不合并、不拒绝、不报冲突)",
    JSON.stringify(readAccountRow(TBL, "alice@x.com")) === JSON.stringify({ a: 2 }));
  check("④ 老写法只动自己那一行,同表其它账号行不受影响",
    readAccountRow(TBL, "bob@x.com").a === 9);
  check("④ 老写法读不出的行返回 null(既有语义)", readAccountRow(TBL, "nobody@x.com") === null);

  const stripped = strip(storageRaw);
  const oldWriter = grabBlock(stripped, "export function writeAccountRow<T>");
  check("④ 🔴 结构:老写法函数体内 0 处 rev / CAS 相关引用(两条路径彻底不耦合)",
    !/rev|Cas|expected/i.test(oldWriter), oldWriter.replace(/\s+/g, " ").slice(0, 120));

  // 老行(无 rev)天然从 0 起步,CAS 直接接管,不需要任何迁移
  check("④ CAS 接管老行:expectedRev=0 通过并写成 rev=1",
    accountRowRev(readAccountRow(TBL, "bob@x.com")) === 0
    && writeAccountRowCas(TBL, "bob@x.com", { a: 10 }, 0).rev === 1);
  check("④ CAS 版本不符时不写盘(磁盘还是旧值,绝不静默覆盖)",
    writeAccountRowCas(TBL, "bob@x.com", { a: 99 }, 0).conflict === true
    && readAccountRow(TBL, "bob@x.com").a === 10);

  // 爆炸半径:接 CAS 的 store 必须是**登记在册**的那几个,不许悄悄蔓延。
  // 2026-08-04 二期把 P1 涉钱/配额档接了进来(deposits / voucher / nex-faucet /
  // daily-powerup / lucky-spin,见 selfcheck-money-cas.mjs);名单写死在这里,新增一个
  // 未登记的消费者就红 —— 台账不写在被查文件里,否则改代码顺手改台账 = 门等于没有。
  // 沿革:二期原本还有第六个 withdraw-daily-count,已于 2026-08-11 随包 z2 整体删除
  // (日限改由提现单列表现算,没有第二份计数状态,自然也不需要 CAS 防覆盖)。
  // 2026-08-16 pkg/ad:pending-checkout(结算待支付发票)三期接入 —— 「同账号至多一张活票」与「一张票至多结算一次」
  // 两条不变量都靠磁盘最新行复核,纯覆盖写在多标签页下必双开/双付。
  const CAS_CONSUMERS = [
    "daily-powerup.ts", "deposits.ts", "lucky-spin.ts", "nex-faucet.ts",
    "orders.ts", "pending-checkout.ts", "staking.ts", "voucher.ts", // orders 2026-08-17 R10:整行覆盖写丢已付款单 → CAS
  ];
  const storeFiles = readdirSync(STORE_DIR).filter((f) => f.endsWith(".ts"));
  samples.storeFiles = storeFiles.length;
  const casConsumers = storeFiles.filter((f) =>
    f !== "account-scoped-storage.ts" &&
    /writeAccountRowCas|createAccountRowCommit/.test(readFileSync(path.join(STORE_DIR, f), "utf8")));
  check(`④ 爆炸半径受控:${storeFiles.length} 个 store 文件里恰好 ${CAS_CONSUMERS.length} 个登记在册的接了 CAS,其余 ${storeFiles.length - 1 - CAS_CONSUMERS.length} 个一行没动`,
    casConsumers.join(",") === CAS_CONSUMERS.join(","), casConsumers.join(","));
  check("④ staking 仍走自己那份内联 commit(本轮不重构它 —— 它的 ⑥ 接线门按行文 pin 了实现)",
    /writeAccountRowCas</.test(strip(stakingRaw)) && !stakingRaw.includes("createAccountRowCommit"));
}

// ── ⑤ 追加型变更:两个标签页各建一仓,两笔都留得住 ──────────────────────────────
{
  seedDisk([]);
  const tabA = openTab();
  const tabB = openTab();
  const posA = tabA.stake(111, 30).position;
  const posB = tabB.stake(222, 90).position;
  const disk = diskPositions();
  const amounts = disk.map((p) => p.amountUSDT).sort((a, b) => a - b);
  check("⑤ 🔴 两个标签页各建的仓都在磁盘上(建仓不会被对方的陈旧数组顶掉)",
    disk.length === 2 && amounts[0] === 111 && amounts[1] === 222, amounts.join(","));
  check("⑤ 两笔 id 不重号 —— 重号会让 find(id) 永远只命中第一笔,第二笔从此领不出来",
    posA.id !== posB.id && new Set(disk.map((p) => p.id)).size === 2, `${posA.id} / ${posB.id}`);
  const outA = tabA.earlyWithdraw(posA.id);
  const outB = tabB.earlyWithdraw(posB.id);
  check("⑤ 两笔都能各自独立领出来,退款各按各的本金与档位罚金(重号的话第二笔会失败)",
    outA.ok && outB.ok && outA.refund.toFixed(2) === "105.45" && outB.refund.toFixed(2) === "188.70",
    `${outA.refund} / ${outB.refund}`);
}

// ── ⑥ 接线门:判定对不对 / 有没有被接上,是两道门 ──────────────────────────────
{
  const s = strip(stakingRaw);
  check("⑥ staking 落盘只走 CAS(0 处裸 writeAccountRow,否则这道门等于没接)",
    /writeAccountRowCas</.test(s) && !/[^C]\bwriteAccountRow\(/.test(s));
  // commit 的签名里就有对象类型字面量,花括号配对会停在类型上 —— 用前后两个稳定锚点取整段。
  const commitBody = grabBetween(s, "function commit<R>", "function bindAccount(");
  check("⑥ commit 以**磁盘最新**持仓为基准 + 带 rev 做 CAS(不是拿内存副本自证)",
    commitBody.includes("readSnapshot(boundKey)") && /writeAccountRowCas<[\s\S]*?baseRev,/.test(commitBody));
  check("⑥ 四条变更路径(建仓/提前赎回/领取/到期标记)全部经由 commit,没有旁路",
    (s.match(/commit\(/g) || []).length === 4);
  const p = strip(pageRaw);
  check("⑥ 页面区分版本冲突并明示(领取 + 提前赎回两处,禁点了没反应)",
    (p.match(/else if \(r\.conflict\)/g) || []).length === 2
    && (p.match(/toast\.warn\(t\.value\.stakingV3\.toast\.staleTitle/g) || []).length === 2);
  // 🔴 这道门此前是**纯子串扫描**(`src.includes("staleTitle:")`),把 key 名写进注释就能骗过:
  // 审计红测实证 —— 删掉文案值、只在注释里留 key 名,门仍 39/39 全绿,而真实用户看到的是
  // **空白的错误提示**。改法:真解析取值,断言「值是非空字符串」而不是「key 名出现在文件里」。
  samples.locales = LANGS.length;
  const KEYS = ["staleTitle", "staleSubtitle", "openFailedTitle", "openFailedSubtitle"];
  const bad = [];
  for (const l of LANGS) {
    for (const k of KEYS) {
      const v = LOCALES[l]?.stakingV3?.toast?.[k];
      if (!nonEmpty(v)) bad.push(`${l}.stakingV3.toast.${k}=${JSON.stringify(v)}`);
    }
  }
  check(`⑥ i18n 冲突/建仓失败提示 ${KEYS.length} key × ${LANGS.length} 语真解析取值且非空`,
    bad.length === 0, bad.join(","));
  check("⑥ 三语文案互不相同(整份复制粘贴 = 有值但没翻译,子串扫描一样看不出来)",
    KEYS.every((k) => new Set(LANGS.map((l) => LOCALES[l].stakingV3.toast[k])).size === LANGS.length),
    LANGS.map((l) => LOCALES[l].stakingV3.toast.openFailedTitle).join(" | "));
}

// ── ⑦ 🔴 建仓冲突耗尽 → 失败必须回报给调用方 + 调用方把钱退回 ────────────────────
//   本轮自伤:stake() 只对「storage 不可用」有内存兜底,对「3 次版本冲突全失败」**零处置**,
//   而签名 `: StakingPosition` 无论成没成都返回一个仓位对象 —— 调用方拿不到失败信号,
//   于是余额已扣、账单已写、仓位不存在,刷新后钱就没了,收据成孤儿。
{
  seedDisk([]);
  const tab = openTab();
  const memBefore = tab.positions.value.length;

  onEveryRead = (key) => { if (key === ACCOUNTS_KEY) bumpDiskRev(); };
  const r = tab.stake(777, 30);
  onEveryRead = null;

  // 🔴 注入没生效就直接炸 —— 「跑绿了」必须是真跑过这个现场,不能是靶子没立起来的空转。
  const rev = diskRev();
  if (rev < 6) {
    throw new Error(`selfcheck-staking-cas: ⑦ 冲突注入未生效(rev=${rev},期望 ≥6 = 3 次重试各读 2 次)——`
      + " 靶子没立起来,后面的断言全是空转,拒绝继续。");
  }
  check(`⑦ 注入生效:每次读盘之间都被别处写过,3 次 CAS 重试全部撞版本(disk rev=${rev})`, rev >= 6);
  check("⑦ 🔴 冲突耗尽 → ok=false / conflict=true / position=null(不再无论成没成都返回仓位)",
    r.ok === false && r.conflict === true && r.position === null, JSON.stringify(r));
  check("⑦ 🔴 仓位既没落盘也没进内存 —— 这笔真的不存在",
    !diskPositions().some((p) => p.amountUSDT === 777)
    && tab.positions.value.length === memBefore
    && !tab.positions.value.some((p) => p.amountUSDT === 777));
  check("⑦ 反向:同一现场撤掉冲突注入后建仓正常成交(证明拒单来自冲突,不是建仓本身坏了)",
    (() => { const ok = tab.stake(777, 30); return ok.ok === true && ok.position.amountUSDT === 777; })());
}

// ⑦b 调用方:两个入口的**正主函数原文**注入执行 —— 「store 会回报失败」与「调用方接住了
// 并把钱退回去」是两道门,只验前者等于没验(自伤那条正是「回报了没人接」)。
{
  const callers = [
    ["质押半屏 stake-sheet", path.join(root, "src", "components", "staking", "stake-sheet.vue"), "async function submit()", "submit"],
    ["复投页 wallet-repurchase", path.join(root, "src", "pages", "me", "wallet-repurchase.vue"), "function handleRepurchase()", "handleRepurchase"],
  ];
  samples.callers = callers.length;
  for (const [label, file, needle, fnName] of callers) {
    const src = readFileSync(file, "utf8");
    seedDisk([]);
    const staking = openTab();
    const START = 5000;
    const AMT = 200;
    // app 桩:**照抄 app.ts 四原语的真实语义**,尤其是 debitBalance 的 withdrawableUsdt clamp。
    // 🔴 桩不建 clamp 的话,「裸 creditBalance 退款」与「restoreTo 精确还原」在门下长得一模一样,
    // 门就分辨不出对错 —— 而这两者的差别正是「一次退款把用户可提额度永久压低」(实测 $8000 → $1)。
    const bills = [];
    const toasts = [];
    const app = {
      user: { usdtBalance: START, nexBalance: 0 },
      withdrawable: START,
      captureMoney() { return { usdt: this.user.usdtBalance, withdrawable: this.withdrawable }; },
      restoreMoney(s) { this.user.usdtBalance = s.usdt; this.withdrawable = s.withdrawable; return true; },
      debitBalance(n) {
        if (this.user.usdtBalance < n) return false;
        this.user.usdtBalance = +(this.user.usdtBalance - n).toFixed(2);
        // 与 app.ts 同款:花钱先消耗不可提部分,可提额度随之向下收敛(单向,不会自己涨回来)。
        this.withdrawable = Math.min(this.withdrawable, this.user.usdtBalance);
        return true;
      },
      creditBalance(n) { this.user.usdtBalance = +(this.user.usdtBalance + n).toFixed(2); return true; },
    };
    const ledger = app.user;
    /** 与 lib/money-receipt.ts 同语义:restoreTo 还原、amount<0 扣款,收据随资金同生共死。 */
    const postMoneyBill = (draft, opts = {}) => {
      if (opts.restoreTo) { app.restoreMoney(opts.restoreTo); bills.push(draft); return "ok"; }
      if (draft.amount < 0) { if (!app.debitBalance(-draft.amount)) return "insufficient"; }
      else app.creditBalance(draft.amount);
      bills.push(draft);
      return "ok";
    };
    const env = {
      props: { term: 30 }, term: 30,
      amount: { value: AMT },
      selectedPool: { value: undefined }, remotePending: { value: false }, remoteIntent: { value: null },
      intentKey: () => "MOCK_INTENT_UNUSED",
      canSubmit: { value: true },
      user: { value: app.user },
      STAKING_MIN, STAKING_APY,
      app, staking, postMoneyBill, geoPolicyUserMessage,
      bills: { add: (r2) => { bills.push(r2); return { id: "B1" }; } },
      t: { value: EN }, w: { value: EN.repurchase },
      fmt: (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? "")),
      toast: {
        error: (a, b) => toasts.push(["error", a, b]),
        success: (a, b) => toasts.push(["success", a, b]),
        warn: (a, b) => toasts.push(["warn", a, b]),
      },
      emitClose: () => {},
      uni: { navigateTo: () => {} },
    };
    const names = Object.keys(env);
    // eslint-disable-next-line no-new-func — 正主代码块原文注入执行
    const run = new Function(...names, `${ts2js(grabBlock(src, needle))}\n; return ${fnName};`)(...names.map((n) => env[n]));

    const before = ledger.usdtBalance;
    onEveryRead = (key) => { if (key === ACCOUNTS_KEY) bumpDiskRev(); };
    await run();
    onEveryRead = null;

    check(`⑦b [${label}] 🔴 建仓失败后余额被补回($${START},不是少了 $${AMT})`,
      ledger.usdtBalance === START && before === START, `before=${before} after=${ledger.usdtBalance}`);
    check(`⑦b [${label}] 🔴 可提额度也被还原($${START})—— 裸 creditBalance 只加总余额,退一次压低一次`,
      app.withdrawable === START, `withdrawable=${app.withdrawable}(期望 ${START})`);
    check(`⑦b [${label}] 🔴 有失败提示(不是静默失败,也不是弹「成功」)`,
      toasts.some((x) => x[0] === "error" && x[1] === EN.stakingV3.toast.openFailedTitle)
      && !toasts.some((x) => x[0] === "success"), JSON.stringify(toasts.map((x) => [x[0], x[1]])));
    check(`⑦b [${label}] 🔴 磁盘上没有这笔仓位(失败就是什么都没发生)`,
      !diskPositions().some((p) => p.amountUSDT === AMT));
    check(`⑦b [${label}] 账上不留净额:所有账单行金额相加 = 0(要么没写,要么写了反向分录冲正)`,
      +bills.reduce((s, b) => s + (b.amount ?? 0), 0).toFixed(2) === 0,
      JSON.stringify(bills.map((b) => b.amount)));
  }
}

console.log(`\n${pass} pass / ${fail} fail(样本:${samples.tabs} 个 store 实例=${samples.tabs} 标签页共享 1 份序列化 storage`
  + ` · ${samples.targets} 组跨标签页固定靶 · ${samples.storeFiles} 个 store 文件扫爆炸半径 · ${samples.locales} 语 × 4 key i18n 真解析取值`
  + ` · 1 组建仓冲突耗尽靶(注入未生效直接抛错) · ${samples.callers} 个调用方正主函数原文注入(退款含可提额度还原))`);
process.exit(fail ? 1 : 0);
