#!/usr/bin/env node
/**
 * 守卫存活性 · 行为门(2026-08-07,独立审计建议 #4)
 *
 * 为什么要行为门而不是再加一条形状判据:守卫存活性这一族三轮出了**三种不同形状**
 * (读取口不同形 / 冷启动那一枪被吞 / 守卫被归进业务停止组),每轮的结构哨兵都只认
 * 上一种形状。独立审计 2026-08-07 实测:7 种改法能让缺陷完整复活而结构门全绿。
 * 本门不看代码长什么样,只问一件事 —— **登出的人还能不能停在业务页上。**
 * 代码怎么重构都拦得住。
 *
 * 判据(全部为真才绿):
 *   ① 主症:登出态从静态评审页冷启动 → 用应用内导航进提现页 → 必须被带离
 *   ② 对照:登出态直接冷启动到提现页 → 必须被带离(证明探针不是恒绿)
 *   ③ 反向对照:已登录态进业务页 → 必须**留在**业务页(证明探针不是恒红/不是把人乱踢)
 *   ④ 覆盖面 witness:任一场景读不到路由 / 页面没起来 → 判红
 *     (P-080 的教训:探不到 ≠ 无违例;空集会让全称判据恒真)
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || process.env.UNI_BASE_URL || "http://localhost:5173";
const SETTLE_MS = 9000;
const AUTHED = { isAuthenticated: true, email: "gate@nexgrid.test", accountId: "gate@nexgrid.test", onboardingComplete: true };
const OUT = { isAuthenticated: false, email: "", accountId: "default", onboardingComplete: false };
const BUSINESS = "pages/me/wallet-withdraw";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * 🔴 「必须被踢走」这类断言用**轮询等待**,不用「固定睡一觉再一次性读」。
 *   2026-08-14 实测:冷启动的 dev server 上,业务页首次按需编译要好几秒,固定
 *   SETTLE_MS 睡醒时守卫的下一拍还没来 —— 同一份代码冷靶首跑红、热靶连绿,
 *   官方链(自起冷服)因此闪红 443/1。不变量是「必须被带离」,从没规定「多快」;
 *   守卫本来就是周期轮询,判据的时序假设不该比被判物更紧。
 *   踢走即刻通过;只有到宽限期还赖着才算真违例。「不许被误踢」(③)是相反方向 ——
 *   证「不发生」只能固定观察窗,保持原样。
 */
async function waitEvictedFrom(p, business, deadlineMs) {
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < deadlineMs) {
    last = await readRoute(p);
    if (last && last !== business) return { evicted: true, route: last };
    await wait(500);
  }
  return { evicted: false, route: last };
}
const EVICT_DEADLINE_MS = 20000;
const readRoute = (p) => p.evaluate(() => {
  try { const ps = getCurrentPages(); if (ps.length) return ps[ps.length - 1].route || ""; } catch {}
  return (location.hash || "").replace(/^#\/?/, "").split("?")[0];
});

async function open(ctx, landing, auth) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?nx_device=off#/__gate_seed`, { waitUntil: "domcontentloaded" });
  await p.evaluate((s) => {
    localStorage.clear();
    localStorage.setItem("nexgrid-auth-v1", JSON.stringify({ type: "object", data: s }));
  }, auth);
  await p.goto(`${BASE}/?nx_device=off&cb=${Math.floor(performance.now())}#/${landing}`, { waitUntil: "load" });
  await wait(3000);
  return p;
}

/** 应用内导航 —— 用项目自己的导航原语,不改地址栏(改 hash 不是真实用户路径)。 */
async function navInApp(p, target) {
  const ok = await p.evaluate((t) => {
    if (typeof uni === "undefined" || !uni.reLaunch) return false;
    uni.reLaunch({ url: "/" + t, fail: () => {} });
    return true;
  }, target);
  await wait(2500);
  return ok;
}

const fails = [];
const notes = [];
let checks = 0;

const browser = await chromium.launch();
try {
  // ── ① 主症:登出态经静态评审页 → 应用内进提现页 ──────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await open(ctx, "pages/entry-surfaces/index", OUT);
    const landed = await readRoute(p);
    if (!landed) fails.push("① 覆盖面:评审页没起来(路由读空)—— 判据失效,不是没违例");
    else if (!(await navInApp(p, BUSINESS))) fails.push("① 覆盖面:应用内导航原语不可用 —— 判据失效");
    else {
      const r = await waitEvictedFrom(p, BUSINESS, EVICT_DEADLINE_MS);
      checks++;
      if (!r.route) fails.push("① 覆盖面:导航后路由读空 —— 判据失效");
      else if (!r.evicted) fails.push(`① 登出态经评审页进业务页,${EVICT_DEADLINE_MS / 1000}s 内仍停在 ${r.route} —— 周期性权限守卫没在工作`);
      else notes.push(`①经评审页→${r.route}`);
    }
    await ctx.close();
  }

  // ── ② 对照:登出态直接落地业务页(探针不是恒绿)──────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await open(ctx, BUSINESS, OUT);
    const r = await waitEvictedFrom(p, BUSINESS, EVICT_DEADLINE_MS);
    checks++;
    if (!r.route) fails.push("② 覆盖面:路由读空 —— 判据失效");
    else if (!r.evicted) fails.push(`② 登出态直接落地业务页,${EVICT_DEADLINE_MS / 1000}s 内仍停在 ${r.route} —— 守卫整体失效`);
    else notes.push(`②直接落地→${r.route}`);
    await ctx.close();
  }

  // ── ③ 反向对照:已登录不许被误踢(探针不是恒红)────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await open(ctx, "pages/index/index", AUTHED);
    if (!(await navInApp(p, BUSINESS))) fails.push("③ 覆盖面:应用内导航原语不可用 —— 判据失效");
    else {
      await wait(SETTLE_MS);
      const end = await readRoute(p);
      checks++;
      if (!end) fails.push("③ 覆盖面:路由读空 —— 判据失效");
      else if (end !== BUSINESS) fails.push(`③ 已登录用户被误踢到 ${end} —— 守卫把正常用户也赶走了`);
      else notes.push("③已登录留在业务页");
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

// 覆盖面 witness:一个场景都没判成 = 判据失效,必须红(P-080)
if (checks < 3) fails.push(`覆盖面 witness:只完成 ${checks}/3 个场景判定 —— 判据不完整,不作绿`);

for (const f of fails) console.log("  FAIL " + f);
console.log(fails.length === 0
  ? `守卫存活性行为门 ${checks}/3 场景通过(${notes.join(" · ")})`
  : `守卫存活性行为门 ${checks - fails.length}/3 通过 / ${fails.length} fail`);
process.exit(fails.length === 0 ? 0 : 1);
