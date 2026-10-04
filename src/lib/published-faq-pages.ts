import type { SupportApi } from "@/api/support-api";
import type { SupportFaq } from "@/domain/support";

/** Read the complete published Help Center projection, never a truncated first page. */
export async function readPublishedFaqPages(
  api: Pick<SupportApi, "faqPage">,
  language: string,
  isCurrent: () => boolean = () => true,
): Promise<SupportFaq[]> {
  const pageSize = 50;
  const items: SupportFaq[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  for (let pageNum = 1; ; pageNum += 1) {
    if (!isCurrent()) throw new Error("SUPPORT_FAQ_READ_SUPERSEDED");
    const page = await api.faqPage(language, undefined, "Help Center", pageNum, pageSize);
    if (!isCurrent()) throw new Error("SUPPORT_FAQ_READ_SUPERSEDED");
    total ??= page.total;
    if (page.total !== total || page.pageNum !== pageNum || page.pageSize !== pageSize
      || page.items.length !== Math.min(pageSize, total - items.length)
      || page.items.some(item => seen.has(item.id))
      || new Set(page.items.map(item => item.id)).size !== page.items.length) {
      throw new Error("SUPPORT_FAQ_PAGE_INCOMPLETE");
    }
    page.items.forEach(item => seen.add(item.id));
    items.push(...page.items);
    if (items.length === total) return items;
  }
}
