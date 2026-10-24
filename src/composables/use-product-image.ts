import { onScopeDispose, ref, watch } from "vue";
import { cachedProductImage, invalidateProductImage, productImageCacheKey } from "@/lib/product-image-cache";

export function useProductImage(source: () => string | undefined) {
  const imageSrc = ref<string | null>(null);
  let native = false;
  // #ifdef APP-PLUS
  native = true;
  // #endif
  let generation = 0;
  let retried = false;
  async function resolve(url: string, token: number) {
    const path = native ? await cachedProductImage(url) : url;
    if (token === generation) imageSrc.value = path;
  }
  watch(source, (url, previous) => {
    const token = ++generation;
    retried = false;
    if (!url) { imageSrc.value = null; return; }
    if (!previous || productImageCacheKey(url) !== productImageCacheKey(previous)) imageSrc.value = null;
    void resolve(url, token);
  }, { immediate: true });
  function imageError() {
    const url = source();
    const path = imageSrc.value;
    imageSrc.value = null;
    if (native && url && path && path !== url && !retried) {
      retried = true;
      invalidateProductImage(url, path);
      void resolve(url, ++generation);
    }
  }
  onScopeDispose(() => { generation += 1; });
  return { imageSrc, imageError };
}
