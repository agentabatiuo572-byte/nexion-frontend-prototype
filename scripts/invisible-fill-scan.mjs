// 隐形填充扫描器 —— 找「显式上了背景色,但和父容器合成后几乎同色,且没有边框/阴影兜底」的元素。
// 起因:ee0b91e(零-border 批次)把 wallet-action-btn 的 border 删了,却把 bg 留在与父卡同值的
// --v5-surface-2 上 → 圆形 chip 隐形。同批次可能还有别的受害者。
// 判据用「合成后 Lab 色差 ΔE」不是字符串相等 —— 半透明底(如 alpha 0.2 的 brand-soft)字符串
// 永远不等于父的 rgb(),字符串判据会静默漏掉这一整类。
// 用法:
//   node invisible-fill-scan.mjs --selftest        # 双向红测
//   node invisible-fill-scan.mjs --sweep all       # 全 90 路由 × 亮暗双主题
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

// 端口来源:UNI_BASE_URL 优先,再退 BASE_URL(verify.sh 统一名)——只认前者会在非 5173 端口静默打到别的工程树。
const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const args = process.argv.slice(2);
const MODE = args.includes("--selftest") ? "selftest" : "sweep";
const SWEEP = args[args.indexOf("--sweep") + 1] === "all" ? "all" : "core";
const DE_THRESHOLD = 3.0; // ΔE < 3 ≈ 常人难辨
// --relaxed:完整性档 —— 去掉「必须有圆角」的要求、放宽尺寸上限。
// 默认档用圆角当「这是个 chip/按钮而非布局容器」的启发式,会漏掉直角徽章;
// 完整性档专门用来回答「我的过滤条件是不是把某类漏了」,误报率高,人工过一遍。
const RELAXED = args.includes("--relaxed");

// ── 页面内探针(纯 DOM,无依赖) ──
// 🔴 选择器必须覆盖「会自己上底色」的全部元素类型。首版漏了 input/textarea,
// 而 --v5-surface-3 的头号消费者恰恰是输入框 —— 整整一类被静默漏扫,
// 扫描器却报 0 命中(类别形状的洞 = 另一种假绿)。独立验收 agent 抓出。
const SEL = "uni-view,uni-text,uni-button,uni-input,uni-textarea,uni-picker,uni-label,div,span,button,input,textarea,label,a";

function probe(opts) {
  const deThreshold = opts.de;
  const relaxed = opts.relaxed;
  const SEL = opts.sel;
  const parseC = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  // 从祖先链自底向上合成,得到该元素实际呈现的颜色
  const effective = (el, includeSelf) => {
    const chain = [];
    let n = includeSelf ? el : el.parentElement;
    while (n) {
      const c = parseC(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) chain.push(c);
      n = n.parentElement;
    }
    let acc = { r: 255, g: 255, b: 255, a: 1 }; // 画布兜底
    for (let i = chain.length - 1; i >= 0; i--) acc = over(chain[i], acc);
    return acc;
  };
  const toLab = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const [R, G, B] = [f(r), f(g), f(b)];
    let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0;
    let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const g2 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    [X, Y, Z] = [g2(X), g2(Y), g2(Z)];
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  };
  const deltaE = (c1, c2) => {
    const a = toLab(c1), b = toLab(c2);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  };

  const hits = [];
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    const own = parseC(cs.backgroundColor);
    if (!own || own.a === 0) continue;              // 没显式上底色 → 不是本类缺陷
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;      // 装饰点/分隔线不算
    // ⚠️ 默认档的尺寸上限会漏掉「整宽」元素(分段控件外壳 / 地址行 / sparkline 底,
    // 宽度常 >300)——首轮就是这么漏报的。--relaxed 放宽到接近整屏宽再扫一遍。
    const maxW = relaxed ? 3000 : 300;
    const maxH = relaxed ? 600 : 200;
    if (r.width > maxW || r.height > maxH) continue;
    if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) continue; // 有边框兜底
    if (cs.boxShadow && cs.boxShadow !== "none") continue;                                  // 有阴影兜底
    if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) continue;
    // 默认档拿「有圆角」当「这是 chip/按钮而非布局容器」的启发式;完整性档去掉该要求。
    if (!relaxed && parseFloat(cs.borderTopLeftRadius) === 0) continue;
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;

    const mine = effective(el, true);
    const parent = effective(el, false);
    const de = deltaE(mine, parent);
    if (de >= deThreshold) continue;

    // 父容器实际呈现色必须一起报 —— 只报元素自己的 bg 会让人误判成「token 阶梯不够」,
    // 实际可能是「这个元素压根贴在页面底色上而不是卡片上」。归因错方向的坑踩过一次。
    const rgb = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
    let painted = el.parentElement, pEl = null;
    while (painted) {
      const b = parseC(getComputedStyle(painted).backgroundColor);
      if (b && b.a > 0) { pEl = painted; break; }
      painted = painted.parentElement;
    }
    const pcls = pEl ? String(pEl.className || "").split(" ").filter(Boolean).slice(0, 2).join(".") : "";
    const cls = String(el.className || "").split(" ").filter(Boolean).slice(0, 2).join(".");
    hits.push({
      sig: `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}|${Math.round(r.width)}x${Math.round(r.height)}|r${cs.borderTopLeftRadius}`,
      de: Math.round(de * 10) / 10,
      bg: cs.backgroundColor,
      selfEff: rgb(mine),
      parentEff: rgb(parent),
      parentDecl: pEl ? getComputedStyle(pEl).backgroundColor : "(none — 画布)",
      parentSig: pEl ? `${pEl.tagName.toLowerCase()}${pcls ? "." + pcls : ""}` : "(canvas)",
      text: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 24),
      size: `${Math.round(r.width)}x${Math.round(r.height)}`,
    });
  }
  return hits;
}

