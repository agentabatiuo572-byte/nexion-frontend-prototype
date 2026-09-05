#!/usr/bin/env node
// 硬编码中文哨兵 —— 判据是**构造性**的:src/**/*.{vue,ts} 里注释之外出现任何 CJK 即拦。
//
// 为什么要这道门(2026-08-11):c37e642 一个提交里,10 个文件的用户可见文案直接写成中文,
// 完全绕开 src/i18n。既有的文案哨兵一条都没响,因为它们全是**枚举式**的:
//   · verify.sh 的 mock/演示/phase 词表 —— 只扫 src/i18n/messages/*.ts 的值,页面里的字符串天然免检;
//   · TRIAL02 / funnel-meta / markdown 残留 —— 同样只扫词典,且只认固定词;
//   · i18n-key-mirror —— 只保证「已进词典的 key 三语齐」,对「压根没进词典」的字符串无感。
// 枚举式判据的共同盲区:新写的中文只要不撞词表就静默通过。所以本门反过来判 ——
// **必须不具备中文**,而不是「不得含某些词」。新页面、新词、新写法一律自动落网。
//
// 判定面:.vue + .ts。依据:css/scss/json 里的 CJK 实测全是注释(manifest.json 是 uni 模板
// 自带的段落注释),运行时文案 100% 出自 .vue/.ts —— 扫这两类即覆盖全部可见文案来源。
//
// 用法:
//   node scripts/i18n-hardcoded-cjk-sentinel.mjs             扫全仓
//   node scripts/i18n-hardcoded-cjk-sentinel.mjs --selftest   红测(判据自证有效)
import fs from "node:fs";
import path from "node:path";

// 字符集:汉字基本区 + 扩展 A + CJK 标点 + 全角形式。只判汉字块的话,纯标点文案
// (「」、。—— 之类)与全角标点整段免疫(独立审计 P2 实证)。
const CJK_CLASS = "\\u4e00-\\u9fff\\u3400-\\u4dbf\\u3000-\\u303f\\uff01-\\uff65";
const CJK = new RegExp(`[${CJK_CLASS}]`);
const cjkCount = (s) => (s.match(new RegExp(`[${CJK_CLASS}]`, "g")) ?? []).length;
// pages.json 的 navigationBarTitleText 是原生导航栏标题 = 真·用户可见文案面;
// manifest.json 带 /* */ 注释,靠下面的注释剥离器照常处理。
const SCAN_EXT = /\.(vue|ts|json)$/;
// `教程` 这种转义写法绕过任何字面量匹配 —— 先解码再判,否则门只拦「照直写」的人。
const decodeEscapes = (s) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));

// ── 分类豁免 ────────────────────────────────────────────────────────────────
// 纪律(照抄 i18n-key-mirror.mjs 的 MARK_EXEMPT):① 按**类别**授权,不按文件名逐条放行;
// ② 每条写明理由;③ **0 命中即失效** —— 某条豁免不再对应任何真实行,门直接红,要求删掉它,
//    否则它就只剩「给未来的中文开静默后门」这一个作用。
// 🔴 豁免必须是**值级**的,不是行级 —— 红测实证:`v: 0, title: "Cadet", cnTitle: "学员",`
//    在行级豁免下,同一行的 title 写成中文照样被放行。所以构造类豁免只挖掉被授权的那个
//    字面量,行里**剩下的**中文继续判。
const FILE_EXEMPTIONS = [
  {
    id: "i18n-layer",
    why: "翻译层自身:zh 词典的值就是中文;i18n/index.ts 的 nativeName 必须用各语言自己的文字写",
    match: (file) => file.startsWith("src/i18n/"),
  },
  {
    id: "mock-payload",
    why: "mock 后端载荷:真后台会按 language 下发本地化文本(platform-config 的 zhTitle/zhGuide),faq 是中文查询词匹配,都不是客户端文案",
    match: (file) => file.startsWith("src/mock/"),
  },
];

