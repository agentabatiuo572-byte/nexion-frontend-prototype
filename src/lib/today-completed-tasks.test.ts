import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompletedTask } from "@/store/types";
import { localClockTime, todayCompletedTasks } from "./today-completed-tasks";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const clockZones = [
  ["Asia/Ho_Chi_Minh", "18:57"],
  ["Asia/Shanghai", "19:57"],
  ["Asia/Tokyo", "20:57"],
] as const;

function task(id: string, completedAt: string): CompletedTask {
  return {
    id,
    model: `Model ${id}`,
    type: "LLM inference",
    category: "LL",
    client: "NexGrid",
    location: "",
    totalSec: 60,
    startedAt: Date.parse(completedAt) - 60_000,
    reward: 0.012,
    completedAt: Date.parse(completedAt),
    receiptNo: `R-${id}`,
  };
}

describe("today completed tasks", () => {
  it.each(clockZones)("keeps Shanghai midnight membership unchanged in %s", (zone) => {
    vi.stubEnv("TZ", zone);
    const tasks = [
      task("previous", "2026-10-02T15:59:59Z"),
      task("start", "2026-10-02T16:00:00Z"),
      task("late", "2026-10-03T15:30:00Z"), // Already October 4 in Tokyo, still October 3 in Shanghai.
      task("next", "2026-10-03T16:00:00Z"),
    ];

    expect(todayCompletedTasks(tasks, Date.parse("2026-10-03T15:59:59Z")).map((entry) => entry.id))
      .toEqual(["late", "start"]);
    expect(todayCompletedTasks(tasks, Date.parse("2026-10-03T16:00:00Z")).map((entry) => entry.id))
      .toEqual(["next"]);
  });

  it("uses the Asia/Shanghai business day and sorts the newest task first", () => {
    const serverNow = Date.parse("2026-08-25T16:30:00Z"); // 2026-08-26 00:30 in Shanghai
    const tasks = [
      task("previous", "2026-08-25T15:59:59Z"),
      task("newer", "2026-08-25T16:20:00Z"),
      task("older", "2026-08-25T16:05:00Z"),
    ];

    expect(todayCompletedTasks(tasks, serverNow).map((entry) => entry.id))
      .toEqual(["newer", "older"]);
  });

  it("returns every completed task from today without inventing a fixed count", () => {
    const serverNow = Date.parse("2026-08-25T08:00:00Z");
    const tasks = Array.from({ length: 5 }, (_, index) =>
      task(String(index + 1), `2026-08-25T0${index + 1}:00:00Z`),
    );

    expect(todayCompletedTasks(tasks, serverNow)).toHaveLength(5);
  });

  it("fails closed for invalid timestamps", () => {
    const invalid = { ...task("invalid", "2026-08-25T01:00:00Z"), completedAt: Number.NaN };
    expect(todayCompletedTasks([invalid], Date.parse("2026-08-25T08:00:00Z"))).toEqual([]);
  });
});

describe("local task clock", () => {
  it.each(clockZones)("shows the same absolute minute in the device's %s clock", (zone, expected) => {
    vi.stubEnv("TZ", zone);
    expect(localClockTime(Date.parse("2026-10-03T11:57:00Z"))).toBe(expected);
  });

  it("keeps numeric 24-hour HH:mm when the native locale formatter ignores options", () => {
    vi.stubEnv("TZ", "Asia/Tokyo");
    vi.spyOn(Date.prototype, "toLocaleTimeString").mockReturnValue("00:07:40 GMT+0900 (JST)");
    expect(localClockTime(Date.parse("2026-10-02T15:07:40Z"))).toBe("00:07");
  });

  it("uses a placeholder for invalid completion times", () => {
    for (const timestamp of [Number.NaN, Number.POSITIVE_INFINITY, -1, Number.MAX_VALUE]) {
      expect(localClockTime(timestamp)).toBe("—");
    }
  });
});
