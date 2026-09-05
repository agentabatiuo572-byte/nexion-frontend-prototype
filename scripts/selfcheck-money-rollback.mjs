#!/usr/bin/env node
// 「冲正(回滚)本身」自检 — node 直跑,不起浏览器:
//   node scripts/selfcheck-money-rollback.mjs
//
// 背景(2026-08-04 R5 · R4 同族的下一层):R4 根治「资金变更的落盘失败被静默忽略」,
// R5 发现**回滚自己的失败同样被静默忽略**,而且回滚的算法在并发下会凭空造钱。
// 结构性反思见 docs/changes/2026-08-04-structural-reflection-r5.md。
//
// 🔴 守的不变量(编号对应红测文档 docs/changes/2026-08-04-r5-common-redtest.md):
//   ① stake() 的**两条失败分支同等对待**:storage 写不进去时不许「只塞内存 + 报成功」
//      (本页看得见、磁盘上没有,刷新即人间蒸发,而钱已经扣了);归因用 conflict 区分。
//   ② 回滚失败不许静默:restoreMoney 返回 false 时给**可分辨的终态**(交易号 + 待对账
//      队列),不再弹通用的「交易未保存 · 余额没有变化」—— 那时钱是真扣着的。
//   ②b 无事可回滚(第一腿就落盘失败、原语已自我回滚)时不许误报成"钱卡住了"。
//   ⑤ 冲正按**增量**回滚,不写绝对值:合并层把余额当计数器(delta = next − base),而 base
//      在 capture 之后会吸收别的标签页的扣款 —— 写绝对值会把别人那笔一起"退"给用户。
//      固定靶 = 审计给的复现:$100 两个标签页各扣 $30 再各回滚一次,旧实现 → **$130**。
//   ⑥ 接线门:两处 restoreMoney 的返回值真的被消费(判定对不对 / 有没有被接上是两道门)。
//   ⑦ i18n:响亮终态与建仓失败归因的文案三语齐、真解析取值、互不相同。
//
// 方法:行为断言用 esbuild 载**真 store + 真收口点**跑真代码(不抄判据副本),假 uni storage
// 按 key/第几次写定点注入失败;⑤ 用**两个 store 实例 = 两个标签页**共享同一份 JSON 序列化
// storage(与 localStorage 同语义:跨标签页拿不到同一个对象引用),单实例跑一遍测不出这条。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { atAliasResolver } from "./lib/at-alias.mjs";
import { VUE_STUB_NXREF, runtimeStub } from "./lib/harness-stubs.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");
const read = (...p) => readFileSync(path.join(root, ...p), "utf8");

const samples = { targets: 0, tabs: 2, locales: 0, wiring: 0 };
let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
/** 行首 // 、块注释、SFC 的 <!-- --> 一起剥:注释里出现判定式文本不得哄绿。 */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^[ \t]*\/\/.*$/gm, "");
/** 取两个锚点之间的原文。任一锚点消失 = 实现被改名/删除,直接炸(不许静默放行)。
 *  🔴 不用花括号配对:这两个函数的**签名里就有对象字面量 / 类型字面量**
 *  (`opts: … = {}` / `: { ok: boolean … }`),配对会停在签名上,于是整段函数体一行没扫到
 *  却报"命中 0 处"——判据静默失效比判错更难查。 */
function grabBetween(src, from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error(`selfcheck-money-rollback: 取不到 \`${from}\` → \`${to}\` 之间的实现(被改名或删除?)`);
  const out = src.slice(a, b);
  if (out.length < 80) throw new Error(`selfcheck-money-rollback: \`${from}\` 区间过短(${out.length} 字符),锚点串位了`);
  return out;
}

console.log("selfcheck-money-rollback — 回滚失败不许静默 · 回滚不许凭空造钱");

// ── 假 uni storage:JSON 序列化(与 localStorage 同语义);写失败可按 key 定点注入 ──
const disk = new Map();
let failKey = null; // (key, nthWriteToThatKey) => boolean;命中即抛,模拟配额撑满 / storage 不可用
const writes = [];
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
globalThis.__nxTab = 0;

const CLOUD_KEY = "nexgrid-account-cloud-v1";
const BILLS_KEY = "nexgrid-bills-accounts-v1";
const STAKING_KEY = "nexgrid-v3-staking-accounts-v1";
const STUCK_KEY = "nexgrid-funds-stuck-v1";

