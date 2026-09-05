#!/usr/bin/env node
// 远端刷新缝的「权威不可达」韧性门 — node 直跑:
//   node scripts/selfcheck-remote-refresh-resilience.mjs
//
// 背景(2026-08-10 z1 判决包 B1):c37e642 给 ~10 个 store 接了远端刷新缝,其中
// v-rank / commission / genesis 三处裸 await —— 后端不可达时每次启动稳定抛
// unhandled rejection,把 6 条「console error = 0」运行时门全部打红。
//
// 🔴 守的不变量:**任何远端刷新缝在 API 抛错时,rejection 都不许冒泡到顶层**
//   (unavailable authority 是常态输入,不是异常)。两种合法实现:缝自吞并落到降级态,
//   或缝保留 reject 而**每个调用点 .catch() 兜底** —— 两条都有机器判据守着。
//
// 方法:esbuild 载真模块,@/api/runtime 换成「调用即抛」的 stub 但 remoteApiEnabled=true,
// 按 mode ∈ {remote, sandbox} 两轮跑、覆盖取并集(对偶旗标守卫的两侧各归一轮可达),
// 然后逐个 await 刷新函数 —— 必须 resolve;进程级 unhandledRejection 必须为 0。
// 覆盖清单全部从磁盘构造性推出(全仓 walk + import 判据 + decl 四族 + 括号配对函数体),
// 既不手抄清单、也不维护基数魔数 —— 见下方「判据重建」大注释。
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { atAliasResolver } from "./lib/at-alias.mjs";
import { VUE_STUB_NXREF } from "./lib/harness-stubs.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

console.log("selfcheck-remote-refresh-resilience — 权威不可达时刷新缝必须自吞降级");

// ── 覆盖清单:磁盘真相,不手抄 ────────────────────────────────────────────────
// 判据:全仓 `src/**/*.ts` 里 import 了 `@/api/runtime`、被 `void xxx(` 裸发触发、
// 且**函数体真的引用了该文件从 runtime 导入的某个标识符**的函数。
//
// 🔴 2026-08-16 判据重建(P-102 同族 · 反手工枚举):原来这里有三样会**静默失效**的判据,
//    外加一个兜底魔数,四样叠起来仍然漏了 3 条真缝 —— 逐条实测:
//    ① `SCAN_DIRS = ["store","composables","lib"]` 是手工目录白名单 → `src/services/`
//       整个目录不在名单里,janus-c2#runJanusC2(remoteApiEnabled + sessionVault + 转调
//       janusApi)从建门起就没被扫到过;
//    ② decl 正则只认三族(async function / const=async / :async)→ 第四族
//       `function f(...): Promise<T>` 认不出就**静默 continue**,
//       app#refreshFundsSandboxForAccount 这条真缝(就在 refreshRemoteWithdrawalList
//       隔壁一行被 void 调用)同样从没进过覆盖;
//    ③ 「函数体含 /Api\b/」量的是 decl 之后 2000 字符窗口 → bills#refreshServerLedger
//       的 runtime 引用落在窗口外,又一条静默漏;而且 `Api` 是猜名字,
//       payoutAddressServerEnabled 这类没有 Api 后缀的旗标本来就不该靠名字认。
//    ④ 兜底的 `EXPECTED_SEAMS` 基数台账对以上三条**一条都抓不到**:它守的是「已扫到的
//       缝变少」,而 ①②③ 全是「压根没扫到」—— 数字不动,门照绿。手工数字换不来覆盖面。
//    现在四样全部换成构造性判据:扫描面 = 全仓 walk + import 判据(目录名单没了);
//    decl 四族全收 + **宽判据交叉验**(本文件明明声明了、四族却认不出 → 红,不静默);
//    函数体 = 括号配对的真体 + 该文件的真实 import 名单(窗口魔数和猜名都没了)。
//    于是每个 void 调用点都必须落进一个**有账的桶**,静默 continue 被消灭,
//    「缝数」不再需要人记 —— 基数台账 EXPECTED_SEAMS 随之删除(理由见文件尾)。

