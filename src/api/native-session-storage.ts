import { sha256 } from "js-sha256";
import { ApiError } from "./errors";
import type { KeyValueStorage } from "./session-vault";

type AndroidBridge = Pick<PlusAndroid, "invoke" | "newObject" | "importClass" | "runtimeMainActivity">;
type NativePlatform = { os?: { name?: string }; android?: AndroidBridge };
export interface NativeSessionStorage extends KeyValueStorage { ready(): Promise<void> }

const SESSION_DIAGNOSTIC_STAGES = [
  "PLATFORM_ANDROID", "PLATFORM_UNINITIALIZED", "PLATFORM_UNSUPPORTED",
  "STORAGE_READY", "STORAGE_MEMORY_ONLY", "STORAGE_READY_FAILED", "PERSIST_VERIFIED", "PERSIST_FAILED",
  "RESTORE_BEGIN", "HYDRATE_CANDIDATE", "HYDRATE_EMPTY", "REFRESH_BEGIN", "REFRESH_SERVER_ACCEPTED",
  "REFRESH_COMMITTED", "REFRESH_RESPONSE_INVALID", "REFRESH_DENIED", "REFRESH_SUPERSEDED", "REFRESH_FAILED",
  "RESTORE_NO_SESSION", "RESTORE_SUPERSEDED", "RESTORE_STORAGE_FAILED", "RESTORE_FAILED",
  "RESTORE_NEW_LOGIN_PRESERVED", "UI_COMPLETE_OK", "UI_COMPLETE_FAILED",
  "INSTALLATION_REUSED", "INSTALLATION_CREATED", "INSTALLATION_WRITE_THREW",
] as const;

/** Fixed, non-secret service stages. Observability must never decide auth. */
export function reportNativeSessionStage(stage: typeof SESSION_DIAGNOSTIC_STAGES[number]): void {
  // #ifdef APP-PLUS
  if (!(SESSION_DIAGNOSTIC_STAGES as readonly string[]).includes(stage)) return;
  try {
    if (typeof plus !== "undefined" && typeof plus.android?.invoke === "function") {
      plus.android.invoke("android.util.Log", "i", ...["UvelAuth", stage]);
      return;
    }
  } catch { /* Fall back without exposing bridge exceptions. */ }
  try { console.info("UvelAuth", stage); } catch { /* Logging is best-effort. */ }
  // #endif
}

function unavailable(): ApiError {
  // Never expose native exception text, ciphertext, or credential values.
  return new ApiError({ kind: "configuration", message: "NATIVE_SESSION_STORAGE_UNAVAILABLE", retryable: true });
}
function requireValue(condition: unknown): asserts condition { if (!condition) throw unavailable(); }
function synchronous<T>(operation: () => T): T {
  let value: T;
  try { value = operation(); } catch { throw unavailable(); }
  requireValue(!value || typeof (value as { then?: unknown }).then !== "function");
  return value;
}
function present<T>(value: T): NonNullable<T> { requireValue(value !== null && value !== undefined); return value as NonNullable<T>; }

function waitForPlus(): Promise<NativePlatform> {
  if (typeof plus !== "undefined") return Promise.resolve(plus);
  if (typeof document === "undefined") return Promise.reject(unavailable());
  return new Promise((resolve, reject) => document.addEventListener("plusready", () => {
    if (typeof plus === "undefined") reject(unavailable()); else resolve(plus);
  }, { once: true }));
}