// ── 载真代码。pinia stub 三条语义:①记忆化(一个 id 一个实例)②自动解包 ref
//    ③**按 __nxTab 分实例** —— 同一份 storage、两套内存态 = 两个标签页(⑤ 的靶子)。──
const STUBS = {
  "pinia-stub": `const tabs = new Map();
const unwrap = (v) => (v && typeof v === "object" && v.__nxRef === true);
export const defineStore = (id, setup) => () => {
  const tab = globalThis.__nxTab ?? 0;
  if (!tabs.has(tab)) tabs.set(tab, new Map());
  const cache = tabs.get(tab);
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
    contents: `export { postMoneyBill, postMoneyBills, reportStuckFunds, stuckFundsCases } from "@/lib/money-receipt";
export { useApp } from "@/store/app";
export { useBills } from "@/store/bills";
export { useStaking } from "@/store/staking";
export { useUI } from "@/store/ui";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true, write: false, format: "esm",
  define: { "import.meta.env": JSON.stringify({ PROD: false, DEV: true, MODE: "selfcheck" }) },
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
      b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
      b.onResolve({ filter: /^@\/api\/runtime$/ }, () => ({ path: "runtime-stub", namespace: "stub" }));
      b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "selfcheck-money-rollback"));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js" }));
    },
  }],
});
const { postMoneyBill, stuckFundsCases, useApp, useBills, useStaking, useUI } =
  await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64"));