// 注释剥离(保长度,后续 index 偏移不乱):否则注释里的示例代码会被当成真调用点 ——
// deposits.ts 那段讲「不要写成 `const refresh = 条件 ? A : B; void refresh()`」的
// 🔴 注释,实测就会伪造出一条 deposits#refresh。
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n\r]/g, " "))
  .replace(/(^|[^:])\/\/[^\n\r]*/g, (m, p) => p + " ".repeat(m.length - p.length));

// 从 decl 命中处向后找第一个 `{`,括号配对取**真**函数体(取代 2000 字符窗口魔数)
function functionBodyAt(src, from) {
  const open = src.indexOf("{", from);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

const walkFiles = (dir, test) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const abs = path.join(dir, e.name);
  return e.isDirectory() ? walkFiles(abs, test) : test(e.name) ? [abs] : [];
});

// decl 四族:async function f( / const f = async ( / f: async ( / (非 async 但)返回 Promise
const declRe = (fn) => new RegExp(
  `(?:async function ${fn}\\s*\\(`
  + `|(?:const|let)\\s+${fn}\\s*=\\s*async\\s*\\(`
  + `|\\b${fn}\\s*:\\s*async\\s*\\(`
  + `|function ${fn}\\s*\\([^)]*\\)\\s*:\\s*Promise`
  + `|(?:const|let)\\s+${fn}\\s*=\\s*\\([^)]*\\)\\s*:\\s*Promise)`);
// 宽判据:本文件以任何形式声明过这个标识符。只用来**交叉验 declRe 的表达力**,不参与选缝 ——
// 宽的命中而四族没命中 = 出现了第五族写法,必红(而不是像 ② 那样静默漏掉一条缝)。
const looseDeclRe = (fn) => new RegExp(
  `(?:function\\s+${fn}\\s*[(<]|(?:const|let|var)\\s+${fn}\\s*[=:]|\\b${fn}\\s*[:=]\\s*(?:async\\s*)?(?:function\\b|\\())`);

const targets = [];
const declGap = [];      // 本文件声明了、四族却认不出 —— 判据表达力缺口,必红
const crossModule = [];  // 本文件压根没声明(如 useContentCopy().x())—— 构造性排除
const noRuntimeUse = []; // 声明了但函数体不碰任何 runtime 导入 —— 构造性排除(不是远端缝)
const unsupportedImport = []; // 引了 runtime 但不是具名花括号写法 —— 取不到名单,必红
for (const abs of walkFiles(SRC, (n) => n.endsWith(".ts"))) {
  const rel = "src/" + path.relative(SRC, abs).split(path.sep).join("/");
  const raw = readFileSync(abs, "utf8");
  const imported = /import\s*\{([^}]*)\}\s*from\s*"@\/api\/runtime"/.exec(raw);
  if (!imported) {
    // 🔴 别把「取不到 import 名单」办成静默跳过 —— 那正是本次要根治的病。
    //    `import * as rt from "@/api/runtime"` / 默认导入这类写法取不到具名清单,
    //    整个文件会连同它的缝一起消失。全仓现有 52 个引用文件写法一致(实测新旧判据
    //    命中集合 52 == 52,差集为空);哪天出现别的写法,这里红,不是静默漏。
    if (/from "@\/api\/runtime"/.test(raw)) unsupportedImport.push(rel);
    continue;
  }
  const runtimeIdents = imported[1].split(",")
    .map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()).filter(Boolean);
  const src = stripComments(raw);
  // 三族调用写法:void fn(…) / void obj.fn(…) / void fn(…).catch(…)。
  // 🔴 只吃到**第一个左括号**为止:早期版本允许跨过 `()` 再取一段,于是
  //    `void refreshRemote().catch(...)` 被读成 `.catch`,payout-address 那条缝整条漏掉。
  for (const m of src.matchAll(/void\s+([\w$.]+)\s*\(/g)) {
    const fn = m[1].split(".").pop();
    if (!fn || fn === "0") continue;
    const key = `${rel}#${fn}`;
    const declHit = declRe(fn).exec(src);
    if (!declHit) { (looseDeclRe(fn).test(src) ? declGap : crossModule).push(key); continue; }
    const body = functionBodyAt(src, declHit.index);
    if (!runtimeIdents.some((id) => new RegExp(`\\b${id}\\b`).test(body))) { noRuntimeUse.push(key); continue; }
    targets.push({ file: rel, fn });
  }
}
const uniq = [...new Map(targets.map((t) => [`${t.file}#${t.fn}`, t])).values()];
const dedup = (a) => [...new Set(a)].sort();

