// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./terms.vue", import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("terms remote legal-header loading gate", () => {
  it("does not fall back to bundled effective date, title, or summary while the remote legal version is unknown", () => {
    expect(source).toContain('<view v-if="remoteApiEnabled && !serverTerms" class="tos-hero">');
    expect(source).not.toContain('serverTerms ? `${serverTerms.effectiveAt} · ${serverTerms.version}` : t.terms.effectiveLabel');
    expect(source).not.toContain('serverTerms?.title ?? t.terms.heroTitle');
    expect(source).not.toContain('serverTerms?.summary ?? t.terms.heroSubtitle');
  });
});