const ACCT = "rollback-invariant@nexgrid.test";
/** 切到第 n 个标签页:此后 useApp() / useStaking() 拿到的都是那一页的内存态。 */
function tab(n) {
  globalThis.__nxTab = n;
  return { app: useApp(), bills: useBills(), staking: useStaking(), ui: useUI() };
}
/** 把 0 号标签页重置到干净起点(总余额 = 可提额度 = usdt),1 号随后再绑定。 */
function reset({ usdt = 10000, nex = 500 } = {}) {
  failKey = null;
  disk.clear();
  const t0 = tab(0);
  t0.app.bindAccount(ACCT);
  t0.bills.bindAccount(ACCT);
  // 🔴 必须整体换新对象:user 与 lastCloudSnapshot.user 是同一个引用,原地改会把三路合并的
  // base 一起改掉 → delta 恒为 0,种子写不进去(种到一半比种不进去更难查)。
  const u = t0.app.user;
  t0.app.user = {
    ...u, usdtBalance: usdt, nexBalance: nex,
    earningBuckets: { ...u.earningBuckets, withdrawableUsdt: usdt },
  };
  t0.app.persistAccountSnapshot();
  t0.bills.bills = [];
  t0.ui.toasts = [];
  writes.length = 0;
  return t0;
}
function diskMoney() {
  const u = uni.getStorageSync(CLOUD_KEY)?.[ACCT]?.user;
  return u ? { usdt: u.usdtBalance, nex: u.nexBalance, withdrawable: u.earningBuckets?.withdrawableUsdt } : null;
}
function diskPositions() {
  return uni.getStorageSync(STAKING_KEY)?.[ACCT]?.positions ?? [];
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const draft = (over = {}) => ({ type: "purchase", symbol: "USDT", amount: -100, status: "posted", memo: "selfcheck", ...over });

// ── ① stake() 存储异常分支:如实回报失败,不许「只塞内存 + 报成功」 ──────────────────
{
  samples.targets += 2;
  const t0 = reset();
  t0.staking.bindAccount(ACCT);
  const memBefore = t0.staking.positions.length;
  failKey = (k) => k === STAKING_KEY; // 只让持仓落盘失败(资金/账单照常)
  const r = t0.staking.stake(500, 30);
  failKey = null;
  // 🔴 注入没生效就直接炸:靶子没立起来的话后面全是空转。
  if (!writes.includes(STAKING_KEY)) {
    throw new Error("selfcheck-money-rollback: ① 存储异常注入未生效(一次都没写过持仓表)——靶子没立起来,拒绝继续。");
  }
  check("① 🔴 storage 写不进去 → ok=false(不再「塞进内存就当成功」)", r.ok === false, JSON.stringify(r));
  check("① 🔴 归因是存储异常不是版本冲突(conflict=false,页面据此换文案)", r.conflict === false);
  check("① 仓位既没落盘也没进内存 —— 这笔真的不存在(刷新不会人间蒸发)",
    r.position === null && diskPositions().length === 0 && t0.staking.positions.length === memBefore,
    `disk=${diskPositions().length} mem=${t0.staking.positions.length}`);
  // 反向:同一现场撤掉注入后建仓正常成交(证明拒单来自存储异常,不是建仓本身坏了)
  const okr = t0.staking.stake(500, 30);
  check("① 反向:撤掉注入后建仓正常成交并落盘(拒单来自注入,不是实现坏了)",
    okr.ok === true && okr.position.amountUSDT === 500
    && diskPositions().some((p) => p.id === okr.position.id && p.amountUSDT === 500),
    JSON.stringify(diskPositions().map((p) => p.amountUSDT)));
}

// ── ② 回滚自己失败 → 响亮终态 + 待对账队列,不再弹通用「交易未保存」 ─────────────────
{
  samples.targets += 2;
  const t0 = reset({ usdt: 8000 });
  const queuedBefore = stuckFundsCases().length;
  const cloudWrites = writes.filter((k) => k === CLOUD_KEY).length;
  // 扣款那一次放行(第 cloudWrites+1 次),此后 CLOUD 全炸 = 回滚写不回去;账单也写不进去。
  failKey = (k, n) => (k === CLOUD_KEY && n > cloudWrites + 1) || k === BILLS_KEY;
  const outcome = postMoneyBill(draft({ amount: -1500, ref: "SC-STUCK-1" }));
  failKey = null;
  const toasts = t0.ui.toasts;
  check("② 🔴 回滚失败 → 结果可分辨(stuck,不是与「已还原」共用的 failed)",
    outcome === "stuck", `outcome=${outcome}`);
  check("② 🔴 钱确实还扣着(这正是不许说「余额没有变化」的理由)",
    diskMoney().usdt === 6500, JSON.stringify(diskMoney()));
  check("② 🔴 用户看到的不是通用「交易未保存」,而是带交易号的响亮终态",
    toasts.some((t) => t.kind === "error" && /Amount still held/i.test(String(t.title)))
    && !toasts.some((t) => /Transaction not saved/i.test(String(t.title))),
    JSON.stringify(toasts.map((t) => [t.kind, t.title])));
  const queued = stuckFundsCases();
  check("② 🔴 该笔的还原快照进了待对账队列(后端据此把资金还原回去)",
    queued.length === queuedBefore + 1
    && queued[queued.length - 1].restoreTo.usdtBalance === 8000
    && queued[queued.length - 1].ref === "SC-STUCK-1"
    && /^FIX-/.test(queued[queued.length - 1].id),
    JSON.stringify(queued[queued.length - 1]));
  check("② 交易号同时出现在提示里(用户报得出、客服查得到)",
    toasts.some((t) => String(t.description).includes(queued[queued.length - 1].id)),
    JSON.stringify(toasts.map((t) => t.description)));
  check("② 队列尽力落盘(storage 恰好可写时留痕;写不进去也不许抛)",
    !disk.has(STUCK_KEY) || Array.isArray(uni.getStorageSync(STUCK_KEY)));

  // 负控:回滚成功时仍走通用失败文案 + 零入队(不许什么失败都惊动客服)
  const t1 = reset({ usdt: 8000 });
  const q2 = stuckFundsCases().length;
  failKey = (k) => k === BILLS_KEY; // 只有账单写不进去,回滚正常
  const normal = postMoneyBill(draft({ amount: -1500, ref: "SC-OK-ROLLBACK" }));
  failKey = null;
  check("② 负控:回滚成功 → 仍是 failed + 通用文案 + 零入队(资金真的回来了)",
    normal === "failed" && diskMoney().usdt === 8000 && stuckFundsCases().length === q2
    && t1.ui.toasts.some((t) => /Transaction not saved/i.test(String(t.title))),
    `${normal} / ${JSON.stringify(diskMoney())}`);
}

// ── ②b 无事可回滚:第一腿就落盘失败(原语已自我回滚)→ 不许误报"钱卡住了" ────────────
{
  samples.targets += 1;
  const t0 = reset({ usdt: 8000 });
  const q = stuckFundsCases().length;
  failKey = (k) => k === CLOUD_KEY; // 扣款那一次就失败,资金原语自己 adopt 回滚
  const outcome = postMoneyBill(draft({ amount: -300 }));
  failKey = null;
  check("②b 一分钱没动过 → failed(不是 stuck)、零入队、钱一分没少",
    outcome === "failed" && stuckFundsCases().length === q && diskMoney().usdt === 8000
    && t0.bills.bills.length === 0, `${outcome} / ${JSON.stringify(diskMoney())}`);
}

// ── ⑤ 🔴 双标签页并发回滚不许凭空造钱(审计复现:$100 → $130)─────────────────────
{
  samples.targets += 2;
  const START = 100;
  const AMT = 30;
  reset({ usdt: START, nex: 0 });
  const A = tab(0);
  const B = tab(1);
  B.app.bindAccount(ACCT); // 1 号标签页从磁盘水合出同一个账号(与 A 共享一份 storage)
  check("⑤ 前置:两个标签页看到同一个起点余额,且是两套独立内存态",
    A.app.user.usdtBalance === START && B.app.user.usdtBalance === START && A.app !== B.app,
    `A=${A.app.user.usdtBalance} B=${B.app.user.usdtBalance}`);

  globalThis.__nxTab = 0;
  const undoA = A.app.captureMoney();
  const debitedA = A.app.debitBalance(AMT);
  globalThis.__nxTab = 1;
  const undoB = B.app.captureMoney();
  const debitedB = B.app.debitBalance(AMT);
  check("⑤ 两笔扣款都落盘,磁盘余额 = 100 − 30 − 30 = 40(并发扣款各记各的)",
    debitedA && debitedB && diskMoney().usdt === START - 2 * AMT, JSON.stringify(diskMoney()));

  globalThis.__nxTab = 0;
  const restoredA = A.app.restoreMoney(undoA);
  globalThis.__nxTab = 1;
  const restoredB = B.app.restoreMoney(undoB);
  const after = diskMoney();
  // 旧实现(写绝对值)在这里的算式:A 的 delta = 100 − 70 = +30 → 磁盘 70;
  // B 的 delta = 100 − 40 = +60 → 磁盘 130。两笔各回滚一次,账户凭空多出 $30。
  check(`⑤ 🔴 各回滚一次后磁盘余额回到 $${START}(写绝对值的旧实现会变成 $130 = 凭空造 $30)`,
    restoredA && restoredB && after.usdt === START, `实测 $${after?.usdt}`);
  check("⑤ 可提额度同样回到起点(冲正必须还原三元组,不只是总余额)",
    after.withdrawable === START, JSON.stringify(after));
  // 最后动手的那一页必然持有合并后的最新值;先动手的那页要等下次读盘才跟上(既有行为)。
  check("⑤ 最后回滚的那个标签页内存态也是 $100(不是只有磁盘对)",
    B.app.user.usdtBalance === START, `A=${A.app.user.usdtBalance} B=${B.app.user.usdtBalance}`);

  // 负控:单标签页(无并发)时行为与改前逐字一致 —— 扣多少退多少,不多不少。
  globalThis.__nxTab = 0;
  reset({ usdt: START, nex: 0 });
  const solo = tab(0).app;
  const undo = solo.captureMoney();
  solo.debitBalance(AMT);
  const mid = diskMoney().usdt;
  solo.restoreMoney(undo);
  check("⑤ 负控:单标签页扣 30 → 退回,余额精确回到 100(并发修复没有误伤正常路径)",
    mid === START - AMT && diskMoney().usdt === START, `mid=${mid} after=${diskMoney().usdt}`);
  globalThis.__nxTab = 0;
}

// ── ⑥ 接线门:回滚返回值真的被消费 + 页面按归因分文案 ──────────────────────────────
{
  const receiptSrc = strip(read("src", "lib", "money-receipt.ts"));
  const body = grabBetween(receiptSrc, "export function postMoneyBills", "export function postReceiptOnly");
  const consumed = (body.match(/if \(!app\.restoreMoney\(undo\)\) return reportStuckFunds\(/g) || []).length;
  samples.wiring += 1;
  check("⑥ 🔴 收口点两处回滚的返回值都被消费(丢弃 = 回滚失败仍弹「余额没有变化」)",
    consumed === 2, `命中 ${consumed} 处(期望 2)`);
  // 三处调用:opts.restoreTo 那次是**正向退款**(返回值赋给 moved),两次 undo 是回滚。
  // 判据取「没有任何一次以裸语句出现」—— 只数个数会被将来新增的第四处悄悄绕过。
  const bareStatement = body.split(/\r?\n/).filter((l) => /^\s*app\.restoreMoney\(/.test(l));
  check("⑥ 收口点没有任何一处裸调 restoreMoney(返回值被丢弃 = 漏掉一条失败路径)",
    bareStatement.length === 0 && (body.match(/app\.restoreMoney\(/g) || []).length === 3,
    bareStatement.join(" | ") || `调用数 ${(body.match(/app\.restoreMoney\(/g) || []).length}`);

  const stakingSrc = strip(read("src", "store", "staking.ts"));
  const stakeBody = grabBetween(stakingSrc, "function stake(", "function earlyWithdraw(");
  samples.wiring += 1;
  check("⑥ 🔴 stake() 的存储异常分支不再写内存兜底(positions.value 赋值已从该分支消失)",
    !/if \(!r\.conflict\)\s*\{[\s\S]*?positions\.value =/.test(stakeBody)
    && /if \(!r\.conflict\) return \{ ok: false, position: null, conflict: false \};/.test(stakeBody),
    stakeBody.replace(/\s+/g, " ").slice(-200));

  for (const rel of ["src/components/staking/stake-sheet.vue", "src/pages/me/wallet-repurchase.vue"]) {
    const src = strip(readFileSync(path.join(root, rel), "utf8"));
    samples.wiring += 1;
    check(`⑥ ${rel.split("/").pop()} 按归因分文案(存储异常不许说「别处刚有变动」)`,
      /opened\.conflict \? t\.value\.stakingV3\.toast\.openFailedSubtitle : t\.value\.stakingV3\.toast\.openFailedStorageSubtitle/.test(src));
  }

  const coSrc = strip(read("src", "pages", "store", "checkout.vue"));
  const idxDebit = coSrc.indexOf("app.debitBalance(chargeTotal)");
  const convertCalls = [...coSrc.matchAll(/freeTrial\.convert\(\s*p\.id\s*\)/g)];
  const localConvert = convertCalls.find((match) => match.index > idxDebit);
  const idxConvert = localConvert?.index ?? -1;
  samples.wiring += 1;
  check("⑥ 🔴 结算页:不可逆的 convert() 排在扣款之后,且失败时退款 + 消费返回值",
    idxDebit > 0 && idxConvert > idxDebit
    && /(?:if \(|const \w+ = )app\.restoreMoney\(beforePay\)/.test(coSrc) && /else reportStuckFunds\(beforePay/.test(coSrc),
    `debit@${idxDebit} convert@${idxConvert}`);
}

// ── ⑦ i18n:真解析取值,三语齐、非空、互不相同 ──────────────────────────────────────
{
  const LANGS = ["en", "zh", "vi"];
  samples.locales = LANGS.length;
  const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
  const locales = {};
  for (const l of LANGS) {
    const out = await build({
      entryPoints: [path.join(SRC, "i18n", "messages", `${l}.ts`)],
      bundle: true, write: false, format: "esm",
    });
    const mod = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text, "utf8").toString("base64"));
    locales[l] = mod[l] ?? mod.default ?? Object.values(mod)[0];
  }
  const PICKS = [
    ["errors.fundsStuckTitle", (m) => m.errors.fundsStuckTitle],
    ["errors.fundsStuckMsg", (m) => m.errors.fundsStuckMsg],
    ["stakingV3.toast.openFailedStorageSubtitle", (m) => m.stakingV3.toast.openFailedStorageSubtitle],
  ];
  const bad = [];
  for (const l of LANGS) for (const [name, pick] of PICKS) if (!nonEmpty(pick(locales[l]))) bad.push(`${l}.${name}`);
  check(`⑦ ${PICKS.length} key × ${LANGS.length} 语真解析取值且非空(子串扫描看不出空文案)`,
    bad.length === 0, bad.join(","));
  check("⑦ 三语文案互不相同(整份复制粘贴 = 有值但没翻译)",
    PICKS.every(([, pick]) => new Set(LANGS.map((l) => pick(locales[l]))).size === LANGS.length));
  check("⑦ 响亮终态的正文必须插值交易号 {id}(没有单号 = 客服查不到,等于没告知)",
    LANGS.every((l) => locales[l].errors.fundsStuckMsg.includes("{id}")));
  check("⑦ 存储异常文案不复用冲突归因的措辞(两种原因不许混为一谈)",
    LANGS.every((l) => locales[l].stakingV3.toast.openFailedStorageSubtitle !== locales[l].stakingV3.toast.openFailedSubtitle));
}

// ── 收口:样本量地板(防空集假绿)──────────────────────────────────────────────────
const total = pass + fail;
if (total < 25) {
  console.error(`FAIL selfcheck-money-rollback: 断言总数 ${total} < 25 地板 —— 固定靶被整段删除/跳过?`);
  process.exit(1);
}
console.log(`\n${pass} pass / ${fail} fail(样本:${samples.targets} 组行为固定靶(真 store + 真收口点,注入式落盘失败)`
  + ` · ${samples.tabs} 个 store 实例=${samples.tabs} 标签页共享 1 份序列化 storage · ${samples.wiring} 道接线门`
  + ` · ${samples.locales} 语 × 3 key i18n 真解析取值)`);
process.exit(fail ? 1 : 0);
