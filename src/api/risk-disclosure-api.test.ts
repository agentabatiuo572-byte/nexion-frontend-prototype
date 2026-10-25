import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createRiskDisclosureApi } from "./risk-disclosure-api";
// @ts-expect-error Loopback-only fixtures are outside the App TS source tree.
import { riskDemo } from "../../scripts/lib/prototype-demo-risk.mjs";
import type { ApiRequest } from "./api-client";

it("demo first reading uses the real parser, minimum duration, acknowledgment and reload", async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
    const state = { riskState: "unread", dataState: "normal" };
    const api = createRiskDisclosureApi({ request: async (r: ApiRequest) => riskDemo(new URL(r.path, "http://127.0.0.1"), "zh", state, {
      method: () => r.method || "GET", postDataJSON: () => r.body,
    }) } as unknown as ApiClient);
    const unread = await api.current();
    expect(unread).toMatchObject({ acknowledged: false, acknowledgedAt: null, minimumReadingSeconds: 30 });
    expect(unread.acknowledgmentToken).toBeTruthy();
    await expect(api.acknowledge(unread)).rejects.toThrow("DEMO_READING_REQUIRED");
    vi.advanceTimersByTime(30000);
    await expect(api.acknowledge({ ...unread, acknowledgmentToken: "wrong-token" })).rejects.toThrow("DEMO_READING_REQUIRED");
    const accepted = await api.acknowledge(unread);
    expect(accepted).toMatchObject({ acknowledged: true, acknowledgmentToken: null, acknowledgedAt: "2026-10-26T00:00:30.000Z" });
    expect(await api.current()).toEqual(accepted);
  } finally { vi.useRealTimers(); }
});

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
