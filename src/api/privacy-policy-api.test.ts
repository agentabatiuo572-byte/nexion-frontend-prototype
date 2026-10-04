import { describe, expect, it, vi } from "vitest";
import { createPrivacyPolicyApi } from "./privacy-policy-api";

const published = {
  status: "PUBLISHED", source: "server", sourceEnvironment: "PRODUCTION", runId: "",
  version: "v1", locale: "en", hero: "How we handle data",
  sections: [
    { id: "retention", title: "Retention", body: "We retain data only as required.", order: 20 },
    { id: "collection", title: "Collection", body: "We collect account details.", order: 10 },
  ],
};

describe("privacy policy API", () => {
  it("uses a public endpoint, preserves server provenance, and sorts policy sections", async () => {
    const request = vi.fn().mockResolvedValue(published);
    const value = await createPrivacyPolicyApi({ request } as never, "prod").current("zh-CN");

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET", authenticated: false, path: "/api/legal/privacy-policy/current?locale=zh-CN",
    }));
    expect(value.sections.map((section) => section.id)).toEqual(["collection", "retention"]);
  });

  it("fails closed for sandbox or mock provenance, missing bodies, and invalid section shape", async () => {
    const api = (response: unknown) => createPrivacyPolicyApi({ request: vi.fn().mockResolvedValue(response) } as never, "dev").current("en");

    await expect(api({ ...published, sourceEnvironment: "SANDBOX", runId: "privacy-run-001" }))
      .rejects.toThrow("PRIVACY_POLICY_RESPONSE_INVALID");
    await expect(api({ ...published, source: "mock" })).rejects.toThrow("PRIVACY_POLICY_RESPONSE_INVALID");
    await expect(api({ ...published, sections: [{ ...published.sections[0], body: "" }] }))
      .rejects.toThrow("PRIVACY_POLICY_RESPONSE_INVALID");
    await expect(api({ ...published, sections: [{ ...published.sections[0], order: 1.5 }] }))
      .rejects.toThrow("PRIVACY_POLICY_RESPONSE_INVALID");
  });
});
