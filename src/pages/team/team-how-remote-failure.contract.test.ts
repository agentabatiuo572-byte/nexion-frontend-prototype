import { describe, expect, it } from "vitest";

const unilevel = (import.meta.glob("./unilevel-how.vue", { query: "?raw", import: "default", eager: true })["./unilevel-how.vue"] ?? "") as string;
const binary = (import.meta.glob("./binary-how.vue", { query: "?raw", import: "default", eager: true })["./binary-how.vue"] ?? "") as string;

describe("team How remote failure boundary", () => {
  it.each([unilevel, binary])("keeps the published component mounted in remote runtime", (page) => {
    expect(page).toContain("howContentMode");
    expect(page).toContain("howMode === 'published'");
    expect(page).toContain("howMode === 'local'");
    expect(page).not.toContain("publishedContentUnavailable");
    expect(page).not.toContain('@unavailable=');
  });
});
