import { logicalNativePage, nativeTabEntry, NATIVE_TAB_HOST, tabLocation } from "./native-tab-navigation";
import { notifyPageActivation } from "./passive-read-window";

type Page = Parameters<typeof logicalNativePage>[0];
function pageHref(page: Page): string {
  const logical = logicalNativePage(page);
  const query = Object.entries(logical.options).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&");
  return `/${logical.route}${query ? `?${query}` : ""}`;
}
function targetHref(url: string): string {
  if (url.split("?")[0] !== NATIVE_TAB_HOST) return url;
  const target = url.slice(url.indexOf("?") + 1).split("&").find(part => part.startsWith("target="));
  return nativeTabEntry({ target: target ? decodeURIComponent(target.slice(7)) : "" }).href;
}
function isTabChange(from: string, to: string): boolean {
  const previous = tabLocation(from), next = tabLocation(to);
  return !!previous && !!next && previous.tab !== next.tab;
}

/** Native API invoke precedes destination setup/show, including raw navigation outside route.ts. */
export function installNativePageReadActivation(): void {
  for (const method of ["navigateTo", "redirectTo", "reLaunch", "switchTab", "navigateBack"]) {
    uni.addInterceptor(method, {
      invoke(options: { url?: string; delta?: number; fail?: (result: unknown) => void }) {
        const pages = getCurrentPages();
        const from = pageHref(pages[pages.length - 1]);
        const to = method === "navigateBack" ? pageHref(pages[pages.length - 1 - (options.delta ?? 1)]) : targetHref(options.url ?? "");
        if (!to || to === "/") return;
        const rollback = notifyPageActivation(to, { tabSwitch: method !== "navigateBack" && isTabChange(from, to), force: from === to && method !== "switchTab" });
        const fail = options.fail;
        options.fail = result => { rollback(); fail?.(result); };
      },
    });
  }
}

type Route = { fullPath: string };
export type PageReadRouter = {
  beforeResolve: (guard: (to: Route, from: Route) => void) => unknown;
  afterEach: (hook: (to: Route, from: Route, failure?: unknown) => void) => unknown;
};
const installed = new WeakSet<object>();
/** Vue Router also reports browser history navigation; beforeResolve runs before page setup. */
export function installH5PageReadActivation(router: PageReadRouter | undefined): void {
  if (!router || installed.has(router)) return;
  installed.add(router);
  const rollbacks = new WeakMap<object, () => void>();
  router.beforeResolve((to, from) => {
    rollbacks.set(to, notifyPageActivation(to.fullPath, { tabSwitch: isTabChange(from.fullPath, to.fullPath) }));
  });
  router.afterEach((to, _from, failure) => {
    if (failure) rollbacks.get(to)?.();
    rollbacks.delete(to);
  });
}