const VALUE_EXEMPTIONS = [
  {
    id: "cn-title-field",
    why: "cnTitle 是 API 声明字段(src/api/v-rank-api.ts),本地 V_RANKS 是它的离线镜像;豁免只给**定义面**这两个文件",
    // 🔴 值级豁免必须**带文件作用域**:不带的话,任何页面把文案塞进 cnTitle 字段就能对门隐身
    //    (独立审计实测:scanSource("src/pages/product/detail.vue", 'cnTitle: "立即购买"') → 0 违规)。
    //    作用域取「字段的定义面」,消费面(页面/组件)一律照判。
    files: ["src/store/v-rank.ts", "src/api/v-rank-api.ts"],
    // 单双引号都剥 —— 只认双引号会让豁免的宽严取决于引号风格(同一实测发现)。
    // 替换串传函数,不用 "$1" —— 字面量替换串会把 $& / $1 当引用吃掉(本仓踩过)。
    strip: (line) => line.replace(/(^|[\s{,])cnTitle:\s*(["'])[^"']*\2/g, (_m, lead) => `${lead}cnTitle:""`),
  },
  {
    id: "legacy-config-token",
    why:
      "后端 legacy 策略行的**取值**,不是展示文案:parseTrialBooleanConfig 把旧后台写的 '开'/'关' 这类值" +
      "归一成 JSON boolean(H2 线上契约已是 boolean,这几个只在旧行归一化期间存在)。它们进的是 includes() " +
      "的比较集,永远不会渲染给用户 —— 收进 i18n 反而是错的:词典是给人读的,这里要的是**跟后端字节对齐**。",
    files: ["src/lib/trial-config-enum.ts"],
    // 🔴 钉**具体授权的 4 个 token**,不是「这个文件的数组里都放行」:
    //    ① 只有整串恰好等于授权值才剥(子串不逃逸:"开放试用" 照判);
    //    ② 后端将来新增 "启用"/"停用" 必须显式加进这里 —— 每个新取值都过一次审,这正是要的;
    //    ③ 文件作用域挡住「把文案塞成同名字面量就隐身」(消费面写 "开放" 照抓)。
    strip: (line) =>
      line.replace(/(["'])([^"']*)\1/g, (m, q, inner) =>
        LEGACY_CONFIG_TOKENS.includes(inner) ? `${q}${q}` : m
      ),
  },
];

// 与上面 legacy-config-token 配对的授权取值表。单独提出来是为了让「授权了哪几个值」
// 一眼可数、可 diff —— 埋在正则里的白名单没人看得见增删。
const LEGACY_CONFIG_TOKENS = ["开", "开放", "关", "关闭"];

// ── 注释剥离 ────────────────────────────────────────────────────────────────
// 🔴 2026-08-17 起搬到 `scripts/lib/sfc-strip-comments.mjs`,与英文面哨兵
// (i18n-hardcoded-en-copy-sentinel.mjs)共用一份 —— 留在这里让那边复制,
// 就是「修了一道门、漏了另一道」的标准形态。本文件下面那批注释红测(HTML 注释 /
// script 行注释 / 块注释 / style 注释 / 含 `//` 的字符串 / 模板里的 `//`)
// **同时是共享模块的回归靶**:改坏共享逻辑,这里立刻红。
export { stripComments } from "./lib/sfc-strip-comments.mjs";
import { stripComments } from "./lib/sfc-strip-comments.mjs";

export function scanSource(file, src) {
  const stripped = decodeEscapes(stripComments(src, file.endsWith(".vue")));
  const fileRule = FILE_EXEMPTIONS.find((rule) => rule.match(file));
  const hits = [];
  stripped.split(/\r?\n/).forEach((line, idx) => {
    if (!CJK.test(line)) return;
    if (fileRule) { hits.push({ file, line: idx + 1, text: "", exempt: fileRule.id }); return; }
    // 逐条挖掉被授权的字面量;命中 = 这条规则真的少掉了中文(纯改写不算,免得白名单靠空转续命)。
    let rest = line;
    const used = [];
    for (const rule of VALUE_EXEMPTIONS) {
      if (!rule.files.includes(file)) continue;
      const next = rule.strip(rest);
      if (cjkCount(next) < cjkCount(rest)) used.push(rule.id);
      rest = next;
    }
    for (const id of used) hits.push({ file, line: idx + 1, text: "", exempt: id });
    // 挖完还剩中文 = 这行有未授权的硬编码文案,照判。
    if (CJK.test(rest)) hits.push({ file, line: idx + 1, text: line.trim().slice(0, 140), exempt: null });
  });
  return hits;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name).split(path.sep).join("/");
    if (entry.isDirectory()) walk(p, out);
    else if (SCAN_EXT.test(entry.name)) out.push(p);
  }
  return out;
}

function run() {
  const files = walk("src");
  const violations = [];
  const exemptHits = new Map();
  let filesWithAnyCjk = 0;
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (CJK.test(src)) filesWithAnyCjk += 1;
    for (const hit of scanSource(file, src)) {
      if (hit.exempt) exemptHits.set(hit.exempt, (exemptHits.get(hit.exempt) ?? 0) + 1);
      else violations.push(hit);
    }
  }

  // 假绿防线:扫不到文件 / CJK 正则对真实语料 0 命中(编码或走查逻辑坏了)一律判红,
  // 否则「0 违规」既可能是真干净,也可能是门根本没跑起来,两者在输出里长得一模一样。
  if (!files.length) { console.error("i18n-cjk FAIL:src 下没扫到任何 .vue/.ts —— 判据失效"); return 1; }
  if (!filesWithAnyCjk) { console.error("i18n-cjk FAIL:全仓 CJK 命中 0 个文件(连中文注释都没有)—— 判据失效"); return 1; }

  const stale = [...FILE_EXEMPTIONS, ...VALUE_EXEMPTIONS].filter((rule) => !exemptHits.get(rule.id));
  if (stale.length) {
    console.error(
      `i18n-cjk FAIL:${stale.length} 条豁免已无对应行(0 命中即判据失效),请从 EXEMPTIONS 删除:\n` +
        stale.map((rule) => `  ${rule.id} —— ${rule.why}`).join("\n")
    );
    return 1;
  }

  if (violations.length) {
    console.error(
      `i18n-cjk FAIL:${violations.length} 处硬编码中文(注释之外),扫描 ${files.length} 个 .vue/.ts。\n` +
        "撞到本门有**三条**出路,按「这句话是给谁看的」选,别一律往词典搬:\n" +
        "  ① 真·用户文案 → src/i18n/messages/{en,zh,vi}.ts 三语同序,页面用 useT() 读;\n" +
        "  ② 带 SANDBOX / source=mock / DEV 这类**工程话**的字符串 → 改成英文技术串,**不要进词典**。\n" +
        "     verify.sh 那道 mock 门已经定过判据:工程话进词典就成了用户文案契约,而词典是普通对象、\n" +
        "     打包摇不掉,会原样进生产包。给一个调试串做三语本地化是错的方向;本门只判中文,改英文即过。\n" +
        "  ③ 压根不渲染给人看的**取值**(跟后端字节比对的码表等)→ 加 VALUE_EXEMPTIONS:\n" +
        "     必须值级 + 带 files 作用域 + 写明理由,禁整文件放行(照抄 legacy-config-token 那条的形状)。\n" +
        "违规明细:\n" +
        violations.map((v) => `  ${v.file}:${v.line}  ${v.text}`).join("\n")
    );
    return 1;
  }

  const exemptNote = [...exemptHits.entries()].map(([id, n]) => `${id}×${n}`).join(" · ");
  console.log(
    `i18n-cjk PASS:${files.length} 个 .vue/.ts(其中 ${filesWithAnyCjk} 个含 CJK)注释外零硬编码中文 · 分类豁免 ${exemptNote}`
  );
  return 0;
}

// ── 红测 ────────────────────────────────────────────────────────────────────
// 纪律:每条判据**单独隔离**验证,阳性样本只违反一条。合并成一个大样本时,
// 任何一条判据失效都会被其它条掩盖,门看起来照样绿(踩过)。
function selftest() {
  const cases = [
    // [名称, 文件路径, 源码, 期望违规数]
    ["模板文本里的中文被抓", "src/pages/x/a.vue", "<template><view>正在加载</view></template>", 1],
    ["模板属性值里的中文被抓", "src/pages/x/a.vue", '<template><view title="教程中心" /></template>', 1],
    ["HTML 注释里的中文放行", "src/pages/x/a.vue", "<template><!-- 教程中心 --><view /></template>", 0],
    ["script 行注释里的中文放行", "src/pages/x/a.ts", "// 教程中心\nconst a = 1;", 0],
    ["script 块注释里的中文放行", "src/pages/x/a.ts", "/* 教程\n中心 */\nconst a = 1;", 0],
    ["script 字符串里的中文被抓", "src/pages/x/a.ts", 'const a = "教程中心";', 1],
    ["throw 里的中文被抓(会经 e.message 冒到 UI)", "src/pages/x/a.ts", 'throw new Error("必须先绑卡");', 1],
    ["含 // 的字符串不被当注释吃掉", "src/pages/x/a.ts", 'const a = "https://x.test"; const b = "教程中心";', 1],
    ["模板里的 // 不是注释(其后中文照抓)", "src/pages/x/a.vue", "<template><view>a // 教程中心</view></template>", 1],
    ["style 块注释里的中文放行", "src/pages/x/a.vue", "<style>/* 中文注释 */\n.a{color:red}</style>", 0],
    ["style 的 content 里的中文被抓", "src/pages/x/a.vue", '<style>.a::after{content:"必读"}</style>', 1],
    ["模板注释未闭合不吞掉后面的中文…", "src/pages/x/a.vue", "<template><!-- x --><view>加载</view></template>", 1],
    // 三语各测一遍:豁免是**目录级**的,只测 zh.ts 会让「en.ts / vi.ts 也归 i18n 层」这半边判据无人验证
    // (仓内元门 selfcheck-gate-targets 也按「语言面不许缺面」判——点名一种语言就得点名三种)。
    ["豁免:i18n 层放行(zh.ts)", "src/i18n/messages/zh.ts", 'export const zh = { a: "教程中心" };', 0],
    ["豁免:i18n 层放行(en.ts —— 英文词典里也可能存在中文品牌名/语言名)", "src/i18n/messages/en.ts", 'export const en = { a: "简体中文" };', 0],
    ["豁免:i18n 层放行(vi.ts)", "src/i18n/messages/vi.ts", 'export const vi = { a: "简体中文" };', 0],
    ["豁免:mock 载荷放行", "src/mock/platform-config.ts", 'const a = { zhTitle: "电脑显卡算力共享" };', 0],
    ["豁免:cnTitle 字段在定义面放行", "src/store/v-rank.ts", 'v: 0, title: "Cadet", cnTitle: "学员",', 0],
    ["豁免:cnTitle 单引号写法同样放行(宽严不许取决于引号风格)", "src/store/v-rank.ts", "cnTitle: '学员',", 0],
    ["同文件里非 cnTitle 的中文照抓", "src/store/v-rank.ts", 'v: 0, title: "学员", cnTitle: "学员",', 1],
    ["🔴 cnTitle 豁免带文件作用域:消费面塞文案照抓", "src/pages/product/detail.vue", 'const o = { cnTitle: "立即购买" };', 1],
    // legacy-config-token —— 阴阳两面各测一遍:只测 true 那行会让 "关"/"关闭" 半边判据无人验证。
    ["豁免:legacy 配置取值放行(true 侧)", "src/lib/trial-config-enum.ts", 'if (["true", "1", "enabled", "on", "开", "开放"].includes(v)) return true;', 0],
    ["豁免:legacy 配置取值放行(false 侧)", "src/lib/trial-config-enum.ts", 'if (["false", "0", "disabled", "off", "关", "关闭"].includes(v)) return false;', 0],
    // 下面三格证明这条豁免**不是**整文件放行、也不是「含授权字就放行」:
    ["🔴 同文件里非授权取值的中文照抓(不是整文件豁免)", "src/lib/trial-config-enum.ts", 'throw new Error("试用配置无效");', 1],
    ["🔴 只认整串相等:授权 token 作子串不逃逸", "src/lib/trial-config-enum.ts", 'const a = "开放试用";', 1],
    ["🔴 legacy 豁免带文件作用域:消费面写同样的字照抓", "src/pages/x/a.vue", "<template><view>开放</view></template>", 1],
    ["🔴 \\u 转义绕过被解码后照抓", "src/pages/x/a.ts", 'const a = "\\u6559\\u7a0b\\u4e2d\\u5fc3";', 1],
    ["🔴 纯 CJK 标点文案照抓(只判汉字块会整段免疫)", "src/pages/x/a.vue", "<template><view>「」、。</view></template>", 1],
    ["pages.json 的导航栏标题是用户可见文案面", "src/pages.json", '{"path":"pages/x/a","style":{"navigationBarTitleText":"教程中心"}}', 1],
    ["manifest.json 的块注释放行", "src/manifest.json", '{/* 模块配置 */"name":"NexGrid"}', 0],
    ["纯英文页面 0 命中", "src/pages/x/a.vue", "<template><view>Loading…</view></template>", 0],
  ];
  let failed = 0;
  for (const [name, file, src, want] of cases) {
    const got = scanSource(file, src).filter((h) => !h.exempt).length;
    if (got !== want) { failed += 1; console.error(`  ✗ ${name} —— 期望 ${want} 条违规,实得 ${got}`); }
  }
  if (failed) { console.error(`i18n-cjk selftest FAIL:${failed}/${cases.length} 条判据不成立`); return 1; }
  console.log(`i18n-cjk selftest PASS:${cases.length} 条判据逐条隔离验证(阳性必中 + 注释/豁免必放行)`);
  return 0;
}

process.exit(process.argv.includes("--selftest") ? selftest() : run());
