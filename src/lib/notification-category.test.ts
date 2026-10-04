import { describe, expect, it } from "vitest";
import { notificationCategory, type NotificationCategory } from "./notification-category";

describe("notification display groups", () => {
  it("maps actual backend kinds independently of the old preference key", () => {
    const groups: Record<NotificationCategory, string[]> = {
      finance: ["wallet", "payment_method", "withdrawal", "order", "commission", "staking", "market", "nova_commission", "nova_staking", "nova_market", "nova_staking_event", "nova_market_event"],
      device: ["device", "dailysummary", "nova_dailysummary", "nova_upgrade", "nova_tradein"],
      team: ["team", "nova_team", "nova_team_event"],
      rewards: ["genesis", "nova_genesis", "reward", "nova_eventclaim", "nova_quest", "nova_tasklockmonthly"],
      system: ["security", "system", "nova_welcome", "nova_wrapped", "nova_social", "future_unknown_kind"],
    };
    for (const [group, kinds] of Object.entries(groups)) {
      for (const rawKind of kinds) expect(notificationCategory({ kind: "system", rawKind }), rawKind).toBe(group);
    }
    expect(notificationCategory({ kind: "commission" })).toBe("finance");
    expect(notificationCategory({ kind: "system", rawKind: "NOVA_TEAM_EVENT" })).toBe("team");
  });
});
