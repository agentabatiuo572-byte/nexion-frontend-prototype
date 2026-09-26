import { describe, expect, it } from "vitest";
import { phoneReplacementError, matchesPhoneBinding, stopPhoneTask, type PhoneBinding } from "./phone-policy";
import type { Device } from "@/store/types";

describe("phone binding policy", () => {
  const binding: PhoneBinding = { version: 1, installationId: "old", deviceId: "phone-old", changedAt: 1000, suspendedAt: null };
  it("blocks every web activation, including a matching installation", () => {
    expect(phoneReplacementError(null, "new", "h5", undefined, 1000)).toBe("web-only");
    expect(phoneReplacementError(binding, "old", "h5", undefined, 1000)).toBe("web-only");
  });
  it("allows first binding and same-phone activation without consuming replacement permission", () => {
    expect(phoneReplacementError(null, "new", "app", undefined, 1000)).toBeNull();
    expect(phoneReplacementError(binding, "old", "app", undefined, 1000)).toBeNull();
  });
  it("fails closed for missing or invalid replacement configuration", () => {
    for (const policy of [undefined, { allowReplacement: false, minReplacementIntervalDays: 0 }, { allowReplacement: true, minReplacementIntervalDays: -1 }, { allowReplacement: true, minReplacementIntervalDays: NaN }]) {
      expect(phoneReplacementError(binding, "new", "app", policy, 1e12)).toBe("replacement-disabled");
    }
  });
  it("enforces the exact cooldown boundary, including the initial binding", () => {
    const policy = { allowReplacement: true, minReplacementIntervalDays: 1 };
    expect(phoneReplacementError(binding, "new", "app", policy, 86400999)).toBe("cooldown");
    expect(phoneReplacementError(binding, "new", "app", policy, 86401000)).toBeNull();
    expect(phoneReplacementError(binding, "new", "app", { ...policy, minReplacementIntervalDays: 0 }, 1000)).toBeNull();
  });
  it("requires both the bound inventory row and installation", () => {
    const phone = { id: "phone-old", phoneInstallationId: "old" } as Device;
    expect(matchesPhoneBinding(phone, binding)).toBe(true);
    expect(matchesPhoneBinding({ ...phone, phoneInstallationId: "new" }, binding)).toBe(false);
    expect(matchesPhoneBinding({ ...phone, id: "other" }, binding)).toBe(false);
  });
  it("cancels pending phone work without touching purchased devices or settled earnings", () => {
    const phone = { kind: "phone", currentTask: { id: "pending" }, todayEarnings: 12, cumulativeEarningsUsdt: 100, onlineHeartbeatAt: 100 } as Device;
    const stopped = stopPhoneTask(phone);
    expect(stopped.currentTask).toBeNull();
    expect(stopped.onlineHeartbeatAt).toBeNull();
    expect(stopped.todayEarnings).toBe(12);
    expect(stopped.cumulativeEarningsUsdt).toBe(100);
    const purchased = { ...phone, kind: "stellarbox-s1" } as Device;
    expect(stopPhoneTask(purchased)).toBe(purchased);
  });
});
