export type TrustLocale = "zh" | "vi" | "en";

export interface TrustFieldLike {
  key: string;
  value: string;
}

function localeSuffix(key: string): TrustLocale | null {
  const match = key.match(/[._-](zh|vi|en)$/i);
  return match ? match[1].toLowerCase() as TrustLocale : null;
}

export function filterTrustFields<T extends TrustFieldLike>(fields: readonly T[], locale: TrustLocale): T[] {
  return fields.filter((field) => {
    const suffix = localeSuffix(field.key);
    return suffix === null || suffix === locale;
  });
}

export function trustFieldValue(fields: readonly TrustFieldLike[], key: string): string | null {
  const value = fields.find((field) => field.key === key)?.value?.trim();
  return value || null;
}

export function localizedTrustFieldValue(
  fields: readonly TrustFieldLike[],
  key: string,
  locale: TrustLocale,
): string | null {
  const localized = trustFieldValue(fields, `${key}.${locale}`);
  if (localized !== null) return localized;
  const hasLocalizedFamily = fields.some((field) => {
    const match = field.key.match(/^(.*)[._-](zh|vi|en)$/i);
    return match?.[1].toLowerCase() === key.toLowerCase();
  });
  return hasLocalizedFamily ? null : trustFieldValue(fields, key);
}

export function trustNumberedRows<K extends string>(
  fields: readonly TrustFieldLike[],
  prefix: string,
  keys: readonly K[],
  locale: TrustLocale,
): Array<Record<K, string>> {
  const indexes = new Set<number>();
  const matcher = new RegExp(`^${prefix}(\\d+)`);
  fields.forEach((field) => {
    const match = field.key.match(matcher);
    if (match) indexes.add(Number(match[1]));
  });
  return [...indexes].sort((a, b) => a - b).map((index) => Object.fromEntries(
    keys.map((key) => [key, localizedTrustFieldValue(fields, `${prefix}${index}${key}`, locale) ?? ""]),
  ) as Record<K, string>).filter((item) => keys.some((key) => item[key]));
}
