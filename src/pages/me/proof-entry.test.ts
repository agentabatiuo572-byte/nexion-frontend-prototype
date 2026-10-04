import { describe, expect, it } from "vitest";

const meSource = (import.meta.glob("./me.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["./me.vue"] ?? "") as string;

const receiptsSource = (import.meta.glob("./receipts.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["./receipts.vue"] ?? "") as string;

const pagesSource = (import.meta.glob("../../pages.json", {
  query: "?raw",
  import: "default",
  eager: true,
})["../../pages.json"] ?? "") as string;

describe("Proof business-visible entry", () => {
  it("keeps receipt proof reachable without adding a non-prototype My-grid item", () => {
    expect(meSource).toMatch(/key:\s*["']receipts["'][\s\S]{0,260}href:\s*["']\/me\/receipts["']/);
    expect(meSource).not.toMatch(/key:\s*["']proof["'][\s\S]{0,260}href:\s*["']\/me\/proof["']/);
    expect(receiptsSource).toContain("openRemoteComputeReceipt(r)");
    expect(receiptsSource).toContain("<ReceiptModal :receipt=\"open\"");
    expect(pagesSource).toMatch(/["']path["']:\s*["']pages\/me\/proof["']/);
  });
});
