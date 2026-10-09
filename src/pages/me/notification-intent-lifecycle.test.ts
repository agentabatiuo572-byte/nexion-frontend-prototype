import { notificationCategory } from "@/lib/notification-category";
import { advanceMessageHeader, createMessageHeaderState } from "@/lib/message-header-scroll";
import ts from "typescript";
import * as vue from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import pageSource from "./notifications.vue?raw";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { zh } from "@/i18n/messages/zh";
import { fmt } from "@/i18n/format";
import { formatUnreadBadge } from "@/lib/unread-badge";
import { createPinia, setActivePinia } from "pinia";
import { useUI } from "@/store/ui";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const scopes: vue.EffectScope[] = [];
afterEach(() => { for (const scope of scopes.splice(0)) scope.stop(); vi.unstubAllGlobals(); });

// Run the actual SFC worker with controlled IO and real Vue watchers.
function mount(remote = true, realQueue = false, navigationQuery = "", initialAccountKey = "a") {
  const epoch = createRemoteAccountEpoch(initialAccountKey);
  const app = vue.reactive({ accountKey: initialAccountKey, accountBindingEpoch: 0 });
  setActivePinia(createPinia());
  const ui = useUI();
  const confirmation = deferred<boolean>();
  const action = deferred<string | null>();
  const read = deferred<void>();
  const hooks: Record<string, Array<(...args: any[]) => void>> = { load: [], show: [], hide: [], unmount: [], mounted: [] };
  const notifs = vue.reactive({
    items: [], unread: 0, error: null, loading: false, nextCursor: null,
    clearRead: vi.fn(async () => {}), refreshRemote: vi.fn(),
    recordCta: vi.fn(() => action.promise), recordSwipeConversion: vi.fn(() => action.promise),
    markRead: vi.fn(() => read.promise), markAllRead: vi.fn(),
  });
  const drawer = vue.reactive({ section: "notifications", serviceUnread: 0, totalUnread: 0, refresh: () => notifs.refreshRemote() });
  const account = { ...epoch, bind(key: string) {
    // Actual App.bindAccount -> rebindAccountScopedStores order: epoch/key,
    // drawer reset, then the shared remote request fence. No source logic copy.
    app.accountBindingEpoch += 1;
    app.accountKey = key;
    drawer.section = "notifications";
    return epoch.bind(key);
  } };
  const navTo = vi.fn();
  const confirm = vi.fn((options: Parameters<typeof ui.confirm>[0]) => realQueue ? ui.confirm(options) : confirmation.promise);
  const modules: Record<string, unknown> = {
    vue: { ...vue, inject: (_key: unknown, fallback: unknown) => fallback, onMounted: (fn: () => void) => hooks.mounted.push(fn), onUnmounted: (fn: () => void) => hooks.unmount.push(fn) },
    "@dcloudio/uni-app": { onResize: vi.fn(), onLoad: (fn: (...args: any[]) => void) => hooks.load.push(fn), onShow: (fn: () => void) => hooks.show.push(fn), onHide: (fn: () => void) => hooks.hide.push(fn) },
    "@/lib/notification-category": { notificationCategory },
    "@/lib/message-header-scroll": { advanceMessageHeader, createMessageHeaderState },
    "@/lib/device-preview": { h5DevicePreviewStatusBarHeight: () => 0 },
    "@/store/pending-checkout-core": { PENDING_BAR_INSET_KEY: Symbol() },
    "@/i18n/use-t": { useT: () => vue.ref(zh) }, "@/i18n/format": { fmt },
    "@/lib/unread-badge": { formatUnreadBadge },
    "@/store/notifications": { useNotifications: () => notifs },
    "@/store/message-drawer": { useMessageDrawer: () => drawer },
    "@/lib/route": { navTo, takeNavigationQuery: () => navigationQuery }, "@/api/runtime": { remoteApiEnabled: remote },
    "@/lib/remote-account-epoch": { remoteAccountScope: account },
    "@/lib/notification-swipe": { isLeftConversionSwipe: () => true },
    "@/store/ui": { confirm, useUI: () => ui },
    "@/store/app": { useApp: () => app },
  };
  const source = pageSource;
  const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
  const output = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const scope = vue.effectScope(); scopes.push(scope);
  const worker = scope.run(() => new Function("require", "exports", output + ";return { confirmClearRead, onTap, onTouchStart, onTouchEnd, section, filter, serviceFilter, expandedId, headerFocused, headerState, onMessageScroll };")((name: string) => {
    if (name.endsWith(".vue")) return {};
    if (!(name in modules)) throw new Error(`Unexpected dependency ${name}`);
    return modules[name];
  }, {}));
  const fire = (name: string, ...args: unknown[]) => hooks[name].forEach(fn => fn(...args));
  return { worker, account, confirmation, action, read, notifs, drawer, navTo, confirm, fire, ui };
}
const notification = { id: "fixture", ctaHref: "/pages/team/team" };
const touch = (x: number) => ({ changedTouches: [{ clientX: x, clientY: 20 }] });

