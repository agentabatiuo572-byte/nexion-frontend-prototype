import { expect, it } from "vitest";
import { displayNickname, nexGridBrandText, platformDisplayText } from "./brand-copy";

it.each([
  "UVEL 3778", "UVT rewards", "UVELBox Pro", "NexGrid 3778", "Nexion App / H5",
  "StellarBox Pro", "StellarRack P1", "NEX / USDT", "My NexGrid name", "业绩额",
  "https://nexgrid.com/NEX privacy@nexgrid.com", "USDT_TO_UVT NEX-GEN-0001 NEXION_USDT_WALLET", "",
])("preserves the source text without hiding an unmigrated value: %s", value => {
  expect(displayNickname(value)).toBe(value);
  expect(nexGridBrandText(value)).toBe(value);
  expect(platformDisplayText(value)).toBe(value);
});
