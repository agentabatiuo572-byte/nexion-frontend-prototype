import { expect, test } from "vitest";
import { createLearningApi } from "./learning-api";
import type { ApiError } from "./errors";
import { advanceRuntimeRevision } from "./order-api";

const RUN = "run-20260816";

test("fails closed when a quiz response contains a malformed reward amount", async () => {
  const api = createLearningApi({
    request: async () => ({
      courseId: "h3-live-20260722",
      version: "v1",
      score: 100,
      passed: true,
      completed: true,
      rewardGranted: true,
      rewardNex: { amount: 20 },
      attempts: 1,
      serverCanonical: true,
      sourceEnvironment: "PRODUCTION",
      runId: "",
    }),
  } as never);

  await expect(api.submitQuiz("h3-live-20260722", "v1", [0], "learning-quiz:h3-live-20260722:v1"))
    .rejects.toMatchObject({
      kind: "protocol",
      message: "LEARNING_RESPONSE_INVALID",
    } satisfies Partial<ApiError>);
});

test("sends the stable quiz key outside the request body and binds the answer to the displayed version", async () => {
  let request: unknown;
  const api = createLearningApi({
    request: async (value: unknown) => {
      request = value;
      return {
        courseId: "h3-live-20260722",
        version: "v1",
        score: 100,
        passed: true,
        completed: true,
        rewardGranted: true,
        rewardNex: "20.000000",
        attempts: 1,
        serverCanonical: true,
        sourceEnvironment: "PRODUCTION",
        runId: "",
      };
    },
  } as never, "dev");

  advanceRuntimeRevision(RUN);

  await api.submitQuiz("h3-live-20260722", "v1", [0], "learning-quiz:h3-live-20260722:v1");

  expect(request).toEqual({
    method: "POST",
    path: "/api/content/learning/courses/h3-live-20260722/quiz",
    idempotencyKey: "learning-quiz:h3-live-20260722:v1",
    body: { answers: [0], expectedVersion: "v1" },
  });
});

test("binds start and content-only completion to the displayed version", async () => {
  const requests: unknown[] = [];
  const course = {
    id: "h3-live-20260722", title: "Course", body: "Body", category: "Basics", format: "Article", level: "Beginner",
    duration: "5 min", rewardNex: "20.000000", featured: true, version: "v1", progress: 1, completed: false,
    attempts: 0, lastScore: 0, rewardGranted: false, serverCanonical: true, source: "provider", sourceEnvironment: "PRODUCTION", runId: "", permanentLabel: "PRODUCTION LEARNING FACTS", questions: [],
  };
  const result = {
    courseId: "h3-live-20260722", version: "v1", score: 100, passed: true, completed: true,
    rewardGranted: true, rewardNex: "20.000000", attempts: 1, serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
  };
  const api = createLearningApi({ request: async (request: unknown) => {
    requests.push(request);
    return requests.length === 1 ? course : result;
  } } as never, "dev");

  advanceRuntimeRevision(RUN);

  await api.start("h3-live-20260722", "vi", "v1");
  await api.complete("h3-live-20260722", "v1");

  expect(requests).toEqual([
    { method: "POST", path: "/api/content/learning/courses/h3-live-20260722/start?language=vi&version=v1" },
    { method: "POST", path: "/api/content/learning/courses/h3-live-20260722/complete?version=v1" },
  ]);
});

test.each(["dev", "prod"] as const)("%s learning reads Java production-shaped facts without a RunID", async (mode) => {
  const api = createLearningApi({ request: async () => ({
    courses: [], completedCourses: 0, totalCourses: 0, earnedNex: "0",
    serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
  }) } as never, mode);

  await expect(api.courses("zh")).resolves.toMatchObject({
    courses: [], completedCourses: 0, totalCourses: 0,
    sourceEnvironment: "PRODUCTION", runId: "",
  });
});

test("learning overview accepts only exact-version historical reward titles", async () => {
  const response = {
    courses: [], completedCourses: 0, totalCourses: 0, earnedNex: "10",
    rewardTitles: { "nexgrid-account-safety-202609@v1": "Account safety" } as Record<string, string>,
    serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "",
  };
  const api = createLearningApi({ request: async () => response } as never);
  await expect(api.courses("en")).resolves.toMatchObject({ rewardTitles: response.rewardTitles });
  response.rewardTitles = { "wrong reference": "Draft title" };
  await expect(api.courses("en")).resolves.toMatchObject({ rewardTitles: {} });
});

test("development learning rejects a sandbox projection", async () => {
  advanceRuntimeRevision(RUN);
  const api = createLearningApi({ request: async () => ({
    courses: [], completedCourses: 0, totalCourses: 0, earnedNex: "0",
    serverCanonical: true, sourceEnvironment: "SANDBOX", runId: RUN,
  }) } as never, "dev");

  await expect(api.courses("zh")).rejects.toMatchObject({ message: "LEARNING_RESPONSE_INVALID" });
});

