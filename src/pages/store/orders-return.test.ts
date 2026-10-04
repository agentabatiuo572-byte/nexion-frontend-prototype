// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

const ordersSource = readFileSync(new URL("./orders.vue", import.meta.url), "utf8");
const meSource = readFileSync(new URL("../me/me.vue", import.meta.url), "utf8");
const ordersCardSource = readFileSync(new URL("../../components/me/orders-card.vue", import.meta.url), "utf8");
const start = ordersSource.indexOf('const ordersBackHref = ref("/store")');
const end = ordersSource.indexOf("// Sticky chassis nav header", start);
if (start < 0 || end < 0) throw new Error("orders return handler missing");
const handler = ts.transpileModule(ordersSource.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function open(options: Record<string, string>, query = "") {
  let load: (options: Record<string, string>) => void = () => {};
  const result = new Function("ref", "onLoad", "takeNavigationQuery", `${handler}\nreturn { ordersBackHref, preserveOrdersOriginInH5 };`)(
    ref,
    (callback: typeof load) => { load = callback; },
    () => query,
  ) as { ordersBackHref: { value: string }; preserveOrdersOriginInH5: () => void };
  load(options);
  return { backHref: result.ordersBackHref.value, preserve: result.preserveOrdersOriginInH5 };
}

afterEach(() => vi.unstubAllGlobals());

describe("orders return origin", () => {
  it("keeps My as the refresh fallback even when Uni drops the visible query", () => {
    expect(ordersCardSource).toContain('navTo("/pages/store/orders?from=me")');
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { hash: "#/pages/store/orders", href: "https://example.test/app/#/pages/store/orders" },
      history: { state: { uni: true }, replaceState },
    });

    expect(open({ from: "me" }, "?from=me").backHref).toBe("/me");
    expect(replaceState).toHaveBeenCalledWith(
      { uni: true }, "", "https://example.test/app/#/pages/store/orders?from=me",
    );

    (window.location as { hash: string }).hash = "#/pages/store/orders?from=me";
    replaceState.mockClear();
    expect(open({}, "?from=me").backHref).toBe("/me");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("carries the My origin from the account Orders row through a cold refresh", () => {
    const accountEntry = meSource.match(/\{ key: "orders",[^\n]*href: "([^"]+)"/)?.[1];
    expect(accountEntry).toBe("/store/orders?from=me");
    expect(meSource).toContain("navTo(item.href)");
    const query = new URL(accountEntry!, "https://example.test").search;
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        hash: `#/pages/store/orders${query}`,
        href: `https://example.test/app/#/pages/store/orders${query}`,
      },
      history: { state: null, replaceState },
    });

    expect(open({}, query).backHref).toBe("/me");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("restores the marker on show if the H5 hash updates after onLoad", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { hash: "#/pages/me/me", href: "https://example.test/app/#/pages/me/me" },
      history: { state: null, replaceState },
    });
    const page = open({ from: "me" });
    expect(page.backHref).toBe("/me");
    expect(replaceState).not.toHaveBeenCalled();
    (window.location as { hash: string; href: string }).hash = "#/pages/store/orders";
    (window.location as { hash: string; href: string }).href = "https://example.test/app/#/pages/store/orders";
    page.preserve();
    expect(replaceState).toHaveBeenCalledWith(null, "", "https://example.test/app/#/pages/store/orders?from=me");
    expect(ordersSource).toMatch(/ordersPageActive = true;\r?\n  preserveOrdersOriginInH5\(\);/);
  });

  it("reconciles a stale visible source with the current entry source", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        hash: "#/pages/store/orders?from=store&status=paid",
        href: "https://example.test/app/#/pages/store/orders?from=store&status=paid",
      },
      history: { state: { uni: true }, replaceState },
    });
    expect(open({ from: "me" }, "?from=store&status=paid").backHref).toBe("/me");
    expect(replaceState).toHaveBeenCalledWith(
      { uni: true }, "", "https://example.test/app/#/pages/store/orders?from=me&status=paid",
    );

    (window.location as { hash: string; href: string }).hash = "#/pages/store/orders?from=me&status=paid";
    (window.location as { hash: string; href: string }).href = "https://example.test/app/#/pages/store/orders?from=me&status=paid";
    replaceState.mockClear();
    expect(open({ from: "store" }, "?from=me&status=paid").backHref).toBe("/store");
    expect(replaceState).toHaveBeenCalledWith(
      { uni: true }, "", "https://example.test/app/#/pages/store/orders?from=store&status=paid",
    );
  });

  it("uses Store for Store entry and a direct route without an origin", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { hash: "#/pages/store/orders", href: "https://example.test/app/#/pages/store/orders" },
      history: { state: null, replaceState },
    });
    expect(open({}).backHref).toBe("/store");
    expect(open({ from: "store" }, "?from=store").backHref).toBe("/store");
    expect(replaceState).not.toHaveBeenCalled();
    expect(ordersSource).toContain("backHref: ordersBackHref.value");
  });
});
