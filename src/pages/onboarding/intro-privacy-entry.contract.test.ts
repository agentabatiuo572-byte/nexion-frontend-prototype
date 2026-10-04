import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./intro.vue", {
  query: "?raw", import: "default", eager: true,
})["./intro.vue"] ?? "") as string;

describe("intro privacy-policy entry", () => {
  it("links first-start users to the server-backed privacy page without embedding policy prose", () => {
    expect(source).toContain("t.privacy.title");
    expect(source).toContain('navTo("/pages/onboarding/privacy?return=%2Fpages%2Fonboarding%2Fintro")');
    expect(source).toContain("function goPrivacy()");
    expect(source).not.toContain("We collect");
  });
});
