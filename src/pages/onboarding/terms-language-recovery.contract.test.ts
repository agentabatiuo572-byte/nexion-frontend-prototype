// @ts-expect-error Vitest executes this structural contract in Node; app tsconfig omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./terms.vue", import.meta.url), "utf8");

describe("required terms language recovery", () => {
  it("keeps a blocked user able to choose a shipped language and re-read server terms", () => {
    expect(source).toContain('v-if="exitBlocked"');
    // #94:语言选择是互斥单选,遍历时带索引(方向键要用),改钉新的写法。
    expect(source).toContain('v-for="(language, li) in LOCALES"');
    expect(source).toContain('locale.setLocale(next)');
    expect(source).toContain('watch(() => locale.code');
    expect(source).toContain('flush: "sync"');
    expect(source).toContain('snapshot.requestedLocale');
  });

  it("does not auto-acknowledge while resolving a different language", () => {
    expect(source).not.toContain('legalTermsApi.acknowledge(snapshot);\n    serverTerms.value = snapshot');
  });
});
