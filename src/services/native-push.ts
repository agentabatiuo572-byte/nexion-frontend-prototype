import { sha256 } from "js-sha256";
import { ref } from "vue";
import type { ApiClient } from "@/api/api-client";
import type { SessionSnapshot, SessionVault } from "@/api/session-vault";
import { getDeviceId } from "@/lib/device-id";
import { requireCryptoUuid } from "@/lib/secure-command-id";
import { hasCheckoutLeaveGuard } from "@/lib/promotion-leave-guard";
import { navTo } from "@/lib/route";
import { createNativePushController, validNativePushToken, type NativePushToken, type PushPermission } from "./native-push-controller";
// #ifdef APP-PLUS
import { initializeNativePush, getNativePushToken, addNativePushListener, getInitialNotification,
  shutdownNativePush, requestNativePushPermission as requestSystemPushPermission } from "@/uni_modules/uvel-native-push";
// #endif

export const nativePushPermission = ref<PushPermission>("unknown");
export const nativePushRegistrationUnavailable = ref(false);
let controller: ReturnType<typeof createNativePushController> | undefined;
let readInitialNotification: (() => void) | undefined;
let stopNativePush: (() => void) | undefined;

// Native imports and invocations are excluded from H5; importing the module is inert.
export function installNativePush(options: { client: ApiClient; vault: SessionVault; canNavigate(): boolean; received(): void }) {
  // #ifdef APP-PLUS
  if (controller || typeof plus === "undefined" || !["Android", "iOS"].includes(plus.os.name ?? "")) return;
  const platform = plus.os.name === "Android" ? "android" : "ios";
  const proofKey = `uvel-push-proof-v1:${getDeviceId()}`;
  let initialized = false, nativeEpoch = 0;
  stopNativePush = () => {
    nativeEpoch += 1;
    initialized = false;
    try { shutdownNativePush(); } catch { /* Old native bases may not include this plugin. */ }
    nativePushPermission.value = "unknown";
    nativePushRegistrationUnavailable.value = false;
  };
  const initialize = () => {
    if (!initialized) { initializeNativePush({}); initialized = true; }
  };
  const token = () => new Promise<NativePushToken>((resolve, reject) => {
    const captured = nativeEpoch;
    try {
      initialize();
      getNativePushToken(result => {
        const native = { token: result.token ?? "", provider: result.provider } as NativePushToken;
        if (!result.available || !validNativePushToken(native, platform)) {
          if (captured === nativeEpoch) { initialized = false; nativePushRegistrationUnavailable.value = true; }
          reject(new Error(result.code ?? "PUSH_NATIVE_UNAVAILABLE"));
          return;
        }
        resolve(native);
      });
    } catch (error) { if (captured === nativeEpoch) { initialized = false; nativePushRegistrationUnavailable.value = true; } reject(error); }
  });
  const permission = async (request: boolean): Promise<PushPermission> => {
    const captured = nativeEpoch;
    let state: PushPermission = "unknown";
    try {
      if (platform === "ios") {
        if (request && uni.getAppAuthorizeSetting().notificationAuthorized === "not determined") {
          await new Promise<void>(resolve => requestSystemPushPermission(() => resolve()));
        }
        const value = uni.getAppAuthorizeSetting().notificationAuthorized;
        state = value === "authorized" ? "granted" : value === "denied" ? "denied" : "unknown";
      } else {
        const android = plus.android;
        const version = android.importClass("android.os.Build$VERSION") as unknown as { SDK_INT: number };
        const activity = android.runtimeMainActivity();
        const requestedKey = `${proofKey}:permission-requested`;
        if (request && version.SDK_INT >= 33 && !uni.getStorageSync(requestedKey)) {
          uni.setStorageSync(requestedKey, true);
          await new Promise<void>((resolve, reject) => android.requestPermissions(
            ["android.permission.POST_NOTIFICATIONS"], () => resolve(), reject));
        }
        const manager = android.invoke(activity, "getSystemService", "notification");
        const allowed = version.SDK_INT >= 24 ? android.invoke(manager, "areNotificationsEnabled")
          : android.invoke(android.invoke("androidx.core.app.NotificationManagerCompat", "from", activity), "areNotificationsEnabled");
        state = allowed === true ? "granted" : allowed === false ? "denied" : "unknown";
      }
    } catch { /* Unsupported bridge/configuration stays unknown. */ }
    if (captured === nativeEpoch) nativePushPermission.value = state;
    return state;
  };
  controller = createNativePushController(options.client, options.vault, {
    platform, appVersion: plus.runtime.version || "1.0.0", installationId: getDeviceId,
    bindingToken() {
      const stored = uni.getStorageSync(proofKey);
      if (typeof stored === "string" && /^[a-f0-9]{64}$/.test(stored)) return stored;
      const proof = sha256(requireCryptoUuid() + requireCryptoUuid() + requireCryptoUuid());
      uni.setStorageSync(proofKey, proof);
      if (uni.getStorageSync(proofKey) !== proof) throw new Error("PUSH_PROOF_STORAGE_UNAVAILABLE");
      return proof;
    },
    permission, token,
    registrationUnavailable(value) { nativePushRegistrationUnavailable.value = value; },
    stop() { stopNativePush?.(); nativePushPermission.value = "denied"; },
    listen(callback) {
      try {
        addNativePushListener(event => {
          if (event.type === "error") { nativePushRegistrationUnavailable.value = true; return; }
          if (event.type) callback({ type: event.type === "received" ? "receive" : event.type, data: { notificationId: event.notificationId } });
        });
        readInitialNotification = () => {
          try { getInitialNotification(event => {
            if (event.notificationId) callback({ type: "click", data: { notificationId: event.notificationId } });
          }); } catch { nativePushRegistrationUnavailable.value = true; }
        };
        // The documented uni-app global event bridge is absent from @dcloudio/types.
        (plus as typeof plus & { globalEvent: { addEventListener(name: string, callback: () => void): void } })
          .globalEvent.addEventListener("newintent", () => readInitialNotification?.());
        readInitialNotification();
      } catch { nativePushRegistrationUnavailable.value = true; }
    },
    // The shared helper opens tab routes, keeps the query and reports a failed open.
    navigate: route => navTo(route),
    canNavigate: () => options.canNavigate() && !hasCheckoutLeaveGuard(), received: options.received,
  });
  options.vault.subscribe?.((previous, next, continuation) => {
    if (!continuation && previous?.accessToken) stopNativePush?.();
    controller?.sessionChanged(previous, next, continuation);
  });
  controller.start();
  // #endif
}
export function refreshNativePush() {
  // #ifdef APP-PLUS
  readInitialNotification?.();
  controller?.foreground();
  // #endif
}
export function flushNativePushClick() {
  // #ifdef APP-PLUS
  void controller?.flush();
  // #endif
}
export async function revokeNativePush(snapshot: SessionSnapshot) {
  // #ifdef APP-PLUS
  const revoked = controller?.revoke(snapshot);
  stopNativePush?.();
  await revoked;
  // #endif
}
export function resumeNativePush(snapshot: SessionSnapshot) {
  // #ifdef APP-PLUS
  controller?.sessionChanged(null, snapshot, false);
  // #endif
}
export function openNativePushSettings(onFailure: () => void = () => {}) {
  // #ifdef APP-PLUS
  try {
    if (plus.os.name === "iOS") plus.runtime.openURL("app-settings:", onFailure);
    else uni.openAppAuthorizeSetting({ success: () => refreshNativePush(), fail: onFailure });
  } catch { onFailure(); }
  // #endif
}
export async function requestNativePushPermission() {
  // #ifdef APP-PLUS
  await controller?.sync(true);
  // #endif
}
