import { describe, expect, it, vi } from "vitest";
import { createDeveloperDocsApi } from "./developer-docs-api";

const docs = { status: "PUBLISHED", version: "2026.08.17", locale: "en", example: { request: "POST /v1/jobs", response: "200" }, endpoints: [{ method: "POST", path: "/v1/jobs" }], events: ["job.completed"], source: "server", sourceEnvironment: "PRODUCTION", runId: "" };
describe("developer docs API", () => {
  it("reads published docs from the backend", async () => { const request = vi.fn().mockResolvedValue(docs); const result = await createDeveloperDocsApi({ request } as never).published("en"); expect(result.version).toBe("2026.08.17"); expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: "/api/developer/docs?locale=en" })); });
  it("rejects missing endpoints or drafts", async () => { await expect(createDeveloperDocsApi({ request: vi.fn().mockResolvedValue({ ...docs, status: "DRAFT", endpoints: [] }) } as never).published("en")).rejects.toThrow("DEVELOPER_DOCS_RESPONSE_INVALID"); });
});
