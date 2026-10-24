/** New prototype domains must distinguish a missing key from a failed read.
 * uni-h5 getStorageSync catches localStorage errors and returns an empty string.
 * Read its serialized value once instead; never probe then call uni for a second read.
 */
export function readPrototypeStorage<T = unknown>(key: string): T | undefined {
  try {
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return undefined;
      let value: unknown;
      try { value = JSON.parse(raw); } catch { return raw as T; }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const envelope = value as { type?: unknown; data?: unknown };
        if (Object.keys(envelope).length === 2 && 'data' in envelope && typeof envelope.data === envelope.type
          && ['object', 'string', 'number', 'boolean'].includes(String(envelope.type))) return envelope.data as T;
      }
      return raw as T;
    }
    const value = uni.getStorageSync(key);
    if (value !== '' && value !== undefined) return value as T;
    // Native storage exposes the key directory. An existing key yielding the
    // empty failure sentinel is unavailable, never a fresh installation.
    if (typeof uni.getStorageInfoSync !== 'function') throw new Error('storage');
    const keys = uni.getStorageInfoSync().keys;
    if (!Array.isArray(keys) || keys.includes(key)) throw new Error('storage');
    return undefined;
  } catch { throw new Error('storage'); }
}

export function writePrototypeStorage(key: string, value: unknown): void {
  try {
    uni.setStorageSync(key, value);
    if (JSON.stringify(readPrototypeStorage(key)) !== JSON.stringify(value)) throw new Error('storage');
  } catch { throw new Error('storage'); }
}

/** A synchronous transaction already owns its read snapshot. H5's native
 * setItem reports failure before committing; do not turn a successful write
 * into a failed payment by performing a fallible verification read afterward.
 * Keep the normal serialized uni envelope so existing readers remain valid. */
export function writePrototypeStorageSnapshot(key: string, value: unknown): void {
  try {
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      window.localStorage.setItem(key, JSON.stringify({ type: typeof value, data: value }));
    } else {
      uni.setStorageSync(key, value);
    }
  } catch { throw new Error('storage'); }
}

/** accountKey is already normalized by the owning domain. */
export function writePrototypeAccountRow<T>(tableKey: string, accountKey: string, row: T): void {
  const previous = readPrototypeStorage<Record<string, T>>(tableKey);
  if (previous !== undefined && (!previous || typeof previous !== 'object' || Array.isArray(previous))) throw new Error('storage');
  writePrototypeStorage(tableKey, { ...previous, [accountKey]: row });
}
