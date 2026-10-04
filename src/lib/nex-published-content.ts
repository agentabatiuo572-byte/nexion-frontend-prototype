import type { PublishedTrustSection, TrustLocale } from "@/api/trust-section-api";
import { localizedTrustFieldValue } from "./trust-fields";

export type PublishedTrustStatus = "idle" | "loading" | "ready" | "error";

export type PublishedNexNarrative =
  | { state: "loading" }
  | { state: "error" }
  | { state: "unpublished" }
  | { state: "ready"; version: string; hero: string; subhero: string | null };

/**
 * The NEX explainer can only present the published I4 narrative for the active
 * locale. It never falls back to bundled marketing copy: absent is absent.
 */
export function resolvePublishedNexNarrative(
  sections: readonly PublishedTrustSection[],
  status: PublishedTrustStatus,
  locale: TrustLocale,
): PublishedNexNarrative {
  if (status === "idle" || status === "loading") return { state: "loading" };
  if (status !== "ready") return { state: "error" };
  const section = sections.find((item) => item.sectionKey === "nexNarrative");
  if (!section) return { state: "unpublished" };
  const hero = localizedTrustFieldValue(section.fields, "hero", locale);
  if (!hero) return { state: "unpublished" };
  return {
    state: "ready",
    version: section.version,
    hero,
    subhero: localizedTrustFieldValue(section.fields, "subhero", locale),
  };
}
