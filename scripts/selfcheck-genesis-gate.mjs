#!/usr/bin/env node
// 创世「购买可用性单一派生」的机器门(规格 FEAT-GEN10 ④)— node 直跑:
//   node scripts/selfcheck-genesis-gate.mjs
//
// ══ 本门的来历,以及第一版为什么是假的 ═══════════════════════════════════════
//
// v1(2026-08-05 上午):此前 composable 注释里写着这个文件名,而**文件根本不存在**。
//   补建之后,判据是「文件里同时出现 return "marketClosed"/"halted"/"soldOut"/"preSale"
//   四句才算有一套判定」。当天下午独立验收**实测构造了 6 种绕法,全部放行**:
//     ① `if (!loaded || marketOpenState === "closed") return false;` ← **上一轮那条缺陷的原样复发**
//     ② 只抄两档 ③ 换单引号 ④ 用模板字面量 ⑤ 写成三元链 ⑥ 先赋值再 return
//   外加:文件清单写死 7 个,**新文件根本不扫**,而消费面是开放集合。
//   也就是说 v1 拦不住它唯一该拦的那种错误 —— 一个「看起来像门」的东西。
//
// v2(本文件)针对性重建:
//   🔴 **两条正交判据**,因为绕法①**不含任何档位字面量**,只靠扫字面量必漏:
//      ④a 产出面:任一档位值在纯函数外**被产出**即红(不管什么引号 / 三元 / 先赋值后返回);
//      ④b 输入面:决策输入(marketOpenState / loaded)只许在白名单文件里被**比较**——
//          绕法①正是「不产出档位值、直接拿输入自己判」,只有这条抓得住。
//   🔴 扫**全 src/**,不写死文件清单;扫到 0 个文件直接判红(空集会让全称判据恒真)。
//   🔴 每条判据配**真**红测:把改坏的文本**喂回该条判据本身**,看它转不转红 ——
//      v1 的红测写成 `!(s.replaceAll("X","x").includes("X"))`,那是**恒真**的
//      (换掉 X 之后当然找不到 X),拿空字符串、拿一首诗跑都 true,从未喂回任何判据。
//
// 方法:行为断言用 esbuild 载**真纯函数**跑;结构断言跑在剥注释后的正主源码上。
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { atAliasResolver } from "./lib/at-alias.mjs";
import { strip } from "./lib/strip-code.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");

const bundle = await build({
  stdin: {
    contents: `export { genesisPurchaseBlock, genesisSecondaryBlock, genesisShowsUrgency } from "@/store/genesis-config";`,
    resolveDir: root, loader: "ts",
  },
  bundle: true, write: false, format: "esm",
  plugins: [
    {
      name: "runtime-stub",
      setup(b) {
        b.onResolve({ filter: /^@\/api\/runtime$/ }, () => ({ path: "runtime", namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
          // 🔴 桩必须跟上真 runtime 的导出面:genesis-config.ts 2026-08-13 起也 import
          // remoteApiEnabled(mock 模式不打服务端),桩少一个导出 esbuild 直接 build failed、
          // 整道门崩掉——表现成「门失败」,但根本没跑到判据。
          contents: "export const genesisApi = Object.freeze({}); export const remoteApiEnabled = false;",
          loader: "js",
        }));
      },
    },
    { name: "alias", setup(b) { b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "selfcheck-genesis-gate")); } },
  ],
});
const { genesisPurchaseBlock, genesisSecondaryBlock, genesisShowsUrgency } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64")
);

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

/** 递归列出 src 下所有 .ts/.vue(**不写死清单**:消费面是开放集合,新文件必须自动进扫描面)。 */
function allSources(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) allSources(p, out);
    else if (/\.(ts|vue)$/.test(name)) out.push(path.relative(root, p).replaceAll("\\", "/"));
  }
  return out;
}

console.log("selfcheck-genesis-gate — 购买可用性必须只有一处判定(v2:v1 被实测绕过 6 种后重建)");

const KINDS = ["marketClosed", "halted", "soldOut", "preSale", "configUnavailable"];
const OWNER = "src/store/genesis-config.ts";     // 判定本体唯一宿主
/** 允许比较决策**输入**的文件:本体 + 它的唯一消费入口。别处比较 = 自己判了一套。 */
const INPUT_ALLOW = new Set([
  OWNER,
  "src/composables/use-genesis-sale-gate.ts",
  // Protocol validation may compare the enum with its legal values; it does
  // not decide whether a purchase is allowed.
  "src/api/genesis-api.ts",
]);

