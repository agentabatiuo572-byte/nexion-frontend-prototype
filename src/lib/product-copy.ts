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

import { en, type Messages } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";
import type { LocaleCode } from "@/i18n";
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

const badgeSources = [en.store, vi.store, zh.store];

// Match known free-text marketing labels by meaning; leave custom copy intact.
function serverBadge(t: Messages, badge: string | undefined): string {
  if (!badge) return "";
  if (badgeSources.some((store) => store.bestSeller === badge || store.catalog["stellarbox-s1"].badge === badge)) return t.store.bestSeller;
  if (badgeSources.some((store) => store.trending === badge || store.catalog["stellarbox-pro"].badge === badge)) return t.store.catalog["stellarbox-pro"].badge;
  for (const id of Object.keys(en.store.catalog) as (keyof typeof en.store.catalog)[]) {
    if (badgeSources.some((store) => store.catalog[id].badge === badge)) return t.store.catalog[id].badge;
  }
  return badge;
}

function normalizedPublishedTagline(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s*[·・]\s*/gu, "·");
}

const PRO_PUBLISHED_TAGLINE = "中端主力·AI 推理 + 挖掘";
const VIRGINIA_DATACENTER = "美国·弗吉尼亚";

/** Translate only this published place label; a SKU's actual datacenter remains server-owned. */
export function localizedDatacenterValue(value: string | null | undefined, locale: LocaleCode): string | null | undefined {
  if (!value || normalizedPublishedTagline(value) !== VIRGINIA_DATACENTER || locale === "zh") return value;
  return locale === "vi" ? "Hoa Kỳ · Virginia" : "United States · Virginia";
}

function serverTagline(t: Messages, p: Product, locale?: LocaleCode): string {
  if (p.id === "cloud-share" && normalizedPublishedTagline(p.tagline) === zh.store.cloudShareLowBarrierTagline) {
    return t.store.cloudShareLowBarrierTagline;
  }
  if (p.id === "stellarbox-pro" && normalizedPublishedTagline(p.tagline) === PRO_PUBLISHED_TAGLINE && locale && locale !== "zh") {
    return locale === "vi" ? "Dòng chủ lực tầm trung · Suy luận AI + khai thác" : "Midrange mainstay · AI inference + mining";
  }
  return p.tagline;
}

export function productCopy(t: Messages, p: Product, serverCatalog = false, locale?: LocaleCode): ProductCopy {
  if (serverCatalog) return {
    tagline: serverTagline(t, p, locale),
    badge: serverBadge(t, p.badge),
    unlocks: "",
  };
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
export function specText(t: Messages, value: string | null | undefined, fallback = t.store.specValueUnavailable): string {
  return !value || value === SPEC_UNAVAILABLE ? fallback : value;
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
