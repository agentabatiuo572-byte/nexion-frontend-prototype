// 值域棘轮哨兵(vibe-playbook P2-F · 2026-07-22 主人批)
// ① 字号阶梯棘轮:font-size 不在《02 文字规范》14 档合法集 = 违例。
//    🔀 2026-07-22 B0 升级:口径由旧 9 档「档间值黑名单」改为 14 档「合法集白名单」
//    (主人已批 docs/TYPO-MIGRATION-MAP.md)。13px 由违例转合法(body.s);
//    13.5/12.5/11.5/11/10.5/10/14/18 等由合法转违例 → 基线数字相应变大,
//    它现在度量的是「离 14 档还有多远」的存量债务,每批迁移后 --update-baseline 收紧。
//    存量按「文件→计数」入基线;任一文件计数超基线 / 新文件出现 = exit 1(棘轮只拦增量)。
// ② 圆角值集棘轮:border-radius 出现「基线外 且 非阶梯」的新离散值 = exit 1。
//    阶梯 {12,16,20,24,28,32,999,9999} 永远合法(tokens.css --v5-radius-* 同源),鼓励新代码上梯。
// 基线 docs/VALUE-LADDER-BASELINE.json;计数下降只提示可收紧,不自动改写。
// 用法: node scripts/value-ladder-sentinel.mjs [--selftest | --update-baseline]
// admin 双胞胎:Nexion-admin-prototype/scripts/font-ladder-sentinel.mjs(Tailwind class 形态,仅字号)。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = join(ROOT, "docs", "VALUE-LADDER-BASELINE.json");
// 🔴 三种写法必须全覆盖(2026-07-23 B1 独立评分抓出盲区:原正则只认 kebab,
// 漏掉 camelCase 1201 处 + UnoCSS 任意值 —— 迁移工具与哨兵共用同一个瞎正则,
// 导致「债务归零」是用错的尺子量出来的假绿。红测见 --selftest)。
//   ① CSS/内联字符串   font-size: 12px
//   ② JS 样式对象      fontSize: "12px" / fontSize: '12px'
//   ③ UnoCSS 任意值    text-[12px]
const FONT_RE = /(?:font-size:\s*|fontSize:\s*["']|text-\[)([0-9.]+)px/g;
// 《02 文字规范》§2 14 档合法字号集(hero56/xl44/l36/h1-34/h2-26/h3-20/body.m15/body.s13/caption12;
// tab12 · mono15 · button15 · input15 与上述档位同值)。
const TYPE_LADDER = new Set(["56", "44", "36", "34", "26", "20", "15", "13", "12"]);
const RADIUS_RE = /border-radius:\s*([0-9.]+)(?:px|rpx)/g;
const RADIUS_LADDER = new Set(["12", "16", "20", "24", "28", "32", "999", "9999"]);
const args = process.argv.slice(2);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(vue|ts)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

// 字号违例判定:不在 14 档合法集即违例(归一化 13.0 → 13)
const isOffLadderFont = (raw) => !TYPE_LADDER.has(String(parseFloat(raw)));

function scan() {
  const perFile = {};
  const radiusLoc = {}; // value -> [file:line]
  const fontLoc = {};   // file -> [「值@行」] (仅报错定位用,不入基线)
  for (const f of walk(join(ROOT, "src"))) {
    const rel = relative(ROOT, f).replace(/\\/g, "/");
    const text = readFileSync(f, "utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(FONT_RE)) {
        if (!isOffLadderFont(m[1])) continue;
        perFile[rel] = (perFile[rel] || 0) + 1;
        (fontLoc[rel] ||= []).push(`${parseFloat(m[1])}px@${i + 1}`);
      }
      for (const m of lines[i].matchAll(RADIUS_RE)) {
        const v = String(parseFloat(m[1])); // 归一化 12.0 → 12
        (radiusLoc[v] ||= []).push(`${rel}:${i + 1}`);
      }
    }
  }
  return { perFile, fontLoc, radiusValues: Object.keys(radiusLoc).sort((a, b) => +a - +b), radiusLoc };
}

// 纯函数门:给定基线与现状,产违例(可 selftest)
function gate(baseline, cur) {
  const bad = [];
  const basePF = (baseline.font && baseline.font.perFile) || {};
  for (const [f, n] of Object.entries(cur.perFile)) {
    const b = basePF[f] || 0;
    if (n > b) bad.push({ kind: "font", msg: `${f}: 档外字号 ${n} 处 > 基线 ${b}(14 档合法集 {56,44,36,34,26,20,15,13,12};新增位置: ${((cur.fontLoc || {})[f] || []).slice(0, 5).join(", ")})` });
  }
  const baseVals = new Set((baseline.radius && baseline.radius.values) || []);
  for (const v of cur.radiusValues) {
    if (!RADIUS_LADDER.has(v) && !baseVals.has(v)) {
      bad.push({ kind: "radius", msg: `新离散圆角值 ${v}px(不在阶梯也不在基线): ${(cur.radiusLoc[v] || []).slice(0, 3).join(", ")} — 用 var(--v5-radius-*) 或阶梯值` });
    }
  }
  const tighten = Object.entries(basePF).filter(([f, b]) => (cur.perFile[f] || 0) < b);
  return { bad, tighten };
}

if (args.includes("--selftest")) {
  // 双向红测:matcher 精度 + 棘轮方向
  let fail = 0;
  const T = (name, ok) => { if (!ok) { console.error(`SELFTEST FAIL: ${name}`); fail = 1; } };
  // 14 档口径:合法集内不命中,集外命中(与旧 9 档口径相反的两例特意保留为回归锚:13 合法 / 13.5 违例)
  const hits = (s) => [...s.matchAll(new RegExp(FONT_RE.source, "g"))].filter((m) => isOffLadderFont(m[1])).length;
  T("13.5px 命中(档外)", hits("font-size: 13.5px") === 1);
  T("11.5px 无空格命中(档外)", hits("font-size:11.5px") === 1);
  T("17px 命中(档外)", hits("font-size: 17px") === 1);
  T("13px 不命中(14 档 body.s)", hits("font-size: 13px") === 0);
  T("15px 不命中(14 档 body.m)", hits("font-size: 15px") === 0);
  T("56px 不命中(14 档 hero)", hits("font-size: 56px") === 0);
  T("12.0px 归一化后不命中", hits("font-size: 12.0px") === 0);
  // 🔴 三写法覆盖红测(2026-07-23 盲区回归锚:少任一条即退回 67% 假绿)
  T('camelCase 双引号 fontSize:"11.5px" 命中', hits('fontSize: "11.5px"') === 1);
  T("camelCase 单引号 fontSize:'10px' 命中", hits("fontSize: '10px'") === 1);
  T('camelCase 档内 fontSize:"15px" 不命中', hits('fontSize: "15px"') === 0);
  T("UnoCSS text-[11px] 命中", hits("class=\"text-[11px]\"") === 1);
  T("UnoCSS text-[13px] 不命中(档内)", hits("class=\"text-[13px]\"") === 0);
  T("三写法混排各计一次", hits('font-size: 17px; fontSize: "19px"; text-[21px]') === 3);
  const rv = [...("border-radius: 17px; border-radius: 999px; border-radius: 12.0px".matchAll(new RegExp(RADIUS_RE.source, "g")))].map((m) => String(parseFloat(m[1])));
  T("radius 抽取 17/999/12", rv.join(",") === "17,999,12");
  // 棘轮方向:超基线必红 / 等于基线必绿 / 新离散圆角必红 / 阶梯值永远绿
  const g1 = gate({ font: { perFile: { "a.vue": 1 } }, radius: { values: [] } }, { perFile: { "a.vue": 2 }, radiusValues: [], radiusLoc: {} });
  T("字号超基线 → 红", g1.bad.length === 1);
  const g0 = gate({ font: { perFile: { "a.vue": 3 } }, radius: { values: [] } }, { perFile: { "a.vue": 3 }, radiusValues: [], radiusLoc: {} });
  T("字号等于基线 → 绿(棘轮不倒查存量)", g0.bad.length === 0);
  const g2 = gate({ font: { perFile: { "a.vue": 2 } }, radius: { values: ["17"] } }, { perFile: { "a.vue": 2 }, radiusValues: ["17", "24"], radiusLoc: { 17: ["a:1"], 24: ["a:2"] } });
  T("持平+基线内旧值+阶梯新值 → 绿", g2.bad.length === 0);
  const g3 = gate({ font: { perFile: {} }, radius: { values: [] } }, { perFile: {}, radiusValues: ["17"], radiusLoc: { 17: ["a:1"] } });
  T("新离散圆角 → 红", g3.bad.length === 1);
  if (!fail) console.log("SELFTEST PASS: matcher 精度 13/13(14 档 × 三写法) + radius 抽取 1/1 + 棘轮方向 4/4");
  process.exit(fail);
}

const cur = scan();
if (args.includes("--update-baseline")) {
  writeFileSync(BASELINE_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    note: "值域棘轮基线(vibe-playbook P2-F;2026-07-22 B0 切 14 档口径)。font=**不在《02》14 档合法集 {56,44,36,34,26,20,15,13,12}** 的 font-size 存量,按文件计数(只许降不许升)——这是「离 14 档还有多远」的债务台账,B1-B8 每批迁移后收紧;radius.values=历史离散圆角值(新值必须上阶梯)。人工审阅后才 --update-baseline。",
    font: { total: Object.values(cur.perFile).reduce((a, b) => a + b, 0), perFile: cur.perFile },
    radius: { values: cur.radiusValues.filter((v) => !RADIUS_LADDER.has(v)) },
  }, null, 2));
  console.log(`BASELINE UPDATED: 档外字号 ${Object.values(cur.perFile).reduce((a, b) => a + b, 0)} 处 / ${Object.keys(cur.perFile).length} 文件;基线外圆角离散值 ${cur.radiusValues.filter((v) => !RADIUS_LADDER.has(v)).length} 个`);
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : { font: { perFile: {} }, radius: { values: [] } };
const { bad, tighten } = gate(baseline, cur);
if (bad.length) {
  console.error(`VALUE-LADDER FAIL: ${bad.length} 条增量违例:`);
  for (const b of bad) console.error(`  [${b.kind}] ${b.msg}`);
  process.exit(1);
}
const tip = tighten.length ? `;${tighten.length} 文件已低于基线(可 --update-baseline 收紧)` : "";
console.log(`VALUE-LADDER PASS: 字号档间无增量、圆角无基线外新离散值${tip}`);
