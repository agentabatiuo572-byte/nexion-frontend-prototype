// DOM/CSS QA 运行时体检哨兵(vibe-playbook P1-A · 2026-07-22 主人批准)
// 5 项确定性探针:① 横向溢出 ② 微型文字(<10px gate;10-12px 普查不 gate) ③ 触控目标 <44pt
// ④ 图片破损 ⑤ 按钮类交互控件无可达名。事实层不打分(playbook 边界:浏览器 QA 是事实,设计判断归评分层)。
// 门策略:存量违例入 docs/DOM-QA-LEDGER.json(黄灯台账);ledger 之外的新指纹 = exit 1(新页/改动页 hard gate)。
// 豁免:人工审阅后 --update-ledger 收编,并在 entry 加 qaOk:"理由"(等价 qa-ok 豁免阀)。
// 用法:
//   node scripts/dom-qa.mjs --selftest                   # 双向红测:阳性 fixture 必中全部 5 类,干净 fixture 0 gate
//   node scripts/dom-qa.mjs --sweep core                 # tabBar+首页(verify 默认档)
//   node scripts/dom-qa.mjs --sweep all                  # pages.json 全 88 页(audit/P4 用)
//   node scripts/dom-qa.mjs --sweep core --update-ledger # 重建基线(人工审阅后)
// 同源双胞胎:Nexion-admin-prototype/scripts/dom-qa-probe.mjs(agent-browser 版);改 PROBE 逻辑两边同步。
import { chromium } from "playwright";
import { scopeRoutes, mapRoutes, settleNetwork } from "./lib/probe-routes.mjs";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { assertSweepCoverage } from "./lib/probe-coverage.mjs";

// 端口来源:UNI_BASE_URL 优先,再退 BASE_URL(verify.sh 与其余运行时探针的统一名)——
// 只认前者时,`BASE_URL=<非 5173> bash scripts/verify.sh`(worktree 自测必需)会静默打到 5173 上的**别的工程树**。
const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const LEDGER_PATH = "docs/DOM-QA-LEDGER.json";
const args = process.argv.slice(2);
const MODE = args.includes("--selftest") ? "selftest" : "sweep";
const SWEEP = args[args.indexOf("--sweep") + 1] === "all" ? "all" : "core";
const UPDATE = args.includes("--update-ledger");

