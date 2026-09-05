#!/usr/bin/env node
/**
 * token-copy 哨兵 —— 抓「设计 token 的色值被抄成字面量」。
 *
 * 为什么是真 bug 不是洁癖:
 *   token 在亮/暗两主题取不同值,字面副本不会变 → 该元素在另一主题下必然失配。
 *   典型:vault-row 同一对象里 softBg/text 走 token、borderColor 抄了亮主题的绿。
 *
 * 判据(第一性原理,只钉必然失配的那类,不制造噪声):
 *   ① 只钉「亮值 ≠ 暗值」的 token —— 单主题 token 的副本不会失配,不入门。
 *   ② 比 RGB 三元组、**忽略 alpha** —— rgba(14,142,74,0.30) 也是 --v5-success 的副本。
 *      (2026-07-23 C1:首版比全等值,漏掉全部变透明度副本,即 vault-row 那 3 处真 bug。)
 *   ③ 真灰(r=g=b)排除 —— #000/#fff/#0F0F0F 是主题无关的通用光影,不是语义色。
 *   ④ hex 3/6/8 位 + rgb()/rgba() 两种书写形式都认。
 *      (旧哨兵 '#0E48E6|#F4F1E9|#FF5A1F|#13141A' 只钉 4 色且只认 #RRGGBB,
 *       被 rgba() 形式绕过过 —— purchase-ticker 注释曾自陈「特意挪值以免触发哨兵」。)
 *
 * 豁免走 docs/TOKEN-COPY-ALLOWLIST.json,每条必须写 reason(人工裁决留痕,不是静默绕过)。
 * --selftest 双向红测:两种书写形式的阳性必中 + 干净样本/真灰/注释/豁免必 0。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const TOKENS_CSS = path.join(SRC, "styles/tokens.css");
const ALLOWLIST = path.join(ROOT, "docs/TOKEN-COPY-ALLOWLIST.json");

/* ── 颜色规范化 → "r,g,b,a" ── */
export function norm(raw) {
  const s = String(raw).trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const [r, g, b] = m[1].split("");
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16), 1];
  }
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) {
    const h = m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  m = /^#([0-9a-f]{8})$/.exec(s);
  if (m) {
    const h = m[1];
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      parseInt(h.slice(6, 8), 16) / 255,
    ];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), a];
  }
  // hsl()/hsla() —— 独立验收指出的唯一漏网写法(当前全库 0 处,先堵上防将来)
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.%]+))?\s*\)$/.exec(s);
  if (m) {
    const h = +m[1] / 360, sat = +m[2] / 100, l = +m[3] / 100;
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    const f = (n) => {
      const k = (n + h * 12) % 12;
      return l - sat * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255), a];
  }
  return null;
}
const rgbKey = (n) => `${n[0]},${n[1]},${n[2]}`;
export const isTrueGrey = (n) => n[0] === n[1] && n[1] === n[2];

/* ── tokens.css → 亮暗值不同的语义色表 ── */
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

export function buildThemeVaryingTable(css) {
  const raw = stripCssComments(css);
  const defs = { light: new Map(), dark: new Map() };
  const grab = (re, theme) => {
    let b;
    while ((b = re.exec(raw))) {
      const dre = /(--[\w-]+)\s*:\s*([^;]+);/g;
      let d;
      while ((d = dre.exec(b[1]))) {
        const n = norm(d[2].trim());
        if (n) defs[theme].set(d[1], n);
      }
    }
  };
  grab(/:root\s*\{([\s\S]*?)\n\}/g, "light");
  grab(/html\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/g, "dark");

  const table = new Map(); // rgbKey -> [{token, theme}]
  for (const theme of ["light", "dark"]) {
    for (const [token, val] of defs[theme]) {
      const other = defs[theme === "light" ? "dark" : "light"].get(token);
      if (!other) continue; // 单主题 token:不会失配
      if (rgbKey(other) === rgbKey(val) && other[3] === val[3]) continue; // 两主题同值:不会失配
      if (isTrueGrey(val)) continue; // 真灰 = 通用光影
      const k = rgbKey(val);
      if (!table.has(k)) table.set(k, []);
      table.get(k).push({ token, theme });
    }
  }
  return table;
}