test.each([
  { source: "provider", sourceEnvironment: "SANDBOX", runId: "run-1", permanentLabel: "ACCEPTANCE SANDBOX • NON-PRODUCTION" },
  { source: "mock", sourceEnvironment: "SANDBOX", runId: "run!", permanentLabel: "ACCEPTANCE SANDBOX • NON-PRODUCTION" },
  { source: "mock", sourceEnvironment: "SANDBOX", runId: "run-1", permanentLabel: "Sandbox" },
])("rejects an unproven learning sandbox projection: %o", async (provenance) => {
  const api = createLearningApi({ request: async () => ({
    id: "course-1", title: "Course", body: "Body", category: "Basics", format: "Article", level: "Beginner",
    duration: "5 min", rewardNex: "1.0", featured: false, version: "v1", progress: 0, completed: false,
    attempts: 0, lastScore: 0, rewardGranted: false, serverCanonical: true, questions: [], ...provenance,
  }) } as never, "dev");

  await expect(api.course("course-1", "en")).rejects.toMatchObject({
    kind: "protocol",
    message: "LEARNING_RESPONSE_INVALID",
  } satisfies Partial<ApiError>);
});

test("rejects a sandbox learning response from a stale commerce run", async () => {
  advanceRuntimeRevision(RUN);
  const api = createLearningApi({ request: async () => ({
    id: "course-1", title: "Course", body: "Body", category: "Basics", format: "Article", level: "Beginner",
    duration: "5 min", rewardNex: "1.0", featured: false, version: "v1", progress: 0, completed: false,
    attempts: 0, lastScore: 0, rewardGranted: false, serverCanonical: true, source: "mock",
    sourceEnvironment: "SANDBOX", runId: RUN, permanentLabel: "ACCEPTANCE SANDBOX • NON-PRODUCTION", questions: [],
  }) } as never, "dev");
  advanceRuntimeRevision("run-20260817");
  await expect(api.course("course-1", "en")).rejects.toMatchObject({ message: "LEARNING_RESPONSE_INVALID" } satisfies Partial<ApiError>);
  advanceRuntimeRevision(null);
});

test.each([
  { progress: 100, completed: false, rewardGranted: false },
  { progress: 50, completed: false, rewardGranted: true },
])("rejects contradictory canonical course state: %o", async (state) => {
  const api = createLearningApi({ request: async () => ({
    id: "course-1", title: "Course", body: "Body", category: "Basics", format: "Article", level: "Beginner",
    duration: "5 min", rewardNex: "1.0", featured: false, version: "v1",
    attempts: 1, lastScore: 80, serverCanonical: true, source: "provider",
    sourceEnvironment: "PRODUCTION", runId: "", permanentLabel: "PRODUCTION LEARNING FACTS", questions: [],
    ...state,
  }) } as never);

  await expect(api.course("course-1", "en")).rejects.toMatchObject({ message: "LEARNING_RESPONSE_INVALID" });
});

test("rejects a result whose completed and passed states disagree", async () => {
  const api = createLearningApi({ request: async () => ({
    courseId: "course-1", version: "v1", score: 40, passed: false, completed: true,
    rewardGranted: false, rewardNex: 0, attempts: 1, serverCanonical: true,
    sourceEnvironment: "PRODUCTION", runId: "",
  }) } as never);

  await expect(api.submitQuiz("course-1", "v1", [0], "learning-quiz-course-1-v1"))
    .rejects.toMatchObject({ message: "LEARNING_RESPONSE_INVALID" });
});

test.each([
  [{ status: "ABSENT", committed: false, requestHash: null, result: null }, "ABSENT"],
  [{ status: "PENDING", committed: false, requestHash: "hash-pending", result: null }, "PENDING"],
  [{ status: "FAILED", committed: false, requestHash: "hash-failed", result: null }, "FAILED"],
  [{ status: "UNKNOWN", committed: false, requestHash: "hash-unknown", result: null }, "UNKNOWN"],
] as const)("parses an explicit quiz receipt state: %o", async (response, expectedStatus) => {
  const api = createLearningApi({ request: async () => response } as never);

  await expect(api.quizReceipt("course-1", "v1", "learning-quiz-course-1-v1"))
    .resolves.toMatchObject({ status: expectedStatus, committed: false });
});

test("maps a pre-status uncommitted receipt to PENDING during a rolling deployment", async () => {
  const api = createLearningApi({ request: async () => ({ committed: false, requestHash: null, result: null }) } as never);

  await expect(api.quizReceipt("course-1", "v1", "learning-quiz-course-1-v1"))
    .resolves.toEqual({ status: "PENDING", committed: false, requestHash: null, result: null });
});

test("parses a committed receipt and rejects contradictory receipt state", async () => {
  const committedResult = {
    courseId: "course-1", version: "v1", score: 100, passed: true, completed: true,
    rewardGranted: true, rewardNex: "5.000000", attempts: 1, serverCanonical: true,
    sourceEnvironment: "PRODUCTION", runId: "",
  };
  const api = createLearningApi({ request: async () => ({
    status: "COMMITTED", committed: true, requestHash: "hash-committed", result: committedResult,
  }) } as never);
  await expect(api.quizReceipt("course-1", "v1", "learning-quiz-course-1-v1"))
    .resolves.toMatchObject({ status: "COMMITTED", committed: true, result: committedResult });

  const contradictory = createLearningApi({ request: async () => ({
    status: "PENDING", committed: true, requestHash: "hash", result: committedResult,
  }) } as never);
  await expect(contradictory.quizReceipt("course-1", "v1", "learning-quiz-course-1-v1"))
    .rejects.toMatchObject({ message: "LEARNING_RESPONSE_INVALID" });
});
