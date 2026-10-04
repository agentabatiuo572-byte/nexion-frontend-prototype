import { describe, expect, it, beforeEach, vi } from "vitest";
import { createHowContentApi, HOW_CONTENT_KEYS, type HowContentDocument } from "./how-content-api";

const base = (contentKey: HowContentDocument["contentKey"], locale = "en"): HowContentDocument => ({
  contentKey,
  version: "2026.08.17.1",
  versionSource: "ENTRY",
  locale,
  status: "PUBLISHED",
  blocks: [
    { id: "intro", kind: "text", title: "Intro", body: "Server-owned explanation" },
    { id: "period", kind: "ruleRef", title: "Settlement", body: "{value}", ref: { source: "canonical", key: "team.ui.F.binary.settlePeriod", version: "F3.2026.08.17" } },
  ],
  source: "server",
  sourceEnvironment: "PRODUCTION",
  runId: "",
});

describe("how content API", () => {
  beforeEach(() => {});

  it("supports the six published content keys", async () => {
    expect(HOW_CONTENT_KEYS).toHaveLength(6);
    for (const contentKey of HOW_CONTENT_KEYS) {
      const request = vi.fn().mockResolvedValue(base(contentKey));
      const value = await createHowContentApi({ request } as never, "prod").published(contentKey, "en");
      expect(value.contentKey).toBe(contentKey);
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: `/api/content/how-it-works/${contentKey}?locale=en` }));
    }
  });

  it("fails closed on drafts, malformed blocks, or provenance mismatch", async () => {
    const draft = { ...base("genesis-how"), status: "DRAFT" };
    await expect(createHowContentApi({ request: vi.fn().mockResolvedValue(draft) } as never, "prod").published("genesis-how", "en"))
      .rejects.toThrow("HOW_CONTENT_RESPONSE_INVALID");
    const malformed = { ...base("genesis-how"), blocks: [{ id: "x", kind: "ruleRef", title: "x", body: "x" }] };
    await expect(createHowContentApi({ request: vi.fn().mockResolvedValue(malformed) } as never, "prod").published("genesis-how", "en"))
      .rejects.toThrow("HOW_CONTENT_RESPONSE_INVALID");
    const wrongEnv = { ...base("genesis-how"), sourceEnvironment: "SANDBOX", runId: "other-run" };
    await expect(createHowContentApi({ request: vi.fn().mockResolvedValue(wrongEnv) } as never, "prod").published("genesis-how", "en"))
      .rejects.toThrow("HOW_CONTENT_RESPONSE_INVALID");
  });

  it("accepts the production authority in development and rejects non-empty run ids", async () => {
    const request = vi.fn().mockResolvedValue(base("team-binary-how"));
    await expect(createHowContentApi({ request } as never, "dev").published("team-binary-how", "zh-CN")).resolves.toMatchObject({ sourceEnvironment: "PRODUCTION" });
    await expect(createHowContentApi({ request: vi.fn().mockResolvedValue({ ...base("team-binary-how"), runId: "development-run-stale" }) } as never, "dev").published("team-binary-how", "en"))
      .rejects.toThrow("HOW_CONTENT_RESPONSE_INVALID");
  });
});

/**
 * 简报 #49:Genesis / 复投 / 兑换 三个不同业务域的玩法说明都显示同一个
 * 「commissions-guide」,无法据此确认本页展示的是哪一版规则。
 * 服务端在条目未声明独立修订时退回文档级版本,并以 versionSource 如实标注;
 * App 必须解析这个标注,页脚才能说清「这是文档版本,不是本页专属修订」。
 */
describe("how content version provenance", () => {
  it("accepts an explicit document fallback and reports it", async () => {
    const request = vi.fn().mockResolvedValue({ ...base("genesis-how"), versionSource: "DOCUMENT_FALLBACK" });
    const value = await createHowContentApi({ request } as never, "prod").published("genesis-how", "en");
    expect(value.versionSource).toBe("DOCUMENT_FALLBACK");
  });

  it("treats a missing versionSource as an entry revision for older backends", async () => {
    const payload = { ...base("genesis-how") } as Record<string, unknown>;
    delete payload.versionSource;
    const request = vi.fn().mockResolvedValue(payload);
    const value = await createHowContentApi({ request } as never, "prod").published("genesis-how", "en");
    expect(value.versionSource).toBe("ENTRY");
  });

  it("recognizes the exact legacy shared document version only when provenance is absent", async () => {
    const legacy = { ...base("genesis-how"), version: "2026.08.31-commissions-guide" } as Record<string, unknown>;
    delete legacy.versionSource;
    const request = vi.fn().mockResolvedValue(legacy);
    const value = await createHowContentApi({ request } as never, "prod").published("genesis-how", "en");
    expect(value.versionSource).toBe("DOCUMENT_FALLBACK");

    const explicit = { ...legacy, versionSource: "ENTRY" };
    const explicitValue = await createHowContentApi({ request: vi.fn().mockResolvedValue(explicit) } as never, "prod").published("genesis-how", "en");
    expect(explicitValue.versionSource).toBe("ENTRY");
  });

  it("fails closed on an unknown versionSource rather than guessing", async () => {
    const request = vi.fn().mockResolvedValue({ ...base("genesis-how"), versionSource: "SOMETHING_ELSE" });
    await expect(createHowContentApi({ request } as never, "prod").published("genesis-how", "en"))
      .rejects.toThrow();
  });
});
