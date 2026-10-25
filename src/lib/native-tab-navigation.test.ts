import { afterEach, expect, it, vi } from "vitest";
import { logicalNativePage, nativeTabEntry, nativeTabUrl, onNativeTabChange, registerNativeTabHost, switchNativeTab, tabLocation } from "./native-tab-navigation";

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).forEach(stop => stop()); vi.unstubAllGlobals(); });

it("switches a visible shell in place and reports the actual business route and query", () => {
  const page = { route: "pages/tabs/tabs", $page: { id: 7 } };
  let location = nativeTabEntry();
  vi.stubGlobal("getCurrentPages", () => [page]);
  cleanup.push(registerNativeTabHost({ page, location: () => location, select: value => { location = value; } }));
  const changed = vi.fn(); cleanup.push(onNativeTabChange(changed));
  expect(switchNativeTab("/pages/store/store?focus=product-2&focusName=Pro+Max&activityId=promo")).toBe(true);
  expect(logicalNativePage(page)).toEqual({ route: "pages/store/store", options: { focus: "product-2", focusName: "Pro Max", activityId: "promo" } });
  expect(changed).toHaveBeenCalledOnce();
  expect(switchNativeTab("/pages/store/store?activityId=next")).toBe(true);
  expect(location.query).toEqual({ activityId: "next" });
});

it("does not consume child-page navigation or overwrite its auth/public route identity", () => {
  const page = { route: "pages/tabs/tabs", $page: { id: 7 } };
  const child = { route: "pages/me/wallet", options: { id: "private" } };
  const select = vi.fn();
  cleanup.push(registerNativeTabHost({ page, location: () => nativeTabEntry(), select }));
  vi.stubGlobal("getCurrentPages", () => [page, child]);
  expect(switchNativeTab("/pages/me/me")).toBe(false);
  expect(select).not.toHaveBeenCalled();
  expect(logicalNativePage(child)).toEqual(child);
});

it("encodes a fresh shell URL for resets/deep links without losing nested query characters", () => {
  const href = "/pages/store/store?focus=a%2Bb&focusName=Pro%20%26%20Max";
  const url = nativeTabUrl(href);
  const target = decodeURIComponent(url.slice(url.indexOf("target=") + 7));
  expect(target).toBe(href);
  expect(nativeTabEntry({ target }).query).toEqual({ focus: "a+b", focusName: "Pro & Max" });
  expect(nativeTabUrl("/pages/login/login")).toBe("/pages/login/login");
  expect(logicalNativePage({ route: "pages/tabs/tabs", options: { target: href } }).route).toBe("pages/store/store");
  expect(() => tabLocation("/pages/store/store?focus=%E0")).toThrow(URIError);
});

it.each(["/pages/store/store", "/pages/earn/earn", "/pages/team/team", "/pages/me/me"])("opens %s when App onLoad preserves the encoded target", path => {
  // App's encodeQueryString encodes values again before parseUrl decodes once.
  const href = `${path}?voucherId=BF%2B20&upgradeActivityId=Pro%20%26%20Max&focusName=literal%252F`;
  const target = nativeTabUrl(href).split("?target=")[1];
  const expected = tabLocation(href);
  expect(nativeTabEntry({ target })).toEqual(expected);
  expect(nativeTabEntry({ target: href })).toEqual(expected);
  expect(logicalNativePage({ route: "pages/tabs/tabs", options: { target } })).toEqual({ route: path.slice(1), options: expected!.query });
  expect(expected!.query).toEqual({ voucherId: "BF+20", upgradeActivityId: "Pro & Max", focusName: "literal%2F" });
});

it.each(["%E0", "/pages/store/store?focus=%E0", "%2Fpages%2Flogin%2Flogin"])("keeps invalid or non-tab targets out of the tab shell: %s", target => {
  expect(nativeTabEntry({ target })).toEqual(nativeTabEntry());
});

it("unregisters ownership without letting an old page clear a newly mounted shell", () => {
  const first = { route: "pages/tabs/tabs", $page: { id: 1 } }, second = { route: "pages/tabs/tabs", $page: { id: 2 } };
  const oldStop = registerNativeTabHost({ page: first, location: () => nativeTabEntry(), select: vi.fn() });
  const select = vi.fn(), stop = registerNativeTabHost({ page: second, location: () => nativeTabEntry(), select });
  cleanup.push(stop);
  oldStop(); vi.stubGlobal("getCurrentPages", () => [second]);
  expect(switchNativeTab("/pages/me/me")).toBe(true);
  stop(); expect(switchNativeTab("/pages/earn/earn")).toBe(false);
});
