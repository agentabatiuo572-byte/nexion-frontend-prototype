#!/usr/bin/env node
/**
 * 遮罩单源哨兵 —— 弹层遮罩(scrim)的底色必须走 `var(--v5-bg-color-mask)`。
 *
 * 为什么焊这道门(2026-07-23 C1 批次,我自己踩的):
 *   我清遮罩时用**值**匹配(grep `rgba(0,0,0,0.5x)` / `rgba(19,20,26,x)`),
 *   只捞到 9 个,漏了另外 11 个 —— 它们写的是 `rgba(8,8,12,0.45)` / `rgba(7,9,15,0.62)` /
 *   `rgba(0,0,0,0.72)`,值不同所以正则不中。**用值找"扮演某角色的东西"永远会漏**,
 *   因为角色不由值定义。本哨兵改按**角色**判:选择器叫 `*-backdrop`/`*-mask`,
 *   或内联样式是「铺满视口 + 有底色」的覆盖层 → 就是遮罩 → 底色必须是单源 token。
 *
 * 遮罩不统一的实害:同一个 app 里不同弹层的压暗程度不一样;且写死的值不随主题变,
 * 亮主题下会是一片重黑而不是设计规定的 ink 45%。
 *
 * 豁免:docs/TOKEN-COPY-ALLOWLIST.json 的 `scrimExemptions`(reason 必填)。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const ALLOWLIST = path.join(ROOT, "docs/TOKEN-COPY-ALLOWLIST.json");
const TOKEN = "var(--v5-bg-color-mask)";

const stripComments = (s) =>
  s
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\([\d.\s,%/]+\)/;

/** 角色①:选择器叫 *-backdrop / *-mask 的规则块 */
export function scanRuleBlocks(text, rel) {
  const hits = [];
  const src = stripComments(text);
  const re = /(^|\n)\s*(\.[A-Za-z][\w-]*-(?:backdrop|mask))\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const decls = m[3];
    const bg = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/.exec(decls);
    if (!bg) continue;
    const value = bg[1].trim();
    if (value.includes("--v5-bg-color-mask")) continue;
    if (!COLOR_LITERAL.test(value)) continue; // 走别的 token 的另说,这里只抓字面量
    hits.push({
      file: rel,
      line: src.slice(0, m.index).split("\n").length + (m[1] === "\n" ? 1 : 0),
      selector: m[2],
      value,
      kind: "rule",
    });
  }
  return hits;
}

/** 角色②:内联样式的铺满视口覆盖层(position fixed/absolute + inset:0 + 字面底色) */
export function scanInline(text, rel) {
  const hits = [];
  const src = stripComments(text);
  const re = /style="([^"]*)"/g;
  let m;
  while ((m = re.exec(src))) {
    const s = m[1];
    if (!/position:\s*(fixed|absolute)/.test(s)) continue;
    if (!/inset:\s*0/.test(s)) continue;
    const bg = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;"]+)/.exec(s);
    if (!bg) continue;
    const value = bg[1].trim();
    if (value.includes("--v5-bg-color-mask")) continue;
    if (!COLOR_LITERAL.test(value)) continue;
    if (/gradient/.test(value)) continue; // 渐变覆盖层是装饰不是遮罩
    hits.push({ file: rel, line: src.slice(0, m.index).split("\n").length, selector: "(inline)", value, kind: "inline" });
  }
  return hits;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".vue")) acc.push(p);
  }
  return acc;
}

function loadExemptions() {
  if (!fs.existsSync(ALLOWLIST)) return [];
  return JSON.parse(fs.readFileSync(ALLOWLIST, "utf8")).scrimExemptions ?? [];
}
const allowed = (h, ex) => ex.some((e) => e.file === h.file && (!e.selector || e.selector === h.selector));