// ── 页面内探针(纯 DOM,无依赖;admin 双胞胎复用 probe.toString()) ──
function probe(tapMin) {
  // tapMin:移动端 44(《07》mobile-first);桌面 console(admin 双胞胎)传 24(WCAG 2.2 AA 2.5.8)
  const GATE_FONT = 10, CENSUS_FONT = 12, TAP = tapMin || 44, EDGE = 8;
  const out = [];
  const seen = new Set();
  const push = (check, sig, detail, sev) => {
    const k = check + "|" + sig;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ check, sig, detail, sev: sev || "gate" });
  };
  const clsOf = (el) => {
    const raw = typeof el.className === "string" ? el.className : (el.getAttribute && el.getAttribute("class")) || "";
    return raw.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
  };
  const sig = (el) => {
    const c = clsOf(el);
    return el.tagName.toLowerCase() + (c ? "." + c : "") + (el.getAttribute("aria-label") ? "[aria]" : "");
  };
  const vis = (el) => {
    try {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity < 0.05) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0.5 && r.height > 0.5;
    } catch {
      return false;
    }
  };
  const doc = document.scrollingElement || document.documentElement;

  // ① 横向溢出(页面级 1 条 + 前 5 个越界元素辅助定位)
  if (doc.scrollWidth > doc.clientWidth + 1) {
    const off = [];
    for (const el of document.querySelectorAll("body *")) {
      if (off.length >= 5) break;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > doc.clientWidth + EDGE && vis(el)) off.push(sig(el));
    }
    push("overflow-x", "page", `scrollWidth ${doc.scrollWidth} > clientWidth ${doc.clientWidth}; 越界: ${off.join(", ") || "n/a"}`);
  }

  const all = Array.from(document.querySelectorAll("body *"));

  // ② 微型文字(自有文本节点才算,防父容器连坐)
  for (const el of all) {
    if (!vis(el)) continue;
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length >= 2);
    if (!ownText) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < GATE_FONT) push("tiny-text", sig(el), `font-size ${fs}px < ${GATE_FONT}px: "${el.textContent.trim().slice(0, 24)}"`);
    else if (fs < CENSUS_FONT) push("small-text", sig(el), `font-size ${fs}px(10-12 普查,9 档过渡期不 gate)`, "info");
  }

  // ③⑤ 交互候选:显式交互标签/role + cursor:pointer
  const isCand = (el) => {
    const t = el.tagName.toLowerCase();
    if (["a", "button", "uni-button", "input", "uni-input", "select", "textarea"].includes(t)) return true;
    const role = el.getAttribute("role");
    if (role && ["button", "link", "tab", "switch", "checkbox", "menuitem"].includes(role)) return true;
    try {
      return getComputedStyle(el).cursor === "pointer";
    } catch {
      return false;
    }
  };
  const cands = all.filter((el) => vis(el) && isCand(el));
  const candSet = new Set(cands);
  for (const el of cands) {
    if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
    const r = el.getBoundingClientRect();
    // 目标折叠:3 层内祖先也是交互候选 → 子元素(图标/文字/装饰)不独立计,只计最外层目标本身
    let anc = el.parentElement, inTarget = false;
    for (let i = 0; i < 3 && anc; i++, anc = anc.parentElement) {
      if (candSet.has(anc)) { inTarget = true; break; }
    }
    if (!inTarget && (r.width < TAP || r.height < TAP)) {
      push("tap-target", sig(el), `${Math.round(r.width)}×${Math.round(r.height)} < ${TAP}pt`);
    }
    const t = el.tagName.toLowerCase();
    const btnish = !inTarget && (["button", "uni-button", "a"].includes(t) || ["button", "link", "tab"].includes(el.getAttribute("role") || ""));
    if (btnish) {
      const alt = el.querySelector && el.querySelector("img[alt]");
      const name = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim() || (alt ? alt.getAttribute("alt").trim() : "");
      if (!name) push("no-name", sig(el), "按钮类控件无可达名(aria-label/文本/title/img alt 全空)");
    }
  }

  // ④ 图片破损
  for (const img of document.querySelectorAll("img")) {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src") && vis(img.parentElement || img)) {
      push("img-broken", sig(img.parentElement || img), `src=${(img.getAttribute("src") || "").slice(0, 60)}`);
    }
  }
  return out;
}

