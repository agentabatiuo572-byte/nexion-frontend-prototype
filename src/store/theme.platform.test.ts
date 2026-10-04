import * as Vue from "vue";
import * as Pinia from "pinia";
import { afterEach, expect, test, vi } from "vitest";
import { initPreContext, preHtml, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import { parseJson } from "@dcloudio/uni-cli-shared/dist/json/json";
import { initPlus } from "@dcloudio/uni-cli-shared/dist/json/app/manifest/plus";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import vendorSource from "../../node_modules/@dcloudio/uni-app-plus/dist/uni.runtime.esm.js?raw";
import themeSource from "./theme.ts?raw";
import bridgeSource from "../lib/native-theme.ts?raw";
import appSource from "../App.vue?raw";
import mainSource from "../main.ts?raw";
import manifestSource from "../manifest.json?raw";
import type { ThemeMode, useTheme } from "./theme";

// Execute the production store and bridge after the installed UniApp platform
// preprocessing. Only the device/browser APIs are fixtures; theme logic is real.
function execute(source: string, filename: string, dependencies: Record<string, unknown>): Record<string, any> {
  const code = ts.transpileModule(preJs(source, filename), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected production import: ${id}`);
    return dependencies[id];
  }, exports);
  return exports;
}

const stores: Array<ReturnType<typeof useTheme>> = [];
function start(platform: "app" | "h5", savedMode?: ThemeMode, initialOsTheme: string | undefined = "light", legacyMedia = false, beforeStore?: () => void) {
  let osTheme: string | undefined = initialOsTheme;
  let nativeStyle = "dark";
  const order: string[] = [];
  const nativeListeners = new Set<UniNamespace.OnThemeChangeCallback>();
  const mediaListeners = new Set<() => void>();
  const readInfo = vi.fn(() => { order.push(`read:${nativeStyle}`); return { osTheme: nativeStyle === "auto" ? osTheme : nativeStyle }; });
  const setUIStyle = vi.fn((style: string) => { nativeStyle = style; order.push(`ui:${style}`); });
  const setStatusBarStyle = vi.fn();
  const evalJS = vi.fn();
  const persist = vi.fn();
  const onThemeChange = vi.fn((callback: UniNamespace.OnThemeChangeCallback) => { nativeListeners.add(callback); });
  const offThemeChange = vi.fn((callback: UniNamespace.OnThemeChangeCallback) => { nativeListeners.delete(callback); });
  const mq = {
    get matches() { return osTheme === "dark"; },
    addEventListener: legacyMedia ? undefined : vi.fn((_name: string, callback: () => void) => { mediaListeners.add(callback); }),
    removeEventListener: vi.fn((_name: string, callback: () => void) => { mediaListeners.delete(callback); }),
    addListener: vi.fn((callback: () => void) => { mediaListeners.add(callback); }),
    removeListener: vi.fn((callback: () => void) => { mediaListeners.delete(callback); }),
  };
  const htmlTheme = vi.fn();
  vi.stubGlobal("window", platform === "h5" ? { matchMedia: vi.fn(() => mq) } : undefined);
  vi.stubGlobal("document", platform === "h5" ? { documentElement: { setAttribute: htmlTheme } } : undefined);
  vi.stubGlobal("uni", { getStorageSync: () => savedMode ? { mode: savedMode } : "", setStorageSync: persist, getSystemInfoSync: readInfo, onThemeChange, offThemeChange });
  vi.stubGlobal("plus", { nativeUI: { setUIStyle }, navigator: { setStatusBarStyle } });
  vi.stubGlobal("getCurrentPages", () => [{ $getAppWebview: () => ({ evalJS }) }]);
  beforeStore?.();
  Pinia.setActivePinia(Pinia.createPinia());
  initPreContext(platform);
  const bridge = execute(bridgeSource, "native-theme.ts", {});
  const production = execute(themeSource, "theme.ts", { vue: Vue, pinia: Pinia, "@/lib/native-theme": bridge });
  const store = production.useTheme() as ReturnType<typeof useTheme>;
  stores.push(store);
  return {
    store, readInfo, setUIStyle, setStatusBarStyle, evalJS, persist, order, onThemeChange, offThemeChange, mq, htmlTheme,
    syncNativeTheme: bridge.syncNativeTheme,
    setOs: (next: string | undefined) => { osTheme = next; },
    emitNative: (theme: unknown) => nativeListeners.forEach(callback => callback({ theme } as UniNamespace.OnThemeChangeCallbackResult)),
    emitMedia: () => mediaListeners.forEach(callback => callback()),
  };
}

afterEach(() => { stores.splice(0).forEach(store => store.$dispose()); vi.unstubAllGlobals(); });

function invokeNativePageHook(name: "onReady" | "onShow", env: ReturnType<typeof start>) {
  const program = ts.createSourceFile("main.ts", preJs(mainSource, "main.ts"), ts.ScriptTarget.Latest, true);
  let method: ts.MethodDeclaration | undefined;
  const find = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(program) === "app.mixin") {
      method = (node.arguments[0] as ts.ObjectLiteralExpression).properties.find(property =>
        ts.isMethodDeclaration(property) && property.name.getText(program) === name) as ts.MethodDeclaration;
    }
    ts.forEachChild(node, find);
  };
  find(program);
  if (!method) return;
  const body = ts.transpileModule(method.body!.getText(program), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("useTheme", "pinia", "syncNativeTheme", body)(() => env.store, Pinia.getActivePinia(), env.syncNativeTheme);
}

test.each(["light", "dark"] as const)("APP-PLUS cold System choice reads OS %s after native auto is enabled", async os => {
  const env = start("app", "system", os);
  await Vue.nextTick();
  expect(env.store.mode).toBe("system"); expect(env.store.resolved).toBe(os);
  expect(env.order.slice(0, 2)).toEqual(["ui:auto", "read:auto"]);
  expect(env.setStatusBarStyle).toHaveBeenLastCalledWith(os === "dark" ? "light" : "dark");
  expect(env.evalJS).toHaveBeenLastCalledWith(`document.documentElement.setAttribute("data-theme", "${os}")`);
  expect(env.persist).not.toHaveBeenCalled();
});

test.each(["light", "dark"] as const)("APP-PLUS saved manual %s wins over OS and later theme notifications", async mode => {
  const env = start("app", mode, mode === "dark" ? "light" : "dark");
  await Vue.nextTick();
  expect(env.store.resolved).toBe(mode); expect(env.setUIStyle).toHaveBeenCalledWith(mode);
  expect(env.readInfo).not.toHaveBeenCalled();
  env.emitNative(mode === "dark" ? "light" : "dark");
  // Uni's native event handler updates navigator style after notifying stores.
  env.setStatusBarStyle(mode === "dark" ? "dark" : "light");
  await Vue.nextTick();
  expect(env.store.mode).toBe(mode); expect(env.store.resolved).toBe(mode);
  expect(env.setStatusBarStyle).toHaveBeenLastCalledWith(mode === "dark" ? "light" : "dark");
  expect(env.persist).not.toHaveBeenCalled();
});

test("APP-PLUS fresh install preserves the existing dark default without saving System", async () => {
  const env = start("app"); await Vue.nextTick();
  expect(env.store.mode).toBe("dark"); expect(env.store.resolved).toBe("dark");
  expect(env.persist).not.toHaveBeenCalled(); expect(env.readInfo).not.toHaveBeenCalled();
  expect(env.evalJS).toHaveBeenLastCalledWith('document.documentElement.setAttribute("data-theme", "dark")');
});

test("APP-PLUS live OS changes update cached resolution and views, then manual choice wins over queued changes", async () => {
  const env = start("app", "system", "light"); await Vue.nextTick();
  expect(env.store.resolved).toBe("light");
  env.setOs("dark"); env.emitNative("dark"); await Vue.nextTick();
  expect(env.store.resolved).toBe("dark"); expect(env.store.mode).toBe("system");
  expect(env.evalJS).toHaveBeenLastCalledWith('document.documentElement.setAttribute("data-theme", "dark")');
  env.emitNative("light"); env.store.setMode("dark"); await Vue.nextTick();
  expect(env.store.mode).toBe("dark"); expect(env.store.resolved).toBe("dark");
  expect(env.evalJS).toHaveBeenLastCalledWith('document.documentElement.setAttribute("data-theme", "dark")');
  expect(env.persist).toHaveBeenLastCalledWith("nexgrid-theme-v1", { mode: "dark" });
  env.setOs("light"); env.store.setMode("system"); await Vue.nextTick();
  expect(env.store.resolved).toBe("light"); expect(env.order.slice(-2)).toEqual(["ui:auto", "read:auto"]);
});

test("APP-PLUS an old manual native notification cannot overwrite System's current OS read", async () => {
  const env = start("app", "dark", "light"); await Vue.nextTick();
  env.store.setMode("system"); await Vue.nextTick(); expect(env.store.resolved).toBe("light");
  env.emitNative("dark"); await Vue.nextTick();
  expect(env.store.mode).toBe("system"); expect(env.store.resolved).toBe("light");
  expect(env.evalJS).toHaveBeenLastCalledWith('document.documentElement.setAttribute("data-theme", "light")');
});

test("the actual APP-PLUS App.onShow entry refreshes System after a missed background notification", async () => {
  const env = start("app", "system", "dark"); await Vue.nextTick();
  env.setOs("light");
  const { descriptor } = parse(preJs(preHtml(appSource, "App.vue"), "App.vue"));
  const program = ts.createSourceFile("App.ts", descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
  const registration = program.statements.find(statement => ts.isExpressionStatement(statement)
    && ts.isCallExpression(statement.expression) && statement.expression.expression.getText(program) === "onShow") as ts.ExpressionStatement;
  const callback = (registration.expression as ts.CallExpression).arguments[0] as ts.ArrowFunction;
  const first = (callback.body as ts.Block).statements[0];
  expect(first.getText(program)).toContain("useTheme().refreshSystemTheme()");
  const actualEntry = ts.transpileModule(first.getText(program), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("useTheme", actualEntry)(() => env.store);
  await Vue.nextTick();
  expect(env.store.resolved).toBe("light"); expect(env.persist).not.toHaveBeenCalled();
  expect(env.evalJS).toHaveBeenLastCalledWith('document.documentElement.setAttribute("data-theme", "light")');
});

test("the actual native page onReady retries a cold OS read after the bridge becomes available", async () => {
  const env = start("app", "system", "light", false, () => {
    uni.getSystemInfoSync = () => { throw new Error("cold native bridge"); };
  });
  await Vue.nextTick(); expect(env.store.resolved).toBe("dark");
  vi.stubGlobal("uni", { ...uni, getSystemInfoSync: env.readInfo });
  invokeNativePageHook("onReady", env);
  await Vue.nextTick();
  expect(env.store.resolved).toBe("light"); expect(env.persist).not.toHaveBeenCalled();
  expect(env.evalJS).toHaveBeenLastCalledWith('document.documentElement.setAttribute("data-theme", "light")');
});

test.each((["light", "dark", "system"] as const).flatMap(mode => [
  { mode, order: "back" }, { mode, order: "tab" },
]))("native page onShow restores $mode icons after existing-page $order vendor styling", async ({ mode, order }) => {
  const env = start("app", mode, "light"); await Vue.nextTick();
  const icons = mode === "dark" ? "light" : "dark";
  const page = { $page: { statusBarStyle: icons === "dark" ? "light" : "dark" }, $getAppWebview: () => ({ evalJS: env.evalJS }) };
  vi.stubGlobal("getCurrentPages", () => [page]);
  const program = ts.createSourceFile("uni.runtime.js", vendorSource, ts.ScriptTarget.Latest, true);
  const declarations = ["setStatusBarStyle", "newSetStatusBarStyle"].map(name => {
    const declaration = program.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
    expect(declaration).toBeDefined(); return declaration!.getText(program);
  }).join("\n");
  // Run the installed vendor's actual wrapper and cached-page style restore.
  const restore = new Function("plus", "page", "initialStyle", `
    let lastStatusBarStyle = initialStyle;
    const oldSetStatusBarStyle = plus.navigator.setStatusBarStyle;
    const process = { env: { NODE_ENV: "production" } };
    const getCurrentPage = () => page;
    const getPage$BasePage = target => target.$page;
    ${declarations}
    plus.navigator.setStatusBarStyle = newSetStatusBarStyle;
    return () => setStatusBarStyle();
  `)(plus, page, icons) as () => void;
  if (order === "back") { restore(); invokeNativePageHook("onShow", env); }
  else { invokeNativePageHook("onShow", env); restore(); }
  expect(env.setStatusBarStyle).toHaveBeenLastCalledWith(page.$page.statusBarStyle);
  await Vue.nextTick();
  expect(env.store.mode).toBe(mode); expect(env.store.resolved).toBe(mode === "dark" ? "dark" : "light");
  expect(env.setStatusBarStyle).toHaveBeenLastCalledWith(icons);
  expect(env.evalJS).toHaveBeenLastCalledWith(`document.documentElement.setAttribute("data-theme", "${env.store.resolved}")`);
});

test("APP-PLUS missing/throwing OS query preserves the last valid System theme and recovers", async () => {
  const env = start("app", "system", "light"); await Vue.nextTick();
  env.readInfo.mockImplementationOnce(() => { throw new Error("bridge unavailable"); });
  expect(() => env.store.refreshSystemTheme()).not.toThrow(); await Vue.nextTick();
  expect(env.store.resolved).toBe("light");
  env.setOs("auto"); env.store.refreshSystemTheme(); await Vue.nextTick();
  expect(env.store.resolved).toBe("light");
  const read = uni.getSystemInfoSync; delete (uni as unknown as Record<string, unknown>).getSystemInfoSync;
  expect(() => env.store.refreshSystemTheme()).not.toThrow(); await Vue.nextTick();
  expect(env.store.resolved).toBe("light");
  uni.getSystemInfoSync = read; env.setOs("dark"); env.store.refreshSystemTheme(); await Vue.nextTick();
  expect(env.store.resolved).toBe("dark"); expect(env.persist).not.toHaveBeenCalled();
});

test("APP-PLUS unknown cold OS theme uses the dark fallback and a later valid query recovers", async () => {
  const env = start("app", "system", "unknown"); await Vue.nextTick();
  expect(env.store.resolved).toBe("dark"); expect(env.store.mode).toBe("system");
  env.emitNative("unknown"); await Vue.nextTick(); expect(env.store.resolved).toBe("dark");
  env.setOs("light"); env.store.refreshSystemTheme(); await Vue.nextTick();
  expect(env.store.resolved).toBe("light"); expect(env.persist).not.toHaveBeenCalled();
});

test.each(["missing", "throws"])("APP-PLUS foreground query still recovers when theme listener registration %s", async failure => {
  const env = start("app", "system", "light", false, () => {
    if (failure === "missing") delete (uni as unknown as Record<string, unknown>).onThemeChange;
    else uni.onThemeChange = () => { throw new Error("notifications unavailable"); };
  });
  await Vue.nextTick(); expect(env.store.resolved).toBe("light");
  env.setOs("dark"); expect(() => env.store.refreshSystemTheme()).not.toThrow(); await Vue.nextTick();
  expect(env.store.resolved).toBe("dark"); expect(env.persist).not.toHaveBeenCalled();
});

test("APP-PLUS native API failure cannot block a manual choice, persistence or later OS recovery", async () => {
  const env = start("app", "dark"); await Vue.nextTick();
  env.setUIStyle.mockImplementationOnce(() => { throw new Error("native UI unavailable"); });
  env.setStatusBarStyle.mockImplementationOnce(() => { throw new Error("status icons unavailable"); });
  expect(() => env.store.setMode("light")).not.toThrow(); await Vue.nextTick();
  expect(env.store.resolved).toBe("light"); expect(env.persist).toHaveBeenLastCalledWith("nexgrid-theme-v1", { mode: "light" });
  expect(env.evalJS).toHaveBeenLastCalledWith('document.documentElement.setAttribute("data-theme", "light")');
  const nativeUI = plus.nativeUI; delete (plus as unknown as Record<string, unknown>).nativeUI;
  expect(() => env.store.setMode("dark")).not.toThrow(); await Vue.nextTick();
  expect(env.store.resolved).toBe("dark"); expect(env.persist).toHaveBeenLastCalledWith("nexgrid-theme-v1", { mode: "dark" });
  plus.nativeUI = nativeUI;
  env.setOs("dark"); env.store.setMode("system"); await Vue.nextTick();
  expect(env.store.resolved).toBe("dark");
});

test("APP-PLUS store disposal removes the listener and prevents deferred stale theme writes", async () => {
  const env = start("app", "system", "light"); await Vue.nextTick();
  expect(env.onThemeChange).toHaveBeenCalledOnce();
  env.emitNative("dark"); env.store.$dispose(); env.evalJS.mockClear();
  await Vue.nextTick(); env.emitNative("light"); await Vue.nextTick();
  expect(env.offThemeChange).toHaveBeenCalledWith(env.onThemeChange.mock.calls[0][0]);
  expect(env.evalJS).not.toHaveBeenCalled();
});

test.each([false, true])("H5 System remains reactive with modern/legacy media listener (legacy=%s)", async legacy => {
  const env = start("h5", "system", "light", legacy);
  expect(env.store.resolved).toBe("light");
  env.setOs("dark"); env.emitMedia();
  expect(env.store.resolved).toBe("dark"); expect(env.htmlTheme).toHaveBeenLastCalledWith("data-theme", "dark");
  env.store.setMode("light"); env.setOs("dark"); env.emitMedia();
  expect(env.store.resolved).toBe("light"); expect(env.htmlTheme).toHaveBeenLastCalledWith("data-theme", "light");
  expect(env.readInfo).not.toHaveBeenCalled(); expect(env.setUIStyle).not.toHaveBeenCalled(); expect(env.onThemeChange).not.toHaveBeenCalled();
  env.store.$dispose(); env.htmlTheme.mockClear(); env.emitMedia();
  expect(env.htmlTheme).not.toHaveBeenCalled();
  expect(legacy ? env.mq.removeListener : env.mq.removeEventListener).toHaveBeenCalledOnce();
});

test("installed native manifest compiler enables OS following on Android and iOS", () => {
  const manifest = parseJson(manifestSource, false, "manifest.json");
  expect(manifest["app-plus"].darkmode).toBe(true);
  const native = { plus: manifest["app-plus"] };
  initPlus(native, { pages: [], globalStyle: {} });
  expect(native.plus.distribute.google.defaultNightMode).toBe("auto");
  expect(native.plus.distribute.apple.UIUserInterfaceStyle).toBe("Automatic");
});
