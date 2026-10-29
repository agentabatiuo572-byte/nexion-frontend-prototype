import { describe, expect, it, vi } from "vitest";
import { initPreContext, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import { ref } from "vue";
import source from "./native-push.ts?raw";
import app from "@/App.vue?raw";
import preferences from "@/pages/me/preferences.vue?raw";
import manifestSource from "@/manifest.json?raw";
import type { NativePushPort } from "./native-push-controller";

function adapter(platform: "Android" | "iOS", enabled = false, iosState = "denied") {
  const storage = new Map<string, unknown>(); let port!: NativePushPort;
  const requestPermissions = vi.fn((_permissions, success) => success({ deniedPresent: ["android.permission.POST_NOTIFICATIONS"] }));
  const uni = { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    getAppAuthorizeSetting: vi.fn(() => ({ notificationAuthorized: iosState })),
    getPushClientId: vi.fn(options => options.success({ cid: "test-cid" })), onPushMessage: vi.fn(), navigateTo: vi.fn(), openAppAuthorizeSetting: vi.fn() };
  const plus = { os: { name: platform }, runtime: { version: "1.2.3" }, android: { importClass: () => ({ SDK_INT: 33 }), runtimeMainActivity: () => "activity",
    invoke: vi.fn((_target, method) => method === "areNotificationsEnabled" ? enabled : "manager"), requestPermissions } };
  initPreContext("app-plus");
  const ast = ts.createSourceFile("native-push.ts", preJs(source, "native-push.ts"), ts.ScriptTarget.Latest, true);
  const code = ts.transpileModule(ast.statements.filter(statement => !ts.isImportDeclaration(statement)).map(statement => statement.getText(ast).replace(/^export /, "")).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const functions = new Function("uni", "plus", "ref", "getDeviceId", "requireCryptoUuid", "sha256", "hasCheckoutLeaveGuard", "createNativePushController",
    `${code}; return { installNativePush, nativePushPermission };`)(uni, plus, ref, () => "test-install", () => "test-uuid", () => "a".repeat(64), () => false,
      (_client: unknown, _vault: unknown, nativePort: NativePushPort) => { port = nativePort; return { sessionChanged() {}, start() {} }; });
  functions.installNativePush({ client: {}, vault: {}, canNavigate: () => true, received() {} });
  return { port, uni, plus, storage, functions };
}
describe("native platform push adapter", () => {
  it("requests Android 13 notification permission once and reads actual notification manager state", async () => {
    const h = adapter("Android", false); expect(await h.port.permission(true)).toBe("denied");
    expect(h.plus.android.requestPermissions.mock.calls[0][0]).toEqual(["android.permission.POST_NOTIFICATIONS"]);
    expect(await h.port.clientId()).toBe("test-cid"); expect(h.functions.nativePushPermission.value).toBe("denied");
    await h.port.permission(true); expect(h.plus.android.requestPermissions).toHaveBeenCalledOnce();
  });
  it("does not ask during ordinary foreground refresh and recognizes Android granted state", async () => {
    const h = adapter("Android", true); expect(await h.port.permission(false)).toBe("granted"); expect(h.plus.android.requestPermissions).not.toHaveBeenCalled();
  });
  it.each(["denied", "authorized", "not determined", "config error"])("reads iOS actual notification status %s independently of CID success", async state => {
    const h = adapter("iOS", false, state);
    expect(await h.port.permission(true)).toBe(state === "authorized" ? "granted" : state === "denied" ? "denied" : "unknown");
    expect(h.uni.getPushClientId).toHaveBeenCalledTimes(state === "not determined" ? 1 : 0);
  });
  it("persists proof before returning it and reuses it across controller instances", () => {
    const h = adapter("Android"); const proof = h.port.bindingToken();
    expect(h.storage.get("uvel-push-proof-v1:test-install")).toBe(proof); expect(h.port.bindingToken()).toBe(proof);
    h.uni.setStorageSync = () => h.storage; h.storage.clear(); expect(() => h.port.bindingToken()).toThrow("PUSH_PROOF_STORAGE_UNAVAILABLE");
  });
  it("compiles all native entry points and product controls out of H5", () => {
    initPreContext("h5");
    const compiled = preJs(source, "native-push.ts");
    expect(compiled).not.toMatch(/uni\.(getPushClientId|onPushMessage|openAppAuthorizeSetting)|plus\./);
    const appScript = app.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1];
    expect(preJs(appScript, "App.vue")).not.toMatch(/installNativePush\(\{|refreshNativePush\(\)|flushNativePushClick\(\)/);
    expect(preJs(preferences.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1], "preferences.vue")).not.toContain("managePushPermission");
  });
  it("enables UniPush2 offline native SDK and manual iOS permission request without credentials", () => {
    const manifest = JSON.parse(manifestSource.replace(/\/\*[\s\S]*?\*\//g, ""));
    expect(manifest["app-plus"].modules).toHaveProperty("Push");
    expect(manifest["app-plus"].distribute.sdkConfigs.push.unipush).toEqual({ version: "2", offline: true });
    expect(manifest["app-plus"].distribute.ios.pushRegisterMode).toBe("manual");
    expect(manifest["app-plus"].distribute.android.permissions).toContain('<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>');
  });
});
