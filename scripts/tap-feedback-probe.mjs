// tap 目标探针(C3 批次 2026-07-23):真实 click 监听器 → 尺寸 ≥44pt + 按下可感知反馈
// 为什么另起一个而不是扩 dom-qa:dom-qa 靠「显式交互标签/role + cursor:pointer」找候选,
// 而 uni-app 的 <view @click> 编译成 <uni-view> 且不带 cursor:pointer → 那条路对本工程系统性漏检。
// 本探针在页面脚本前 hook addEventListener,拿到的是**运行时真注册了 click 的元素**,无启发式。
//
// 🔴 方法纪律(C3 任务书):按下反馈必须 CDP CSS.forcePseudoState 实测,
//    不得枚举 document.styleSheets —— CSS Nesting 下 CSSStyleRule 也带 .cssRules,
//    朴素遍历会跳过 selectorText 造成「全站零按下反馈」的假 P0(见 b1-skeptic-completeness §0)。
//
// 两个口径各取一端(故意不同):
//   · 尺寸  → 只计**最外层** tap 元素(热区归外层;子图标/文字不独立计)
//   · 反馈  → 只计**叶子** tap 元素(用户按的是叶子;外层 opacity 反馈会继承下来,叶子照样测得到)
//
// 用法:
//   node scripts/tap-feedback-probe.mjs --selftest        # 双向红测
//   node scripts/tap-feedback-probe.mjs                   # 5 tab(verify 默认档)
//   node scripts/tap-feedback-probe.mjs --sweep all       # pages.json 全 88 页
//   node scripts/tap-feedback-probe.mjs --update-ledger   # 人工审阅后重建基线
import { chromium } from "playwright";
import { scopeRoutes, mapRoutes } from "./lib/probe-routes.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// 端口来源:UNI_BASE_URL 优先,再退 BASE_URL(verify.sh 统一名)——只认前者会在非 5173 端口静默打到别的工程树。
const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const LEDGER_PATH = "docs/TAP-FEEDBACK-LEDGER.json";
const args = process.argv.slice(2);
const SELFTEST = args.includes("--selftest");
const SWEEP_ALL = args[args.indexOf("--sweep") + 1] === "all";
const UPDATE = args.includes("--update-ledger");
const TAP_MIN = 44;

// ── 注入:hook addEventListener 抓真 tap 元素 ──
// 🔴 只认 click,**不认 touchstart**。首版把 touchstart 也收进来,结果 app-chassis 的
//    下拉刷新滚动容器(`.nx-content.nx-scroll` 挂着 @touchstart)进了 tap 集合 ——
//    它是全部 78 条 chassis 路由上每个正文元素的祖先,于是尺寸判据 `!hasTapAncestor`
//    对页面正文恒为 false,**整个尺寸门形同虚设**(能进检查的只剩 chassis 自己的
//    header 图标和 tabbar)。手势容器不是「点击目标」,收它有害无益。
//    独立验收 agent 2026-07-23 抓出;红测锚见 selftest 的 #gesture-host。
const HOOK = () => {
  const orig = EventTarget.prototype.addEventListener;
  const seen = new WeakSet();
  const list = [];
  window.__tapList = list;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (type === "click" && this instanceof Element && !seen.has(this)) {
      seen.add(this);
      list.push(this);
    }
    return orig.call(this, type, fn, opts);
  };
};

