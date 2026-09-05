#!/usr/bin/env node
// 账单「生产者存在」门 — node 直跑,不起浏览器:
//   node scripts/selfcheck-bill-producers.mjs            # 判定
//   node scripts/selfcheck-bill-producers.mjs --selftest # 红测(判据自己活着没有)
//
// 背景(2026-08-11 z4 · 提现单从不进账单):
//   wallet-bills.vue 一直有整套 `type:"withdraw"` 的渲染代码 —— 图标、配色、可点、
//   点开跳提现追踪页。看页面代码会以为这条路是通的。但 2026-08-10 的 remote 对齐把
//   提现提交整段搬到 `POST /api/withdrawals` 时,顺手删掉了页面里那两行 `bills.addForAccount`
//   ——**全仓从此没有任何代码写得出一条正常的提现账单行**。剩下的唯一 `type:"withdraw"`
//   生产者是 App.vue 里退还 NEX 抵扣费的**冲正**分录(+N NEX),而它要冲正的那条 −N
//   从来没被写过。后果三连:App.vue 的 settleByRef / 两段对账恒空跑;用户被日限拦住时
//   全站没有任何页面答得出「我今天提了哪几笔」;账单上只剩一条平台白送 NEX 的孤行。
//
// 🔴 能力上界(先说清楚,免得下一个人以为这道门什么都守得住):
//   本门是**静态**判据 —— 它守「有没有代码写得出这种行」,守不了「那段代码跑不跑得到」。
//   `if (false) { …写账单… }` / 写在一个永不被调用的函数里,本门照绿。
//   可达性由 `scripts/withdraw-bill-runtime.mjs` 补:它在真页面上把整条提现链跑一遍。
//   两道门是分工不是重复:静态门覆盖全部 11 种账单类型(便宜、每次 verify 都跑),
//   runtime 门只覆盖提现这一条链(贵,但证的是「真的会发生」)。
//
// 🔴 守的不变量:**渲染代码存在 ≠ 有生产者**。
//   守「页面上有没有 withdraw 分支」是没用的 —— 出事那天它一直都在。要守的是
//   「有没有代码真的产出这种行」,而且要守到**方向**上:只有 credit 生产者的类型
//   等于「只有冲正、没有原始分录」,那正是本次缺陷的形态,粗判「有生产者 ✓」会放过它。
//
// 判据(全部从磁盘取 ground truth,不手写清单):
//   ① BillType 全集从 src/store/bills.ts 的类型联合解析;
//   ② 扫全站 src 找账单 draft(`type: "x"` 所在的那个对象字面量),按所在位置分
//      seed(bills.ts 的 seedBills)/ runtime(其余),按同对象里 `amount:` 的符号分借贷;
//   ③ 实测分类必须与下方 LEDGER **双向逐字相等** —— 少一族(生产者被删)红,
//      多一族(新增未登记)也红,逼下一个人显式过一遍这张表;
//   ④ 账单页渲染的每个类型都必须在 LEDGER 里,且 LEDGER 里的每个类型都必须能渲染。
//
// LEDGER 里的 `legacy` 不是豁免,是**第三种事实**:该类型没有任何生产者,渲染分支只为
// 显示历史落盘数据(功能已删,用户盘上还有旧行)。它与「本该有生产者却没了」的区别是
// 显式声明的 —— 而声明本身受 ③ 保护:一个 runtime 类型的生产者被删,实测会变成 legacy,
// 与声明不符,当场红。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { strip } from "./lib/strip-code.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");
const BILLS_TS = "src/store/bills.ts";
const BILLS_PAGE = "src/pages/me/wallet-bills.vue";
const DRAFTS_TS = "src/lib/withdrawal-bill-drafts.ts";

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
  return ok;
}

