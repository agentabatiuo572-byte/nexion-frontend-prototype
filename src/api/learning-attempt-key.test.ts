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
  const first = new LearningAttemptKeyRegistry(storage).getOrCreateAttempt(identity, [0]);
  const replay = new LearningAttemptKeyRegistry(storage).getOrCreateAttempt(identity, [0]);

  expect(replay).toEqual(first);
});

test("reads an unresolved attempt without creating one", () => {
  const storage = memory();
  const registry = new LearningAttemptKeyRegistry(storage);

  expect(registry.currentAttempt(identity)).toBeNull();
  expect(storage.value).toBeUndefined();

  const pending = registry.getOrCreateAttempt(identity, [0]);
  expect(new LearningAttemptKeyRegistry(storage).currentAttempt(identity)).toEqual(pending);
});

test("persists immutable answers with an unresolved attempt", () => {
  const storage = memory();
  const registry = new LearningAttemptKeyRegistry(storage);
  const pending = registry.getOrCreateAttempt(identity, [0, 2, 1]);

  expect(new LearningAttemptKeyRegistry(storage).currentAttempt(identity)).toEqual(pending);
  expect(pending.answers).toEqual([0, 2, 1]);
  expect(() => registry.getOrCreateAttempt(identity, [1, 2, 1])).toThrow("LEARNING_ATTEMPT_ANSWERS_CONFLICT");
});

test("authoritative failed answer closes its attempt so the changed answer gets a new key", () => {
  const storage = memory();
  const registry = new LearningAttemptKeyRegistry(storage);
  const failedAnswer = registry.getOrCreateAttempt(identity, [0]);
  expect(registry.finish(identity, failedAnswer.key)).toBe(true);

  expect(registry.getOrCreateAttempt(identity, [1]).key).not.toBe(failedAnswer.key);
});

test("keeps generations isolated by account and displayed course version", () => {
  const storage = memory();
  const registry = new LearningAttemptKeyRegistry(storage);
  const current = registry.getOrCreateAttempt(identity, [0]);

  expect(registry.getOrCreateAttempt({ ...identity, accountKey: "user:43" }, [0]).key).not.toBe(current.key);
  expect(registry.getOrCreateAttempt({ ...identity, version: "v3" }, [0]).key).not.toBe(current.key);
});

test("preserves a legacy answerless key until its server receipt proves it is safe to retire", () => {
  const storage = memory();
  const registry = new LearningAttemptKeyRegistry(storage);
  const legacyAttempt = registry.getOrCreateAttempt(identity, [0]);
  const legacy = storage.value as { schema: number; pending: Record<string, { answers?: number[] }> };
  legacy.schema = 1;
  for (const row of Object.values(legacy.pending)) delete row.answers;

  expect(new LearningAttemptKeyRegistry(storage).currentAttempt(identity)).toEqual({
    key: legacyAttempt.key,
    answers: null,
  });
  expect(() => new LearningAttemptKeyRegistry(storage).getOrCreateAttempt(identity, [1]))
    .toThrow("LEARNING_ATTEMPT_ANSWERS_UNKNOWN");
});