// ── 页面内:标记 + 分类,返回待测清单 ──
function markTargets(tapMin) {
  // 可见 = 在 DOM 里、有尺寸、没被隐藏或禁点。
  // 🔴 刻意**不做视口内判定**:页面绝大多数内容在首屏之外,滚动即可点 —— 一版用
  //    elementFromPoint 做命中测试,把 1443 个目标砍到 225,84% 是假阴。
  //    弹层组件本工程一律 v-if(不在 DOM 即不计),不需要靠视口判定兜。
  // visibility 与 pointer-events 都是继承属性,查自身的 computed 值即已覆盖祖先影响;
  // opacity 不继承,得走祖先链。
  const vis = (el) => {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0.5 || r.height <= 0.5) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.pointerEvents === "none") return false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (+getComputedStyle(n).opacity < 0.05) return false;
    }
    return true;
  };
  const clsOf = (el) => {
    const raw = typeof el.className === "string" ? el.className : el.getAttribute("class") || "";
    return raw.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
  };
  const sig = (el) => {
    const c = clsOf(el);
    return el.tagName.toLowerCase() + (c ? "." + c : "") + (el.getAttribute("aria-label") ? "[aria]" : "");
  };

  const live = (window.__tapList || []).filter(vis);
  const liveSet = new Set(live);
  document.querySelectorAll("[data-tapprobe]").forEach((el) => el.removeAttribute("data-tapprobe"));

  const out = [];
  live.forEach((el, i) => {
    el.setAttribute("data-tapprobe", String(i));
    let anc = el.parentElement, hasTapAncestor = false;
    while (anc) {
      if (liveSet.has(anc)) { hasTapAncestor = true; break; }
      anc = anc.parentElement;
    }
    const hasTapDescendant = Array.from(el.querySelectorAll("*")).some((d) => liveSet.has(d));
    const r = el.getBoundingClientRect();
    const disabled = el.disabled === true || el.getAttribute("aria-disabled") === "true";
    out.push({
      i,
      sig: sig(el),
      w: Math.round(r.width),
      h: Math.round(r.height),
      outermost: !hasTapAncestor,
      leaf: !hasTapDescendant,
      disabled,
      // 面板/遮罩容器:铺满且极高 —— 这类 @click.stop 只为阻止冒泡,反馈无意义
      scrim: r.width >= innerWidth * 0.9 && r.height >= 300,
      text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 28),
      tooSmall: !hasTapAncestor && !disabled && (r.width < tapMin || r.height < tapMin),
    });
  });
  return out;
}

// 🔴 读值前必须把过渡压到 0。带 `transition: opacity .15s` 的元素在 forcePseudoState 之后
//    立刻读 computed，拿到的是过渡**起点**(旧值)—— 首跑因此把 `active:opacity-70 transition-opacity`
//    这类明明有反馈的元素判成「零反馈」。压过渡比逐元素 sleep 250ms 快 900 倍，且终值不变。
const NO_TRANSITION = "*,*::before,*::after{transition-duration:0s !important;transition-delay:0s !important}";

// 可感知反馈 = :active 下这些属性任一发生变化
const FEEDBACK_PROPS = ["opacity", "transform", "backgroundColor", "filter", "boxShadow", "color", "borderColor", "scale"];
// 单参解构:page.evaluate 只接受一个 arg,写成 (idx, props) 会让 idx 收到整个数组 → 选择器永远查不中
const readStyle = ([idx, props]) => {
  const el = document.querySelector(`[data-tapprobe="${idx}"]`);
  if (!el) return null;
  const s = getComputedStyle(el);
  const o = {};
  for (const p of props) o[p] = s[p];
  return o;
};

