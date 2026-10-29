import { sha256 } from "js-sha256";
import { ref } from "vue";
import type { ApiClient } from "@/api/api-client";
import type { SessionSnapshot, SessionVault } from "@/api/session-vault";
import { getDeviceId } from "@/lib/device-id";
import { requireCryptoUuid } from "@/lib/secure-command-id";
import { hasCheckoutLeaveGuard } from "@/lib/promotion-leave-guard";
import { createNativePushController, type PushPermission } from "./native-push-controller";

export const nativePushPermission = ref<PushPermission>("unknown");
let controller: ReturnType<typeof createNativePushController> | undefined;

// All native invocations are excluded from H5; importing the module is inert.
export function installNativePush(options: { client: ApiClient; vault: SessionVault; canNavigate(): boolean; received(): void }) {
  // #ifdef APP-PLUS
  if (controller || typeof plus === "undefined" || !["Android", "iOS"].includes(plus.os.name ?? "")) return;
  const platform = plus.os.name === "Android" ? "android" : "ios";
  const proofKey = `uvel-push-proof-v1:${getDeviceId()}`;
  const clientId = () => new Promise<string>((resolve, reject) => uni.getPushClientId({
    success(result) {
      try { uni.setStorageSync(`${proofKey}:cid`, result.cid); } catch { /* CID can be obtained again. */ }
      resolve(result.cid);
    },
    fail(error) {
      // Retain the last native CID solely to report a newly denied permission.
      try {
        const previous = uni.getStorageSync(`${proofKey}:cid`);
        if (typeof previous === "string" && previous.length > 0 && previous.length <= 512) { resolve(previous); return; }
      } catch { /* No cached identifier is available. */ }
      reject(error);
    },
  }));
  const permission = async (request: boolean): Promise<PushPermission> => {
    let state: PushPermission = "unknown";
    try {
      if (platform === "ios") {
        // With pushRegisterMode=manual this is the documented native permission trigger.
        if (request && uni.getAppAuthorizeSetting().notificationAuthorized === "not determined") {
          try { await clientId(); } catch { /* Denial is read below, never inferred from CID. */ }
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
        // uni.notificationAuthorized is iOS-only in the installed UniApp API.
        const manager = android.invoke(activity, "getSystemService", "notification");
        const allowed = version.SDK_INT >= 24 ? android.invoke(manager, "areNotificationsEnabled")
          : android.invoke(android.invoke("androidx.core.app.NotificationManagerCompat", "from", activity), "areNotificationsEnabled");
        state = allowed === true ? "granted" : allowed === false ? "denied" : "unknown";
      }
    } catch { /* Unsupported bridge/configuration stays unknown. */ }
    nativePushPermission.value = state;
    return state;
  };
  controller = createNativePushController(options.client, options.vault, {
    platform, appVersion: plus.runtime.version || "1.0.0", installationId: getDeviceId,
    bindingToken() {
      const stored = uni.getStorageSync(proofKey);
      if (typeof stored === "string" && /^[a-f0-9]{64}$/.test(stored)) return stored;
      const token = sha256(requireCryptoUuid() + requireCryptoUuid() + requireCryptoUuid());
      uni.setStorageSync(proofKey, token);
      if (uni.getStorageSync(proofKey) !== token) throw new Error("PUSH_PROOF_STORAGE_UNAVAILABLE");
      return token;
    },
    permission, clientId,
    listen: callback => uni.onPushMessage(callback),
    navigate: route => new Promise(resolve => uni.navigateTo({ url: route, success: () => resolve(true), fail: () => resolve(false) })),
    canNavigate: () => options.canNavigate() && !hasCheckoutLeaveGuard(), received: options.received,
  });
  options.vault.subscribe?.(controller.sessionChanged);
  controller.start();
  // #endif
}
export function refreshNativePush() {
  // #ifdef APP-PLUS
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
  await controller?.revoke(snapshot);
  // #endif
}
export function resumeNativePush(snapshot: SessionSnapshot) {
  // #ifdef APP-PLUS
  controller?.sessionChanged(null, snapshot, false);
  // #endif
}
export function openNativePushSettings() {
  // #ifdef APP-PLUS
  uni.openAppAuthorizeSetting({ success: () => refreshNativePush() });
  // #endif
}
export async function requestNativePushPermission() {
  // #ifdef APP-PLUS
  await controller?.sync(true);
  // #endif
}
