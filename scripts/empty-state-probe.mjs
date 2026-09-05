// 空状态探针(C5 2026-07-23):强制让每个接了 EmptyState 的页面进入空态,核实它真渲染出来。
//
// 为什么要强制:这些列表的数据来自代码里的 mock 种子,清 storage 也还在 —— 不制造空态就
// 永远看不到空态,「接上了组件」和「空态真能显示」是两回事(声明≠实现)。
// 做法:页面挂载后遍历所有 pinia store,把**数组类型的 state 字段**清空,列表自然全空。
//
// 逐页断言:① .nx-empty 出现 ② 插画真加载出来(naturalWidth>0,路径写错会是 0)
// ③ 标题非空 ④ 不横向溢出 ⑤ 无 console error。
//
// 用法:node scripts/empty-state-probe.mjs [--theme light]
import { chromium } from "playwright";
import { scopeRoutes, mapRoutes, settleNetwork } from "./lib/probe-routes.mjs";
import { collectAppConsoleErrors, isThirdPartyResourceError } from "./lib/console-origin-filter.mjs";

// 端口来源:UNI_BASE_URL 优先,再退 BASE_URL(verify.sh 统一名)——只认前者会在非 5173 端口静默打到别的工程树。
const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const THEME = process.argv.includes("--theme") ? process.argv[process.argv.indexOf("--theme") + 1] : "dark";

// 接了 EmptyState 的页面(与 docs/changes/2026-07-23-c5-empty-states.md 的映射表一致)
// 多数页面的列表数据在 pinia store 里,清空数组就够。但有几个页面的数据源是**代码常量**
// (搜索目录 / FAQ / TOKENS / EVENTS),清 store 对它们无效 —— 那几个得靠真实交互触发空态:
// 往搜索框里打一个不可能命中的词,或把筛选切到没有结果的那一档。
const TYPE_JUNK = "zzzqqqxxx";
const ROUTES = [
  { r: "pages/search/search", type: TYPE_JUNK },
  { r: "pages/me/devices" },
  { r: "pages/staking/staking" },
  { r: "pages/daily/daily" },
  { r: "pages/team/unilevel" },
  // 数据源是页面局部 reactive(starState),探针够不着 —— 标注而非红灯:
  // 会稳定误报的门必然被白名单绕过,等于没门。组件渲染已由其余 17 页覆盖。
  { r: "pages/market/market", unreachable: "Watchlist 空态由页面局部 starState 决定,需真实逐个取消收藏" },
  { r: "pages/me/wallet-exchange" },
  { r: "pages/me/wallet-nex", unreachable: "🔴 mock 恒非空:activity computed 里硬塞了 5 条 mining 记录,当前空态不可达;接真后台后才可能为空(空态本身该留)" },
  { r: "pages/me/wallet-bills" },
  { r: "pages/me/support-tickets" },
  { r: "pages/events/events", unreachable: "按 tab 过滤 EVENTS 常量,需切到无结果的 tab" },
  { r: "pages/team/commissions" },
  { r: "pages/me/help", type: TYPE_JUNK },
  { r: "pages/me/wallet-cards" },
  { r: "pages/store/orders" },
  { r: "pages/me/notifications" },
  { r: "pages/me/receipts" },
  { r: "pages/support/messages" },
  { r: "pages/store/bundle" },
  { r: "pages/me/rewards-list" },
  // 默认落在「在售」页签,清空 remoteListings 即空态。
  // 🔴 这条是 2026-08-17 独立验收抓出来的:本表只登记「已经接了 EmptyState 的页面」,
  //    所以**压根没接**的页面对它天然隐形 —— 创世市场在售列表空了 400px 白,门一路报绿。
  //    补这条只是把本页纳管;「哪些页该有空态却没有」是本门看不见的另一条轴,已上报。
  { r: "pages/genesis/marketplace" },
];

