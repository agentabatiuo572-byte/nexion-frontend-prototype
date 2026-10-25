import { describe, expect, it } from "vitest";
import { visibleVoucherCatalog } from "./voucher-sheet-authority";
import type { VoucherDef } from "@/mock/vouchers";

function def(id: string, claimSurfaces: VoucherDef["claimSurfaces"]): VoucherDef {
  return {
    id, name: id, type: "fixed", amountUSD: 10, minPurchaseUSD: 0,
    applicableSkus: [], audience: "all", startAt: 0, endAt: 0, claimSurfaces,
    popupEnabled: false, stackWithTrial: false, stackWithOthers: false,
    splittable: false, status: "active",
  };
}

describe("voucher claim sheet surface authority", () => {
  it.each(["home", "store", "me", "earn"] as const)("shows unrestricted claimable and owned offers on %s, but never unavailable offers", surface => {
    const claimable = def("all-unclaimed", []), owned = def("all-owned", []), unavailable = def("all-unavailable", []);
    expect(visibleVoucherCatalog([claimable, owned, unavailable], [claimable], [owned], surface).map(row => row.id))
      .toEqual([claimable.id, owned.id]);
  });
  it("shows and therefore claims only vouchers assigned to the opening surface", () => {
    const home = def("home-only", ["home"]);
    const store = def("store-only", ["store"]);

    expect(visibleVoucherCatalog([home, store], [home, store], [], "store").map((row) => row.id))
      .toEqual(["store-only"]);
    expect(visibleVoucherCatalog([home, store], [home, store], [], "home").map((row) => row.id))
      .toEqual(["home-only"]);
  });
});
