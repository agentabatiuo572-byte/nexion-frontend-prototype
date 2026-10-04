import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
export type AmbassadorEnvironment = "PRODUCTION";

export interface AmbassadorPolicyBucket {
  id: "venue" | "kol" | "print" | "dev";
  title: string;
  range: string;
  rule: string;
  minBudgetUsdt: number;
  maxBudgetUsdt: number;
}

export interface AmbassadorPolicy {
  policyVersion: string;
  revision: number;
  defaultBudgetUsdt: number;
  buckets: AmbassadorPolicyBucket[];
  source: "server";
  sourceEnvironment: "PRODUCTION";
  runId: string;
}

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
  sourceEnvironment: "PRODUCTION";
  runId: string;
}

export interface AmbassadorApplicationInput {
  eventDate: string;
  city: string;
  budgetUsdt: number;
  bucket: "venue" | "kol" | "print" | "dev";
}

export interface AmbassadorApplicationApi {
  policy(): Promise<AmbassadorPolicy>;
  latest(): Promise<AmbassadorApplication>;
  history(): Promise<AmbassadorApplication[]>;
  submit(input: AmbassadorApplicationInput, idempotencyKey: string): Promise<AmbassadorApplication>;
}

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "AMBASSADOR_APPLICATION_RESPONSE_INVALID" });
}

function provenance(row: Record<string, unknown>, expectedEnvironment: AmbassadorEnvironment = "PRODUCTION"): { sourceEnvironment: "PRODUCTION"; runId: string } {
  const environment = row.sourceEnvironment;
  const runId = row.runId;
  if (row.source !== "server" || environment !== expectedEnvironment || typeof runId !== "string" || runId !== "") return invalid();
  return { sourceEnvironment: "PRODUCTION", runId: "" };
}

export function parseAmbassadorPolicy(value: unknown, expectedEnvironment?: AmbassadorEnvironment): AmbassadorPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  const proof = provenance(row, expectedEnvironment);
  const rawBuckets = row.buckets;
  if (typeof row.policyVersion !== "string" || !row.policyVersion.trim()
    || typeof row.revision !== "number" || !Number.isSafeInteger(row.revision) || row.revision <= 0
    || typeof row.defaultBudgetUsdt !== "number" || !Number.isFinite(row.defaultBudgetUsdt) || row.defaultBudgetUsdt <= 0
    || !Array.isArray(rawBuckets) || rawBuckets.length !== 4) return invalid();
  const ids = new Set<string>();
  const buckets = rawBuckets.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return invalid();
    const item = entry as Record<string, unknown>;
    const id = item.id;
    if (id !== "venue" && id !== "kol" && id !== "print" && id !== "dev") return invalid();
    if (ids.has(id) || typeof item.title !== "string" || !item.title.trim()
      || typeof item.range !== "string" || !item.range.trim() || typeof item.rule !== "string" || !item.rule.trim()
      || typeof item.minBudgetUsdt !== "number" || !Number.isFinite(item.minBudgetUsdt)
      || typeof item.maxBudgetUsdt !== "number" || !Number.isFinite(item.maxBudgetUsdt)
      || item.minBudgetUsdt < 100 || item.maxBudgetUsdt < item.minBudgetUsdt || item.maxBudgetUsdt > 10000) return invalid();
    ids.add(id);
    return { id: id as AmbassadorPolicyBucket["id"], title: item.title.trim(), range: item.range.trim(), rule: item.rule.trim(), minBudgetUsdt: item.minBudgetUsdt, maxBudgetUsdt: item.maxBudgetUsdt };
  });
  if (ids.size !== 4) return invalid();
  return { policyVersion: row.policyVersion.trim(), revision: row.revision, defaultBudgetUsdt: row.defaultBudgetUsdt,
    buckets, source: "server", ...proof };
}

function parse(value: unknown, expectedEnvironment?: AmbassadorEnvironment): AmbassadorApplication {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  const status = row.status;
  const proof = provenance(row, expectedEnvironment);
  if (status !== "NONE" && status !== "PENDING" && status !== "APPROVED" && status !== "REJECTED") return invalid();
  if (status === "NONE") {
    return { applicationId: null, status, city: null, eventDate: null, budgetUsdt: null, bucket: null,
      submittedAt: null, source: "server", ...proof };
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
  return { applicationId, status, city: city.trim(), eventDate, budgetUsdt, bucket,
    submittedAt, source: "server", ...proof };
}

export function parseAmbassadorApplicationPage(value: unknown, expectedEnvironment?: AmbassadorEnvironment): {
  rows: AmbassadorApplication[]; pageNum: number; pageSize: number; total: number; hasMore: boolean;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  provenance(row, expectedEnvironment);
  if (!Array.isArray(row.rows) || typeof row.pageNum !== "number" || !Number.isSafeInteger(row.pageNum) || row.pageNum < 1
    || typeof row.pageSize !== "number" || !Number.isSafeInteger(row.pageSize) || row.pageSize < 1 || row.pageSize > 100
    || typeof row.total !== "number" || !Number.isSafeInteger(row.total) || row.total < 0
    || typeof row.hasMore !== "boolean") return invalid();
  const rows = row.rows.map((entry) => parse(entry, expectedEnvironment));
  if (rows.length > row.pageSize || (row.pageNum - 1) * row.pageSize + rows.length > row.total
    || row.hasMore !== ((row.pageNum - 1) * row.pageSize + rows.length < row.total)) return invalid();
  return { rows, pageNum: row.pageNum, pageSize: row.pageSize, total: row.total, hasMore: row.hasMore };
}

export function createAmbassadorApplicationApi(client: ApiClient, environment: AmbassadorEnvironment = "PRODUCTION"): AmbassadorApplicationApi {
  const path = "/api/app/team/ambassador-applications";
  return {
    async policy() {
      return parseAmbassadorPolicy(await client.request<unknown>({ path: `${path}/policy` }), environment);
    },
    async latest() {
      return parse(await client.request<unknown>({ path: `${path}/latest` }), environment);
    },
    async history() {
      const rows: AmbassadorApplication[] = [];
      const seen = new Set<number>();
      let pageNum = 1;
      let expectedTotal: number | null = null;
      while (true) {
        const page = parseAmbassadorApplicationPage(await client.request<unknown>({
          path: `${path}?pageNum=${pageNum}&pageSize=50`,
        }), environment);
        if (page.pageNum !== pageNum || page.pageSize !== 50
          || (expectedTotal !== null && page.total !== expectedTotal)) return invalid();
        expectedTotal ??= page.total;
        for (const application of page.rows) {
          if (application.applicationId === null || seen.has(application.applicationId)) return invalid();
          seen.add(application.applicationId);
          rows.push(application);
        }
        if (!page.hasMore) {
          if (rows.length !== page.total) return invalid();
          return rows;
        }
        if (page.rows.length === 0) return invalid();
        pageNum += 1;
      }
    },
    async submit(input, idempotencyKey) {
      return parse(await client.request<unknown>({ path, method: "POST", body: input, idempotencyKey }), environment);
    },
  };
}