/** 页内页签遍历:认出页签行 → 逐个点 → 每切一次要求**页签下方那块区域里有内容**。
 *
 *  🔴 判据是**存在性**,不是几何尺寸(2026-08-17 连错四轮才收敛):先后试过「内容之间的最大空隙」
 *  「清空前后的差值」「距屏幕底的死区」,全部栽在同一件事上——**用尺寸判「有没有东西」**。
 *  实测反例:钱包账单切到 Credit、创世市场切到 Mine,空态都好好地渲染着,只因为那两个空态**比较矮**、
 *  底下剩的屏幕多,就被判红。阈值再调也只是挪线,矮一点的空态照样中枪。
 *  空态本身就是内容 —— 该问的是「这块区域是不是什么都没有」,不是「空了多少像素」。 */
const TAB_SWEEP = async () => {
  const host = () => document.querySelector(".nx-page-enter") || document.body;
  /** 页签行下方区域里的「内容像素高度」合计(空态、卡片、文字都算)。 */
  const contentBelow = (y) => {
    const spans = [];
    for (const el of host().querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom <= y) continue;
      const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const media = /^(IMG|SVG|CANVAS|VIDEO|UNI-IMAGE)$/i.test(el.tagName);
      const bg = cs.backgroundImage !== "none"
        || (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent")
        || (cs.borderTopWidth !== "0px" && cs.borderTopStyle !== "none");
      if (!ownText && !media && !bg) continue;
      if (r.height > innerHeight * 0.9 && bg && !ownText && !media) continue; // 整页背景板不算内容
      spans.push([Math.max(r.top, y), r.bottom]);
    }
    if (!spans.length) return 0;
    spans.sort((a, b) => a[0] - b[0]);
    const merged = [spans[0].slice()];
    for (const [t, b] of spans.slice(1)) {
      const last = merged[merged.length - 1];
      if (t <= last[1]) last[1] = Math.max(last[1], b); else merged.push([t, b]);
    }
    return Math.round(merged.reduce((n, [t, b]) => n + (b - t), 0));
  };

  // 页签行 = 内容区里一组「横向对齐、高度一致、文本短、恰有一个底色与众不同」的可点兄弟元素
  let row = null;
  for (const parent of host().querySelectorAll("uni-view")) {
    const kids = [...parent.children].filter((c) => c.tagName === "UNI-VIEW");
    if (kids.length < 2 || kids.length > 5) continue;
    const rects = kids.map((k) => k.getBoundingClientRect());
    if (rects.some((r) => r.height < 28 || r.width < 40)) continue;
    if (rects.some((r) => Math.abs(r.top - rects[0].top) > 4)) continue;
    const texts = kids.map((k) => (k.innerText || "").trim());
    if (texts.some((t) => !t || t.length > 24)) continue;
    if (new Set(kids.map((k) => getComputedStyle(k).backgroundColor)).size !== 2) continue;
    row = { kids, texts }; break;
  }
  if (!row) return { tabs: 0 };

  // 「有内容」的下限:最矮的合法空态(创世市场 Mine 的虚线框)实测在页签下方也有 200px+ 内容;
  // 而空态被删掉时,页签下方只剩页脚一行(≤40px)。取 72px —— 两者相差 5 倍,不是需要调的参数。
  const FLOOR = 72;
  const bad = [];
  const seen = [];
  for (let i = 0; i < row.kids.length; i++) {
    row.kids[i].click();
    await new Promise((r) => setTimeout(r, 450));
    const y = row.kids[0].getBoundingClientRect().bottom;
    const h = contentBelow(y);
    seen.push(`${row.texts[i].slice(0, 10)}=${h}px`);
    if (h < FLOOR) bad.push(`${row.texts[i].slice(0, 14)} 页签下方只有 ${h}px 内容`);
  }
  return { tabs: row.kids.length, tabLabels: row.texts.map((t) => t.slice(0, 12)), tabBad: bad, tabSeen: seen };
};

