#!/usr/bin/env node
/**
 * selfcheck-persist-verdict.mjs — 结算链上「落盘 / CAS 判决必须交回并被消费」的机器门(AST,不是 grep)。
 *
 * 为什么有这道门:审计 R4→R6 同一族连出五次 —— persistAccountSnapshot() / createOrder 的 persist() /
 * voucher.markUsed() / freeTrial 的 persist() / persistReceiptRecovery 的 writeAccountRow() / voucher.release()
 * 的返回值被当语句丢掉。每一次都是同一形状:**store 写盘的 boolean 落地在一条表达式语句里,没人接**。
 * 逐个调用点补是补丁,这里把它升成不变量:钱路文件里,写盘 / CAS / 资金原语的调用**不许作为裸表达式语句出现**
 * (`if (!x())` / `const ok = x()` / `return x()` / `a && x()` 都算消费;`void x()` 是显式丢弃,放行;
 * 确需忽略的行尾或上一行写 `persist-verdict-ok: <理由>`)。
 *
 * 判据用 TypeScript AST(vue SFC 只取 <script> 块),不是正则:换行 / 链式 / 泛型实参都不影响。
 *
 * 两条构造性规则(审计 R8 P1 ×2:手写文件闭集 + 包装一层门就失明):
 *   · 扫描面不是手写清单:src 下凡 import 了 money-receipt / account-scoped-storage、或调用了账户快照 / 设备 /
 *     发票 / 券原语的文件自动入册(测试文件除外);再手写一份名单只会再漂一次。
 *   · 本地包装函数继承原语属性:文件里凡「调用了判决原语且有返回值」的函数(如 pending-checkout 的 commitSessions、
 *     checkout 的 releaseVoucher)自动加入该文件的判决集合,并迭代到不动点 —— 抽一层 helper 不再能让门失明。
 *     反过来,文件里自己定义的同名非判决函数(如组件本地的 createOrder)在本文件内不算判决原语(遮蔽)。
 * Usage: node scripts/selfcheck-persist-verdict.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 入册判据(构造性):文件文本命中任一 → 它在钱路上。 */