async function probeRoute(page, cdp, route, idx) {
  // 🔴 query 里带一个每轮变化的值,强制**整页重载**。SPA 只改 hash 不会重载,
  //    一次弹出的 sheet / celebration overlay 会跟着后面所有路由跑,
  //    首跑就因此把一个 tradein 关闭按钮记进 68 个路由、milestone 卡片记进 75 个。
  //    重载同时让 addInitScript 的 hook 重新注入,__tapList 不跨路由累积。
  const url = `${BASE}/?nx_device=off&r=${idx}#/${route}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // 包 ax:这里**不加** settleNetwork —— 多等 1-2s 会跨过 App.vue 4s 轮询弹出的 milestone 庆祝层,把它的元素算进 tap 目标,
  //   目标数随时序抖(包 az 后奖牌卡已不挂 click,不再进集合;但庆祝层本身仍会改变页面上可见的目标集);
  //   原 1200ms 窗口下并行 3 路实测目标数与串行一致(165),不需要补等。
  await page.waitForTimeout(1200);
  await page.addStyleTag({ content: NO_TRANSITION });
  const targets = await page.evaluate(markTargets, TAP_MIN);
  if (!targets.length) return { route, targets: [], noFeedback: [], tooSmall: [] };

  const noFeedback = [];
  for (const t of targets) {
    if (!t.leaf || t.disabled || t.scrim) continue;
    if (!(await hasFeedback(page, cdp, t.i))) noFeedback.push(t);
  }
  return { route, targets, noFeedback, tooSmall: targets.filter((t) => t.tooSmall) };
}

// 元素自身有 :active 变化 → 有反馈;没有再看祖先链。
// 🔴 真实浏览器按下时 :active 会应用到**整条祖先链**,反馈写在父容器上、click 绑在内层
// <text> 上的写法(checkout 的主 CTA 就是)用户明明看得见变化,只测元素自己会误报。
// 祖先只在自身无变化时才查(违例候选才付这个开销),深度 4 层够覆盖 uni 的包装层。
async function hasFeedback(page, cdp, idx) {
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
  const sels = [`[data-tapprobe="${idx}"]`];
  const before = await page.evaluate(readStyle, [idx, FEEDBACK_PROPS]);
  if (!before) return true; // 读不到就不误判成违例
  const probe = async (sel, readIdx) => {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
    if (!nodeId) return false;
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] });
    const after = await page.evaluate(readStyle, [readIdx, FEEDBACK_PROPS]);
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
    return !!after && FEEDBACK_PROPS.some((p) => before[p] !== after[p]);
  };
  if (await probe(sels[0], idx)) return true;

  const ancCount = await page.evaluate((i) => {
    document.querySelectorAll("[data-tapanc]").forEach((e) => e.removeAttribute("data-tapanc"));
    const el = document.querySelector(`[data-tapprobe="${i}"]`);
    let n = el && el.parentElement, d = 0;
    for (; n && d < 4 && n !== document.body; n = n.parentElement, d++) n.setAttribute("data-tapanc", String(d));
    return d;
  }, idx);
  for (let d = 0; d < ancCount; d++) {
    // 强制祖先 :active,但仍读**叶子自己**的 computed —— 父的 opacity/transform 会连带作用到叶子,
    // 这正是用户看到的东西
    if (await probe(`[data-tapanc="${d}"]`, idx)) return true;
    // 父自身的视觉变化(opacity 不继承到 computed,但视觉上整块都会变)也算
    const ancBefore = await page.evaluate(([sel, props]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const s = getComputedStyle(el);
      const o = {};
      for (const p of props) o[p] = s[p];
      return o;
    }, [`[data-tapanc="${d}"]`, FEEDBACK_PROPS]);
    if (!ancBefore) continue;
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-tapanc="${d}"]` });
    if (!nodeId) continue;
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] });
    const ancAfter = await page.evaluate(([sel, props]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const s = getComputedStyle(el);
      const o = {};
      for (const p of props) o[p] = s[p];
      return o;
    }, [`[data-tapanc="${d}"]`, FEEDBACK_PROPS]);
    await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] });
    if (ancAfter && FEEDBACK_PROPS.some((p) => ancBefore[p] !== ancAfter[p])) return true;
  }

  // 最后看后代:反馈也可以挂在内层(`.card:active .card__body{opacity:.85}`)——
  // trial-hero-banner 就必须这么写,它的 root 被入场动画锁着 opacity/transform。
  // 强制的仍是元素自己的 :active,只是改看子树里有没有东西跟着变。
  const kids = await page.evaluate((i) => {
    document.querySelectorAll("[data-tapkid]").forEach((e) => e.removeAttribute("data-tapkid"));
    const el = document.querySelector(`[data-tapprobe="${i}"]`);
    if (!el) return 0;
    const list = Array.from(el.children).slice(0, 3);
    for (const c of Array.from(el.children).slice(0, 3)) list.push(...Array.from(c.children).slice(0, 2));
    list.forEach((c, n) => c.setAttribute("data-tapkid", String(n)));
    return list.length;
  }, idx);
  if (!kids) return false;
  const readAll = ([n, props]) => {
    const el = document.querySelector(`[data-tapkid="${n}"]`);
    if (!el) return null;
    const s = getComputedStyle(el);
    const o = {};
    for (const p of props) o[p] = s[p];
    return o;
  };
  const kidBefore = [];
  for (let n = 0; n < kids; n++) kidBefore.push(await page.evaluate(readAll, [n, FEEDBACK_PROPS]));
  const { nodeId: selfId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sels[0] });
  if (!selfId) return false;
  await cdp.send("CSS.forcePseudoState", { nodeId: selfId, forcedPseudoClasses: ["active"] });
  let kidChanged = false;
  for (let n = 0; n < kids && !kidChanged; n++) {
    const after = await page.evaluate(readAll, [n, FEEDBACK_PROPS]);
    if (after && kidBefore[n] && FEEDBACK_PROPS.some((p) => kidBefore[n][p] !== after[p])) kidChanged = true;
  }
  await cdp.send("CSS.forcePseudoState", { nodeId: selfId, forcedPseudoClasses: [] });
  return kidChanged;
}

