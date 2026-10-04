import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./help.vue", {
  query: "?raw", import: "default", eager: true,
})["./help.vue"] ?? "") as string;

describe("Help Center FAQ pagination", () => {
  it("loads the first bounded page and exposes explicit load-more semantics", () => {
    expect(source).toContain("supportApi.faqPage(requestedLanguage, undefined, \"Help Center\", 1, FAQ_PAGE_SIZE)");
    expect(source).toContain('v-if="canLoadMoreFaqs"');
    expect(source).toContain('@click="loadMoreFaqs"');
    expect(source).toContain('@keydown.enter.prevent="loadMoreFaqs"');
    expect(source).toContain('@keydown.space.prevent="loadMoreFaqs"');
  });

  it("appends unique rows only when account, locale and request generation still match", () => {
    const loadMore = source.slice(source.indexOf("async function loadMoreFaqs"), source.indexOf("onShow", source.indexOf("async function loadMoreFaqs")));
    expect(loadMore).toContain("requestGeneration === faqRequestGeneration");
    expect(loadMore).toContain("requestedLanguage === locale.code");
    expect(loadMore).toContain("remoteAccountScope.isCurrent(requestScope)");
    expect(loadMore).toContain("new Map([...faqs.value, ...next.items].map");
    expect(loadMore).toContain("faqLoadError.value = true");
  });
});
