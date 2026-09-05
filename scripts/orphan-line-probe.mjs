// 孤字断行探针(包 zk 2026-08-15):真实渲染下,多行文案的**末行**不得只剩一两个字 / 一个短单词。
//
// 为什么必须是 runtime 探针而不是静态 grep:孤字是**排版结果**,同一句话在 390px 不断行、
// 在 375px 就断出「些。」——源码里看不出来。主人 2026-08-15 实测点名:提现页两句在 375 宽
// 末行只剩 2 个字(「用。」「些。」),而当时静态门与 tsc 全绿。
//
// 🔴 三语必扫:同一 key 三种语言长度不同,zh 收进单行不代表 vi 也收得进(vi 最长)。
// 🔴 窄屏必扫:375 = 仓内 mobile 基准(iPhone SE/mini 实宽),宽视口天然测不出孤字。
// 🔴 判据失效必红:扫到的多行文案数为 0 = 没测到东西,按红处理,不许当「无违例」。
//
// 用法:
//   node scripts/orphan-line-probe.mjs --selftest   # 双向红测(脏 fixture 必中 / 干净必 0)
//   node scripts/orphan-line-probe.mjs              # 三语 × 核心路由
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { scopeRoutes, mapRoutes, settleNetwork } from "./lib/probe-routes.mjs";

const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const SELFTEST = process.argv.includes("--selftest");
const WIDTH = 375, HEIGHT = 812;
const LOCALES = ["zh", "en", "vi"];
// 文案密集且都在钱链路上 —— 孤字最伤转化的地方
const ROUTES = [
  "pages/me/wallet-withdraw",
  "pages/me/wallet",
  "pages/me/wallet-topup",
  "pages/me/wallet-bills",
  "pages/me/security",
  "pages/me/support-tickets",
  "pages/store/order-detail",
  "pages/register/success",
  "pages/index/index",
  "pages/me/me",
];

// 页面内判据:逐字符量 client rect 找末行,CJK 看字数、拉丁看词数。
function scanOrphans() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const orphans = [];
  let checked = 0, multiline = 0;
  const range = document.createRange();
  let node;
  while ((node = walker.nextNode())) {
    const txt = node.nodeValue.trim();
    // ≥20 才算「正文」:10-17 字的 stat 芯片(vol 142k/h / Invite friends / 对比 NexGridRack P1)
    // 两词换行是布局本态,不是孤字 —— 首版阈值 8 实跑打出 55 条芯片假阳性。
    if (txt.length < 20) continue;
    const el = node.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    if (!rects.length) continue;
    checked++;
    if ([...new Set(rects.map((r) => Math.round(r.top)))].length < 2) continue;  // 单行不判
    multiline++;
    let lastTop = null, count = 0, lastLine = "";
    for (let i = 0; i < node.nodeValue.length; i++) {
      range.setStart(node, i); range.setEnd(node, i + 1);
      const rr = range.getBoundingClientRect();
      if (!rr.width) continue;
      const top = Math.round(rr.top);
      if (lastTop === null || top > lastTop + lh * 0.6) { lastTop = top; count = 1; lastLine = node.nodeValue[i]; }
      else { count++; lastLine += node.nodeValue[i]; }
    }
    const tail = lastLine.trim();
    const isCJK = /[一-龥]/.test(txt);
    // 判据 = 家规原文(feedback_no_orphan_char):CJK 正文末行不得只剩一两个字。
    // 拉丁/越南语的单词尾行**不在家规内**(text-wrap:pretty 尽力即可),不判 —— 判了全是噪声。
    const orphan = isCJK && count <= 2;
    if (orphan) orphans.push({ tail, text: txt.slice(0, 60) });
  }
  return { checked, multiline, orphans };
}

// 脏 fixture 的宽度是**量出来的**(scripts/__diag 扫宽度得到:zh@144px 末行「用。」,
// en@136px 末行单词 "today."),不是随手写个窄容器 —— 首版 200px 末行剩 11 个字,
// 判据没错但靶子根本不脏,自测假红过一次。
const FIXTURE_BAD = `<!doctype html><meta charset="utf-8"><body style="margin:0;font-size:14px;line-height:1.6">
<div style="width:144px">提现将转入你自己的钱包地址,一次设置长期使用。</div>
<div style="width:136px">Your first withdrawal gets one extra safety check today.</div>
</body>`;
// ↑ en 那条在新判据下**不应**命中(单词尾行不在家规内)—— selftest 据此断言恰 1。
const FIXTURE_CLEAN = `<!doctype html><meta charset="utf-8"><body style="margin:0;font-size:14px;line-height:1.6">
<div style="width:200px">提现转入你自己的钱包地址,设置一次长期用</div>
<div style="width:260px">Your first withdrawal gets one extra safety check.</div>
</body>`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await ctx.newPage();

