import { describe, expect, it, vi } from "vitest";
import { createTrustDocumentApi, parseTrustDocuments } from "./trust-document-api";

const doc = (slot: string, extra: Record<string, unknown> = {}) => ({
  slot, source: "DEFAULT", version: null, language: "English", referenceNo: null, verifyUrl: null,
  fileName: `${slot}.pdf`, sizeBytes: 1024, pageCount: 2, sha256: "a".repeat(64),
  fileUrl: slot === "whitepaper" ? null : `/api/content/trust/documents/${slot}/file?v=${"a".repeat(12)}`,
  updatedBy: null, updatedAt: null, ...extra,
});
const payload = (documents = ["whitepaper", "incorporation", "msb", "ein"].map((slot) => doc(slot))) => ({
  profile: { legalName: "UVEL AI LTD.", jurisdiction: "New York, USA", registeredAddress: "New York, NY 10065",
    nyDosId: "8040896", nyFilingNumber: "261008000079", authorizedCapitalUsd: "50000000" },
  documents,
});

describe("trust documents contract", () => {
  it("reads the public endpoint and joins file paths to the API origin", async () => {
    const request = vi.fn().mockResolvedValue(payload());
    const result = await createTrustDocumentApi({ request } as never, "https://api.example.test/").current();
    expect(request).toHaveBeenCalledWith({ method: "GET", path: "/api/content/trust/documents", authenticated: false });
    expect(result.profile.authorizedCapitalUsd).toBe(50_000_000);
    expect(result.documents.msb.fileUrl).toBe(`https://api.example.test/api/content/trust/documents/msb/file?v=${"a".repeat(12)}`);
    expect(result.documents.msb.pageUrls).toEqual([1, 2].map((n) => `https://api.example.test/api/content/trust/documents/msb/pages/${n}?v=${"a".repeat(12)}`));
    expect(result.documents.whitepaper.fileUrl).toBeNull();
    expect(result.documents.whitepaper.pageUrls[0]).toBe(`https://api.example.test/api/content/trust/documents/whitepaper/pages/1?v=${"a".repeat(12)}`);
  });

  it("drops lookup links that are not plain https instead of opening them", () => {
    const result = parseTrustDocuments(payload([doc("whitepaper"), doc("incorporation", { verifyUrl: "http://apps.dos.ny.gov" }),
      doc("msb", { verifyUrl: "https://user:pw@www.fincen.gov" }), doc("ein", { verifyUrl: "https://www.irs.gov/" })]), "");
    expect(result.documents.incorporation.verifyUrl).toBeNull();
    expect(result.documents.msb.verifyUrl).toBeNull();
    expect(result.documents.ein.verifyUrl).toBe("https://www.irs.gov/");
  });

  it.each([
    ["a missing slot", payload([doc("whitepaper"), doc("incorporation"), doc("msb")])],
    ["a download link for the white paper", payload([doc("whitepaper", { fileUrl: `/api/content/trust/documents/whitepaper/file?v=${"a".repeat(12)}` }), doc("incorporation"), doc("msb"), doc("ein")])],
    ["a file URL for another slot", payload([doc("whitepaper"), doc("incorporation", { fileUrl: `/api/content/trust/documents/msb/file?v=${"a".repeat(12)}` }), doc("msb"), doc("ein")])],
    ["a file URL outside the documents API", payload([doc("whitepaper"), doc("incorporation"), doc("msb", { fileUrl: "https://evil.example/msb.pdf" }), doc("ein")])],
    ["a file URL for an older revision", payload([doc("whitepaper"), doc("incorporation"), doc("msb", { fileUrl: `/api/content/trust/documents/msb/file?v=${"b".repeat(12)}` }), doc("ein")])],
    ["a malformed hash", payload([doc("whitepaper", { sha256: "x" }), doc("incorporation"), doc("msb"), doc("ein")])],
    ["an empty file", payload([doc("whitepaper", { sizeBytes: 0 }), doc("incorporation"), doc("msb"), doc("ein")])],
    ["a document without pages", payload([doc("whitepaper", { pageCount: 0 }), doc("incorporation"), doc("msb"), doc("ein")])],
    ["a non-numeric capital", { ...payload(), profile: { ...payload().profile, authorizedCapitalUsd: "fifty million" } }],
  ])("rejects %s", (_name, value) => {
    expect(() => parseTrustDocuments(value, "")).toThrow("TRUST_DOCUMENT_RESPONSE_INVALID");
  });
});
