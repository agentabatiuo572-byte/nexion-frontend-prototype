import { afterEach, describe, expect, it, vi } from "vitest";
import { createTrustSectionApi } from "./trust-section-api";
import { advanceRuntimeRevision } from "./order-api";

const keys = ["financials", "leadership", "nexNarrative", "complianceBadges", "auditsReserves", "listings"] as const;
const sections = keys.map((sectionKey) => ({
  sectionKey,
  version: "v1",
  description: "Financial disclosure",
  structure: "Metric cards",
  fields: [{ key: "tvlOnChain", label: "TVL", value: "$1.2M" }],
}));

describe("Trust section API authority", () => {
  afterEach(() => advanceRuntimeRevision(null));

  it("accepts only the canonical published Trust projection", async () => {
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true,
      source: "nx_trust_section_version:published",
      sourceEnvironment: "PRODUCTION",
      runId: "",
      sections,
    });

    await expect(createTrustSectionApi({ request } as never).current()).resolves.toEqual(sections);
  });

  it("rejects a well-shaped payload without server provenance", async () => {
    const request = vi.fn().mockResolvedValue({ sections });
    await expect(createTrustSectionApi({ request } as never).current()).rejects.toMatchObject({
      message: "TRUST_SECTION_RESPONSE_INVALID",
    });
  });

  it("rejects incomplete six-domain Trust snapshots", async () => {
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true, source: "nx_trust_section_version:published",
      sourceEnvironment: "PRODUCTION", runId: "", sections: sections.slice(0, 5),
    });
    await expect(createTrustSectionApi({ request } as never).current()).rejects.toMatchObject({
      message: "TRUST_SECTION_RESPONSE_INVALID",
    });
  });

  it("rejects a stale sandbox Trust snapshot after commerce selects a run", async () => {
    advanceRuntimeRevision("trust-current-run-20260819");
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true, source: "mock",
      sourceEnvironment: "SANDBOX", runId: "trust-stale-run-20260818", sections,
    });
    await expect(createTrustSectionApi({ request } as never, "dev").current()).rejects.toMatchObject({
      message: "TRUST_SECTION_RESPONSE_INVALID",
    });
  });

  it("rejects the removed run-scoped sandbox Trust projection", async () => {
    advanceRuntimeRevision("trust-current-run-20260819");
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true, source: "mock",
      sourceEnvironment: "SANDBOX", runId: "trust-current-run-20260819", sections,
    });

    await expect(createTrustSectionApi({ request } as never, "dev").current()).rejects.toMatchObject({
      message: "TRUST_SECTION_RESPONSE_INVALID",
    });
  });

  it("development reads the canonical I4 published snapshot without a sandbox run", async () => {
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true,
      source: "nx_trust_section_version:published",
      sourceEnvironment: "PRODUCTION",
      runId: "",
      sections,
    });

    await expect(createTrustSectionApi({ request } as never, "dev").current()).resolves.toEqual(sections);
  });

  it("rejects sandbox Trust until commerce establishes the current run", async () => {
    const request = vi.fn().mockResolvedValue({
      serverCanonical: true, source: "mock",
      sourceEnvironment: "SANDBOX", runId: "trust-current-run-20260819", sections,
    });

    await expect(createTrustSectionApi({ request } as never, "dev").current()).rejects.toMatchObject({
      message: "TRUST_SECTION_RESPONSE_INVALID",
    });
  });
});
