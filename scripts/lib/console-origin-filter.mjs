/**
 * 控制台报错的**来源过滤**:只忽略第三方源的资源加载失败,自家代码的报错照抓。
 *
 * 🔴 由来(2026-07-31/08-01):`verify.sh all` 连续多轮各红 1-2 条,**每轮红的脚本都不一样**,
 * 报错却都是同一句「Failed to load resource: 500」,逐个单跑全部 PASS。
 * 12 并发压测抓到真凶:`index.html` 用外链字体 `api.fontshare.com`,并发下被限流返 500 ——
 * 而这些脚本把「控制台有任何报错」一律判失败,于是外部网络抖动变成了本项目的假红。
 *
 * 判据故意写成**白名单本源**而不是黑名单某个域名:换一家 CDN、多一个外链,门不用改;
 * 而任何自家 origin 的报错(真 bug)一条都不会被放过。
 *
 * ⚠️ 只过滤**资源加载类**报错。第三方脚本抛的 JS 异常仍会被 `pageerror` 抓到 ——
 * 那类要单独判断,不在本过滤范围内(否则会把真问题一起吞掉)。
 */

const RESOURCE_FAILURE = /Failed to load resource|net::ERR_|ERR_CONNECTION|the server responded with a status of/i;

/** 这条控制台报错是不是**第三方资源**加载失败(可忽略)。 */
export function isThirdPartyResourceError(text, sourceUrl, baseUrl) {
  if (!RESOURCE_FAILURE.test(String(text || ""))) return false;
  if (!sourceUrl) return false;
  try {
    const src = new URL(sourceUrl);
    const base = new URL(baseUrl || "http://localhost:5173");
    return src.origin !== base.origin;
  } catch {
    return false;
  }
}

/**
 * 装到 `page.on("console", …)` 里的收集器工厂。
 * 用法:`page.on("console", collectAppConsoleErrors(errors, baseUrl))`
 */
export function collectAppConsoleErrors(sink, baseUrl) {
  return (message) => {
    if (message.type() !== "error") return;
    const src = typeof message.location === "function" ? message.location()?.url : undefined;
    if (isThirdPartyResourceError(message.text(), src, baseUrl)) return;
    sink.push(message.text());
  };
}
