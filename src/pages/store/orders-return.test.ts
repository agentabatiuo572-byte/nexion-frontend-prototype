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
  it("keeps completed warehouse trade-ins in Done rather than Closed", () => {
    const categoryStart = ordersSource.indexOf("function orderCategory(");
    const categoryEnd = ordersSource.indexOf("const filteredOrders", categoryStart);
    const categoryCode = ts.transpileModule(ordersSource.slice(categoryStart, categoryEnd), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const category = new Function(`${categoryCode}\nreturn orderCategory;`)();
    expect(category({ kind: "commerce", status: "inventory" })).toBe("done");
    expect(category({ kind: "commerce", status: "activated" })).toBe("done");
    expect(category({ kind: "commerce", status: "cancelled" })).toBe("closed");
  });
  it("counts down only an unpaid order's live server deadline", () => {
    const fnStart = ordersSource.indexOf("const nowSeconds = useNow();");
    const fnEnd = ordersSource.indexOf("\n}\n", fnStart) + 3;
    const code = ts.transpileModule(ordersSource.slice(fnStart, fnEnd), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const now = { value: 1_000 };
    const minutes = new Function("useNow", `${code}\nreturn pendingCloseMinutes;`)(() => now);
    const placed = { kind: "commerce", status: "placed", expiresAt: 1_000_000 + 11 * 60_000 + 1 };
    expect(minutes(placed)).toBe(12);
    expect(minutes({ ...placed, expiresAt: 1_000_000 + 30_000 })).toBe(1);
    expect(minutes({ ...placed, expiresAt: 1_000_000 })).toBeNull();
    expect(minutes({ ...placed, expiresAt: undefined })).toBeNull();
    expect(minutes({ ...placed, status: "payment_failed" })).toBeNull();
    expect(minutes({ kind: "genesis", status: "placed", expiresAt: 2_000_000 })).toBeNull();
  });
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

  it("opens on the status category named by the entry and ignores unknown ones", () => {
    const run = (options: Record<string, string>, query = "") => {
      let load: (options: Record<string, string>) => void = () => {};
      const result = new Function("ref", "onLoad", "takeNavigationQuery", `${handler}\nreturn { statusFilter };`)(
        ref, (callback: typeof load) => { load = callback; }, () => query,
      ) as { statusFilter: { value: string } };
      load(options);
      return result.statusFilter.value;
    };
    expect(run({ from: "me", status: "pending" })).toBe("pending");
    expect(run({ from: "me" }, "?from=me&status=closed")).toBe("closed");
    expect(run({ from: "me", status: "refunded" })).toBe("all");
    expect(run({})).toBe("all");
  });
});