// ── 🔴 生产者台账 ──────────────────────────────────────────────────────────────
// 每个类型登记它**实际产得出哪几种分录**,token 形如 `币种 + 方向`:
//   `USDT-` = runtime 有代码写出负额 USDT 分录(扣款)   `USDT+` = 正额(入账 / 冲正)
//   `*+`    = 币种由运行期决定(如抽奖按奖品类型二选一),静态判不出,如实记 `*`
//   `seed:` 前缀 = 只有 mock 30 天历史造得出(接真后端即消失,不能顶替 runtime)
//   空数组  = 没有任何生产者:功能已删,渲染分支只为显示用户盘上的历史行(legacy)
//
// 🔴 为什么细到「币种 + 方向」而不是只记「有没有生产者」:本门第一版只记有无,
// 红测当场证伪 —— 提现有两条腿(USDT 主行 + NEX 抵扣费行),删掉**主行**后 NEX 腿
// 仍然让「withdraw 有 debit 生产者」成立,门全绿,而用户看不到自己提了多少钱。
// 「有生产者 ✓」这种粗判据放得过本次缺陷的大部分变体。
const LEDGER = {
  // 收益按 tick 累加进余额,**有意不写账单**(bills.ts 头注:账单是部分流水)。
  earn: ["seed:USDT+"],
  // 佣金同上:结算进余额不落分录,mock 历史里有几行供账单页有内容可看。
  refer: ["seed:USDT+"],
  bonus: ["*+×2", "NEX+×6", "USDT+×6", "seed:NEX+", "seed:USDT+"],
  topup: ["USDT+×3", "seed:USDT+"],
  // 兑换是双向的(NEX↔USDT),两条腿的 symbol 都是 `snap.fromSym` / `snap.toSym` ——
  // 币种运行期才定,静态判不出,故记 `*`。(这一行原本手写成 `NEX-,USDT+`,
  // 被实测当场证伪 —— 台账的值必须来自磁盘,不来自记忆。)
  swap: ["*+", "*-"],
  // 🔴 本门的由来(2026-08-11 z4)。
  //   USDT- = 提现页按服务端回执写的主行 —— 用户「提了多少钱」的唯一凭据;
  //   NEX-  = 同单号的 NEX 抵扣费行(勾了抵扣才有,服务端已烧);
  //   NEX+  = 提现失败退还抵扣费时补的冲正行(与另两条腿同住 withdrawal-bill-drafts)。
  // 三个都必须在。只剩 NEX+ 就是 2026-08-10~08-11 的实际状态:账单上只有一条
  // 平台白送 NEX 的孤行,而它要冲正的那条 NEX- 与主行 USDT- 从来没被写过。
  // ✅ 可达性缺口已于包 z6(2026-08-11)补上,此处的旧表述一并更新:
  // NEX+ 原来判据是**本地**退款幂等键,而写那把键的 creditRewardBucketInternal 对 remote 直接早退、
  // mock 下又建不出提现单 —— 两头落空,**任何真实配置下都不可达**(静态门当时全绿)。
  // 现判据改锚服务端字段 `wd.nexRefunded`(契约 FEAT-WD01 §4.6),
  // 可达性由行为门 `selfcheck-withdraw-nex-refund.mjs` 在 **remote 模式**下实证。
  // 「有生产者」≠「跑得到」这条仍然成立:静态门守不了可达性,那一半归那道行为门。
  withdraw: ["NEX+", "NEX-", "USDT-"],
  // 🔴 2026-08-13 从 5 → 6 + 一条 USDT+:创世购买半屏恢复了 mock 模式下的「扣款⊗记账 +
  //   铸造失败冲正」(8-10 转服务端权威时整段被删,而 mock 没有服务端 ⇒ 节点白送)。
  //   多出来的两个生产者就是那一对:主行 `amount: -cost`、冲正行 `amount: +cost`(同为
  //   type=purchase,ref 加 `-REV` 后缀分开,否则 addOnce 会把冲正误判成重复)。
  //   远端模式下这两条一行都不走 —— 但静态门数的是**生产者**不是执行次数,照数。
  purchase: ["USDT-×6", "USDT+"],
  // KYC 机制已于包 E 整体删除(pkg/e-kyc-rm),不再有任何生产者;
  // 渲染分支 + `(legacy)` 文案保留,只为显示用户盘上的历史行。
  verification: [],
  stake: ["USDT+×2", "USDT-×2"],
  // `USDT?` = 金额写成加法表达式(`r.principal + r.interest`),方向静态判不出。
  // 如实记 `?` 而不是猜成 `+` —— 猜错就是借贷记反,而那正是本门唯一要守的东西。
  unstake: ["USDT+", "USDT?"],
  // 2026-08-12:weekly-quest 两页的本地发奖迁服务端(同事批次),本地生产者各少一条。
  achievement: ["NEX+×3", "USDT+×1", "seed:NEX+"],
  // Unknown production biz types are projected as `other` until the client
  // learns their semantic family. They are server-owned, so no local draft
  // producer is expected in this repository.
  other: [],
};

