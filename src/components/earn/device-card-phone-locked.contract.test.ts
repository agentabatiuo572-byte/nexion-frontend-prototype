import { describe, expect, it } from "vitest";
import deviceCard from "./device-card-pc.vue?raw";
import taskCenter from "./task-center.vue?raw";
import earnConfig from "../../store/earn-config.ts?raw";
import taskTeasers from "../../mock/tasks.ts?raw";
import { en } from "../../i18n/messages/en";
import { vi } from "../../i18n/messages/vi";
import { zh } from "../../i18n/messages/zh";

describe("locked task teasers", () => {
  it("keeps the VRAM-gated task and unlock device details", () => {
    expect(deviceCard).toContain("earnConfig.lockedTeasers(props.device.vramTotal, 3)");
    expect(taskCenter).toContain("earnConfig.lockedTeasers(maxVram.value, 3)");
    for (const source of [deviceCard, taskCenter]) {
      expect(source).toContain("workloadLabel(");
      expect(source).toContain("minVRAM");
      expect(source).toContain("unlockTier");
    }
  });

  it("does not turn category throughput into a personal daily gain", () => {
    for (const source of [deviceCard, taskCenter, earnConfig, taskTeasers]) {
      expect(source).not.toContain("dailyPotentialUSD");
    }
    expect(earnConfig).not.toContain("row.dailyPotential");
    expect(deviceCard).not.toContain("lockedMissedDaily");
    for (const source of [deviceCard, taskCenter]) {
      expect(source).not.toMatch(/\+\$\{\{\s*(?:it|teaser)\./);
    }
  });

  it("explains the remaining limits in all three languages", () => {
    for (const dict of [en, vi, zh]) {
      expect(dict.earn.upgradeUnlocksHint.length).toBeGreaterThan(20);
      expect(dict.earn.lockedPotentialDisclaimer.length).toBeGreaterThan(20);
    }
    expect(en.earn.lockedPotentialDisclaimer).toMatch(/device limits.*availability.*eligibility/i);
    expect(vi.earn.lockedPotentialDisclaimer).toMatch(/Giới hạn thiết bị.*nguồn việc.*tài khoản/i);
    expect(zh.earn.lockedPotentialDisclaimer).toMatch(/设备上限.*任务供应.*账号资格/);
  });
});
