import { describe, expect, it } from "vitest";
import { awaitsExecutionResultConfirmation } from "./task-result-confirmation";

describe("task result confirmation display", () => {
  const completableAt = Date.UTC(2026, 8, 7, 6, 0, 12);

  it("shows confirmation pending only when an active server task reaches its estimated deadline", () => {
    expect(awaitsExecutionResultConfirmation({ status: "RUNNING", completableAt }, completableAt)).toBe(true);
  });

  it("keeps the normal countdown before the deadline", () => {
    expect(awaitsExecutionResultConfirmation({ status: "RUNNING", completableAt }, completableAt - 1)).toBe(false);
  });

  it("does not present a completed task as awaiting an execution result", () => {
    expect(awaitsExecutionResultConfirmation({ status: "COMPLETED", completableAt }, completableAt)).toBe(false);
  });

  it("does not infer a remote pending state for a local task without authority timing", () => {
    expect(awaitsExecutionResultConfirmation({}, completableAt + 1)).toBe(false);
  });
});