const read = (rel) => readFileSync(path.join(root, rel), "utf8");

/**
 * 取材面 = src 下的 .ts / .vue,**排除 `.d.ts`**。
 * 🔴 `.d.ts` 里的一段对象字面量曾经就能冒充生产者(独立审计实测:把提现两条腿全废掉、
 * 只在 `src/env.d.ts` 追加一个同形对象,门照样全绿)。声明文件不产出运行时行为。
 */
function sourceFiles(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|vue)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/**
 * 这个文件**跟记账有没有关系** —— 判据:它是账单 store 本身,或者它**接进了收据类型体系**
 * (import 了 `@/lib/money-receipt`,不论是拿它的函数还是拿 `ReceiptDraft` 类型)。
 *
 * 🔴 为什么加这一层(R1 独立审计 P0-1):上一版只做全站文本 matchAll,于是
 * 「随便找个文件写一段长得像 draft 的对象字面量」就能冒充生产者。
 *
 * 🔴 为什么判据是 import 而不是「调没调写入函数」(R2 独立审计 P1-4 + 本门自己判红一次):
 *  · 只判**调用**会把 `src/store/app.ts` 这类文件算进来(它有 `Set.add(` / `.addMany(` 之类
 *    与账单无关的成员调用)—— 实测在 app.ts 里塞一个同形对象就能冒充生产者;
 *  · 也会把**纯构造模块**漏掉 —— `lib/withdrawal-bill-drafts.ts` 只 return drafts、不写盘,
 *    本门当场判红把这一漏抓了出来(提现两条腿搬进去之后实测只剩 NEX+)。
 * 「import 了收据类型体系」两头都对:构造 draft 必须拿到 `ReceiptDraft`,而不相干的文件拿不到。
 *
 * ⚠️ 这仍不能证明**可达**(`if (false)` 骗得过任何静态判据 —— 静态门的能力上界就到这),
 * 可达性由运行时那道门补:scripts/withdraw-bill-runtime.mjs。
 */
