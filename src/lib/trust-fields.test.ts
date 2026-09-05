import { describe, expect, it } from "vitest";
import { filterTrustFields, localizedTrustFieldValue, trustFieldValue, trustNumberedRows } from "./trust-fields";

describe("published trust fields", () => {
  const fields = [
    { key: "tvlOnChain", value: "$1.2M" },
    { key: "footnote.en", value: "English" },
    { key: "footnote.zh", value: "Chinese localized copy" },
    { key: "footnote.vi", value: "Tiếng Việt" },
    { key: "publicNote", value: "Public" },
  ];

  it("keeps public fields and only the active locale suffix", () => {
    expect(filterTrustFields(fields, "en")).toEqual([
      fields[0], fields[1], fields[4],
    ]);
    expect(filterTrustFields(fields, "zh")).toEqual([
      fields[0], fields[2], fields[4],
    ]);
  });

  it("reads the public TVL field instead of deriving a version from section count", () => {
    expect(trustFieldValue(fields, "tvlOnChain")).toBe("$1.2M");
    expect(trustFieldValue(fields, "missing")).toBeNull();
  });

  it("fails closed instead of crossing locales when localized copy is missing", () => {
    expect(localizedTrustFieldValue([
      { key: "summary", value: "Legacy default" },
      { key: "summary.zh", value: "中文" },
    ], "summary", "en")).toBeNull();
  });

  it("builds locale-aware numbered disclosure rows without crossing languages", () => {
    const rows = trustNumberedRows([
      { key: "document1Primary.en", value: "Reserve audit" },
      { key: "document1Primary.zh", value: "储备审计" },
      { key: "document1Secondary.en", value: "Latest period" },
      { key: "document1Url", value: "https://example.test/audit" },
      { key: "document2Primary.en", value: "" },
    ], "document", ["Primary", "Secondary", "Url"], "en");

    expect(rows).toEqual([{ Primary: "Reserve audit", Secondary: "Latest period", Url: "https://example.test/audit" }]);
  });
});
