// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./nex.vue", import.meta.url), "utf8");

describe("NEX page published-content contract", () => {
  it("does not render bundled hero copy when the published narrative is unknown", () => {
    expect(source).toContain('resolvePublishedNexNarrative(sections.value, status.value, language.value)');
    expect(source).toContain("narrative.state === 'loading'");
    expect(source).toContain("narrative.state === 'error'");
    expect(source).toContain("narrative.state === 'unpublished'");
    expect(source).toContain(':title="narrative.hero"');
    expect(source).not.toContain(':title="w.heroTitle"');
    expect(source).not.toContain(':sub="w.heroSub"');
  });

  it("does not render an editor-supplied AI-client number as a fact", () => {
    expect(source).not.toContain('narrative.value.activeAiClients');
    expect(source).not.toContain('w.activeAiClientsLabel');
  });

  it("refreshes the published projection and records a view only after usable content resolves", () => {
    expect(source).toContain("onShow(() => {");
    expect(source).toContain("void loadNarrative(true);");
    expect(source).toMatch(/const loaded = await refresh\(force\);[\s\S]*?&& loaded[\s\S]*?&& narrative\.value\.state === "ready"/);
    expect(source).toContain('recordPublishedTrustViews(["nexNarrative"], language.value)');
  });
});
