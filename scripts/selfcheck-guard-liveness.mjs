#!/usr/bin/env node
/**
 * 守卫存活性门(2026-08-07 · 同族第三次复发后的结构根治;v2 按独立审计 P1-1 重写)
 *
 * 守的不变量:**周期性权限守卫(questTimer)是安全装置,不是业务循环。**
 *   它只随前台/后台成对开关 —— onShow 起、onHide 停,其余任何时候都必须活着。
 *
 * ── v1 为什么被推翻(独立审计 2026-08-07 实测,7 种改法让缺陷完整复活而 v1 全绿)──
 * v1 的判据形态是「某个函数体里有没有出现这个字符串」。这是**形状判据**:
 * 把 stopQuestWatch() 从 stopBusinessLoops 挪进 ensureBusinessLoopsAllowed 的失败分支,
 * 缺陷语义原样复活,v1 却报 8 pass / 0 fail —— 因为它只盯着一个函数名。
 * 更难堪的是 onShow 那条:v1 只匹配顶格裸 `return`,而上一轮(R2)缺陷的真实形态是
 * 一行式 `if (!allowed) return;` —— 它挡不住自己这一族刚踩过的那个坑。
 *
 * ── v2 的判据形态:调用点集合等式 ──
 * 不问「某个函数里有没有」,问「全文件里**谁**在调它」,并要求这个集合**恰好等于**允许集。
 * 搬到第三个地方 → 集合多出一个成员 → 判红。包一层壳函数 → 壳函数自己成为调用点 → 判红。
 * 内联 clearInterval 绕开函数名 → 由「谁能碰 questTimer」那条集合等式接住。
 *
 * 判据构造性(下列任一成立即判红,不许静默放行):
 *   · 代码块定位不到 / 允许集里的函数不存在 → 判据失效,判红
 *   · 每次运行对内存副本做 11 组缺陷注入自证(含独立审计给出的全部 7 种绕过形态);
 *     任一注入后仍绿 = 那条判据是死的 → 判红
 *
 * 🔴 本门只守结构。行为侧由 guard-liveness-runtime.mjs 兜底(真浏览器跑那条越权路径),
 *    因为这一族三轮出了三种形状,再加第 N 条形状判据就是打地鼠。
 */
import fs from "node:fs";

const FILE = "src/App.vue";

/** 把注释与字符串字面量替换成等长空白 —— 位置不变,后续按下标定位仍准确。
 *  同时顺手治好 v1 的一个脆点:注释里的花括号会把块体切歪(审计 P2-2)。 */
function blank(text) {
  const out = text.split("");
  let i = 0;
  const n = text.length;
  const wipe = (from, to) => { for (let k = from; k < to && k < n; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " "; };
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (c === "/" && d === "/") { let j = i; while (j < n && text[j] !== "\n") j++; wipe(i, j); i = j; continue; }
    if (c === "/" && d === "*") { const j = text.indexOf("*/", i + 2); const end = j < 0 ? n : j + 2; wipe(i, end); i = end; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) { if (text[j] === "\\") { j += 2; continue; } if (text[j] === c) { j++; break; } j++; }
      wipe(i + 1, j - 1); i = j; continue;
    }
    i++;
  }
  return out.join("");
}

