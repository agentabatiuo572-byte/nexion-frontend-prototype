import type { PublishedTrustSection, TrustLocale } from "@/api/trust-section-api";
import { localizedTrustFieldValue, trustNumberedRows } from "@/lib/trust-fields";
import type { TrustCategoryKey } from "./trust-resources";

export interface TrustCategoryMaterial {
  content: string;
  rows: Array<{ title: string; body: string; href: string | null; metadata: string }>;
}

/** Only the published snapshot supplies content; labels/schema metadata are not evidence. */
export function trustCategoryMaterial(
  sections: readonly PublishedTrustSection[],
  category: TrustCategoryKey,
  locale: TrustLocale,
  validateHref: (value: string) => string | null,
): TrustCategoryMaterial {
  if (category === "compliance") {
    const fields = sections.find(section => section.sectionKey === "complianceBadges")?.fields ?? [];
    const badges = trustNumberedRows(fields, "badge", ["Label", "Body", "Url", "Type", "Date", "Size"] as const, locale);
    return {
      content: "",
      rows: badges.filter(row => row.Label).map(row => ({
        title: row.Label, body: row.Body, href: validateHref(row.Url),
        metadata: [row.Type, row.Date, row.Size].filter(Boolean).join(" · "),
      })),
    };
  }
  if (category === "hosting" || category === "warranty" || category === "security") {
    // Optional, namespaced additions to the existing narrative field bag. They
    // neither create new section keys nor depend on an unrelated audit URL.
    const fields = sections.find(section => section.sectionKey === "nexNarrative")?.fields ?? [];
    const documents = trustNumberedRows(fields, `${category}Document`, ["Primary", "Secondary", "Url", "Type", "Date", "Size"] as const, locale);
    return {
      content: localizedTrustFieldValue(fields, `${category}Content`, locale) ?? "",
      rows: documents.flatMap(row => {
        const href = validateHref(row.Url);
        return href ? [{ title: row.Primary, body: row.Secondary, href,
          metadata: [row.Type, row.Date, row.Size].filter(Boolean).join(" · ") }] : [];
      }),
    };
  }
  return { content: "", rows: [] };
}
