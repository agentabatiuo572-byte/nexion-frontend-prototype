import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { vi as viMessages } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";
import { enrollmentStatusLabel } from "./enrollment-status-view";

describe("Compute Share enrollment status presentation", () => {
  it.each([
    ["PENDING", en.computeShare, "Waiting for pairing"],
    ["CONNECTED", en.computeShare, "Connected"],
    ["EXPIRED", en.computeShare, "Expired"],
    ["PENDING", zh.computeShare, "等待配对"],
    ["CONNECTED", zh.computeShare, "已连接"],
    ["EXPIRED", zh.computeShare, "已过期"],
    ["PENDING", viMessages.computeShare, "Đang chờ ghép nối"],
    ["CONNECTED", viMessages.computeShare, "Đã kết nối"],
    ["EXPIRED", viMessages.computeShare, "Đã hết hạn"],
  ] as const)("renders %s with localized product copy", (status, messages, expected) => {
    expect(enrollmentStatusLabel(status, messages)).toBe(expected);
    expect(enrollmentStatusLabel(status, messages)).not.toBe(status);
  });
});