// 两条 import 判据缺一不可:收口点那条覆盖绝大多数生产者与纯构造模块;
// bills store 那条覆盖仍在直调 `addOnce` 的存量点(register.vue,已登记在 money-receipt 的
// ALLOW 里)—— 少了它,注册赠礼那两条分录会从台账上凭空消失(实测 bonus ×6 掉成 ×5)。
// 🔴 两条都判 **import**,不判调用:`src/store/app.ts` 两者都不 import(P-031 store 不互引),
// 所以「在 app.ts 里塞个同形对象冒充生产者」那条绕过仍然进不来(R2 实测过的形态)。
const RECEIPT_IMPORT = /from\s+["']@\/lib\/money-receipt["']/;
const BILLS_IMPORT = /from\s+["']@\/store\/bills["']/;
function isLedgerFile(rel, src) {
  return rel === BILLS_TS || RECEIPT_IMPORT.test(src) || BILLS_IMPORT.test(src);
}

/** BillType 联合 —— 从类型声明解析,不写死。 */
function billTypesFromSource(src) {
  const m = /export type BillType\s*=([\s\S]*?);/.exec(src);
  if (!m) throw new Error("selfcheck-bill-producers: 解析不到 BillType 联合(bills.ts 结构变了?)");
  return [...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
}

/** 账单页 TYPE_COLOR 的键 = 页面真正渲染的类型集合(Record<BillType, string>,穷举)。 */
function renderedTypes(src) {
  const m = /const TYPE_COLOR: Record<BillType, string> = \{([\s\S]*?)\n\};/.exec(src);
  if (!m) throw new Error("selfcheck-bill-producers: 解析不到 TYPE_COLOR(wallet-bills.vue 结构变了?)");
  return [...m[1].matchAll(/^\s*([a-z]+):/gm)].map((x) => x[1]);
}

/**
 * 从 `type:` 的位置往外抠出**这一个 draft 对象字面量**,再读同对象里 amount 的符号。
 *
 * 🔴 为什么要抠对象而不是就近正则找 amount:同一个文件里 draft 一个挨一个
 * (提现两条腿、兑换一进一出),就近匹配会读到**隔壁那条**的符号 —— 借贷判反,
 * 而判反的方向恰恰是本门唯一要守的东西。
 * 返回 null = 这个对象里没有 amount(不是账单 draft,例如 `type:` 撞名的别的对象)。
 */
function draftToken(src, typeIdx) {
  let depth = 0;
  let open = -1;
  for (let i = typeIdx; i >= 0; i--) {
    if (src[i] === "}") depth++;
    else if (src[i] === "{") { if (depth === 0) { open = i; break; } depth--; }
  }
  if (open < 0) return null;
  depth = 0;
  let close = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { close = i; break; } }
  }
  if (close < 0) return null;
  // 🔴 只看**顶层字段**:先把嵌套的子对象整段抹掉(独立审计实测的掩护形态 ——
  // `{ type:"withdraw", audit:{ symbol:"USDT", amount:-0 }, symbol:"USDT", amount: wd.amount }`
  // 里层那条会被先读到,于是主行方向反了门照样全绿)。
  let body = "";
  let nest = 0;
  for (let i = open + 1; i < close; i++) {
    const c = src[i];
    if (c === "{" || c === "[") nest++;
    else if (c === "}" || c === "]") nest--;
    else if (nest === 0) body += c;
  }
  const am = /(?<![\w$])amount\s*:\s*([^,\r\n]*)/.exec(body);
  if (!am) return null; // 同对象没有顶层 amount → 不是账单 draft
  // 🔴 符号只认**字面意义上的负**:`-字面量` / `-标识符` / `-(…)`。
  // 其余写法(`0 - x`、`x * -1`、`neg(x)`、`someNegativeVar`)静态判不出方向,记 `?`,
  // 让它与台账对不上而判红 —— 逼调用方写成显式符号,而不是让门去猜(猜错 = 借贷记反)。
  const expr = am[1].trim();
  const dir = /^-/.test(expr) ? "-" : /^[\w$."'[\]]+$/.test(expr) || /^\+/.test(expr) ? "+" : "?";
  // symbol 是 Bill 的必填字段;写成表达式(抽奖按奖品类型二选一)时静态判不出币种,
  // 记 `*` 如实交代 —— 不猜一个具体币种,那会让台账写着一件没被证实的事。
  const sym = /(?<![\w$])symbol\s*:\s*"(USDT|NEX)"/.exec(body);
  return `${sym ? sym[1] : "*"}${dir}`;
}

/** seedBills() 函数体在 bills.ts 里的字符区间 —— seed 与 runtime 靠它区分。 */
function seedRange(src) {
  const start = src.indexOf("function seedBills(");
  if (start < 0) throw new Error("selfcheck-bill-producers: 找不到 seedBills(bills.ts 结构变了?)");
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return [start, i]; }
  }
  throw new Error("selfcheck-bill-producers: seedBills 括号不闭合");
}

