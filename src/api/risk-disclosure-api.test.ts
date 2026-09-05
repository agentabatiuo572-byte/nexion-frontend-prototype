import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "./api-client";
import { createRiskDisclosureApi } from "./risk-disclosure-api";

describe("risk disclosure gate API", () => {
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