if (SELFTEST) {
  let bad = 0;
  await page.setContent(FIXTURE_BAD);
  const dirty = await page.evaluate(scanOrphans);
  if (dirty.orphans.length !== 1 || !/[一-龥]/.test(dirty.orphans[0].tail)) {
    console.error(`selftest FAIL:脏 fixture 应恰中 1 处 CJK 孤字(en 单词尾行不许命中),实测 ${dirty.orphans.length}`); bad++;
  } else console.log(`  selftest ① 脏 fixture 恰中 1 处 CJK ✓ (「${dirty.orphans[0].tail}」;en 尾行未误报)`);
  await page.setContent(FIXTURE_CLEAN);
  const clean = await page.evaluate(scanOrphans);
  if (clean.orphans.length) { console.error(`selftest FAIL:干净 fixture 不应命中,实测 ${clean.orphans.length}`); bad++; }
  else console.log("  selftest ② 干净 fixture 0 命中 ✓");
  if (clean.checked === 0) { console.error("selftest FAIL:干净 fixture 一段文案都没扫到 —— 判据失效"); bad++; }
  await browser.close();
  if (bad) process.exit(1);
  console.log("orphan-line selftest PASS(双向红测 2/2)");
  process.exit(0);
}

const known = new Set(
  JSON.parse(readFileSync("src/pages.json", "utf8").replace(/\/\/[^\n"]*$/gm, "")).pages.map((p) => p.path),
);
const allRoutes = ROUTES.filter((r) => known.has(r));
if (!allRoutes.length) { console.error("orphan-line 判据失效:pages.json 里一条目标路由都不存在"); await browser.close(); process.exit(1); }
// 路由级范围(包 ax):PROBE_ROUTES 有值 → 只扫「射程 ∩ 受影响路由」;未设 = 全量。
const SCOPE = scopeRoutes(allRoutes, "orphan-line");
const routes = SCOPE.routes;

let totalMultiline = 0, failedRoutes = 0;
const hits = [];
await page.close();
// 包 ax:按语言分批,每批 N 条 lane(各自独立 context / 渲染进程,localStorage 天然隔离,语言注入不互相踩)并行各扫一条路由
//   (PROBE_CONCURRENCY,默认 3);每条路由仍是 goto → 注入 → reload → 900ms 的原节奏,判据不动。
for (const locale of LOCALES) {
  // tester-F R2-01:并行 3 lane 时首页/我的页布局晚稳定,多行文案分母稳定少 2/40 段(= 那 2 段没被查孤字),而 full 走的就是默认档;
  //   并行本来只省 ~4s,不值得赌检出力 → 固定 concurrency 1(与 theme 门同款);路由级范围化保留。
  const results = await mapRoutes(browser, routes, async (p, route) => {
    await p.goto(`${BASE}/?nx_device=off#/${route}`, { waitUntil: "domcontentloaded", timeout: 20000 });
    // uni storage 的 H5 形态是 {type,data} —— 少 type 会被当字符串读回,语言注入静默失效
    await p.evaluate((code) => {
      localStorage.setItem("nexgrid-locale-v1", JSON.stringify({ type: "object", data: { code, userSet: true } }));
    }, locale);
    await p.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
    await settleNetwork(p, 5000, 1); // 本门固定串行(R2-01)→ 空转;留调用点是为了将来若再开并行时不忘等
    await p.waitForTimeout(900);
    return await p.evaluate(scanOrphans);
  }, { concurrency: 1, context: { viewport: { width: WIDTH, height: HEIGHT } } });
  results.forEach((r, i) => {
    const route = routes[i];
    if (!r || r.error) { failedRoutes++; console.error(`  探测失败 ${locale}/${route}: ${String(r?.error ?? "unknown").slice(0, 120)}`); return; }
    totalMultiline += r.multiline;
    for (const o of r.orphans) hits.push(`${locale} · ${route} · 末行「${o.tail}」 ← ${o.text}`);
  });
}
await browser.close();

if (failedRoutes) {
  console.error(`orphan-line 判据失效:${failedRoutes} 条路由探测失败 —— 按红处理`);
  process.exit(1);
}
if (SCOPE.scoped && routes.length === 0) {
  console.log(`orphan-line PASS —— scoped 0/${allRoutes.length} 路由在受影响范围内,本轮无可扫(末轮全量会扫)`);
  process.exit(0);
}
if (totalMultiline === 0) {
  console.error("orphan-line 判据失效:三语全部路由都没扫到多行文案(应 >0)—— 按红处理,不许当「无违例」");
  process.exit(1);
}
if (hits.length) {
  console.error(`FAIL  ${hits.length} 处孤字断行(${WIDTH}px 窄屏,三语):`);
  for (const h of hits.slice(0, 12)) console.error(`        ${h}`);
  process.exit(1);
}
console.log(`orphan-line PASS —— ${LOCALES.length} 语 × ${routes.length} 路由 @${WIDTH}px,多行文案 ${totalMultiline} 段,孤字 0${SCOPE.scoped ? ` · scoped ${routes.length}/${allRoutes.length} 路由` : ""}`);