const MONEY_PATH_MARKERS = [
  /from\s+["'][^"']*money-receipt["']/,            // 资金 ⊗ 收据收口点
  /\bcreateAccountRowCommit\b/,                   // CAS 提交器(多标签页并发敏感的行:发票 / 券 / 入金 / 奖池 / 质押)
  /\bpersistAccountSnapshot\s*\(/,               // 账户快照权威落盘(app.ts 本体与消费者)
  /\.(debitBalance|creditBalance|creditNex|restoreMoney)\s*\(/, // 资金原语消费者
  /\.(addDevice|activateDevice|discardSpawnedDevice|markUsed|release|consume|settleProduct|createOrders?|cancelOrder|markActivated)\s*\(/,
];
/** 结算链核心(种子,常驻在册);构造性发现在此之上扩张,少了任何一个种子 = 判据漂了。 */
const MUST_INCLUDE = [
  "src/pages/store/checkout.vue",
  "src/pages/store/bundle.vue",
  "src/components/tradein-sheets.vue",
  "src/store/orders.ts",
  "src/store/voucher.ts",
  "src/store/free-trial.ts",
  "src/store/pending-checkout.ts",
  "src/store/app.ts",
  "src/lib/money-receipt.ts",
];
function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (/\.(ts|vue)$/.test(ent.name) && !/\.test\.ts$/.test(ent.name) && !/\.d\.ts$/.test(ent.name)) out.push(full);
  }
  return out;
}
function discoverFiles() {
  const all = walk(path.join(ROOT, "src"), []);
  const hit = [];
  for (const abs of all) {
    const src = fs.readFileSync(abs, "utf8");
    if (MONEY_PATH_MARKERS.some((re) => re.test(src))) hit.push(path.relative(ROOT, abs).replace(/\\/g, "/"));
  }
  // 结算链核心常驻在册(收口点自己不 import 自己;free-trial 是被结算页 convert 的被调用方,没有外向标记)。
  for (const core of MUST_INCLUDE) if (!hit.includes(core) && fs.existsSync(path.join(ROOT, core))) hit.push(core);
  return hit.sort();
}
/** 返回「成没成」的原语:落盘 / CAS / 资金移动 / 收据收口。 */
const VERDICT_CALLS = new Set([
  "persist", "writeAccountRow", "writeAccountRowCas", "persistAccountSnapshot",
  "markUsed", "release", "consume", "restoreMoney", "debitBalance", "creditBalance", "creditNex",
  "createOrder", "createOrders", "cancelOrder", "markActivated", "postMoneyBill", "postReceiptOnly", "postReceiptOnce",
  "addDevice", "activateDevice", "deactivateDevice", "discardSpawnedDevice", "retireDevice", "restoreDevice", "patchDevice", "settleProduct", "commit",
]);
/**
 * 第二条规则(审计 R9 critic:门只看调用形,对赋值式旁路失明):**页面 / 组件不许直写账户状态**——
 * `app.devices = …` / `app.user.x = …` / `app.withdrawals = …` / `app.earnings = …` 绕过了 store 的落盘与判决,
 * 是「落盘判决被丢弃」这族最原始的形状。store 文件自己写自己的 ref 不在此列(app.ts 是唯一的持有者)。
 */
const APP_STATE_ROOTS = new Set(["devices", "user", "withdrawals", "earnings"]);
const APP_STORE_FILE = "src/store/app.ts";
const OK_MARK = "persist-verdict-ok";

function scriptBlocks(file, src) {
  if (!file.endsWith(".vue")) return [{ code: src, offset: 0 }];
  const out = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(src))) out.push({ code: m[1], offset: m.index + m[0].indexOf(m[1]) });
  return out;
}

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  if (ts.isNonNullExpression(expr) || ts.isParenthesizedExpression(expr)) return calleeName(expr.expression);
  return null;
}

