import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./help.vue", {
  query: "?raw", import: "default", eager: true,
})["./help.vue"] ?? "") as string;

describe("Help Center FAQ locale fallback", () => {
  it("visibly identifies published default-language content", () => {
    expect(source).toContain("const faqLanguageFallback = computed");
    expect(source).toContain('v-if="faqLanguageFallback"');
    expect(source).toContain("w.faqLanguageFallback");
    expect(source).toContain('role="status"');
  });

  it("does not erase the last good FAQ snapshot when a refresh fails", () => {
    const loadFaqs = source.slice(source.indexOf("async function loadFaqs"), source.indexOf("async function loadMoreFaqs"));
    expect(loadFaqs).toContain("faqLoadError.value = true");
    expect(loadFaqs).not.toContain("faqs.value = []");
    expect(source).toContain('v-if="faqLoadError && faqs.length === 0"');
    expect(source).toContain('v-if="faqLoadError && faqs.length > 0"');
  });

  it("accepts FAQ success or failure only for the latest requested locale", () => {
    const loadFaqs = source.slice(source.indexOf("async function loadFaqs"), source.indexOf("async function loadMoreFaqs"));
    expect(source).toContain("faqRequestGeneration");
    expect(loadFaqs).toContain("requestedLanguage");
    expect(loadFaqs).toContain("requestGeneration === faqRequestGeneration");
    expect(loadFaqs).toContain("requestedLanguage === locale.code");
  });

  it("invalidates and reloads FAQ state immediately when the account changes", () => {
    expect(source).toContain("function resetFaqProjection()");
    expect(source).toContain("faqRequestGeneration += 1");
    expect(source).toContain("faqs.value = []");
    expect(source).toContain("faqLoading.value = false");
    expect(source).toContain("void loadFaqs()");
  });
});
