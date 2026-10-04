import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { ApiEnvironment } from "./runtime-config";
import { matchesRuntimeProvenance } from "./runtime-provenance";

export const HOW_CONTENT_KEYS = [
  "genesis-how",
  "wallet-exchange-how",
  "wallet-repurchase-how",
  "team-binary-how",
  "team-commissions-how",
  "team-unilevel-how",
] as const;
export type HowContentKey = typeof HOW_CONTENT_KEYS[number];
export type HowContentKind = "text" | "list" | "callout" | "ruleRef";
export interface HowContentRuleRef { source: "canonical"; key: string; version: string }
export interface HowContentBlock {
  id: string;
  kind: HowContentKind;
  title: string;
  body: string;
  items?: string[];
  ref?: HowContentRuleRef;
}
export interface HowContentDocument {
  contentKey: HowContentKey;
  version: string;
  /**
   * 简报 #49:本页版本来自哪里。`ENTRY` = 本页自己的发布修订;`DOCUMENT_FALLBACK` =
   * 该页尚未声明独立修订,退回整份文档的共用版本。页脚据此如实说明,避免让用户
   * 把文档级版本误当成这一页的专属修订。
   */
  versionSource: "ENTRY" | "DOCUMENT_FALLBACK";
  locale: string;
  status: "PUBLISHED";
  blocks: HowContentBlock[];
  source: "server" | "mock";
  sourceEnvironment: "PRODUCTION" | "SANDBOX";
  runId: string;
}

function invalid(): never { throw new ApiError({ kind: "protocol", message: "HOW_CONTENT_RESPONSE_INVALID" }); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function stringValue(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid();
  return value.trim();
}
function parseBlock(value: unknown): HowContentBlock {
  const row = record(value);
  const kind = stringValue(row.kind);
  if (!(new Set<HowContentKind>(["text", "list", "callout", "ruleRef"])).has(kind as HowContentKind)) return invalid();
  const block: HowContentBlock = { id: stringValue(row.id), kind: kind as HowContentKind, title: stringValue(row.title), body: stringValue(row.body) };
  if (row.items !== undefined) {
    if (!Array.isArray(row.items) || row.items.length > 50 || !row.items.every((item) => typeof item === "string" && item.trim())) return invalid();
    block.items = row.items.map((item) => (item as string).trim());
  }
  if (block.kind === "list" && (!block.items || block.items.length === 0)) return invalid();
  if (block.kind === "ruleRef") {
    const ref = record(row.ref);
    if (ref.source !== "canonical" || typeof ref.key !== "string" || !/^[A-Za-z0-9_.:-]{3,160}$/.test(ref.key) || typeof ref.version !== "string" || !ref.version.trim()) return invalid();
    block.ref = { source: "canonical", key: ref.key, version: ref.version.trim() };
  } else if (row.ref !== undefined) return invalid();
  return block;
}
function parse(value: unknown, expectedKey: string, mode: ApiEnvironment): HowContentDocument {
  const row = record(value);
  if (!HOW_CONTENT_KEYS.includes(expectedKey as HowContentKey) || row.contentKey !== expectedKey || row.status !== "PUBLISHED") return invalid();
  if (typeof row.version !== "string" || !row.version.trim() || typeof row.locale !== "string" || !row.locale.trim() || !Array.isArray(row.blocks) || row.blocks.length === 0 || row.blocks.length > 200) return invalid();
  // 简报 #49:服务端在条目未声明自己修订时会退回文档级版本,并以 versionSource 如实标注。
  // 旧后端只发 version:仅那一版佣金文档在其他说明页可确定是文档回退。
  // 新后端明确给出 ENTRY 时始终尊重服务端来源,不从修订文本反推。
  const legacyDocumentFallback = row.versionSource === undefined
    && expectedKey !== "team-commissions-how"
    && row.version.trim() === "2026.08.31-commissions-guide";
  const versionSource = row.versionSource === undefined
    ? (legacyDocumentFallback ? "DOCUMENT_FALLBACK" : "ENTRY")
    : row.versionSource;
  if (versionSource !== "ENTRY" && versionSource !== "DOCUMENT_FALLBACK") return invalid();
  const blocks = row.blocks.map(parseBlock);
  if (new Set(blocks.map((block) => block.id)).size !== blocks.length) return invalid();
  if (!matchesRuntimeProvenance(row, mode, "server")) return invalid();
  return { contentKey: expectedKey as HowContentKey, version: row.version.trim(), versionSource, locale: row.locale.trim(), status: "PUBLISHED", blocks, source: "server", sourceEnvironment: row.sourceEnvironment as "PRODUCTION" | "SANDBOX", runId: row.runId as string };
}

export interface HowContentApi { published(contentKey: HowContentKey, locale: string): Promise<HowContentDocument> }
export function createHowContentApi(client: ApiClient, mode: ApiEnvironment = "prod"): HowContentApi {
  return { published: async (contentKey, locale) => parse(await client.request<unknown>({ method: "GET", authenticated: false, path: `/api/content/how-it-works/${encodeURIComponent(contentKey)}?locale=${encodeURIComponent(locale)}` }), contentKey, mode) };
}
