#!/usr/bin/env node
// 周任务 × 创世闸的**观测**门 — node 直跑:
//   node scripts/selfcheck-quest-genesis-tripwire.mjs
//
// ══ 本门守的是什么,以及为什么它不是一道过滤闸 ═══════════════════════════════
//
// 2026-08-05 客户端有过一道真闸(weekly-quest-hero.vue 问 useGenesisSaleGate,
// 关闭态不派「买创世」周任务)。2026-08-12 周任务改服务端下发后,客户端不再决定
// 派什么,那道闸消失,GEN10 门的闸消费者基数从 10 改回 9 并如实交底「这条不变量
// 在客户端没有门守着」。本门就是来接手那句交底的。
//
// 🔴 接手的方式是**报警**不是过滤。理由在 src/lib/quest-genesis-tripwire.ts 顶部:
//   questCode 是后台运营手输的自由文本,客户端只能按字符串猜;猜错会把 CLAIMABLE 的
//   创世任务藏掉 = 扣掉用户已挣到的奖励,比它想防的问题更坏。过滤留在派发端(U-16)。
//
// 🔴 四类判据,互补而不重叠:
//   ① 行为:纯函数固定靶(5 档阻断 × 4 种 status × 两个句柄字段)——**只算 PENDING**;
//   ② 接线:hero 真把**闸的值**喂进了报警器(不是 import 了就算,也不是喂个常量);
//   ③ 反向钉:任务面若新增「点进创世」的入口,必须问闸——今天没有入口,恒真也要焊,
//      因为原本那条缺陷(领到任务→点进去按钮是灰的)正是从这个入口复发的;
//      判据**不禁止**跳转(U-16 落地后可购买态跳转是对的),只要求跳转的文件问闸。
//   ④ 红测:每条判据把改坏的文本喂回它自己,且**先证变异真的改到了东西**再看红。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { atAliasResolver } from "./lib/at-alias.mjs";
import { strip } from "./lib/strip-code.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");
const PURE = "src/lib/quest-genesis-tripwire.ts";
const HERO = "src/components/home/weekly-quest-hero.vue";

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

/**
 * 载入纯判定模块。传入 srcOverride 就载**改坏的那份**——红测必须把变异喂回真判据,
 * 而不是另写一个「看起来一样」的副本去自问自答(GEN10 v1 的红测就是那么假的)。
 *
 * 🔴 必须 bundle,不能只 transform:本模块从 `@/store/genesis-config` 拿的是
 *   `genesisBlockIsKnownUnavailable` 这个**值**(分档判定归本体所有,见该处注释),
 *   不再是纯 `import type`。只 transform 的话 import 语句会原样留在 data: URL 里解析不了。
 *   顺带的好处:红测跑的是**真的本体分类器**,本体改坏了这道门也会红。
 */
async function loadPure(srcOverride) {
  const bundle = await build({
    stdin: {
      contents: `export { questLooksGenesisBound, unclaimableGenesisQuests, genesisQuestContractViolation } from "@/lib/quest-genesis-tripwire";`,
      resolveDir: root, loader: "ts",
    },
    bundle: true, write: false, format: "esm",
    plugins: [
      // 变异版从内存喂进去,不落盘 —— 红测绝不许改工作树
      ...(srcOverride ? [{
        name: "pure-override",
        setup(b) {
          b.onResolve({ filter: /quest-genesis-tripwire$/ }, () => ({ path: "pure", namespace: "override" }));
          b.onLoad({ filter: /.*/, namespace: "override" }, () => ({ contents: srcOverride, loader: "ts", resolveDir: root }));
        },
      }] : []),
      {
        name: "runtime-stub",
        setup(b) {
          b.onResolve({ filter: /^@\/api\/runtime$/ }, () => ({ path: "runtime", namespace: "stub" }));
          b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
            // 🔴 桩必须跟上真 runtime 的导出面:genesis-config.ts 2026-08-13 起也 import
            // remoteApiEnabled(mock 模式不打服务端),桩少一个导出 esbuild 直接 build failed、
            // 整道门崩掉——表现成「门失败」,但根本没跑到判据。
            contents: "export const genesisApi = Object.freeze({}); export const remoteApiEnabled = false;", loader: "js",
          }));
        },
      },
      { name: "alias", setup(b) { b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "selfcheck-quest-genesis-tripwire")); } },
    ],
  });
  return import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64"));
}

