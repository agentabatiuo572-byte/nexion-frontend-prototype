export interface ResourceVersion {
  versionName?: unknown;
  versionCode?: unknown;
}

// These fields belong to the compiled resources, not a CI build or host APK.
declare const __UVEL_RESOURCE_VERSION__: ResourceVersion;
export const compiledResourceVersion: ResourceVersion = typeof __UVEL_RESOURCE_VERSION__ === "undefined"
  ? {} : __UVEL_RESOURCE_VERSION__;

export function formatResourceVersion(platform: "APP" | "H5", version: ResourceVersion = {}): string {
  const name = typeof version.versionName === "string" && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(version.versionName)
    ? version.versionName : "?";
  const rawCode = typeof version.versionCode === "number" && Number.isSafeInteger(version.versionCode) && version.versionCode >= 0
    ? String(version.versionCode) : version.versionCode;
  const code = typeof rawCode === "string" && /^\d{1,16}$/.test(rawCode) ? rawCode : "?";
  return `UVEL · ${platform} · v${name} (${code})`;
}

interface NativeResourceInfo {
  appid?: string;
  name?: string;
  version?: string;
  versionCode?: string;
}

export function readNativeResourceVersion(done: (version: ResourceVersion) => void): void {
  const runtime = (globalThis as typeof globalThis & {
    plus?: { runtime?: { appid?: string; getProperty?: (appid: string, callback: (info: NativeResourceInfo) => void) => void } };
  }).plus?.runtime;
  const appid = runtime?.appid;
  if (!appid || typeof runtime?.getProperty !== "function") {
    done({});
    return;
  }
  try {
    runtime.getProperty(appid, (info) => {
      // getProperty reads the running application's resource manifest. Never
      // borrow runtime.version, getAppBaseInfo().appVersion or a debug host's version.
      if (runtime.appid !== appid || info?.name !== "UVEL" || (info.appid && info.appid !== appid)) {
        done({});
        return;
      }
      done({ versionName: info.version, versionCode: info.versionCode });
    });
  } catch {
    done({});
  }
}
