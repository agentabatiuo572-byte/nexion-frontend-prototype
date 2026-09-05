import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface ManagedCopyDelivery {
  copyKey: string;
  version: string;
  zh: string;
  en: string;
  vi: string;
  experimentId: string | null;
  variant: string | null;
}

export interface CopyExperimentConversion {
  experimentId: string;
  conversionKey: string;
  counted: boolean;
}

export interface ContentCopyApi {
  byPosition(positionKey: string): Promise<ManagedCopyDelivery>;
  convert(experimentId: string, orderNo: string): Promise<CopyExperimentConversion>;
}

function invalid(message = "CONTENT_COPY_RESPONSE_INVALID"): never {
  throw new ApiError({ kind: "protocol", message });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid();
  return value.trim();
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value);
}

function bool(value: unknown): boolean {
  if (typeof value !== "boolean") return invalid();
  return value;
}

function identifier(value: string, message: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9._-]{1,95}$/.test(normalized)) {
    throw new ApiError({ kind: "protocol", message });
  }
  return normalized;
}

function experimentIdentifier(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(normalized)) {
    throw new ApiError({ kind: "protocol", message: "CONTENT_EXPERIMENT_ID_INVALID" });
  }
  return normalized;
}

function delivery(value: unknown): ManagedCopyDelivery {
  const row = record(value);
  const rawExperimentId = nullableText(row.experimentId);
  const experimentId = rawExperimentId === null ? null : experimentIdentifier(rawExperimentId);
  const variant = nullableText(row.variant);
  if ((experimentId === null) !== (variant === null)) return invalid();
  return {
    copyKey: identifier(text(row.copyKey), "CONTENT_COPY_KEY_INVALID"),
    version: text(row.version),
    zh: text(row.zh),
    en: text(row.en),
    vi: text(row.vi),
    experimentId,
    variant,
  };
}

function conversion(value: unknown): CopyExperimentConversion {
  const row = record(value);
  return {
    experimentId: text(row.experimentId),
    conversionKey: text(row.conversionKey),
    counted: bool(row.counted),
  };
}

export function createContentCopyApi(client: ApiClient): ContentCopyApi {
  return {
    byPosition: async (positionKey) => delivery(await client.request({
      method: "GET",
      path: `/api/content/positions/${encodeURIComponent(
        identifier(positionKey, "CONTENT_COPY_POSITION_INVALID"),
      )}`,
    })),
    convert: async (experimentId, orderNo) => conversion(await client.request({
      method: "POST",
      path: `/api/content/experiments/${encodeURIComponent(
        experimentIdentifier(experimentId),
      )}/convert`,
      body: { conversionKey: text(orderNo) },
    })),
  };
}
