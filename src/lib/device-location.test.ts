import { describe, expect, it } from "vitest";
import { deviceLocation } from "./device-copy";
import type { Messages } from "@/i18n/messages/en";
import type { Device } from "@/store/types";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";

const copy = { device: { locLinkedComputer: "本机", locSingaporeDc: "新加坡数据中心", locFrankfurtDc: "法兰克福数据中心" } } as Messages;
const device = (kind: Device["kind"], location?: string) => ({ kind, location }) as Device;

describe("device location authority", () => {
  it.each(["stellarbox-s1", "stellarbox-pro", "stellarrack-p1", "pc-gpu", "phone", "cloud-share"] as const)("preserves the server location for %s", (kind) => {
    expect(deviceLocation(copy, device(kind, "Tokyo DC 2"))).toBe("Tokyo DC 2");
  });
  it("translates known place names from their value rather than the model", () => {
    expect(deviceLocation(copy, device("stellarrack-p1", "Singapore Data Center"))).toBe("新加坡数据中心");
    expect(deviceLocation(copy, device("stellarbox-s1", "Frankfurt Data Center"))).toBe("法兰克福数据中心");
  });
  it("keeps missing location absent and an actual local-computer label local", () => {
    expect(deviceLocation(copy, device("stellarbox-s1"))).toBe("");
    expect(deviceLocation(copy, device("pc-gpu", "Linked computer"))).toBe("本机");
  });
  it("localizes the backend's User device marker without replacing unknown locations", () => {
    expect(deviceLocation(en, device("phone", "User device"))).toBe("Your device");
    expect(deviceLocation(vi, device("phone", "User device"))).toBe("Thiết bị của bạn");
    expect(deviceLocation(zh, device("phone", "User device"))).toBe("你的设备");
  });
});