// ── ① 优先级链:**用行为证明**,不读源码顺序 ─────────────────────────────────
const FUTURE = 4102444800000;
const base = { configLoaded: true, marketOpenState: "open", halted: false, remaining: 10, saleStartAt: null, now: 1_700_000_000_000 };
const b = (o) => genesisPurchaseBlock({ ...base, ...o });
{
  const cases = [
    ["配置未知压过全部", { configLoaded: false, marketOpenState: "closed", halted: true, remaining: 0, saleStartAt: FUTURE }, "configUnavailable"],
    ["市场关闭压过熔断/售罄/预售", { marketOpenState: "closed", halted: true, remaining: 0, saleStartAt: FUTURE }, "marketClosed"],
    ["熔断压过售罄/预售", { halted: true, remaining: 0, saleStartAt: FUTURE }, "halted"],
    ["售罄压过预售", { remaining: 0, saleStartAt: FUTURE }, "soldOut"],
    ["只剩预售未到", { saleStartAt: FUTURE }, "preSale"],
    ["全清 → 可购买", {}, null],
  ];
  for (const [label, input, want] of cases) {
    check(`🔴 ① ${label}(期望 ${want ?? "null"})`, b(input) === want, `实得 ${b(input)}`);
  }
  check(`① 售罄判据认 <=0 而非 ===0`, b({ remaining: -1 }) === "soldOut", `实得 ${b({ remaining: -1 })}`);
}

// ── ② 二级市场 ──────────────────────────────────────────────────────────────
{
  const s = (o) => genesisSecondaryBlock({ loaded: true, marketOpenState: "open", now: base.now, ...o });
  check(`🔴 ② 二级不受主售售罄影响`, s({}) === null, `实得 ${s({})}`);
  check(`🔴 ② 二级照样被市场关闭拦`, s({ marketOpenState: "closed" }) === "marketClosed", `实得 ${s({ marketOpenState: "closed" })}`);
  check(`🔴 ② 二级照样被配置未知拦`, s({ loaded: false }) === "configUnavailable", `实得 ${s({ loaded: false })}`);
}

// ── ③ 紧迫感闸 ──────────────────────────────────────────────────────────────
{
  const want = { null: true, preSale: true, marketClosed: false, halted: false, soldOut: false, configUnavailable: false };
  for (const [k, expect] of Object.entries(want)) {
    const v = k === "null" ? null : k;
    check(`③ 紧迫感:${k} → ${expect ? "允许" : "禁止"}`, genesisShowsUrgency(v) === expect, `实得 ${genesisShowsUrgency(v)}`);
  }
}

// ══ ④a 产出面:档位值只许在本体里被产出 ══════════════════════════════════════
/**
 * 判「产出」而非「出现」。**产出** = 该字面量不是比较运算的操作数,也不是 case 标签。
 * 覆盖 v1 漏掉的:单引号 / 模板字面量 / 三元链 / 先赋值再 return / 只抄两档。
 */
