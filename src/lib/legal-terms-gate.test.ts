import { describe, expect, it } from "vitest";
import type { LegalTermsCurrent } from "@/api/legal-terms-api";
import {
  buildLegalTermsLoginRoute,
  buildLegalTermsRoute,
  canonicalLegalTermsReturnTo,
  claimLegalTermsRedirect,
  sameLegalTermsRun,
  isLegalTermsAcknowledged,
  sameLegalTermsSession,
  shouldBlockLegalTermsExit,
  isLegalTermsGateExemptRoute,
  type LegalTermsSessionFence,
} from "./legal-terms-gate";

const acknowledged = (value: boolean): LegalTermsCurrent => ({
  source: "server",
  sourceEnvironment: "PRODUCTION",
  runId: "",
  requestedLocale: "en",
  resolvedLocale: "en",
  requestedJurisdiction: "GLOBAL",
  resolvedJurisdiction: "GLOBAL",
  provenance: "exact:en/GLOBAL",
  version: "v1",
  effectiveAt: "2026-08-18T00:00:00",
  title: "Terms",
  summary: "Summary",
  sections: [{ key: "acceptance", title: "Acceptance", body: "18+", sortOrder: 1 }],
  acknowledged: value,
  acknowledgedAt: value ? "2026-08-18T00:00:01" : null,
});

describe("legal terms session gate", () => {
  it("routes unauthenticated users to login with an internal Terms return only", () => {
    expect(buildLegalTermsLoginRoute("/pages/onboarding/terms")).toBe("/pages/login/login?return=%2Fpages%2Fonboarding%2Fterms");
    expect(buildLegalTermsLoginRoute("https://evil.example/steal")).toBe("/pages/login/login?return=%2Fpages%2Fonboarding%2Fterms");
    expect(buildLegalTermsRoute("/pages/me/me")).toBe("/pages/onboarding/terms?return=%2Fpages%2Fme%2Fme");
  });

  it("flattens a Terms return carried through login so acknowledgement returns to the real destination", () => {
    const nested = "/pages/onboarding/terms?return=%2Fpages%2Fonboarding%2Fterms%3Freturn%3D%252Fpages%252Fme%252Fme";
    expect(canonicalLegalTermsReturnTo(nested, "/pages/onboarding/intro")).toBe("/pages/me/me");
    expect(buildLegalTermsRoute(nested)).toBe("/pages/onboarding/terms?return=%2Fpages%2Fme%2Fme");
    expect(buildLegalTermsLoginRoute(buildLegalTermsRoute(nested))).toBe("/pages/login/login?return=%2Fpages%2Fonboarding%2Fterms%3Freturn%3D%252Fpages%252Fme%252Fme");
  });

  it("requires a server snapshot that is not acknowledged", () => {
    expect(isLegalTermsAcknowledged(acknowledged(false))).toBe(false);
    expect(isLegalTermsAcknowledged(acknowledged(true))).toBe(true);
  });

  it("blocks every authenticated remote exit until the authoritative version is acknowledged", () => {
    expect(shouldBlockLegalTermsExit(true, true, null)).toBe(true);
    expect(shouldBlockLegalTermsExit(true, true, acknowledged(false))).toBe(true);
    expect(shouldBlockLegalTermsExit(true, true, acknowledged(true))).toBe(false);
    expect(shouldBlockLegalTermsExit(true, false, acknowledged(false))).toBe(false);
    expect(shouldBlockLegalTermsExit(false, true, acknowledged(false))).toBe(false);
  });

  it("allows only canonical read-only legal documents while acknowledgement is pending", () => {
    expect(isLegalTermsGateExemptRoute("/pages/onboarding/terms?return=%2Fpages%2Fme%2Fme")).toBe(true);
    expect(isLegalTermsGateExemptRoute("pages/me/risk-disclosure?return=%2Fpages%2Fonboarding%2Fterms")).toBe(true);
    expect(isLegalTermsGateExemptRoute("/pages/onboarding/privacy?return=%2Fpages%2Fonboarding%2Fintro")).toBe(true);
    expect(isLegalTermsGateExemptRoute("/pages/onboarding/privacy/export")).toBe(false);
    expect(isLegalTermsGateExemptRoute("/pages/me/me")).toBe(false);
  });

  it("claims one redirect per account/version/return target so onShow refresh cannot loop", () => {
    const seen = new Set<string>();
    expect(claimLegalTermsRedirect(seen, "user-7:v1:/pages/me/me")).toBe(true);
    expect(claimLegalTermsRedirect(seen, "user-7:v1:/pages/me/me")).toBe(false);
    expect(claimLegalTermsRedirect(seen, "user-7:v2:/pages/me/me")).toBe(true);
    expect(claimLegalTermsRedirect(seen, "user-8:v1:/pages/me/me")).toBe(true);
  });

  it("accepts only canonical production-provenance terms", () => {
    const retired = { ...acknowledged(false), sourceEnvironment: "SANDBOX", runId: "retired" };
    expect(sameLegalTermsRun(retired as unknown as LegalTermsCurrent)).toBe(false);
    expect(sameLegalTermsRun({ ...acknowledged(false), sourceEnvironment: "PRODUCTION", runId: "" })).toBe(true);
  });

  it("rejects late responses after account, token, or authentication revision changes", () => {
    const first: LegalTermsSessionFence = { accessToken: "token-a", userId: 7, sessionRevision: 1 };
    expect(sameLegalTermsSession(first, { ...first })).toBe(true);
    expect(sameLegalTermsSession(first, { ...first, accessToken: "token-b" })).toBe(false);
    expect(sameLegalTermsSession(first, { ...first, userId: 8 })).toBe(false);
    expect(sameLegalTermsSession({ ...first, sessionRevision: 2 }, { ...first, sessionRevision: 3 })).toBe(false);
    expect(sameLegalTermsSession(first, null)).toBe(false);
  });
});
