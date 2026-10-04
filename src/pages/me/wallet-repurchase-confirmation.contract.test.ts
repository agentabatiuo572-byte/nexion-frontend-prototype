// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./wallet-repurchase.vue", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

describe("repurchase confirmation boundary", () => {
  it("requires an explicit confirmation before the server money command", () => {
    expect(source).toContain('confirm as uiConfirm');
    expect(source).toContain('confirmed = await uiConfirm({');
    expect(source).toContain('if (!confirmed || !currentScope(generation)) return;');
    expect(source).toContain('isMounted.value && generation === accountGeneration');

    const confirmation = source.indexOf('confirmed = await uiConfirm({');
    expect(source).toContain('const quoteAmount = normalizeCommandAmount(amount.value);');
    expect(source).toContain('amount: formatCommandAmount(quoteAmount),');
    expect(source).toContain('await repurchase.open(quoteAmount);');
    expect(source).toContain(':disabled="confirming || repurchase.submitting || recovering"');

    const command = source.indexOf('await repurchase.open(quoteAmount);');
    expect(confirmation).toBeGreaterThan(0);
    expect(command).toBeGreaterThan(confirmation);
  });
});