function routesOf(mode) {
  let raw = readFileSync("src/pages.json", "utf8").replace(/\/\/[^\n"]*$/gm, "");
  const pj = JSON.parse(raw);
  const TABS = ["pages/index/index", "pages/earn/earn", "pages/store/store", "pages/team/team", "pages/me/me"];
  const known = new Set(pj.pages.map((p) => p.path));
  const core = TABS.filter((t) => known.has(t));
  if (mode === "all") return [...new Set([...core, ...pj.pages.map((p) => p.path)])];
  return core;
}

async function landedFrame(page) {
  for (let i = 0; i < 20; i++) {
    const child = page.frames().find((f) => f !== page.mainFrame());
    if (child) return child;
    if (await page.$("#app")) return page.mainFrame();
    await page.waitForTimeout(150);
  }
  return page.mainFrame();
}

// 阳性:① 圆角 chip 底色与父完全同值 ② 半透明底合成后几乎同色 ③ **输入框**与父同色
// (③ 专门红测 input/textarea 覆盖 —— 首版选择器漏了这一类,surface-3 的头号消费者就是它)
const FIXTURE_BAD = `<!doctype html><body style="margin:0">
<div style="background:#1F1F1F;padding:20px">
  <div id="b1" style="width:44px;height:44px;border-radius:999px;background:#1F1F1F"></div>
  <div id="b2" style="width:44px;height:44px;border-radius:999px;background:rgba(255,255,255,0.015)"></div>
  <input id="b3" style="width:200px;height:44px;border-radius:8px;border:0;background:#1F1F1F">
</div></body>`;
// 阴性:① 底色明显不同 ② 与父同底但有 border 兜底 ③ 与父同底但有 shadow 兜底 ④ 无圆角的布局块
const FIXTURE_CLEAN = `<!doctype html><body style="margin:0">
<div style="background:#1F1F1F;padding:20px">
  <div style="width:44px;height:44px;border-radius:999px;background:#9EDC1D"></div>
  <div style="width:44px;height:44px;border-radius:999px;background:#1F1F1F;border:1px solid #555"></div>
  <div style="width:44px;height:44px;border-radius:999px;background:#1F1F1F;box-shadow:0 0 4px #000"></div>
  <div style="width:44px;height:44px;background:#1F1F1F"></div>
</div></body>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(10000);
let exitCode = 0;

if (MODE === "selftest") {
  await page.setContent(FIXTURE_BAD, { waitUntil: "load" });
  const bad = await page.evaluate(probe, { de: DE_THRESHOLD, relaxed: RELAXED, sel: SEL });
  await page.setContent(FIXTURE_CLEAN, { waitUntil: "load" });
  const clean = await page.evaluate(probe, { de: DE_THRESHOLD, relaxed: RELAXED, sel: SEL });
  const gotInput = bad.some((h) => /^input/.test(h.sig));
  if (bad.length !== 3) { console.error(`SELFTEST FAIL(假阴):阳性 fixture 应中 3 个,实中 ${bad.length}`); exitCode = 1; }
  if (!gotInput) { console.error(`SELFTEST FAIL(类别洞):input 型隐形未被命中 —— 选择器又漏了输入框`); exitCode = 1; }
  if (clean.length !== 0) { console.error(`SELFTEST FAIL(假阳):干净 fixture 报了 ${clean.map((h) => h.sig).join(", ")}`); exitCode = 1; }
  if (!exitCode) console.log(`SELFTEST PASS:阳性 3/3 命中(实心同色 / 半透明近似 / **input 型**);阴性 4 项(异色/有边框/有阴影/无圆角)全 0 误报`);
} else {
  const routes = routesOf(SWEEP);
  const THEMES = ["dark", "light"];
  const findings = new Map();
  let scanned = 0, crashed = 0, candidates = 0;

  for (const route of routes) {
    try {
      await page.goto(`${BASE}/?nx_device=off#/${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const ui = await landedFrame(page);
      const landed = (await page.evaluate(() => location.hash)).replace(/^#\//, "").split("?")[0] || route;
      for (const theme of THEMES) {
        await ui.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
        await page.waitForTimeout(120);
        const hits = await ui.evaluate(probe, { de: DE_THRESHOLD, relaxed: RELAXED, sel: SEL });
        // 样本量:该主题下被真正考察过的候选元素数
        candidates += await ui.evaluate((a2) => [...document.querySelectorAll(a2.sel)].filter((el) => {
          const rx = a2.relaxed;
          const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
          const m = String(cs.backgroundColor).match(/rgba?\(([^)]+)\)/);
          const a = m ? (m[1].split(",").length > 3 ? parseFloat(m[1].split(",")[3]) : 1) : 0;
          return a > 0 && r.width >= 8 && r.height >= 8 && r.width <= (rx ? 3000 : 300) && r.height <= (rx ? 600 : 200) && (rx || parseFloat(cs.borderTopLeftRadius) > 0);
        }).length, { sel: SEL, relaxed: RELAXED });
        for (const h of hits) {
          const fp = `${landed}|${theme}|${h.sig}`;
          if (!findings.has(fp)) findings.set(fp, { ...h, route: landed, theme });
        }
      }
      scanned++;
    } catch (e) {
      crashed++;
      console.error(`  [crash] ${route} — ${String(e).slice(0, 90)}`);
    }
  }

  const all = [...findings.values()].sort((a, b) => a.de - b.de);
  console.log(`\n━━ 隐形填充扫描 ━━`);
  // 🔴 防假绿:候选元素为 0 说明页面根本没取到(帧选错 / 应用没渲染),
  // 此时「0 处隐形」是空集全过,不是干净。判据失效必须报错,不许当 PASS。
  // (实测踩过:同一份代码 default 档查到 2310 个,relaxed 档却报 0 个候选。)
  if (candidates === 0) {
    console.error(`❌ 判据失效:考察候选元素 0 个 —— 页面未渲染或取错 frame,本次结果不可信,拒绝给出结论。`);
    await browser.close();
    process.exit(3);
  }
  console.log(`路由 ${scanned}/${routes.length} 扫过(崩 ${crashed})· 双主题 · 考察候选元素 ${candidates} 个 · ΔE 阈值 ${DE_THRESHOLD} · 档位 ${RELAXED ? "relaxed(去圆角要求+放宽尺寸)" : "default"}`);
  if (!all.length) {
    console.log(`结果:0 处隐形填充。`);
  } else {
    console.log(`结果:${all.length} 处可疑(ΔE 越小越隐形):\n`);
    for (const h of all) {
      console.log(`  ΔE=${String(h.de).padEnd(4)} [${h.theme}] ${h.route}`);
      console.log(`         元素 ${h.sig}  自身底=${h.bg}  合成后=${h.selfEff}${h.text ? `  文字="${h.text}"` : ""}`);
      console.log(`         贴在   ${h.parentSig}  声明底=${h.parentDecl}  合成后=${h.parentEff}`);
    }
    exitCode = 2;
  }
}

await browser.close();
process.exit(exitCode);