describe("notification pending intent isolation", () => {
  it("shares its section with the bell, accepts native/H5 route parameters and ignores unknown sections", () => {
    const h = mount(true, false, "?section=service");
    h.fire("load", {});
    expect(h.worker.section.value).toBe("service");
    expect(h.drawer.section).toBe("service");
    h.fire("load", { section: "notifications" });
    expect(h.worker.section.value).toBe("notifications");
    h.fire("load", { section: "invalid" });
    expect(h.worker.section.value).toBe("notifications");
    h.drawer.section = "service";
    expect(h.worker.section.value).toBe("service");
  });
  it("keeps a focused primary tab visible after switching section and scrolling", async () => {
    const h = mount();
    h.worker.headerFocused.value = true;
    h.worker.section.value = "service";
    await vue.nextTick();
    h.worker.onMessageScroll({ detail: { scrollTop: 200 } });
    expect(h.worker.headerFocused.value).toBe(true);
    expect(h.worker.headerState.value.primary).toBe(true);
    expect(pageSource).toContain('<scroll-view :key="section"');
  });
  for (const invalidation of ["hide", "unmount", "account", "rebind"]) {
    it(`cancels only this page's queued confirmation on ${invalidation}`, async () => {
      const h = mount(true, true);
      const pending = h.worker.confirmClearRead();
      const foreign = h.ui.confirm({ title: "Another page", owner: "foreign" });
      if (invalidation === "account") h.account.bind("b");
      else if (invalidation === "rebind") h.account.bind("a");
      else h.fire(invalidation);
      expect(h.ui.confirmQueue.map(row => row.owner)).toEqual(["foreign"]);
      await pending; expect(h.notifs.clearRead).not.toHaveBeenCalled();
      h.ui.clearConfirmsBy("foreign"); expect(await foreign).toBe(false);
    });
  }
  for (const invalidation of ["account", "rebind", "hide-show", "unmount"]) {
    it(`does not clear notifications when confirmation outlives ${invalidation}`, async () => {
      const h = mount();
      const pending = h.worker.confirmClearRead();
      if (invalidation === "account") h.account.bind("b");
      if (invalidation === "rebind") h.account.bind("a");
      if (invalidation === "hide-show") { h.fire("hide"); h.fire("show"); }
      if (invalidation === "unmount") h.fire("unmount");
      h.confirmation.resolve(true); await pending;
      expect(h.notifs.clearRead).not.toHaveBeenCalled();
    });
  }
  for (const accepted of [true, false]) {
    it(`honors a current confirmation (${accepted})`, async () => {
      const h = mount(); const pending = h.worker.confirmClearRead();
      h.confirmation.resolve(accepted); await pending;
      expect(h.notifs.clearRead).toHaveBeenCalledTimes(accepted ? 1 : 0);
    });
  }
  for (const action of ["tap", "swipe", "mock-tap"]) {
    it(`allows a current ${action} route`, async () => {
      const h = mount(action !== "mock-tap");
      h.worker.onTouchStart(notification, touch(100));
      const pending = action === "swipe" ? h.worker.onTouchEnd(notification, touch(10)) : h.worker.onTap(notification);
      h.action.resolve("/pages/team/team"); h.read.resolve(); await pending;
      expect(h.navTo).toHaveBeenCalledWith("/pages/team/team");
    });
    for (const invalidation of ["hide-show", "account", "rebind", "unmount"]) {
    it(`ignores a late ${action} route after ${invalidation}`, async () => {
      const h = mount(action !== "mock-tap");
      h.worker.onTouchStart(notification, touch(100));
      const pending = action === "swipe" ? h.worker.onTouchEnd(notification, touch(10)) : h.worker.onTap(notification);
      if (invalidation === "hide-show") { h.fire("hide"); h.fire("show"); }
      if (invalidation === "account") h.account.bind("b");
      if (invalidation === "rebind") h.account.bind("a");
      if (invalidation === "unmount") h.fire("unmount");
      h.action.resolve("/pages/team/team"); h.read.resolve(); await pending;
      expect(h.navTo).not.toHaveBeenCalled();
    });
    }
  }
  it("does not carry a touch gesture into a new account", async () => {
    const h = mount(); h.worker.onTouchStart(notification, touch(100));
    h.account.bind("b"); h.action.resolve(null);
    await h.worker.onTouchEnd(notification, touch(10));
    expect(h.notifs.recordSwipeConversion).not.toHaveBeenCalled();
  });
  it("refreshes on foreground but ignores hooks and actions after disposal", async () => {
    const h = mount(); h.fire("show");
    expect(h.notifs.refreshRemote).toHaveBeenCalledTimes(1);
    h.fire("unmount"); h.fire("show"); h.confirmation.resolve(true);
    await h.worker.confirmClearRead();
    expect(h.notifs.refreshRemote).toHaveBeenCalledTimes(1);
    expect(h.confirm).not.toHaveBeenCalled();
  });
});