/** 返回 [{ line, name, text }] —— 裸表达式语句里的判决调用。 */
export function findDiscardedVerdicts(code, fileLabel = "snippet.ts") {
  const sf = ts.createSourceFile(fileLabel, code, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TS);
  const lines = code.split(/\r?\n/);
  const hits = [];
  // ── 本文件的判决集合 = 基础原语 ∪ 本地包装(调用了判决原语且有返回值)− 本地遮蔽(同名非判决函数),迭代到不动点 ──
  const localFns = new Map(); // name → { returnsValue, returnCallees:Set, verdictVarCallees:Map }
  const fnBody = (fn) => fn.body;
  // 名字提取:基础原语可经属性访问调用(store.markUsed);本地包装只按裸标识符调用(commitSessions(...)),
  // 属性访问同名(pointsApi.claimMilestone / voucherApi.claim)是别的对象的方法,不算。
  const callName = (call, verdictSet) => {
    const ex = call.expression;
    const stripped = ts.isNonNullExpression(ex) || ts.isParenthesizedExpression(ex) ? ex.expression : ex;
    if (ts.isIdentifier(stripped)) return stripped.text;
    if (ts.isPropertyAccessExpression(stripped)) return VERDICT_CALLS.has(stripped.name.text) ? stripped.name.text : null;
    return null;
  };
  const collectFn = (name, fn) => {
    if (!name || !fn) return;
    const varInit = new Map(); // local var → callee names it was initialised from
    const returnExprs = [];
    let returnsValue = false;
    const body = fnBody(fn);
    if (body && !ts.isBlock(body)) { returnsValue = true; returnExprs.push(body); }
    const walkFn = (n) => {
      if (n !== fn && (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n))) return; // nested fns are their own scope
      if (ts.isReturnStatement(n) && n.expression) { returnsValue = true; returnExprs.push(n.expression); }
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        const calls = new Set();
        const w = (m) => { if (ts.isCallExpression(m)) { const cn = callName(m); if (cn) calls.add(cn); } ts.forEachChild(m, w); };
        w(n.initializer);
        if (calls.size) varInit.set(n.name.text, calls);
      }
      ts.forEachChild(n, walkFn);
    };
    walkFn(fn);
    localFns.set(name, { returnsValue, returnExprs, varInit });
  };
  // 返回值是否派生自判决:return 表达式里含判决调用,或引用了由判决调用初始化的局部变量
  const returnDerives = (info, verdictSet) => info.returnExprs.some((expr) => {
    let hit = false;
    const w = (m) => {
      if (hit) return;
      if (ts.isCallExpression(m)) { const cn = callName(m); if (cn && verdictSet.has(cn)) { hit = true; return; } }
      if (ts.isIdentifier(m)) { const inits = info.varInit.get(m.text); if (inits && [...inits].some((c) => verdictSet.has(c))) { hit = true; return; } }
      ts.forEachChild(m, w);
    };
    w(expr);
    return hit;
  });
  const collectDecls = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name) collectFn(n.name.text, n);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) collectFn(n.name.text, n.initializer);
    ts.forEachChild(n, collectDecls);
  };
  collectDecls(sf);
  const VERDICT = new Set(VERDICT_CALLS);
  for (const [name, info] of localFns) { if (VERDICT_CALLS.has(name) && !info.returnsValue) VERDICT.delete(name); } // 遮蔽:本地同名非判决函数
  const DERIVED = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, info] of localFns) {
      if (VERDICT.has(name) || !info.returnsValue) continue;
      if (returnDerives(info, VERDICT)) { VERDICT.add(name); DERIVED.add(name); grew = true; }
    }
  }
  // 「丢弃位」:表达式语句里,值最终没人接的那些位置 —— 裸调用 / await 裸调用 / 括号 / 非空断言 /
  // 逻辑与或空值合并的任一操作数(ok && persist();)/ 逗号表达式 / 三元的两个分支 / 一元 ! /
  // 数组·对象字面量元素 / 非判决调用的实参(Boolean(persist());)。赋值 / return / if / const 都算消费;
  // void x() 是显式丢弃,放行(审计 R7 P1:早先只判裸调用,ok && persist(); 被自测认证成合规)。
  const collectDiscarded = (e, out) => {
    if (!e) return;
    if (ts.isVoidExpression(e)) return;
    if (ts.isAwaitExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e) || ts.isTypeAssertionExpression(e)) return collectDiscarded(e.expression, out);
    if (ts.isCallExpression(e)) {
      const name = callName(e);
      if (name && VERDICT.has(name)) { out.push({ node: e, name }); return; }
      for (const arg of e.arguments) collectDiscarded(arg, out);
      return;
    }
    if (ts.isBinaryExpression(e)) {
      const k = e.operatorToken.kind;
      const isLogic = k === ts.SyntaxKind.AmpersandAmpersandToken || k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken || k === ts.SyntaxKind.CommaToken;
      if (isLogic) { collectDiscarded(e.left, out); collectDiscarded(e.right, out); return; }
      if (k === ts.SyntaxKind.EqualsToken || (k >= ts.SyntaxKind.FirstCompoundAssignment && k <= ts.SyntaxKind.LastCompoundAssignment)) return; // assignment consumes
      collectDiscarded(e.left, out); collectDiscarded(e.right, out); return; // arithmetic / comparison as a statement: value unused
    }
    if (ts.isConditionalExpression(e)) { collectDiscarded(e.whenTrue, out); collectDiscarded(e.whenFalse, out); return; }
    if (ts.isPrefixUnaryExpression(e)) return collectDiscarded(e.operand, out);
    if (ts.isArrayLiteralExpression(e)) { for (const el of e.elements) collectDiscarded(el, out); return; }
    if (ts.isObjectLiteralExpression(e)) { for (const pr of e.properties) if (ts.isPropertyAssignment(pr)) collectDiscarded(pr.initializer, out); return; }
  };
  const isDirectAppStateWrite = (e) => {
    if (!ts.isBinaryExpression(e)) return false;
    const k = e.operatorToken.kind;
    if (!(k === ts.SyntaxKind.EqualsToken || (k >= ts.SyntaxKind.FirstCompoundAssignment && k <= ts.SyntaxKind.LastCompoundAssignment))) return false;
    // left = app.<root>[.…] — walk down to the root property access on identifier `app`
    let left = e.left;
    while (ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left)) {
      const obj = left.expression;
      if (ts.isIdentifier(obj) && obj.text === "app" && ts.isPropertyAccessExpression(left) && APP_STATE_ROOTS.has(left.name.text)) return true;
      if (ts.isIdentifier(obj) && obj.text === "app") return false;
      left = obj;
    }
    return false;
  };
  const visit = (node) => {
    if (ts.isExpressionStatement(node) && fileLabel !== APP_STORE_FILE && isDirectAppStateWrite(node.expression)) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
      const here = lines[line] ?? ""; const prev = lines[line - 1] ?? "";
      if (!here.includes(OK_MARK) && !prev.includes(OK_MARK)) hits.push({ line: line + 1, name: "app-state-write", text: here.trim().slice(0, 120) });
    }
    if (ts.isExpressionStatement(node)) {
      const found = [];
      collectDiscarded(node.expression, found);
      for (const f of found) {
        const line = sf.getLineAndCharacterOfPosition(f.node.getStart(sf)).line; // 0-based
        const stmtLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
        const here = lines[line] ?? "";
        const prev = lines[line - 1] ?? "";
        const stmtPrev = lines[stmtLine - 1] ?? "";
        if (!here.includes(OK_MARK) && !prev.includes(OK_MARK) && !stmtPrev.includes(OK_MARK)) {
          hits.push({ line: line + 1, name: f.name, text: here.trim().slice(0, 120) });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function selftest() {
  const bad = [
    "function f(){ persist(); }",                       // bare
    "function f(){ store.markUsed(id); }",               // property access
    "async function f(){ await orders.createOrder(x); }", // awaited bare
    "function f(){ rows.commit((c) => null); }",          // commit bare
    "function f(){ ok && persist(); }",                   // logical operand, value unused
    "function f(){ (a, persist()); }",                    // comma
    "function f(){ cond ? persist() : 0; }",              // ternary branch
    "function f(){ !persist(); }",                        // unary
    "function f(){ Boolean(persist()); }",                // wrapped in a non-verdict call
    "function f(){ persist() || 0; }",
    "function f(){ (persist()); }",
    "function f(){ [persist()]; }",
    "function f(){ store?.persist?.(); }",                // optional call
    "function f(){ setTimeout(() => { persist(); }, 0); }", // nested statement
    "function commitX(a){ const r = rows.commit(a); return r.ok ? r.result : null; } function g(){ commitX(() => null); }", // wrapper (audit R8: commitSessions)
    "const rel = () => claimed ? store.release(id) : true; function g(){ rel(); }",                                     // arrow wrapper
    "function w1(){ return persist(); } function w2(){ return w1(); } function g(){ w2(); }",                             // wrapper of wrapper
    "function tick(){ rows.commit(() => null); } function g(){ tick(); }",  // exactly ONE hit: the inner bare call; the void helper itself is not a wrapper (g() must not be flagged)
    "function f(){ app.devices = app.devices.filter((d) => d.id !== id); }",   // page-level direct write to account state
    "function f(){ app.user.usdtBalance = 0; }",
    "function f(){ app.devices = [...app.devices, dev]; }",
  ];
  const good = [
    "function f(){ if (!persist()) return false; }",
    "function f(){ const ok = app.debitBalance(1); return ok; }",
    "function f(){ return voucher.release(id); }",
    "function f(){ void persist(); }",                          // explicit discard
    "function f(){ persist(); // persist-verdict-ok: best-effort prune\n }",
    "function f(){ // persist-verdict-ok: read-only sync\n rows.commit(() => null); }",
    "function f(){ x = persist(); }",                           // assigned
    "function f(){ const c = ok && persist(); return c; }",     // consumed
    "function f(){ if (a && persist()) {} }",
    "function f(){ return cond ? persist() : true; }",
    "function f(){ persist() ? doA() : doB(); }",               // verdict drives the branch = consumed
    "function f(){ toast.warn(fmt(msg)); }",                    // no verdict primitive at all
    "function f(){ app.devices.forEach((d) => d); }",            // read is fine
    "function f(){ const x = app.user.usdtBalance; return x; }",  // read is fine
    "function f(){ localState.devices = []; }",                   // not the app store
    "function createOrder(x){ items.push(x); } function g(){ createOrder(1); }", // local non-verdict function shadowing a base name
    "async function claim(id){ const r = rows.commit((c) => null); return r.ok; } async function g(){ await api.claim(id); }", // same-name METHOD on another object is not the local wrapper
    "function advanceTo(now){ const x = resolve(now); persist(); /* persist-verdict-ok: pure re-derivation */ return x; } function g(){ advanceTo(1); }", // calls a verdict but returns something else → not a wrapper
  ];
  let fail = 0;
  for (const s of bad) { const h = findDiscardedVerdicts(s); if (h.length !== 1) { console.error("SELFTEST FAIL (should flag):", s, h); fail++; } }
  for (const s of good) { const h = findDiscardedVerdicts(s); if (h.length !== 0) { console.error("SELFTEST FAIL (should pass):", s, h); fail++; } }
  // vue extraction: script block only, template ignored
  const vue = "<template><view @click=\"persist()\" /></template>\n<script setup lang=\"ts\">\nfunction g(){ persist(); }\n</script>";
  const blocks = scriptBlocks("x.vue", vue);
  const vh = blocks.flatMap((b) => findDiscardedVerdicts(b.code));
  if (blocks.length !== 1 || vh.length !== 1) { console.error("SELFTEST FAIL (vue extraction):", blocks.length, vh); fail++; }
  if (fail) { console.error(`persist-verdict selftest: ${fail} failed`); process.exit(2); }
  console.log(`persist-verdict selftest: OK (${bad.length} flagged · ${good.length} allowed · vue script-only)`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

let total = 0;
const report = [];
const FILES = discoverFiles();
for (const must of MUST_INCLUDE) {
  if (!FILES.includes(must)) { console.error(`persist-verdict: 构造性发现漏掉了 ${must} —— 入册判据漂了(或文件被搬走),门失效`); process.exit(2); }
}
if (FILES.length < 24) { console.error(`persist-verdict: 只发现 ${FILES.length} 个钱路文件,低于地板 24(2026-08-17 实发现 32;扫描面塌空?)`); process.exit(2); }
for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.error(`persist-verdict: missing file ${rel} (钱路文件清单与仓库不符 → 门失效)`); process.exit(2); }
  const src = fs.readFileSync(abs, "utf8");
  const blocks = scriptBlocks(rel, src);
  if (blocks.length === 0) { console.error(`persist-verdict: no <script> block in ${rel}`); process.exit(2); }
  for (const b of blocks) {
    const hits = findDiscardedVerdicts(b.code, rel); // rel 用作文件标签(store 自身写自己的 ref 不算直写)
    // line numbers relative to the block → absolute
    const before = src.slice(0, b.offset).split(/\r?\n/).length - 1;
    for (const h of hits) report.push({ file: rel, line: h.line + before, name: h.name, text: h.text });
    total += 1;
  }
}
if (report.length) {
  console.error(`persist-verdict: ${report.length} discarded verdict(s) on the money path — a store write / CAS / money primitive is used as a bare statement:`);
  for (const r of report) console.error(`  ${r.file}:${r.line}  ${r.name}()  ${r.text}`);
  console.error(`  消费它(if/const/return)或写明 ${OK_MARK}: <理由>`);
  process.exit(1);
}
console.log(`PERSIST-VERDICT: PASS (${FILES.length} files discovered by import/call markers, ${total} script blocks, ${VERDICT_CALLS.size} base primitives + local wrappers, 0 discarded)`);