const browser = await chromium.launch({ headless: true });
// 路由级范围(包 ax):PROBE_ROUTES 有值 → 只扫「射程 ∩ 受影响路由」;未设 = 全量。
const SCOPE = scopeRoutes(ROUTES, "空状态探针", (spec) => spec.r);
const SPECS = SCOPE.routes;
// 包 ax:N 条 lane(各自独立 context / 渲染进程)并行各扫一页(PROBE_CONCURRENCY,默认 3);每页仍是原节奏,判据不动;console error 按 lane page 各记各的。
const errorsOf = new WeakMap();
const consoleErrorsFor = (page) => {
  if (!errorsOf.has(page)) {
    const arr = []; errorsOf.set(page, arr);
    page.setDefaultTimeout(20000);
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon/i.test(m.text()) && !isThirdPartyResourceError(m.text(), m.location?.().url, BASE)) arr.push(m.text().slice(0, 90));
    });
  }
  return errorsOf.get(page);
};

const rows = await mapRoutes(browser, SPECS, async (page, spec, _i, lanes) => {
  const i = ROUTES.indexOf(spec);
  const route = spec.r;
  const consoleErrors = consoleErrorsFor(page);
  const before = consoleErrors.length;
  try {
    await page.goto(`${BASE}/?nx_device=off&es=${i}#/${route}`, { waitUntil: "domcontentloaded" });
    await settleNetwork(page, 5000, lanes); // 包 ax:并行时 dev server 忙,先等本页网络空闲(有界),再走原来的固定等待;实际 1 lane 时空转(F-04 / R2-03)
    await page.waitForTimeout(1300);
    // 常量数据源的页面:往搜索框打不可能命中的词
    if (spec.type) {
      await page.evaluate((junk) => {
        const inp = document.querySelector("uni-input input");
        if (!inp) return;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(inp, junk);
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }, spec.type);
      await page.waitForTimeout(700);
    }
    const res = await page.evaluate(async ([theme, pollMs]) => {
      const app = document.querySelector("#app")?.__vue_app__;
      const pinia = app?.config?.globalProperties?.$pinia;
      if (!pinia) return { err: "no pinia" };
      pinia._s.get("theme")?.setMode(theme);
      // 清空所有 store 里的数组字段 —— 列表全空,空态自然显形
      let cleared = 0;
      for (const store of pinia._s.values()) {
        for (const k of Object.keys(store.$state ?? {})) {
          if (Array.isArray(store.$state[k]) && store.$state[k].length) {
            store.$state[k] = [];
            cleared++;
          }
        }
      }
      // 包 ax:原来固定 600ms 后快照;并行时插画请求会排队 1-2s(见 settleNetwork 注释),改为至少等 600ms、
      //   之后每 100ms 轮询直到「.nx-empty 在 + 插画 <img> 就绪」或封顶 5s —— 只多给时间不改判据:5s 还没有 .nx-empty 照判红,
      //   插画 404(complete 但 naturalWidth=0)照判「插画没加载出来」。
      await new Promise((r) => setTimeout(r, 600));
      const t0 = performance.now();
      const ready = () => { const e = document.querySelector(".nx-empty"); const a = e && (e.querySelector("img") || e.querySelector(".nx-empty__art img")); return !!(e && a && a.complete && a.naturalWidth > 0); };
      while (!ready() && performance.now() - t0 < pollMs) await new Promise((r) => setTimeout(r, 100));
      const el = document.querySelector(".nx-empty");
      if (!el) return { cleared, empty: false };
      const art = el.querySelector("img") || el.querySelector(".nx-empty__art img");
      const title = el.querySelector(".nx-empty__title");
      const doc = document.scrollingElement;
      return {
        cleared,
        empty: true,
        artSrc: art ? (art.getAttribute("src") || "").split("/").slice(-2).join("/") : null,
        artOk: art ? art.complete && art.naturalWidth > 0 : false,
        title: (title?.textContent || "").trim().slice(0, 22),
        overflowX: doc.scrollWidth > doc.clientWidth + 1,
        box: Math.round(el.getBoundingClientRect().width) + "x" + Math.round(el.getBoundingClientRect().height),
      };
    }, [THEME, spec.unreachable ? 0 : 5000]); // 标了 unreachable 的页面(本来就 skip)不轮询封顶,免得每页白等 5s(串行 55s→70s 就是它)
    // 🔴 页签遍历(2026-08-17 变异实测逼出来的):上面只断言了**落地那一屏**。
    //    同一页里切了页签才看得到的空态,这门此前一概不查 —— 实测把创世市场「活动」
    //    页签的空态整块删掉,门照样 21/21 全绿(而「在售」那个删掉就判红,因为它是默认页签)。
    //    这里把页内页签逐个点一遍,每切一次都要求「内容区不能留大片白」。
    //    识别不出页签的页面 tabs 记 0 并打印 —— **不许静默跳过**(认不出 ≠ 没有页签)。
    const tabRes = res.empty ? await page.evaluate(TAB_SWEEP) : { tabs: 0, note: "落地屏已判红,跳过页签" };
    return { route, unreachable: spec.unreachable, ...res, ...tabRes, newErrors: consoleErrors.length - before };
  } catch (e) {
    return { route, err: e.message.split("\n")[0].slice(0, 60) };
  }
}, { context: { viewport: { width: 390, height: 844 }, locale: "en-US" } }).then((rs) => rs.map((r, k) => r && !r.error ? r : { route: SPECS[k].r, err: String(r?.error ?? "unknown").slice(0, 60) }));
await browser.close();

