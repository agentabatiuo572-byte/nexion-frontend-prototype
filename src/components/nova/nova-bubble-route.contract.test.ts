import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./nova-bubble.vue", {
  query: "?raw",
  import: "default",
  eager: true,
})["./nova-bubble.vue"] ?? "") as string;

describe("floating Nova entry route", () => {
  it("opens the service section of the unified message center", () => {
    expect(source).toMatch(/function open\(\) \{\s*messageCenter\.show\("service"\);\s*\}/);
    expect(source).not.toContain('/pages/support/chat?type=ai');
  });
});
