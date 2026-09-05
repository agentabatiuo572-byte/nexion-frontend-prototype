import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface LearningQuestion { questionId: string; question: string; options: string[]; }
export interface LearningCourse { id: string; title: string; body: string; category: string; format: string; level: string; duration: string; rewardNex: string | number; featured: boolean; version: string; progress: number; completed: boolean; attempts: number; lastScore: number; rewardGranted: boolean; source: string; sourceEnvironment: "SANDBOX" | "PRODUCTION"; runId: string | null; permanentLabel: string; questions: LearningQuestion[]; }
export interface LearningOverview { courses: LearningCourse[]; completedCourses: number; totalCourses: number; earnedNex: string | number; }
export interface LearningResult { courseId: string; version: string; score: number; passed: boolean; completed: boolean; rewardGranted: boolean; rewardNex: string | number; attempts: number; }
export interface LearningQuizReceipt { committed: boolean; requestHash: string | null; result: LearningResult | null; }
export interface LearningApi {
  courses(language: string): Promise<LearningOverview>;
  course(courseId: string, language: string): Promise<LearningCourse>;
  start(courseId: string, language: string, expectedVersion: string): Promise<LearningCourse>;
  submitQuiz(courseId: string, expectedVersion: string, answers: number[], idempotencyKey: string): Promise<LearningResult>;
  quizReceipt(courseId: string, expectedVersion: string, idempotencyKey: string): Promise<LearningQuizReceipt>;
  complete(courseId: string, expectedVersion: string): Promise<LearningResult>;
}
function invalid(): never { throw new ApiError({ kind: "protocol", message: "LEARNING_RESPONSE_INVALID" }); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function text(value: unknown): string { if (typeof value !== "string" || !value.trim()) return invalid(); return value.trim(); }
function integer(value: unknown, min = 0): number { const result = Number(value); if (!Number.isSafeInteger(result) || result < min) return invalid(); return result; }
function reward(value: unknown): string | number { if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value; if (typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim())) return value.trim(); return invalid(); }
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
function course(value: unknown): LearningCourse {
  const row = record(value);
  if (!Array.isArray(row.questions) || typeof row.featured !== "boolean" || typeof row.completed !== "boolean" || typeof row.rewardGranted !== "boolean") return invalid();
  const progress = integer(row.progress);
  const attempts = integer(row.attempts);
  const lastScore = integer(row.lastScore);
  if (progress > 100 || lastScore > 100 || (row.completed && progress !== 100)) return invalid();
  const sourceEnvironment = text(row.sourceEnvironment);
  if (sourceEnvironment !== "SANDBOX" && sourceEnvironment !== "PRODUCTION") return invalid();
  const runId = row.runId == null ? null : text(row.runId);
  const source = text(row.source);
  const permanentLabel = text(row.permanentLabel);
  const sandbox = sourceEnvironment === "SANDBOX";
  if (sandbox
      ? source !== "mock" || runId === null || !RUN_ID.test(runId)
        || permanentLabel !== "ACCEPTANCE SANDBOX • NON-PRODUCTION"
      : source !== "provider" || runId !== null || permanentLabel !== "PRODUCTION LEARNING FACTS") return invalid();
  return { id: text(row.id), title: text(row.title), body: text(row.body), category: text(row.category), format: text(row.format), level: text(row.level), duration: text(row.duration), rewardNex: reward(row.rewardNex), featured: row.featured, version: text(row.version), progress, completed: row.completed, attempts, lastScore, rewardGranted: row.rewardGranted, source, sourceEnvironment, runId, permanentLabel, questions: row.questions.map((value) => { const item = record(value); if (!Array.isArray(item.options)) return invalid(); return { questionId: text(item.questionId), question: text(item.question), options: item.options.map(text) }; }) };
}
function overview(value: unknown): LearningOverview { const row = record(value); if (!Array.isArray(row.courses)) return invalid(); return { courses: row.courses.map(course), completedCourses: integer(row.completedCourses), totalCourses: integer(row.totalCourses), earnedNex: row.earnedNex as string | number }; }
function result(value: unknown): LearningResult { const row = record(value); if (typeof row.passed !== "boolean" || typeof row.completed !== "boolean" || typeof row.rewardGranted !== "boolean") return invalid(); const score = integer(row.score); if (score > 100 || (row.passed && !row.completed)) return invalid(); return { courseId: text(row.courseId), version: text(row.version), score, passed: row.passed, completed: row.completed, rewardGranted: row.rewardGranted, rewardNex: reward(row.rewardNex), attempts: integer(row.attempts, 1) }; }
function receipt(value: unknown): LearningQuizReceipt { const row = record(value); if (typeof row.committed !== "boolean") return invalid(); if (!row.committed && (row.requestHash != null || row.result != null)) return invalid(); return { committed: row.committed, requestHash: row.requestHash == null ? null : text(row.requestHash), result: row.result == null ? null : result(row.result) }; }
function id(value: string): string { return text(value); }
function key(value: string): string { const normalized = text(value); if (normalized.length < 8 || normalized.length > 128) return invalid(); return normalized; }
export function createLearningApi(client: ApiClient): LearningApi { return {
  courses: async (language) => overview(await client.request({ method: "GET", path: `/api/content/learning/courses?language=${encodeURIComponent(language)}` })),
  course: async (courseId, language) => course(await client.request({ method: "GET", path: `/api/content/learning/courses/${encodeURIComponent(id(courseId))}?language=${encodeURIComponent(language)}` })),
  start: async (courseId, language, expectedVersion) => course(await client.request({ method: "POST", path: `/api/content/learning/courses/${encodeURIComponent(id(courseId))}/start?language=${encodeURIComponent(language)}&version=${encodeURIComponent(text(expectedVersion))}` })),
  submitQuiz: async (courseId, expectedVersion, answers, idempotencyKey) => result(await client.request({ method: "POST", path: `/api/content/learning/courses/${encodeURIComponent(id(courseId))}/quiz`, idempotencyKey: key(idempotencyKey), body: { answers, expectedVersion: text(expectedVersion) } })),
  quizReceipt: async (courseId, expectedVersion, idempotencyKey) => receipt(await client.request({ method: "GET", path: `/api/content/learning/courses/${encodeURIComponent(id(courseId))}/quiz/receipts/${encodeURIComponent(key(idempotencyKey))}?version=${encodeURIComponent(text(expectedVersion))}` })),
  complete: async (courseId, expectedVersion) => result(await client.request({ method: "POST", path: `/api/content/learning/courses/${encodeURIComponent(id(courseId))}/complete?version=${encodeURIComponent(text(expectedVersion))}` })),
}; }
