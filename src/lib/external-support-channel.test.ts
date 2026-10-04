import { describe, expect, it, vi } from "vitest";
import { openExternalSupportChannel, supportChannelTarget } from "./external-support-channel";

describe("external support channel launcher", () => {
  it("maps only declared official channels to bounded targets", () => {
    expect(supportChannelTarget("telegram")).toBe("https://t.me/nexgrid_official");
    expect(supportChannelTarget("discord")).toBe("https://discord.gg/nexgrid");
    expect(supportChannelTarget("email")).toBe("mailto:support@nexgrid.ai");
    expect(supportChannelTarget("unknown")).toBeNull();
  });

  it("opens a declared target and fails closed without a runtime opener", () => {
    const open = vi.fn();
    expect(openExternalSupportChannel("telegram", { open })).toBe(true);
    expect(open).toHaveBeenCalledWith("https://t.me/nexgrid_official");
    expect(openExternalSupportChannel("unknown", { open })).toBe(false);
    expect(openExternalSupportChannel("email", {})).toBe(false);
  });
});