/* ── 源码扫描 ── */
export function stripSourceComments(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:\w])\/\/[^\n]*/gm, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

const LITERAL_RE =
  /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+(?:[\s,/]+[\d.%]+)?\s*\)|hsla?\(\s*[\d.]+(?:deg)?[\s,]+[\d.]+%[\s,]+[\d.]+%(?:[\s,/]+[\d.%]+)?\s*\)/g;

export function scanText(text, rel, table) {
  const hits = [];
  const clean = stripSourceComments(text);
  clean.split(/\r?\n/).forEach((line, i) => {
    let m;
    LITERAL_RE.lastIndex = 0;
    while ((m = LITERAL_RE.exec(line))) {
      const n = norm(m[0]);
      if (!n || isTrueGrey(n)) continue;
      const tokens = table.get(rgbKey(n));
      if (!tokens) continue;
      hits.push({
        file: rel,
        line: i + 1,
        literal: m[0],
        tokens: tokens.map((t) => `${t.token}@${t.theme}`),
        text: line.trim().slice(0, 120),
      });
    }
  });
  return hits;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(vue|ts|js)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) acc.push(p);
  }
  return acc;
}

function loadAllowlist() {
  if (!fs.existsSync(ALLOWLIST)) return [];
  const j = JSON.parse(fs.readFileSync(ALLOWLIST, "utf8"));
  return j.exemptions ?? [];
}
export function isAllowed(hit, exemptions) {
  return exemptions.some(
    (e) => e.file === hit.file && (!e.literal || norm(e.literal)?.join() === norm(hit.literal)?.join()),
  );
}

/* 从表反查一个「亮暗异值」token 的两个实际取值。
   🔴 selftest 必须**动态取样**,不得把当期设计值写死进 fixture ——
   写死会让 token 值事实上不可改(一改设计值 selftest 即崩/红),把本该可演进的
   设计决策变成水泥。断言只钉「关系」(两主题都入表 / 两值不等 / 各书写形式都被抓),
   这些关系在设计值合法演进后依然成立。教训见 PORT-PITFALLS P-056。 */
function sampleThemeVarying(table, preferToken) {
  const byToken = new Map();
  for (const [rgb, arr] of table) {
    for (const { token, theme } of arr) {
      if (!byToken.has(token)) byToken.set(token, {});
      byToken.get(token)[theme] = rgb;
    }
  }
  const usable = [...byToken.entries()].filter(([, v]) => v.light && v.dark && v.light !== v.dark);
  const pick = usable.find(([t]) => t === preferToken) || usable[0];
  return pick ? { token: pick[0], light: pick[1].light, dark: pick[1].dark } : null;
}
/* 同值 token(两主题相同 → 不会失配 → 不该入表)也动态找,同样不写死值。 */
function sampleThemeConstant(css) {
  const raw = stripCssComments(css);
  const defs = { light: new Map(), dark: new Map() };
  const grab = (re, theme) => {
    let b;
    while ((b = re.exec(raw))) {
      const dre = /(--[\w-]+)\s*:\s*([^;]+);/g;
      let d;
      while ((d = dre.exec(b[1]))) {
        const n = norm(d[2].trim());
        if (n) defs[theme].set(d[1], n);
      }
    }
  };
  grab(/:root\s*\{([\s\S]*?)\n\}/g, "light");
  grab(/html\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/g, "dark");
  // 优先取「非真灰」的同值 token(排除原因唯一 = 同值);没有则退而取真灰同值的
  // (它同时满足两个排除条件,断言仍成立,只是原因不唯一 —— 注明即可)。
  let fallback = null;
  for (const [token, val] of defs.light) {
    const other = defs.dark.get(token);
    if (!other) continue;
    if (rgbKey(other) !== rgbKey(val) || other[3] !== val[3]) continue;
    if (!isTrueGrey(val)) return { token, rgb: rgbKey(val), grey: false };
    fallback ||= { token, rgb: rgbKey(val), grey: true };
  }
  return fallback;
}

