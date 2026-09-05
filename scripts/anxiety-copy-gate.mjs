#!/usr/bin/env node
// 焦虑词哨兵 —— node scripts/anxiety-copy-gate.mjs [--list]
//
// 背景(2026-08-15 pkg/zk):全站扫描发现「人工审核/风控/合规审查」类内部运营术语散布在
// 6+ 个互不相干模块 —— 是团队默认用词习惯,不是单点漏改。按「覆盖类任务先焊机器门再收
// 存量」铁律,本门先落地,存量随族收敛;此后任何新文案再写这些词会当场判红。
//
// 口径(主人 2026-08-15 拍板):
//   - 用户面禁内部运营术语(人工审核/风控/审查/manual review/risk control…);
//   - 作弊风控类文案改「行为异常」式严肃笼统表述 —— 严肃≠泄露侦测细节,更≠内部黑话,
//     所以严肃文案同样过得了本门;
//   - 确需保留禁词的行(法务条款等)用行内注释豁免:`// anxiety-exempt: <理由>`,
//     豁免必须带非空理由,并会被列进 PASS 输出供 review。
//
// 判据构造性(照 i18n-copy-residue-gate.mjs 惯例):
//   🔴 只在**字符串字面量的值**里找 —— 行注释与 /* */ 块注释先剥掉,键名不算。
//   🔴 i18n 面候选集 < 3000 = 解析坏了 = 判红,不静默放行。
//   已知局限:.vue 模板裸文本不是字符串字面量,本门抓不到 —— zh 由「注释外不许有中文」
//   门兜底;en/vi 模板裸文本靠 review(本仓文案纪律要求一律走 i18n,裸文本本身即违例)。
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LIST_MODE = process.argv.includes("--list");

// 禁词表(值匹配,latin 不分大小写)。压缩词优先于裸词,zh 裸「审核/审查/核查/风控」
// 一并禁 —— 改写后用户面不应再需要它们;真需要走 anxiety-exempt。
const BANNED = [
  /人工审核|人工复核|人工核对|人工处理|待审线|冻结线|风险评分|合规审查|合规中心|风控|审核|审查|核查/,
  // en:裸 review 不禁(名词太泛),禁「审核语义」的介词/时态形态。
  /manual review|under review|pending review|risk control|risk review|risk score|compliance review|for review|after review|account review|review is complete|\breviewed\b|awaiting approval|do_not_honor/i,
  // vi:duyệt(审核)除「trình duyệt = 浏览器」外全禁;风险/合规复合词与 thủ công(人工)同禁。
  /(?<!trình\s)duyệt|kiểm soát rủi ro|điểm rủi ro|rà soát tuân thủ|thủ công/i,
];

const EXEMPT_RE = /anxiety-exempt:\s*.{6,}/; // 理由至少 6 字符 —— 「x」式空头豁免不放行

/** 逐行抽字符串值:跨行维护块注释状态,行内剥 // 注释(引号感知)。 */
function extractValues(src) {
  const out = []; // {line, values, exempt, raw}
  let inBlock = false;
  src.split(/\r?\n/).forEach((line, i) => {
    let code = "";
    let k = 0;
    let inStr = false;
    let quote = "";
    while (k < line.length) {
      const c = line[k];
      if (inBlock) {
        if (c === "*" && line[k + 1] === "/") { inBlock = false; k += 2; continue; }
        k++; continue;
      }
      if (inStr) {
        code += c;
        if (c === "\\") { code += line[k + 1] ?? ""; k += 2; continue; }
        if (c === quote) inStr = false;
        k++; continue;
      }
      if (c === '"' || c === "'" || c === "`") { inStr = true; quote = c; code += c; k++; continue; }
      if (c === "/" && line[k + 1] === "/") break;      // 行注释:截断(豁免标记从原始行读)
      if (c === "/" && line[k + 1] === "*") { inBlock = true; k += 2; continue; }
      code += c; k++;
    }
    const values = [
      ...[...code.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]),
      ...[...code.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]),
      ...[...code.matchAll(/`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1]),
    ];
    if (values.length) out.push({ line: i + 1, values, exempt: EXEMPT_RE.test(line), raw: line });
  });
  return out;
}

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|vue)$/.test(name)) acc.push(p);
  }
  return acc;
}

const i18nDir = path.join(root, "src/i18n/messages");
const i18nFiles = readdirSync(i18nDir).filter((f) => f.endsWith(".ts")).map((f) => path.join(i18nDir, f));
const srcFiles = walk(path.join(root, "src"), []).filter((p) => !p.startsWith(i18nDir));

let i18nScanned = 0;
let srcScanned = 0;
const hits = [];
const exempts = [];

for (const file of [...i18nFiles, ...srcFiles]) {
  const isI18n = file.startsWith(i18nDir);
  const rel = path.relative(root, file).replace(/\\/g, "/");
  for (const row of extractValues(readFileSync(file, "utf8"))) {
    for (const v of row.values) {
      if (isI18n) i18nScanned++; else srcScanned++;
      const bad = BANNED.find((re) => re.test(v));
      if (!bad) continue;
      if (row.exempt) { exempts.push(`${rel}:${row.line}  ${v.slice(0, 60)}`); continue; }
      hits.push(`${rel}:${row.line}  ${v.slice(0, 90)}`);
    }
  }
}

const FLOOR = 3000;
if (i18nScanned < FLOOR) {
  console.log(`FAIL  i18n 面只抠到 ${i18nScanned} 条文案值(下限 ${FLOOR})—— 判据失效,判红`);
  process.exit(1);
}
if (hits.length) {
  console.log(`FAIL  ${hits.length} 处用户可见字符串命中焦虑/内部术语禁词(注释已剥;豁免 ${exempts.length} 处):`);
  for (const h of hits.slice(0, LIST_MODE ? hits.length : 12)) console.log(`        ${h}`);
  process.exit(1);
}
console.log(
  `anxiety-copy PASS —— i18n ${i18nScanned} 值 + src ${srcScanned} 值,禁词 0 命中` +
  (exempts.length ? `;豁免 ${exempts.length} 处:\n        ${exempts.join("\n        ")}` : ",无豁免"),
);