function producedKinds(src) {
  const hits = [];
  for (const k of KINDS) {
    // 三种引号形态各扫一遍
    const re = new RegExp(`(['"\`])${k}\\1`, "g");
    let m;
    while ((m = re.exec(src)) !== null) {
      const before = src.slice(Math.max(0, m.index - 40), m.index);
      const after = src.slice(m.index + m[0].length, m.index + m[0].length + 6);
      const isCompare = /[=!]==?\s*$/.test(before) || /^\s*[=!]==?/.test(after) || /\bcase\s+$/.test(before)
        || /\.includes\(\s*$/.test(before) || /\bhas\(\s*$/.test(before)
        // 🔴 Vue 模板属性绑定 `v-else-if="preSale"` / `:foo="preSale"` 是**引用同名变量**,
        //   不是产出该字符串。首跑就被它误报(单个 `=` 前面是字母,与 `===` 区分开)。
        || /[\w\-\]]=$/.test(before);
      if (!isCompare) hits.push(k);
    }
  }
  return [...new Set(hits)];
}
{
  const files = allSources();
  check(`④ 扫描面非空(实测 ${files.length} 个源文件;写死清单会漏掉新文件)`, files.length > 100, `只扫到 ${files.length} 个`);
  const offenders = files
    .filter((f) => f !== OWNER)
    .map((f) => [f, producedKinds(strip(readFileSync(path.join(root, f), "utf8"), true))])
    .filter(([, k]) => k.length > 0);
  check(`🔴 ④a 档位值只在本体被产出(实测越界 ${offenders.length} 处)`, offenders.length === 0,
    offenders.slice(0, 3).map(([f, k]) => `${f}:${k.join("/")}`).join(" | "));
  check(`④a 本体自己确实产出全部 ${KINDS.length} 档(否则判据在跟空集比)`,
    producedKinds(strip(readFileSync(path.join(root, OWNER), "utf8"), true)).length === KINDS.length,
    `本体只产出 ${producedKinds(strip(readFileSync(path.join(root, OWNER), "utf8"), true)).length} 档`);
}

// ══ ④b 输入面:决策输入只许在白名单文件里被比较 ══════════════════════════════
// 🔴 绕法① `if (!loaded || marketOpenState === "closed") return false;` **不含任何档位值**,
//    只有这条判据抓得住 —— 它拿决策**输入**自己判了一套。
{
  const files = allSources();
  const offenders = [];
  for (const f of files) {
    if (INPUT_ALLOW.has(f)) continue;
    const src = strip(readFileSync(path.join(root, f), "utf8"), true);
    // 比较 marketOpenState,或把 .loaded 当布尔条件用(!x / x && / x ||)
    if (/marketOpenState\s*[=!]==/.test(src)) offenders.push(`${f}:marketOpenState 比较`);
    if (/[!(]\s*\w+\.loaded\b|\w+\.loaded\s*(&&|\|\|)/.test(src)) offenders.push(`${f}:loaded 当条件`);
  }
  check(`🔴 ④b 决策输入只在 ${INPUT_ALLOW.size} 个白名单文件里被比较(实测越界 ${offenders.length} 处)`,
    offenders.length === 0, offenders.slice(0, 3).join(" | "));
}

// ══ ⑤ 接线 + 基数台账 ═══════════════════════════════════════════════════════
{
  const CONSUMERS = [
    ["src/pages/genesis/genesis.vue", "useGenesisSaleGate"],
    ["src/components/store/genesis-showcase-card.vue", "useGenesisSaleGate"],
    ["src/pages/genesis/marketplace.vue", "useGenesisSaleGate"],
    ["src/components/genesis/purchase-sheet.vue", "useGenesisSaleGate"],
    ["src/store/genesis.ts", "genesisPurchaseBlock"],
    // 观测消费者(非闸):周任务的报警器也必须从**本单源**取判定,不许自己读 config 再判一套。
    ["src/components/home/weekly-quest-hero.vue", "useGenesisSaleGate"],
  ];
  for (const [f, sym] of CONSUMERS) {
    check(`⑤ ${f.split("/").pop()} 接线到单源`, strip(readFileSync(path.join(root, f), "utf8"), true).includes(sym), "没接线 = 它在自己判");
  }
  // 🔴 基数台账:门都在遍历现存成员,**删掉一个消费者没有任何遍历会走到它**。
  const actual = allSources().filter((f) => strip(readFileSync(path.join(root, f), "utf8"), true).includes("useGenesisSaleGate")).length;
  // 基数台账(改动数字必须同时说明原因):
  //   genesis.vue · genesis-showcase-card.vue · marketplace.vue · purchase-sheet.vue
  //   · quick-action-row.vue · holder.vue · my-token-card.vue · composable 自身定义处 = 8
  //   🔴 首跑时我写的是 6 —— 因为后来给购买半屏也接了闸却忘了同步这个数。
  //   基数台账正是为了逼出这种「加了消费者没登记 / 摘了闸没人知道」。
  //   2026-08-05 7→8:my-token-card.vue 接闸(挂单出售是规格 ② 点名要锁的入口,
  //   独立验收唯一存活 P0 —— 之前它一次都没问过闸,弹「已挂单」成功却产出无人能接的死单)。
  //   2026-08-05 8→9:nova-bubble.vue 接闸(P1-2:「席位不多了·抢席位」推送此前对闸
  //   零引用,关闭态照发紧迫感;现推送前问 showUrgency,闸住换质押位文案)。
  //   2026-08-05 9→10:weekly-quest-hero.vue 接闸(独立 critic Q1:周任务在关闭态仍派
  //   「买创世」,用户领到不可能完成的任务、点进去按钮是灰的 —— 紧迫感的入口从创世页
  //   挪到了任务页,规格只禁了倒计时/名额两种形态,没覆盖任务系统这一面)。
  //   ⚠️ 2026-08-13 10→9:weekly-quest-hero.vue **一度不再接闸** —— 不是有人手滑摘的,
  //   是周任务整体改成了**服务端下发**(`questApi.state()`),该组件零创世引用,
  //   客户端不再决定「派不派这个任务」,那条保护随之失去主人。
  //   ✅ 2026-08-13 9→10:同日定责并接回,但**接回的是报警不是闸**,别把它读成旧闸复活:
  //     · 过滤(派不派)归**服务端**——交接书 U-16。客户端做不了:任务的唯一句柄
  //       questCode 在后台 H3 是运营手输的自由文本(admin-ops h3-quest-events.tsx
  //       mission-create:`String(bv.missionCode).trim()`,只要求「编号英文唯一」),
  //       没有枚举也没有分类字段;而客户端猜错的代价**不对称** —— 藏掉一条 CLAIMABLE
  //       的创世任务 = 扣掉用户已经挣到的奖励,比让他看见一条暂时做不了的任务更坏。
  //     · 客户端留**观测**:hero 把本闸的 block 喂给 `lib/quest-genesis-tripwire.ts`,
  //       服务端派了 PENDING 的创世任务而闸判阻断 → console.error;运行时探针统一断言
  //       app console error = 0,所以报警一响那批门自动转红。
  //   🔴 于是这个数字今天的含义**不再齐整**:10 个消费者里 9 个是真闸,第 10 个
  //     (weekly-quest-hero.vue)只是报警器。数字对不代表保护回来了 —— U-16 落地前,
  //     「关闭态不派买创世」这条不变量**仍然没有任何执行方**,客户端只能看见并喊。
  //   机器门:`scripts/selfcheck-quest-genesis-tripwire.mjs`(报警判定 + 接线数据流 +
  //     「任务面新增跳创世入口必须问闸」的反向钉,13 条红测)。
  const EXPECTED_GATE_CONSUMERS = 10;
  check(`🔴 ⑤ 闸消费者基数 = ${EXPECTED_GATE_CONSUMERS}(实测 ${actual})`, actual === EXPECTED_GATE_CONSUMERS,
    `数量变了就同步改这个数并说明:新增了消费者,还是有人把闸摘了`);
}

// ══ ⑥ 紧迫感元素受闸 —— **逐渲染点**判,不是「文件里出现过就算」 ═══════════════
// v1 是文件级:只要文件里有一次 showUrgency 就放行,第三处 tier.left 不接闸照样绿。
/**
 * 🔴 判据是**表达式级**,不是文件级,也不能是死板的单行级:
 *   - 文件级(v1)太松:文件里出现过一次 showUrgency 就放行,第三处不接闸照样绿;
 *   - 单行级(v2 首跑)太紧:`const x = computed(() =>` 与闸在**不同行**,
 *     Vue 模板里定义处与渲染处也常常分离 —— 首跑就把两处正确实现误报了。
 *   折中:取该行**上下各 3 行**的窗口(足够覆盖一个多行表达式或一个模板元素),
 *   窗口内必须出现闸。窗口大小写死在这里,改它要同时改红测。
 */
const URGENCY_WINDOW = 3;
function urgencySitesUngated(src) {
  const lines = src.split(/\r?\n/);
  const bad = [];
  lines.forEach((line, i) => {
    // 🔴 用**带域前缀的完整键路径**,不用裸子串:`notHolderBody` 会误命中变量名
    //   `notHolderBodyText`(那是渲染点,闸在它的定义里),把正确实现判成漏网。首跑即暴露。
    if (!/genesis\.tier\.left|genesis\.leftSuffix|home\.quickGenesisLeft|genesisHolder\.notHolderBody|store\.genesisCardLeft/.test(line)) return;
    if (/messages\//.test(line)) return;
    const win = lines.slice(Math.max(0, i - URGENCY_WINDOW), i + URGENCY_WINDOW + 1).join("\n");
    if (!/showUrgency|genesisUrgencyOk/.test(win)) bad.push(`L${i + 1}: ${line.trim().slice(0, 60)}`);
  });
  return bad;
}
{
  const RENDER_FILES = [
    "src/pages/genesis/genesis.vue", "src/components/store/genesis-showcase-card.vue",
    "src/components/home/quick-action-row.vue", "src/pages/genesis/holder.vue",
  ];
  for (const f of RENDER_FILES) {
    const bad = urgencySitesUngated(strip(readFileSync(path.join(root, f), "utf8"), true));
    check(`🔴 ⑥ ${f.split("/").pop()} 的每个「余席」渲染点都在同一表达式内受闸`, bad.length === 0, bad.join(" | "));
  }
  const g = strip(readFileSync(path.join(root, "src/pages/genesis/genesis.vue"), "utf8"), true);
  // Genesis remote no longer synthesizes a social-proof stream.  The page is
  // deliberately empty until server transactions/listings arrive; accepting
  // the old emitSocial/tickSales shape here would bless fake FOMO in a closed
  // market.  Keep this harness aligned to the authority contract instead of
  // requiring a dead local timer to mention the sale gate.
  check(`🔴 ⑥ 社会证明播报只读服务端事实`,
    !/emitSocial|BUYER_NAMES|LIVE_MARKET|scheduleFomo|genFomoSale/.test(g),
    "Genesis page still contains a local social-proof generator");
  const genesisStore = strip(readFileSync(path.join(root, "src/store/genesis.ts"), "utf8"), true);
  const tickBody = genesisStore.match(/function tickSales\(\)[\s\S]{0,520}/)?.[0] ?? "";
  const remoteTickBranch = tickBody.match(/if \(remoteApiEnabled\)\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  check(`🔴 ⑥ 已售数推进只接受服务端快照`,
    /if \(remoteApiEnabled\)[\s\S]{0,120}syncRemote\(\)[\s\S]{0,40}return;/.test(tickBody)
      && !/Math\.random/.test(remoteTickBranch),
    "关闭态/远端仍由客户端自增已售数");
  check(`🔴 ⑥ dock 取色不再按 remaining 判`, !g.includes("remaining.value > 0"), "还有取色点按老条件走");
}

// ══ 红测自证:每条结构判据**把改坏的文本喂回它自己** ═════════════════════════
// 🔴 v1 的红测是 `!(s.replaceAll("X","x").includes("X"))` —— **恒真**,拿空字符串、
//    拿一首诗跑都 true,从未喂回任何判据。下面每条都真的喂回去。
{
  // ④a:6 种绕法逐个隔离,每种都必须被认出来
  const evasions = {
    "只抄两档": `if (m === "closed") return "marketClosed";\nif (r <= 0) return "soldOut";`,
    "单引号": KINDS.map((k) => `return '${k}';`).join("\n"),
    "模板字面量": KINDS.map((k) => "return `" + k + "`;").join("\n"),
    "三元链": `return c ? "marketClosed" : h ? "halted" : "soldOut";`,
    "先赋值再return": `const r = "marketClosed"; return r;`,
  };
  for (const [label, code] of Object.entries(evasions)) {
    check(`红测自证:④a 认得出绕法「${label}」`, producedKinds(code).length > 0, "放行了 = 门有洞");
  }
  check(`红测自证:④a 不把 case 映射误判成产出`,
    producedKinds(KINDS.map((k) => `case "${k}": return t.x;`).join("\n")).length === 0, "误报文案映射");
  check(`红测自证:④a 不把 === 比较误判成产出`,
    producedKinds(`if (b === "marketClosed") show();`).length === 0, "误报比较");
  // ④b:绕法① —— 不含任何档位值的手写判定
  const evasion1 = `if (!cfg.loaded || cfg.config.marketOpenState === "closed") return false;`;
  check(`🔴 红测自证:④b 认得出绕法①(上一轮缺陷的原样复发,**v1 放行的那个**)`,
    /marketOpenState\s*[=!]==/.test(evasion1) || /[!(]\s*\w+\.loaded\b/.test(evasion1), "④b 也漏了 = 两条判据都白建");
  // ⑥:把闸从渲染行上摘掉,该条必须转红
  const gated = `<text v-if="showUrgency">{{ fmt(t.genesis.tier.left, { n }) }}</text>`;
  const ungated = gated.replace(/ v-if="showUrgency"/, "");
  check(`红测自证:⑥ 摘掉行内闸后必须转红`,
    urgencySitesUngated(gated).length === 0 && urgencySitesUngated(ungated).length === 1,
    `受闸态 ${urgencySitesUngated(gated).length} 条 / 摘闸态 ${urgencySitesUngated(ungated).length} 条`);
}

// ══ ⑦ 「该有的在不在」—— store 每个改变市场参与状态的 action 都必须问闸 ═══════════
// 🔴 前六条判据全部只看「已经引用了闸的地方用得对不对」,对「本该引用却一个符号都
//    不出现」的文件恒真 —— listNode(独立验收唯一存活 P0)正是从这个正交维度掉出去的:
//    它不产出档位值、不比较 marketOpenState、不引用 useGenesisSaleGate,①④⑤⑥ 对它全绿。
// 🔴 判据锚点 = store 末尾 `return { … }` 那份**代码里已存在的显式清单**,不是自造的
//    模式扫描(第一版按「函数体有没有写状态关键词」筛,静默漏掉了 listNode 本身)。
//    新增导出成员必须写进那一处 → 门一定看得见;台账写在本脚本里,删成员改名都会红。
{
  const storeSrc = readFileSync(path.join(root, "src/store/genesis.ts"), "utf8");

  // 台账:必须问闸的 action(改变持有/席位/挂单状态的用户入口)。
  const MUST_ASK = ["purchase", "listNode", "acquireSecondary"];
  // 豁免台账 —— 每条必须写理由,留白等于没想过:
  const EXEMPT = {
    cancelListing: "离场手段,非市场参与入口;关闭态拦撤单=没收用户处置权(规格②只锁「购买/挂单」)",
    tickSales: "模拟他人成交的世界演进,非本人动作;闸在用户入口不在时间推进",
    bindAccount: "账号切换的数据装载,不产生交易",
    setNexListed: "上所状态由运营侧驱动,与购买可用性正交",
    syncRemote: "只刷新服务端权威快照,不创建购买、持有或挂单状态",
  };
  const READONLY = ["remaining", "soldPct", "tierRemaining", "emissionSnapshot", "reservedAllocationNEX"];
  const BLOCK_CALL = /genesisPurchaseBlock|genesisSecondaryBlock/;

  const exportedMembers = (src) => {
    const m = src.match(/return \{\s*\n\s*totalSlots[\s\S]*?\n\s*\};/);
    if (!m) return null; // 导出块没了 = 判据失效,必红
    const names = [...new Set([...m[0].matchAll(/\b([a-zA-Z_]\w*)\b/g)].map((x) => x[1]))];
    return names.filter((n) => n !== "return");
  };
  // 🔴 必须同时认 `function f(){}` 与 `const f = () => {}` 两种形态(独立审计 P1):
  //   上一版只认 function 声明 —— 有人写 `const mintFree = () => { myOwned.value += 1 }`
  //   并加进 return 块,门**静默豁免**(bodyOf 返回 null → 不在 fnLike 里 → 台账不查它)。
  //   这与「判据锚在已存在的显式清单上」不冲突:清单仍是 return 块,这里只是把
  //   「怎么算一个函数」认全,不认全等于清单里有成员被悄悄跳过。
  const DECL = (n) => new RegExp(`^\\s*(?:async\\s+)?function\\s+${n}\\b|^\\s*const\\s+${n}\\s*=\\s*(?:async\\s*)?(?:\\(|function\\b)`);
  const ANY_DECL = /^\s*(?:async\s+)?function\s+\w+|^\s*const\s+\w+\s*=\s*(?:async\s*)?(?:\(|function\b)/;
  const bodyOf = (src, name) => {
    const lines = src.split(/\r?\n/);
    const re = DECL(name);
    const start = lines.findIndex((l) => re.test(l));
    if (start < 0) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (ANY_DECL.test(lines[i])) { end = i; break; }
    }
    return lines.slice(start, end).join("\n");
  };
  const violations = (src) => {
    const out = [];
    const exported = exportedMembers(src);
    if (!exported || exported.length < 10) return ["判据失效:store 导出块解析不出成员"];
    for (const name of MUST_ASK) {
      const body = bodyOf(src, name);
      if (body === null) { out.push(`台账登记的 ${name} 不存在(台账已漂)`); continue; }
      // 🔴 必须剥注释再判(本条红测自己抓出来的洞):listNode 的注释里写着
      //   「用 genesisSecondaryBlock 而非 genesisPurchaseBlock」—— 不剥的话,一个**零调用**
      //   的函数只要注释里提一嘴闸的名字就能骗过判据。全仓共用 strip 正是为了这个。
      if (!BLOCK_CALL.test(strip(body, true))) out.push(`${name}() 改变持有状态却没问闸`);
    }
    const known = new Set([...MUST_ASK, ...Object.keys(EXEMPT), ...READONLY]);
    for (const n of exported.filter((n) => bodyOf(src, n) !== null)) {
      if (!known.has(n)) out.push(`导出函数 ${n} 未在门台账登记(标 MUST_ASK / EXEMPT+理由 / READONLY)`);
    }
    return out;
  };

  const real = violations(storeSrc);
  check(`🔴 ⑦ 改变市场参与状态的 action 全部问闸(MUST_ASK ${MUST_ASK.length} · 豁免 ${Object.keys(EXEMPT).length} · 只读 ${READONLY.length})`,
    real.length === 0, real.join(" ; "));

  // 红测(逐合取项隔离,不写 A||B):
  check(`🔴 红测自证:⑦ 摘掉 purchase 的闸必须转红`,
    violations(storeSrc.replace(/genesisPurchaseBlock/g, "xxBlock")).some((v) => v.includes("purchase()")),
    "摘闸后没红 = ⑦ 空转");
  check(`🔴 红测自证:⑦ 台账成员改名(台账漂移)必须转红`,
    violations(storeSrc.replace(/function listNode/, "function listNode2")).some((v) => v.includes("不存在")),
    "改名后没红 = 台账不看守自身");
  check(`🔴 红测自证:⑦ 新增未登记的导出 action(function 形态)必须转红`,
    (() => {
      const injected = storeSrc
        .replace(/function tickSales/, "function sneakyMint(){ myOwned.value += 1; persist(); return true; }\n  function tickSales")
        .replace(/purchase, listNode, cancelListing, acquireSecondary/, "purchase, listNode, cancelListing, acquireSecondary, sneakyMint");
      return violations(injected).some((v) => v.includes("sneakyMint"));
    })(),
    "未登记新成员没红 = 开放集合的入口没封住");
  // 🔴 箭头形态单独一条(合取项逐个隔离):上一版只测了 function 形态,箭头形态静默豁免。
  check(`🔴 红测自证:⑦ 新增未登记的导出 action(**箭头**形态)必须转红`,
    (() => {
      const injected = storeSrc
        .replace(/function tickSales/, "const arrowMint = () => { myOwned.value += 1; persist(); return true; };\n  function tickSales")
        .replace(/purchase, listNode, cancelListing, acquireSecondary/, "purchase, listNode, cancelListing, acquireSecondary, arrowMint");
      return violations(injected).some((v) => v.includes("arrowMint"));
    })(),
    "箭头形态没红 = 换个写法就能绕过整道门");
  // 🔴 台账里的 action 若被改写成箭头形态,闸判定仍须生效(不能因为形态变了就查不到函数体)
  check(`🔴 红测自证:⑦ 台账 action 改写成箭头形态后,摘闸仍必须转红`,
    (() => {
      const arrowed = storeSrc
        .replace(/function listNode\(([^)]*)\)[^{]*\{/, "const listNode = ($1) => {")
        .replace(/genesisSecondaryBlock/g, "xxBlock");
      return violations(arrowed).some((v) => v.includes("listNode"));
    })(),
    "改成箭头就查不到 = 判据被写法绕过");
}

// ══ ⑧ 跨仓 parity:字段名字面量 + 关闭态文案变体键三向一致 ═══════════════════════
// 🔴 独立验收 P0-2 根因:前端 marketStatus / 后台 openState **双向零命中**,无任何适配层,
//    接线那天后台下发的值灌不进前端 → fail-open 静默回落 "open" → 运营已关、用户照买。
//    2026-08-05 两端统一 marketOpenState(主人拍板);本判据焊住它不再分叉。
// 🔴 变体键是**三份手抄副本**(uniapp 白名单 / admin 下拉 options / i18n 三语键),
//    今天相等纯属人工同步 —— 后台加一个 "holiday" 前端不认,hydrate 静默回退 default,
//    运营看不出任何异常(错题集「键 parity ≠ 值 parity」同型)。
// 🔴 兄弟仓文件读不到 = **红**,不是跳过(同工作区两仓,与 canon-sentinel 同款前提)。
{
  // 🔴 兄弟仓根必须**解析**,不能写裸相对路径:linked worktree(.claude/worktrees/*)里
  //    `<root>/../admin-ops` 落在 .claude/worktrees/ 下 → 恒读不到 → 本条恒红(判据失效红,
  //    不是真缺陷),而下面 ⑧a-⑧d 连同它们的红测**整块被跳过** = 这道门在 worktree 里全暗。
  //    解析法与 scripts/verify.sh:36-44 的 ADMIN_ROOT 同款:同级优先,落空则用 git common-dir
  //    反推主 checkout 根(不写死 worktree 层级)。两条都解析不到 → 保持同级路径,读不到照旧判红。
  const siblingRepo = (name) => {
    const direct = path.join(root, "..", name);
    if (existsSync(direct)) return direct;
    try {
      const common = execFileSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      const viaMain = path.join(path.dirname(common), "..", name);
      if (common && existsSync(viaMain)) return viaMain;
    } catch { /* git 不可用 / 非仓库 → 落回同级路径,下游读不到即红 */ }
    return direct;
  };
  // 🔴 后台仓的目录名改过(`nexion-ops-console` → `admin-ops`),而这里写死了旧名 ——
  // 于是 parity 的取材面读不到,本门恒红。**目录改名不会有任何编译期信号**,
  // 只能靠「按候选名逐个试 + 取材面读不到就判红」这两条一起兜。
  // 判据构造性:候选名都试完仍读不到,才是真缺仓;别只认一个名字。
  const ADMIN_OPS = ["admin-ops", "nexion-ops-console"]
    .map((n) => siblingRepo(n))
    .find((p) => existsSync(path.join(p, "lib/admin/g4-client.ts")))
    ?? siblingRepo("admin-ops");
  const adminClient = path.join(ADMIN_OPS, "lib/admin/g4-client.ts");
  const adminView = path.join(ADMIN_OPS, "app/components/domain-views/g-tabs/g4-genesis.tsx");
  let clientSrc = null, viewSrc = null;
  try { clientSrc = readFileSync(adminClient, "utf8"); } catch { /* red below */ }
  try { viewSrc = readFileSync(adminView, "utf8"); } catch { /* red below */ }
  check(`🔴 ⑧ 兄弟仓 admin-ops 两文件可读(parity 的取材面)`, clientSrc !== null && viewSrc !== null,
    `读不到 ${clientSrc === null ? adminClient : ""} ${viewSrc === null ? adminView : ""} —— 判据失效必红,不许静默跳过`);

  if (clientSrc !== null && viewSrc !== null) {
    // a) 字段名:后台契约必须用统一名,且旧名已绝迹(排除注释里的历史说明)
    const strippedClient = strip(clientSrc, false);
    check(`🔴 ⑧a 后台契约字段 = marketOpenState(与前端同名)`,
      /marketOpenState:\s*"open"\s*\|\s*"closed"/.test(clientSrc),
      `admin g4-client 里找不到 marketOpenState 类型声明`);
    const oldNameHits = [...strippedClient.matchAll(/\bopenState\b/g)].length + [...strip(viewSrc, false).matchAll(/\bopenState\b/g)].length;
    check(`🔴 ⑧b 旧字段名 openState 在后台代码面 = 0(实测 ${oldNameHits})`, oldNameHits === 0,
      `旧名残留 = 改名只做了一半,接线时必串档`);

    // b) 变体键三向:uniapp 白名单 == admin options == i18n 三语键面
    const uniList = (() => {
      const m = readFileSync(path.join(root, "src/store/genesis-config.ts"), "utf8")
        .match(/GENESIS_CLOSED_NOTICE_KEYS\s*=\s*\[([^\]]+)\]/);
      return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
    })();
    const adminList = (() => {
      const m = viewSrc.match(/options:\s*\[([^\]]+)\]/);
      return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
    })();
    const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
    check(`🔴 ⑧c 变体键白名单两仓一致(uniapp ${uniList?.join("/") ?? "解析失败"} vs admin ${adminList?.join("/") ?? "解析失败"})`,
      same(uniList, adminList), `任一侧加/删/改序而另一侧没动 = 静默回退 default`);
    if (uniList && uniList.length >= 3) {
      for (const lang of ["zh", "en", "vi"]) {
        const msgs = readFileSync(path.join(root, `src/i18n/messages/${lang}.ts`), "utf8");
        const missing = uniList.filter((k) => !new RegExp(`\\b${k}:\\s*"`).test(
          (msgs.match(/marketClosed:\s*\{[\s\S]*?\n\s{4}\}/) ?? [""])[0]));
        check(`⑧d 变体键在 ${lang} 的 marketClosed 命名空间齐全`, missing.length === 0, `缺 ${missing.join(",")}`);
      }
    }
    // 红测(合取项隔离):往 admin options 注入新键必须转红
    const injected = viewSrc.replace(/options:\s*\[([^\]]+)\]/,
      (_match, items) => `options: [${items}, "holiday"]`);
    const injList = (() => { const m = injected.match(/options:\s*\[([^\]]+)\]/); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null; })();
    check(`🔴 红测自证:⑧c 后台加 "holiday" 而前端没加必须转红`, !same(uniList, injList), `注入没红 = parity 空转`);
  }
}

console.log(`\n${pass} pass / ${fail} fail(样本:7 组优先级固定靶 · 3 组二级 · 6 种紧迫感态 · 全 src 扫描 · 4 条正交结构判据 · 13 条判据红测自证含 v1 被绕的 6 种形态)`);
process.exit(fail === 0 ? 0 : 1);