/**
 * 全站实测:type → { runtimeDebit, runtimeCredit, seed }。
 * @param overrides 红测用 —— { 相对路径: 改写后的源码 },不落盘。
 */
function measure(types, overrides = {}) {
  const known = new Set(types);
  const found = {};
  for (const t of types) found[t] = {};
  let drafts = 0;
  let ledgerFiles = 0;
  const files = sourceFiles();
  for (const full of files) {
    const rel = path.relative(root, full).replace(/\\/g, "/");
    // keepStrings:判据要读 `type: "withdraw"` 的字符串内容,只能剥注释不能剥串。
    // (剥注释是刚需:App.vue / bills.ts 的注释里就写着 `type:"withdraw"` 这类文本。)
    const src = strip(overrides[rel] ?? readFileSync(full, "utf8"), true);
    if (!isLedgerFile(rel, src)) continue; // 不记账的文件里长得像 draft 的东西不算生产者
    ledgerFiles++;
    const seedSpan = rel === BILLS_TS ? seedRange(src) : null;
    for (const m of src.matchAll(/(?<![\w$])type\s*:\s*"([a-z]+)"/g)) {
      if (!known.has(m[1])) continue;
      const token = draftToken(src, m.index);
      if (!token) continue;
      drafts++;
      const seeded = seedSpan && m.index >= seedSpan[0] && m.index <= seedSpan[1];
      const key = seeded ? `seed:${token}` : token;
      found[m[1]][key] = (found[m[1]][key] ?? 0) + 1;
    }
  }
  return { found, drafts, scanned: files.length, ledgerFiles };
}

/**
 * 台账形状 = `token×条数` 的有序串。
 * 🔴 为什么记**条数**而不只记「有没有」(独立审计 P0-2):同类型多个生产者时,
 * 集合语义下删掉其中 4 个仍然全绿(实测:purchase 5 处删到只剩 1 处、stake 两处全删,门都不响)。
 * 那正是本门诞生的那个缺陷 —— 只不过发生在别的类型上。代价是新增生产者要同步台账一行,
 * 与 money-receipt 的 ALLOW 额度同一套纪律(改前先跑 `--print`)。
 */
const shape = (counts) => Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))
  .map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(",") || "(无生产者)";

/** 一次完整判定 —— 返回不符项,供正跑与红测共用同一条路径(判据只有一份)。 */
function evaluate(overrides = {}) {
  const billsSrc = strip(overrides[BILLS_TS] ?? read(BILLS_TS), true);
  const types = billTypesFromSource(billsSrc);
  const { found, drafts, scanned, ledgerFiles } = measure(types, overrides);
  const mismatches = [];
  for (const t of types) {
    const entry = LEDGER[t];
    if (!entry) { mismatches.push(`${t}: 未登记(新增类型必须过一遍生产者台账)`); continue; }
    const want = Object.fromEntries(entry.map((tok) => {
      const [k, n] = tok.split("×");
      return [k, n ? Number(n) : 1];
    }));
    if (shape(want) !== shape(found[t])) mismatches.push(`${t}: 台账 [${shape(want)}] ≠ 实测 [${shape(found[t])}]`);
  }
  for (const t of Object.keys(LEDGER)) {
    if (!types.includes(t)) mismatches.push(`${t}: 台账有、BillType 里没有(类型删了台账没跟)`);
  }
  return { types, found, drafts, scanned, ledgerFiles, mismatches };
}

