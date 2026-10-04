import { expect, it } from "vitest";
import { fmt, openSlotsTemplate } from "./format";
import { en } from "./messages/en";
import { vi } from "./messages/vi";
import { zh } from "./messages/zh";

it("uses singular English copy for one open slot in both Me summaries", () => {
  expect(fmt(openSlotsTemplate(en.me.walletSlotsLine, 1), { active: 4, open: 1 })).toBe("4 activated · 1 slot open");
  expect(fmt(openSlotsTemplate(en.myDevices.emptySlots, 1), { n: 1 })).toBe("1 slot open");
  expect(fmt(openSlotsTemplate(en.myDevices.emptySlots, 2), { n: 2 })).toBe("2 slots open");
  expect(fmt(openSlotsTemplate(vi.myDevices.emptySlots, 1), { n: 1 })).toBe("còn 1 khe trống");
  expect(fmt(openSlotsTemplate(zh.myDevices.emptySlots, 1), { n: 1 })).toBe("1 空闲槽位");
});