// 🔴 判据自体检 —— 取代基数台账的那两条构造性断言。
// ① 表达力缺口:本文件明明声明了这个函数,四族 decl 正则却认不出 = 第五族写法出现了。
//    补进 declRe(而不是让它像 ② 那样静默漏掉一条缝)。
check(`🔴 decl 判据无表达力缺口(本文件已声明、四族却认不出:${dedup(declGap).length} 条)`,
  declGap.length === 0, dedup(declGap).join(", "));
// ② 判据没整体塌陷:全仓确有远端缝,扫出 0 条只能是扫描器坏了。
//    (旧注释说「>= N 下限守不住删除向」——那是因为当年**静默 continue** 让退化不可见;
//     现在退化会先从 ① 或下面的排除清单浮出来,下限只兜「全灭」这一种。)
check(`🔴 扫描判据未塌陷(实扫 ${uniq.length} 条缝)`, uniq.length > 0);
// ③ import 写法全部取得到名单:出现取不到的写法就红,不许整文件静默消失。
check(`🔴 runtime import 写法全部可解析(取不到具名清单的文件:${dedup(unsupportedImport).length} 个)`,
  unsupportedImport.length === 0, dedup(unsupportedImport).join(", "));
// 两个构造性排除桶**逐条打印**,不静默:人 review 日志时能直接看见谁被排除了、为什么。
console.log(`  ....  构造性排除 · 跨模块调用(本文件无声明)${dedup(crossModule).length} 条:${dedup(crossModule).join(", ")}`);
console.log(`  ....  构造性排除 · 函数体不碰 runtime 导入 ${dedup(noRuntimeUse).length} 条:${dedup(noRuntimeUse).join(", ")}`);

// ── 调用点兜底判据:「保留 reject」那族的合法性,从口头约定焊成机器门 ─────────────
// 🔴 本门守的不变量是「rejection 不许冒到顶层」,**自吞只是其中一种实现**。另一种是
//    「缝保留 reject、由每个调用点 .catch() 兜底」—— orders#refreshRemote /
//    bills#refreshServerLedger / janus-c2#runJanusC2 都属这族。这族此前只活在注释里的
//    口头约定(「z6 已核跨文件族成员:调用点全带 catch,契约保留 reject」),**没有任何机器
//    判据守着**:哪天有人删掉那个 .catch(),缝照旧 reject,门却看不见。这里焊成判据。
// 判据:全仓(含 .vue —— 调用点常在页面里)每一个 `void …fn(…)` 都必须紧跟 `.catch(`;
//      一个没兜住就不算这一族。同名跨文件只会让判据**更严**(要满足的调用点更多),不会放水。
const callSiteCatchCache = new Map();
function allCallSitesCaught(fn) {
  if (callSiteCatchCache.has(fn)) return callSiteCatchCache.get(fn);
  let sites = 0;
  let caught = 0;
  for (const abs of walkFiles(SRC, (n) => n.endsWith(".ts") || n.endsWith(".vue"))) {
    const src = stripComments(readFileSync(abs, "utf8"));
    for (const m of src.matchAll(new RegExp(`void\\s+(?:[\\w$]+\\.)*${fn}\\s*\\(`, "g"))) {
      sites++;
      // 括号配对跳过实参,再看紧跟其后的是不是 .catch(
      let depth = 0;
      let i = m.index + m[0].length - 1;
      for (; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")" && --depth === 0) { i++; break; }
      }
      if (/^\s*\.catch\s*\(/.test(src.slice(i, i + 40))) caught++;
    }
  }
  const ok = sites > 0 && sites === caught;
  callSiteCatchCache.set(fn, ok);
  return ok;
}

