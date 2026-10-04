import ts from "typescript";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deviceDetailBackHref } from "./device-detail-navigation";
import { takeNavigationQuery } from "./route";
import detail from "../pages/earn/device-detail.vue?raw";
import slot from "../components/home/device-slot.vue?raw";
import row from "../components/home/device-row.vue?raw";

const start = detail.indexOf('const id = ref("")');
const end = detail.indexOf("const device = computed(", start);
if (start < 0 || end < start) throw new Error("device detail route handler missing");
const handler = ts.transpileModule(detail.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function loadPage(options: Record<string, string>) {
  let load: (options: Record<string, string>) => void = () => {};
  let show: () => void = () => {};
  const page = new Function("ref", "onLoad", "onShow", "takeNavigationQuery", "deviceDetailBackHref",
    `${handler}\nreturn { id, backHref };`)(
    ref,
    (callback: typeof load) => { load = callback; },
    (callback: typeof show) => { show = callback; },
    takeNavigationQuery,
    deviceDetailBackHref,
  ) as { id: { value: string }; backHref: { value: string } };
  load(options);
  return { id: page.id.value, backHref: page.backHref.value, show };
}

afterEach(() => vi.unstubAllGlobals());

describe("device detail return navigation", () => {
  it("returns home from the single device-row action", () => {
    expect(deviceDetailBackHref("home")).toBe("/pages/index/index");
    expect(slot).toContain('aria-hidden="true"');
    expect(slot).not.toContain("@click");
    expect(row).toContain("<DeviceSlot");
    expect(row).toContain("&from=home");
  });

  it("returns earn for earn entry, direct refresh, and unknown sources", () => {
    for (const source of ["earn", null, undefined, "", "/pages/me/me"]) {
      expect(deviceDetailBackHref(source)).toBe("/pages/earn/earn");
    }
    expect(detail).toContain('takeNavigationQuery("/pages/earn/device-detail")');
    expect(detail).toContain('backHref.value = deviceDetailBackHref(routeOptions.from || (fallbackMatches ? fallback.get("from") : null))');
  });

  it("uses the same target for the header and missing-device return", () => {
    expect(detail).toContain('<SubPageHeader :back="backHref"');
    expect(detail).toContain('navBack(backHref.value)');
  });

  it("restores both device and Home return after a hard refresh when H5 dropped the query", () => {
    const location = {
      hash: "#/pages/earn/device-detail",
      href: "https://example.test/app/#/pages/earn/device-detail",
    };
    const replaceState = vi.fn((_state: unknown, _title: string, url: string) => {
      location.href = url;
      location.hash = new URL(url).hash;
    });
    vi.stubGlobal("window", { location, history: { state: { uni: true }, replaceState } });

    expect(loadPage({ id: "phone%2F7", from: "home" })).toMatchObject({
      id: "phone/7", backHref: "/pages/index/index",
    });
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(location.hash.split("?")[1]).get("id")).toBe("phone%2F7");
    expect(new URLSearchParams(location.hash.split("?")[1]).get("from")).toBe("home");

    expect(loadPage({})).toMatchObject({ id: "phone/7", backHref: "/pages/index/index" });
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it("writes the query on show when H5 updates the hash after onLoad", () => {
    const location = { hash: "#/pages/index/index", href: "https://example.test/app/#/pages/index/index" };
    const replaceState = vi.fn((_state: unknown, _title: string, url: string) => {
      location.href = url;
      location.hash = new URL(url).hash;
    });
    vi.stubGlobal("window", { location, history: { state: null, replaceState } });
    const page = loadPage({ id: "phone-8", from: "home" });
    expect(replaceState).not.toHaveBeenCalled();
    location.hash = "#/pages/earn/device-detail";
    location.href = "https://example.test/app/#/pages/earn/device-detail";
    page.show();
    expect(loadPage({})).toMatchObject({ id: "phone-8", backHref: "/pages/index/index" });
  });

  it("does not combine a new device with an older device hash source", () => {
    const location = {
      hash: "#/pages/earn/device-detail?id=phone-A&from=home",
      href: "https://example.test/app/#/pages/earn/device-detail?id=phone-A&from=home",
    };
    const replaceState = vi.fn((_state: unknown, _title: string, url: string) => {
      location.href = url;
      location.hash = new URL(url).hash;
    });
    vi.stubGlobal("window", { location, history: { state: null, replaceState } });

    expect(loadPage({ id: "phone-B" })).toMatchObject({ id: "phone-B", backHref: "/pages/earn/earn" });
    expect(new URLSearchParams(location.hash.split("?")[1]).get("id")).toBe("phone-B");
    expect(new URLSearchParams(location.hash.split("?")[1]).get("from")).toBe("earn");
    expect(loadPage({})).toMatchObject({ id: "phone-B", backHref: "/pages/earn/earn" });
  });
});