// Platform IO is synthetic; page onLoad/onShow/setter/watchers are the actual SFC.
function h5Entry(href = "https://fixture.invalid/app/?outer=keep#/pages/me/notifications?section=notifications&from=me") {
  const location = new URL(href);
  const state = { position: 7, back: "/pages/me/me", opaque: { keep: true } };
  const history = { state, replaceState: vi.fn((_state: unknown, _title: string, next: string) => {
    location.href = new URL(next, location.href).href;
  }) };
  vi.stubGlobal("window", { location, history });
  return { location, state, history };
}
const primaryQuery = (href: URL) => new URLSearchParams(href.hash.split("?")[1] ?? "").get("section");

describe("message primary partition route lifecycle", () => {
  for (const selected of ["service", "notifications"] as const) {
    it(`mirrors ${selected}, then restores it in a fresh page through the first account bind`, async () => {
      const browser = h5Entry();
      const current = mount(); current.fire("load", {});
      current.worker.section.value = "service";
      current.worker.section.value = selected;
      await vue.nextTick();
      expect(primaryQuery(browser.location)).toBe(selected);
      expect(browser.location.pathname).toBe("/app/");
      expect(browser.location.search).toBe("?outer=keep");
      expect(new URLSearchParams(browser.location.hash.split("?")[1]).get("from")).toBe("me");
      expect(browser.history.replaceState).toHaveBeenCalled();
      for (const args of browser.history.replaceState.mock.calls) expect(args[0]).toBe(browser.state);
      expect(current.navTo).not.toHaveBeenCalled();
      expect(current.notifs.markRead).not.toHaveBeenCalled();
      expect(current.notifs.markAllRead).not.toHaveBeenCalled();
      expect(current.notifs.clearRead).not.toHaveBeenCalled();
      const query = browser.location.hash.slice(browser.location.hash.indexOf("?"));
      current.fire("unmount");
      const restored = mount(true, false, query, "default");
      restored.fire("load", {}); restored.fire("show");
      restored.account.bind("a");
      await vue.nextTick();
      expect(restored.worker.section.value).toBe(selected);
      expect(primaryQuery(browser.location)).toBe(selected);
      expect(restored.worker.serviceFilter.value).toBe("all");
    });
  }
  it("keeps explicit onLoad section ahead of a conflicting pending query", async () => {
    const browser = h5Entry();
    const h = mount(true, false, "?section=notifications");
    h.fire("load", { section: "service" }); await vue.nextTick();
    expect(h.worker.section.value).toBe("service");
    expect(primaryQuery(browser.location)).toBe("service");
  });
  for (const query of [{}, { section: "invalid" }, { section: "" }]) {
    it(`keeps a legal default for absent or invalid section ${JSON.stringify(query)}`, async () => {
      const browser = h5Entry("https://fixture.invalid/app/#/pages/me/notifications?from=me");
      const h = mount(); h.fire("load", query); await vue.nextTick();
      expect(h.worker.section.value).toBe("notifications");
      expect(primaryQuery(browser.location)).toBe("notifications");
    });
  }
  it("does not replace a route before onLoad consumes the existing entry query", async () => {
    const browser = h5Entry("https://fixture.invalid/app/#/pages/me/notifications?section=service");
    const h = mount(true, false, "?section=service", "default");
    h.account.bind("a"); await vue.nextTick();
    expect(browser.history.replaceState).not.toHaveBeenCalled();
    h.fire("load", {}); await vue.nextTick();
    expect(h.worker.section.value).toBe("service");
    expect(primaryQuery(browser.location)).toBe("service");
  });
  it("retains the latest user choice during the first default-to-account hydration", async () => {
    const browser = h5Entry();
    const h = mount(true, false, "?section=notifications", "default");
    h.fire("load", {}); h.worker.section.value = "service";
    h.account.bind("a"); await vue.nextTick();
    expect(h.worker.section.value).toBe("service");
    expect(primaryQuery(browser.location)).toBe("service");
  });
  for (const key of ["a", "b"]) {
    it(`resets the section and filters on a real ${key === "a" ? "same-account rebind" : "account switch"}`, async () => {
      const browser = h5Entry();
      const h = mount(true, false, "?section=service", "default");
      h.fire("load", {}); h.account.bind("a"); await vue.nextTick();
      h.worker.serviceFilter.value = "ticket"; h.worker.filter.value = "finance"; h.worker.expandedId.value = "old";
      h.account.bind(key); await vue.nextTick();
      expect(h.worker.section.value).toBe("notifications");
      expect(primaryQuery(browser.location)).toBe("notifications");
      expect(h.worker.serviceFilter.value).toBe("all");
      expect(h.worker.filter.value).toBe("all");
      expect(h.worker.expandedId.value).toBeNull();
      h.fire("hide"); h.fire("show"); await vue.nextTick();
      expect(h.worker.section.value).toBe("notifications");
    });
  }
  for (const second of ["a", "b"]) {
    it(`does not treat two binds in one tick (${second}) as a first restore`, async () => {
      const browser = h5Entry();
      const h = mount(true, false, "?section=service", "default");
      h.fire("load", {}); h.account.bind("a"); h.account.bind(second); await vue.nextTick();
      expect(h.worker.section.value).toBe("notifications");
      expect(primaryQuery(browser.location)).toBe("notifications");
    });
  }
  it("drops the old route intent after logout and later login", async () => {
    const browser = h5Entry();
    const h = mount(true, false, "?section=service"); h.fire("load", {});
    h.account.bind("default"); await vue.nextTick();
    h.account.bind("b"); await vue.nextTick(); h.fire("show");
    expect(h.worker.section.value).toBe("notifications");
    expect(primaryQuery(browser.location)).toBe("notifications");
  });
  it("rejects a stale entry query when a real account reset happens before onLoad", async () => {
    const browser = h5Entry();
    const h = mount(true, false, "?section=service");
    h.account.bind("b"); await vue.nextTick(); h.fire("load", {}); await vue.nextTick();
    expect(h.worker.section.value).toBe("notifications");
    expect(primaryQuery(browser.location)).toBe("notifications");
  });
  it("keeps native onLoad hydration without requiring a browser", async () => {
    vi.stubGlobal("window", undefined);
    const h = mount(true, false, "", "default"); h.fire("load", { section: "service" });
    h.account.bind("a"); await vue.nextTick();
    expect(h.worker.section.value).toBe("service");
    expect(h.navTo).not.toHaveBeenCalled();
  });
  it("does not rewrite hidden or foreign routes and mirrors the current state on return", async () => {
    const browser = h5Entry(); const h = mount(); h.fire("load", {});
    h.fire("hide"); h.drawer.section = "service"; await vue.nextTick();
    expect(browser.history.replaceState).not.toHaveBeenCalled();
    browser.location.hash = "#/pages/me/support-tickets?mode=list";
    h.fire("show"); await vue.nextTick();
    expect(browser.history.replaceState).not.toHaveBeenCalled();
    browser.location.hash = "#/pages/me/notifications?section=notifications&from=me";
    h.fire("show"); await vue.nextTick();
    expect(primaryQuery(browser.location)).toBe("service");
    h.fire("unmount"); h.drawer.section = "notifications"; await vue.nextTick();
    expect(primaryQuery(browser.location)).toBe("service");
  });
  it("keeps current in-memory selection when browser history rejects the replacement", async () => {
    const browser = h5Entry(); browser.history.replaceState.mockImplementation(() => { throw new Error("history unavailable"); });
    const h = mount(); h.fire("load", {}); h.worker.section.value = "service"; await vue.nextTick();
    expect(h.worker.section.value).toBe("service");
    expect(primaryQuery(browser.location)).toBe("notifications");
    expect(h.notifs.markRead).not.toHaveBeenCalled();
  });
});
