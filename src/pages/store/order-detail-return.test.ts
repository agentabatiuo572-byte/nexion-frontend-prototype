// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

const listSource = readFileSync(new URL("./orders.vue", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("./order-detail.vue", import.meta.url), "utf8");
const transpile = (body: string) => ts.transpileModule(body, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function list(from?: string, query = "") {
  let load: (options: Record<string, string>) => void = () => {};
  const navTo = vi.fn();
  const body = listSource.slice(listSource.indexOf('const ordersBackHref = ref("/store")'),
    listSource.indexOf("// Sticky chassis nav header"))
    + listSource.slice(listSource.indexOf("function goOrder("), listSource.indexOf("const remoteErrorStyle"));
  const page = new Function("ref", "onLoad", "takeNavigationQuery", "navTo",
    `${transpile(body)}\nreturn { ordersBackHref, goOrder };`)(ref,
    (callback: typeof load) => { load = callback; }, () => query, navTo);
  load(from ? { from } : {});
  return { page, navTo };
}

function detail(options: Record<string, string> = {}, query = "") {
  let load: (options: Record<string, string>) => void = () => {};
  let header: () => { backHref: string } = () => ({ backHref: "" });
  const shows: (() => void)[] = [];
  const navTo = vi.fn();
  const body = detailSource.slice(detailSource.indexOf('const id = ref("");'),
    detailSource.indexOf("const remoteOrderError = ref(false)"))
    + detailSource.slice(detailSource.indexOf("onShow(() => {"), detailSource.indexOf("onHide(() => {"))
    + detailSource.slice(detailSource.indexOf("useSetPageHeader(() => ({"), detailSource.indexOf("// While on this page"))
    + detailSource.slice(detailSource.indexOf("function goOrders()"), detailSource.indexOf("function goEarn()"));
  const deps = { ref, onLoad: (callback: typeof load) => { load = callback; },
    takeNavigationQuery: () => query, onShow: (callback: () => void) => { shows.push(callback); },
    useSetPageHeader: (callback: typeof header) => { header = callback; }, navTo,
    remoteOrderAttempted: ref(false), remoteOrderError: ref(false), showRemoteOrderLoading: ref(false),
    order: ref(null), t: ref({ orders: { title: "Orders", notFound: "Not found" } }),
    refreshOrder: () => {}, refreshOrderWallet: () => {}, restoreOrderAction: vi.fn(), recoverOrderAction: vi.fn().mockResolvedValue(undefined) };
  const page = new Function(...Object.keys(deps), `${transpile(body)}\nreturn { id, goOrders };`)(...Object.values(deps));
  load(options);
  return { page, navTo, header, show: () => shows.forEach(callback => callback()) };
}

function browser(hash: string) {
  const location = { hash, href: `https://example.test/app/${hash}` };
  const replaceState = vi.fn((_state: unknown, _title: string, href: string) => {
    location.href = href;
    location.hash = new URL(href).hash;
  });
  vi.stubGlobal("window", { location, history: { state: { uni: true }, replaceState } });
  return { location, replaceState };
}

afterEach(() => vi.unstubAllGlobals());

describe("order detail return after a fresh page reconstruction", () => {
  it.each(["me", "store"])("carries %s from the list through detail refresh and both return controls", from => {
    const h = list(from);
    const orderNo = "ORDER /+?&";
    h.page.goOrder({ id: orderNo, kind: "commerce" });
    const href = new URL(h.navTo.mock.calls[0][0], "https://example.test");
    expect(href.searchParams.get("id")).toBe(orderNo);
    expect(href.searchParams.get("from")).toBe(from);
    browser(`#/pages/store/order-detail${href.search}`);
    const refreshed = detail({}, href.search);
    const back = from === "me" ? "/store/orders?from=me" : "/store/orders?from=store";
    expect(refreshed.page.id.value).toBe(orderNo);
    expect(refreshed.header().backHref).toBe(back);
    refreshed.page.goOrders();
    expect(refreshed.navTo).toHaveBeenCalledWith(back);
    const backQuery = new URL(back, "https://example.test").search;
    browser(`#/pages/store/orders${backQuery}`);
    expect(list(undefined, backQuery).page.ordersBackHref.value).toBe(from === "me" ? "/me" : "/store");
  });

  it("restores a dropped source without losing order, payment, or other query fields", () => {
    const h = browser("#/pages/store/order-detail?id=ORDER-1&paymentNo=PAY-1&returnTo=%2Fme%2Fwallet&campaign=reward");
    const page = detail({ id: "ORDER-1", from: "me" });
    expect(page.header().backHref).toBe("/store/orders?from=me");
    const query = new URLSearchParams(h.location.hash.split("?")[1]);
    const values: Record<string, string> = {};
    query.forEach((value, key) => { values[key] = value; });
    expect(values).toEqual({ id: "ORDER-1", paymentNo: "PAY-1", returnTo: "/me/wallet", campaign: "reward", from: "me" });
    expect(h.replaceState).toHaveBeenCalledWith({ uni: true }, "", h.location.href);
    expect(detail({}, `?${query}`).header().backHref).toBe("/store/orders?from=me");
  });

  it("restores source on show once H5 updates its hash to the same order", () => {
    const h = browser("#/pages/me/me");
    const page = detail({ id: "ORDER-1", from: "me" });
    expect(h.replaceState).not.toHaveBeenCalled();
    h.location.hash = "#/pages/store/order-detail?id=ORDER-1&paymentNo=PAY-1";
    h.location.href = `https://example.test/app/${h.location.hash}`;
    page.show();
    expect(new URLSearchParams(h.location.hash.split("?")[1]).get("id")).toBe("ORDER-1");
    expect(new URLSearchParams(h.location.hash.split("?")[1]).get("from")).toBe("me");
    expect(new URLSearchParams(h.location.hash.split("?")[1]).get("paymentNo")).toBe("PAY-1");
  });

  it.each(["", "UNKNOWN-ORDER"])("keeps My return for absent/unknown order %s", id => {
    const page = detail({ id, from: "me" });
    expect(page.header().backHref).toBe("/store/orders?from=me");
    page.page.goOrders();
    expect(page.navTo).toHaveBeenCalledWith("/store/orders?from=me");
  });

  it("uses Store for a direct link without source and keeps unrelated from parameters", () => {
    const h = browser("#/pages/store/order-detail?id=ORDER-2&from=promotion&intent=ORIGINAL-INTENT");
    const page = detail({}, "?id=ORDER-2&from=promotion&intent=ORIGINAL-INTENT");
    expect(page.page.id.value).toBe("ORDER-2");
    expect(page.header().backHref).toBe("/store/orders");
    expect(h.replaceState).not.toHaveBeenCalled();
    expect(detail({ id: "ORDER-3" }).header().backHref).toBe("/store/orders");
  });

  it("uses current explicit source over a stale hash and preserves direct Store source", () => {
    const h = browser("#/pages/store/order-detail?id=ORDER-4&from=me&paymentNo=PAY-4");
    const page = detail({ id: "ORDER-4", from: "store" }, "?id=ORDER-4&from=me&paymentNo=PAY-4");
    expect(page.header().backHref).toBe("/store/orders?from=store");
    expect(new URLSearchParams(h.location.hash.split("?")[1]).get("from")).toBe("store");
    expect(new URLSearchParams(h.location.hash.split("?")[1]).get("paymentNo")).toBe("PAY-4");
  });

  it("leaves Genesis navigation and another visible page untouched", () => {
    const h = list("me");
    h.page.goOrder({ id: "GENESIS-1", kind: "genesis" });
    expect(h.navTo).toHaveBeenCalledWith("/pages/genesis/holder");
    const visible = browser("#/pages/store/orders?from=store");
    detail({ id: "ORDER-1", from: "me" }).show();
    expect(visible.replaceState).not.toHaveBeenCalled();
  });

  it("does not rewrite B's identity or payment intent when old A loads", () => {
    const hash = "#/pages/store/order-detail?id=ORDER-B&from=store&paymentNo=PAY-B&intent=INTENT-B";
    const h = browser(hash);
    const page = detail({ id: "ORDER-A", from: "me" }, hash.slice(hash.indexOf("?")));
    expect(page.page.id.value).toBe("ORDER-A");
    expect(page.header().backHref).toBe("/store/orders?from=me");
    expect(h.location.hash).toBe(hash);
    expect(h.replaceState).not.toHaveBeenCalled();
  });

  it("does not rewrite B's payment intent when old A receives a delayed show", () => {
    const h = browser("#/pages/me/me");
    const page = detail({ id: "ORDER-A", from: "me" });
    const hash = "#/pages/store/order-detail?id=ORDER-B&from=store&paymentNo=PAY-B&intent=INTENT-B";
    h.location.hash = hash;
    h.location.href = `https://example.test/app/${hash}`;
    page.show();
    expect(h.location.hash).toBe(hash);
    expect(h.replaceState).not.toHaveBeenCalled();
  });

  it("does not inherit B's source when A's load options omit source", () => {
    const hash = "#/pages/store/order-detail?id=ORDER-B&from=me&paymentNo=PAY-B&intent=INTENT-B";
    const h = browser(hash);
    const page = detail({ id: "ORDER-A" }, hash.slice(hash.indexOf("?")));
    expect(page.page.id.value).toBe("ORDER-A");
    expect(page.header().backHref).toBe("/store/orders");
    expect(h.location.hash).toBe(hash);
    expect(h.replaceState).not.toHaveBeenCalled();
  });

  it.each(["", "?paymentNo=PAY-B&intent=INTENT-B", "?id=ORDER-A&id=ORDER-B&from=store"])(
    "leaves a detail URL without one matching order identity unchanged: %s", query => {
      const hash = `#/pages/store/order-detail${query}`;
      const h = browser(hash);
      detail({ id: "ORDER-A", from: "me" }, query).show();
      expect(h.location.hash).toBe(hash);
      expect(h.replaceState).not.toHaveBeenCalled();
    });

  it.each(["?from=me", "?id=ORDER-A&id=ORDER-B&from=me", "?id=ORDER-A&from=me&from=store"])(
    "rejects a fallback source without one matching identity and source: %s", query => {
      expect(detail({ id: "ORDER-A" }, query).header().backHref).toBe("/store/orders");
    });

  it("uses matching cold-query source while preserving an unsupported explicit source", () => {
    const hash = "#/pages/store/order-detail?id=ORDER-A&from=me&paymentNo=PAY-A&intent=INTENT-A";
    const h = browser(hash);
    const query = hash.slice(hash.indexOf("?"));
    expect(detail({ id: "ORDER-A" }, query).header().backHref).toBe("/store/orders?from=me");
    expect(detail({ id: "ORDER-A", from: "promotion" }, query).header().backHref).toBe("/store/orders");
    expect(h.location.hash).toBe(hash);
    expect(h.replaceState).not.toHaveBeenCalled();
  });
});
