import { describe, expect, it, vi } from "vitest";
import { initPreContext, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import { ref } from "vue";
import androidPlugin from "../uni_modules/uvel-native-push/utssdk/app-android/index.uts?raw";
import iosPlugin from "../uni_modules/uvel-native-push/utssdk/app-ios/index.uts?raw";
import source from "./native-push.ts?raw";
import app from "@/App.vue?raw";
import preferences from "@/pages/me/preferences.vue?raw";
import manifestSource from "@/manifest.json?raw";
import { validNativePushToken, type NativePushPort } from "./native-push-controller";

type NativeEvent = { type: string; token?: string; notificationId?: string; provider: "FCM" | "APNS"; code?: string };
function adapter(platform: "Android" | "iOS", enabled = false, initialIosState = "denied", available = true) {
  const storage = new Map<string, unknown>(); let port!: NativePushPort, event!: (event: NativeEvent) => void;
  let iosState = initialIosState;
  const requestPermissions = vi.fn((_permissions, success) => success({ deniedPresent: ["android.permission.POST_NOTIFICATIONS"] }));
  const uni = { getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    getAppAuthorizeSetting: vi.fn(() => ({ notificationAuthorized: iosState })), navigateTo: vi.fn(), openAppAuthorizeSetting: vi.fn() };
  const plus = { os: { name: platform }, runtime: { version: "1.2.3", openURL: vi.fn() }, globalEvent: { addEventListener: vi.fn() },
    android: { importClass: () => ({ SDK_INT: 33 }), runtimeMainActivity: () => "activity",
    invoke: vi.fn((_target, method) => method === "areNotificationsEnabled" ? enabled : "manager"), requestPermissions } };
  const sdk = {
    shutdownNativePush: vi.fn(),
    initializeNativePush: vi.fn(() => { if (!available) throw new Error("PUSH_NATIVE_UNAVAILABLE"); }),
    getNativePushToken: vi.fn(callback => callback({ available, provider: platform === "Android" ? "FCM" : "APNS",
      token: platform === "Android" ? "fcm:" + "a".repeat(140) : "ab".repeat(32) })),
    addNativePushListener: vi.fn(callback => { event = callback; return 1; }),
    getInitialNotification: vi.fn(callback => callback({ notificationId: "cold-note" })),
    requestSystemPushPermission: vi.fn(callback => { iosState = "authorized"; callback({ permission: "granted" }); }),
  };
  initPreContext("app-plus");
  const ast = ts.createSourceFile("native-push.ts", preJs(source, "native-push.ts"), ts.ScriptTarget.Latest, true);
  const code = ts.transpileModule(ast.statements.filter(statement => !ts.isImportDeclaration(statement)).map(statement => statement.getText(ast).replace(/^export /, "")).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const functions = new Function("uni", "plus", "ref", "getDeviceId", "requireCryptoUuid", "sha256", "hasCheckoutLeaveGuard", "createNativePushController", "validNativePushToken", ...Object.keys(sdk),
    `${code}; return { installNativePush, refreshNativePush, nativePushPermission, nativePushRegistrationUnavailable, openNativePushSettings };`)(uni, plus, ref, () => "test-install", () => "test-uuid", () => "a".repeat(64), () => false,
      (_client: unknown, _vault: unknown, nativePort: NativePushPort) => { port = nativePort; return { sessionChanged() {}, start() {}, foreground() {} }; }, validNativePushToken, ...Object.values(sdk));
  functions.installNativePush({ client: {}, vault: {}, canNavigate: () => true, received() {} });
  return { port, uni, plus, storage, functions, sdk, event: (value: NativeEvent) => event(value) };
}

describe("native platform push adapter", () => {
  it("requests Android 13 notification permission once and reads actual notification manager state", async () => {
    const h = adapter("Android", false); expect(await h.port.permission(true)).toBe("denied");
    expect(h.plus.android.requestPermissions.mock.calls[0][0]).toEqual(["android.permission.POST_NOTIFICATIONS"]);
    expect(await h.port.token()).toEqual({ token: "fcm:" + "a".repeat(140), provider: "FCM" }); expect(h.functions.nativePushPermission.value).toBe("denied");
    await h.port.permission(true); expect(h.plus.android.requestPermissions).toHaveBeenCalledOnce();
  });
  it("does not initialize or ask until authenticated controller requests a token/permission", () => {
    const h = adapter("Android", true); expect(h.sdk.initializeNativePush).not.toHaveBeenCalled();
  });
  it("does not ask during ordinary foreground refresh and recognizes Android granted state", async () => {
    const h = adapter("Android", true); expect(await h.port.permission(false)).toBe("granted"); expect(h.plus.android.requestPermissions).not.toHaveBeenCalled();
  });
  it.each(["denied", "authorized", "not determined", "config error"])("reads iOS actual status %s and uses the APNs plugin permission callback", async state => {
    const h = adapter("iOS", false, state);
    expect(await h.port.permission(true)).toBe(["authorized", "not determined"].includes(state) ? "granted" : state === "denied" ? "denied" : "unknown");
    expect(h.sdk.requestSystemPushPermission).toHaveBeenCalledTimes(state === "not determined" ? 1 : 0);
    expect(await h.port.token()).toEqual({ token: "ab".repeat(32), provider: "APNS" });
  });
  it("does not request iOS authorization during ordinary permission readback", async () => {
    const h = adapter("iOS", false, "not determined"); expect(await h.port.permission(false)).toBe("unknown");
    expect(h.sdk.requestSystemPushPermission).not.toHaveBeenCalled();
  });
  it.each(["Android", "iOS"] as const)("reports native SDK/config failure separately from OS permission and rejects token registration on %s", async platform => {
    const h = adapter(platform, true, "authorized", false);
    expect(await h.port.permission(true)).toBe("granted");
    await expect(h.port.token()).rejects.toThrow("PUSH_NATIVE_UNAVAILABLE"); expect(h.functions.nativePushPermission.value).toBe("granted");
    expect(h.functions.nativePushRegistrationUnavailable.value).toBe(true);
  });
  it("does not let a stale native token failure overwrite permission readback after shutdown", async () => {
    const h = adapter("iOS", true, "authorized"); let completed!: (result: unknown) => void;
    h.sdk.getNativePushToken.mockImplementation(callback => { completed = callback; });
    const pending = h.port.token(); h.port.stop();
    completed({ available: false, provider: "APNS", code: "SESSION_CHANGED" });
    await expect(pending).rejects.toThrow("SESSION_CHANGED");
    expect(h.functions.nativePushPermission.value).toBe("denied"); expect(h.sdk.shutdownNativePush).toHaveBeenCalledOnce();
  });
  it("reinitializes the actual native adapter after GMS/configuration recovers in the same process", async () => {
    const h = adapter("Android", true);
    h.sdk.getNativePushToken.mockImplementationOnce(callback => callback({ available: false, provider: "FCM", code: "GMS_UNAVAILABLE" }));
    await expect(h.port.token()).rejects.toThrow("GMS_UNAVAILABLE");
    expect(h.functions.nativePushRegistrationUnavailable.value).toBe(true);
    expect(await h.port.permission(false)).toBe("granted");
    await expect(h.port.token()).resolves.toEqual({ token: "fcm:" + "a".repeat(140), provider: "FCM" });
    expect(h.sdk.initializeNativePush).toHaveBeenCalledTimes(2);
    expect(h.functions.nativePushRegistrationUnavailable.value).toBe(true);
    h.port.registrationUnavailable?.(false);
    expect(h.functions.nativePushRegistrationUnavailable.value).toBe(false);
  });
  it.each(["Android", "iOS"] as const)("normalizes real %s SDK token/message/cold click callbacks", platform => {
    const h = adapter(platform), callback = vi.fn(); h.port.listen(callback);
    expect(callback).toHaveBeenCalledWith({ type: "click", data: { notificationId: "cold-note" } });
    h.event({ type: "received", provider: platform === "Android" ? "FCM" : "APNS", notificationId: "note-1" });
    expect(callback).toHaveBeenCalledWith({ type: "receive", data: { notificationId: "note-1" } });
    h.event({ type: "token", provider: platform === "Android" ? "FCM" : "APNS", token: "rotated" });
    expect(callback).toHaveBeenCalledWith({ type: "token", data: { notificationId: undefined } });
    h.event({ type: "click", provider: platform === "Android" ? "FCM" : "APNS", notificationId: "note-2" });
    expect(callback).toHaveBeenCalledWith({ type: "click", data: { notificationId: "note-2" } });
    h.functions.refreshNativePush(); expect(h.sdk.getInitialNotification).toHaveBeenCalledTimes(2);
    const newIntent = h.plus.globalEvent.addEventListener.mock.calls[0][1] as () => void; newIntent();
    expect(h.sdk.getInitialNotification).toHaveBeenCalledTimes(3);
    h.event({ type: "error", provider: "FCM", code: "CONFIG_MISSING" }); expect(h.functions.nativePushPermission.value).toBe("unknown");
  });
  it("opens the iOS public app settings URL and exposes callback/throw failures", () => {
    const h = adapter("iOS"), failed = vi.fn(); h.functions.openNativePushSettings(failed);
    expect(h.plus.runtime.openURL).toHaveBeenCalledWith("app-settings:", failed);
    expect(h.uni.openAppAuthorizeSetting).not.toHaveBeenCalled();
    h.plus.runtime.openURL.mock.calls[0][1](); expect(failed).toHaveBeenCalledOnce();
    h.plus.runtime.openURL.mockImplementation(() => { throw new Error("unavailable"); });
    h.functions.openNativePushSettings(failed); expect(failed).toHaveBeenCalledTimes(2);
  });
  it("retains Android settings API with observable failures", () => {
    const h = adapter("Android"), failed = vi.fn(); h.functions.openNativePushSettings(failed);
    expect(h.plus.runtime.openURL).not.toHaveBeenCalled();
    h.uni.openAppAuthorizeSetting.mock.calls[0][0].fail(); expect(failed).toHaveBeenCalledOnce();
  });
  it("persists proof before returning it and reuses it across controller instances", () => {
    const h = adapter("Android"); const proof = h.port.bindingToken();
    expect(h.storage.get("uvel-push-proof-v1:test-install")).toBe(proof); expect(h.port.bindingToken()).toBe(proof);
    h.uni.setStorageSync = () => h.storage; h.storage.clear(); expect(() => h.port.bindingToken()).toThrow("PUSH_PROOF_STORAGE_UNAVAILABLE");
  });
  it("matches the actual native module exported API on both platforms", () => {
    const imports = ["initializeNativePush", "getNativePushToken", "addNativePushListener", "getInitialNotification", "requestNativePushPermission", "shutdownNativePush"];
    for (const actual of [androidPlugin, iosPlugin]) {
      for (const name of imports) expect(actual).toMatch(new RegExp(`export (?:function|const) ${name}\\b`));
    }
  });
  it("compiles all native imports, entry points and product controls out of H5", () => {
    initPreContext("h5");
    const compiled = preJs(source, "native-push.ts");
    expect(compiled).not.toMatch(/uni_modules|initializeNativePush|getNativePushToken|addNativePushListener|getInitialNotification|requestSystemPushPermission|plus\./);
    const appScript = app.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1];
    expect(preJs(appScript, "App.vue")).not.toMatch(/installNativePush\(\{|refreshNativePush\(\)|flushNativePushClick\(\)/);
    expect(preJs(preferences.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1], "preferences.vue")).not.toContain("managePushPermission");
  });
  it("keeps the manual iOS lifecycle Push module without any UniPush provider", () => {
    const manifest = JSON.parse(manifestSource.replace(/\/\*[\s\S]*?\*\//g, ""));
    expect(manifest["app-plus"].modules).toEqual({ Barcode: {}, Push: {} });
    expect(manifest["app-plus"].distribute.ios.pushRegisterMode).toBe("manual");
    expect(manifest["app-plus"].distribute.android.pushRegisterMode).toBe("manual");
    expect(manifest["app-plus"].distribute.sdkConfigs?.push).toBeUndefined();
    expect(manifest["app-plus"].distribute.ios.urltypes).toBe("uvel");
    expect(manifest["app-plus"].distribute.android.permissions).toContain('<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>');
  });
});
