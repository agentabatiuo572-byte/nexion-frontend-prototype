export type PageActivationOptions = { tabSwitch?: boolean; force?: boolean };

/** Navigation supplies confirmed Tab changes; reads never create activations. */
export function createPageReadController(now = () => Date.now()) {
  let route = "", visit = 0, protectedUntil = 0, lastAt = -Infinity, identityVersion = 0;
  let changes: number[] = [];
  function snapshot() {
    const at = now();
    if (at < lastAt) { changes = []; protectedUntil = 0; }
    lastAt = at;
    return { visit, protected: at < protectedUntil, remainingMs: Math.max(0, protectedUntil - at) };
  }
  function notifyPageActivation(nextRoute: string, options: PageActivationOptions = {}): () => void {
    if (route === nextRoute && !options.force) return () => {};
    snapshot();
    const previous = { route, changes: [...changes], protectedUntil, identityVersion };
    const at = now(), hadRoute = route !== "";
    route = nextRoute;
    const activation = ++visit;
    changes = changes.filter(time => at - time <= 1_000);
    if (hadRoute && options.tabSwitch && previous.route !== route) {
      changes.push(at);
      if (changes.length >= 3) protectedUntil = at + 3_000;
    }
    trace();
    return () => {
      if (visit !== activation || identityVersion !== previous.identityVersion) return;
      route = previous.route; changes = previous.changes; protectedUntil = previous.protectedUntil;
      visit += 1;
      trace();
    };
  }
  function trace(): void {
    if (import.meta.env.MODE !== "development" || import.meta.env.VITE_NEXGRID_TAB_READ_TRACE !== "1") return;
    const tab = ({ "pages/index/index": "home", "pages/earn/earn": "earn", "pages/team/team": "team",
      "pages/store/store": "store", "pages/me/me": "me" } as Record<string, string>)[route.replace(/^\//, "").split(/[?#]/)[0]] ?? null;
    console.info("[tab-protection]", JSON.stringify({ ...snapshot(), tab }));
  }
  function resetProtection(): void { changes = []; protectedUntil = 0; identityVersion += 1; }
  return { snapshot, notifyPageActivation, resetProtection };
}
