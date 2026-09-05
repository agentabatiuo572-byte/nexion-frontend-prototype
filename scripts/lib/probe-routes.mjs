// 运行时探针共用:路由级范围化 + 多页并行(包 ax,2026-08-17 主人拍板 B)。
//
// scopeRoutes(all, label, keyOf?):
//   PROBE_ROUTES 未设 / 空 / "*" → 全部;设为逗号分隔的路由清单 → 只跑交集(探针自己的射程 ∩ 受影响路由),
//   并打一行「scoped: k/n routes」。范围由 verify-scope.mjs 用 import 闭包算(页面闭包 ∩ 改动集),探针不自己猜。
//   路由比较忽略前导 "/" 与 query("/pages/x/y?a=1" ≡ "pages/x/y");all 可以是字符串数组或对象数组(给 keyOf 取路由)。
//   🔴 全量档 / 裸跑 verify.sh 不设 PROBE_ROUTES → 行为与从前完全一样。
//   🔴 门因自身输入(探针脚本 / 基线 / 台账)变化而跑时,verify-scope 给的是 "*"(全扫)—— 基线变了不许只扫半场。
// mapRoutes(browser, routes, worker, {concurrency, context}):
//   开 N 条 lane,**每条 lane 一个独立 BrowserContext + 一个 page**,并行跑 worker(page, route, i)。
//   🔴 为什么必须每 lane 独立 context(2026-08-17 实测):同一 context 里同源的多个 page 共用一个渲染进程主线程,
//     JS 是交错执行不是并行,原来按串行校准的固定等待(700ms 渲染 / 320ms 换主题)会被拖穿 —— theme-constant 基线 4 条
//     并行 3 路时随机「消失」0-4 条、还冒出偶发新增 = 门被静默削弱。独立 context → 独立进程 → 单页时序与串行等价。
//   探针原来逐路由串行 + 固定等待(0.7-4.7 s/路由),并行 3 路即 ~3×;判定逻辑不动。返回按 routes 原顺序排列的结果数组
//   (worker 抛错 → 该项 {error, route})。PROBE_CONCURRENCY 可调(默认 3;1 = 回到串行);dev server 拥塞退化(P-097)时先降到 1 再怀疑代码。
export const normRoute = (r) => String(r || "").replace(/^\/+/, "").split("?")[0].replace(/\/+$/, "");

export function scopeRoutes(all, label = "probe", keyOf = (x) => x) {
  const env = (process.env.PROBE_ROUTES || "").trim();
  if (!env || env === "*") return { routes: all, scoped: false, note: "" };
  const want = new Set(env.split(",").map((s) => normRoute(s.trim())).filter(Boolean));
  const routes = all.filter((r) => want.has(normRoute(keyOf(r))));
  const note = `${label}: scoped ${routes.length}/${all.length} routes(PROBE_ROUTES 交集;未列出的路由本轮不扫,末轮全量会扫)`;
  console.log(note);
  return { routes, scoped: true, note };
}

export function concurrencyFromEnv(def = 3) {
  const n = Number(process.env.PROBE_CONCURRENCY);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : def;
}

export async function mapRoutes(browser, routes, worker, { concurrency = concurrencyFromEnv(), context = {} } = {}) {
  const results = new Array(routes.length);
  let next = 0;
  const lanes = Math.max(1, Math.min(concurrency, routes.length || 1));
  await Promise.all(Array.from({ length: lanes }, async () => {
    const ctx = await browser.newContext(context);
    const page = await ctx.newPage();
    try {
      for (;;) {
        const i = next++;
        if (i >= routes.length) break;
        try { results[i] = await worker(page, routes[i], i, lanes); } // 第 4 参 = 实际 lane 数(scoped 只剩 1 条路由时为 1,settleNetwork 据此空转;tester-F R2-03)
        catch (e) { results[i] = { error: e?.message || String(e), route: routes[i] }; }
      }
    } finally { await ctx.close().catch(() => {}); }
  }));
  return results;
}

// 有界 networkidle(包 ax):并行 N 页时共用一台 Vite dev server(单线程 transform),别的页在拉模块会把本页的图片 / 懒加载
//   请求排到 1-2s 后 —— 实测 3 页并行时空态插画 <img> 要 1.1-1.8s 才出现(串行 0.1s),固定 600ms 就判成「插画没加载出来」假红。
//   在固定等待之前先等本页网络空闲(封顶 timeoutMs,超时不抛 —— 有轮询的页面不该因此红),只补齐「服务器忙」那部分,判定不动。
//   🔴 只在真的并行(有效 lane 数 > 1)时等;PROBE_CONCURRENCY=1 = 串行 = 没有拥塞,直接返回 —— 否则「拥塞时降到 1」的逃生阀反而更慢
//   (tester-F F-04:orphan 33s→74s、empty-state 55s→89s)。lanes 由调用方传(探针知道自己实际开了几条 lane),不传按 env 算。
export async function settleNetwork(page, timeoutMs = 5000, lanes = concurrencyFromEnv()) { // 调用方应传 mapRoutes 给的实际 lane 数,不传才退回 env
  if (lanes <= 1) return;
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
}
