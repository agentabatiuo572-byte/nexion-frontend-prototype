/** Native tab content shares one page; public/business route identities stay unchanged. */
export const NATIVE_TAB_HOST = "/pages/tabs/tabs";
export const TAB_PATHS = {
  home: "/pages/index/index", earn: "/pages/earn/earn", store: "/pages/store/store",
  team: "/pages/team/team", me: "/pages/me/me",
} as const;
export type NativeTab = keyof typeof TAB_PATHS;
export type TabQuery = Record<string, string>;
export interface TabLocation { tab: NativeTab; route: string; query: TabQuery; href: string; }
type Page = { route?: string; options?: Record<string, unknown>; $page?: { id?: number } };
type Host = { page: Page; location: () => TabLocation; select: (location: TabLocation) => void };
let host: Host | undefined;
const routeListeners = new Set<() => void>();
export function onNativeTabChange(listener: () => void): () => void {
  routeListeners.add(listener);
  return () => { routeListeners.delete(listener); };
}

export function tabLocation(href: string): TabLocation | undefined {
  const [path, ...parts] = href.split("?");
  const tab = (Object.keys(TAB_PATHS) as NativeTab[]).find(key => TAB_PATHS[key] === path);
  if (!tab) return;
  const query: TabQuery = {};
  for (const pair of parts.join("?").split("&")) {
    if (!pair) continue;
    const split = pair.indexOf("=");
    const key = decodeURIComponent((split < 0 ? pair : pair.slice(0, split)).replace(/\+/g, " "));
    query[key] = decodeURIComponent((split < 0 ? "" : pair.slice(split + 1)).replace(/\+/g, " "));
  }
  return { tab, route: path.slice(1), query, href };
}

export function nativeTabUrl(href: string): string {
  const location = tabLocation(href);
  return location ? `${NATIVE_TAB_HOST}?target=${encodeURIComponent(href)}` : href;
}

export function nativeTabEntry(options: Record<string, unknown> = {}): TabLocation {
  try {
    const target = typeof options.target === "string" ? options.target : "";
    // App onLoad retains our outer encoding; already-decoded links keep their inner query intact.
    return tabLocation(target) ?? tabLocation(decodeURIComponent(target)) ?? tabLocation(TAB_PATHS.home)!;
  } catch { return tabLocation(TAB_PATHS.home)!; }
}

function samePage(left: Page | undefined, right: Page): boolean {
  return left === right || (left?.$page?.id !== undefined && left.$page.id === right.$page?.id);
}

export function registerNativeTabHost(value: Host): () => void {
  host = value;
  return () => { if (host === value) host = undefined; };
}

/** Only the top page may consume an in-place switch. A child page still uses normal routing. */
export function switchNativeTab(href: string): boolean {
  const location = tabLocation(href);
  if (!host || !location) return false;
  const pages = getCurrentPages();
  if (!samePage(pages[pages.length - 1], host.page)) return false;
  host.select(location);
  routeListeners.forEach(listener => listener());
  return true;
}

export function isCurrentNativeTab(href: string): boolean {
  if (!host) return false;
  const pages = getCurrentPages();
  return samePage(pages[pages.length - 1], host.page) && `/${host.location().route}` === href.split("?")[0];
}

export function logicalNativePage(page: Page | undefined): { route: string; options: Record<string, unknown> } {
  if (page?.route !== NATIVE_TAB_HOST.slice(1)) return { route: page?.route ?? "", options: page?.options ?? {} };
  const location = host && samePage(page, host.page) ? host.location() : nativeTabEntry(page.options);
  return { route: location.route, options: location.query };
}
