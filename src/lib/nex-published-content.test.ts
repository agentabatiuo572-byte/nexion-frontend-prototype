import { describe, expect, it } from "vitest";
import { resolvePublishedNexNarrative } from "./nex-published-content";
import type { PublishedTrustSection } from "@/api/trust-section-api";

function section(fields: PublishedTrustSection["fields"], version = "v7"): PublishedTrustSection {
  return { sectionKey: "nexNarrative", version, description: "Published NEX narrative", structure: "Hero copy", fields };
}

describe("published NEX narrative", () => {
  it("uses the published locale-specific hero rather than a bundled fallback", () => {
    expect(resolvePublishedNexNarrative([section([
      { key: "hero.zh", label: "标题", value: "服务端中文标题" },
      { key: "hero.en", label: "Headline", value: "Server English headline" },
      { key: "subhero.zh", label: "副标题", value: "服务端中文副标题" },
    ])], "ready", "zh")).toEqual({
      state: "ready", version: "v7", hero: "服务端中文标题", subhero: "服务端中文副标题",
    });
  });

  it("does not publish an editor-supplied AI-client count", () => {
    expect(resolvePublishedNexNarrative([section([
      { key: "hero.en", label: "Headline", value: "Published headline" },
      { key: "activeAiClients", label: "Active AI clients", value: "18,420" },
    ], "v1")], "ready", "en")).toEqual({
      state: "ready", version: "v1", hero: "Published headline", subhero: null,
    });
  });

  it("follows the published narrative version without displaying numeric claims", () => {
    const fields: PublishedTrustSection["fields"] = [{ key: "hero.en", label: "Headline", value: "Published headline" }];
    expect(resolvePublishedNexNarrative([section(fields, "v2")], "ready", "en")).toMatchObject({
      state: "ready", version: "v2", hero: "Published headline", subhero: null,
    });
  });

  it("does not borrow another locale or local copy when this locale has no published hero", () => {
    expect(resolvePublishedNexNarrative([section([
      { key: "hero.zh", label: "标题", value: "仅中文" },
    ])], "ready", "en")).toEqual({ state: "unpublished" });
  });

  it("keeps remote loading and failure distinct from unpublished content", () => {
    expect(resolvePublishedNexNarrative([], "idle", "en")).toEqual({ state: "loading" });
    expect(resolvePublishedNexNarrative([], "loading", "en")).toEqual({ state: "loading" });
    expect(resolvePublishedNexNarrative([], "error", "en")).toEqual({ state: "error" });
    expect(resolvePublishedNexNarrative([], "ready", "en")).toEqual({ state: "unpublished" });
  });
});
