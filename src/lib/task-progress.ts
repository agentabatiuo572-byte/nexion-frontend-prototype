import type { CurrentTask } from "@/store/types";

/** Display estimate only: reaching 100% never completes or settles a task. */
export function taskProgressPercent(task: CurrentTask | null | undefined, now: number, interruptedAt?: number | null): number | null {
  if (!task) return null;
  const progressNow = task.status === "PAUSED" ? task.pausedAt : interruptedAt ?? now;
  if (progressNow == null) return null;
  const elapsedSeconds = (progressNow - task.startedAt) / 1000 - (task.pausedSeconds ?? 0);
  return Math.round(Math.min(1, Math.max(0, elapsedSeconds / task.totalSec)) * 100);
}
