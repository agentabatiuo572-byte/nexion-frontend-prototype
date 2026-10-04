import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest executes this contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./wallet-card.vue", import.meta.url), "utf8");

describe("wallet card market authority", () => {
  it("uses the market store and exposes an unavailable state instead of fixed NEX facts", () => {
    expect(source).toContain('useMarket');
    expect(source).toContain('market.remoteReady');
    expect(source).toContain('1 NEX = —');
    expect(source).not.toContain('1 NEX = $0.171');
    expect(source).not.toContain('>+20.4%</text>');
  });
});