/** 递归列出 src 下所有 .ts/.vue —— 任务面是开放集合,写死清单会漏掉新文件。 */
function allSources(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) allSources(p, out);
    else if (/\.(ts|vue)$/.test(name)) out.push(path.relative(root, p).replaceAll("\\", "/"));
  }
  return out;
}

console.log("selfcheck-quest-genesis-tripwire — 服务端派了不可能完成的创世任务时必须有人喊");

const q = (questCode, name, status) => ({ questCode, name, layer: "WEEKLY_T1", rewardNex: 2500, status });
/** 闸的全部档位;`configUnavailable` 单独列开 —— 它是「不知道」,不构成指控依据。 */
const KNOWN_BLOCKED = ["marketClosed", "halted", "soldOut", "preSale"];
const ALL_BLOCKS = ["configUnavailable", ...KNOWN_BLOCKED];

// ══ ① 行为:纯函数固定靶 ═══════════════════════════════════════════════════════
const pure = await loadPure();
{
  const { unclaimableGenesisQuests: flag, questLooksGenesisBound: looks, genesisQuestContractViolation: msg } = pure;

  // 四档**确定**阻断逐个隔离(别写「任一档命中即通过」——那样漏一档也绿)
  for (const block of KNOWN_BLOCKED) {
    const hit = flag([q("WK_T1_GENESIS", "Acquire a Genesis Node", "PENDING")], block);
    check(`🔴 ① 阻断档「${block}」下派了待办创世任务 → 报警`, hit.length === 1, `实得 ${hit.length} 条`);
  }
  check(`① 可购买态(block=null)不报警`,
    flag([q("WK_T1_GENESIS", "Acquire a Genesis Node", "PENDING")], null).length === 0, "误报 = 正常态天天喊狼来了");
  // 🔴 自审抓出的假警:configUnavailable = 「还不知道」,不是「已经关了」。
  //   loaded 初值 false + cfg.refresh() 在 onMounted 之后 → 任务快照先到就会在启动窗口里
  //   诬告服务端,并把一批断言 console error = 0 的运行时门连坐打红。
  check(`🔴 ① 配置未知(configUnavailable)**不**报警(启动窗口的假警,不是违约)`,
    flag([q("WK_T1_GENESIS", "Acquire a Genesis Node", "PENDING")], "configUnavailable").length === 0,
    "报了 = 每次冷启动都可能诬告服务端一次");

  // 🔴 只算 PENDING —— 已挣到的奖励不许被指控,更不许顺着报警被藏掉
  for (const status of ["COMPLETED", "CLAIMABLE", "CLAIMED"]) {
    const hit = flag([q("WK_T1_GENESIS", "Acquire a Genesis Node", status)], "marketClosed");
    check(`🔴 ① 已挣到 / 已结束的创世任务(${status})**不**报警`, hit.length === 0,
      `报了 = 顺着它做过滤就会扣掉用户已得奖励`);
  }

  // 两个句柄字段各自独立生效(合取项隔离:只扫 code 会漏掉编号没带 genesis 的命名)
  check(`① 句柄:questCode 命中即算`,
    flag([q("WK_T1_GENESIS_BUY", "Weekly priority", "PENDING")], "soldOut").length === 1, "只看 name = 漏一半");
  check(`① 句柄:name 命中即算`,
    flag([q("WK_T1_007", "购入 Genesis 创世节点", "PENDING")], "soldOut").length === 1, "只看 code = 漏一半");
  check(`① 句柄:大小写不敏感`, looks({ questCode: "wk_genesis", name: "" })
    && looks({ questCode: "", name: "GENESIS NODE" }), "大小写敏感 = 换个写法就静默");
  check(`① 无关任务不报警`,
    flag([q("WK_T1_STAKE", "Stake 500 NEX", "PENDING")], "marketClosed").length === 0, "误报");

  // 🔴 档位台账不许漂:闸日后加第六档,必须有人明确判它算「确定关了」还是「还不知道」。
  //   不焊这条,新档会默默落进 `!KNOWN_BLOCKED.has(block)` 的否定分支 = 静默不报警,
  //   而「新增了一档阻断」恰恰是最该报警的时刻。判据锚在**类型声明本身**,不是我抄的副本。
  // 🔴 必须先 strip 再匹配:类型声明每档后面跟着中文行注释,而 `halted` 那条注释里
  //   写着「熔断(J 域既有闸;见下方注释」—— 里面那个**分号**会把非贪婪的 `[\s\S]*?;`
  //   提前截断,只捞到前 3 档。本条首跑就是这么红的,红的是判据不是台账。
  const declaredKinds = [...strip(readFileSync(path.join(root, "src/store/genesis-config.ts"), "utf8"), true)
    .match(/export type GenesisPurchaseBlock =[\s\S]*?;/)?.[0]
    .matchAll(/"([a-zA-Z]+)"/g) ?? []].map((m) => m[1]);
  check(`🔴 ① 档位台账与 GenesisPurchaseBlock 类型声明一致(声明 ${declaredKinds.length} 档 / 台账 ${ALL_BLOCKS.length} 档)`,
    declaredKinds.length === ALL_BLOCKS.length && declaredKinds.every((k) => ALL_BLOCKS.includes(k)),
    `声明=${declaredKinds.join("/")} 台账=${ALL_BLOCKS.join("/")} —— 新档必须显式归类,不许默默落进「不报警」`);

  // 报警文案必须说清「谁 · 什么档 · 找谁修」,否则日志里没人知道该干嘛
  const line = msg([q("WK_T1_GENESIS", "Acquire a Genesis Node", "PENDING")], "marketClosed");
  check(`① 报警文案带 questCode + 阻断档 + U-16 归属`,
    line.includes("WK_T1_GENESIS") && line.includes("marketClosed") && line.includes("U-16"), line.slice(0, 80));
  // eslint-disable-next-line no-control-regex
  check(`① 报警文案是 ASCII(硬编码中文哨兵扫的是注释外 CJK,中文会被当成漏进 i18n 的文案)`,
    !/[一-鿿㐀-䶿　-〿！-･]/.test(line), line.slice(0, 80));
}