/* ── selftest:双向红测 ── */
function selftest() {
  const P = [];
  const p = (n, e, a) => P.push({ n, ok: JSON.stringify(e) === JSON.stringify(a), e, a });

  // 阳性:各种值形态都必须被抓(这正是我漏修的那批的真实写法)
  for (const v of ["rgba(8, 8, 12, 0.45)", "rgba(7,9,15,0.62)", "rgba(0, 0, 0, 0.72)", "#000000", "rgba(19,20,26,0.44)"])
    p(`阳性 rule ${v}`, 1, scanRuleBlocks(`.xx-backdrop {\n position: absolute;\n background: ${v};\n}`, "a.vue").length);
  p("阳性 *-mask 选择器", 1, scanRuleBlocks(`.cs-mask { inset: 0; background: rgba(0,0,0,0.72); }`, "a.vue").length);
  p("阳性 background-color 写法", 1, scanRuleBlocks(`.y-backdrop { background-color: #0A0A0A; }`, "a.vue").length);
  p("阳性 内联覆盖层", 1, scanInline(`<view style="position: fixed; inset: 0; background: rgba(8,8,12,0.45)" />`, "a.vue").length);

  // 阴性:合规写法与非遮罩必须 0
  p("阴性 已用 token(rule)", 0, scanRuleBlocks(`.xx-backdrop { background: ${TOKEN}; }`, "a.vue").length);
  p("阴性 已用 token(内联)", 0, scanInline(`<view style="position:absolute; inset: 0; background: ${TOKEN}" />`, "a.vue").length);
  p("阴性 非遮罩选择器", 0, scanRuleBlocks(`.xx-card { background: rgba(8,8,12,0.45); }`, "a.vue").length);
  p("阴性 面板用 surface token", 0, scanRuleBlocks(`.xx-mask { background: var(--v5-surface); }`, "a.vue").length);
  p("阴性 注释里的违例", 0, scanRuleBlocks(`/* .xx-backdrop { background: #000; } */`, "a.vue").length);
  p("阴性 无 inset 的定位元素", 0, scanInline(`<view style="position: fixed; top: 0; background: rgba(8,8,12,0.45)" />`, "a.vue").length);
  p("阴性 渐变装饰层", 0, scanInline(`<view style="position:absolute; inset:0; background: linear-gradient(180deg,#000,transparent)" />`, "a.vue").length);
  p("阴性 无 background 的遮罩块", 0, scanRuleBlocks(`.xx-backdrop { backdrop-filter: blur(4px); }`, "a.vue").length);

  // 豁免机制
  const h = scanRuleBlocks(`.xx-backdrop { background: #000; }`, "src/a.vue")[0];
  p("豁免生效", true, allowed(h, [{ file: "src/a.vue", reason: "t" }]));
  p("豁免不跨文件", false, allowed(h, [{ file: "src/b.vue", reason: "t" }]));
  p("豁免每条有 reason", 0, loadExemptions().filter((e) => !e.reason || !String(e.reason).trim()).length);

  const bad = P.filter((x) => !x.ok);
  console.log("=== scrim-single-source selftest ===");
  for (const x of P) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.n}${x.ok ? "" : ` expect=${JSON.stringify(x.e)} actual=${JSON.stringify(x.a)}`}`);
  console.log(`\n${P.length - bad.length}/${P.length} pass`);
  process.exit(bad.length ? 1 : 0);
}
if (process.argv.includes("--selftest")) selftest();

const ex = loadExemptions();
const all = [];
for (const f of walk(SRC)) {
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  const text = fs.readFileSync(f, "utf8");
  all.push(...scanRuleBlocks(text, rel), ...scanInline(text, rel));
}
const viol = all.filter((h) => !allowed(h, ex));
if (viol.length) {
  console.error(`scrim 单源: ${viol.length} 处弹层遮罩底色未走 ${TOKEN}\n`);
  for (const h of viol) console.error(`  ${h.file}:${h.line}  ${h.selector}  background: ${h.value}`);
  console.error(`\n遮罩底色是单源设计量(亮 ink45% / 暗 黑62%)。写死的值不随主题变,且各弹层压暗深浅不一。`);
  console.error(`确属例外 → docs/TOKEN-COPY-ALLOWLIST.json 的 scrimExemptions 加一条并写 reason。`);
  process.exit(1);
}
console.log(`scrim 单源: 0 违例(扫到遮罩角色元素,豁免 ${ex.length} 条)`);
