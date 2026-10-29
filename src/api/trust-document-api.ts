import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type TrustDocumentSlot = "whitepaper" | "incorporation" | "msb" | "ein";

export interface TrustCompanyProfile {
  legalName: string;
  jurisdiction: string;
  registeredAddress: string;
  nyDosId: string;
  nyFilingNumber: string;
  authorizedCapitalUsd: number;
}

export interface TrustDocument {
  slot: TrustDocumentSlot;
  version: string | null;
  language: string | null;
  referenceNo: string | null;
  verifyUrl: string | null;
  fileName: string;
  sizeBytes: number;
  pageCount: number;
  /** Absolute URL of the PDF; it changes whenever the file is replaced. Null for the white paper, which is view-only. */
  fileUrl: string | null;
  /** Absolute URLs of the rendered page images, in page order. */
  pageUrls: string[];
}

export interface TrustDocuments {
  profile: TrustCompanyProfile;
  documents: Record<TrustDocumentSlot, TrustDocument>;
}

export interface TrustDocumentApi {
  current(): Promise<TrustDocuments>;
}

const SLOTS: readonly TrustDocumentSlot[] = ["whitepaper", "incorporation", "msb", "ein"];
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_PAGES = 80;

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "TRUST_DOCUMENT_RESPONSE_INVALID" });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid();
  return value.trim();
}

function optional(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return invalid();
  return value.trim() || null;
}

function httpsUrl(value: unknown): string | null {
  const raw = optional(value);
  if (raw === null) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function document(value: unknown, baseUrl: string): TrustDocument {
  const row = record(value);
  const slot = text(row.slot) as TrustDocumentSlot;
  const sha256 = text(row.sha256);
  const revision = sha256.slice(0, 12);
  const fileUrl = slot === "whitepaper" ? null : `/api/content/trust/documents/${slot}/file?v=${revision}`;
  if (!SLOTS.includes(slot) || !SHA256.test(sha256) || (row.fileUrl ?? null) !== fileUrl
      || typeof row.sizeBytes !== "number" || !Number.isSafeInteger(row.sizeBytes) || row.sizeBytes <= 0
      || typeof row.pageCount !== "number" || !Number.isSafeInteger(row.pageCount) || row.pageCount < 1 || row.pageCount > MAX_PAGES) return invalid();
  return {
    slot,
    version: optional(row.version),
    language: optional(row.language),
    referenceNo: optional(row.referenceNo),
    verifyUrl: httpsUrl(row.verifyUrl),
    fileName: text(row.fileName),
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    fileUrl: fileUrl && `${baseUrl}${fileUrl}`,
    pageUrls: Array.from({ length: row.pageCount }, (_, index) => `${baseUrl}/api/content/trust/documents/${slot}/pages/${index + 1}?v=${revision}`),
  };
}

export function parseTrustDocuments(value: unknown, baseUrl: string): TrustDocuments {
  const body = record(value);
  const profile = record(body.profile);
  const capital = Number(text(profile.authorizedCapitalUsd));
  if (!Number.isSafeInteger(capital) || capital <= 0 || !Array.isArray(body.documents)) return invalid();
  const rows = body.documents.map((row) => document(row, baseUrl.replace(/\/+$/, "")));
  const bySlot = Object.fromEntries(rows.map((row) => [row.slot, row])) as Record<TrustDocumentSlot, TrustDocument>;
  if (rows.length !== SLOTS.length || SLOTS.some((slot) => !bySlot[slot])) return invalid();
  return {
    profile: {
      legalName: text(profile.legalName),
      jurisdiction: text(profile.jurisdiction),
      registeredAddress: text(profile.registeredAddress),
      nyDosId: text(profile.nyDosId),
      nyFilingNumber: text(profile.nyFilingNumber),
      authorizedCapitalUsd: capital,
    },
    documents: bySlot,
  };
}

export function createTrustDocumentApi(client: ApiClient, baseUrl: string): TrustDocumentApi {
  return {
    current: async () => parseTrustDocuments(await client.request({
      method: "GET",
      path: "/api/content/trust/documents",
      authenticated: false,
    }), baseUrl),
  };
}
