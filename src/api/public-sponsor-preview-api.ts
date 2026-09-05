import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type PublicSponsorPreview = {
  code: string;
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  sponsor: { displayName: string; vRank: string };
  gift: { status: "PENDING_REVIEW" | "POSTED"; usdtAmount: number; nexAmount: number };
};

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "REFERRAL_PREVIEW_RESPONSE_INVALID" });
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function amount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

const REMOTE_REFERRAL_CODE_RE = /^[A-Z0-9]{4,32}$/;

export function parsePublicSponsorPreview(value: unknown): PublicSponsorPreview {
  const row = object(value);
  const sponsor = object(row?.sponsor);
  const gift = object(row?.gift);
  const code = text(row?.code);
  const sourceEnvironment = text(row?.sourceEnvironment)?.toUpperCase();
  const displayName = text(sponsor?.displayName);
  const vRank = text(sponsor?.vRank);
  const status = text(gift?.status)?.toUpperCase();
  const usdtAmount = amount(gift?.usdtAmount);
  const nexAmount = amount(gift?.nexAmount);
  if (!row || !sponsor || !gift || !exactKeys(row, ["code", "sourceEnvironment", "sponsor", "gift"])
      || !exactKeys(sponsor, ["displayName", "vRank"])
      || !exactKeys(gift, ["status", "usdtAmount", "nexAmount"])
      || !code || !REMOTE_REFERRAL_CODE_RE.test(code)
      || (sourceEnvironment !== "PRODUCTION" && sourceEnvironment !== "SANDBOX")
      || !displayName || !vRank
      || (status !== "PENDING_REVIEW" && status !== "POSTED")
      || usdtAmount === null || nexAmount === null) return invalid();
  return { code, sourceEnvironment, sponsor: { displayName, vRank },
    gift: { status, usdtAmount, nexAmount } };
}

export function createPublicSponsorPreviewApi(client: ApiClient) {
  return {
    preview: async (code: string): Promise<PublicSponsorPreview> => parsePublicSponsorPreview(await client.request({
      method: "GET",
      path: `/api/public/referrals/${encodeURIComponent(code)}/preview`,
      authenticated: false,
    })),
  };
}
