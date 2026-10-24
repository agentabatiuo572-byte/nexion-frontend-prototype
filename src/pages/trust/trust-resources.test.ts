import { describe, expect, it } from "vitest";
import { trustResources } from "./trust-resources";
import pages from "@/pages.json";

describe("Trust Center resources", () => {
  it.each(["zh", "vi", "en"])("offers real internal documents in %s", (language) => {
    const resources = trustResources(language);
    expect(resources.items).toHaveLength(4);
    expect(new Set(resources.items.map((item) => item.href)).size).toBe(4);
    for (const item of resources.items) {
      expect(item.title.trim()).not.toBe("");
      expect(item.body.trim()).not.toBe("");
      expect(pages.pages.some((page) => `/${page.path}` === item.href)).toBe(true);
    }
    expect(resources.headline).not.toBe("—");
  });
});