/** 从 openIdx 处的 `{` 做花括号配对,返回闭合括号下标(找不到返回 -1)。 */
function matchBrace(t, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < t.length; i++) {
    if (t[i] === "{") depth++;
    else if (t[i] === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** 全文件的顶层块:所有 `function X(` 声明 + onLaunch/onShow/onHide 回调。
 *  返回 [{name, bodyStart, bodyEnd}]。用于回答「这个调用点落在谁身上」。 */
function topLevelBlocks(t) {
  const blocks = [];
  for (const m of t.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const open = t.indexOf("{", m.index + m[0].length);
    if (open < 0) continue;
    const close = matchBrace(t, open);
    if (close < 0) continue;
    blocks.push({ name: m[1], bodyStart: open + 1, bodyEnd: close });
  }
  for (const hook of ["onLaunch", "onShow", "onHide"]) {
    const at = t.indexOf(hook + "(");
    if (at < 0) continue;
    const open = t.indexOf("{", at);
    if (open < 0) continue;
    const close = matchBrace(t, open);
    if (close < 0) continue;
    blocks.push({ name: hook, bodyStart: open + 1, bodyEnd: close });
  }
  return blocks;
}

/** 最内层的包含块名;都不包含则返回 "(module)"。 */
function enclosing(blocks, idx) {
  let best = null;
  for (const b of blocks) {
    if (idx > b.bodyStart && idx < b.bodyEnd) {
      if (!best || (b.bodyEnd - b.bodyStart) < (best.bodyEnd - best.bodyStart)) best = b;
    }
  }
  return best ? best.name : "(module)";
}

/** 某个 token 的全部调用点(排除它自己的 `function X(` 声明处)所落的块名集合。 */
function callerSet(t, blocks, token) {
  const set = new Set();
  const re = new RegExp("\\b" + token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\(", "g");
  for (const m of t.matchAll(re)) {
    const before = t.slice(Math.max(0, m.index - 12), m.index);
    if (/\bfunction\s+$/.test(before)) continue; // 声明处不算调用
    set.add(enclosing(blocks, m.index));
  }
  return set;
}

const eqSet = (a, expected) => a.size === expected.length && expected.every((x) => a.has(x));
const show = (s) => "{" + [...s].sort().join(", ") + "}";

function evaluate(raw) {
  const t = blank(raw);
  const blocks = topLevelBlocks(t);
  const fail = [];
  let pass = 0;
  const check = (cond, id, msg) => { if (cond) pass++; else fail.push(`${id}: ${msg}`); };
  const body = (name) => {
    const b = blocks.find((x) => x.name === name);
    return b ? { text: t.slice(b.bodyStart, b.bodyEnd), start: b.bodyStart } : null;
  };

  // ── ① 谁能停守卫:恰好 = {startQuestWatch 自清, onHide} ────────────────────
  // 搬进 stopBusinessLoops / ensureBusinessLoopsAllowed / 任何第三处 → 集合多一员 → 红。
  const stoppers = callerSet(t, blocks, "stopQuestWatch");
  check(eqSet(stoppers, ["startQuestWatch", "onHide"]), "guard-stop-callers",
    `停守卫的调用点必须恰好 = {startQuestWatch, onHide},实测 ${show(stoppers)}`);

  // ── ② 谁能起守卫:恰好 = {onShow} ──────────────────────────────────────────
  const starters = callerSet(t, blocks, "startQuestWatch");
  check(eqSet(starters, ["onShow"]), "guard-start-callers",
    `起守卫的调用点必须恰好 = {onShow},实测 ${show(starters)}`);

  // ── ③ 谁能碰守卫的定时器句柄:恰好 = {startQuestWatch(赋值), stopQuestWatch(清除)} ──
  // 挡「不调函数名、直接内联 clearInterval(questTimer)」这类绕过。
  const touchers = new Set();
  for (const m of t.matchAll(/\bquestTimer\b/g)) {
    const who = enclosing(blocks, m.index);
    if (who !== "(module)") touchers.add(who); // 模块级的是变量声明本身
  }
  check(eqSet(touchers, ["startQuestWatch", "stopQuestWatch"]), "guard-timer-handle",
    `能碰 questTimer 的只许是 {startQuestWatch, stopQuestWatch},实测 ${show(touchers)}`);

  // ── ④ onShow 里无条件武装:startQuestWatch 之前不得出现任何 return 词元 ──────
  // v1 只匹配顶格裸 return,挡不住一行式 `if (!allowed) return;`(R2 缺陷的真实形态)。
  const os = body("onShow");
  if (!os) fail.push("guard-armed-unconditionally: 定位不到 onShow —— 判据已失效");
  else {
    const at = os.text.indexOf("startQuestWatch");
    if (at < 0) fail.push("guard-armed-unconditionally: onShow 里没有 startQuestWatch");
    else check(!/\breturn\b/.test(os.text.slice(0, at)), "guard-armed-unconditionally",
      "onShow 里 startQuestWatch 之前出现了 return —— 存在「某些情况守卫不启动」的分支");
  }

  // ── ⑤ 守卫节拍不许被稀释成摆设 ───────────────────────────────────────────
  const tick = /\bQUEST_TICK_MS\s*=\s*([0-9_]+)/.exec(t);
  check(tick !== null && Number(tick[1].replace(/_/g, "")) <= 2000, "guard-tick-bound",
    `守卫节拍必须 ≤2000ms,实测 ${tick ? tick[1] : "(取不到)"}`);

  // ── ⑥ 会话认领:在守卫里、且在任何提前 return 之前(落地页不决定本次加载的余生)──
  const claimers = callerSet(t, blocks, "bootstrapAccountSession");
  check(claimers.has("checkQuestRoute"), "session-claim-in-guard",
    `守卫必须每拍补一次会话认领,实测调用点 ${show(claimers)}`);
  const cq = body("checkQuestRoute");
  if (!cq) fail.push("session-claim-reachable: 定位不到 checkQuestRoute —— 判据已失效");
  else {
    const at = cq.text.indexOf("bootstrapAccountSession");
    if (at < 0) fail.push("session-claim-reachable: checkQuestRoute 里没有会话认领");
    else {
      // 必须在守卫体的顶层(相对花括号深度 0),不许被裹进任何条件块
      let depth = 0;
      for (let i = 0; i < at; i++) { const c = cq.text[i]; if (c === "{") depth++; else if (c === "}") depth--; }
      check(depth === 0, "session-claim-reachable", "会话认领被裹进了条件块 —— 可能永不执行");
      // 且必须排在「路由没变就收工」那道短路之前,否则停在同一页就永不认领。
      // 🔴 短路点找不到 = 判据失效,判红(不许因为「找不到就跳过」而静默放行)。
      const sc = cq.text.indexOf("=== lastQuestRoute");
      check(sc >= 0 && at < sc, "session-claim-before-shortcircuit",
        sc < 0
          ? "定位不到「路由未变即收工」短路点 —— 判据已失效"
          : "会话认领排在了「路由未变即收工」短路之后 —— 停在同一页就永不认领");
    }
  }
  return { pass, fail };
}

/** 缺陷注入自证。前 4 组是本轮修复的直接撤回,后 7 组是独立审计 2026-08-07
 *  实测能绕过 v1 的全部形态 —— 每次运行都证明它们仍被拦住。 */
const INJECTIONS = [
  { id: "guard-stop-callers", label: "把 stopQuestWatch 塞回 stopBusinessLoops(v1 缺陷直接撤回)",
    apply: (t) => t.replace(/( {2}stopMilestonePoll\(\);\r?\n)(\})/, (m, a, b) => `${a}  stopQuestWatch();\n${b}`) },
  { id: "guard-stop-callers", label: "B1 · 挪进 ensureBusinessLoopsAllowed 的失败分支(审计实测绕过 v1)",
    apply: (t) => t.replace(/(function ensureBusinessLoopsAllowed[^]*?\n {4}stopBusinessLoops\(\);)/,
      (m) => `${m}\n    stopQuestWatch();`) },
  { id: "guard-timer-handle", label: "B3b · 不调函数名,在 stopBusinessLoops 里内联 clearInterval(questTimer)",
    apply: (t) => t.replace(/( {2}stopMilestonePoll\(\);\r?\n)(\})/, (m, a, b) => `${a}  clearInterval(questTimer);\n${b}`) },
  { id: "guard-stop-callers", label: "B2b · 包一层壳函数 stopGuardLoop() 再在业务停止里调",
    apply: (t) => t.replace(/(function stopBusinessLoops\(\) \{)/,
      () => "function stopGuardLoop() {\n  stopQuestWatch();\n}\nfunction stopBusinessLoops() {\n  stopGuardLoop();") },
  { id: "guard-start-callers", label: "起点搬到第二处(onLaunch 里也起一次)",
    apply: (t) => t.replace(/(onLaunch\(\(\) => \{)/, (m) => `${m}\n  startQuestWatch();`) },
  { id: "guard-armed-unconditionally", label: "B4 · 一行式 `if (!allowed) return;` 挪到武装之前(R2 缺陷原样复活)",
    apply: (t) => t.replace(/( {2})startQuestWatch\(\);/, (m, ind) => `${ind}if (!allowed) return;\n${ind}startQuestWatch();`) },
  { id: "guard-armed-unconditionally", label: "顶格裸 return 挪到武装之前",
    apply: (t) => t.replace(/( {2})startQuestWatch\(\);/, (m, ind) => `${ind}return;\n${ind}startQuestWatch();`) },
  { id: "guard-tick-bound", label: "B7 · 守卫还活着,但节拍稀释到 30 分钟",
    apply: (t) => t.replace(/QUEST_TICK_MS = 1000/, () => "QUEST_TICK_MS = 1800000") },
  { id: "session-claim-in-guard", label: "删掉守卫里的会话认领",
    apply: (t) => { const at = t.indexOf("function checkQuestRoute"); return at < 0 ? t : t.slice(0, at) + t.slice(at).replace(/\r?\n {2}bootstrapAccountSession\(\);/, () => ""); } },
  { id: "session-claim-reachable", label: "B5b · 把会话认领裹进条件块",
    apply: (t) => { const at = t.indexOf("function checkQuestRoute"); return at < 0 ? t : t.slice(0, at) + t.slice(at).replace(/( {2})bootstrapAccountSession\(\);/, (m, ind) => `${ind}if (lastQuestRoute) {\n${ind}  bootstrapAccountSession();\n${ind}}`); } },
  { id: "session-claim-before-shortcircuit", label: "B6 · 会话认领挪到「路由未变即收工」短路之后",
    apply: (t) => { const at = t.indexOf("function checkQuestRoute"); if (at < 0) return t;
      const head = t.slice(0, at); let tail = t.slice(at).replace(/\r?\n {2}bootstrapAccountSession\(\);/, () => "");
      // 🔴 必须锚定守卫体顶层那一处(换行 + 恰好 2 空格)—— 不带换行锚会命中嵌套块里
      //    缩进 4 空格的同名赋值,注入落进条件块、被别条判据接住,本条自证就成了假绿。
      tail = tail.replace(/(\n {2}lastQuestRoute = route;)/, (m) => `${m}\n  bootstrapAccountSession();`);
      return head + tail; } },
];

const raw = fs.readFileSync(FILE, "utf8");
const real = evaluate(raw);
const selfFail = [];
let selfPass = 0;
for (const inj of INJECTIONS) {
  const mutated = inj.apply(raw);
  if (mutated === raw) { selfFail.push(`红测自证[${inj.id}]:「${inj.label}」注入没改动源码 —— 注入器已过时,自证无效`); continue; }
  const r = evaluate(mutated);
  if (r.fail.some((f) => f.startsWith(inj.id + ":"))) selfPass++;
  else selfFail.push(`红测自证[${inj.id}]:「${inj.label}」之后判据仍绿 —— 这条判据是死的`);
}

const allFail = [...real.fail, ...selfFail];
for (const f of allFail) console.log("  FAIL " + f);
console.log(
  allFail.length === 0
    ? `${real.pass + selfPass} pass / 0 fail(不变量 ${real.pass} 条 · 绕过形态红测自证 ${INJECTIONS.length} 组,含独立审计实测绕过 v1 的全部 7 种)`
    : `${real.pass + selfPass} pass / ${allFail.length} fail`,
);
process.exit(allFail.length === 0 ? 0 : 1);
