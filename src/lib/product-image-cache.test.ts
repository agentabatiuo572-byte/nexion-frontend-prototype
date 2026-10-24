import { beforeEach, afterEach, expect, it, vi } from "vitest";

let disk: Map<string, number>;
let storage: Record<string, unknown>;
let api: Record<string, ReturnType<typeof vi.fn>>;
let bytes: number;
let clock: number;
const asset = "YWRtaW4vZS9za3UtaW1hZ2UvMjAyNjEwMjAvimage";
const url = (version = "1", expires = "2000000000") =>
  `https://images.example.test/api/store/media/images/pro/${asset}${version}?expires=${expires}&signature=${"a".repeat(43)}`;

beforeEach(() => {
  vi.resetModules();
  clock = 1792860000000;
  vi.spyOn(Date, "now").mockImplementation(() => clock++);
  disk = new Map(); storage = {}; bytes = 100262;
  let serial = 0;
  api = {
    getStorageSync: vi.fn(key => structuredClone(storage[key])),
    setStorageSync: vi.fn((key, value) => { storage[key] = structuredClone(value); }),
    getSavedFileInfo: vi.fn(o => disk.has(o.filePath) ? o.success({ size: disk.get(o.filePath) }) : o.fail()),
    removeSavedFile: vi.fn(o => { disk.delete(o.filePath); o.success?.(); }),
    downloadFile: vi.fn(o => {
      const path = `_doc/uniapp_temp/download/${++serial}`;
      disk.set(path, bytes);
      queueMicrotask(() => o.success({ statusCode: 200, tempFilePath: path }));
      return { onProgressUpdate: vi.fn(), abort: vi.fn() };
    }),
    getImageInfo: vi.fn(o => o.success({ width: 960, height: 960 })),
    getFileInfo: vi.fn(o => o.success({ size: disk.get(o.filePath) })),
    saveFile: vi.fn(o => {
      const path = `_doc/uniapp_save/${serial}.jpg`;
      disk.set(path, disk.get(o.tempFilePath)!);
      o.success({ savedFilePath: path });
    }),
  };
  vi.stubGlobal("uni", api);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("shares a download across list/detail, renewed signatures and process restarts", async () => {
  let cache = await import("./product-image-cache");
  const [first, second] = await Promise.all([cache.cachedProductImage(url()), cache.cachedProductImage(url())]);
  expect(first).toBe(second);
  expect(first).toMatch(/^_doc\/uniapp_save\//);
  expect(api.downloadFile).toHaveBeenCalledTimes(1);
  expect(await cache.cachedProductImage(url("1", "2000000100"))).toBe(first);
  vi.resetModules(); cache = await import("./product-image-cache");
  expect(await cache.cachedProductImage(url("1", "2000000200"))).toBe(first);
  expect(api.downloadFile).toHaveBeenCalledTimes(1);
  expect([...disk.keys()]).toEqual([first]); // saved copies do not leave download duplicates
});

it("a new asset is downloaded immediately and origins never share cached paths", async () => {
  const cache = await import("./product-image-cache");
  const first = await cache.cachedProductImage(url());
  expect(await cache.cachedProductImage(url("2"))).not.toBe(first);
  expect(await cache.cachedProductImage(url().replace("images.example.test", "other.example.test"))).not.toBe(first);
  expect(api.downloadFile).toHaveBeenCalledTimes(3);
});

it.each([
  "https://images.example.test/private/receipt.png",
  url().replace("https:", "http:"),
  url("1", "1000000000"),
  url("1", "invalid"),
  url().replace("signature=", "token="),
])("does not persist private, unversioned, invalid or expired URL %s", async value => {
  const cache = await import("./product-image-cache");
  expect(await cache.cachedProductImage(value)).toBe(value);
  expect(api.downloadFile).not.toHaveBeenCalled();
  expect(api.saveFile).not.toHaveBeenCalled();
});

it("recovers after a cache file disappears or the renderer reports corruption", async () => {
  const cache = await import("./product-image-cache");
  const first = await cache.cachedProductImage(url());
  disk.delete(first);
  const second = await cache.cachedProductImage(url());
  expect(second).not.toBe(first);
  cache.invalidateProductImage(url(), second);
  expect(await cache.cachedProductImage(url())).not.toBe(second);
  expect(api.downloadFile).toHaveBeenCalledTimes(3);
});

it("evicts the least recently used images within the byte budget", async () => {
  bytes = 8 * 1024 * 1024;
  const cache = await import("./product-image-cache");
  const first = await cache.cachedProductImage(url("1"));
  const second = await cache.cachedProductImage(url("2"));
  await cache.cachedProductImage(url("3")); await cache.cachedProductImage(url("4"));
  await cache.cachedProductImage(url("1")); // keep first hot
  await cache.cachedProductImage(url("5"));
  expect(disk.has(first)).toBe(true);
  expect(disk.has(second)).toBe(false);
  expect([...disk.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(32 * 1024 * 1024);
});

it("limits small cached files to 64 and always retains the newly returned path", async () => {
  const cache = await import("./product-image-cache");
  for (let i = 0; i < 70; i++) expect(disk.has(await cache.cachedProductImage(url(String(i))))).toBe(true);
  expect(disk.size).toBe(64);
});

it("never caches an HTTP error and a later visit can retry", async () => {
  const cache = await import("./product-image-cache");
  api.downloadFile.mockImplementationOnce(o => {
    queueMicrotask(() => o.success({ statusCode: 403, tempFilePath: "_doc/uniapp_temp/failed" }));
    return { onProgressUpdate: vi.fn() };
  });
  expect(await cache.cachedProductImage(url())).toBe(url());
  expect(api.saveFile).not.toHaveBeenCalled();
  expect(await cache.cachedProductImage(url())).toMatch(/^_doc\/uniapp_save\//);
});

it("falls back to the downloaded image if persistent storage is full without orphaning a saved file", async () => {
  const cache = await import("./product-image-cache");
  api.setStorageSync.mockImplementation(() => { throw new Error("disk full"); });
  const path = await cache.cachedProductImage(url());
  expect(path).toMatch(/^_doc\/uniapp_temp\//);
  expect([...disk.keys()]).toEqual([path]);
});

it("preserves the old index when storage fails during eviction", async () => {
  bytes = 8 * 1024 * 1024;
  const cache = await import("./product-image-cache");
  for (let i = 0; i < 4; i++) await cache.cachedProductImage(url(String(i)));
  api.setStorageSync.mockImplementationOnce(() => { throw new Error("disk full"); });
  const temporary = await cache.cachedProductImage(url("failed"));
  expect(temporary).toMatch(/^_doc\/uniapp_temp\//);
  await cache.cachedProductImage(url("next"));
  const saved = [...disk.keys()].filter(path => path.startsWith("_doc/uniapp_save/"));
  expect(saved).toHaveLength(4);
  expect((storage["uvel.store-images.v1"] as { path: string }[]).map(e => e.path).sort()).toEqual(saved.sort());
});

it("keeps the newly downloaded image and recent hits after the clock moves backwards", async () => {
  bytes = 8 * 1024 * 1024;
  const cache = await import("./product-image-cache");
  const first = await cache.cachedProductImage(url("0"));
  const second = await cache.cachedProductImage(url("1"));
  await cache.cachedProductImage(url("2")); await cache.cachedProductImage(url("3"));
  clock -= 60000;
  await cache.cachedProductImage(url("0"));
  const newest = await cache.cachedProductImage(url("4"));
  expect(disk.has(newest)).toBe(true);
  expect(disk.has(first)).toBe(true);
  expect(disk.has(second)).toBe(false);
});