// ── 路由源:src/pages.json 单一真源 ──
function routesOf(mode) {
  let raw = readFileSync("src/pages.json", "utf8");
  raw = raw.replace(/\/\/[^\n"]*$/gm, ""); // 容忍行尾注释
  const pj = JSON.parse(raw);
  // 本工程是自绘 chassis-nav tabbar,pages.json 无原生 tabBar 配置(2026-07-22 实测)→ 5 tab 显式清单(=P4 baseline 口径)
  const TABS = ["pages/index/index", "pages/earn/earn", "pages/store/store", "pages/team/team", "pages/me/me"];
  const native = (pj.tabBar && pj.tabBar.list ? pj.tabBar.list : []).map((x) => x.pagePath);
  const known = new Set(pj.pages.map((p) => p.path));
  const core = [...new Set([...TABS, ...native])].filter((t) => known.has(t));
  if (mode === "all") return [...new Set([...core, ...pj.pages.map((p) => p.path)])];
  return core;
}

const FIXTURE_BAD = `<!doctype html><body style="margin:0;font-family:sans-serif">
<div style="width:150vw;height:10px;background:#eee"></div>
<span style="font-size:8px">tiny tiny text here</span>
<div style="font-size:11px">census small text</div>
<button style="width:20px;height:20px;padding:0;border:0"></button>
<img src="/definitely-missing-fixture-xyz.png" width="40" height="40">
</body>`;
const FIXTURE_CLEAN = `<!doctype html><body style="margin:0;font-family:sans-serif">
<p style="font-size:15px;max-width:90vw">clean paragraph text</p>
<button aria-label="确认" style="width:120px;height:48px;font-size:15px">确认</button>
</body>`;

async function landedFrame(page) {
  // ?nx_device=off 应直渲 app;若仍套 device-shell iframe,探针进子 frame(兜底)
  for (let i = 0; i < 20; i++) {
    const child = page.frames().find((f) => f !== page.mainFrame());
    if (child) return child;
    if (await page.$("#app")) return page.mainFrame();
    await page.waitForTimeout(150);
  }
  return page.mainFrame();
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(10000);
let exitCode = 0;

if (MODE === "selftest") {
  // 双向红测:阳性 fixture 必中全部 5 类 gate;干净 fixture 0 gate
  await page.setContent(FIXTURE_BAD, { waitUntil: "load" });
  await page.waitForTimeout(400); // 等 img 加载失败落定
  const bad = await page.evaluate(probe);
  const gateChecks = new Set(bad.filter((f) => f.sev === "gate").map((f) => f.check));
  const want = ["overflow-x", "tiny-text", "tap-target", "img-broken", "no-name"];
  const missing = want.filter((c) => !gateChecks.has(c));
  const census = bad.some((f) => f.check === "small-text" && f.sev === "info");
  await page.setContent(FIXTURE_CLEAN, { waitUntil: "load" });
  const clean = (await page.evaluate(probe)).filter((f) => f.sev === "gate");
  if (missing.length) { console.error(`SELFTEST FAIL(假阴):阳性 fixture 未命中 ${missing.join(",")}`); exitCode = 1; }
  if (!census) { console.error("SELFTEST FAIL:10-12px 普查项未产出 info"); exitCode = 1; }
  if (clean.length) { console.error(`SELFTEST FAIL(假阳):干净 fixture 报了 ${clean.map((f) => f.check + ":" + f.sig).join(", ")}`); exitCode = 1; }
  if (!exitCode) console.log("SELFTEST PASS:5/5 阳性命中 + 普查 info + 干净 fixture 0 gate");
} else {
  const allRoutes = routesOf(SWEEP);
  // 路由级范围(包 ax):PROBE_ROUTES 有值 → 只扫「射程 ∩ 受影响路由」;未设 = 全量。ledger 只拦「新指纹」,不比消失,缩范围不会假红。
  const SCOPE = scopeRoutes(allRoutes, "DOM-QA");
  const routes = SCOPE.routes;
  if (SCOPE.scoped && !routes.length) { console.log(`DOM-QA PASS:scoped 0/${allRoutes.length} 路由在受影响范围内,本轮无可扫(末轮全量会扫)`); await browser.close(); process.exit(0); }
  // 范围模式一律不许改台账(与 zero-border / theme / tap 同口径;tester-F F-13):本门 --update-ledger 虽是 merge 语义不丢存量,
  //   但会用部分扫描覆写 smallTextCensus,且「只扫半场就收编」本身就不该发生。
  if (SCOPE.scoped && UPDATE) { console.error("DOM-QA:PROBE_ROUTES 范围模式下不许 --update-ledger(只扫了一部分路由)。不设 PROBE_ROUTES 全量跑再收编。"); await browser.close(); process.exit(2); }
  const findings = [];
  const completedRoutes = [];
  const crashes = [];
  const landings = {};
  const witnesses = {};
  const pageErrors = {};
  // 包 ax:N 条 lane(各自独立 context / 渲染进程)并行各扫一条路由(PROBE_CONCURRENCY,默认 3);每条路由仍是 goto → 1400ms → probe 的原节奏,判据不动;结果按路由原顺序合并。
  const timeoutSet = new WeakSet();
  const perRoute = await mapRoutes(browser, routes, async (lane, route, _i, lanes) => {
    if (!timeoutSet.has(lane)) { lane.setDefaultTimeout(10000); timeoutSet.add(lane); }
    const url = `${BASE}/?nx_device=off#/${route}`;
    const routePageErrors = [];
    const onPageError = (error) => routePageErrors.push(String(error));
    lane.on("pageerror", onPageError);
    try {
      await lane.goto(url, { waitUntil: "domcontentloaded" });
      await settleNetwork(lane, 5000, lanes); // 包 ax:并行时 dev server 忙,先等本页网络空闲(有界),再走原来的固定等待;实际 1 lane 时空转(R2-03)
      await lane.waitForTimeout(1400); // 渲染/动效落定
      const ui = await landedFrame(lane);
      const landed = (await lane.evaluate(() => location.hash)).replace(/^#\//, "").split("?")[0];
      const res = await ui.evaluate(probe);
      const witness = await ui.evaluate(() => ({
        appChildren: document.querySelector("#app")?.childElementCount ?? 0,
        iframeCount: document.querySelectorAll("iframe").length,
        bodyElements: document.querySelectorAll("body *").length,
        bodyTextLength: (document.body?.innerText || "").trim().length,
      }));
      let debug = null;
      if (process.env.DOM_QA_DEBUG) {
        const g = res.filter((f) => f.sev === "gate").length, i = res.length - g;
        const nodes = await ui.evaluate(() => document.querySelectorAll("body *").length);
        debug = `  ${route} → landed=${landed} nodes=${nodes} gate=${g} info=${i}`;
      }
      return { route, ok: true, landed, res, witness, routePageErrors, debug };
    } catch (e) {
      return { route, ok: false, err: String(e).slice(0, 120) };
    } finally {
      lane.off("pageerror", onPageError);
    }
  }, { context: { viewport: { width: 390, height: 844 } } });
  for (const r of perRoute) {
    const route = r?.route ?? "?";
    if (!r || r.error || !r.ok) {
      crashes.push(route);
      findings.push({ check: "probe-crash", sig: "page", detail: String(r?.err ?? r?.error ?? "unknown").slice(0, 120), sev: "gate", route, fp: `${route}|probe-crash|page` });
      continue;
    }
    landings[route] = r.landed;
    witnesses[route] = r.witness;
    pageErrors[route] = r.routePageErrors;
    completedRoutes.push(route);
    if (r.debug) console.log(r.debug);
    for (const f of r.res) findings.push({ ...f, route: r.landed, fp: `${r.landed}|${f.check}|${f.sig}` });
  }
  let coverageFailed = false;
  try {
    assertSweepCoverage({ routes, completedRoutes, crashes, landings, witnesses, pageErrors });
  } catch (error) {
    coverageFailed = true;
    exitCode = 1;
    console.error(`DOM-QA COVERAGE FAIL:${error.message}`);
    console.error("探针覆盖失败时禁止写入 ledger；修复服务器/路由/探针后重跑。");
  }
  // 按指纹去重(多路由 redirect 落同页)
  const uniq = new Map();
  for (const f of findings) if (!uniq.has(f.fp)) uniq.set(f.fp, f);
  const all = [...uniq.values()];
  const gates = all.filter((f) => f.sev === "gate");
  const infos = all.filter((f) => f.sev === "info");

  const ledger = existsSync(LEDGER_PATH) ? JSON.parse(readFileSync(LEDGER_PATH, "utf8")) : { generatedAt: null, note: "", entries: [] };
  const known = new Set(ledger.entries.map((e) => e.fp));
  const fresh = gates.filter((f) => !known.has(f.fp));

  if (coverageFailed) {
    // Fail closed: probe crashes and zero/partial coverage are infrastructure failures,
    // never acceptable ledger entries.
  } else if (UPDATE) {
    const merged = new Map(ledger.entries.map((e) => [e.fp, e]));
    for (const f of gates) if (!merged.has(f.fp)) merged.set(f.fp, { fp: f.fp, route: f.route, check: f.check, sig: f.sig, detail: f.detail, since: new Date().toISOString().slice(0, 10) });
    mkdirSync("docs", { recursive: true });
    writeFileSync(LEDGER_PATH, JSON.stringify({
      generatedAt: new Date().toISOString(),
      note: "DOM-QA 存量黄灯台账(vibe-playbook P1-A)。entry 加 qaOk:'理由' = 人工豁免;删 entry = 要求修复。gate 只拦 ledger 外新指纹。",
      smallTextCensus: infos.length,
      entries: [...merged.values()],
    }, null, 2));
    console.log(`LEDGER UPDATED:${merged.size} 条存量(其中本轮新收 ${fresh.length});small-text 普查 ${infos.length} 条`);
  } else if (fresh.length) {
    console.error(`DOM-QA FAIL:${fresh.length} 条新违例(不在 ledger):`);
    for (const f of fresh) console.error(`  [${f.check}] ${f.route} :: ${f.sig} — ${f.detail}`);
    console.error(`(确认为合法例外 → --update-ledger 收编并在 entry 写 qaOk 理由;否则修复)`);
    exitCode = 1;
  } else {
    console.log(`DOM-QA PASS:${routes.length} 路由${SCOPE.scoped ? `(scoped ${routes.length}/${allRoutes.length})` : ""},gate ${gates.length} 条全在 ledger(存量),新违例 0;small-text 普查 ${infos.length} 条`);
  }
}

await browser.close();
process.exit(exitCode);
