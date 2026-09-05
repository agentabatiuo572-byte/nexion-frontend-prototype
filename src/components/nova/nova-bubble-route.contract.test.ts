import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./nova-bubble.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["./nova-bubble.vue"] ?? "") as string;

describe("floating Nova entry route", () => {
  it("always opens the unified conversation center", () => {
    expect(source).toMatch(/function open\(\) \{\s*navTo\("\/pages\/support\/messages"\);\s*\}/);
    expect(source).not.toContain('/pages/support/chat?type=ai');
  });
});
