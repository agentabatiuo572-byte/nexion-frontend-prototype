import { expect, test } from "vitest";
import { LearningAttemptKeyRegistry, type LearningAttemptStorage } from "./learning-attempt-key";

function memory(): LearningAttemptStorage & { value: unknown } {
  return {
    value: undefined,
    read() { return this.value; },
    write(value) { this.value = value; },
  };
}

const identity = { accountKey: "user:42", courseId: "course-a", version: "v2" };

test("keeps one durable key for an unresolved attempt across a reload", () => {
  const storage = memory();
  const first = new LearningAttemptKeyRegistry(storage).getOrCreate(identity);
  const replay = new LearningAttemptKeyRegistry(storage).getOrCreate(identity);

  expect(replay).toBe(first);
});

test("authoritative failed answer closes its attempt so the changed answer gets a new key", () => {
  const storage = memory();
  const registry = new LearningAttemptKeyRegistry(storage);
  const failedAnswer = registry.getOrCreate(identity);
  expect(registry.finish(identity, failedAnswer)).toBe(true);

  expect(registry.getOrCreate(identity)).not.toBe(failedAnswer);
});

test("keeps generations isolated by account and displayed course version", () => {
  const storage = memory();
  const registry = new LearningAttemptKeyRegistry(storage);
  const current = registry.getOrCreate(identity);

  expect(registry.getOrCreate({ ...identity, accountKey: "user:43" })).not.toBe(current);
  expect(registry.getOrCreate({ ...identity, version: "v3" })).not.toBe(current);
});
