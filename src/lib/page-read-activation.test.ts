import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createRouter, createMemoryHistory, isNavigationFailure } from "vue-router";
import { installH5PageReadActivation, installNativePageReadActivation } from "./page-read-activation";
import { notifyPageActivation, passiveTabReadWindow } from "./passive-read-window";

let scope = 0;
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(0); notifyPageActivation("/reset"); vi.setSystemTime(100_000); scope++; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const routes = ["/pages/index/index", "/pages/earn/earn", "/pages/store/store", "/pages/team/team", "/pages/me/me", "/pages/me/preferences"];
it("actual Vue Router confirms before reads, rolls back a rejected target, and creates fresh visits on browser history back", async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: routes.map(path => ({ path, component: { render: () => null } })) });
  installH5PageReadActivation(router);
  let cancelled = false;
  router.beforeResolve(to => to.path === routes[3] && !cancelled ? (cancelled = true, false) : undefined);
  const read = vi.fn(async () => true), readPage = () => passiveTabReadWindow.run(String(scope), "page", read);
  await router.push(routes[0]); await readPage(); await readPage(); expect(read).toHaveBeenCalledTimes(1);
  await router.push(routes[1]); await readPage();
  await router.push(routes[2]); await readPage(); expect(read).toHaveBeenCalledTimes(3);
  expect(isNavigationFailure(await router.push(routes[3]))).toBe(true);
  await readPage(); expect(read).toHaveBeenCalledTimes(4); // Failed destination restores a fresh source visit.
  vi.setSystemTime(Date.now() + 1001);
  await router.push(routes[4]); await readPage(); expect(read).toHaveBeenCalledTimes(5);
  await router.push(routes[5]); await readPage(); expect(read).toHaveBeenCalledTimes(6);
  const back = new Promise<void>(resolve => { const stop = router.afterEach(() => { stop(); resolve(); }); });
  router.back(); await back; await readPage(); expect(router.currentRoute.value.path).toBe(routes[4]); expect(read).toHaveBeenCalledTimes(7);
});

it("native API invoke records before target reads, preserves arguments, and failed dispatch does not count toward fast changes", async () => {
  const interceptors: Record<string, any> = {};
  let current = { route: routes[0].slice(1), options: {} };
  vi.stubGlobal("getCurrentPages", () => [current]);
  vi.stubGlobal("uni", { addInterceptor: (method: string, hooks: unknown) => { interceptors[method] = hooks; } });
  installNativePageReadActivation(); notifyPageActivation(routes[0]);
  const read = vi.fn(async () => true), readPage = () => passiveTabReadWindow.run(String(scope), "native-page", read);
  await readPage();
  async function navigate(url: string, fail = false) {
    const callback = vi.fn(), options = { url, fail: callback };
    interceptors.reLaunch.invoke(options); expect(options.url).toBe(url);
    if (fail) { options.fail({}); expect(callback).toHaveBeenCalledOnce(); }
    else { current = { route: url.split("?")[0].slice(1), options: {} }; await readPage(); }
  }
  await navigate(routes[1]); await navigate(routes[2], true); await navigate(routes[3]);
  expect(read).toHaveBeenCalledTimes(3); // Only two confirmed changes.
  await navigate(routes[4]); expect(read).toHaveBeenCalledTimes(3); // Third confirmed change protects.
  vi.setSystemTime(Date.now() + 3000); await navigate(routes[0]); expect(read).toHaveBeenCalledTimes(4);
});
