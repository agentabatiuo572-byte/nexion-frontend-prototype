import { describe, expect, it } from "vitest";
import type { PlatformConfig } from "@/store/config-types";
import { newcomerSubtitleKind, referralShareText, visibleReferralGift } from "@/lib/referral-reward-gate";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";

function rewards(enabled: boolean): PlatformConfig["rewards"] {
  return {
    enabled,
    effectiveAt: "2026-09-02T00:00:00Z",
    welcomeGift: { lockMode: "risk_bucket", usdtAmount: 5, nexAmount: 20 },
    inviterReward: { nexAmount: 200 },
  };
}

describe("visibleReferralGift", () => {
  it("fails closed when referral rewards are disabled even if stale amounts remain", () => {
    expect(visibleReferralGift(rewards(false))).toEqual({ usdtAmount: 0, nexAmount: 0 });
  });

  it("exposes the configured gift only while referral rewards are enabled", () => {
    expect(visibleReferralGift(rewards(true))).toEqual({ usdtAmount: 5, nexAmount: 20 });
  });

  it("ignores a configured reward promise when the gate is disabled", () => {
    expect(referralShareText(
      false,
      "Claim $5 + 20 NEX at {link}",
      "Invitation links are still available: {link}",
      "https://nexgrid.ai/ref/ABC",
    )).toBe("Invitation links are still available: https://nexgrid.ai/ref/ABC");
  });
});

describe("newcomerSubtitleKind", () => {
  it("never promises a reward while the H8 gate is disabled", () => {
    expect(newcomerSubtitleKind(false, 5, 20)).toBe("gated");
    expect(newcomerSubtitleKind(false, 0, 0)).toBe("gated");
  });

  it("does not promise a reward without a confirmed invitation amount", () => {
    expect(newcomerSubtitleKind(true, 0, 0)).toBe("gated");
  });

  it("shows only positive H8 reward amounts, including NEX-only rewards", () => {
    expect(newcomerSubtitleKind(true, 5, 20)).toBe("amount");
    expect(newcomerSubtitleKind(true, 0, 20)).toBe("amount");
    expect(newcomerSubtitleKind(true, 5, 0)).toBe("amount");
  });

  it("describes review and settlement without instant-credit claims in all languages", () => {
    for (const dict of [zh, en, vi]) {
      expect(dict.register.subtitleHighlight).toContain("{reward}");
      expect(dict.register.subtitleRest).not.toMatch(/即刻到账|moment your device connects|ngay khi thiết bị kết nối/i);
      expect(dict.register.subtitleRest).toMatch(/结算|settlement|quyết toán/i);
    }
  });
});