/* ── selftest:双向红测(全部动态取样,零硬编码设计值)── */
function selftest() {
  const probes = [];
  const p = (name, expect, actual) =>
    probes.push({ name, ok: JSON.stringify(expect) === JSON.stringify(actual), expect, actual });

  const css = fs.readFileSync(TOKENS_CSS, "utf8");
  const table = buildThemeVaryingTable(css);

  // A. 表本身 —— 用动态取样的 token,断言「关系」而非具体色值
  const S = sampleThemeVarying(table, "--v5-success");
  p("动态取样:存在至少一个亮暗异值 token", true, !!S);
  if (S) {
    p(`取样 ${S.token} 的亮色值入表`, true, (table.get(S.light) || []).some((t) => t.token === S.token));
    p(`取样 ${S.token} 的暗色值入表`, true, (table.get(S.dark) || []).some((t) => t.token === S.token));
    p(`取样 ${S.token} 两主题取值不等`, true, S.light !== S.dark);
  }
  const C = sampleThemeConstant(css);
  p("动态取样:存在至少一个两主题同值 token", true, !!C);
  if (C) p(`同值 token ${C.token} → 不入表${C.grey ? "(该样本同时是真灰)" : ""}`, 0, (table.get(C.rgb) || []).length);
  // 下面两条用的是**测试语料常量**(非设计值):真灰属通用光影、#123456 不是任何 token
  p("真灰 #141414 不入表", 0, (table.get("20,20,20") || []).length);
  p("未知色 #123456 不入表", 0, (table.get("18,52,86") || []).length);

  // B. 🔴 阳性红测:各书写形式都必须被抓。语料由取样值现算,不写死设计值。
  const rgbArr = S ? S.light.split(",").map(Number) : null;
  const toHex = (a) => "#" + a.map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");
  const toHsl = (a) => {
    const [r, g, b] = a.map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const l = (mx + mn) / 2;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return `hsl(${h.toFixed(2)}, ${(s * 100).toFixed(2)}%, ${(l * 100).toFixed(2)}%)`;
  };
  if (rgbArr) {
    const HEX = toHex(rgbArr), RGB = S.light, HSL = toHsl(rgbArr);
    p("阳性 hex 形式", 1, scanText(`color: "${HEX}";`, "x.vue", table).length);
    p("阳性 rgb() 形式", 1, scanText(`color: rgb(${RGB});`, "x.vue", table).length);
    p("阳性 rgba() 变 alpha 形式", 1, scanText(`border: 1px solid rgba(${RGB},0.30);`, "x.vue", table).length);
    p("阳性 rgba() 带空格", 1, scanText(`background: rgba(${RGB.split(",").join(", ")}, 0.5);`, "x.vue", table).length);
    p("阳性 #RRGGBBAA 形式", 1, scanText(`color: ${HEX}4D;`, "x.vue", table).length);
    p("阳性 小写 hex", 1, scanText(`color: "${HEX.toLowerCase()}";`, "x.vue", table).length);
    p("阳性 hsl() 形式", 1, scanText(`color: ${HSL};`, "x.vue", table).length);
    p("阳性 hsla() 变 alpha", 1, scanText(`border: 1px solid ${HSL.replace("hsl(", "hsla(").replace(")", ", 0.3)")};`, "x.vue", table).length);
    p("norm(hsl) 与 hex 等价", norm(HEX)?.join(), norm(HSL)?.join());
  }

  // C. 🔴 阴性红测:干净/真灰/注释/token 引用必须 0(违例语料同样用取样值现算)
  if (S && rgbArr) {
    const HEX = toHex(rgbArr);
    p("阴性 var() 引用", 0, scanText(`color: var(${S.token});`, "x.vue", table).length);
    p("阴性 color-mix", 0, scanText(`border: color-mix(in srgb, var(${S.token}) 30%, transparent);`, "x.vue", table).length);
    p("阴性 块注释内的违例", 0, scanText(`/* color: ${HEX}; */`, "x.vue", table).length);
    p("阴性 行注释内的违例", 0, scanText(`// color: ${HEX};`, "x.vue", table).length);
    p("阴性 HTML 注释内的违例", 0, scanText(`<!-- ${HEX} -->`, "x.vue", table).length);
  }
  // 以下为**测试语料常量**(非设计值):真灰/纯白/不属任何 token 的色
  p("阴性 真灰遮罩", 0, scanText(`background: rgba(0,0,0,0.55);`, "x.vue", table).length);
  p("阴性 #FFFFFF", 0, scanText(`color: #FFFFFF;`, "x.vue", table).length);
  p("阴性 非 token 色 #C26658", 0, scanText(`color: "#C26658";`, "x.vue", table).length);

  // D. 豁免机制:命中必须能被豁免,且豁免不得误伤其它文件/其它色
  // 🔴 空值保护:取样失败时让本组 FAIL 并说明,**不得让整个 selftest 崩溃**
  //    (崩溃会掩盖其余 probe 的真实结论 —— 这正是 P-056 暴露的问题)
  if (!S || !rgbArr) {
    p("豁免机制(需取样成功才能测)", "sampled", "no-theme-varying-token");
  } else {
    const HEX = toHex(rgbArr);
    const otherHex = toHex(S.dark.split(",").map(Number)); // 另一主题值,用作「不跨色值」对照
    const hit = scanText(`color: "${HEX}";`, "src/a.vue", table)[0];
    if (!hit) {
      p("豁免机制:取样值应能被扫出", true, false);
    } else {
      p("豁免 file+literal 生效", true, isAllowed(hit, [{ file: "src/a.vue", literal: HEX, reason: "t" }]));
      p("豁免不跨文件", false, isAllowed(hit, [{ file: "src/b.vue", literal: HEX, reason: "t" }]));
      p("豁免不跨色值", false, isAllowed(hit, [{ file: "src/a.vue", literal: otherHex, reason: "t" }]));
    }
  }

  // E. allowlist 文件本身:每条必须有 reason(防静默绕过)
  const ex = loadAllowlist();
  p("allowlist 每条都有 reason", 0, ex.filter((e) => !e.reason || !String(e.reason).trim()).length);

  const fails = probes.filter((x) => !x.ok);
  console.log("=== token-copy sentinel selftest ===");
  for (const x of probes)
    console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : `  expect=${JSON.stringify(x.expect)} actual=${JSON.stringify(x.actual)}`}`);
  console.log(`\n${probes.length - fails.length}/${probes.length} pass`);
  process.exit(fails.length ? 1 : 0);
}

/* ── main ── */
if (process.argv.includes("--selftest")) selftest();

const table = buildThemeVaryingTable(fs.readFileSync(TOKENS_CSS, "utf8"));
const exemptions = loadAllowlist();
const all = [];
for (const f of walk(SRC)) {
  if (path.normalize(f) === path.normalize(TOKENS_CSS)) continue;
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  if (rel.startsWith("src/i18n/messages/")) continue;
  all.push(...scanText(fs.readFileSync(f, "utf8"), rel, table));
}
const violations = all.filter((h) => !isAllowed(h, exemptions));

if (process.argv.includes("--list")) {
  for (const h of all) console.log(`${isAllowed(h, exemptions) ? "ALLOW" : "VIOL "} ${h.file}:${h.line}  ${h.literal}  = ${h.tokens.join(" | ")}`);
}

if (violations.length) {
  console.error(`token-copy: ${violations.length} 处 token 色值字面副本(亮暗必失配)\n`);
  for (const h of violations)
    console.error(`  ${h.file}:${h.line}  ${h.literal}  = ${h.tokens.join(" | ")}\n     ${h.text}`);
  console.error(`\n修法:改 var(--token) 或 color-mix(in srgb, var(--token) N%, transparent)。`);
  console.error(`确属技法必需(canvas/二维码/第三方品牌色) → 写进 docs/TOKEN-COPY-ALLOWLIST.json 并附 reason。`);
  process.exit(1);
}
console.log(`token-copy: 0 违例(表内亮暗异值 token ${table.size} 色 · 豁免 ${exemptions.length} 条)`);
