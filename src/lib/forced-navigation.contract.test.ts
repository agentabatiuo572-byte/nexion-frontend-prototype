import { describe, expect, it } from "vitest";
import terms from "@/pages/onboarding/terms.vue?raw";

const sources = import.meta.glob<string>(["/src/**/*.ts", "/src/**/*.vue", "!/src/**/*.test.ts", "!/src/lib/route.ts"], { eager: true, query: "?raw", import: "default" });

describe("forced navigation and legal error presentation", () => {
  it("keeps raw forced SDK calls inside the failure-aware route adapter", () => {
    const violations = Object.entries(sources)
      .filter(([, source]) => /\buni\.(?:reLaunch|redirectTo)\s*\(/.test(source))
      .map(([path]) => path);
    expect(violations).toEqual([]);
  });

  it("renders terms errors through locale keys, never raw server messages", () => {
    expect(terms).not.toMatch(/cause\.message/);
    expect(terms).toContain("t.value.terms[loadErrorKey.value]");
    expect(terms).not.toMatch(/loadError(?:Key)?\.value\s*=\s*["'][^"']*[\u4e00-\u9fff]/);
  });
});
