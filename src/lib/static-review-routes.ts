const STATIC_REVIEW_PREFIXES = [
  "pages/entry-surfaces/",
];

/**
 * 把路由归一成**页面栈同形**(`pages/x/y`),吃得下 `getCurrentPages()` 的 `pages/x/y`
 * 与 H5 冷启动时只能拿到的 `#/pages/x/y?q=1` 两种形态。
 *
 * 🔴 导出成单一来源,是因为「一半判据归一化、另一半没有」曾经放行过越权访问:
 * App.vue 的 isAuthWhitelisted 原来是 `isStaticReviewRoute(route) || 前缀.startsWith(route)`
 * —— 前半段(本文件)归一化了,后半段直接 startsWith,喂 hash 形态时白名单判不中。
 * 两份正则各写一份必然漂移,权限判据经不起漂移。
 */
export function normalizeRoute(route?: string | null): string {
  const raw = (route ?? "").trim().replace(/^\/?#?\/?/, "").split(/[?#]/, 1)[0];
  let decoded = raw;
  for (let pass = 0; pass < 16; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    } catch {
      return "";
    }
  }
  // One non-mutating stability check lets exactly 16 layers through while
  // rejecting any input that would need a 17th decoding pass.
  try {
    if (decodeURIComponent(decoded) !== decoded) return "";
  } catch {
    return "";
  }
  decoded = decoded.replace(/\\/g, "/").split(/[?#]/, 1)[0];

  const canonical: string[] = [];
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!canonical.length) return "";
      canonical.pop();
      continue;
    }
    canonical.push(segment);
  }
  return canonical.join("/");
}

/** Return the canonical uni.reLaunch URL for an H5 hash, preserving its query. */
export function canonicalH5RouteUrl(route?: string | null): string {
  const raw = String(route ?? "").trim();
  const normalized = normalizeRoute(raw);
  if (!normalized) return "";
  const queryStart = raw.indexOf("?");
  const query = queryStart >= 0 ? raw.slice(queryStart).split("#", 1)[0] : "";
  return `/${normalized}${query}`;
}

/**
 * Pick the live H5 route without trusting a stale UniApp page stack.
 *
 * Vue Router leaves getCurrentPages() on the previous page when a same-document
 * hash points at a retired or non-canonical route.  The address bar is the user
 * input in that case, so every non-root hash must win.  A bare `#/` is the one
 * exception: it carries no page identity and the established page stack remains
 * the better witness.
 */
export function routeFromH5Location(
  pageRoute?: string | null,
  hashRoute?: string | null,
): string {
  const hash = String(hashRoute ?? "").trim();
  const rawPath = hash.replace(/^#/, "").split(/[?#]/, 1)[0];
  if (hash && rawPath && rawPath !== "/") return normalizeRoute(hash);
  return normalizeRoute(pageRoute);
}

export function isStaticReviewRoute(route?: string | null): boolean {
  if (!route) return false;
  return STATIC_REVIEW_PREFIXES.some((prefix) => normalizeRoute(route).startsWith(prefix));
}
