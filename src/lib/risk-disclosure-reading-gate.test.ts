import { describe, expect, it } from "vitest";
import type { RiskDisclosureCurrent } from "@/api/risk-disclosure-api";
import {
  canAcknowledgeRiskDisclosure,
  canCompleteRiskDisclosureReadingFromScrollEvent,
  EMPTY_RISK_DISCLOSURE_READING_STATE,
  riskDisclosureDocumentIdentity,
  updateRiskDisclosureReadingState,
} from "./risk-disclosure-reading-gate";

function disclosure(version: string, acknowledgmentToken: string | null): RiskDisclosureCurrent {
  const acknowledged = acknowledgmentToken === null;
  return {
    source: "server",
    sourceEnvironment: "PRODUCTION",
    jurisdiction: "VN",
    jurisdictionName: "Vietnam",
    version,
    languageScope: "zh+vi+en",
    effectiveDate: "2026-09-07",
    acknowledged,
    acknowledgedAt: acknowledged ? "2026-09-07T00:00:00Z" : null,
    chapters: Array.from({ length: 7 }, (_, index) => ({
      no: String(index + 1).padStart(2, "0"),
      zh: `中文 ${index + 1}`,
      vi: `Tieng Viet ${index + 1}`,
      en: `English ${index + 1}`,
      zhBody: `中文正文 ${index + 1}`,
      viBody: `Tieng Viet body ${index + 1}`,
      enBody: `English body ${index + 1}`,
    })),
    acknowledgmentToken,
    acknowledgmentTokenExpiresAt: acknowledged ? null : "2026-09-08T00:00:00Z",
    minimumReadingSeconds: 30,
  };
}

describe("risk disclosure reading gate", () => {
  it("requires a fresh read when acknowledgement readback changes the document version", () => {
    const v1 = disclosure("v1", "ack-v1");
    const v2 = disclosure("v2", "ack-v2");
    const v1Identity = riskDisclosureDocumentIdentity(v1);
    const v2Identity = riskDisclosureDocumentIdentity(v2);
    const readV1 = {
      scrolledToBottom: true,
      checked: true,
      selectedBlock: 7,
    };

    const readV2 = updateRiskDisclosureReadingState(v1Identity, v2Identity, readV1);

    expect(readV2).toEqual(EMPTY_RISK_DISCLOSURE_READING_STATE);
    expect(canAcknowledgeRiskDisclosure({
      disclosure: v2,
      documentIdentity: v2Identity,
      readingIdentity: v2Identity,
      reading: readV2,
      accepted: false,
      loading: false,
    })).toBe(false);
  });

  it("treats an acknowledgement token rotation as a new document-reading context", () => {
    const first = disclosure("v1", "ack-v1a");
    const rotated = disclosure("v1", "ack-v1b");

    expect(riskDisclosureDocumentIdentity(first)).not.toBe(riskDisclosureDocumentIdentity(rotated));
  });

  it("accepts the current document's native scroll-to-bottom event without reusing an old document event", () => {
    const v1Identity = riskDisclosureDocumentIdentity(disclosure("v1", "ack-v1"));
    const v2 = disclosure("v2", "ack-v2");
    const v2Identity = riskDisclosureDocumentIdentity(v2);

    expect(canCompleteRiskDisclosureReadingFromScrollEvent(v1Identity, v1Identity, v1Identity)).toBe(true);
    expect(canCompleteRiskDisclosureReadingFromScrollEvent(v1Identity, v2Identity, v2Identity)).toBe(false);
    expect(canCompleteRiskDisclosureReadingFromScrollEvent(v2Identity, v2Identity, v2Identity)).toBe(true);

    const readV2 = { ...EMPTY_RISK_DISCLOSURE_READING_STATE, scrolledToBottom: true, checked: true };
    expect(canAcknowledgeRiskDisclosure({
      disclosure: v2,
      documentIdentity: v2Identity,
      readingIdentity: v2Identity,
      reading: readV2,
      accepted: false,
      loading: false,
    })).toBe(true);
  });

  it("does not enable acknowledgement for an anonymous copy without a read token", () => {
    const publicCopy = disclosure("v1", null);
    const identity = riskDisclosureDocumentIdentity(publicCopy);
    expect(canAcknowledgeRiskDisclosure({
      disclosure: publicCopy,
      documentIdentity: identity,
      readingIdentity: identity,
      reading: { scrolledToBottom: true, checked: true, selectedBlock: 7 },
      accepted: false,
      loading: false,
    })).toBe(false);
  });
});