// ── 正跑 ──────────────────────────────────────────────────────────────────────
function run() {
  const { types, drafts, scanned, mismatches } = evaluate();
  const rendered = renderedTypes(read(BILLS_PAGE));

  // 🔴 空集/缩集自曝:取材面塌了(正则失配 / 目录挪走)会让所有断言无条件全过。
  // 下限贴着当前实测设(45 draft / 20 记账文件),掉一条就响 —— 上一版写 `>20`,
  // 掉一半以上仍然全过(独立审计 P2:阈值太松等于没设)。
  const { ledgerFiles } = evaluate();
  check(`⓪ 取材面非空(扫 ${scanned} 个源文件,其中 ${ledgerFiles} 个记账文件,识出 ${drafts} 条账单 draft,BillType ${types.length} 种)`,
    scanned > 400 && ledgerFiles >= 20 && drafts >= 43 && types.length >= 10,
    `scanned=${scanned} ledgerFiles=${ledgerFiles} drafts=${drafts} types=${types.length}`);

  check(`① 生产者分类与台账双向逐字相等(${types.length} 种类型)`,
    mismatches.length === 0, mismatches.join(" | "));

  const notRendered = types.filter((t) => !rendered.includes(t));
  const notTyped = rendered.filter((t) => !types.includes(t));
  check(`② 渲染面与 BillType 全集互相覆盖(账单页渲染 ${rendered.length} 种)`,
    notRendered.length === 0 && notTyped.length === 0,
    [...notRendered.map((t) => `${t} 有类型无渲染`), ...notTyped.map((t) => `${t} 有渲染无类型`)].join(" | "));

  const legacy = Object.entries(LEDGER).filter(([, v]) => v.length === 0).map(([k]) => k);
  const seedOnly = Object.entries(LEDGER)
    .filter(([, v]) => v.length > 0 && v.every((tok) => tok.startsWith("seed:"))).map(([k]) => k);
  console.log(`  INFO  仅历史数据(无任何生产者):${legacy.join(", ") || "无"}`);
  console.log(`  INFO  仅 mock 种子(接真后端即空):${seedOnly.join(", ") || "无"}`);
}

