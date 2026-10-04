export type ServerTaskStatus = "CLAIMED" | "RUNNING" | "PAUSED" | "COMPLETED";

export interface TaskResultConfirmationInput {
  /** Present only for the server-authoritative task projection. */
  status?: ServerTaskStatus;
  /** Server-issued estimate, in epoch milliseconds. */
  completableAt?: number | null;
}

/**
 * An elapsed estimate is not a completed task.  The server stays authoritative
 * for completion, receipt creation, and earnings; this only chooses honest UI
 * copy while that server result has not arrived.
 */
export function awaitsExecutionResultConfirmation(
  task: TaskResultConfirmationInput,
  now: number,
): boolean {
  return (task.status === "CLAIMED" || task.status === "RUNNING")
    && typeof task.completableAt === "number"
    && Number.isFinite(task.completableAt)
    && now >= task.completableAt;
}
