import type { LearningApi, LearningCourse } from "@/api/learning-api";
import { ApiError, type ApiErrorKind } from "@/api/errors";
import { observationRejectionReason } from "@/lib/day-one-observation-recovery";

export interface LearningCourseStartFailure {
  reason: "onboarding" | "terms" | "network" | "unconfirmed";
  kind: ApiErrorKind | "unknown";
  status?: number;
  code?: number;
}

export type LearningCourseStartLoad =
  | { kind: "stale" }
  | { kind: "invalid" }
  | { kind: "content"; course: LearningCourse; start: "confirmed" | "unconfirmed"; failure?: LearningCourseStartFailure };

export interface LearningCourseStartDependencies {
  courseId: string;
  language: string;
  read: LearningApi["course"];
  start: LearningApi["start"];
  isCurrent: () => boolean;
  publish?: (course: LearningCourse, start: "pending" | "confirmed" | "unconfirmed", failure?: LearningCourseStartFailure) => void;
}

// Reading published content and recording course start are deliberately
// separate effects. A failed start has an unknown write outcome, so preserve
// the read content and require a user-initiated recovery before any command
// that depends on the start acknowledgement is enabled.
export async function loadPublishedCourseWithStart(
  dependencies: LearningCourseStartDependencies,
): Promise<LearningCourseStartLoad> {
  const loaded = await dependencies.read(dependencies.courseId, dependencies.language);
  if (!dependencies.isCurrent()) return { kind: "stale" };
  if (loaded.id !== dependencies.courseId) return { kind: "invalid" };
  dependencies.publish?.(loaded, "pending");

  try {
    const started = await dependencies.start(dependencies.courseId, dependencies.language, loaded.version);
    if (!dependencies.isCurrent()) return { kind: "stale" };
    if (started.id !== dependencies.courseId || started.id !== loaded.id || started.version !== loaded.version) {
      dependencies.publish?.(loaded, "unconfirmed");
      return { kind: "content", course: loaded, start: "unconfirmed" };
    }
    dependencies.publish?.(started, "confirmed");
    return { kind: "content", course: started, start: "confirmed" };
  } catch (cause) {
    if (!dependencies.isCurrent()) return { kind: "stale" };
    const failure: LearningCourseStartFailure = {
      reason: cause instanceof ApiError && cause.kind === "network" ? "network" : observationRejectionReason(cause),
      kind: cause instanceof ApiError ? cause.kind : "unknown",
      status: cause instanceof ApiError && Number.isFinite(cause.status) ? cause.status : undefined,
      code: cause instanceof ApiError && Number.isFinite(cause.code) ? cause.code : undefined,
    };
    if (import.meta.env.DEV) console.info("UvelLearningStart", JSON.stringify(failure));
    dependencies.publish?.(loaded, "unconfirmed", failure);
    return { kind: "content", course: loaded, start: "unconfirmed", failure };
  }
}

export function createLearningCourseStartLoadCoalescer<T>(load: () => Promise<T>): () => Promise<T> {
  let active: Promise<T> | null = null;
  return () => {
    if (active) return active;
    const next = load();
    active = next;
    void next.then(
      () => { if (active === next) active = null; },
      () => { if (active === next) active = null; },
    );
    return next;
  };
}
