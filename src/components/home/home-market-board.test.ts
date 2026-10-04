import { describe, expect, it } from "vitest";
import type { AppHomeWorkload } from "@/api/app-home-api";
import { presentHomeMarketWorkload } from "./home-market-board";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";

function workload(overrides: Partial<AppHomeWorkload> = {}): AppHomeWorkload {
  return {
    code: "IG",
    name: "图像生成",
    unit: "image",
    price: 0.045,
    deltaPct: null,
    sparkline: null,
    flagshipDeltaPct: null,
    ...overrides,
  };
}

describe("presentHomeMarketWorkload", () => {
  it.each([
    ["IG", "IMG"],
    ["VG", "VID"],
    ["LL", "LLM"],
    ["FT", "FT"],
    ["EM", "EMB"],
    ["SP", "STT"],
  ] as const)("maps the real %s workload code to the compact market tag", (code, tag) => {
    expect(presentHomeMarketWorkload(workload({ code }), en).tag).toBe(tag);
  });

  it("formats real price, unit, sparkline and positive movement for the full table", () => {
    expect(presentHomeMarketWorkload(workload({
      name: "SDXL Turbo",
      price: 0.00032,
      deltaPct: 3.2,
      sparkline: [3, 3.1, 3.2],
    }), vi)).toEqual({
      tag: "IMG",
      name: "Tạo ảnh",
      priceText: "$0.00032",
      unitText: "mỗi ảnh",
      deltaText: "+3.2%",
      deltaTone: "positive",
      sparkline: [3, 3.1, 3.2],
    });
  });

  it("keeps unavailable market facts explicit instead of inventing mock values", () => {
    expect(presentHomeMarketWorkload(workload({
      name: null,
      unit: null,
      price: null,
      deltaPct: null,
      sparkline: null,
    }), en)).toEqual({
      tag: "IMG",
      name: "Image Gen",
      priceText: "—",
      unitText: "per image",
      deltaText: "—",
      deltaTone: "neutral",
      sparkline: null,
    });
  });

  it("keeps a negative movement readable without relying on color alone", () => {
    const display = presentHomeMarketWorkload(workload({ deltaPct: -1.1 }), en);
    expect(display.deltaText).toBe("-1.1%");
    expect(display.deltaTone).toBe("negative");
  });

  it("ignores server language for known workload codes", () => {
    const row = workload({ code: "FT", name: "模型微调", unit: "/job" });
    expect(presentHomeMarketWorkload(row, vi)).toMatchObject({ name: "Tinh chỉnh", unitText: "mỗi tác vụ" });
    expect(presentHomeMarketWorkload(row, zh)).toMatchObject({ name: "微调", unitText: "按任务" });
  });

  it("falls back safely for an unknown code", () => {
    const row = workload({ code: "NEW" as AppHomeWorkload["code"], name: "New task", unit: "/job" });
    expect(presentHomeMarketWorkload(row, vi)).toMatchObject({ tag: "NEW", name: "New task", unitText: "/job" });
    expect(presentHomeMarketWorkload(workload({ ...row, name: null, unit: null }), vi))
      .toMatchObject({ name: "NEW", unitText: "—" });
    expect(presentHomeMarketWorkload(workload({ ...row, code: "__proto__" as AppHomeWorkload["code"] }), vi).tag).toBe("__proto__");
  });
});
