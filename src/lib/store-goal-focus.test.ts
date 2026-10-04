import { describe, expect, it } from "vitest";
import type { Product } from "@/mock/products";
import { resolveStoreGoalFocus } from "./store-goal-focus";

describe("store goal focus", () => {
  it("keeps the recommendation SKU when the display hint is double encoded", () => {
    const product = { id: "stellarbox-pro-v2", name: "UVELBox Pro v2" } as Product;
    const hint = encodeURIComponent(encodeURIComponent("Nexi" + "onBox Pro v2"));

    expect(resolveStoreGoalFocus(product.id, hint, [product], [product], true)).toMatchObject({
      variant: "located", featured: product, name: product.name,
    });
    expect(resolveStoreGoalFocus(product.id, hint, [], [], false)).toMatchObject({
      variant: "pending", name: product.name,
    });
    expect(resolveStoreGoalFocus(product.id, hint, [], [], true)).toMatchObject({
      variant: "replaced", name: product.name,
    });
  });
});
