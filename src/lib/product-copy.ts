// Localized per-SKU marketing copy.
//
// src/mock/products.ts owns the backend-replaceable data shape and the English
// source strings; the display layer resolves the active locale here so store
// cards / detail / search never render raw mock English. Product `name`
// (NexGridBox S1, Cloud Share …) is a brand mark and is deliberately NOT
// translated — only prose fields are.
//
// Falls back to the products.ts English when a SKU has no catalog entry, so a
// newly added product degrades to English instead of crashing. verify.sh
// asserts id parity so that fallback stays unreachable in practice.

import type { Messages } from "@/i18n/messages/en";
import type { Product } from "@/mock/products";
import { SPEC_UNAVAILABLE } from "@/api/product-catalog-contract";
import { fmt } from "@/i18n/format";

export interface ProductCopy {
  tagline: string;
  badge: string;
  /** AI pool this SKU books tasks from (product.ai.unlocks). "" when the SKU has none. */
  unlocks: string;
}

type CatalogEntry = { tagline: string; badge: string; unlocks: string };

export function productCopy(t: Messages, p: Product): ProductCopy {
  const entry = (t.store.catalog as Record<string, CatalogEntry | undefined>)[p.id];
  return {
    tagline: entry?.tagline ?? p.tagline,
    badge: entry?.badge ?? p.badge ?? "",
    unlocks: entry?.unlocks ?? p.ai?.unlocks ?? "",
  };
}

/**
 * Display gate for the server-owned spec strings (every `displayString` field in
 * product-catalog-contract). SPEC_UNAVAILABLE is the server's own "no certified
 * value" sentinel, and a mock SKU may not carry the field at all — both degrade
 * to one locale string so the raw token never reaches the screen.
 *
 * Every render of those fields goes through here; `spec-sentinel-render-gate.mjs`
 * fails the build on any unwrapped read in the store render face.
 */
export function specText(t: Messages, value: string | undefined): string {
  return !value || value === SPEC_UNAVAILABLE ? t.store.specValueUnavailable : value;
}

export interface SpecRow { k: string; v: string }

/**
 * A spec-table row, or null when there is nothing to say. An empty row carries no
 * information, and printing a placeholder into a spec sheet reads as "we haven't
 * told you yet" — worse than simply not listing the line. Callers filter out nulls.
 *
 * Absence is judged on the SOURCE value, never on the rendered string: comparing
 * against the localized placeholder would silently break the moment that copy or
 * the active language changes.
 *
 * Single-value displays (a card's "GPU · VRAM" line) can't drop a row and keep
 * using specText's placeholder instead.
 */
export function specRow(label: string, raw: string | undefined): SpecRow | null {
  return !raw || raw === SPEC_UNAVAILABLE ? null : { k: label, v: raw };
}

/**
 * Warranty term. The server owns a month count; the unit word is ours, so the row
 * is three-language by construction instead of arriving as untranslatable prose
 * ("24 months" rendered inside a Chinese spec sheet).
 *
 * Whole terms of three years or more read as years, matching how those SKUs
 * advertise themselves ("5-year extended warranty"); shorter terms stay in months,
 * matching the established box copy. Absent → the same placeholder as any other
 * missing spec.
 */
export function warrantyText(t: Messages, months: number | undefined): string {
  if (!months || months <= 0) return t.store.specValueUnavailable;
  return months >= 36 && months % 12 === 0
    ? fmt(t.store.specWarrantyYears, { n: months / 12 })
    : fmt(t.store.specWarrantyMonths, { n: months });
}
