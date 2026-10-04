import { expect, test } from "vitest";
import { taskRelativeTime } from "./task-relative-time";
const copy = { timeJustNow: "刚刚", timeMinutesAgo: "{n} 分钟前", timeHoursAgo: "{n} 小时前", timeDaysAgo: "{n} 天前" };
test("task time uses translated relative units including long and invalid ages", () => {
  const now = 100 * 86400000;
  expect(taskRelativeTime(now, now, copy)).toBe("刚刚");
  expect(taskRelativeTime(now - 120000, now, copy)).toBe("2 分钟前");
  expect(taskRelativeTime(now - 7200000, now, copy)).toBe("2 小时前");
  expect(taskRelativeTime(now - 172800000, now, copy)).toBe("2 天前");
  expect(taskRelativeTime(NaN, now, copy)).toBe("—");
});