// ── harness:remote 开、API 全抛 ─────────────────────────────────────────────
const disk = new Map();
globalThis.uni = {
  getStorageSync(k) { const r = disk.get(k); return r === undefined ? "" : JSON.parse(r); },
  setStorageSync(k, v) { disk.set(k, JSON.stringify(v)); },
  removeStorageSync(k) { disk.delete(k); },
  getSystemInfoSync() { return { language: "en" }; },
};

// runtime-stub 手写成「remote 开 + 全 API 抛」:这是本门的靶态,与共享 runtimeStub
// (mock 关)语义相反,不能复用。导出清单仍从磁盘扫,防新 API 掉队。
// 🔴 布尔旗标禁 Proxy 化(2026-08-14 harness 缺口修复):Proxy 恒 truthy,
//    `if (fundsSandboxEnabled) return;` 这类守卫在探针里恒早退,缝被静默挡在门外
//    (VietQR 缝当初就是这么漏进 UNREACHABLE 登记的)。判据构造性:初始化式**只引用
//    apiRuntimeConfig / 字面量**的导出 = 配置旗标,把源码表达式原样搬进 stub,
//    用 stub 的 apiRuntimeConfig 按本轮 mode 求值 —— 与真 runtime.ts 同式同值,
//    不手抄布尔名单。未来若有旗标引用别的标识符,它退回 Proxy;被它挡住的缝
//    会从「未触发必登记」那条红浮出,不会静默。
function throwingRuntimeStub(mode) {
  const src = readFileSync(path.join(root, "src", "api", "runtime.ts"), "utf8");
  const names = [...src.matchAll(/^export (?:const|let|function|async function) (\w+)/gm)].map((m) => m[1]);
  if (!names.includes("remoteApiEnabled")) throw new Error("runtime.ts 形状变了 —— 判据失效必红");
  const LITERAL_TOKENS = new Set(["true", "false", "null", "undefined", "typeof"]);
  const flagExprs = new Map();
  for (const m of src.matchAll(/^export const (\w+) = (.+);\r?$/gm)) {
    const [, name, expr] = m;
    const idents = expr.replace(/"[^"]*"/g, "").match(/(?<!\.)\b[A-Za-z_$][\w$]*/g) ?? [];
    if (idents.every((id) => id === "apiRuntimeConfig" || LITERAL_TOKENS.has(id))) flagExprs.set(name, expr);
  }
  if (!flagExprs.has("remoteApiEnabled")) throw new Error("旗标搬运判据失效(连 remoteApiEnabled 都没认出)—— 必红");
  // apiRuntimeConfig 本体给靶态值(special 优先于搬运;搬运表达式全都读它求值)。
  // 字段结构 = runtime-config.ts 的 ApiRuntimeConfig 接口;modeExplicit 置 true,
  // sandbox 轮的 fundsSandboxEnabled 表达式才能按真语义判真。
  const special = {
    apiRuntimeConfig: `export const apiRuntimeConfig = { mode: ${JSON.stringify(mode)}, modeExplicit: true, baseUrl: "http://unreachable.invalid" };`,
    // app#refreshRemoteFleet now correctly refuses a USER read without a
    // matching in-memory session. Give the harness a coherent non-secret
    // identity so this remains an authority-unavailable test instead of a
    // caller-precondition test; bindAccount below uses the same user:42 key.
    sessionVault: `export const sessionVault = { read: () => ({ accessToken: "probe", refreshToken: "probe", tokenType: "Bearer", user: { userId: 42, countryCode: "+1", phone: "0000000000", nickname: "probe" } }), revision: () => 1, clear: () => {}, clearIfUnchanged: () => true, save: () => {}, saveIfUnchanged: () => true };`,
  };
  const body = names
    // 🔴 每次 API 调用记一笔:这是「这条缝真的跑了」的唯一硬凭据(z1 R2 对抗审计:
    //    原来只要 bindAccount 存在就 exercised++,缝被挪到别的入口一样报「全部触发」)。
    .map((n) => special[n]
      ?? (flagExprs.has(n)
        ? `export const ${n} = ${flagExprs.get(n)};`
        : `export const ${n} = new Proxy({}, { get: () => (...a) => { globalThis.__z1ApiCalls++; return Promise.reject(new Error("AUTHORITY_UNREACHABLE")); } });`))
    .join("\n");
  return body;
}

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
};

