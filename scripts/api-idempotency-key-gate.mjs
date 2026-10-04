#!/usr/bin/env node
// 接口幂等键稳定性门 —— node scripts/api-idempotency-key-gate.mjs
//
// 🔴 守的不变量:**传给服务端的幂等键,同一笔意图重试时必须是同一把。**
//   键里掺时间戳 / 随机数且**没有冻结**⇒ 每调一次都是新键 ⇒ 服务端去重永远命中不了 ⇒
//   「超时 / 断网(而服务端其实已经成交)→ 用户再点一次」= 服务端当成新请求 = **真出两笔**。
//
// 现场(2026-08-13 对齐轮):创世购买写的是
//   `genesisApi.purchase(n, \`genesis-purchase:${boundKey}:${Date.now()}:${Math.random()…}\`)`
//   —— 一把用完就扔。这条不变量此前只有「记账分录的 ref」那一族有门守,API 键这一族没有。
//
// 🔴🔴 本门的判据换过两次,两次都是红测抓出来的,记在这儿免得再犯:
//   v1 钉「表达式里有没有 Date.now/Math.random」——**钉形状不钉行为**,于是把两处
//      其实稳定的实现误报成缺陷(以旧换新是 `holder.value ?? 现铸` 然后存回 holder,
//      重试复用同一把;登录每次本就是新意图)。
//   v2 只认写成 `idempotencyKey: X` 的**命名实参**——而我刚发现的那个真缺陷用的是
//      **位置参数**,于是**门看不见它要防的那件事**。红测:把创世改回原写法,门全绿。
//   v3(本版)从**接口层的函数签名**反推:哪些方法有幂等键参数、在第几位,
//      再去调用点取那一位的实参判定。签名是真源码,不是我猜的形状。
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strip } from "./lib/strip-code.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");

function allSources(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) allSources(p, out);
    else if (/\.(ts|vue)$/.test(name)) out.push(path.relative(root, p).replaceAll("\\", "/"));
  }
  return out;
}
/** 取 `startIdx` 处那个 `{` 起的函数体(按大括号配平,不靠缩进猜边界)。 */
function bodyOf(src, from) {
  const open = src.indexOf("{", from);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  return "";
}
/** 取一个调用的实参列表(按顶层逗号切,不被嵌套括号 / 模板串里的逗号骗到)。 */
function argsOf(src, callEnd) {
  let depth = 0, i = callEnd, start = callEnd + 1;
  const out = [];
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) { out.push(src.slice(start, i)); break; }
    } else if (c === "," && depth === 1) { out.push(src.slice(start, i)); start = i + 1; }
  }
  return out.map((s) => s.trim());
}

