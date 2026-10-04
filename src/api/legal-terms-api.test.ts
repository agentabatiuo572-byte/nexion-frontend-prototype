import { describe, expect, it, vi } from "vitest";
import { createLegalTermsApi } from "./legal-terms-api";
import type { LegalTermsCurrent } from "./legal-terms-api";

const terms = { source: "server", sourceEnvironment: "PRODUCTION", runId: "", requestedLocale: "zh-CN", resolvedLocale: "en", requestedJurisdiction: "VN", resolvedJurisdiction: "GLOBAL", provenance: "fallback:en/GLOBAL", version: "v3", effectiveAt: "2026-08-17T00:00:00", title: "Terms", summary: "Summary", sections: [{ key: "eligibility", title: "Eligibility", body: "18+", sortOrder: 10 }], acknowledged: false, acknowledgedAt: null } as LegalTermsCurrent;
describe("legal terms API", () => {
  it("accepts server provenance and explicit fallback metadata", async () => { const request = vi.fn().mockResolvedValue(terms); const result = await createLegalTermsApi({ request } as never).current("zh-CN", "VN"); expect(result.resolvedLocale).toBe("en"); expect(result.provenance).toBe("fallback:en/GLOBAL"); expect(request).toHaveBeenCalledWith(expect.objectContaining({ authenticated: false })); });
  it("rejects sandbox provenance even when the backend supplies a run id", async () => {
    const sandbox = { ...terms, sourceEnvironment: "SANDBOX", runId: "dev" };
    await expect(createLegalTermsApi({ request: vi.fn().mockResolvedValue(sandbox) } as never).current("en", "GLOBAL"))
      .rejects.toThrow("LEGAL_TERMS_RESPONSE_INVALID");
    await expect(createLegalTermsApi({ request: vi.fn().mockResolvedValue({ ...sandbox, runId: "" }) } as never).current("en", "GLOBAL"))
      .rejects.toThrow("LEGAL_TERMS_RESPONSE_INVALID");
  });
  it("fails closed on mock/production provenance mismatch and malformed sections", async () => { await expect(createLegalTermsApi({ request: vi.fn().mockResolvedValue({ ...terms, source: "mock" }) } as never).current("en", "GLOBAL")).rejects.toThrow("LEGAL_TERMS_RESPONSE_INVALID"); await expect(createLegalTermsApi({ request: vi.fn().mockResolvedValue({ ...terms, sections: [] }) } as never).current("en", "GLOBAL")).rejects.toThrow("LEGAL_TERMS_RESPONSE_INVALID"); });
  it("fails closed on illegal versions, locales, and inconsistent acknowledgement metadata", async () => {
    await expect(createLegalTermsApi({ request: vi.fn().mockResolvedValue({ ...terms, version: "latest" }) } as never).current("en", "GLOBAL")).rejects.toThrow("LEGAL_TERMS_RESPONSE_INVALID");
    await expect(createLegalTermsApi({ request: vi.fn().mockResolvedValue({ ...terms, requestedLocale: "javascript:en" }) } as never).current("en", "GLOBAL")).rejects.toThrow("LEGAL_TERMS_RESPONSE_INVALID");
    await expect(createLegalTermsApi({ request: vi.fn().mockResolvedValue({ ...terms, acknowledged: true, acknowledgedAt: null }) } as never).current("en", "GLOBAL")).rejects.toThrow("LEGAL_TERMS_RESPONSE_INVALID");
  });
  it("posts acknowledgement with the authoritative resolved tuple and stable idempotency key", async () => { const request = vi.fn().mockResolvedValue(terms); await createLegalTermsApi({ request } as never).acknowledge(terms); expect(request.mock.calls[0][0]).toMatchObject({ method: "POST", path: "/api/legal/terms/acknowledgment", authenticated: true, body: expect.objectContaining({ locale: "en", jurisdiction: "GLOBAL", version: "v3", runId: "", idempotencyKey: "terms-production-production-en-GLOBAL-v3" }) }); });
});
