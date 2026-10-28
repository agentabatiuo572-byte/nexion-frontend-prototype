// Native-only cache for public, versioned storefront images. Private uploads and
// arbitrary URLs never share this cache; the current catalog still chooses the asset.
const INDEX_KEY = "uvel.store-images.v1";
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_FILES = 64;
type Entry = { key: string; path: string; size: number; used: number };
let entries: Entry[] | undefined;
const pending = new Map<string, Promise<string | null>>();

export function productImageCacheKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash
      || !/^\/api\/store\/media\/images\/[A-Za-z0-9._-]+\/[A-Za-z0-9_-]{20,240}$/.test(parsed.pathname)
      || !/^[A-Za-z0-9_-]{43}$/.test(parsed.searchParams.get("signature") ?? "")
      || !/^\d{1,12}$/.test(parsed.searchParams.get("expires") ?? "")
      || Number(parsed.searchParams.get("expires")) * 1000 <= Date.now()) return null;
    // The asset ID contains the immutable UUID object key. Signature renewal
    // must not download the same image again; changing the asset changes the key.
    return parsed.origin + parsed.pathname;
  } catch { return null; }
}

function index(): Entry[] {
  if (!entries) {
    try {
      const saved: unknown = uni.getStorageSync(INDEX_KEY);
      entries = Array.isArray(saved) ? saved.filter((e): e is Entry => !!e
        && typeof e.key === "string" && typeof e.path === "string"
        && e.path.startsWith("_doc/uniapp_save/") && Number.isFinite(e.size)
        && e.size > 0 && Number.isFinite(e.used)) : [];
    } catch { entries = []; }
  }
  return entries;
}

function persist(): boolean {
  try { uni.setStorageSync(INDEX_KEY, index()); return true; }
  catch { return false; }
}

function removeFile(path: string) {
  uni.removeSavedFile({ filePath: path, fail: () => {} });
}

export function invalidateProductImage(url: string, path: string): void {
  const key = productImageCacheKey(url);
  const entry = index().find(e => e.key === key && e.path === path);
  if (!entry) return;
  entries = index().filter(e => e !== entry);
  persist();
  removeFile(entry.path);
}

async function load(url: string, key: string): Promise<string> {
  const cached = index().find(e => e.key === key);
  if (cached) {
    const exists = await new Promise<boolean>(resolve => uni.getSavedFileInfo({
      filePath: cached.path, success: info => resolve(info.size === cached.size), fail: () => resolve(false),
    }));
    if (exists) {
      cached.used = Date.now();
      entries = [cached, ...index().filter(e => e !== cached)];
      persist();
      return cached.path;
    }
    invalidateProductImage(url, cached.path);
  }

  const downloaded = await new Promise<UniApp.DownloadSuccessData>((resolve, reject) => {
    const task = uni.downloadFile({ url, timeout: 15000, success: resolve, fail: reject });
    task.onProgressUpdate(progress => { if (progress.totalBytesExpectedToWrite > 10 * 1024 * 1024) task.abort(); });
  });
  if (downloaded.statusCode !== 200) {
    removeFile(downloaded.tempFilePath);
    return url;
  }
  const temporary = downloaded.tempFilePath;
  try {
    await new Promise<void>((resolve, reject) => uni.getImageInfo({ src: temporary, success: () => resolve(), fail: reject }));
    const size = await new Promise<number>((resolve, reject) => uni.getFileInfo({ filePath: temporary, success: info => resolve(info.size), fail: reject }));
    if (size <= 0 || size > 10 * 1024 * 1024) return temporary;
    const path = await new Promise<string>((resolve, reject) => uni.saveFile({ tempFilePath: temporary, success: file => resolve(file.savedFilePath), fail: reject }));
    const entry = { key, path, size, used: Date.now() };
    const previous = index();
    entries = [entry, ...previous.filter(e => e.key !== key)];
    let bytes = 0;
    const evicted = entries.filter((e, i) => (bytes += e.size) > MAX_BYTES || i >= MAX_FILES);
    entries = entries.filter(e => !evicted.includes(e));
    if (!persist()) {
      entries = previous;
      removeFile(path);
      return temporary;
    }
    evicted.forEach(e => removeFile(e.path));
    removeFile(temporary);
    return path;
  } catch {
    // Disk pressure or an unavailable filesystem must not break the image view.
    return temporary;
  }
}

export function cachedProductImage(url: string): Promise<string> {
  const key = productImageCacheKey(url);
  if (!key) return Promise.resolve(url);
  const existing = pending.get(key);
  if (existing) return existing.then(path => path ?? url);
  // Local results belong to the immutable object; remote fallbacks keep each caller's signature.
  const request = load(url, key).then(path => path === url ? null : path).catch(() => null).finally(() => pending.delete(key));
  pending.set(key, request);
  return request.then(path => path ?? url);
}