// ══ ② 接线:hero 真把**闸的值**喂进了报警器 ═════════════════════════════════════
// 🔴 「import 了」不算接线,「喂个常量」更不算。
// 🔴 判据必须走**数据流**,不能是「闸的名字和报警判定同时出现在这段里」——
//    第一版就是那么写的,而红测当场把它打红了:`genesisBlock` 本来就躺在 watch 的
//    **源数组**里,把回调里的 `block` 换成字符串常量之后,那个名字**照样在**,门看不见。
//    共现判据在这里必然被绕过,唯一有牙的写法是把「闸 → 回调形参 → 判定实参」串起来验。
/** 顶层逗号切分(括号 / 方括号 / 花括号内的逗号不算)。 */
function splitTop(text) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of text) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** 取 `name(...)` 的实参列表(顶层切分);找不到返回 null。 */
function callArgs(src, name) {
  const at = src.indexOf(name + "(");
  if (at < 0) return null;
  const open = at + name.length;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return splitTop(src.slice(open + 1, i));
  }
  return null;
}
/** 返回接线缺陷清单;空数组 = 接线完好。红测把改坏的 hero 文本喂回它。 */
function wiringViolations(heroSrc) {
  const s = strip(heroSrc, true);
  const out = [];
  const alias = s.match(/const\s*\{[^}]*\bblock\s*:\s*(\w+)[^}]*\}\s*=\s*useGenesisSaleGate\s*\(/)?.[1];
  if (!alias) { out.push("hero 没从 useGenesisSaleGate 解构出 block(它在自判,或压根没接闸)"); return out; }

  const args = callArgs(s, "watch");
  if (!args || args.length < 3 || !/immediate:\s*true/.test(args[2])) {
    out.push("hero 里找不到带 immediate 的 watch(报警器不会在首帧跑)");
    return out;
  }
  const [sourcesArg, callback] = args;
  if (!/^\[[\s\S]*\]$/.test(sourcesArg)) { out.push("watch 源不是数组形态,判据读不出闸在第几位"); return out; }

  // 闸在源数组的第几位 → 回调解构出来的第几个形参就是它的值
  const sources = splitTop(sourcesArg.slice(1, -1));
  const aliasIdx = sources.findIndex((src) => src === alias);
  if (aliasIdx < 0) { out.push(`watch 源里没有闸 ${alias}(闸变了不会重算 = 报警只在首帧准一次)`); return out; }
  const params = callback.match(/^\(\s*\[([^\]]*)\]/)?.[1];
  if (params === undefined) { out.push("watch 回调没按数组解构形参,判据追不到闸的值落到哪个名字"); return out; }
  const bound = splitTop(params)[aliasIdx];
  if (!bound) { out.push(`watch 回调形参少于源(第 ${aliasIdx + 1} 位的闸值被丢掉了)`); return out; }

  // 🔴 闸的值必须**真的**作为第 2 个实参喂进判定 —— 喂常量 / 喂别的名字一律红
  const judge = callArgs(callback, "unclaimableGenesisQuests");
  if (!judge) { out.push("watch 里没调报警判定 unclaimableGenesisQuests"); return out; }
  if (judge.length < 2) out.push("报警判定少传了阻断档实参");
  else if (judge[1] !== bound && judge[1] !== alias) {
    out.push(`报警判定的阻断档实参是 \`${judge[1]}\`,不是闸的值 \`${bound}\`(喂常量 = 报警器恒哑 / 恒响)`);
  }
  if (!/console\.error\s*\(/.test(callback)) out.push("watch 里没有 console.error(运行时探针的 error=0 断言收不到信号)");
  return out;
}
{
  const heroSrc = readFileSync(path.join(root, HERO), "utf8");
  const bad = wiringViolations(heroSrc);
  check(`🔴 ② hero 把闸的值真喂进了报警器`, bad.length === 0, bad.join(" ; "));
  check(`② 纯判定模块被 hero import(否则报警器是死代码)`,
    strip(heroSrc, true).includes("@/lib/quest-genesis-tripwire"), "没 import = ① 那堆行为断言在测一个没人用的函数");
}

