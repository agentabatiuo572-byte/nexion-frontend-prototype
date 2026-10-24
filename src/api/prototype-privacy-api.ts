import { readPrototypeStorage } from "@/lib/prototype-storage";
export interface PrototypePrivacyPolicy { version: string; locale: string; hero: string; sections: Array<{ id: string; title: string; body: string; order: number }> }
export const PROTOTYPE_PRIVACY_POLICY_KEY = "nexgrid-prototype-privacy-policies";
/** Only supplied, published text is readable. An absent legal document is never fabricated. */
export async function readPrototypePrivacyPolicy(locale: string): Promise<PrototypePrivacyPolicy> {
  const policies = readPrototypeStorage<Record<string, any>>(PROTOTYPE_PRIVACY_POLICY_KEY);
  const value = policies?.[locale];
  if (!value || value.status !== 'PUBLISHED' || typeof value.version !== 'string' || !value.version
    || value.locale !== locale || typeof value.hero !== 'string' || !Array.isArray(value.sections) || !value.sections.length
    || value.sections.some((row: any) => !row || typeof row.id !== 'string' || !row.id || typeof row.title !== 'string' || !row.title || typeof row.body !== 'string' || !row.body || !Number.isFinite(row.order)))
    throw new Error('PRIVACY_POLICY_UNAVAILABLE');
  return { version: value.version, locale, hero: value.hero, sections: [...value.sections].sort((a, b) => a.order - b.order) };
}