// ── 红测:判据自己活着没有 ────────────────────────────────────────────────────
// 🔴 逐个隔离:每条只动**一处**,证明的是那一条判据在守。全绿的门必须能被这些注入打红,
// 否则它只是「跑过了」而不是「在守」。改写只在内存里做,不落盘(不碰 git,不改磁盘)。
function selftest() {
  const cases = [];
  const draftsSrc = read(DRAFTS_TS);
  const appVue = "src/App.vue";
  const appSrc = read(appVue);
  const billsSrc = read(BILLS_TS);

  // 🔴 提现有三条分录 token(USDT- / NEX- / NEX+),必须**逐条**注入 ——
  // 合起来测只能证明「至少还剩一条」,而本次缺陷的每一种变体都是少掉其中一条。
  // (本门第一版正是败在这:删主行后 NEX 腿仍撑着「有 debit 生产者」,红测当场判死。)

  // 🔴 跨行锚点必须写 `\r?\n`:本仓源文件是 CRLF,字面 `\n` 一个都匹配不上 ——
  // 而匹配不上时 `String.replace` **不报错**,只是原样返回,注入静默失效、红测跟着假绿。
  // 下面 `injected` 那一列就是为此:改写没生效就直接判 FAIL,不许当作「测过了」。
  const MAIN_ROW = /type: "withdraw",\r?\n    symbol: "USDT",/;

  // ① 本次缺陷原样重放:主行没人写 → 用户「提了多少钱」在账单里彻底消失。
  // 🔴 换成 BillType **之外**的值,只掉 withdraw 一族(改成 "bonus" 会同时让 bonus 多一条,
  // 一次注入产生两条 mismatch = 不是单 token 隔离;独立审计点名)。
  const noMain = draftsSrc.replace(MAIN_ROW, () => 'type: "withdrawx",\n    symbol: "USDT",');
  cases.push(["① 删掉提现主行(USDT-)", { [DRAFTS_TS]: noMain }, noMain !== draftsSrc]);

  // ①b 死代码不算生产者:把主行搬进一个**不记账的文件**(R1 审计 P0-1 —— 上一版
  //     只做全站文本扫描,随便找个文件写段同形对象就能冒充生产者)。
  const DECOY_ROW = '\nconst __decoy = { type: "withdraw", symbol: "USDT", amount: -1, status: "pending", memo: "x", ref: "y" };\n';
  const decoy = "src/lib/route.ts";
  cases.push(["①b 主行删掉、由不记账文件冒充", { [DRAFTS_TS]: noMain, [decoy]: read(decoy) + DECOY_ROW },
    noMain !== draftsSrc]);

  // ①d 🔴 decoy 落在**记账文件**里同样不许放行(R2 审计 P1-4 实测的绕过:
  //     上一版判据是「调没调写入函数」,`src/store/app.ts` 因为有 Set.add 之类被误判成记账文件,
  //     在它里面塞一个同形对象就能把红的判绿)。现判据是 import,app.ts 两条都不 import。
  const decoyStore = "src/store/app.ts";
  cases.push(["①d 主行删掉、由 app.ts 冒充(R2 实测绕过)", { [DRAFTS_TS]: noMain, [decoyStore]: read(decoyStore) + DECOY_ROW },
    noMain !== draftsSrc]);

  // ①c 同类型多生产者:只删其中一个也必须红(集合语义下删 4/5 个都不响 —— P0-2)。
  const checkout = "src/pages/store/checkout.vue";
  const checkoutSrc = read(checkout);
  const onePurchaseGone = checkoutSrc.replace('type: "purchase",', 'type: "purchasex",');
  cases.push(["①c 删掉 5 个 purchase 生产者里的 1 个", { [checkout]: onePurchaseGone },
    onePurchaseGone !== checkoutSrc]);

  // ② 方向反了:主行金额丢掉负号 → 账单说提现是**入账**(粗判「有生产者」放行这一格)。
  const flipped = draftsSrc.replace("amount: -wd.amount,", "amount: wd.amount,");
  cases.push(["② 主行符号被改反(USDT- → USDT+)", { [DRAFTS_TS]: flipped }, flipped !== draftsSrc]);

  // ③ NEX 抵扣费行被删 → 服务端真烧了 NEX,账单里没有(冲正那条会变成孤行)。
  const noNexLeg = draftsSrc.replace("amount: -fee.nexBurned,", "amount: fee.nexBurned,");
  cases.push(["③ 抵扣费行符号被改反(NEX-)", { [DRAFTS_TS]: noNexLeg }, noNexLeg !== draftsSrc]);

  // ④ 冲正分录被删 → 失败提现退还的 NEX 在账单上无凭证(台账三条各守各的)。
  // 🔴 注入点随实现搬家(包 z6,2026-08-11):冲正行原在 App.vue,现已并进
  // `withdrawal-bill-drafts` 与另两条腿同住。**本门当场判红把这次搬家抓了出来** ——
  // 旧注入锚 `type: "withdraw",` 在 App.vue 里已不存在,红测静默失效(改写没生效 = 红测已死)。
  // 锚点改用 `amount: refunded,`:它在 drafts 文件里**唯一**,而 `type: "withdraw",`
  // 在那里有 3 处(主行 / 抵扣费行 / 冲正行),整体替换会一次废掉三条腿 ——
  // 那测的就不再是「冲正行没了」而是「整族没了」,①② 两格已经守着后者。
  const noRefund = draftsSrc.replace("amount: refunded,", "amount: -refunded,");
  cases.push(["④ 删掉 NEX 退还冲正行(NEX+)", { [DRAFTS_TS]: noRefund }, noRefund !== draftsSrc]);

  // ⑤ 新增类型未登记台账 → 必须红(不许悄悄多出一种没人管生产者的行)。
  const newType = billsSrc.replace('| "purchase" | "swap"', '| "purchase" | "swap" | "airdrop"');
  cases.push(["⑤ BillType 新增却没登记台账", { [BILLS_TS]: newType }, newType !== billsSrc]);

  // ⑥ 种子里的类型被删 → seed 面同样受守(只守 runtime 会让种子悄悄消失)。
  const noSeedRefer = billsSrc.replace('type: "refer"', 'type: "bonus"');
  cases.push(["⑥ 种子不再产出 refer", { [BILLS_TS]: noSeedRefer }, noSeedRefer !== billsSrc]);

  // ⑦ 币种被改错 → 主行记成 NEX:金额、方向、生产者数量全对,只有币种是假的。
  //    只比「有几条分录」的台账会全绿,而用户看到的是「提了 500 NEX」。
  // ⑧ 嵌套子对象掩护:里层塞一条反向分录、主行方向同时改反 —— 只读首个 amount 的版本会全绿。
  const nested = draftsSrc.replace("amount: -wd.amount,", 'audit: { symbol: "USDT", amount: -1 },\r\n      amount: wd.amount,');
  cases.push(["⑧ 嵌套子对象掩护 + 主行改反", { [DRAFTS_TS]: nested }, nested !== draftsSrc]);

  const wrongSym = draftsSrc.replace(MAIN_ROW, () => 'type: "withdraw",\n    symbol: "NEX",');
  cases.push(["⑦ 主行币种被改错(USDT- → NEX-)", { [DRAFTS_TS]: wrongSym }, wrongSym !== draftsSrc]);

  for (const [name, overrides, injected] of cases) {
    if (!injected) { check(`红测 ${name} — 注入锚点还在`, false, "改写没生效(源码变了,红测已失效)"); continue; }
    const { mismatches } = evaluate(overrides);
    check(`红测 ${name} → 判红`, mismatches.length > 0, mismatches.length ? "" : "注入后仍然全绿 = 这条判据是死的");
  }

  // 负控:动一处与账单无关的代码,不许红(避免判据宽到「改什么都红」)。
  const irrelevant = draftsSrc.replace("function fmtNex(", "const __unusedProbe = 1;\nfunction fmtNex(");
  const neg = evaluate({ [DRAFTS_TS]: irrelevant });
  check("红测 负控:无关改动不判红", irrelevant !== draftsSrc && neg.mismatches.length === 0, neg.mismatches.join(" | "));

  // 🔴 样本量当判据,不只打印(独立审计实测:删掉 8 条注入里的 7 条,--selftest 仍 exit 0
  // 且输出「1 pass / 0 fail」,verify 照打 ok —— 那是一道「跑过了」而不是「在守」的门)。
  const EXPECTED = 12; // 11 条注入 + 1 条负控
  check(`红测 样本量 = ${EXPECTED}(注入被删掉也必须响)`, pass + fail === EXPECTED, `实跑 ${pass + fail} 条`);
}

// 🔴 --print:改台账时**先看实测再落笔**。这张表的每一行都必须来自磁盘 ——
// 本门自己的 swap 那行第一版是凭印象手写的 `NEX-,USDT+`,实测是 `*+,*-`(兑换双向,
// 币种运行期才定),当场被 ① 判红。台账写记忆里的样子 = 门守着一件不存在的事。
function print() {
  const { types, found, drafts, scanned } = evaluate();
  console.log(`  实测(扫 ${scanned} 个源文件,${drafts} 条 draft):`);
  for (const t of types) console.log(`    ${t.padEnd(13)} ${shape(found[t])}`);
}

const selftestMode = process.argv.includes("--selftest");
const printMode = process.argv.includes("--print");
console.log(selftestMode ? "账单生产者门 · 红测" : printMode ? "账单生产者门 · 实测台账" : "账单生产者门");
if (printMode) print();
else if (selftestMode) selftest();
else run();
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
