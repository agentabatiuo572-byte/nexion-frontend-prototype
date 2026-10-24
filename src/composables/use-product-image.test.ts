import { effectScope, nextTick, ref } from "vue";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cachedProductImage: vi.fn(), invalidateProductImage: vi.fn() }));
vi.mock("@/lib/product-image-cache", () => ({ ...mocks, productImageCacheKey: (url: string) => url.split("?")[0] }));
import { useProductImage } from "./use-product-image";
afterEach(() => vi.resetAllMocks());

it("never flashes the previous asset or lets a late download replace the current catalog image", async () => {
  const completions: Array<(path: string) => void> = [];
  mocks.cachedProductImage.mockImplementation(() => new Promise(resolve => completions.push(resolve)));
  const source = ref<string | undefined>("https://images/old?signature=1");
  const scope = effectScope(); const image = scope.run(() => useProductImage(() => source.value))!;
  expect(image.imageSrc.value).toBeNull();
  source.value = "https://images/new?signature=2"; await nextTick();
  completions[1]("_doc/new"); await nextTick();
  completions[0]("_doc/old"); await nextTick();
  expect(image.imageSrc.value).toBe("_doc/new");
  source.value = undefined; await nextTick();
  expect(image.imageSrc.value).toBeNull();
  scope.stop();
});

it("keeps a warm image visible during signature renewal and does not update after disposal", async () => {
  mocks.cachedProductImage.mockResolvedValueOnce("_doc/cached");
  let complete!: (path: string) => void;
  const source = ref("https://images/same?signature=1");
  const scope = effectScope(); const image = scope.run(() => useProductImage(() => source.value))!;
  await nextTick();
  mocks.cachedProductImage.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  source.value = "https://images/same?signature=2"; await nextTick();
  expect(image.imageSrc.value).toBe("_doc/cached");
  scope.stop(); complete("_doc/late"); await nextTick();
  expect(image.imageSrc.value).toBe("_doc/cached");
});

it("invalidates a broken local image once, without a retry loop", async () => {
  mocks.cachedProductImage.mockResolvedValue("_doc/broken");
  const scope = effectScope(); const image = scope.run(() => useProductImage(() => "https://images/one"))!;
  await nextTick(); image.imageError(); await nextTick(); image.imageError(); await nextTick();
  expect(mocks.invalidateProductImage).toHaveBeenCalledExactlyOnceWith("https://images/one", "_doc/broken");
  expect(mocks.cachedProductImage).toHaveBeenCalledTimes(2);
  expect(image.imageSrc.value).toBeNull();
  scope.stop();
});
