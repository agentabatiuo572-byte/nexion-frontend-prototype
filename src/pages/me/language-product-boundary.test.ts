// @ts-expect-error Vitest executes this structural contract in Node; app tsconfig omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./language.vue", import.meta.url), "utf8");

describe("language picker product boundary", () => {
  it("presents the shipped interface languages as one selectable list", () => {
    expect(source).toContain("v-for=\"(l, i) in LOCALES\"");
    expect(source).toContain("locale.setLocale(next)");
  });

  it("does not expose rollout priorities, RTL preview, or automatic-detection promises", () => {
    expect(source).not.toContain("priorityLabels");
    expect(source).not.toContain("priorityTagStyle");
    expect(source).not.toContain("l.isRTL");
    expect(source).not.toContain("language.autoDetect");
  });
});