let fail = 0;
if (!rows.length) {
  // tester-F F-12:0 页要显形 —— scoped 下是「范围外」(与其余探针同款一行);非 scoped 0 页 = 判据失效按红,不许 0/0 通过
  if (SCOPE.scoped) { console.log(`空状态探针 PASS —— scoped 0/${ROUTES.length} 路由在受影响范围内,本轮无可扫(末轮全量会扫)`); process.exit(0); }
  console.error("空状态探针 判据失效:一页都没扫到(ROUTES 为空?)—— 按红处理"); process.exit(1);
}
console.log(`空状态探针(theme=${THEME}) — ${SPECS.length} 个接入页${SCOPE.scoped ? `(scoped ${SPECS.length}/${ROUTES.length})` : ""}\n`);
for (const r of rows) {
  const bad = [];
  if (r.unreachable) { console.log(`skip  ${r.route.padEnd(30)} 探针够不着:${r.unreachable}`); continue; }
  if (r.err) bad.push("异常:" + r.err);
  else if (!r.empty) bad.push("清空数组后仍未渲染 .nx-empty");
  else {
    if (!r.artOk) bad.push("插画没加载出来(路径错或文件缺)");
    if (!r.title) bad.push("标题为空");
    if (r.overflowX) bad.push("横向溢出");
    if (r.newErrors) bad.push(`console error ×${r.newErrors}`);
    if (r.tabBad?.length) bad.push(`页签切过去是大片白 → ${r.tabBad.join(" / ")}`);
  }
  if (bad.length) fail++;
  // 🔴 tabs=N 恒打印:认不出页签(0)也要显形。静默跳过 = 判据失效却看不出来。
  const tabInfo = r.tabs === undefined ? "" : r.tabs > 0 ? ` [页签 ${r.tabs}: ${(r.tabLabels || []).join("/")}]` : " [无页签]";
  console.log(`${bad.length ? "FAIL" : "ok  "}  ${r.route.padEnd(30)} ${r.empty ? `${r.box} ${r.artSrc} "${r.title}"` : ""}${tabInfo} ${bad.join(" · ")}`);
}
const withTabs = rows.filter((r) => r.tabs > 0).length;
console.log(`\n${rows.length - fail}/${rows.length} 通过 · 其中 ${withTabs} 页做了页签遍历`);
process.exit(fail ? 1 : 0);
