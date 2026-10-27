import type { CompletedTask } from "@/store/types";
import { businessDayKey } from "./business-calendar";

function businessDay(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp < 0) return "";
  return businessDayKey("LEGACY", timestamp);
}

export function todayCompletedTasks(tasks: readonly CompletedTask[], serverNow: number): CompletedTask[] {
  const today = businessDay(serverNow);
  if (!today) return [];
  return tasks
    .filter((task) => businessDay(task.completedAt) === today)
    .sort((left, right) => right.completedAt - left.completedAt);
}

// Receipt clocks use the device's local time; the business calendar only determines the business day.
export function localClockTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (timestamp < 0 || Number.isNaN(date.getTime())) return "—";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
