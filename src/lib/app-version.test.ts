// @ts-expect-error Test-only source read runs in Node.
import { readFileSync } from "node:fs";
import { compile } from "@vue/compiler-dom";
import * as Vue from "vue";
import { initPreContext, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import { parseJson } from "@dcloudio/uni-cli-shared/dist/json/json";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatResourceVersion, readNativeResourceVersion, type ResourceVersion } from "./app-version";

const meSource = readFileSync(new URL("../pages/me/me.vue", import.meta.url), "utf8");
const manifest = parseJson(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"), false, "manifest.json");
afterEach(() => vi.unstubAllGlobals());

function renderFooter(versionFooter: string): string {
  const footer = meSource.match(/<text[^>]*class="block text-center font-mono-tabular"[^>]*>[\s\S]*?<\/text>/)?.[0];
  if (!footer) throw new Error("Version footer is missing");
  const render = new Function("Vue", compile(footer, { mode: "function" }).code)(Vue);
  return render({ versionFooter }, []).children;
}

describe("Me version footer", () => {
  it("renders the H5 artifact version instead of the historical fixed version", () => {
    expect(renderFooter("UVEL · H5 · v1.0.0 (100)")).toBe("UVEL · H5 · v1.0.0 (100)");
  });

  it("renders a changed native resource version without borrowing a host version", () => {
    expect(renderFooter("UVEL · APP/WGT · v1.1.0 (101)")).toBe("UVEL · APP/WGT · v1.1.0 (101)");
  });

  it("keeps unavailable version information visible as unknown", () => {
    expect(renderFooter("UVEL · APP/WGT · v? (?)")).toBe("UVEL · APP/WGT · v? (?)");
  });
});

function startPageVersion(platform: "app" | "h5", compiled: ResourceVersion = manifest) {
  initPreContext(platform);
  const source = meSource.slice(meSource.indexOf("const versionFooter ="), meSource.indexOf("const t = useT();"));
  if (!source) throw new Error("Page version initialization is missing");
  const show: Array<() => void> = [], unload: Array<() => void> = [];
  const code = ts.transpileModule(preJs(source, "me.vue"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const footer = new Function("ref", "onShow", "onUnload", "compiledResourceVersion", "formatResourceVersion", "readNativeResourceVersion", `${code}\nreturn versionFooter;`)(
    Vue.ref, (fn: () => void) => show.push(fn), (fn: () => void) => unload.push(fn), compiled, formatResourceVersion, readNativeResourceVersion,
  ) as Vue.Ref<string>;
  return { footer, show: () => show.forEach(fn => fn()), unload: () => unload.forEach(fn => fn()) };
}

describe("Current resource version", () => {
  it("uses the H5 compiled manifest and makes no native call even with a debug host present", () => {
    const getProperty = vi.fn();
    vi.stubGlobal("plus", { runtime: { appid: "HBuilder", version: "99.0.0", getProperty } });
    const page = startPageVersion("h5");
    expect(page.footer.value).toBe(`UVEL · H5 · v${manifest.versionName} (${manifest.versionCode})`);
    expect(renderFooter(page.footer.value)).toBe(page.footer.value);
    page.show();
    expect(getProperty).not.toHaveBeenCalled();
  });

  it("uses injected metadata instead of a second hardcoded H5 version", async () => {
    vi.resetModules();
    vi.stubGlobal("__UVEL_RESOURCE_VERSION__", { versionName: "2.0.1", versionCode: "201" });
    const { compiledResourceVersion } = await import("./app-version");
    expect(startPageVersion("h5", compiledResourceVersion).footer.value).toBe("UVEL · H5 · v2.0.1 (201)");
  });

  it("renders missing or invalid individual fields as unknown and accepts a numeric manifest code", () => {
    expect(formatResourceVersion("H5")).toBe("UVEL · H5 · v? (?)");
    expect(formatResourceVersion("APP", { versionName: "1.1.0", versionCode: 101 })).toBe("UVEL · APP · v1.1.0 (101)");
    expect(formatResourceVersion("APP", { versionName: " ", versionCode: "100" })).toBe("UVEL · APP · v? (100)");
    expect(formatResourceVersion("APP", { versionName: "1.1.0", versionCode: Number.NaN })).toBe("UVEL · APP · v1.1.0 (?)");
    expect(formatResourceVersion("APP", { versionName: "1.1.0\n", versionCode: "1e2" })).toBe("UVEL · APP · v? (?)");
  });

  it("reads current APP resources despite different compiled and debug-shell versions", () => {
    vi.stubGlobal("plus", { runtime: {
      appid: "current-app", version: "99.0.0", versionCode: "9999",
      getProperty: (appid: string, callback: (info: unknown) => void) => {
        expect(appid).toBe("current-app");
        callback({ appid, name: "UVEL", version: "1.1.0", versionCode: "101" });
      },
    } });
    const page = startPageVersion("app", { versionName: "1.0.0", versionCode: "100" });
    expect(page.footer.value).toBe("UVEL · APP · v? (?)");
    page.show();
    expect(renderFooter(page.footer.value)).toBe("UVEL · APP · v1.1.0 (101)");
  });

  it("keeps no-bridge and thrown native reads unknown without using compiled APP metadata", () => {
    vi.stubGlobal("plus", undefined);
    const page = startPageVersion("app");
    page.show();
    expect(page.footer.value).toBe("UVEL · APP · v? (?)");
    vi.stubGlobal("plus", { runtime: { appid: "current-app", getProperty: () => { throw new Error("unavailable"); } } });
    page.show();
    expect(page.footer.value).toBe("UVEL · APP · v? (?)");
  });

  it("rejects host metadata, another appid and a changed runtime appid", () => {
    let received: ResourceVersion | undefined;
    for (const info of [
      { appid: "current-app", name: "HBuilder", version: "99.0.0", versionCode: "9999" },
      { appid: "another-app", name: "UVEL", version: "1.1.0", versionCode: "101" },
      { appid: "current-app", version: "1.1.0", versionCode: "101" },
    ]) {
      vi.stubGlobal("plus", { runtime: { appid: "current-app", getProperty: (_appid: string, callback: (value: unknown) => void) => callback(info) } });
      readNativeResourceVersion(version => { received = version; });
      expect(formatResourceVersion("APP", received)).toBe("UVEL · APP · v? (?)");
    }
    const runtime = { appid: "current-app", getProperty: (_appid: string, callback: (value: unknown) => void) => {
      runtime.appid = "another-app";
      callback({ appid: "current-app", name: "UVEL", version: "1.1.0", versionCode: "101" });
    } };
    vi.stubGlobal("plus", { runtime });
    readNativeResourceVersion(version => { received = version; });
    expect(formatResourceVersion("APP", received)).toBe("UVEL · APP · v? (?)");
  });

  it("ignores older asynchronous results after refresh or page unload", () => {
    const callbacks: Array<(info: unknown) => void> = [];
    vi.stubGlobal("plus", { runtime: { appid: "current-app", getProperty: (_appid: string, callback: (info: unknown) => void) => callbacks.push(callback) } });
    const page = startPageVersion("app");
    page.show();
    page.show();
    callbacks[1]({ appid: "current-app", name: "UVEL", version: "1.2.0", versionCode: "102" });
    callbacks[0]({ appid: "current-app", name: "UVEL", version: "1.1.0", versionCode: "101" });
    expect(page.footer.value).toBe("UVEL · APP · v1.2.0 (102)");
    page.show();
    expect(page.footer.value).toBe("UVEL · APP · v? (?)");
    page.unload();
    callbacks[2]({ appid: "current-app", name: "UVEL", version: "1.3.0", versionCode: "103" });
    expect(page.footer.value).toBe("UVEL · APP · v? (?)");
  });
});
