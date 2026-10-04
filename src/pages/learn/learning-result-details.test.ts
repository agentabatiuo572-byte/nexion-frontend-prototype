import { expect, test } from "vitest";
import type { LearningCourse, LearningQuizReceipt, LearningResult } from "@/api/learning-api";
import { learningAttemptRecoveryAction, learningResultDetails, matchingCourseResult, matchingReceiptResult, validAnswersForCourse } from "./learning-result-details";

function course(overrides: Partial<LearningCourse> = {}): LearningCourse {
  return {
    id: "course-a",
    title: "Course A",
    body: "Body",
    category: "Basics",
    format: "Article",
    level: "Beginner",
    duration: "5 min",
    rewardNex: 8,
    featured: false,
    version: "v2",
    progress: 0,
    completed: false,
    attempts: 0,
    lastScore: 0,
    rewardGranted: false,
    serverCanonical: true,
    source: "provider",
    sourceEnvironment: "PRODUCTION",
    runId: "",
    permanentLabel: "PRODUCTION LEARNING FACTS",
    questions: [],
    ...overrides,
  };
}

function result(overrides: Partial<LearningResult> = {}): LearningResult {
  return {
    courseId: "course-a",
    version: "v2",
    score: 90,
    passed: true,
    completed: true,
    rewardGranted: true,
    rewardNex: 8,
    attempts: 2,
    serverCanonical: true,
    sourceEnvironment: "PRODUCTION",
    runId: "",
    ...overrides,
  };
}

test("restores score, attempts and reward status from the canonical course after reload", () => {
  expect(learningResultDetails(course({ completed: true, progress: 100, lastScore: 90, attempts: 2, rewardGranted: true }), null)).toEqual({
    passed: true,
    score: 90,
    attempts: 2,
    rewardGranted: true,
    rewardNex: 8,
  });
});

test.each([
  [null, "ABSENT", "RETIRE"],
  [null, "FAILED", "RETIRE"],
  [null, "PENDING", "HOLD"],
  [null, "UNKNOWN", "HOLD"],
  [[0], "ABSENT", "REPLAY"],
  [[0], "FAILED", "REPLAY"],
  [[0], "PENDING", "HOLD"],
  [[0], "UNKNOWN", "HOLD"],
  [null, "COMMITTED", "RESTORE"],
  [[0], "COMMITTED", "RESTORE"],
] as const)("chooses %s-answer recovery for %s as %s", (answers, status, action) => {
  expect(learningAttemptRecoveryAction({ key: "stable-key", answers }, status)).toBe(action);
});

test("keeps a failed attempt visible after reload without claiming completion", () => {
  expect(learningResultDetails(course({ progress: 50, lastScore: 40, attempts: 1 }), null)).toEqual({
    passed: false,
    score: 40,
    attempts: 1,
    rewardGranted: false,
    rewardNex: 8,
  });
});

test("does not invent result details for a course that has never been attempted", () => {
  expect(learningResultDetails(course(), null)).toBeNull();
});

test("prefers the exact submit or receipt result over an older course snapshot", () => {
  expect(learningResultDetails(course({ lastScore: 40, attempts: 1 }), result())).toEqual({
    passed: true,
    score: 90,
    attempts: 2,
    rewardGranted: true,
    rewardNex: 8,
  });
});

test("keeps the configured reward visible when a failed submit grants zero", () => {
  expect(learningResultDetails(course({ rewardNex: 8 }), result({ passed: false, completed: false, rewardGranted: false, rewardNex: 0 }))).toEqual({
    passed: false,
    score: 90,
    attempts: 2,
    rewardGranted: false,
    rewardNex: 8,
  });
});

test("accepts only a committed receipt for the displayed course version", () => {
  const committed: LearningQuizReceipt = { status: "COMMITTED", committed: true, requestHash: "hash", result: result() };
  expect(matchingReceiptResult(course(), committed)).toEqual(committed.result);
  expect(matchingReceiptResult(course(), { ...committed, status: "PENDING", committed: false })).toBeNull();
  expect(matchingReceiptResult(course(), { ...committed, result: result({ version: "v3" }) })).toBeNull();
  expect(matchingReceiptResult(course(), { ...committed, result: result({ courseId: "course-b" }) })).toBeNull();
});

test("rejects a direct submit result for another course or version", () => {
  expect(matchingCourseResult(course(), result())).toEqual(result());
  expect(matchingCourseResult(course(), result({ version: "v3" }))).toBeNull();
  expect(matchingCourseResult(course(), result({ courseId: "course-b" }))).toBeNull();
});

test("rejects a restored answer set that no longer fits the displayed quiz", () => {
  const quiz = course({
    questions: [
      { questionId: "q1", question: "One", options: ["A", "B"] },
      { questionId: "q2", question: "Two", options: ["A", "B", "C"] },
    ],
  });
  expect(validAnswersForCourse(quiz, [1, 2])).toBe(true);
  expect(validAnswersForCourse(quiz, [2, 0])).toBe(false);
  expect(validAnswersForCourse(quiz, [1])).toBe(false);
});