// ══ ③ 反向钉:任务面新增「点进创世」的入口必须问闸 ═════════════════════════════
// 🔴 判据**不禁止**跳转 —— U-16 落地后,可购买态从任务卡跳创世是对的产品行为。
//    禁的是「跳转但不问闸」:那正是原缺陷的形状(领到任务 → 点进去按钮是灰的)。
// 🔴 任务面**从磁盘算**,不写死清单:谁 import 了周任务 store / quest 契约谁就在面里。
function questSurface(files) {
  return files.filter((f) => {
    const s = strip(readFileSync(path.join(root, f), "utf8"), true);
    return /from\s+"(@\/store\/weekly-quest|@\/api\/quest-api|\.\/quest-api)"/.test(s);
  });
}
/** 返回「跳创世却没问闸」的文件;空数组 = 干净。 */
function unqatedGenesisEntries(files) {
  const out = [];
  for (const f of files) {
    const s = strip(readFileSync(path.join(root, f), "utf8"), true);
    const jumps = /navTo\s*\(\s*[`"']\/genesis|href\s*[:=]\s*[`"']\/genesis|url\s*:\s*[`"']\/pages\/genesis/.test(s);
    if (!jumps) continue;
    if (!/useGenesisSaleGate|showUrgency|genesisUrgencyOk/.test(s)) out.push(f);
  }
  return out;
}
{
  const files = allSources();
  check(`③ 扫描面非空(实测 ${files.length} 个源文件)`, files.length > 100, `只扫到 ${files.length} 个`);
  const surface = questSurface(files);
  // 🔴 0 命中 = 判据失效,不是「很干净」(取材面塌了的话下面那条恒绿)
  check(`🔴 ③ 任务面非空(实测 ${surface.length} 个文件 import 了周任务 store / quest 契约)`,
    surface.length >= 3, `${surface.length} 个 —— 取材面塌了,下面那条会恒绿`);
  const bad = unqatedGenesisEntries(surface);
  check(`🔴 ③ 任务面里跳创世的入口都问了闸(实测越界 ${bad.length} 处)`, bad.length === 0, bad.join(" | "));
  check(`③ hero 在任务面里(接线判据与反向钉扫的是同一个面)`, surface.includes(HERO),
    `hero 不在面里 = ③ 与 ② 各看各的`);
}

// ══ ④ 红测:每条判据把改坏的文本喂回它自己 ═════════════════════════════════════
// 🔴 纪律:**先证变异真的改到了东西**(mutated !== original),再看判据转不转红。
//    否则「靶没进分支」会伪装成「门没红」,而两者的现象一模一样。
{
  const pureSrc = readFileSync(path.join(root, PURE), "utf8");
  const heroSrc = readFileSync(path.join(root, HERO), "utf8");
  const mutate = (label, src, from, to) => {
    const next = src.replace(from, to);
    check(`红测前置:变异「${label}」真的改到了源码`, next !== src, "锚点没命中 = 下面那条红测在测原样代码");
    return next;
  };

  // ④a 报警判定被掏空 → ① 必须转红
  const gutted = mutate("报警恒返回空", pureSrc,
    /if \(!genesisBlockIsKnownUnavailable\(block\)\) return \[\];/,
    "if (!genesisBlockIsKnownUnavailable(block)) return [];\n  return [];");
  const gutMod = await loadPure(gutted);
  check(`🔴 红测:掏空报警判定后 ① 必须转红`,
    gutMod.unclaimableGenesisQuests([q("WK_GENESIS", "Genesis", "PENDING")], "marketClosed").length === 0
    && pure.unclaimableGenesisQuests([q("WK_GENESIS", "Genesis", "PENDING")], "marketClosed").length === 1,
    "掏空后仍报警 = ① 在测别的东西");

  // ④b status 收窄被放宽 → 「已挣到的不报警」必须转红(合取项单独隔离)
  const widened = mutate("status 过滤放宽到全档", pureSrc,
    /quest\.status === "PENDING" && /, "");
  const wideMod = await loadPure(widened);
  check(`🔴 红测:放宽 status 过滤后「CLAIMABLE 不报警」必须转红`,
    wideMod.unclaimableGenesisQuests([q("WK_GENESIS", "Genesis", "CLAIMABLE")], "marketClosed").length === 1,
    "放宽了还不红 = 那条断言恒真,拦不住「藏掉已得奖励」这个更坏的改法");

  // ④b2 拿掉「只认确定阻断」的收窄 → 「configUnavailable 不报警」必须转红
  //     (与 ④b 分开:那条测的是 status 收窄,这条测的是 block 收窄,合取项逐个隔离)
  const anyBlock = mutate("阻断档收窄被拿掉(退回只判 null)", pureSrc,
    /if \(!genesisBlockIsKnownUnavailable\(block\)\) return \[\];/, "if (block === null) return [];");
  const anyMod = await loadPure(anyBlock);
  check(`🔴 红测:拿掉「只认确定阻断」后「configUnavailable 不报警」必须转红`,
    anyMod.unclaimableGenesisQuests([q("WK_GENESIS", "Genesis", "PENDING")], "configUnavailable").length === 1
    && pure.unclaimableGenesisQuests([q("WK_GENESIS", "Genesis", "PENDING")], "configUnavailable").length === 0,
    "拿掉了还绿 = 那条断言恒真,启动窗口的假警拦不住");
  check(`🔴 红测:同一变异下四档确定阻断仍必须报警(不能靠「全都不报」来通过上一条)`,
    KNOWN_BLOCKED.every((b) => anyMod.unclaimableGenesisQuests([q("WK_GENESIS", "Genesis", "PENDING")], b).length === 1),
    "变异把报警整个关掉了 = 上一条的红是假红");

  // ④c 句柄只剩 questCode → 「name 命中」必须转红
  const codeOnly = mutate("句柄砍掉 name", pureSrc,
    / \|\| \/genesis\/i\.test\(quest\.name\)/, "");
  const codeMod = await loadPure(codeOnly);
  check(`🔴 红测:砍掉 name 句柄后「name 命中即算」必须转红`,
    codeMod.unclaimableGenesisQuests([q("WK_T1_007", "购入 Genesis 创世节点", "PENDING")], "soldOut").length === 0,
    "砍了还绿 = 那条句柄断言从来没生效");

  // ④d 接线判据 —— 三种拆法逐个隔离
  check(`🔴 红测:hero 摘掉闸(不再解构 block)→ ② 必须转红`,
    wiringViolations(mutate("hero 摘闸", heroSrc, /const \{ block: genesisBlock \} = useGenesisSaleGate\(\);/, ""))
      .some((v) => v.includes("没从 useGenesisSaleGate 解构")), "摘闸没红 = ② 空转");
  // 🔴 红测的期望值钉在**注入的内容**上,不钉在判据的措辞上 —— 这条本身就栽过一次:
  //    收紧判据时改了报错文案,红测还在找旧措辞,于是「判据明明红了」被报成「红测没红」。
  //    钉内容(注入的那个常量必须出现在报错里)则改措辞不会让它静默失效。
  check(`🔴 红测:hero 改喂常量(watch 不再用闸的值)→ ② 必须转红`,
    wiringViolations(mutate("hero 喂常量", heroSrc, /unclaimableGenesisQuests\(snap\?\.quests \?\? \[\], block\)/,
      'unclaimableGenesisQuests(snap?.quests ?? [], "marketClosed")'))
      .some((v) => v.includes('"marketClosed"')), "喂常量没红 = 报警器可以恒哑而门看不见");
  check(`🔴 红测:闸从 watch 源里摘掉(报警只在首帧准一次)→ ② 必须转红`,
    wiringViolations(mutate("闸不在 watch 源里", heroSrc, /\[\(\) => wq\.snapshot, genesisBlock\]/, "[() => wq.snapshot]"))
      .some((v) => v.includes("genesisBlock")), "摘掉源没红 = 创世中途关闭时报警不会重算");
  check(`🔴 红测:watch 回调形参少于源(闸的值被丢掉)→ ② 必须转红`,
    wiringViolations(mutate("回调形参丢掉闸值", heroSrc, /\(\[snap, block\]\) =>/, "([snap]) =>"))
      .some((v) => v.includes("形参")), "形参丢了没红 = 判据追不到值落在哪也算通过");
  check(`🔴 红测:hero 去掉 console.error → ② 必须转红`,
    wiringViolations(mutate("hero 去掉 console.error", heroSrc, /console\.error\(/, "void ("))
      .some((v) => v.includes("console.error")), "去掉了还绿 = 报警响了也没人收得到");
  // 🔴 反向:注释里提一嘴不算接线(strip 必须真的在起作用)
  check(`🔴 红测:把接线整段变成注释后 ② 必须转红`,
    wiringViolations(heroSrc.replace(/const \{ block: genesisBlock \} = useGenesisSaleGate\(\);/,
      "// const { block: genesisBlock } = useGenesisSaleGate();"))
      .some((v) => v.includes("没从 useGenesisSaleGate 解构")), "注释掉还绿 = strip 没生效,写在注释里就能骗过门");

  // ④e 反向钉 —— 造一个「跳创世但不问闸」的任务面文件
  const fake = "src/__redtest__/quest-jump.vue";
  const fakeGated = `<script setup lang="ts">
import { useWeeklyQuest } from "@/store/weekly-quest";
import { useGenesisSaleGate } from "@/composables/use-genesis-sale-gate";
navTo("/genesis");
</script>`;
  const fakeUngated = fakeGated.replace(/import \{ useGenesisSaleGate \}.*\n/, "");
  // 直接把判据的两个纯函数喂改坏的文本(不落盘,避免污染工作树)
  const probe = (src) => {
    const s = strip(src, true);
    const inSurface = /from\s+"(@\/store\/weekly-quest|@\/api\/quest-api|\.\/quest-api)"/.test(s);
    const jumps = /navTo\s*\(\s*[`"']\/genesis|href\s*[:=]\s*[`"']\/genesis|url\s*:\s*[`"']\/pages\/genesis/.test(s);
    const gated = /useGenesisSaleGate|showUrgency|genesisUrgencyOk/.test(s);
    return { inSurface, jumps, ungated: inSurface && jumps && !gated };
  };
  check(`红测前置:构造的 ${fake} 确实落在任务面里且确实跳创世`,
    probe(fakeUngated).inSurface && probe(fakeUngated).jumps, "靶没进分支 = 下面那条恒绿");
  check(`🔴 红测:任务面里「跳创世不问闸」必须转红`, probe(fakeUngated).ungated, "放行了 = ③ 拦不住原缺陷复发");
  check(`🔴 红测:同一文件问了闸就必须转绿(闸不是单向焊死,U-16 落地后可购买态跳转是对的)`,
    !probe(fakeGated).ungated, "问了闸还红 = 门禁止了正确的产品行为");
  check(`红测:不在任务面的文件不受本钉约束`, !probe(`<script setup lang="ts">\nnavTo("/genesis");\n</script>`).ungated,
    "误伤 = 创世页自己跳自己也会被判红");

  // 🔴 还原证明:上面所有变异都只在内存里,真源码必须仍然是绿的
  check(`🔴 红测收尾:真源码未被改动(还原后 ①② 仍绿)`,
    pure.unclaimableGenesisQuests([q("WK_GENESIS", "Genesis", "PENDING")], "marketClosed").length === 1
    && wiringViolations(readFileSync(path.join(root, HERO), "utf8")).length === 0,
    "真源码脏了 = 红测把工作树改坏了");
}

console.log(`\n${pass} pass / ${fail} fail(样本:4 档确定阻断 + 1 档「不知道」 × 4 种 status 固定靶 · 档位台账锚类型声明 · 2 个句柄字段 · 接线数据流 · 全 src 派生任务面 · 15 条红测各自先证变异生效)`);
process.exit(fail === 0 ? 0 : 1);