const rejections = [];
process.on("unhandledRejection", (err) => { rejections.push(String(err?.message ?? err)); });

async function loadEntry(contents, runtimeStub, mode) {
  const out = await build({
    stdin: { contents, resolveDir: root, loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "neutral",
    // 🔴 z6:runtime-config.ts 在**模块加载期**读 import.meta.env.VITE_*(free-trial 的模块图
    //    把它拉进来,实测载入即 TypeError)—— 那是 harness 缺陷不是缝缺陷:真栈里 Vite 会
    //    define 全部 env 键。三个已知键给靶态值;再兜一个 "import.meta.env": "{}"
    //    (esbuild 最长匹配优先),未来新增的 env 键读到 undefined 而不是崩。
    define: {
      "import.meta.env.PROD": "false", "import.meta.env.DEV": "true", "import.meta.env.MODE": '"test"',
      "import.meta.env.VITE_NEXGRID_API_MODE": JSON.stringify(mode),
      "import.meta.env.VITE_NEXGRID_API_BASE_URL": '"http://unreachable.invalid"',
      "import.meta.env.VITE_NEXGRID_API_DEV_BASE_URL": '""',
      "import.meta.env": "{}",
    },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
        b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
        b.onResolve({ filter: /^@\/api\/runtime$/ }, () => ({ path: "runtime-stub", namespace: "stub" }));
        b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "selfcheck-remote-refresh-resilience"));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: a.path === "runtime-stub" ? runtimeStub : STUBS[a.path], loader: "js" }));
      },
    }],
  });
  const dataUrl = "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64");
  return import(dataUrl);
}