let bad = 0, total = 0;
const check = (name, cond, detail) => {
  total++;
  if (cond) console.log(`  PASS  ${name}`);
  else { bad++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

const UNSTABLE = /\bDate\.now\s*\(|\bMath\.random\s*\(|\bperformance\.now\s*\(|randomUUID\s*\(|\bnew Date\s*\(/;
// 就地豁免:默认拒绝,例外必须写在**键工厂旁边**并附理由 —— 不在本门里列名单,
// 免得门变成「我记得哪些方法没事」的清单(那种清单必然漂,而且新加的方法天然不在里面)。
const FRESH_OK = "IDEMPOTENCY-FRESH-OK:";

/**
 * 记忆化冻结:函数体在**赋值之前**就先 `return <同一个 holder>` —— 即
 * 「已经铸过就直接把上次那把还回去」。这种写法里出现时间戳 / 随机数是安全的:
 * 只在首次执行一次,重试走的是早返回那条路。
 */
function isMemoized(body) {
  for (const m of body.matchAll(/([A-Za-z_$][\w$.]*)\s*=\s*[^=]/g)) {
    const holder = m[1].replace(/[.$]/g, "\\$&");
    if (new RegExp(`return\\s+${holder}\\b`).test(body.slice(0, m.index))) return true;
  }
  // Map-backed intent memory: `const intent = holder.get(key) ?? fresh; holder.set(key, intent)`.
  // This is the same freeze invariant as the early-return form, expressed as a nullish cache fill.
  const cached = body.match(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$.]*)\.get\(([^)]+)\)\s*\?\?/);
  if (cached) {
    const [, value, holder, key] = cached;
    const escapedHolder = holder.replace(/[.$]/g, "\\$&");
    const escapedValue = value.replace(/[$]/g, "\\$&");
    const escapedKey = key.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`${escapedHolder}\\.set\\(\\s*${escapedKey}\\s*,\\s*${escapedValue}\\s*\\)`).test(body)) return true;
  }
  return false;
}

// ── ① 从接口层签名派生「哪些方法的第几个参数是幂等键」────────────────────
// 🔴 不认写法,只认「参数表里出现 idempotencyKey」:从该处往回找到本层的 `(`,
//    取括号前的标识符当方法名,数它前面有几个顶层逗号当参数位。
//    上一版按 `name(params): Promise<…>` 匹配,于是**只看见 interface 声明那一半** ——
//    真出事的 `purchase: async (quantity, idempotencyKey) => …`(对象字面量里的箭头函数)
//    整片不在扫描面里。门对它从没看过,绿是「没看」换来的。红测 ① 就是这么炸出来的。
const apiFiles = allSources().filter((f) => f.startsWith("src/api/"));
const sigs = new Map(); // methodName -> 参数下标
for (const rel of apiFiles) {
  const src = strip(readFileSync(path.join(root, rel), "utf8"));
  for (const m of src.matchAll(/\bidempotencyKey\b/g)) {
    let depth = 0, commas = 0, i = m.index - 1;
    for (; i >= 0; i--) {
      const c = src[i];
      if (c === ")" || c === "]" || c === "}") depth++;
      else if (c === "(" || c === "[" || c === "{") { if (depth === 0) break; depth--; }
      else if (c === "," && depth === 0) commas++;
    }
    if (i < 0 || src[i] !== "(") continue;                       // 不在参数表里(是字段名/类型引用)
    // 🔴 括号前那个标识符**不一定是方法名**:`purchase: async (…) => …` 里它是 `async`。
    //    上一版就栽在这儿 —— 方法名记成 async,再去全仓找 `.async(`,一处都找不到,
    //    于是真出事的那个调用点静默不在扫描面里。跳过 async/function 关键字,再吃掉 `:`
    //    才拿到对象字面量里的真实属性名。
    let head = src.slice(0, i);
    let name = head.match(/([A-Za-z_$][\w$]*)\s*$/)?.[1];
    while (name === "async" || name === "function") {
      head = head.slice(0, head.lastIndexOf(name));
      name = head.match(/([A-Za-z_$][\w$]*)\s*[:=]?\s*$/)?.[1];
    }
    // Calls such as `.map(({ idempotencyKey }) => ...)` are callback parameter
    // lists, not API method declarations. Treating `map` as an idempotent API
    // method makes every unrelated Array.map call look like a fresh key site.
    if (name) {
      const nameAt = head.lastIndexOf(name);
      if (head.slice(0, nameAt).trimEnd().endsWith(".")) continue;
    }
    if (name) sigs.set(name, commas);
  }
}
// 🔴 棘轮,不是「非空」:覆盖面掉了是**静默**的 —— 红测 ⑧ 实测,把方法名解析退回旧 bug
//    (把 `purchase: async (…)` 记成 `async`)后,创世那处又整片消失,而门照样全绿。
//    所以这里钉的是**实测基数不许缩**;新增接口只会让它变大,缩了就是判据瞎了一片。
//    数字变大时同步上调(它是覆盖面的账,不是魔法常数)。
// 2026-08-13 35 → 34:`trial-api.ts` 的卡时代早购方法(带 idempotencyKey 位)按裁决删除,
//   覆盖面少一个是**方法没了**,不是判据瞎了 —— 同轮 ② 调用点底线 82 原样通过,正因为
//   那个方法零调用点。裁决与证据链见 docs/changes/2026-08-13-trial-early-buy-adjudication.md。
//   ⚠️ 下调底线只有在「能指名道姓说出少的是哪个方法、且它确实不存在了」时才允许;
//      说不出名字就是解析器瞎了,那时要修解析器不是改这个数。
const SIG_FLOOR = 34, SITE_FLOOR = 82;
check(`① 从接口签名派生出幂等键参数位(实测 ${sigs.size} 个方法 / 底线 ${SIG_FLOOR})`, sigs.size >= SIG_FLOOR,
  `只派生出 ${sigs.size} 个,少于实测底线 ${SIG_FLOOR} —— 覆盖面缩了,判红`);

// ── ② 逐调用点取那一位实参,判「跨重试稳不稳定」──────────────────────────
// 两种传法都要扫,取并集:位置参数(签名派生)+ 对象里的命名字段(`{ idempotencyKey: k }`)。
// 只扫一种必留洞:v2 只扫命名字段,于是看不见位置参数写法的那个真缺陷。
const offenders = [];
let sites = 0;

/**
 * 就地豁免查在**原文**上查,不在剥注释后的源码上查 —— strip() 是等长填空格的,
 * 偏移量与原文一一对应,所以同一段区间直接切原文即可。
 * 🔴 这条踩过:第一版把 `body.includes(FRESH_OK)` 写在剥注释后的源码上,而标记本身
 *    就是注释 —— 判据恒假,加了 6 处标记门纹丝不动。**门读的是哪份文本,得跟标记写在哪儿对上。**
 */
function hasMarker(raw, at) {
  // 只认「本行 + 紧贴其上的连续注释块」。不许按字符窗口找 ——
  // 红测证过:600 字符的窗口会把隔壁调用点的标记漏给本处,一处豁免顺手放行邻居。
  const lines = raw.slice(0, at).split(/\r?\n/);
  const n = lines.length - 1;
  const all = raw.split(/\r?\n/);
  const block = [all[n]];
  for (let i = n - 1; i >= 0 && /^\s*(\/\/|\*|\/\*)/.test(all[i]); i--) block.unshift(all[i]);
  // 理由必须写在**标记同一行**:红测证过,只要求「标记后有非空白」会被下一行的正常代码顶包,
  // 于是「有标记没理由」的空壳照样绿。
  return block.some((l) => new RegExp(`${FRESH_OK}\\s*\\S`).test(l));
}

/** 判一个键表达式跨重试稳不稳定;不稳定则记一条。`at` = 该调用点在源码里的偏移量。 */
function judge(rel, src, raw, expr, where, at) {
  sites++;
  // 直接内联不稳定源 = 现拼一把用完就扔 —— 这正是要抓的形态
  if (UNSTABLE.test(expr)) {
    if (hasMarker(raw, at)) return;   // 就地写明了「这里每次新键是对的」
    offenders.push(`${rel}: ${where} 现拼:${raw.slice(at, at + 70).replace(/\s+/g, " ")}`);
    return;
  }
  const name = expr.match(/^([A-Za-z_$][\w$]*)/)?.[1];
  if (!name) return;
  // 冻结模式:键被存进某个 holder,或它自己就是 `holder.value ?? 现铸` 的结果 ——
  // 两种都表示「首次铸一次,重试复用同一把」,跨重试是稳的。
  if (new RegExp(`[A-Za-z_$][\\w$.]*\\s*=\\s*${name}\\b`).test(src)
    || new RegExp(`${name}\\s*=\\s*[A-Za-z_$][\\w$.]*\\.value\\s*\\?\\?`).test(src)) return;
  // 键是函数调用(如 `purchaseIdempotencyKey(...)`)→ 回查该函数体(大括号配平,不靠缩进)
  const decl = src.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (decl < 0) return;
  const body = bodyOf(src, decl);
  if (!UNSTABLE.test(body)) return;
  if (isMemoized(body)) return;                                   // 记忆化冻结:首次铸、之后复用同一把
  if (hasMarker(raw, decl)) return;     // 就地写明「这里每次新键是对的」+ 理由
  offenders.push(`${rel}: ${where} → ${name}() 每次现铸新键,且未冻结、未就地说明`);
}

for (const rel of allSources()) {
  const raw = readFileSync(path.join(root, rel), "utf8");
  const src = strip(raw);
  // (a) 位置参数:从签名派生出的「第几位」
  for (const [method, at] of sigs) {
    for (const m of src.matchAll(new RegExp(`\\.${method}\\s*\\(`, "g"))) {
      const open = m.index + m[0].length - 1;
      const args = argsOf(src, open);
      const expr = args[at];
      if (expr === undefined || expr === "") continue;
      judge(rel, src, raw, expr, `${method}(…) 第 ${at + 1} 位`, src.indexOf(expr, open));
    }
  }
  // (b) 命名字段:`idempotencyKey: X` / `idempotencyKey = X`
  for (const m of src.matchAll(/idempotencyKey\s*[:=]\s*([^,;\r\n]+)/g)) {
    if (/^\s*(string|\??\s*string)\b/.test(m[1])) continue;       // 类型声明不是调用点
    judge(rel, src, raw, m[1].trim().replace(/[,;)]+$/, ""), "idempotencyKey 字段", m.index);
  }
}

check(`② 幂等键调用点覆盖(实测 ${sites} 处 / 底线 ${SITE_FLOOR})`, sites >= SITE_FLOOR,
  `只找到 ${sites} 处,少于实测底线 ${SITE_FLOOR} —— 调用点扫漏了一片,判红`);
check(`🔴 每个幂等键跨重试稳定(越界 ${offenders.length} 处)`, offenders.length === 0,
  "\n        " + offenders.join("\n        "));

const FLOOR = 3;
if (total < FLOOR) {
  console.log(`FAIL  只跑了 ${total} 格,低于登记的 ${FLOOR} 格 —— 靶被删或没执行`);
  process.exit(1);
}
console.log(bad === 0
  ? `api-idempotency-key PASS —— ${total}/${total}(${sigs.size} 个带幂等键的接口方法 / ${sites} 处调用点)`
  : `api-idempotency-key FAIL —— ${bad}/${total} 格`);
process.exit(bad === 0 ? 0 : 1);
