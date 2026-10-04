import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import page from "./search.vue?raw";
import { resolveSearchResultState } from "@/lib/search-source-state";
import { specRow } from "@/lib/product-copy";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as viMessages } from "@/i18n/messages/vi";

const start = page.indexOf("const results = computed<Hit[]>");
const end = page.indexOf("// Grouped as", start);
const detailStart = page.indexOf("function productSearchDetail(");
const detailEnd = page.indexOf("// Static route", detailStart);
if (start < 0 || end < start || detailStart < 0 || detailEnd < detailStart) throw new Error("Search result computation is required");
const source = ts.transpileModule(`${page.slice(detailStart, detailEnd)}\n${page.slice(start, end)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function setup(query: string, remoteApiEnabled = true) {
  const publishedFaqs = ref([{ id: "faq/a?b", question: "页面数据没有更新怎么办？", answer: "请刷新页面后重试。" }]);
  const publishedFaqStatus = ref("ready");
  const products = ref<{ id: string; name: string; tagline: string; gpu?: string; vram?: string; price: number }[]>([]);
  const messages = ref({
    search: { routes: {}, faqEntries: {}, askNova: "问问 Nova", askNovaWithQuery: "解答{query}" },
    me: { helpFaq: "帮助中心" },
    store: { mockTagline: "Mock H100 tagline", specGpu: "GPU", specVram: "VRAM" },
  });
  const productCopy = vi.fn((copy: typeof messages.value) => ({ tagline: copy.store.mockTagline }));
  const names = ["computed", "q", "t", "ROUTES", "FAQ", "staking", "searchStakingRateSummary",
    "remoteApiEnabled", "searchableProducts", "productCopy", "specRow", "devices", "deviceName", "deviceGpuLabel",
    "members", "publishedFaqs", "publishedFaqStatus", "resolveSearchResultState", "productCatalogState", "network", "app"];
  const result = new Function(...names, `${source}; return {results, searchResultState};`)(
    computed, ref(query), messages,
    [], [], {}, () => "", remoteApiEnabled, products, productCopy, specRow, ref([]), () => "", () => "", ref([]),
    publishedFaqs, publishedFaqStatus, resolveSearchResultState, { status: "ready" }, { remoteStatus: "ready" },
    { remoteFleetStatus: "ready", remoteFleetHasSnapshot: true },
  );
  return { ...result, publishedFaqs, publishedFaqStatus, products, messages, productCopy };
}

describe("global search uses the published Help Center FAQ corpus", () => {
  it("uses server price and SKU specs for remote matching without reading stale taglines or mock translations", () => {
    const state = setup("RTX 4090");
    state.products.value = [
      { id: "stellarrack-p2", name: "StellarRack P2", tagline: "H100 rack", gpu: "8× RTX 4090", vram: "192GB", price: 7499 },
      { id: "another-sku", name: "Another SKU", tagline: "H100 server copy", gpu: "RTX 4090", vram: "unavailable", price: 899 },
    ];
    expect(state.results.value.filter((hit: { group: string }) => hit.group === "product")).toEqual([
      { group: "product", label: "StellarRack P2", sublabel: "$7499 · 8× RTX 4090 · 192GB", href: "/pages/store/detail?id=stellarrack-p2" },
      { group: "product", label: "Another SKU", sublabel: "$899 · RTX 4090", href: "/pages/store/detail?id=another-sku" },
    ]);
    expect(state.productCopy).not.toHaveBeenCalled();
    const staleTaglineSearch = setup("H100");
    staleTaglineSearch.products.value = state.products.value;
    expect(staleTaglineSearch.results.value.filter((hit: { group: string }) => hit.group === "product")).toEqual([]);
    state.products.value = [];
    expect(state.results.value.filter((hit: { group: string }) => hit.group === "product")).toEqual([]);
  });

  it("keeps mock-mode product copy responsive to the active language", () => {
    const state = setup("Mock SKU", false);
    state.products.value = [{ id: "mock-sku", name: "Mock SKU", tagline: "English fixture", price: 123 }];
    expect(state.results.value.find((hit: { group: string }) => hit.group === "product")?.sublabel).toBe("$123 · Mock H100 tagline");
    state.messages.value.store.mockTagline = "Bản dịch Việt";
    expect(state.results.value.find((hit: { group: string }) => hit.group === "product")?.sublabel).toBe("$123 · Bản dịch Việt");
  });

  it("finds a published question missing from the static guide catalog and binds its exact id", () => {
    const state = setup("页面数据没有更新");
    expect(state.results.value).toContainEqual({ group: "faq", label: "页面数据没有更新怎么办？",
      sublabel: "请刷新页面后重试。", href: "/pages/me/help?faqId=faq%2Fa%3Fb" });
  });

  it("offers Help Center instead of Nova when a result exists", () => {
    const state = setup("页面数据没有更新");
    expect(state.results.value.find((hit: { group: string }) => hit.group === "help")).toEqual({
      group: "help", label: "帮助中心", href: "/pages/me/help",
    });
    expect(state.results.value.some((hit: { href: string }) => hit.href.includes("type=ai"))).toBe(false);
    for (const copy of [zh, en, viMessages]) {
      expect(copy.search.groupLabels.help).not.toMatch(/Nova/i);
      expect(copy.preferences.notifFooter).not.toMatch(/Nova/i);
    }
  });

  it("matches the current published answer and removes a question when its projection is replaced", () => {
    const state = setup("刷新页面");
    expect(state.results.value.filter((hit: { group: string }) => hit.group === "faq")).toHaveLength(1);
    state.publishedFaqs.value = [];
    expect(state.results.value).toEqual([]);
  });
});