// 每个刷新缝:载它所在 store,取出同名导出或经 store 实例调用。刷新函数多为 store 内部
// 函数,不一定导出 —— 统一经 bindAccount / 直调导出两条路径触发,再看 rejection 计数。
// 🔴 触发登记表(z1 R2 对抗审计 P1-23):有些缝天然从门外触发不到(要业务参数,
//    如 joinRemote(eventId))。这类必须**显式登记原因**,不许混在「已触发」里充数;
//    未登记又没真打 API 的,一律红。判据 = 每条缝的 API 调用计数真的涨了。
// (2026-08-14 缺口收口:此处原登记 deposits#refreshRemoteVietQrDeposits ——
//  旧 stub 把 fundsSandboxEnabled 做成 truthy Proxy,该缝首行守卫恒早退。
//  探针两轮化后它在 remote 轮拿到 API 凭据,登记按 stale 断言的红删除。)
// 在此登记 `"file#fn": "为什么门外触发不到"`;
// 登记了却其实能触发的(陈旧登记)由下面的 stale 断言顶回来 —— 登记表本身也要被守。
// 🔴 登记**不是免检**:下面还有一条机器判据要求每个登记项的全仓调用点个个 .catch() 兜底,
//    否则红 —— 「门外触发不到」只豁免探针执行,不豁免不变量。
const UNREACHABLE = {};
// ── 两轮探针:mode ∈ {remote, sandbox},覆盖取并集 ─────────────────────────────
// 🔴 为什么两轮而不是把某个旗标钉死:deposits 两条缝是对偶守卫 ——
//    refreshRemoteVietQrDeposits 首行 `if (fundsSandboxEnabled) return;`,
//    refreshFundsSandboxDeposits 首行 `if (!fundsSandboxEnabled) return;`。
//    钉 false 只是把覆盖缺口从前者挪给后者;真 runtime 里旗标随 mode 走,
//    探针照两个 mode 各跑一遍,谁在哪个 mode 可达就在哪轮拿 API 调用凭据。
//    缝的去重集合来自磁盘扫描,与轮数无关 —— 基数台账不因两轮而变。
const ROUNDS = ["remote", "sandbox"];
globalThis.__z1ApiCalls = 0;
const exercisedKeys = new Set();
const faultedKeys = new Set();
let preApiRejects = 0;
for (const mode of ROUNDS) {
  const runtimeStub = throwingRuntimeStub(mode);
  disk.clear(); // 轮间清盘:每轮从单轮时代同款的空存储起步,不带上一轮残留
  for (const t of uniq) {
    const key = `${t.file}#${t.fn}`;
    const modName = t.file.replace(/^src\//, "@/").replace(/\.ts$/, "");
    const before = globalThis.__z1ApiCalls;
    let resolved;
    try {
      const mod = await loadEntry(`export * from "${modName}";`, runtimeStub, mode);
      // 直调导出的刷新函数(若导出);否则触发 use store + bindAccount(常见 void 调用点)。
      if (typeof mod[t.fn] === "function") {
        resolved = await mod[t.fn]();
      } else {
        const useName = Object.keys(mod).find((k) => k.startsWith("use"));
        const store = useName ? mod[useName]() : null;
        if (store && typeof store.bindAccount === "function") store.bindAccount("user:42");
        if (store && typeof store[t.fn] === "function") resolved = await store[t.fn]();
      }
    } catch (err) {
      // 🔴 API 证据裁决:一笔 API 都没打就 reject 的,是「本 mode 不该有我」的前置断言
      //    (bills 在 remote 轮抛 FUNDS_BILLS_PROVIDER_NOT_CONFIGURED 属此类,产线调用点
      //    全被旗标守着),不是本门要抓的「权威不可达冒泡」—— 不判红也不计触发;
      //    若它在**所有轮**都够不到 API,自会落进「未触发必登记」的红,不会静默消失。
      //    打了 API 之后才 reject 的,才是韧性缺陷,照旧红。
      if (globalThis.__z1ApiCalls > before) {
        // 「保留 reject + 调用点个个 .catch() 兜底」是本不变量的另一种合法实现(见上方判据)。
        // 兜住了 → 过,且计入已触发;有一个调用点没兜住 → 照旧红。
        if (allCallSitesCaught(t.fn)) {
          check(`${key} 保留 reject,但全仓调用点个个 .catch() 兜底 [mode=${mode}]`, true);
          exercisedKeys.add(key);
        } else {
          check(`${key} await 后 resolve(权威不可达不许 reject 冒泡)[mode=${mode}]`, false, String(err?.message ?? err).slice(0, 160));
          faultedKeys.add(key);
        }
      } else preApiRejects++;
      continue;
    }
    // 🔴 z6 审计 F5:靶态=API 全抛,返回 boolean 的缝此时 resolve true = 谎报成功——
    //    staking.vue 一类「.then(ok => !ok && toast)」的返回值消费者会被静默哄哑。
    //    boolean 缝在靶态下必须 false;非 boolean(void)缝不在此断言内。
    if (typeof resolved === "boolean" && resolved !== false && globalThis.__z1ApiCalls > before) {
      check(`${key} 靶态下 boolean 返回值必须 false(不许谎报成功)[mode=${mode}]`, false, `resolved ${resolved}`);
      faultedKeys.add(key);
      continue;
    }
    // 让 fire-and-forget 的调用有机会发出去
    await new Promise((r) => setTimeout(r, 5));
    if (globalThis.__z1ApiCalls > before) exercisedKeys.add(key);
  }
}
const exercised = exercisedKeys.size;
const notExercised = uniq.map((t) => `${t.file}#${t.fn}`).filter((k) => !exercisedKeys.has(k) && !faultedKeys.has(k));
const unregistered = notExercised.filter((k) => !UNREACHABLE[k]);
check(`🔴 未触发的缝必须登记原因(未登记 ${unregistered.length} 条)`, unregistered.length === 0,
  unregistered.join(", "));
const staleReg = Object.keys(UNREACHABLE).filter((k) => !notExercised.includes(k));
check(`🔴 登记表无陈旧项(登记为不可达、实际却触发到的:${staleReg.length} 条)`, staleReg.length === 0,
  staleReg.join(", "));
// 🔴 登记不是免检:探针跑不到它,那就用磁盘可验的那条契约守它 —— 调用点必须个个 .catch()。
const uncaughtReg = Object.keys(UNREACHABLE).filter((k) => !allCallSitesCaught(k.split("#").pop()));
check(`🔴 登记项的调用点必须个个 .catch() 兜底(不合格 ${uncaughtReg.length} 条)`, uncaughtReg.length === 0,
  uncaughtReg.join(", "));
check(`🔴 已触发的缝有真凭据(API 调用计数上涨):${exercised} 条;登记为门外不可达 ${notExercised.length} 条`,
  exercised + notExercised.length === uniq.length);
// 🔴 基数台账 EXPECTED_SEAMS 已删除(2026-08-16)—— 它是 P-102 同族的手工枚举反模式,
//    而且**实测没守住它自己那份工作**:16 → 27 → 28 → 29 一路人肉同步,期间
//    app#refreshFundsSandboxForAccount / bills#refreshServerLedger / janus-c2#runJanusC2
//    三条真缝因扫描器的三个静默滤网从未进过覆盖,数字全程判绿。
//    「先对总数、再逐条断言」的顺序本身是错的:总数只能守「已扫到的缝变少」,
//    守不住「压根没扫到」—— 而后者才是这道门实际漏掉的全部三条。
//    替代品在文件上半部:扫描面 = 全仓 walk + import 判据(目录白名单没了)、
//    decl 四族 + 宽判据交叉验(表达力缺口必红)、函数体括号配对 + 真实 import 名单
//    (窗口魔数和猜名都没了)、两个排除桶逐条打印。每条实扫到的缝逐条断言契约的
//    三条判据(真凭据 / 未触发必登记 / 登记表无陈旧项)就在上面,不再需要总数做前置。
// ⚠️ 一并交代**故意丢掉的那颗牙**:旧数字顺带守着「删除向棘轮」——有人删掉一条 void
//    调用点,数字会红。新判据不守这一面(缝少一条不会红)。这是有意的语义取舍:
//    缝**存不存在**是功能契约(归 PRD / 功能门),缝**韧不韧性**才是本门的不变量;
//    而那颗牙的代价是每次增删都要人肉同步一个数字,并且它给了「数字绿 = 覆盖全」的假安全感。
// ⚠️ 已知扫描盲区(z6 审计 F2/F3 修订,本次重建后仍在):**跨文件的声明/调用对**(.vue 或 .ts
//    都算)+ **无 void 关键字的裸调用**(定时器/事件回调里 `() => x.f()`)——两者叠加让
//    market#syncRemote/tickPrice 曾双重不可见(P0:wallet-nex 的 setInterval 每 3s 一个
//    unhandledRejection,已改自吞)。(第三项「非 async 声明的 promise 返回包装函数」
//    本次已由 decl 第四族收编,不再是盲区。)
//    z6 已核跨文件族成员:orders#refreshRemote(调用点全带 catch,契约保留 reject)、
//    order-canonical#refreshCanonicalOrders(自吞)、use-remote-account-state(自吞、无调用方)、
//    market(已修)。扩面到跨文件扫描待议——本门维持单文件内构造性判据 + 人工登记跨文件族。
// ⚠️ harness env 提示(z6 审计 F4):esbuild define 只匹配**点式成员访问**;若未来有模块用
//    解构 `const { K } = import.meta.env` 读键,拿到的是 undefined(静默错模式)。当前全仓 0 处
//    解构读法;新增时必须改用点式或在此补 define。
// microtask 清空,让 fire-and-forget 的 rejection 有机会冒出来
await new Promise((r) => setTimeout(r, 50));

// (原「全部刷新缝已触发」断言由上面三条取代:真凭据 + 登记表 + 基数台账)
check(`unhandledRejection = 0(实测 ${rejections.length})`, rejections.length === 0,
  rejections.slice(0, 3).join(" | "));

console.log(`\n${pass} pass / ${fail} fail(样本:${uniq.length} 个刷新缝 × ${ROUNDS.length} 轮 mode(${ROUNDS.join("/")})并集 · API 全抛靶态 · rejection 计数 ${rejections.length} · 前置断言拒绝(未打 API,不判红)${preApiRejects} 笔)`);
process.exit(fail === 0 ? 0 : 1);
