import { isStaticReviewRoute, normalizeRoute } from "@/lib/static-review-routes";

/**
 * 只有能在**未登录**状态下安全渲染的路由。
 *
 * 静态字符串键表 → `Record<..., true>`(本仓约定:小规模静态查找表不用 Set/Map)。
 * 判定用 `=== true` 而不是真值判断:`normalized` 来自路由串,若直接取真值,
 * `"constructor"` / `"toString"` 这类原型链上的键会被判成「在白名单里」。
 */
const PUBLIC_ROUTES: Record<string, true> = {
  "pages/onboarding/intro": true,
  "pages/onboarding/terms": true,
  "pages/onboarding/privacy": true,
  "pages/register/register": true,
  "pages/login/login": true,
  "pages/ref/code": true,
  "pages/tx/hash": true,
  "pages/session/kicked": true,
  // zentao #226:服务条款页里的「另见:平台风险披露」指向这一页。它是**公开法律文本**,
  // 与 terms/privacy 同类,必须能在未登录时打开 —— 否则登录守卫把用户送回引导页,
  // 等于要求先登录才能读一份强制阅读的风险披露。后端已同步放行其 GET 读取。
  "pages/me/risk-disclosure": true,
};

/** Only routes that can safely render without an authenticated account. */
export function isPublicAuthRoute(route?: string | null): boolean {
  const normalized = normalizeRoute(route);
  return isStaticReviewRoute(normalized)
    || PUBLIC_ROUTES[normalized] === true;
}
