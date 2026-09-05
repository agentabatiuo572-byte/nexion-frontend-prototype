import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type AmbassadorApplicationStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";

export interface AmbassadorApplication {
  applicationId: number | null;
  status: AmbassadorApplicationStatus;
  city: string | null;
  eventDate: string | null;
  budgetUsdt: number | null;
  bucket: "venue" | "kol" | "print" | "dev" | null;
  submittedAt: string | null;
  source: "server";
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

export interface AmbassadorApplicationInput {
  eventDate: string;
  city: string;
  budgetUsdt: number;
  bucket: "venue" | "kol" | "print" | "dev";
}

export interface AmbassadorApplicationApi {
  latest(): Promise<AmbassadorApplication>;
  submit(input: AmbassadorApplicationInput, idempotencyKey: string): Promise<AmbassadorApplication>;
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "AMBASSADOR_APPLICATION_RESPONSE_INVALID" });
}

function parse(value: unknown): AmbassadorApplication {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  const status = row.status;
  const environment = row.sourceEnvironment;
  if (row.source !== "server"
    || (status !== "NONE" && status !== "PENDING" && status !== "APPROVED" && status !== "REJECTED")
    || (environment !== "PRODUCTION" && environment !== "SANDBOX")
    || typeof row.runId !== "string"
    || (environment === "SANDBOX" && !row.runId.trim())
    || (environment === "PRODUCTION" && row.runId !== "")) return invalid();
  if (status === "NONE") {
    return { applicationId: null, status, city: null, eventDate: null, budgetUsdt: null, bucket: null,
      submittedAt: null, source: "server", sourceEnvironment: environment, runId: row.runId };
  }
  const applicationId = row.applicationId;
  const city = row.city;
  const eventDate = row.eventDate;
  const budgetUsdt = row.budgetUsdt;
  const bucket = row.bucket;
  const submittedAt = row.submittedAt;
  if (typeof applicationId !== "number" || !Number.isSafeInteger(applicationId) || applicationId <= 0
    || typeof city !== "string" || !city.trim()
    || typeof eventDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    || typeof budgetUsdt !== "number" || !Number.isFinite(budgetUsdt) || budgetUsdt < 0
    || (bucket !== "venue" && bucket !== "kol" && bucket !== "print" && bucket !== "dev")
    || typeof submittedAt !== "string" || !Number.isFinite(Date.parse(submittedAt))) return invalid();
  return { applicationId, status, city: city.trim(), eventDate, budgetUsdt, bucket, submittedAt,
    source: "server", sourceEnvironment: environment, runId: row.runId };
}

export function createAmbassadorApplicationApi(client: ApiClient): AmbassadorApplicationApi {
  const path = "/api/app/team/ambassador-applications";
  return {
    async latest() {
      return parse(await client.request<unknown>({ path: `${path}/latest` }));
    },
    async submit(input, idempotencyKey) {
      return parse(await client.request<unknown>({ path, method: "POST", body: input, idempotencyKey }));
    },
  };
}
