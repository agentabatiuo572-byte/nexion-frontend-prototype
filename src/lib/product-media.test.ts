import { describe, expect, it } from "vitest";
import { PRODUCT_MEDIA, GENESIS_MEDIA, getProductMedia, formatGenesisSerial } from "./product-media";

describe("product artwork identity", () => {
  it("keeps all six SKUs distinct, including models sharing a commercial tier", () => {
    const ids = ["stellarbox-s1", "stellarbox-pro", "stellarbox-pro-v2", "stellarrack-p1", "stellarrack-p2", "cloud-share"];
    expect(Object.keys(PRODUCT_MEDIA)).toEqual(ids);
    const sources = ids.map(id => getProductMedia(id)!.src);
    expect(new Set(sources).size).toBe(6);
    ids.forEach((id, index) => expect(sources[index]).toContain(`/${id}.png`));
  });

  it("never substitutes a different product for unknown, non-product, or tier identities", () => {
    for (const id of [undefined, null, "", "phone", "pc-gpu", "genesis", "Pro", "Flagship", "toString", "__proto__"]) {
      expect(getProductMedia(id)).toBeNull();
    }
  });

  it("uses unnumbered artwork for holdings and never invents a serial", () => {
    expect(GENESIS_MEDIA.holding).not.toBe(GENESIS_MEDIA.showcase);
    expect(GENESIS_MEDIA.holding).toMatch(/\/genesis-holder-base\.png$/);
    expect(GENESIS_MEDIA.showcase).toMatch(/\/genesis\.png$/);
    expect(formatGenesisSerial(undefined)).toBe("");
    expect(formatGenesisSerial(null)).toBe("");
    expect(formatGenesisSerial(903)).toBe("No.0903");
    expect(formatGenesisSerial(12034)).toBe("No.12034");
    expect(formatGenesisSerial("GEN-HOLD-7A")).toBe("No.GEN-HOLD-7A");
  });
});