/** Android >=23 only. Unsupported platforms retain the existing memory session. */
export function createNativeSessionStorage(options: {
  baseUrl: string;
  installationId: () => string;
  platform?: () => Promise<NativePlatform>;
}): NativeSessionStorage {
  let storage: KeyValueStorage | undefined;
  let initialized = false;
  let inFlight: Promise<void> | undefined;
  function open(platform: NativePlatform): KeyValueStorage | undefined {
    if (platform.os?.name !== "Android") {
      reportNativeSessionStage(platform.os?.name ? "PLATFORM_UNSUPPORTED" : "PLATFORM_UNINITIALIZED");
      return undefined;
    }
    reportNativeSessionStage("PLATFORM_ANDROID");
    const android = present(platform.android);
    const call = (target: Parameters<AndroidBridge["invoke"]>[0], method: string, ...args: unknown[]) =>
      synchronous(() => android.invoke(target, method, ...args));
    const object = (name: string, ...args: unknown[]) => present(synchronous(() => android.newObject(name, ...args)));
    const constants = (name: string) => present(synchronous(() => android.importClass(name))) as PlusAndroidClassObject & Record<string, unknown>;
    const sdk = constants("android.os.Build$VERSION").SDK_INT;
    requireValue(typeof sdk === "number" && Number.isInteger(sdk));
    if (sdk < 23) { reportNativeSessionStage("PLATFORM_UNSUPPORTED"); return undefined; }
    const activity = present(synchronous(() => android.runtimeMainActivity()));
    const host = call(activity, "getPackageName");
    const install = options.installationId();
    requireValue(typeof host === "string" && host.length > 0 && typeof install === "string" && install.length > 0);
    let origin: string;
    try { const url = new URL(options.baseUrl); requireValue(["https:", "http:"].includes(url.protocol)); origin = url.origin; }
    catch { throw unavailable(); }
    const scope = sha256(JSON.stringify([origin, host, install]));
    const namespace = `uvel.native-session.v1.${scope}`;
    const alias = `${namespace}.key`;
    const prefs = present(call(activity, "getSharedPreferences", namespace, 0));
    const store = present(call("java.security.KeyStore", "getInstance", "AndroidKeyStore"));
    call(store, "load", null);
    const properties = constants("android.security.keystore.KeyProperties");
    const modes = constants("javax.crypto.Cipher");
    const flags = constants("android.util.Base64").NO_WRAP;
    requireValue(properties.KEY_ALGORITHM_AES === "AES" && properties.BLOCK_MODE_GCM === "GCM"
      && properties.ENCRYPTION_PADDING_NONE === "NoPadding"
      && typeof properties.PURPOSE_ENCRYPT === "number" && typeof properties.PURPOSE_DECRYPT === "number"
      && typeof modes.ENCRYPT_MODE === "number" && typeof modes.DECRYPT_MODE === "number" && typeof flags === "number");
    const get = (name: string) => { const value = call(prefs, "getString", name, null); requireValue(value === null || typeof value === "string"); return value as string | null; };
    const commit = (changes: [string, string | null][]) => {
      const editor = present(call(prefs, "edit"));
      for (const [name, value] of changes) present(value === null ? call(editor, "remove", name) : call(editor, "putString", name, value));
      requireValue(call(editor, "commit") === true);
      for (const [name, value] of changes) requireValue(get(name) === value);
    };
    const exists = () => { const value = call(store, "containsAlias", alias); requireValue(typeof value === "boolean"); return value; };
    const key = () => present(call(store, "getKey", alias, null));
    const encode = (bytes: unknown) => { const value = call("android.util.Base64", "encodeToString", bytes, flags); requireValue(typeof value === "string" && value.length > 0); return value; };
    const decode = (text: string) => present(call("android.util.Base64", "decode", text, flags));
    const cipher = () => present(call("javax.crypto.Cipher", "getInstance", "AES/GCM/NoPadding"));
    const utf8 = (text: string) => decode(uni.arrayBufferToBase64(Uint8Array.from(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16))), char => char.charCodeAt(0)).buffer));
    const text = (bytes: unknown) => decodeURIComponent(Array.from(new Uint8Array(uni.base64ToArrayBuffer(encode(bytes))), byte => `%${byte.toString(16).padStart(2, "0")}`).join(""));
    const verifyArray = (array: unknown, expected: string) => {
      // Native.js maps Java String[] to JS Array. Preserve that bridge return.
      requireValue(Array.isArray(array) && array.length === 1 && array[0] === expected);
      return array;
    };
    const generateKey = () => {
      const builder = object("android.security.keystore.KeyGenParameterSpec$Builder", alias,
        (properties.PURPOSE_ENCRYPT as number) | (properties.PURPOSE_DECRYPT as number));
      present(call(builder, "setBlockModes", verifyArray(call("android.text.TextUtils", "split", "GCM", ","), "GCM")));
      present(call(builder, "setEncryptionPaddings", verifyArray(call("android.text.TextUtils", "split", "NoPadding", ","), "NoPadding")));
      const spec = present(call(builder, "build"));
      verifyArray(call(spec, "getBlockModes"), "GCM");
      verifyArray(call(spec, "getEncryptionPaddings"), "NoPadding");
      const generator = present(call("javax.crypto.KeyGenerator", "getInstance", "AES", "AndroidKeyStore"));
      call(generator, "init", spec);
      present(call(generator, "generateKey"));
      requireValue(exists());
    };
    const decrypt = (record: string): unknown => {
      const envelope = JSON.parse(record) as { schema?: unknown; iv?: unknown; sealed?: unknown };
      requireValue(envelope?.schema === 1 && typeof envelope.iv === "string" && typeof envelope.sealed === "string");
      const instance = cipher();
      call(instance, "init", modes.DECRYPT_MODE, key(), object("javax.crypto.spec.GCMParameterSpec", 128, decode(envelope.iv)));
      const plain = JSON.parse(text(present(call(instance, "doFinal", decode(envelope.sealed))))) as { scope?: unknown; value?: unknown };
      requireValue(plain?.scope === scope);
      return plain.value;
    };
    const remove = () => {
      // A confirmed tombstone or deleted key prevents restoration after a
      // partial delete. Keep the tombstone until a new accepted login commits.
      let failed = false;
      try { commit([["revoked", "1"]]); } catch { failed = true; }
      try { call(store, "deleteEntry", alias); requireValue(!exists()); } catch { failed = true; }
      try { commit([["record", null]]); } catch { failed = true; }
      if (failed) throw unavailable();
    };
    return {
      get() {
        if (get("revoked") === "1") { remove(); return null; }
        const record = get("record");
        if (record === null) return null;
        if (!exists()) { remove(); return null; }
        return decrypt(record);
      },
      set(value) {
        if (get("revoked") === "1") remove();
        if (!exists()) generateKey();
        const instance = cipher();
        call(instance, "init", modes.ENCRYPT_MODE, key());
        const plain = JSON.stringify({ scope, value });
        const sealed = encode(present(call(instance, "doFinal", utf8(plain))));
        const iv = encode(present(call(instance, "getIV")));
        const record = JSON.stringify({ schema: 1, iv, sealed });
        // Confirm encryption before replacing a rotated refresh credential.
        requireValue(JSON.stringify(decrypt(record)) === JSON.stringify(value));
        commit([["record", record], ["revoked", null]]);
        requireValue(JSON.stringify(decrypt(present(get("record")))) === JSON.stringify(value));
      },
      remove,
    };
  }
  return {
    ready() {
      if (initialized) return Promise.resolve();
      if (!inFlight) inFlight = (options.platform ?? waitForPlus)().then(platform => {
        storage = open(platform); initialized = true;
        reportNativeSessionStage(storage ? "STORAGE_READY" : "STORAGE_MEMORY_ONLY");
      }).catch(() => { reportNativeSessionStage("STORAGE_READY_FAILED"); throw unavailable(); }).finally(() => { inFlight = undefined; });
      return inFlight;
    },
    get() { requireValue(initialized); return synchronous(() => storage?.get()); },
    set(value) {
      requireValue(initialized);
      try {
        synchronous(() => storage?.set(value));
        if (storage) reportNativeSessionStage("PERSIST_VERIFIED");
      } catch (error) { reportNativeSessionStage("PERSIST_FAILED"); throw error; }
    },
    remove() { requireValue(initialized); synchronous(() => storage?.remove()); },
  };
}
