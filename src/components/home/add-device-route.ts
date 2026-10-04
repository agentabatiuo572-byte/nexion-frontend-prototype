import { getProduct } from "@/mock/products";
import type { DeviceKind } from "@/store/types";

export function resolveAddDeviceRoute(
  targetKind: DeviceKind,
  productExists: (id: string) => boolean = (id) => Boolean(getProduct(id)),
): string {
  return productExists(targetKind)
    ? `/pages/store/detail?id=${encodeURIComponent(targetKind)}`
    : "/pages/store/store";
}
