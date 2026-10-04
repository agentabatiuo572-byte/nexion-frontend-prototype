import { describe, expect, it } from "vitest";
import type { Product } from "@/mock/products";
import { selectHomepageProductTrust } from "./home-data-presenters";

const product = (overrides: Partial<Product> = {}): Product => ({
  id: "box-1",
  name: "Box 1",
  tier: "Pro",
  tagline: "Managed compute",
  dailyEarn: 1,
  dailyEarnNEX: 1,
  price: 100,
  sold: 1,
  features: [],
  available: true,
  datacenter: "Virginia DC",
  warranty: "24 months",
  gpu: "H100",
  ...overrides,
});

describe("homepage real-data presenters", () => {
  it("prefers an available purchasable product with the most server-owned trust fields", () => {
    const selected = selectHomepageProductTrust([
      product({ id: "blocked", purchaseBlocked: true, warranty: "60 months" }),
      product({ id: "thin", warranty: undefined, datacenter: undefined }),
      product({ id: "trusted", warranty: "36 months", datacenter: "Singapore DC" }),
    ]);
    expect(selected?.product.id).toBe("trusted");
    expect(selected).toMatchObject({ datacenter: "Singapore DC", warranty: "36 months", gpu: "H100" });
  });

  it("treats the server unavailable sentinel as missing instead of a trust claim", () => {
    const selected = selectHomepageProductTrust([product({ datacenter: "unavailable", warranty: "unavailable" })]);
    expect(selected).toMatchObject({ datacenter: null, warranty: null, gpu: "H100" });
  });

});
