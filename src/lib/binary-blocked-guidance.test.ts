import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import page from "../pages/team/binary.vue?raw";
import { describe, expect, it } from "vitest";
import { binaryBlockedGuidance } from "@/lib/binary-blocked-guidance";

describe("binary blocked guidance", () => {
  it("offers invite options only for the server threshold block", () => {
    expect(binaryBlockedGuidance({ remote: true, blocked: true, reason: "BINARY_THRESHOLD_NOT_MET" }))
      .toMatchObject({ showInviteOptions: true });
  });

  it("does not misrepresent an incomplete assignment as a volume recovery action", () => {
    expect(binaryBlockedGuidance({ remote: true, blocked: true, reason: "BINARY_LEG_ASSIGNMENT_INCOMPLETE" }))
      .toMatchObject({ showInviteOptions: false });
  });

  it("does not offer an invite action for an unrelated or unknown server block", () => {
    expect(binaryBlockedGuidance({ remote: true, blocked: true, reason: "F3_SETTLEMENT_NOT_DUE" }))
      .toMatchObject({ showInviteOptions: false });
    expect(binaryBlockedGuidance({ remote: true, blocked: true, reason: "UNKNOWN" }))
      .toMatchObject({ showInviteOptions: false });
  });
});


describe("binary settlement heading", () => {
  it("uses paused only for an explicit engine pause and keeps date/unknown distinct", () => {
    expect(binaryBlockedGuidance({remote:true,blocked:true,reason:"F3_BINARY_PAUSED"})).toHaveProperty("titleKey","blocked");
    expect(binaryBlockedGuidance({remote:true,blocked:true,reason:"F3_SETTLEMENT_NOT_DUE"})).toHaveProperty("titleKey","settlementPending");
    for(const reason of ["BINARY_THRESHOLD_NOT_MET","BINARY_LEG_ASSIGNMENT_INCOMPLETE","BINARY_REFUND_REVERSAL_REQUIRED","B1_COVERAGE_UNRELIABLE","COVERAGE_BELOW_REDLINE","UNKNOWN",undefined])
      expect(binaryBlockedGuidance({remote:true,blocked:true,reason})).toHaveProperty("titleKey","settlementUnavailable");
    expect(binaryBlockedGuidance({remote:false,blocked:true,reason:"F3_BINARY_PAUSED"})).toHaveProperty("titleKey","settlementUnavailable");
  });
});

for (const [locale, messages, expected] of [
  ["zh", zh, ["奖励暂停发放", "等待发放日", "暂时无法发放"]],
  ["en", en, ["Rewards paused", "Waiting for payout day", "Payout unavailable"]],
  ["vi", vi, ["Tạm dừng chi trả thưởng", "Chờ đến ngày chi trả", "Tạm thời chưa thể chi trả"]],
] as const) {
  it(`${locale} resolves real localized titles independently from the reason detail`, () => {
    for (const [index, reason] of ["F3_BINARY_PAUSED", "F3_SETTLEMENT_NOT_DUE", "UNKNOWN"].entries()) {
      const guidance = binaryBlockedGuidance({remote:true,blocked:true,reason});
      expect(messages.binary[guidance.titleKey]).toBe(expected[index]);
      expect(guidance.showInviteOptions).toBe(false);
    }
  });
}
it("the real page binds the reason-specific heading and retains the blocked/CTA gates", () => {
  expect(page).toContain("{{ blockedTitleText }}");
  expect(page).toContain("t.value.binary[blockedGuidance.value.titleKey]");
  expect(page).not.toContain("{{ t.binary.blocked }}");
  expect(page).toContain('v-if="blocked"');
  expect(page).toContain('v-if="showGrowthRecoveryCta"');
  expect(binaryBlockedGuidance({remote:true,blocked:false,reason:"F3_BINARY_PAUSED"}))
    .toEqual({showInviteOptions:false,titleKey:"settlementUnavailable"});
});