function routesOf(all) {
  const pj = JSON.parse(readFileSync("src/pages.json", "utf8").replace(/\/\/[^\n"]*$/gm, ""));
  const TABS = ["pages/index/index", "pages/earn/earn", "pages/store/store", "pages/team/team", "pages/me/me"];
  const known = new Set(pj.pages.map((p) => p.path));
  const core = TABS.filter((t) => known.has(t));
  return all ? [...new Set([...core, ...pj.pages.map((p) => p.path)])] : core;
}

// ── 双向红测 fixture:阳性必中两类,干净必 0 ──
const FIXTURE_BAD = `<!doctype html><meta charset="utf-8"><body style="margin:0">
<style>.ok:active{opacity:.6}.slow{transition:opacity 3s}.slow:active{opacity:.5}.host:active span{opacity:.5}</style>
<div id="small" style="width:20px;height:20px;background:#ccc"></div>
<div id="plain" style="width:120px;height:48px;background:#ddd">no feedback</div>
<div id="good" class="ok" style="width:120px;height:48px;background:#ddd">has feedback</div>
<div id="slow" class="slow" style="width:120px;height:48px;background:#ddd">slow transition</div>
<div id="nopointer" style="width:120px;height:48px;background:#ddd;pointer-events:none">not clickable</div>
<div class="ok" style="width:120px;height:48px;background:#ddd"><span id="inner">inherited feedback</span></div>
<div id="outer" class="host" style="width:120px;height:48px;background:#ddd"><span>child feedback</span></div>
<div id="gesture-host" style="padding:4px"><div id="in-gesture" style="width:22px;height:22px;background:#ccc"></div></div>
<script>
for(const id of ["small","plain","good","slow","nopointer","inner","outer","in-gesture"])document.getElementById(id).addEventListener("click",()=>{});
/* 手势容器:只挂 touchstart,不该进 tap 集合 —— 否则它裹住的 22×22 会因为「有 tap 祖先」逃掉尺寸检查 */
document.getElementById("gesture-host").addEventListener("touchstart",()=>{});
<\/script>
</body>`;
const FIXTURE_CLEAN = `<!doctype html><meta charset="utf-8"><body style="margin:0">
<style>.ok:active{transform:scale(.97)}</style>
<div id="a" class="ok" style="width:120px;height:48px;background:#ddd">fine</div>
<script>document.getElementById("a").addEventListener("click",()=>{});<\/script>
</body>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "en-US" });
page.setDefaultTimeout(15000);
await page.addInitScript(HOOK);
const cdp = await page.context().newCDPSession(page);
await cdp.send("DOM.enable");
await cdp.send("CSS.enable");
let exitCode = 0;

// 🔴 selftest 必须走 goto 而非 setContent:setContent 不新建 document,addInitScript 的
//    addEventListener hook 不会注入 → hook 抓 0 个元素、两类违例全假阴(首跑亲测)。
//    用 route 拦截喂 fixture,既触发真 navigation 又不依赖 dev server。
async function probeContent(html) {
  await page.route("**/__tapfixture__*", (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
  await page.goto("http://tap-probe.selftest/__tapfixture__", { waitUntil: "load" });
  await page.waitForTimeout(200);
  await page.addStyleTag({ content: NO_TRANSITION });
  const targets = await page.evaluate(markTargets, TAP_MIN);
  const noFeedback = [];
  // 与 probeRoute 共用同一个 hasFeedback:两套判定逻辑分叉,selftest 就守不住真扫描
  for (const t of targets) {
    if (!t.leaf || t.disabled || t.scrim) continue;
    if (!(await hasFeedback(page, cdp, t.i))) noFeedback.push(t);
  }
  return { targets, noFeedback, tooSmall: targets.filter((t) => t.tooSmall) };
}

if (SELFTEST) {
  const bad = await probeContent(FIXTURE_BAD);
  const clean = await probeContent(FIXTURE_CLEAN);
  const fails = [];
  // 期望 7 而非 8:#nopointer 注册了 click 但 pointer-events:none,用户点不到,不该计入
  if (bad.targets.length !== 7) fails.push(`可见 tap 元素数不符(期望 7,实得 ${bad.targets.length};多 1 = pointer-events:none 的元素被误判可点)`);
  if (!bad.tooSmall.some((t) => t.w === 20)) fails.push("假阴:20×20 未被判 tap<44");
  // 🔴 手势容器红测锚:#in-gesture 的父只挂 touchstart。若探针把手势容器当 tap 目标,
  //    这个 22×22 就会因「有 tap 祖先」逃掉尺寸检查 —— 这正是首版让整个尺寸门失效的机制。
  if (!bad.tooSmall.some((t) => t.w === 22)) fails.push("假阴:手势容器(仅 touchstart)内的 22×22 未被判 tap<44 —— 尺寸门对页面正文失效");
  if (!bad.noFeedback.some((t) => t.text === "no feedback")) fails.push("假阴:无 :active 规则的元素未被判缺反馈");
  if (bad.noFeedback.some((t) => t.text === "has feedback")) fails.push("假阳:有 :active opacity 的元素被误判缺反馈");
  // 3s 过渡的红测锚:不压过渡就会读到起点值 → 误判缺反馈
  if (bad.noFeedback.some((t) => t.text === "slow transition")) fails.push("假阳:带长 transition 的 :active 被误判缺反馈(过渡未压到 0)");
  // 祖先链红测锚:反馈写在父容器、click 绑在内层(checkout 主 CTA 的写法)
  if (bad.noFeedback.some((t) => t.text === "inherited feedback")) fails.push("假阳:反馈在父容器上的元素被误判缺反馈(未查祖先链)");
  // 后代红测锚:反馈挂在内层(外层被入场动画占用时的必然写法,见 trial-hero-banner)
  if (bad.noFeedback.some((t) => t.text === "child feedback")) fails.push("假阳:反馈在子元素上的目标被误判缺反馈(未查后代)");
  if (clean.tooSmall.length) fails.push(`假阳:干净 fixture 报了 ${clean.tooSmall.length} 条尺寸违例`);
  if (clean.noFeedback.length) fails.push(`假阳:干净 fixture 报了 ${clean.noFeedback.length} 条反馈违例(transform 变化未被识别)`);
  if (fails.length) { fails.forEach((f) => console.error("SELFTEST FAIL: " + f)); exitCode = 1; }
  else console.log("tap-feedback selftest 全过(hook 抓取 + 尺寸阳性 + 反馈阳性 + 双向假阳 0)");
  await browser.close();
  process.exit(exitCode);
}

const allRoutes = routesOf(SWEEP_ALL);
// 路由级范围(包 ax):PROBE_ROUTES 有值 → 只扫「射程 ∩ 受影响路由」;未设 = 全量。ledger 只拦「新指纹」,缩范围不会假红;scoped 下 --update-ledger 拒绝。
const SCOPE = scopeRoutes(allRoutes, "tap-feedback");
const routes = SCOPE.routes;
if (SCOPE.scoped && !routes.length) { console.log(`tap-feedback 无新违例(scoped 0/${allRoutes.length} 路由在受影响范围内,本轮无可扫;末轮全量会扫)`); await browser.close(); process.exit(0); }
if (SCOPE.scoped && UPDATE) { console.error("tap-feedback:PROBE_ROUTES 范围模式下不许 --update-ledger(只扫了一部分路由,重建会丢掉没扫路由的存量)。不设 PROBE_ROUTES 全量跑再重建。"); await browser.close(); process.exit(2); }
const results = [];
const failedRoutes = [];
// tester-G P2-5(P-120 追记 6 同族):冷 Vite server 首跑只抓到 71/165 个目标而门照绿(1200ms 内模块还没转完,markTargets 数到的是半张页)。
//   先用一条 lane 把射程内路由各 goto 一遍热身(不量),把模块转译摊在正式测量之前;热 server 上多花 ~5s。
{
  const warm = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US" });
  const wp = await warm.newPage(); wp.setDefaultTimeout(15000);
  for (const [i, r] of routes.entries()) { try { await wp.goto(`${BASE}/?nx_device=off&warm=${i}#/${r}`, { waitUntil: "networkidle" }); } catch { /* 热身失败不判红,正式测量会再走一遍 */ } }
  await warm.close();
}
// 包 ax:N 条 lane(各自独立 context / 渲染进程)并行各扫一条路由(PROBE_CONCURRENCY,默认 3);每个 lane page 自带 HOOK 注入 + 独立 CDP 会话,
//   每条路由仍是「整页重载 → 1200ms → 逐目标 :active 判定」的原口径;结果按路由原顺序合并。
const laneCdp = new WeakMap();
const laneReady = async (lane) => {
  if (laneCdp.has(lane)) return laneCdp.get(lane);
  lane.setDefaultTimeout(15000);
  await lane.addInitScript(HOOK);
  const c = await lane.context().newCDPSession(lane);
  await c.send("DOM.enable");
  await c.send("CSS.enable");
  laneCdp.set(lane, c);
  return c;
};
const perRoute = await mapRoutes(browser, routes, async (lane, r) => {
  const c = await laneReady(lane);
  return await probeRoute(lane, c, r, allRoutes.indexOf(r));
}, { context: { viewport: { width: 390, height: 844 }, locale: "en-US" } });
perRoute.forEach((res, k) => {
  if (!res || res.error) { console.error(`  ! ${routes[k]}: ${String(res?.error ?? "unknown").split("\n")[0]}`); failedRoutes.push(routes[k]); return; }
  results.push(res);
});
await browser.close();

// 指纹 = 路由 + 签名 + 类别(尺寸数值会因文案变动,不入指纹)
const fp = (route, t, kind) => `${kind}|${route}|${t.sig}`;
const found = new Map();
for (const r of results) {
  for (const t of r.tooSmall) found.set(fp(r.route, t, "size"), { kind: "size", route: r.route, sig: t.sig, detail: `${t.w}×${t.h} < ${TAP_MIN}`, text: t.text });
  for (const t of r.noFeedback) found.set(fp(r.route, t, "feedback"), { kind: "feedback", route: r.route, sig: t.sig, detail: ":active 下 8 项视觉属性零变化", text: t.text });
}

const total = results.reduce((a, r) => a + r.targets.length, 0);
// 🔴 覆盖面 witness:**探不到 ≠ 无违例**。上面那个 catch 把导航失败降级成一行 `!` 警告,
//    然后本脚本一路走到 exit 0 —— 实测 BASE_URL 指向死端口时 5 条路由全 ERR_CONNECTION_REFUSED,
//    它照样打印「无新违例(0 个 tap 目标)」并判绿,dev server 没起 / 端口指错时这道门静默全过。
//    放在 UPDATE 之前:拿一次坏跑去 --update-ledger 会把 11 条存量黄灯清成空台账(门连基线一起丢)。
if (failedRoutes.length || total === 0) {
  console.error(`tap-feedback 判据失效:${failedRoutes.length}/${routes.length} 条路由探测失败,共扫到 ${total} 个 tap 目标(应 >0)——按红处理,不许当「无违例」`);
  process.exit(1);
}
if (UPDATE) {
  // 🔴 合并语义,不是快照替换(tester-F R2 / 包 ax 实测:替换语义把 11 条存量写成 2 条 —— 本轮没被看见的存量条目
  //   (定时弹层 / 时序相关目标)会被删掉,下次被看见又成「新违例」红)。旧条目一律保留(含 tapOk 豁免与理由),
  //   新指纹追加;本轮没见到的存量单独点名为「消失」,由人判是修好了(手工删条目)还是没扫到。dom-qa 同款。
  // tester-G P1-1 / P2-1 / P2-2:① 台账里 entries 以外的顶层键(_note_revision 等留痕)原样保留,不再被字面量重建吞掉;
  //   ② scope / totalTargets 只在 --sweep all 时更新(core 扫 5 路由的 165 不许覆盖 all 扫的 921,否则元数据与条目自相矛盾),
  //      本轮口径另记 lastRun;③ 台账 JSON 坏了不崩:大声说明并按空台账重建(这是唯一的自愈入口);④ 新收条目逐条点名 ——
  //      人删掉的条目若违例仍在,会被重新收编为「欠账」(无 tapOk),要它保持红就别跑 --update-ledger、去修它,这里把这层写在 note 里。
  let prev = { entries: [] };
  if (existsSync(LEDGER_PATH)) {
    try { prev = JSON.parse(readFileSync(LEDGER_PATH, "utf8")); }
    catch (e) { console.error(`⚠ 台账 JSON 解析失败(${String(e.message).slice(0, 80)}),按空台账重建 —— 旧条目全部丢失,这是有意的自愈路径,请核对 git diff`); prev = { entries: [] }; }
  }
  const merged = new Map((prev.entries || []).map((e) => [e.fp, e]));
  const addedList = [];
  for (const [k, v] of found.entries()) if (!merged.has(k)) { merged.set(k, { fp: k, ...v, since: new Date().toISOString().slice(0, 10) }); addedList.push(k); }
  const gone = (prev.entries || []).filter((e) => !found.has(e.fp));
  const { entries: _e, generatedAt: _g, note: _n, scope: prevScope, totalTargets: prevTotal, ...rest } = prev;
  writeFileSync(LEDGER_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    note: "tap 目标存量黄灯台账(C3)。entry 带 tapOk:'理由' = 人工豁免;不带 tapOk = 欠账(待修)。gate 只拦 ledger 外新指纹。--update-ledger 是合并(旧条目一律保留,新指纹以欠账身份追加并点名,本轮未见的存量点名不删);人删掉的条目若违例仍在会被再次收编为欠账 —— 要它保持红就修掉它而不是跑 --update-ledger。scope/totalTargets 只在 --sweep all 时更新,lastRun 记本轮口径。",
    ...rest,
    scope: SWEEP_ALL ? "all" : (prevScope ?? "core"),
    totalTargets: SWEEP_ALL ? total : (prevTotal ?? total),
    lastRun: { at: new Date().toISOString().slice(0, 10), scope: SWEEP_ALL ? "all" : "core", routes: routes.length, totalTargets: total, added: addedList.length, unseen: gone.length },
    entries: [...merged.values()],
  }, null, 2) + "\n");
  console.log(`台账已合并:${merged.size} 条(本轮新收 ${addedList.length};扫 ${routes.length} 路由 / ${total} 个 tap 目标;scope 记录${SWEEP_ALL ? "已按 all 更新" : "保持不变(core 扫不覆盖 all)"})`);
  for (const k of addedList) console.log(`    + 新收(欠账,无 tapOk):${k}`);
  if (gone.length) { console.log(`  本轮未见的存量 ${gone.length} 条(修好了就手工删条目;定时弹层类目标本来就时有时无):`); for (const g of gone) console.log(`    - ${g.fp}`); }
  process.exit(0);
}

