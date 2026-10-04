export function requireCryptoUuid(): string {
  const crypto = globalThis.crypto;
  const uuid = crypto?.randomUUID?.();
  if (typeof uuid === "string" && uuid.trim()) return uuid;
  if (crypto?.getRandomValues) {
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch { /* Native WebViews can expose a nonfunctional crypto stub. */ }
  }
  if (typeof plus !== "undefined" && plus.android?.invoke) {
    try {
      const nativeUuid = plus.android.invoke("java.util.UUID", "randomUUID");
      const value = typeof nativeUuid === "string"
        ? nativeUuid : plus.android.invoke(nativeUuid, "toString");
      if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        return value;
      }
    } catch { /* Keep fail-closed semantics if the native bridge is unavailable. */ }
  }
  throw new Error("CRYPTO_RANDOM_UUID_UNAVAILABLE");
}
