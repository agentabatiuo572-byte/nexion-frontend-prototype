import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createRiskDisclosureApi } from "./risk-disclosure-api";

describe("risk disclosure gate API", () => {
  it("reads a published disclosure without a session or acknowledgement token", async () => {
    const response = {
      source: "server", sourceEnvironment: "PRODUCTION", jurisdiction: "VN", jurisdictionName: "Vietnam",
      version: "v1", languageScope: "zh+vi+en", effectiveDate: "2026-09-23",
      acknowledged: false, acknowledgedAt: null, acknowledgmentToken: null,
      acknowledgmentTokenExpiresAt: null, minimumReadingSeconds: 30,
      chapters: Array.from({ length: 7 }, (_, i) => ({
        no: String(i + 1).padStart(2, "0"), zh: "中文", vi: "Tiếng Việt", en: "English",
        zhBody: "中文正文", viBody: "Nội dung", enBody: "Content",
      })),
    };
    const request = vi.fn().mockResolvedValue(response);
    const api = createRiskDisclosureApi({ request } as unknown as ApiClient);
    await expect(api.publicCurrent("VN")).resolves.toMatchObject({ jurisdiction: "VN", acknowledgmentToken: null });
    expect(request).toHaveBeenCalledWith({
      method: "GET", path: "/api/legal/risk-disclosure/public/current?country=VN", authenticated: false,
    });
    request.mockResolvedValueOnce({ ...response, acknowledgmentToken: "forbidden" });
    await expect(api.publicCurrent("VN")).rejects.toMatchObject({ message: "RISK_DISCLOSURE_RESPONSE_INVALID" });
  });
  it("uses the visible withdraw gate with the stable operation id", async () => {
    const request = vi.fn().mockResolvedValue(null);
    const api = createRiskDisclosureApi({ request } as unknown as ApiClient);

    await api.checkGate("withdraw", "WD-abc-123");

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/legal/risk-disclosure/gates/withdraw/check",
      body: { operationId: "WD-abc-123" },
    });
  });

  it("omits an empty operation id instead of sending an invalid body", async () => {
    const request = vi.fn().mockResolvedValue(null);
    const api = createRiskDisclosureApi({ request } as unknown as ApiClient);

    await api.checkGate("withdraw", "  ");

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/api/legal/risk-disclosure/gates/withdraw/check",
      body: undefined,
    });
  });

  it("rejects an oversized operation id before making a request", async () => {
    const request = vi.fn();
    const api = createRiskDisclosureApi({ request } as unknown as ApiClient);

    await expect(api.checkGate("withdraw", "x".repeat(129)))
      .rejects.toMatchObject({ message: "RISK_DISCLOSURE_GATE_OPERATION_INVALID" });
    expect(request).not.toHaveBeenCalled();
  });
});