const REPORT = args.includes("--report") ? args[args.indexOf("--report") + 1] : null;
if (REPORT) {
  writeFileSync(REPORT, JSON.stringify({ scannedRoutes: routes.length, totalTargets: total, findings: [...found.values()] }, null, 1) + "\n");
  console.log(`完整清单已写 ${REPORT}(${found.size} 条)`);
}

const ledger = existsSync(LEDGER_PATH) ? JSON.parse(readFileSync(LEDGER_PATH, "utf8")) : { entries: [] };
const known = new Set((ledger.entries || []).map((e) => e.fp));
const fresh = [...found.entries()].filter(([k]) => !known.has(k));
if (fresh.length) {
  console.error(`tap-feedback 新违例 ${fresh.length} 条(扫 ${routes.length} 路由 / ${total} 个 tap 目标):`);
  for (const [, v] of fresh.slice(0, 25)) console.error(`  [${v.kind}] ${v.route} — ${v.sig} — ${v.detail}${v.text ? ` — "${v.text}"` : ""}`);
  if (fresh.length > 25) console.error(`  … 另 ${fresh.length - 25} 条`);
  process.exit(1);
}
console.log(`tap-feedback 无新违例(扫 ${routes.length} 路由${SCOPE.scoped ? `(scoped ${routes.length}/${allRoutes.length})` : ""} / ${total} 个 tap 目标;存量黄灯 ${known.size} 条)`);
