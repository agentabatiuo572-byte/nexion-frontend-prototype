import { describe, expect, it } from "vitest";
import { binaryBlockedGuidance } from "@/lib/binary-blocked-guidance";

describe("binary blocked guidance", () => {
  it("offers invite options only for the server threshold block", () => {
    expect(binaryBlockedGuidance({ remote: true, blocked: true, reason: "BINARY_THRESHOLD_NOT_MET" }))
      .toEqual({ showInviteOptions: true });
  });

  it("does not misrepresent an incomplete assignment as a volume recovery action", () => {
    expect(binaryBlockedGuidance({ remote: true, blocked: true, reason: "BINARY_LEG_ASSIGNMENT_INCOMPLETE" }))
      .toEqual({ showInviteOptions: false });
  });

  it("does not offer an invite action for an unrelated or unknown server block", () => {
    expect(binaryBlockedGuidance({ remote: true, blocked: true, reason: "F3_SETTLEMENT_NOT_DUE" }))
      .toEqual({ showInviteOptions: false });
    expect(binaryBlockedGuidance({ remote: true, blocked: true, reason: "UNKNOWN" }))
      .toEqual({ showInviteOptions: false });
  });
});
