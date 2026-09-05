import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface RiskDisclosureChapter {
  no: string;
  zh: string;
  vi: string;
  en: string;
  zhBody: string;
  viBody: string;
  enBody: string;
}

export interface RiskDisclosureCurrent {
  source: "server" | "mock";
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  jurisdiction: string;
  jurisdictionName: string;
  version: string;
  languageScope: string;
  effectiveDate: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  chapters: RiskDisclosureChapter[];
  acknowledgmentToken: string | null;
  acknowledgmentTokenExpiresAt: string | null;
  minimumReadingSeconds: number;
}

export interface RiskDisclosureApi {
  current(): Promise<RiskDisclosureCurrent>;
  acknowledge(current: RiskDisclosureCurrent): Promise<RiskDisclosureCurrent>;
  checkGate(actionKey: string, operationId?: string): Promise<void>;
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "RISK_DISCLOSURE_RESPONSE_INVALID" });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid();
  return value.trim();
}

function optionalText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return invalid();
  return value.trim();
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return requiredText(value);
}

function chapter(value: unknown, requireEnglish: boolean): RiskDisclosureChapter {
  const row = record(value);
  if (!row) return invalid();
  return {
    no: requiredText(row.no),
    zh: requiredText(row.zh),
    vi: requiredText(row.vi),
    en: requireEnglish ? requiredText(row.en) : optionalText(row.en),
    zhBody: requiredText(row.zhBody),
    viBody: requiredText(row.viBody),
    enBody: requireEnglish ? requiredText(row.enBody) : optionalText(row.enBody),
  };
}

function current(value: unknown): RiskDisclosureCurrent {
  const row = record(value);
  const source = row?.source;
  const sourceEnvironment = row?.sourceEnvironment;
  if ((source !== "server" && source !== "mock")
      || (sourceEnvironment !== "PRODUCTION" && sourceEnvironment !== "SANDBOX")
      || (source === "mock" && sourceEnvironment !== "SANDBOX")
      || (source === "server" && sourceEnvironment !== "PRODUCTION")) return invalid();
  const minimumReadingSeconds = Number(row?.minimumReadingSeconds);
  if (!row || typeof row.acknowledged !== "boolean"
      || !Array.isArray(row.chapters) || row.chapters.length !== 7
      || !Number.isSafeInteger(minimumReadingSeconds)
      || minimumReadingSeconds < 1 || minimumReadingSeconds > 600) {
    return invalid();
  }
  const languageScope = requiredText(row.languageScope);
  if (languageScope !== "zh+vi" && languageScope !== "zh+vi+en") return invalid();
  const chapters = row.chapters.map((entry) => chapter(entry, languageScope.includes("en")));
  if (chapters.map((entry) => entry.no).sort().join(",") !== "01,02,03,04,05,06,07") return invalid();
  const parsed: RiskDisclosureCurrent = {
    source,
    sourceEnvironment,
    jurisdiction: requiredText(row.jurisdiction),
    jurisdictionName: requiredText(row.jurisdictionName),
    version: requiredText(row.version),
    languageScope,
    effectiveDate: requiredText(row.effectiveDate),
    acknowledged: row.acknowledged,
    acknowledgedAt: nullableText(row.acknowledgedAt),
    chapters,
    acknowledgmentToken: nullableText(row.acknowledgmentToken),
    acknowledgmentTokenExpiresAt: nullableText(row.acknowledgmentTokenExpiresAt),
    minimumReadingSeconds,
  };
  if (parsed.acknowledged) {
    if (!parsed.acknowledgedAt || parsed.acknowledgmentToken) return invalid();
  } else if (!parsed.acknowledgmentToken || !parsed.acknowledgmentTokenExpiresAt) {
    return invalid();
  }
  return parsed;
}

export function createRiskDisclosureApi(client: ApiClient): RiskDisclosureApi {
  return {
    current: async () => current(await client.request({
      method: "GET",
      path: "/api/legal/risk-disclosure/current",
    })),
    acknowledge: async (disclosure) => {
      if (disclosure.acknowledged || !disclosure.acknowledgmentToken) {
        throw new ApiError({ kind: "protocol", message: "RISK_DISCLOSURE_READ_TOKEN_REQUIRED" });
      }
      try {
        return current(await client.request({
          method: "POST",
          path: "/api/legal/risk-disclosure/acknowledgment",
          body: {
            jurisdiction: disclosure.jurisdiction,
            version: disclosure.version,
            acknowledgmentToken: disclosure.acknowledgmentToken,
            confirmed: true,
          },
        }));
      } catch (error) {
        // The acknowledgment may have committed even when its response was
        // lost. Recover only from the same authoritative jurisdiction/version;
        // never let a different or still-unacknowledged snapshot pass.
        try {
          const recovered = current(await client.request({
            method: "GET",
            path: "/api/legal/risk-disclosure/current",
          }));
          if (recovered.acknowledged
              && recovered.jurisdiction === disclosure.jurisdiction
              && recovered.version === disclosure.version) {
            return recovered;
          }
        } catch {
          // Preserve the original command failure when recovery is unavailable.
        }
        throw error;
      }
    },
    checkGate: async (actionKey, operationId) => {
      const normalizedActionKey = actionKey.trim();
      if (!normalizedActionKey || normalizedActionKey.length > 96) {
        throw new ApiError({ kind: "protocol", message: "RISK_DISCLOSURE_GATE_ACTION_INVALID" });
      }
      const normalizedOperationId = operationId?.trim();
      if (normalizedOperationId && normalizedOperationId.length > 128) {
        throw new ApiError({ kind: "protocol", message: "RISK_DISCLOSURE_GATE_OPERATION_INVALID" });
      }
      await client.request({
        method: "POST",
        path: `/api/legal/risk-disclosure/gates/${encodeURIComponent(normalizedActionKey)}/check`,
        body: normalizedOperationId ? { operationId: normalizedOperationId } : undefined,
      });
    },
  };
}
