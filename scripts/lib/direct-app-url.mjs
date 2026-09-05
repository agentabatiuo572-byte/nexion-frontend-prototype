/**
 * Build an H5 URL that renders the UniApp document directly.
 *
 * localhost normally wraps the app in a device-shell iframe. DOM probes must
 * always opt out of that shell or every selector is evaluated against the
 * empty outer document.
 */
export function directAppUrl(baseUrl, route) {
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^?#]+$/i.test(base)) {
    throw new Error(`directAppUrl requires an http(s) base without query/hash: ${base}`);
  }

  const rawRoute = String(route ?? "").trim();
  if (/^https?:\/\//i.test(rawRoute)) {
    throw new Error("directAppUrl route must be an application hash route");
  }

  const hashIndex = rawRoute.indexOf("#");
  let hashRoute = hashIndex >= 0 ? rawRoute.slice(hashIndex) : "";
  if (!hashRoute) {
    const path = rawRoute.replace(/^\/+/, "");
    hashRoute = path ? `#/${path}` : "#/";
  } else if (!hashRoute.startsWith("#/")) {
    hashRoute = `#/${hashRoute.slice(1).replace(/^\/+/, "")}`;
  }

  return `${base}/?nx_device=off${hashRoute}`;
}
