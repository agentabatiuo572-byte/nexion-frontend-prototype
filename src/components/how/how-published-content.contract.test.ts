// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./how-published-content.vue", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

describe("published how-it-works content", () => {
  it("renders callout blocks once instead of repeating their title and body", () => {
    expect(source).toContain('<HowSection v-if="block.kind !== \'callout\'"');
    expect(source).toContain('<HowCalloutBox v-else');
  });

  it("uses the localized 5174 hero label instead of exposing an internal content key", () => {
    expect(source).toContain(':label="heroLabel(content.contentKey)"');
    expect(source).not.toContain(':label="content.contentKey"');
  });
});
